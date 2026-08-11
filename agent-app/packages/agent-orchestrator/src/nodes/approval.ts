import { interrupt } from "@langchain/langgraph";
import type { AgentGraphStateValue, AgentGraphUpdate, ApprovalInterrupt } from "../state.js";
import { ApprovalResumeSchema } from "../state.js";
import type { ChangePlanRepository } from "../ports.js";

/**
 * Human-in-the-loop approval point (brief Step 5).
 *
 * First execution publishes the structured interrupt payload — type,
 * changeRequestId, planHash, summary, diffArtifactId, previewArtifactId — and
 * pauses. Resume (`Command({ resume })`) must carry an action of
 * approve/revise/cancel plus the exact planHash the user was shown:
 *   - approve → enqueue-build,
 *   - revise  → plan-change (re-plans against the same request),
 *   - cancel  → cancel-plan,
 *   - missing/invalid action or planHash mismatch → idle + lastErrorCode, and
 *     crucially NO side effect and no build enqueue.
 *
 * The routing decision is written into `resumeAction` and a conditional edge
 * turns it into a node jump, so this node never needs a Command return value.
 */
export function createApprovalNode() {
  return (state: AgentGraphStateValue): AgentGraphUpdate => {
    // A plan-change failure (INVALID_MODEL_OUTPUT) must never reach the
    // approval interrupt: return to idle preserving the error code so the
    // caller can see why no plan is pending.
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
 * Closes the pending change request. Idempotent: re-running only touches
 * requests that are still OPEN.
 */
export function createCancelPlanNode(deps: { changePlanRepository: ChangePlanRepository }) {
  return async (state: AgentGraphStateValue): Promise<AgentGraphUpdate> => {
    if (state.activeChangeRequestId !== undefined) {
      await deps.changePlanRepository.setChangeRequestStatus({
        tenantId: state.tenantId,
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
