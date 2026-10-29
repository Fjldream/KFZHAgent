// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/tenant.guard.js";
import type { SessionService } from "../auth/session.service.js";
import type { RunService } from "./run.service.js";
import { serializeRunEvent, type PrismaRunQueries } from "./run-query.service.js";
import { isTerminal } from "./run-state.js";

export type RunStreamPolicy = { windowMs: number; heartbeatMs: number; pollMs: number; drainMs: number; maxBufferedBytes: number };
const DEFAULT_POLICY: Readonly<RunStreamPolicy> = Object.freeze({ windowMs: 30_000, heartbeatMs: 15_000, pollMs: 1_000, drainMs: 5_000, maxBufferedBytes: 65_536 });
const closed = () => new Error("RUN_STREAM_CLOSED");

/** 只读订阅器；没有执行器/RunStore/取消端口，连接生命周期不改变后台运行。 */
export class RunEventStreamService {
  constructor(
    private readonly runs: Pick<RunService, "events">,
    private readonly queries: Pick<PrismaRunQueries, "snapshot">,
    private readonly sessions: Pick<SessionService, "isSubscriptionActive">,
    private readonly policy: Readonly<RunStreamPolicy> = DEFAULT_POLICY,
  ) {}

  async stream(req: AuthenticatedRequest, res: Response, runId: string, after: number, limit: number): Promise<void> {
    const lifecycle = new AbortController();
    const { signal } = lifecycle;
    const stop = () => lifecycle.abort();
    req.on("aborted", stop);
    res.on("close", stop);
    res.on("error", stop);
    const deadline = setTimeout(stop, this.policy.windowMs);
    let destroyBuffered = false;
    let cursor = after;
    const principal = req.principal;
    const active = () => !signal.aborted && !res.destroyed && !res.writableEnded;
    const authorize = async () => {
      const valid = await untilAborted(this.sessions.isSubscriptionActive(principal), signal);
      if (!valid) {
        if (!res.headersSent && active()) res.status(401).json({ message: "UNAUTHORIZED" });
        stop();
        throw closed();
      }
    };
    const write = async (frame: string) => {
      if (!active()) throw closed();
      const bytes = Buffer.byteLength(frame);
      if (bytes + res.writableLength > this.policy.maxBufferedBytes) { destroyBuffered = true; throw closed(); }
      if (!res.write(frame)) {
        try { await waitForDrain(res, signal, this.policy.drainMs); }
        catch (error) { destroyBuffered = true; throw error; }
        await authorize();
      }
    };
    try {
      if (req.aborted || !active()) return;
      // 查询先验证游标与资源归属；查询完成后再次复核身份，避免在途撤销后仍发首帧。
      let batch = await untilAborted(this.runs.events(principal, runId, cursor, limit), signal);
      await authorize();
      if (!active()) return;
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "private, no-store, no-transform");
      res.setHeader("Vary", "Cookie, Origin");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();
      let lastWriteAt = Date.now();
      while (active()) {
        await authorize();
        for (const event of batch) {
          await write(serializeRunEvent(event));
          cursor = event.seq;
          lastWriteAt = Date.now();
        }
        const snapshot = await untilAborted(this.queries.snapshot(principal.tenantId, runId), signal);
        if (!active()) break;
        if (cursor >= snapshot.lastSeq && (isTerminal(snapshot.status) || snapshot.status === "WAITING_INPUT" || snapshot.status === "WAITING_APPROVAL")) break;
        // backlog 立即分页；没有积压时才轮询，等待不占用数据库事务或连接。
        if (cursor >= snapshot.lastSeq || batch.length === 0) {
          await waitForPoll(signal, this.policy.pollMs);
          await authorize();
          if (Date.now() - lastWriteAt >= this.policy.heartbeatMs) {
            await write(": keep-alive\n\n");
            lastWriteAt = Date.now();
          }
        }
        batch = await untilAborted(this.runs.events(principal, runId, cursor, limit), signal);
      }
    } catch (error) {
      if (!signal.aborted && active() && !res.headersSent) {
        const status = error instanceof BadRequestException ? 400 : error instanceof NotFoundException ? 404 : 500;
        const safeQueryCode = error instanceof Error && ["INVALID_CURSOR", "INVALID_LIMIT"].includes(error.message) ? error.message : "INVALID_RUN_EVENT_QUERY";
        const message = status === 400 ? safeQueryCode : status === 404 ? "RUN_NOT_FOUND" : "RUN_EVENTS_FAILED";
        res.status(status).json({ message });
      }
      // 已开始的 SSE 不混入 JSON/私有异常；正常断开后以最后收到的 seq 重连。
    } finally {
      const interrupted = signal.aborted;
      clearTimeout(deadline);
      stop();
      req.off("aborted", stop);
      res.off("close", stop);
      res.off("error", stop);
      if (!res.destroyed && !res.writableEnded) {
        if (destroyBuffered || (interrupted && res.writableLength > 0)) res.destroy();
        else res.end();
      }
    }
  }
}

/** Prisma 已发出的单次查询不能取消；断线立即释放订阅引用，迟到结果不会再写 socket。 */
function untilAborted<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => { cleanup(); reject(closed()); };
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    operation.then(value => { cleanup(); if (signal.aborted) reject(closed()); else resolve(value); }, error => { cleanup(); reject(error instanceof Error ? error : new Error("RUN_EVENTS_FAILED")); });
    if (signal.aborted) abort();
  });
}

function waitForPoll(signal: AbortSignal, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); };
    const abort = () => { cleanup(); reject(closed()); };
    const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

function waitForDrain(res: Response, signal: AbortSignal, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); res.off("drain", drain); signal.removeEventListener("abort", abort); };
    const drain = () => { cleanup(); resolve(); };
    const abort = () => { cleanup(); reject(closed()); };
    const timer = setTimeout(abort, ms);
    res.once("drain", drain);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted || res.destroyed) abort();
  });
}
// end
