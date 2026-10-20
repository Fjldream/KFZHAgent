// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { RunSnapshot } from "@kf/contracts";
import { FENCE_REJECTED, type ClaimedRunLease, type RunStore } from "./run-store.js";
import type { RunStepStore } from "./run-step-store.js";

/** 一个可恢复节点：inputHash 必须包含节点逻辑版本与输入（含 schema 版本）。 */
export type ExecutableStep = {
  stepKey: string;
  label: string;
  inputHash: string;
  run: (signal: AbortSignal) => Promise<{ output: unknown; safeSummary?: string }>;
};

export type ExecutorDeps = {
  store: RunStore;
  steps: RunStepStore;
  /** 续期间隔，默认租约的 1/3。 */
  renewIntervalMs?: number;
  now?: () => Date;
};

/**
 * 执行一个已领取的 run。
 *
 * 保证：
 * - 每步先发 step.started，再执行，再落 step 输出与 step.completed
 * - 已完成且 inputHash 相同的步骤直接复用（崩溃恢复不重算）
 * - 租约每秒级续期；续期失败立刻停止后续写入，不再污染 run
 * - 取消（signal aborted）收尾为 CANCELLED，失败收尾为 FAILED 并带失败码
 */
export class GraphRunExecutor {
  constructor(private readonly deps: ExecutorDeps) {}

  async execute(
    lease: ClaimedRunLease,
    tenantId: string,
    steps: readonly ExecutableStep[],
    signal: AbortSignal,
  ): Promise<RunSnapshot> {
    const now = this.deps.now ?? (() => new Date());
    let leaseLost = false;
    const renewTimer = setInterval(() => {
      void this.deps.store.renew(lease, now()).catch(() => {
        leaseLost = true;
      });
    }, this.deps.renewIntervalMs ?? 10_000);

    try {
      for (const [index, step] of steps.entries()) {
        if (signal.aborted) throw new RunAborted();
        if (leaseLost) throw new Error(FENCE_REJECTED);

        await this.deps.store.append(lease, tenantId, {
          type: "step.started",
          payload: { stepKey: step.stepKey, label: step.label, attempt: index + 1 },
        });

        const cached = await this.deps.steps.findCompleted({
          tenantId,
          runId: lease.runId,
          stepKey: step.stepKey,
          inputHash: step.inputHash,
        });
        if (cached !== null) {
          await this.deps.store.append(lease, tenantId, {
            type: "step.completed",
            payload: {
              stepKey: step.stepKey,
              label: step.label,
              attempt: index + 1,
              durationMs: 0,
              safeSummary: "已复用上次结果",
            },
          });
          continue;
        }

        const startedAt = now().getTime();
        try {
          const result = await step.run(signal);
          await this.deps.steps.complete({
            lease,
            tenantId,
            stepKey: step.stepKey,
            inputHash: step.inputHash,
            output: result.output,
          });
          await this.deps.store.append(lease, tenantId, {
            type: "step.completed",
            payload: {
              stepKey: step.stepKey,
              label: step.label,
              attempt: index + 1,
              durationMs: Math.max(0, now().getTime() - startedAt),
              ...(result.safeSummary === undefined ? {} : { safeSummary: result.safeSummary.slice(0, 600) }),
            },
          });
        } catch (error) {
          // 暂停不是失败：图中断等用户确认时不得写 step.failed。
          if (error instanceof RunPaused) throw error;
          if (error instanceof RunAborted || signal.aborted) throw new RunAborted();
          const failureCode = error instanceof Error && "code" in error
            ? String((error as { code?: unknown }).code).slice(0, 120)
            : "STEP_FAILED";
          await this.deps.store.append(lease, tenantId, {
            type: "step.failed",
            payload: {
              stepKey: step.stepKey,
              label: step.label,
              attempt: index + 1,
              durationMs: Math.max(0, now().getTime() - startedAt),
              failureCode,
            },
          }).catch(() => undefined);
          throw Object.assign(error instanceof Error ? error : new Error(failureCode), { failureCode });
        }
      }

      return await this.deps.store.finish(lease, tenantId, "SUCCEEDED");
    } catch (error) {
      // 图中断：释放租约、保留 lastSeq，run 停在等待态，由下一次 action 继续。
      if (error instanceof RunPaused) {
        return this.deps.store.pause(lease, tenantId, error.status);
      }
      const cancelled = signal.aborted || error instanceof RunAborted;
      const failureCode = cancelled
        ? "RUN_CANCELLED"
        : typeof error === "object" && error !== null && "failureCode" in error
          ? String((error as { failureCode?: unknown }).failureCode).slice(0, 120)
          : "RUN_FAILED";
      return this.deps.store.finish(lease, tenantId, cancelled ? "CANCELLED" : "FAILED", failureCode);
    } finally {
      clearInterval(renewTimer);
    }
  }
}

export class RunPaused extends Error {
  override name = "RunPaused";
  constructor(readonly status: "WAITING_APPROVAL" | "WAITING_INPUT") {
    super("run paused for user input");
  }
}

export class RunAborted extends Error {
  override name = "RunAborted";
  constructor() {
    super("run aborted");
  }
}
// end
