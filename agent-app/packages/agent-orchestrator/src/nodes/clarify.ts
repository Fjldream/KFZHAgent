import type { AgentGraphStateValue, AgentGraphUpdate } from "../state.js";
import type { SolutionGraphDeps } from "../ports.js";

/**
 * 澄清节点：保留模型澄清问题为助手消息，记录澄清回合并返回图以使用户可以回答。问题/选项存储在 `state.clarifyingQuestion`（由 classify-intent 节点的 CLARIFY 分支写入）中，一旦被持久化则不再发送，以防止后来的回合重复发送过时的问题。当没有结构化的问题（例如，只有在写入 `state.reply` 的情况下才写入的未来路径）时，回复文本用于备用。
 */
export function createClarifyNode(deps: SolutionGraphDeps) {
  return async (state: AgentGraphStateValue): Promise<AgentGraphUpdate> => {
    const question = state.clarifyingQuestion?.question ?? state.reply ?? "请补充更多需求细节";
    const options = state.clarifyingQuestion?.options ?? [];
    const content = options.length > 0 ? `${question}\n${options.join("\n")}` : question;

    await deps.workspaceQuery.appendMessage({
      tenantId: state.tenantId,
      conversationId: state.conversationId,
      role: "assistant",
      content,
    });

    // Defensive cap: the schema bounds clarificationCount to 5; Task 5 adds the
    // real "stop asking past the cap" gate in classify-intent.
    return {
      clarificationCount: Math.min((state.clarificationCount ?? 0) + 1, 5),
      stage: "idle",
      clarifyingQuestion: undefined,
      reply: undefined,
    };
  };
}
