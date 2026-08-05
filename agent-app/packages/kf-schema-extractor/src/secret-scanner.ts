/**
 * 敏感信息扫描：按键名（大小写不敏感）检测敏感字段，返回路径与类型。
 * 本模块只报告字段的存在与位置，不读取、不返回字段值。
 */

export type SecretKind =
  | "password"
  | "token"
  | "secret"
  | "connection-string"
  | "username"
  | "host"
  | "ip-address"
  | "url";

export interface SecretFinding {
  /** 点分 JSON 字段路径 */
  path: string;
  /** 匹配到的原始键名 */
  key: string;
  /** 规范化后的敏感类型 */
  kind: SecretKind;
}

interface SensitiveKeyRule {
  /** 小写键名列表 */
  matchers: readonly string[];
  kind: SecretKind;
}

/** brief Step 5 键表：password, passwd, pwd, token, secret, connectionString, username, host, ip, url */
const SENSITIVE_KEY_RULES: readonly SensitiveKeyRule[] = [
  { matchers: ["password", "passwd", "pwd"], kind: "password" },
  { matchers: ["token"], kind: "token" },
  { matchers: ["secret"], kind: "secret" },
  { matchers: ["connectionstring"], kind: "connection-string" },
  { matchers: ["username"], kind: "username" },
  { matchers: ["host"], kind: "host" },
  { matchers: ["ip"], kind: "ip-address" },
  { matchers: ["url"], kind: "url" },
];

/** 每个敏感类型对应的确定性非敏感替换标记，同一类型统一标记以保证引用可比。 */
export function redactMarker(kind: SecretKind): string {
  return `[REDACTED:${kind}]`;
}

/** 键名（大小写不敏感）命中敏感规则时返回其类型，否则返回 null。 */
export function kindForSensitiveKey(key: string): SecretKind | null {
  const lower = key.toLowerCase();
  for (const rule of SENSITIVE_KEY_RULES) {
    if (rule.matchers.includes(lower)) {
      return rule.kind;
    }
  }
  return null;
}

function walkValue(value: unknown, path: string, findings: SecretFinding[]): void {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      walkValue(value[i], `${path}[${i}]`, findings);
    }
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = path === "" ? key : `${path}.${key}`;
      const kind = kindForSensitiveKey(key);
      if (kind !== null) {
        findings.push({ path: childPath, key, kind });
      }
      walkValue(child, childPath, findings);
    }
  }
}

/**
 * 扫描 JSON 文本中的敏感键名。解析失败（非 JSON 文本）时返回空数组。
 */
export function scanSecrets(input: string): SecretFinding[] {
  let value: unknown;
  try {
    value = JSON.parse(input) as unknown;
  } catch {
    return [];
  }
  const findings: SecretFinding[] = [];
  walkValue(value, "", findings);
  return findings;
}
