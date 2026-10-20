import type { AgentGraphStateValue, AgentGraphUpdate } from "../state.js";
import type { SolutionGraphDeps } from "../ports.js";
import {
  ClassifyIntentResultSchema,
  type ClassifyIntentResult,
} from "../schemas/intent.js";
import { decodeBlueprintConfirmation } from "../blueprint-message.js";

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
 * 当前轮次的分类通过 ModelPort.classifyIntent 进行，然后应用确定性路由决策:
 *   - 不支持的领域的新/修改要求 → pendingRequirements, 空闲, 从未计划或构建(简略步骤4),
 *   - 问题 → 副助回复被持久化并返回到空闲,
 *   - 撤销 → 该工作流程中尚未支持的,
 *   - 其他 → 由条件边路经。在任何状态副作用之前，原始模型输出被 zod-gated (I1): 任何真实 LLM 可以产生一个虚构的意图值或一个畸形的形状，而图必须拒绝它以 INVALID_MODEL_OUTPUT 代替路由于垃圾或写入一个没有人要求的副助回复。
 */
export function createClassifyIntentNode(deps: SolutionGraphDeps) {
  return async (state: AgentGraphStateValue): Promise<AgentGraphUpdate> => {
    const requirementText = latestUserMessage(state);
    const blueprintConfirmation = requirementText === undefined
      ? null
      : decodeBlueprintConfirmation(requirementText.trim());
    const isImplementationRetry =
      state.designPlanHash !== undefined
      && state.lastErrorCode?.startsWith("UI_IMPLEMENTATION_INVALID") === true
      && requirementText?.trim() === "重新生成工程实施计划";
    const creativeErrorCode = state.lastErrorCode?.split(":", 1)[0];
    const isCreativeCompilationRetry = state.generationWorkflow === "creative-v2"
      && state.changePlanId === undefined
      && state.buildJobId === undefined
      && requirementText?.trim() === "重新生成工程"
      && [
        "CREATIVE_SOLUTION_BLOCKED",
        "CREATIVE_SOLUTION_COMPILATION_FAILED",
        "CREATIVE_SOLUTION_EVIDENCE_UNAVAILABLE",
        "CREATIVE_SOLUTION_OUTPUT_INVALID",
        "CREATIVE_SOLUTION_PERSIST_FAILED",
      ].includes(creativeErrorCode ?? "");
    let result: ClassifyIntentResult;
    if (blueprintConfirmation !== null || isImplementationRetry || isCreativeCompilationRetry) {
      // 持久化实现失败后，我们自己的 UI 会发出这一确切短语。对其进行确定性路由，防止旧的已批准计划/构建检查点劫持重试，同时避免分类器调用增加延迟或成本。
      result = { intent: "CONFIRM_DESIGN", requestedDomains: ["kingclient"] };
    } else {
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
      result = parsed.data;
    }

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

    const wantsChange =
      result.intent === "NEW_REQUIREMENT" || result.intent === "MODIFY_REQUIREMENT";
    const unsupported =
      wantsChange &&
      result.requestedDomains.length > 0 &&
      result.requestedDomains.every((domain) => !deps.isDomainSupported(domain));

    // design-review 阶段：用户短消息确认词指"确认设计计划"（CONFIRM_DESIGN），
    // 而非批准变更计划（CONFIRM_PLAN）——真实 LLM 常把"确认"误判为后者。
    const hasUncommittedDesign =
      state.designPlanHash !== undefined &&
      state.planHash === undefined &&
      state.buildJobId === undefined;
    if (
      !unsupported &&
      (state.stage === "design-review" ||
        isImplementationRetry || isCreativeCompilationRetry ||
        ((state.stage === "idle" || state.stage === "done") && hasUncommittedDesign))
    ) {
      const text = requirementText ?? "";
      if (
        isImplementationRetry || isCreativeCompilationRetry
        || (text.length <= 12
          && /确认|可以|没问题|同意|就这样|挺好的|就按这个/.test(text))
      ) {
        result = { ...result, intent: "CONFIRM_DESIGN" };
      } else if (
        result.intent === "NEW_REQUIREMENT" ||
        result.intent === "MODIFY_REQUIREMENT"
      ) {
        result = { ...result, intent: "REVISE_DESIGN" };
      }
    }

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
      // 显式清空 pendingRequirements 通道和所有陈旧错误代码：先前不受支持的轮次绝不能阻碍后续受支持的轮次（见 C1），普通问题则会重置错误状态。
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
      // 模型需要更多信息才能选择路由。结构化问题会保存在状态中并传递给 clarify 节点；该节点将问题持久化为助手消息，然后让图返回 idle。清空 pendingRequirements，使本轮依据自身信号进行路由。
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
    // 仅清除pendingRequirements通道，这样这个轮次会根据自己的信号路由(见C1)。lastErrorCode在这里是保留的：加载上下文可能刚刚设置了BUILD_FAILED(规划)并且计划节点必须看到它。
    return {
      intent: result.intent,
      pendingRequirements: undefined,
      ...(isImplementationRetry
        ? { buildConfirmed: false, lastErrorCode: undefined }
        : {}),
    };
  };
}

function latestUserMessage(state: AgentGraphStateValue): string | undefined {
  for (let i = state.recentMessages.length - 1; i >= 0; i -= 1) {
    const message = state.recentMessages[i];
    if (message !== undefined && message.role === "user") return message.content;
  }
  return undefined;
}
