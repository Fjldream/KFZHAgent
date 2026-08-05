import type { AgentGraphStateValue, AgentGraphUpdate } from "../state.js";
import type { SolutionGraphDeps } from "../ports.js";

/**
 * Enqueues the durable build job for an approved plan (brief Step 5).
 *
 * Guard: this node is reachable ONLY through the approval interrupt's
 * approve resume (resumeAction === "approve" and stage === "building"). A
 * direct BUILD intent routes here too but is rejected with
 * BUILD_REQUIRES_APPROVAL — the graph never builds without an approval, so
 * BUILD without a just-approved plan is an explicit error, not a silent
 * bypass (see I3).
 *
 * The enqueue is idempotent on its idempotencyKey (the underlying
 * BuildJobService deduplicates on the same key). Approving marks the change
 * request APPROVED before the job is visible to workers.
 */
export function createEnqueueBuildNode(deps: SolutionGraphDeps) {
  return async (state: AgentGraphStateValue): Promise<AgentGraphUpdate> => {
    if (state.resumeAction !== "approve" || state.stage !== "building") {
      return {
        lastErrorCode: "BUILD_REQUIRES_APPROVAL",
        stage: "idle",
        resumeAction: undefined,
        pendingRequirements: undefined,
      };
    }
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
      return {
        buildJobId: job.id,
        stage: "idle",
        resumeAction: undefined,
        pendingRequirements: undefined,
      };
    } catch (error) {
      return {
        lastErrorCode: `ENQUEUE_FAILED:${error instanceof Error ? error.message : String(error)}`,
        stage: "idle",
        resumeAction: undefined,
        pendingRequirements: undefined,
      };
    }
  };
}
