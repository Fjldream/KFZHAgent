import { Prisma, type BuildJob, type JobStatus, type PrismaClient } from "@prisma/client";

import type {
  CompleteBuildInput,
  EnqueueBuildInput,
} from "./types.js";

/**
 * Durable build-job lease and commit logic, shared by the API (enqueue) and
 * the worker (lease/execute/commit).
 *
 * Idempotency: `enqueue` returns the existing row for a repeated
 * idempotencyKey; the UNIQUE index on idempotencyKey is the concurrency
 * backstop.
 *
 * Leasing: `leaseNext` runs a single transaction that locks one candidate row
 * with `SELECT ... FOR UPDATE SKIP LOCKED`, taking a claim (`leaseOwner` +
 * `leaseExpiresAt`) and bumping `attemptCount`. Only QUEUED/RUNNING/VALIDATING
 * rows with an expired or absent lease are claimable, and only when no other
 * row of the same workspace currently holds a live lease (one active job per
 * workspace).
 *
 * Crash recovery: a worker that dies mid-build leaves the row RUNNING with an
 * expired lease; after expiry `leaseNext` re-claims it and `completeBuild`
 * commits the result exactly once. Re-committing an already terminal row is a
 * no-op (defense in depth).
 */
export class BuildJobService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly leaseMs = 30_000,
  ) {}

  /** Enqueues a build job; idempotent on idempotencyKey. */
  async enqueue(input: EnqueueBuildInput): Promise<BuildJob> {
    const existing = await this.prisma.buildJob.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing !== null) {
      if (existing.tenantId !== input.tenantId) {
        throw new BuildJobConflictError("idempotency key already used by another tenant");
      }
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
        data: { ...input, status: "QUEUED" },
      });
    } catch (error) {
      // Concurrent enqueue of the same key: the UNIQUE index is the final
      // authority, return the winning row.
      if (isUniqueViolation(error)) {
        const winner = await this.prisma.buildJob.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (winner !== null) return winner;
      }
      throw error;
    }
  }

  /**
   * Claims the next runnable build job. Returns null when nothing is
   * claimable. `now` is injected for deterministic lease tests.
   */
  async leaseNext(owner: string, now: Date, leaseMs?: number): Promise<BuildJob | null> {
    const ttl = leaseMs ?? this.leaseMs;
    const expiry = new Date(now.getTime() + ttl);
    return this.prisma.$transaction(async (tx) => {
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
        const latest = await tx.solutionRevision.findFirst({
          where: { workspaceId: job.workspaceId },
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
            state: result.state as Prisma.InputJsonValue,
          },
        });
        await tx.domainProjectRevision.create({
          data: {
            tenantId: job.tenantId,
            solutionRevisionId: revision.id,
            domainKind: result.domainKind,
            kind: result.domainProjectKind,
            packageHash: result.packageHash,
            packageUrl: result.packageUrl,
          },
        });
        await tx.artifact.create({
          data: {
            tenantId: job.tenantId,
            buildJobId: job.id,
            kind: result.artifact.kind,
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
  domainKind: string;
  idempotencyKey: string;
  status: JobStatus;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  attemptCount: number;
  createdAt: Date;
  updatedAt: Date;
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
