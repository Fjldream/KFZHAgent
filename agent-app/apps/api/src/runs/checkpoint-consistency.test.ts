// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { expect, it } from "vitest";
import { CHECKPOINT_RUN_MISMATCH, checkCheckpointConsistency } from "./checkpoint-consistency.js";

const run = { id: "run-1", planVersion: "run-plan@1", baseRevisionId: "rev-1" };

it("treats a checkpoint without a run id as legacy and leaves it untouched", () => {
  expect(checkCheckpointConsistency({}, run)).toBe("legacy");
  expect(checkCheckpointConsistency({ baseRevisionId: "rev-9" }, run)).toBe("legacy");
});

it("accepts a checkpoint that belongs to the same run", () => {
  expect(checkCheckpointConsistency(
    { runId: "run-1", planVersion: "run-plan@1", baseRevisionId: "rev-1" }, run,
  )).toBe("reusable");
});

it("rejects a checkpoint from another run or another plan version", () => {
  expect(() => checkCheckpointConsistency({ runId: "run-2" }, run)).toThrow(CHECKPOINT_RUN_MISMATCH);
  expect(() => checkCheckpointConsistency({ runId: "run-1", planVersion: "run-plan@0" }, run))
    .toThrow(CHECKPOINT_RUN_MISMATCH);
  expect(() => checkCheckpointConsistency({ runId: "run-1", baseRevisionId: "rev-2" }, run))
    .toThrow(CHECKPOINT_RUN_MISMATCH);
});

it("ignores fields the checkpoint did not record", () => {
  expect(checkCheckpointConsistency({ runId: "run-1" }, run)).toBe("reusable");
});
// end
