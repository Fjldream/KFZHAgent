import {
  ComponentStyleSpecSchema,
  ThemeSpecSchema,
  type ComponentStyleSpec,
  type ThemeSpec,
} from "@kf/contracts";

/** 只有视觉词汇表模块定义可能从页面主题接收。 */
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
 * 为严格组件样式应用一个小而审查过的语义风格角色。
 * CSS/原生转换故意在现有的样式适配器边界下游。
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
