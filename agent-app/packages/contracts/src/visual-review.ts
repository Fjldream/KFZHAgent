// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { z } from "zod";
import { VisualPlanningContextSchema } from "./generation-snapshot.js";
// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { FrozenVisualModelRouteSchema } from "./visual-execution.js";
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
export { VisualReviewRevisionSchema, type VisualReviewRevision } from "./visual-review-revision.js";
// end
// end

const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const receipt = z.string().regex(/^vref1:[a-f0-9]{64}:[a-f0-9]{64}$/);

/** Server freezes these facts before asking for user choices; no invented acknowledgement. */
export const VisualReviewContentSchema = z.object({
  schema: z.literal("kf-visual-review/v1"),
  tenantId: identifier, workspaceId: identifier, conversationId: identifier, runId: identifier, baseRevisionId: identifier,
  configHash: hash, knowledgeHash: hash, analysisModelConfigHash: hash, derivativeHash: hash,
  targetRuntimeVersion: z.literal("3.6"),
  /** Optional only for old internal reviews; new committed pauses always bind their releasing lease. */
  execution: z.object({ ownerId: z.string().min(1).max(200), fence: z.number().int().positive() }).strict().optional(),
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  revision: z.object({ requestId: z.string().uuid(), previousReviewHash: hash, actorUserId: identifier }).strict().optional(),
  // end
  reference: VisualPlanningContextSchema.omit({ acceptedDifferences: true }),
}).strict();
export const VisualReviewSchema = z.object({ content: VisualReviewContentSchema, reviewHash: hash, receipt }).strict();
export type VisualReview = z.infer<typeof VisualReviewSchema>;
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
/** Browser projection only: no model route, worker identity or server continuation proof. */
export const VisualReviewDisplaySchema = z.object({
  schemaVersion: z.literal(1), runId: identifier, workspaceId: identifier, conversationId: identifier,
  receipt, reference: VisualPlanningContextSchema.omit({ acceptedDifferences: true }),
}).strict();
export type VisualReviewDisplay = z.infer<typeof VisualReviewDisplaySchema>;
// end

// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
export { VisualReviewAcceptanceSchema, type VisualReviewAcceptance } from "./visual-acceptance.js";
// end

/** Staged image-message protocol; default/public rollout stays closed until confirmation flow is complete. */
export const VISUAL_RUN_PLAN_VERSION = "run-plan@7";

/** Server-only integrity envelope. A hash is not user consent or execution authority. */
export const AcceptedVisualPlanningInputSchema = z.object({
  schema: z.literal("kf-accepted-visual-planning/v1"),
  reviewHash: hash,
  confirmationHash: hash,
  reference: VisualPlanningContextSchema,
}).strict();
export type AcceptedVisualPlanningInput = z.infer<typeof AcceptedVisualPlanningInputSchema>;
// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
/** Server-only continuation proof, never a public RunAction, model-send permit or blueprint approval. */
export const FrozenVisualBlueprintModelSchema = z.object({
  route: FrozenVisualModelRouteSchema.extend({ supportsVision: z.boolean() }),
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  promptVersion: z.literal("visual-blueprint@14"), repairPolicy: z.enum(["none", "once"]), configHash: hash,
  // end
  // end
  // end
  // end
  // end
  // end
}).strict();
export const VisualContinuationContentSchema = z.object({
  schema: z.literal("kf-visual-continuation/v1"),
  tenantId: identifier, workspaceId: identifier, conversationId: identifier,
  runId: identifier, sourceRunId: identifier, requestedByUserId: identifier, baseRevisionId: identifier,
  mode: z.literal("build"), configHash: hash, actionHash: hash, requestHash: z.string().min(1),
  sourceAdmissionHash: hash, sourceReviewHash: hash,
  acceptedAt: z.string().datetime(), accepted: AcceptedVisualPlanningInputSchema,
  /** Optional for old internal proofs only; a planning call MUST require it. */
  blueprintModel: FrozenVisualBlueprintModelSchema.optional(),
}).strict();
export const VisualContinuationSnapshotSchema = z.object({
  content: VisualContinuationContentSchema, inputHash: hash,
  receipt: z.string().regex(/^vcont1:[a-f0-9]{64}:[a-f0-9]{64}$/),
}).strict();
export type VisualContinuationSnapshot = z.infer<typeof VisualContinuationSnapshotSchema>;
export const VisualContinuationInputSnapshotSchema = z.object({
  attachmentIds: z.array(z.string().uuid()).length(1), baseRevisionPolicy: z.literal("fixed"),
  visualContinuation: VisualContinuationSnapshotSchema,
}).strict();
// end
// end
