// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { z } from "zod";
import { CustomerSolutionBlueprintSchema } from "./solution-blueprint.js";
import { AcceptedVisualPlanningInputSchema } from "./visual-review.js";
import { FrozenVisualModelRouteSchema } from "./visual-execution.js";

const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const scope = { tenantId: identifier, workspaceId: identifier, conversationId: identifier, runId: identifier,
  requestedByUserId: identifier, baseRevisionId: identifier, configHash: hash };
export const VisualBlueprintReviewContentSchema = z.object({
  schema: z.literal("kf-visual-blueprint-review/v1"), ...scope,
  sourceContinuationHash: hash, visualConfirmationHash: hash,
  blueprint: CustomerSolutionBlueprintSchema, revision: z.number().int().positive(), designPlanHash: hash,
  blueprintReceipt: z.string().min(1).max(4000), messageId: identifier,
  execution: z.object({ ownerId: z.string().min(1).max(200), fence: z.number().int().positive() }).strict(),
}).strict();
export const VisualBlueprintReviewSchema = z.object({ content: VisualBlueprintReviewContentSchema, inputHash: hash,
  receipt: z.string().regex(/^vbpr1:[a-f0-9]{64}:[a-f0-9]{64}$/) }).strict();
export type VisualBlueprintReview = z.infer<typeof VisualBlueprintReviewSchema>;

/** Internal inheritance only. Does not grant model egress, native approval or permission to enqueue a build. */
export const FrozenVisualSemanticModelSchema = z.object({
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  route: FrozenVisualModelRouteSchema.extend({ supportsVision: z.boolean() }), promptVersion: z.literal("visual-semantic@24"),
  // end
  // end
  // end
  // end
  // end
  // end
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  repairPolicy: z.enum(["none", "once"]), configHash: hash,
  // end
}).strict();
export const VisualEngineeringContinuationContentSchema = z.object({
  schema: z.literal("kf-visual-engineering-continuation/v1"), purpose: z.literal("semantic-planning"), ...scope,
  sourceRunId: identifier, sourceContinuationHash: hash, actionHash: hash, requestHash: z.string().min(1),
  acceptedAt: z.string().datetime(), accepted: AcceptedVisualPlanningInputSchema, blueprintReview: VisualBlueprintReviewSchema,
  /** Old internal proofs remain readable, but are not executable without a frozen task configuration. */
  semanticModel: FrozenVisualSemanticModelSchema.optional(),
}).strict();
export const VisualEngineeringContinuationSchema = z.object({ content: VisualEngineeringContinuationContentSchema, inputHash: hash,
  receipt: z.string().regex(/^veng1:[a-f0-9]{64}:[a-f0-9]{64}$/) }).strict();
export type VisualEngineeringContinuation = z.infer<typeof VisualEngineeringContinuationSchema>;
export const VisualEngineeringInputSnapshotSchema = z.object({
  attachmentIds: z.array(z.string().uuid()).length(1), baseRevisionPolicy: z.literal("fixed"),
  visualEngineering: VisualEngineeringContinuationSchema,
}).strict();
// end
