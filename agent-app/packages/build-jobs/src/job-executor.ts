import type {
  ArtifactStorage,
  ArtifactKind,
  StoredArtifact,
} from "@kf/artifact-storage";
import type {
  DomainPack,
  DomainWorkspace,
  PackagedDomainArtifact,
  ValidationReport,
} from "@kf/contracts";
import type { DomainRegistry } from "@kf/domain-registry";
import { Prisma, type BuildJob, type PrismaClient } from "@prisma/client";
import { Readable } from "node:stream";
import { BuildJobService } from "./build-job.service.js";

/**
 * Thrown by the crash-injection hook to simulate a worker terminating after
 * the artifact write but before the database commit. The executor re-throws it
 * without recording a FAILED outcome, leaving the job RUNNING so a later lease
 * can recover it.
 */
export class BuildWorkerCrash extends Error {
  override name = "BuildWorkerCrash";
}

export interface BuildExecutorHooks {
  /** Invoked after the artifact is durably stored and before the DB commit. */
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

    try {
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
        return this.complete(job, {
          status: "FAILED",
          error: new Error(`base revision not found: ${job.baseRevisionId}`),
        });
      }
      const plan = await this.#deps.prisma.changePlan.findUnique({
        where: { id: job.changePlanId },
      });
      if (plan === null || plan.workspaceId !== job.workspaceId) {
        return this.complete(job, {
          status: "FAILED",
          error: new Error(`change plan not found: ${job.changePlanId}`),
        });
      }

      const candidate = await this.buildCandidate(job, baseRevision, plan, pack);
      await this.markValidating(job);

      const report = await pack.validate({
        baseWorkspace: candidate.baseWorkspace,
        candidateWorkspace: candidate.candidateWorkspace,
        changePlan: candidate.planInput,
      });
      if (report.status === "fail") {
        return this.complete(job, { status: "FAILED", report });
      }

      const packaged = await pack.package({ workspace: candidate.candidateWorkspace });
      const stored = await this.#deps.storage.put({
        tenantId: job.tenantId,
        kind: packaged.artifactKind as ArtifactKind,
        stream: Readable.from([Buffer.from(packaged.bytes)]),
        maxBytes: this.#deps.maxArtifactBytes ?? DEFAULT_MAX_ARTIFACT_BYTES,
      });

      // Crash injection point: after the artifact write, before the DB commit.
      await this.#deps.hooks?.beforeCommit?.(stored);

      return this.complete(job, {
        status: "SUCCEEDED",
        report,
        stored,
        plan,
        mode: candidate.mode,
        packaged,
      });
    } catch (error) {
      if (error instanceof BuildWorkerCrash) throw error;
      return this.complete(job, { status: "FAILED", error });
    }
  }

  private async buildCandidate(
    job: BuildJob,
    baseRevision: { id: string; kind: string; state: Prisma.JsonValue | null },
    plan: { plan: Prisma.JsonValue | null },
    pack: DomainPack,
  ): Promise<{
    baseWorkspace: DomainWorkspace;
    candidateWorkspace: DomainWorkspace;
    planInput: unknown;
    mode: string;
  }> {
    const planInput = plan.plan ?? {};
    const workRoot =
      this.#deps.workRoot === undefined ? {} : { workRoot: this.#deps.workRoot };
    if (baseRevision.kind === "initial") {
      // New flow: compile the solution IR into a fresh client project. The
      // seed is the workspace id so derived GUIDs are deterministic per
      // workspace (a retried job rebuilds identical bytes).
      const baseWorkspace = await pack.compile({
        projectIr: baseRevision.state ?? {},
        buildSeed: job.workspaceId,
        ...workRoot,
      });
      // C1: the confirmed change plan must really land in the build artifact.
      // Apply it to the compiled tree with the same patch path as the
      // upload/modify flow (planHash-verified); the compiled tree becomes the
      // verification base and the patched tree the candidate, so
      // verifyChangeScope can prove nothing outside the approved plan moved.
      const candidateWorkspace = await pack.patch({
        baseWorkspace,
        changePlan: planInput,
        expectedPlanHash: job.planHash,
        ...workRoot,
      });
      return {
        baseWorkspace,
        candidateWorkspace,
        planInput,
        mode: "compile",
      };
    }

    // Upload/modify flow: fetch the base package, unpack it, and apply the
    // confirmed change plan to a fresh candidate copy.
    const domainProject = await this.#deps.prisma.domainProjectRevision.findFirst({
      where: { solutionRevisionId: baseRevision.id, tenantId: job.tenantId },
      orderBy: { createdAt: "desc" },
    });
    if (domainProject === null || domainProject.packageUrl === null) {
      throw new Error(`base revision ${baseRevision.id} has no package`);
    }
    const packageBytes = await this.readBasePackage(job.tenantId, domainProject.packageUrl);
    const baseWorkspace = await pack.importPackage({
      bytes: packageBytes,
      ...workRoot,
    });
    const candidateWorkspace = await pack.patch({
      baseWorkspace,
      changePlan: planInput,
      expectedPlanHash: job.planHash,
      ...workRoot,
    });
    return {
      baseWorkspace,
      candidateWorkspace,
      planInput,
      mode: "patch",
    };
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
    await this.#deps.prisma.buildJob
      .update({
        where: { id: job.id },
        data: { status: "VALIDATING" },
      })
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
      plan?: { plan: Prisma.JsonValue | null };
      mode?: string;
      packaged?: PackagedDomainArtifact;
    },
  ): Promise<BuildJob> {
    const details: Record<string, unknown> = {};
    if (opts.report !== undefined) details.report = opts.report;
    if (opts.error !== undefined) details.error = describeError(opts.error);

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
        status: "SUCCEEDED",
        validationReport: {
          outcome: "pass",
          summary: "validation passed",
          details,
        },
        result: {
          kind: "built",
          state: {
            plan: opts.plan?.plan ?? null,
            mode: opts.mode ?? "patch",
          },
          domainKind: job.domainKind,
          domainProjectKind: packaged.domainProjectKind,
          packageHash: stored.sha256,
          packageUrl: stored.artifactId,
          artifact: {
            kind: packaged.artifactKind,
            storageKey: stored.artifactId,
            sizeBytes: stored.size,
            sha256: stored.sha256,
          },
        },
      });
    }

    const summary =
      opts.error !== undefined
        ? `build failed: ${errorMessage(opts.error)}`
        : "validation failed";
    return this.#buildJobs.completeBuild({
      jobId: job.id,
      tenantId: job.tenantId,
      leaseOwner: job.leaseOwner ?? "",
      status: "FAILED",
      validationReport: { outcome: "fail", summary, details },
    });
  }
}

const DEFAULT_MAX_ARTIFACT_BYTES = 256 * 1024 * 1024;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function describeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { value: String(error) };
}
