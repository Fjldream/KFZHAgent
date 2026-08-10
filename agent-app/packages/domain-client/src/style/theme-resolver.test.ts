import { describe, expect, it } from "vitest";
import type { ComponentStyleSpec, ThemeSpec } from "@kf/contracts";
import { resolveComponentStyle } from "./theme-resolver.js";

const theme: ThemeSpec = {
  background: "#0b1220",
  surface: "#131d2e",
  primary: "#2f81f7",
  accent: "#22c55e",
  textPrimary: "#f8fafc",
  textSecondary: "#94a3b8",
  fontFamily: "Microsoft YaHei",
  spacingUnit: 8,
  radiusScale: { small: 4, medium: 8, large: 12 },
};

function style(style: Partial<ComponentStyleSpec>): ComponentStyleSpec {
  return { declarations: {}, states: {}, ...style };
}

describe("resolveComponentStyle", () => {
  it("resolves exact theme tokens and applies layer precedence", () => {
    expect(resolveComponentStyle(
      theme,
      style({ declarations: { backgroundColor: "{theme.primary}", textColor: "{theme.textPrimary}", padding: 8 } }),
      style({ declarations: { backgroundColor: "#1d4ed8", fontSize: 14 } }),
      style({ declarations: { padding: 16 } }),
    ).declarations).toEqual({
      backgroundColor: "#1d4ed8",
      textColor: "#f8fafc",
      padding: 16,
      fontSize: 14,
    });
  });

  it("merges each state independently with the same precedence", () => {
    expect(resolveComponentStyle(
      theme,
      style({ states: { hover: { backgroundColor: "{theme.primary}", textColor: "#ffffff" } } }),
      style({ states: { hover: { backgroundColor: "#1d4ed8" }, focus: { borderColor: "{theme.accent}" } } }),
      style({ states: { hover: { textColor: "#cbd5e1" } } }),
    ).states).toEqual({
      hover: { backgroundColor: "#1d4ed8", textColor: "#cbd5e1" },
      focus: { borderColor: "#22c55e" },
    });
  });

  it("rejects missing exact theme tokens", () => {
    expect(() => resolveComponentStyle(
      theme,
      style({ declarations: { backgroundColor: "{theme.unknown}" } }),
      style({}),
      style({}),
    )).toThrow(/STYLE_TOKEN_UNRESOLVED/);
  });

  it("does not resolve token-like strings that are not exact tokens", () => {
    expect(resolveComponentStyle(
      theme,
      style({ declarations: { backgroundColor: "linear-gradient({theme.primary}, #fff)" } }),
      style({}),
      style({}),
    ).declarations.backgroundColor).toBe("linear-gradient({theme.primary}, #fff)");
  });
});
