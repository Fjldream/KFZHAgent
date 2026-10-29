// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalServerHash } from "./server-plan-envelope.js";
import { applyVisualSemanticDelta, readVisualSemanticDeltaBase } from "./visual-semantic-delta.js";
import { assembleVisualSemanticGraph, VisualSemanticGraphSchema } from "./visual-semantic-graph.js";

function sample() {
  const reply = JSON.parse(readFileSync(new URL("../../../tests/fixtures/energy-overview-20261023/live-semantic-completeness-style-regression/initial-provider-reply.json", import.meta.url), "utf8")) as { content: string };
  return JSON.parse(reply.content) as { plan: Record<string, unknown>; nodes: Array<Record<string, unknown> & { id: string }>; bindings: unknown[] };
}
const scope = { planFields: ["pages" as const, "overlays" as const], roleIds: [], allowNewRoles: true as const };
function patch(base: unknown, operations: unknown[]) { return { schema: "kf-visual-semantic-graph-delta/v1", baseDraftHash: canonicalServerHash(base), operations }; }

describe("bounded explicit visual graph deltas", () => {
  it("applies an explicit edge proposal while preserving every untouched metadata/style/node value and the original draft", () => {
    const base = sample(); const before = canonicalServerHash(base);
    const main = structuredClone(base.nodes.find(node => node.id === "node-main")!);
    main.childNodeIds = [...main.childNodeIds as string[], "node-main-subtitle"];
    const result = applyVisualSemanticDelta(base, patch(base, [{ op: "upsert-nodes", nodes: [main] }]), scope);
    expect(result.plan).toEqual(base.plan);
    expect(result.bindings).toEqual(base.bindings);
    expect(result.nodes.filter(node => node.id !== "node-main")).toEqual(base.nodes.filter(node => node.id !== "node-main"));
    expect(canonicalServerHash(base)).toBe(before);
  });
  it.each(["wrong-hash", "unknown-field", "duplicate-node", "conflict", "no-change", "forbidden-field", "unrelated-style"] as const)("rejects %s without mutating the base", scenario => {
    const base = sample(); const before = canonicalServerHash(base);
    const node = structuredClone(base.nodes[0]!); node.intent = { importance: "primary" };
    const style = (base.plan.roleStyles as Array<{ role: string }>)[0]!;
    const operations = scenario === "duplicate-node" ? [{ op: "upsert-nodes", nodes: [node, node] }]
      : scenario === "conflict" ? [{ op: "upsert-nodes", nodes: [node] }, { op: "remove-nodes", nodeIds: [node.id] }]
      : scenario === "no-change" ? [{ op: "upsert-nodes", nodes: [base.nodes[0]] }]
      : scenario === "forbidden-field" ? [{ op: "set-plan-field", field: "blueprintHash", value: "0".repeat(64) }]
      : scenario === "unrelated-style" ? [{ op: "upsert-role-styles", styles: [{ role: style.role, declarations: {}, states: {} }] }]
      : [{ op: "upsert-nodes", nodes: [node] }];
    const delta = patch(base, operations);
    if (scenario === "wrong-hash") delta.baseDraftHash = "0".repeat(64);
    const input = scenario === "unknown-field" ? { ...delta, path: "/etc/passwd" } : delta;
    expect(() => applyVisualSemanticDelta(base, input, scope)).toThrow();
    expect(canonicalServerHash(base)).toBe(before);
  });
  it("allows only explicitly scoped existing style replacements, rejecting top-level disabled rather than moving or deleting it", () => {
    const base = sample(); const role = (base.plan.roleStyles as Array<{ role: string }>)[0]!.role;
    const allowed = { ...scope, roleIds: [role] };
    expect(() => applyVisualSemanticDelta(base, patch(base, [{ op: "upsert-role-styles", styles: [{ role, declarations: {}, states: {}, disabled: {} }] }]), allowed)).toThrow();
    const result = applyVisualSemanticDelta(base, patch(base, [{ op: "upsert-role-styles", styles: [{ role, declarations: {}, states: {} }] }]), allowed);
    expect((result.plan as Record<string, unknown>).roleStyles).not.toEqual(base.plan.roleStyles);
  });
  it("declines identity-ambiguous or non-graph drafts instead of repairing a different base", () => {
    const base = sample(); base.nodes.push(base.nodes[0]!);
    expect(readVisualSemanticDeltaBase(base)).toBeNull();
    expect(readVisualSemanticDeltaBase("{bad}")).toBeNull();
  });
  it("changes only an explicit node field and role state field, preserving the other intent and style declarations", () => {
    const base = sample(); const node = base.nodes[0]!;
    const style = (base.plan.roleStyles as Array<Record<string, unknown> & { role: string }>)[0]!;
    const result = applyVisualSemanticDelta(base, patch(base, [
      { op: "set-node-field", nodeId: node.id, field: "intent", value: { changed: true } },
      { op: "set-role-field", role: style.role, field: "states", value: { disabled: {} } },
    ]), { ...scope, roleIds: [style.role] });
    expect(result.nodes[0]).toEqual({ ...node, intent: { changed: true } });
    expect(((result.plan as Record<string, unknown>).roleStyles as Array<Record<string, unknown>>)[0]!.declarations).toEqual(style.declarations);
  });
  it.each(["id", "kind", "__proto__"])("does not permit protected/unknown node field %s", field => {
    const base = sample();
    expect(() => applyVisualSemanticDelta(base, patch(base, [{ op: "set-node-field", nodeId: base.nodes[0]!.id, field, value: "changed" }]), scope)).toThrow("SEMANTIC_DELTA_SCHEMA_INVALID");
  });
  it("rejects duplicate field writes and fields incompatible with the actual node kind", () => {
    const base = sample(); const control = base.nodes.find(node => node.kind === "control")!;
    const operation = { op: "set-node-field", nodeId: control.id, field: "content", value: "changed" };
    expect(() => applyVisualSemanticDelta(base, patch(base, [operation, operation]), scope)).toThrow("SEMANTIC_DELTA_DUPLICATE_OPERATION");
    expect(() => applyVisualSemanticDelta(base, patch(base, [{ ...operation, field: "childNodeIds", value: [] }]), scope)).toThrow("SEMANTIC_DELTA_RESULT_SCHEMA_INVALID");
  });
  it("enforces the aggregate change and UTF-8 byte budgets before any result can be admitted", () => {
    const base = sample();
    const nodes = Array.from({ length: 128 }, (_, index) => ({ id: `new-${index}`, kind: "control", capabilityId: "text" }));
    expect(() => applyVisualSemanticDelta(base, patch(base, [{ op: "upsert-nodes", nodes }, { op: "replace-bindings", bindings: base.bindings }]), scope)).toThrow("SEMANTIC_DELTA_CHANGE_LIMIT");
    expect(() => applyVisualSemanticDelta(base, patch(base, [{ op: "set-node-field", nodeId: base.nodes[0]!.id, field: "intent", value: "界".repeat(22000) }]), scope)).toThrow("SEMANTIC_DELTA_TOO_LARGE");
  });
  it("declines ambiguous style identities so an index cannot accidentally select a different role", () => {
    const base = sample(); const styles = base.plan.roleStyles as unknown[]; styles.push(styles[0]);
    expect(readVisualSemanticDeltaBase(base)).toBeNull();
  });
});

describe("addressable rejected graphs with empty layout children", () => {
  function emptySample() {
    const reply = JSON.parse(readFileSync(new URL("../../../tests/fixtures/energy-overview-20261023/live-static-data-empty-layout/initial-provider-reply.json", import.meta.url), "utf8")) as { content: string };
    return JSON.parse(reply.content) as ReturnType<typeof sample>;
  }
  it("reads the exact real failed draft while the successful graph and assembler still reject it", () => {
    const base = emptySample(); const before = canonicalServerHash(base);
    expect(readVisualSemanticDeltaBase(base)).toEqual(base);
    expect(VisualSemanticGraphSchema.safeParse(base).success).toBe(false);
    expect(() => assembleVisualSemanticGraph(base, { blueprintHash: "a".repeat(64), candidateBundleHash: "b".repeat(64) })).toThrow("SEMANTIC_GRAPH_SCHEMA_INVALID");
    expect(canonicalServerHash(base)).toBe(before);
  });
  it("requires all empty layouts to be explicitly resolved and never guesses missing child references", () => {
    const base = emptySample(); const before = canonicalServerHash(base);
    const empty = base.nodes.filter(node => node.kind === "layout" && (node.childNodeIds as string[]).length === 0).map(node => node.id);
    expect(empty).toHaveLength(3);
    const partial = { op: "set-node-field", nodeId: empty[0], field: "childNodeIds", value: [base.nodes[0]!.id] };
    expect(() => applyVisualSemanticDelta(base, patch(base, [partial]), scope)).toThrow("SEMANTIC_DELTA_RESULT_SCHEMA_INVALID");
    const parents = base.nodes.filter(node => node.kind === "layout" && (node.childNodeIds as string[]).some(id => empty.includes(id)))
      .map(node => ({ ...node, childNodeIds: (node.childNodeIds as string[]).filter(id => !empty.includes(id)) }));
    const result = applyVisualSemanticDelta(base, patch(base, [{ op: "remove-nodes", nodeIds: empty }, { op: "upsert-nodes", nodes: parents }]), scope);
    expect(VisualSemanticGraphSchema.safeParse(result).success).toBe(true);
    expect(result.plan).toEqual(base.plan);
    expect(result.bindings).toEqual(base.bindings);
    expect(result.nodes.filter(node => !parents.some(parent => parent.id === node.id)))
      .toEqual(base.nodes.filter(node => !empty.includes(node.id) && !parents.some(parent => parent.id === node.id)));
    expect(canonicalServerHash(base)).toBe(before);
  });
  it.each(["missing-children", "bad-children", "too-many-children", "unknown-field", "duplicate-id", "unknown-kind", "unknown-plan-field"] as const)("keeps %s outside the addressable contract", mutation => {
    const base = emptySample(); const node = base.nodes.find(node => node.kind === "layout")!;
    if (mutation === "missing-children") delete node.childNodeIds;
    if (mutation === "bad-children") node.childNodeIds = null;
    if (mutation === "too-many-children") node.childNodeIds = Array(25).fill("some-node");
    if (mutation === "unknown-field") node.nativeIds = [];
    if (mutation === "duplicate-id") base.nodes.push(structuredClone(node));
    if (mutation === "unknown-kind") node.kind = "untrusted-kind";
    if (mutation === "unknown-plan-field") base.plan.blueprintHash = "a".repeat(64);
    expect(readVisualSemanticDeltaBase(base)).toBeNull();
  });
});
// end
