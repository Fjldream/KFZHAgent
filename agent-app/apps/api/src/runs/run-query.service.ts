// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { RunEvent, RunSnapshot } from "@kf/contracts";
import type { PrismaClient } from "@prisma/client";

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
});

/**
 * 重放与快照的唯一事实源都是数据库：事件按 seq 升序分页读取，
 * 不依赖内存通知（NOTIFY 只做唤醒）。跨租户一律按「不存在」处理，不泄露存在性。
 */
export class PrismaRunQueries implements RunQueries {
  constructor(private readonly prisma: PrismaClient) {}

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
}

/** SSE 帧格式；id 用 seq，便于浏览器 EventSource 断线后带 Last-Event-ID 重连。 */
export function serializeRunEvent(event: RunEvent): string {
  return `id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
// end
