// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { describe, expect, it } from "vitest";
import type { ModelPort } from "@kf/agent-orchestrator";
import type { JsonModelRequest } from "../models/deepseek-transport.js";
import type { ModelGateway } from "../models/model-gateway.js";
import type { PrismaClient } from "@prisma/client";
import { DEFAULT_MODEL_PORT } from "../conversations/model-port.js";
import { normalizeUsage } from "../models/normalize-usage.js";

const route = { provider: "deepseek" as const, baseUrl: "https://blueprint-runtime.invalid/v1", model: "blueprint-fixture",
  supportsJson: true, supportsVision: false, supportsThinking: false, timeoutMs: 1000, maxContextTokens: 64000, pricingVersion: null };
const request: JsonModelRequest = { route, messages: [{ role: "user", content: "fixture" }], maxOutputTokens: 512, thinking: false,
  scope: { tenantId: "tenant-fixture", workspaceId: "workspace-fixture", conversationId: "conversation-fixture", runId: "run-fixture",
    task: "blueprint", provider: "deepseek", requestedModel: "blueprint-fixture", promptVersion: "fixture@1", schemaVersion: "kf-design-plan/v3",
    prefixHash: "a".repeat(64), inputHash: "b".repeat(64), attempt: 1 } };
describe("visual blueprint runtime boundaries", () => {
  // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
  it("binds semantic credentials to the exact frozen route before any gateway call", async () => {
    const { bindVisualSemanticGateway } = await import("./visual-blueprint-runtime.js"); let calls = 0;
    const gateway: ModelGateway = { completeJson: async () => { calls++; return { text: "{}", usage: normalizeUsage(undefined), actualModel: null, providerRequestId: null, finishReason: "stop" }; } };
    const guarded = bindVisualSemanticGateway(gateway, route);
    await expect(guarded.completeJson({ ...request, route: { ...route, baseUrl: "https://other.invalid/v1" } })).rejects.toThrow("VISUAL_SEMANTIC_CREDENTIAL_ROUTE_MISMATCH");
    expect(calls).toBe(0); expect((await guarded.completeJson(request)).text).toBe("{}"); expect(calls).toBe(1);
  });
  it("does not expose an unsafe legacy visual semantic method when the dedicated runtime is missing", async () => {
    const { composeVisualBlueprintModel } = await import("./visual-blueprint-runtime.js");
    const base = { ...DEFAULT_MODEL_PORT, createVisualSolutionImplementationPlan: async () => { throw new Error("must not use legacy unbound route"); } };
    const closed = composeVisualBlueprintModel(base, null, null);
    expect(typeof closed.createVisualSolutionImplementationPlan).toBe("undefined");
    const composed = composeVisualBlueprintModel(base, null, { createVisualSolutionImplementationPlan: async () => ({ schema: "semantic-fixture" }) } as never);
    expect(await composed.createVisualSolutionImplementationPlan!({} as never)).toEqual({ schema: "semantic-fixture" });
  });
  // end
  it("does not hand a configured credential gateway a request for a different frozen endpoint or model", async () => {
    const { bindVisualBlueprintGateway } = await import("./visual-blueprint-runtime.js");
    let calls = 0;
    const gateway: ModelGateway = { completeJson: async () => { calls++; return { text: "{}", usage: normalizeUsage(undefined), actualModel: null, providerRequestId: null, finishReason: "stop" }; } };
    const allowed = structuredClone(route); const guarded = bindVisualBlueprintGateway(gateway, allowed);
    allowed.baseUrl = "https://mutated.invalid/v1";
    for (const changed of [{ ...route, baseUrl: "https://other.invalid/v1" }, { ...route, model: "other-model" }]) {
      await expect(guarded.completeJson({ ...request, route: changed })).rejects.toThrow("VISUAL_BLUEPRINT_CREDENTIAL_ROUTE_MISMATCH");
    }
    expect(calls).toBe(0);
    expect((await guarded.completeJson(request)).text).toBe("{}"); expect(calls).toBe(1);
  });
  it("preserves private-field method receivers when composing the visual port without mutating the text model", async () => {
    const { composeVisualBlueprintModel } = await import("./visual-blueprint-runtime.js");
    class TextModel { #secret = "bound"; async classifyIntent() { return { intent: "QUESTION" as const, requestedDomains: ["kingclient"], reply: this.#secret }; } }
    const base = Object.assign(new TextModel(), { createDesignPlan: DEFAULT_MODEL_PORT.createDesignPlan.bind(DEFAULT_MODEL_PORT) }) as unknown as ModelPort;
    const visual = { createVisualDesignPlan: async () => ({ schema: "fixture-visual" }) };
    const composed = composeVisualBlueprintModel(base, visual as never);
    expect(await composed.classifyIntent({} as never)).toMatchObject({ reply: "bound" });
    expect(await composed.createVisualDesignPlan!({} as never)).toEqual({ schema: "fixture-visual" });
    expect("createVisualDesignPlan" in base).toBe(false);
    expect(composeVisualBlueprintModel(base, null)).toBe(base);
  });
  it("keeps text/fake configurations and missing review keys from enabling visual model egress", async () => {
    const { createVisualPlanningRuntime } = await import("./visual-blueprint-runtime.js");
    const prisma = {} as PrismaClient;
    const key = Buffer.alloc(32, 0x73).toString("base64");
    expect(createVisualPlanningRuntime(prisma, { MODEL_PORT_MODE: "deepseek", DEEPSEEK_API_KEY: "fixture" }).blueprints).toBeNull();
    expect(createVisualPlanningRuntime(prisma, { MODEL_PORT_MODE: "fake", DEEPSEEK_API_KEY: "fixture", KF_SERVER_PLAN_HMAC_KEY_BASE64: key }).blueprints).toBeNull();
    expect(createVisualPlanningRuntime(prisma, { MODEL_PORT_MODE: "deepseek", KF_SERVER_PLAN_HMAC_KEY_BASE64: key }).blueprints).toBeNull();
    const ready = createVisualPlanningRuntime(prisma, { MODEL_PORT_MODE: "deepseek", DEEPSEEK_API_KEY: "fixture", KF_SERVER_PLAN_HMAC_KEY_BASE64: key });
    expect(ready.reviews).not.toBeNull(); expect(ready.blueprints).not.toBeNull();
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    expect(ready.semantics).not.toBeNull();
    const limited = createVisualPlanningRuntime(prisma, { MODEL_PORT_MODE: "deepseek", DEEPSEEK_API_KEY: "fixture",
      KF_SERVER_PLAN_HMAC_KEY_BASE64: key, DEEPSEEK_MAX_CONTEXT_TOKENS: "16000" });
    expect(limited.blueprints).not.toBeNull(); expect(limited.semantics).toBeNull();
    // end
  });
});
// end
