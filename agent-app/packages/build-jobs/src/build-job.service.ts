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

const MAX_LEASE_CANDIDATE_WORKSPACES = 16;

/**
 * 持久化构建作业的租约与提交逻辑，由 API（入队）和 worker（租赁/执行/提交）共享。
 *
 * 幂等性：`enqueue` 对重复的 idempotencyKey 返回现有记录；idempotencyKey 上的 UNIQUE 索引是并发兜底。
 *
 * 租赁：`leaseNext` 推进持久化的跨租户轮询游标，在每个有界租户批次中最多检查一个候选工作空间，并使用非阻塞的 `pg_try_advisory_xact_lock`（事务范围、自动释放）串行化每次工作空间申领；随后通过 `SELECT ... FOR UPDATE SKIP LOCKED` 锁定一条候选记录，取得申领信息（`leaseOwner` 和 `leaseExpiresAt`）并递增 `attemptCount`。只有租约已过期或不存在的 QUEUED/RUNNING/VALIDATING 记录可以被申领，并且同一工作空间当前不能有其他记录持有有效租约（每个工作空间只能有一个活动作业）。咨询锁消除了 READ COMMITTED 下的竞态：`NOT EXISTS` 扫描可能看不到另一个事务尚未提交的 RUNNING 更新。
 *
 * 崩溃恢复：worker 在构建中途退出后，会留下租约已过期的 RUNNING 记录；租约到期后，`leaseNext` 会重新申领该记录，`completeBuild` 则只提交一次结果。对已处于终态的记录再次提交不会执行任何操作（纵深防御）。
 */
/**
 * BuildJobService 的测试专用扩展点。`beforeClaim` 在租约事务内部运行：申领 SELECT 已锁定候选记录，但 RUNNING UPDATE 尚未执行；测试可以借此扩大 READ COMMITTED 的竞态窗口（修复咨询锁之前，该条件会导致同一工作空间的两个作业被并发申领）。
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

  /** 将构建作业入队；以 idempotencyKey 保证幂等。 */
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
      where: {
        id: input.changePlanId,
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
      },
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
      // 相同键的并发入队：UNIQUE 索引是最终依据，返回竞争胜出的记录。
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
 * 申领下一个可运行的构建作业。没有可申领作业时返回 null。注入 `now` 以支持确定性的租约测试。
 *
 * “每个工作空间只能有一个活动作业”的守卫不能只通过 `NOT EXISTS` 扫描实现：在 READ COMMITTED 隔离级别下，每条语句看到自己的快照，因此另一个并发事务尚未提交的 RUNNING 更新不可见，两个 worker 可能分别申领同一工作空间的两个 QUEUED 作业。为此，我们在重新检查已提交状态前，通过有界的 `pg_try_advisory_xact_lock(workspaceId)` 循环（事务范围、自动释放）按候选工作空间串行化申领决策。
 */
  async leaseNext(owner: string, now: Date, leaseMs?: number): Promise<BuildJob | null> {
    const ttl = leaseMs ?? this.leaseMs;
    const expiry = new Date(now.getTime() + ttl);
    return this.prisma.$transaction(async (tx) => {
      // 只串行化小型调度决策。持久化游标使每次调用都从上一个实际成功申领作业的租户之后开始，因此某个旧积压队列无法占满所有候选批次。
      await tx.$executeRaw`
        INSERT INTO "BuildSchedulerCursor" ("id", "lastTenantId", "updatedAt")
        VALUES (1, '', ${now})
        ON CONFLICT ("id") DO NOTHING
      `;
      const cursorRows = await tx.$queryRaw<{ lastTenantId: string }[]>`
        SELECT "lastTenantId" FROM "BuildSchedulerCursor"
        WHERE "id" = 1 FOR UPDATE
      `;
      const lastTenantId = cursorRows[0]?.lastTenantId ?? "";
      const after = await tx.$queryRaw<{ tenantId: string }[]>`
        SELECT DISTINCT candidate."tenantId"
        FROM "BuildJob" AS candidate
        WHERE candidate."tenantId" > ${lastTenantId}
          AND candidate."status" IN ('QUEUED', 'RUNNING', 'VALIDATING')
          AND (candidate."leaseExpiresAt" IS NULL
               OR candidate."leaseExpiresAt" < (${now} AT TIME ZONE 'UTC'))
        ORDER BY candidate."tenantId" ASC
        LIMIT ${MAX_LEASE_CANDIDATE_WORKSPACES}
      `;
      const remaining = MAX_LEASE_CANDIDATE_WORKSPACES - after.length;
      const wrapped = remaining === 0 ? [] : await tx.$queryRaw<{ tenantId: string }[]>`
        SELECT DISTINCT candidate."tenantId"
        FROM "BuildJob" AS candidate
        WHERE candidate."tenantId" <= ${lastTenantId}
          AND candidate."status" IN ('QUEUED', 'RUNNING', 'VALIDATING')
          AND (candidate."leaseExpiresAt" IS NULL
               OR candidate."leaseExpiresAt" < (${now} AT TIME ZONE 'UTC'))
        ORDER BY candidate."tenantId" ASC
        LIMIT ${remaining}
      `;
      const tenants = [...after, ...wrapped];
      const workspaces: Array<{ tenantId: string; workspaceId: string }> = [];
      for (const tenant of tenants) {
        const candidate = await tx.$queryRaw<{ tenantId: string; workspaceId: string }[]>`
          SELECT candidate."tenantId", candidate."workspaceId"
          FROM "BuildJob" AS candidate
          WHERE candidate."tenantId" = ${tenant.tenantId}
            AND candidate."status" IN ('QUEUED', 'RUNNING', 'VALIDATING')
            AND (candidate."leaseExpiresAt" IS NULL
                 OR candidate."leaseExpiresAt" < (${now} AT TIME ZONE 'UTC'))
            AND NOT EXISTS (
              SELECT 1 FROM "BuildJob" AS active
              WHERE active."workspaceId" = candidate."workspaceId"
                AND active."status" IN ('RUNNING', 'VALIDATING')
                AND active."leaseExpiresAt" IS NOT NULL
                AND active."leaseExpiresAt" >= (${now} AT TIME ZONE 'UTC')
            )
          ORDER BY candidate."createdAt" ASC, candidate."id" ASC
          LIMIT 1
        `;
        if (candidate[0] !== undefined) workspaces.push(candidate[0]);
      }
      for (const ws of workspaces) {
        const lock = await tx.$queryRaw<{ acquired: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtextextended(${ws.workspaceId}, 0)) AS "acquired"
        `;
        if (lock[0]?.acquired !== true) continue;

        // Re-check after acquiring this workspace's lock. A competing claimant
        // may have committed between the bounded candidate query and here.
        const rows = await tx.$queryRaw<BuildJobRow[]>`
          SELECT * FROM "BuildJob" AS candidate
          WHERE candidate."workspaceId" = ${ws.workspaceId}
            AND candidate."status" IN ('QUEUED', 'RUNNING', 'VALIDATING')
            AND (candidate."leaseExpiresAt" IS NULL
                 OR candidate."leaseExpiresAt" < (${now} AT TIME ZONE 'UTC'))
            AND NOT EXISTS (
              SELECT 1 FROM "BuildJob" AS active
              WHERE active."workspaceId" = candidate."workspaceId"
                AND active."status" IN ('RUNNING', 'VALIDATING')
                AND active."leaseExpiresAt" IS NOT NULL
                AND active."leaseExpiresAt" >= (${now} AT TIME ZONE 'UTC')
                AND active."id" <> candidate."id"
            )
          ORDER BY candidate."createdAt" ASC, candidate."id" ASC
          LIMIT 1
          FOR UPDATE OF candidate SKIP LOCKED
        `;
        const row = rows[0];
        if (row === undefined) continue;
        await this.#debugHooks.beforeClaim?.();
        const claimed = await tx.buildJob.update({
          where: { id: row.id },
          data: {
            status: "RUNNING",
            leaseOwner: owner,
            leaseExpiresAt: expiry,
            attemptCount: { increment: 1 },
          },
        });
        await tx.$executeRaw`
          UPDATE "BuildSchedulerCursor"
          SET "lastTenantId" = ${ws.tenantId}, "updatedAt" = ${now}
          WHERE "id" = 1
        `;
        return claimed;
      }
      const lastConsidered = tenants.at(-1)?.tenantId;
      if (lastConsidered !== undefined) {
        await tx.$executeRaw`
          UPDATE "BuildSchedulerCursor"
          SET "lastTenantId" = ${lastConsidered}, "updatedAt" = ${now}
          WHERE "id" = 1
        `;
      }
      return null;
    });
  }

  /** Extends only the still-live lease held by this exact owner/attempt fence. */
  async renewLease(input: {
    jobId: string;
    tenantId: string;
    leaseOwner: string;
    leaseAttempt: number;
  }, leaseMs?: number): Promise<boolean> {
    const ttl = leaseMs ?? this.leaseMs;
    const renewed = await this.prisma.$executeRaw`
      UPDATE "BuildJob"
      SET "leaseExpiresAt" =
            (clock_timestamp() AT TIME ZONE 'UTC') + (${ttl} * INTERVAL '1 millisecond'),
          "updatedAt" = (clock_timestamp() AT TIME ZONE 'UTC')
      WHERE "id" = ${input.jobId}
        AND "tenantId" = ${input.tenantId}
        AND "leaseOwner" = ${input.leaseOwner}
        AND "attemptCount" = ${input.leaseAttempt}
        AND "status" IN ('RUNNING', 'VALIDATING')
        AND "leaseExpiresAt" IS NOT NULL
        AND "leaseExpiresAt" > (clock_timestamp() AT TIME ZONE 'UTC')
    `;
    return renewed === 1;
  }

  /**
   * Commits a build outcome in one transaction: creates the new (immutable)
   * revision, its domain package pointer, the artifact row, the validation
   * report, marks the job terminal, and advances workspace.currentRevisionId
   * on success. Re-committing a terminal job is a no-op.
   */
  async completeBuild(input: CompleteBuildInput): Promise<BuildJob> {
    return this.prisma.$transaction(async (tx) => {
      // Lock order is part of the concurrency contract: BuildJob first,
      // SolutionWorkspace second. Every completion takes both locks before a
      // terminal, lease, or stale-base decision so the decision and writes
      // share one atomic authority under PostgreSQL READ COMMITTED.
      const lockedJobs = await tx.$queryRaw<BuildJobRow[]>`
        SELECT * /* kf_complete_build_job_lock */
        FROM "BuildJob"
        WHERE "id" = ${input.jobId}
        FOR UPDATE
      `;
      const lockedJob = lockedJobs[0] ?? null;
      if (lockedJob === null || lockedJob.tenantId !== input.tenantId) {
        throw new BuildJobNotFoundError("build job");
      }
      const job = lockedJob;
      const lockedWorkspaces = await tx.$queryRaw<LockedWorkspaceRow[]>`
        SELECT "id", "tenantId", "currentRevisionId" /* kf_complete_workspace_lock */
        FROM "SolutionWorkspace"
        WHERE "id" = ${job.workspaceId}
          AND "tenantId" = ${job.tenantId}
        FOR UPDATE
      `;
      const workspace = lockedWorkspaces[0] ?? null;
      if (workspace === null) {
        throw new BuildJobNotFoundError("workspace");
      }
      if (job.status === "SUCCEEDED" || job.status === "FAILED") {
        return job;
      }
      // CURRENT_TIMESTAMP is fixed at transaction start and can therefore be
      // stale after a row-lock wait. Evaluate wall-clock database time only
      // after both authoritative locks have been acquired.
      const leaseChecks = await tx.$queryRaw<{ leaseIsActive: boolean }[]>`
        SELECT (
          "leaseExpiresAt" IS NOT NULL
          AND "leaseExpiresAt" > (clock_timestamp() AT TIME ZONE 'UTC')
        ) AS "leaseIsActive"
        FROM "BuildJob"
        WHERE "id" = ${job.id}
      `;
      const leaseIsActive = leaseChecks[0]?.leaseIsActive === true;
      if (
        job.leaseOwner !== input.leaseOwner ||
        job.attemptCount !== input.leaseAttempt ||
        !leaseIsActive
      ) {
        throw new BuildJobLeaseError("lease was lost or expired before completion");
      }

      if (input.status === "SUCCEEDED") {
        if (input.result === undefined) {
          throw new BuildJobConflictError("SUCCEEDED completion requires a build result");
        }
        const { result, validationReport } = input;
        if (result.creativeBinding !== undefined
          && (!isSha256(result.creativeBinding.creativeArtifactHash)
            || !isSha256(result.creativeBinding.nativeMaterializationHash))) {
          return recordBuildConflict(tx, job, "creative delivery binding contains an invalid hash");
        }
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
            solutionRevisionId: revision.id,
            ...(result.creativeBinding === undefined ? {} : {
              creativeArtifactHash: result.creativeBinding.creativeArtifactHash,
              nativeMaterializationHash: result.creativeBinding.nativeMaterializationHash,
            }),
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

function isSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
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

interface LockedWorkspaceRow {
  id: string;
  tenantId: string;
  currentRevisionId: string | null;
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
