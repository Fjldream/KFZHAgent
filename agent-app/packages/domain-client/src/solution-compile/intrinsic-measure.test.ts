import { describe, expect, it } from "vitest";
import type { ControlDesignProfile } from "@kf/contracts";
import {
  measureIntrinsic,
  type ControlIntrinsicMeasureInput,
  type IntrinsicFontMetrics,
  type IntrinsicSize,
} from "./intrinsic-measure.js";

const textProfile: Pick<ControlDesignProfile, "capabilityId" | "minimumSize"> = {
  capabilityId: "text",
  minimumSize: { width: 40, height: 24 },
};

const buttonProfile: Pick<ControlDesignProfile, "capabilityId" | "minimumSize"> = {
  capabilityId: "button",
  minimumSize: { width: 90, height: 36 },
};

const gridProfile: Pick<ControlDesignProfile, "capabilityId" | "minimumSize"> = {
  capabilityId: "easyui.1",
  minimumSize: { width: 640, height: 240 },
};

const imageProfile: Pick<ControlDesignProfile, "capabilityId" | "minimumSize"> = {
  capabilityId: "image",
  minimumSize: { width: 200, height: 200 },
};

const font: IntrinsicFontMetrics = {
  fontSize: 16,
  lineHeight: 1.5,
  padding: { horizontal: 20, vertical: 0 },
  border: { horizontal: 0, vertical: 0 },
};

function controlInput(
  capabilityId: string,
  content: string,
  profile: Pick<ControlDesignProfile, "capabilityId" | "minimumSize">,
  width = 160,
): ControlIntrinsicMeasureInput {
  return {
    kind: "control",
    node: {
      kind: "control",
      id: `${capabilityId}-node`,
      capabilityId,
      content,
      properties: [],
      tabIds: [],
      intent: { density: "comfortable" },
    },
    density: "comfortable",
    width: { available: width },
    profile,
    font,
  };
}

describe("measureIntrinsic", () => {
  it("wraps CJK text from the resolved line height, padding, border, and line clamp", () => {
    const result = measureIntrinsic({
      ...controlInput("text", "园区访客预约审核", textProfile),
      lineClamp: 2,
    });

    // 8 CJK glyphs × 16px = 128px; (160 - 40px padding) yields two 24px lines.
    expect(result).toMatchObject({
      minWidth: 40,
      preferredWidth: 160,
      minHeight: 24,
      preferredHeight: 48,
      maxHeight: 48,
      overflow: "wrap",
    });
  });

  it("uses 0.56em Latin glyphs and a conservative full-em width for emoji", () => {
    const latin = measureIntrinsic(controlInput("text", "AB", textProfile, 200));
    const mixed = measureIntrinsic(controlInput("text", "A园🙂", textProfile, 200));

    // A/B: 2 × (16 × .56) = 17.92px; A/园/emoji: 8.96 + 16 + 16 = 40.96px.
    expect(latin.preferredWidth).toBe(57.92);
    expect(mixed.preferredWidth).toBe(80.96);
  });

  it("keeps buttons within the reviewed 32px to 56px runtime height band", () => {
    const result = measureIntrinsic(controlInput("button", "提交审核", buttonProfile, 180));

    expect(result).toMatchObject({
      minWidth: 90,
      minHeight: 36,
      preferredHeight: 36,
      maxHeight: 56,
      overflow: "clip",
    });
  });

  it("measures datagrid header and rows and caps pathological record counts", () => {
    const eightRows = measureIntrinsic({
      ...controlInput("easyui.1", "", gridProfile, 800),
      dataGrid: { recordCount: 8 },
    });
    const extremeRows = measureIntrinsic({
      ...controlInput("easyui.1", "", gridProfile, 800),
      dataGrid: { recordCount: 1_000_000_000 },
    });

    // Comfortable grid = 36px header + 8 × 32px rows.
    expect(eightRows).toMatchObject({ minHeight: 292, preferredHeight: 292, overflow: "clip" });
    // Measurement exposes at most 12 rows: 36 + 12 × 32 = 420px.
    expect(extremeRows).toMatchObject({ minHeight: 420, preferredHeight: 420, maxHeight: 420, overflow: "scroll" });
  });

  it("derives a 16:9 image height at the requested constrained width", () => {
    const result = measureIntrinsic({
      ...controlInput("image", "", imageProfile, 640),
      image: { aspectRatio: { width: 16, height: 9 }, preferredWidth: 640 },
    });

    expect(result).toMatchObject({
      minWidth: 200,
      preferredWidth: 640,
      preferredHeight: 360,
      maxHeight: 360,
      overflow: "clip",
    });
  });

  it("aggregates child measures for column and scroll-region layouts", () => {
    const children: readonly IntrinsicSize[] = [
      { minWidth: 80, preferredWidth: 120, maxWidth: 160, minHeight: 24, preferredHeight: 48, maxHeight: 72, overflow: "wrap" },
      { minWidth: 100, preferredWidth: 140, maxWidth: 200, minHeight: 32, preferredHeight: 40, maxHeight: 56, overflow: "clip" },
    ];
    const result = measureIntrinsic({
      kind: "layout",
      node: { kind: "layout", id: "stack", layout: "scroll-region", intent: { density: "comfortable" } },
      density: "comfortable",
      width: { available: 300 },
      font,
      childMeasures: children,
      gap: 12,
    });

    expect(result).toEqual({
      minWidth: 100,
      preferredWidth: 140,
      maxWidth: 200,
      minHeight: 68,
      preferredHeight: 100,
      maxHeight: 140,
      overflow: "scroll",
    });
  });

  it("estimates a registered module from its layout contract without compiling it", () => {
    const result = measureIntrinsic({
      kind: "registered-module",
      node: { kind: "registered-module", id: "hero", moduleKind: "content.hero", templateVersion: "1.0.0", variant: "default", title: "门户" },
      density: "spacious",
      width: { available: 1440 },
      font,
      layoutContract: {
        minColumnSpan: 4,
        maxColumnSpan: 8,
        height: { min: 180, preferred: { compact: 220, small: 260, medium: 320, large: 400, full: 480 }, max: 480 },
      },
    });

    expect(result).toEqual({
      minWidth: 320,
      preferredWidth: 640,
      maxWidth: 640,
      minHeight: 180,
      preferredHeight: 400,
      maxHeight: 480,
      overflow: "clip",
    });
  });

  it("normalizes hostile dimensions without returning negative, infinite, or unordered values", () => {
    const result = measureIntrinsic({
      ...controlInput("text", "", textProfile, Number.POSITIVE_INFINITY),
      density: "compact",
      width: { available: Number.NaN, min: -10, max: Number.POSITIVE_INFINITY },
      lineClamp: 99,
    });

    expect(result).toEqual({
      minWidth: 40,
      preferredWidth: 40,
      maxWidth: 40,
      minHeight: 24,
      preferredHeight: 24,
      maxHeight: 24,
      overflow: "wrap",
    });
    expect(Object.values(result).filter((value): value is number => typeof value === "number").every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
  });
});
