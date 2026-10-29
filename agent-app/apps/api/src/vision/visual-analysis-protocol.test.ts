// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import { describe, expect, it } from "vitest";
import type { ModelRoute } from "@kf/contracts";
import type { JsonModelRequest } from "../models/deepseek-transport.js";
import { normalizeUsage } from "../models/normalize-usage.js";
import { bindVisualAnalysisGateway } from "./visual-analysis-protocol.js";

describe("visual analysis model boundary", () => {
  it("pins credentials to a copied exact route before invocation recording or network access", async () => {
    const route: ModelRoute = { provider: "deepseek", model: "vision-fixture", baseUrl: "https://vision.invalid/v1",
      supportsJson: true, supportsVision: true, supportsThinking: false, timeoutMs: 1000, maxContextTokens: 64000, pricingVersion: null };
    let calls = 0;
    const allowed = structuredClone(route);
    const gateway = bindVisualAnalysisGateway({ completeJson: async () => {
      calls++;
      return { text: "{}", usage: normalizeUsage(undefined), actualModel: null, providerRequestId: null, finishReason: "stop" };
    } }, allowed);
    allowed.baseUrl = "https://mutated.invalid";
    const request = { route } as JsonModelRequest;
    for (const change of [{ baseUrl: "https://other.invalid/v1" }, { model: "different-model" }, { supportsVision: false },
      { supportsThinking: true }, { timeoutMs: 2000 }, { maxContextTokens: 32000 }, { pricingVersion: "different-pricing" }]) {
      await expect(gateway.completeJson({ ...request, route: { ...route, ...change } })).rejects.toThrow("VISUAL_ANALYSIS_CREDENTIAL_ROUTE_MISMATCH");
    }
    expect(calls).toBe(0);
    await gateway.completeJson({ ...request, route: structuredClone(route) });
    expect(calls).toBe(1);
  });
});
// end
