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

const interactiveCssTagNames = new Set([
  "a", "button", "form", "input", "label", "option", "select", "textarea",
]);

const htmlSelectorTagNames = new Set(`
  a abbr address area article aside audio b base bdi bdo blockquote body br button canvas caption cite code col colgroup
  data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6
  head header hgroup hr html i iframe img input ins kbd label legend li link main map mark menu meta meter nav noscript
  object ol optgroup option output p picture pre progress q rp rt ruby s samp script search section select slot small
  source span strong style sub summary sup table tbody td template textarea tfoot th thead time title tr track u ul var
  video wbr
`.trim().split(/\s+/));

const cssSelectorAtomPattern = "(?:[A-Za-z][A-Za-z0-9-]*|[.#][A-Za-z_-][A-Za-z0-9_-]*|\\[[^\\]\\n]+\\])";
const cssDescendantSelector = new RegExp(`^${cssSelectorAtomPattern}(?:\\s+${cssSelectorAtomPattern})+$`);
const cssCombinatorSelector = new RegExp(`^${cssSelectorAtomPattern}(?:\\s*[>+~]\\s*${cssSelectorAtomPattern})+$`);
const cssSelectorList = new RegExp(`^${cssSelectorAtomPattern}(?:\\s*,\\s*${cssSelectorAtomPattern})+$`);

function isCssSelectorListText(value: string): boolean {
  if (!cssSelectorList.test(value)) return false;
  if (/(?:[.#]|\[)/.test(value)) return true;

  const atoms = value.split(",").map((atom) => atom.trim().toLowerCase());
  return atoms.some((atom) => /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/.test(atom))
    || atoms.every((atom) => htmlSelectorTagNames.has(atom));
}

function isCssSelectorText(value: string): boolean {
  if (/^\.[A-Za-z_-][A-Za-z0-9_-]*$/.test(value)
    || (/^#[A-Za-z_-][A-Za-z0-9_-]*$/.test(value) && !/^#[0-9A-F]{3,8}$/i.test(value))
    || /^\[[^\]\n]+\]$/.test(value)
    || /^(?:[.#][A-Za-z_-][A-Za-z0-9_-]*){2,}$/.test(value)) {
    return true;
  }

  if (cssDescendantSelector.test(value) && /(?:^|\s)(?:[.#]|\[)/.test(value)) return true;
  if (cssCombinatorSelector.test(value)) return true;
  if (isCssSelectorListText(value)) return true;

  const pseudoMatch = /^([A-Za-z][A-Za-z0-9-]*|[.#][A-Za-z_-][A-Za-z0-9_-]*):{1,2}[A-Za-z-]+(?:\([^)]*\))?$/.exec(value);
  const pseudoPrefix = pseudoMatch?.[1];
  return pseudoPrefix !== undefined
    && (pseudoPrefix.startsWith(".")
      || pseudoPrefix.startsWith("#")
      || interactiveCssTagNames.has(pseudoPrefix.toLowerCase()));
}

function isCssRuleText(value: string): boolean {
  const openBrace = value.indexOf("{");
  const closeBrace = value.lastIndexOf("}");
  if (openBrace <= 0
    || closeBrace !== value.length - 1
    || value.indexOf("{", openBrace + 1) !== -1
    || value.indexOf("}") !== closeBrace) {
    return false;
  }
  const selectorPrelude = value.slice(0, openBrace).trim();
  const declarations = value.slice(openBrace + 1, closeBrace);
  return selectorPrelude.length > 0
    && /^\s*(?:(?:--)?[A-Za-z][A-Za-z0-9-]*\s*:\s*[^;{}]+(?:;\s*|$))+$/.test(declarations);
}

function isJavascriptIdentifierStart(value: string | undefined): boolean {
  return value !== undefined && /[A-Za-z_$]/.test(value);
}

function isJavascriptIdentifierPart(value: string | undefined): boolean {
  return value !== undefined && /[A-Za-z0-9_$]/.test(value);
}

function skipWhitespace(value: string, start: number): number {
  let cursor = start;
  while (/\s/.test(value[cursor] ?? "")) cursor += 1;
  return cursor;
}

function readIdentifierEnd(value: string, start: number): number | undefined {
  if (!isJavascriptIdentifierStart(value[start])) return undefined;
  let cursor = start + 1;
  while (isJavascriptIdentifierPart(value[cursor])) cursor += 1;
  return cursor;
}

function readQuotedMemberEnd(value: string, start: number): number | undefined {
  if (value[start] !== "[") return undefined;
  let cursor = skipWhitespace(value, start + 1);
  const quote = value[cursor];
  if (quote !== "\"" && quote !== "'") return undefined;
  cursor += 1;
  while (cursor < value.length && value[cursor] !== quote) {
    cursor += value[cursor] === "\\" ? 2 : 1;
  }
  if (value[cursor] !== quote) return undefined;
  cursor = skipWhitespace(value, cursor + 1);
  return value[cursor] === "]" ? cursor + 1 : undefined;
}

function hasBalancedCall(value: string, openParen: number): boolean {
  let depth = 0;
  let quote: string | undefined;
  for (let cursor = openParen; cursor < value.length; cursor += 1) {
    const character = value[cursor]!;
    if (quote !== undefined) {
      if (character === "\\") cursor += 1;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === "\"" || character === "'" || character === "`") {
      quote = character;
    } else if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
      if (depth === 0) return true;
    }
  }
  return false;
}

function containsJavascriptMemberCall(value: string): boolean {
  for (let start = 0; start < value.length; start += 1) {
    if (!isJavascriptIdentifierStart(value[start]) || isJavascriptIdentifierPart(value[start - 1])) continue;
    let cursor = readIdentifierEnd(value, start)!;
    let memberCount = 0;
    while (cursor < value.length) {
      cursor = skipWhitespace(value, cursor);
      const optionalMember = value.startsWith("?.", cursor);
      if (optionalMember || value[cursor] === ".") {
        const memberStart = skipWhitespace(value, cursor + (optionalMember ? 2 : 1));
        if (value[memberStart] === "(") {
          if (optionalMember && memberCount > 0 && hasBalancedCall(value, memberStart)) return true;
          break;
        }
        if (optionalMember && value[memberStart] === "[") {
          const quotedMemberEnd = readQuotedMemberEnd(value, memberStart);
          if (quotedMemberEnd === undefined) break;
          memberCount += 1;
          cursor = quotedMemberEnd;
          continue;
        }
        const memberEnd = readIdentifierEnd(value, memberStart);
        if (memberEnd === undefined) break;
        memberCount += 1;
        cursor = memberEnd;
        continue;
      }
      const quotedMemberEnd = readQuotedMemberEnd(value, cursor);
      if (quotedMemberEnd === undefined) break;
      memberCount += 1;
      cursor = quotedMemberEnd;
    }
    if (memberCount === 0) continue;
    cursor = skipWhitespace(value, cursor);
    if (value.startsWith("?.", cursor)) cursor = skipWhitespace(value, cursor + 2);
    if (value[cursor] === "(" && hasBalancedCall(value, cursor)) return true;
  }
  return false;
}

export function normalizeImplementationOwnedFieldName(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

export function isImplementationOwnedFieldName(value: string): boolean {
  const normalized = normalizeImplementationOwnedFieldName(value);
  if (implementationOwnedFieldNames.has(normalized)) return true;
  return normalized.startsWith("on") && !allowedOnPrefixedDomainFieldNames.has(normalized);
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
  if (/\b(?:import|require)\s*\(/i.test(value)
    || /\bnew\s+(?:[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*|\(\s*[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*\s*\))\s*\(/i.test(value)
    || containsJavascriptMemberCall(value)
    || /\b(?:async\s+)?function(?:\s*\*)?\s*(?:[A-Za-z_$][A-Za-z0-9_$]*\s*)?\([^)]*\)\s*\{/i.test(value)) {
    return "JavaScript calls and execution entry points are not allowed";
  }
  if (isCssSelectorText(trimmed)
    || isCssRuleText(trimmed)
    || /^@(?:charset|container|font-face|import|keyframes|layer|media|namespace|page|property|supports)\b/i.test(trimmed)) {
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

const CompiledStyleFragmentSchema = z.object({
  selectorToken: z.string().regex(/^(?:root|part:[A-Za-z][A-Za-z0-9_-]*)$/),
  state: z.enum(["normal", "hover", "active", "focus", "disabled", "selected", "error"]),
  declarations: StyleDeclarationV2Schema,
}).strict();

const CompiledStyleWarningSchema = z.object({
  code: z.string().trim().min(1).max(100).regex(/^[A-Z][A-Z0-9_]*$/),
  message: z.string().trim().min(1).max(500),
}).strict();

const MAX_PERSISTED_STYLE_BYTES = 32_768;
const persistedSelector = /^#domId(?:[ A-Za-z0-9_.:>-]{0,300})$/;
const persistedProperty = new Set([
  "background-color", "background-image", "border-color", "border-top-color", "border-right-color",
  "border-bottom-color", "border-left-color", "border-top-width", "border-right-width",
  "border-bottom-width", "border-left-width", "border-radius", "border-top-left-radius",
  "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius", "box-shadow",
  "color", "column-gap", "font-size", "font-weight", "gap", "letter-spacing", "line-height",
  "margin", "object-fit", "opacity", "outline", "outline-offset", "overflow", "padding",
  "padding-left", "padding-right", "padding-top", "padding-bottom", "text-align", "text-overflow",
  "transform", "transition", "white-space",
]);

function isBoundedPersistedStyleData(value: string): boolean {
  if (value.length > MAX_PERSISTED_STYLE_BYTES) return false;
  let cursor = 0;
  while (cursor < value.length) {
    const open = value.indexOf("{", cursor);
    const close = value.indexOf("}", open + 1);
    if (open <= cursor || close < 0 || value.indexOf("{", open + 1) !== -1 && value.indexOf("{", open + 1) < close) return false;
    const selector = value.slice(cursor, open);
    if (!selector.split(", ").every((entry) => persistedSelector.test(entry))) return false;
    const body = value.slice(open + 1, close);
    if (body.length === 0 || body.endsWith(";") || /[{}@<>]|!important|javascript\s*:|vbscript\s*:|expression\s*\(|behavior\s*:|\/\*|\*\//i.test(body)) return false;
    const declarations = body.split(";");
    if (declarations.length > 64 || declarations.some((declaration) => {
      const colon = declaration.indexOf(":");
      if (colon <= 0 || colon === declaration.length - 1) return true;
      const property = declaration.slice(0, colon);
      const cssValue = declaration.slice(colon + 1);
      if (!persistedProperty.has(property) || cssValue.length > 2_048 || /[{};]/.test(cssValue)) return true;
      const withoutApprovedAsset = cssValue.replace(
        /url\("project\/res\/images\/[0-9a-f]{64}\.(?:png|jpg|webp)"\)/g,
        "approved-asset",
      );
      return /\burl\s*\(/i.test(withoutApprovedAsset);
    })) return false;
    cursor = close + 1;
  }
  return cursor === value.length;
}

export const CompiledStyleSpecSchema = z.object({
  nativeFields: ImplementationDataRecordSchema,
  cssFragments: z.array(CompiledStyleFragmentSchema).max(128),
  styleDataNew: z.string().max(MAX_PERSISTED_STYLE_BYTES)
    .refine(isBoundedPersistedStyleData, "persisted styleDataNew must be bounded compiler-owned #domId CSS")
    .default(""),
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
    type NativeControl = z.infer<typeof UIImplementationControlV2Schema>;
    const controlsById = new Map(page.controls.map((control) => [control.id, control]));
    const controlIndexById = new Map<string, number>();
    const childrenByParent = new Map<string, NativeControl[]>();
    page.controls.forEach((control, controlIndex) => {
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
