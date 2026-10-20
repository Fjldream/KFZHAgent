import type { AgentGraphStateValue, AgentGraphUpdate } from "../state.js";
import type { SolutionGraphDeps } from "../ports.js";

/**
 * 交给模型的最近消息数量。按照简要步骤 6 设置硬性上限；更早的内容只保留在滚动 conversationSummary 中。
 */
const RECENT_MESSAGE_LIMIT = 20;

/**
 * 滚动总结覆盖。总结是作为一个纯函数重新计算并覆盖，因此重复运行这个节点是幂等的。
 */
const SUMMARY_MAX_LENGTH = 4_000;

/**
 * 为每次运行加载有界上下文（简要步骤 6）：
 *   - 最近消息（硬性上限，绝不包含原始上传、密钥或页面 JSON）；
 *   - 滚动会话摘要；
 *   - 有界的当前修订摘要；
 *   - 跟踪构建作业时的终态构建结果：SUCCEEDED 作业刷新当前修订并返回 idle；FAILED 作业返回规划阶段。
 *
 * 该节点以读取为主：唯一写操作是在必须记录构建结果时幂等覆盖会话摘要。
 */
export function createLoadContextNode(deps: SolutionGraphDeps) {
  return async (state: AgentGraphStateValue): Promise<AgentGraphUpdate> => {
    const { tenantId, workspaceId, conversationId } = state;

    const [messages, storedSummary, workspaceRevisionId, workspaceRouting] = await Promise.all([
      deps.workspaceQuery.listRecentMessages({
        tenantId,
        conversationId,
        limit: RECENT_MESSAGE_LIMIT,
      }),
      deps.workspaceQuery.getConversationSummary({ tenantId, conversationId }),
      deps.workspaceQuery.getCurrentRevisionId({ tenantId, workspaceId }),
      deps.workspaceQuery.getWorkspaceRouting?.({ tenantId, workspaceId }),
    ]);

    const baseRevisionId = state.currentRevisionId ?? workspaceRevisionId;
    const revisionSummary =
      baseRevisionId !== undefined
        ? await deps.workspaceQuery.getRevisionSummary({ tenantId, revisionId: baseRevisionId })
        : undefined;

    let stage = state.stage;
    let lastErrorCode = state.lastErrorCode;
    let summaryAddition: string | undefined;
    let refreshedRevisionId = workspaceRevisionId;
    const generationWorkflow = workspaceRouting?.generationWorkflow ?? state.generationWorkflow;

    if (state.buildJobId !== undefined && state.stage === "building") {
      const job = await deps.buildJobPort.getJob({ tenantId, jobId: state.buildJobId });
      if (job !== null) {
        if (job.status === "SUCCEEDED") {
          stage = generationWorkflow === "creative-v2" ? "done" : "preview-review";
          lastErrorCode = undefined;
          refreshedRevisionId =
            (await deps.workspaceQuery.getCurrentRevisionId({ tenantId, workspaceId })) ??
            baseRevisionId;
          summaryAddition = generationWorkflow === "creative-v2"
            ? `工程生成 ${job.id} 已完成，工程包已就绪。`
            : `构建 ${job.id} 已完成，当前状态为最新。`;
        } else if (job.status === "FAILED") {
          stage = "planning";
          lastErrorCode = "BUILD_FAILED";
          summaryAddition = generationWorkflow === "creative-v2"
            ? `工程生成 ${job.id} 失败，已返回规划阶段。`
            : `构建 ${job.id} 失败，已返回规划阶段。`;
        }
      }
    }

    const nextSummary = mergeSummary(storedSummary, summaryAddition);
    if (nextSummary !== undefined && nextSummary !== storedSummary) {
      await deps.workspaceQuery.setConversationSummary({ tenantId, conversationId, summary: nextSummary });
    }

    return {
      recentMessages: messages,
      conversationSummary: nextSummary,
      currentRevisionId: refreshedRevisionId,
      workspaceMode: workspaceRouting?.mode,
      generationWorkflow,
      revisionSummary,
      stage,
      lastErrorCode,
    };
  };
}

/** Pure, bounded summary merge: append the event, keep the newest tail. */
function mergeSummary(existing: string | undefined, addition: string | undefined): string | undefined {
  if (addition === undefined) return existing;
  const combined = existing !== undefined && existing.length > 0 ? `${existing}\n${addition}` : addition;
  return combined.length > SUMMARY_MAX_LENGTH
    ? combined.slice(combined.length - SUMMARY_MAX_LENGTH)
    : combined;
}
