// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { describe, expect, it } from "vitest";
import { MODEL_CAPABILITY_UNSUPPORTED, resolveModelRoutes, validateModelRoute } from "./model-config.js";

describe("model route resolution", () => {
  it("keeps the existing text defaults when nothing is configured", () => {
    const routes = resolveModelRoutes({});
    expect(routes.intent).toMatchObject({
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
      supportsJson: true,
      supportsThinking: false,
      supportsVision: false,
      maxContextTokens: 64000,
      timeoutMs: 60000,
      pricingVersion: null,
    });
    for (const task of ["intent", "blueprint", "implementation", "repair", "summary"] as const) {
      expect(routes[task]).toBe(routes.intent);
    }
    expect(Object.keys(routes.intent)).not.toContain("apiKey");
  });

  it("refuses vision work until a vision model is explicitly configured", () => {
    const routes = resolveModelRoutes({});
    expect(() => validateModelRoute(routes.vision, "vision")).toThrow(MODEL_CAPABILITY_UNSUPPORTED);
    expect(validateModelRoute(routes.intent, "intent")).toBe(routes.intent);
  });

  it("binds vision to its own whitelisted model and never falls back to text", () => {
    const routes = resolveModelRoutes({
      DEEPSEEK_VISION_MODEL: "deepseek-vision-test",
      DEEPSEEK_MODEL: "deepseek-chat-test",
    });
    expect(routes.vision).toMatchObject({ model: "deepseek-vision-test", supportsVision: true });
    expect(routes.intent).toMatchObject({ model: "deepseek-chat-test", supportsVision: false });
    expect(validateModelRoute(routes.vision, "vision")).toBe(routes.vision);
  });

  it("normalizes base url, ignores blank model names and rejects invalid budgets", () => {
    const routes = resolveModelRoutes({
      DEEPSEEK_BASE_URL: "  https://api.deepseek.com/v1///  ",
      DEEPSEEK_MODEL: "   ",
      DEEPSEEK_TIMEOUT_MS: "abc",
      DEEPSEEK_MAX_CONTEXT_TOKENS: "-5",
    });
    expect(routes.intent.baseUrl).toBe("https://api.deepseek.com/v1");
    expect(routes.intent.model).toBe("deepseek-chat");
    expect(routes.intent.timeoutMs).toBe(60000);
    expect(routes.intent.maxContextTokens).toBe(64000);
    expect(resolveModelRoutes({ DEEPSEEK_TIMEOUT_MS: "15000" }).intent.timeoutMs).toBe(15000);
  });

  it("passes pricing version and thinking capability through explicitly", () => {
    const routes = resolveModelRoutes({ DEEPSEEK_PRICING_VERSION: "v2026-10", DEEPSEEK_THINKING: "1" });
    expect(routes.summary.pricingVersion).toBe("v2026-10");
    expect(routes.summary.supportsThinking).toBe(true);
    expect(resolveModelRoutes({ DEEPSEEK_PRICING_VERSION: "  " }).summary.pricingVersion).toBeNull();
  });
});
// end
