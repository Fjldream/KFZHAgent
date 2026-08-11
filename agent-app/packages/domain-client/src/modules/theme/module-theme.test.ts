import { describe, expect, it } from "vitest";
import { ModulePlanThemeSchema, resolveModuleComponentStyle } from "./module-theme.js";

const theme = {
  background: "#101827",
  surface: "#1E293B",
  primary: "#2563EB",
  accent: "#38BDF8",
  textPrimary: "#F8FAFC",
  textSecondary: "#94A3B8",
  fontFamily: "Inter",
  spacingUnit: 8,
  radiusScale: { small: 4, medium: 8, large: 16 },
} as const;

describe("module theme translation", () => {
  it("maps approved theme tokens into an exact strict component style without CSS or native fields", () => {
    const style = resolveModuleComponentStyle(theme, "surface", { declarations: { opacity: 0.9 }, states: {} });

    expect(style).toEqual({
      role: "surface",
      declarations: { backgroundColor: "#1E293B", borderRadius: 8, padding: 16, opacity: 0.9 },
      states: {},
    });
    expect(ModulePlanThemeSchema.parse(style)).toEqual(style);
  });

  it("rejects an invalid compiler-provided style rather than accepting arbitrary CSS", () => {
    expect(() => resolveModuleComponentStyle(theme, "title", {
      declarations: {},
      states: {},
      css: "body { display: none; }",
    } as never)).toThrow("MODULE_THEME_INVALID_STYLE");
  });
});
