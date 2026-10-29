// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { LegacyConversationController as ConversationController } from "../../test-support/legacy-conversation-controller.js";
// end
import type { DisposableSseStream, SseEvent } from "../../test-support/legacy-conversation-driver.js";
import { ConversationTurnBusyError } from "./conversation-turn-lease.js";

describe("historical controller fixture SSE disposal", () => {
  it("disposes an uniterated stream when response headers fail", async () => {
    const events = disposableEvents([{ event: "state", data: {} }]);
    const controller = controllerReturning(events);
    const { req, res } = httpDoubles();
    res.setHeader.mockImplementationOnce(() => { throw new Error("socket header failure"); });

    await expect(controller.sendMessage("conversation", req as never, { content: "确认设计" }, res as never))
      .rejects.toThrow("socket header failure");

    expect(events.next.mock.calls).toHaveLength(0);
    expect(events.dispose.mock.calls).toHaveLength(1);
  });

  it("disposes the stream when an SSE write fails", async () => {
    const events = disposableEvents([{ event: "state", data: { stage: "building" } }]);
    const controller = controllerReturning(events);
    const { req, res } = httpDoubles();
    res.write.mockImplementationOnce(() => { throw new Error("socket write failure"); });

    await expect(controller.sendMessage("conversation", req as never, { content: "确认设计" }, res as never))
      .resolves.toBeUndefined();

    expect(events.dispose.mock.calls).toHaveLength(1);
    expect(res.end.mock.calls).toHaveLength(1);
  });

  it("registers client-abort cleanup before startTurn resolves", async () => {
    const events = disposableEvents([{ event: "state", data: {} }]);
    let resolveStart!: (events: DisposableSseStream) => void;
    const start = new Promise<DisposableSseStream>((resolve) => { resolveStart = resolve; });
    const controller = new ConversationController({ startTurn: vi.fn().mockReturnValue(start) } as never);
    const { req, res } = httpDoubles();

    const sending = controller.sendMessage("conversation", req as never, { content: "确认设计" }, res as never);
    res.emit("close");
    resolveStart(events);
    await sending;

    expect(events.next.mock.calls).toHaveLength(0);
    expect(events.dispose.mock.calls).toHaveLength(1);
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it("maps fail-fast turn contention to a bounded retryable conflict", async () => {
    const controller = new ConversationController({
      startTurn: vi.fn().mockRejectedValue(new ConversationTurnBusyError()),
    } as never);
    const { req, res } = httpDoubles();

    const failure = await controller.sendMessage("conversation", req as never, { content: "确认设计" }, res as never)
      .catch((error) => error);

    expect(failure.getStatus()).toBe(409);
    expect(failure.getResponse()).toEqual({
      error: {
        code: "CONVERSATION_TURN_IN_PROGRESS",
        message: "当前对话已有工程生成任务处理中，请稍后重试。",
      },
    });
    expect(res.write).not.toHaveBeenCalled();
  });

  it("maps resume contention from the shared turn fence to the same bounded conflict", async () => {
    const controller = new ConversationController({
      resume: vi.fn().mockRejectedValue(new ConversationTurnBusyError()),
    } as never);
    const { req } = httpDoubles();

    const failure = await controller.resume(
      "conversation",
      req as never,
      { action: "approve", planHash: "a".repeat(64) },
    ).catch((error) => error);

    expect(failure.getStatus()).toBe(409);
    expect(failure.getResponse()).toEqual({
      error: {
        code: "CONVERSATION_TURN_IN_PROGRESS",
        message: "当前对话已有工程生成任务处理中，请稍后重试。",
      },
    });
  });
});

function controllerReturning(events: DisposableSseStream): ConversationController {
  return new ConversationController({ startTurn: vi.fn().mockResolvedValue(events) } as never);
}

function disposableEvents(values: SseEvent[]) {
  let index = 0;
  const stream = {
    next: vi.fn(async () => index < values.length
      ? { done: false as const, value: values[index++]! }
      : { done: true as const, value: undefined }),
    return: vi.fn(async () => ({ done: true as const, value: undefined })),
    dispose: vi.fn(async () => undefined),
    [Symbol.asyncIterator]() { return this; },
  };
  return stream as DisposableSseStream & typeof stream;
}

function httpDoubles() {
  const req = Object.assign(new EventEmitter(), {
    principal: { userId: "user", tenantId: "tenant", role: "member", sessionId: "session" },
  });
  const res = Object.assign(new EventEmitter(), {
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    writableEnded: false,
  });
  return { req, res };
}
// end
