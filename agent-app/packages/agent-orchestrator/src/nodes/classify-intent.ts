import type { AgentGraphStateValue, AgentGraphUpdate } from "../state.js";
import type { SolutionGraphDeps } from "../ports.js";
import { ClassifyIntentResultSchema } from "../schemas/intent.js";

/**
 * 澄清追问轮数上限（Task 5）：state.clarificationCount 达到该值后，模型再
 * 要求澄清也不接受追问，按 NEW_REQUIREMENT 继续推进，避免无限澄清循环。
 */
const CLARIFY_MAX_TURNS = 5;

/**
 * Classifies the current turn through ModelPort.classifyIntent and applies the
 * deterministic routing decisions:
 *   - unsupported-domain NEW/MODIFY requirements → pendingRequirements, idle,
 *     never planned or built (brief Step 4),
 *   - QUESTION → the assistant reply is persisted and the graph returns to
 *     idle,
 *   - ROLLBACK → explicitly not supported by this workflow yet,
 *   - everything else → routed by the conditional edge.
 *
 * The raw model output is zod-gated before ANY state side effect (I1): a real
 * LLM can emit an invented intent value or a malformed shape, and the graph
 * must reject it with INVALID_MODEL_OUTPUT instead of routing on garbage or
 * writing an assistant reply nobody asked for.
 */
export function createClassifyIntentNode(deps: SolutionGraphDeps) {
  return async (state: AgentGraphStateValue): Promise<AgentGraphUpdate> => {
    const requirementText = latestUserMessage(state);
    const rawResult: unknown = await deps.modelPort.classifyIntent({
      tenantId: state.tenantId,
      userId: state.userId,
      workspaceId: state.workspaceId,
      conversationId: state.conversationId,
      recentMessages: state.recentMessages,
      conversationSummary: state.conversationSummary,
      revisionSummary: state.revisionSummary,
      currentRevisionId: state.currentRevisionId,
      requirementText,
    });
    const parsed = ClassifyIntentResultSchema.safeParse(rawResult);
    if (!parsed.success) {
      return {
        stage: "idle",
        lastErrorCode: "INVALID_MODEL_OUTPUT",
        pendingRequirements: undefined,
        resumeAction: undefined,
      };
    }
    const result = parsed.data;

    const wantsChange =
      result.intent === "NEW_REQUIREMENT" || result.intent === "MODIFY_REQUIREMENT";
    const unsupported =
      wantsChange &&
      result.requestedDomains.length > 0 &&
      result.requestedDomains.every((domain) => !deps.isDomainSupported(domain));

    if (unsupported) {
      const pendingRequirements = result.requestedDomains.map((domain) => ({
        text: requirementText ?? "未支持领域的需求",
        requestedDomains: [domain],
      }));
      return {
        intent: result.intent,
        pendingRequirements,
        lastErrorCode: "UNSUPPORTED_DOMAIN",
        stage: "idle",
      };
    }

    if (result.intent === "QUESTION") {
      const reply = result.reply ?? "已收到你的问题，请继续描述需求。";
      await deps.workspaceQuery.appendMessage({
        tenantId: state.tenantId,
        conversationId: state.conversationId,
        role: "assistant",
        content: reply,
      });
      // Explicitly clear the pendingRequirements channel and any stale error
      // code: a previous unsupported turn must never gate a later supported
      // turn (see C1), and a plain question resets the error surface.
      return {
        intent: result.intent,
        stage: "idle",
        pendingRequirements: undefined,
        lastErrorCode: undefined,
      };
    }

    if (result.intent === "CLARIFY") {
      // 5 轮上限 gate（Task 5）：用户反复追问后仍信息不足时，不再接受澄清，
      // 按 NEW_REQUIREMENT 继续推进——reply 提示“按当前理解继续”，
      // clarifyingQuestion 不写入 state，clarify 节点不会再次追问。
      if ((state.clarificationCount ?? 0) >= CLARIFY_MAX_TURNS) {
        return {
          intent: "NEW_REQUIREMENT",
          reply: "已尝试多轮澄清，按当前理解继续。",
          stage: "idle",
          pendingRequirements: undefined,
          lastErrorCode: undefined,
        };
      }
      // The model needs more information before it can pick a route. The
      // structured question is carried in state for the clarify node, which
      // persists it as an assistant message and returns the graph to idle.
      // pendingRequirements is cleared so this turn routes on its own signal.
      return {
        intent: result.intent,
        clarifyingQuestion: result.clarifyingQuestion,
        reply: result.reply,
        stage: "idle",
        pendingRequirements: undefined,
        lastErrorCode: undefined,
      };
    }

    if (result.intent === "ROLLBACK") {
      return {
        intent: result.intent,
        stage: "idle",
        pendingRequirements: undefined,
        lastErrorCode: "ROLLBACK_NOT_SUPPORTED",
      };
    }

    // NEW_REQUIREMENT / MODIFY_REQUIREMENT / CONFIRM_PLAN / CANCEL_PLAN / BUILD
    // Clear only the pendingRequirements channel so this turn is routed on its
    // own signal (see C1). lastErrorCode is left untouched here: load-context
    // may have just set BUILD_FAILED (planning) and the plan node must see it.
    return { intent: result.intent, pendingRequirements: undefined };
  };
}

function latestUserMessage(state: AgentGraphStateValue): string | undefined {
  for (let i = state.recentMessages.length - 1; i >= 0; i -= 1) {
    const message = state.recentMessages[i];
    if (message !== undefined && message.role === "user") return message.content;
  }
  return undefined;
}
