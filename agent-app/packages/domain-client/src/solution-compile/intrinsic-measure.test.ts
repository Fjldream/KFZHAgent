import { describe, expect, it } from "vitest";
import type { SemanticValue } from "@kf/contracts";
import { requireControlDesignProfile } from "../design-knowledge/control-design-registry.js";
import {
  measureIntrinsic,
  type GenericControlIntrinsicMeasureInput,
  type IntrinsicFontMetrics,
  type IntrinsicSize,
} from "./intrinsic-measure.js";

const font: IntrinsicFontMetrics = { fontSize: 16, lineHeight: 1.5, padding: { horizontal: 20, vertical: 0 }, border: { horizontal: 0, vertical: 0 } };

function genericInput(capabilityId: string, content: SemanticValue, width = 160): GenericControlIntrinsicMeasureInput {
  return { kind: "control", family: "generic", node: { kind: "control", id: `${capabilityId}-node`, capabilityId, content, properties: [], tabIds: [], intent: { density: "comfortable" } }, density: "comfortable", width: { available: width }, profile: requireControlDesignProfile(capabilityId), style: {}, font };
}

const children: readonly IntrinsicSize[] = [
  { minWidth: 80, preferredWidth: 120, maxWidth: 160, minHeight: 24, preferredHeight: 48, maxHeight: 72, overflow: "wrap" },
  { minWidth: 100, preferredWidth: 140, maxWidth: 200, minHeight: 32, preferredHeight: 40, maxHeight: 56, overflow: "clip" },
];

function layoutInput(layout: "row" | "column" | "grid" | "asymmetric-grid" | "split" | "stack" | "dock" | "sidebar-content" | "master-detail" | "scroll-region" | "overlay-anchor", measuredChildren = children) {
  return { kind: "layout" as const, node: { kind: "layout" as const, id: layout, layout, intent: { density: "comfortable" as const } }, density: "comfortable" as const, width: { available: 300 }, font, childMeasures: measuredChildren, gap: 12 };
}

function expectOrdered(size: IntrinsicSize): void {
  expect(Object.values(size).filter((value): value is number => typeof value === "number").every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
  expect(size.minWidth).toBeLessThanOrEqual(size.preferredWidth);
  expect(size.preferredWidth).toBeLessThanOrEqual(size.maxWidth);
  expect(size.minHeight).toBeLessThanOrEqual(size.preferredHeight);
  expect(size.preferredHeight).toBeLessThanOrEqual(size.maxHeight);
}

describe("measureIntrinsic", () => {
  it("uses actual native-button evidence without silently clamping its 60px minimum", () => {
    const native = measureIntrinsic(genericInput("button", "提交审核", 180));
    const linkButton = measureIntrinsic(genericInput("easyui.2", "提交审核", 180));
    expect(native).toMatchObject({ minHeight: 60, preferredHeight: 60, maxHeight: 60, overflow: "clip" });
    expect(linkButton).toMatchObject({ minHeight: 40, preferredHeight: 40, maxHeight: 56, overflow: "clip" });
  });

  it("requires the reviewed profile to match the capability rather than borrowing another control's minimum", () => {
    expect(() => measureIntrinsic({ ...genericInput("text", "内容"), profile: requireControlDesignProfile("button") })).toThrow("INTRINSIC_MEASURE_PROFILE_CAPABILITY_MISMATCH");
    expect(() => measureIntrinsic(genericInput("easyui.1", ""))).toThrow("INTRINSIC_MEASURE_CONTROL_FAMILY_MISMATCH");
  });

  it("uses CJK=1em, Latin=.56em, a conservative Unicode fallback, and structured truncate", () => {
    const full = measureIntrinsic(genericInput("text", "园区访客预约审核", 160));
    const latin = measureIntrinsic(genericInput("text", "AB", 200));
    const mixed = measureIntrinsic(genericInput("text", "A园🙂", 200));
    const truncated = measureIntrinsic({ ...genericInput("text", "园区访客预约审核", 160), style: { truncate: true } });
    expect(full).toMatchObject({ minHeight: 30, preferredHeight: 48, maxHeight: 48, overflow: "wrap" });
    expect(latin.preferredWidth).toBe(57.92);
    expect(mixed.preferredWidth).toBe(80.96);
    expect(truncated).toMatchObject({ preferredHeight: 30, maxHeight: 30, overflow: "clip" });
  });

  it("wraps against min(available, declared max) and preserves an uncompressible intrinsic minimum", () => {
    const narrow = measureIntrinsic({ ...genericInput("text", "ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ", 80), width: { available: 80, max: 800 } });
    const crossed = measureIntrinsic({ ...genericInput("text", "园区访客预约审核", 80), width: { available: 80, min: 120, max: 60 } });
    expect(narrow).toMatchObject({ minWidth: 40, preferredWidth: 80, maxWidth: 80, preferredHeight: 96, maxHeight: 96 });
    expect(crossed).toMatchObject({ minWidth: 120, preferredWidth: 120, maxWidth: 120, preferredHeight: 48 });
  });

  it("requires datagrid facts only for the datagrid family and bounds extreme counts", () => {
    const eightRows = measureIntrinsic({ ...genericInput("easyui.1", "", 800), family: "datagrid", dataGrid: { recordCount: 8 } });
    const extremeRows = measureIntrinsic({ ...genericInput("easyui.1", "", 800), family: "datagrid", dataGrid: { recordCount: 1_000_000_000 } });
    expect(eightRows).toMatchObject({ minHeight: 292, preferredHeight: 292, overflow: "clip" });
    expect(extremeRows).toMatchObject({ minHeight: 420, preferredHeight: 420, maxHeight: 420, overflow: "scroll" });
    expect(() => measureIntrinsic({ ...genericInput("easyui.1", "", 800), family: "datagrid", dataGrid: { recordCount: Number.NaN } })).toThrow("INTRINSIC_MEASURE_DATAGRID_FACTS_INVALID");
  });

  it.each([
    ["count", { recordCount: -1 }],
    ["header", { recordCount: 1, headerHeight: 0 }],
    ["row", { recordCount: 1, rowHeight: Number.POSITIVE_INFINITY }],
    ["visible limit", { recordCount: 1, visibleRowLimit: 1.5 }],
  ])("fails closed for invalid datagrid %s facts", (_field, dataGrid) => {
    expect(() => measureIntrinsic({ ...genericInput("easyui.1", "", 800), family: "datagrid", dataGrid }))
      .toThrow("INTRINSIC_MEASURE_DATAGRID_FACTS_INVALID");
  });

  it("fails closed instead of overflowing a datagrid height for extreme finite facts", () => {
    for (const dataGrid of [
      { recordCount: 1, headerHeight: Number.MAX_VALUE },
      { recordCount: 1, rowHeight: Number.MAX_VALUE },
    ]) expect(() => measureIntrinsic({ ...genericInput("easyui.1", "", 800), family: "datagrid", dataGrid })).toThrow("INTRINSIC_MEASURE_DATAGRID_FACTS_INVALID");
    expect(measureIntrinsic({ ...genericInput("easyui.1", "", 800), family: "datagrid", dataGrid: { recordCount: Number.MAX_SAFE_INTEGER, visibleRowLimit: Number.MAX_SAFE_INTEGER } }))
      .toMatchObject({ preferredHeight: 420, maxHeight: 420, overflow: "scroll" });
  });

  it("uses the image content box for ratios and fails closed for invalid ratios", () => {
    const paddedFont: IntrinsicFontMetrics = { ...font, padding: { horizontal: 10, vertical: 5 }, border: { horizontal: 2, vertical: 3 } };
    const plain = measureIntrinsic({ ...genericInput("image", "", 640), family: "image", image: { aspectRatio: { width: 16, height: 9 } }, font: { fontSize: 16, lineHeight: 1.5 } });
    const image = measureIntrinsic({ ...genericInput("image", "", 640), family: "image", image: { aspectRatio: { width: 16, height: 9 } }, font: paddedFont });
    expect(plain.preferredHeight).toBe(360);
    expect(image).toMatchObject({ preferredWidth: 640, preferredHeight: 362.5, maxHeight: 362.5 });
    for (const ratio of [{ width: 0, height: 9 }, { width: -1, height: 9 }, { width: Number.NaN, height: 9 }, { width: Infinity, height: 9 }]) expect(() => measureIntrinsic({ ...genericInput("image", "", 640), family: "image", image: { aspectRatio: ratio } })).toThrow("INTRINSIC_MEASURE_IMAGE_RATIO_INVALID");
    for (const ratio of [{ width: Number.MIN_VALUE, height: Number.MAX_VALUE }, { width: Number.MAX_VALUE, height: Number.MIN_VALUE }]) expect(() => measureIntrinsic({ ...genericInput("image", "", 640), family: "image", image: { aspectRatio: ratio }, font: paddedFont })).toThrow("INTRINSIC_MEASURE_IMAGE_RATIO_INVALID");
  });

  it("measures each layout semantic family with its own conservative aggregation", () => {
    expect(measureIntrinsic(layoutInput("row"))).toMatchObject({ minWidth: 192, preferredWidth: 272, maxWidth: 300, minHeight: 32, preferredHeight: 48, maxHeight: 72 });
    expect(measureIntrinsic(layoutInput("column"))).toMatchObject({ minWidth: 100, preferredWidth: 140, maxWidth: 200, minHeight: 68, preferredHeight: 100, maxHeight: 140 });
    expect(measureIntrinsic(layoutInput("grid"))).toMatchObject({ minWidth: 100, preferredWidth: 272, maxWidth: 300, minHeight: 32, preferredHeight: 48, maxHeight: 72 });
    expect(measureIntrinsic(layoutInput("stack"))).toMatchObject({ minWidth: 100, preferredWidth: 140, maxWidth: 200, minHeight: 32, preferredHeight: 48, maxHeight: 72 });
    expect(measureIntrinsic(layoutInput("overlay-anchor"))).toEqual(measureIntrinsic(layoutInput("stack")));
    expect(measureIntrinsic(layoutInput("dock", [...children, children[0]!]))).toMatchObject({ minWidth: 192, preferredWidth: 272, maxWidth: 300, minHeight: 68, preferredHeight: 108, maxHeight: 156 });
    expect(measureIntrinsic(layoutInput("scroll-region"))).toMatchObject({ overflow: "scroll", preferredHeight: 100 });
  });

  it("rejects ambiguous composite and empty layout structures rather than fabricating a size", () => {
    expect(() => measureIntrinsic(layoutInput("split", [children[0]!]))).toThrow("INTRINSIC_MEASURE_LAYOUT_CHILD_COUNT");
    expect(() => measureIntrinsic(layoutInput("dock", [children[0]!]))).toThrow("INTRINSIC_MEASURE_LAYOUT_CHILD_COUNT");
    expect(() => measureIntrinsic(layoutInput("column", []))).toThrow("INTRINSIC_MEASURE_LAYOUT_CHILDREN_REQUIRED");
  });

  it.each([
    ["row", { preferredWidth: 272, preferredHeight: 48 }],
    ["column", { preferredWidth: 140, preferredHeight: 100 }],
    ["grid", { preferredWidth: 272, preferredHeight: 48 }],
    ["asymmetric-grid", { preferredWidth: 272, preferredHeight: 48 }],
    ["split", { preferredWidth: 272, preferredHeight: 48 }],
    ["stack", { preferredWidth: 140, preferredHeight: 48 }],
    ["dock", { preferredWidth: 272, preferredHeight: 108 }],
    ["sidebar-content", { preferredWidth: 272, preferredHeight: 48 }],
    ["master-detail", { preferredWidth: 272, preferredHeight: 48 }],
    ["scroll-region", { preferredWidth: 140, preferredHeight: 100, overflow: "scroll" }],
    ["overlay-anchor", { preferredWidth: 140, preferredHeight: 48 }],
  ] as const)("measures %s with its dedicated layout family rule", (layout, expected) => {
    const layoutChildren = layout === "dock" ? [...children, children[0]!] : children;
    expect(measureIntrinsic(layoutInput(layout, layoutChildren))).toMatchObject(expected);
  });

  it("caps grid columns at twelve and reduces asymmetric grid to one track when narrow", () => {
    const tile: IntrinsicSize = { minWidth: 100, preferredWidth: 100, maxWidth: 100, minHeight: 20, preferredHeight: 20, maxHeight: 20, overflow: "clip" };
    const grid = measureIntrinsic({ ...layoutInput("grid", Array.from({ length: 24 }, () => tile)), width: { available: 1440 }, gap: 0 });
    const asymmetric = measureIntrinsic({ ...layoutInput("asymmetric-grid", [tile, tile]), width: { available: 150 }, gap: 12 });
    expect(grid).toMatchObject({ preferredHeight: 40, maxHeight: 40 });
    expect(asymmetric).toMatchObject({ preferredHeight: 52, maxHeight: 52 });
  });

  it("estimates only valid registered module contracts without calling module compilation", () => {
    const valid = { minColumnSpan: 4, maxColumnSpan: 8, height: { min: 180, preferred: { compact: 220, small: 260, medium: 320, large: 400, full: 480 }, max: 480 } } as const;
    const result = measureIntrinsic({ kind: "registered-module", node: { kind: "registered-module", id: "hero", moduleKind: "content.hero", templateVersion: "1.0.0", variant: "default", title: "门户", intent: { density: "spacious" } }, density: "spacious", width: { available: 1440 }, font, layoutContract: valid });
    expect(result).toEqual({ minWidth: 320, preferredWidth: 640, maxWidth: 640, minHeight: 180, preferredHeight: 400, maxHeight: 480, overflow: "clip" });
    expect(() => measureIntrinsic({ kind: "registered-module", node: { kind: "registered-module", id: "bad", moduleKind: "bad", templateVersion: "1", variant: "default", title: "bad", intent: { density: "compact" } }, density: "compact", width: { available: 800 }, font, layoutContract: { ...valid, minColumnSpan: 1.5 } })).toThrow("INTRINSIC_MEASURE_MODULE_LAYOUT_INVALID");
    expect(() => measureIntrinsic({ kind: "registered-module", node: { kind: "registered-module", id: "mismatch", moduleKind: "bad", templateVersion: "1", variant: "default", title: "bad", intent: { density: "compact" } }, density: "spacious", width: { available: 800 }, font, layoutContract: valid })).toThrow("INTRINSIC_MEASURE_DENSITY_MISMATCH");
  });

  it("fails closed for an unresolved repeater field and returns ordered finite results for successful hostile-number inputs", () => {
    const unresolved: SemanticValue = { kind: "repeater-field", itemAlias: "row", field: "name" };
    expect(() => measureIntrinsic(genericInput("text", unresolved))).toThrow("INTRINSIC_MEASURE_UNRESOLVED_REPEATER_FIELD");
    for (const input of [genericInput("text", "", Number.NaN), { ...genericInput("text", "", Infinity), width: { available: -1, min: -10, max: Infinity } }, { ...genericInput("text", "边界", 0), width: { available: 0, max: 0 } }]) expectOrdered(measureIntrinsic(input));
  });
});
