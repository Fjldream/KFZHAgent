import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { ArtifactStorage, StoredArtifact } from "@kf/artifact-storage";
import { ArtifactStorageError } from "@kf/artifact-storage";
import type { ClientProjectSummary } from "@kf/domain-client";
import {
  importNativeClientPackage,
  inspectClientProject,
  PackageUnpackError,
} from "@kf/domain-client";
import type { DomainProjectRevision, Prisma, SolutionRevision, SolutionWorkspace } from "@prisma/client";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { PrismaService } from "../prisma/prisma.service.js";
import { ARTIFACT_STORAGE } from "../artifacts/artifact-storage.js";

/**
 * The initial solution IR every generative ("new") workspace starts from. It
 * is a single empty page so the deterministic compiler always has something to
 * build; the agent later grows it through change plans.
 */
export const DEFAULT_INITIAL_IR = {
  schema: "kf-client-project-ir/v1",
  id: "solution",
  name: "Solution",
  version: "1.0.0.1",
  pages: [
    {
      id: "page-home",
      name: "Page1",
      width: 1440,
      height: 900,
      controls: [
        { id: "Text1", type: "text", x: 40, y: 40, width: 120, height: 30, text: "Hello" },
      ],
    },
  ],
  variables: [],
  scripts: [],
} as const;

/** Absolute server-side cap for a single uploaded source package. */
const DEFAULT_SOURCE_MAX_BYTES = 256 * 1024 * 1024;

/** ZIP local-file-header magic bytes (PK\x03\x04). */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export interface WorkspaceResult {
  workspace: SolutionWorkspace;
  initialRevision?: SolutionRevision;
}

export interface SourceRevisionResult {
  revision: SolutionRevision;
  domainProject: DomainProjectRevision;
  summary: ClientProjectSummary;
}

/**
 * Thrown by the upload sniffing transform when the first bytes are not a ZIP
 * container (brief Step 4: content sniffing).
 */
export class ZipMagicError extends Error {
  override name = "ZipMagicError";
  constructor() {
    super("package is not a ZIP container (expected PK\\x03\\x04 magic)");
  }
}

/**
 * Workspace lifecycle: a "new" workspace starts from an empty solution
 * revision (generative flow); an "upload" workspace starts empty and receives
 * its Source Revision 1 through the streaming upload (import flow).
 */
@Injectable()
export class WorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ARTIFACT_STORAGE) private readonly storage: ArtifactStorage,
  ) {}

  async createWorkspace(input: {
    tenantId: string;
    name: string;
    description?: string;
    mode?: "new" | "upload";
    initialState?: unknown;
  }): Promise<WorkspaceResult> {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (name.length === 0) {
      throw new BadRequestException("name is required");
    }
    const mode = input.mode === "upload" ? "upload" : "new";
    const description = typeof input.description === "string" ? input.description : null;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const workspace = await tx.solutionWorkspace.create({
          data: {
            tenantId: input.tenantId,
            name,
            description,
            mode,
            generationWorkflow: mode === "new" ? "module-v1" : "legacy",
          },
        });
        if (mode !== "new") {
          return { workspace };
        }
        const initialRevision = await tx.solutionRevision.create({
          data: {
            tenantId: input.tenantId,
            workspaceId: workspace.id,
            revisionNumber: 1,
            kind: "initial",
            state: input.initialState ?? DEFAULT_INITIAL_IR,
          },
        });
        await tx.solutionWorkspace.update({
          where: { id: workspace.id },
          data: { currentRevisionId: initialRevision.id },
        });
        return {
          workspace: { ...workspace, currentRevisionId: initialRevision.id },
          initialRevision,
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("workspace name already exists in this tenant");
      }
      throw error;
    }
  }

  /**
   * Streaming upload (brief Step 4): sniffs the ZIP magic on the first chunk,
   * streams the request body straight into ArtifactStorage (never buffering
   * the whole package in memory), then imports and inspects it. The Source
   * Revision is created only after safe import + inspection succeeds; any
   * failure removes the stored package.
   */
  async uploadSourceRevision(input: {
    tenantId: string;
    workspaceId: string;
    stream: NodeJS.ReadableStream;
    maxBytes?: number;
    domainKind?: string;
    projectKey?: string;
  }): Promise<SourceRevisionResult> {
    const workspace = await this.prisma.solutionWorkspace.findFirst({
      where: { id: input.workspaceId, tenantId: input.tenantId },
    });
    if (workspace === null) {
      throw new NotFoundException("workspace");
    }
    if (workspace.currentRevisionId !== null) {
      throw new ConflictException("workspace already has a revision");
    }
    const maxBytes = sanitizeMaxBytes(input.maxBytes);
    const domainKind = input.domainKind ?? "kingclient";

    // Content sniffing + streaming: consume the first chunk, verify the ZIP
    // magic, then rebuild a paused stream from the same iterator. Nothing is
    // ever buffered in full; the request body flows straight into storage.
    let body: Readable;
    try {
      body = await sniffZipStream(input.stream);
    } catch (error) {
      if (error instanceof ZipMagicError) {
        throw new UnprocessableEntityException(apiError("PACKAGE_UNSUPPORTED", error.message));
      }
      throw error;
    }

    let stored: StoredArtifact;
    try {
      stored = await this.storage.put({
        tenantId: input.tenantId,
        kind: "source-package",
        stream: body,
        maxBytes,
      });
    } catch (error) {
      if (error instanceof ArtifactStorageError && isArtifactTooLarge(error)) {
        throw new PayloadTooLargeException(apiError("ARTIFACT_TOO_LARGE", error.message));
      }
      throw error;
    }

    const workDir = await mkdtemp(path.join(tmpdir(), "kf-source-import-"));
    let summary: ClientProjectSummary;
    try {
      const bytes = await collectStream(await this.storage.open(input.tenantId, stored.artifactId));
      const sourceDir = await importNativeClientPackage(bytes, workDir);
      const inspected = await inspectClientProject(sourceDir);
      summary = inspected.summary;
    } catch (error) {
      await this.cleanupUnadoptedSourceArtifact(input.tenantId, stored.artifactId);
      if (error instanceof HttpException) {
        throw error;
      }
      if (error instanceof PackageUnpackError) {
        throw new UnprocessableEntityException(apiError("PACKAGE_UNPACK_FAILED", error.message));
      }
      throw new UnprocessableEntityException(apiError("PROJECT_PARSE_FAILED", messageOf(error)));
    } finally {
      // I2: always remove the unpack directory tree (success or failure) so
      // uploads cannot leak tens of KB per request into TMPDIR.
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }

    try {
      return await this.commitSourceRevision({
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        domainKind,
        projectKey: input.projectKey ?? domainKind,
        stored,
        summary,
      });
    } catch (error) {
      await this.cleanupUnadoptedSourceArtifact(input.tenantId, stored.artifactId);
      throw error;
    }
  }

  /**
   * Upload flow (in-memory convenience variant, kept for worker/tests): stores
   * the source ZIP as a tenant-scoped artifact, imports it into a read-only
   * workspace directory, inspects it, and creates Source Revision 1.
   */
  async createSourceRevision(input: {
    tenantId: string;
    workspaceId: string;
    source: Uint8Array;
    domainKind?: string;
    projectKey?: string;
    maxBytes?: number;
  }): Promise<SourceRevisionResult> {
    const workspace = await this.prisma.solutionWorkspace.findFirst({
      where: { id: input.workspaceId, tenantId: input.tenantId },
    });
    if (workspace === null) {
      throw new NotFoundException("workspace");
    }
    if (workspace.currentRevisionId !== null) {
      throw new ConflictException("workspace already has a revision");
    }
    const source = Buffer.from(input.source);
    const domainKind = input.domainKind ?? "kingclient";

    const stored = await this.storage.put({
      tenantId: input.tenantId,
      kind: "source-package",
      stream: Readable.from(source),
      maxBytes: sanitizeMaxBytes(input.maxBytes),
    });

    const workDir = await mkdtemp(path.join(tmpdir(), "kf-source-import-"));
    try {
      const sourceDir = await importNativeClientPackage(source, workDir);
      const inspected = await inspectClientProject(sourceDir);

      return await this.commitSourceRevision({
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        domainKind,
        projectKey: input.projectKey ?? domainKind,
        stored,
        summary: inspected.summary,
      });
    } catch (error) {
      await this.cleanupUnadoptedSourceArtifact(input.tenantId, stored.artifactId);
      throw error;
    } finally {
      // I2: always remove the unpack directory tree on this variant too.
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  async get(tenantId: string, workspaceId: string): Promise<SolutionWorkspace> {
    const workspace = await this.prisma.solutionWorkspace.findFirst({
      where: { id: workspaceId, tenantId },
    });
    if (workspace === null) {
      throw new NotFoundException("workspace");
    }
    return workspace;
  }

  async list(tenantId: string): Promise<SolutionWorkspace[]> {
    return this.prisma.solutionWorkspace.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
    });
  }

  async listRevisions(tenantId: string, workspaceId: string): Promise<SolutionRevision[]> {
    await this.get(tenantId, workspaceId);
    return this.prisma.solutionRevision.findMany({
      where: { tenantId, workspaceId },
      orderBy: { revisionNumber: "asc" },
    });
  }

  /**
   * Destructive workspace deletion (brief Step 7). The caller must have
   * already surfaced a destructive confirmation (the controller enforces the
   * confirm flag before calling); the audit trail records that confirmation
   * separately.
   *
   * I3: in addition to removing database rows, every tenant-scoped artifact
   * backing this workspace (source-package via DomainProjectRevision.packageUrl
   * and build artifacts via Artifact.storageKey) is removed from
   * ArtifactStorage so no files leak after the workspace row is gone.
   */
  async deleteWorkspace(tenantId: string, workspaceId: string): Promise<void> {
    const workspace = await this.prisma.solutionWorkspace.findFirst({
      where: { id: workspaceId, tenantId },
    });
    if (workspace === null) {
      throw new NotFoundException("workspace");
    }
    const removedStorageKeys: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      // Asset adoption takes the same workspace-row lock before it creates a
      // row. Keep deletion on the identical lock/order so it cannot collect
      // storage keys while an upload is about to adopt a new blob.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" /* kf_workspace_asset_lock */
        FROM "SolutionWorkspace"
        WHERE "id" = ${workspaceId}
          AND "tenantId" = ${tenantId}
        FOR UPDATE
      `;
      if (locked[0] === undefined) throw new NotFoundException("workspace");
      const revisionIds = (
        await tx.solutionRevision.findMany({
          where: { workspaceId, tenantId },
          select: { id: true },
        })
      ).map((row) => row.id);
      const jobIds = (
        await tx.buildJob.findMany({
          where: { workspaceId, tenantId },
          select: { id: true },
        })
      ).map((row) => row.id);
      const conversationIds = (
        await tx.conversation.findMany({
          where: { workspaceId, tenantId },
          select: { id: true },
        })
      ).map((row) => row.id);

      const workspaceAssets = await tx.workspaceAsset.findMany({
        where: { tenantId, workspaceId },
        select: { storageKey: true },
      });
      for (const asset of workspaceAssets) removedStorageKeys.push(asset.storageKey);
      await tx.workspaceAsset.deleteMany({ where: { tenantId, workspaceId } });

      if (revisionIds.length > 0) {
        const domainRows = await tx.domainProjectRevision.findMany({
          where: { tenantId, solutionRevisionId: { in: revisionIds } },
          select: { packageUrl: true },
        });
        for (const row of domainRows) {
          if (row.packageUrl !== null) removedStorageKeys.push(row.packageUrl);
        }
        await tx.domainProjectRevision.deleteMany({
          where: { tenantId, solutionRevisionId: { in: revisionIds } },
        });
        await tx.solutionRevision.deleteMany({ where: { workspaceId, tenantId } });
      }
      if (jobIds.length > 0) {
        const artifactRows = await tx.artifact.findMany({
          where: { tenantId, buildJobId: { in: jobIds } },
          select: { storageKey: true },
        });
        for (const row of artifactRows) removedStorageKeys.push(row.storageKey);
        await tx.artifact.deleteMany({ where: { tenantId, buildJobId: { in: jobIds } } });
        await tx.validationReport.deleteMany({
          where: { tenantId, buildJobId: { in: jobIds } },
        });
      }
      await tx.buildJob.deleteMany({ where: { workspaceId, tenantId } });
      await tx.changePlan.deleteMany({ where: { workspaceId, tenantId } });
      await tx.changeRequest.deleteMany({ where: { workspaceId, tenantId } });
      if (conversationIds.length > 0) {
        await tx.message.deleteMany({
          where: { tenantId, conversationId: { in: conversationIds } },
        });
        await tx.conversation.deleteMany({ where: { workspaceId, tenantId } });
      }
      await tx.solutionWorkspace.delete({ where: { id: workspaceId } });
    });

    // Database rows are gone; now remove the underlying storage files. A
    // missing file is not an error (best-effort cleanup after a committed
    // delete), so each removal swallows individual failures.
    for (const key of removedStorageKeys) {
      await this.storage.delete(tenantId, key).catch(() => {});
    }
  }

  private async commitSourceRevision(input: {
    tenantId: string;
    workspaceId: string;
    domainKind: string;
    projectKey: string;
    stored: StoredArtifact;
    summary: ClientProjectSummary;
  }): Promise<SourceRevisionResult> {
    return this.prisma.$transaction(async (tx) => {
      const workspaces = await tx.$queryRaw<{ id: string; currentRevisionId: string | null }[]>`
        SELECT "id", "currentRevisionId" /* kf_source_workspace_lock */
        FROM "SolutionWorkspace"
        WHERE "id" = ${input.workspaceId}
          AND "tenantId" = ${input.tenantId}
        FOR UPDATE
      `;
      const workspace = workspaces[0] ?? null;
      if (workspace === null) {
        throw new NotFoundException("workspace");
      }
      if (workspace.currentRevisionId !== null) {
        throw new ConflictException("workspace already has a revision");
      }
      const revision = await tx.solutionRevision.create({
        data: {
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          revisionNumber: 1,
          kind: "source",
          state: input.summary as unknown as Prisma.InputJsonValue,
        },
      });
      const domainProject = await tx.domainProjectRevision.create({
        data: {
          tenantId: input.tenantId,
          solutionRevisionId: revision.id,
          projectKey: input.projectKey,
          domainKind: input.domainKind,
          kind: "source-package",
          mediaType: "application/zip",
          fileExtension: ".zip",
          packageHash: input.stored.sha256,
          packageUrl: input.stored.artifactId,
        },
      });
      await tx.solutionWorkspace.update({
        where: { id: input.workspaceId },
        data: { currentRevisionId: revision.id },
      });
      return { revision, domainProject, summary: input.summary };
    });
  }

  /**
   * Compensates a source write only when the database can prove no revision
   * adopted its storage key. A lookup failure is ambiguous, so it retains the
   * blob; deletion is best-effort and never replaces the caller's exception.
   */
  private async cleanupUnadoptedSourceArtifact(
    tenantId: string,
    storageKey: string,
  ): Promise<void> {
    let adopted: { id: string } | null;
    try {
      adopted = await this.prisma.domainProjectRevision.findFirst({
        where: { tenantId, packageUrl: storageKey },
        select: { id: true },
      });
    } catch {
      return;
    }
    if (adopted !== null) return;
    await this.storage.delete(tenantId, storageKey).catch(() => {});
  }
}

/**
 * Reads the first chunk of a request stream, verifies the ZIP local-file
 * header magic (PK\x03\x04), and returns a new paused Readable that replays
 * the checked prefix followed by the rest of the original stream. The async
 * iterator keeps the source paused between yields, so nothing is buffered.
 */
async function sniffZipStream(stream: NodeJS.ReadableStream): Promise<Readable> {
  const iterator = stream[Symbol.asyncIterator]();
  const first = await iterator.next();
  if (first.done) {
    throw new ZipMagicError();
  }
  const firstBuffer = Buffer.isBuffer(first.value) ? first.value : Buffer.from(first.value);
  if (
    firstBuffer.length < ZIP_MAGIC.length ||
    !firstBuffer.subarray(0, ZIP_MAGIC.length).equals(ZIP_MAGIC)
  ) {
    throw new ZipMagicError();
  }
  return Readable.from(
    (async function* replay() {
      yield firstBuffer;
      yield* iterator;
    })(),
  );
}

function sanitizeMaxBytes(maxBytes: number | undefined): number {
  const requested = typeof maxBytes === "number" && Number.isFinite(maxBytes) ? maxBytes : undefined;
  if (requested === undefined || requested <= 0) return DEFAULT_SOURCE_MAX_BYTES;
  return Math.min(requested, DEFAULT_SOURCE_MAX_BYTES);
}

function isArtifactTooLarge(error: ArtifactStorageError): boolean {
  return error.message.includes("ARTIFACT_TOO_LARGE");
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function apiError(code: string, message: string): { error: { code: string; message: string } } {
  return { error: { code, message } };
}

async function collectStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as unknown as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}
