import {
  ComponentStyleSpecV2Schema,
  type ComponentStyleSpec,
  type StyleDeclaration,
  type StyleDeclarationV2,
  type ThemeSpec,
} from "@kf/contracts";
import type { z } from "zod";

type StyleState = keyof ComponentStyleSpec["states"];

const THEME_TOKEN = /^\{theme\.([^{}]+)\}$/;
const STATE_ORDER: readonly StyleState[] = ["hover", "active", "focus", "disabled", "selected", "error"];
type ComponentStyleSpecV2 = z.infer<typeof ComponentStyleSpecV2Schema>;
type StyleStateV2 = keyof ComponentStyleSpecV2["states"];
const STATE_ORDER_V2: readonly StyleStateV2[] = STATE_ORDER;
const COLOR_KEYS = [
  "backgroundColor",
  "textColor",
  "borderColor",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "iconColor",
] as const satisfies readonly (keyof StyleDeclarationV2)[];

function resolveValue(theme: ThemeSpec, value: string | number): string | number {
  if (typeof value !== "string") {
    return value;
  }

  const match = THEME_TOKEN.exec(value);
  if (!match) {
    return value;
  }

  const themeValue = theme[match[1] as keyof ThemeSpec];
  if (typeof themeValue !== "string" && typeof themeValue !== "number") {
    throw new Error(`STYLE_TOKEN_UNRESOLVED: ${match[1]}`);
  }
  return themeValue;
}

function resolveDeclaration(theme: ThemeSpec, declarations: StyleDeclaration): StyleDeclaration {
  return Object.fromEntries(
    Object.entries(declarations)
      .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
      .map(([key, value]) => [key, resolveValue(theme, value)]),
  );
}

function resolveColor(theme: ThemeSpec, value: string): string {
  const resolved = resolveValue(theme, value);
  if (typeof resolved !== "string") {
    throw new Error("STYLE_TOKEN_TYPE_INVALID: color tokens must resolve to strings");
  }
  return resolved;
}

function resolveDeclarationV2(theme: ThemeSpec, declarations: StyleDeclarationV2): StyleDeclarationV2 {
  const resolved: StyleDeclarationV2 = { ...declarations };
  for (const key of COLOR_KEYS) {
    const value = declarations[key];
    if (typeof value === "string") Object.assign(resolved, { [key]: resolveColor(theme, value) });
  }
  if (declarations.focusRing !== undefined) {
    resolved.focusRing = {
      ...declarations.focusRing,
      color: resolveColor(theme, declarations.focusRing.color),
    };
  }
  if (declarations.advanced !== undefined) {
    resolved.advanced = declarations.advanced.map((declaration) => declaration.kind === "gradient"
      ? {
          ...declaration,
          stops: declaration.stops.map((stop) => ({ ...stop, color: resolveColor(theme, stop.color) })),
        }
      : { ...declaration });
  }
  return resolved;
}

function mergeDeclarationV2(
  theme: ThemeSpec,
  roleDeclarations: StyleDeclarationV2 | undefined,
  instanceDeclarations: StyleDeclarationV2 | undefined,
): StyleDeclarationV2 {
  return {
    ...resolveDeclarationV2(theme, roleDeclarations ?? {}),
    ...resolveDeclarationV2(theme, instanceDeclarations ?? {}),
  };
}

function mergeStatesV2(
  theme: ThemeSpec,
  roleStates: ComponentStyleSpecV2["states"],
  instanceStates: ComponentStyleSpecV2["states"],
): ComponentStyleSpecV2["states"] {
  return Object.fromEntries(STATE_ORDER_V2.flatMap((state) => {
    const roleDeclarations = roleStates[state];
    const instanceDeclarations = instanceStates[state];
    return roleDeclarations === undefined && instanceDeclarations === undefined
      ? []
      : [[state, mergeDeclarationV2(theme, roleDeclarations, instanceDeclarations)]];
  }));
}

function mergePartsV2(
  theme: ThemeSpec,
  roleParts: ComponentStyleSpecV2["parts"],
  instanceParts: ComponentStyleSpecV2["parts"],
): ComponentStyleSpecV2["parts"] {
  const partIds = [...new Set([
    ...Object.keys(roleParts ?? {}),
    ...Object.keys(instanceParts ?? {}),
  ])].sort();
  if (partIds.length === 0) return undefined;
  return Object.fromEntries(partIds.map((partId) => {
    const rolePart = roleParts?.[partId];
    const instancePart = instanceParts?.[partId];
    return [partId, {
      declarations: mergeDeclarationV2(theme, rolePart?.declarations, instancePart?.declarations),
      states: mergeStatesV2(theme, rolePart?.states ?? {}, instancePart?.states ?? {}),
    }];
  }));
}

function mergeDeclarations(
  theme: ThemeSpec,
  roleStyle: ComponentStyleSpec,
  typeStyle: ComponentStyleSpec,
  instanceStyle: ComponentStyleSpec,
  getDeclarations: (style: ComponentStyleSpec) => StyleDeclaration | undefined,
): StyleDeclaration {
  return [roleStyle, typeStyle, instanceStyle].reduce<StyleDeclaration>((merged, style) => ({
    ...merged,
    ...resolveDeclaration(theme, getDeclarations(style) ?? {}),
  }), {});
}

/**
 * Combines themed role declarations, type declarations, and instance
 * declarations. A token is only interpreted when the complete value is a
 * `{theme.<key>}` reference; every other string remains literal input.
 */
export function resolveComponentStyle(
  theme: ThemeSpec,
  roleStyle: ComponentStyleSpec,
  typeStyle: ComponentStyleSpec,
  instanceStyle: ComponentStyleSpec,
): ComponentStyleSpec {
  const states = Object.fromEntries(
    STATE_ORDER
      .filter((state) => roleStyle.states[state] || typeStyle.states[state] || instanceStyle.states[state])
      .map((state) => [state, mergeDeclarations(
      theme,
      roleStyle,
      typeStyle,
      instanceStyle,
      (style) => style.states[state],
    )]),
  );

  return {
    declarations: mergeDeclarations(theme, roleStyle, typeStyle, instanceStyle, (style) => style.declarations),
    states,
  };
}


/** Resolves the native v2 token → role → instance hierarchy by semantic part and state. */
export function resolveStyle(
  theme: ThemeSpec,
  roleStyle: ComponentStyleSpecV2,
  instanceOverride: ComponentStyleSpecV2,
): ComponentStyleSpecV2 {
  if (roleStyle.role !== undefined
    && instanceOverride.role !== undefined
    && roleStyle.role !== instanceOverride.role) {
    throw new Error(`STYLE_ROLE_MISMATCH: ${roleStyle.role} != ${instanceOverride.role}`);
  }
  const parts = mergePartsV2(theme, roleStyle.parts, instanceOverride.parts);
  return {
    ...(instanceOverride.role !== undefined
      ? { role: instanceOverride.role }
      : roleStyle.role !== undefined ? { role: roleStyle.role } : {}),
    declarations: mergeDeclarationV2(theme, roleStyle.declarations, instanceOverride.declarations),
    states: mergeStatesV2(theme, roleStyle.states, instanceOverride.states),
    ...(parts === undefined ? {} : { parts }),
  };
}
