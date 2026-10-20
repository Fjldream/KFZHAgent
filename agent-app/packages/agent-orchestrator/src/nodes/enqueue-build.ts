import { projectKeySchema } from "@kf/contracts";
import { graphBuildIdempotencyKey } from "@kf/build-jobs";
import type { AgentGraphStateValue, AgentGraphUpdate } from "../state.js";
import type { SolutionGraphDeps } from "../ports.js";

/**
 * 为已批准的计划将持久化构建作业入队（简要步骤 5）。
 *
 * 守卫：构建必须携带一个由路由持有的确切授权。旧版计划需要来自审批中断的 approve 恢复；模块计划可以直接从 confirmed-blueprint 或 preview-feedback 路由到达。
 *
 * 入队操作以 idempotencyKey 保证幂等（底层 BuildJobService 使用同一键去重）。在作业对 worker 可见之前，批准操作会把变更请求标记为 APPROVED。
 */
export function createEnqueueBuildNode(deps: SolutionGraphDeps) {
  return async (state: AgentGraphStateValue): Promise<AgentGraphUpdate> => {
    const legacyAuthorized = state.buildAuthorization === "legacy-plan-approval"
      && state.resumeAction === "approve"
      && state.generationWorkflow !== "creative-v2";
    const moduleAuthorized = (state.buildAuthorization === "confirmed-blueprint"
      || state.buildAuthorization === "preview-feedback")
      && state.generationWorkflow !== "creative-v2"
      && state.resumeAction === undefined;
    const creativeAuthorized = state.buildAuthorization === "creative-solution"
      && state.generationWorkflow === "creative-v2"
      && state.resumeAction === undefined;
    if (state.stage !== "building" || (!legacyAuthorized && !moduleAuthorized && !creativeAuthorized)) {
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

    if (creativeAuthorized) {
      if (state.creativeProjectKey === undefined || state.creativeDomainKind === undefined) {
        return { lastErrorCode: "INCOMPLETE_PLAN", stage: "idle", buildAuthorization: undefined };
      }
      let persistedAndVerified = false;
      try {
        persistedAndVerified = await deps.changePlanRepository.verifyPersistedCreativePlan({
          tenantId: state.tenantId,
          workspaceId: state.workspaceId,
          changePlanId: state.changePlanId,
          changeRequestId: state.activeChangeRequestId,
          planHash: state.planHash,
          revisionId: state.currentRevisionId,
        });
      } catch {
        persistedAndVerified = false;
      }
      if (!persistedAndVerified) {
        return { lastErrorCode: "INCOMPLETE_PLAN", stage: "idle", buildAuthorization: undefined };
      }
    }

    let job;
    try {
      const domainKind = (creativeAuthorized
        ? state.creativeDomainKind!
        : deps.defaultDomainKind ?? "kingclient").trim();
      // 一个规范值同时驱动旧版检测、持久化标识、幂等键和入队载荷。这使间隔发生的重放仍绑定到与其已规范化形式完全相同的作业。
      const projectKey = projectKeySchema.parse(creativeAuthorized
        ? state.creativeProjectKey!
        : deps.defaultProjectKey ?? domainKind);
      const idempotencyKey = graphBuildIdempotencyKey({
        conversationId: state.conversationId,
        projectKey,
        domainKind,
        changePlanId: state.changePlanId,
        planHash: state.planHash,
      });
      job = await deps.buildJobPort.enqueue({
        tenantId: state.tenantId,
        workspaceId: state.workspaceId,
        baseRevisionId: state.currentRevisionId,
        changePlanId: state.changePlanId,
        planHash: state.planHash,
        projectKey,
        domainKind,
        idempotencyKey,
      });
    } catch {
      await deps.workspaceQuery.appendMessage({
        tenantId: state.tenantId,
        conversationId: state.conversationId,
        role: "assistant",
        content: creativeAuthorized
          ? "工程生成任务提交失败，请稍后重试。"
          : "构建任务提交失败，请稍后重试。",
      }).catch(() => {});
      return {
        lastErrorCode: "ENQUEUE_FAILED",
        stage: "idle",
        resumeAction: undefined,
        buildAuthorization: undefined,
        pendingRequirements: undefined,
      };
    }

    let postEnqueueSyncFailed = false;
    try {
      await deps.changePlanRepository.setChangeRequestStatus({
        tenantId: state.tenantId,
        workspaceId: state.workspaceId,
        changeRequestId: state.activeChangeRequestId,
        status: "APPROVED",
      });
    } catch {
      postEnqueueSyncFailed = true;
    }
    try {
      // Enqueue only proves durable acceptance. Legacy/module routes may later
      // enter preview review; creative-v2 completes as a downloadable工程包.
      await deps.workspaceQuery.appendMessage({
        tenantId: state.tenantId,
        conversationId: state.conversationId,
        role: "assistant",
        content: creativeAuthorized
          ? "工程生成任务已提交，完成后可下载工程包。"
          : "构建任务已提交，完成后右侧会自动显示工程预览和下载产物。",
      });
    } catch {
      postEnqueueSyncFailed = true;
    }
    return {
      buildJobId: job.id,
      stage: "building",
      lastErrorCode: postEnqueueSyncFailed ? "BUILD_POST_ENQUEUE_SYNC_FAILED" : undefined,
      resumeAction: undefined,
      buildAuthorization: undefined,
      pendingRequirements: undefined,
    };
  };
}
