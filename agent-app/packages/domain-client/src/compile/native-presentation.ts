// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { KF36_RUNTIME_PROFILE } from "../style/runtime-profile.js";

const ELEMENT_UI_NATIVE_TYPES = new Set(Object.values(KF36_RUNTIME_PROFILE.selectors).flatMap((roles) => {
  const evidence = roles.parts["root"]?.evidence;
  const modelType = evidence?.templateFields["uiModelType"];
  return evidence?.runtimePath.includes("/Graphic/ElementUI/") && typeof modelType === "number" ? [modelType] : [];
}));
export interface NativeSiblingPlacement {
  readonly zIndex: number;
  readonly order: number;
  readonly geometry: { readonly x: number; readonly y: number };
}
export function compareNativeSiblingPlacement(left: NativeSiblingPlacement, right: NativeSiblingPlacement, layoutType?: number): number {
  if (layoutType === 2) return left.geometry.x - right.geometry.x || left.geometry.y - right.geometry.y || left.order - right.order;
  if (layoutType === 4) return left.geometry.y - right.geometry.y || left.geometry.x - right.geometry.x || left.order - right.order;
  return left.zIndex - right.zIndex || left.order - right.order;
}
export function nativeStyleOwner(native: Record<string, unknown>): Record<string, unknown> {
  if (typeof native.layoutType !== "number") return native;
  const base = native.baseProperty;
  if (!base || typeof base !== "object" || Array.isArray(base)) throw new Error("NATIVE_LAYOUT_STYLE_OWNER_REQUIRED");
  return base as Record<string, unknown>;
}
export function nativeStyleStorage(native: Record<string, unknown>): { owner: Record<string, unknown>; field: "styleData" | "styleDataNew" } {
  const isElementUi = native["layoutType"] === undefined && native["uiExtendType"] === undefined
    && typeof native["uiModelType"] === "number" && ELEMENT_UI_NATIVE_TYPES.has(native["uiModelType"]);
  return { owner: nativeStyleOwner(native), field: isElementUi ? "styleData" : "styleDataNew" };
}
// end
