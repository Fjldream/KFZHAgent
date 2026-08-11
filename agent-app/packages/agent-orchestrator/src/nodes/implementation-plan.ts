import { createHash } from "node:crypto";
import type { ChangePlan, DesignPlan, UIImplementationSpec } from "@kf/contracts";
import { planHash, stableStringify } from "@kf/domain-client";
import type { SolutionGraphDeps } from "../ports.js";
import { GraphPlanSchema } from "../schemas/change-plan.js";
import type { AgentGraphStateValue, AgentGraphUpdate } from "../state.js";

const MAX_REJECTION_DETAIL = 500;

/**
 * Converts a confirmed customer blueprint into bounded UI intent and then
 * delegates all KF operations to the deterministic domain compiler.
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
    } catch (error) {
      return failure(error);
    }

    let compiled: Awaited<ReturnType<NonNullable<typeof deps.uiImplementationCompiler>["compile"]>>;
    let rejectionReasons = assessCoverage(state.designPlan, candidate);
    if (rejectionReasons.length === 0) {
      try {
        compiled = await deps.uiImplementationCompiler.compile({
          workspaceId: state.workspaceId,
          spec: candidate,
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
        const repairedCoverage = assessCoverage(state.designPlan, candidate);
        if (repairedCoverage.length > 0) return invalid(repairedCoverage);
        compiled = await deps.uiImplementationCompiler.compile({
          workspaceId: state.workspaceId,
          spec: candidate,
          editableEntities,
        });
        const repairedPlanIssues = validateCompiledPlan(compiled.plan);
        if (repairedPlanIssues.length > 0) return invalid(repairedPlanIssues);
      } catch (error) {
        return invalid([errorDetail(error)]);
      }
    }

    const parsedPlan = GraphPlanSchema.safeParse(compiled!.plan);
    if (!parsedPlan.success) return invalid(["compiled ChangePlan failed schema validation"]);
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
      uiImplementation: candidate,
      uiImplementationHash: createHash("sha256").update(stableStringify(candidate)).digest("hex"),
      capabilityReport: compiled!.capabilityReport,
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

function failure(error: unknown): AgentGraphUpdate {
  return invalid([errorDetail(error)]);
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
