/**
 * 工程 JSON 脱敏：把敏感键的值替换为确定性标记，保持引用可比。
 * 绝不修改原始语料——本模块只产生新文本。
 */

import { redactMarker, kindForSensitiveKey, type SecretFinding } from "./secret-scanner.ts";

export interface SanitizedProject {
  /** 脱敏后的 JSON 文本（紧凑序列化，键序保持）；解析失败时恒为空串 */
  content: string;
  /** 检测到的敏感字段（保留键名与位置，值已替换） */
  findings: SecretFinding[];
  /** 脱敏后对象中的字段总数 */
  fieldCount: number;
  /** 脱敏后文本的 UTF-8 字节数 */
  byteSize: number;
  /** JSON 解析失败时为 true；此时 content 为空串，调用方不得把原文写入任何产物 */
  parseFailed: boolean;
}

function sanitizeValue(value: unknown, path: string, findings: SecretFinding[]): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeValue(item, `${path}[${index}]`, findings));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = path === "" ? key : `${path}.${key}`;
      const kind = kindForSensitiveKey(key);
      if (kind !== null) {
        findings.push({ path: childPath, key, kind });
        out[key] = redactMarker(kind);
      } else {
        out[key] = sanitizeValue(child, childPath, findings);
      }
    }
    return out;
  }
  return value;
}

function countFields(value: unknown): number {
  if (Array.isArray(value)) {
    let total = 0;
    for (const item of value) {
      total += countFields(item);
    }
    return total;
  }
  if (value !== null && typeof value === "object") {
    let total = 0;
    for (const child of Object.values(value as Record<string, unknown>)) {
      total += 1 + countFields(child);
    }
    return total;
  }
  return 0;
}

/**
 * 解析并脱敏一段工程 JSON 文本。
 * 无法解析时返回 parseFailed=true 且 content 为空串（绝不携带原文，防止敏感值泄露）。
 */
export function sanitizeProject(input: string): SanitizedProject {
  let value: unknown;
  try {
    value = JSON.parse(input) as unknown;
  } catch {
    return { content: "", findings: [], fieldCount: 0, byteSize: 0, parseFailed: true };
  }
  const findings: SecretFinding[] = [];
  const sanitized = sanitizeValue(value, "", findings);
  const content = JSON.stringify(sanitized) ?? "null";
  return {
    content,
    findings,
    fieldCount: countFields(sanitized),
    byteSize: byteLength(content),
    parseFailed: false,
  };
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}
