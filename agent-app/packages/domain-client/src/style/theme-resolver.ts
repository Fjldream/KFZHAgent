import type { ComponentStyleSpec, StyleDeclaration, ThemeSpec } from "@kf/contracts";

type StyleState = keyof ComponentStyleSpec["states"];

const THEME_TOKEN = /^\{theme\.([^{}]+)\}$/;

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
  const stateNames = new Set<StyleState>([
    ...Object.keys(roleStyle.states),
    ...Object.keys(typeStyle.states),
    ...Object.keys(instanceStyle.states),
  ] as StyleState[]);

  const states = Object.fromEntries(
    [...stateNames].map((state) => [state, mergeDeclarations(
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
