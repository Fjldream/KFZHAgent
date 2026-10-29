// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { describe, expect, it } from "vitest";
import { compareNativeSiblingPlacement, nativeStyleOwner, nativeStyleStorage } from "./native-presentation.js";

describe("KF native presentation readers", () => {
  it("selects the actual CSS field for ElementUI, EasyUI and layout families", () => {
    expect(nativeStyleStorage({ uiModelType: 35 }).field).toBe("styleData");
    expect(nativeStyleStorage({ uiModelType: 50 }).field).toBe("styleData");
    expect(nativeStyleStorage({ objectType: 3, uiExtendType: 1 }).field).toBe("styleDataNew");
    expect(nativeStyleStorage({ layoutType: 4, baseProperty: {} }).field).toBe("styleDataNew");
  });
  it("writes layout CSS to the baseProperty consumed by jsonToBaseProperty", () => {
    const native = { layoutType: 4, baseProperty: { name: "Layout1", styleDataNew: "existing" }, styleDataNew: "unused legacy root" };
    nativeStyleOwner(native).styleDataNew = "new style";
    expect(native.baseProperty.styleDataNew).toBe("new style");
    expect(native.styleDataNew).toBe("unused legacy root");
  });
  it("retains ordinary UI style ownership and rejects a layout with no legitimate baseProperty", () => {
    const native = { uiModelType: 35, styleDataNew: "button" };
    expect(nativeStyleOwner(native)).toBe(native);
    expect(() => nativeStyleOwner({ layoutType: 4 })).toThrow("NATIVE_LAYOUT_STYLE_OWNER_REQUIRED");
  });
  it.each([2, 4])("preserves compiler geometry order for native flow layout %i even when lexical/paint order differs", layoutType => {
    const first = { geometry: { x: 10, y: 10 }, zIndex: 20, order: 9 };
    const second = { geometry: { x: 200, y: 200 }, zIndex: 0, order: 0 };
    expect(compareNativeSiblingPlacement(first, second, layoutType)).toBeLessThan(0);
  });
  it("retains z-order for absolute and overlay paint stacks", () => {
    const first = { geometry: { x: 10, y: 10 }, zIndex: 20, order: 9 };
    const second = { geometry: { x: 200, y: 200 }, zIndex: 0, order: 0 };
    expect(compareNativeSiblingPlacement(first, second)).toBeGreaterThan(0);
    expect(compareNativeSiblingPlacement(first, second, 6)).toBeGreaterThan(0);
  });
});
// end
