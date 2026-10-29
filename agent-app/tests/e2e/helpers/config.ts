/** E2E 共享配置：端口、数据库、种子账户。 */

// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import path from "node:path";
export const API_PORT = process.env.E2E_API_PORT ?? "43180";
export const WEB_PORT = process.env.E2E_WEB_PORT ?? "43181";
// end
export const API_BASE = `http://localhost:${API_PORT}`;
export const WEB_BASE = `http://localhost:${WEB_PORT}`;
export const E2E_DB_URL = process.env.E2E_DATABASE_URL
  ?? "postgresql://postgres@127.0.0.1:5432/kf_agent_e2e_default";

export interface E2eUser {
  tenant: string;
  username: string;
  password: string;
}

export const TENANT_A: E2eUser = { tenant: "E2E Acme", username: "alice", password: "TempPass-123" };
export const TENANT_B: E2eUser = { tenant: "E2E Globex", username: "bob", password: "TempPass-123" };
// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
export const TENANT_C: E2eUser = { tenant: "E2E Readonly", username: "carol", password: "TempPass-123" };
export const TENANT_A_ID = "00000000-0000-4000-8000-0000000000a1";
export const TENANT_B_ID = "00000000-0000-4000-8000-0000000000b1";
export const TENANT_C_ID = "00000000-0000-4000-8000-0000000000c1";

/** Explicit environment allowlist: never inherit live keys, model URLs, node preload hooks or rollout flags. */
export function serviceEnvironment(runtimeRoot: string, inherited: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const name of ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "SystemRoot", "WINDIR"]) {
    if (inherited[name]) environment[name] = inherited[name];
  }
  return {
    ...environment, NODE_ENV: "test", DATABASE_URL: E2E_DB_URL,
    ARTIFACT_STORAGE_ROOT: path.join(runtimeRoot, "artifacts"),
    CORS_ORIGINS: WEB_BASE, AGENT_ALLOWED_ORIGINS: WEB_BASE,
    MODEL_PORT_MODE: "fake", COOKIE_SECURE: "false", KF_E2E_ALLOW_DESTRUCTIVE_RESET: "1",
    KF_SERVER_PLAN_HMAC_KEY_BASE64: Buffer.alloc(32, 0x45).toString("base64"),
    AGENT_RUNS_V2: "true", AGENT_WORKBENCH_V2: "true",
    AGENT_FEATURE_TENANT_ALLOWLIST: [TENANT_A_ID, TENANT_B_ID].join(","),
    AGENT_USAGE_V2: "false", AGENT_PROMPT_V2: "false", AGENT_VISION_V1: "false",
    AGENT_REGIONAL_EDIT_V1: "false", AGENT_NATIVE_VERIFY_V1: "false", KINGCLIENT_NATIVE_ACCEPTED: "false",
  };
}
// end
