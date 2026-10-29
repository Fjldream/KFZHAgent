// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import type { AgentRun, Prisma } from "@prisma/client";
import { RunActionSchema } from "@kf/contracts";

/** 只审计已经消费的审批决定，不代表后续编译、改稿或工程交付成功。 */
export async function recordApprovalDecision(tx: Prisma.TransactionClient, run: AgentRun, output: unknown): Promise<void> {
  const parsed = RunActionSchema.safeParse(run.action);
  const decision = output !== null && typeof output === "object" ? output as Record<string, unknown> : {};
  if (!parsed.success || parsed.data.type !== "resume_approval" || parsed.data.action !== decision.resumeAction
    || decision.lastErrorCode !== undefined || run.mode !== "build") throw new Error("APPROVAL_AUDIT_MISMATCH");
  const action = parsed.data;
  const stages = { approve: "building", revise: "planning", cancel: "idle" } as const;
  if (decision.stage !== stages[action.action]) throw new Error("APPROVAL_AUDIT_MISMATCH");
  const auditAction = { approve: "PLAN_CONFIRMED", revise: "PLAN_REVISED", cancel: "PLAN_CANCELLED" } as const;
  await tx.auditLog.upsert({
    where: { id: `agent-run:approval:${run.id}` },
    create: {
      id: `agent-run:approval:${run.id}`, tenantId: run.tenantId, actorUserId: run.requestedByUserId,
      action: auditAction[action.action], resourceType: "AGENT_RUN", resourceId: run.id,
      detail: { phase: "approval_consumed", approvalAction: action.action, planHash: action.planHash,
        expectedRunId: action.expectedRunId, workspaceId: run.workspaceId, conversationId: run.conversationId,
        retryOfRunId: run.retryOfRunId },
    },
    update: {},
  });
}
// end
