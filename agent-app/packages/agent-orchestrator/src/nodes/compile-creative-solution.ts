import {
  CapabilityCandidateBundleSchema,
  CustomerSolutionBlueprintSchema,
  SolutionImplementationPlanSchema,
  canonicalServerHash,
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

    let outcome;
    const domainKind = deps.defaultDomainKind ?? "kingclient";
    try {
      outcome = await deps.creativeSolutionCompiler.compile({
        tenantId: state.tenantId,
        workspaceId: state.workspaceId,
        conversationId: state.conversationId,
        baseRevisionId: state.currentRevisionId,
        projectKey: parsedSemanticPlan.data.projectKey,
        domainKind,
        blueprint: parsedBlueprint.data,
        candidateBundle: parsedCandidates.data,
        semanticPlan: parsedSemanticPlan.data,
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

    if (!isBoundedId(outcome.changeRequestId)
      || !isBoundedId(outcome.changePlanId)
      || !isHash(outcome.planHash)
      || !isHash(outcome.confirmationId)
      || outcome.projectKey !== parsedSemanticPlan.data.projectKey
      || outcome.domainKind !== domainKind
      || !Number.isInteger(outcome.operationCount)
      || outcome.operationCount < 0
      || outcome.operationCount > 10_000) {
      return fail(deps, state, "CREATIVE_SOLUTION_OUTPUT_INVALID", []);
    }

    return {
      activeChangeRequestId: outcome.changeRequestId,
      changePlanId: outcome.changePlanId,
      planHash: outcome.planHash,
      creativeConfirmationId: outcome.confirmationId,
      creativeProjectKey: outcome.projectKey,
      creativeDomainKind: outcome.domainKind,
      planSummary: `工程生成包含 ${outcome.operationCount} 个已签名操作。`.slice(0, 500),
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

function isBoundedId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 500 && !/\p{Cc}/u.test(value);
}

const CUSTOMER_DIAGNOSTIC_TEXT: Readonly<Record<string, string>> = Object.freeze({
  CREATIVE_BASE_REVISION_EVIDENCE_MISSING: "找不到当前工程版本的完整依据",
  CREATIVE_BASE_REVISION_EVIDENCE_AMBIGUOUS: "当前工程版本存在多个不一致的工程依据",
  CREATIVE_EVIDENCE_BUDGET_EXCEEDED: "当前工程规模超过单次安全处理范围",
  CREATIVE_EVIDENCE_CONCURRENCY_EXCEEDED: "工程依据正在处理中",
  CREATIVE_EDITABLE_ENTITY_AMBIGUOUS: "当前工程存在重名实体，请先消除歧义",
  CREATIVE_EDITABLE_ENTITY_EVIDENCE_MISMATCH: "现有工程实体与当前版本依据不一致",
  CREATIVE_CAPABILITY_BLOCKED: "部分工程能力尚不可用",
  INTERACTION_COMPILATION_REQUEST: "交互需要补充明确的可执行能力",
});

function safeDiagnosticCode(value: string): string {
  return /^[A-Z][A-Z0-9_]{2,80}$/.test(value) ? value : "CREATIVE_DIAGNOSTIC_INVALID";
}

function safeDiagnosticLocation(value: string | undefined): string | undefined {
  if (value === undefined || !/^[A-Za-z0-9_$.-]{1,100}$/.test(value)) return undefined;
  return value;
}

function safeAlternatives(values: readonly string[] | undefined, limit: number): string[] {
  return (values ?? []).filter((value) => /^[A-Za-z0-9_.-]{1,80}$/.test(value)).slice(0, limit);
}

function safeCorrelationId(value: string | undefined): string | undefined {
  return value !== undefined && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase()
    : undefined;
}

function boundedDiagnostics(diagnostics: readonly CreativeCompilationDiagnostic[]): string {
  return diagnostics.slice(0, MAX_DIAGNOSTICS).map((diagnostic) => {
    const code = safeDiagnosticCode(diagnostic.code);
    const location = [safeDiagnosticLocation(diagnostic.phase), safeDiagnosticLocation(diagnostic.nodeId)].filter(Boolean).join("/");
    const alternatives = safeAlternatives(diagnostic.alternatives, 5).join(",");
    const correlationId = safeCorrelationId(diagnostic.correlationId);
    return `${code}${location === "" ? "" : `@${location}`}`
      + (alternatives === undefined || alternatives === "" ? "" : `；可选：${alternatives}`)
      + (correlationId === undefined ? "" : `；参考：${correlationId}`);
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
    const code = safeDiagnosticCode(diagnostic.code);
    const alternatives = safeAlternatives(diagnostic.alternatives, 3).join("、");
    const correlationId = safeCorrelationId(diagnostic.correlationId);
    return `${CUSTOMER_DIAGNOSTIC_TEXT[code] ?? "工程能力校验未通过"}`
      + (alternatives === undefined || alternatives === "" ? "" : `；可改用 ${alternatives}`)
      + (correlationId === undefined ? "" : `；参考编号 ${correlationId}`);
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
