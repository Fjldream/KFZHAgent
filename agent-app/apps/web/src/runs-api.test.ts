// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api.js";
import { isTerminalRun, streamRunEvents } from "./runs-api.js";

const encoder = new TextEncoder();

const frame = (seq: number, type: string) =>
  `id: ${seq}\nevent: ${type}\ndata: ${JSON.stringify({ schemaVersion: 1, runId: "r1", seq, type, createdAt: "2026-10-20T00:00:00.000Z", payload: {} })}\n\n`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("streamRunEvents", () => {
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
    for await (const _ of streamRunEvents({ runId: "r1", after: 7 })) { /* drain */ }
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain("after=7");
  });

  it("raises ApiError with the HTTP status when the stream is refused", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    await expect((async () => {
      for await (const _ of streamRunEvents({ runId: "missing", after: 0 })) { /* drain */ }
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
// end
