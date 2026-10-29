// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { VISUAL_RUN_PLAN_VERSION } from "@kf/contracts";
import { withAgentRunExecution } from "@kf/build-jobs";
import { lockActiveVisualRun } from "../vision/visual-analysis-input.js";
import { readVisualRunAdmission } from "../vision/visual-run-admission.js";
import { RunAborted, RunPaused, RunPersistedPause } from "./run-executor.js";
import type { RunHandlerRegistryDeps } from "./run-handler-registry.js";
import type { StepHandler } from "./run-execution.service.js";

/** Reference review is a durable task step, not a second code-generation/compiler path. */
export function createVisualRunHandler(deps: RunHandlerRegistryDeps): StepHandler {
  return async context => {
    const visualReference = deps.visualReference;
    if (!visualReference) throw Object.assign(new Error("VISUAL_FLOW_NOT_CONFIGURED"), { code: "VISUAL_FLOW_NOT_CONFIGURED" });
    const run = await deps.prisma.agentRun.findFirst({ where: { id: context.runId, tenantId: context.tenantId } });
    if (!run) throw Object.assign(new Error("RUN_NOT_FOUND"), { code: "RUN_NOT_FOUND" });
    const turn = await deps.acquireTurn?.(run.conversationId);
    try {
      return await withAgentRunExecution({ runId: run.id, tenantId: run.tenantId, ownerId: context.lease.ownerId,
        fence: context.lease.fence, signal: context.signal }, async () => {
        const frozen = await deps.prisma.$transaction(async tx => {
          const current = await lockActiveVisualRun(tx, { tenantId: run.tenantId, workspaceId: run.workspaceId, runId: run.id });
          if ((current.configSnapshot as { planVersion?: unknown } | null)?.planVersion !== VISUAL_RUN_PLAN_VERSION) throw new Error("RUN_CONFIG_VERSION_MISMATCH");
          return readVisualRunAdmission(tx, current);
        });
        if (!frozen || frozen.content.attachments.length !== 1) throw new Error("VISUAL_RUN_INPUT_INVALID");
        const action = run.action as { type?: unknown; text?: unknown };
        if (action.type !== "message" || typeof action.text !== "string") throw new Error("VISUAL_RUN_INPUT_INVALID");
        const result = await visualReference.analysis.analyze({ tenantId: run.tenantId, workspaceId: run.workspaceId, runId: run.id,
          assetId: frozen.content.attachments[0]!.assetId, instruction: action.text, analysisVersion: frozen.content.analysisModel.analysisVersion }, context.signal);
        await context.publish("decision.summary", { summary: "参考图识别已完成，请核对识别结果和控件映射。" });
        const review = await visualReference.reviews.prepare({ tenantId: run.tenantId, workspaceId: run.workspaceId, runId: run.id,
          analysisId: result.id, analysisHash: result.specHash });
        // prepare committed the exact receipt, wait and lease release in one transaction.
        throw new RunPersistedPause(review.reviewHash);
      });
    } catch (error) {
      if (error instanceof RunPaused || error instanceof RunAborted || context.signal.aborted) throw error;
      const code = error instanceof Error && /^[A-Z][A-Z0-9_]{2,119}$/.test(error.message) ? error.message : "VISUAL_REFERENCE_FAILED";
      throw Object.assign(new Error(code), { code });
    } finally { await turn?.dispose(); }
  };
}
// end
