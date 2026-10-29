// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import type { PrismaClient } from "@prisma/client";
import type { AgentRunExecutionScope } from "@kf/build-jobs";
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { VISUAL_RUN_PLAN_VERSION } from "@kf/contracts";

export async function runAllowsVisualHistory(prisma: Pick<PrismaClient, "agentRun">, scope: AgentRunExecutionScope,
  tenantId: string, conversationId: string): Promise<boolean> {
  const run = scope.tenantId === tenantId ? await prisma.agentRun.findFirst({ where: { id: scope.runId, tenantId, conversationId,
    leaseOwner: scope.ownerId, fence: scope.fence, status: { in: ["RUNNING", "BUILDING", "CANCEL_REQUESTED"] } },
    select: { configSnapshot: true } }) : null;
  if (!run) throw new Error("RUN_SCOPE_MISMATCH");
  return (run.configSnapshot as { planVersion?: unknown } | null)?.planVersion === VISUAL_RUN_PLAN_VERSION;
}

/** Copied fork messages have no runId; recover their source conservatively from scoped ancestry. */
export async function hasVisualConversationSource(prisma: Pick<PrismaClient, "$queryRaw">, tenantId: string, conversationId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ visual: boolean }>>`
    WITH RECURSIVE ancestry AS (
      SELECT "id", "forkedFromConversationId", 0 AS depth, ARRAY["id"] AS path
      FROM "Conversation" WHERE "id" = ${conversationId} AND "tenantId" = ${tenantId}
      UNION ALL
      SELECT parent."id", parent."forkedFromConversationId", child.depth + 1, child.path || parent."id"
      FROM "Conversation" parent JOIN ancestry child ON parent."id" = child."forkedFromConversationId"
      WHERE parent."tenantId" = ${tenantId} AND child.depth < 255 AND NOT parent."id" = ANY(child.path)
    )
    SELECT EXISTS (
      SELECT 1 FROM ancestry JOIN "AgentRun" run ON run."conversationId" = ancestry."id"
      WHERE run."tenantId" = ${tenantId} AND run."configSnapshot"->>'planVersion' = ${VISUAL_RUN_PLAN_VERSION}
    ) OR EXISTS (
      SELECT 1 FROM ancestry WHERE "forkedFromConversationId" IS NOT NULL
        AND (depth = 255 OR "forkedFromConversationId" = ANY(path)
          OR NOT EXISTS (SELECT 1 FROM "Conversation" parent WHERE parent."id" = ancestry."forkedFromConversationId" AND parent."tenantId" = ${tenantId}))
    ) AS visual
  `;
  return rows[0]?.visual !== false;
}
// end

// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
export async function assertRunMessageScope(prisma: Pick<PrismaClient, "agentRun">, scope: AgentRunExecutionScope, tenantId: string, conversationId: string): Promise<void> {
  if (scope.tenantId !== tenantId || !await prisma.agentRun.findFirst({ where: { id: scope.runId, tenantId, conversationId, leaseOwner: scope.ownerId, fence: scope.fence, status: { in: ["RUNNING", "BUILDING", "CANCEL_REQUESTED"] } }, select: { id: true } })) throw new Error("RUN_SCOPE_MISMATCH");
}
// end

// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
/** 排序依据执行前序而非消息写入时间：审批继续可以先于更早受理的队列输入。 */
export async function listRunMessages(prisma: PrismaClient, scope: AgentRunExecutionScope, tenantId: string, conversationId: string, limit: number) {
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  const allowVisual = await runAllowsVisualHistory(prisma, scope, tenantId, conversationId);
  const hideOrphanHistory = !allowVisual && await hasVisualConversationSource(prisma, tenantId, conversationId);
  // end
  const rows = await prisma.$queryRaw<Array<{ role: string; content: string }>>`
    WITH RECURSIVE lineage AS (
      SELECT "id", "predecessorRunId", "createdAt", "startedAt", "configSnapshot", 0 AS depth, ARRAY["id"] AS path
      FROM "AgentRun" WHERE "id" = ${scope.runId} AND "tenantId" = ${tenantId} AND "conversationId" = ${conversationId}
      UNION ALL
      SELECT predecessor."id", predecessor."predecessorRunId", predecessor."createdAt", predecessor."startedAt", predecessor."configSnapshot", child.depth + 1, child.path || predecessor."id"
      FROM "AgentRun" predecessor JOIN lineage child ON predecessor."id" = child."predecessorRunId"
      WHERE predecessor."tenantId" = ${tenantId} AND predecessor."conversationId" = ${conversationId}
        AND child.depth < 255 AND NOT predecessor."id" = ANY(child.path)
    ), visible AS (
      SELECT message."role", message."content", message."createdAt", message."id", lineage.depth
      FROM "Message" message JOIN lineage ON message."runId" = lineage."id"
      WHERE message."tenantId" = ${tenantId} AND message."conversationId" = ${conversationId}
        AND (lineage.depth = 0 OR lineage."startedAt" IS NOT NULL)
        AND (${allowVisual} OR lineage.depth = 0 OR COALESCE(lineage."configSnapshot"->>'planVersion', '') <> ${VISUAL_RUN_PLAN_VERSION})
      UNION ALL
      SELECT "role", "content", "createdAt", "id", 256 AS depth FROM "Message"
      WHERE "tenantId" = ${tenantId} AND "conversationId" = ${conversationId} AND "runId" IS NULL
        AND "createdAt" < (SELECT MIN("createdAt") FROM lineage)
        AND NOT ${hideOrphanHistory}
    )
    SELECT "role", "content" FROM visible ORDER BY depth, "createdAt" DESC, "id" DESC LIMIT ${limit}
  `;
  return rows.reverse().map(row => ({ role: row.role as "user" | "assistant", content: row.content }));
}
// end
// end
