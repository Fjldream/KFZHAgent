import { describe, expect, it } from "vitest";
import type { ComponentStyleSpec, ThemeSpec } from "@kf/contracts";
import { KF36_RUNTIME_PROFILE } from "./runtime-profile.js";
import { compileControlStyle } from "./style-engine.js";

const themeFixture: ThemeSpec = {
  background: "#0b1220",
  surface: "#172338",
  primary: "#2563eb",
  accent: "#22c55e",
  textPrimary: "#ffffff",
  textSecondary: "#94a3b8",
  fontFamily: "Microsoft YaHei",
  spacingUnit: 8,
  radiusScale: { small: 4, medium: 8, large: 12 },
};

function style(styleSpec: Partial<ComponentStyleSpec>): ComponentStyleSpec {
  return { declarations: {}, states: {}, ...styleSpec };
}

describe("compileControlStyle", () => {
  it("splits a button style into native fields and scoped CSS", () => {
    expect(compileControlStyle({
      capabilityId: "button",
      theme: themeFixture,
      instanceStyle: style({
        declarations: {
          backgroundColor: "{theme.primary}",
          textColor: "#ffffff",
          fontSize: 14,
          fontWeight: 600,
          borderRadius: 8,
        },
        states: { hover: { backgroundColor: "#1d4ed8" } },
      }),
      runtimeProfile: KF36_RUNTIME_PROFILE,
    })).toEqual({
      nativeFields: { backgroundColor: "#2563eb" },
      styleDataNew: "#domId{border-radius:8px;color:#ffffff;font-size:14px;font-weight:600}" +
        "#domId:hover{background-color:#1d4ed8}",
      unsupported: [],
      warnings: [],
    });
  });

  it("resolves role, type, and instance layers before adapting them", () => {
    expect(compileControlStyle({
      capabilityId: "button",
      theme: themeFixture,
      roleStyle: style({ declarations: { backgroundColor: "{theme.primary}", fontSize: 12 } }),
      typeStyle: style({ declarations: { backgroundColor: "#1d4ed8", fontSize: 13 } }),
      instanceStyle: style({ declarations: { fontSize: 14 } }),
      runtimeProfile: KF36_RUNTIME_PROFILE,
    })).toMatchObject({
      nativeFields: { backgroundColor: "#1d4ed8" },
      styleDataNew: "#domId{font-size:14px}",
      unsupported: [],
    });
  });

  it("records unsupported state styles", () => {
    const result = compileControlStyle({
      capabilityId: "text",
      theme: themeFixture,
      instanceStyle: style({
        declarations: {},
        states: { selected: { backgroundColor: "#ffffff" } },
      }),
      runtimeProfile: KF36_RUNTIME_PROFILE,
    });

    expect(result.unsupported).toContainEqual(expect.objectContaining({
      token: "states.selected.backgroundColor",
    }));
    expect(result.styleDataNew).toBe("");
  });

  it("returns every declaration as unsupported when the capability has no registered adapter", () => {
    const result = compileControlStyle({
      capabilityId: "table",
      theme: themeFixture,
      instanceStyle: style({
        declarations: { backgroundColor: "#ffffff" },
        states: { hover: { textColor: "#000000" } },
      }),
      runtimeProfile: KF36_RUNTIME_PROFILE,
    });

    expect(result).toMatchObject({
      nativeFields: {},
      styleDataNew: "",
      unsupported: [
        { token: "declarations.backgroundColor" },
        { token: "states.hover.textColor" },
      ],
      warnings: [{ code: "STYLE_ADAPTER_UNAVAILABLE" }],
    });
  });

  it("preserves the trusted selector-role boundary", () => {
    expect(() => compileControlStyle({
      capabilityId: "button",
      theme: themeFixture,
      instanceStyle: style({ declarations: { fontSize: 14 } }),
      runtimeProfile: {
        runtimeFamily: "kingfusion-client",
        runtimeVersion: "3.6",
        selectors: { button: { root: "#domId" } },
      },
    })).toThrow(/UNTRUSTED_SELECTOR_ROLES/);
  });

  it("reports every CSS declaration when a reviewed adapter lacks runtime selector roles", () => {
    const result = compileControlStyle({
      capabilityId: "button",
      theme: themeFixture,
      instanceStyle: style({
        declarations: { fontSize: 14 },
        states: { hover: { textColor: "#ffffff" } },
      }),
      runtimeProfile: {
        runtimeFamily: "kingfusion-client",
        runtimeVersion: "3.6",
        selectors: {},
      },
    });

    expect(result).toMatchObject({
      unsupported: [
        { token: "declarations.fontSize" },
        { token: "states.hover.textColor" },
      ],
      warnings: [{ code: "STYLE_SELECTOR_UNAVAILABLE" }],
    });
  });
});
