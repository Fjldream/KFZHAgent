import { z } from "zod";

/**
 * The intents the model can classify a user turn into (brief Step 4).
 * Deterministic routing switches exclusively on these values; the graph never
 * guesses a route. Unsupported-domain requests keep a supported intent
 * (NEW_REQUIREMENT / MODIFY_REQUIREMENT) but are diverted to pendingRequirements
 * by the classify node when no requested domain is supported. CLARIFY means the
 * model needs more information before it can pick a route. CONFIRM_DESIGN and
 * REVISE_DESIGN drive the design-plan loop (design-review): the user confirms
 * the presented design plan (→ plan-change) or asks for a revision (→ design-plan
 * again with revising=true). CONFIRM_BUILD lands the preview-review loop
 * (Task 9): after the build enqueues and a preview is available, confirming the
 * result routes to the terminal `done` stage; REVISE_DESIGN / MODIFY_REQUIREMENT
 * in the preview-review stage loop back to design-plan / plan-change.
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
