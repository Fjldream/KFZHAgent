// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { z } from "zod";
// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { VisualAcceptedDifferencesSchema } from "./visual-acceptance.js";
// end
import { ApprovedAssetFactsSchema } from "./asset.js";
import { CreativeBuildArtifactSchema, TrustedNativeMaterializationSchema, validateCreativeArtifactMaterializationProjection } from "./creative-build-artifact.js";
import { VisualReferenceSpecSchema } from "./visual-reference.js";
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import { VisualWorkspaceDataSnapshotSchema } from "./visual-reference.js";
// end
import { SolutionImplementationPlanSchema } from "./solution-implementation-plan.js";
// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { validateVisualBlueprintNativeSources } from "./visual-blueprint-sources.js";
// end
const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);

export const VisualRegionMappingSchema = z.object({
  regionId: identifier, controlType: identifier.nullable(), capabilityId: identifier.nullable(),
  support: z.enum(["verified", "supported_unverified", "unsupported"]),
  reason: z.string().min(1).max(4000), evidenceIds: z.array(identifier).max(100), fallback: z.string().max(2000).nullable(),
}).strict().refine(mapping => mapping.support === "unsupported"
  ? mapping.capabilityId === null && mapping.controlType === null
  : mapping.capabilityId !== null && mapping.controlType === mapping.capabilityId, "VISUAL_MAPPING_IDENTITY_INVALID");

export const SourceMapEntrySchema = z.object({
  regionId: identifier, componentId: z.string().min(1).max(100),
  nativeIds: z.array(z.string().min(1).max(128)).min(1).max(5000),
}).strict();
export type SourceMapEntry = z.infer<typeof SourceMapEntrySchema>;

export const VisualGenerationReferenceSchema = z.object({
  schemaVersion: z.literal(1), analysisId: identifier, specHash: hash, spec: VisualReferenceSpecSchema,
  mappings: z.array(VisualRegionMappingSchema).max(100),
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  dataSnapshots: z.array(VisualWorkspaceDataSnapshotSchema).min(1).max(100).optional(),
  // end
  bindings: z.array(z.object({ regionId: identifier, componentId: z.string().min(1).max(100) }).strict()).max(5000),
  // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
  acceptedDifferences: VisualAcceptedDifferencesSchema,
  // end
}).strict();
export type VisualGenerationReference = z.infer<typeof VisualGenerationReferenceSchema>;

/** Reviewed input is server-owned; model output may only bind region IDs to semantic nodes. */
export const VisualPlanningContextSchema = VisualGenerationReferenceSchema.omit({ bindings: true });
export type VisualPlanningContext = z.infer<typeof VisualPlanningContextSchema>;
export const VisualSemanticBindingSchema = z.object({ regionId: identifier,
  nodeId: z.string().min(1).max(100).regex(/^[A-Za-z][A-Za-z0-9_-]*$/),
}).strict();
export const VisualSemanticPlanSchema = z.object({ schema: z.literal("kf-visual-semantic-plan/v1"),
  plan: SolutionImplementationPlanSchema, bindings: z.array(VisualSemanticBindingSchema).max(5000),
}).strict();
export type VisualSemanticPlan = z.infer<typeof VisualSemanticPlanSchema>;
export type VisualSemanticBinding = z.infer<typeof VisualSemanticBindingSchema>;

/** Reuse the exact signed compiler artifact's typed semantic inputs, not unknown JSON drafts. */
export const GenerationSnapshotContentSchema = z.object({
  schema: z.literal("kf-generation-snapshot/v1"), artifact: CreativeBuildArtifactSchema,
  materialization: TrustedNativeMaterializationSchema,
  assetManifest: z.array(ApprovedAssetFactsSchema).max(64),
  visual: VisualGenerationReferenceSchema.nullable(), sourceMap: z.array(SourceMapEntrySchema).max(5000),
}).strict().superRefine((content, context) => {
  try { validateCreativeArtifactMaterializationProjection(content.artifact, content.materialization); }
  catch { context.addIssue({ code: "custom", message: "GENERATION_MATERIALIZATION_MISMATCH" }); }
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  if (content.visual !== null) {
    try { validateVisualBlueprintNativeSources({ blueprint: content.artifact.blueprint, visual: content.visual,
      implementation: content.artifact.implementation, sourceMap: content.sourceMap }); }
    catch { context.addIssue({ code: "custom", message: "VISUAL_BLUEPRINT_NATIVE_SOURCE_MISMATCH" }); }
  }
  // end
});
export type GenerationSnapshotContent = z.infer<typeof GenerationSnapshotContentSchema>;
// end
