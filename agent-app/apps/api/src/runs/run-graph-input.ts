// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { AgentGraphUpdate } from "@kf/agent-orchestrator";
// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { VISUAL_RUN_PLAN_VERSION, type AcceptedVisualPlanningInput } from "@kf/contracts";
import { validateAcceptedVisualPlanningInput } from "@kf/domain-client";
// end

export type RunGraphInputSource = {
  runId: string;
  tenantId: string;
  requestedByUserId: string;
  workspaceId: string;
  conversationId: string;
  baseRevisionId: string | null;
  planVersion?: string | null;
  mode?: "discuss" | "plan" | "build";
};

export type RunGraphInput = AgentGraphUpdate & {
  runId: string;
  planVersion?: string;
};

/**
 * 由持久 run 构造图输入。
 *
 * 与旧 SSE 入口保持同一形状：`recentMessages` 只带本轮用户消息，历史由
 * `load-context` 节点按分页自行加载——在入口塞全量历史会让「历史很长」的会话
 * 每次重算全部上下文，也让 checkpoint 体积失控。
 *
 * `currentRevisionId` 取 run 的 baseRevisionId：换基线后必须由新的 run 驱动，
 * 不能在旧 run 上继续用新基线。
 */
export function buildRunGraphInput(
  source: RunGraphInputSource,
  latestUserMessage: string | null,
  stage: string = "idle",
): RunGraphInput {
  return {
    tenantId: source.tenantId,
    userId: source.requestedByUserId,
    workspaceId: source.workspaceId,
    conversationId: source.conversationId,
    stage: stage as AgentGraphUpdate["stage"],
    recentMessages: latestUserMessage === null ? [] : [{ role: "user", content: latestUserMessage }],
    runId: source.runId,
    runMode: source.mode ?? "build",
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    // Public ordinary Run input never inherits a previous visual confirmation from its checkpoint.
    acceptedVisualPlanningInput: null,
    visualBlueprintConfirmationHash: null,
    visualSemanticPlan: null,
    visualPlanConfirmationHash: null,
    // end
    ...(source.planVersion === undefined || source.planVersion === null
      ? {}
      : { planVersion: source.planVersion }),
    ...(source.baseRevisionId === null ? {} : { currentRevisionId: source.baseRevisionId }),
  } as RunGraphInput;
}
// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
/** Server-only trusted continuation entry. Clear ALL prior channels before load-context, including old build tracking. */
export function buildVisualBlueprintGraphInput(source: RunGraphInputSource, accepted: AcceptedVisualPlanningInput,
  instruction: string, previous: Record<string, unknown>): RunGraphInput {
  if (source.planVersion !== VISUAL_RUN_PLAN_VERSION || source.mode !== "build" || !source.baseRevisionId) throw new Error("VISUAL_BLUEPRINT_INPUT_INVALID");
  const cleared = Object.fromEntries(Object.keys(previous).map(key => [key, undefined]));
  return { ...cleared, ...buildRunGraphInput(source, instruction, "design-planning"), generationWorkflow: "creative-v2",
    acceptedVisualPlanningInput: validateAcceptedVisualPlanningInput(accepted) };
}
// end
// end
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
/** Independent engineering Run: restore only the signed blueprint and accepted visual input. */
export function buildVisualEngineeringGraphInput(source: RunGraphInputSource,
  snapshot: import("@kf/contracts").VisualEngineeringContinuation, previous: Record<string, unknown>): RunGraphInput {
  const content = snapshot.content; const review = content.blueprintReview.content;
  if (source.runId !== content.runId || source.tenantId !== content.tenantId || source.workspaceId !== content.workspaceId
    || source.conversationId !== content.conversationId || source.requestedByUserId !== content.requestedByUserId
    || source.baseRevisionId !== content.baseRevisionId) throw new Error("VISUAL_ENGINEERING_IDENTITY_MISMATCH");
  return { ...buildVisualBlueprintGraphInput(source, content.accepted, review.blueprintReceipt, previous), stage: "design-review",
    designPlan: review.blueprint, designRevision: review.revision, designPlanHash: review.designPlanHash,
    visualBlueprintConfirmationHash: content.accepted.confirmationHash };
}
// end
