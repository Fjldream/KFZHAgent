import {
  AssetRecordSchema,
  CapabilityCandidateBundleSchema,
  CustomerSolutionBlueprintSchema,
  SolutionImplementationPlanSchema,
  canonicalServerHash,
  type SolutionImplementationPlan,
} from "@kf/contracts";
import { assertSolutionPlanUsesCandidates } from "@kf/domain-client";
import type { ModelPortContext } from "../model-port.js";
import type { SolutionGraphDeps } from "../ports.js";
import type { AgentGraphStateValue, AgentGraphUpdate } from "../state.js";

const MAX_REJECTION_REASONS = 20;
const MAX_REJECTION_REASON_LENGTH = 300;

interface PlanValidation {
  plan?: SolutionImplementationPlan;
  reasons: string[];
}

function validatePlan(raw: unknown, candidates: NonNullable<AgentGraphStateValue["capabilityCandidates"]>): PlanValidation {
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
  };
}

/** Produces one semantic plan and permits at most one localized repair. */
export function createSolutionImplementationPlanNode(deps: SolutionGraphDeps) {
  return async (state: AgentGraphStateValue): Promise<AgentGraphUpdate> => {
    if (state.generationWorkflow !== "creative-v2") {
      return { ...failure(0), lastErrorCode: "SOLUTION_PLANNING_FAILED" };
    }
    if (
      deps.modelPort.createSolutionImplementationPlan === undefined
      || deps.modelPort.reviseSolutionImplementationSubtree === undefined
    ) {
      return dependencyFailure();
    }
    const parsedBlueprint = CustomerSolutionBlueprintSchema.safeParse(state.designPlan);
    const parsedCandidates = CapabilityCandidateBundleSchema.safeParse(state.capabilityCandidates);
    if (!parsedBlueprint.success || !parsedCandidates.success) {
      return { ...failure(0), lastErrorCode: "SOLUTION_PLANNING_FAILED" };
    }
    const blueprint = parsedBlueprint.data;
    const candidates = parsedCandidates.data;
    if (
      candidates.blueprintHash !== canonicalServerHash(blueprint)
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
      currentProjectKey: deps.defaultProjectKey ?? deps.defaultDomainKind ?? "kingclient",
      requirementText: latestUserMessage(state),
      confirmedSolutionBlueprint: blueprint,
      capabilityCandidates: candidates,
      assetCatalog: assets,
    };

    let initial: PlanValidation;
    try {
      initial = validatePlan(await deps.modelPort.createSolutionImplementationPlan(baseContext), candidates);
    } catch {
      return failure(0);
    }
    if (initial.reasons.length === 0 && initial.plan !== undefined) {
      return success(initial.plan, 0);
    }
    let repaired: PlanValidation;
    try {
      repaired = validatePlan(await deps.modelPort.reviseSolutionImplementationSubtree({
        ...baseContext,
        ...(initial.plan === undefined ? {} : { previousSolutionImplementationPlan: initial.plan }),
        solutionPlanRejectionReasons: initial.reasons.slice(0, MAX_REJECTION_REASONS),
      }), candidates);
    } catch {
      return failure(1);
    }
    return repaired.reasons.length === 0 && repaired.plan !== undefined
      ? success(repaired.plan, 1)
      : failure(1);
  };
}

function success(plan: SolutionImplementationPlan, attempt: 0 | 1): AgentGraphUpdate {
  return {
    solutionImplementationPlan: plan,
    solutionImplementationPlanHash: canonicalServerHash(plan),
    solutionPlanRepairAttempt: attempt,
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
