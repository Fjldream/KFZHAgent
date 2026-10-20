// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { describe, expect, it, vi } from "vitest";
import { stepInputHash, withStepMemo, type RunStepMemo } from "./run-step-memo.js";
import type { AgentGraphStateValue } from "./state.js";

const state = (overrides: Partial<AgentGraphStateValue> = {}) => ({
  tenantId: "t1", userId: "u1", workspaceId: "w1", conversationId: "c1",
  messages: [], summary: undefined, ...overrides,
}) as unknown as AgentGraphStateValue;

const fakeMemo = () => {
  const saved = new Map<string, unknown>();
  const memo: RunStepMemo = {
    find: vi.fn(async (stepKey: string, inputHash: string) => saved.get(`${stepKey}:${inputHash}`) ?? null),
    save: vi.fn(async (stepKey: string, inputHash: string, output: unknown) => {
      saved.set(`${stepKey}:${inputHash}`, output);
    }),
  };
  return { memo, saved };
};

describe("withStepMemo", () => {
  it("behaves exactly like the raw node when no run scope is present", async () => {
    const { memo } = fakeMemo();
    const node = vi.fn(async () => ({ stage: "done" as const }));
    const wrapped = withStepMemo("plan", node, { resolveMemo: () => memo }, () => ({}));

    await wrapped(state());
    expect(node).toHaveBeenCalledTimes(1);
    expect(memo.find).not.toHaveBeenCalled();
    expect(memo.save).not.toHaveBeenCalled();
  });

  it("skips the node when the same step and inputs were already completed", async () => {
    const { memo } = fakeMemo();
    const node = vi.fn(async () => ({ stage: "done" as const }));
    const wrapped = withStepMemo("plan", node, { resolveMemo: () => memo }, (value) => ({ hash: value.currentRevisionId }));

    await wrapped(state({ runId: "run-1", currentRevisionId: "rev-1" }));
    const second = await wrapped(state({ runId: "run-1", currentRevisionId: "rev-1" }));

    expect(node).toHaveBeenCalledTimes(1);
    expect(second).toEqual({ stage: "done" });
  });

  it("re-runs when the inputs change", async () => {
    const { memo } = fakeMemo();
    const node = vi.fn(async () => ({ stage: "done" as const }));
    const wrapped = withStepMemo("plan", node, { resolveMemo: () => memo }, (value) => ({ hash: value.currentRevisionId }));

    await wrapped(state({ runId: "run-1", currentRevisionId: "rev-1" }));
    await wrapped(state({ runId: "run-1", currentRevisionId: "rev-2" }));
    expect(node).toHaveBeenCalledTimes(2);
  });

  it("never caches a failed update", async () => {
    const { memo, saved } = fakeMemo();
    const node = vi.fn(async () => ({ lastErrorCode: "SOLUTION_PLANNING_FAILED" }));
    const wrapped = withStepMemo("plan", node, { resolveMemo: () => memo }, () => ({}));

    await wrapped(state({ runId: "run-1" }));
    expect(saved.size).toBe(0);
    expect(memo.save).not.toHaveBeenCalled();
  });
});

describe("stepInputHash", () => {
  it("is stable across key order and changes with the plan version", () => {
    expect(stepInputHash("plan", "v1", { b: 2, a: 1 })).toBe(stepInputHash("plan", "v1", { a: 1, b: 2 }));
    expect(stepInputHash("plan", "v1", { a: 1 })).not.toBe(stepInputHash("plan", "v2", { a: 1 }));
  });
});
// end
