import {
  CapabilityCandidateBundleSchema,
  CustomerSolutionBlueprintSchema,
  SolutionImplementationPlanSchema,
  canonicalChangePlanHash,
  canonicalServerHash,
  internalChangePlanSchema,
} from "@kf/contracts";
import type { CreativeCompilationDiagnostic, SolutionGraphDeps } from "../ports.js";
import type { AgentGraphStateValue, AgentGraphUpdate } from "../state.js";

const MAX_DIAGNOSTICS = 10;
const MAX_DIAGNOSTIC_DETAIL = 500;
const MAX_MESSAGE_DIAGNOSTICS = 3;

/** Compiles a confirmed creative solution and persists its complete signed server envelope. */
export function createCompileCreativeSolutionNode(deps: SolutionGraphDeps) {
  return async (state: AgentGraphStateValue): Promise<AgentGraphUpdate> => {
    if (deps.creativeSolutionCompiler === undefined) {
      return fail(deps, state, "CREATIVE_SOLUTION_COMPILER_NOT_CONFIGURED", []);
    }
    if (state.generationWorkflow !== "creative-v2" || state.currentRevisionId === undefined) {
      return fail(deps, state, "CREATIVE_SOLUTION_INPUT_INVALID", []);
    }
    const parsedBlueprint = CustomerSolutionBlueprintSchema.safeParse(state.designPlan);
    const parsedCandidates = CapabilityCandidateBundleSchema.safeParse(state.capabilityCandidates);
    const parsedSemanticPlan = SolutionImplementationPlanSchema.safeParse(state.solutionImplementationPlan);
    if (!parsedBlueprint.success || !parsedCandidates.success || !parsedSemanticPlan.success
      || !isHash(state.designPlanHash)
      || state.capabilityCandidatesHash !== canonicalServerHash(parsedCandidates.data)
      || state.solutionImplementationPlanHash !== canonicalServerHash(parsedSemanticPlan.data)
      || parsedCandidates.data.blueprintHash !== canonicalServerHash(parsedBlueprint.data)
      || parsedSemanticPlan.data.blueprintHash !== canonicalServerHash(parsedBlueprint.data)
      || parsedSemanticPlan.data.candidateBundleHash !== canonicalServerHash(parsedCandidates.data)) {
      return fail(deps, state, "CREATIVE_SOLUTION_INPUT_INVALID", []);
    }

    let editableEntities;
    try {
      editableEntities = await deps.workspaceQuery.getRevisionEntities({
        tenantId: state.tenantId,
        revisionId: state.currentRevisionId,
        workspaceId: state.workspaceId,
      });
    } catch {
      return fail(deps, state, "CREATIVE_SOLUTION_EVIDENCE_UNAVAILABLE", []);
    }

    let outcome;
    try {
      outcome = await deps.creativeSolutionCompiler.compile({
        tenantId: state.tenantId,
        workspaceId: state.workspaceId,
        baseRevisionId: state.currentRevisionId,
        blueprint: parsedBlueprint.data,
        candidateBundle: parsedCandidates.data,
        semanticPlan: parsedSemanticPlan.data,
        editableEntities,
      });
    } catch {
      return fail(deps, state, "CREATIVE_SOLUTION_COMPILATION_FAILED", []);
    }
    if (outcome.status === "blocked") {
      return fail(deps, state, "CREATIVE_SOLUTION_BLOCKED", outcome.diagnostics);
    }
    if (outcome.capabilityReport.status === "fail") {
      return fail(deps, state, "CREATIVE_SOLUTION_OUTPUT_INVALID", []);
    }

    const parsedPlan = internalChangePlanSchema.safeParse(outcome.plan);
    if (!parsedPlan.success || parsedPlan.data.workspaceId !== state.workspaceId) {
      return fail(deps, state, "CREATIVE_SOLUTION_OUTPUT_INVALID", []);
    }
    const plan = parsedPlan.data;
    const creative = plan.creative;
    if (creative === undefined) {
      return fail(deps, state, "CREATIVE_SOLUTION_OUTPUT_INVALID", []);
    }
    const planHash = canonicalChangePlanHash(plan);
    const envelope = outcome.signedPlan;
    let envelopePlanHash: string | undefined;
    try {
      envelopePlanHash = canonicalChangePlanHash(envelope.plan);
    } catch {
      return fail(deps, state, "CREATIVE_SOLUTION_OUTPUT_INVALID", []);
    }
    if (envelope.schema !== "kf-server-plan-envelope/v1"
      || envelope.revisionId !== state.currentRevisionId
      || envelope.planHash !== planHash
      || envelopePlanHash !== planHash
      || envelope.plan.creative?.artifactHash !== creative.artifactHash
      || envelope.plan.creative.materializationHash !== creative.materializationHash
      || envelope.creativeArtifact === undefined
      || envelope.trustedNativeMaterialization === undefined
      || envelope.creativeArtifactHash !== creative.artifactHash
      || envelope.nativeMaterializationHash !== creative.materializationHash) {
      return fail(deps, state, "CREATIVE_SOLUTION_OUTPUT_INVALID", []);
    }

    let changeRequestId: string;
    const changePlanId = `plan:${state.workspaceId}:${planHash}`;
    try {
      const existing = await deps.changePlanRepository.findOpenChangeRequest({
        tenantId: state.tenantId,
        workspaceId: state.workspaceId,
        conversationId: state.conversationId,
      });
      changeRequestId = existing?.id ?? `cr:${state.workspaceId}:${state.conversationId}`;
      await deps.changePlanRepository.saveChangeRequest({
        id: changeRequestId,
        tenantId: state.tenantId,
        workspaceId: state.workspaceId,
        title: `工程生成 ${planHash.slice(0, 8)}`,
        status: "OPEN",
      });
      await deps.changePlanRepository.savePlan({
        id: changePlanId,
        tenantId: state.tenantId,
        workspaceId: state.workspaceId,
        changeRequestId,
        planHash,
        plan: envelope,
      });
    } catch {
      return fail(deps, state, "CREATIVE_SOLUTION_PERSIST_FAILED", []);
    }

    return {
      activeChangeRequestId: changeRequestId,
      changePlanId,
      planHash,
      planSummary: `工程生成包含 ${plan.operations.length} 个已签名操作。`.slice(0, 500),
      capabilityReport: outcome.capabilityReport,
      buildJobId: undefined,
      diffArtifactId: undefined,
      previewArtifactId: undefined,
      stage: "building",
      buildAuthorization: "creative-solution",
      resumeAction: undefined,
      lastErrorCode: undefined,
    };
  };
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function boundedDiagnostics(diagnostics: readonly CreativeCompilationDiagnostic[]): string {
  return diagnostics.slice(0, MAX_DIAGNOSTICS).map((diagnostic) => {
    const location = [diagnostic.phase, diagnostic.nodeId].filter(Boolean).join("/");
    const alternatives = diagnostic.alternatives?.slice(0, 5).join(",");
    return `${diagnostic.code}${location === "" ? "" : `@${location}`}: ${diagnostic.message.slice(0, 240)}`
      + (alternatives === undefined || alternatives === "" ? "" : `；可选：${alternatives}`);
  }).join(" | ").replace(/\p{Cc}/gu, " ").slice(0, MAX_DIAGNOSTIC_DETAIL);
}

async function fail(
  deps: SolutionGraphDeps,
  state: AgentGraphStateValue,
  code: string,
  diagnostics: readonly CreativeCompilationDiagnostic[],
): Promise<AgentGraphUpdate> {
  const detail = boundedDiagnostics(diagnostics);
  const customerDetails = diagnostics.slice(0, MAX_MESSAGE_DIAGNOSTICS).map((diagnostic) => {
    const alternatives = diagnostic.alternatives?.slice(0, 3).join("、");
    return `${diagnostic.nodeId}：${diagnostic.message.slice(0, 160)}`
      + (alternatives === undefined || alternatives === "" ? "" : `；可改用 ${alternatives}`);
  }).join("；");
  await deps.workspaceQuery.appendMessage({
    tenantId: state.tenantId,
    conversationId: state.conversationId,
    role: "assistant",
    content: customerDetails === ""
      ? "工程生成暂未完成，已保留确认的效果蓝图且不会降级到旧生成流程。请稍后重试或补齐所需工程能力。"
      : `工程生成暂未完成：${customerDetails.slice(0, 500)}。已保留确认的效果蓝图，请按提示调整后重试。`,
  }).catch(() => {});
  return {
    stage: "idle",
    lastErrorCode: detail === "" ? code : `${code}:${detail}`.slice(0, 600),
    buildAuthorization: undefined,
    resumeAction: undefined,
  };
}
