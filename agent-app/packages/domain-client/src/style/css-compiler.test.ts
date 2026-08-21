import { describe, expect, it } from "vitest";
import type { ApprovedAssetFacts, StyleDeclarationV2 } from "@kf/contracts";
import * as cssCompilerModule from "./css-compiler.js";
import {
  compileScopedCss,
  compileScopedStyleFragment,
  serializeStyleColor,
  serializeStyleDeclarations,
} from "./css-compiler.js";
import { KF36_RUNTIME_PROFILE, type SelectorRoles } from "./runtime-profile.js";

const sha256 = "b".repeat(64);
const approvedAsset: ApprovedAssetFacts = {
  workspaceAssetId: "00000000-0000-4000-8000-000000000001",
  targetPath: `project/res/images/${sha256}.png`,
  mediaType: "image/png",
  sha256,
  sizeBytes: 64,
};
const modelAssetId = "asset-00000000000040008000000000000001";

describe("compileScopedCss", () => {
  const buttonSelectorRoles = KF36_RUNTIME_PROFILE.selectors.button!;

  it("does not publish a runtime-DOM materializer from the project compilation boundary", () => {
    expect(Reflect.has(cssCompilerModule, "materializeScopedStyleCollection")).toBe(false);
    expect(Reflect.has(cssCompilerModule, "materializeScopedStyleFragment")).toBe(false);
  });

  it("emits deterministic scoped CSS", () => {
    expect(compileScopedCss(buttonSelectorRoles, {
      normal: { borderRadius: 8, boxShadow: "medium" },
      hover: { backgroundColor: "#1d4ed8" },
    })).toBe(
      "#domId{border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.18)}" +
      "#domId:hover{background-color:#1d4ed8}",
    );
  });

  it("exports the strict color serializer used by native style adapters", () => {
    expect(serializeStyleColor("#ffffff")).toBe("#ffffff");
    expect(() => serializeStyleColor("url(javascript:alert(1))"))
      .toThrow(/UNSAFE_STYLE_VALUE/);
    expect(() => serializeStyleColor("#ffffff;color:red"))
      .toThrow(/UNSAFE_STYLE_VALUE/);
  });

  it.each(["url(https://evil.invalid/x)", "expression(alert(1))", "javascript:alert(1)", "@import x"])(
    "rejects unsafe value %s",
    (value) => expect(() => compileScopedCss(buttonSelectorRoles, {
      normal: { backgroundColor: value },
    })).toThrow(/unsafe style value/i),
  );

  it("uses only the fixed mapping for numeric pixel fields", () => {
    expect(compileScopedCss(buttonSelectorRoles, {
      normal: { fontWeight: 600, lineHeight: 1.5, opacity: 0.8 },
    })).toBe("#domId{font-weight:600;line-height:1.5;opacity:0.8}");
  });

  it("emits only supported state selectors", () => {
    expect(compileScopedCss(buttonSelectorRoles, {
      disabled: { textColor: "#64748b" },
      selected: { borderColor: "#1d4ed8" },
      error: { backgroundColor: "#fee2e2" },
    })).toBe(
      "#domId:disabled{color:#64748b}" +
      "#domId.is-selected{border-color:#1d4ed8}" +
      "#domId.is-error{background-color:#fee2e2}",
    );
  });

  it.each(["behavior: url(x)", "<style>", "x{color:red}", "https://example.invalid/>"])(
    "rejects other unsafe syntax %s",
    (value) => expect(() => compileScopedCss(buttonSelectorRoles, {
      normal: { textColor: value },
    })).toThrow(/unsafe style value/i),
  );

  it.each([{ root: "#domId", parts: {} }, { root: "body", parts: {} }, { root: "#domId, body", parts: {} }])(
    "rejects untrusted selector roles %o",
    (selectorRoles) => expect(() => compileScopedCss(selectorRoles as SelectorRoles, {
      normal: { backgroundColor: "#1d4ed8" },
    })).toThrow(/untrusted selector roles/i),
  );

  it.each(["red;position:fixed", "#ffffff/* injected */", "#ffffff!important", "red"])(
    "rejects injected or invalid color value %s",
    (value) => expect(() => compileScopedCss(buttonSelectorRoles, {
      normal: { textColor: value },
    })).toThrow(/unsafe style value|invalid style value/i),
  );

  it.each([
    ["fontSize", 201],
    ["fontWeight", 550.5],
    ["opacity", Number.POSITIVE_INFINITY],
  ] as const)("rejects invalid numeric declaration %s=%s", (key, value) => {
    expect(() => compileScopedCss(buttonSelectorRoles, {
      normal: { [key]: value },
    })).toThrow(/invalid style value/i);
  });

  it("serializes the complete v2 declaration vocabulary in deterministic property order", () => {
    expect(serializeStyleDeclarations({
      backgroundColor: "rgb(10 20 30 / 50%)",
      textColor: "rebeccapurple",
      borderTopWidth: 1,
      borderRightWidth: 2,
      borderBottomWidth: 3,
      borderLeftWidth: 4,
      borderTopColor: "#111111",
      borderRightColor: "#222222",
      borderBottomColor: "#333333",
      borderLeftColor: "#444444",
      borderTopLeftRadius: 6,
      borderTopRightRadius: 8,
      borderBottomRightRadius: 10,
      borderBottomLeftRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      letterSpacing: 0.5,
      truncate: true,
      objectFit: "cover",
      overflow: "auto",
      iconSize: 18,
      iconColor: "#ffffff",
      iconGap: 8,
      focusRing: { color: "#2563eb", width: 2, offset: 2 },
      transition: { property: "opacity", durationMs: 180, easing: "ease-out" },
      advanced: [
        { kind: "gradient", angle: 135, stops: [{ offset: 0, color: "#163a5f" }, { offset: 1, color: "#e47b32" }] },
        { kind: "background-image", assetId: modelAssetId },
        { kind: "transform", translateX: 4, translateY: -2, scale: 1.02, rotate: 2 },
      ],
    }, [approvedAsset])).toEqual({
      body: `background-color:rgb(10 20 30 / 50%);background-image:linear-gradient(135deg,#163a5f 0%,#e47b32 100%),url("project/res/images/${sha256}.png");border-bottom-color:#333333;border-bottom-left-radius:12px;border-bottom-right-radius:10px;border-bottom-width:3px;border-left-color:#444444;border-left-width:4px;border-right-color:#222222;border-right-width:2px;border-top-color:#111111;border-top-left-radius:6px;border-top-right-radius:8px;border-top-width:1px;color:#ffffff;column-gap:8px;font-size:18px;letter-spacing:0.5px;object-fit:cover;outline:2px solid #2563eb;outline-offset:2px;overflow:auto;padding-bottom:12px;padding-left:16px;padding-right:16px;padding-top:12px;text-overflow:ellipsis;transform:translateX(4px) translateY(-2px) scale(1.02) rotate(2deg);transition:opacity 180ms ease-out;white-space:nowrap`,
      resolvedAssets: [{
        assetId: modelAssetId,
        targetPath: `project/res/images/${sha256}.png`,
        token: `asset-sha256:${sha256}`,
      }],
    });
  });

  it("emits explicit false and zero values while deduplicating derived declarations", () => {
    expect(serializeStyleDeclarations({
      opacity: 0,
      paddingHorizontal: 0,
      truncate: false,
      overflow: "visible",
      transition: { property: "opacity", durationMs: 0, easing: "linear" },
    }, [])).toEqual({
      body: "opacity:0;overflow:visible;padding-left:0px;padding-right:0px;text-overflow:clip;transition:opacity 0ms linear;white-space:normal",
      resolvedAssets: [],
    });
  });

  it("compiles a branded semantic part and evidence-owned state to a scoped fragment", () => {
    expect(compileScopedStyleFragment(
      KF36_RUNTIME_PROFILE.selectors.tabs!.parts.tab!,
      "kf36-visitor-tabs-0123456789abcdef",
      "visitor-tabs",
      "selected",
      { backgroundColor: "#ffffff", textColor: "#111111" },
      [],
    )).toMatchObject({
      componentScopeToken: "kf36-visitor-tabs-0123456789abcdef",
      componentCorrelationId: "visitor-tabs",
      selectorToken: "part:tab",
      state: "selected",
      persistedSelector: "#domId .el-tabs__item.is-active",
      persistedCssText: "#domId .el-tabs__item.is-active{background-color:#ffffff;color:#111111}",
    });
  });

  it("rejects untrusted part mappings, malformed scopes, and unsupported evidence states", () => {
    const trusted = KF36_RUNTIME_PROFILE.selectors.tabs!.parts.tab!;
    expect(() => compileScopedStyleFragment({ ...trusted }, "kf36-tabs-0123456789abcdef", "tabs", "normal", {}, []))
      .toThrow(/UNTRUSTED_STYLE_PART_SELECTOR/);
    expect(() => compileScopedStyleFragment(trusted, "tabs", "tabs", "normal", {}, []))
      .toThrow(/STYLE_SCOPE_INVALID/);
    expect(() => compileScopedStyleFragment(trusted, "kf36-tabs-0123456789abcdef", "tabs", "error", { textColor: "#ffffff" }, []))
      .toThrow(/STYLE_STATE_UNSUPPORTED/);
  });

  it.each([
    { position: "fixed" } as StyleDeclarationV2,
    { opacity: Number.NaN } satisfies StyleDeclarationV2,
    { letterSpacing: 0.001 } satisfies StyleDeclarationV2,
    { transition: { property: "opacity", durationMs: 601, easing: "linear" } } satisfies StyleDeclarationV2,
    { focusRing: { color: "#ffffff", width: 0, offset: 0 } } satisfies StyleDeclarationV2,
    { focusRing: { color: "#ffffff", width: 2, offset: 17 } } satisfies StyleDeclarationV2,
  ])("rejects unknown, non-finite, imprecise, or out-of-range v2 declarations %#", (declarations) => {
    expect(() => serializeStyleDeclarations(declarations, []))
      .toThrow(/STYLE_(?:PROPERTY|VALUE)_FORBIDDEN/);
  });
});
