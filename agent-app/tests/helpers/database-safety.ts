// modified by jinlong.feng at 2026-10-20 Agent工作台迭代

/**
 * 破坏性数据库操作只允许命中下列前缀、且名称必须比前缀更长的隔离库。
 * 例如 `kf_agent_test_agent_next` 合法，裸 `kf_agent_test` 或 `production` 一律拒绝。
 */
export type SafeTestDatabasePrefix = "kf_agent_test_" | "kf_agent_e2e_";

export interface SafeTestDatabaseInput {
  url: string | undefined;
  allowReset: string | undefined;
  expectedPrefix: SafeTestDatabasePrefix;
}

/**
 * 纯函数校验，不连接数据库、不记录连接串。必须在任何 Prisma import/连接/seed 之前调用；
 * 错误信息只含固定代码，不回显 URL、库名或凭据。
 */
export function assertSafeTestDatabase(input: SafeTestDatabaseInput): void {
  if (!input.url || input.allowReset !== "1") {
    throw new Error("TEST_DATABASE_NOT_AUTHORIZED");
  }

  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    throw new Error("UNSAFE_TEST_DATABASE");
  }

  let databaseName: string;
  try {
    databaseName = decodeURIComponent(parsed.pathname.slice(1));
  } catch {
    throw new Error("UNSAFE_TEST_DATABASE");
  }

  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol)
    || !databaseName.startsWith(input.expectedPrefix)
    || databaseName.length <= input.expectedPrefix.length
  ) {
    throw new Error("UNSAFE_TEST_DATABASE");
  }
}
// end
