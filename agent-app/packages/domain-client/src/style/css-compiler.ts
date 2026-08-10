import type { StyleDeclaration } from "@kf/contracts";
import {
  isTrustedKF36SelectorRoles,
  type SelectorRoles,
} from "./runtime-profile.js";

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

type NumericStyleProperty = "borderRadius" | "fontSize" | "fontWeight" | "lineHeight" | "padding" | "margin" | "gap" | "opacity";

const NUMERIC_CONSTRAINTS: Readonly<Record<NumericStyleProperty, {
  readonly min: number;
  readonly max: number;
  readonly integer?: boolean;
  readonly pixels?: boolean;
}>> = {
  borderRadius: { min: 0, max: 100, pixels: true },
  fontSize: { min: 8, max: 200, pixels: true },
  fontWeight: { min: 100, max: 900, integer: true },
  lineHeight: { min: 0.5, max: 4 },
  padding: { min: 0, max: 200, pixels: true },
  margin: { min: 0, max: 200, pixels: true },
  gap: { min: 0, max: 200, pixels: true },
  opacity: { min: 0, max: 1 },
};

const NUMERIC_PROPERTIES = new Set<NumericStyleProperty>([
  "borderRadius",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "padding",
  "margin",
  "gap",
  "opacity",
]);

const COLOR_PROPERTIES = new Set<keyof StyleDeclaration>([
  "backgroundColor",
  "textColor",
  "borderColor",
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

const UNSAFE_STYLE_VALUE = /url\(|@import|javascript:|expression\(|behavior:|[<>{};]|\/\*|\*\/|!important/i;
const HEX_COLOR = /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i;
const KEYWORD_COLORS = new Set(["transparent", "currentcolor"]);

function throwInvalidValue(): never {
  throw new Error("INVALID_STYLE_VALUE: invalid style value");
}

function assertSafeString(value: string): void {
  if (UNSAFE_STYLE_VALUE.test(value)) {
    throw new Error("UNSAFE_STYLE_VALUE: unsafe style value");
  }
}

function isStyleProperty(key: string): key is keyof StyleDeclaration {
  return Object.prototype.hasOwnProperty.call(PROPERTY_NAMES, key);
}

function isNumericProperty(key: keyof StyleDeclaration): key is NumericStyleProperty {
  return NUMERIC_PROPERTIES.has(key as NumericStyleProperty);
}

function serializeColor(value: unknown): string {
  if (typeof value !== "string") {
    return throwInvalidValue();
  }

  assertSafeString(value);
  if (!HEX_COLOR.test(value) && !KEYWORD_COLORS.has(value.toLowerCase())) {
    return throwInvalidValue();
  }
  return value;
}

function serializeNumeric(key: NumericStyleProperty, value: unknown): string {
  const constraint = NUMERIC_CONSTRAINTS[key];
  if (
    typeof value !== "number"
    || !Number.isFinite(value)
    || value < constraint.min
    || value > constraint.max
    || (constraint.integer === true && !Number.isInteger(value))
  ) {
    return throwInvalidValue();
  }

  return constraint.pixels === true ? `${value}px` : String(value);
}

function serializeValue(key: keyof StyleDeclaration, value: unknown): string {
  if (COLOR_PROPERTIES.has(key)) {
    return serializeColor(value);
  }

  if (isNumericProperty(key)) {
    return serializeNumeric(key, value);
  }

  if (key === "boxShadow") {
    if (typeof value !== "string" || !Object.prototype.hasOwnProperty.call(BOX_SHADOWS, value)) {
      return throwInvalidValue();
    }
    return BOX_SHADOWS[value as keyof typeof BOX_SHADOWS];
  }

  if (key === "textAlign") {
    if (value !== "left" && value !== "center" && value !== "right") {
      return throwInvalidValue();
    }
    return value;
  }

  return throwInvalidValue();
}

function serializeDeclarations(declarations: StyleDeclaration): string {
  return Object.entries(declarations)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      if (!isStyleProperty(key)) {
        return throwInvalidValue();
      }
      return {
        property: PROPERTY_NAMES[key],
        value: serializeValue(key, value),
      };
    })
    .sort((left, right) => left.property.localeCompare(right.property))
    .map(({ property, value }) => `${property}:${value}`)
    .join(";");
}

/** Serializes only contract declaration keys against a versioned KF selector role. */
export function compileScopedCss(
  selectorRoles: SelectorRoles,
  declarationsByState: DeclarationsByState,
): string {
  if (!isTrustedKF36SelectorRoles(selectorRoles)) {
    throw new Error("UNTRUSTED_SELECTOR_ROLES: untrusted selector roles");
  }

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
