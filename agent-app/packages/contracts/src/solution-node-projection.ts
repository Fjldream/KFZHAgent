// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import type { SemanticScalar, SolutionImplementationPlan, SolutionNode, SemanticValue } from "./solution-implementation-plan.js";

// Extracted from domain-client/solution-compile/solution-provenance; same identity/error contract.
export class SolutionProvenanceError extends Error {
  constructor(readonly nodeId: string, detail: string) {
    super(`SOLUTION_PROVENANCE_INVALID: ${nodeId} (${detail})`);
    this.name = "SolutionProvenanceError";
  }
}
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
export function normalizeSolutionRepeaterKey(value: SemanticScalar): string {
  if (value === null || typeof value === "boolean") throw new SolutionProvenanceError("repeater-key", `unsafe key: ${String(value)}`);
  if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) throw new SolutionProvenanceError("repeater-key", `unsafe key: ${String(value)}`);
  const raw = String(value).normalize("NFKC").trim();
  if (raw.length === 0 || raw.length > 48 || FORBIDDEN_KEYS.has(raw.toLowerCase()) || !/^[A-Za-z0-9][A-Za-z0-9 _-]*$/.test(raw)) {
    throw new SolutionProvenanceError("repeater-key", `unsafe key: ${raw || "empty"}`);
  }
  const normalized = raw.toLowerCase().replace(/[ _]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(normalized)) throw new SolutionProvenanceError("repeater-key", `unsafe key: ${raw}`);
  return normalized;
}
export interface ProjectedSolutionNode {
  readonly id: string;
  readonly sourceNode: SolutionNode;
  readonly parentId?: string;
  readonly sourceRepeaterId?: string;
  readonly kind: "layout" | "control" | "repeater-item" | "registered-module";
  readonly records: ReadonlyMap<string, Readonly<Record<string, SemanticScalar>>>;
}

/** Deterministic source projection, not authentication. Inputs must pass the strict solution schema. Modules are opaque leaves. */
export function projectSolutionNodes(plan: SolutionImplementationPlan, root: SolutionNode): ReadonlyMap<string, ProjectedSolutionNode> {
  const dataSets = new Map(plan.mockData.map((dataSet) => [dataSet.id, dataSet]));
  const projected = new Map<string, ProjectedSolutionNode>();
  const expandedId = (prefix: string | undefined, nodeId: string): string => {
    const id = prefix === undefined ? nodeId : `${prefix}--${nodeId}`;
    if (id.length > 100) throw new SolutionProvenanceError(nodeId, "expanded id exceeds 100 characters");
    return id;
  };
  const add = (entry: ProjectedSolutionNode): void => {
    if (projected.has(entry.id)) throw new SolutionProvenanceError(entry.id, "expanded id collision");
    if (projected.size >= 5000) throw new SolutionProvenanceError(entry.id, "expanded node limit exceeded");
    projected.set(entry.id, entry);
  };
  const visit = (node: SolutionNode, prefix: string | undefined, parentId: string | undefined,
    sourceRepeaterId: string | undefined, records: ProjectedSolutionNode["records"]): void => {
    if (node.kind === "repeater") {
      const dataSet = dataSets.get(node.mockDataId);
      if (dataSet === undefined) throw new SolutionProvenanceError(node.id, `unknown mock data: ${node.mockDataId}`);
      if (dataSet.records.length > node.maxItems) throw new SolutionProvenanceError(node.id, "repeater maxItems exceeded");
      const baseId = expandedId(prefix, node.id);
      const keys = new Set<string>();
      for (const row of dataSet.records) {
        const record = Object.fromEntries(row.values.map((entry) => [entry.field, entry.value]));
        const keyValue = record[node.keyField];
        if (keyValue === undefined) throw new SolutionProvenanceError(node.id, `missing scalar key field: ${node.keyField}`);
        const key = normalizeSolutionRepeaterKey(keyValue);
        if (keys.has(key)) throw new SolutionProvenanceError(node.id, `normalized key collision: ${key}`);
        keys.add(key);
        const itemId = expandedId(baseId, key);
        add({ id: itemId, sourceNode: node, ...(parentId === undefined ? {} : { parentId }), sourceRepeaterId: node.id, kind: "repeater-item", records });
        const nestedRecords = new Map(records);
        nestedRecords.set(node.itemAlias, record);
        visit(node.template, itemId, itemId, node.id, nestedRecords);
      }
      return;
    }
    const id = expandedId(prefix, node.id);
    add({ id, sourceNode: node, ...(parentId === undefined ? {} : { parentId }),
      ...(sourceRepeaterId === undefined ? {} : { sourceRepeaterId }), kind: node.kind, records });
    if (node.kind === "layout") node.children.forEach((child) => visit(child, prefix, id, sourceRepeaterId, records));
  };
  visit(root, undefined, undefined, undefined, new Map());
  return projected;
}

/** Only literal strings or explicitly scoped scalar string fields qualify; never stringify data. */
export function projectedObservationText(value: SemanticValue, entry: ProjectedSolutionNode): string | undefined {
  if (typeof value === "string") return value;
  if (value === null || typeof value !== "object" || value.kind !== "repeater-field") return undefined;
  const record = entry.records.get(value.itemAlias);
  const text = record !== undefined && Object.hasOwn(record, value.field) ? record[value.field] : undefined;
  return typeof text === "string" ? text : undefined;
}
// end
