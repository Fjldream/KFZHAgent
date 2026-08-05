import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ArtifactStorage } from "@kf/artifact-storage";
import type { ClientProjectSummary } from "@kf/domain-client";
import {
  importNativeClientPackage,
  inspectClientProject,
} from "@kf/domain-client";
import type { DomainProjectRevision, Prisma, SolutionRevision, SolutionWorkspace } from "@prisma/client";
import { mkdtemp } from "node:fs/promises";
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

const DEFAULT_SOURCE_MAX_BYTES = 256 * 1024 * 1024;

export interface WorkspaceResult {
  workspace: SolutionWorkspace;
  initialRevision?: SolutionRevision;
}

/**
 * Workspace lifecycle: a "new" workspace starts from an empty solution
 * revision (generative flow); an "upload" workspace starts empty and receives
 * its Source Revision 1 through createSourceRevision (import flow).
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
          data: { tenantId: input.tenantId, name, description, mode },
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
   * Upload flow: stores the source .gz as a tenant-scoped artifact, imports it
   * into a read-only workspace directory, inspects it, and creates Source
   * Revision 1 (advancing currentRevisionId).
   */
  async createSourceRevision(input: {
    tenantId: string;
    workspaceId: string;
    source: Uint8Array;
    domainKind?: string;
    maxBytes?: number;
  }): Promise<{
    revision: SolutionRevision;
    domainProject: DomainProjectRevision;
    summary: ClientProjectSummary;
  }> {
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
      maxBytes: input.maxBytes ?? DEFAULT_SOURCE_MAX_BYTES,
    });

    const workDir = await mkdtemp(path.join(tmpdir(), "kf-source-import-"));
    const sourceDir = await importNativeClientPackage(source, workDir);
    const inspected = await inspectClientProject(sourceDir);

    return this.prisma.$transaction(async (tx) => {
      const revision = await tx.solutionRevision.create({
        data: {
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          revisionNumber: 1,
          kind: "source",
          state: inspected.summary as unknown as Prisma.InputJsonValue,
        },
      });
      const domainProject = await tx.domainProjectRevision.create({
        data: {
          tenantId: input.tenantId,
          solutionRevisionId: revision.id,
          domainKind,
          kind: "source-package",
          packageHash: stored.sha256,
          packageUrl: stored.artifactId,
        },
      });
      await tx.solutionWorkspace.update({
        where: { id: input.workspaceId },
        data: { currentRevisionId: revision.id },
      });
      return { revision, domainProject, summary: inspected.summary };
    });
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
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}
