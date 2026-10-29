// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { EventEmitter } from "node:events";
import { Writable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it, vi } from "vitest";
import type { RunEvent } from "@kf/contracts";
import type { AuthenticatedRequest } from "../auth/tenant.guard.js";
import { RunController } from "./run.controller.js";
import type { RunService } from "./run.service.js";
import type { PrismaRunQueries } from "./run-query.service.js";
import { RunEventStreamService, type RunStreamPolicy } from "./run-event-stream.service.js";
import { BadRequestException } from "@nestjs/common";

class StreamResponse extends Writable {
  readonly frames: string[] = [];
  readonly headers = new Map<string, string>();
  statusCode = 0;
  headersSent = false;
  private blocked: boolean;
  private pendingWrite: (() => void) | undefined;
  constructor(blocked = false, highWaterMark = 1) { super({ highWaterMark }); this.blocked = blocked; this.on("error", () => undefined); }
  status(code: number) { this.statusCode = code; return this; }
  setHeader(name: string, value: string) { this.headers.set(name, value); return this; }
  flushHeaders() { this.headersSent = true; }
  json(body: unknown) { this.end(JSON.stringify(body)); return this; }
  override _write(chunk: Buffer, encoding: BufferEncoding, callback: () => void) {
    void encoding;
    this.headersSent = true;
    this.frames.push(chunk.toString());
    if (this.blocked) this.pendingWrite = callback;
    else callback();
  }
  release() { this.blocked = false; this.pendingWrite?.(); this.pendingWrite = undefined; }
}
const event = (seq: number): RunEvent => ({ schemaVersion: 1, runId: "run", seq, type: "decision.summary", createdAt: "2026-10-21T00:00:00Z", payload: { summary: `event-${seq}` } });
const request = () => Object.assign(new EventEmitter(), { principal: { tenantId: "tenant", userId: "user", role: "member", sessionId: "session", mustChangePassword: false }, aborted: false }) as AuthenticatedRequest;
const controller = (read: () => Promise<RunEvent[]>, lastSeq = 3, policy?: RunStreamPolicy, status = "SUCCEEDED") => {
  const runs = { events: read } as unknown as RunService;
  const queries = { snapshot: () => Promise.resolve({ status, lastSeq }) } as unknown as PrismaRunQueries;
  return new RunController(runs, new RunEventStreamService(runs, queries, { isSubscriptionActive: () => Promise.resolve(true) }, policy));
};

describe("Run SSE transport boundaries", () => {
  it.each(["INVALID_CURSOR", "INVALID_LIMIT"])("preserves the safe public %s response without opening SSE", async code => {
    const res = new StreamResponse(false, 65536);
    await controller(() => Promise.reject(new BadRequestException(code))).events(request(), res as never, "run");
    expect(res.statusCode).toBe(400);
    expect(res.headers.get("Content-Type")).toBeUndefined();
    expect(res.frames.join("")).toContain(code);
  });
  it("does not busy-loop when the snapshot leads an empty event page", async () => {
    vi.useFakeTimers();
    let reads = 0;
    const res = new StreamResponse(false, 65536);
    const running = controller(() => {
      reads += 1;
      if (reads > 3) return Promise.reject(new Error("POLL_SPIN_DETECTED"));
      return Promise.resolve([]);
    }, 1, { windowMs: 25, pollMs: 10, heartbeatMs: 15, drainMs: 15, maxBufferedBytes: 65536 }, "RUNNING").events(request(), res as never, "run");
    try { await vi.advanceTimersByTimeAsync(26); await running; expect(reads).toBeLessThanOrEqual(3); expect(vi.getTimerCount()).toBe(0); }
    finally { res.destroy(); await running; vi.useRealTimers(); }
  });

  it("sends heartbeats within its connection window and releases every timer at the deadline", async () => {
    vi.useFakeTimers();
    const res = new StreamResponse(false, 65536);
    const running = controller(() => Promise.resolve([]), 0,
      { windowMs: 25, pollMs: 5, heartbeatMs: 10, drainMs: 15, maxBufferedBytes: 65536 }, "RUNNING").events(request(), res as never, "run");
    try {
      await vi.advanceTimersByTimeAsync(26);
      await running;
      expect(res.frames.join("")).toContain(": keep-alive\n\n");
      expect(res.writableEnded).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally { res.destroy(); await running; vi.useRealTimers(); }
  });
  it("lets accepted normal writes finish instead of destroying the socket with its final event buffered", async () => {
    const res = new StreamResponse(true, 65536);
    await controller(async () => [event(1), event(2), event(3)]).events(request(), res as never, "run");
    try {
      expect(res.destroyed).toBe(false);
      expect(res.writableEnded).toBe(true);
      res.release();
      expect(res.frames.join("")).toContain("id: 3");
    } finally { res.release(); res.destroy(); }
  });

  it("bounds a non-draining connection and removes its timers and listeners", async () => {
    vi.useFakeTimers();
    const res = new StreamResponse(true);
    const req = request();
    const running = controller(async () => [event(1), event(2)], 2,
      { windowMs: 100, pollMs: 10, heartbeatMs: 20, drainMs: 15, maxBufferedBytes: 65536 }).events(req, res as never, "run");
    try {
      await vi.advanceTimersByTimeAsync(16);
      await running;
      expect(res.destroyed).toBe(true);
      expect(res.frames).toHaveLength(1);
      expect(res.listenerCount("drain")).toBe(0);
      expect(req.listenerCount("aborted")).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally { res.destroy(); res.release(); await running; vi.useRealTimers(); }
  });
  it("waits for writable drain instead of buffering the whole event page", async () => {
    const req = request();
    const res = new StreamResponse(true);
    const running = controller(async () => [event(1), event(2), event(3)]).events(req, res as never, "run");
    try {
      await delay(5);
      expect(res.frames).toHaveLength(1);
      expect(res.writableEnded).toBe(false);
      expect(res.writableLength).toBe(Buffer.byteLength(res.frames[0]!));
      res.release();
      await running;
      expect(res.frames.join("")).toContain("id: 3");
    } finally { res.release(); res.destroy(); await running; }
  });

  it("releases response listeners when a blocked socket closes without completing the whole page", async () => {
    const req = request();
    const res = new StreamResponse(true);
    const closeBefore = res.listenerCount("close");
    const errorBefore = res.listenerCount("error");
    const running = controller(async () => [event(1), event(2), event(3)]).events(req, res as never, "run");
    await delay(5);
    res.destroy();
    await running;
    expect(res.frames).toHaveLength(1);
    expect(res.writableLength).toBeLessThanOrEqual(Buffer.byteLength(res.frames[0]!));
    expect(res.listenerCount("close")).toBe(closeBefore);
    expect(res.listenerCount("error")).toBe(errorBefore);
    expect(req.listenerCount("aborted")).toBe(0);
    res.release();
  });

  it("returns promptly on disconnect while an already issued database read is still pending", async () => {
    let resolveRead!: (events: RunEvent[]) => void;
    const pending = new Promise<RunEvent[]>(resolve => { resolveRead = resolve; });
    const req = request();
    const res = new StreamResponse();
    const running = controller(() => pending).events(req, res as never, "run");
    res.destroy();
    try {
      expect(await Promise.race([running.then(() => true), delay(50).then(() => false)])).toBe(true);
      resolveRead([event(1)]);
      await delay(1);
      expect(res.frames).toEqual([]);
    } finally { resolveRead([]); await running; }
  });

  it("does not leak private database error details in a pre-header response", async () => {
    const req = request();
    const res = new StreamResponse();
    await controller(() => Promise.reject(new Error("private-db-url-and-credentials"))).events(req, res as never, "run");
    expect(res.statusCode).toBe(500);
    expect(res.frames.join("")).not.toContain("private-db-url-and-credentials");
    expect(res.frames.join("")).toContain("RUN_EVENTS_FAILED");
  });
});
// end
