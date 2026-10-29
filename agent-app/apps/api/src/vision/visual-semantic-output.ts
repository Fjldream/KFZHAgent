// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { ApprovedAssetFactsSchema, canonicalServerHash, CapabilityCandidateBundleSchema, CustomerSolutionBlueprintSchema, VisualSemanticPlanSchema, resolveVisualBlueprintSources,
  type ApprovedAssetFacts, type SolutionImplementationPlan, type VisualSemanticPlan } from "@kf/contracts";
import { assembleVisualSemanticGraph, VisualSemanticGraphError } from "@kf/contracts";
import { compileSolutionImplementationWithProvenance, createDefaultModuleRegistry, readSemanticCompilationProvenance,
  SolutionCompileError, validateVisualPlanningContext, validateVisualSemanticBindings } from "@kf/domain-client";
import type { ModelPortContext } from "@kf/agent-orchestrator";
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { DeepSeekModelOutputError, normalizeSolutionStyleAliases, validateSemanticImplementationOutput, validateVisualSemanticOutput } from "../conversations/deepseek-model.js";
import { inspectVisualNodeMetadata } from "./visual-node-metadata.js";
// end
// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { inspectVisualGraphCompleteness } from "./visual-semantic-completeness.js";
import { inspectVisualSemanticCapabilities } from "./visual-semantic-diagnostics.js";
import { inspectVisualSemanticMockValues } from "./visual-semantic-data-diagnostics.js";
// end
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import type { LayoutNode } from "@kf/contracts";
// end

export type SemanticOutputIssue = { code: string; path?: string; nodeId?: string; regionId?: string; detail?: string; nodeIds?: string[];
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  count?: number; regionIds?: string[]; roleIds?: string[]; rule?: "technical-placeholder" | "node-metadata"; rejectedValueHash?: string;
  nodeField?: string; schemaCode?: string; missing?: boolean;
  // end
  // end
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  bindingRequirement?: { requiredCapabilityId: string; actualKind: "layout" | "control"; actualLayout?: LayoutNode["layout"]; actualCapabilityId?: string;
    directLayoutKinds: LayoutNode["layout"][]; availableInnerLayoutKinds: LayoutNode["layout"][]; suggestedInnerLayoutKind?: LayoutNode["layout"] };
  // end
  syntaxLocation?: { unit: "utf16"; offset: number } };
export type SemanticOutputInspection = { ok: true; result: VisualSemanticPlan }
  | { ok: false; repairable: boolean; issues: SemanticOutputIssue[] };
export const MAX_SEMANTIC_REPAIR_DRAFT_BYTES = 64 * 1024;
export const MAX_SEMANTIC_REPAIR_ISSUES = 12;

function compilePlan(context: ModelPortContext, plan: SolutionImplementationPlan, assets: readonly ApprovedAssetFacts[]) {
  const candidates = CapabilityCandidateBundleSchema.parse(context.capabilityCandidates);
  return compileSolutionImplementationWithProvenance({ plan, candidateBundle: candidates, moduleRegistry: createDefaultModuleRegistry(),
    approvedAssets: assets, activeCatalogVersion: candidates.knowledgeCatalogVersion });
}

function assertEmittedBindings(context: ModelPortContext, result: VisualSemanticPlan,
  compilation: ReturnType<typeof compilePlan>): void {
  const sources = resolveVisualBlueprintSources(CustomerSolutionBlueprintSchema.parse(context.confirmedSolutionBlueprint), context.visualReference!);
  const entries = readSemanticCompilationProvenance(compilation.provenance, result.plan);
  const componentOwners = new Map<string, string>();
  for (const binding of result.bindings) {
    const source = sources.find(item => item.visualRegionId === binding.regionId);
    const matching = entries.filter(entry => entry.nodeId === binding.nodeId && entry.capabilityId === source?.capabilityId);
    if (source && matching.length === 0) {
      throw new Error(`VISUAL_CAPABILITY_MISMATCH: ${binding.regionId}`);
    }
    for (const entry of matching) {
      const owner = componentOwners.get(entry.componentId);
      if (owner && owner !== binding.regionId) throw new Error(`VISUAL_COMPONENT_OWNERSHIP_CONFLICT: ${binding.regionId}`);
      componentOwners.set(entry.componentId, binding.regionId);
    }
  }
}

function assertVisualSemanticContext(context: ModelPortContext, assets: readonly ApprovedAssetFacts[]): void {
  try {
    const blueprint = CustomerSolutionBlueprintSchema.parse(context.confirmedSolutionBlueprint);
    const candidates = CapabilityCandidateBundleSchema.parse(context.capabilityCandidates);
    if (candidates.blueprintHash !== canonicalServerHash(blueprint) || !context.visualReference) throw new Error("context mismatch");
    resolveVisualBlueprintSources(blueprint, validateVisualPlanningContext(context.visualReference), true);
    ApprovedAssetFactsSchema.array().max(100).parse(assets);
  } catch { throw new Error("VISUAL_SEMANTIC_TRUSTED_CONTEXT_INVALID"); }
}

/** Pure preflight using the production compiler. No signing, materialization, storage or BuildJob side effects. */
export function validateVisualSemanticCompilation(context: ModelPortContext, raw: unknown, assets: readonly ApprovedAssetFacts[]): VisualSemanticPlan {
  assertVisualSemanticContext(context, assets);
  const result = validateVisualSemanticOutput(context, raw);
  assertEmittedBindings(context, result, compilePlan(context, result.plan, assets));
  return result;
}

function issueFrom(error: unknown): SemanticOutputIssue | null {
  if (error instanceof SolutionCompileError) {
    if (error.reasonCode === "APPROVED_ASSET_INVALID") return null;
    return { code: `NATIVE_${error.reasonCode}`, nodeId: error.nodeId.slice(0, 128), detail: error.message.slice(0, 600) };
  }
  if (error instanceof Error && error.name === "ZodError") return { code: "SEMANTIC_SCHEMA_INVALID" };
  if (error instanceof DeepSeekModelOutputError) return { code: "SEMANTIC_PLAN_INVALID", detail: error.message.slice(0, 600) };
  if (error instanceof Error) {
    const [code, identifier] = error.message.split(": ", 2);
    const allowed = ["VISUAL_SEMANTIC_OUTPUT_INVALID", "VISUAL_LAYOUT_GROUP_INVALID", "UNKNOWN_VISUAL_REGION", "VISUAL_SEMANTIC_NODE_MISSING",
      "VISUAL_BLUEPRINT_SEMANTIC_SOURCE_MISMATCH", "VISUAL_BLUEPRINT_LAYOUT_CAPABILITY_MISMATCH", "VISUAL_BLUEPRINT_CONTROL_CAPABILITY_MISMATCH",
      "VISUAL_SEMANTIC_BINDING_DUPLICATE", "VISUAL_OMITTED_REGION_HAS_COMPONENTS", "VISUAL_REGION_WITHOUT_COMPONENTS", "VISUAL_CAPABILITY_MISMATCH",
      "VISUAL_DATA_REQUIREMENT_MISMATCH", "VISUAL_INTERACTION_REQUIREMENT_MISMATCH", "VISUAL_COMPONENT_OWNERSHIP_CONFLICT"];
    if (code && allowed.includes(code)) {
      if (code === "VISUAL_LAYOUT_GROUP_INVALID" && identifier) return { code, nodeId: identifier.split(" (")[0]!.slice(0, 128), detail: identifier.slice(0, 256) };
      return { code, ...(identifier ? { regionId: identifier.slice(0, 128) } : {}) };
    }
  }
  return null;
}

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const list = (value: unknown): value is unknown[] => Array.isArray(value);

/** Feedback only: the copy is never returned as a successful plan. No explicit event value or unknown field is removed. */
function diagnosticPlan(raw: unknown): { plan: unknown; missing: string[] } {
  const plan: unknown = structuredClone(raw);
  const missing: string[] = [];
  if (!record(plan)) return { plan, missing };
  const pending: unknown[] = [...(list(plan.pages) ? plan.pages : []), ...(list(plan.overlays) ? plan.overlays : [])]
    .flatMap(page => record(page) ? [page.root] : []);
  let visited = 0;
  while (pending.length) {
    if (++visited > 1000) throw new Error("DIAGNOSTIC_NODE_LIMIT");
    const node = pending.pop();
    if (!record(node)) continue;
    if ((node.kind === "control" || node.kind === "registered-module") && !Object.hasOwn(node, "eventBindings")) {
      node.eventBindings = [];
      if (typeof node.id === "string") missing.push(node.id.slice(0, 128));
    }
    if (node.kind === "layout" && list(node.children)) pending.push(...node.children);
    if (node.kind === "repeater") pending.push(node.template);
    if (node.kind === "registered-module" && list(node.slots)) {
      for (const slot of node.slots) if (record(slot) && list(slot.children)) pending.push(...slot.children);
    }
  }
  return { plan, missing };
}

/** A rejected proposal may be diagnosed more deeply, but only the original strict path can produce ok:true. */
export function inspectVisualSemanticOutput(context: ModelPortContext, raw: unknown, assets: readonly ApprovedAssetFacts[]): SemanticOutputInspection {
  let primary: SemanticOutputIssue | null;
  try { return { ok: true, result: validateVisualSemanticCompilation(context, raw, assets) }; }
  catch (error) { primary = issueFrom(error); }
  const serialized = JSON.stringify(raw);
  if (!primary || !serialized || Buffer.byteLength(serialized, "utf8") > MAX_SEMANTIC_REPAIR_DRAFT_BYTES) {
    return { ok: false, repairable: false, issues: [primary ?? { code: "SEMANTIC_PREFLIGHT_FAILED" }] };
  }
  const issues: SemanticOutputIssue[] = [];
  if (!record(raw)) return { ok: false, repairable: true, issues: [primary] };
  const { plan: rawPlan, ...envelope } = raw;
  const parsedEnvelope = VisualSemanticPlanSchema.omit({ plan: true }).safeParse(envelope);
  if (!parsedEnvelope.success) issues.push({ code: "VISUAL_ENVELOPE_INVALID", detail: "Output exactly {schema: kf-visual-semantic-plan/v1, plan, bindings}; no type field." });
  let plan: SolutionImplementationPlan;
  try {
    const diagnosis = diagnosticPlan(rawPlan);
    if (diagnosis.missing.length) issues.push({ code: "EVENT_BINDINGS_REQUIRED", nodeIds: diagnosis.missing.slice(0, 100),
      detail: `Missing eventBindings on ${diagnosis.missing.length} controls/modules. Explicitly output [] only where no authorized event exists; preserve all required interactions.` });
    plan = validateSemanticImplementationOutput(context, diagnosis.plan);
  } catch (error) {
    const issue = issueFrom(error);
    return { ok: false, repairable: issue !== null, issues: [...issues, issue ?? primary].slice(0, MAX_SEMANTIC_REPAIR_ISSUES) };
  }
  const bindings = VisualSemanticPlanSchema.shape.bindings.safeParse(raw.bindings);
  if (bindings.success) {
    try { validateVisualSemanticBindings(context.visualReference!, plan, bindings.data, CustomerSolutionBlueprintSchema.parse(context.confirmedSolutionBlueprint)); }
    catch (error) { const issue = issueFrom(error); if (issue) issues.push(issue); }
  }
  try { compilePlan(context, plan, assets); }
  catch (error) {
    const issue = issueFrom(error);
    if (!issue) return { ok: false, repairable: false, issues: [...issues, primary].slice(0, MAX_SEMANTIC_REPAIR_ISSUES) };
    issues.push(issue);
  }
  if (!issues.length) issues.push(primary);
  return { ok: false, repairable: true, issues: issues.slice(0, MAX_SEMANTIC_REPAIR_ISSUES) };
}

/** A complete-looking, provider-stopped JSON frame may use the same one-shot allowance for syntax repair. Never guesses brackets. */
export function inspectVisualSemanticResponse(context: ModelPortContext, response: { text: string; finishReason: string | null },
  assets: readonly ApprovedAssetFacts[]): { raw: unknown; inspection: SemanticOutputInspection } {
  try { assertVisualSemanticContext(context, assets); }
  catch { return { raw: null, inspection: { ok: false, repairable: false, issues: [{ code: "VISUAL_SEMANTIC_TRUSTED_CONTEXT_INVALID" }] } }; }
  if (response.finishReason !== "stop") return { raw: null, inspection: { ok: false, repairable: false,
    issues: [{ code: response.finishReason === "length" ? "SEMANTIC_RESPONSE_TRUNCATED" : "SEMANTIC_RESPONSE_NOT_STOPPED" }] } };
  let raw: unknown;
  try { raw = JSON.parse(response.text) as unknown; }
  catch (error) {
    const frame = response.text.trim();
    const offset = error instanceof SyntaxError ? Number(error.message.match(/position (\d+)/)?.[1]) : NaN;
    return { raw: response.text, inspection: { ok: false, repairable: response.finishReason === "stop"
      && frame.startsWith("{") && frame.endsWith("}") && Buffer.byteLength(JSON.stringify(response.text), "utf8") <= MAX_SEMANTIC_REPAIR_DRAFT_BYTES,
    issues: [{ code: "SEMANTIC_JSON_SYNTAX_INVALID", ...(Number.isInteger(offset) && offset >= 0 && offset <= response.text.length
      ? { syntaxLocation: { unit: "utf16" as const, offset } } : {}) }] } };
  }
  try {
    const assembled = assembleVisualSemanticGraph(raw, { blueprintHash: canonicalServerHash(context.confirmedSolutionBlueprint),
      candidateBundleHash: canonicalServerHash(context.capabilityCandidates) });
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    const inspection = inspectVisualSemanticOutput(context, assembled, assets);
    return { raw, inspection: inspection.ok ? inspection : { ...inspection,
      issues: mergeCompletenessIssues(inspection.issues, context, raw, assets) } };
    // end
  } catch (error) {
    return { raw, inspection: { ok: false,
      repairable: error instanceof VisualSemanticGraphError && Buffer.byteLength(JSON.stringify(raw), "utf8") <= MAX_SEMANTIC_REPAIR_DRAFT_BYTES,
      // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
      issues: error instanceof VisualSemanticGraphError ? mergeCompletenessIssues(error.issues, context, raw, assets)
        : [{ code: "SEMANTIC_GRAPH_PREFLIGHT_FAILED" }] } };
      // end
  }
}
// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
function mergeCompletenessIssues(primary: readonly SemanticOutputIssue[], context: ModelPortContext, raw: unknown, assets: readonly ApprovedAssetFacts[]): SemanticOutputIssue[] {
  const seen = new Set<string>();
  const capabilities = inspectVisualSemanticCapabilities(context, raw, assets);
  const enriched = primary.map(issue => {
    const match = issue.nodeId === undefined && issue.regionId !== undefined
      ? capabilities.find(candidate => candidate.bindingRequirement && candidate.code === issue.code && candidate.regionId === issue.regionId) : undefined;
    return match ? { ...issue, ...match } : issue;
  });
  const combined = [...enriched.slice(0, 1), ...inspectVisualNodeMetadata(raw, normalizeSolutionStyleAliases), ...inspectVisualSemanticMockValues(raw), ...inspectVisualGraphCompleteness(context.visualReference!, raw),
    ...capabilities, ...enriched.slice(1)];
  return combined.filter(issue => {
    const key = JSON.stringify([issue.code, issue.nodeId, issue.regionId, issue.path]);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, MAX_SEMANTIC_REPAIR_ISSUES);
}
// end
// end
// end
