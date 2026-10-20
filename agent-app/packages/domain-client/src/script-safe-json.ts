/** 直接嵌入到ECMAScript源代码中的JSON文本安全 */
export function stringifyScriptSafeJson(value: unknown): string | undefined {
  const serialized = JSON.stringify(value);
  return serialized
    ?.replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
