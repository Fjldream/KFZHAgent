// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { expect, it } from "vitest";
import { buildRunGraphInput, type RunGraphInputSource } from "./run-graph-input.js";

const source = (overrides: Partial<RunGraphInputSource> = {}): RunGraphInputSource => ({
  runId: "run-1",
  tenantId: "t1",
  requestedByUserId: "u1",
  workspaceId: "w1",
  conversationId: "c1",
  baseRevisionId: "rev-1",
  planVersion: "run-plan@1",
  ...overrides,
});

it("maps the run onto the graph input the legacy path expects", () => {
  const input = buildRunGraphInput(source(), "生成一个生产大屏");
  expect(input).toMatchObject({
    tenantId: "t1",
    userId: "u1",
    workspaceId: "w1",
    conversationId: "c1",
    stage: "idle",
    runId: "run-1",
    planVersion: "run-plan@1",
    currentRevisionId: "rev-1",
  });
  expect(input.recentMessages).toEqual([{ role: "user", content: "生成一个生产大屏" }]);
});

it("sends no history beyond the current turn, leaving loading to load-context", () => {
  const input = buildRunGraphInput(source(), "只改表头");
  expect(input.recentMessages).toHaveLength(1);
});

it("omits the base revision when the run has none", () => {
  const input = buildRunGraphInput(source({ baseRevisionId: null }), "新工程");
  expect(input).not.toHaveProperty("currentRevisionId");
});

it("keeps an empty message list for deterministic actions", () => {
  const input = buildRunGraphInput(source(), null);
  expect(input.recentMessages).toEqual([]);
  expect(input).toMatchObject({ runId: "run-1" });
});
// end
