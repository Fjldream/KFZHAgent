// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { ModelRoute } from "@kf/contracts";
import { describe, expect, it, vi } from "vitest";
import { MODEL_TIMEOUT, ModelTransportError, type JsonModelRequest } from "./deepseek-transport.js";
import type { InvocationFinish, InvocationRecorder, InvocationStart } from "./model-invocation.service.js";
import { ModelGatewayService } from "./model-gateway.js";

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

const scope: InvocationStart = {
  tenantId: "tenant-a",
  workspaceId: "workspace-a",
  conversationId: null,
  runId: null,
  task: "implementation",
  provider: "deepseek",
  requestedModel: "deepseek-chat",
  promptVersion: "implementation@1",
  schemaVersion: "1",
  prefixHash: "prefix",
  inputHash: "input",
  attempt: 1,
};

const request = (signal?: AbortSignal): JsonModelRequest => ({
  scope,
  route: route({ timeoutMs: signal === undefined ? 30 : 5_000 }),
  messages: [{ role: "user", content: "test" }],
  maxOutputTokens: 10,
  thinking: false,
  ...(signal === undefined ? {} : { signal }),
});

const withRun = (modelRequest: JsonModelRequest): JsonModelRequest => ({
  ...modelRequest,
  scope: { ...modelRequest.scope, runId: "run-1" },
});

const recordingRecorder = () => {
  const starts: InvocationStart[] = [];
  const finishes: Array<{ id: string; tenantId: string; result: InvocationFinish }> = [];
  const recorder: InvocationRecorder = {
    start: vi.fn(async (input: InvocationStart) => {
      starts.push(input);
      return "invocation-1";
    }),
    finish: vi.fn(async (id: string, tenantId: string, result: InvocationFinish) => {
      finishes.push({ id, tenantId, result });
    }),
  };
  return { recorder, starts, finishes };
};

const okFetch = (async () => new Response(JSON.stringify({
  model: "deepseek-chat",
  choices: [{ finish_reason: "stop", message: { content: "{\"ok\":true}" } }],
  usage: { prompt_tokens: 10, completion_tokens: 5, prompt_cache_hit_tokens: 4, prompt_cache_miss_tokens: 6 },
}), { status: 200, headers: { "content-type": "application/json", "x-request-id": "req-1" } })) as typeof fetch;

describe("model gateway accounting", () => {
  it("records a successful invocation with usage and latency", async () => {
    const { recorder, starts, finishes } = recordingRecorder();
    const gateway = new ModelGatewayService(recorder, okFetch, "sk-test");

    const result = await gateway.completeJson(request());

    expect(result.text).toBe("{\"ok\":true}");
    expect(starts).toHaveLength(1);
    expect(starts[0]).toMatchObject({ tenantId: "tenant-a", task: "implementation" });
    expect(finishes).toHaveLength(1);
    expect(finishes[0]).toMatchObject({
      id: "invocation-1",
      tenantId: "tenant-a",
      result: { status: "SUCCEEDED", actualModel: "deepseek-chat", providerRequestId: "req-1" },
    });
    expect(finishes[0]!.result.usage.inputTokens).toBe(10);
    expect(finishes[0]!.result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("does not call the provider when the ledger refuses to start", async () => {
    const fetchImpl = vi.fn();
    const recorder: InvocationRecorder = {
      start: async () => {
        throw new Error("BUDGET_EXCEEDED");
      },
      finish: vi.fn(),
    };
    const gateway = new ModelGatewayService(recorder, fetchImpl as unknown as typeof fetch, "sk-test");

    await expect(gateway.completeJson(request())).rejects.toThrow("BUDGET_EXCEEDED");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("records a timeout as UNKNOWN usage instead of free", async () => {
    const { recorder, finishes } = recordingRecorder();
    const stalledFetch = ((_input: unknown, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })) as unknown as typeof fetch;
    const gateway = new ModelGatewayService(recorder, stalledFetch, "sk-test");

    await expect(gateway.completeJson(request())).rejects.toMatchObject({ code: MODEL_TIMEOUT });
    expect(finishes[0]!.result).toMatchObject({ status: "UNKNOWN", failureCode: MODEL_TIMEOUT });
    expect(finishes[0]!.result.usage.source).toBe("unknown");
  });

  it("records cancellation as CANCELLED", async () => {
    const { recorder, finishes } = recordingRecorder();
    const controller = new AbortController();
    const recorderWithAbort: InvocationRecorder = {
      start: async () => {
        setTimeout(() => controller.abort(), 5);
        return "invocation-1";
      },
      finish: recorder.finish,
    };
    const abortableFetch = ((_input: unknown, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })) as unknown as typeof fetch;
    const gateway = new ModelGatewayService(recorderWithAbort, abortableFetch, "sk-test");

    await expect(gateway.completeJson(request(controller.signal))).rejects.toMatchObject({ code: "MODEL_CANCELLED" });
    expect(finishes[0]!.result).toMatchObject({ status: "CANCELLED", failureCode: "MODEL_CANCELLED" });
  });

  it("does not mask the original failure when the failure record cannot be written", async () => {
    const recorder: InvocationRecorder = {
      start: async () => "invocation-1",
      finish: async () => {
        throw new Error("ledger down");
      },
    };
    const failingFetch = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    const gateway = new ModelGatewayService(recorder, failingFetch, "sk-test");

    await expect(gateway.completeJson(request())).rejects.toBeInstanceOf(ModelTransportError);
  });

  it("does not start the ledger or call the provider when the budget refuses", async () => {
    const { recorder } = recordingRecorder();
    const fetchImpl = vi.fn();
    const budget = {
      reserve: vi.fn(async () => {
        throw new Error("BUDGET_EXCEEDED");
      }),
      settle: vi.fn(async () => undefined),
    };
    const gateway = new ModelGatewayService(
      recorder, fetchImpl as unknown as typeof fetch, "sk-test", budget,
    );

    await expect(gateway.completeJson(withRun(request())))
      .rejects.toThrow("BUDGET_EXCEEDED");
    expect(recorder.start).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("settles the budget as known on success", async () => {
    const { recorder } = recordingRecorder();
    const reserve = vi.fn(async () => undefined);
    const settle = vi.fn(async () => undefined);
    const budget = { reserve, settle };

    const gateway = new ModelGatewayService(recorder, okFetch, "sk-test", budget);
    await gateway.completeJson(withRun(request()));

    expect(reserve).toHaveBeenCalledTimes(1);
    expect(settle).toHaveBeenCalledWith(expect.objectContaining({ runId: "run-1", result: "known" }));
  });
});
// end
