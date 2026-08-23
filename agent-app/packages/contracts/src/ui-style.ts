import { z } from "zod";
import {
  CompiledNativeActionSchema,
  CompilerInstanceNameSchema,
  CompilerPageGuidSchema,
  semanticImplementationTextIssue,
} from "./action-graph.js";
import { CompiledEventBindingSchema, CompiledScriptModuleSchema } from "./script-program.js";

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

const cssNamedColors = new Set(`
  aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood
  cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson currentcolor cyan darkblue darkcyan
  darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred
  darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue
  dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green
  greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue
  lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue
  lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue
  mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue
  mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen
  paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue
  saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen
  steelblue tan teal thistle tomato transparent turquoise violet wheat white whitesmoke yellow yellowgreen
`.trim().split(/\s+/));

const unsignedDecimal = /^(?:\d+(?:\.\d+)?|\.\d+)$/;

function isBoundedNumericToken(value: string, maximum: number): boolean {
  return unsignedDecimal.test(value) && Number(value) <= maximum;
}

function isBoundedPercentage(value: string): boolean {
  return value.endsWith("%") && isBoundedNumericToken(value.slice(0, -1), 100);
}

function isAlphaChannel(value: string): boolean {
  return isBoundedPercentage(value) || isBoundedNumericToken(value, 1);
}

function haveConsistentRgbUnits(channels: string[]): boolean {
  return channels.every(isBoundedPercentage)
    || channels.every((channel) => isBoundedNumericToken(channel, 255));
}

function splitModernColorBody(body: string): { channels: string[]; alpha?: string } | undefined {
  if (body.includes(",")) return undefined;
  const sections = body.trim().split(/\s*\/\s*/);
  if (sections.length > 2) return undefined;
  const channels = sections[0]!.trim().split(/\s+/);
  const alpha = sections[1]?.trim();
  if (alpha === "" || alpha?.includes(" ") === true) return undefined;
  return alpha === undefined ? { channels } : { channels, alpha };
}

function isRgbColor(value: string): boolean {
  const match = /^(rgb|rgba)\(([^()]*)\)$/i.exec(value);
  if (match === null) return false;
  const body = match[2]!;
  if (body.includes(",")) {
    const channels = body.split(",").map((channel) => channel.trim());
    const expectedChannels = match[1]!.toLowerCase() === "rgba" ? 4 : 3;
    return channels.length === expectedChannels
      && haveConsistentRgbUnits(channels.slice(0, 3))
      && (channels.length === 3 || isAlphaChannel(channels[3]!));
  }
  const modern = splitModernColorBody(body);
  return modern !== undefined
    && modern.channels.length === 3
    && haveConsistentRgbUnits(modern.channels)
    && (modern.alpha === undefined || isAlphaChannel(modern.alpha));
}

function isHueChannel(value: string): boolean {
  return isBoundedNumericToken(value.replace(/deg$/i, ""), 360);
}

function isHslColor(value: string): boolean {
  const match = /^(hsl|hsla)\(([^()]*)\)$/i.exec(value);
  if (match === null) return false;
  const body = match[2]!;
  if (body.includes(",")) {
    const channels = body.split(",").map((channel) => channel.trim());
    const expectedChannels = match[1]!.toLowerCase() === "hsla" ? 4 : 3;
    return channels.length === expectedChannels
      && isHueChannel(channels[0]!)
      && isBoundedPercentage(channels[1]!)
      && isBoundedPercentage(channels[2]!)
      && (channels.length === 3 || isAlphaChannel(channels[3]!));
  }
  const modern = splitModernColorBody(body);
  return modern !== undefined
    && modern.channels.length === 3
    && isHueChannel(modern.channels[0]!)
    && isBoundedPercentage(modern.channels[1]!)
    && isBoundedPercentage(modern.channels[2]!)
    && (modern.alpha === undefined || isAlphaChannel(modern.alpha));
}

const nativeStyleColor = z.string().trim().min(1).max(128).refine(
  (value) => /^\{theme\.[A-Za-z][A-Za-z0-9]*\}$/.test(value)
    || /^#(?:[0-9A-F]{3}|[0-9A-F]{4}|[0-9A-F]{6}|[0-9A-F]{8})$/i.test(value)
    || cssNamedColors.has(value.toLowerCase())
    || isRgbColor(value)
    || isHslColor(value),
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

const allowedOnPrefixedDomainFieldNames = new Set([
  "onboardingstage",
  "onlinestatus",
  "onlypending",
]);

export function normalizeImplementationOwnedFieldName(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

export function isImplementationOwnedFieldName(value: string): boolean {
  const normalized = normalizeImplementationOwnedFieldName(value);
  if (implementationOwnedFieldNames.has(normalized)) return true;
  return normalized.startsWith("on") && !allowedOnPrefixedDomainFieldNames.has(normalized);
}

export function sharedImplementationTextIssue(value: string): string | undefined {
  return semanticImplementationTextIssue(value, "implementation-data", { allowDottedIdentifier: true });
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

export const MAX_COMPILED_LAYOUT_EXTENT = 100_000;

const ScrollContentExtentSchema = z.object({
  width: z.number().finite().positive().max(MAX_COMPILED_LAYOUT_EXTENT)
    .refine(hasCompilerLayoutPrecision, "scroll content extent must use at most two decimal places"),
  height: z.number().finite().positive().max(MAX_COMPILED_LAYOUT_EXTENT)
    .refine(hasCompilerLayoutPrecision, "scroll content extent must use at most two decimal places"),
}).strict();

const VisibleLayoutKindSchema = z.enum([
  "row",
  "column",
  "grid",
  "asymmetric-grid",
  "split",
  "stack",
  "dock",
  "sidebar-content",
  "master-detail",
  "overlay-anchor",
]);

const CompiledLayoutMetadataSchema = z.discriminatedUnion("overflow", [
  z.object({
    kind: z.literal("scroll-region"),
    overflow: z.literal("local-scroll"),
    scrollContentExtent: ScrollContentExtentSchema,
  }).strict(),
  z.object({
    kind: VisibleLayoutKindSchema,
    overflow: z.literal("visible"),
  }).strict(),
]);

const CompiledStyleWarningSchema = z.object({
  code: z.string().trim().min(1).max(100).regex(/^[A-Z][A-Z0-9_]*$/),
  message: z.string().trim().min(1).max(500),
}).strict();

const CompiledStyleFragmentSchema = z.object({
  selectorToken: z.string().regex(/^(?:root|part:[A-Za-z][A-Za-z0-9_-]*)$/),
  state: z.enum(["normal", "hover", "active", "focus", "disabled", "selected", "error"]),
  declarations: StyleDeclarationV2Schema,
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
  initiallyVisible: z.literal(false),
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
  compiledLayout: CompiledLayoutMetadataSchema.optional(),
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
  eventBindings: z.array(CompiledEventBindingSchema).max(32),
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

const RuntimeCorrelationSchema = z.object({
  controls: z.array(z.object({
    semanticControlId: stableId,
    instanceName: CompilerInstanceNameSchema,
  }).strict()).max(5_000),
  pages: z.array(z.object({
    semanticPageId: stableId,
    pageGuid: CompilerPageGuidSchema,
  }).strict()).max(32),
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

function hasCompilerLayoutPrecision(value: number): boolean {
  return value === Math.round(value * 100) / 100;
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
  sourceSolutionPlanHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  sourceModuleRegistryHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  theme: z.union([ThemeSpecSchema, NativeThemeSpecSchema]),
  compiledRoleStyles: z.record(stableId, ComponentStyleSpecV2Schema),
  pages: z.array(UIImplementationPageAnyV2Schema).min(1),
  compiledActions: z.array(CompiledNativeActionSchema).max(3_200),
  compiledScripts: z.array(CompiledScriptModuleSchema).max(200),
  runtimeCorrelation: RuntimeCorrelationSchema.optional(),
}).strict().superRefine((implementation, ctx) => {
  implementation.pages.forEach((page, pageIndex) => {
    if (page.compatibility !== implementation.compatibility) {
      ctx.addIssue({ code: "custom", path: ["pages", pageIndex, "compatibility"], message: "page compatibility must match the implementation compatibility branch" });
    }
  });
  if (implementation.compatibility === "adapted-v1") {
    if (implementation.sourceSolutionPlanHash !== undefined) {
      ctx.addIssue({ code: "custom", path: ["sourceSolutionPlanHash"], message: "adapted v1 implementations cannot claim a native solution-plan hash" });
    }
    if (implementation.sourceModuleRegistryHash !== undefined) {
      ctx.addIssue({ code: "custom", path: ["sourceModuleRegistryHash"], message: "adapted v1 implementations cannot claim native module-registry correlation" });
    }
    if (Object.keys(implementation.compiledRoleStyles).length > 0) {
      ctx.addIssue({ code: "custom", path: ["compiledRoleStyles"], message: "adapted v1 implementations cannot invent compiled role styles" });
    }
    if (implementation.compiledActions.length > 0) {
      ctx.addIssue({ code: "custom", path: ["compiledActions"], message: "adapted v1 implementations cannot contain compiled actions" });
    }
    if (implementation.compiledScripts.length > 0) {
      ctx.addIssue({ code: "custom", path: ["compiledScripts"], message: "adapted v1 implementations cannot contain compiled scripts" });
    }
    if (implementation.runtimeCorrelation !== undefined) {
      ctx.addIssue({ code: "custom", path: ["runtimeCorrelation"], message: "adapted v1 implementations cannot contain runtime correlation" });
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
  const semanticIds = new Set<string>();
  implementation.pages.forEach((page, pageIndex) => {
    if (page.compatibility !== "native") {
      return;
    }
    if (pageIds.has(page.id)) {
      ctx.addIssue({ code: "custom", path: ["pages", pageIndex, "id"], message: `duplicate implementation page id: ${page.id}` });
    }
    pageIds.add(page.id);
    semanticIds.add(page.id);
    semanticIds.add(page.sourceBlueprintPageId);
    type NativeControl = z.infer<typeof UIImplementationControlV2Schema>;
    const controlsById = new Map(page.controls.map((control) => [control.id, control]));
    const controlIndexById = new Map<string, number>();
    const childrenByParent = new Map<string, NativeControl[]>();
    page.controls.forEach((control, controlIndex) => {
      semanticIds.add(control.id);
      semanticIds.add(control.sourceSolutionNodeId);
      semanticIds.add(control.sourceBlueprintPageId);
      controlIndexById.set(control.id, controlIndex);
      if (control.parentId === undefined) return;
      const siblings = childrenByParent.get(control.parentId) ?? [];
      siblings.push(control);
      childrenByParent.set(control.parentId, siblings);
    });
    const isScrollOwner = (control: NativeControl): boolean =>
      control.compiledLayout?.kind === "scroll-region";

    const parentGraphState = new Map<string, "active" | "done">();
    page.controls.forEach((control, controlIndex) => {
      if (parentGraphState.has(control.id)) return;
      const path: NativeControl[] = [];
      let current: NativeControl | undefined = control;
      while (current !== undefined && !parentGraphState.has(current.id)) {
        parentGraphState.set(current.id, "active");
        path.push(current);
        current = current.parentId === undefined ? undefined : controlsById.get(current.parentId);
      }
      if (current !== undefined && parentGraphState.get(current.id) === "active") {
        const cycleIndex = controlIndexById.get(current.id) ?? controlIndex;
        ctx.addIssue({
          code: "custom",
          path: ["pages", pageIndex, "controls", cycleIndex, "parentId"],
          message: `control parent cycle detected at ${current.id}`,
        });
      }
      path.forEach((candidate) => parentGraphState.set(candidate.id, "done"));
    });

    const nearestScrollOwnerByControlId = new Map<string, NativeControl | null>();
    page.controls.forEach((control) => {
      if (nearestScrollOwnerByControlId.has(control.id)) return;
      const path: NativeControl[] = [];
      const pathIds = new Set<string>();
      let current: NativeControl | undefined = control;
      let resolved: NativeControl | null = null;
      while (current !== undefined) {
        if (nearestScrollOwnerByControlId.has(current.id)) {
          resolved = nearestScrollOwnerByControlId.get(current.id) ?? null;
          break;
        }
        if (pathIds.has(current.id)) break;
        pathIds.add(current.id);
        path.push(current);
        const parent: NativeControl | undefined = current.parentId === undefined ? undefined : controlsById.get(current.parentId);
        if (parent === undefined) break;
        if (isScrollOwner(parent)) {
          resolved = parent;
          break;
        }
        current = parent;
      }
      path.forEach((candidate) => nearestScrollOwnerByControlId.set(candidate.id, resolved));
    });
    page.controls.forEach((control, controlIndex) => {
      const path: Array<string | number> = ["pages", pageIndex, "controls", controlIndex];
      if (controlIds.has(control.id)) {
        ctx.addIssue({ code: "custom", path: [...path, "id"], message: `duplicate implementation control id: ${control.id}` });
      }
      controlIds.add(control.id);
      const scrollAncestor = nearestScrollOwnerByControlId.get(control.id) ?? undefined;
      if (scrollAncestor !== undefined) {
        const metadata = scrollAncestor.compiledLayout;
        if (metadata !== undefined && metadata.kind === "scroll-region") {
          const extent = metadata.scrollContentExtent;
          if (!containsGeometry({
            x: scrollAncestor.geometry.x,
            y: scrollAncestor.geometry.y,
            width: extent.width,
            height: extent.height,
          }, control.geometry)) {
            ctx.addIssue({ code: "custom", path: [...path, "geometry"], message: `control geometry exceeds scroll content extent: ${control.id}` });
          }
        }
      }
      if (scrollAncestor === undefined
        && !containsGeometry({ x: 0, y: 0, width: page.width, height: page.height }, control.geometry)) {
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
        if (!isScrollOwner(parent) && !containsGeometry(parent.geometry, control.geometry)) {
          ctx.addIssue({ code: "custom", path: [...path, "geometry"], message: `control geometry exceeds parent bounds: ${control.id}` });
        }
      }
      if (control.compiledLayout !== undefined) {
        if (!control.capabilityId.startsWith("layout.")) {
          ctx.addIssue({ code: "custom", path: [...path, "compiledLayout"], message: "compiled layout is compiler-owned layout-container metadata" });
        }
        if ((childrenByParent.get(control.id) ?? []).length === 0) {
          ctx.addIssue({ code: "custom", path: [...path, "compiledLayout"], message: "compiled layout metadata requires child controls" });
        }
        if (control.compiledLayout.kind === "scroll-region") {
          const extent = control.compiledLayout.scrollContentExtent;
          if (extent.width < control.geometry.width || extent.height < control.geometry.height) {
            ctx.addIssue({ code: "custom", path: [...path, "compiledLayout", "scrollContentExtent"], message: "scroll content extent cannot be smaller than its viewport" });
          }
          let maximumRight = control.geometry.x + control.geometry.width;
          let maximumBottom = control.geometry.y + control.geometry.height;
          const pending = [...(childrenByParent.get(control.id) ?? [])];
          const visited = new Set<string>();
          while (pending.length > 0) {
            const descendant = pending.pop()!;
            if (visited.has(descendant.id)) continue;
            visited.add(descendant.id);
            maximumRight = Math.max(maximumRight, descendant.geometry.x + descendant.geometry.width);
            maximumBottom = Math.max(maximumBottom, descendant.geometry.y + descendant.geometry.height);
            if (!isScrollOwner(descendant)) pending.push(...(childrenByParent.get(descendant.id) ?? []));
          }
          const quantize = (value: number): number => Math.round(value * 100) / 100;
          const derivedWidth = quantize(maximumRight - control.geometry.x);
          const derivedHeight = quantize(maximumBottom - control.geometry.y);
          if (extent.width !== derivedWidth || extent.height !== derivedHeight) {
            ctx.addIssue({ code: "custom", path: [...path, "compiledLayout", "scrollContentExtent"], message: "scroll content extent must equal the tight bounds of its owned scroll subtree" });
          }
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
  const hasEventBindings = implementation.pages.some((page) =>
    page.compatibility === "native" && page.controls.some((control) => control.eventBindings.length > 0));
  if ((hasEventBindings || implementation.compiledActions.length > 0 || implementation.compiledScripts.length > 0)
    && implementation.runtimeCorrelation === undefined) {
    ctx.addIssue({ code: "custom", path: ["runtimeCorrelation"], message: "compiled interactions require compiler-owned runtime correlation" });
  }
  const instanceByControl = new Map<string, string>();
  const controlByInstance = new Map<string, string>();
  const guidByPage = new Map<string, string>();
  const pageByGuid = new Map<string, string>();
  implementation.runtimeCorrelation?.controls.forEach((entry, index) => {
    if (!controlIds.has(entry.semanticControlId)) ctx.addIssue({ code: "custom", path: ["runtimeCorrelation", "controls", index, "semanticControlId"], message: `unknown correlated control: ${entry.semanticControlId}` });
    if (instanceByControl.has(entry.semanticControlId)) ctx.addIssue({ code: "custom", path: ["runtimeCorrelation", "controls", index, "semanticControlId"], message: `duplicate correlated control: ${entry.semanticControlId}` });
    if (controlByInstance.has(entry.instanceName)) ctx.addIssue({ code: "custom", path: ["runtimeCorrelation", "controls", index, "instanceName"], message: `compiler instance mapped to multiple controls: ${entry.instanceName}` });
    instanceByControl.set(entry.semanticControlId, entry.instanceName);
    controlByInstance.set(entry.instanceName, entry.semanticControlId);
  });
  implementation.runtimeCorrelation?.pages.forEach((entry, index) => {
    if (!pageIds.has(entry.semanticPageId)) ctx.addIssue({ code: "custom", path: ["runtimeCorrelation", "pages", index, "semanticPageId"], message: `unknown correlated page: ${entry.semanticPageId}` });
    if (guidByPage.has(entry.semanticPageId)) ctx.addIssue({ code: "custom", path: ["runtimeCorrelation", "pages", index, "semanticPageId"], message: `duplicate correlated page: ${entry.semanticPageId}` });
    if (pageByGuid.has(entry.pageGuid)) ctx.addIssue({ code: "custom", path: ["runtimeCorrelation", "pages", index, "pageGuid"], message: `compiler page GUID mapped to multiple pages: ${entry.pageGuid}` });
    guidByPage.set(entry.semanticPageId, entry.pageGuid);
    pageByGuid.set(entry.pageGuid, entry.semanticPageId);
  });
  if (implementation.runtimeCorrelation !== undefined) {
    controlIds.forEach((controlId) => {
      if (!instanceByControl.has(controlId)) ctx.addIssue({ code: "custom", path: ["runtimeCorrelation", "controls"], message: `missing correlated control: ${controlId}` });
    });
    pageIds.forEach((pageId) => {
      if (!guidByPage.has(pageId)) ctx.addIssue({ code: "custom", path: ["runtimeCorrelation", "pages"], message: `missing correlated page: ${pageId}` });
    });
  }
  const compiledActionIds = new Set<string>();
  const compiledActionById = new Map<string, (typeof implementation.compiledActions)[number]>();
  implementation.compiledActions.forEach((action, actionIndex) => {
    if (compiledActionIds.has(action.id)) ctx.addIssue({ code: "custom", path: ["compiledActions", actionIndex, "id"], message: `duplicate compiled action id: ${action.id}` });
    compiledActionIds.add(action.id);
    compiledActionById.set(action.id, action);
    if (semanticIds.has(action.ownerInstanceName)) ctx.addIssue({ code: "custom", path: ["compiledActions", actionIndex, "ownerInstanceName"], message: "compiler instance name cannot reuse a semantic id" });
    if ("targetInstanceName" in action && semanticIds.has(action.targetInstanceName)) ctx.addIssue({ code: "custom", path: ["compiledActions", actionIndex, "targetInstanceName"], message: "compiler target instance cannot reuse a semantic id" });
    if (!controlByInstance.has(action.ownerInstanceName)) ctx.addIssue({ code: "custom", path: ["compiledActions", actionIndex, "ownerInstanceName"], message: `unmapped compiled action owner: ${action.ownerInstanceName}` });
    if ("targetInstanceName" in action && !controlByInstance.has(action.targetInstanceName)) ctx.addIssue({ code: "custom", path: ["compiledActions", actionIndex, "targetInstanceName"], message: `unmapped compiled action target: ${action.targetInstanceName}` });
    if (action.kind === "navigate-page" && !pageByGuid.has(action.targetPageGuid)) ctx.addIssue({ code: "custom", path: ["compiledActions", actionIndex, "targetPageGuid"], message: `unmapped compiled page GUID: ${action.targetPageGuid}` });
  });
  const compiledScriptIds = new Set<string>();
  const compiledScriptById = new Map<string, (typeof implementation.compiledScripts)[number]>();
  implementation.compiledScripts.forEach((module, moduleIndex) => {
    if (compiledScriptIds.has(module.id)) ctx.addIssue({ code: "custom", path: ["compiledScripts", moduleIndex, "id"], message: `duplicate compiled script id: ${module.id}` });
    compiledScriptIds.add(module.id);
    compiledScriptById.set(module.id, module);
    if (semanticIds.has(module.ownerInstanceName)) ctx.addIssue({ code: "custom", path: ["compiledScripts", moduleIndex, "ownerInstanceName"], message: "compiler instance name cannot reuse a semantic id" });
    if (!controlByInstance.has(module.ownerInstanceName)) ctx.addIssue({ code: "custom", path: ["compiledScripts", moduleIndex, "ownerInstanceName"], message: `unmapped compiled script owner: ${module.ownerInstanceName}` });
    module.instanceReferences.forEach((reference, referenceIndex) => {
      if (!controlIds.has(reference.semanticId)) ctx.addIssue({ code: "custom", path: ["compiledScripts", moduleIndex, "instanceReferences", referenceIndex, "semanticId"], message: `unknown compiled control reference: ${reference.semanticId}` });
      if (semanticIds.has(reference.instanceName)) ctx.addIssue({ code: "custom", path: ["compiledScripts", moduleIndex, "instanceReferences", referenceIndex, "instanceName"], message: "compiler instance name cannot reuse a semantic id" });
      if (instanceByControl.get(reference.semanticId) !== reference.instanceName) ctx.addIssue({ code: "custom", path: ["compiledScripts", moduleIndex, "instanceReferences", referenceIndex], message: `compiled control correlation mismatch: ${reference.semanticId}` });
    });
    module.pageReferences.forEach((reference, referenceIndex) => {
      if (!pageIds.has(reference.semanticId)) ctx.addIssue({ code: "custom", path: ["compiledScripts", moduleIndex, "pageReferences", referenceIndex, "semanticId"], message: `unknown compiled page reference: ${reference.semanticId}` });
      if (guidByPage.get(reference.semanticId) !== reference.pageGuid) ctx.addIssue({ code: "custom", path: ["compiledScripts", moduleIndex, "pageReferences", referenceIndex], message: `compiled page correlation mismatch: ${reference.semanticId}` });
    });
  });
  const bindingIds = new Set<string>();
  const referencedEventScripts = new Set<string>();
  const referencedNativeActions = new Set<string>();
  implementation.pages.forEach((page, pageIndex) => {
    if (page.compatibility !== "native") return;
    page.controls.forEach((control, controlIndex) => {
      const eventPhases = new Set<string>();
      control.eventBindings.forEach((binding, bindingIndex) => {
        const path = ["pages", pageIndex, "controls", controlIndex, "eventBindings", bindingIndex];
        if (bindingIds.has(binding.id)) ctx.addIssue({ code: "custom", path: [...path, "id"], message: `duplicate compiled binding id: ${binding.id}` });
        bindingIds.add(binding.id);
        if (semanticIds.has(binding.ownerInstanceName)) ctx.addIssue({ code: "custom", path: [...path, "ownerInstanceName"], message: "compiler instance name cannot reuse a semantic id" });
        if (instanceByControl.get(control.id) !== binding.ownerInstanceName) ctx.addIssue({ code: "custom", path: [...path, "ownerInstanceName"], message: `compiled binding owner mismatch: ${control.id}` });
        const eventPhase = `${binding.kfEvent}\u0000${binding.phase}`;
        if (eventPhases.has(eventPhase)) ctx.addIssue({ code: "custom", path, message: `duplicate compiled event phase: ${binding.kfEvent}/${binding.phase}` });
        eventPhases.add(eventPhase);
        binding.scriptModuleIds.forEach((moduleId, moduleIdIndex) => {
          if (!compiledScriptIds.has(moduleId)) ctx.addIssue({ code: "custom", path: [...path, "scriptModuleIds", moduleIdIndex], message: `unknown compiled script id: ${moduleId}` });
          const module = compiledScriptById.get(moduleId);
          if (module !== undefined && module.ownerInstanceName !== binding.ownerInstanceName) ctx.addIssue({ code: "custom", path: [...path, "scriptModuleIds", moduleIdIndex], message: `compiled script owner mismatch: ${moduleId}` });
          referencedEventScripts.add(moduleId);
        });
        binding.nativeActionIds.forEach((actionId, actionIdIndex) => {
          if (!compiledActionIds.has(actionId)) ctx.addIssue({ code: "custom", path: [...path, "nativeActionIds", actionIdIndex], message: `unknown compiled action id: ${actionId}` });
          const action = compiledActionById.get(actionId);
          if (action !== undefined && action.ownerInstanceName !== binding.ownerInstanceName) ctx.addIssue({ code: "custom", path: [...path, "nativeActionIds", actionIdIndex], message: `compiled action owner mismatch: ${actionId}` });
          referencedNativeActions.add(actionId);
        });
      });
    });
  });
  implementation.compiledScripts.forEach((module, moduleIndex) => {
    if (module.placement === "event" && !referencedEventScripts.has(module.id)) ctx.addIssue({ code: "custom", path: ["compiledScripts", moduleIndex, "id"], message: `event script is not bound: ${module.id}` });
  });
  implementation.compiledActions.forEach((action, actionIndex) => {
    if (!referencedNativeActions.has(action.id)) ctx.addIssue({ code: "custom", path: ["compiledActions", actionIndex, "id"], message: `compiled action is not bound: ${action.id}` });
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
