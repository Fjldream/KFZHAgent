import { projectKeySchema } from "@kf/contracts";
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

    try {
      const domainKind = (deps.defaultDomainKind ?? "kingclient").trim();
      // One canonical value drives legacy detection, durable identity, the
      // idempotency key, and the enqueue payload. This keeps spaced replays
      // bound to the exact same job as their already-normalized form.
      const projectKey = projectKeySchema.parse(deps.defaultProjectKey ?? domainKind);
      const legacyDefaultProject = domainKind === "kingclient" && projectKey === "kingclient";
      const idempotencyKey = legacyDefaultProject
        ? `${state.conversationId}:${state.changePlanId}:${state.planHash}`
        : `${state.conversationId}:${projectKey}:${state.changePlanId}:${state.planHash}`;
      const job = await deps.buildJobPort.enqueue({
        tenantId: state.tenantId,
        workspaceId: state.workspaceId,
        baseRevisionId: state.currentRevisionId,
        changePlanId: state.changePlanId,
        planHash: state.planHash,
        projectKey,
        domainKind,
        idempotencyKey,
      });
      await deps.changePlanRepository.setChangeRequestStatus({
        tenantId: state.tenantId,
        changeRequestId: state.activeChangeRequestId,
        status: "APPROVED",
      });
      // Enqueue only proves durable acceptance, not preview availability. The
      // next graph turn observes the terminal job in load-context and enters
      // preview-review only after SUCCEEDED.
      await deps.workspaceQuery.appendMessage({
        tenantId: state.tenantId,
        conversationId: state.conversationId,
        role: "assistant",
        content: "构建任务已提交，完成后右侧会自动显示工程预览和下载产物。",
      });
      return {
        buildJobId: job.id,
        stage: "building",
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
