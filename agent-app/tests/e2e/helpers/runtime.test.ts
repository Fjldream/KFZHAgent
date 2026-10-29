// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { describe, expect, it } from "vitest";
import * as configuration from "./config.js";

describe("isolated E2E service environment", () => {
  it("isolates model credentials and enables only fixture tenants", () => {
    const environment = configuration.serviceEnvironment("/tmp/kf-e2e-runtime", {
      PATH: "/usr/bin", DATABASE_URL: "business-database", DEEPSEEK_API_KEY: "must-not-leak",
      MODEL_PORT_MODE: "deepseek", NODE_OPTIONS: "--import=unexpected", AGENT_VISION_V1: "true",
    });
    expect(environment.DATABASE_URL).toBe(configuration.E2E_DB_URL);
    expect(environment.MODEL_PORT_MODE).toBe("fake");
    expect(environment.DEEPSEEK_API_KEY).toBeUndefined();
    expect(environment.NODE_OPTIONS).toBeUndefined();
    expect(environment.AGENT_VISION_V1).toBe("false");
    expect(environment.AGENT_FEATURE_TENANT_ALLOWLIST?.split(",")).toEqual([configuration.TENANT_A_ID, configuration.TENANT_B_ID]);
    expect(environment.AGENT_ALLOWED_ORIGINS).toBe(configuration.WEB_BASE);
    expect(environment.ARTIFACT_STORAGE_ROOT).toBe("/tmp/kf-e2e-runtime/artifacts");
  });
});
// end
