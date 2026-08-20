import { z } from "zod";

export const CapabilityStatusSchema = z.enum([
  "full",
  "partial",
  "preserve-only",
  "unsupported",
  "pending-verification",
]);

const boundedId = z.string().trim().min(1).max(100);
const stableId = boundedId.regex(/^[A-Za-z][A-Za-z0-9_-]*$/);
const px = z.number().min(-200).max(200);
const nonnegativePx = z.number().min(0).max(200);
const styleColor = z.string().trim().min(1).max(128).refine(
  (value) => !/[;<>\r\n]/.test(value)
    && !/(?:url|linear-gradient|radial-gradient|expression)\s*\(|javascript\s*:/i.test(value)
    && (!/[{}]/.test(value) || /^\{theme\.[A-Za-z][A-Za-z0-9]*\}$/.test(value)),
  "raw CSS color values are not allowed",
);

export const GradientStopSchema = z.object({
  offset: z.number().min(0).max(1),
  color: styleColor,
}).strict();

export const AdvancedStyleDeclarationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("gradient"), angle: z.number().min(0).max(360), stops: z.array(GradientStopSchema).min(2).max(5) }).strict(),
  z.object({ kind: z.literal("background-image"), assetId: stableId }).strict(),
  z.object({ kind: z.literal("transform"), translateX: px.optional(), translateY: px.optional(), scale: z.number().min(0.8).max(1.2).optional(), rotate: z.number().min(-15).max(15).optional() }).strict(),
]);

export const StyleDeclarationSchema = z.object({
  backgroundColor: styleColor.optional(),
  textColor: styleColor.optional(),
  borderColor: styleColor.optional(),
  borderTopWidth: nonnegativePx.optional(),
  borderRightWidth: nonnegativePx.optional(),
  borderBottomWidth: nonnegativePx.optional(),
  borderLeftWidth: nonnegativePx.optional(),
  borderTopColor: styleColor.optional(),
  borderRightColor: styleColor.optional(),
  borderBottomColor: styleColor.optional(),
  borderLeftColor: styleColor.optional(),
  borderRadius: z.number().min(0).max(100).optional(),
  borderTopLeftRadius: z.number().min(0).max(100).optional(),
  borderTopRightRadius: z.number().min(0).max(100).optional(),
  borderBottomRightRadius: z.number().min(0).max(100).optional(),
  borderBottomLeftRadius: z.number().min(0).max(100).optional(),
  fontSize: z.number().min(8).max(200).optional(),
  fontWeight: z.number().int().min(100).max(900).optional(),
  lineHeight: z.number().min(0.5).max(4).optional(),
  letterSpacing: z.number().min(-20).max(100).optional(),
  padding: z.number().min(0).max(200).optional(),
  paddingHorizontal: nonnegativePx.optional(),
  paddingVertical: nonnegativePx.optional(),
  margin: z.number().min(0).max(200).optional(),
  gap: z.number().min(0).max(200).optional(),
  boxShadow: z.enum(["none", "small", "medium", "large"]).optional(),
  opacity: z.number().min(0).max(1).optional(),
  textAlign: z.enum(["left", "center", "right"]).optional(),
  truncate: z.boolean().optional(),
  objectFit: z.enum(["contain", "cover", "fill", "none", "scale-down"]).optional(),
  overflow: z.enum(["visible", "hidden", "auto", "scroll"]).optional(),
  iconSize: z.number().min(1).max(200).optional(),
  iconColor: styleColor.optional(),
  iconGap: nonnegativePx.optional(),
  focusRing: z.object({
    color: styleColor,
    width: z.number().min(1).max(8),
    offset: z.number().min(0).max(16),
  }).strict().optional(),
  transition: z.object({
    property: z.enum(["opacity", "transform", "background-color", "border-color", "box-shadow", "color"]),
    durationMs: z.number().int().min(0).max(600),
    easing: z.enum(["linear", "ease", "ease-in", "ease-out", "ease-in-out"]),
  }).strict().optional(),
  advanced: z.array(AdvancedStyleDeclarationSchema).max(8).optional(),
}).strict();

const StyleStatesSchema = z.object({
  hover: StyleDeclarationSchema.optional(),
  active: StyleDeclarationSchema.optional(),
  focus: StyleDeclarationSchema.optional(),
  disabled: StyleDeclarationSchema.optional(),
  selected: StyleDeclarationSchema.optional(),
  error: StyleDeclarationSchema.optional(),
}).strict();

export const SemanticPartStyleSpecSchema = z.object({
  declarations: StyleDeclarationSchema.default({}),
  states: StyleStatesSchema.default({}),
}).strict();

export const ComponentStyleSpecSchema = z.object({
  role: z.string().min(1).max(100).optional(),
  declarations: StyleDeclarationSchema.default({}),
  states: StyleStatesSchema.default({}),
  parts: z.record(stableId, SemanticPartStyleSpecSchema).optional(),
}).strict();

export const ThemeSpecSchema = z.object({
  background: z.string().max(128),
  surface: z.string().max(128),
  primary: z.string().max(128),
  accent: z.string().max(128),
  textPrimary: z.string().max(128),
  textSecondary: z.string().max(128),
  fontFamily: z.string().min(1).max(200),
  spacingUnit: z.number().int().min(1).max(64),
  radiusScale: z.object({
    small: z.number().min(0).max(100),
    medium: z.number().min(0).max(100),
    large: z.number().min(0).max(100),
  }).strict(),
}).strict();

export const UIComponentSpecSchema = z.object({
  id: z.string().min(1).max(100),
  role: z.string().min(1).max(100),
  /** Customer-effect blueprint module implemented by this component. */
  sourceModuleId: z.string().min(1).max(100).optional(),
  capabilityId: z.string().min(1).max(100),
  critical: z.boolean().default(true),
  fallbackCapabilityId: z.string().min(1).max(100).optional(),
  content: z.string().max(2_000).optional(),
  geometry: z.object({
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive(),
  }).strict(),
  properties: z.record(z.string(), z.unknown()).default({}),
  style: ComponentStyleSpecSchema,
}).strict();

export const UIImplementationSpecSchema = z.object({
  schema: z.literal("kf-ui-implementation/v1"),
  theme: ThemeSpecSchema,
  pages: z.array(z.object({
    id: z.string().min(1).max(100),
    width: z.number().positive(),
    height: z.number().positive(),
    components: z.array(UIComponentSpecSchema).min(1),
  }).strict()).min(1),
}).strict();

const GeometrySchema = z.object({
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  width: z.number().positive(),
  height: z.number().positive(),
}).strict();

const CompiledStyleFragmentSchema = z.object({
  selectorToken: z.string().regex(/^(?:root|part:[A-Za-z][A-Za-z0-9_-]*)$/),
  state: z.enum(["normal", "hover", "active", "focus", "disabled", "selected", "error"]),
  declarations: StyleDeclarationSchema,
}).strict();

const CompiledStyleWarningSchema = z.object({
  code: z.string().trim().min(1).max(100).regex(/^[A-Z][A-Z0-9_]*$/),
  message: z.string().trim().min(1).max(500),
}).strict();

export const CompiledStyleSpecSchema = z.object({
  nativeFields: z.record(z.string().trim().min(1).max(100), z.unknown()),
  cssFragments: z.array(CompiledStyleFragmentSchema).max(128),
  warnings: z.array(CompiledStyleWarningSchema).max(64),
}).strict();

const DataBindingSpecSchema = z.object({
  mockDataId: boundedId,
  field: boundedId.optional(),
  recordKey: z.union([z.string().max(2_000), z.number().finite(), z.boolean()]).optional(),
  records: z.array(z.record(z.string().trim().min(1).max(100), z.unknown())).max(100).optional(),
}).strict();

const OverlayHostMetadataSchema = z.object({
  overlayId: boundedId,
  hostPageId: boundedId,
  presentation: z.enum(["dialog", "window", "drawer", "confirmation"]),
  visibleStateId: boundedId,
  dismissible: z.boolean(),
}).strict();

export const UIImplementationControlV2Schema = z.object({
  id: boundedId,
  parentId: boundedId.optional(),
  role: boundedId,
  sourceModuleId: boundedId.optional(),
  capabilityId: boundedId,
  critical: z.boolean().optional(),
  fallbackCapabilityId: boundedId.optional(),
  content: z.string().max(2_000).optional(),
  depth: z.number().int().min(0).max(32),
  zIndex: z.number().int().min(0).max(1_000_000),
  geometry: GeometrySchema,
  nativeProperties: z.record(z.string().trim().min(1).max(100), z.unknown()),
  style: ComponentStyleSpecSchema.optional(),
  compiledStyle: CompiledStyleSpecSchema.optional(),
  dataBinding: DataBindingSpecSchema.optional(),
  assetIds: z.array(boundedId).max(64).optional(),
  overlayHost: OverlayHostMetadataSchema.optional(),
  sourceSolutionNodeId: boundedId.optional(),
  sourceRepeaterId: boundedId.optional(),
  sourceBlueprintPageId: boundedId.optional(),
  sourceBlueprintRegionIds: z.array(boundedId).min(1).max(12).optional(),
  eventBindings: z.array(z.never()).max(0),
}).strict();

const UIImplementationPageV2Schema = z.object({
  id: boundedId,
  width: z.number().positive(),
  height: z.number().positive(),
  sourceBlueprintPageId: boundedId.optional(),
  controls: z.array(UIImplementationControlV2Schema).min(1).max(5_000),
}).strict();

function containsGeometry(
  outer: { x: number; y: number; width: number; height: number },
  inner: { x: number; y: number; width: number; height: number },
): boolean {
  return inner.x >= outer.x
    && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width
    && inner.y + inner.height <= outer.y + outer.height;
}

export const UIImplementationSpecV2Schema = z.object({
  schema: z.literal("kf-ui-implementation/v2"),
  theme: ThemeSpecSchema,
  compiledRoleStyles: z.record(stableId, ComponentStyleSpecSchema),
  pages: z.array(UIImplementationPageV2Schema).min(1).max(32),
  compiledActions: z.array(z.never()).max(0),
  compiledScripts: z.array(z.never()).max(0),
}).strict().superRefine((implementation, ctx) => {
  const pageIds = new Set<string>();
  const controlIds = new Set<string>();
  implementation.pages.forEach((page, pageIndex) => {
    if (pageIds.has(page.id)) {
      ctx.addIssue({ code: "custom", path: ["pages", pageIndex, "id"], message: `duplicate implementation page id: ${page.id}` });
    }
    pageIds.add(page.id);
    const controlsById = new Map(page.controls.map((control) => [control.id, control]));
    page.controls.forEach((control, controlIndex) => {
      const path: Array<string | number> = ["pages", pageIndex, "controls", controlIndex];
      if (controlIds.has(control.id)) {
        ctx.addIssue({ code: "custom", path: [...path, "id"], message: `duplicate implementation control id: ${control.id}` });
      }
      controlIds.add(control.id);
      if (!containsGeometry({ x: 0, y: 0, width: page.width, height: page.height }, control.geometry)) {
        ctx.addIssue({ code: "custom", path: [...path, "geometry"], message: `control geometry exceeds page bounds: ${control.id}` });
      }
      const parent = control.parentId === undefined ? undefined : controlsById.get(control.parentId);
      if (control.parentId === undefined && control.depth !== 0) {
        ctx.addIssue({ code: "custom", path: [...path, "depth"], message: "root controls must have depth zero" });
      } else if (control.parentId !== undefined && parent === undefined) {
        ctx.addIssue({ code: "custom", path: [...path, "parentId"], message: `unknown parent control id: ${control.parentId}` });
      } else if (parent !== undefined) {
        if (parent.id === control.id) {
          ctx.addIssue({ code: "custom", path: [...path, "parentId"], message: "a control cannot parent itself" });
        }
        if (control.depth !== parent.depth + 1) {
          ctx.addIssue({ code: "custom", path: [...path, "depth"], message: "control depth must be exactly one greater than its parent" });
        }
        if (!containsGeometry(parent.geometry, control.geometry)) {
          ctx.addIssue({ code: "custom", path: [...path, "geometry"], message: `control geometry exceeds parent bounds: ${control.id}` });
        }
      }
      if (control.overlayHost !== undefined && !pageIds.has(control.overlayHost.hostPageId)
        && !implementation.pages.some((candidate) => candidate.id === control.overlayHost?.hostPageId)) {
        ctx.addIssue({ code: "custom", path: [...path, "overlayHost", "hostPageId"], message: `unknown overlay host page id: ${control.overlayHost.hostPageId}` });
      }
      if (control.sourceBlueprintPageId !== undefined
        && page.sourceBlueprintPageId !== undefined
        && control.sourceBlueprintPageId !== page.sourceBlueprintPageId) {
        ctx.addIssue({ code: "custom", path: [...path, "sourceBlueprintPageId"], message: "control blueprint page provenance must match its implementation page" });
      }
      if (control.assetIds !== undefined && new Set(control.assetIds).size !== control.assetIds.length) {
        ctx.addIssue({ code: "custom", path: [...path, "assetIds"], message: "control asset ids must be unique" });
      }
    });
  });
});

export function adaptUiImplementationV1(input: UIImplementationSpec): UIImplementationSpecV2 {
  return UIImplementationSpecV2Schema.parse({
    schema: "kf-ui-implementation/v2",
    theme: input.theme,
    compiledRoleStyles: {},
    pages: input.pages.map((page) => ({
      id: page.id,
      width: page.width,
      height: page.height,
      controls: page.components.map((component, index) => ({
        id: component.id,
        role: component.role,
        sourceModuleId: component.sourceModuleId,
        capabilityId: component.capabilityId,
        critical: component.critical,
        fallbackCapabilityId: component.fallbackCapabilityId,
        content: component.content,
        depth: 0,
        zIndex: index,
        geometry: component.geometry,
        nativeProperties: component.properties,
        style: component.style,
        eventBindings: [],
      })),
    })),
    compiledActions: [],
    compiledScripts: [],
  });
}

export const AnyUIImplementationSpecSchema = z.discriminatedUnion("schema", [
  UIImplementationSpecSchema,
  UIImplementationSpecV2Schema,
]);

export const CapabilityDimensionSchema = z.object({
  status: CapabilityStatusSchema,
  supported: z.array(z.string()).default([]),
  unsupported: z.array(z.string()).default([]),
}).strict();

export const ControlCapabilitySchema = z.object({
  id: z.string().min(1),
  category: z.enum(["static", "easyui", "layout", "prototype"]),
  displayName: z.string().min(1),
  generation: CapabilityDimensionSchema,
  style: CapabilityDimensionSchema.extend({ adapter: z.string().min(1).optional() }).strict(),
  preview: CapabilityDimensionSchema,
  dataBinding: CapabilityDimensionSchema,
  interaction: CapabilityDimensionSchema,
  runtimeVerification: z.object({
    status: z.enum(["unverified", "verified", "failed"]),
    runtimeFamily: z.string().optional(),
    runtimeVersion: z.string().optional(),
    baselineId: z.string().optional(),
  }).strict(),
  limitations: z.array(z.string()).default([]),
}).strict();

export const DeliveryGapSchema = z.object({
  componentId: z.string().min(1),
  capability: z.string().min(1),
  severity: z.enum(["critical", "non-critical"]),
  fallback: z.string().min(1).optional(),
  reason: z.string().min(1),
}).strict();

export const CapabilityReportSchema = z.object({
  status: z.enum(["pass", "warning", "fail"]),
  full: z.array(z.string()),
  partial: z.array(z.string()),
  unsupported: z.array(z.string()),
  deliveryGaps: z.array(DeliveryGapSchema),
}).strict();

export type CapabilityStatus = z.infer<typeof CapabilityStatusSchema>;
export type AdvancedStyleDeclaration = z.infer<typeof AdvancedStyleDeclarationSchema>;
export type StyleDeclarationV2 = z.infer<typeof StyleDeclarationSchema>;
/** Retained as the v1 declaration surface so current exhaustive consumers stay source-compatible. */
export type StyleDeclaration = Pick<StyleDeclarationV2,
  | "backgroundColor"
  | "textColor"
  | "borderColor"
  | "borderRadius"
  | "fontSize"
  | "fontWeight"
  | "lineHeight"
  | "padding"
  | "margin"
  | "gap"
  | "boxShadow"
  | "opacity"
  | "textAlign"
>;
export type ComponentStyleSpec = z.infer<typeof ComponentStyleSpecSchema>;
export type ThemeSpec = z.infer<typeof ThemeSpecSchema>;
export type UIComponentSpec = z.infer<typeof UIComponentSpecSchema>;
export type UIImplementationSpec = z.infer<typeof UIImplementationSpecSchema>;
export type CompiledStyleSpec = z.infer<typeof CompiledStyleSpecSchema>;
export type UIImplementationControlV2 = z.infer<typeof UIImplementationControlV2Schema>;
export type UIImplementationSpecV2 = z.infer<typeof UIImplementationSpecV2Schema>;
export type AnyUIImplementationSpec = z.infer<typeof AnyUIImplementationSpecSchema>;
export type CapabilityDimension = z.infer<typeof CapabilityDimensionSchema>;
export type ControlCapability = z.infer<typeof ControlCapabilitySchema>;
export type DeliveryGap = z.infer<typeof DeliveryGapSchema>;
export type CapabilityReport = z.infer<typeof CapabilityReportSchema>;
