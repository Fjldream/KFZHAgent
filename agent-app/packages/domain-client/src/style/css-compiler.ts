import type { StyleDeclaration } from "@kf/contracts";
import type { SelectorRoles } from "./runtime-profile.js";

export type StyleState = "normal" | "hover" | "active" | "focus" | "disabled" | "selected" | "error";
export type DeclarationsByState = Partial<Record<StyleState, StyleDeclaration>>;

const STATE_ORDER: readonly StyleState[] = [
  "normal",
  "hover",
  "active",
  "focus",
  "disabled",
  "selected",
  "error",
];

const STATE_SUFFIX: Readonly<Record<Exclude<StyleState, "normal">, string>> = {
  hover: ":hover",
  active: ":active",
  focus: ":focus",
  disabled: ":disabled",
  selected: ".is-selected",
  error: ".is-error",
};

const PIXEL_PROPERTIES = new Set<keyof StyleDeclaration>([
  "borderRadius",
  "fontSize",
  "padding",
  "margin",
  "gap",
]);

const PROPERTY_NAMES: Readonly<Record<keyof StyleDeclaration, string>> = {
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

const BOX_SHADOWS: Readonly<Record<NonNullable<StyleDeclaration["boxShadow"]>, string>> = {
  none: "none",
  small: "0 2px 8px rgba(0,0,0,.12)",
  medium: "0 8px 24px rgba(0,0,0,.18)",
  large: "0 16px 40px rgba(0,0,0,.24)",
};

const UNSAFE_STYLE_VALUE = /url\(|@import|javascript:|expression\(|behavior:|[<>{}]/i;

function assertSafeValue(value: string): void {
  if (UNSAFE_STYLE_VALUE.test(value)) {
    throw new Error("UNSAFE_STYLE_VALUE: unsafe style value");
  }
}

function serializeValue(key: keyof StyleDeclaration, value: NonNullable<StyleDeclaration[keyof StyleDeclaration]>): string {
  if (typeof value === "string") {
    assertSafeValue(value);
  }

  if (key === "boxShadow") {
    return BOX_SHADOWS[value as NonNullable<StyleDeclaration["boxShadow"]>];
  }

  if (typeof value === "number" && PIXEL_PROPERTIES.has(key)) {
    return `${value}px`;
  }

  return String(value);
}

function serializeDeclarations(declarations: StyleDeclaration): string {
  return (Object.keys(declarations) as (keyof StyleDeclaration)[])
    .filter((key) => declarations[key] !== undefined)
    .map((key) => ({
      property: PROPERTY_NAMES[key],
      value: serializeValue(key, declarations[key]!),
    }))
    .sort((left, right) => left.property.localeCompare(right.property))
    .map(({ property, value }) => `${property}:${value}`)
    .join(";");
}

/** Serializes only contract declaration keys against a versioned KF selector role. */
export function compileScopedCss(
  selectorRoles: SelectorRoles,
  declarationsByState: DeclarationsByState,
): string {
  return STATE_ORDER.flatMap((state) => {
    const declarations = declarationsByState[state];
    if (!declarations) {
      return [];
    }

    const body = serializeDeclarations(declarations);
    if (!body) {
      return [];
    }

    const selector = state === "normal"
      ? selectorRoles.root
      : `${selectorRoles.root}${STATE_SUFFIX[state]}`;
    return `${selector}{${body}}`;
  }).join("");
}
