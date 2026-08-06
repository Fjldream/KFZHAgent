import { describe, expect, it, vi } from "vitest";
import { createClarifyNode } from "./clarify.js";

function makeDeps() {
  return {
    workspaceQuery: {
      appendMessage: vi.fn().mockResolvedValue(undefined),
    },
  };
}

function baseState(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "t1",
    userId: "u1",
    workspaceId: "w1",
    conversationId: "c1",
    recentMessages: [{ id: "m1", role: "user", content: "生成监控大屏" }],
    stage: "clarifying",
    ...overrides,
  };
}

describe("clarify node", () => {
  it("persists the question + options as an assistant message and returns to idle", async () => {
    const deps = makeDeps();
    const node = createClarifyNode(deps as never);
    const state = baseState({
      clarificationCount: 1,
      clarifyingQuestion: {
        question: "主题是哪种？",
        options: ["①生产监控", "②设备状态", "③能源管理"],
      },
    });

    const update = await node(state as never);

    expect(deps.workspaceQuery.appendMessage).toHaveBeenCalledWith({
      tenantId: "t1",
      conversationId: "c1",
      role: "assistant",
      content: "主题是哪种？\n①生产监控\n②设备状态\n③能源管理",
    });
    expect(update.clarificationCount).toBe(2);
    expect(update.stage).toBe("idle");
    expect(update.clarifyingQuestion).toBeUndefined();
  });

  it("persists only the question when there are no options", async () => {
    const deps = makeDeps();
    const node = createClarifyNode(deps as never);
    const state = baseState({
      clarifyingQuestion: { question: "请补充主题" },
    });

    const update = await node(state as never);

    expect(deps.workspaceQuery.appendMessage).toHaveBeenCalledWith({
      tenantId: "t1",
      conversationId: "c1",
      role: "assistant",
      content: "请补充主题",
    });
    expect(update.clarificationCount).toBe(1);
    expect(update.stage).toBe("idle");
  });

  it("falls back to reply when no clarifyingQuestion is present", async () => {
    const deps = makeDeps();
    const node = createClarifyNode(deps as never);
    const state = baseState({ reply: "请先说明主题" });

    await node(state as never);

    expect(deps.workspaceQuery.appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ content: "请先说明主题" }),
    );
  });
});
