import { Prisma, type BuildJob, type JobStatus, type PrismaClient } from "@prisma/client";
import { projectKeySchema } from "@kf/contracts";

import type {
  CompleteBuildInput,
  EnqueueBuildInput,
} from "./types.js";
import {
  replaceRevisionProjectBuildState,
  RevisionStateError,
} from "./revision-state.js";

/**
 * Durable build-job lease and commit logic, shared by the API (enqueue) and
 * the worker (lease/execute/commit).
 *
 * Idempotency: `enqueue` returns the existing row for a repeated
 * idempotencyKey; the UNIQUE index on idempotencyKey is the concurrency
 * backstop.
 *
 * Leasing: `leaseNext` runs a single transaction that first serializes the
 * claim decision per candidate workspace with `pg_advisory_xact_lock`
 * (transaction-scoped, auto-released), then locks one candidate row with
 * `SELECT ... FOR UPDATE SKIP LOCKED`, taking a claim (`leaseOwner` +
 * `leaseExpiresAt`) and bumping `attemptCount`. Only QUEUED/RUNNING/VALIDATING
 * rows with an expired or absent lease are claimable, and only when no other
 * row of the same workspace currently holds a live lease (one active job per
 * workspace). The advisory lock closes the READ COMMITTED race where a
 * `NOT EXISTS` scan could not see another transaction's uncommitted RUNNING
 * update.
 *
 * Crash recovery: a worker that dies mid-build leaves the row RUNNING with an
 * expired lease; after expiry `leaseNext` re-claims it and `completeBuild`
 * commits the result exactly once. Re-committing an already terminal row is a
 * no-op (defense in depth).
 */
/**
 * Test-only extension points for BuildJobService. `beforeClaim` runs inside
 * the lease transaction after the claim SELECT has locked the candidate row
 * but before the RUNNING UPDATE, letting a test widen the READ COMMITTED race
 * window (the exact condition that allowed two jobs of one workspace to be
 * claimed concurrently before the advisory-lock fix).
 */
export interface BuildJobServiceDebugHooks {
  beforeClaim?: () => Promise<void>;
}

export class BuildJobService {
  readonly #debugHooks: BuildJobServiceDebugHooks;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly leaseMs = 30_000,
    debugHooks: BuildJobServiceDebugHooks = {},
  ) {
    this.#debugHooks = debugHooks;
  }

  /** Enqueues a build job; idempotent on idempotencyKey. */
  async enqueue(input: EnqueueBuildInput): Promise<BuildJob> {
    const projectKey = normalizeProjectKey(input.projectKey, input.domainKind);
    const existing = await this.prisma.buildJob.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing !== null) {
      assertIdempotencyBinding(existing, input, projectKey);
      return existing;
    }

    const workspace = await this.prisma.solutionWorkspace.findFirst({
      where: { id: input.workspaceId, tenantId: input.tenantId },
    });
    if (workspace === null) {
      throw new BuildJobNotFoundError("workspace");
    }
    const baseRevision = await this.prisma.solutionRevision.findFirst({
      where: {
        id: input.baseRevisionId,
        workspaceId: input.workspaceId,
        tenantId: input.tenantId,
      },
    });
    if (baseRevision === null) {
      throw new BuildJobNotFoundError("base revision");
    }
    const plan = await this.prisma.changePlan.findFirst({
      where: { id: input.changePlanId, workspaceId: input.workspaceId },
    });
    if (plan === null) {
      throw new BuildJobNotFoundError("change plan");
    }
    if (plan.planHash !== input.planHash) {
      throw new BuildJobConflictError("planHash does not match the stored change plan");
    }

    try {
      return await this.prisma.buildJob.create({
        data: { ...input, projectKey, status: "QUEUED" },
      });
    } catch (error) {
      // Concurrent enqueue of the same key: the UNIQUE index is the final
      // authority, return the winning row.
      if (isUniqueViolation(error)) {
        const winner = await this.prisma.buildJob.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (winner !== null) {
          assertIdempotencyBinding(winner, input, projectKey);
          return winner;
        }
      }
      throw error;
    }
  }

  /**
   * Claims the next runnable build job. Returns null when nothing is
   * claimable. `now` is injected for deterministic lease tests.
   *
   * The "one active job per workspace" guard cannot be implemented with a
   * `NOT EXISTS` scan alone: under READ COMMITTED each statement sees its own
   * snapshot, so a concurrent transaction's uncommitted RUNNING update is
   * invisible and two workers could claim two QUEUED jobs of the same
   * workspace. We therefore serialize the claim decision per candidate
   * workspace with `pg_advisory_xact_lock(workspaceId)` (transaction-scoped,
   * auto-released) before re-checking against committed state.
   */
  async leaseNext(owner: string, now: Date, leaseMs?: number): Promise<BuildJob | null> {
    const ttl = leaseMs ?? this.leaseMs;
    const expiry = new Date(now.getTime() + ttl);
    return this.prisma.$transaction(async (tx) => {
      // Candidate workspaces: any workspace holding a claimable row. Sorted so
      // every worker takes advisory locks in the same order (no deadlocks).
      const workspaces = await tx.$queryRaw<{ workspaceId: string }[]>`
        SELECT DISTINCT "workspaceId"
        FROM "BuildJob"
        WHERE "status" IN ('QUEUED', 'RUNNING', 'VALIDATING')
          AND ("leaseExpiresAt" IS NULL
               OR extract(epoch from "leaseExpiresAt") < extract(epoch from ${now}))
        ORDER BY "workspaceId"
      `;
      for (const ws of workspaces) {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${ws.workspaceId}, 0))
        `;
      }

      // Re-check against committed state now that no other lease transaction
      // can be mid-claim for the same workspace.
      const rows = await tx.$queryRaw<BuildJobRow[]>`
        SELECT * FROM "BuildJob"
        WHERE "status" IN ('QUEUED', 'RUNNING', 'VALIDATING')
          AND ("leaseExpiresAt" IS NULL
               OR extract(epoch from "leaseExpiresAt") < extract(epoch from ${now}))
          AND NOT EXISTS (
            SELECT 1 FROM "BuildJob" AS active
            WHERE active."workspaceId" = "BuildJob"."workspaceId"
              AND active."status" IN ('RUNNING', 'VALIDATING')
              AND active."leaseExpiresAt" IS NOT NULL
              AND extract(epoch from active."leaseExpiresAt") >= extract(epoch from ${now})
              AND active."id" <> "BuildJob"."id"
          )
        ORDER BY "createdAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `;
      if (rows.length === 0) return null;
      const row = rows[0];
      if (row === undefined) return null;
      await this.#debugHooks.beforeClaim?.();
      return tx.buildJob.update({
        where: { id: row.id },
        data: {
          status: "RUNNING",
          leaseOwner: owner,
          leaseExpiresAt: expiry,
          attemptCount: { increment: 1 },
        },
      });
    });
  }

  /**
   * Commits a build outcome in one transaction: creates the new (immutable)
   * revision, its domain package pointer, the artifact row, the validation
   * report, marks the job terminal, and advances workspace.currentRevisionId
   * on success. Re-committing a terminal job is a no-op.
   */
  async completeBuild(input: CompleteBuildInput): Promise<BuildJob> {
    return this.prisma.$transaction(async (tx) => {
      const job = await tx.buildJob.findUnique({ where: { id: input.jobId } });
      if (job === null || job.tenantId !== input.tenantId) {
        throw new BuildJobNotFoundError("build job");
      }
      if (job.status === "SUCCEEDED" || job.status === "FAILED") {
        return job;
      }
      if (job.leaseOwner !== input.leaseOwner) {
        throw new BuildJobLeaseError("lease was lost or expired before completion");
      }

      if (input.status === "SUCCEEDED") {
        if (input.result === undefined) {
          throw new BuildJobConflictError("SUCCEEDED completion requires a build result");
        }
        const { result, validationReport } = input;
        const baseRevision = await tx.solutionRevision.findFirst({
          where: {
            id: job.baseRevisionId,
            tenantId: job.tenantId,
            workspaceId: job.workspaceId,
          },
        });
        if (baseRevision === null) {
          throw new BuildJobNotFoundError("base revision");
        }
        const workspace = await tx.solutionWorkspace.findFirst({
          where: { id: job.workspaceId, tenantId: job.tenantId },
        });
        if (workspace === null) {
          throw new BuildJobNotFoundError("workspace");
        }
        if (workspace.currentRevisionId !== job.baseRevisionId) {
          const message =
            `stale base revision ${job.baseRevisionId}; workspace currently points to ` +
            `${workspace.currentRevisionId ?? "no revision"}`;
          return recordBuildConflict(tx, job, message);
        }
        const baseProjects = await tx.domainProjectRevision.findMany({
          where: {
            tenantId: job.tenantId,
            solutionRevisionId: job.baseRevisionId,
          },
        });
        const boundProject = baseProjects.find(
          (project) => project.projectKey === job.projectKey,
        );
        if (boundProject !== undefined && boundProject.domainKind !== job.domainKind) {
          return recordBuildConflict(
            tx,
            job,
            `projectKey ${job.projectKey} belongs to domain ${boundProject.domainKind}, ` +
              `not ${job.domainKind}`,
          );
        }
        if (result.domainKind !== job.domainKind) {
          return recordBuildConflict(
            tx,
            job,
            `build result domain ${result.domainKind} does not match job domain ${job.domainKind}`,
          );
        }
        let nextState: Prisma.InputJsonValue;
        try {
          nextState = toInputJsonValue(
            replaceRevisionProjectBuildState(
              baseRevision.state,
              job.projectKey,
              job.domainKind,
              result.state,
            ),
          );
        } catch (error) {
          if (error instanceof RevisionStateError) {
            return recordBuildConflict(tx, job, error.message);
          }
          throw error;
        }
        const latest = await tx.solutionRevision.findFirst({
          where: { workspaceId: job.workspaceId, tenantId: job.tenantId },
          orderBy: { revisionNumber: "desc" },
        });
        const revision = await tx.solutionRevision.create({
          data: {
            tenantId: job.tenantId,
            workspaceId: job.workspaceId,
            changePlanId: job.changePlanId,
            revisionNumber: (latest?.revisionNumber ?? 0) + 1,
            kind: result.kind,
            parentRevisionId: job.baseRevisionId,
            state: nextState,
          },
        });
        const preservedProjects = baseProjects.filter(
          (project) => project.projectKey !== job.projectKey,
        );
        if (preservedProjects.length > 0) {
          await tx.domainProjectRevision.createMany({
            data: preservedProjects.map((project) => ({
              tenantId: job.tenantId,
              solutionRevisionId: revision.id,
              projectKey: project.projectKey,
              domainKind: project.domainKind,
              kind: project.kind,
              mediaType: project.mediaType,
              fileExtension: project.fileExtension,
              packageHash: project.packageHash,
              packageUrl: project.packageUrl,
            })),
          });
        }
        await tx.domainProjectRevision.create({
          data: {
            tenantId: job.tenantId,
            solutionRevisionId: revision.id,
            projectKey: job.projectKey,
            domainKind: result.domainKind,
            kind: result.domainProjectKind,
            mediaType: result.mediaType,
            fileExtension: result.fileExtension,
            packageHash: result.packageHash,
            packageUrl: result.packageUrl,
          },
        });
        await tx.artifact.create({
          data: {
            tenantId: job.tenantId,
            buildJobId: job.id,
            kind: result.artifact.kind,
            mediaType: result.artifact.mediaType,
            fileExtension: result.artifact.fileExtension,
            storageKey: result.artifact.storageKey,
            sizeBytes: result.artifact.sizeBytes,
            sha256: result.artifact.sha256,
          },
        });
        await tx.validationReport.create({
          data: {
            tenantId: job.tenantId,
            buildJobId: job.id,
            changePlanId: job.changePlanId,
            outcome: validationReport.outcome,
            summary: validationReport.summary,
            details: validationReport.details as Prisma.InputJsonValue,
          },
        });
        const updated = await tx.buildJob.update({
          where: { id: job.id },
          data: { status: "SUCCEEDED", leaseOwner: null, leaseExpiresAt: null },
        });
        await tx.solutionWorkspace.update({
          where: { id: job.workspaceId },
          data: { currentRevisionId: revision.id },
        });
        return updated;
      }

      await tx.validationReport.create({
        data: {
          tenantId: job.tenantId,
          buildJobId: job.id,
          changePlanId: job.changePlanId,
          outcome: input.validationReport.outcome,
          summary: input.validationReport.summary,
          details: input.validationReport.details as Prisma.InputJsonValue,
        },
      });
      return tx.buildJob.update({
        where: { id: job.id },
        data: { status: "FAILED", leaseOwner: null, leaseExpiresAt: null },
      });
    });
  }

  async get(jobId: string, tenantId: string): Promise<BuildJob | null> {
    return this.prisma.buildJob.findFirst({ where: { id: jobId, tenantId } });
  }

  async getByKey(idempotencyKey: string, tenantId: string): Promise<BuildJob | null> {
    return this.prisma.buildJob.findFirst({
      where: { idempotencyKey, tenantId },
    });
  }
}

interface BuildJobRow {
  id: string;
  tenantId: string;
  workspaceId: string;
  baseRevisionId: string;
  changePlanId: string;
  planHash: string;
  projectKey: string;
  domainKind: string;
  idempotencyKey: string;
  status: JobStatus;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  attemptCount: number;
  createdAt: Date;
  updatedAt: Date;
}

function normalizeProjectKey(projectKey: string | undefined, domainKind: string): string {
  const parsed = projectKeySchema.safeParse(projectKey ?? domainKind);
  if (!parsed.success) {
    throw new BuildJobConflictError(
      parsed.error.issues.map((issue) => issue.message).join("; "),
    );
  }
  return parsed.data;
}

function assertIdempotencyBinding(
  existing: BuildJob,
  input: EnqueueBuildInput,
  projectKey: string,
): void {
  if (existing.tenantId !== input.tenantId) {
    throw new BuildJobConflictError("idempotency key already used by another tenant");
  }
  if (
    existing.workspaceId !== input.workspaceId ||
    existing.baseRevisionId !== input.baseRevisionId ||
    existing.changePlanId !== input.changePlanId ||
    existing.planHash !== input.planHash ||
    existing.projectKey !== projectKey ||
    existing.domainKind !== input.domainKind
  ) {
    throw new BuildJobConflictError("idempotency key already used by another build");
  }
}

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  if (value === null) {
    throw new BuildJobConflictError("revision state must not be null");
  }
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new BuildJobConflictError("revision state numbers must be finite");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) =>
      entry === null || entry === undefined ? null : toInputJsonValue(entry),
    );
  }
  if (typeof value === "object") {
    const output: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry !== undefined) {
        output[key] = entry === null ? null : toInputJsonValue(entry);
      }
    }
    return output;
  }
  throw new BuildJobConflictError("revision state must be JSON serializable");
}

async function recordBuildConflict(
  tx: Prisma.TransactionClient,
  job: BuildJob,
  message: string,
): Promise<BuildJob> {
  await tx.validationReport.create({
    data: {
      tenantId: job.tenantId,
      buildJobId: job.id,
      changePlanId: job.changePlanId,
      outcome: "fail",
      summary: `build failed: ${message}`,
      details: toInputJsonValue({
        error: { name: "BuildJobConflictError", message },
      }),
    },
  });
  return tx.buildJob.update({
    where: { id: job.id },
    data: { status: "FAILED", leaseOwner: null, leaseExpiresAt: null },
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

/** Base class for all build-job domain errors. */
export class BuildJobError extends Error {
  override name = "BuildJobError";
}

/** A referenced resource does not exist (or is not visible to the tenant). */
export class BuildJobNotFoundError extends BuildJobError {
  override name = "BuildJobNotFoundError";
  constructor(resource: string) {
    super(`${resource} not found`);
  }
}

/** Conflicting state: idempotency key reuse, planHash mismatch, missing result. */
export class BuildJobConflictError extends BuildJobError {
  override name = "BuildJobConflictError";
}

/** The worker no longer holds a valid lease for the job. */
export class BuildJobLeaseError extends BuildJobError {
  override name = "BuildJobLeaseError";
}
