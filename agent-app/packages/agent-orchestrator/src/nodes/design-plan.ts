import {
  CustomerEffectBlueprintSchema,
  CustomerSolutionBlueprintSchema,
} from "@kf/contracts";
import type { AgentGraphStateValue, AgentGraphUpdate } from "../state.js";
import type { SolutionGraphDeps } from "../ports.js";
import { assessBlueprintRevision } from "../blueprint-quality.js";
import { encodeBlueprintMessage } from "../blueprint-message.js";
import { hashDesignPlan } from "../design-plan-version.js";

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
  return async (state: AgentGraphStateValue): Promise<AgentGraphUpdate> => {
    const revisingConfirmedCreativeBlueprint =
      state.generationWorkflow === "creative-v2"
      && state.designPlan?.schema === "kf-design-plan/v3"
      && state.designPlanHash !== undefined
      && (state.revising === true
        || state.intent === "NEW_REQUIREMENT"
        || state.intent === "MODIFY_REQUIREMENT"
        || state.intent === "REVISE_DESIGN");
    const revising = state.revising === true || state.intent === "REVISE_DESIGN" || revisingConfirmedCreativeBlueprint;
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
      recentMessages: state.recentMessages,
      requirementText: latestUserMessage(state),
      revisionSummary: state.revisionSummary,
      designPlan: state.designPlan,
      ...(modulePlanningCatalog === undefined ? {} : { modulePlanningCatalog }),
      // editableEntities may not be materialised on state yet; the context
      // field stays optional so a future wiring can feed it through.
      editableEntities,
    };
    let rawPlan: unknown;
    let modelCallFailed = false;
    try {
      rawPlan = await deps.modelPort.createDesignPlan(modelInput, { revising });
    } catch {
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
        // I1: never persist or hash garbage from the model. A first blueprint
        // gets one repair attempt, then safely returns without side effects.
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
}

/** The latest user turn, used as the requirement text for the model. */
function latestUserMessage(state: AgentGraphStateValue): string | undefined {
  for (let i = state.recentMessages.length - 1; i >= 0; i -= 1) {
    const message = state.recentMessages[i];
    if (message !== undefined && message.role === "user") return message.content;
  }
  return undefined;
}
