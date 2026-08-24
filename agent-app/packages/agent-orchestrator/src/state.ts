import { z } from "zod";
import {
  CapabilityReportSchema,
  CapabilityCandidateBundleSchema,
  AcceptedBlueprintArtifactSchema,
  ModuleCompilationArtifactSchema,
  ModuleDeliveryReportSchema,
  ModuleDeliveryOwnerMappingsSchema,
  ModulePlanSchema,
  pendingRequirementSchema,
  DesignPlanSchema,
  UIImplementationSpecSchema,
  SolutionImplementationPlanSchema,
  type DesignPlan,
} from "@kf/contracts";
import { StateSchema } from "@langchain/langgraph";
import { IntentSchema } from "./schemas/intent.js";

/**
 * A single persisted conversation message, bounded by role + content. Never
 * carries raw uploaded files, secrets, full page JSON, or untrusted script
 * text (brief Step 6).
 */
export const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});
export type GraphMessage = z.infer<typeof MessageSchema>;

/**
 * Workflow stage the graph is in. `approval` is the interrupt point where the
 * graph waits for the user to approve/revise/cancel the pending change plan.
 * The design-flow stages (`clarifying` … `done`) are appended on top of the
 * legacy values so existing routing keeps working.
 */
export const StageSchema = z.enum([
  "idle",
  "planning",
  "approval",
  "building",
  "clarifying",
  "design-review",
  "design-planning",
  "implementation-planning",
  "preview-review",
  "solution-plan-ready",
  "done",
]);
export type Stage = z.infer<typeof StageSchema>;

/**
 * Structured interrupt payload (brief Step 5). Field names and meaning are
 * verbatim from the brief: type, changeRequestId, planHash, summary,
 * diffArtifactId, previewArtifactId.
 */
export const ApprovalInterruptSchema = z.object({
  type: z.literal("plan-approval"),
  changeRequestId: z.string(),
  planHash: z.string(),
  summary: z.string(),
  diffArtifactId: z.string().optional(),
  previewArtifactId: z.string().optional(),
});
export type ApprovalInterrupt = z.infer<typeof ApprovalInterruptSchema>;

/**
 * Resume payload the API layer sends back through `Command({ resume })`.
 * Requires an action of approve/revise/cancel and the exact planHash the user
 * was shown; any mismatch fails the resume without side effects.
 */
export const ApprovalResumeSchema = z.object({
  action: z.enum(["approve", "revise", "cancel"]),
  planHash: z.string(),
});
export type ApprovalResume = z.infer<typeof ApprovalResumeSchema>;

/**
 * Single-agent solution workflow state (brief Step 1, verbatim fields plus the
 * supporting context channels documented below).
 *
 * Verbatim from the brief:
 *   tenantId, userId, workspaceId, conversationId, currentRevisionId,
 *   activeChangeRequestId, changePlanId, planHash, buildJobId, intent, stage,
 *   recentMessages, conversationSummary, lastErrorCode.
 *
 * Supporting channels (bounded context per brief Step 6):
 *   revisionSummary      — bounded summary of the current revision (never the
 *                          full page JSON / project IR).
 *   planSummary          — bounded human-readable plan summary for the
 *                          approval interrupt.
 *   diffArtifactId       — artifact holding the plan diff (undefined when the
 *                          production artifact pipeline is not wired yet).
 *   previewArtifactId    — artifact holding the rendered preview.
 *   pendingRequirements  — requests for unsupported domains; they never reach
 *                          the build queue (brief Step 4).
 */
export const AgentGraphState = new StateSchema({
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  workspaceId: z.string().min(1),
  conversationId: z.string().min(1),
  currentRevisionId: z.string().optional(),
  workspaceMode: z.enum(["new", "upload"]).optional(),
  generationWorkflow: z.enum(["legacy", "module-v1", "creative-v2"]).optional(),
  activeChangeRequestId: z.string().optional(),
  changePlanId: z.string().optional(),
  planHash: z.string().optional(),
  buildJobId: z.string().optional(),
  intent: IntentSchema.optional(),
  /**
   * How many clarifying turns have been spent on the current request (max 5;
   * the classify node refuses to keep asking past the cap).
   */
  clarificationCount: z.number().int().min(0).max(5).optional(),
  /**
   * The clarifying question the model asked before it can route the turn.
   * Carried from classify-intent to the clarify node, which persists it as an
   * assistant message and then clears it.
   */
  clarifyingQuestion: z
    .object({
      question: z.string().min(1),
      options: z.array(z.string()).max(5).optional(),
    })
    .optional(),
  /** Short model reply for the current turn (fallback channel). */
  reply: z.string().optional(),
  /** True once the client confirmed the built preview (stage=done, landing). */
  buildConfirmed: z.boolean().optional(),
  /**
   * The design plan produced during design-planning (brief Task 3 contract).
   * `revising` marks an in-progress revision of this plan (used by Task 6).
   */
  designPlan: DesignPlanSchema.optional(),
  designPlanHash: z.string().optional(),
  designRevision: z.number().int().min(0).optional(),
  revising: z.boolean().optional(),
  /** Internal, model-authored implementation intent validated before deterministic compilation. */
  uiImplementation: UIImplementationSpecSchema.optional(),
  uiImplementationHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  /** Server-signed module artifacts are persisted as JSON; runtime brands are reconstructed after every checkpoint read. */
  acceptedBlueprintArtifact: AcceptedBlueprintArtifactSchema.optional(),
  modulePlan: ModulePlanSchema.optional(),
  modulePlanHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  moduleCompilationArtifact: ModuleCompilationArtifactSchema.optional(),
  moduleDeliveryReport: ModuleDeliveryReportSchema.optional(),
  moduleDeliveryOwnerMappings: ModuleDeliveryOwnerMappingsSchema.optional(),
  moduleRepairAttempt: z.number().int().min(0).max(3).optional(),
  /** Deterministic retrieval output bound to the exact canonical v3 blueprint. */
  capabilityCandidates: CapabilityCandidateBundleSchema.optional(),
  capabilityCandidatesHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  /** Semantic-only creative plan. Phase 2 stops before compilation/build. */
  solutionImplementationPlan: SolutionImplementationPlanSchema.optional(),
  solutionImplementationPlanHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  solutionPlanRepairAttempt: z.number().int().min(0).max(1).optional(),
  /** Server-routed proof of why the current ChangePlan may enter the build queue. */
  buildAuthorization: z.enum([
    "confirmed-blueprint",
    "preview-feedback",
    "legacy-plan-approval",
    "creative-solution",
  ]).optional(),
  capabilityReport: CapabilityReportSchema.optional(),
  stage: StageSchema,
  recentMessages: z.array(MessageSchema),
  conversationSummary: z.string().optional(),
  lastErrorCode: z.string().optional(),
  revisionSummary: z.string().optional(),
  planSummary: z.string().optional(),
  diffArtifactId: z.string().optional(),
  previewArtifactId: z.string().optional(),
  pendingRequirements: z.array(pendingRequirementSchema).optional(),
  /** Resume routing decision written by the approval node (internal). */
  resumeAction: z.enum(["approve", "revise", "cancel"]).optional(),
});

export type AgentGraphStateValue = typeof AgentGraphState.State;
export type AgentGraphUpdate = typeof AgentGraphState.Update;

/**
 * The design plan carried on `AgentGraphState.designPlan` (brief Task 3
 * contract). Re-exported for node implementers — Task 6's compile step reads
 * this field to build the ClientProjectIR/ControlIR.
 */
export type DesignPlanField = DesignPlan;
