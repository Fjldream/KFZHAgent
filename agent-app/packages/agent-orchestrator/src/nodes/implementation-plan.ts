import { createHash } from "node:crypto";
import type { ChangePlan, DesignPlan, UIImplementationSpec } from "@kf/contracts";
import { planHash, stableStringify } from "@kf/domain-client";
import type { SolutionGraphDeps } from "../ports.js";
import { GraphPlanSchema } from "../schemas/change-plan.js";
import type { AgentGraphStateValue, AgentGraphUpdate } from "../state.js";

const MAX_REJECTION_DETAIL = 500;

/**
 * 将确认的客户蓝图转换为受控的用户意图界面，并将所有KF操作委托给确定的领域编译器。
 */
export function createImplementationPlanNode(deps: SolutionGraphDeps) {
  return async (state: AgentGraphStateValue): Promise<AgentGraphUpdate> => {
    if (state.designPlan === undefined || state.designPlanHash === undefined) {
      return { stage: "idle", lastErrorCode: "DESIGN_NOT_CONFIRMED" };
    }
    if (state.currentRevisionId === undefined) {
      return { stage: "idle", lastErrorCode: "IMPLEMENTATION_BASE_REVISION_REQUIRED" };
    }
    if (deps.uiImplementationCompiler === undefined) {
      return { stage: "idle", lastErrorCode: "IMPLEMENTATION_COMPILER_NOT_CONFIGURED" };
    }
    if (deps.serverPlanSigner === undefined) {
      return { stage: "idle", lastErrorCode: "SERVER_PLAN_SIGNER_NOT_CONFIGURED" };
    }
    let acceptedBlueprintArtifact = state.acceptedBlueprintArtifact;
    const moduleReadyBlueprint = state.designPlan.schema === "kf-design-plan/v2"
      && state.designPlan.modules.every((module) => module.expectedKind !== undefined)
      ? state.designPlan
      : undefined;
    if (moduleReadyBlueprint !== undefined) {
      if (deps.acceptedBlueprintConfirmation === undefined) {
        return { stage: "idle", lastErrorCode: "ACCEPTED_BLUEPRINT_CONFIRMATION_NOT_CONFIGURED" };
      }
      try {
        acceptedBlueprintArtifact = await deps.acceptedBlueprintConfirmation.confirm({
          blueprint: moduleReadyBlueprint,
          projectKey: deps.defaultProjectKey ?? deps.defaultDomainKind ?? "kingclient",
          revisionId: state.currentRevisionId,
        });
      } catch (error) {
        return { stage: "idle", lastErrorCode: `ACCEPTED_BLUEPRINT_CONFIRMATION_FAILED:${errorDetail(error)}` };
      }
    }

    const editableEntities = await deps.workspaceQuery.getRevisionEntities({
      tenantId: state.tenantId,
      revisionId: state.currentRevisionId,
      workspaceId: state.workspaceId,
    });
    const baseContext = {
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
      uiImplementation: state.uiImplementation,
    };

    let candidate: UIImplementationSpec;
    try {
      candidate = state.uiImplementation === undefined
        ? await deps.modelPort.createUiImplementation(baseContext)
        : await deps.modelPort.reviseUiImplementation(baseContext);
      candidate = preservePriorComponents(state.uiImplementation, candidate);
    } catch (error) {
      return persistInvalidImplementation(deps, state, [errorDetail(error)]);
    }

    let compiled: Awaited<ReturnType<NonNullable<typeof deps.uiImplementationCompiler>["compile"]>>;
    let rejectionReasons = assessCoverage(state.designPlan, candidate);
    if (rejectionReasons.length === 0) {
      try {
        compiled = await deps.uiImplementationCompiler.compile({
          workspaceId: state.workspaceId,
          spec: candidate,
          ...(state.uiImplementation !== undefined ? { previousSpec: state.uiImplementation } : {}),
          editableEntities,
        });
        rejectionReasons = validateCompiledPlan(compiled.plan);
      } catch (error) {
        rejectionReasons = [errorDetail(error)];
      }
    }

    if (rejectionReasons.length > 0) {
      try {
        candidate = await deps.modelPort.reviseUiImplementation({
          ...baseContext,
          uiImplementation: candidate,
          implementationRejectionReasons: rejectionReasons,
        });
        candidate = preservePriorComponents(state.uiImplementation, candidate);
        const repairedCoverage = assessCoverage(state.designPlan, candidate);
        if (repairedCoverage.length > 0) {
          return persistInvalidImplementation(deps, state, repairedCoverage);
        }
        compiled = await deps.uiImplementationCompiler.compile({
          workspaceId: state.workspaceId,
          spec: candidate,
          ...(state.uiImplementation !== undefined ? { previousSpec: state.uiImplementation } : {}),
          editableEntities,
        });
        const repairedPlanIssues = validateCompiledPlan(compiled.plan);
        if (repairedPlanIssues.length > 0) {
          return persistInvalidImplementation(deps, state, repairedPlanIssues);
        }
      } catch (error) {
        return persistInvalidImplementation(deps, state, [errorDetail(error)]);
      }
    }

    const parsedPlan = GraphPlanSchema.safeParse(compiled!.plan);
    if (!parsedPlan.success) {
      return persistInvalidImplementation(
        deps,
        state,
        ["compiled ChangePlan failed schema validation"],
      );
    }
    const plan: ChangePlan = parsedPlan.data;
    const hash = planHash(plan);
    const existing = await deps.changePlanRepository.findOpenChangeRequest({
      tenantId: state.tenantId,
      workspaceId: state.workspaceId,
      conversationId: state.conversationId,
    });
    const changeRequestId = existing?.id ?? `cr:${state.workspaceId}:${state.conversationId}`;
    await deps.changePlanRepository.saveChangeRequest({
      id: changeRequestId,
      tenantId: state.tenantId,
      workspaceId: state.workspaceId,
      title: `变更请求 ${hash.slice(0, 8)}`,
      status: "OPEN",
    });
    const changePlanId = `plan:${state.workspaceId}:${hash}`;
    await deps.changePlanRepository.savePlan({
      id: changePlanId,
      tenantId: state.tenantId,
      workspaceId: state.workspaceId,
      changeRequestId,
      planHash: hash,
      plan: deps.serverPlanSigner.sign({
        plan,
        revisionId: state.currentRevisionId,
        semanticOperations: compiled!.semanticOperations ?? [],
      }),
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
      uiImplementation: candidate,
      uiImplementationHash: createHash("sha256").update(stableStringify(candidate)).digest("hex"),
      capabilityReport: compiled!.capabilityReport,
      ...(acceptedBlueprintArtifact === undefined ? {} : { acceptedBlueprintArtifact }),
      changePlanId,
      planHash: hash,
      activeChangeRequestId: changeRequestId,
      planSummary: summarizePlan(plan),
      diffArtifactId,
      previewArtifactId,
      stage: "approval",
      resumeAction: undefined,
      lastErrorCode: undefined,
    };
  };
}

/**
 * A revision is a partial intent update, not a replacement license. Until the
 * contract grows an explicit, confirmed delete operation, components omitted
 * by the model remain managed and are carried forward deterministically.
 */
function preservePriorComponents(
  previous: UIImplementationSpec | undefined,
  revised: UIImplementationSpec,
): UIImplementationSpec {
  if (previous === undefined) return revised;
  const revisedIds = new Set(
    revised.pages.flatMap((page) => page.components.map((component) => component.id)),
  );
  const pages = revised.pages.map((page) => ({ ...page, components: [...page.components] }));
  const pageById = new Map(pages.map((page) => [page.id, page]));
  for (const previousPage of previous.pages) {
    const omitted = previousPage.components.filter((component) => !revisedIds.has(component.id));
    if (omitted.length === 0) continue;
    const target = pageById.get(previousPage.id);
    if (target !== undefined) {
      target.components.push(...omitted);
    } else {
      const retainedPage = { ...previousPage, components: omitted };
      pages.push(retainedPage);
      pageById.set(retainedPage.id, retainedPage);
    }
  }
  return { ...revised, pages };
}

function assessCoverage(designPlan: DesignPlan, spec: UIImplementationSpec): string[] {
  if (designPlan.schema !== "kf-design-plan/v2") return [];
  const expected = new Set(designPlan.modules.map((module) => module.id));
  const represented = new Set<string>();
  const issues: string[] = [];
  for (const page of spec.pages) {
    for (const component of page.components) {
      if (component.sourceModuleId === undefined) {
        issues.push(`component ${component.id} has no sourceModuleId`);
      } else if (!expected.has(component.sourceModuleId)) {
        issues.push(`component ${component.id} references unknown blueprint module: ${component.sourceModuleId}`);
      } else {
        represented.add(component.sourceModuleId);
      }
    }
  }
  for (const module of designPlan.modules) {
    if (!represented.has(module.id)) issues.push(`missing blueprint module: ${module.id}`);
  }
  return issues.sort();
}

function validateCompiledPlan(plan: ChangePlan): string[] {
  if (plan.operations.length === 0) return ["compiled ChangePlan has no operations"];
  return [];
}

function invalid(reasons: string[]): AgentGraphUpdate {
  return {
    stage: "idle",
    lastErrorCode: `UI_IMPLEMENTATION_INVALID:${reasons.join("; ").slice(0, MAX_REJECTION_DETAIL)}`,
    resumeAction: undefined,
  };
}

async function persistInvalidImplementation(
  deps: SolutionGraphDeps,
  state: AgentGraphStateValue,
  reasons: string[],
): Promise<AgentGraphUpdate> {
  await deps.workspaceQuery.appendMessage({
    tenantId: state.tenantId,
    conversationId: state.conversationId,
    role: "assistant",
    content:
      "工程实施计划暂未生成：大模型返回的实施规格不完整或未通过工程约束。"
      + "已保留当前效果蓝图且没有写入工程；请点击蓝图下方的“重新生成工程实施计划”重试。",
  });
  return invalid(reasons);
}

function errorDetail(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, MAX_REJECTION_DETAIL);
}

function latestUserMessage(state: AgentGraphStateValue): string | undefined {
  for (let index = state.recentMessages.length - 1; index >= 0; index -= 1) {
    const message = state.recentMessages[index];
    if (message?.role === "user") return message.content;
  }
  return undefined;
}

function summarizePlan(plan: ChangePlan): string {
  const counts = new Map<string, number>();
  for (const operation of plan.operations) {
    counts.set(operation.op, (counts.get(operation.op) ?? 0) + 1);
  }
  const kinds = [...counts.entries()].map(([kind, count]) => `${kind}×${count}`).join("、");
  return `计划包含 ${plan.operations.length} 个操作（${kinds}）。`.slice(0, 500);
}
