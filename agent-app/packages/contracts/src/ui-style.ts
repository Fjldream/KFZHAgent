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
const nativeStyleColor = z.string().trim().min(1).max(128).refine(
  (value) => /^\{theme\.[A-Za-z][A-Za-z0-9]*\}$/.test(value)
    || /^#(?:[0-9A-F]{3}|[0-9A-F]{4}|[0-9A-F]{6}|[0-9A-F]{8})$/i.test(value)
    || /^[A-Za-z]+$/.test(value)
    || /^rgba?\(\s*(?:\d{1,3}%?\s*,\s*){2}\d{1,3}%?(?:\s*,\s*(?:0(?:\.\d+)?|1(?:\.0+)?))?\s*\)$/i.test(value)
    || /^hsla?\(\s*-?\d{1,3}(?:\.\d+)?(?:deg)?\s*,\s*\d{1,3}(?:\.\d+)?%\s*,\s*\d{1,3}(?:\.\d+)?%(?:\s*,\s*(?:0(?:\.\d+)?|1(?:\.0+)?))?\s*\)$/i.test(value),
  "only theme tokens and bounded literal colors are allowed",
);
const legacyStyleColor = z.string().max(128);

const implementationOwnedFieldNames = new Set([
  "configuredata",
  "coordinates",
  "coords",
  "css",
  "geometry",
  "guid",
  "javascript",
  "js",
  "lefttoppt",
  "linkid",
  "objecttype",
  "onclick",
  "script",
  "selector",
  "styledata",
  "styledatanew",
  "uimodeltype",
  "x",
  "y",
]);

export function normalizeImplementationOwnedFieldName(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

export function isImplementationOwnedFieldName(value: string): boolean {
  return implementationOwnedFieldNames.has(normalizeImplementationOwnedFieldName(value));
}

export function sharedImplementationTextIssue(value: string): string | undefined {
  const trimmed = value.trim();
  if (/<\/?(?:script|style|iframe|object|embed)\b|\b(?:javascript|vbscript)\s*:/i.test(value)) {
    return "executable markup is not allowed";
  }
  if (/\b(?:alert|eval|fetch|Function|setInterval|setTimeout|WebSocket|XMLHttpRequest)\s*\(/i.test(value)
    || /\b(?:document|globalThis|window)\s*\./i.test(value)
    || /=>/.test(value)) {
    return "JavaScript APIs and executable syntax are not allowed";
  }
  if (/^[A-Za-z][A-Za-z0-9-]*\s*[>+~]\s*(?:[.#][A-Za-z_-][A-Za-z0-9_-]*|\[[^\]\n]+\])$/.test(trimmed)) {
    return "CSS selectors are not allowed";
  }
  return undefined;
}

type ImplementationDataValue = string | number | boolean | null
  | ImplementationDataValue[]
  | { [key: string]: ImplementationDataValue };

const forbiddenImplementationDataKeys = new Set([
  "code",
  "html",
  "innerhtml",
  "outerhtml",
  "rawcss",
  "selectortext",
  "sourcecode",
  "stylesheet",
  "styletext",
]);

const ImplementationDataKeySchema = z.string().trim().min(1).max(100)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/)
  .refine(
    (key) => !isImplementationOwnedFieldName(key)
      && !forbiddenImplementationDataKeys.has(normalizeImplementationOwnedFieldName(key)),
    "raw style, selector, markup, and script keys are not allowed",
  );

const ImplementationDataStringSchema = z.string().max(2_000).refine(
  (value) => sharedImplementationTextIssue(value) === undefined
    && !value.includes("${")
    && !/!important\b/i.test(value)
    && !/\b(?:var|calc|url|expression)\s*\(/i.test(value)
    && !/(?:^|[;{\s])(?:animation|background(?:-color|-image)?|border(?:-[a-z-]+)?|color|display|font(?:-[a-z-]+)?|height|margin(?:-[a-z-]+)?|opacity|overflow|padding(?:-[a-z-]+)?|position|transform|transition|width|z-index)\s*:/i.test(value),
  "raw CSS, selectors, markup, scripts, and interpolation are not allowed",
);

const ImplementationDataNodeSchema: z.ZodType<ImplementationDataValue> = z.lazy(() => z.union([
  ImplementationDataStringSchema,
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(ImplementationDataNodeSchema).max(100),
  z.record(ImplementationDataKeySchema, ImplementationDataNodeSchema),
]));

const ImplementationDataValueSchema = ImplementationDataNodeSchema.superRefine((value, ctx) => {
  const visit = (node: ImplementationDataValue, depth: number): void => {
    if (depth > 8) {
      ctx.addIssue({ code: "custom", message: "implementation data exceeds maximum depth 8" });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((entry) => visit(entry, depth + 1));
    } else if (node !== null && typeof node === "object") {
      const entries = Object.values(node);
      if (entries.length > 100) {
        ctx.addIssue({ code: "custom", message: "implementation data objects may contain at most 100 fields" });
        return;
      }
      entries.forEach((entry) => visit(entry, depth + 1));
    }
  };
  visit(value, 0);
});

const ImplementationDataRecordSchema = z.record(
  ImplementationDataKeySchema,
  ImplementationDataValueSchema,
).superRefine((record, ctx) => {
  if (Object.keys(record).length > 100) {
    ctx.addIssue({ code: "custom", message: "implementation data records may contain at most 100 fields" });
  }
  let nodeCount = 1;
  let budgetExceeded = false;
  const visit = (value: ImplementationDataValue): void => {
    if (budgetExceeded) return;
    nodeCount += 1;
    if (nodeCount > 1_000) {
      budgetExceeded = true;
      ctx.addIssue({ code: "custom", message: "implementation data record exceeds 1000 total semantic values" });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value !== null && typeof value === "object") {
      Object.values(value).forEach(visit);
    }
  };
  Object.values(record).forEach(visit);
});

export const GradientStopSchema = z.object({
  offset: z.number().min(0).max(1),
  color: nativeStyleColor,
}).strict();

export const AdvancedStyleDeclarationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("gradient"), angle: z.number().min(0).max(360), stops: z.array(GradientStopSchema).min(2).max(5) }).strict(),
  z.object({ kind: z.literal("background-image"), assetId: stableId }).strict(),
  z.object({ kind: z.literal("transform"), translateX: px.optional(), translateY: px.optional(), scale: z.number().min(0.8).max(1.2).optional(), rotate: z.number().min(-15).max(15).optional() }).strict(),
]);

export const StyleDeclarationV2Schema = z.object({
  backgroundColor: nativeStyleColor.optional(),
  textColor: nativeStyleColor.optional(),
  borderColor: nativeStyleColor.optional(),
  borderTopWidth: nonnegativePx.optional(),
  borderRightWidth: nonnegativePx.optional(),
  borderBottomWidth: nonnegativePx.optional(),
  borderLeftWidth: nonnegativePx.optional(),
  borderTopColor: nativeStyleColor.optional(),
  borderRightColor: nativeStyleColor.optional(),
  borderBottomColor: nativeStyleColor.optional(),
  borderLeftColor: nativeStyleColor.optional(),
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
  iconColor: nativeStyleColor.optional(),
  iconGap: nonnegativePx.optional(),
  focusRing: z.object({
    color: nativeStyleColor,
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

/** Frozen v1 declaration surface. Native v2 uses StyleDeclarationV2Schema above. */
export const StyleDeclarationSchema = z.object({
  backgroundColor: legacyStyleColor.optional(),
  textColor: legacyStyleColor.optional(),
  borderColor: legacyStyleColor.optional(),
  borderRadius: z.number().min(0).max(100).optional(),
  fontSize: z.number().min(8).max(200).optional(),
  fontWeight: z.number().int().min(100).max(900).optional(),
  lineHeight: z.number().min(0.5).max(4).optional(),
  padding: z.number().min(0).max(200).optional(),
  margin: z.number().min(0).max(200).optional(),
  gap: z.number().min(0).max(200).optional(),
  boxShadow: z.enum(["none", "small", "medium", "large"]).optional(),
  opacity: z.number().min(0).max(1).optional(),
  textAlign: z.enum(["left", "center", "right"]).optional(),
}).strict();

const StyleStatesSchema = z.object({
  hover: StyleDeclarationSchema.optional(),
  active: StyleDeclarationSchema.optional(),
  focus: StyleDeclarationSchema.optional(),
  disabled: StyleDeclarationSchema.optional(),
  selected: StyleDeclarationSchema.optional(),
  error: StyleDeclarationSchema.optional(),
}).strict();

export const StyleStatesV2Schema = z.object({
  hover: StyleDeclarationV2Schema.optional(),
  active: StyleDeclarationV2Schema.optional(),
  focus: StyleDeclarationV2Schema.optional(),
  disabled: StyleDeclarationV2Schema.optional(),
  selected: StyleDeclarationV2Schema.optional(),
  error: StyleDeclarationV2Schema.optional(),
}).strict();

export const SemanticPartStyleSpecSchema = z.object({
  declarations: StyleDeclarationV2Schema.default({}),
  states: StyleStatesV2Schema.default({}),
}).strict();

export const ComponentStyleSpecSchema = z.object({
  role: z.string().min(1).max(100).optional(),
  declarations: StyleDeclarationSchema.default({}),
  states: StyleStatesSchema.default({}),
}).strict();

const SemanticPartStyleSpecV2Schema = z.object({
  declarations: StyleDeclarationV2Schema.default({}),
  states: StyleStatesV2Schema.default({}),
}).strict();

export const ComponentStyleSpecV2Schema = z.object({
  role: z.string().min(1).max(100).optional(),
  declarations: StyleDeclarationV2Schema.default({}),
  states: StyleStatesV2Schema.default({}),
  parts: z.record(stableId, SemanticPartStyleSpecV2Schema).optional(),
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

const nativeFontFamily = z.string().trim().min(1).max(200)
  .regex(/^[\p{L}\p{N} _-]+$/u, "native font family must be a semantic family name");

export const NativeThemeSpecSchema = ThemeSpecSchema.extend({
  background: nativeStyleColor,
  surface: nativeStyleColor,
  primary: nativeStyleColor,
  accent: nativeStyleColor,
  textPrimary: nativeStyleColor,
  textSecondary: nativeStyleColor,
  fontFamily: nativeFontFamily,
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
  declarations: StyleDeclarationV2Schema,
}).strict();

const CompiledStyleWarningSchema = z.object({
  code: z.string().trim().min(1).max(100).regex(/^[A-Z][A-Z0-9_]*$/),
  message: z.string().trim().min(1).max(500),
}).strict();

export const CompiledStyleSpecSchema = z.object({
  nativeFields: ImplementationDataRecordSchema,
  cssFragments: z.array(CompiledStyleFragmentSchema).max(128),
  warnings: z.array(CompiledStyleWarningSchema).max(64),
}).strict();

const DataBindingSpecSchema = z.object({
  mockDataId: boundedId,
  field: boundedId.optional(),
  recordKey: z.union([z.string().max(2_000), z.number().finite(), z.boolean()]).optional(),
  records: z.array(ImplementationDataRecordSchema).max(100).optional(),
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
  nativeProperties: ImplementationDataRecordSchema,
  style: ComponentStyleSpecV2Schema.optional(),
  compiledStyle: CompiledStyleSpecSchema.optional(),
  dataBinding: DataBindingSpecSchema.optional(),
  assetIds: z.array(boundedId).max(64).optional(),
  overlayHost: OverlayHostMetadataSchema.optional(),
  sourceSolutionNodeId: boundedId,
  sourceRepeaterId: boundedId.optional(),
  sourceBlueprintPageId: boundedId,
  sourceBlueprintRegionIds: z.array(boundedId).min(1).max(12),
  eventBindings: z.array(z.never()).max(0),
}).strict();

const UIImplementationPageV2Schema = z.object({
  compatibility: z.literal("native"),
  id: boundedId,
  width: z.number().positive(),
  height: z.number().positive(),
  sourceBlueprintPageId: boundedId,
  controls: z.array(UIImplementationControlV2Schema).min(1).max(5_000),
}).strict();

const UIImplementationCompatibilityControlV2Schema = z.object({
  id: z.string().min(1).max(100),
  role: z.string().min(1).max(100),
  sourceModuleId: z.string().min(1).max(100).optional(),
  capabilityId: z.string().min(1).max(100),
  critical: z.boolean(),
  fallbackCapabilityId: z.string().min(1).max(100).optional(),
  content: z.string().max(2_000).optional(),
  depth: z.literal(0),
  zIndex: z.number().int().nonnegative(),
  geometry: GeometrySchema,
  nativeProperties: z.record(z.string(), z.unknown()),
  style: ComponentStyleSpecSchema,
  eventBindings: z.array(z.never()).max(0),
}).strict();

const UIImplementationCompatibilityPageV2Schema = z.object({
  compatibility: z.literal("adapted-v1"),
  id: z.string().min(1).max(100),
  width: z.number().positive(),
  height: z.number().positive(),
  controls: z.array(UIImplementationCompatibilityControlV2Schema).min(1),
}).strict();

const UIImplementationPageAnyV2Schema = z.discriminatedUnion("compatibility", [
  UIImplementationPageV2Schema,
  UIImplementationCompatibilityPageV2Schema,
]);

function containsGeometry(
  outer: { x: number; y: number; width: number; height: number },
  inner: { x: number; y: number; width: number; height: number },
): boolean {
  return inner.x >= outer.x
    && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width
    && inner.y + inner.height <= outer.y + outer.height;
}

function backgroundAssetIdsFromStyle(
  style: z.infer<typeof ComponentStyleSpecV2Schema> | undefined,
): string[] {
  if (style === undefined) {
    return [];
  }
  const assetIds: string[] = [];
  const visitDeclarations = (declarations: z.infer<typeof StyleDeclarationV2Schema>): void => {
    declarations.advanced?.forEach((declaration) => {
      if (declaration.kind === "background-image") {
        assetIds.push(declaration.assetId);
      }
    });
  };
  const visitStates = (states: Record<string, z.infer<typeof StyleDeclarationV2Schema> | undefined>): void => {
    Object.values(states).forEach((declarations) => {
      if (declarations !== undefined) {
        visitDeclarations(declarations);
      }
    });
  };

  visitDeclarations(style.declarations);
  visitStates(style.states);
  Object.values(style.parts ?? {}).forEach((part) => {
    visitDeclarations(part.declarations);
    visitStates(part.states);
  });
  return assetIds;
}

export const UIImplementationSpecV2Schema = z.object({
  schema: z.literal("kf-ui-implementation/v2"),
  compatibility: z.enum(["native", "adapted-v1"]),
  theme: z.union([ThemeSpecSchema, NativeThemeSpecSchema]),
  compiledRoleStyles: z.record(stableId, ComponentStyleSpecV2Schema),
  pages: z.array(UIImplementationPageAnyV2Schema).min(1),
  compiledActions: z.array(z.never()).max(0),
  compiledScripts: z.array(z.never()).max(0),
}).strict().superRefine((implementation, ctx) => {
  implementation.pages.forEach((page, pageIndex) => {
    if (page.compatibility !== implementation.compatibility) {
      ctx.addIssue({ code: "custom", path: ["pages", pageIndex, "compatibility"], message: "page compatibility must match the implementation compatibility branch" });
    }
  });
  if (implementation.compatibility === "adapted-v1") {
    if (Object.keys(implementation.compiledRoleStyles).length > 0) {
      ctx.addIssue({ code: "custom", path: ["compiledRoleStyles"], message: "adapted v1 implementations cannot invent compiled role styles" });
    }
    return;
  }
  const nativeTheme = NativeThemeSpecSchema.safeParse(implementation.theme);
  if (!nativeTheme.success) {
    nativeTheme.error.issues.forEach((issue) => {
      ctx.addIssue({ code: "custom", path: ["theme", ...issue.path], message: issue.message });
    });
  }
  if (implementation.pages.length > 32) {
    ctx.addIssue({ code: "custom", path: ["pages"], message: "native implementations may contain at most 32 pages" });
  }
  const pageIds = new Set<string>();
  const controlIds = new Set<string>();
  implementation.pages.forEach((page, pageIndex) => {
    if (page.compatibility !== "native") {
      return;
    }
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
      if (control.overlayHost !== undefined && control.overlayHost.hostPageId !== page.id) {
        ctx.addIssue({ code: "custom", path: [...path, "overlayHost", "hostPageId"], message: "overlay host must be owned by the control's implementation page" });
      }
      if (control.sourceBlueprintPageId !== page.sourceBlueprintPageId) {
        ctx.addIssue({ code: "custom", path: [...path, "sourceBlueprintPageId"], message: "control blueprint page provenance must match its implementation page" });
      }
      if (control.assetIds !== undefined && new Set(control.assetIds).size !== control.assetIds.length) {
        ctx.addIssue({ code: "custom", path: [...path, "assetIds"], message: "control asset ids must be unique" });
      }
      const declaredAssetIds = new Set(control.assetIds ?? []);
      const backgroundAssetIds = [
        ...backgroundAssetIdsFromStyle(control.style),
        ...(control.compiledStyle?.cssFragments.flatMap((fragment) =>
          fragment.declarations.advanced
            ?.filter((declaration) => declaration.kind === "background-image")
            .map((declaration) => declaration.assetId) ?? []) ?? []),
      ];
      backgroundAssetIds.forEach((assetId) => {
        if (!declaredAssetIds.has(assetId)) {
          ctx.addIssue({ code: "custom", path: [...path, "assetIds"], message: `background image asset is not declared for control ${control.id}: ${assetId}` });
        }
      });
    });
  });
  Object.entries(implementation.compiledRoleStyles).forEach(([role, style]) => {
    const backgroundAssetIds = backgroundAssetIdsFromStyle(style);
    if (backgroundAssetIds.length === 0) {
      return;
    }
    const matchingControls = implementation.pages.flatMap((page) =>
      page.compatibility === "native"
        ? page.controls.filter((control) => (control.style?.role ?? control.role) === role)
        : []);
    backgroundAssetIds.forEach((assetId) => {
      matchingControls.forEach((control) => {
        if (!(control.assetIds ?? []).includes(assetId)) {
          ctx.addIssue({ code: "custom", path: ["compiledRoleStyles", role], message: `background image asset is not declared for matching control ${control.id}: ${assetId}` });
        }
      });
    });
  });
});

export function adaptUiImplementationV1(input: UIImplementationSpec): UIImplementationSpecV2 {
  return UIImplementationSpecV2Schema.parse({
    schema: "kf-ui-implementation/v2",
    compatibility: "adapted-v1",
    theme: input.theme,
    compiledRoleStyles: {},
    pages: input.pages.map((page) => ({
      compatibility: "adapted-v1",
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
export type StyleDeclarationV2 = z.infer<typeof StyleDeclarationV2Schema>;
export type StyleDeclaration = z.infer<typeof StyleDeclarationSchema>;
export type ComponentStyleSpec = z.infer<typeof ComponentStyleSpecSchema>;
export type ThemeSpec = z.infer<typeof ThemeSpecSchema>;
export type NativeThemeSpec = z.infer<typeof NativeThemeSpecSchema>;
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
