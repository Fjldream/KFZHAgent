import type {
  ArtifactStorage,
  StoredArtifact,
} from "@kf/artifact-storage";
import type {
  DomainPack,
  DomainWorkspace,
  PackagedDomainArtifact,
  ValidationReport,
} from "@kf/contracts";
import {
  normalizeArtifactFileExtension,
  normalizeArtifactMediaType,
} from "@kf/contracts";
import type { DomainRegistry } from "@kf/domain-registry";
import { Prisma, type BuildJob, type PrismaClient } from "@prisma/client";
import { Readable } from "node:stream";
import { BuildJobService } from "./build-job.service.js";
import {
  resolveRevisionProjectIr,
  RevisionStateError,
  validateRevisionProjectBinding,
} from "./revision-state.js";

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

    const heartbeat = this.startLeaseHeartbeat(job);
    let storedArtifact: StoredArtifact | undefined;
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
        await heartbeat.stop();
        return this.complete(job, {
          status: "FAILED",
          error: new Error(`base revision not found: ${job.baseRevisionId}`),
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
      if (plan === null || plan.workspaceId !== job.workspaceId) {
        await heartbeat.stop();
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
        await heartbeat.stop();
        return this.complete(job, { status: "FAILED", report });
      }

      const emitted = await pack.package({ workspace: candidate.candidateWorkspace });
      const packaged = {
        ...emitted,
        mediaType: normalizeArtifactMediaType(emitted.mediaType),
        fileExtension: normalizeArtifactFileExtension(emitted.fileExtension),
      };
      const stored = await this.#deps.storage.put({
        tenantId: job.tenantId,
        kind: packaged.artifactKind,
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
        plan,
        mode: candidate.mode,
        packaged,
      });
      await this.cleanupUnadoptedArtifact(job, stored);
      return completed;
    } catch (error) {
      await heartbeat.stop();
      if (error instanceof BuildWorkerCrash) throw error;
      if (storedArtifact !== undefined) {
        await this.cleanupUnadoptedArtifact(job, storedArtifact);
      }
      try {
        return await this.complete(job, { status: "FAILED", error });
      } catch {
        // The cleanup/failure-recording path is compensating work. If it also
        // fails (for example because this attempt lost its lease), preserve
        // the original execution/completion error for diagnostics.
        throw error;
      }
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

  /**
   * Deletes a blob only when the database proves this exact job did not adopt
   * it. A lookup failure is ambiguous, so the conservative choice is to keep
   * the blob; delete itself is best-effort and never replaces the job result.
   */
  private async cleanupUnadoptedArtifact(
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
    if (domainProject.packageUrl === null) {
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
            plan: opts.plan?.plan ?? null,
            mode: opts.mode ?? "patch",
          },
          domainKind: job.domainKind,
          domainProjectKind: packaged.domainProjectKind,
          mediaType: packaged.mediaType,
          fileExtension: packaged.fileExtension,
          packageHash: stored.sha256,
          packageUrl: stored.artifactId,
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

    const summary =
      opts.error !== undefined
        ? `build failed: ${errorMessage(opts.error)}`
        : "validation failed";
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

const DEFAULT_MAX_ARTIFACT_BYTES = 256 * 1024 * 1024;
const DEFAULT_LEASE_MS = 30_000;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function describeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { value: String(error) };
}
