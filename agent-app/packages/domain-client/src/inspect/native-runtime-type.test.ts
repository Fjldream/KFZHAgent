import { describe, expect, it } from "vitest";
import { classifyNativeRuntimeControl } from "./native-runtime-type.js";

describe("native runtime type discriminator", () => {
  it.each([
    { objectType: 3, uiExtendType: 1, uiModelType: 35 },
    { objectType: 2, layoutType: 4, uiModelType: 35 },
    { objectType: 2, layoutType: 4, uiExtendType: 1 },
    { prototypeName: "CustomCharts", uiModelType: 35 },
  ])("rejects mutually exclusive native envelopes before classification", (record) => {
    expect(classifyNativeRuntimeControl(record).kind).toBe("malformed");
  });

  it.each([
    { uiModelType: undefined },
    { uiModelType: null },
    { objectType: undefined, layoutType: 4 },
    { objectType: 2, layoutType: undefined },
  ])("treats present invalid discriminator properties as malformed", (record) => {
    expect(classifyNativeRuntimeControl(record).kind).toBe("malformed");
  });

  it("normalizes only an absent or null legacy layout objectType", () => {
    expect(classifyNativeRuntimeControl({ layoutType: 4 })).toEqual({
      kind: "valid", nativeType: { kind: "layout", objectType: null, layoutType: 4 },
    });
    expect(classifyNativeRuntimeControl({ objectType: null, layoutType: 4 })).toEqual({
      kind: "valid", nativeType: { kind: "layout", objectType: null, layoutType: 4 },
    });
    expect(classifyNativeRuntimeControl({ objectType: 3, uiExtendType: 1 })).toEqual({
      kind: "valid", nativeType: { kind: "easyui", objectType: 3, uiExtendType: 1 },
    });
  });

  it("keeps the real static KF envelope distinct from EasyUI", () => {
    expect(classifyNativeRuntimeControl({
      uiModelType: 6, objectType: 3, uiExtendType: null, prototypeName: "Label",
    })).toEqual({ kind: "valid", nativeType: { kind: "static", uiModelType: 6 } });
  });
});
