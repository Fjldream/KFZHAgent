// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
// Browser-safe input contract: never import signing, materialization or Node-only runtime helpers here.
import { z } from "zod";
import { VisualRegionSchema } from "./visual-reference.js";
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
export { VisualReferenceSpecSchema } from "./visual-reference.js";
// end

const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const receipt = z.string().regex(/^vref1:[a-f0-9]{64}:[a-f0-9]{64}$/);
const editableRegion = VisualRegionSchema.pick({ role: true, box: true, text: true }).strict();

/** Bounded user corrections only; new region identity and provenance are assigned by the server. */
export const VisualReviewRevisionSchema = z.object({
  clientRequestId: z.string().uuid(), receipt, analysisId: identifier, analysisHash: hash,
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  regions: z.array(editableRegion.extend({ regionId: identifier, parentId: VisualRegionSchema.shape.parentId.optional(),
    clarifications: VisualRegionSchema.shape.clarifications,
    interactionRequirement: VisualRegionSchema.shape.interactionRequirement.unwrap().nullable().optional(),
    dataRequirement: VisualRegionSchema.shape.dataRequirement.unwrap().nullable().optional() }).strict()).max(100),
  // end
  additions: z.array(editableRegion).min(1).max(100).optional(),
  removals: z.array(VisualRegionSchema.shape.id).min(1).max(100).optional(),
}).strict().superRefine((input, context) => {
  const count = input.regions.length + (input.additions?.length ?? 0) + (input.removals?.length ?? 0);
  if (count < 1 || count > 100) context.addIssue({ code: "custom", message: "VISUAL_REVIEW_OPERATION_LIMIT" });
  const existingIds = [...input.regions.map(region => region.regionId), ...(input.removals ?? [])];
  if (new Set(existingIds).size !== existingIds.length) context.addIssue({ code: "custom", message: "VISUAL_REVIEW_OPERATION_CONFLICT" });
}).refine(input => new TextEncoder().encode(JSON.stringify(input)).byteLength <= 65_536, "VISUAL_REVIEW_REVISION_TOO_LARGE");
export type VisualReviewRevision = z.infer<typeof VisualReviewRevisionSchema>;
// end
