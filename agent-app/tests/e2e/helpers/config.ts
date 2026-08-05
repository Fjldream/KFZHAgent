/** E2E 共享配置：端口、数据库、种子账户。 */

export const API_BASE = "http://localhost:3000";
export const WEB_BASE = "http://localhost:5173";
export const E2E_DB_URL = "postgresql://postgres@127.0.0.1:5432/kf_agent_e2e";

export interface E2eUser {
  tenant: string;
  username: string;
  password: string;
}

export const TENANT_A: E2eUser = { tenant: "E2E Acme", username: "alice", password: "TempPass-123" };
export const TENANT_B: E2eUser = { tenant: "E2E Globex", username: "bob", password: "TempPass-123" };
