// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { describe, expect, it } from "vitest";
import { assertTrialDatabase, trialServiceEnvironment, validateTrialConfig } from "./runtime.js";

const config = { schemaVersion: 1 as const, databaseUrl: "postgresql://postgres@127.0.0.1:5432/kf_agent_trial_v1_20261027",
  host: "127.0.0.1" as const, apiPort: 43300, webPort: 43301, tenantId: "00000000-0000-4000-8000-000000000001",
  tenantName: "Agent Trial", username: "admin", signingKey: Buffer.alloc(32, 7).toString("base64"),
  ownershipToken: "a".repeat(64), model: "deepseek-flash", visionModel: "deepseek-flash", baseUrl: "https://api.deepseek.com", createdAt: "2026-10-27T00:00:00.000Z" };
describe("isolated usable trial runtime", () => {
  it.each(["postgresql://postgres@127.0.0.1/kf_agent_e2e_trial_20261021_01", "postgresql://postgres@127.0.0.1/production",
    "postgresql://postgres@192.168.3.32/kf_agent_trial_v1_demo", "postgresql://postgres@127.0.0.1/kf_agent_trial_v1_x?options=-csearch_path%3Dother"])("refuses an unrelated database %s", value => {
    expect(() => assertTrialDatabase(value)).toThrow();
  });
  it("validates explicit local ports and exact owned database scope", () => {
    expect(validateTrialConfig(config)).toEqual(config);
    expect(() => validateTrialConfig({ ...config, webPort: config.apiPort })).toThrow();
    expect(() => validateTrialConfig({ ...config, host: "0.0.0.0" })).toThrow();
    expect(() => validateTrialConfig({ ...config, tenantId: "" })).toThrow();
  });
  it("starts the real model and exact tenant rollout with private storage and tracing disabled", () => {
    const environment = trialServiceEnvironment(config, "/tmp/owned-trial", { PATH: "/bin", HOME: "/user", DEEPSEEK_API_KEY: "test-secret",
      DATABASE_URL: "postgresql://unrelated/production", MODEL_PORT_MODE: "fake", NODE_OPTIONS: "--import=unexpected", LANGCHAIN_TRACING_V2: "true" });
    expect(environment).toMatchObject({ DATABASE_URL: config.databaseUrl, MODEL_PORT_MODE: "deepseek", DEEPSEEK_API_KEY: "test-secret",
      AGENT_REFERENCE_UPLOADS_V1: "true", KF_VISUAL_BLUEPRINT_REPAIR: "once", KF_VISUAL_SEMANTIC_REPAIR: "once",
      DEEPSEEK_MODEL: config.model, DEEPSEEK_VISION_MODEL: config.visionModel, AGENT_FEATURE_TENANT_ALLOWLIST: config.tenantId,
      AGENT_RUNS_V2: "true", AGENT_WORKBENCH_V2: "true", AGENT_VISION_V1: "true", LANGCHAIN_TRACING_V2: "false", COOKIE_SECURE: "false",
      API_HOST: "127.0.0.1", ARTIFACT_STORAGE_ROOT: "/tmp/owned-trial/artifacts", AGENT_TENANT_ID: config.tenantId,
      CORS_ORIGINS: "http://127.0.0.1:43301", AGENT_ALLOWED_ORIGINS: "http://127.0.0.1:43301" });
    expect(environment.NODE_OPTIONS).toBeUndefined();
    expect(environment.KF_TEST_ALLOW_DESTRUCTIVE_RESET).toBeUndefined();
    expect(environment.KF_E2E_ALLOW_DESTRUCTIVE_RESET).toBeUndefined();
  });
  it("refuses to label a fake or missing-key runtime as usable", () => {
    expect(() => trialServiceEnvironment(config, "/tmp/owned-trial", {})).toThrow("TRIAL_MODEL_KEY_REQUIRED");
  });
});
// end
