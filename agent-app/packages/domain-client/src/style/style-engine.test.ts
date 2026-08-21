import { describe, expect, it } from "vitest";
import {
  ComponentStyleSpecV2Schema,
  type ApprovedAssetFacts,
  type ComponentStyleSpec,
  type ThemeSpec,
} from "@kf/contracts";
import type { z } from "zod";
import { KF36_RUNTIME_PROFILE } from "./runtime-profile.js";
import {
  assertStyleCompilationAccepted,
  compileControlStyle,
  compileResolvedStyle,
  listStyleCompilationIssues,
} from "./style-engine.js";
import { materializeScopedStyleFragment } from "./css-compiler.js";

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

type StyleV2 = z.infer<typeof ComponentStyleSpecV2Schema>;

function styleV2(styleSpec: Partial<StyleV2>): StyleV2 {
  return ComponentStyleSpecV2Schema.parse({ declarations: {}, states: {}, ...styleSpec });
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

  it.each([
    "url(javascript:alert(1))",
    "#ffffff;background-image:url(https://evil.invalid/x)",
  ])("rejects unsafe native background color %s before emission", (backgroundColor) => {
    expect(() => compileControlStyle({
      capabilityId: "button",
      theme: themeFixture,
      instanceStyle: style({ declarations: { backgroundColor } }),
      runtimeProfile: KF36_RUNTIME_PROFILE,
    })).toThrow(/UNSAFE_STYLE_VALUE/);
  });

  it("emits a valid native background color", () => {
    expect(compileControlStyle({
      capabilityId: "button",
      theme: themeFixture,
      instanceStyle: style({ declarations: { backgroundColor: "#ffffff" } }),
      runtimeProfile: KF36_RUNTIME_PROFILE,
    })).toEqual({
      nativeFields: { backgroundColor: "#ffffff" },
      styleDataNew: "",
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
        selectors: { button: { root: "#domId", parts: {} } },
        styleMaterialization: KF36_RUNTIME_PROFILE.styleMaterialization,
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
        styleMaterialization: KF36_RUNTIME_PROFILE.styleMaterialization,
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

  it("reports unsupported registry status and adapter warnings even for empty style intent", () => {
    const compiled = compileControlStyle({
      capabilityId: "table",
      theme: themeFixture,
      instanceStyle: style({}),
      runtimeProfile: KF36_RUNTIME_PROFILE,
    });

    expect(listStyleCompilationIssues("table", compiled)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "UNSUPPORTED_STYLE_CAPABILITY" }),
      expect.objectContaining({ code: "STYLE_ADAPTER_UNAVAILABLE" }),
    ]));
    expect(() => assertStyleCompilationAccepted("table", compiled))
      .toThrow(/UNSUPPORTED_STYLE_CAPABILITY|STYLE_ADAPTER_UNAVAILABLE/);
  });

  it("does not let a selector-evidence adapter bypass preserve-only policy", () => {
    const compiled = compileControlStyle({
      capabilityId: "easyui.1",
      theme: themeFixture,
      instanceStyle: style({ declarations: { fontSize: 14 } }),
      runtimeProfile: KF36_RUNTIME_PROFILE,
    });

    expect(compiled).toMatchObject({
      nativeFields: {},
      styleDataNew: "",
      unsupported: [{ token: "declarations.fontSize" }],
      warnings: [{ code: "STYLE_CAPABILITY_PRESERVE_ONLY" }],
    });
    expect(() => assertStyleCompilationAccepted("easyui.1", compiled))
      .toThrow(/UNSUPPORTED_STYLE_CAPABILITY|STYLE_CAPABILITY_PRESERVE_ONLY/);
  });

  it("rejects unexpected or invalid native fields at the style assignment boundary", () => {
    expect(() => assertStyleCompilationAccepted("button", {
      nativeFields: { styleDataNew: "#domId{display:none}" },
      styleDataNew: "",
      unsupported: [],
      warnings: [],
    })).toThrow(/UNEXPECTED_NATIVE_STYLE_FIELD/);

    expect(() => assertStyleCompilationAccepted("button", {
      nativeFields: { backgroundColor: "red" },
      styleDataNew: "",
      unsupported: [],
      warnings: [],
    })).toThrow(/INVALID_NATIVE_STYLE_FIELD/);
  });
});

describe("compileResolvedStyle", () => {
  const roleStyle = styleV2({
    role: "primary-action",
    declarations: { backgroundColor: "{theme.primary}", textColor: "#ffffff" },
    states: { hover: { backgroundColor: "#1d4ed8" } },
  });

  it("resolves theme tokens, the matched role, and instance overrides before splitting ownership", () => {
    const compiled = compileResolvedStyle({
      componentId: "visitor-primary-action",
      capabilityId: "button",
      theme: themeFixture,
      styleRole: "primary-action",
      roleStyle,
      instanceOverride: styleV2({
        role: "primary-action",
        declarations: { backgroundColor: "#0b6bcb", borderRadius: 8 },
        states: { hover: { textColor: "#f8fafc" } },
      }),
      approvedAssets: [],
      runtimeProfile: KF36_RUNTIME_PROFILE,
    });

    expect(compiled.nativeFields).toEqual({ backgroundColor: "#0b6bcb" });
    expect(compiled.cssFragments).toEqual([
      { selectorToken: "root", state: "normal", declarations: { textColor: "#ffffff", borderRadius: 8 } },
      { selectorToken: "root", state: "hover", declarations: { backgroundColor: "#1d4ed8", textColor: "#f8fafc" } },
    ]);
    expect(compiled.styleDataNew).toBe(
      "#domId .el-button{border-radius:8px;color:#ffffff}" +
      "#domId .el-button:hover{background-color:#1d4ed8;color:#f8fafc}",
    );
    expect(compiled.warnings).toEqual([]);
    expect(compiled.unsupported).toEqual([]);
  });

  it("accepts the full reviewed v2 color grammar for native-owned background fields", () => {
    const compiled = compileResolvedStyle({
      componentId: "named-color-action",
      capabilityId: "button",
      theme: themeFixture,
      styleRole: "named-action",
      roleStyle: styleV2({ role: "named-action", declarations: { backgroundColor: "rebeccapurple" } }),
      approvedAssets: [],
      runtimeProfile: KF36_RUNTIME_PROFILE,
    });

    expect(compiled.nativeFields).toEqual({ backgroundColor: "rebeccapurple" });
    expect(() => assertStyleCompilationAccepted("button", compiled)).not.toThrow();
  });

  it("compiles semantic parts and states from adapter-owned selector evidence", () => {
    const compiled = compileResolvedStyle({
      componentId: "visitor-tabs",
      capabilityId: "tabs",
      theme: themeFixture,
      styleRole: "navigation",
      roleStyle: styleV2({ role: "navigation" }),
      instanceOverride: styleV2({
        role: "navigation",
        parts: {
          tab: { declarations: {}, states: { selected: { textColor: "#111111" } } },
          "active-indicator": { declarations: { backgroundColor: "#2563eb" }, states: {} },
        },
      }),
      approvedAssets: [],
      runtimeProfile: KF36_RUNTIME_PROFILE,
    });

    expect(compiled.cssFragments).toEqual([
      { selectorToken: "part:tab", state: "selected", declarations: { textColor: "#111111" } },
      { selectorToken: "part:active-indicator", state: "normal", declarations: { backgroundColor: "#2563eb" } },
    ]);
    expect(compiled.scopedFragments?.map((fragment) => fragment.persistedSelector)).toEqual([
      "#domId .el-tabs__item.is-active",
      "#domId .el-tabs__active-bar",
    ]);
  });

  it.each([
    ["checkbox", "active"],
    ["radio", "active"],
    ["switch", "focus"],
    ["datetimepicker", "focus"],
  ] as const)("fails closed for %s.%s when the state has no proved runtime host", (capabilityId, state) => {
    expect(() => compileResolvedStyle({
      componentId: `unproved-${capabilityId}`,
      capabilityId,
      theme: themeFixture,
      styleRole: "field-choice",
      roleStyle: styleV2({
        role: "field-choice",
        states: { [state]: { textColor: "#111111" } },
      }),
      approvedAssets: [],
      runtimeProfile: KF36_RUNTIME_PROFILE,
    })).toThrow(new RegExp(`STYLE_STATE_UNSUPPORTED: ${capabilityId}\\.root\\.${state}`));
  });

  it("correlates persisted #domId CSS to distinct executable runtime DOM selectors", () => {
    const compile = (componentId: string) => compileResolvedStyle({
      componentId,
      capabilityId: "button",
      theme: themeFixture,
      styleRole: "primary-action",
      roleStyle,
      approvedAssets: [],
      runtimeProfile: KF36_RUNTIME_PROFILE,
    });
    const first = compile("visitor/action one");
    const repeated = compile("visitor/action one");
    const second = compile("visitor/action-one");

    expect(first.scopeToken).toBe(repeated.scopeToken);
    expect(first.scopeToken).not.toBe(second.scopeToken);
    expect(first.scopeToken).toMatch(/^kf36-[A-Za-z][A-Za-z0-9_-]*-[a-f0-9]{32}$/);
    expect(first.styleDataNew).toContain("#domId");
    expect(first.styleDataNew).not.toContain(first.scopeToken!);
    expect(first.scopedFragments?.every((fragment) => fragment.componentScopeToken === first.scopeToken)).toBe(true);
    expect(first.scopedFragments?.[0]?.componentCorrelationId).toBe("visitor/action one");
    expect(second.scopedFragments?.[0]?.componentCorrelationId).toBe("visitor/action-one");

    const firstRuntime = materializeScopedStyleFragment(first.scopedFragments![0]!, {
      componentCorrelationId: "visitor/action one",
      runtimeDomId: "k11111111-1111-4111-8111-111111111111",
    });
    const secondRuntime = materializeScopedStyleFragment(second.scopedFragments![0]!, {
      componentCorrelationId: "visitor/action-one",
      runtimeDomId: "k22222222-2222-4222-8222-222222222222",
    });
    expect(firstRuntime.selector).toBe(
      "#k11111111-1111-4111-8111-111111111111 .el-button",
    );
    expect(secondRuntime.selector).toBe(
      "#k22222222-2222-4222-8222-222222222222 .el-button",
    );
    expect(firstRuntime.cssText).toContain("#k11111111-1111-4111-8111-111111111111");
    expect(firstRuntime.cssText).not.toContain(secondRuntime.runtimeDomId);
    expect(secondRuntime.cssText).toContain("#k22222222-2222-4222-8222-222222222222");
    expect(secondRuntime.cssText).not.toContain(firstRuntime.runtimeDomId);
    expect(() => materializeScopedStyleFragment(first.scopedFragments![0]!, {
      componentCorrelationId: "visitor/action-one",
      runtimeDomId: "k22222222-2222-4222-8222-222222222222",
    })).toThrow(/STYLE_COMPONENT_CORRELATION_MISMATCH/);
  });

  it("compiles Task 4 scroll overflow through layout CSS ownership and never a native unknown field", () => {
    const compiled = compileResolvedStyle({
      componentId: "scroll-surface",
      capabilityId: "layout.4",
      theme: themeFixture,
      styleRole: "structure",
      roleStyle: styleV2({ role: "structure" }),
      instanceOverride: styleV2({ declarations: { overflow: "auto" } }),
      approvedAssets: [],
      runtimeProfile: KF36_RUNTIME_PROFILE,
    });

    expect(compiled.nativeFields).toEqual({});
    expect(compiled.cssFragments).toEqual([
      { selectorToken: "root", state: "normal", declarations: { overflow: "auto" } },
    ]);
    expect(compiled.styleDataNew).toBe("#domId{overflow:auto}");
  });

  it("resolves approved background assets to compiler-owned targets", () => {
    const sha256 = "c".repeat(64);
    const approvedAsset: ApprovedAssetFacts = {
      workspaceAssetId: "00000000-0000-4000-8000-000000000001",
      targetPath: `project/res/images/${sha256}.png`,
      mediaType: "image/png",
      sha256,
      sizeBytes: 64,
    };
    const compiled = compileResolvedStyle({
      componentId: "hero-image",
      capabilityId: "image",
      theme: themeFixture,
      styleRole: "hero",
      roleStyle: styleV2({ role: "hero" }),
      instanceOverride: styleV2({
        parts: {
          media: {
            declarations: { advanced: [{ kind: "background-image", assetId: "asset-00000000000040008000000000000001" }] },
            states: {},
          },
        },
      }),
      approvedAssets: [approvedAsset],
      runtimeProfile: KF36_RUNTIME_PROFILE,
    });

    expect(compiled.scopedFragments?.[0]?.resolvedAssets).toEqual([{
      assetId: "asset-00000000000040008000000000000001",
      targetPath: `project/res/images/${sha256}.png`,
      token: `asset-sha256:${sha256}`,
    }]);
    expect(compiled.styleDataNew).toBe(
      `#domId .el-image__inner{background-image:url("project/res/images/${sha256}.png")}`,
    );
  });

  it("fails closed for role mismatch, unsupported parts/states/properties, preserve-only policy, and forged profiles", () => {
    const base = {
      componentId: "strict-component",
      capabilityId: "tabs",
      theme: themeFixture,
      styleRole: "navigation",
      roleStyle: styleV2({ role: "navigation" }),
      approvedAssets: [],
      runtimeProfile: KF36_RUNTIME_PROFILE,
    };

    expect(() => compileResolvedStyle({ ...base, styleRole: "other" })).toThrow(/STYLE_ROLE_MISMATCH/);
    expect(() => compileResolvedStyle({
      ...base,
      instanceOverride: styleV2({ parts: { label: { declarations: { textColor: "#ffffff" }, states: {} } } }),
    })).toThrow(/STYLE_PART_UNSUPPORTED/);
    expect(() => compileResolvedStyle({
      ...base,
      instanceOverride: styleV2({ parts: { panel: { declarations: {}, states: { selected: { opacity: 1 } } } } }),
    })).toThrow(/STYLE_STATE_UNSUPPORTED/);
    expect(() => compileResolvedStyle({
      ...base,
      capabilityId: "input",
      instanceOverride: styleV2({ declarations: { objectFit: "cover" } }),
    })).toThrow(/STYLE_PROPERTY_UNSUPPORTED/);
    expect(() => compileResolvedStyle({
      ...base,
      capabilityId: "easyui.1",
    })).toThrow(/STYLE_CAPABILITY_PRESERVE_ONLY/);
    expect(() => compileResolvedStyle({
      ...base,
      runtimeProfile: {
        runtimeFamily: "kingfusion-client",
        runtimeVersion: "3.6",
        selectors: KF36_RUNTIME_PROFILE.selectors,
        styleMaterialization: KF36_RUNTIME_PROFILE.styleMaterialization,
      },
    })).toThrow(/UNTRUSTED_RUNTIME_PROFILE/);
  });
});
