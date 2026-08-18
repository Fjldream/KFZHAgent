import type {
  AssetRecord,
  CapabilityCandidateBundle,
  ChangePlan,
  CustomerEffectBlueprint,
  CustomerSolutionBlueprint,
  DesignPlan,
  ModulePlan,
  SolutionImplementationPlan,
  UIImplementationSpec,
  ValidationReport,
} from "@kf/contracts";
import type { VerifiedAcceptedBlueprintArtifact } from "@kf/build-jobs";
import type { ModulePlanningSummary } from "@kf/domain-client";
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
  /** Server-owned bounded route discriminator; creative-v2 is the only v3 prompt path. */
  generationWorkflow?: "legacy" | "module-v1" | "creative-v2" | undefined;
  recentMessages: GraphMessage[];
  conversationSummary?: string | undefined;
  revisionSummary?: string | undefined;
  currentRevisionId?: string | undefined;
  /** Server-owned project binding for accepted-blueprint/module-plan artifacts. */
  currentProjectKey?: string | undefined;
  /** The user's latest turn, used as the requirement text for planning. */
  requirementText?: string | undefined;
  /** Previous design plan when revising (REVISE_DESIGN / design iteration). */
  designPlan?: DesignPlan | undefined;
  /** Previous internal UI implementation when revising a built preview. */
  uiImplementation?: UIImplementationSpec | undefined;
  /** Customer-confirmed v2 blueprint. It is usable for module planning only when hash-bound to acceptedBlueprintArtifact. */
  confirmedBlueprint?: CustomerEffectBlueprint | undefined;
  /** Server-verified, opaque authority handle. Never substitute raw model claims for this artifact. */
  acceptedBlueprintArtifact?: VerifiedAcceptedBlueprintArtifact | undefined;
  /** Bounded production catalog supplied from ModuleRegistry.listForPlanning(); beta/unsupported never belong here. */
  modulePlanningCatalog?: readonly ModulePlanningSummary[] | undefined;
  /** Bounded server-owned asset metadata catalog. Model output may reference only these logical IDs. */
  assetCatalog?: readonly AssetRecord[] | undefined;
  /** Full prior plan for a revision. Omitted prior modules are rejected rather than treated as deletions. */
  previousModulePlan?: ModulePlan | undefined;
  /** Bounded deterministic delivery/compiler failures for a single module-plan repair attempt. */
  modulePlanRejectionReasons?: string[] | undefined;
  /** Bounded deterministic gate failures supplied for a single repair attempt. */
  implementationRejectionReasons?: string[] | undefined;
  /** Confirmed v3 customer semantics for the creative-v2 solution-planning path. */
  confirmedSolutionBlueprint?: CustomerSolutionBlueprint | undefined;
  /** Deterministically retrieved, hash-bound candidates; never model-authored. */
  capabilityCandidates?: CapabilityCandidateBundle | undefined;
  /** Schema-valid prior semantic plan supplied only to localize one repair. */
  previousSolutionImplementationPlan?: SolutionImplementationPlan | undefined;
  /** Bounded schema/reference issues supplied only to the localized repair call. */
  solutionPlanRejectionReasons?: string[] | undefined;
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
  /** Plan registered KF modules from confirmed server-authorized blueprint facts. */
  createModulePlan(input: ModelPortContext): Promise<ModulePlan>;
  /** Return a complete revision while retaining every unaffected prior module exactly. */
  reviseModulePlan(input: ModelPortContext): Promise<ModulePlan>;
  /** Production semantic planner; orchestration permits one primary call. */
  createSolutionImplementationPlan(
    input: ModelPortContext,
  ): Promise<SolutionImplementationPlan>;
  /** One localized semantic subtree repair; orchestration never loops this call. */
  reviseSolutionImplementationSubtree(
    input: ModelPortContext,
  ): Promise<SolutionImplementationPlan>;
  explainValidation(input: { tenantId: string; report: ValidationReport }): Promise<string>;
}

export type { ClassifyIntentResult, Intent };
