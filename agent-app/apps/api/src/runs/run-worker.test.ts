// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { describe, expect, it, vi } from "vitest";
import type { ClaimedRunLease } from "./run-store.js";
import { RunWorker } from "./run-worker.js";

const lease = (runId = "run-1", fence = 1): ClaimedRunLease => ({
  runId, ownerId: "worker-1", fence, expiresAt: new Date(Date.now() + 30_000).toISOString(),
});

describe("run worker", () => {
  it("executes a claimed run once", async () => {
    const claim = vi.fn(async () => lease());
    const recoverExpired = vi.fn(async () => null);
    const execute = vi.fn(async () => undefined);
    const worker = new RunWorker({ store: { claim, recoverExpired }, execute, ownerId: "worker-1" });

    expect(await worker.runOnce()).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(recoverExpired).not.toHaveBeenCalled();
    expect(worker.heartbeatAt()).not.toBeNull();
  });

  it("falls back to recovering an expired lease before idling", async () => {
    const claim = vi.fn(async () => null);
    const recoverExpired = vi.fn(async () => lease("stale-run", 7));
    const execute = vi.fn(async () => undefined);
    const worker = new RunWorker({ store: { claim, recoverExpired }, execute, ownerId: "worker-2" });

    expect(await worker.runOnce()).toBe(true);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ runId: "stale-run", fence: 7 }));
  });

  it("reports idle when there is nothing to do", async () => {
    const claim = vi.fn(async () => null);
    const recoverExpired = vi.fn(async () => null);
    const execute = vi.fn(async () => undefined);
    const worker = new RunWorker({ store: { claim, recoverExpired }, execute, ownerId: "worker-1" });

    expect(await worker.runOnce()).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it("keeps looping after a failed execution and stops on abort", async () => {
    const controller = new AbortController();
    let calls = 0;
    const claim = vi.fn(async () => {
      calls += 1;
      if (calls >= 3) controller.abort();
      return calls >= 3 ? null : lease(`run-${calls}`);
    });
    const execute = vi.fn(async () => {
      throw new Error("boom");
    });
    const worker = new RunWorker({
      store: { claim, recoverExpired: vi.fn(async () => null) },
      execute,
      ownerId: "worker-1",
      sleep: async () => undefined,
    });

    await worker.start(controller.signal);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(worker.heartbeatAt()).not.toBeNull();
  });
});
// end
