// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { RunAction, RunEvent, RunSnapshot } from "@kf/contracts";
import type { RunStepMemo } from "@kf/agent-orchestrator";
import type { PrismaClient } from "@prisma/client";
import { GraphRunExecutor, type ExecutableStep } from "./run-executor.js";
// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { planRunSteps, RUN_PLAN_VERSION } from "./run-execution-plan.js";
// end
import type { RunStepStore } from "./run-step-store.js";
import { createLeaseBoundStepMemo } from "./run-step-memo.adapter.js";
import type { ClaimedRunLease, RunStore } from "./run-store.js";
// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { RunActionSchema, VISUAL_RUN_PLAN_VERSION } from "@kf/contracts";
import { planVisualReferenceSteps, planVisualBlueprintSteps } from "./run-execution-plan.js";
import { readActiveVisualBlueprintInput, type VisualContinuationReader } from "./visual-blueprint-run-input.js";
import { readVisualRunAdmission } from "../vision/visual-run-admission.js";
import { lockActiveVisualRun } from "../vision/visual-analysis-input.js";
import { withAgentRunExecution } from "@kf/build-jobs";
// end
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import { planVisualEngineeringSteps } from "./run-execution-plan.js";
import { readVisualEngineeringInput, type VisualEngineeringRuntime } from "./visual-engineering-run-input.js";
// end
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { assertTextRunBaseMaySend } from "./text-run-context-guard.js";
// end

export const STEP_NOT_IMPLEMENTED = "STEP_NOT_IMPLEMENTED";

export type StepContext = {
  runId: string;
  tenantId: string;
  action: RunAction;
  baseRevisionId: string;
  stepKey: string;
  signal: AbortSignal;
  /** 绑定当前租约的节点级幂等；递给图节点即可获得「重启复用已完成输出」。 */
  memo: RunStepMemo;
  lease: ClaimedRunLease;
  publish: (type: RunEvent["type"], payload: Record<string, unknown>) => Promise<unknown>;
};

export type StepHandler = (context: StepContext) => Promise<{ output: unknown; safeSummary?: string }>;

export type StepHandlerRegistry = Readonly<Record<string, StepHandler>>;

export type RunExecutionDeps = {
  prisma: PrismaClient;
  store: RunStore;
  steps: RunStepStore;
  handlers: StepHandlerRegistry;
  // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
  visualContinuation?: VisualContinuationReader;
  // end
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  visualEngineering?: VisualEngineeringRuntime;
  // end
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
      // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
      // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
      // The visual preflight checks the entire frozen Run identity before any step cache read.
      // end
      // end
    });
    if (run === null) throw new Error("RUN_NOT_FOUND");

    // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
    // 必须早于 step cache 读取；完成输出不能绕过冻结协议校验。
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    let visualAdmissionHash: string | undefined;
    let visualContinuationHash: string | undefined;
    // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
    let visualEngineeringHash: string | undefined;
    // end
    if (run.configSnapshot !== null) {
      const config = run.configSnapshot as { schemaVersion?: unknown; planVersion?: unknown; flags?: { agentVisionV1?: unknown } };
      if (config.schemaVersion !== 1 || (config.planVersion !== RUN_PLAN_VERSION && config.planVersion !== VISUAL_RUN_PLAN_VERSION)) {
        return this.deps.store.finish(lease, run.tenantId, "FAILED", "RUN_CONFIG_VERSION_MISMATCH");
      }
      if (config.planVersion === VISUAL_RUN_PLAN_VERSION) {
        const action = RunActionSchema.safeParse(run.action);
        // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
        if (config.flags?.agentVisionV1 !== true || !action.success || !["message", "accept_visual_reference", "confirm_blueprint"].includes(action.data.type)) {
        // end
          return this.deps.store.finish(lease, run.tenantId, "FAILED", "RUN_CONFIG_VERSION_MISMATCH");
        }
        try {
          // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
          if (action.data.type === "confirm_blueprint") {
            const runtime = this.deps.visualEngineering;
            if (!runtime) throw new Error("VISUAL_FLOW_NOT_CONFIGURED");
            const input = await withAgentRunExecution({ runId: run.id, tenantId: run.tenantId, ownerId: lease.ownerId, fence: lease.fence, signal },
              () => this.deps.prisma.$transaction(tx => readVisualEngineeringInput(tx, runtime, run)));
            visualEngineeringHash = input.snapshot.inputHash;
          } else {
          // end
          // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
          if (action.data.type === "accept_visual_reference") {
            const reviews = this.deps.visualContinuation;
            if (!reviews) throw new Error("VISUAL_FLOW_NOT_CONFIGURED");
            const input = await withAgentRunExecution({ runId: run.id, tenantId: run.tenantId, ownerId: lease.ownerId, fence: lease.fence, signal },
              () => this.deps.prisma.$transaction(tx => readActiveVisualBlueprintInput(tx, reviews, run)));
            visualContinuationHash = input.snapshot.inputHash;
          } else {
          // end
          const frozen = await withAgentRunExecution({ runId: run.id, tenantId: run.tenantId, ownerId: lease.ownerId, fence: lease.fence, signal },
            () => this.deps.prisma.$transaction(async tx => readVisualRunAdmission(tx,
              await lockActiveVisualRun(tx, { tenantId: run.tenantId, workspaceId: run.workspaceId, runId: run.id }))));
          if (!frozen) throw new Error("VISUAL_RUN_INPUT_REQUIRED");
          if (frozen.content.attachments.length !== 1) throw new Error("VISUAL_MULTIPLE_REFERENCES_NOT_ENABLED");
          visualAdmissionHash = frozen.inputHash;
          // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
          }
          // end
          // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
          }
          // end
        } catch (error) {
          // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
          // Shutdown is not a user cancellation or input failure: retain the lease for recovery.
          if (signal.aborted) throw error;
          // end
          const code = error instanceof Error && /^[A-Z][A-Z0-9_]{2,119}$/.test(error.message) ? error.message : "VISUAL_RUN_INPUT_INVALID";
          return this.deps.store.finish(lease, run.tenantId, "FAILED", code);
        }
      }
    }
    // end
    // end

    const action = run.action as RunAction;
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    if ((run.configSnapshot as { planVersion?: unknown } | null)?.planVersion !== VISUAL_RUN_PLAN_VERSION
      && ["message", "confirm_blueprint", "revise_regions"].includes(action.type)) {
      try { await assertTextRunBaseMaySend(this.deps.prisma, run); }
      catch (error) {
        if (signal.aborted) throw error;
        // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
        const code = error instanceof Error && ["VISUAL_EXISTING_CONTENT_RECONSENT_REQUIRED", "CREATIVE_GENERATED_NATIVE_NAME_REGENERATION_REQUIRED"].includes(error.message)
          ? error.message : "SOLUTION_EXISTING_CONTEXT_INVALID";
        // end
        return this.deps.store.finish(lease, run.tenantId, "FAILED", code);
      }
    }
    // end
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
    const plan = visualEngineeringHash !== undefined && action.type === "confirm_blueprint"
      ? planVisualEngineeringSteps(action, run.baseRevisionId, visualEngineeringHash)
      : visualContinuationHash !== undefined && action.type === "accept_visual_reference"
    // end
      ? planVisualBlueprintSteps(action, run.baseRevisionId, visualContinuationHash)
      : visualAdmissionHash !== undefined && action.type === "message"
        ? planVisualReferenceSteps(action, run.baseRevisionId, visualAdmissionHash) : planRunSteps(action, run.baseRevisionId);
    // end
    const memo = createLeaseBoundStepMemo({ steps: this.deps.steps, lease, tenantId: run.tenantId });

    // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
    const steps: ExecutableStep[] = plan.map(planned => {
      const executeStep = async (stepSignal: AbortSignal) => {
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
          memo,
          lease,
          publish: (type, payload) => this.deps.store.append(lease, run.tenantId, { type, payload }),
        });
      };
      return {
        stepKey: planned.stepKey, label: planned.label, inputHash: planned.inputHash, run: executeStep,
        // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
        ...(["visual-reference", "visual-blueprint"].includes(planned.stepKey) ? { mustPause: true } : {}),
        // end
        ...(planned.stepKey === "graph" ? { reconcileCancellation: async (stepSignal: AbortSignal) => { await executeStep(stepSignal); } } : {}),
      };
    });
    // end

    return this.executor.execute(lease, run.tenantId, steps, signal);
  }
}
// end
