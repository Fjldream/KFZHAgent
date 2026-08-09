import type { ChangePlan, DesignPlan, ValidationReport } from "@kf/contracts";
import type { ClassifyIntentResult, Intent } from "./schemas/intent.js";
import type { ProjectDesign } from "./schemas/project-design.js";
import type { GraphMessage } from "./state.js";
import type { EditableEntity } from "./ports.js";

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
  /** Previous design plan when revising (REVISE_DESIGN / design iteration). */
  designPlan?: DesignPlan | undefined;
  /**
   * Model-editable entities of the current revision (controls/pages with their
   * KF GUIDs). A real LLM must reference these exact GUIDs in change plans —
   * hallucinated ids are rejected by the ModelPort before the graph gate.
   */
  editableEntities?: EditableEntity[] | undefined;
}

/**
 * Model abstraction (brief Step 1). The five methods mirror the brief exactly:
 * classifyIntent / createProjectDesign / createChangePlan / reviseChangePlan /
 * explainValidation. Tests inject a FakeModelPort; the production implementation
 * is wired in Task 11 (real LLM or stub).
 *
 * `ClassifyIntentResult` is defined (and zod-gated at runtime) in
 * schemas/intent.ts — re-exported here so ModelPort implementers keep a single
 * source of truth for the shape the graph will validate (I1).
 */
export interface ModelPort {
  classifyIntent(input: ModelPortContext): Promise<ClassifyIntentResult>;
  createProjectDesign(input: ModelPortContext): Promise<ProjectDesign>;
  createChangePlan(input: ModelPortContext): Promise<ChangePlan>;
  reviseChangePlan(input: ModelPortContext): Promise<ChangePlan>;
  /** Plan the initial page design from a requirement; `revising` switches the
   * prompt toward amending the current revision rather than starting fresh. */
  createDesignPlan(
    input: ModelPortContext,
    opts?: { revising?: boolean; rejectionReasons?: string[] },
  ): Promise<DesignPlan>;
  explainValidation(input: { tenantId: string; report: ValidationReport }): Promise<string>;
}

export type { ClassifyIntentResult, Intent };
