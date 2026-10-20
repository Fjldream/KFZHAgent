// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { ModelRoute } from "@kf/contracts";
import { describe, expect, it } from "vitest";
import {
  MODEL_AUTH_ERROR,
  MODEL_CANCELLED,
  MODEL_CAPABILITY_UNSUPPORTED,
  MODEL_PROTOCOL_ERROR,
  MODEL_RATE_LIMIT,
  MODEL_TIMEOUT,
  MODEL_TRANSIENT,
  requestDeepSeekJson,
  type JsonModelCall,
} from "./deepseek-transport.js";

const route = (overrides: Partial<ModelRoute> = {}): ModelRoute => ({
  provider: "deepseek",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-chat",
  supportsVision: false,
  supportsJson: true,
  supportsThinking: true,
  maxContextTokens: 64_000,
  timeoutMs: 30,
  pricingVersion: null,
  ...overrides,
});

const call = (overrides: Partial<JsonModelCall> = {}): JsonModelCall => ({
  route: route(),
  messages: [{ role: "user", content: "test" }],
  maxOutputTokens: 10,
  thinking: false,
  temperature: 0.2,
  ...overrides,
});

/** headers 永不返回的 fetch：只在 abort 时拒绝。 */
const stalledFetch = ((_input: unknown, init?: RequestInit) => new Promise((_resolve, reject) => {
  init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
})) as unknown as typeof fetch;

/** 让 fetch 收到 abort 时把挂起的 stream 置错；模拟「headers 已到、body 慢」。 */
const abortableBodyFetch = ((_input: unknown, init?: RequestInit) => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      init?.signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")));
    },
  });
  return Promise.resolve(new Response(stream, { status: 200 }));
}) as unknown as typeof fetch;

describe("deepseek transport deadline", () => {
  it("fails with MODEL_TIMEOUT when headers never arrive", async () => {
    await expect(requestDeepSeekJson(call(), stalledFetch, "sk-test")).rejects
      .toMatchObject({ code: MODEL_TIMEOUT });
  });

  it("keeps the deadline running while a hanging body is being read", async () => {
    await expect(requestDeepSeekJson(call(), abortableBodyFetch, "sk-test")).rejects
      .toMatchObject({ code: MODEL_TIMEOUT });
  });

  it("classifies external cancellation as MODEL_CANCELLED, not a timeout", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 5);
    await expect(requestDeepSeekJson(
      call({ route: route({ timeoutMs: 5_000 }), signal: controller.signal }),
      abortableBodyFetch,
      "sk-test",
    )).rejects.toMatchObject({ code: MODEL_CANCELLED });
  });
});

describe("deepseek transport responses", () => {
  it("returns text, normalized usage, actual model and request id", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({
      model: "deepseek-chat-2026-10",
      choices: [{ finish_reason: "stop", message: { content: "{\"ok\":true}" } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, prompt_cache_hit_tokens: 4, prompt_cache_miss_tokens: 6 },
    }), { status: 200, headers: { "content-type": "application/json", "x-request-id": "req-9" } })) as typeof fetch;

    const result = await requestDeepSeekJson(call(), fetchImpl, "sk-test");
    expect(result).toMatchObject({
      text: "{\"ok\":true}",
      actualModel: "deepseek-chat-2026-10",
      providerRequestId: "req-9",
      usage: { inputTokens: 10, outputTokens: 5, cacheHitTokens: 4, cacheMissTokens: 6, source: "provider" },
    });
  });

  it("sends thinking and temperature only according to route capabilities", async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl = (async (_input: unknown, init?: RequestInit) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 });
    }) as unknown as typeof fetch;

    await requestDeepSeekJson(call(), fetchImpl, "sk-test");
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.temperature).toBe(0.2);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.max_tokens).toBe(10);

    await requestDeepSeekJson(call({ route: route({ supportsThinking: false }) }), fetchImpl, "sk-test");
    expect(body).not.toHaveProperty("thinking");
  });

  it("maps HTTP status codes to retryable and terminal codes without leaking the key", async () => {
    const respond = (status: number, text = "boom") => (async () =>
      new Response(text, { status })) as unknown as typeof fetch;

    await expect(requestDeepSeekJson(call(), respond(401), "sk-secret")).rejects
      .toMatchObject({ code: MODEL_AUTH_ERROR });
    await expect(requestDeepSeekJson(call(), respond(429), "sk-secret")).rejects
      .toMatchObject({ code: MODEL_RATE_LIMIT });
    await expect(requestDeepSeekJson(call(), respond(503), "sk-secret")).rejects
      .toMatchObject({ code: MODEL_TRANSIENT });
    await expect(requestDeepSeekJson(call(), respond(400), "sk-secret")).rejects
      .toMatchObject({ code: MODEL_PROTOCOL_ERROR });

    try {
      await requestDeepSeekJson(call(), respond(400), "sk-secret");
      throw new Error("should have thrown");
    } catch (error) {
      expect(String(error)).not.toContain("sk-secret");
    }
  });

  it("rejects image parts on routes without vision support", async () => {
    const neverCalled = (async () => {
      throw new Error("transport must reject before calling the provider");
    }) as unknown as typeof fetch;
    await expect(requestDeepSeekJson(
      call({
        messages: [{
          role: "user",
          content: [{ type: "image_url", image_url: { url: "data:image/png;base64,AAAA", detail: "low" } }],
        }],
      }),
      neverCalled,
      "sk-test",
    )).rejects.toMatchObject({ code: MODEL_CAPABILITY_UNSUPPORTED });
  });

  it("treats an empty reply as a protocol error", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), {
      status: 200,
    })) as unknown as typeof fetch;
    await expect(requestDeepSeekJson(call(), fetchImpl, "sk-test")).rejects
      .toMatchObject({ code: MODEL_PROTOCOL_ERROR });
  });
});
// end
