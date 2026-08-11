import {
  ComponentStyleSpecSchema,
  ThemeSpecSchema,
  type ComponentStyleSpec,
  type ThemeSpec,
} from "@kf/contracts";

/** The only visual vocabulary module definitions may receive from a page theme. */
export const ModulePlanThemeSchema = ComponentStyleSpecSchema;

const ROLE_STYLE = {
  surface: (theme: ThemeSpec) => ({ backgroundColor: theme.surface, borderRadius: theme.radiusScale.medium, padding: theme.spacingUnit * 2 }),
  title: (theme: ThemeSpec) => ({ textColor: theme.textPrimary, fontWeight: 700 }),
  description: (theme: ThemeSpec) => ({ textColor: theme.textSecondary, lineHeight: 1.5 }),
  action: (theme: ThemeSpec) => ({ backgroundColor: theme.primary, textColor: theme.textPrimary, borderRadius: theme.radiusScale.small, padding: theme.spacingUnit }),
  accent: (theme: ThemeSpec) => ({ backgroundColor: theme.accent, borderRadius: theme.radiusScale.small }),
} as const;

export type ModuleThemeRole = keyof typeof ROLE_STYLE;

/**
 * Applies a small, reviewed semantic style role to a strict component style.
 * CSS/native conversion deliberately remains downstream in the existing Style
 * Adapter boundary.
 */
export function resolveModuleComponentStyle(
  themeInput: ThemeSpec,
  role: ModuleThemeRole | undefined,
  instanceStyle: ComponentStyleSpec,
): ComponentStyleSpec {
  const theme = ThemeSpecSchema.safeParse(themeInput);
  const style = ComponentStyleSpecSchema.safeParse(instanceStyle);
  if (!theme.success || !style.success) throw new Error("MODULE_THEME_INVALID_STYLE");
  if (role !== undefined && !(role in ROLE_STYLE)) throw new Error("MODULE_THEME_INVALID_STYLE");
  const themed = role === undefined ? {} : ROLE_STYLE[role](theme.data);
  const output = {
    ...(role === undefined ? {} : { role }),
    declarations: { ...themed, ...style.data.declarations },
    states: style.data.states,
  };
  const parsed = ComponentStyleSpecSchema.safeParse(output);
  if (!parsed.success) throw new Error("MODULE_THEME_INVALID_STYLE");
  return parsed.data;
}
