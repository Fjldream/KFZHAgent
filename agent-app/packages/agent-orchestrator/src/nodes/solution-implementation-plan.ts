import {
  AssetRecordSchema,
  CapabilityCandidateBundleSchema,
  CustomerSolutionBlueprintSchema,
  SolutionImplementationPlanSchema,
  canonicalServerHash,
  type SolutionImplementationPlan,
} from "@kf/contracts";
import { assertSolutionPlanUsesCandidates } from "@kf/domain-client";
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { generatedStructureRetentionIssues, type GeneratedProjectStructure } from "@kf/contracts";
// end
import type { ModelPortContext } from "../model-port.js";
import type { SolutionGraphDeps } from "../ports.js";
import type { AgentGraphStateValue, AgentGraphUpdate } from "../state.js";
import { hasCurrentDesignPlanVersion } from "../design-plan-version.js";
// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { withStepMemo } from "../run-step-memo.js";
// end
// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { VISUAL_RUN_PLAN_VERSION, VisualSemanticPlanSchema, type AcceptedVisualPlanningInput } from "@kf/contracts";
import { validateAcceptedVisualPlanningInput, validateVisualSemanticBindings } from "@kf/domain-client";
// end

const MAX_REJECTION_REASONS = 20;
const MAX_REJECTION_REASON_LENGTH = 300;

interface PlanValidation {
  plan?: SolutionImplementationPlan;
  reasons: string[];
}

// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
function validatePlan(raw: unknown, candidates: NonNullable<AgentGraphStateValue["capabilityCandidates"]>, existing?: GeneratedProjectStructure): PlanValidation {
// end
  const parsed = SolutionImplementationPlanSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      reasons: parsed.error.issues.slice(0, MAX_REJECTION_REASONS).map((issue) =>
        `${issue.path.join(".") || "plan"}: ${issue.message}`.slice(0, MAX_REJECTION_REASON_LENGTH),
      ),
    };
  }
  try {
    assertSolutionPlanUsesCandidates(parsed.data, candidates);
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    if (existing) return { plan: parsed.data, reasons: generatedStructureRetentionIssues(parsed.data, existing) };
    // end
    return { plan: parsed.data, reasons: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : "candidate/reference validation failed";
    return { plan: parsed.data, reasons: [message.slice(0, MAX_REJECTION_REASON_LENGTH)] };
  }
}

function failure(attempt: 0 | 1): AgentGraphUpdate {
  return {
    solutionImplementationPlan: undefined,
    solutionImplementationPlanHash: undefined,
    solutionPlanRepairAttempt: attempt,
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    visualSemanticPlan: null,
    visualPlanConfirmationHash: null,
    // end
    stage: "idle",
    lastErrorCode: "INVALID_MODEL_OUTPUT",
  };
}

function dependencyFailure(): AgentGraphUpdate {
  return {
    solutionImplementationPlan: undefined,
    solutionImplementationPlanHash: undefined,
    solutionPlanRepairAttempt: undefined,
    stage: "idle",
    lastErrorCode: "SOLUTION_PLANNING_MODEL_NOT_CONFIGURED",
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    visualSemanticPlan: null,
    visualPlanConfirmationHash: null,
    // end
  };
}

/** Produces one semantic plan and permits at most one localized repair. */
export function createSolutionImplementationPlanNode(deps: SolutionGraphDeps) {
  const node = async (state: AgentGraphStateValue): Promise<AgentGraphUpdate> => {
    if (state.generationWorkflow !== "creative-v2") {
      return { ...failure(0), lastErrorCode: "SOLUTION_PLANNING_FAILED" };
    }
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    let acceptedVisual: AcceptedVisualPlanningInput | undefined;
    if (state.acceptedVisualPlanningInput != null || state.visualSemanticPlan != null || state.visualPlanConfirmationHash != null) {
      try {
        if (state.planVersion !== VISUAL_RUN_PLAN_VERSION) throw new Error("VISUAL_PROTOCOL_MISMATCH");
        acceptedVisual = validateAcceptedVisualPlanningInput(state.acceptedVisualPlanningInput);
      } catch {
        return { ...failure(0), lastErrorCode: "VISUAL_PLANNING_INPUT_INVALID" };
      }
      if (deps.modelPort.createVisualSolutionImplementationPlan === undefined) {
        return { ...failure(0), lastErrorCode: "VISUAL_PLANNING_MODEL_NOT_CONFIGURED" };
      }
    } else if (
      deps.modelPort.createSolutionImplementationPlan === undefined
      || deps.modelPort.reviseSolutionImplementationSubtree === undefined
    ) {
      return dependencyFailure();
    }
    // end
    const parsedBlueprint = CustomerSolutionBlueprintSchema.safeParse(state.designPlan);
    const parsedCandidates = CapabilityCandidateBundleSchema.safeParse(state.capabilityCandidates);
    if (!parsedBlueprint.success || !parsedCandidates.success) {
      return { ...failure(0), lastErrorCode: "SOLUTION_PLANNING_FAILED" };
    }
    const blueprint = parsedBlueprint.data;
    const candidates = parsedCandidates.data;
    if (
      !hasCurrentDesignPlanVersion(blueprint, state.designRevision, state.designPlanHash)
      || candidates.blueprintHash !== canonicalServerHash(blueprint)
      || state.capabilityCandidatesHash !== canonicalServerHash(candidates)
    ) {
      return { ...failure(0), lastErrorCode: "SOLUTION_PLANNING_FAILED" };
    }
    if (deps.assetCatalog === undefined) {
      return { ...failure(0), lastErrorCode: "SOLUTION_PLANNING_FAILED" };
    }
    let assets;
    try {
      assets = AssetRecordSchema.array().max(100).parse(await deps.assetCatalog.list({
        tenantId: state.tenantId,
        workspaceId: state.workspaceId,
      }));
    } catch {
      return { ...failure(0), lastErrorCode: "SOLUTION_PLANNING_FAILED" };
    }

    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    let projectKey: string | undefined;
    if (deps.workspaceQuery?.getRevisionProjectKey) {
      if (!state.currentRevisionId) return { ...failure(0), lastErrorCode: "SOLUTION_PROJECT_IDENTITY_INVALID" };
      try {
        projectKey = await deps.workspaceQuery.getRevisionProjectKey({ tenantId: state.tenantId, workspaceId: state.workspaceId,
          revisionId: state.currentRevisionId, domainKind: deps.defaultDomainKind ?? "kingclient",
          defaultProjectKey: deps.defaultProjectKey ?? deps.defaultDomainKind ?? "kingclient" });
      } catch { return { ...failure(0), lastErrorCode: "SOLUTION_PROJECT_IDENTITY_INVALID" }; }
    }
    const bindProject = (raw: unknown): unknown => projectKey !== undefined && raw !== null && typeof raw === "object" && !Array.isArray(raw)
      ? { ...raw, projectKey } : raw;
    let existingStructure: GeneratedProjectStructure | undefined;
    if (deps.workspaceQuery?.getGeneratedProjectStructure) {
      try {
        existingStructure = await deps.workspaceQuery.getGeneratedProjectStructure({ tenantId: state.tenantId,
          workspaceId: state.workspaceId, revisionId: state.currentRevisionId!,
          projectKey: projectKey ?? deps.defaultProjectKey ?? deps.defaultDomainKind ?? "kingclient", domainKind: deps.defaultDomainKind ?? "kingclient" });
      } catch (error) {
        // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
        const code = error instanceof Error && ["SOLUTION_EXISTING_CONTEXT_TOO_LARGE", "SOLUTION_EXISTING_CONTEXT_SENSITIVE", "VISUAL_EXISTING_CONTENT_RECONSENT_REQUIRED", "CREATIVE_GENERATED_NATIVE_NAME_REGENERATION_REQUIRED"].includes(error.message)
          ? error.message : "SOLUTION_EXISTING_CONTEXT_INVALID";
        // end
        return { ...failure(0), lastErrorCode: code };
      }
    }
    if (acceptedVisual && existingStructure) return { ...failure(0), lastErrorCode: "VISUAL_EXISTING_PROJECT_EDIT_NOT_ENABLED" };
    // end
    const baseContext: ModelPortContext = {
      tenantId: state.tenantId,
      userId: state.userId,
      workspaceId: state.workspaceId,
      conversationId: state.conversationId,
      generationWorkflow: "creative-v2",
      recentMessages: state.recentMessages,
      conversationSummary: state.conversationSummary,
      revisionSummary: state.revisionSummary,
      currentRevisionId: state.currentRevisionId,
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      currentProjectKey: projectKey ?? deps.defaultProjectKey ?? deps.defaultDomainKind ?? "kingclient",
      ...(existingStructure ? { existingGeneratedStructure: existingStructure } : {}),
      // end
      requirementText: latestUserMessage(state),
      confirmedSolutionBlueprint: blueprint,
      capabilityCandidates: candidates,
      assetCatalog: assets,
    };

    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    if (acceptedVisual !== undefined) {
      try {
        const visualPlan = VisualSemanticPlanSchema.parse(await deps.modelPort.createVisualSolutionImplementationPlan!({
          ...baseContext, visualReference: acceptedVisual.reference,
        }));
        // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
        // Only server-owned metadata is bound here; semantic nodes/content/actions stay exactly as validated.
        visualPlan.plan = SolutionImplementationPlanSchema.parse(bindProject(visualPlan.plan));
        // end
        assertSolutionPlanUsesCandidates(visualPlan.plan, candidates);
        // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
        validateVisualSemanticBindings(acceptedVisual.reference, visualPlan.plan, visualPlan.bindings, blueprint);
        // end
        return { ...success(visualPlan.plan, 0), visualSemanticPlan: visualPlan, visualPlanConfirmationHash: acceptedVisual.confirmationHash };
      // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
      } catch (error) {
        // Visual output is never silently repaired by the text port or downgraded to text generation.
        if (error instanceof Error && ["VISUAL_SEMANTIC_CONTEXT_TOO_LARGE", "VISUAL_SEMANTIC_REPAIR_CONTEXT_TOO_LARGE"].includes(error.message)) {
          return { ...failure(0), lastErrorCode: error.message };
        }
        return failure(0);
      }
      // end
    }
    // end

    let initial: PlanValidation;
    try {
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      initial = validatePlan(bindProject(await deps.modelPort.createSolutionImplementationPlan(baseContext)), candidates, existingStructure);
      // end
    } catch {
      return failure(0);
    }
    if (initial.reasons.length === 0 && initial.plan !== undefined) {
      return success(initial.plan, 0);
    }
    let repaired: PlanValidation;
    try {
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      repaired = validatePlan(bindProject(await deps.modelPort.reviseSolutionImplementationSubtree({
        ...baseContext,
        ...(initial.plan === undefined ? {} : { previousSolutionImplementationPlan: initial.plan }),
        solutionPlanRejectionReasons: initial.reasons.slice(0, MAX_REJECTION_REASONS),
      })), candidates, existingStructure);
      // end
    } catch {
      return failure(1);
    }
    return repaired.reasons.length === 0 && repaired.plan !== undefined
      ? success(repaired.plan, 1)
      : failure(1);
  };
  // modified by jinlong.feng at 2026-10-20 Agent工作台迭代
  // 只在有 run 且注入了 memo 时启用：命中已完成输出则跳过模型调用，旧调用行为不变。
  return withStepMemo("solution-implementation-plan", node, { resolveMemo: deps.resolveRunStepMemo }, (state) => ({
    designPlanHash: state.designPlanHash,
    capabilityCandidatesHash: state.capabilityCandidatesHash,
    designRevision: state.designRevision,
    currentRevisionId: state.currentRevisionId,
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    // The immutable revision binds full semantic input; bump this policy whenever projection/retention changes.
    ...(state.acceptedVisualPlanningInput == null && state.visualSemanticPlan == null && state.visualPlanConfirmationHash == null
      ? { generatedStructureRetentionPolicy: "kf-generated-project-structure/v2" } : {}),
    // end
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    ...(state.acceptedVisualPlanningInput != null ? { acceptedVisualPlanningInput: state.acceptedVisualPlanningInput }
      : state.visualSemanticPlan != null || state.visualPlanConfirmationHash != null
        ? { visualSemanticPlan: state.visualSemanticPlan, visualPlanConfirmationHash: state.visualPlanConfirmationHash } : {}),
    // end
  }));
  // end
}

function success(plan: SolutionImplementationPlan, attempt: 0 | 1): AgentGraphUpdate {
  return {
    solutionImplementationPlan: plan,
    solutionImplementationPlanHash: canonicalServerHash(plan),
    solutionPlanRepairAttempt: attempt,
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    visualSemanticPlan: null,
    visualPlanConfirmationHash: null,
    // end
    stage: "solution-plan-ready",
    lastErrorCode: undefined,
  };
}

function latestUserMessage(state: AgentGraphStateValue): string | undefined {
  for (let index = state.recentMessages.length - 1; index >= 0; index -= 1) {
    const message = state.recentMessages[index];
    if (message?.role === "user") return message.content;
  }
  return undefined;
}
