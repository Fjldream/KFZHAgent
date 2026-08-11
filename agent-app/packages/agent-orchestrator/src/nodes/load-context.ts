import type { AgentGraphStateValue, AgentGraphUpdate } from "../state.js";
import type { SolutionGraphDeps } from "../ports.js";

/**
 * How many recent messages are handed to the model. Hard bound per brief
 * Step 6; anything older lives only in the rolling conversationSummary.
 */
const RECENT_MESSAGE_LIMIT = 20;

/**
 * Rolling-summary cap. The summary is recomputed as a pure function and
 * overwritten, so re-running this node is idempotent.
 */
const SUMMARY_MAX_LENGTH = 4_000;

/**
 * Loads bounded context for every run (brief Step 6):
 *   - recent messages (hard limit, never raw uploads/secrets/page JSON),
 *   - the rolling conversation summary,
 *   - the bounded current-revision summary,
 *   - and (when a build job is tracked) the terminal build outcome: a
 *     SUCCEEDED job refreshes the current revision and returns to idle; a
 *     FAILED job returns to the planning stage.
 *
 * The node is read-mostly: the only write is the idempotent overwrite of the
 * conversation summary when a build outcome must be recorded.
 */
export function createLoadContextNode(deps: SolutionGraphDeps) {
  return async (state: AgentGraphStateValue): Promise<AgentGraphUpdate> => {
    const { tenantId, workspaceId, conversationId } = state;

    const [messages, storedSummary, workspaceRevisionId] = await Promise.all([
      deps.workspaceQuery.listRecentMessages({
        tenantId,
        conversationId,
        limit: RECENT_MESSAGE_LIMIT,
      }),
      deps.workspaceQuery.getConversationSummary({ tenantId, conversationId }),
      deps.workspaceQuery.getCurrentRevisionId({ tenantId, workspaceId }),
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

    if (state.buildJobId !== undefined && state.stage === "building") {
      const job = await deps.buildJobPort.getJob({ tenantId, jobId: state.buildJobId });
      if (job !== null) {
        if (job.status === "SUCCEEDED") {
          stage = "preview-review";
          lastErrorCode = undefined;
          refreshedRevisionId =
            (await deps.workspaceQuery.getCurrentRevisionId({ tenantId, workspaceId })) ??
            baseRevisionId;
          summaryAddition = `构建 ${job.id} 已完成，当前状态为最新。`;
        } else if (job.status === "FAILED") {
          stage = "planning";
          lastErrorCode = "BUILD_FAILED";
          summaryAddition = `构建 ${job.id} 失败，已返回规划阶段。`;
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
