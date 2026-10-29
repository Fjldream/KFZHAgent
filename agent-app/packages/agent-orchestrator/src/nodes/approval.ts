import { interrupt } from "@langchain/langgraph";
import type { AgentGraphStateValue, AgentGraphUpdate, ApprovalInterrupt } from "../state.js";
import { ApprovalResumeSchema } from "../state.js";
import type { ChangePlanRepository } from "../ports.js";

/**
 * 人工参与的审批节点（简述第 5 步）。
 *
 * 首次执行会发布结构化的中断载荷——type、changeRequestId、planHash、summary、diffArtifactId、previewArtifactId——然后暂停。恢复执行（`Command({ resume })`）时，必须携带 approve/revise/cancel 操作以及曾向用户展示的准确 planHash：
 *   - approve → enqueue-build，
 *   - revise  → plan-change（根据同一请求重新规划），
 *   - cancel  → cancel-plan，
 *   - 操作缺失/无效或 planHash 不匹配 → idle + lastErrorCode；关键是不得产生副作用，也不得将构建入队。
 *
 * 路由决策写入 `resumeAction`，再由条件边将其转换为节点跳转，因此该节点无需返回 Command 值。
 */
export function createApprovalNode() {
  return (state: AgentGraphStateValue): AgentGraphUpdate => {
    // plan-change 失败（INVALID_MODEL_OUTPUT）绝不能进入审批中断：返回 idle 并保留错误代码，使调用方知道为何没有待处理计划。
    if (state.lastErrorCode === "INVALID_MODEL_OUTPUT") {
      return { stage: "idle" };
    }
    if (
      state.activeChangeRequestId === undefined ||
      state.changePlanId === undefined ||
      state.planHash === undefined
    ) {
      return { lastErrorCode: "NO_PLAN_AVAILABLE", stage: "idle" };
    }

    const payload: ApprovalInterrupt = {
      type: "plan-approval",
      changeRequestId: state.activeChangeRequestId,
      planHash: state.planHash,
      summary: state.planSummary ?? "",
      diffArtifactId: state.diffArtifactId,
      previewArtifactId: state.previewArtifactId,
    };

    const resume: unknown = interrupt<ApprovalInterrupt, unknown>(payload);
    const parsed = ApprovalResumeSchema.safeParse(resume);
    if (!parsed.success) {
      return {
        lastErrorCode: "INVALID_RESUME_ACTION",
        stage: "idle",
        resumeAction: undefined,
      };
    }
    if (parsed.data.planHash !== state.planHash) {
      return {
        lastErrorCode: "PLAN_HASH_MISMATCH",
        stage: "idle",
        resumeAction: undefined,
      };
    }
    if (parsed.data.action === "approve") {
      return {
        resumeAction: "approve",
        stage: "building",
        buildAuthorization: "legacy-plan-approval",
      };
    }
    if (parsed.data.action === "revise") {
      return { resumeAction: "revise", stage: "planning" };
    }
    return { resumeAction: "cancel", stage: "idle", buildAuthorization: undefined };
  };
}

/**
 * 关闭待处理的更改请求。幂等：重新运行只会触及时尚OPEN的请求。
 */
export function createCancelPlanNode(deps: { changePlanRepository: ChangePlanRepository }) {
  return async (state: AgentGraphStateValue): Promise<AgentGraphUpdate> => {
    if (state.activeChangeRequestId !== undefined) {
      await deps.changePlanRepository.setChangeRequestStatus({
        tenantId: state.tenantId,
        workspaceId: state.workspaceId,
        changeRequestId: state.activeChangeRequestId,
        status: "CLOSED",
      });
    }
    return {
      stage: "idle",
      resumeAction: undefined,
      buildAuthorization: undefined,
      activeChangeRequestId: undefined,
      changePlanId: undefined,
      planHash: undefined,
      planSummary: undefined,
      diffArtifactId: undefined,
      previewArtifactId: undefined,
    };
  };
}
