// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { RunAction, RunSnapshot } from "@kf/contracts";
import type { PrismaClient } from "@prisma/client";
import { GraphRunExecutor, type ExecutableStep } from "./run-executor.js";
import { planRunSteps } from "./run-execution-plan.js";
import type { RunStepStore } from "./run-step-store.js";
import type { ClaimedRunLease, RunStore } from "./run-store.js";

export const STEP_NOT_IMPLEMENTED = "STEP_NOT_IMPLEMENTED";

export type StepContext = {
  runId: string;
  tenantId: string;
  action: RunAction;
  baseRevisionId: string;
  stepKey: string;
  signal: AbortSignal;
};

export type StepHandler = (context: StepContext) => Promise<{ output: unknown; safeSummary?: string }>;

export type StepHandlerRegistry = Readonly<Record<string, StepHandler>>;

export type RunExecutionDeps = {
  prisma: PrismaClient;
  store: RunStore;
  steps: RunStepStore;
  handlers: StepHandlerRegistry;
  executor?: GraphRunExecutor;
};

/**
 * 把一个已领取的 run 翻译成可执行步骤并跑完。
 *
 * 缺处理器时抛 `STEP_NOT_IMPLEMENTED` 让 run 明确失败——绝不静默跳过某一步，
 * 否则会产出「看起来成功但少做了一步」的工程，比失败更危险。
 */
export class RunExecutionService {
  private readonly executor: GraphRunExecutor;

  constructor(private readonly deps: RunExecutionDeps) {
    this.executor = deps.executor ?? new GraphRunExecutor({ store: deps.store, steps: deps.steps });
  }

  async executeLease(lease: ClaimedRunLease, signal: AbortSignal): Promise<RunSnapshot> {
    const run = await this.deps.prisma.agentRun.findUnique({
      where: { id: lease.runId },
      select: { id: true, tenantId: true, action: true, baseRevisionId: true },
    });
    if (run === null) throw new Error("RUN_NOT_FOUND");

    const action = run.action as RunAction;
    const plan = planRunSteps(action, run.baseRevisionId);

    const steps: ExecutableStep[] = plan.map((planned) => ({
      stepKey: planned.stepKey,
      label: planned.label,
      inputHash: planned.inputHash,
      run: async (stepSignal) => {
        const handler = this.deps.handlers[planned.stepKey];
        if (handler === undefined) {
          throw Object.assign(new Error(STEP_NOT_IMPLEMENTED), { code: STEP_NOT_IMPLEMENTED });
        }
        return handler({
          runId: run.id,
          tenantId: run.tenantId,
          action,
          baseRevisionId: run.baseRevisionId ?? "",
          stepKey: planned.stepKey,
          signal: stepSignal,
        });
      },
    }));

    return this.executor.execute(lease, run.tenantId, steps, signal);
  }
}
// end
