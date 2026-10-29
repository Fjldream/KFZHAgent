import {
  CustomerEffectBlueprintSchema,
  CustomerSolutionBlueprintSchema,
} from "@kf/contracts";
import type { AgentGraphStateValue, AgentGraphUpdate } from "../state.js";
import type { SolutionGraphDeps } from "../ports.js";
// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { withStepMemo } from "../run-step-memo.js";
// end
import { assessBlueprintRevision } from "../blueprint-quality.js";
import { encodeBlueprintMessage } from "../blueprint-message.js";
import { hashDesignPlan } from "../design-plan-version.js";
// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { VISUAL_RUN_PLAN_VERSION, type AcceptedVisualPlanningInput } from "@kf/contracts";
import { validateAcceptedVisualPlanningInput } from "@kf/domain-client";

const clearVisualEngineering: AgentGraphUpdate = {
  visualBlueprintConfirmationHash: null, visualSemanticPlan: null, visualPlanConfirmationHash: null,
  capabilityCandidates: undefined, capabilityCandidatesHash: undefined, solutionImplementationPlan: undefined,
  solutionImplementationPlanHash: undefined, solutionPlanRepairAttempt: undefined, creativeConfirmationId: undefined,
  creativeProjectKey: undefined, creativeDomainKind: undefined, activeChangeRequestId: undefined, changePlanId: undefined,
  planHash: undefined, planSummary: undefined, capabilityReport: undefined, buildJobId: undefined, buildAuthorization: undefined,
  diffArtifactId: undefined, previewArtifactId: undefined,
};
const rejectVisualBlueprint = (code: string): AgentGraphUpdate => ({ ...clearVisualEngineering, stage: "idle", lastErrorCode: code,
  designPlan: undefined, designPlanHash: undefined, revising: undefined });
const visualBlueprintStopCodes = new Set(["IMAGE_EGRESS_NOT_ALLOWED", "VISUAL_RUN_REQUIRED", "VISUAL_RUN_NOT_ACTIVE",
  "VISUAL_BLUEPRINT_CREDENTIAL_ROUTE_MISMATCH",
  "VISUAL_BLUEPRINT_CONFIG_REQUIRED", "VISUAL_BLUEPRINT_CONFIG_CHANGED", "VISUAL_BLUEPRINT_CONFIG_INVALID",
  "VISUAL_BLUEPRINT_CONTEXT_MISMATCH", "VISUAL_BLUEPRINT_CONTEXT_TOO_LARGE", "VISUAL_BLUEPRINT_CACHE_INVALID",
  "VISUAL_BLUEPRINT_IN_PROGRESS", "VISUAL_BLUEPRINT_STALE", "VISUAL_ANALYSIS_STALE", "VISUAL_REFERENCE_INPUT_CHANGED",
  "VISUAL_CONTINUATION_INTEGRITY_FAILED", "STALE_BASE_REVISION", "MODEL_CANCELLED", "MODEL_TIMEOUT", "MODEL_AUTH_ERROR",
  "MODEL_QUOTA_ERROR", "MODEL_RATE_LIMIT", "MODEL_TRANSIENT", "MODEL_PROTOCOL_ERROR", "MODEL_CAPABILITY_UNSUPPORTED"]);
// end

/**
 * Generates or revises a DesignPlan (spec §5.3) and hands it back to the user:
 *   - `ModelPort.createDesignPlan(context, { revising })` is called with the
 *     bounded model context; `revising` is true for a REVISE_DESIGN turn so
 *     the model amends the previous plan instead of starting fresh,
 *   - `designPlanHash = sha256(canonical(designPlan))` is stored (a revision
 *     produces a new hash/version),
 *   - the plan is rendered as a bounded assistant message inside the
 *     conversation (greeting + title + sections + style + signature + a
 *     warm closing line inviting adjustments or a "确认" confirmation),
 *   - the node ends in the `design-review` stage where the user can confirm
 *     (CONFIRM_DESIGN → plan-change) or revise again (REVISE_DESIGN → this node).
 *
 * The revision number is carried on `designRevision` (a state channel), NOT as
 * a `revision` field on the plan itself: `DesignPlanSchema` is a strict shared
 * contract and would reject an unknown key, so the plan body stays verbatim
 * and the version lives next to it in state.
 */
export function createDesignPlanNode(deps: SolutionGraphDeps) {
  const node = async (state: AgentGraphStateValue): Promise<AgentGraphUpdate> => {
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    let acceptedVisual: AcceptedVisualPlanningInput | undefined;
    if (state.acceptedVisualPlanningInput != null || state.visualBlueprintConfirmationHash != null
      || state.visualSemanticPlan != null || state.visualPlanConfirmationHash != null) {
      try {
        if (state.planVersion !== VISUAL_RUN_PLAN_VERSION || state.generationWorkflow !== "creative-v2") throw new Error("protocol");
        acceptedVisual = validateAcceptedVisualPlanningInput(state.acceptedVisualPlanningInput);
      } catch { return rejectVisualBlueprint("VISUAL_PLANNING_INPUT_INVALID"); }
      if (!deps.modelPort.createVisualDesignPlan) return rejectVisualBlueprint("VISUAL_BLUEPRINT_MODEL_NOT_CONFIGURED");
    }
    // end
    const revisingConfirmedCreativeBlueprint =
      acceptedVisual === undefined && state.generationWorkflow === "creative-v2"
      && state.designPlan?.schema === "kf-design-plan/v3"
      && state.designPlanHash !== undefined
      && (state.revising === true
        || state.intent === "NEW_REQUIREMENT"
        || state.intent === "MODIFY_REQUIREMENT"
        || state.intent === "REVISE_DESIGN");
    const revising = acceptedVisual === undefined && (state.revising === true || state.intent === "REVISE_DESIGN" || revisingConfirmedCreativeBlueprint);
    let modulePlanningCatalog;
    let editableEntities = (state as { editableEntities?: import("../ports.js").EditableEntity[] }).editableEntities;
    if (state.generationWorkflow === "module-v1" && state.workspaceMode !== "upload") {
      if (deps.modulePlanCompiler === undefined) {
        return { stage: "idle", lastErrorCode: "MODULE_PLANNING_FAILED" };
      }
      try {
        modulePlanningCatalog = await deps.modulePlanCompiler.listPlanningCatalog();
        if (state.currentRevisionId !== undefined) {
          editableEntities = await deps.workspaceQuery.getRevisionEntities({
            tenantId: state.tenantId,
            workspaceId: state.workspaceId,
            revisionId: state.currentRevisionId,
          });
        }
      } catch {
        return { stage: "idle", lastErrorCode: "MODULE_PLANNING_FAILED" };
      }
    }
    const modelInput = {
      tenantId: state.tenantId,
      userId: state.userId,
      workspaceId: state.workspaceId,
      conversationId: state.conversationId,
      generationWorkflow: state.generationWorkflow,
      // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
      recentMessages: acceptedVisual === undefined ? state.recentMessages : [{ role: "user" as const, content: latestUserMessage(state) ?? "" }],
      // end
      requirementText: latestUserMessage(state),
      // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
      revisionSummary: acceptedVisual === undefined ? state.revisionSummary : undefined,
      designPlan: acceptedVisual === undefined ? state.designPlan : undefined,
      ...(acceptedVisual === undefined ? {} : { visualReference: acceptedVisual.reference, currentRevisionId: state.currentRevisionId }),
      // end
      ...(modulePlanningCatalog === undefined ? {} : { modulePlanningCatalog }),
      // editableEntities 在状态尚未被材料化时可能不被材料化；上下文字段保持可选，因此未来可以将它通过喂食。
      editableEntities,
    };
    let rawPlan: unknown;
    let modelCallFailed = false;
    try {
      // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
      rawPlan = acceptedVisual === undefined ? await deps.modelPort.createDesignPlan(modelInput, { revising })
        : await deps.modelPort.createVisualDesignPlan!(modelInput);
      // end
    } catch (error) {
      // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
      if (acceptedVisual !== undefined) return rejectVisualBlueprint(error instanceof Error && visualBlueprintStopCodes.has(error.message)
        ? error.message : "INVALID_MODEL_OUTPUT");
      // end
      modelCallFailed = true;
    }
    const parseDesignPlan = (value: unknown) => state.generationWorkflow === "creative-v2"
      ? CustomerSolutionBlueprintSchema.safeParse(value)
      : CustomerEffectBlueprintSchema.safeParse(value);
    let parsed = parseDesignPlan(rawPlan);
    let rejectionReasons = modelCallFailed
      ? ["模型未返回完整客户效果蓝图"]
      : parsed.success
        ? []
        : ["候选蓝图不符合完整客户效果蓝图结构"];
    if (
      parsed.success
      && parsed.data.schema === "kf-design-plan/v2"
      && revising
      && state.designPlan?.schema === "kf-design-plan/v2"
    ) {
      rejectionReasons = assessBlueprintRevision(state.designPlan, parsed.data);
    }

    if (rejectionReasons.length > 0) {
      // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
      if (acceptedVisual !== undefined) return rejectVisualBlueprint("INVALID_MODEL_OUTPUT");
      // end
      let retried: unknown;
      modelCallFailed = false;
      try {
        retried = await deps.modelPort.createDesignPlan(modelInput, {
          revising,
          rejectionReasons,
        });
      } catch {
        modelCallFailed = true;
      }
      parsed = parseDesignPlan(retried);
      rejectionReasons = modelCallFailed
        ? ["模型未返回完整客户效果蓝图"]
        : parsed.success
          ? parsed.data.schema === "kf-design-plan/v2" && revising && state.designPlan?.schema === "kf-design-plan/v2"
            ? assessBlueprintRevision(state.designPlan, parsed.data)
            : []
          : ["候选蓝图不符合完整客户效果蓝图结构"];
    }

    if (!parsed.success || rejectionReasons.length > 0) {
      if (!revising || state.designPlan === undefined) {
        // 1: 从模型中永远不要持久化或哈希垃圾。一个初始蓝图只进行一次修复尝试，然后安全地返回，不会产生副作用。
        return { stage: "idle", lastErrorCode: "INVALID_MODEL_OUTPUT" };
      }
      await deps.workspaceQuery.appendMessage({
        tenantId: state.tenantId,
        conversationId: state.conversationId,
        role: "assistant",
        content:
          "抱歉，您刚才提出的修改还没有充分体现到新蓝图中，因此我保留了上一版有效方案，没有进入工程计划。请再补充一下希望新增或调整的具体内容，我会继续为您完善。",
      });
      return {
        stage: "design-review",
        revising: undefined,
        lastErrorCode: "DESIGN_REVISION_NOT_APPLIED",
      };
    }
    const plan = parsed.data;
    const revision = (state.designRevision ?? 0) + 1;
    const hash = hashDesignPlan(plan, revision);
    const rendered = encodeBlueprintMessage(plan, revision, hash);
    await deps.workspaceQuery.appendMessage({
      tenantId: state.tenantId,
      conversationId: state.conversationId,
      role: "assistant",
      content: rendered,
    });
    return {
      // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
      ...(acceptedVisual === undefined ? {} : { ...clearVisualEngineering, visualBlueprintConfirmationHash: acceptedVisual.confirmationHash }),
      // end
      designPlan: plan,
      designPlanHash: hash,
      designRevision: revision,
      stage: "design-review",
      revising: undefined,
      ...(revisingConfirmedCreativeBlueprint
        ? {
            capabilityCandidates: undefined,
            capabilityCandidatesHash: undefined,
            solutionImplementationPlan: undefined,
            solutionImplementationPlanHash: undefined,
            solutionPlanRepairAttempt: undefined,
            creativeConfirmationId: undefined,
            creativeProjectKey: undefined,
            creativeDomainKind: undefined,
            activeChangeRequestId: undefined,
            changePlanId: undefined,
            planHash: undefined,
            planSummary: undefined,
            capabilityReport: undefined,
            buildJobId: undefined,
            buildAuthorization: undefined,
            diffArtifactId: undefined,
            previewArtifactId: undefined,
          }
        : {}),
      // 设计计划成功生成后清除历史错误码，避免残留 INVALID_MODEL_OUTPUT
      // 阻断后续进入审批/构建流程。
      lastErrorCode: undefined,
    };
  };
  // modified by jinlong.feng at 2026-10-20 Agent工作台迭代
  // 蓝图是最贵的模型调用之一：同一 run 下输入未变时直接复用已完成输出。
  return withStepMemo("design-plan", node, { resolveMemo: deps.resolveRunStepMemo }, (state) => ({
    designRevision: state.designRevision,
    currentRevisionId: state.currentRevisionId,
    requirement: latestUserMessage(state),
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    ...(state.acceptedVisualPlanningInput != null ? { acceptedVisualPlanningInput: state.acceptedVisualPlanningInput }
      : state.visualBlueprintConfirmationHash != null || state.visualSemanticPlan != null || state.visualPlanConfirmationHash != null
        ? { visualBlueprintConfirmationHash: state.visualBlueprintConfirmationHash, visualSemanticPlan: state.visualSemanticPlan,
          visualPlanConfirmationHash: state.visualPlanConfirmationHash } : {}),
    // end
  }));
  // end
}

/** 最新用户回合，作为模型的需要文本。 */
function latestUserMessage(state: AgentGraphStateValue): string | undefined {
  for (let i = state.recentMessages.length - 1; i >= 0; i -= 1) {
    const message = state.recentMessages[i];
    if (message !== undefined && message.role === "user") return message.content;
  }
  return undefined;
}
