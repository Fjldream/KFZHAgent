// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { describe, expect, it } from "vitest";
import { RunActionSchema, RunEventSchema, RunStatusSchema } from "./agent-run.js";

const validEvent = {
  schemaVersion: 1 as const,
  runId: "run-1",
  seq: 3,
  type: "step.started" as const,
  createdAt: "2026-10-20T00:00:00.000Z",
  payload: { stepKey: "plan", label: "规划中", attempt: 1 },
};

describe("RunActionSchema", () => {
  // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
  it("preserves bounded visual receipt and choices in action identity while reading old internal actions", () => {
    const legacy = { type: "accept_visual_reference", expectedRunId: "r1", analysisId: "a1", analysisHash: "a".repeat(64) };
    const action = { ...legacy, receipt: `vref1:${"b".repeat(64)}:${"c".repeat(64)}`,
      acceptedDifferences: [{ regionId: "heading", disposition: "omit", capabilityId: null, reason: "不生成标题" }] };
    expect(RunActionSchema.parse(action)).toEqual(action);
    expect(RunActionSchema.parse(legacy)).toEqual(legacy);
    for (const invalid of [{ ...action, route: {} }, { ...action, receipt: "forged" },
      { ...action, acceptedDifferences: Array.from({ length: 101 }, () => action.acceptedDifferences[0]) },
      { ...action, acceptedDifferences: [{ ...action.acceptedDifferences[0], native: {} }] }]) {
      expect(RunActionSchema.safeParse(invalid).success).toBe(false);
    }
  });
  // end
  it("accepts the five documented actions", () => {
    expect(RunActionSchema.safeParse({ type: "message", text: "生成一个页面" }).success).toBe(true);
    expect(RunActionSchema.safeParse({ type: "confirm_blueprint", expectedRunId: "r1", receipt: "abc" }).success)
      .toBe(true);
    expect(RunActionSchema.safeParse({ type: "resume_approval", expectedRunId: "r1", action: "approve", planHash: "h" }).success)
      .toBe(true);
  });

  it("rejects unknown types, extra fields and oversized text", () => {
    expect(RunActionSchema.safeParse({ type: "shell", command: "rm -rf /" }).success).toBe(false);
    expect(RunActionSchema.safeParse({ type: "message", text: "hi", extra: 1 }).success).toBe(false);
    expect(RunActionSchema.safeParse({ type: "message", text: "x".repeat(20_001) }).success).toBe(false);
    expect(RunActionSchema.safeParse({ type: "message", text: "" }).success).toBe(false);
  });
});

describe("RunEventSchema", () => {
  it("accepts a well-formed event and rejects bad seq or unknown types", () => {
    expect(RunEventSchema.safeParse(validEvent).success).toBe(true);
    expect(RunEventSchema.safeParse({ ...validEvent, seq: 0 }).success).toBe(false);
    expect(RunEventSchema.safeParse({ ...validEvent, seq: -1 }).success).toBe(false);
    expect(RunEventSchema.safeParse({ ...validEvent, seq: 1.5 }).success).toBe(false);
    expect(RunEventSchema.safeParse({ ...validEvent, type: "run.secret" }).success).toBe(false);
  });

  it("enforces the per-type payload whitelist", () => {
    expect(RunEventSchema.safeParse({
      ...validEvent,
      type: "decision.summary",
      payload: { summary: "只调整表头", controlIds: ["table-1"] },
    }).success).toBe(true);

    expect(RunEventSchema.safeParse({
      ...validEvent,
      type: "decision.summary",
      payload: { summary: "x".repeat(601) },
    }).success).toBe(false);

    expect(RunEventSchema.safeParse({
      ...validEvent,
      type: "decision.summary",
      payload: { summary: "ok", reasoningContent: "模型原始思维链" },
    }).success).toBe(false);
  });

  it("keeps the status enum closed", () => {
    expect(RunStatusSchema.safeParse("RUNNING").success).toBe(true);
    expect(RunStatusSchema.safeParse("PAUSED").success).toBe(false);
  });
});
// end
