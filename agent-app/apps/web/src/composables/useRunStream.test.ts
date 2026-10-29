// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { describe, expect, it, vi } from "vitest";
import { toTimelineSteps, useRunStream } from "./useRunStream.js";
import type { RunEventLike } from "../runs-api.js";
// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { ApiError } from "../api.js";
// end

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
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  it("backs off repeated transient failures exponentially with a fifteen second cap", async () => {
    let attempts = 0;
    const delays: number[] = [];
    const run = useRunStream("r1", { stream: async function* () {
      attempts += 1;
      if (attempts <= 7) throw new ApiError(503, "temporarily unavailable");
      yield event(1, "run.completed");
    }, snapshot: () => Promise.resolve({ id: "r1", status: attempts <= 7 ? "RUNNING" : "SUCCEEDED", lastSeq: attempts <= 7 ? 0 : 1, failureCode: null, resultRevisionId: null }),
      sleep: ms => { delays.push(ms); return Promise.resolve(); }, random: () => 0.5,
    });
    await run.start();
    expect(delays).toEqual([1000, 2000, 4000, 8000, 15000, 15000, 15000]);
  });

  it("resets backoff when a connection makes progress or ends normally", async () => {
    let attempts = 0;
    const delays: number[] = [];
    const run = useRunStream("r1", { stream: async function* () {
      attempts += 1;
      if ([1, 2, 4].includes(attempts)) throw new ApiError(503, "temporarily unavailable");
      yield event(attempts === 3 ? 1 : 2, attempts === 3 ? "run.started" : "run.completed");
    }, snapshot: () => Promise.resolve({ id: "r1", status: attempts === 5 ? "SUCCEEDED" : "RUNNING", lastSeq: attempts >= 3 ? attempts === 5 ? 2 : 1 : 0, failureCode: null, resultRevisionId: null }),
      sleep: ms => { delays.push(ms); return Promise.resolve(); }, random: () => 0.5,
    });
    await run.start();
    expect(delays).toEqual([1000, 2000, 1000, 1000]);
  });
  it.each([
    { random: 0, expected: [800, 1600, 3200, 6400, 12000] },
    { random: 1, expected: [1200, 2400, 4800, 9600, 15000] },
  ])("jitters retry delays at random=$random without exceeding the cap", async scenario => {
    let attempts = 0;
    const delays: number[] = [];
    const run = useRunStream("r1", { stream: async function* () {
      attempts += 1;
      if (attempts <= 5) throw new ApiError(503, "temporarily unavailable");
      yield event(1, "run.completed");
    }, snapshot: () => Promise.resolve({ id: "r1", status: attempts <= 5 ? "RUNNING" : "SUCCEEDED", lastSeq: attempts <= 5 ? 0 : 1, failureCode: null, resultRevisionId: null }),
      sleep: ms => { delays.push(ms); return Promise.resolve(); }, random: () => scenario.random,
    });
    await run.start();
    expect(delays).toEqual(scenario.expected);
  });
  it.each([400, 401, 403, 404])("stops on snapshot HTTP %s instead of silently reconnecting", async status => {
    let connections = 0;
    const run = useRunStream("r1", {
      stream: async function* () { connections += 1; if (connections > 1) throw new ApiError(404, "unexpected-reconnect"); yield event(1, "run.started"); },
      snapshot: () => Promise.reject(new ApiError(status, "SESSION_EXPIRED")), sleep: () => Promise.resolve(),
    });
    await expect(run.start()).rejects.toMatchObject({ status });
    expect(connections).toBe(1);
    expect(run.connected.value).toBe(false);
  });

  it("cancels reconnect backoff immediately and leaves no timer after stop", async () => {
    vi.useFakeTimers();
    const run = useRunStream("r1", { stream: async function* () { yield event(1, "run.started"); },
      snapshot: () => Promise.resolve({ id: "r1", status: "RUNNING", lastSeq: 1, failureCode: null, resultRevisionId: null }),
    });
    const running = run.start();
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(1);
      run.stop();
      await running;
      expect(vi.getTimerCount()).toBe(0);
      expect(run.connected.value).toBe(false);
    } finally { run.stop(); await running; vi.useRealTimers(); }
  });

  it("passes the subscription signal to snapshot lookup and ignores a late snapshot after stop", async () => {
    let resolveSnapshot!: (value: { id: string; status: "FAILED"; lastSeq: number; failureCode: string; resultRevisionId: null }) => void;
    let signal: AbortSignal | undefined;
    const run = useRunStream("r1", { stream: async function* () { yield event(1, "run.started"); },
      snapshot: (_runId, init) => { signal = init?.signal; return new Promise(resolve => { resolveSnapshot = resolve; }); },
    });
    const running = run.start();
    await vi.waitFor(() => expect(signal).toBeDefined());
    run.stop();
    expect(signal!.aborted).toBe(true);
    resolveSnapshot({ id: "r1", status: "FAILED", lastSeq: 2, failureCode: "late", resultRevisionId: null });
    await running;
    expect(run.status.value).toBe("RUNNING");
  });

  it("ignores a late event delivered by an already stopped transport", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const run = useRunStream("r1", { stream: async function* () { await gate; yield event(1, "run.completed"); }, snapshot: () => Promise.reject(new Error("must not read after stop")) });
    const running = run.start();
    run.stop();
    release();
    await running;
    expect(run.events.value).toEqual([]);
    expect(run.lastSeq.value).toBe(0);
    expect(run.connected.value).toBe(false);
  });

  it("uses one connection when start is called twice for the same subscription", async () => {
    let connections = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const run = useRunStream("r1", { stream: async function* () { connections += 1; await gate; yield event(1, "run.completed"); },
      snapshot: () => Promise.resolve({ id: "r1", status: "SUCCEEDED", lastSeq: 1, failureCode: null, resultRevisionId: null }),
    });
    const first = run.start();
    const second = run.start();
    release();
    await Promise.all([first, second]);
    expect(connections).toBe(1);
  });
  // end
  it("does not turn stopping back into building while the build worker reaches its safe boundary", async () => {
    const statuses: string[] = [];
    const run = useRunStream("r1", {
      stream: async function* () {
        yield event(1, "run.started", { attempt: 1 });
        yield event(2, "run.cancel_requested", { requestedAt: "2026-10-20" });
        yield event(3, "build.updated", { buildJobId: "job", status: "FAILED" });
        yield event(4, "run.cancelled");
      },
      snapshot: async () => ({ id: "r1", status: "CANCELLED", lastSeq: 4, failureCode: null, resultRevisionId: null }),
      onUpdate: () => { statuses.push(run.status.value); },
    });
    await run.start();
    expect(statuses).toEqual(["RUNNING", "CANCEL_REQUESTED", "CANCEL_REQUESTED", "CANCELLED"]);
  });
  it("stops reconnecting at an input wait without treating it as success", async () => {
    const stream = vi.fn(async function* () { yield event(1, "input.required", { question: "确认蓝图", receipt: "receipt" }); });
    const run = useRunStream("r1", { stream, snapshot: async () => ({ id: "r1", status: "WAITING_INPUT", lastSeq: 1, failureCode: null, resultRevisionId: null }) });
    await run.start();
    expect(run.status.value).toBe("WAITING_INPUT");
    expect(stream).toHaveBeenCalledOnce();
  });
  it("drains all event pages even when the snapshot is already terminal", async () => {
    const stream = vi.fn(async function* (options: { after: number }) { yield event(options.after + 1, "decision.summary", { summary: "完成节点" }); });
    const run = useRunStream("r1", { stream: stream as never, snapshot: async () => ({ id: "r1", status: "SUCCEEDED", lastSeq: 3, failureCode: null, resultRevisionId: null }), sleep: async () => undefined });
    await run.start();
    expect(run.events.value).toHaveLength(3);
    expect(run.lastSeq.value).toBe(3);
    expect(stream).toHaveBeenCalledTimes(3);
  });
  it("accumulates events, resumes by seq and stops at a terminal snapshot", async () => {
    const cursors: number[] = [];
    const stream = vi.fn(async function* (options: { after: number }) {
      cursors.push(options.after);
      yield event(options.after + 1, "step.started", { stepKey: "plan", label: "生成方案" });
      yield event(options.after + 2, "step.completed", { stepKey: "plan", label: "生成方案", durationMs: 500 });
    } as never);

    const snapshot = vi.fn(async () => ({ id: "r1", status: "SUCCEEDED" as const, lastSeq: 2,
      failureCode: null, resultRevisionId: null }));

    const run = useRunStream("r1", { stream: stream as never, snapshot: snapshot, sleep: async () => {} });
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

    const run = useRunStream("r1", { stream: stream as never, snapshot: snapshot, sleep: async () => {} });
    await run.start();

    expect(cursors).toEqual([0, 1]);
    expect(run.steps()[0]).toMatchObject({ status: "done", durationMs: 900 });
  });
});
// end
