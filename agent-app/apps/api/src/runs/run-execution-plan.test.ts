// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { expect, it } from "vitest";
import { RUN_PLAN_VERSION, planRunSteps } from "./run-execution-plan.js";

const message = { type: "message" as const, text: "生成一个生产大屏" };

it("plans deterministic step hashes for the same action and base revision", () => {
  const first = planRunSteps(message, "rev-1");
  const second = planRunSteps(message, "rev-1");
  expect(first).toEqual(second);
  expect(first.map((step) => step.stepKey)).toEqual(["classify", "blueprint", "await_approval"]);
  expect(first[0]?.inputHash).toMatch(/^[0-9a-f]{64}$/);
});

it("invalidates every step hash when the base revision changes", () => {
  const before = planRunSteps(message, "rev-1");
  const after = planRunSteps(message, "rev-2");
  expect(after.map((step) => step.inputHash)).not.toEqual(before.map((step) => step.inputHash));
});

it("invalidates hashes when the plan version changes", () => {
  expect(RUN_PLAN_VERSION).toBe("run-plan@1");
  const steps = planRunSteps({ type: "resume_approval", expectedRunId: "r1", action: "approve", planHash: "h" }, "rev-1");
  expect(steps.map((step) => step.stepKey)).toEqual(["resume_approval", "build"]);
});

it("keeps button actions off the classification path", () => {
  const steps = planRunSteps({ type: "confirm_blueprint", expectedRunId: "r1", receipt: "signed" }, "rev-1");
  expect(steps.map((step) => step.stepKey)).not.toContain("classify");
});
// end
