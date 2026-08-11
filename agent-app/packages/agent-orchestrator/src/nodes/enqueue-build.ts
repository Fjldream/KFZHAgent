import { projectKeySchema } from "@kf/contracts";
import type { AgentGraphStateValue, AgentGraphUpdate } from "../state.js";
import type { SolutionGraphDeps } from "../ports.js";

/**
 * Enqueues the durable build job for an approved plan (brief Step 5).
 *
 * Guard: a build must carry one exact routing-owned authorization. Legacy
 * plans require the approval interrupt's approve resume; module plans may
 * arrive directly from confirmed-blueprint or preview-feedback routing.
 *
 * The enqueue is idempotent on its idempotencyKey (the underlying
 * BuildJobService deduplicates on the same key). Approving marks the change
 * request APPROVED before the job is visible to workers.
 */
export function createEnqueueBuildNode(deps: SolutionGraphDeps) {
  return async (state: AgentGraphStateValue): Promise<AgentGraphUpdate> => {
    const legacyAuthorized = state.buildAuthorization === "legacy-plan-approval"
      && state.resumeAction === "approve";
    const moduleAuthorized = (state.buildAuthorization === "confirmed-blueprint"
      || state.buildAuthorization === "preview-feedback")
      && state.resumeAction === undefined;
    if (state.stage !== "building" || (!legacyAuthorized && !moduleAuthorized)) {
      return {
        lastErrorCode: "BUILD_REQUIRES_APPROVAL",
        stage: "idle",
        resumeAction: undefined,
        buildAuthorization: undefined,
        pendingRequirements: undefined,
      };
    }
    if (
      state.currentRevisionId === undefined ||
      state.changePlanId === undefined ||
      state.planHash === undefined ||
      state.activeChangeRequestId === undefined
    ) {
      return { lastErrorCode: "INCOMPLETE_PLAN", stage: "idle", buildAuthorization: undefined };
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
        buildAuthorization: undefined,
        pendingRequirements: undefined,
      };
    } catch {
      await deps.workspaceQuery.appendMessage({
        tenantId: state.tenantId,
        conversationId: state.conversationId,
        role: "assistant",
        content: "构建任务提交失败，请稍后重试。",
      }).catch(() => {});
      return {
        lastErrorCode: "ENQUEUE_FAILED",
        stage: "idle",
        resumeAction: undefined,
        buildAuthorization: undefined,
        pendingRequirements: undefined,
      };
    }
  };
}
