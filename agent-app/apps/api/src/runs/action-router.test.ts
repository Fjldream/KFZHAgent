// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { expect, it } from "vitest";
import { FEATURE_NOT_ENABLED, assertActionEnabled, routeRunAction } from "./action-router.js";

it("routes button actions deterministically without asking a classifier", () => {
  expect(routeRunAction({ type: "confirm_blueprint", expectedRunId: "r1", receipt: "signed-receipt" }))
    .toBe("confirm_blueprint");
  expect(routeRunAction({ type: "resume_approval", expectedRunId: "r1", action: "approve", planHash: "h" }))
    .toBe("resume_approval");
  expect(routeRunAction({ type: "message", text: "我想要一个生产大屏" })).toBe("classify");
});

it("keeps vision actions behind their flags instead of degrading to text", () => {
  expect(() => assertActionEnabled("revise_regions", { regionalEdit: false, vision: false }))
    .toThrow(FEATURE_NOT_ENABLED);
  expect(() => assertActionEnabled("accept_visual_reference", { regionalEdit: true, vision: false }))
    .toThrow(FEATURE_NOT_ENABLED);
  expect(() => assertActionEnabled("classify", { regionalEdit: false, vision: false })).not.toThrow();
  expect(() => assertActionEnabled("revise_regions", { regionalEdit: true, vision: false })).not.toThrow();
});
// end
