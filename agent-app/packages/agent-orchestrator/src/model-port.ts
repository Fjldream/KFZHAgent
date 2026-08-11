import type {
  ChangePlan,
  DesignPlan,
  UIImplementationSpec,
  ValidationReport,
} from "@kf/contracts";
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
  /** Previous internal UI implementation when revising a built preview. */
  uiImplementation?: UIImplementationSpec | undefined;
  /** Bounded deterministic gate failures supplied for a single repair attempt. */
  implementationRejectionReasons?: string[] | undefined;
  /**
   * Model-editable entities of the current revision (controls/pages with their
   * KF GUIDs). A real LLM must reference these exact GUIDs in change plans —
   * hallucinated ids are rejected by the ModelPort before the graph gate.
   */
  editableEntities?: EditableEntity[] | undefined;
}

/**
 * Model abstraction for bounded classification, customer blueprint planning,
 * internal UI implementation planning, and validation explanation. Legacy
 * direct ChangePlan methods remain for non-blueprint compatibility paths;
 * confirmed blueprints use create/reviseUiImplementation and the deterministic
 * domain compiler. Tests inject a FakeModelPort; production wires a real LLM
 * or explicit stub at the API boundary.
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
  /** Convert a confirmed customer blueprint into bounded internal UI intent. */
  createUiImplementation(input: ModelPortContext): Promise<UIImplementationSpec>;
  /** Revise internal UI intent without exposing or directly authoring KF JSON. */
  reviseUiImplementation(input: ModelPortContext): Promise<UIImplementationSpec>;
  explainValidation(input: { tenantId: string; report: ValidationReport }): Promise<string>;
}

export type { ClassifyIntentResult, Intent };
