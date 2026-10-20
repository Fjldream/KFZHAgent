// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { assertSafeTestDatabase } from "../../helpers/database-safety.js";

// end

export interface E2eDestructiveResetEnvironment {
  databaseUrl: string | undefined;
  allowDestructiveReset: string | undefined;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const E2E_DATABASE_PREFIX = "kf_agent_e2e_";

function refuse(reason: string): never {
  throw new Error(`E2E destructive reset refused: ${reason}`);
}

/**
 * Pure, credential-safe validation for the database that the E2E seed will
 * truncate. The error intentionally never contains the URL or credentials.
 */
export function assertE2eDestructiveResetAllowed(input: E2eDestructiveResetEnvironment): void {
  if (input.allowDestructiveReset !== "1") refuse("explicit reset sentinel is missing");
  if (input.databaseUrl === undefined || input.databaseUrl.length === 0) refuse("database URL is missing");

  let parsed: URL;
  try {
    parsed = new URL(input.databaseUrl);
  } catch {
    refuse("database URL is invalid");
  }
  // modified by jinlong.feng at 2026-10-20 Agent工作台迭代
  // 协议、隔离库前缀与库名长度规则改为复用统一守卫，避免两处实现漂移；
  // 失败仍统一走 refuse，保留既有「双开关 + 独立库名」语义与脱敏报错。
  try {
    assertSafeTestDatabase({
      url: input.databaseUrl,
      allowReset: input.allowDestructiveReset,
      expectedPrefix: E2E_DATABASE_PREFIX,
    });
  } catch {
    refuse("database is not an authorized isolated E2E target");
  }
  // end
  const hostname = parsed.hostname.startsWith("[") && parsed.hostname.endsWith("]")
    ? parsed.hostname.slice(1, -1)
    : parsed.hostname;
  if (!LOCAL_HOSTS.has(hostname)) refuse("database host is not loopback");
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (!new RegExp(`^${E2E_DATABASE_PREFIX}[a-z0-9_]+$`).test(databaseName)) {
    refuse("database name is not an isolated E2E target");
  }
}

export async function loadAfterE2eDestructiveResetGuard<T>(
  environment: E2eDestructiveResetEnvironment,
  loader: () => Promise<T>,
): Promise<T> {
  assertE2eDestructiveResetAllowed(environment);
  return loader();
}
