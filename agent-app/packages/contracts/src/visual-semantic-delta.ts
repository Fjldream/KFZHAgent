// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { z } from "zod";
import { canonicalServerHash } from "./server-plan-envelope.js";
import { RoleStyleIntentSchema, ControlNodeSchema } from "./solution-implementation-plan.js";
import { VisualSemanticGraphSchema, VisualSemanticGraphNodeSchema, VisualSemanticGraphDraftSchema, VISUAL_SEMANTIC_DRAFT_VERSION,
  readAddressableVisualSemanticGraph, assertVisualSemanticGraphPayloadDepth, type VisualSemanticGraph } from "./visual-semantic-graph.js";

export const VISUAL_SEMANTIC_DELTA_VERSION = "kf-visual-semantic-graph-delta/v1";
export const VISUAL_SEMANTIC_DELTA_LIMITS = Object.freeze({ maxOperations: 16, maxChanges: 128, maxDeltaBytes: 65536, maxMergedBytes: 131072 });
const planField = z.enum(["projectKey", "theme", "mockData", "localState", "pages", "overlays", "actions", "scripts"]);
const roleId = RoleStyleIntentSchema.shape.role;
const nodeId = ControlNodeSchema.shape.id;
const roleReplacement = z.object({ role: roleId, declarations: z.unknown().optional(), states: z.unknown().optional() }).strict();
const nodeField = z.enum([...new Set(VisualSemanticGraphNodeSchema.options.flatMap(schema => Object.keys(schema.shape)))]
  .filter(field => field !== "id" && field !== "kind") as [string, ...string[]]);
const explicitValue = z.unknown().refine(value => value !== undefined, "Explicit value required");
export const VisualSemanticDeltaScopeSchema = z.object({ planFields: z.array(planField).max(8), roleIds: z.array(roleId).max(64), allowNewRoles: z.literal(true) }).strict();
export type VisualSemanticDeltaScope = z.infer<typeof VisualSemanticDeltaScopeSchema>;
export const VisualSemanticDeltaSchema = z.object({
  schema: z.literal(VISUAL_SEMANTIC_DELTA_VERSION), baseDraftHash: z.string().regex(/^[a-f0-9]{64}$/),
  operations: z.array(z.discriminatedUnion("op", [
    z.object({ op: z.literal("upsert-nodes"), nodes: z.array(VisualSemanticGraphNodeSchema).min(1).max(128) }).strict(),
    z.object({ op: z.literal("remove-nodes"), nodeIds: z.array(nodeId).min(1).max(128) }).strict(),
    z.object({ op: z.literal("upsert-role-styles"), styles: z.array(roleReplacement).min(1).max(64) }).strict(),
    z.object({ op: z.literal("set-node-field"), nodeId, field: nodeField, value: explicitValue }).strict(),
    z.object({ op: z.literal("set-role-field"), role: roleId, field: z.enum(["declarations", "states"]), value: explicitValue }).strict(),
    z.object({ op: z.literal("set-plan-field"), field: planField, value: explicitValue }).strict(),
    z.object({ op: z.literal("replace-bindings"), bindings: VisualSemanticGraphSchema.shape.bindings }).strict(),
  ])).min(1).max(VISUAL_SEMANTIC_DELTA_LIMITS.maxOperations),
}).strict();
export type VisualSemanticDeltaGraph = VisualSemanticGraph & { plan: VisualSemanticGraph["plan"] & Record<string, unknown> };
export class VisualSemanticDeltaError extends Error {
  constructor(code: string) { super(code); this.name = "VisualSemanticDeltaError"; }
}
function fail(code: string): never { throw new VisualSemanticDeltaError(code); }
function byteLength(value: unknown): number { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** Only uniquely addressed, bounded drafts qualify. This does not validate or approve their semantics/topology. */
export function readVisualSemanticDeltaBase(raw: unknown): VisualSemanticDeltaGraph | null {
  try {
    const addressable = readAddressableVisualSemanticGraph(raw);
    if (!addressable) return null;
    const graph = addressable as VisualSemanticDeltaGraph;
    const styles: unknown = graph.plan.roleStyles;
    if (!Array.isArray(styles) || styles.length > 64) return null;
    const roles = styles.map(style => record(style) ? roleId.safeParse(style.role) : null);
    if (roles.some(role => !role?.success)) return null;
    return new Set(roles.flatMap(role => role?.success ? [role.data] : [])).size === styles.length ? graph : null;
  } catch { return null; }
}

/** Applies model-authored values to a copy; the caller must run every strict graph/native/authority gate afterwards. */
export function applyVisualSemanticDelta(base: unknown, proposal: unknown, allowed: VisualSemanticDeltaScope): VisualSemanticDeltaGraph {
  const original = readVisualSemanticDeltaBase(base);
  if (!original) fail("SEMANTIC_DELTA_BASE_INVALID");
  if (byteLength(proposal) > VISUAL_SEMANTIC_DELTA_LIMITS.maxDeltaBytes) fail("SEMANTIC_DELTA_TOO_LARGE");
  assertVisualSemanticGraphPayloadDepth(proposal);
  const parsed = VisualSemanticDeltaSchema.safeParse(proposal);
  const scope = VisualSemanticDeltaScopeSchema.safeParse(allowed);
  if (!parsed.success || !scope.success) fail("SEMANTIC_DELTA_SCHEMA_INVALID");
  const delta = parsed.data;
  if (delta.baseDraftHash !== canonicalServerHash(base)) fail("SEMANTIC_DELTA_BASE_MISMATCH");
  const result = structuredClone(original);
  const operations = new Set<string>();
  const changedNodes = new Set<string>();
  const changedRoles = new Set<string>();
  const nodeFields = new Set<string>();
  const roleFields = new Set<string>();
  let changes = 0;
  for (const operation of delta.operations) {
    const key = operation.op === "set-plan-field" ? `${operation.op}:${operation.field}`
      : operation.op === "set-node-field" ? `${operation.op}:${operation.nodeId}:${operation.field}`
      : operation.op === "set-role-field" ? `${operation.op}:${operation.role}:${operation.field}` : operation.op;
    if (operations.has(key)) fail("SEMANTIC_DELTA_DUPLICATE_OPERATION");
    operations.add(key);
    if (operation.op === "upsert-nodes") {
      for (const node of operation.nodes) {
        if (changedNodes.has(node.id) || nodeFields.has(node.id)) fail("SEMANTIC_DELTA_NODE_CONFLICT");
        changedNodes.add(node.id); changes++;
        const index = result.nodes.findIndex(item => item.id === node.id);
        if (index < 0) result.nodes.push(structuredClone(node));
        else result.nodes[index] = structuredClone(node);
      }
    } else if (operation.op === "remove-nodes") {
      for (const id of operation.nodeIds) {
        if (changedNodes.has(id) || nodeFields.has(id) || !result.nodes.some(node => node.id === id)) fail("SEMANTIC_DELTA_NODE_CONFLICT");
        changedNodes.add(id); changes++;
      }
      result.nodes = result.nodes.filter(node => !operation.nodeIds.includes(node.id));
    } else if (operation.op === "upsert-role-styles") {
      const styles = result.plan.roleStyles as Array<Record<string, unknown>>;
      for (const style of operation.styles) {
        if (changedRoles.has(style.role) || roleFields.has(style.role)) fail("SEMANTIC_DELTA_ROLE_CONFLICT");
        changedRoles.add(style.role); changes++;
        const index = styles.findIndex(item => item.role === style.role);
        if (index >= 0 && !scope.data.roleIds.includes(style.role)) fail("SEMANTIC_DELTA_ROLE_NOT_ALLOWED");
        if (index < 0) styles.push(structuredClone(style));
        else styles[index] = structuredClone(style);
      }
    } else if (operation.op === "set-node-field") {
      const node = result.nodes.find(item => item.id === operation.nodeId);
      if (!node || changedNodes.has(node.id)) fail("SEMANTIC_DELTA_NODE_CONFLICT");
      nodeFields.add(node.id);
      (node as Record<string, unknown>)[operation.field] = structuredClone(operation.value); changes++;
    } else if (operation.op === "set-role-field") {
      const style = (result.plan.roleStyles as Array<Record<string, unknown>>).find(item => item.role === operation.role);
      if (!style || changedRoles.has(operation.role)) fail("SEMANTIC_DELTA_ROLE_CONFLICT");
      if (!scope.data.roleIds.includes(operation.role)) fail("SEMANTIC_DELTA_ROLE_NOT_ALLOWED");
      roleFields.add(operation.role); style[operation.field] = structuredClone(operation.value); changes++;
    } else if (operation.op === "set-plan-field") {
      if (!scope.data.planFields.includes(operation.field)) fail("SEMANTIC_DELTA_FIELD_NOT_ALLOWED");
      (result.plan as Record<string, unknown>)[operation.field] = structuredClone(operation.value); changes++;
    } else { result.bindings = structuredClone(operation.bindings); changes++; }
    if (changes > VISUAL_SEMANTIC_DELTA_LIMITS.maxChanges) fail("SEMANTIC_DELTA_CHANGE_LIMIT");
  }
  if (byteLength(result) > VISUAL_SEMANTIC_DELTA_LIMITS.maxMergedBytes) fail("SEMANTIC_DELTA_MERGED_TOO_LARGE");
  assertVisualSemanticGraphPayloadDepth(result);
  if (!VisualSemanticGraphSchema.safeParse(result).success) fail("SEMANTIC_DELTA_RESULT_SCHEMA_INVALID");
  if (canonicalServerHash(result) === canonicalServerHash(base)) fail("SEMANTIC_DELTA_NO_CHANGE");
  return result;
}

export function visualSemanticDeltaContract() {
  return { schema: VISUAL_SEMANTIC_DELTA_VERSION, schemaDefinition: z.toJSONSchema(VisualSemanticDeltaSchema),
    scopeDefinition: z.toJSONSchema(VisualSemanticDeltaScopeSchema), limits: VISUAL_SEMANTIC_DELTA_LIMITS,
    draftVersion: VISUAL_SEMANTIC_DRAFT_VERSION, draftSchemaDefinition: z.toJSONSchema(VisualSemanticGraphDraftSchema) };
}
// end
