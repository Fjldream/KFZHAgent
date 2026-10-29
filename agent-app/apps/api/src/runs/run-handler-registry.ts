// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { PrismaClient } from "@prisma/client";
import { withAgentRunExecution } from "@kf/build-jobs";
import { Command } from "@langchain/langgraph";
import { decodeBlueprintConfirmation, encodeBlueprintConfirmation, type RunStepMemo } from "@kf/agent-orchestrator";
import { buildRunGraphInput } from "./run-graph-input.js";
import { runGraphOnce, threadConfig, type GraphLike } from "./run-graph-runner.js";
import { RunPaused, RunAborted } from "./run-executor.js";
import type { StepHandlerRegistry } from "./run-execution.service.js";
import { waitForRunBuild } from "./run-build.js";
import { RUN_PLAN_VERSION } from "./run-execution-plan.js";
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { VISUAL_RUN_PLAN_VERSION } from "@kf/contracts";
// end
// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { createVisualRunHandler } from "./visual-run-handler.js";
import type { VisualAnalysisService } from "../vision/visual-analysis.service.js";
import type { VisualReviewService } from "../vision/visual-review.service.js";
import { createVisualBlueprintRunHandler } from "./visual-blueprint-run-handler.js";
import type { VisualContinuationReader } from "./visual-blueprint-run-input.js";
// end
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import { createVisualEngineeringRunHandler } from "./visual-engineering-run-handler.js";
import type { VisualEngineeringRuntime } from "./visual-engineering-run-input.js";
// end

export const RUN_NOT_FOUND = "RUN_NOT_FOUND";
export type RunHandlerRegistryDeps = {
  prisma: PrismaClient;
  loadGraph: () => Promise<GraphLike>;
  acquireTurn?: (conversationId: string) => Promise<{ dispose(): Promise<void> }>;
  registerMemo?: (runId: string, memo: RunStepMemo) => () => void;
  buildPollMs?: number;
  // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
  visualReference?: { analysis: Pick<VisualAnalysisService, "analyze">; reviews: Pick<VisualReviewService, "prepare"> };
  // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
  visualContinuation?: VisualContinuationReader & Pick<VisualReviewService, "prepareBlueprintReview">;
  // end
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  visualEngineering?: VisualEngineeringRuntime;
  // end
  // end
};
const fail = (code: string): never => { throw Object.assign(new Error(code), { code }); };

/** 结构化动作、图 checkpoint 与实际构建共用一条执行链。 */
export function createRunHandlerRegistry(deps: RunHandlerRegistryDeps): StepHandlerRegistry {
  return { graph: async (context) => {
    const run = await deps.prisma.agentRun.findFirst({ where: { id: context.runId, tenantId: context.tenantId } });
    if (!run) return fail(RUN_NOT_FOUND);
    if (run.buildJobId) return waitForRunBuild(deps, context, run, run.buildJobId);
    const turn = await deps.acquireTurn?.(run.conversationId);
    const unregister = deps.registerMemo?.(run.id, context.memo);
    let buildJobId: string | undefined;
    // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
    const publishApproval = async (planHash: string, summary: string) => {
      const event = await deps.prisma.agentRunEvent.findFirst({ where: { tenantId: run.tenantId, runId: run.id, type: "approval.required" }, orderBy: { seq: "desc" } });
      if ((event?.payload as { planHash?: unknown } | undefined)?.planHash !== planHash) await context.publish("approval.required", { planHash, summary });
    };
    // end
    try {
      const graph = await deps.loadGraph();
      const snapshot = await graph.getState(threadConfig(run.conversationId));
      const values = snapshot.values ?? {};
      if (values.runId === run.id && values.stage === "building" && typeof values.buildJobId === "string") {
        return await waitForRunBuild(deps, context, run, values.buildJobId);
      }
      const action = context.action;
      const recoveringOwnCheckpoint = values.runId === run.id && snapshot.next !== undefined;
      // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
      // Command 已写入 runId、决定输出已持久化但 checkpoint 未完成时，仍可能看到原 interrupt。
      // 只重放当前 Run 已受理的原决定；改稿后重新产生的审批（即便 hash 相同）不能自动放行。
      const replayAcceptedApproval = recoveringOwnCheckpoint && run.mode === "build" && action.type === "resume_approval"
        && values.planHash === action.planHash && values.approvalDecisionRunId !== run.id
        && (snapshot.tasks ?? []).some(task => (task.interrupts ?? []).length > 0);
      const completedSnapshot = recoveringOwnCheckpoint && (snapshot.next?.length === 0
        || (snapshot.tasks ?? []).some(task => (task.interrupts ?? []).length)) && !replayAcceptedApproval ? snapshot : undefined;
      // end
      let input: unknown;
      if (recoveringOwnCheckpoint) {
        // 同 run 的未完成检查点继续执行；已完成/暂停的检查点只投影结果，不再调模型。
        // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
        input = replayAcceptedApproval && action.type === "resume_approval"
          ? new Command({ resume: { action: action.action, planHash: action.planHash } }) : null;
        // end
      } else if (action.type === "resume_approval") {
        if (run.mode !== "build") return fail("ACTION_REQUIRES_BUILD_MODE");
        if (!(snapshot.tasks ?? []).some(task => (task.interrupts ?? []).length)) return fail("NO_PENDING_APPROVAL");
        if (values.planHash !== action.planHash) return fail("PLAN_HASH_MISMATCH");
        input = new Command({ resume: { action: action.action, planHash: action.planHash }, update: { runId: run.id, runMode: "build", planVersion: RUN_PLAN_VERSION } });
      } else {
        if (action.type !== "message" && action.type !== "confirm_blueprint") return fail("FEATURE_NOT_ENABLED");
        const message = await deps.prisma.message.findFirst({ where: { runId: run.id, role: "user" }, orderBy: { createdAt: "asc" } });
        let text = message?.content ?? null;
        if (action.type === "confirm_blueprint") {
          if (run.mode !== "build") return fail("ACTION_REQUIRES_BUILD_MODE");
          const receipt = decodeBlueprintConfirmation(action.receipt);
          if (!receipt || values.stage !== "design-review" || values.designPlanHash !== receipt.designPlanHash || values.designRevision !== receipt.revision) return fail("BLUEPRINT_RECEIPT_MISMATCH");
          text = encodeBlueprintConfirmation(receipt.revision, receipt.designPlanHash);
        }
        // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
        const discardVisualCheckpoint = values.planVersion === VISUAL_RUN_PLAN_VERSION || values.acceptedVisualPlanningInput != null
          || values.visualBlueprintConfirmationHash != null || values.visualSemanticPlan != null || values.visualPlanConfirmationHash != null;
        const nextInput = buildRunGraphInput({ runId: run.id, tenantId: run.tenantId,
          requestedByUserId: run.requestedByUserId, workspaceId: run.workspaceId,
          conversationId: run.conversationId, baseRevisionId: run.baseRevisionId,
          mode: run.mode as "discuss" | "plan" | "build",
          planVersion: RUN_PLAN_VERSION,
        }, text, discardVisualCheckpoint ? "idle" : typeof values.stage === "string" ? values.stage : "idle");
        input = discardVisualCheckpoint ? { ...Object.fromEntries(Object.keys(values).map(key => [key, undefined])), ...nextInput } : nextInput;
        // end
      }
      const outcome = await withAgentRunExecution({ runId: run.id, tenantId: run.tenantId, ownerId: context.lease.ownerId, fence: context.lease.fence, signal: context.signal,
        assertActive: async () => {
          // 与 RunStore 的 raw-SQL 租约使用相同时间参数，不能混用 ORM 的 UTC timestamp 写法。
          const [current] = await deps.prisma.$queryRaw<Array<{ status: string; buildJobId: string | null }>>`
            SELECT "status", "buildJobId" FROM "AgentRun"
            WHERE "id" = ${run.id} AND "tenantId" = ${run.tenantId}
              AND "leaseOwner" = ${context.lease.ownerId} AND "fence" = ${context.lease.fence}
              AND "leaseExpiresAt" > ${new Date()}
              AND "status" IN ('RUNNING', 'BUILDING', 'CANCEL_REQUESTED')
          `;
          if (!current) throw new Error("FENCE_REJECTED");
          if (current.status === "CANCEL_REQUESTED" && !current.buildJobId) throw new RunAborted();
        },
      }, () => runGraphOnce({ graph, input, conversationId: run.conversationId,
        signal: context.signal,
        ...(completedSnapshot ? { completedSnapshot } : {}),
        onNode: name => context.publish("decision.summary", { summary: `已完成流程节点：${name}` }).then(() => undefined),
      // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
      })).catch(async error => {
        if (error instanceof RunAborted || context.signal.aborted) {
          const cancelling = await deps.prisma.agentRun.findFirst({ where: { id: run.id, tenantId: run.tenantId,
            leaseOwner: context.lease.ownerId, fence: context.lease.fence, status: "CANCEL_REQUESTED",
          } });
          if (cancelling) {
            const pending = await graph.getState(threadConfig(run.conversationId));
            if (pending.values?.runId === run.id && (pending.tasks ?? []).some(task => (task.interrupts ?? []).length)) {
              const raw = pending.tasks?.flatMap(task => task.interrupts ?? [])[0];
              const value = raw !== null && typeof raw === "object" && "value" in raw ? raw.value : raw;
              const interrupt = value !== null && typeof value === "object" ? value as Record<string, unknown> : undefined;
              const planHash = interrupt?.planHash ?? pending.values.planHash;
              if (typeof planHash !== "string" || !planHash) return fail("APPROVAL_PAYLOAD_INVALID");
              await publishApproval(planHash, typeof interrupt?.summary === "string" ? interrupt.summary.slice(0, 600) : "请确认变更方案");
              throw new RunPaused("WAITING_APPROVAL");
            }
          }
        }
        throw error;
      });
      // end
      const errorCode = outcome.values.lastErrorCode;
      if (typeof errorCode === "string" && errorCode && !(outcome.values.stage === "building" && typeof outcome.values.buildJobId === "string")) return fail(errorCode.split(":")[0]!);
      if (outcome.kind === "interrupted") {
        const planHash = outcome.interrupt.planHash ?? outcome.values.planHash;
        if (typeof planHash !== "string" || !planHash) return fail("APPROVAL_PAYLOAD_INVALID");
        const summary = typeof outcome.interrupt.summary === "string" ? outcome.interrupt.summary.slice(0, 600) : "请确认变更方案";
        // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
        await publishApproval(planHash, summary);
        // end
        throw new RunPaused("WAITING_APPROVAL");
      }
      if (outcome.stage === "design-review") {
        const revision = outcome.values.designRevision;
        const designPlanHash = outcome.values.designPlanHash;
        if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 1 || typeof designPlanHash !== "string" || !/^[a-f0-9]{64}$/.test(designPlanHash)) return fail("BLUEPRINT_NOT_AVAILABLE");
        const receipt = encodeBlueprintConfirmation(revision, designPlanHash);
        await context.publish("input.required", { question: "请确认蓝图后继续生成工程", receipt });
        throw new RunPaused("WAITING_INPUT");
      }
      if (outcome.stage === "clarifying" || outcome.values.intent === "CLARIFY") {
        await context.publish("input.required", { question: "请补充需求后继续" });
        throw new RunPaused("WAITING_INPUT");
      }
      buildJobId = typeof outcome.values.buildJobId === "string" && outcome.stage === "building" ? outcome.values.buildJobId : undefined;
      if (!buildJobId) return { output: { stage: outcome.stage }, safeSummary: "本轮处理完成" };
    } finally {
      unregister?.();
      await turn?.dispose();
    }
    return waitForRunBuild(deps, context, run, buildJobId);
  // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  }, "visual-reference": createVisualRunHandler(deps), "visual-blueprint": createVisualBlueprintRunHandler(deps),
  "visual-engineering": createVisualEngineeringRunHandler(deps) };
  // end
  // end
}
// end
