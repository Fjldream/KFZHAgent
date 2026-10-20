// modified by jinlong.feng at 2026-10-20 Agent工作台迭代

/**
 * 稳定序列化：对象 key 递归排序，数组保持语义顺序，undefined 成员省略。
 * 用于计算 prompt 前缀哈希——同样的语义必须得到同样的字节，否则缓存命中率是假的。
 */
const sortForCanonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortForCanonical);
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] === undefined) continue;
      sorted[key] = sortForCanonical(source[key]);
    }
    return sorted;
  }
  return value;
};

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortForCanonical(value));
}
// end
