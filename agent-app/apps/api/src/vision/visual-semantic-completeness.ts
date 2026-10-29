// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { NodeIntentSchema, readAddressableVisualSemanticGraph, type VisualPlanningContext, type VisualSemanticGraph } from "@kf/contracts";
import { validateVisualSiblingGrouping } from "@kf/domain-client";
import type { SemanticOutputIssue } from "./visual-semantic-output.js";

type GraphNode = VisualSemanticGraph["nodes"][number];
const children = (node: GraphNode): string[][] => node.kind === "layout" ? [node.childNodeIds]
  : node.kind === "repeater" ? [[node.templateNodeId]] : node.kind === "registered-module" ? node.slots.map(slot => slot.childNodeIds) : [];

/** Diagnostic observations only. Never assembles, repairs or authorizes a proposal. */
export function inspectVisualGraphCompleteness(reference: VisualPlanningContext, raw: unknown): SemanticOutputIssue[] {
  const graph = readAddressableVisualSemanticGraph(raw);
  if (!graph) return [];
  const omitted = new Set(reference.acceptedDifferences.filter(item => item.disposition === "omit").map(item => item.regionId));
  const expected = new Set(reference.spec.regions.filter(region => !omitted.has(region.id)).map(region => region.id));
  const bound = new Set(graph.bindings.map(binding => binding.regionId));
  const issues: SemanticOutputIssue[] = [];
  const empty = graph.nodes.filter(node => node.kind === "layout" && node.childNodeIds.length === 0).map(node => node.id);
  if (empty.length) issues.push({ code: "SEMANTIC_GRAPH_EMPTY_LAYOUTS", count: empty.length, nodeIds: empty.slice(0, 20),
    detail: "Each layout needs 1..24 explicit children. Explicitly repair it or remove it and every affected reference; decorations must use approved styles/capabilities. The server will not discard nodes or invent children." });
  const missing = [...expected].filter(id => !bound.has(id));
  if (missing.length) issues.push({ code: "VISUAL_REGION_COVERAGE_INCOMPLETE", count: missing.length, regionIds: missing,
    detail: `Bind all ${expected.size} required regions; only ${[...expected].filter(id => bound.has(id)).length} are represented. Do not drop reviewed regions.` });
  const invalid = [...bound].filter(id => !expected.has(id));
  if (invalid.length) issues.push({ code: "VISUAL_BINDING_REGION_INVALID", count: invalid.length, regionIds: invalid.slice(0, 20) });
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  if (byId.size !== graph.nodes.length) return issues; // Ambiguous declarations are handled by the strict graph validator.
  const absent = [...new Set(graph.bindings.filter(binding => !byId.has(binding.nodeId)).map(binding => binding.nodeId))];
  if (absent.length) issues.push({ code: "VISUAL_BINDING_NODE_MISSING", count: absent.length, nodeIds: absent.slice(0, 20) });
  const roots = [...graph.plan.pages, ...graph.plan.overlays].map(owner => owner.rootNodeId);
  const reached = new Set<string>();
  const pending = [...roots];
  while (pending.length) {
    const id = pending.pop()!;
    if (reached.has(id)) continue;
    const node = byId.get(id);
    if (!node) continue;
    reached.add(id);
    pending.push(...children(node).flat());
  }
  const unreachable = graph.nodes.filter(node => !reached.has(node.id)).map(node => node.id);
  if (unreachable.length) issues.push({ code: "SEMANTIC_GRAPH_UNREACHABLE_NODES", count: unreachable.length, nodeIds: unreachable.slice(0, 20),
    detail: "Every declared node must be reachable from its page/overlay root. Rewrite the proposal; the server will not connect or discard nodes." });
  const groups = [...roots.map(root => [root]), ...graph.nodes.flatMap(children)];
  for (const ids of groups) {
    if (issues.length >= 12) break;
    const entries = ids.map(id => {
      const node = byId.get(id);
      if (!node) return null;
      const intent: unknown = (node as Record<string, unknown>).intent;
      if (!intent || typeof intent !== "object" || Array.isArray(intent)) return null;
      const group = NodeIntentSchema.shape.groupWith.safeParse((intent as Record<string, unknown>).groupWith);
      return group.success ? { id, groupWith: group.data } : null;
    });
    if (entries.some(entry => entry === null)) continue; // Never invent [] for malformed or missing groupWith.
    try { validateVisualSiblingGrouping(entries.filter(entry => entry !== null)); }
    catch (error) {
      if (!(error instanceof Error)) continue;
      const match = error.message.match(/^VISUAL_LAYOUT_GROUP_INVALID: ([A-Za-z0-9_.-]+) \((self|duplicate|not-sibling|cycle)\)$/);
      if (match) issues.push({ code: "VISUAL_LAYOUT_GROUP_INVALID", nodeId: match[1]!.slice(0, 128), detail: match[2]! });
    }
  }
  return issues.slice(0, 12);
}
// end
