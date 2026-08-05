/**
 * JSON 结构形状提取：只返回字段路径与推断的原始类型，绝不返回字段值。
 */

export type PrimitiveType = "string" | "number" | "boolean" | "null";

export interface FieldShape {
  /** 点分 JSON 字段路径；数组元素以 `path[]` 表示 */
  path: string;
  /** 推断的原始类型 */
  type: PrimitiveType;
}

/**
 * 递归提取 JSON 值的字段形状。数组只取首个元素推断类型；
 * 对象继续深入，原始值记录为 `{ path, type }`。空对象/空数组不产生字段记录。
 */
export function collectJsonShape(value: unknown, prefix = "", out: FieldShape[] = []): FieldShape[] {
  if (value === null) {
    out.push({ path: prefix || "<root>", type: "null" });
  } else if (Array.isArray(value)) {
    const elementPath = prefix === "" ? "[]" : `${prefix}[]`;
    if (value.length > 0) {
      collectJsonShape(value[0], elementPath, out);
    }
  } else if (typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = prefix === "" ? key : `${prefix}.${key}`;
      collectJsonShape(child, childPath, out);
    }
  } else if (typeof value === "string") {
    out.push({ path: prefix || "<root>", type: "string" });
  } else if (typeof value === "number") {
    out.push({ path: prefix || "<root>", type: "number" });
  } else if (typeof value === "boolean") {
    out.push({ path: prefix || "<root>", type: "boolean" });
  } else {
    // 未识别的原始值（bigint/symbol/undefined 在 JSON 中不会出现）
    out.push({ path: prefix || "<root>", type: "null" });
  }
  return out;
}
