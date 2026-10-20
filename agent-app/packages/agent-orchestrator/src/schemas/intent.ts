import { z } from "zod";

/**
 * 模型可以将用户轮次分类为以下意图（简要步骤 4）。确定性路由只依据这些值进行切换；图绝不会猜测路由。不受支持的域请求仍保留受支持的意图（NEW_REQUIREMENT / MODIFY_REQUIREMENT），但当请求的域都不受支持时，classify 节点会将其转入 pendingRequirements。CLARIFY 表示模型需要更多信息才能选择路由。CONFIRM_DESIGN 和 REVISE_DESIGN 驱动 design-plan 循环（design-review）：用户可以确认展示的设计计划（→ plan-change），也可以要求修订（→ design-plan，并设置 revising=true）。CONFIRM_BUILD 对应 preview-review 循环（任务 9）：构建入队且预览可用后，确认结果会路由到终态 `done`；preview-review 阶段中的 REVISE_DESIGN / MODIFY_REQUIREMENT 会分别回到 design-plan / plan-change。
 */
export const IntentSchema = z.enum([
  "QUESTION",
  "NEW_REQUIREMENT",
  "MODIFY_REQUIREMENT",
  "CONFIRM_PLAN",
  "CANCEL_PLAN",
  "ROLLBACK",
  "BUILD",
  "CLARIFY",
  "CONFIRM_DESIGN",
  "REVISE_DESIGN",
  "CONFIRM_BUILD",
]);
export type Intent = z.infer<typeof IntentSchema>;

export const intentValues = IntentSchema.options;

/**
 * 针对 `ModelPort.classifyIntent` 输出的运行时校验关卡（I1）。它与 plan-change 中的方案校验关卡相对应：真实 LLM（阶段 3）可能输出无效内容，图必须在产生任何状态副作用之前将其拒绝，绝不能依据虚构的意图值进行路由。通过 superRefine 进行交叉校验，以防止虚假澄清：intent=CLARIFY 时必须携带 clarifyingQuestion，并且只有 intent=CLARIFY 时才允许出现 clarifyingQuestion。
 */
export const ClassifyIntentResultSchema = z
  .object({
    intent: IntentSchema,
    requestedDomains: z.array(z.string()),
    reply: z.string().optional(),
    needsClarification: z.boolean().optional(),
    clarifyingQuestion: z
      .object({
        question: z.string().min(1),
        options: z.array(z.string()).max(5).optional(),
      })
      .optional(),
  })
  .superRefine((val, ctx) => {
    if (val.intent === "CLARIFY" && !val.clarifyingQuestion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["clarifyingQuestion"],
        message: "CLARIFY requires clarifyingQuestion",
      });
    }
    if (val.intent !== "CLARIFY" && val.clarifyingQuestion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["clarifyingQuestion"],
        message: "clarifyingQuestion only allowed with CLARIFY",
      });
    }
  });
export type ClassifyIntentResult = z.infer<typeof ClassifyIntentResultSchema>;
