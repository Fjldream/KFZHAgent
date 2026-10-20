import { planHash } from "@kf/domain-client";
import type { ChangePlan } from "@kf/contracts";
import type { AgentGraphStateValue, AgentGraphUpdate } from "../state.js";
import type { SolutionGraphDeps } from "../ports.js";
import { GraphPlanSchema } from "../schemas/change-plan.js";
import { ProjectDesignSchema } from "../schemas/project-design.js";

/**
 * 为当前需求生成变更计划（简要步骤 4/5）：
 *   - 全新的工作空间（没有当前修订）会获得初始项目设计，而不是计划，并且绝不会进入审批/构建路径；
 *   - MODIFY_REQUIREMENT 或规划阶段重试会调用 reviseChangePlan，否则使用 createChangePlan；
 *   - 使用确定性 ID 持久化计划（重复执行具有幂等性）；
 *   - planHash 根据规范化后的标准计划计算；
 *   - 节点结束于 `approval` 阶段，审批中断在此等待。
 *
 * 持久化副作用具有幂等性：确定性的 changeRequestId / changePlanId 使重复执行收敛，而不会产生重复记录。
 */
export function createPlanChangeNode(deps: SolutionGraphDeps) {
  return async (state: AgentGraphStateValue): Promise<AgentGraphUpdate> => {
    // 设计流程防护（规范 §5.4）：确认设计方案时，必须存在可供后续规划依据的已确认方案。CONFIRM_DESIGN 只能从设计循环路由到 plan-change（design-plan 节点已设置 designPlanHash 和 stage=design-review），因此此防护仅适用于该入口：确认一个从未生成的方案属于图完整性违规，节点会拒绝处理，而不是虚构控制方案。旧入口路径（NEW_REQUIREMENT / MODIFY_REQUIREMENT / 审批节点的 revise 恢复操作）尚不经过设计循环，因此保持原有行为；规范中的 NEW_REQUIREMENT → design-plan 重路由将在后续任务中实现。
    if (state.intent === "CONFIRM_DESIGN" && state.designPlanHash === undefined) {
      return { stage: "idle", lastErrorCode: "DESIGN_NOT_CONFIRMED" };
    }

    const editableEntities =
      state.currentRevisionId !== undefined
        ? await deps.workspaceQuery.getRevisionEntities({
            tenantId: state.tenantId,
            revisionId: state.currentRevisionId,
            workspaceId: state.workspaceId,
          })
        : undefined;
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
      editableEntities,
      designPlan: state.designPlan,
    };

    // 新工作空间：只创建设计初稿，不进行规划或构建。原始设计输出在被任何摘要副作用引用前，会依据 v1 SolutionIR schema 通过 zod 校验（I1）；无效的模型输出会携带 INVALID_MODEL_OUTPUT 返回 idle，而不是虚构“已创建设计初稿”的摘要。
    if (state.currentRevisionId === undefined) {
      const rawDesign: unknown = await deps.modelPort.createProjectDesign(modelContext);
      const parsedDesign = ProjectDesignSchema.safeParse(rawDesign);
      if (!parsedDesign.success) {
        return { stage: "idle", lastErrorCode: "INVALID_MODEL_OUTPUT" };
      }
      const design = parsedDesign.data;
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
    // Model output is validated against the canonical plan schema before any
    // durable side effect: an invalid plan returns to idle with a clear error
    // code and never reaches the approval/build path (brief Step 5 guard).
    const rawPlan: unknown = revising
      ? await deps.modelPort.reviseChangePlan(modelContext)
      : await deps.modelPort.createChangePlan(modelContext);
    const parsedPlan = GraphPlanSchema.safeParse(rawPlan);
    if (!parsedPlan.success) {
      return { stage: "idle", lastErrorCode: "INVALID_MODEL_OUTPUT", resumeAction: undefined };
    }
    const plan: ChangePlan = parsedPlan.data;
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
      // 计划成功生成后必须清除历史错误码（如之前失败的 INVALID_MODEL_OUTPUT），
      // 否则 approval 节点会因残留错误码拒绝进入审批中断。
      lastErrorCode: undefined,
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
