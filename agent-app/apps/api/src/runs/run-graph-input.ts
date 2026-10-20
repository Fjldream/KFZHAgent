// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { AgentGraphUpdate } from "@kf/agent-orchestrator";

export type RunGraphInputSource = {
  runId: string;
  tenantId: string;
  requestedByUserId: string;
  workspaceId: string;
  conversationId: string;
  baseRevisionId: string | null;
  planVersion?: string | null;
};

export type RunGraphInput = AgentGraphUpdate & {
  runId: string;
  planVersion?: string;
};

/**
 * 由持久 run 构造图输入。
 *
 * 与旧 SSE 入口保持同一形状：`recentMessages` 只带本轮用户消息，历史由
 * `load-context` 节点按分页自行加载——在入口塞全量历史会让「历史很长」的会话
 * 每次重算全部上下文，也让 checkpoint 体积失控。
 *
 * `currentRevisionId` 取 run 的 baseRevisionId：换基线后必须由新的 run 驱动，
 * 不能在旧 run 上继续用新基线。
 */
export function buildRunGraphInput(
  source: RunGraphInputSource,
  latestUserMessage: string | null,
  stage: string = "idle",
): RunGraphInput {
  return {
    tenantId: source.tenantId,
    userId: source.requestedByUserId,
    workspaceId: source.workspaceId,
    conversationId: source.conversationId,
    stage: stage as AgentGraphUpdate["stage"],
    recentMessages: latestUserMessage === null ? [] : [{ role: "user", content: latestUserMessage }],
    runId: source.runId,
    ...(source.planVersion === undefined || source.planVersion === null
      ? {}
      : { planVersion: source.planVersion }),
    ...(source.baseRevisionId === null ? {} : { currentRevisionId: source.baseRevisionId }),
  } as RunGraphInput;
}
// end
