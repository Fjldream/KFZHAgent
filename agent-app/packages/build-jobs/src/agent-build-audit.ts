// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import type { BuildJob, Prisma } from "@prisma/client";

/** 调用者必须持有 run-control/job 锁，且与实际状态变更共用事务；不为旧的无 Run 作业补造历史。 */
export async function recordAgentBuildAudit(
  tx: Prisma.TransactionClient, job: BuildJob, phase: "enqueued" | "completed", resultRevisionId: string | null = null,
): Promise<void> {
  if (!job.agentRunId) return;
  const run = await tx.agentRun.findFirst({ where: {
    id: job.agentRunId, tenantId: job.tenantId, workspaceId: job.workspaceId,
    baseRevisionId: job.baseRevisionId, buildJobId: job.id,
  }, select: { requestedByUserId: true, conversationId: true } });
  if (!run) throw new Error("BUILD_AUDIT_BINDING_MISMATCH");
  const action = phase === "enqueued" ? "BUILD_START" : "BUILD_RESULT";
  const id = `agent-build:${phase}:${job.id}`;
  await tx.auditLog.upsert({
    where: { id }, update: {},
    create: { id, tenantId: job.tenantId, actorUserId: run.requestedByUserId, action,
      resourceType: "BUILD_JOB", resourceId: job.id,
      detail: { phase, runId: job.agentRunId, conversationId: run.conversationId, workspaceId: job.workspaceId,
        baseRevisionId: job.baseRevisionId, changePlanId: job.changePlanId, planHash: job.planHash,
        projectKey: job.projectKey, domainKind: job.domainKind, actorRole: "requester",
        ...(phase === "completed" ? { status: job.status, terminalReason: job.terminalReason, resultRevisionId } : {}),
      },
    },
  });
}
// end
