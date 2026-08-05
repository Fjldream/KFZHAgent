import type { AgentGraphStateValue, AgentGraphUpdate } from "../state.js";
import type { SolutionGraphDeps } from "../ports.js";

/**
 * Classifies the current turn through ModelPort.classifyIntent and applies the
 * deterministic routing decisions:
 *   - unsupported-domain NEW/MODIFY requirements → pendingRequirements, idle,
 *     never planned or built (brief Step 4),
 *   - QUESTION → the assistant reply is persisted and the graph returns to
 *     idle,
 *   - ROLLBACK → explicitly not supported by this workflow yet,
 *   - everything else → routed by the conditional edge.
 */
export function createClassifyIntentNode(deps: SolutionGraphDeps) {
  return async (state: AgentGraphStateValue): Promise<AgentGraphUpdate> => {
    const requirementText = latestUserMessage(state);
    const result = await deps.modelPort.classifyIntent({
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
