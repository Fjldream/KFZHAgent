import { describe, expect, it, vi } from "vitest";
import { createClassifyIntentNode } from "./classify-intent.js";
import type { ClassifyIntentResult } from "../schemas/intent.js";
import { routeAfterClassify } from "../solution-graph.js";
import { hashDesignPlan } from "../design-plan-version.js";
import { encodeBlueprintConfirmation } from "../blueprint-message.js";

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

describe("classify-intent node design-review routing", () => {
  it("classifies a structured blueprint receipt without calling the model", async () => {
    const deps = {
      modelPort: { classifyIntent: vi.fn() },
      workspaceQuery: { appendMessage: vi.fn().mockResolvedValue(undefined) },
      isDomainSupported: () => true,
    };
    const receipt = encodeBlueprintConfirmation(2, "c".repeat(64));

    const update = await createClassifyIntentNode(deps as never)(baseState({
      stage: "design-review",
      generationWorkflow: "creative-v2",
      recentMessages: [{ role: "user", content: receipt }],
    }) as never);

    expect(update.intent).toBe("CONFIRM_DESIGN");
    expect(deps.modelPort.classifyIntent).not.toHaveBeenCalled();
  });
  it("preserves the retry reason until the creative explicit-retry edge consumes it", async () => {
    const deps = {
      modelPort: {
        classifyIntent: vi.fn(),
      },
      workspaceQuery: { appendMessage: vi.fn().mockResolvedValue(undefined) },
      isDomainSupported: () => true,
    };
    const designPlan = { schema: "kf-design-plan/v3" } as const;
    const before = baseState({
      generationWorkflow: "creative-v2",
      designPlan,
      designPlanHash: hashDesignPlan(designPlan as never, 1),
      designRevision: 1,
      lastErrorCode: "CREATIVE_SOLUTION_BLOCKED:LAYOUT_OVERFLOW",
      recentMessages: [{ role: "user", content: "重新生成工程" }],
    });

    const update = await createClassifyIntentNode(deps as never)(before as never);
    const after = { ...before, ...update };

    expect(update.intent).toBe("CONFIRM_DESIGN");
    expect(after.lastErrorCode).toBe("CREATIVE_SOLUTION_BLOCKED:LAYOUT_OVERFLOW");
    expect(routeAfterClassify(after as never)).toBe("capability-retrieval");
    expect(deps.modelPort.classifyIntent).not.toHaveBeenCalled();
  });

  it.each(["done", "idle"])(
    "routes an implementation retry from a stale %s checkpoint back to confirmed-design planning",
    async (stage) => {
    const deps = {
      modelPort: {
        classifyIntent: vi.fn().mockResolvedValue({
          intent: "CONFIRM_PLAN",
          requestedDomains: ["kingclient"],
        } satisfies ClassifyIntentResult),
      },
      workspaceQuery: { appendMessage: vi.fn().mockResolvedValue(undefined) },
      isDomainSupported: () => true,
    };

    const update = await createClassifyIntentNode(deps as never)(
      baseState({
        stage,
        designPlanHash: "a".repeat(64),
        planHash: "b".repeat(64),
        buildJobId: "job-old",
        buildConfirmed: true,
        lastErrorCode: "UI_IMPLEMENTATION_INVALID:button property rejected",
        recentMessages: [{ role: "user", content: "重新生成工程实施计划" }],
      }) as never,
    );

      expect(update.intent).toBe("CONFIRM_DESIGN");
      expect(update.buildConfirmed).toBe(false);
      expect(update.lastErrorCode).toBeUndefined();
      expect(deps.modelPort.classifyIntent).not.toHaveBeenCalled();
    },
  );

  it("treats supplemental requirements as a design revision before design confirmation", async () => {
    const deps = {
      modelPort: {
        classifyIntent: vi.fn().mockResolvedValue({
          intent: "MODIFY_REQUIREMENT",
          requestedDomains: ["kingclient"],
        } satisfies ClassifyIntentResult),
      },
      workspaceQuery: { appendMessage: vi.fn().mockResolvedValue(undefined) },
      isDomainSupported: () => true,
    };

    const update = await createClassifyIntentNode(deps as never)(
      baseState({
        stage: "design-review",
        designPlanHash: "a".repeat(64),
        recentMessages: [
          {
            role: "user",
            content: "我希望有我的产品，项目经历，可以使用假的数据占位，但是内容要充实",
          },
        ],
      }) as never,
    );

    expect(update.intent).toBe("REVISE_DESIGN");
  });

  it("recovers a cancelled legacy plan checkpoint back into design revision", async () => {
    const deps = {
      modelPort: {
        classifyIntent: vi.fn().mockResolvedValue({
          intent: "MODIFY_REQUIREMENT",
          requestedDomains: ["kingclient"],
        } satisfies ClassifyIntentResult),
      },
      workspaceQuery: { appendMessage: vi.fn().mockResolvedValue(undefined) },
      isDomainSupported: () => true,
    };

    const update = await createClassifyIntentNode(deps as never)(
      baseState({
        stage: "idle",
        designPlanHash: "a".repeat(64),
        planHash: undefined,
        buildJobId: undefined,
        recentMessages: [{ role: "user", content: "再增加我的产品介绍" }],
      }) as never,
    );

    expect(update.intent).toBe("REVISE_DESIGN");
  });
});
