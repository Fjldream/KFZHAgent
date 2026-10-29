// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { z } from "zod";
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import { semanticImplementationTextIssue } from "./action-graph.js";
// A bounded semantic requirement, not native code, network authority or runtime verification.
export const VisualInteractionRequirementSchema = z.object({
  kind: z.literal("click-feedback"),
  message: z.string().trim().min(1).max(400).refine(value => semanticImplementationTextIssue(value, "semantic-text") === undefined,
    "implementation text is not allowed"),
  level: z.enum(["info", "success", "warning", "error"]),
}).strict();
// end

const visualId = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
/** Selection only; the server resolves the current scoped workspace. No caller-provided source/value. */
export const VisualDataRequirementSchema = z.object({ kind: z.literal("workspace-field"), field: z.literal("name") }).strict();
/** Server-frozen metadata snapshot, not a live datasource connection or user input contract. */
export const VisualWorkspaceDataSnapshotSchema = VisualDataRequirementSchema.extend({ regionId: visualId,
  value: z.string().min(1).max(200).refine(value => value.trim() === value && semanticImplementationTextIssue(value, "semantic-text") === undefined,
    "workspace field cannot be represented as safe literal text"),
}).strict();
// end
const color = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
const normalized = z.number().finite().min(0).max(1);
const box = z.object({ x: normalized, y: normalized, width: normalized.gt(0), height: normalized.gt(0) }).strict()
  .refine(value => value.x + value.width <= 1 && value.y + value.height <= 1, "VISUAL_BOX_OUTSIDE_IMAGE");
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
/** Unverified descriptive text only; never credentials, execution authority or a datasource binding. */
export const VisualClarificationsSchema = z.object({
  interaction: z.string().trim().min(1).max(1000).nullable(),
  dataSource: z.string().trim().min(1).max(1000).nullable(),
}).strict();
// end

export const VisualRegionSchema = z.object({
  id: visualId,
  parentId: visualId.nullable(),
  role: z.enum(["header", "sidebar", "content", "card", "table", "chart", "form", "image", "text", "action"]),
  box,
  text: z.array(z.string().max(2000)).max(20),
  confidence: normalized,
  interactionHint: z.string().max(1000).nullable(),
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  clarifications: VisualClarificationsSchema.optional(),
  interactionRequirement: VisualInteractionRequirementSchema.optional(),
  dataRequirement: VisualDataRequirementSchema.optional(),
  // end
}).strict();
export type VisualRegion = z.infer<typeof VisualRegionSchema>;

export const VisualReferenceSpecSchema = z.object({
  schemaVersion: z.literal(1),
  sourceAssetId: visualId,
  sourceHash: z.string().regex(/^[0-9a-f]{64}$/),
  viewport: z.object({ width: z.number().int().min(1).max(8192), height: z.number().int().min(1).max(8192) }).strict()
    .refine(value => value.width * value.height <= 32_000_000, "VISUAL_VIEWPORT_TOO_LARGE"),
  regions: z.array(VisualRegionSchema).min(1).max(100),
  designTokens: z.object({
    background: color, foreground: color, accent: color,
    spacing: z.array(z.number().finite().min(0).max(1024)).max(32),
    radius: z.array(z.number().finite().min(0).max(1024)).max(32),
  }).strict(),
  uncertainties: z.array(z.object({ regionId: visualId.nullable(), question: z.string().min(1).max(1000) }).strict()).max(100),
}).strict().superRefine((spec, context) => {
  const byId = new Map(spec.regions.map(region => [region.id, region]));
  if (byId.size !== spec.regions.length) context.addIssue({ code: "custom", message: "VISUAL_REGION_DUPLICATE", path: ["regions"] });
  for (const [index, region] of spec.regions.entries()) {
    // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
    if (region.interactionRequirement !== undefined && region.role !== "action") {
      context.addIssue({ code: "custom", message: "VISUAL_INTERACTION_ROLE_INVALID", path: ["regions", index, "interactionRequirement"] });
    }
    if (region.dataRequirement !== undefined && region.role !== "text") {
      context.addIssue({ code: "custom", message: "VISUAL_DATA_ROLE_INVALID", path: ["regions", index, "dataRequirement"] });
    }
    // end
    const visited = new Set([region.id]);
    let parent = region.parentId;
    while (parent !== null) {
      if (visited.has(parent) || !byId.has(parent)) {
        context.addIssue({ code: "custom", message: "VISUAL_PARENT_INVALID", path: ["regions", index, "parentId"] });
        break;
      }
      visited.add(parent);
      parent = byId.get(parent)!.parentId;
    }
  }
  for (const [index, uncertainty] of spec.uncertainties.entries()) {
    if (uncertainty.regionId !== null && !byId.has(uncertainty.regionId)) {
      context.addIssue({ code: "custom", message: "VISUAL_REGION_UNKNOWN", path: ["uncertainties", index, "regionId"] });
    }
  }
});
export type VisualReferenceSpec = z.infer<typeof VisualReferenceSpecSchema>;
export const VisualAnalysisPatchSchema = z.object({ expectedHash: z.string().regex(/^[0-9a-f]{64}$/), spec: VisualReferenceSpecSchema }).strict();
// end
