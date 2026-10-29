// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import { canonicalServerHash, VISUAL_RUN_PLAN_VERSION } from "@kf/contracts";
import { withAgentRunExecution } from "@kf/build-jobs";
import { buildVisualEngineeringGraphInput } from "./run-graph-input.js";
import { readVisualEngineeringInput } from "./visual-engineering-run-input.js";
import { runGraphOnce, threadConfig } from "./run-graph-runner.js";
import { RunAborted } from "./run-executor.js";
import { waitForRunBuild } from "./run-build.js";
import type { RunHandlerRegistryDeps } from "./run-handler-registry.js";
import type { StepHandler } from "./run-execution.service.js";

export function createVisualEngineeringRunHandler(deps: RunHandlerRegistryDeps): StepHandler {
  return async context => {
    const runtime = deps.visualEngineering;
    if (!runtime) throw new Error("VISUAL_FLOW_NOT_CONFIGURED");
    const discovered = await deps.prisma.agentRun.findFirst({ where: { id: context.runId, tenantId: context.tenantId } });
    if (!discovered || context.action.type !== "confirm_blueprint") throw new Error("VISUAL_ENGINEERING_INPUT_INVALID");
    const read = async () => {
      const run = await deps.prisma.agentRun.findUniqueOrThrow({ where: { id: discovered.id } });
      return deps.prisma.$transaction(tx => readVisualEngineeringInput(tx, runtime, run));
    };
    try {
      return await withAgentRunExecution({ runId: discovered.id, tenantId: discovered.tenantId, ownerId: context.lease.ownerId,
        fence: context.lease.fence, signal: context.signal, assertActive: async () => {
          const trusted = await read();
          if (trusted.run.status === "CANCEL_REQUESTED") throw new RunAborted();
        } }, async () => {
        const trusted = await read();
        // Enqueue atomically binds BuildJob.agentRunId and AgentRun.buildJobId. Never rerun a graph after this commit.
        if (trusted.job) return waitForRunBuild(deps, context, trusted.run, trusted.job.id);
        const turn = await deps.acquireTurn?.(discovered.conversationId);
        const unregister = deps.registerMemo?.(discovered.id, context.memo);
        try {
          const graph = await deps.loadGraph();
          const checkpoint = await graph.getState(threadConfig(discovered.conversationId));
          const values = checkpoint.values ?? {};
          if ((checkpoint.tasks ?? []).some(task => (task.interrupts ?? []).length)) throw new Error("APPROVAL_RESUME_REQUIRED");
          const own = values.runId === discovered.id && checkpoint.next !== undefined;
          const review = trusted.snapshot.content.blueprintReview.content;
          if (own && (values.planVersion !== VISUAL_RUN_PLAN_VERSION || values.tenantId !== discovered.tenantId
            || values.userId !== discovered.requestedByUserId || values.workspaceId !== discovered.workspaceId
            || values.conversationId !== discovered.conversationId || values.currentRevisionId !== discovered.baseRevisionId
            || values.generationWorkflow !== "creative-v2" || values.designRevision !== review.revision || values.designPlanHash !== review.designPlanHash
            || canonicalServerHash(values.designPlan) !== canonicalServerHash(review.blueprint)
            || canonicalServerHash(values.acceptedVisualPlanningInput) !== canonicalServerHash(trusted.snapshot.content.accepted)
            || values.visualBlueprintConfirmationHash !== trusted.snapshot.content.accepted.confirmationHash
            || !["design-review", "implementation-planning", "solution-plan-ready", "building", "idle"].includes(String(values.stage))
            || values.buildJobId)) throw new Error("VISUAL_ENGINEERING_CHECKPOINT_INVALID");
          const input = own ? null : buildVisualEngineeringGraphInput({ runId: discovered.id, tenantId: discovered.tenantId,
            requestedByUserId: discovered.requestedByUserId, workspaceId: discovered.workspaceId, conversationId: discovered.conversationId,
            baseRevisionId: discovered.baseRevisionId, planVersion: VISUAL_RUN_PLAN_VERSION, mode: "build" }, trusted.snapshot, values);
          const result = await runGraphOnce({ graph, input, conversationId: discovered.conversationId, signal: context.signal,
            ...(own && checkpoint.next?.length === 0 ? { completedSnapshot: checkpoint } : {}),
            onNode: name => context.publish("decision.summary", { summary: `已完成流程节点：${name}` }).then(() => undefined) });
          const submitted = await read();
          if (!submitted.job || result.kind !== "completed" || result.stage !== "building" || result.values.runId !== discovered.id
            || result.values.buildJobId !== submitted.job.id) {
            throw new Error(typeof result.values.lastErrorCode === "string" && result.values.lastErrorCode
              ? result.values.lastErrorCode.split(":")[0] : "VISUAL_ENGINEERING_BUILD_REQUIRED");
          }
        } finally { unregister?.(); await turn?.dispose(); }
        const submitted = await read();
        if (!submitted.job) throw new Error("VISUAL_ENGINEERING_BUILD_REQUIRED");
        return waitForRunBuild(deps, context, submitted.run, submitted.job.id);
      });
    } catch (error) {
      if (error instanceof RunAborted || context.signal.aborted) throw error;
      const code = error instanceof Error && /^[A-Z][A-Z0-9_]{2,119}$/.test(error.message) ? error.message : "VISUAL_ENGINEERING_FLOW_FAILED";
      throw Object.assign(new Error(code), { code });
    }
  };
}
// end
