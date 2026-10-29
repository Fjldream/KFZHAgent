// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { RUN_PLAN_VERSION } from "./run-execution-plan.js";

export type WorkbenchConfig = {
  schemaVersion: 1;
  planVersion: string;
  flags: {
    agentRunsV2: boolean;
    agentWorkbenchV2: boolean;
    agentUsageV2: false;
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    /** Enabled only by the server rollout; each request still checks tenant egress and user consent. */
    // end
    agentVisionV1: boolean;
    // end
    agentRegionalEditV1: false;
    agentNativeVerifyV1: false;
    budgetGuard: false;
  };
  admission: { enabled: boolean; reason: "disabled" | "tenant_not_enabled" | "invalid_configuration" | null };
  // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
  imagePolicy: "disabled" | "explicit-consent";
  outboundImagesAllowed: boolean;
  // end
};

export function resolveRunFeature(input: { enabled: boolean; allowedTenantIds: readonly string[]; tenantId: string }): boolean {
  return input.enabled && input.tenantId.length > 0 && input.allowedTenantIds.includes(input.tenantId);
}

/** 只返回已实现能力的有效配置；不暴露 allowlist、provider URL 或任何凭据。 */
export function resolveWorkbenchConfig(tenantId: string, environment: Readonly<Record<string, string | undefined>> = process.env): WorkbenchConfig {
  const names = ["AGENT_RUNS_V2", "AGENT_WORKBENCH_V2", "AGENT_USAGE_V2", "AGENT_PROMPT_V2", "AGENT_VISION_V1", "AGENT_REGIONAL_EDIT_V1", "AGENT_NATIVE_VERIFY_V1"];
  const invalidBoolean = names.some(name => ![undefined, "", "true", "false"].includes(environment[name]));
  const runsRequested = environment.AGENT_RUNS_V2 === "true";
  const workbenchRequested = environment.AGENT_WORKBENCH_V2 === "true";
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  const visionRequested = environment.AGENT_VISION_V1 === "true";
  const unavailableRequested = ["AGENT_USAGE_V2", "AGENT_PROMPT_V2", "AGENT_REGIONAL_EDIT_V1", "AGENT_NATIVE_VERIFY_V1"]
    .some(name => environment[name] === "true");
  const invalid = invalidBoolean || unavailableRequested || (workbenchRequested && !runsRequested)
    || (visionRequested && (!runsRequested || !workbenchRequested));
  // end
  const allowedTenantIds = (environment.AGENT_FEATURE_TENANT_ALLOWLIST ?? "").split(",").map(value => value.trim()).filter(Boolean);
  const runs = !invalid && resolveRunFeature({ enabled: runsRequested, allowedTenantIds, tenantId });
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  const vision = runs && workbenchRequested && visionRequested;
  // end
  return {
    schemaVersion: 1,
    planVersion: RUN_PLAN_VERSION,
    flags: { agentRunsV2: runs, agentWorkbenchV2: runs && workbenchRequested,
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      agentUsageV2: false, agentVisionV1: vision, agentRegionalEditV1: false, agentNativeVerifyV1: false, budgetGuard: false },
      // end
    admission: { enabled: runs, reason: invalid ? "invalid_configuration" : !runsRequested ? "disabled" : !runs ? "tenant_not_enabled" : null },
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    imagePolicy: vision ? "explicit-consent" : "disabled",
    outboundImagesAllowed: vision,
    // end
  };
}
// end
