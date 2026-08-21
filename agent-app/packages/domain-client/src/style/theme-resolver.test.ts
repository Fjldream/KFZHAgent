import { describe, expect, it } from "vitest";
import { ComponentStyleSpecV2Schema, type ComponentStyleSpec, type ThemeSpec } from "@kf/contracts";
import type { z } from "zod";
import { resolveComponentStyle, resolveStyle } from "./theme-resolver.js";

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

type StyleV2 = z.infer<typeof ComponentStyleSpecV2Schema>;

function styleV2(styleSpec: Partial<StyleV2>): StyleV2 {
  return ComponentStyleSpecV2Schema.parse({ declarations: {}, states: {}, ...styleSpec });
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

  it("emits equivalent state layers in fixed supported-state order", () => {
    const selectedThenHover = style({
      states: {
        selected: { borderColor: "#1d4ed8" },
        hover: { backgroundColor: "#2f81f7" },
      },
    });
    const hoverThenSelected = style({
      states: {
        hover: { backgroundColor: "#2f81f7" },
        selected: { borderColor: "#1d4ed8" },
      },
    });

    const first = resolveComponentStyle(theme, selectedThenHover, style({}), style({}));
    const second = resolveComponentStyle(theme, hoverThenSelected, style({}), style({}));

    expect(first.states).toEqual(second.states);
    expect(Object.keys(first.states)).toEqual(["hover", "selected"]);
  });

  it("deep-merges role and instance root, parts, and states after resolving tokens", () => {
    const resolved = resolveStyle(
      theme,
      styleV2({
        role: "primary-action",
        declarations: {
          backgroundColor: "{theme.primary}",
          focusRing: { color: "{theme.accent}", width: 2, offset: 2 },
        },
        states: { hover: { textColor: "{theme.textPrimary}", opacity: 0.9 } },
        parts: {
          icon: {
            declarations: { iconColor: "{theme.textPrimary}", iconSize: 18, iconGap: 8 },
            states: { hover: { opacity: 0.8 } },
          },
        },
      }),
      styleV2({
        role: "primary-action",
        declarations: { backgroundColor: "#0b6bcb", focusRing: { color: "#ffffff", width: 3, offset: 0 } },
        states: { hover: { opacity: 0 } },
        parts: {
          icon: {
            declarations: { iconSize: 20, iconGap: 0 },
            states: { hover: { opacity: 0 } },
          },
          label: { declarations: { truncate: true }, states: {} },
        },
      }),
    );

    expect(resolved).toEqual({
      role: "primary-action",
      declarations: {
        backgroundColor: "#0b6bcb",
        focusRing: { color: "#ffffff", width: 3, offset: 0 },
      },
      states: { hover: { textColor: "#f8fafc", opacity: 0 } },
      parts: {
        icon: {
          declarations: { iconColor: "#f8fafc", iconSize: 20, iconGap: 0 },
          states: { hover: { opacity: 0 } },
        },
        label: { declarations: { truncate: true }, states: {} },
      },
    });
  });

  it("preserves false, zero, and an intentionally empty advanced override", () => {
    const resolved = resolveStyle(
      theme,
      styleV2({
        declarations: {
          truncate: true,
          opacity: 0.8,
          paddingHorizontal: 16,
          advanced: [{
            kind: "gradient",
            angle: 90,
            stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }],
          }],
        },
      }),
      styleV2({ declarations: { truncate: false, opacity: 0, paddingHorizontal: 0, advanced: [] } }),
    );

    expect(resolved.declarations).toMatchObject({
      truncate: false,
      opacity: 0,
      paddingHorizontal: 0,
      advanced: [],
    });
  });

  it("rejects unresolved tokens inside nested part and advanced declarations", () => {
    expect(() => resolveStyle(
      theme,
      styleV2({
        parts: {
          media: {
            declarations: {
              advanced: [{
                kind: "gradient",
                angle: 0,
                stops: [{ offset: 0, color: "{theme.primary}" }, { offset: 1, color: "{theme.unknown}" }],
              }],
            },
            states: {},
          },
        },
      }),
      styleV2({}),
    )).toThrow(/STYLE_TOKEN_UNRESOLVED: unknown/);
  });
});
