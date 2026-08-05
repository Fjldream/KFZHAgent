import { z } from "zod";

/**
 * The seven intents the model can classify a user turn into (brief Step 4).
 * Deterministic routing switches exclusively on these values; the graph never
 * guesses a route. Unsupported-domain requests keep a supported intent
 * (NEW_REQUIREMENT / MODIFY_REQUIREMENT) but are diverted to pendingRequirements
 * by the classify node when no requested domain is supported.
 */
export const IntentSchema = z.enum([
  "QUESTION",
  "NEW_REQUIREMENT",
  "MODIFY_REQUIREMENT",
  "CONFIRM_PLAN",
  "CANCEL_PLAN",
  "ROLLBACK",
  "BUILD",
]);
export type Intent = z.infer<typeof IntentSchema>;

export const intentValues = IntentSchema.options;
