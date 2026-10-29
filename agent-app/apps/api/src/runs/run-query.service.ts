// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { RunEvent, RunSnapshot } from "@kf/contracts";
import type { PrismaClient } from "@prisma/client";
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { VISUAL_RUN_PLAN_VERSION } from "@kf/contracts";
// end

export const RUN_NOT_FOUND = "RUN_NOT_FOUND";
export const RUN_EVENT_CURSOR_INVALID = "RUN_EVENT_CURSOR_INVALID";
export const RUN_EVENT_LIMIT_INVALID = "RUN_EVENT_LIMIT_INVALID";
export const MAX_EVENT_PAGE = 1_000;

export interface RunQueries {
  snapshot(tenantId: string, runId: string): Promise<RunSnapshot>;
  eventsAfter(tenantId: string, runId: string, after: number, limit: number): Promise<RunEvent[]>;
}

const toSnapshot = (row: {
  id: string; tenantId: string; workspaceId: string; conversationId: string; status: string;
  lastSeq: number; baseRevisionId: string | null; buildJobId: string | null;
  resultRevisionId: string | null; failureCode: string | null; supersededByRunId: string | null;
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  configSnapshot?: unknown;
  inputSnapshot?: unknown;
  // end
}): RunSnapshot => ({
  id: row.id,
  tenantId: row.tenantId,
  workspaceId: row.workspaceId,
  conversationId: row.conversationId,
  status: row.status as RunSnapshot["status"],
  lastSeq: row.lastSeq,
  baseRevisionId: row.baseRevisionId ?? "",
  buildJobId: row.buildJobId,
  resultRevisionId: row.resultRevisionId,
  failureCode: row.failureCode,
  supersededByRunId: row.supersededByRunId,
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  retryPolicy: (row.configSnapshot as { planVersion?: unknown } | null)?.planVersion === VISUAL_RUN_PLAN_VERSION
    || row.inputSnapshot !== null && typeof row.inputSnapshot === "object" && ["visualAdmission", "visualContinuation", "visualEngineering"].some(key => Object.hasOwn(row.inputSnapshot!, key))
    ? "new-visual-review" : "new-run",
  // end
});

/**
 * 重放与快照的唯一事实源都是数据库：事件按 seq 升序分页读取，
 * 不依赖内存通知（NOTIFY 只做唤醒）。跨租户一律按「不存在」处理，不泄露存在性。
 */
export class PrismaRunQueries implements RunQueries {
  constructor(private readonly prisma: PrismaClient) {}

  async latest(tenantId: string, conversationId: string): Promise<RunSnapshot | null> {
    if (!await this.prisma.conversation.findFirst({ where: { id: conversationId, tenantId }, select: { id: true } })) throw new Error(RUN_NOT_FOUND);
    // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
    // 当前业务屏障优先，不能让较新受理的 queued 输入遮住审批/正在执行的轮次。
    const barrier = await this.prisma.agentRun.findFirst({ where: { tenantId, conversationId, status: { in: ["RUNNING", "BUILDING", "CANCEL_REQUESTED", "WAITING_INPUT", "WAITING_APPROVAL"] } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    if (barrier) return toSnapshot(barrier);
    const [queued] = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT r."id" FROM "AgentRun" r WHERE r."tenantId" = ${tenantId} AND r."conversationId" = ${conversationId} AND r."status" = 'QUEUED'
        AND NOT EXISTS (SELECT 1 FROM "AgentRun" predecessor WHERE predecessor."id" = r."predecessorRunId" AND predecessor."status" = 'QUEUED')
      ORDER BY r."createdAt", r."id" LIMIT 1
    `;
    if (queued) return this.snapshot(tenantId, queued.id);
    // 完成顺序由前序链决定，不能依赖旧 raw-SQL 与 ORM 混合口径的 finishedAt。
    const [tail] = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT r."id" FROM "AgentRun" r WHERE r."tenantId" = ${tenantId} AND r."conversationId" = ${conversationId}
        AND NOT EXISTS (SELECT 1 FROM "AgentRun" child WHERE child."predecessorRunId" = r."id" AND child."tenantId" = ${tenantId} AND child."conversationId" = ${conversationId})
      ORDER BY r."createdAt" DESC, r."id" DESC LIMIT 1
    `;
    const row = tail ? await this.prisma.agentRun.findFirst({ where: { id: tail.id, tenantId, conversationId } }) : null;
    // end
    return row ? toSnapshot(row) : null;
  }

  async snapshot(tenantId: string, runId: string): Promise<RunSnapshot> {
    const row = await this.prisma.agentRun.findFirst({ where: { id: runId, tenantId } });
    if (row === null) throw new Error(RUN_NOT_FOUND);
    return toSnapshot(row);
  }

  async eventsAfter(tenantId: string, runId: string, after: number, limit: number): Promise<RunEvent[]> {
    if (!Number.isInteger(after) || after < 0) throw new Error(RUN_EVENT_CURSOR_INVALID);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_EVENT_PAGE) {
      throw new Error(RUN_EVENT_LIMIT_INVALID);
    }

    const run = await this.prisma.agentRun.findFirst({
      where: { id: runId, tenantId },
      select: { id: true, lastSeq: true },
    });
    if (run === null) throw new Error(RUN_NOT_FOUND);
    // 游标超过当前最后 seq 说明客户端状态与服务器分叉，明确拒绝而不是返回空页。
    if (after > run.lastSeq) throw new Error(RUN_EVENT_CURSOR_INVALID);

    const rows = await this.prisma.agentRunEvent.findMany({
      where: { runId, tenantId, seq: { gt: after } },
      orderBy: { seq: "asc" },
      take: limit,
    });
    return rows.map((row) => ({
      schemaVersion: 1,
      runId: row.runId,
      seq: row.seq,
      type: row.type as RunEvent["type"],
      createdAt: row.createdAt.toISOString(),
      payload: (row.payload ?? {}) as Record<string, unknown>,
    }));
  }

  // modified by jinlong.feng at 2026-10-20 Agent工作台迭代
  /** run 的预算用量：RunBudget + 调用账本聚合，供右栏「用量」pane。 */
  async usageFor(tenantId: string, runId: string): Promise<{
    callsUsed: number; callsLimit: number;
    inputTokens: number; inputLimit: number;
    outputTokens: number; outputLimit: number;
    costEstimate: string;
    usageUnknownCount: number;
  } | null> {
    const run = await this.prisma.agentRun.findFirst({ where: { id: runId, tenantId }, select: { id: true } });
    if (run === null) return null;
    const budget = await this.prisma.runBudget.findUnique({ where: { runId } });
    const invocations = await this.prisma.modelInvocation.aggregate({
      where: { runId },
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true, costMicros: true },
    });
    const sums = invocations._sum as Record<string, number | bigint | null>;
    const inputTokens = Number(sums.inputTokens ?? 0);
    const outputTokens = Number(sums.outputTokens ?? 0);
    const costMicros = Number(sums.costMicros ?? 0);
    const callsUsed = invocations._count._all;
    // 每次调用至少占 1 次预算；UNKNOWN 结果按保守上限记在预算行，不在这里重复计。
    const unknownCount = budget?.unknownUsageCount ?? 0;
    return {
      callsUsed: Math.max(callsUsed, budget?.usedInvocations ?? 0),
      callsLimit: budget?.maxInvocations ?? 0,
      inputTokens, inputLimit: budget?.maxInputTokens ?? 0,
      outputTokens, outputLimit: budget?.maxOutputTokens ?? 0,
      costEstimate: `¥${(costMicros / 1_000_000).toFixed(2)}`,
      usageUnknownCount: unknownCount,
    };
  }
  // end
}

/** SSE 帧格式；id 用 seq，便于浏览器 EventSource 断线后带 Last-Event-ID 重连。 */
export function serializeRunEvent(event: RunEvent): string {
  return `id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
// end
