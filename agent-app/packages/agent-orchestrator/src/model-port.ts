import type { ChangePlan, ValidationReport } from "@kf/contracts";
import type { Intent } from "./schemas/intent.js";
import type { ProjectDesign } from "./schemas/project-design.js";
import type { GraphMessage } from "./state.js";

/**
 * Bounded, already-sandboxed context handed to the model port. It never
 * contains raw uploaded files, secrets, full page JSON, or untrusted script
 * text (brief Step 6): recentMessages are trimmed, the revision is represented
 * by a bounded summary, and secrets never enter graph state at all.
 */
export interface ModelPortContext {
  tenantId: string;
  userId: string;
  workspaceId: string;
  conversationId: string;
  recentMessages: GraphMessage[];
  conversationSummary?: string | undefined;
  revisionSummary?: string | undefined;
  currentRevisionId?: string | undefined;
  /** The user's latest turn, used as the requirement text for planning. */
  requirementText?: string | undefined;
}

/**
 * Result of intent classification. `requestedDomains` lists the domains the
 * user's request touches; when every requested domain is unsupported the graph
 * records pendingRequirements instead of planning or building.
 */
export interface ClassifyIntentResult {
  intent: Intent;
  requestedDomains: string[];
  /** Optional assistant reply for the QUESTION route. */
  reply?: string;
}

/**
 * Model abstraction (brief Step 1). The five methods mirror the brief exactly:
 * classifyIntent / createProjectDesign / createChangePlan / reviseChangePlan /
 * explainValidation. Tests inject a FakeModelPort; the production implementation
 * is wired in Task 11 (real LLM or stub).
 */
export interface ModelPort {
  classifyIntent(input: ModelPortContext): Promise<ClassifyIntentResult>;
  createProjectDesign(input: ModelPortContext): Promise<ProjectDesign>;
  createChangePlan(input: ModelPortContext): Promise<ChangePlan>;
  reviseChangePlan(input: ModelPortContext): Promise<ChangePlan>;
  explainValidation(input: { tenantId: string; report: ValidationReport }): Promise<string>;
}
