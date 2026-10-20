import { EASYUI_PROTO_TYPES } from "../ir/easyui-types.js";

export type NativeRuntimeControlType =
  | { readonly kind: "static"; readonly uiModelType: number }
  | { readonly kind: "easyui"; readonly objectType: 3 | null; readonly uiExtendType: number }
  | { readonly kind: "layout"; readonly objectType: 2 | null; readonly layoutType: number }
  | { readonly kind: "prototype"; readonly prototypeName: string };

export type NativeRuntimeClassification =
  | { readonly kind: "valid"; readonly nativeType: NativeRuntimeControlType }
  | { readonly kind: "malformed"; readonly reason: string }
  | { readonly kind: "non-control" };

const SPECIAL_PROTOTYPE_NAMES = new Set([
  "CustomCharts", "AlarmWindow", "EventWindow", "TrendChart", "BarChart", "PieChart", "XYChart",
]);
const own = (record: Readonly<Record<string, unknown>>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(record, key);
const finiteInteger = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && Number.isInteger(value);
const malformed = (reason: string): NativeRuntimeClassification => ({ kind: "malformed", reason });

/** 检查与原生校验共享的单一故障关闭式判别器。 */
export function classifyNativeRuntimeControl(record: Readonly<Record<string, unknown>>): NativeRuntimeClassification {
  const hasUiModel = own(record, "uiModelType");
  const hasUiExtend = own(record, "uiExtendType");
  const hasLayoutType = own(record, "layoutType");
  // 静态 KF 控制通常保留 objectType=3 和 uiExtendType=null。
  // 当 uiModelType 也存在时， uiExtendType 不为 null/undefined 的互斥 EasyUI 声称
  // 当 uiModelType 不存在时， objectType=3 仍然建立一个 EasyUI 的包，其原型必须验证以下。
  const easyuiEnvelope = hasUiModel
    ? hasUiExtend && record["uiExtendType"] !== null
    : record["objectType"] === 3 || hasUiExtend;
  const layoutEnvelope = record["objectType"] === 2 || hasLayoutType;
  const prototypeName = typeof record["prototypeName"] === "string" && SPECIAL_PROTOTYPE_NAMES.has(record["prototypeName"])
    ? record["prototypeName"] : undefined;

  if (hasUiModel && easyuiEnvelope) return malformed("uiModelType conflicts with EasyUI envelope");
  if (hasUiModel && layoutEnvelope) return malformed("uiModelType conflicts with layout envelope");
  if (easyuiEnvelope && layoutEnvelope) return malformed("EasyUI envelope conflicts with layout envelope");
  if (prototypeName !== undefined && (hasUiModel || easyuiEnvelope || layoutEnvelope)) {
    return malformed("prototype envelope conflicts with another native runtime envelope");
  }

  if (hasUiModel) {
    return finiteInteger(record["uiModelType"])
      ? { kind: "valid", nativeType: { kind: "static", uiModelType: record["uiModelType"] } }
      : malformed("uiModelType must be a finite integer");
  }

  if (easyuiEnvelope) {
    const objectTypePresent = own(record, "objectType");
    const objectType = record["objectType"];
    if (objectTypePresent && objectType !== 3 && objectType !== null) return malformed("EasyUI objectType must be 3 or legacy null/absent");
    const uiExtendType = record["uiExtendType"];
    if (!finiteInteger(uiExtendType) || EASYUI_PROTO_TYPES[uiExtendType] === undefined) return malformed("uiExtendType is not a reviewed EasyUI proto");
    return { kind: "valid", nativeType: { kind: "easyui", objectType: objectType === 3 ? 3 : null, uiExtendType } };
  }

  if (layoutEnvelope) {
    const objectTypePresent = own(record, "objectType");
    const objectType = record["objectType"];
    if (objectTypePresent && objectType !== 2 && objectType !== null) return malformed("layout objectType must be 2 or legacy null/absent");
    const layoutType = record["layoutType"];
    if (!finiteInteger(layoutType)) return malformed("layoutType must be a finite integer");
    return { kind: "valid", nativeType: { kind: "layout", objectType: objectType === 2 ? 2 : null, layoutType } };
  }

  if (prototypeName !== undefined) return { kind: "valid", nativeType: { kind: "prototype", prototypeName } };
  return { kind: "non-control" };
}

export function sameNativeRuntimeControlType(left: NativeRuntimeControlType, right: NativeRuntimeControlType): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "static" && right.kind === "static") return left.uiModelType === right.uiModelType;
  if (left.kind === "easyui" && right.kind === "easyui") return left.objectType === right.objectType && left.uiExtendType === right.uiExtendType;
  if (left.kind === "layout" && right.kind === "layout") return left.objectType === right.objectType && left.layoutType === right.layoutType;
  return left.kind === "prototype" && right.kind === "prototype" && left.prototypeName === right.prototypeName;
}
