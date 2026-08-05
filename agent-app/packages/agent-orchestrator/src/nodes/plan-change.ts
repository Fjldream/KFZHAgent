import { planHash } from "@kf/domain-client";
import type { ChangePlan } from "@kf/contracts";
import type { AgentGraphStateValue, AgentGraphUpdate } from "../state.js";
import type { SolutionGraphDeps } from "../ports.js";

/**
 * Produces a change plan for the current requirement (brief Step 4/5):
 *   - a brand-new workspace (no current revision) gets an initial project
 *     design instead of a plan, and never reaches the approval/build path,
 *   - MODIFY_REQUIREMENT or a planning-stage retry calls reviseChangePlan,
 *     otherwise createChangePlan is used,
 *   - the plan is persisted with deterministic ids (idempotent re-runs),
 *   - the planHash is computed over the canonical normalized plan,
 *   - the node ends in the `approval` stage where the approval interrupt waits.
 *
 * Persistent side effects are idempotent: deterministic changeRequestId /
 * changePlanId make repeated execution converge instead of duplicating rows.
 */
export function createPlanChangeNode(deps: SolutionGraphDeps) {
  return async (state: AgentGraphStateValue): Promise<AgentGraphUpdate> => {
    const modelContext = {
      tenantId: state.tenantId,
      userId: state.userId,
      workspaceId: state.workspaceId,
      conversationId: state.conversationId,
      recentMessages: state.recentMessages,
      conversationSummary: state.conversationSummary,
      revisionSummary: state.revisionSummary,
      currentRevisionId: state.currentRevisionId,
      requirementText: latestUserMessage(state),
    };

    // New workspace: initial design only, no plan/build.
    if (state.currentRevisionId === undefined) {
      const design = await deps.modelPort.createProjectDesign(modelContext);
      const addition = `已生成初始设计「${design.displayName}」，待初始化构建。`;
      const nextSummary = mergeSummary(state.conversationSummary, addition);
      if (nextSummary !== undefined && nextSummary !== state.conversationSummary) {
        await deps.workspaceQuery.setConversationSummary({
          tenantId: state.tenantId,
          conversationId: state.conversationId,
          summary: nextSummary,
        });
      }
      return { stage: "idle", lastErrorCode: "INITIAL_DESIGN_CREATED" };
    }

    const revising =
      state.intent === "MODIFY_REQUIREMENT" || state.stage === "planning" || state.resumeAction === "revise";
    const plan: ChangePlan = revising
      ? await deps.modelPort.reviseChangePlan(modelContext)
      : await deps.modelPort.createChangePlan(modelContext);
    const hash = planHash(plan);

    const existing = await deps.changePlanRepository.findOpenChangeRequest({
      tenantId: state.tenantId,
      workspaceId: state.workspaceId,
      conversationId: state.conversationId,
    });
    const changeRequestId =
      existing?.id ?? deterministicChangeRequestId(state.workspaceId, state.conversationId);
    await deps.changePlanRepository.saveChangeRequest({
      id: changeRequestId,
      tenantId: state.tenantId,
      workspaceId: state.workspaceId,
      title: `变更请求 ${hash.slice(0, 8)}`,
      status: "OPEN",
    });

    const changePlanId = deterministicPlanId(state.workspaceId, hash);
    await deps.changePlanRepository.savePlan({
      id: changePlanId,
      tenantId: state.tenantId,
      workspaceId: state.workspaceId,
      changeRequestId,
      planHash: hash,
      plan,
    });

    let diffArtifactId: string | undefined;
    let previewArtifactId: string | undefined;
    if (deps.planArtifacts !== undefined) {
      const refs = await deps.planArtifacts.create({
        tenantId: state.tenantId,
        workspaceId: state.workspaceId,
        changePlanId,
        plan,
        baseRevisionId: state.currentRevisionId,
      });
      diffArtifactId = refs.diffArtifactId;
      previewArtifactId = refs.previewArtifactId;
    }

    return {
      changePlanId,
      planHash: hash,
      activeChangeRequestId: changeRequestId,
      planSummary: summarizePlan(plan),
      diffArtifactId,
      previewArtifactId,
      stage: "approval",
      resumeAction: undefined,
    };
  };
}

/** Bounded, human-readable plan summary for the approval interrupt. */
function summarizePlan(plan: ChangePlan): string {
  const counts = new Map<string, number>();
  for (const op of plan.operations) {
    counts.set(op.op, (counts.get(op.op) ?? 0) + 1);
  }
  const kinds = [...counts.entries()].map(([kind, n]) => `${kind}×${n}`).join("、");
  const summary = `计划包含 ${plan.operations.length} 个操作（${kinds}）。`;
  return summary.slice(0, 500);
}

function deterministicChangeRequestId(workspaceId: string, conversationId: string): string {
  return `cr:${workspaceId}:${conversationId}`;
}

function deterministicPlanId(workspaceId: string, hash: string): string {
  return `plan:${workspaceId}:${hash}`;
}

function latestUserMessage(state: AgentGraphStateValue): string | undefined {
  for (let i = state.recentMessages.length - 1; i >= 0; i -= 1) {
    const message = state.recentMessages[i];
    if (message !== undefined && message.role === "user") return message.content;
  }
  return undefined;
}

function mergeSummary(existing: string | undefined, addition: string): string | undefined {
  const combined = existing !== undefined && existing.length > 0 ? `${existing}\n${addition}` : addition;
  return combined.length > 4_000 ? combined.slice(combined.length - 4_000) : combined;
}
