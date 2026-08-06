import { describe, expect, it, vi } from "vitest";
import { createClassifyIntentNode } from "./classify-intent.js";
import type { ClassifyIntentResult } from "../schemas/intent.js";

function makeClarifyDeps() {
  const modelPort = {
    classifyIntent: vi.fn().mockResolvedValue({
      intent: "CLARIFY",
      requestedDomains: [],
      needsClarification: true,
      clarifyingQuestion: { question: "主题是哪种？", options: ["①生产监控", "②设备状态"] },
    } satisfies ClassifyIntentResult),
  };
  return {
    modelPort,
    workspaceQuery: { appendMessage: vi.fn().mockResolvedValue(undefined) },
    isDomainSupported: () => true,
  };
}

function baseState(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "t1",
    userId: "u1",
    workspaceId: "w1",
    conversationId: "c1",
    recentMessages: [{ role: "user", content: "生成监控大屏" }],
    stage: "idle",
    ...overrides,
  };
}

describe("classify-intent node CLARIFY gate", () => {
  it("still clarifies at count 4 and carries the clarifyingQuestion into state", async () => {
    const deps = makeClarifyDeps();
    const update = await createClassifyIntentNode(deps as never)(baseState({ clarificationCount: 4 }) as never);
    expect(update.intent).toBe("CLARIFY");
    expect(update.clarifyingQuestion).toEqual({
      question: "主题是哪种？",
      options: ["①生产监控", "②设备状态"],
    });
  });

  it("clarifies on the first turn (count 0) without gate interference", async () => {
    const deps = makeClarifyDeps();
    const update = await createClassifyIntentNode(deps as never)(baseState({}) as never);
    expect(update.intent).toBe("CLARIFY");
    expect(update.clarifyingQuestion?.options?.length).toBeGreaterThan(0);
  });

  it("refuses to keep asking at count 5: CLARIFY is routed as NEW_REQUIREMENT", async () => {
    const deps = makeClarifyDeps();
    const update = await createClassifyIntentNode(deps as never)(baseState({ clarificationCount: 5 }) as never);
    expect(update.intent).toBe("NEW_REQUIREMENT");
    expect(update.clarifyingQuestion).toBeUndefined();
    expect(update.reply).toContain("已尝试多轮澄清");
  });
});
