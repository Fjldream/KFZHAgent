// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api.js";
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import { fetchLatestRun, isTerminalRun, streamRunEvents } from "./runs-api.js";
// end

const encoder = new TextEncoder();

const frame = (seq: number, type: string) =>
  `id: ${seq}\nevent: ${type}\ndata: ${JSON.stringify({ schemaVersion: 1, runId: "r1", seq, type, createdAt: "2026-10-20T00:00:00.000Z", payload: {} })}\n\n`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("streamRunEvents", () => {
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  it("accepts many bounded frames coalesced into a large chunk and unlocks on normal EOF", async () => {
    const body = new ReadableStream<Uint8Array>({ start(source) {
      source.enqueue(encoder.encode(Array.from({ length: 500 }, (_, index) => frame(index + 1, "decision.summary")).join("")));
      source.close();
    } });
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(body)));
    const sequences: number[] = [];
    for await (const event of streamRunEvents({ runId: "r1", after: 0 })) sequences.push(event.seq);
    expect(sequences).toHaveLength(500);
    expect(sequences[499]).toBe(500);
    expect(body.locked).toBe(false);
  });
  it("cancels and unlocks the response body when the consumer leaves early", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(encoder.encode(frame(1, "run.queued"))); }, cancel() { cancelled = true; } });
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(body)));
    for await (const event of streamRunEvents({ runId: "r1", after: 0 })) { expect(event.seq).toBe(1); break; }
    expect(cancelled).toBe(true);
    expect(body.locked).toBe(false);
  });

  it("bounds an unterminated SSE frame and releases its reader on failure", async () => {
    let cancelled = false;
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start(controller) { source = controller; controller.enqueue(encoder.encode("data: " + "x".repeat(70_000))); }, cancel() { cancelled = true; } });
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(body)));
    const iterator = streamRunEvents({ runId: "r1", after: 0 });
    // 红测不让旧实现无限等待缺失的分隔符；关闭测试流后它错误地正常结束。
    const reading = iterator.next();
    const timeout = setTimeout(() => source.close(), 20);
    try { await expect(reading).rejects.toThrow("RUN_EVENT_FRAME_TOO_LARGE"); }
    finally { clearTimeout(timeout); await iterator.return(undefined); }
    expect(cancelled).toBe(true);
    expect(body.locked).toBe(false);
  });
  // end
  it("yields events split across chunk boundaries and skips heartbeats", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(frame(1, "run.queued") + ": keep-alive\n\n"));
        controller.enqueue(encoder.encode(frame(2, "step.started").slice(0, 28)));
        controller.enqueue(encoder.encode(frame(2, "step.started").slice(28)));
        controller.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));

    const seen: number[] = [];
    for await (const event of streamRunEvents({ runId: "r1", after: 0 })) seen.push(event.seq);
    expect(seen).toEqual([1, 2]);
  });

  it("resumes from the given cursor", async () => {
    const fetchMock = vi.fn(async () => new Response(
      new ReadableStream<Uint8Array>({ start(c) { c.close(); } }), { status: 200 },
    ));
    vi.stubGlobal("fetch", fetchMock);
    for await (const ignoredEvent of streamRunEvents({ runId: "r1", after: 7 })) { void ignoredEvent; }
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain("after=7");
  });

  it("raises ApiError with the HTTP status when the stream is refused", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    await expect((async () => {
      for await (const ignoredEvent of streamRunEvents({ runId: "missing", after: 0 })) { void ignoredEvent; }
    })()).rejects.toBeInstanceOf(ApiError);
  });
});

describe("isTerminalRun", () => {
  it("only treats finished states as terminal", () => {
    expect(isTerminalRun("SUCCEEDED")).toBe(true);
    expect(isTerminalRun("WAITING_APPROVAL")).toBe(false);
    expect(isTerminalRun("CANCEL_REQUESTED")).toBe(false);
  });
});
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
it("opens a conversation with no latest Run even when Nest sends an empty body for null", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
  await expect(fetchLatestRun("empty-conversation")).resolves.toBeNull();
});
// end
// end
