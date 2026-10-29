// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { ClaimedRunLease, RunStore } from "./run-store.js";

export type RunWorkerDeps = {
  store: Pick<RunStore, "claim" | "recoverExpired">;
  execute: (lease: ClaimedRunLease) => Promise<unknown>;
  ownerId: string;
  tenantId: string;
  /** 返回 false 时只保活、不领任务（例如处理器尚未接线）。 */
  canClaim?: () => boolean;
  idleDelayMs?: number;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
};

/**
 * 拉取式 run worker。
 *
 * 单轮顺序：先领新任务，没有可领的再尝试接手租约过期的任务。
 * 单次执行失败不会拖垮循环——失败收尾由执行器写库，进程继续拉下一个。
 * heartbeat 用于健康检查，不落库（进程级探活）。
 */
export class RunWorker {
  private lastHeartbeat: Date | null = null;
  private readonly idleDelayMs: number;
  private readonly now: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly deps: RunWorkerDeps) {
    this.idleDelayMs = deps.idleDelayMs ?? 1_000;
    this.now = deps.now ?? (() => new Date());
    this.sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  heartbeatAt(): Date | null {
    return this.lastHeartbeat;
  }

  /** 返回 true 表示这一轮确实处理了一个 run。 */
  async runOnce(): Promise<boolean> {
    if (this.deps.canClaim !== undefined && !this.deps.canClaim()) return false;
    const now = this.now();
    const lease = await this.deps.store.claim(this.deps.ownerId, this.deps.tenantId, now)
      ?? await this.deps.store.recoverExpired(this.deps.ownerId, this.deps.tenantId, now);
    if (lease === null) return false;

    this.lastHeartbeat = now;
    await this.deps.execute(lease);
    return true;
  }

  /** 循环直到 signal 被中止；空闲时按 idleDelayMs 退避。 */
  async start(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      let handled = false;
      try {
        handled = await this.runOnce();
      } catch {
        // 执行器负责把失败写进 run；这里只保证进程活着。
        handled = false;
      }
      this.lastHeartbeat = this.now();
      if (!handled) await this.sleep(this.idleDelayMs);
    }
  }
}
// end
