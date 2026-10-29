// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import type { Prisma } from "@prisma/client";
import { RunActionSchema } from "@kf/contracts";

/** 只在持有会话锁及 queued 行锁时调用；未知来源的基线变化故障关闭。 */
export async function prepareQueuedBaseline(tx: Prisma.TransactionClient, tenantId: string, runId: string): Promise<boolean> {
  const run = await tx.agentRun.findFirstOrThrow({ where: { id: runId, tenantId, status: "QUEUED" } });
  const [workspace] = await tx.$queryRaw<Array<{ currentRevisionId: string | null }>>`
    SELECT "currentRevisionId" FROM "SolutionWorkspace" WHERE "id" = ${run.workspaceId} AND "tenantId" = ${tenantId} FOR SHARE
  `;
  const target = workspace?.currentRevisionId;
  const action = RunActionSchema.safeParse(run.action);
  // 取消旧审批只关闭请求，不构建、不换基线；即使工作区已前进也必须允许释放中断。
  if (workspace && action.success && action.data.type === "resume_approval" && action.data.action === "cancel") return true;
  if (target === run.baseRevisionId) return true;
  const policy = run.inputSnapshot as { baseRevisionPolicy?: unknown } | null;
  let predecessor = run.predecessorRunId ? await tx.agentRun.findFirst({ where: { id: run.predecessorRunId, tenantId, conversationId: run.conversationId, workspaceId: run.workspaceId } }) : null;
  // 未执行的已取消排队条目不构成新的基线来源；仍须追溯到实际成功的前序。
  const visited = new Set<string>([run.id]);
  while (predecessor?.status === "CANCELLED" && !predecessor.startedAt && predecessor.predecessorRunId && visited.size < 256 && !visited.has(predecessor.id)) {
    visited.add(predecessor.id);
    predecessor = await tx.agentRun.findFirst({ where: { id: predecessor.predecessorRunId, tenantId, conversationId: run.conversationId, workspaceId: run.workspaceId } });
  }
  const canFollow = typeof target === "string" && policy?.baseRevisionPolicy === "follow-predecessor"
    && predecessor?.status === "SUCCEEDED" && (predecessor.resultRevisionId ?? predecessor.baseRevisionId) === target
    && await ownsRevisionPath(tx, run, target);
  if (!canFollow) {
    const failed = await tx.agentRun.update({ where: { id: runId }, data: { status: "FAILED", failureCode: "BASE_REVISION_CONFLICT", finishedAt: new Date(), lastSeq: { increment: 1 } } });
    await tx.agentRunEvent.create({ data: { runId, tenantId, seq: failed.lastSeq, type: "run.failed", payload: { failureCode: "BASE_REVISION_CONFLICT" } } });
    await tx.conversation.update({ where: { id: run.conversationId }, data: { lastActivityAt: new Date() } });
    return false;
  }
  const updated = await tx.agentRun.update({ where: { id: runId }, data: { baseRevisionId: target, lastSeq: { increment: 1 } } });
  await tx.agentRunEvent.create({ data: { runId, tenantId, seq: updated.lastSeq, type: "baseline.changed", payload: { fromRevisionId: run.baseRevisionId, toRevisionId: target } } });
  return true;
}

/** 基线区间内每一个新修订都须绑定同一前序链的成功 run；不能借一次讨论“洗白”外部改动。 */
async function ownsRevisionPath(tx: Prisma.TransactionClient, run: { id: string; tenantId: string; workspaceId: string; conversationId: string; baseRevisionId: string | null }, target: string): Promise<boolean> {
  const revisions = await tx.$queryRaw<Array<{ id: string; parentRevisionId: string | null; owned: boolean }>>`
    WITH RECURSIVE ancestors AS (
      SELECT "id", "predecessorRunId", "resultRevisionId", "status", 0 AS depth, ARRAY["id"] AS path FROM "AgentRun"
      WHERE "id" = ${run.id} AND "tenantId" = ${run.tenantId} AND "conversationId" = ${run.conversationId} AND "workspaceId" = ${run.workspaceId}
      UNION ALL
      SELECT predecessor."id", predecessor."predecessorRunId", predecessor."resultRevisionId", predecessor."status", child.depth + 1, child.path || predecessor."id"
      FROM "AgentRun" predecessor JOIN ancestors child ON child."predecessorRunId" = predecessor."id"
      WHERE predecessor."tenantId" = ${run.tenantId} AND predecessor."conversationId" = ${run.conversationId} AND predecessor."workspaceId" = ${run.workspaceId}
        AND child.depth < 255 AND NOT predecessor."id" = ANY(child.path)
    ), revisions AS (
      SELECT "id", "parentRevisionId", 0 AS depth, ARRAY["id"] AS path FROM "SolutionRevision"
      WHERE "id" = ${target} AND "tenantId" = ${run.tenantId} AND "workspaceId" = ${run.workspaceId}
      UNION ALL
      SELECT parent."id", parent."parentRevisionId", child.depth + 1, child.path || parent."id"
      FROM "SolutionRevision" parent JOIN revisions child ON child."parentRevisionId" = parent."id"
      WHERE parent."tenantId" = ${run.tenantId} AND parent."workspaceId" = ${run.workspaceId}
        AND child."id" IS DISTINCT FROM ${run.baseRevisionId}::text AND child.depth < 255 AND NOT parent."id" = ANY(child.path)
    )
    SELECT revisions."id", revisions."parentRevisionId", EXISTS (
      SELECT 1 FROM ancestors WHERE "status" = 'SUCCEEDED' AND "resultRevisionId" = revisions."id"
    ) AS owned FROM revisions WHERE revisions."id" IS DISTINCT FROM ${run.baseRevisionId}::text ORDER BY depth
  `;
  return revisions.length > 0 && revisions.every(revision => revision.owned) && revisions[revisions.length - 1]!.parentRevisionId === run.baseRevisionId;
}
// end
