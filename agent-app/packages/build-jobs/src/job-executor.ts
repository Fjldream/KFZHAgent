import type {
  ArtifactStorage,
  StoredArtifact,
} from "@kf/artifact-storage";
import type {
  DomainAssetInput,
  DomainPack,
  DomainWorkspace,
  InternalChangePlan,
  PackagedDomainArtifact,
  ValidationReport,
} from "@kf/contracts";
import {
  canonicalChangePlanHash,
  changePlanSchema,
  normalizeArtifactFileExtension,
  normalizeArtifactMediaType,
  modelAssetIdToWorkspaceAssetId,
  type TrustedSemanticOperation,
} from "@kf/contracts";
import type { ServerPlanAuthority } from "./server-plan-authority.js";
import type { VerifiedCreativeMaterialization } from "./server-plan-authority.js";
import {
  claimVerifiedCreativeMaterialization,
  readVerifiedCreativeMaterialization,
} from "./server-plan-authority.js";
import type { DomainRegistry } from "@kf/domain-registry";
import { Prisma, type BuildJob, type PrismaClient } from "@prisma/client";
import { Readable } from "node:stream";
import { createHash, randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { BuildJobService } from "./build-job.service.js";
import {
  resolveRevisionProjectIr,
  RevisionStateError,
  validateRevisionProjectBinding,
} from "./revision-state.js";

/**
 * 由崩溃注入钩子抛出，用于模拟 worker 在制品写入后、数据库提交前终止。执行器会直接重新抛出该错误而不记录 FAILED 结果，使作业保持 RUNNING，以便后续租约恢复。
 */
export class BuildWorkerCrash extends Error {
  override name = "BuildWorkerCrash";
}

export interface BuildExecutorHooks {
  /** 在制品完成持久化之后、数据库提交之前调用。 */
  beforeCommit?: (artifact: StoredArtifact) => Promise<void>;
}

export interface BuildExecutorDeps {
  prisma: PrismaClient;
  storage: ArtifactStorage;
  registry: DomainRegistry;
  hooks?: BuildExecutorHooks;
  workRoot?: string;
  maxArtifactBytes?: number;
  leaseMs?: number;
  /** 仅服务器端的HMAC验证器；当遇到持久化的内部封包时，必须使用。 */
  serverPlanVerifier?: Pick<ServerPlanAuthority, "verify">;
  /** 仅供运维人员使用的私有接收端。原始错误绝不能进入 ValidationReport。 */
  operatorLogger?: BuildOperatorLogger;
}

export interface BuildOperatorLogger {
  error(message: string, error: unknown): void;
}

export interface ResolvedStoredPlan {
  plan: InternalChangePlan;
  semanticOperations: readonly TrustedSemanticOperation[];
  creativeMaterialization?: VerifiedCreativeMaterialization;
}

/**
 * 持久化 ChangePlan JSON 的 worker 信任边界。仍支持旧版模型安全计划，但内部语义适配器需要服务器信封。
 */
export function resolveStoredPlan(
  input: unknown,
  expected: { expectedPlanHash: string; expectedRevisionId: string },
  verifier?: Pick<ServerPlanAuthority, "verify">,
): ResolvedStoredPlan {
  const record = input !== null && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : undefined;
  if (record?.["schema"] === "kf-server-plan-envelope/v1") {
    if (verifier === undefined) throw new Error("server plan verifier is not configured");
    const envelope = verifier.verify(input, expected);
    if (envelope.plan.creative !== undefined) {
      const creativeMaterialization = claimVerifiedCreativeMaterialization(verifier, envelope, expected);
      return {
        plan: envelope.plan,
        semanticOperations: envelope.semanticOperations,
        creativeMaterialization,
      };
    }
    return { plan: envelope.plan, semanticOperations: envelope.semanticOperations };
  }
  const parsed = changePlanSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`stored change plan is invalid: ${parsed.error.issues[0]?.message ?? "schema mismatch"}`);
  }
  if (hasInternalSemanticPayload(parsed.data)) {
    throw new Error("semantic native data requires a server envelope");
  }
  if (canonicalChangePlanHash(parsed.data) !== expected.expectedPlanHash) {
    throw new Error("stored change plan hash does not match the build job");
  }
  return { plan: parsed.data, semanticOperations: [] };
}

function hasInternalSemanticPayload(plan: InternalChangePlan): boolean {
  return plan.operations.some((operation) =>
    (operation.op === "create" && Object.hasOwn(operation.properties, "tableData"))
    || (operation.op === "update" && operation.changes.some((change) => change.path === "/__kfModuleTableData")));
}

const DEFAULT_MAX_ASSET_AGGREGATE_BYTES = 100 * 1024 * 1024;
const MAX_SINGLE_ASSET_BYTES = 50 * 1024 * 1024;
const ASSET_SHA256 = /^[0-9a-f]{64}$/;

type AssetResolutionRow = {
  id: string;
  type: string;
  mediaType: string;
  storageKey: string;
  sha256: string;
  sizeBytes: number;
};
type AssetResolutionPrisma = {
  workspaceAsset: {
    findMany(input: {
      where: { tenantId: string; workspaceId: string; id: { in: string[] } };
    }): Promise<AssetResolutionRow[]>;
  };
};
type AssetResolutionStorage = Pick<ArtifactStorage, "open">;
interface AssetResolutionBinding {
  readonly assetId: string;
  readonly workspaceAssetId: string;
  readonly targetPath: string;
  readonly mediaType: string;
  readonly sha256: string;
  readonly sizeBytes: number;
}

/**
 * Resolves only signed compiler bindings. Public aliases are reversed before,
 * but trusted only after, the exact tenant/workspace-scoped database lookup.
 */
export async function resolveBuildAssets(input: {
  prisma: AssetResolutionPrisma;
  storage: AssetResolutionStorage;
  tenantId: string;
  workspaceId: string;
  bindings: readonly AssetResolutionBinding[];
  maxAggregateBytes?: number;
}): Promise<DomainAssetInput[]> {
  if (input.bindings.length === 0) return [];
  const bindingByAssetId = new Map(input.bindings.map((binding) => [binding.assetId, binding]));
  const orderedAssetIds = [...bindingByAssetId.keys()];
  const internalIds = orderedAssetIds.map((assetId) => {
    const binding = bindingByAssetId.get(assetId)!;
    let reversed: string;
    try { reversed = modelAssetIdToWorkspaceAssetId(assetId); }
    catch { throw new Error(`workspace asset missing or outside scope: ${assetId}`); }
    if (reversed !== binding.workspaceAssetId) throw new Error(`signed asset identity mismatch: ${assetId}`);
    return binding.workspaceAssetId;
  });
  const rows = await input.prisma.workspaceAsset.findMany({
    where: {
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      id: { in: internalIds },
    },
  });
  const byInternalId = new Map(rows.map((row) => [row.id, row]));
  const missing = orderedAssetIds.filter((_, index) => !byInternalId.has(internalIds[index]!));
  if (missing.length > 0) throw new Error(`workspace assets missing or outside scope: ${missing.join(",")}`);

  const maxAggregate = input.maxAggregateBytes ?? DEFAULT_MAX_ASSET_AGGREGATE_BYTES;
  if (!Number.isSafeInteger(maxAggregate) || maxAggregate < 0 || maxAggregate > DEFAULT_MAX_ASSET_AGGREGATE_BYTES) {
    throw new Error("invalid asset aggregate size limit");
  }
  let aggregate = 0;
  const output: DomainAssetInput[] = [];
  for (const [index, assetId] of orderedAssetIds.entries()) {
    const row = byInternalId.get(internalIds[index]!)!;
    const binding = bindingByAssetId.get(assetId)!;
    const extension = mediaTypeExtension(row.mediaType);
    if (row.type !== "image" || extension === undefined || !ASSET_SHA256.test(row.sha256)
      || !Number.isSafeInteger(row.sizeBytes) || row.sizeBytes < 1 || row.sizeBytes > MAX_SINGLE_ASSET_BYTES) {
      throw new Error(`invalid persisted workspace asset metadata: ${assetId}`);
    }
    const signedExtension = mediaTypeExtension(binding.mediaType);
    const signedTarget = signedExtension === undefined ? "" : `project/res/images/${binding.sha256}.${signedExtension}`;
    if (row.id !== binding.workspaceAssetId
      || row.mediaType !== binding.mediaType
      || row.sha256 !== binding.sha256
      || row.sizeBytes !== binding.sizeBytes
      || binding.targetPath !== signedTarget) {
      throw new Error(`signed workspace asset metadata mismatch: ${assetId}`);
    }
    aggregate += binding.sizeBytes;
    if (aggregate > maxAggregate) throw new Error("workspace asset aggregate size exceeds build limit");
    const bytes = await readVerifiedAssetStream(input.storage, input.tenantId, row.storageKey, binding.sizeBytes, binding.sha256, assetId);
    output.push({
      assetId,
      targetPath: binding.targetPath,
      mediaType: binding.mediaType,
      sha256: binding.sha256,
      bytes,
    });
  }
  return output;
}

function creativeAssetResolutionBindings(handle: VerifiedCreativeMaterialization | undefined): AssetResolutionBinding[] {
  if (handle === undefined) return [];
  const verified = readVerifiedCreativeMaterialization(handle);
  const bindings = new Map<string, AssetResolutionBinding>();
  for (const asset of verified.materialization.stylesData.flatMap((style) => style.approvedAssets)) {
    const binding = { assetId: asset.assetId, ...asset.approvedAsset };
    const prior = bindings.get(asset.assetId);
    if (prior !== undefined && JSON.stringify(prior) !== JSON.stringify(binding)) {
      throw new Error(`conflicting verified creative asset facts: ${asset.assetId}`);
    }
    bindings.set(asset.assetId, binding);
  }
  return [...bindings.values()];
}

function mediaTypeExtension(mediaType: string): "png" | "jpg" | "webp" | undefined {
  if (mediaType === "image/png") return "png";
  if (mediaType === "image/jpeg") return "jpg";
  if (mediaType === "image/webp") return "webp";
  return undefined;
}

async function readVerifiedAssetStream(
  storage: AssetResolutionStorage,
  tenantId: string,
  storageKey: string,
  expectedSize: number,
  expectedSha: string,
  assetId: string,
): Promise<Uint8Array> {
  const stream = await storage.open(tenantId, storageKey);
  const chunks: Buffer[] = [];
  let size = 0;
  const hash = createHash("sha256");
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > expectedSize || size > MAX_SINGLE_ASSET_BYTES) throw new Error(`workspace asset size mismatch: ${assetId}`);
    hash.update(bytes);
    chunks.push(bytes);
  }
  if (size !== expectedSize) throw new Error(`workspace asset size mismatch: ${assetId}`);
  if (hash.digest("hex") !== expectedSha) throw new Error(`workspace asset checksum mismatch: ${assetId}`);
  return Buffer.concat(chunks, size);
}

const OWNED_WORKSPACE_NAME = /^kf-client-(?:base|build|candidate)-[A-Za-z0-9_-]+$/;

/**
 * Domain packs return fresh disposable workspaces. Only remove exact roots
 * with the reviewed mkdtemp prefixes and the expected worker parent; cleanup
 * is compensating work and must never replace the durable build outcome.
 */
async function cleanupWorkspaceRoots(roots: readonly string[], workRoot?: string): Promise<void> {
  const expectedParent = path.resolve(workRoot ?? tmpdir());
  const unique = new Set(roots.map((root) => path.resolve(root)));
  await Promise.all([...unique].map(async (root) => {
    if (path.dirname(root) !== expectedParent || !OWNED_WORKSPACE_NAME.test(path.basename(root))) return;
    await rm(root, { recursive: true, force: true }).catch(() => {});
  }));
}

/**
 * Executes a leased build job end to end:
 *
 *   resolve DomainPack → prepare candidate (compile from IR for a new flow,
 *   copy + patch the base package for an upload/modify flow) → validate →
 *   deterministically package → write the artifact to storage → commit the
 *   revision + job SUCCEEDED in one transaction (advancing currentRevisionId).
 *
 * Failures record diagnostic metadata (validation report + error detail) and
 * mark the job FAILED without creating a revision and without touching
 * currentRevisionId or the previous artifact.
 */
export class BuildExecutor {
  readonly #buildJobs: BuildJobService;
  readonly #deps: BuildExecutorDeps;

  constructor(deps: BuildExecutorDeps) {
    this.#deps = deps;
    this.#buildJobs = new BuildJobService(deps.prisma, deps.leaseMs);
  }

  /** Executes one job. The job must currently hold a lease. */
  async execute(job: BuildJob): Promise<BuildJob> {
    if (job.status === "SUCCEEDED" || job.status === "FAILED") return job;

    const heartbeat = this.startLeaseHeartbeat(job);
    let storedArtifact: StoredArtifact | undefined;
    const ownedWorkspaceRoots: string[] = [];
    try {
      // modified by jinlong.feng at 2026-10-20 Agent工作台迭代
      await this.assertNotCancelled(job);
      // end
      // Resolve the domain capabilities (throws for unknown/unsupported kinds).
      const pack = this.#deps.registry.require(job.domainKind);

      const baseRevision = await this.#deps.prisma.solutionRevision.findUnique({
        where: { id: job.baseRevisionId },
      });
      if (
        baseRevision === null ||
        baseRevision.tenantId !== job.tenantId ||
        baseRevision.workspaceId !== job.workspaceId
      ) {
        await heartbeat.stop();
        return this.complete(job, {
          status: "FAILED",
          error: new Error(`base revision not found: ${job.baseRevisionId}`),
        });
      }
      const workspace = await this.#deps.prisma.solutionWorkspace.findFirst({
        where: { id: job.workspaceId, tenantId: job.tenantId },
        select: { generationWorkflow: true },
      });
      if (workspace === null) {
        await heartbeat.stop();
        return this.complete(job, {
          status: "FAILED",
          error: new Error(`workspace not found: ${job.workspaceId}`),
        });
      }
      validateRevisionProjectBinding(
        baseRevision.state,
        job.projectKey,
        job.domainKind,
      );
      const plan = await this.#deps.prisma.changePlan.findUnique({
        where: { id: job.changePlanId },
      });
      if (plan === null || plan.tenantId !== job.tenantId || plan.workspaceId !== job.workspaceId) {
        await heartbeat.stop();
        return this.complete(job, {
          status: "FAILED",
          error: new Error(`change plan not found: ${job.changePlanId}`),
        });
      }
      if (plan.planHash !== job.planHash) {
        await heartbeat.stop();
        return this.complete(job, {
          status: "FAILED",
          error: new Error(`change plan hash does not match job: ${job.changePlanId}`),
        });
      }

      const candidate = await this.buildCandidate(job, baseRevision, plan, workspace, pack);
      ownedWorkspaceRoots.push(
        candidate.baseWorkspace.cleanupRoot ?? candidate.baseWorkspace.rootDir,
        candidate.candidateWorkspace.cleanupRoot ?? candidate.candidateWorkspace.rootDir,
      );
      // modified by jinlong.feng at 2026-10-20 Agent工作台迭代
      await this.assertNotCancelled(job);
      // end
      await this.markValidating(job);

      const report = await pack.validate({
        baseWorkspace: candidate.baseWorkspace,
        candidateWorkspace: candidate.candidateWorkspace,
        changePlan: candidate.planInput,
        semanticOperations: candidate.semanticOperations,
        assets: candidate.assets,
        ...(candidate.creativeMaterialization === undefined ? {} : {
          creativeMaterialization: candidate.creativeMaterialization,
        }),
      });
      if (report.status === "fail") {
        await heartbeat.stop();
        return this.complete(job, { status: "FAILED", report });
      }

      const emitted = await pack.package({ workspace: candidate.candidateWorkspace });
      // modified by jinlong.feng at 2026-10-20 Agent工作台迭代
      await this.assertNotCancelled(job);
      // end
      const packaged = {
        ...emitted,
        mediaType: normalizeArtifactMediaType(emitted.mediaType),
        fileExtension: normalizeArtifactFileExtension(emitted.fileExtension),
      };
      const stored = await this.#deps.storage.put({
        tenantId: job.tenantId,
        kind: packaged.artifactKind,
        artifactId: buildArtifactId(job.tenantId, job.id),
        stream: Readable.from([packaged.bytes]),
        maxBytes: this.#deps.maxArtifactBytes ?? DEFAULT_MAX_ARTIFACT_BYTES,
      });
      storedArtifact = stored;

      // Crash injection point: after the artifact write, before the DB commit.
      await this.#deps.hooks?.beforeCommit?.(stored);

      await heartbeat.stop();
      const completed = await this.complete(job, {
        status: "SUCCEEDED",
        report,
        stored,
        planInput: candidate.planInput,
        mode: candidate.mode,
        packaged,
        ...(candidate.creativeBinding === undefined ? {} : {
          creativeBinding: candidate.creativeBinding,
        }),
      });
      if (completed.status === "FAILED" && completed.attemptCount === job.attemptCount) {
        await this.cleanupAuthoritativeFailedArtifact(job, stored);
      }
      return completed;
    } catch (error) {
      await heartbeat.stop();
      if (error instanceof BuildWorkerCrash) throw error;
      try {
        const completed = await this.complete(job, { status: "FAILED", error });
        if (
          storedArtifact !== undefined
          && completed.status === "FAILED"
          && completed.attemptCount === job.attemptCount
        ) {
          await this.cleanupAuthoritativeFailedArtifact(job, storedArtifact);
        }
        return completed;
      } catch {
        // The cleanup/failure-recording path is compensating work. If it also
        // fails (for example because this attempt lost its lease), preserve
        // the original execution/completion error for diagnostics.
        throw error;
      }
    } finally {
      await cleanupWorkspaceRoots(ownedWorkspaceRoots, this.#deps.workRoot);
    }
  }

  private startLeaseHeartbeat(job: BuildJob): { stop: () => Promise<void> } {
    if (job.leaseOwner === null) {
      return { stop: async () => {} };
    }
    const leaseMs = this.#deps.leaseMs ?? DEFAULT_LEASE_MS;
    const intervalMs = Math.max(10, Math.floor(leaseMs / 3));
    let stopped = false;
    let timer: NodeJS.Timeout | undefined;
    let inFlight: Promise<void> = Promise.resolve();

    const schedule = (): void => {
      if (stopped) return;
      timer = setTimeout(() => {
        timer = undefined;
        inFlight = this.#buildJobs
          .renewLease({
            jobId: job.id,
            tenantId: job.tenantId,
            leaseOwner: job.leaseOwner ?? "",
            leaseAttempt: job.attemptCount,
          }, leaseMs)
          .then((renewed) => {
            if (!renewed) stopped = true;
            else schedule();
          })
          .catch(() => {
            // Completion performs the authoritative fence check. A failed
            // heartbeat stops renewal but never masks the eventual outcome.
            stopped = true;
          });
      }, intervalMs);
      timer.unref();
    };
    schedule();

    return {
      stop: async () => {
        stopped = true;
        if (timer !== undefined) clearTimeout(timer);
        await inFlight;
      },
    };
  }

  // modified by jinlong.feng at 2026-10-20 Agent工作台迭代
  private async assertNotCancelled(job: BuildJob): Promise<void> {
    if (!job.agentRunId) return;
    const current = await this.#deps.prisma.buildJob.findFirst({ where: { id: job.id, tenantId: job.tenantId }, select: { cancelRequestedAt: true } });
    if (current?.cancelRequestedAt) throw new Error("BUILD_CANCELLED");
  }
  // end

  /**
   * Deletes a blob only when the database proves this exact job did not adopt
   * it. A lookup failure is ambiguous, so the conservative choice is to keep
   * the blob; delete itself is best-effort and never replaces the job result.
   */
  private async cleanupAuthoritativeFailedArtifact(
    job: BuildJob,
    stored: StoredArtifact,
  ): Promise<void> {
    let adopted: { id: string } | null;
    try {
      adopted = await this.#deps.prisma.artifact.findFirst({
        where: {
          tenantId: job.tenantId,
          buildJobId: job.id,
          storageKey: stored.artifactId,
        },
        select: { id: true },
      });
    } catch {
      return;
    }
    if (adopted !== null) return;
    await this.#deps.storage.delete(job.tenantId, stored.artifactId).catch(() => {});
  }

  private async buildCandidate(
    job: BuildJob,
    baseRevision: { id: string; kind: string; state: Prisma.JsonValue | null },
    plan: { plan: Prisma.JsonValue | null },
    workspace: { generationWorkflow: string },
    pack: DomainPack,
  ): Promise<{
    baseWorkspace: DomainWorkspace;
    candidateWorkspace: DomainWorkspace;
    planInput: InternalChangePlan;
    semanticOperations: readonly TrustedSemanticOperation[];
    assets: readonly DomainAssetInput[];
    creativeMaterialization?: VerifiedCreativeMaterialization;
    creativeBinding?: { creativeArtifactHash: string; nativeMaterializationHash: string };
    mode: string;
  }> {
    const resolved = resolveStoredPlan(plan.plan ?? {}, {
      expectedPlanHash: job.planHash,
      expectedRevisionId: job.baseRevisionId,
    }, this.#deps.serverPlanVerifier);
    const planInput = resolved.plan;
    if (workspace.generationWorkflow === "creative-v2"
      && (resolved.creativeMaterialization === undefined || planInput.creative === undefined)) {
      throw new Error("CREATIVE_WORKFLOW_REQUIRES_SIGNED_MATERIALIZATION");
    }
    if (planInput.workspaceId !== job.workspaceId) {
      throw new Error("stored change plan belongs to another workspace");
    }
    let creativeBinding: { creativeArtifactHash: string; nativeMaterializationHash: string } | undefined;
    if (resolved.creativeMaterialization !== undefined) {
      const verified = readVerifiedCreativeMaterialization(resolved.creativeMaterialization);
      if (workspace.generationWorkflow !== "creative-v2") {
        throw new Error("creative build requires an explicitly enrolled creative-v2 workspace");
      }
      if (verified.materialization.workspaceId !== job.workspaceId
        || verified.materialization.baseRevisionId !== job.baseRevisionId
        || verified.artifact.semanticPlan.projectKey !== job.projectKey) {
        throw new Error("creative tenant/workspace/project binding mismatch");
      }
      creativeBinding = {
        creativeArtifactHash: verified.materialization.creativeArtifactHash,
        nativeMaterializationHash: planInput.creative!.materializationHash,
      };
    }
    const creativeAssetBindings = creativeAssetResolutionBindings(resolved.creativeMaterialization);
    const allAssetBindings = new Map<string, AssetResolutionBinding>();
    for (const binding of [...(planInput.assetBindings ?? []), ...creativeAssetBindings]) {
      const prior = allAssetBindings.get(binding.assetId);
      if (prior !== undefined && (prior.workspaceAssetId !== binding.workspaceAssetId
        || prior.targetPath !== binding.targetPath || prior.mediaType !== binding.mediaType
        || prior.sha256 !== binding.sha256 || prior.sizeBytes !== binding.sizeBytes)) {
        throw new Error(`conflicting signed asset binding: ${binding.assetId}`);
      }
      allAssetBindings.set(binding.assetId, binding);
    }
    const assets = await resolveBuildAssets({
      prisma: this.#deps.prisma,
      storage: this.#deps.storage,
      tenantId: job.tenantId,
      workspaceId: job.workspaceId,
      bindings: [...allAssetBindings.values()],
    });
    const workRoot =
      this.#deps.workRoot === undefined ? {} : { workRoot: this.#deps.workRoot };
    const domainProject = await this.#deps.prisma.domainProjectRevision.findFirst({
      where: {
        solutionRevisionId: baseRevision.id,
        tenantId: job.tenantId,
        projectKey: job.projectKey,
      },
    });
    if (domainProject !== null && domainProject.domainKind !== job.domainKind) {
      throw new RevisionStateError(
        `projectKey ${job.projectKey} belongs to domain ${domainProject.domainKind}, ` +
          `not ${job.domainKind}`,
      );
    }
    if (domainProject === null) {
      // No package exists for this exact project yet: compile only its IR.
      // The legacy single-project seed remains the workspace id; explicit
      // project keys extend it so two projects cannot derive colliding ids.
      const baseWorkspace = await pack.compile({
        projectIr: resolveRevisionProjectIr(
          baseRevision.state,
          job.projectKey,
          job.domainKind,
        ),
        buildSeed:
          job.projectKey === job.domainKind
            ? job.workspaceId
            : `${job.workspaceId}:${job.projectKey}`,
        ...workRoot,
      });
      // C1: the confirmed change plan must really land in the build artifact.
      // Apply it to the compiled tree with the same patch path as the
      // upload/modify flow (planHash-verified); the compiled tree becomes the
      // verification base and the patched tree the candidate, so
      // verifyChangeScope can prove nothing outside the approved plan moved.
      try {
        const candidateWorkspace = await pack.patch({
          baseWorkspace,
          changePlan: planInput,
          expectedPlanHash: job.planHash,
          semanticOperations: resolved.semanticOperations,
          assets,
          ...(resolved.creativeMaterialization === undefined ? {} : {
            creativeMaterialization: resolved.creativeMaterialization,
          }),
          ...workRoot,
        });
        return {
          baseWorkspace,
          candidateWorkspace,
          planInput,
          semanticOperations: resolved.semanticOperations,
          assets,
          ...(resolved.creativeMaterialization === undefined ? {} : {
            creativeMaterialization: resolved.creativeMaterialization,
          }),
          ...(creativeBinding === undefined ? {} : { creativeBinding }),
          mode: "compile",
        };
      } catch (error) {
        await cleanupWorkspaceRoots([baseWorkspace.cleanupRoot ?? baseWorkspace.rootDir], this.#deps.workRoot);
        throw error;
      }
    }

    // Upload/modify flow: fetch the base package, unpack it, and apply the
    // confirmed change plan to a fresh candidate copy.
    if (domainProject.packageUrl === null) {
      throw new Error(`base revision ${baseRevision.id} has no package`);
    }
    const packageBytes = await this.readBasePackage(job.tenantId, domainProject.packageUrl);
    const baseWorkspace = await pack.importPackage({
      bytes: packageBytes,
      ...workRoot,
    });
    try {
      const candidateWorkspace = await pack.patch({
        baseWorkspace,
        changePlan: planInput,
        expectedPlanHash: job.planHash,
        semanticOperations: resolved.semanticOperations,
        assets,
        ...(resolved.creativeMaterialization === undefined ? {} : {
          creativeMaterialization: resolved.creativeMaterialization,
        }),
        ...workRoot,
      });
      return {
        baseWorkspace,
        candidateWorkspace,
        planInput,
        semanticOperations: resolved.semanticOperations,
        assets,
        ...(resolved.creativeMaterialization === undefined ? {} : {
          creativeMaterialization: resolved.creativeMaterialization,
        }),
        ...(creativeBinding === undefined ? {} : { creativeBinding }),
        mode: "patch",
      };
    } catch (error) {
      await cleanupWorkspaceRoots([baseWorkspace.cleanupRoot ?? baseWorkspace.rootDir], this.#deps.workRoot);
      throw error;
    }
  }

  private async readBasePackage(tenantId: string, artifactId: string): Promise<Uint8Array> {
    let stream: NodeJS.ReadableStream;
    try {
      stream = await this.#deps.storage.open(tenantId, artifactId);
    } catch (error) {
      // 基础工程包缺失（artifact 不在存储中——如部署/清理后）时给出明确错误，
      // 而不是把原始 ENOENT 抛给用户。
      throw new Error(
        `基础工程包缺失（artifact ${artifactId} 不在存储中）：可能由部署切换或存储清理导致，请重新上传工程或新建工作区`,
        { cause: error },
      );
    }
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private async markValidating(job: BuildJob): Promise<void> {
    if (job.leaseOwner === null) return;
    await this.#deps.prisma
      .$executeRaw`
        UPDATE "BuildJob"
        SET "status" = 'VALIDATING',
            "updatedAt" = (clock_timestamp() AT TIME ZONE 'UTC')
        WHERE "id" = ${job.id}
          AND "tenantId" = ${job.tenantId}
          AND "leaseOwner" = ${job.leaseOwner}
          AND "attemptCount" = ${job.attemptCount}
          AND "status" IN ('RUNNING', 'VALIDATING')
          AND "leaseExpiresAt" IS NOT NULL
          AND "leaseExpiresAt" > (clock_timestamp() AT TIME ZONE 'UTC')
      `
      .catch(() => {
        // Lease may already be lost; the eventual commit still validates it.
      });
  }

  private async complete(
    job: BuildJob,
    opts: {
      status: "SUCCEEDED" | "FAILED";
      report?: ValidationReport;
      error?: unknown;
      stored?: StoredArtifact;
      planInput?: InternalChangePlan;
      mode?: string;
      packaged?: PackagedDomainArtifact;
      creativeBinding?: { creativeArtifactHash: string; nativeMaterializationHash: string };
    },
  ): Promise<BuildJob> {
    const details: Record<string, unknown> = {};
    if (opts.report !== undefined) details.report = opts.report;
    let publicError: PublicBuildError | undefined;
    if (opts.error !== undefined) {
      publicError = {
        code: PUBLIC_BUILD_ERROR_CODE,
        message: PUBLIC_BUILD_ERROR_MESSAGE,
        correlationId: randomUUID(),
      };
      details.error = publicError;
      this.#deps.operatorLogger?.error(
        `Build execution failed; jobId=${job.id}; correlationId=${publicError.correlationId}`,
        opts.error,
      );
    }

    if (opts.status === "SUCCEEDED") {
      if (opts.stored === undefined) {
        throw new Error("SUCCEEDED completion requires a stored artifact");
      }
      if (opts.packaged === undefined) {
        throw new Error("SUCCEEDED completion requires packaged artifact metadata");
      }
      const { stored, packaged } = opts;
      return this.#buildJobs.completeBuild({
        jobId: job.id,
        tenantId: job.tenantId,
        leaseOwner: job.leaseOwner ?? "",
        leaseAttempt: job.attemptCount,
        status: "SUCCEEDED",
        validationReport: {
          outcome: "pass",
          summary: "validation passed",
          details,
        },
        result: {
          kind: "built",
          state: {
            plan: opts.planInput ?? null,
            mode: opts.mode ?? "patch",
            build: {
              packageHash: stored.sha256,
              ...(opts.creativeBinding === undefined ? {} : opts.creativeBinding),
            },
          },
          domainKind: job.domainKind,
          domainProjectKind: packaged.domainProjectKind,
          mediaType: packaged.mediaType,
          fileExtension: packaged.fileExtension,
          packageHash: stored.sha256,
          packageUrl: stored.artifactId,
          ...(opts.creativeBinding === undefined ? {} : { creativeBinding: opts.creativeBinding }),
          artifact: {
            kind: packaged.artifactKind,
            mediaType: packaged.mediaType,
            fileExtension: packaged.fileExtension,
            storageKey: stored.artifactId,
            sizeBytes: stored.size,
            sha256: stored.sha256,
          },
        },
      });
    }

    const summary = publicError?.message ?? "validation failed";
    return this.#buildJobs.completeBuild({
      jobId: job.id,
      tenantId: job.tenantId,
      leaseOwner: job.leaseOwner ?? "",
      leaseAttempt: job.attemptCount,
      status: "FAILED",
      validationReport: { outcome: "fail", summary, details },
    });
  }
}

function buildArtifactId(tenantId: string, jobId: string): string {
  const hex = createHash("sha256")
    .update("kf-build-artifact/v1\0")
    .update(tenantId)
    .update("\0")
    .update(jobId)
    .digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const DEFAULT_MAX_ARTIFACT_BYTES = 256 * 1024 * 1024;
const DEFAULT_LEASE_MS = 30_000;
const PUBLIC_BUILD_ERROR_CODE = "BUILD_EXECUTION_FAILED";
const PUBLIC_BUILD_ERROR_MESSAGE = "构建执行未完成，请使用参考编号联系管理员。";

interface PublicBuildError {
  code: typeof PUBLIC_BUILD_ERROR_CODE;
  message: typeof PUBLIC_BUILD_ERROR_MESSAGE;
  correlationId: string;
}
