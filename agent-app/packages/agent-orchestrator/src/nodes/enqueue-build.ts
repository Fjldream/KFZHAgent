import type { AgentGraphStateValue, AgentGraphUpdate } from "../state.js";
import type { SolutionGraphDeps } from "../ports.js";

/**
 * Enqueues the durable build job for an approved plan (brief Step 5). Runs only
 * after approval; the enqueue is idempotent on its idempotencyKey (the
 * underlying BuildJobService deduplicates on the same key). Approving marks
 * the change request APPROVED before the job is visible to workers.
 */
export function createEnqueueBuildNode(deps: SolutionGraphDeps) {
  return async (state: AgentGraphStateValue): Promise<AgentGraphUpdate> => {
    if (
      state.currentRevisionId === undefined ||
      state.changePlanId === undefined ||
      state.planHash === undefined ||
      state.activeChangeRequestId === undefined
    ) {
      return { lastErrorCode: "INCOMPLETE_PLAN", stage: "idle" };
    }

    const idempotencyKey = `${state.conversationId}:${state.changePlanId}:${state.planHash}`;
    try {
      const job = await deps.buildJobPort.enqueue({
        tenantId: state.tenantId,
        workspaceId: state.workspaceId,
        baseRevisionId: state.currentRevisionId,
        changePlanId: state.changePlanId,
        planHash: state.planHash,
        domainKind: deps.defaultDomainKind ?? "kingclient",
        idempotencyKey,
      });
      await deps.changePlanRepository.setChangeRequestStatus({
        tenantId: state.tenantId,
        changeRequestId: state.activeChangeRequestId,
        status: "APPROVED",
      });
      return { buildJobId: job.id, stage: "idle", resumeAction: undefined };
    } catch (error) {
      return {
        lastErrorCode: `ENQUEUE_FAILED:${error instanceof Error ? error.message : String(error)}`,
        stage: "idle",
        resumeAction: undefined,
      };
    }
  };
}
