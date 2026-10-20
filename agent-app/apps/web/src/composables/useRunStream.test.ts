// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { describe, expect, it, vi } from "vitest";
import { toTimelineSteps, useRunStream } from "./useRunStream.js";
import type { RunEventLike } from "../runs-api.js";

const event = (seq: number, type: string, payload: Record<string, unknown> = {}): RunEventLike => ({
  schemaVersion: 1, runId: "r1", seq, type, createdAt: "2026-10-20T00:00:00.000Z", payload,
});

describe("toTimelineSteps", () => {
  it("turns started/completed events into rows with real durations", () => {
    const steps = toTimelineSteps([
      event(2, "step.started", { stepKey: "plan", label: "生成方案" }),
      event(3, "step.completed", { stepKey: "plan", label: "生成方案", durationMs: 1200, safeSummary: "3 个页面" }),
    ]);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ stepKey: "plan", status: "done", durationMs: 1200, detail: "3 个页面" });
  });

  it("marks failures and keeps the failure code as detail", () => {
    const steps = toTimelineSteps([
      event(2, "step.started", { stepKey: "compile", label: "编译" }),
      event(3, "step.failed", { stepKey: "compile", label: "编译", failureCode: "SCHEMA_INVALID" }),
    ]);
    expect(steps[0]).toMatchObject({ status: "failed", detail: "SCHEMA_INVALID" });
  });

  it("keeps the original order and ignores unrelated events", () => {
    const steps = toTimelineSteps([
      event(1, "run.queued"),
      event(2, "step.started", { stepKey: "a", label: "A" }),
      event(3, "step.started", { stepKey: "b", label: "B" }),
      event(4, "step.completed", { stepKey: "a", label: "A", durationMs: 10 }),
    ]);
    expect(steps.map((step) => step.stepKey)).toEqual(["a", "b"]);
    expect(steps[1]?.status).toBe("running");
  });
});

describe("useRunStream", () => {
  it("accumulates events, resumes by seq and stops at a terminal snapshot", async () => {
    const cursors: number[] = [];
    const stream = vi.fn(async function* (options: { after: number }) {
      cursors.push(options.after);
      yield event(options.after + 1, "step.started", { stepKey: "plan", label: "生成方案" });
      yield event(options.after + 2, "step.completed", { stepKey: "plan", label: "生成方案", durationMs: 500 });
    } as never);

    const snapshot = vi.fn(async () => ({ id: "r1", status: "SUCCEEDED" as const, lastSeq: 2,
      failureCode: null, resultRevisionId: null }));

    const run = useRunStream("r1", { stream: stream as never, snapshot: snapshot as never, sleep: async () => {} });
    await run.start();

    expect(cursors).toEqual([0]);
    expect(run.steps()).toHaveLength(1);
    expect(run.status.value).toBe("SUCCEEDED");
    expect(run.lastSeq.value).toBe(2);
  });

  it("reconnects from the last seq when the stream ends before the run does", async () => {
    const cursors: number[] = [];
    let round = 0;
    const stream = vi.fn(async function* (options: { after: number }) {
      cursors.push(options.after);
      round += 1;
      if (round === 1) {
        yield event(1, "step.started", { stepKey: "plan", label: "生成方案" });
        return; // 服务端 30 秒窗口到点，正常结束
      }
      yield event(2, "step.completed", { stepKey: "plan", label: "生成方案", durationMs: 900 });
    } as never);

    const snapshot = vi.fn(async () => ({ id: "r1",
      status: round >= 2 ? ("SUCCEEDED" as const) : ("RUNNING" as const),
      lastSeq: round >= 2 ? 2 : 1, failureCode: null, resultRevisionId: null }));

    const run = useRunStream("r1", { stream: stream as never, snapshot: snapshot as never, sleep: async () => {} });
    await run.start();

    expect(cursors).toEqual([0, 1]);
    expect(run.steps()[0]).toMatchObject({ status: "done", durationMs: 900 });
  });
});
// end
