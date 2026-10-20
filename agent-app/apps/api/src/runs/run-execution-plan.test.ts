// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { expect, it } from "vitest";
import { RUN_PLAN_VERSION, planRunSteps } from "./run-execution-plan.js";

const message = { type: "message" as const, text: "生成一个生产大屏" };

it("plans exactly one graph step per run", () => {
  const steps = planRunSteps(message, "rev-1");
  expect(steps).toHaveLength(1);
  expect(steps[0]).toMatchObject({ stepKey: "graph", label: "理解需求并推进流程" });
  expect(steps[0]?.inputHash).toMatch(/^[0-9a-f]{64}$/);
});

it("is deterministic for the same action and base revision", () => {
  expect(planRunSteps(message, "rev-1")).toEqual(planRunSteps(message, "rev-1"));
});

it("invalidates the hash when the base revision or plan version changes", () => {
  const before = planRunSteps(message, "rev-1")[0]?.inputHash;
  expect(planRunSteps(message, "rev-2")[0]?.inputHash).not.toBe(before);
  expect(RUN_PLAN_VERSION).toBe("run-plan@2");
});

it("labels button actions by their own route without adding steps", () => {
  const steps = planRunSteps({ type: "confirm_blueprint", expectedRunId: "r1", receipt: "s" }, "rev-1");
  expect(steps).toHaveLength(1);
  expect(steps[0]?.label).toBe("确认蓝图并推进流程");
});
// end
