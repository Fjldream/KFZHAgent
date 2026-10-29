// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { describe, expect, it } from "vitest";
import { resolveWorkbenchConfig } from "./feature-policy.js";

const enabled = {
  AGENT_RUNS_V2: "true", AGENT_WORKBENCH_V2: "true", AGENT_VISION_V1: "true",
  AGENT_FEATURE_TENANT_ALLOWLIST: "tenant-a",
};

describe("usable workbench feature policy", () => {
  it("allows the implemented image workflow only with explicit tenant-scoped rollout", () => {
    expect(resolveWorkbenchConfig("tenant-a", enabled)).toMatchObject({
      flags: { agentRunsV2: true, agentWorkbenchV2: true, agentVisionV1: true, budgetGuard: false },
      admission: { enabled: true, reason: null }, imagePolicy: "explicit-consent", outboundImagesAllowed: true,
    });
  });
  it("keeps images off when only the text workflow is enabled", () => {
    expect(resolveWorkbenchConfig("tenant-a", { ...enabled, AGENT_VISION_V1: "false" })).toMatchObject({
      flags: { agentRunsV2: true, agentVisionV1: false }, imagePolicy: "disabled", outboundImagesAllowed: false,
    });
  });
  it.each([undefined, "", "tenant-a-suffix", "*"])("rejects an absent or nonexact rollout list %s", allowlist => {
    expect(resolveWorkbenchConfig("tenant-a", { ...enabled, AGENT_FEATURE_TENANT_ALLOWLIST: allowlist }).flags.agentVisionV1).toBe(false);
  });
  it.each(["AGENT_RUNS_V2", "AGENT_WORKBENCH_V2"] as const)("requires the %s dependency for image admission", name => {
    expect(resolveWorkbenchConfig("tenant-a", { ...enabled, [name]: "false" })).toMatchObject({
      admission: { enabled: false, reason: "invalid_configuration" }, imagePolicy: "disabled", outboundImagesAllowed: false,
    });
  });
  it.each(["AGENT_USAGE_V2", "AGENT_PROMPT_V2", "AGENT_REGIONAL_EDIT_V1", "AGENT_NATIVE_VERIFY_V1"])("does not enable unimplemented rollout %s", name => {
    expect(resolveWorkbenchConfig("tenant-a", { ...enabled, [name]: "true" })).toMatchObject({
      admission: { enabled: false, reason: "invalid_configuration" }, flags: { agentVisionV1: false },
    });
  });
  it("does not leak tenant configuration or provider credentials in public capabilities", () => {
    const result = JSON.stringify(resolveWorkbenchConfig("tenant-b", { ...enabled, DEEPSEEK_API_KEY: "private-test-key" }));
    expect(result).not.toContain("tenant-a");
    expect(result).not.toContain("private-test-key");
    expect(JSON.parse(result)).toMatchObject({ admission: { enabled: false }, outboundImagesAllowed: false });
  });
});
// end
