import { z } from "zod";

/**
 * The eight intents the model can classify a user turn into (brief Step 4).
 * Deterministic routing switches exclusively on these values; the graph never
 * guesses a route. Unsupported-domain requests keep a supported intent
 * (NEW_REQUIREMENT / MODIFY_REQUIREMENT) but are diverted to pendingRequirements
 * by the classify node when no requested domain is supported. CLARIFY means the
 * model needs more information before it can pick a route.
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
]);
export type Intent = z.infer<typeof IntentSchema>;

export const intentValues = IntentSchema.options;

/**
 * Runtime gate for `ModelPort.classifyIntent` output (I1). Mirrors the plan
 * gate in plan-change: a real LLM (Phase 3) can emit garbage and the graph
 * must reject it before any state side effect, never routing on an invented
 * intent value. Cross-validation via superRefine guards against fake
 * clarifications: intent=CLARIFY must carry a clarifyingQuestion, and a
 * clarifyingQuestion is only allowed when intent=CLARIFY.
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
