// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { applyVisualSemanticDelta, canonicalServerHash, readVisualSemanticDeltaBase, RoleStyleIntentSchema,
  SolutionImplementationPlanObjectSchema, VISUAL_SEMANTIC_DELTA_LIMITS, VISUAL_SEMANTIC_DELTA_VERSION,
  VisualSemanticDeltaError, type ApprovedAssetFacts, type VisualSemanticDeltaScope } from "@kf/contracts";
import type { ModelPortContext } from "@kf/agent-orchestrator";
import { normalizeSolutionStyleAliases } from "../conversations/deepseek-model.js";
import { inspectVisualSemanticResponse, type SemanticOutputIssue, type SemanticOutputInspection } from "./visual-semantic-output.js";

export function visualSemanticRepairProtocol(draft: unknown, issues: readonly SemanticOutputIssue[]) {
  const graph = readVisualSemanticDeltaBase(draft);
  if (!graph) return { mode: "full-graph" as const, schema: "kf-visual-semantic-graph/v1" as const };
  const normalized = normalizeSolutionStyleAliases(graph.plan) as Record<string, unknown>;
  const planFields: VisualSemanticDeltaScope["planFields"] = ["pages", "overlays", "actions", "scripts", "mockData", "localState"];
  for (const field of ["projectKey", "theme"] as const) {
    if (!SolutionImplementationPlanObjectSchema.shape[field].safeParse(normalized[field]).success) planFields.push(field);
  }
  const roles = new Set<string>();
  for (const style of normalized.roleStyles as Array<Record<string, unknown>>) {
    if (!RoleStyleIntentSchema.safeParse(style).success) {
      const role = RoleStyleIntentSchema.shape.role.safeParse(style.role); if (role.success) roles.add(role.data);
    }
  }
  const existing = new Set((graph.plan.roleStyles as Array<{ role: string }>).map(style => style.role));
  for (const issue of issues) {
    for (const role of issue.roleIds ?? []) if (existing.has(role)) roles.add(role);
    if (issue.code.startsWith("NATIVE_STYLE_") && issue.nodeId) {
      const node = graph.nodes.find(node => node.id === issue.nodeId) as Record<string, unknown> | undefined;
      if (typeof node?.styleRole === "string" && existing.has(node.styleRole)) roles.add(node.styleRole);
    }
  }
  return { mode: "delta" as const, schema: VISUAL_SEMANTIC_DELTA_VERSION, baseDraftHash: canonicalServerHash(draft),
    scope: { planFields, roleIds: [...roles].sort(), allowNewRoles: true as const }, limits: VISUAL_SEMANTIC_DELTA_LIMITS };
}

/** The allowance is already consumed. A bad delta/full response never starts another repair or changes the base. */
export function inspectVisualSemanticRepairResponse(context: ModelPortContext, response: { text: string; finishReason: string | null },
  assets: readonly ApprovedAssetFacts[], draft: unknown, issues: readonly SemanticOutputIssue[]): { raw: unknown; inspection: SemanticOutputInspection } {
  const protocol = visualSemanticRepairProtocol(draft, issues);
  if (protocol.mode === "full-graph") return inspectVisualSemanticResponse(context, response, assets);
  if (response.finishReason !== "stop") return { raw: null, inspection: { ok: false, repairable: false, issues: [{ code: "SEMANTIC_DELTA_RESPONSE_NOT_STOPPED" }] } };
  let delta: unknown;
  try { delta = JSON.parse(response.text); }
  catch { return { raw: response.text, inspection: { ok: false, repairable: false, issues: [{ code: "SEMANTIC_DELTA_JSON_INVALID" }] } }; }
  try {
    const merged = applyVisualSemanticDelta(draft, delta, protocol.scope);
    const checked = inspectVisualSemanticResponse(context, { text: JSON.stringify(merged), finishReason: "stop" }, assets);
    return { raw: merged, inspection: checked.inspection.ok ? checked.inspection : { ...checked.inspection, repairable: false } };
  } catch (error) {
    return { raw: delta, inspection: { ok: false, repairable: false,
      issues: [{ code: error instanceof VisualSemanticDeltaError ? error.message : "SEMANTIC_DELTA_INVALID" }] } };
  }
}
// end
