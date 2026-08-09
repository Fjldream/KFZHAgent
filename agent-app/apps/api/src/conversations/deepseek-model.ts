import type { ChangePlan, DesignPlan, ValidationReport } from "@kf/contracts";
import { changePlanSchema, DesignPlanSchema, solutionId } from "@kf/contracts";
import { KF_DESIGN_PRINCIPLES_FULL } from "./kf-design-principles.js";
import type {
  ClassifyIntentResult,
  EditableEntity,
  ModelPort,
  ModelPortContext,
  ProjectDesign,
} from "@kf/agent-orchestrator";
import { ClassifyIntentResultSchema } from "@kf/agent-orchestrator";

/**
 * DeepSeek-backed ModelPort (OpenAI-compatible chat completions).
 *
 * Every planning method sends the bounded ModelPortContext (never raw uploads,
 * secrets, or full page JSON) plus the editable-entity list with exact KF
 * GUIDs, and demands strict JSON output. Output is zod-gated here before it
 * reaches the graph, and change plans referencing hallucinated GUIDs are
 * rejected — the graph can never build a plan that references entities that
 * do not exist.
 *
 * Env wiring (conversations.module.ts): `MODEL_PORT_MODE=deepseek` +
 * `DEEPSEEK_API_KEY` (and optional DEEPSEEK_BASE_URL / DEEPSEEK_MODEL).
 */

export interface DeepSeekModelOptions {
  apiKey: string;
  /** OpenAI-compatible base URL (default https://api.deepseek.com). */
  baseUrl?: string;
  /** Model name (default deepseek-chat). */
  model?: string;
  /** Test seam. */
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";
const DEFAULT_TIMEOUT_MS = 60_000;

/** Raised when the LLM output cannot be turned into a valid plan/design. */
export class DeepSeekModelOutputError extends Error {
  override name = "DeepSeekModelOutputError";
  constructor(detail: string) {
    super(`deepseek model output rejected: ${detail}`);
  }
}

const SYSTEM_PROMPT = `你以礼貌、专业的客服顾问口吻与客户沟通，回复简洁自然，像真人顾问在对话，避免机械罗列。

你是 KingFusion（KF）客户端工程生成 Agent 的规划模型。你负责把用户需求转成结构化输出，绝不执行任何代码。

领域知识：
- KF 客户端工程由页面（默认 1440x900）和控件组成。
- 本阶段只支持三种控件：
  - text：静态文本（text 字段为显示文本）
  - button：按钮（text 字段为按钮文字）
  - inputnumber：数值输入框（variableId 绑定变量名，decimals 小数位）
- 控件动作只允许受限 DSL：{"kind":"setVariable","variableId":"$变量名","value":数字} 或 {"kind":"navigatePage","pageId":"页面名"}。
- 禁止输出任意 JavaScript、脚本字符串、自由文本代码。

输出规则：
- 只输出合法 JSON，不要 Markdown 围栏、注释或额外说明。
- 计划中的 entityId 必须是用户提供的实体清单里的 GUID，禁止编造。
- 修改字段只允许控件受控字段，如 /text、/backgroundColor、/x、/y、/width、/height。

${KF_DESIGN_PRINCIPLES_FULL}`;

/**
 * CLARIFY 输出若漏掉 clarifyingQuestion（模型只声明要澄清却没给问题），
 * 回填一个默认问题，防止“只澄清、没有问题”的空追问（Task 5）。
 */
function normalizeClarifyOutput(raw: unknown): unknown {
  const record = (raw ?? {}) as Record<string, unknown>;
  if (record["intent"] !== "CLARIFY") {
    // 防御：模型信息足够（intent 非 CLARIFY）却仍带澄清字段时，剥离它们，
    // 否则 superRefine 交叉校验会拒绝（非 CLARIFY 不得携带 clarifyingQuestion）。
    if (record["clarifyingQuestion"] !== undefined || record["needsClarification"] !== undefined) {
      const { clarifyingQuestion: _cq, needsClarification: _nc, ...rest } = record;
      void _cq;
      void _nc;
      return rest;
    }
    return raw;
  }
  const q = record["clarifyingQuestion"];
  const hasUsableQuestion =
    q !== undefined &&
    q !== null &&
    typeof q === "object" &&
    typeof (q as Record<string, unknown>)["question"] === "string" &&
    ((q as Record<string, unknown>)["question"] as string).length > 0;
  if (hasUsableQuestion) return raw;
  return {
    ...record,
    needsClarification: true,
    clarifyingQuestion: {
      question: "请补充需求信息（例如主题、页面或布局方向），以便生成设计方案。",
      options: ["①补充主题/业务场景", "②补充页面结构", "③补充风格偏好"],
    },
  };
}

/** 从 LLM 回复中提取 JSON（容忍 ```json 围栏与前后杂文本）。 */
export function extractJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1]!.trim() : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new DeepSeekModelOutputError("no JSON object in model reply");
  }
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch (error) {
    throw new DeepSeekModelOutputError(
      `unparseable JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function knownGuidSet(entities: EditableEntity[] | undefined): Set<string> {
  return new Set((entities ?? []).map((entity) => entity.guid));
}

export class DeepSeekModelPort implements ModelPort {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: DeepSeekModelOptions) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.model = options.model ?? DEFAULT_MODEL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  private async chatJson(system: string, user: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
          temperature: 0.2,
          max_tokens: 4000,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      throw new DeepSeekModelOutputError(
        `api call failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new DeepSeekModelOutputError(`api http ${response.status}: ${text.slice(0, 300)}`);
    }
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
      throw new DeepSeekModelOutputError("empty model reply");
    }
    return extractJson(content);
  }

  async classifyIntent(input: ModelPortContext): Promise<ClassifyIntentResult> {
    const userPrompt = [
      "根据用户最近的需求，判断意图（intent），可选值：",
      'QUESTION（提问/闲聊）、NEW_REQUIREMENT（新建工程需求）、MODIFY_REQUIREMENT（修改已有工程）、CONFIRM_DESIGN（明确确认设计蓝图）、REVISE_DESIGN（设计确认前补充或修改设计需求）、CONFIRM_PLAN（确认工程变更计划）、CANCEL_PLAN（取消计划）、BUILD（要求构建）、CONFIRM_BUILD（确认构建预览落地）、ROLLBACK（回滚）、CLARIFY（需求信息不足，需澄清）。',
      'requestedDomains：涉及的产品域（客户端工程为 ["kingclient"]）。',
      "reply：给用户的一句简短回复（可选）。",
      "needsClarification：是否需要补充信息（intent 为 CLARIFY 时为 true）。",
      'clarifyingQuestion：{"question":"具体问题","options":["选项1","选项2","选项3"]}（intent 为 CLARIFY 时必须输出）。',
      "",
      "澄清判定规则：",
      "判断需求信息是否足够生成设计方案：若主题/页面/布局/风格等关键信息缺失或模糊，intent 必须为 CLARIFY。",
      "CLARIFY 时：问题用礼貌开场，格式为「您好，为了帮您把方案做得更贴合需求，先确认一下：<具体问题>。请选择或直接告诉我。」",
      "选项必须带序号（①②③④⑤），最多 5 个，一次只问一个维度，选项简短具体（如「① 生产车间监控」）。",
      "信息足够时才返回 NEW_REQUIREMENT / MODIFY_REQUIREMENT，禁止猜测需求。",
      "若用户最近消息是在回答你上一个澄清问题（如回复「①」、选项序号、或包含上一轮选项的关键词，如「生产车间」），说明信息已补充，应转入 NEW_REQUIREMENT / MODIFY_REQUIREMENT，不得重复追问同一问题。",
      "若上一轮助手正在展示设计草案：只有用户明确表示确认时返回 CONFIRM_DESIGN；用户继续补充内容、布局、风格或模块时返回 REVISE_DESIGN。",
      "CONFIRM_PLAN 只用于用户明确批准已经展示的工程变更计划，不能用于确认设计草案。",
      "",
      "用户最近消息：",
      input.recentMessages.map((m) => `${m.role}: ${m.content}`).join("\n"),
      "最新需求：" + (input.requirementText ?? ""),
    ].join("\n");
    const raw = await this.chatJson(SYSTEM_PROMPT, userPrompt);
    const parsed = ClassifyIntentResultSchema.safeParse(normalizeClarifyOutput(raw));
    if (!parsed.success) {
      // 安全回退：无法理解时当作提问，绝不触碰构建路径。
      return {
        intent: "QUESTION",
        requestedDomains: ["kingclient"],
        reply: "（DeepSeek 模型输出未通过校验，已按提问处理）",
      };
    }
    return parsed.data;
  }

  async createDesignPlan(input: ModelPortContext, opts?: { revising?: boolean }): Promise<DesignPlan> {
    const revising = opts?.revising === true;
    const recentConversation = input.recentMessages
      .slice(-20)
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n");
    const lines = [
      "设计遵循系统提示中的《KF 设计原则（KF_DESIGN_PRINCIPLES_FULL）》章节：布局有主次、避免模板脸（不要白底等大按钮堆叠）、一个记忆点、控件文案具体可读。",
      "为一个 KF 客户端工程生成设计计划（不是页面控件，是设计意图）。输出 JSON 对象，所有字段必须齐全：",
      "schema：固定字面量 \"kf-design-plan/v1\"（必须原样，不得改写）；displayName：工程显示名；summary：一句话摘要（≤80 字）；",
      "layoutConcept：布局概念（≤400 字符，含一行 ASCII 线框即可，简短）；styleDirection：风格方向（配色/基调）；",
      "sections：页面分区数组（1-8 区；每区必须是对象，含 id、label（区名，如 \"中部趋势区\"）、controls 数组（≤12 个占位，每个必须含 type，type 用枚举：text/button/inputnumber/switch/checkbox/radio/select/image/tabs/table/richtext/spacer））；",
      "signature：本方案最特别的 1 个设计决策。所有字段值必须是字符串或数组，禁止省略字段，禁止用 null 占位。",
      "signature：本方案最特别的 1 个设计决策。",
      "最近会话上下文：",
      recentConversation.length > 0 ? recentConversation : "（无）",
    ];
    if (revising) {
      lines.push(
        "客户修改意见：" + (input.requirementText ?? ""),
        "上一版设计计划：" + JSON.stringify(input.designPlan ?? "（无）"),
        "在上一版基础上修订，不要重来；把改动体现在设计计划中。",
      );
    } else {
      lines.push("需求：" + (input.requirementText ?? ""));
    }
    const raw = await this.chatJson(SYSTEM_PROMPT, lines.join("\n"));
    const parsed = DesignPlanSchema.safeParse(raw);
    if (!parsed.success) {
      throw new DeepSeekModelOutputError(
        `design plan failed zod gate: ${parsed.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ")}`,
      );
    }
    return parsed.data;
  }

  async createProjectDesign(input: ModelPortContext): Promise<ProjectDesign> {
    const userPrompt = [
      "为一个全新的 KF 客户端工程生成初始设计。输出 JSON：",
      '{"displayName":"工程显示名","summary":"一句话设计说明"}',
      "需求：" + (input.requirementText ?? ""),
    ].join("\n");
    const raw = await this.chatJson(SYSTEM_PROMPT, userPrompt);
    const record = raw as Record<string, unknown>;
    const displayName =
      typeof record["displayName"] === "string" && record["displayName"].length > 0
        ? record["displayName"]
        : "KF 客户端工程";
    return {
      schema: "kf-solution-ir/v1",
      solutionId: solutionId(`sol-${input.workspaceId}`),
      displayName,
      projects: [],
      dependencies: [],
      pendingRequirements: [],
    };
  }

  /** 构造 create/revise 共用的计划生成 prompt。 */
  private buildPlanPrompt(input: ModelPortContext, revising: boolean): string {
    const entities = input.editableEntities ?? [];
    const entityLines = entities.map((e) => `${e.name} | type=${e.type} | guid=${e.guid}`);
    return [
      revising
        ? "用户要求修改计划。请基于修订意见输出新的变更计划 JSON。"
        : "请根据需求输出变更计划 JSON。",
      "变更计划 JSON 格式（严格）：",
      '{"operations":[{"op":"update","entityId":"<清单中的 GUID>","entityType":"control","changes":[{"path":"/text","value":"..."}]}]}',
      "create（新增控件）格式：{\"op\":\"create\",\"entityType\":\"control\",\"entityId\":\"新语义id如NewTitle\",\"properties\":{\"pageId\":\"<清单中的页面GUID>\",\"type\":\"text|button|inputnumber|switch|checkbox|radio|select|image|tabs|table|richtext|spacer\",\"text\":\"控件文本\",\"x\":60,\"y\":50,\"width\":300,\"height\":40}}",
      "delete 格式：{\"op\":\"delete\",\"entityId\":\"<清单中的 GUID>\",\"entityType\":\"control\",\"destructiveConfirmed\":true}",
      "规则：update/delete 的 entityId 必须来自下方实体清单的 GUID；create 的 entityId 是新的语义 id，entityType 固定为 control，控件类型放在 properties.type，properties.pageId 必须是清单中页面的 GUID。",
      "update 的 changes[].path 只能使用受控字段：text、value、visible、disabled、backgroundColor、width、height、x、y、fontInfo（字体大小写在 fontInfo.fontSize，不要单独用 /fontSize 路径）、borderColor、layoutStyle、options/radioData/selectData 等控件自身字段；禁止使用未列出的路径（如 /fontSize、/custom）。",
      "",
      "当前工程摘要：" + (input.revisionSummary ?? "（无）"),
      "",
      "可修改实体清单（name | type | guid）：",
      entityLines.length > 0 ? entityLines.join("\n") : "（无——只能 create 新控件或说明）",
      "",
      ...(input.designPlan !== undefined
        ? [
            "",
            "客户已确认的设计计划（必须据此落实为控件，每个分区 → 相应控件；新建场景用 create，修改场景用 update/delete）：",
            JSON.stringify(input.designPlan, null, 1),
          ]
        : []),
      "用户最新需求：" + (input.requirementText ?? ""),
    ].join("\n");
  }

  /** 校验并组装 ChangePlan；非法 GUID 的操作被拒绝（防止幻觉实体进入构建）。 */
  private assemblePlan(input: ModelPortContext, raw: unknown, revising: boolean): ChangePlan {
    const record = raw as Record<string, unknown>;
    const operations = Array.isArray(record["operations"]) ? record["operations"] : [];
    const known = knownGuidSet(input.editableEntities);
    const pageGuids = new Set(
      (input.editableEntities ?? [])
        .filter((entity) => entity.kind === "page")
        .map((entity) => entity.guid),
    );
    const filtered = operations.filter((op) => {
      const record = op as Record<string, unknown>;
      const entityId = record["entityId"];
      const opKind = record["op"];
      if (typeof entityId !== "string") return false;
      if (opKind === "create") {
        // create 的 entityId 是新的语义 id；pageId 必须命中清单中的页面 GUID。
        const pageId = (record["properties"] as Record<string, unknown> | undefined)?.["pageId"];
        return typeof pageId === "string" && pageGuids.has(pageId);
      }
      return known.has(entityId);
    });
    const plan: unknown = {
      schema: "kf-change-plan/v1",
      workspaceId: input.workspaceId,
      operations: filtered,
    };
    const parsed = changePlanSchema.safeParse(plan);
    if (!parsed.success) {
      throw new DeepSeekModelOutputError(
        `plan failed zod gate: ${parsed.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ")}`,
      );
    }
    if (revising && parsed.data.operations.length === 0) {
      throw new DeepSeekModelOutputError("revised plan has no valid operations");
    }
    return parsed.data;
  }

  async createChangePlan(input: ModelPortContext): Promise<ChangePlan> {
    const raw = await this.chatJson(SYSTEM_PROMPT, this.buildPlanPrompt(input, false));
    return this.assemblePlan(input, raw, false);
  }

  async reviseChangePlan(input: ModelPortContext): Promise<ChangePlan> {
    const raw = await this.chatJson(SYSTEM_PROMPT, this.buildPlanPrompt(input, true));
    return this.assemblePlan(input, raw, true);
  }

  async explainValidation(input: {
    tenantId: string;
    report: ValidationReport;
  }): Promise<string> {
    const userPrompt = [
      "用中文简短解释这份 KF 客户端工程校验报告（给用户看，两三句话）：",
      JSON.stringify(input.report, null, 2),
    ].join("\n");
    const raw = await this.chatJson(SYSTEM_PROMPT, userPrompt);
    const record = raw as Record<string, unknown>;
    if (typeof record["explanation"] === "string") {
      return record["explanation"];
    }
    return "（DeepSeek 模型未能生成校验解释）";
  }
}
