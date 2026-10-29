// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { z } from "zod";
import { VisualSemanticPlanSchema, type VisualSemanticPlan } from "./generation-snapshot.js";
import { ControlNodeSchema, LayoutNodeSchema, OverlayPlanSchema, RegisteredModuleNodeSchema, RepeaterNodeSchema,
  SolutionImplementationPlanObjectSchema, SolutionPageSchema, SOLUTION_NODE_MAX_COUNT, SOLUTION_NODE_MAX_DEPTH,
  type SolutionNode } from "./solution-implementation-plan.js";

export const VISUAL_SEMANTIC_GRAPH_VERSION = "kf-visual-semantic-graph/v1";
export const VISUAL_SEMANTIC_GRAPH_JSON_DEPTH = 48;
const nodeId = ControlNodeSchema.shape.id;

// Keep payload fields verbatim for the existing alias normalization and strict
// semantic validator. Only their names and graph structure are checked here.
function payloadShape(shape: Record<string, unknown>, omitted: readonly string[]) {
  return Object.fromEntries(Object.keys(shape).filter(key => !omitted.includes(key)).map(key => [key, z.unknown().optional()]));
}
export const VisualSemanticGraphNodeSchema = z.discriminatedUnion("kind", [
  z.object({ ...payloadShape(LayoutNodeSchema.shape, ["kind", "id", "children"]), kind: z.literal("layout"), id: nodeId,
    childNodeIds: z.array(nodeId).min(1).max(24) }).strict(),
  z.object({ ...payloadShape(ControlNodeSchema.shape, ["kind", "id"]), kind: z.literal("control"), id: nodeId }).strict(),
  z.object({ ...payloadShape(RepeaterNodeSchema.shape, ["kind", "id", "template"]), kind: z.literal("repeater"), id: nodeId,
    templateNodeId: nodeId }).strict(),
  z.object({ ...payloadShape(RegisteredModuleNodeSchema.shape, ["kind", "id", "slots"]), kind: z.literal("registered-module"), id: nodeId,
    slots: z.array(z.object({ slotId: nodeId, childNodeIds: z.array(nodeId).min(1).max(24) }).strict()).max(16) }).strict(),
]);
const graphPageSchema = z.object({ ...payloadShape(SolutionPageSchema.shape, ["root", "id"]), id: nodeId, rootNodeId: nodeId }).strict();
const graphOverlaySchema = z.object({ ...payloadShape(OverlayPlanSchema.shape, ["root", "id"]), id: nodeId, rootNodeId: nodeId }).strict();
export const VisualSemanticGraphSchema = z.object({
  schema: z.literal(VISUAL_SEMANTIC_GRAPH_VERSION),
  plan: z.object({ ...payloadShape(SolutionImplementationPlanObjectSchema.shape, ["schema", "blueprintHash", "candidateBundleHash", "pages", "overlays"]),
    pages: z.array(graphPageSchema).min(1).max(8), overlays: z.array(graphOverlaySchema).max(24) }).strict(),
  nodes: z.array(VisualSemanticGraphNodeSchema).min(1).max(SOLUTION_NODE_MAX_COUNT),
  bindings: VisualSemanticPlanSchema.shape.bindings,
}).strict();
export type VisualSemanticGraph = z.infer<typeof VisualSemanticGraphSchema>;
export const VISUAL_SEMANTIC_DRAFT_VERSION = "kf-visual-addressable-graph/v1";
// Only this known cardinality defect is addressable. The successful graph schema above remains unchanged.
export const VisualSemanticGraphDraftSchema = VisualSemanticGraphSchema.extend({
  nodes: z.array(z.discriminatedUnion("kind", [
    VisualSemanticGraphNodeSchema.options[0].extend({ childNodeIds: z.array(nodeId).max(24) }),
    VisualSemanticGraphNodeSchema.options[1], VisualSemanticGraphNodeSchema.options[2], VisualSemanticGraphNodeSchema.options[3],
  ])).min(1).max(SOLUTION_NODE_MAX_COUNT),
});

/** Bounded identity reading only: no defaults, field removal, reference repair, assembly or approval. */
export function readAddressableVisualSemanticGraph(raw: unknown): VisualSemanticGraph | null {
  try {
    const serialized = JSON.stringify(raw);
    if (!serialized || new TextEncoder().encode(serialized).byteLength > 65536) return null;
    assertVisualSemanticGraphPayloadDepth(raw);
    const parsed = VisualSemanticGraphDraftSchema.safeParse(raw);
    if (!parsed.success || new Set(parsed.data.nodes.map(node => node.id)).size !== parsed.data.nodes.length) return null;
    return parsed.data;
  } catch { return null; }
}
export type VisualSemanticGraphIssue = { code: string; path?: string; nodeId?: string; detail?: string };
export class VisualSemanticGraphError extends Error {
  constructor(readonly issues: VisualSemanticGraphIssue[]) {
    super(issues[0]?.code ?? "SEMANTIC_GRAPH_INVALID");
    this.name = "VisualSemanticGraphError";
  }
}
function fail(code: string, id?: string): never {
  throw new VisualSemanticGraphError([{ code, ...(id === undefined ? {} : { nodeId: id }) }]);
}
export function assertVisualSemanticGraphPayloadDepth(value: unknown): void {
  const pending = [{ value, depth: 0 }];
  while (pending.length) {
    const entry = pending.pop()!;
    if (entry.depth > VISUAL_SEMANTIC_GRAPH_JSON_DEPTH) fail("SEMANTIC_GRAPH_PAYLOAD_DEPTH");
    if (entry.value !== null && typeof entry.value === "object") {
      for (const child of Object.values(entry.value)) pending.push({ value: child, depth: entry.depth + 1 });
    }
  }
}
function edges(node: VisualSemanticGraph["nodes"][number]): string[] {
  if (node.kind === "layout") return node.childNodeIds;
  if (node.kind === "repeater") return [node.templateNodeId];
  if (node.kind === "registered-module") return node.slots.flatMap(slot => slot.childNodeIds);
  return [];
}

/** Format conversion only; all semantic, authority and native gates run after assembly. */
export function assembleVisualSemanticGraph(raw: unknown, authority: { blueprintHash: string; candidateBundleHash: string }): unknown {
  assertVisualSemanticGraphPayloadDepth(raw);
  const parsed = VisualSemanticGraphSchema.safeParse(raw);
  if (!parsed.success) throw new VisualSemanticGraphError(parsed.error.issues.slice(0, 12).map(issue => ({
    code: "SEMANTIC_GRAPH_SCHEMA_INVALID", path: issue.path.join(".").slice(0, 256), detail: issue.message.slice(0, 256),
  })));
  const graph = parsed.data;
  const byId = new Map<string, VisualSemanticGraph["nodes"][number]>();
  for (const node of graph.nodes) {
    if (byId.has(node.id)) fail("SEMANTIC_GRAPH_DUPLICATE_NODE", node.id);
    byId.set(node.id, node);
  }
  const roots = [...graph.plan.pages, ...graph.plan.overlays].map(owner => owner.rootNodeId);
  if (new Set(roots).size !== roots.length) fail("SEMANTIC_GRAPH_SHARED_ROOT");
  const parents = new Map<string, number>();
  for (const root of roots) if (!byId.has(root)) fail("SEMANTIC_GRAPH_MISSING_NODE", root);
  for (const node of graph.nodes) for (const child of edges(node)) {
    if (!byId.has(child)) fail("SEMANTIC_GRAPH_MISSING_NODE", child);
    const count = (parents.get(child) ?? 0) + 1;
    if (count > 1) fail("SEMANTIC_GRAPH_SHARED_NODE", child);
    parents.set(child, count);
  }
  // Inspect all components, including unreachable cycles. Never silently drop an orphan.
  const state = new Map<string, "active" | "done">();
  for (const node of graph.nodes) {
    const pending = [{ id: node.id, exiting: false }];
    while (pending.length) {
      const visit = pending.pop()!;
      if (visit.exiting) { state.set(visit.id, "done"); continue; }
      if (state.get(visit.id) === "done") continue;
      if (state.get(visit.id) === "active") fail("SEMANTIC_GRAPH_CYCLE", visit.id);
      state.set(visit.id, "active"); pending.push({ id: visit.id, exiting: true });
      for (const child of edges(byId.get(visit.id)!)) pending.push({ id: child, exiting: false });
    }
  }
  const owned = new Set<string>();
  for (const root of roots) {
    if (parents.has(root)) fail("SEMANTIC_GRAPH_ROOT_REFERENCED", root);
    const pending = [{ id: root, depth: 0 }];
    while (pending.length) {
      const visit = pending.pop()!;
      if (owned.has(visit.id)) fail("SEMANTIC_GRAPH_SHARED_NODE", visit.id);
      if (visit.depth > SOLUTION_NODE_MAX_DEPTH) fail("SEMANTIC_GRAPH_TREE_DEPTH", visit.id);
      owned.add(visit.id);
      for (const child of edges(byId.get(visit.id)!)) pending.push({ id: child, depth: visit.depth + 1 });
    }
  }
  if (owned.size !== byId.size) fail("SEMANTIC_GRAPH_ORPHAN", graph.nodes.find(node => !owned.has(node.id))!.id);
  const assemble = (id: string): unknown => {
    const node = byId.get(id)!;
    if (node.kind === "layout") {
      const { childNodeIds, ...payload } = node;
      return { ...payload, children: childNodeIds.map(assemble) };
    }
    if (node.kind === "repeater") {
      const { templateNodeId, ...payload } = node;
      return { ...payload, template: assemble(templateNodeId) };
    }
    if (node.kind === "registered-module") {
      const { slots, ...payload } = node;
      return { ...payload, slots: slots.map(({ childNodeIds, ...slot }) => ({ ...slot, children: childNodeIds.map(assemble) })) };
    }
    return { ...node };
  };
  const { pages, overlays, ...metadata } = graph.plan;
  return { schema: "kf-visual-semantic-plan/v1", plan: { ...metadata, schema: "kf-solution-implementation/v1", ...authority,
    pages: pages.map(({ rootNodeId, ...page }) => ({ ...page, root: assemble(rootNodeId) })),
    overlays: overlays.map(({ rootNodeId, ...overlay }) => ({ ...overlay, root: assemble(rootNodeId) })) }, bindings: graph.bindings };
}

/** Deterministic serialization for trusted server/test plans; never repairs untrusted model data. */
export function serializeVisualSemanticGraph(value: VisualSemanticPlan): VisualSemanticGraph {
  const nodes: unknown[] = [];
  const flatten = (node: SolutionNode): string => {
    if (node.kind === "layout") {
      const { children, ...payload } = node;
      nodes.push({ ...payload, childNodeIds: children.map(child => child.id) }); children.forEach(flatten);
    } else if (node.kind === "repeater") {
      const { template, ...payload } = node;
      nodes.push({ ...payload, templateNodeId: template.id }); flatten(template);
    } else if (node.kind === "registered-module") {
      const { slots, ...payload } = node;
      nodes.push({ ...payload, slots: slots.map(({ children, ...slot }) => ({ ...slot, childNodeIds: children.map(child => child.id) })) });
      slots.forEach(slot => slot.children.forEach(flatten));
    } else nodes.push({ ...node });
    return node.id;
  };
  const { pages, overlays, ...fields } = value.plan;
  const metadata = Object.fromEntries(Object.entries(fields).filter(([key]) => !["schema", "blueprintHash", "candidateBundleHash"].includes(key)));
  return { ...value, schema: VISUAL_SEMANTIC_GRAPH_VERSION, plan: { ...metadata,
    pages: pages.map(({ root, ...page }) => ({ ...page, rootNodeId: flatten(root) })),
    overlays: overlays.map(({ root, ...overlay }) => ({ ...overlay, rootNodeId: flatten(root) })) }, nodes } as VisualSemanticGraph;
}

export function visualSemanticGraphContract() {
  return { schema: VISUAL_SEMANTIC_GRAPH_VERSION, schemaDefinition: z.toJSONSchema(VisualSemanticGraphSchema),
    maxNodes: SOLUTION_NODE_MAX_COUNT, maxDepth: SOLUTION_NODE_MAX_DEPTH, maxPayloadDepth: VISUAL_SEMANTIC_GRAPH_JSON_DEPTH };
}
// end
