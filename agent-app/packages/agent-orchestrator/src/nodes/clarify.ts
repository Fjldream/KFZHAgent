import type { AgentGraphStateValue, AgentGraphUpdate } from "../state.js";
import type { SolutionGraphDeps } from "../ports.js";

/**
 * Clarify node: persists the model's clarifying question as an assistant
 * message, records one clarifying turn, and returns the graph to idle so the
 * user can answer.
 *
 * The question/options are carried in `state.clarifyingQuestion` (written by
 * the classify-intent node's CLARIFY branch) and cleared once persisted so a
 * later turn never re-sends a stale question. When no structured question is
 * present (e.g. a future entry path that only wrote `state.reply`) the reply
 * text is used as a fallback.
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
