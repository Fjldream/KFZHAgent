// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
export interface TrialConfig {
  schemaVersion: 1;
  databaseUrl: string;
  host: "127.0.0.1";
  apiPort: number;
  webPort: number;
  tenantId: string;
  tenantName: string;
  username: string;
  signingKey: string;
  ownershipToken: string;
  model: string;
  visionModel: string;
  baseUrl: string;
  createdAt: string;
}
export function assertTrialDatabase(value: string): void {
  const url = new URL(value);
  if (url.protocol !== "postgresql:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    || !/^\/kf_agent_trial_v1_[a-z0-9_]{1,48}$/.test(url.pathname) || url.search || url.hash) {
    throw new Error("TRIAL_DATABASE_SCOPE_INVALID");
  }
}
export function validateTrialConfig(input: unknown): TrialConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("TRIAL_CONFIG_INVALID");
  const config = input as TrialConfig;
  const port = (value: number) => Number.isSafeInteger(value) && value >= 1024 && value <= 65535;
  if (config.schemaVersion !== 1 || config.host !== "127.0.0.1" || !port(config.apiPort) || !port(config.webPort)
    || config.apiPort === config.webPort || !/^[a-f0-9-]{36}$/i.test(config.tenantId)
    || [config.tenantName, config.username, config.model, config.visionModel].some(value => typeof value !== "string" || !value.trim())
    || typeof config.signingKey !== "string" || Buffer.from(config.signingKey, "base64").length !== 32
    || typeof config.ownershipToken !== "string" || !/^[a-f0-9]{64}$/.test(config.ownershipToken)
    || typeof config.createdAt !== "string" || !Number.isFinite(Date.parse(config.createdAt))) throw new Error("TRIAL_CONFIG_INVALID");
  assertTrialDatabase(config.databaseUrl);
  const baseUrl = new URL(config.baseUrl);
  if (!["http:", "https:"].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) throw new Error("TRIAL_MODEL_ROUTE_INVALID");
  return structuredClone(config);
}
export function trialServiceEnvironment(config: TrialConfig, directory: string, inherited: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  validateTrialConfig(config);
  const apiKey = inherited.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new Error("TRIAL_MODEL_KEY_REQUIRED");
  const environment: NodeJS.ProcessEnv = {};
  for (const name of ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "SystemRoot", "WINDIR"]) if (inherited[name]) environment[name] = inherited[name];
  const origin = `http://${config.host}:${config.webPort}`;
  return { ...environment, NODE_ENV: "production", DATABASE_URL: config.databaseUrl, API_HOST: config.host,
    PORT: String(config.apiPort), ARTIFACT_STORAGE_ROOT: `${directory}/artifacts`,
    CORS_ORIGINS: origin, AGENT_ALLOWED_ORIGINS: origin, COOKIE_SECURE: "false",
    MODEL_PORT_MODE: "deepseek", DEEPSEEK_API_KEY: apiKey, DEEPSEEK_BASE_URL: config.baseUrl,
    DEEPSEEK_MODEL: config.model, DEEPSEEK_VISION_MODEL: config.visionModel, DEEPSEEK_THINKING: "1",
    DEEPSEEK_TIMEOUT_MS: "120000", DEEPSEEK_MAX_CONTEXT_TOKENS: "1048576",
    KF_SERVER_PLAN_HMAC_KEY_BASE64: config.signingKey, KF_VISUAL_BLUEPRINT_REPAIR: "once", KF_VISUAL_SEMANTIC_REPAIR: "once",
    AGENT_TENANT_ID: config.tenantId, AGENT_RUNS_V2: "true", AGENT_WORKBENCH_V2: "true", AGENT_VISION_V1: "true", AGENT_REFERENCE_UPLOADS_V1: "true",
    AGENT_FEATURE_TENANT_ALLOWLIST: config.tenantId, AGENT_USAGE_V2: "false", AGENT_PROMPT_V2: "false",
    AGENT_REGIONAL_EDIT_V1: "false", AGENT_NATIVE_VERIFY_V1: "false", KINGCLIENT_NATIVE_ACCEPTED: "false",
    LANGCHAIN_TRACING: "false", LANGCHAIN_TRACING_V2: "false", LANGSMITH_TRACING: "false" };
}
// end
