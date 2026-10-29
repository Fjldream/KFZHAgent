// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { canonicalServerHash, FrozenVisualSemanticModelSchema, type ModelRoute, type VisualEngineeringContinuation,
  type CapabilityCandidateBundle, type AssetRecord } from "@kf/contracts";
import type { ModelPortContext } from "@kf/agent-orchestrator";
// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { DeepSeekModelOutputError, buildVisualSemanticMessages, buildVisualSemanticRepairMessages, visualSemanticPromptContract } from "../conversations/deepseek-model.js";
import type { SemanticOutputIssue } from "./visual-semantic-output.js";
// end
import type { JsonModelRequest } from "../models/deepseek-transport.js";
// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { visualSemanticRepairProtocol } from "./visual-semantic-repair.js";
// end

// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
const PROMPT_VERSION = "visual-semantic@24";
// end
// end
// end
// end
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
const MAX_OUTPUT_TOKENS = 32000;
function semanticOutputPolicy(route: ModelRoute): Pick<JsonModelRequest, "thinking" | "reasoningEffort" | "maxOutputTokens"> {
  return route.supportsThinking
    ? { thinking: true, reasoningEffort: "high" as const, maxOutputTokens: MAX_OUTPUT_TOKENS }
    : { thinking: false, maxOutputTokens: MAX_OUTPUT_TOKENS };
}
// end
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_INPUT_BYTES = 128000;
// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
export const SEMANTIC_REPAIR_PROMPT_VERSION = "visual-semantic-repair@13";
// end
// end
export function freezeVisualSemanticModel(route: ModelRoute, repairPolicy: "none" | "once" = "none") {
  const parsed = FrozenVisualSemanticModelSchema.safeParse({ route, promptVersion: PROMPT_VERSION, repairPolicy, configHash: "0".repeat(64) });
  if (!parsed.success || route.maxContextTokens <= MAX_OUTPUT_TOKENS) throw new Error("VISUAL_SEMANTIC_CONFIG_INVALID");
  return { ...parsed.data, configHash: canonicalServerHash({ route: parsed.data.route, promptVersion: PROMPT_VERSION,
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    prompt: visualSemanticPromptContract(), schema: "kf-visual-semantic-plan/v1", ...semanticOutputPolicy(parsed.data.route),
    maxResponseBytes: MAX_RESPONSE_BYTES, maxInputBytes: MAX_INPUT_BYTES, repairPolicy,
// end
    repairVersion: SEMANTIC_REPAIR_PROMPT_VERSION, maxRepairDraftBytes: 65536, maxRepairIssues: 12,
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    nativeNamingPolicyVersion: "kf-native-generated-names/v2", nativeGeneratedNameMaxLength: 32,
    // end
    preflightVersion: "kf-visual-native-preflight/v1", diagnosticVersion: "kf-visual-feedback-only/v1",
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    repairKnowledgeVersion: "kf-visual-repair-relevant-profiles/v2", candidateDetailIdentityVersion: "kf-final-selected-details/v1",
    // end
    syntaxRepairVersion: "kf-stopped-json-frame/v1", nativeOwnershipVersion: "kf-visual-component-owner/v1", literalRowVersion: "kf-visual-static-rows/v1",
    layoutSurfaceVersion: "kf-layout-surface-insets/v1", wireVersion: "kf-visual-semantic-graph/v1", syntaxLocationVersion: "utf16-offset/v1",
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    layoutObligationVersion: "kf-visual-layout-obligations/v2", bindingFeedbackVersion: "kf-visual-binding-feedback/v1", completenessVersion: "kf-visual-completeness/v2",
    // end
    deltaPolicyVersion: "kf-visual-scoped-delta/v2", independentStylePreflightVersion: "kf-visual-style-preflight/v2",
    addressableDraftVersion: "kf-visual-addressable-graph/v1",
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    mockFeedbackVersion: "kf-visual-mock-feedback/v1", visualDataPolicyVersion: "kf-visual-needed-dependencies/v1", nodeMetadataVersion: "kf-visual-node-metadata/v1" }) };
    // end
}
// end
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
export function buildVisualSemanticRequest(snapshot: VisualEngineeringContinuation, candidates: CapabilityCandidateBundle, assets: AssetRecord[], projectKey = "kingclient") {
// end
  const content = snapshot.content; const frozen = content.semanticModel;
  if (!frozen) throw new Error("VISUAL_SEMANTIC_CONFIG_REQUIRED");
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  if (canonicalServerHash(freezeVisualSemanticModel(frozen.route, frozen.repairPolicy)) !== canonicalServerHash(frozen)) throw new Error("VISUAL_SEMANTIC_CONFIG_CHANGED");
  // end
  // Only server-approved facts: never forward arbitrary graph history, repair drafts or caller requirement text.
  const context: ModelPortContext = { tenantId: content.tenantId, userId: content.requestedByUserId,
    workspaceId: content.workspaceId, conversationId: content.conversationId, currentRevisionId: content.baseRevisionId,
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    generationWorkflow: "creative-v2", currentProjectKey: projectKey, recentMessages: [],
    // end
    confirmedSolutionBlueprint: content.blueprintReview.content.blueprint, capabilityCandidates: candidates,
    assetCatalog: assets, visualReference: content.accepted.reference };
  const messages = buildVisualSemanticMessages(context);
  if (Buffer.byteLength(JSON.stringify(messages), "utf8") > Math.min(MAX_INPUT_BYTES, frozen.route.maxContextTokens - MAX_OUTPUT_TOKENS)) throw new Error("VISUAL_SEMANTIC_CONTEXT_TOO_LARGE");
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  const request: JsonModelRequest = { route: structuredClone(frozen.route), messages, ...semanticOutputPolicy(frozen.route),
    maxResponseBytes: MAX_RESPONSE_BYTES, scope: { tenantId: content.tenantId, workspaceId: content.workspaceId,
// end
      conversationId: content.conversationId, runId: content.runId, task: "implementation", provider: frozen.route.provider,
      requestedModel: frozen.route.model, promptVersion: PROMPT_VERSION, schemaVersion: "kf-visual-semantic-graph/v1",
      prefixHash: canonicalServerHash({ prompt: visualSemanticPromptContract(), version: PROMPT_VERSION }),
      inputHash: canonicalServerHash({ engineeringHash: snapshot.inputHash, modelConfigHash: frozen.configHash, messages }), attempt: 1 } };
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  return { request, context, repairPolicy: frozen.repairPolicy };
  // end
}
// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
/** Derivation only. The service must separately reserve the allowance and revalidate the live signed continuation. */
export function buildVisualSemanticRepairRequest(base: JsonModelRequest, context: ModelPortContext, draft: unknown,
  issues: readonly SemanticOutputIssue[]): JsonModelRequest {
  const serialized = JSON.stringify(draft);
  if (!serialized || Buffer.byteLength(serialized, "utf8") > 65536 || issues.length < 1 || issues.length > 12
    || base.scope.promptVersion !== PROMPT_VERSION || base.scope.task !== "implementation" || !base.scope.runId
    || context.tenantId !== base.scope.tenantId || context.workspaceId !== base.scope.workspaceId || context.conversationId !== base.scope.conversationId
    || base.messages.length !== 2 || base.messages[0]?.role !== "system" || base.messages[1]?.role !== "user") {
    throw new Error("VISUAL_SEMANTIC_REPAIR_CONTEXT_INVALID");
  }
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  const policy = semanticOutputPolicy(base.route);
  if (base.thinking !== policy.thinking || base.reasoningEffort !== policy.reasoningEffort
    || base.maxOutputTokens !== policy.maxOutputTokens || base.maxResponseBytes !== MAX_RESPONSE_BYTES) {
    throw new Error("VISUAL_SEMANTIC_REPAIR_CONTEXT_INVALID");
  }
// end
  if (canonicalServerHash(buildVisualSemanticMessages(context)) !== canonicalServerHash(base.messages)) {
    throw new Error("VISUAL_SEMANTIC_REPAIR_CONTEXT_INVALID");
  }
  let messages: ReturnType<typeof buildVisualSemanticRepairMessages>;
  try { messages = buildVisualSemanticRepairMessages(context, draft, issues); }
  catch (error) {
    if (error instanceof DeepSeekModelOutputError && error.message.includes("creative planning prompt exceeds 128000 UTF-8 byte bound")) {
      throw new Error("VISUAL_SEMANTIC_REPAIR_CONTEXT_TOO_LARGE");
    }
    throw error;
  }
  if (canonicalServerHash(messages[0]) !== canonicalServerHash(base.messages[0])) throw new Error("VISUAL_SEMANTIC_REPAIR_CONTEXT_INVALID");
  if (Buffer.byteLength(JSON.stringify(messages), "utf8") > Math.min(MAX_INPUT_BYTES, base.route.maxContextTokens - MAX_OUTPUT_TOKENS)) {
    throw new Error("VISUAL_SEMANTIC_REPAIR_CONTEXT_TOO_LARGE");
  }
  return { ...base, messages, scope: { ...base.scope, task: "repair", promptVersion: SEMANTIC_REPAIR_PROMPT_VERSION,
    schemaVersion: visualSemanticRepairProtocol(draft, issues).schema,
    inputHash: canonicalServerHash({ originalInputHash: base.scope.inputHash, messages }), attempt: base.scope.attempt + 1 } };
}
// end
// end
