// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { PrismaClient } from "@prisma/client";
import { setTimeout as delay } from "node:timers/promises";
import type { StepContext } from "./run-execution.service.js";
import { FENCE_REJECTED } from "./run-store.js";
import { RunAborted } from "./run-executor.js";

/** 绑定实际作业、修订和工程包后才能成功，而不是构建刚入队就交付。 */
export async function waitForRunBuild(
  deps: { prisma: PrismaClient; buildPollMs?: number }, context: StepContext,
  run: { id: string; tenantId: string; workspaceId: string }, buildJobId: string,
): Promise<{ output: unknown; safeSummary: string }> {
  const update = await deps.prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE "AgentRun"
    SET "status" = CASE WHEN "status" = 'CANCEL_REQUESTED' THEN "status" ELSE 'BUILDING' END,
        "buildJobId" = ${buildJobId}
    WHERE "id" = ${run.id} AND "tenantId" = ${run.tenantId}
      AND "leaseOwner" = ${context.lease.ownerId} AND "fence" = ${context.lease.fence}
      AND "leaseExpiresAt" > ${new Date()}
      AND ("status" IN ('RUNNING', 'BUILDING') OR ("status" = 'CANCEL_REQUESTED' AND "buildJobId" = ${buildJobId}))
    RETURNING "id"
  `;
  if (update.length !== 1) throw new Error(FENCE_REJECTED);
  let previousStatus = "";
  for (;;) {
    context.signal.throwIfAborted();
    const job = await deps.prisma.buildJob.findFirst({ where: { id: buildJobId, tenantId: run.tenantId, workspaceId: run.workspaceId } });
    if (!job) throw Object.assign(new Error("BUILD_JOB_NOT_FOUND"), { code: "BUILD_JOB_NOT_FOUND" });
    if (job.status !== previousStatus) {
      await context.publish("build.updated", { buildJobId, status: job.status });
      previousStatus = job.status;
    }
    if (job.status === "FAILED") {
      if (job.terminalReason === "CANCELLED") throw new RunAborted();
      throw Object.assign(new Error("BUILD_FAILED"), { code: "BUILD_FAILED" });
    }
    if (job.status === "SUCCEEDED") {
      const revisions = await deps.prisma.solutionRevision.findMany({ where: {
        tenantId: run.tenantId, workspaceId: run.workspaceId,
        changePlanId: job.changePlanId, parentRevisionId: job.baseRevisionId,
      }, take: 2 });
      const artifact = await deps.prisma.artifact.findFirst({ where: { tenantId: run.tenantId, buildJobId, kind: "client-package" } });
      const revision = revisions.length === 1 ? revisions[0] : undefined;
      const project = revision && await deps.prisma.domainProjectRevision.findFirst({ where: { tenantId: run.tenantId, solutionRevisionId: revision.id, projectKey: job.projectKey, domainKind: job.domainKind } });
      if (!revision || !artifact || !project || project.packageUrl !== artifact.storageKey || project.packageHash !== artifact.sha256) {
        throw Object.assign(new Error("BUILD_DELIVERY_BINDING_INVALID"), { code: "BUILD_DELIVERY_BINDING_INVALID" });
      }
      const bound = await deps.prisma.$queryRaw<Array<{ id: string }>>`
        UPDATE "AgentRun" SET "resultRevisionId" = ${revision.id}
        WHERE "id" = ${run.id} AND "tenantId" = ${run.tenantId}
          AND "leaseOwner" = ${context.lease.ownerId} AND "fence" = ${context.lease.fence}
          AND "leaseExpiresAt" > ${new Date()} AND "buildJobId" = ${buildJobId}
          AND "status" IN ('BUILDING', 'CANCEL_REQUESTED')
        RETURNING "id"
      `;
      if (bound.length !== 1) throw new Error(FENCE_REJECTED);
      return { output: { buildJobId, revisionId: revision.id, artifactId: artifact.id }, safeSummary: "工程构建完成，工程包已就绪；尚需人工 KingFusion 运行态验收" };
    }
    await delay(deps.buildPollMs ?? 1000, undefined, { signal: context.signal });
  }
}
// end
