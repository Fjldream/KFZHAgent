// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { canonicalServerHash, CustomerSolutionBlueprintSchema, VISUAL_RUN_PLAN_VERSION } from "@kf/contracts";
import { encodeBlueprintConfirmation, hashDesignPlan } from "@kf/agent-orchestrator";
import { withAgentRunExecution } from "@kf/build-jobs";
import { buildVisualBlueprintGraphInput } from "./run-graph-input.js";
import { readActiveVisualBlueprintInput } from "./visual-blueprint-run-input.js";
import { runGraphOnce, threadConfig } from "./run-graph-runner.js";
import { RunAborted, RunPaused } from "./run-executor.js";
import type { RunHandlerRegistryDeps } from "./run-handler-registry.js";
import type { StepHandler } from "./run-execution.service.js";

/** Real graph execution for an accepted image. Always ends in independent blueprint review, never build. */
export function createVisualBlueprintRunHandler(deps: RunHandlerRegistryDeps): StepHandler {
  return async context => {
    if (!deps.visualContinuation) throw new Error("VISUAL_FLOW_NOT_CONFIGURED");
    const reviews = deps.visualContinuation;
    const run = await deps.prisma.agentRun.findFirst({ where: { id: context.runId, tenantId: context.tenantId } });
    if (!run || context.action.type !== "accept_visual_reference") throw new Error("VISUAL_BLUEPRINT_INPUT_INVALID");
    const turn = await deps.acquireTurn?.(run.conversationId);
    const unregister = deps.registerMemo?.(run.id, context.memo);
    try {
      return await withAgentRunExecution({ runId: run.id, tenantId: run.tenantId, ownerId: context.lease.ownerId,
        fence: context.lease.fence, signal: context.signal, assertActive: async () => {
          const [current] = await deps.prisma.$queryRaw<Array<{ status: string }>>`SELECT "status" FROM "AgentRun"
            WHERE "id"=${run.id} AND "tenantId"=${run.tenantId} AND "leaseOwner"=${context.lease.ownerId} AND "fence"=${context.lease.fence}
            AND "leaseExpiresAt" > (clock_timestamp() AT TIME ZONE 'UTC') AND "status" IN ('RUNNING','CANCEL_REQUESTED')`;
          if (!current) throw new Error("FENCE_REJECTED");
          if (current.status === "CANCEL_REQUESTED") throw new RunAborted();
        } }, async () => {
        const trusted = await deps.prisma.$transaction(tx => readActiveVisualBlueprintInput(tx, reviews, run));
        const graph = await deps.loadGraph();
        const checkpoint = await graph.getState(threadConfig(run.conversationId));
        const values = checkpoint.values ?? {};
        if ((checkpoint.tasks ?? []).some(task => (task.interrupts ?? []).length > 0)) throw new Error("APPROVAL_RESUME_REQUIRED");
        const own = values.runId === run.id && checkpoint.next !== undefined;
        if (own && (values.planVersion !== VISUAL_RUN_PLAN_VERSION || values.tenantId !== run.tenantId || values.userId !== run.requestedByUserId
          || values.workspaceId !== run.workspaceId || values.conversationId !== run.conversationId || values.currentRevisionId !== run.baseRevisionId
          || canonicalServerHash(values.acceptedVisualPlanningInput ?? null) !== canonicalServerHash(trusted.snapshot.content.accepted)
          || !["design-planning", "design-review", "idle"].includes(String(values.stage)))) throw new Error("VISUAL_BLUEPRINT_CHECKPOINT_INVALID");
        const input = own ? null : buildVisualBlueprintGraphInput({ runId: run.id, tenantId: run.tenantId, requestedByUserId: run.requestedByUserId,
          workspaceId: run.workspaceId, conversationId: run.conversationId, baseRevisionId: run.baseRevisionId,
          planVersion: VISUAL_RUN_PLAN_VERSION, mode: "build" }, trusted.snapshot.content.accepted, trusted.instruction, values);
        const result = await runGraphOnce({ graph, input, conversationId: run.conversationId, signal: context.signal,
          ...(own && checkpoint.next?.length === 0 ? { completedSnapshot: checkpoint } : {}),
          onNode: name => context.publish("decision.summary", { summary: `已完成流程节点：${name}` }).then(() => undefined) });
        if (typeof result.values.lastErrorCode === "string" && result.values.lastErrorCode) throw new Error(result.values.lastErrorCode);
        const parsed = CustomerSolutionBlueprintSchema.safeParse(result.values.designPlan);
        const revision = result.values.designRevision; const hash = result.values.designPlanHash;
        if (result.kind !== "completed" || result.stage !== "design-review" || !parsed.success || typeof revision !== "number" || !Number.isInteger(revision)
          || revision < 1 || hashDesignPlan(parsed.data, revision) !== hash || result.values.runId !== run.id
          || result.values.visualBlueprintConfirmationHash !== trusted.snapshot.content.accepted.confirmationHash
          || result.values.buildJobId || result.values.buildAuthorization || result.values.creativeConfirmationId) throw new Error("VISUAL_BLUEPRINT_CHECKPOINT_INVALID");
        const receipt = encodeBlueprintConfirmation(revision, hash);
        // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
        // Freeze the exact displayed blueprint before publishing a confirmable receipt.
        await reviews.prepareBlueprintReview({ runId: run.id, blueprint: parsed.data, revision, designPlanHash: hash,
          visualConfirmationHash: trusted.snapshot.content.accepted.confirmationHash });
        // end
        const pending = await deps.prisma.agentRunEvent.findFirst({ where: { tenantId: run.tenantId, runId: run.id, type: "input.required" }, orderBy: { seq: "desc" } });
        if (pending && (pending.payload as { receipt?: unknown }).receipt !== receipt) throw new Error("BLUEPRINT_RECEIPT_MISMATCH");
        if (!pending) await context.publish("input.required", { question: "请确认蓝图后继续生成工程", receipt });
        throw new RunPaused("WAITING_INPUT");
      });
    } catch (error) {
      if (error instanceof RunPaused || error instanceof RunAborted || context.signal.aborted) throw error;
      const code = error instanceof Error && /^[A-Z][A-Z0-9_]{2,119}$/.test(error.message) ? error.message : "VISUAL_BLUEPRINT_FLOW_FAILED";
      throw Object.assign(new Error(code), { code });
    } finally { unregister?.(); await turn?.dispose(); }
  };
}
// end
