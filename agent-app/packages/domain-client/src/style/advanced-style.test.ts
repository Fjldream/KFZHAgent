import { describe, expect, it } from "vitest";
import type { AdvancedStyleDeclaration, ApprovedAssetFacts } from "@kf/contracts";
import {
  compileAdvancedStyles,
  parseAdvancedStyle,
  type LegacyRawStylePair,
} from "./advanced-style.js";

const sha256 = "a".repeat(64);
const approvedAsset: ApprovedAssetFacts = {
  workspaceAssetId: "00000000-0000-4000-8000-000000000001",
  targetPath: `project/res/images/${sha256}.png`,
  mediaType: "image/png",
  sha256,
  sizeBytes: 128,
};
const modelAssetId = "asset-00000000000040008000000000000001";

function materializeLikeKFUIBase(styleData: string): string {
  return styleData
    .replace(/domId/g, "k11111111-1111-4111-8111-111111111111")
    .replace(
      /url\([^)]*\/([^)]+)\)/,
      'url("runtime/project/res/images/$1&token=Bearer%20test-token")',
    )
    .replace(/["']&token/, "&token");
}

describe("advanced style parsing", () => {
  it("serializes structured gradients with deterministic stop and angle precision", () => {
    expect(parseAdvancedStyle({
      kind: "gradient",
      angle: 135.5,
      stops: [
        { offset: 0, color: "#163a5f" },
        { offset: 0.375, color: "rgb(228 123 50 / 50%)" },
        { offset: 1, color: "#e47b32" },
      ],
    }, [])).toEqual({
      cssProperty: "background-image",
      cssValue: "linear-gradient(135.5deg,#163a5f 0%,rgb(228 123 50 / 50%) 37.5%,#e47b32 100%)",
    });
  });

  it("resolves an exact approved background asset to a compiler-owned target and token", () => {
    expect(parseAdvancedStyle({ kind: "background-image", assetId: modelAssetId }, [approvedAsset]))
      .toEqual({
        cssProperty: "background-image",
        cssValue: `url("project/res/images/${sha256}.png")`,
        resolvedAsset: {
          assetId: modelAssetId,
          targetPath: `project/res/images/${sha256}.png`,
          token: `asset-sha256:${sha256}`,
        },
      });
  });

  it("serializes bounded transforms in one fixed operation order without dropping zero", () => {
    expect(parseAdvancedStyle({
      kind: "transform",
      translateX: 0,
      translateY: -2.5,
      scale: 1.02,
      rotate: 0,
    }, [])).toEqual({
      cssProperty: "transform",
      cssValue: "translateX(0px) translateY(-2.5px) scale(1.02) rotate(0deg)",
    });
  });

  it("combines gradients with one asset and survives KF's non-global runtime URL rewrite", () => {
    const compiled = compileAdvancedStyles([
      {
        kind: "gradient",
        angle: 90,
        stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }],
      },
      { kind: "background-image", assetId: modelAssetId },
      {
        kind: "gradient",
        angle: 180,
        stops: [{ offset: 0, color: "#163a5f" }, { offset: 1, color: "#e47b32" }],
      },
    ], [approvedAsset]);
    expect(compiled).toEqual({
      declarations: [{
        cssProperty: "background-image",
        cssValue: `linear-gradient(90deg,#000000 0%,#ffffff 100%),url("project/res/images/${sha256}.png"),linear-gradient(180deg,#163a5f 0%,#e47b32 100%)`,
      }],
      resolvedAssets: [{
        assetId: modelAssetId,
        targetPath: `project/res/images/${sha256}.png`,
        token: `asset-sha256:${sha256}`,
      }],
    });
    const runtimeCss = materializeLikeKFUIBase(`#domId{background-image:${compiled.declarations[0]!.cssValue}}`);
    expect(runtimeCss).toContain("linear-gradient(90deg");
    expect(runtimeCss).toContain("linear-gradient(180deg");
    expect(runtimeCss).toContain("runtime/project/res/images/");
    expect(runtimeCss).not.toContain("project/res/images/project/res/images");
    expect(runtimeCss).not.toContain('url("project/res/images/');
  });

  it("rejects multiple asset layers before KF can leave later URLs unreplaced", () => {
    expect(() => compileAdvancedStyles([
      { kind: "background-image", assetId: modelAssetId },
      { kind: "background-image", assetId: modelAssetId },
    ], [approvedAsset])).toThrow(/STYLE_ASSET_LAYER_BUDGET/);
  });

  it.each([
    { property: "position", value: "fixed" },
    { property: "backgroundImage", value: "url(javascript:alert(1))" },
    { property: "transform", value: "var(--attack)" },
    { property: "color", value: "calc(1px)" },
    { property: "color", value: "@import evil" },
    { property: "color", value: "red;position:fixed" },
    { property: "color", value: ".victim:hover" },
    { property: "color", value: "javascript:alert(1)" },
  ] satisfies LegacyRawStylePair[])("rejects legacy raw property/value style input %#", (input) => {
    expect(() => parseAdvancedStyle(input, [])).toThrow(/STYLE_(?:PROPERTY|VALUE)_FORBIDDEN/);
  });

  it("requires an exact, unique approved asset fact", () => {
    const declaration: AdvancedStyleDeclaration = { kind: "background-image", assetId: modelAssetId };
    expect(() => parseAdvancedStyle(declaration, [])).toThrow(/STYLE_ASSET_NOT_APPROVED/);
    expect(() => parseAdvancedStyle(declaration, [approvedAsset, approvedAsset]))
      .toThrow(/STYLE_ASSET_APPROVAL_AMBIGUOUS/);
  });

  it.each([
    { kind: "gradient", angle: Number.POSITIVE_INFINITY, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
    { kind: "gradient", angle: 90.001, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
    { kind: "gradient", angle: 90, stops: [{ offset: 0.75, color: "#000000" }, { offset: 0.25, color: "#ffffff" }] },
    { kind: "transform", translateX: 201 },
    { kind: "transform", scale: 1.201 },
    { kind: "transform", rotate: 15.01 },
    { kind: "transform" },
  ] as AdvancedStyleDeclaration[])("rejects out-of-contract or ambiguous structured value %#", (input) => {
    expect(() => parseAdvancedStyle(input, [])).toThrow(/STYLE_VALUE_FORBIDDEN/);
  });

  it("enforces the v2 advanced declaration budget at the compiler boundary", () => {
    const declaration: AdvancedStyleDeclaration = {
      kind: "gradient",
      angle: 0,
      stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }],
    };
    expect(() => compileAdvancedStyles(Array.from({ length: 9 }, () => declaration), []))
      .toThrow(/STYLE_BUDGET_EXCEEDED/);
  });
});
