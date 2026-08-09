import type { AgentGraphStateValue, AgentGraphUpdate } from "../state.js";
import type { SolutionGraphDeps } from "../ports.js";
import { ClassifyIntentResultSchema } from "../schemas/intent.js";

/**
 * 澄清追问轮数上限（Task 5）：state.clarificationCount 达到该值后，模型再
 * 要求澄清也不接受追问，按 NEW_REQUIREMENT 继续推进，避免无限澄清循环。
 */
const CLARIFY_MAX_TURNS = 5;

/**
 * preview-review 阶段（Task 9）的关键词分档表。用户在构建预览后的自然语言
 * 反馈按内容确定性地重分类，不依赖真实 LLM 是否感知到阶段上下文：
 *   - 确认类短回复 → CONFIRM_BUILD（落地）；
 *   - 含布局/风格/整体/重新设计等大改词 → REVISE_DESIGN（回设计循环）；
 *   - 具体小改（文案/尺寸/控件等）→ MODIFY_REQUIREMENT（回变更计划）。
 * 命中顺序为确认 → 大改 → 小改；未命中则保留模型分类（如 preview 阶段的问题）。
 */
const PREVIEW_CONFIRM_WORDS = ["确认落地", "可以落地", "落地", "没问题", "就这样吧", "可以了", "满意"];
const PREVIEW_REDESIGN_WORDS = [
  "重新设计",
  "重新生成",
  "重做",
  "整体",
  "布局",
  "风格",
  "色调",
  "主题",
  "大改",
];
const PREVIEW_SMALL_CHANGE_WORDS = [
  "改",
  "调整",
  "加",
  "删",
  "换",
  "移动",
  "缩小",
  "放大",
  "文案",
  "尺寸",
  "控件",
];

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
    let result = parsed.data;

    // preview-review 阶段：对看预览后的反馈做关键词兜底分档（见上面词表）。
    // 误判防护：确认词只在短消息（≤20 字符）命中时生效，避免
    // "好的，把按钮再放大一点"这类含确认前缀的修改被终结为落地；
    // 大改词命中时排除"发我/给我/看看/方案"索取句式（"把整体方案发给我"）。
    if (state.stage === "preview-review") {
      const text = requirementText ?? "";
      const requestsSomething = /发我|给我|看看|方案/.test(text);
      if (PREVIEW_CONFIRM_WORDS.some((word) => text.includes(word)) && text.length <= 20) {
        result = { ...result, intent: "CONFIRM_BUILD" };
      } else if (
        !requestsSomething &&
        PREVIEW_REDESIGN_WORDS.some((word) => text.includes(word))
      ) {
        result = { ...result, intent: "REVISE_DESIGN" };
      } else if (PREVIEW_SMALL_CHANGE_WORDS.some((word) => text.includes(word))) {
        result = { ...result, intent: "MODIFY_REQUIREMENT" };
      }
    }

    // design-review 阶段：用户短消息确认词指"确认设计计划"（CONFIRM_DESIGN），
    // 而非批准变更计划（CONFIRM_PLAN）——真实 LLM 常把"确认"误判为后者。
    if (state.stage === "design-review") {
      const text = requirementText ?? "";
      if (
        text.length <= 12 &&
        /确认|可以|没问题|同意|就这样|挺好的|就按这个/.test(text)
      ) {
        result = { ...result, intent: "CONFIRM_DESIGN" };
      } else if (
        result.intent === "NEW_REQUIREMENT" ||
        result.intent === "MODIFY_REQUIREMENT"
      ) {
        result = { ...result, intent: "REVISE_DESIGN" };
      }
    }

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
        const notice = "已尝试多轮澄清，按当前理解继续。";
        await deps.workspaceQuery.appendMessage({
          tenantId: state.tenantId,
          conversationId: state.conversationId,
          role: "assistant",
          content: notice,
        });
        return {
          intent: "NEW_REQUIREMENT",
          reply: notice,
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
