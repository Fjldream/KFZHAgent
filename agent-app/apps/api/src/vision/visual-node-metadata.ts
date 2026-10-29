// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { ControlNodeSchema, LayoutNodeSchema, RepeaterNodeSchema, RegisteredModuleNodeSchema, RoleStyleIntentSchema,
  readAddressableVisualSemanticGraph, type VisualSemanticGraph } from "@kf/contracts";
import type { SemanticOutputIssue } from "./visual-semantic-output.js";

type FieldValidator = { safeParse(value: unknown): { success: boolean; error?: { issues: readonly { code: string }[] } } };
type NodeKind = VisualSemanticGraph["nodes"][number]["kind"];
const fields: Record<NodeKind, Readonly<Record<string, FieldValidator>>> = {
  control: ControlNodeSchema.shape, layout: LayoutNodeSchema.shape, repeater: RepeaterNodeSchema.shape, "registered-module": RegisteredModuleNodeSchema.shape,
};
const structuralFields = new Set(["id", "kind", "children", "template", "slots"]);
export function visualNodeMetadataContract() {
  return { requiredFields: Object.fromEntries(Object.entries(fields).map(([kind, shape]) => [kind,
    Object.entries(shape).filter(([field, validator]) => !structuralFields.has(field) && !validator.safeParse(undefined).success).map(([field]) => field)])) as Record<NodeKind, string[]>,
    maxGroups: 4, maxNodeIds: 20, version: "kf-visual-node-metadata/v1" };
}
/** Field validation only: parsed defaults and values are never adopted as a repaired graph. */
export function inspectVisualNodeMetadata(raw: unknown, normalize: (value: unknown) => unknown): SemanticOutputIssue[] {
  const addressable = readAddressableVisualSemanticGraph(raw); if (!addressable) return [];
  const graph = readAddressableVisualSemanticGraph(normalize(addressable)); if (!graph) return [];
  const styles: unknown = (graph.plan as Record<string, unknown>).roleStyles;
  const roles = Array.isArray(styles) && styles.length <= 64 ? styles.map(style => RoleStyleIntentSchema.shape.role.safeParse(
    style && typeof style === "object" ? (style as Record<string, unknown>).role : undefined)) : null;
  const roleIds = roles?.every(role => role.success) ? roles.flatMap(role => role.success ? [role.data] : []) : null;
  const declaredRoles = roleIds && new Set(roleIds).size === roleIds.length ? new Set(roleIds) : null;
  const groups = new Map<string, { field: string; schemaCode: string; missing: boolean; ids: string[]; count: number }>();
  for (const node of graph.nodes) {
    const payload: Record<string, unknown> = node;
    for (const [field, validator] of Object.entries(fields[node.kind])) {
      if (structuralFields.has(field)) continue;
      const parsed = validator.safeParse(payload[field]);
      const unknownRole = field === "styleRole" && typeof payload[field] === "string" && declaredRoles !== null && !declaredRoles.has(payload[field]);
      if (parsed.success && !unknownRole) continue;
      const schemaCode = unknownRole ? "unknown-role" : parsed.error?.issues[0]?.code ?? "invalid";
      const missing = !Object.hasOwn(payload, field);
      const key = JSON.stringify([field, schemaCode, missing]);
      const group = groups.get(key) ?? { field, schemaCode, missing, ids: [], count: 0 };
      group.count++; if (group.ids.length < 20) group.ids.push(node.id); groups.set(key, group);
    }
  }
  const all = [...groups.values()];
  const issues: SemanticOutputIssue[] = all.slice(0, 4).map(group => ({ code: "SEMANTIC_NODE_FIELD_INVALID", rule: "node-metadata",
    nodeField: group.field, schemaCode: group.schemaCode, missing: group.missing, path: `nodes.*.${group.field}`,
    nodeIds: group.ids, count: group.count, ...(group.count === 1 ? { nodeId: group.ids[0]! } : {}),
    detail: group.field === "styleRole" ? "Use a valid declared styleRole for each listed node. Controls require an explicit role and cannot inherit it from a parent; other nodes follow their own optional-field schema. Explicitly select a legitimate role or declare a new one."
      : `${group.missing ? "Missing required" : "Invalid"} node field (${group.schemaCode}); use the declared semantic schema. No default or replacement value is supplied by the server.` }));
  if (all.length > 4) issues.push({ code: "SEMANTIC_NODE_FIELDS_REMAINING", rule: "node-metadata", count: all.slice(4).reduce((sum, group) => sum + group.count, 0),
    nodeIds: [...new Set(all.slice(4).flatMap(group => group.ids))].slice(0, 20), detail: "Additional node fields are invalid. Check the required metadata of every declared node; the original draft is unchanged." });
  return issues;
}
// end
