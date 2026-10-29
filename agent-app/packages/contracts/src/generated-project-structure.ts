// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { z } from "zod";
import { projectKeySchema } from "./solution.js";
import { LayoutNodeSchema, LocalStateDefinitionSchema, MockDataSetSchema, type MockDataSet, type SolutionImplementationPlan, type SolutionNode } from "./solution-implementation-plan.js";
import { normalizeSolutionRepeaterKey } from "./solution-node-projection.js";

const identifier = z.string().min(1).max(100).regex(/^[A-Za-z][A-Za-z0-9_-]*$/);
export const GeneratedProjectStructureSchema = z.object({
  schema: z.literal("kf-generated-project-structure/v2"), projectKey: projectKeySchema,
  roots: z.array(z.object({ id: identifier, kind: z.enum(["page", "overlay"]), rootNodeId: identifier }).strict()).min(1).max(32),
  nodes: z.array(z.object({ id: identifier, rootId: identifier,
    kind: z.enum(["layout", "control", "registered-module", "repeater"]), capabilityId: z.string().max(100).nullable(),
    parentNodeId: identifier.nullable(), layout: LayoutNodeSchema.shape.layout.nullable(),
    childNodeIds: z.array(identifier).max(128), text: z.string().max(2000).nullable() }).strict()).min(1).max(512),
  mockData: z.array(MockDataSetSchema).max(32),
  repeaters: z.array(z.object({ id: identifier, mockDataId: identifier, keyField: z.string().min(1).max(100), maxItems: z.number().int().min(1).max(100) }).strict()).max(512),
  states: z.array(LocalStateDefinitionSchema).max(64),
  actions: z.array(z.object({ id: identifier, kind: z.string().max(64), afterActionIds: z.array(identifier).max(100),
    relatedIds: z.array(z.object({ relation: z.string().max(100), id: identifier }).strict()).max(16) }).strict()).max(200),
  scripts: z.array(z.object({ id: identifier, kind: z.string().max(64), purpose: z.string().max(2000),
    inputs: z.array(z.object({ refKind: z.string().max(64), refId: identifier }).strict()).max(100),
    outputs: z.array(z.object({ refKind: z.string().max(64), refId: identifier }).strict()).max(100) }).strict()).max(200),
}).strict();
export type GeneratedProjectStructure = z.infer<typeof GeneratedProjectStructureSchema>;
export const GENERATED_PROJECT_STRUCTURE_MAX_BYTES = 24 * 1024;
// Diagnostic strings share the adapter's per-reason repair bound; semantic context is never truncated.
const RETENTION_ISSUE_MAX_CHARS = 300;
const forbiddenText = /\bsk-[A-Za-z0-9_-]{16,}|\bBearer\s+\S+|\b(?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]|\beyJ[A-Za-z0-9_-]{12,}\.|\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b|\/Users\/|\/private\/|\b[A-Za-z]:\\/i;

function children(node: SolutionNode): SolutionNode[] {
  if (node.kind === "layout") return node.children;
  if (node.kind === "registered-module") return node.slots.flatMap(slot => slot.children);
  if (node.kind === "repeater") return [node.template];
  return [];
}
function nodeRows(plan: SolutionImplementationPlan): GeneratedProjectStructure["nodes"] {
  const rows: GeneratedProjectStructure["nodes"] = [];
  const visit = (node: SolutionNode, rootId: string, parentNodeId: string | null): void => {
    const nested = children(node);
    const text = "content" in node && typeof node.content === "string" ? node.content : null;
    rows.push({ id: node.id, rootId, kind: node.kind, capabilityId: node.kind === "control" ? node.capabilityId
      : node.kind === "registered-module" ? node.moduleKind : null, parentNodeId, layout: node.kind === "layout" ? node.layout : null,
      childNodeIds: nested.map(child => child.id), text });
    nested.forEach(child => visit(child, rootId, node.id));
  };
  plan.pages.forEach(page => visit(page.root, page.id, null));
  plan.overlays.forEach(overlay => visit(overlay.root, overlay.id, null));
  return rows;
}
function repeaterRows(plan: SolutionImplementationPlan): GeneratedProjectStructure["repeaters"] {
  const rows: GeneratedProjectStructure["repeaters"] = [];
  const visit = (node: SolutionNode): void => {
    if (node.kind === "repeater") rows.push({ id: node.id, mockDataId: node.mockDataId, keyField: node.keyField, maxItems: node.maxItems });
    children(node).forEach(visit);
  };
  plan.pages.forEach(page => visit(page.root)); plan.overlays.forEach(overlay => visit(overlay.root));
  return rows;
}
function containsSensitiveString(value: unknown): boolean {
  if (typeof value === "string") return forbiddenText.test(value);
  if (Array.isArray(value)) return value.some(containsSensitiveString);
  return value !== null && typeof value === "object"
    && Object.entries(value).some(([key, nested]) => forbiddenText.test(key) || containsSensitiveString(nested));
}
/** Canonical identities detect collisions; raw scalar values retain both exact type and value. */
function repeaterKeys(dataset: MockDataSet | undefined, keyField: string): Map<string, string | number> | null {
  if (!dataset) return null;
  const keys = new Map<string, string | number>();
  try {
    for (const record of dataset.records) {
      const value = record.values.find(entry => entry.field === keyField)?.value;
      if (typeof value !== "string" && typeof value !== "number") return null;
      const identity = normalizeSolutionRepeaterKey(value);
      if (keys.has(identity)) return null;
      keys.set(identity, value);
    }
  } catch { return null; }
  return keys;
}

/** Read-only semantic data only; native identities, properties, scripts, assets and receipts are never projected. */
export function projectGeneratedStructure(plan: SolutionImplementationPlan): GeneratedProjectStructure {
  const candidate = { schema: "kf-generated-project-structure/v2" as const, projectKey: plan.projectKey,
    roots: [...plan.pages.map(page => ({ id: page.id, kind: "page" as const, rootNodeId: page.root.id })),
      ...plan.overlays.map(overlay => ({ id: overlay.id, kind: "overlay" as const, rootNodeId: overlay.root.id }))], nodes: nodeRows(plan),
    mockData: structuredClone(plan.mockData), repeaters: repeaterRows(plan),
    states: plan.localState.map(state => structuredClone(state)),
    actions: plan.actions.map(action => ({ id: action.id, kind: action.kind, afterActionIds: [...action.afterActionIds],
      relatedIds: Object.entries(action).flatMap(([relation, id]) => relation !== "id" && relation.endsWith("Id") && typeof id === "string" ? [{ relation, id }] : []) })),
    scripts: plan.scripts.map(script => ({ id: script.id, kind: script.kind, purpose: script.purpose,
      inputs: script.inputs.map(port => ({ refKind: port.refKind, refId: port.refId })),
      outputs: script.outputs.map(port => ({ refKind: port.refKind, refId: port.refId })) })) };
  if (candidate.roots.length > 32 || candidate.nodes.length > 512 || candidate.actions.length > 200 || candidate.scripts.length > 200
    || candidate.nodes.some(node => node.childNodeIds.length > 128)
    || new TextEncoder().encode(JSON.stringify(candidate)).byteLength > GENERATED_PROJECT_STRUCTURE_MAX_BYTES) {
    throw new Error("SOLUTION_EXISTING_CONTEXT_TOO_LARGE");
  }
  if (containsSensitiveString(candidate)) throw new Error("SOLUTION_EXISTING_CONTEXT_SENSITIVE");
  if (candidate.repeaters.some(repeater => repeaterKeys(candidate.mockData.find(dataset => dataset.id === repeater.mockDataId), repeater.keyField) === null)) {
    throw new Error("SOLUTION_EXISTING_CONTEXT_INVALID");
  }
  return GeneratedProjectStructureSchema.parse(candidate);
}

/** A continuation may not silently abandon old nodes while the native patcher preserves untouched content. */
export function generatedStructureRetentionIssues(plan: SolutionImplementationPlan, previous: GeneratedProjectStructure): string[] {
  const known = GeneratedProjectStructureSchema.parse(previous);
  const nodes = new Map(nodeRows(plan).map(node => [node.id, node]));
  const roots = new Map<string, { kind: "page" | "overlay"; rootNodeId: string }>([...plan.pages.map(page => [page.id, { kind: "page", rootNodeId: page.root.id }] as const),
    ...plan.overlays.map(overlay => [overlay.id, { kind: "overlay", rootNodeId: overlay.root.id }] as const)]);
  const issues: string[] = [];
  for (const root of known.roots) {
    const next = roots.get(root.id);
    if (next?.kind !== root.kind || next.rootNodeId !== root.rootNodeId) issues.push(`Retain the existing ${root.kind} ID ${root.id} and its rootNodeId; deleting, renaming or reparenting existing roots is unsupported.`);
  }
  for (const node of known.nodes) {
    const next = nodes.get(node.id);
    if (!next || next.rootId !== node.rootId || next.kind !== node.kind || next.capabilityId !== node.capabilityId
      || next.parentNodeId !== node.parentNodeId || next.layout !== node.layout) {
      issues.push(`Retain existing node ${node.id}, its kind/capability/layout, direct parent and owning root; edit requested content in place.`);
    }
  }
  const repeaters = new Map(repeaterRows(plan).map(repeater => [repeater.id, repeater]));
  for (const repeater of known.repeaters) {
    const next = repeaters.get(repeater.id);
    const originalKeys = repeaterKeys(known.mockData.find(dataset => dataset.id === repeater.mockDataId), repeater.keyField);
    const nextKeys = next && repeaterKeys(plan.mockData.find(dataset => dataset.id === next.mockDataId), next.keyField);
    if (!next || next.mockDataId !== repeater.mockDataId || next.keyField !== repeater.keyField
      || !originalKeys || !nextKeys || nextKeys.size !== originalKeys.size
      || [...originalKeys].some(([identity, value]) => !nextKeys.has(identity) || !Object.is(nextKeys.get(identity), value))) {
      issues.push(`Retain existing repeater ${repeater.id}: keep dataset/keyField and every original key's type/value. Edit non-key values or reorder only; existing-list key additions/removals/replacements are unsupported.`);
    }
  }
  for (const state of known.states) {
    const next = plan.localState.find(candidate => candidate.id === state.id);
    if (!next || next.type !== state.type || next.mockDataId !== state.mockDataId || next.keyField !== state.keyField) {
      issues.push(`Retain existing local state ${state.id}, its type and record scope; update its requested value using the original ID.`);
    }
  }
  for (const action of known.actions) {
    if (!plan.actions.some(next => next.id === action.id && next.kind === action.kind)) issues.push(`Retain existing action ${action.id} and its kind; deletion/renaming is unavailable.`);
  }
  for (const script of known.scripts) {
    if (!plan.scripts.some(next => next.id === script.id && next.kind === script.kind)) issues.push(`Retain existing semantic script ${script.id} and its kind; executable source is not part of this read-only context.`);
  }
  return issues.slice(0, 20).map(issue => issue.slice(0, RETENTION_ISSUE_MAX_CHARS));
}
// end
