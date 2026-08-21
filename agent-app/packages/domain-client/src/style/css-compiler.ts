import {
  NativeThemeSpecSchema,
  type ApprovedAssetFacts,
  type StyleDeclaration,
  type StyleDeclarationV2,
} from "@kf/contracts";
import { compileAdvancedStyles, type ResolvedStyleAsset } from "./advanced-style.js";
import {
  isTrustedKF36SelectorRoles,
  isTrustedKF36StylePart,
  type KFStylePartSelector,
  type SelectorRoles,
} from "./runtime-profile.js";

export type StyleState = "normal" | "hover" | "active" | "focus" | "disabled" | "selected" | "error";
export type DeclarationsByState = Partial<Record<StyleState, StyleDeclaration>>;

export interface SerializedStyleDeclarations {
  readonly body: string;
  readonly resolvedAssets: readonly ResolvedStyleAsset[];
}

export interface CompiledScopedStyleFragment {
  readonly componentScopeToken: string;
  readonly selectorToken: "root" | `part:${string}`;
  readonly state: StyleState;
  readonly declarations: StyleDeclarationV2;
  readonly selector: string;
  readonly cssText: string;
  readonly resolvedAssets: readonly ResolvedStyleAsset[];
}

const STATE_ORDER: readonly StyleState[] = [
  "normal", "hover", "active", "focus", "disabled", "selected", "error",
];
const STATE_SUFFIX: Readonly<Record<Exclude<StyleState, "normal">, string>> = {
  hover: ":hover",
  active: ":active",
  focus: ":focus",
  disabled: ":disabled",
  selected: ".is-selected",
  error: ".is-error",
};

type LegacyNumericProperty = "borderRadius" | "fontSize" | "fontWeight" | "lineHeight" | "padding" | "margin" | "gap" | "opacity";
type NumericPropertyV2 =
  | LegacyNumericProperty
  | "borderTopWidth" | "borderRightWidth" | "borderBottomWidth" | "borderLeftWidth"
  | "borderTopLeftRadius" | "borderTopRightRadius" | "borderBottomRightRadius" | "borderBottomLeftRadius"
  | "letterSpacing" | "paddingHorizontal" | "paddingVertical" | "iconSize" | "iconGap";
type StyleScalar = string | number | boolean;

interface NumericConstraint {
  readonly min: number;
  readonly max: number;
  readonly integer?: boolean;
  readonly pixels?: boolean;
}

const NUMERIC_CONSTRAINTS: Readonly<Record<NumericPropertyV2, NumericConstraint>> = Object.freeze({
  borderRadius: { min: 0, max: 100, pixels: true },
  borderTopWidth: { min: 0, max: 200, pixels: true },
  borderRightWidth: { min: 0, max: 200, pixels: true },
  borderBottomWidth: { min: 0, max: 200, pixels: true },
  borderLeftWidth: { min: 0, max: 200, pixels: true },
  borderTopLeftRadius: { min: 0, max: 100, pixels: true },
  borderTopRightRadius: { min: 0, max: 100, pixels: true },
  borderBottomRightRadius: { min: 0, max: 100, pixels: true },
  borderBottomLeftRadius: { min: 0, max: 100, pixels: true },
  fontSize: { min: 8, max: 200, pixels: true },
  fontWeight: { min: 100, max: 900, integer: true },
  lineHeight: { min: 0.5, max: 4 },
  letterSpacing: { min: -20, max: 100, pixels: true },
  padding: { min: 0, max: 200, pixels: true },
  paddingHorizontal: { min: 0, max: 200, pixels: true },
  paddingVertical: { min: 0, max: 200, pixels: true },
  margin: { min: 0, max: 200, pixels: true },
  gap: { min: 0, max: 200, pixels: true },
  opacity: { min: 0, max: 1 },
  iconSize: { min: 1, max: 200, pixels: true },
  iconGap: { min: 0, max: 200, pixels: true },
});
const LEGACY_NUMERIC_PROPERTIES = new Set<LegacyNumericProperty>([
  "borderRadius", "fontSize", "fontWeight", "lineHeight", "padding", "margin", "gap", "opacity",
]);

const LEGACY_PROPERTY_NAMES: Readonly<Record<keyof StyleDeclaration, string>> = {
  backgroundColor: "background-color",
  textColor: "color",
  borderColor: "border-color",
  borderRadius: "border-radius",
  fontSize: "font-size",
  fontWeight: "font-weight",
  lineHeight: "line-height",
  padding: "padding",
  margin: "margin",
  gap: "gap",
  boxShadow: "box-shadow",
  opacity: "opacity",
  textAlign: "text-align",
};
const V2_PROPERTY_KEYS = new Set<keyof StyleDeclarationV2>([
  "backgroundColor", "textColor", "borderColor",
  "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor",
  "borderRadius", "borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius",
  "fontSize", "fontWeight", "lineHeight", "letterSpacing", "padding", "paddingHorizontal", "paddingVertical",
  "margin", "gap", "boxShadow", "opacity", "textAlign", "truncate", "objectFit", "overflow",
  "iconSize", "iconColor", "iconGap", "focusRing", "transition", "advanced",
]);
const COLOR_PROPERTIES = Object.freeze({
  backgroundColor: "background-color",
  textColor: "color",
  borderColor: "border-color",
  borderTopColor: "border-top-color",
  borderRightColor: "border-right-color",
  borderBottomColor: "border-bottom-color",
  borderLeftColor: "border-left-color",
  iconColor: "color",
} as const satisfies Partial<Record<keyof StyleDeclarationV2, string>>);
const NUMERIC_PROPERTY_NAMES: Readonly<Record<NumericPropertyV2, readonly string[]>> = Object.freeze({
  borderRadius: ["border-radius"],
  borderTopWidth: ["border-top-width"],
  borderRightWidth: ["border-right-width"],
  borderBottomWidth: ["border-bottom-width"],
  borderLeftWidth: ["border-left-width"],
  borderTopLeftRadius: ["border-top-left-radius"],
  borderTopRightRadius: ["border-top-right-radius"],
  borderBottomRightRadius: ["border-bottom-right-radius"],
  borderBottomLeftRadius: ["border-bottom-left-radius"],
  fontSize: ["font-size"],
  fontWeight: ["font-weight"],
  lineHeight: ["line-height"],
  letterSpacing: ["letter-spacing"],
  padding: ["padding"],
  paddingHorizontal: ["padding-left", "padding-right"],
  paddingVertical: ["padding-bottom", "padding-top"],
  margin: ["margin"],
  gap: ["gap"],
  opacity: ["opacity"],
  iconSize: ["font-size"],
  iconGap: ["column-gap"],
});
const BOX_SHADOWS: Readonly<Record<NonNullable<StyleDeclarationV2["boxShadow"]>, string>> = {
  none: "none",
  small: "0 2px 8px rgba(0,0,0,.12)",
  medium: "0 8px 24px rgba(0,0,0,.18)",
  large: "0 16px 40px rgba(0,0,0,.24)",
};
const UNSAFE_STYLE_VALUE = /(?:\b(?:url|var|calc|expression)\s*\(|@|javascript\s*:|behavior\s*:|[<>{};]|\/\*|\*\/|!important)/i;
const HEX_COLOR = /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i;
const LEGACY_KEYWORD_COLORS = new Set(["transparent", "currentcolor"]);
const COMPONENT_SCOPE = /^kf36-[A-Za-z][A-Za-z0-9_-]{0,63}-[a-f0-9]{16,64}$/;
const MAX_SERIALIZED_STYLE_BYTES = 32_768;

function invalidLegacyValue(): never {
  throw new Error("INVALID_STYLE_VALUE: invalid style value");
}

function forbiddenV2Value(detail: string): never {
  throw new Error(`STYLE_VALUE_FORBIDDEN: ${detail}`);
}

function assertSafeString(value: string): void {
  if (UNSAFE_STYLE_VALUE.test(value)) throw new Error("UNSAFE_STYLE_VALUE: unsafe style value");
}

function isLegacyProperty(key: string): key is keyof StyleDeclaration {
  return Object.prototype.hasOwnProperty.call(LEGACY_PROPERTY_NAMES, key);
}

function serializeNumber(key: NumericPropertyV2, value: StyleScalar): string {
  const constraint = NUMERIC_CONSTRAINTS[key];
  if (typeof value !== "number"
    || !Number.isFinite(value)
    || Math.round(value * 100) / 100 !== value
    || value < constraint.min
    || value > constraint.max
    || (constraint.integer === true && !Number.isInteger(value))) {
    return forbiddenV2Value(key);
  }
  const normalized = Object.is(value, -0) ? 0 : value;
  return constraint.pixels === true ? `${normalized}px` : String(normalized);
}

/** Strict legacy native-field color serializer retained for existing patch allowlists. */
export function serializeStyleColor(value: string): string {
  assertSafeString(value);
  if (!HEX_COLOR.test(value) && !LEGACY_KEYWORD_COLORS.has(value.toLowerCase())) return invalidLegacyValue();
  return value;
}

function serializeV2Color(value: string): string {
  assertSafeString(value);
  if (value.includes("{theme.")) return forbiddenV2Value("unresolved theme color");
  const parsed = NativeThemeSpecSchema.shape.background.safeParse(value);
  if (!parsed.success) return forbiddenV2Value("color");
  return parsed.data;
}

function serializeLegacyNumeric(key: LegacyNumericProperty, value: StyleScalar): string {
  try {
    return serializeNumber(key, value);
  } catch {
    return invalidLegacyValue();
  }
}

function serializeLegacyValue(key: keyof StyleDeclaration, value: StyleScalar): string {
  if (key === "backgroundColor" || key === "textColor" || key === "borderColor") {
    return typeof value === "string" ? serializeStyleColor(value) : invalidLegacyValue();
  }
  if (LEGACY_NUMERIC_PROPERTIES.has(key as LegacyNumericProperty)) {
    return serializeLegacyNumeric(key as LegacyNumericProperty, value);
  }
  if (key === "boxShadow") {
    return typeof value === "string" && Object.prototype.hasOwnProperty.call(BOX_SHADOWS, value)
      ? BOX_SHADOWS[value as keyof typeof BOX_SHADOWS]
      : invalidLegacyValue();
  }
  if (key === "textAlign") {
    return value === "left" || value === "center" || value === "right" ? value : invalidLegacyValue();
  }
  return invalidLegacyValue();
}

function serializeLegacyDeclarations(declarations: StyleDeclaration): string {
  return Object.entries(declarations)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([key, value]) => {
      if (!isLegacyProperty(key)) return invalidLegacyValue();
      return { property: LEGACY_PROPERTY_NAMES[key], value: serializeLegacyValue(key, value) };
    })
    .sort((left, right) => left.property.localeCompare(right.property))
    .map(({ property, value }) => `${property}:${value}`)
    .join(";");
}

/** Serializes the strict Task 1 v2 declaration shape; raw keys and values fail closed. */
export function serializeStyleDeclarations(
  declarations: StyleDeclarationV2,
  approvedAssets: readonly ApprovedAssetFacts[],
): SerializedStyleDeclarations {
  for (const key of Object.keys(declarations)) {
    if (!V2_PROPERTY_KEYS.has(key as keyof StyleDeclarationV2)) {
      throw new Error(`STYLE_PROPERTY_FORBIDDEN: ${key}`);
    }
  }
  const output = new Map<string, string>();
  for (const [key, cssProperty] of Object.entries(COLOR_PROPERTIES) as Array<[keyof typeof COLOR_PROPERTIES, string]>) {
    const value = declarations[key];
    if (value !== undefined) output.set(cssProperty, serializeV2Color(value));
  }
  for (const [key, cssProperties] of Object.entries(NUMERIC_PROPERTY_NAMES) as Array<[NumericPropertyV2, readonly string[]]>) {
    const value = declarations[key];
    if (value === undefined) continue;
    const serialized = serializeNumber(key, value);
    cssProperties.forEach((cssProperty) => output.set(cssProperty, serialized));
  }
  if (declarations.boxShadow !== undefined) output.set("box-shadow", BOX_SHADOWS[declarations.boxShadow]);
  if (declarations.textAlign !== undefined) output.set("text-align", declarations.textAlign);
  if (declarations.objectFit !== undefined) output.set("object-fit", declarations.objectFit);
  if (declarations.overflow !== undefined) output.set("overflow", declarations.overflow);
  if (declarations.truncate !== undefined) {
    output.set("text-overflow", declarations.truncate ? "ellipsis" : "clip");
    output.set("white-space", declarations.truncate ? "nowrap" : "normal");
    if (declarations.truncate && declarations.overflow === undefined) output.set("overflow", "hidden");
  }
  if (declarations.focusRing !== undefined) {
    if (!Number.isFinite(declarations.focusRing.width)
      || Math.round(declarations.focusRing.width * 100) / 100 !== declarations.focusRing.width
      || declarations.focusRing.width < 1
      || declarations.focusRing.width > 8
      || !Number.isFinite(declarations.focusRing.offset)
      || Math.round(declarations.focusRing.offset * 100) / 100 !== declarations.focusRing.offset
      || declarations.focusRing.offset < 0
      || declarations.focusRing.offset > 16) {
      return forbiddenV2Value("focusRing");
    }
    const width = serializeNumber("borderTopWidth", declarations.focusRing.width);
    const offset = serializeNumber("borderTopWidth", declarations.focusRing.offset);
    output.set("outline", `${width} solid ${serializeV2Color(declarations.focusRing.color)}`);
    output.set("outline-offset", offset);
  }
  if (declarations.transition !== undefined) {
    const { property, durationMs, easing } = declarations.transition;
    if (!["opacity", "transform", "background-color", "border-color", "box-shadow", "color"].includes(property)
      || !Number.isInteger(durationMs)
      || durationMs < 0
      || durationMs > 600
      || !["linear", "ease", "ease-in", "ease-out", "ease-in-out"].includes(easing)) {
      return forbiddenV2Value("transition");
    }
    output.set("transition", `${property} ${durationMs}ms ${easing}`);
  }
  const advanced = compileAdvancedStyles(declarations.advanced ?? [], approvedAssets);
  advanced.declarations.forEach((declaration) => output.set(declaration.cssProperty, declaration.cssValue));
  const body = [...output.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([property, value]) => `${property}:${value}`)
    .join(";");
  if (body.length > MAX_SERIALIZED_STYLE_BYTES) {
    throw new Error(`STYLE_BUDGET_EXCEEDED: serialized declarations exceed ${MAX_SERIALIZED_STYLE_BYTES}`);
  }
  return Object.freeze({ body, resolvedAssets: advanced.resolvedAssets });
}

/** Compiles one evidence-owned semantic fragment; it never accepts a selector string. */
export function compileScopedStyleFragment(
  partSelector: KFStylePartSelector,
  componentScopeToken: string,
  state: StyleState,
  declarations: StyleDeclarationV2,
  approvedAssets: readonly ApprovedAssetFacts[],
): CompiledScopedStyleFragment {
  if (!isTrustedKF36StylePart(partSelector)) throw new Error("UNTRUSTED_STYLE_PART_SELECTOR");
  if (!COMPONENT_SCOPE.test(componentScopeToken)) throw new Error("STYLE_SCOPE_INVALID");
  const selector = state === "normal" ? partSelector.selector : partSelector.stateSelectors[state];
  if (selector === undefined) {
    throw new Error(`STYLE_STATE_UNSUPPORTED: ${partSelector.semanticPart}.${state}`);
  }
  const serialized = serializeStyleDeclarations(declarations, approvedAssets);
  const selectorToken = partSelector.semanticPart === "root"
    ? "root" as const
    : `part:${partSelector.semanticPart}` as const;
  return Object.freeze({
    componentScopeToken,
    selectorToken,
    state,
    declarations,
    selector,
    cssText: serialized.body === "" ? "" : `${selector}{${serialized.body}}`,
    resolvedAssets: serialized.resolvedAssets,
  });
}

/** Serializes legacy v1 declarations against the fixed root selector placeholder. */
export function compileScopedCss(
  selectorRoles: SelectorRoles,
  declarationsByState: DeclarationsByState,
): string {
  if (!isTrustedKF36SelectorRoles(selectorRoles)) {
    throw new Error("UNTRUSTED_SELECTOR_ROLES: untrusted selector roles");
  }
  return STATE_ORDER.flatMap((state) => {
    const declarations = declarationsByState[state];
    if (declarations === undefined) return [];
    const body = serializeLegacyDeclarations(declarations);
    if (body === "") return [];
    const selector = state === "normal" ? selectorRoles.root : `${selectorRoles.root}${STATE_SUFFIX[state]}`;
    return `${selector}{${body}}`;
  }).join("");
}
