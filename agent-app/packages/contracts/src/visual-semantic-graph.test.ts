// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalServerHash } from "./server-plan-envelope.js";
import { VisualSemanticPlanSchema } from "./generation-snapshot.js";
import { assembleVisualSemanticGraph, serializeVisualSemanticGraph, visualSemanticGraphContract } from "./visual-semantic-graph.js";

function sample() {
  const golden = JSON.parse(readFileSync(new URL("../../../tests/fixtures/creative-goldens/management-admin.json", import.meta.url), "utf8")) as { plan: unknown };
  const native = VisualSemanticPlanSchema.parse({ schema: "kf-visual-semantic-plan/v1", plan: golden.plan, bindings: [] });
  return { native, graph: serializeVisualSemanticGraph(native), authority: {
    blueprintHash: native.plan.blueprintHash, candidateBundleHash: native.plan.candidateBundleHash,
  } };
}
describe("flat visual semantic graph", () => {
  it("round-trips a real native plan without dropping payload or changing its identity", () => {
    const { native, graph, authority } = sample();
    const before = canonicalServerHash(native);
    const assembled = assembleVisualSemanticGraph(graph, authority);
    expect(assembled).toEqual(native);
    expect(canonicalServerHash(assembled)).toBe(before);
    expect(graph.plan).not.toHaveProperty("blueprintHash");
    expect(graph.plan).not.toHaveProperty("candidateBundleHash");
    expect(JSON.stringify(graph)).not.toContain('"children":');
    expect(VisualSemanticPlanSchema.parse(assembled)).toEqual(native);
  });
  it("is deterministic when declarations are reordered but explicit child order is preserved", () => {
    const { graph, authority } = sample();
    expect(assembleVisualSemanticGraph({ ...graph, nodes: [...graph.nodes].reverse() }, authority))
      .toEqual(assembleVisualSemanticGraph(graph, authority));
  });
  it.each(["missing", "duplicate", "shared", "orphan", "cycle", "unknown-field", "inline-tree", "model-hash"] as const)("rejects %s graph corruption before assembly", mutation => {
    const { graph, authority } = sample();
    const root = graph.nodes.find(node => node.id === graph.plan.pages[0]!.rootNodeId)!;
    if (root.kind !== "layout") throw new Error("layout fixture required");
    if (mutation === "missing") root.childNodeIds[0] = "missing-node";
    if (mutation === "duplicate") graph.nodes.push(structuredClone(root));
    if (mutation === "shared") root.childNodeIds.push(root.childNodeIds[0]!);
    if (mutation === "cycle") root.childNodeIds = [root.id];
    if (mutation === "orphan") graph.nodes.push({ kind: "control", id: "unreferenced" });
    if (mutation === "unknown-field") Object.assign(root, { configureData: "not allowed" });
    if (mutation === "inline-tree") Object.assign(root, { children: [] });
    if (mutation === "model-hash") Object.assign(graph.plan, { blueprintHash: "a".repeat(64) });
    expect(() => assembleVisualSemanticGraph(graph, authority)).toThrow(/SEMANTIC_GRAPH_/);
  });
  it("preserves invalid semantic payload for the existing strict validator instead of fixing it", () => {
    const { graph, authority } = sample();
    const control = graph.nodes.find(node => node.kind === "control")!;
    Object.assign(control, { styleRole: "nonexistent-role", eventBindings: null });
    const assembled = assembleVisualSemanticGraph(graph, authority);
    expect(() => VisualSemanticPlanSchema.parse(assembled)).toThrow();
    expect(JSON.stringify(assembled)).toContain('"eventBindings":null');
  });
  it("rejects shared roots across pages and overlays", () => {
    const { graph, authority } = sample();
    graph.plan.pages.push({ ...graph.plan.pages[0]!, id: "another-page" });
    expect(() => assembleVisualSemanticGraph(graph, authority)).toThrow("SEMANTIC_GRAPH_SHARED_ROOT");
  });
  it("keeps the original twelve-level tree limit despite the shallow wire representation", () => {
    const { graph, authority } = sample();
    const root = graph.nodes.find(node => node.id === graph.plan.pages[0]!.rootNodeId)!;
    if (root.kind !== "layout") throw new Error("layout fixture required");
    let parent = root;
    const original = [...root.childNodeIds];
    for (let index = 0; index < 13; index++) {
      const next = { ...structuredClone(root), id: `chain-${index}`, childNodeIds: [] as string[] };
      parent.childNodeIds = [next.id]; graph.nodes.push(next); parent = next;
    }
    parent.childNodeIds = original;
    expect(() => assembleVisualSemanticGraph(graph, authority)).toThrow("SEMANTIC_GRAPH_TREE_DEPTH");
  });
  it("freezes the wire schema and the unchanged node and depth budgets", () => {
    expect(visualSemanticGraphContract()).toMatchObject({ schema: "kf-visual-semantic-graph/v1", maxNodes: 1000, maxDepth: 12 });
  });
  it("round-trips repeater templates, registered-module slots and overlay roots", () => {
    const { native, authority } = sample();
    const page = native.plan.pages[0]!;
    if (page.root.kind !== "layout") throw new Error("layout fixture required");
    const pending = [page.root];
    let leaf: import("./solution-implementation-plan.js").SolutionNode | undefined;
    while (pending.length && !leaf) {
      const current = pending.pop()!;
      leaf = current.children.find(node => node.kind === "control");
      pending.push(...current.children.filter(node => node.kind === "layout"));
    }
    if (leaf?.kind !== "control") throw new Error("control fixture required");
    const child = (id: string) => ({ ...structuredClone(leaf), id, eventBindings: [] });
    native.plan.mockData.push({ id: "graph-records", purpose: "图结构测试", fields: [
      { key: "recordKey", label: "标识", type: "text" }, { key: "label", label: "名称", type: "text" },
    ], records: [{ values: [{ field: "recordKey", value: "row1" }, { field: "label", value: "能源状态" }] }] });
    page.root.children.push({ kind: "repeater", id: "graph-repeater", sourceBlueprintRegionIds: leaf.sourceBlueprintRegionIds,
      intent: { ...leaf.intent, groupWith: [] }, mockDataId: "graph-records", itemAlias: "row", keyField: "recordKey", maxItems: 1,
      template: { ...child("graph-template"), content: { kind: "repeater-field", itemAlias: "row", field: "label" } } });
    page.root.children.push({ kind: "registered-module", id: "graph-module", sourceBlueprintRegionIds: leaf.sourceBlueprintRegionIds,
      intent: { ...leaf.intent, groupWith: [] }, moduleKind: "metric.kpi-grid", templateVersion: "1.0.0", variant: "compact", title: "测试模块",
      eventBindings: [], slots: [{ slotId: "body", children: [child("graph-module-child")] }] });
    native.plan.localState.push({ id: "graph-overlay-visible", purpose: "浮层可见", type: "boolean", initialValue: false });
    native.plan.overlays.push({ id: "graph-overlay", title: "测试浮层", purpose: "图结构转换", presentation: "dialog", hostPageId: page.id,
      sourceBlueprintPageId: page.sourceBlueprintPageId, sourceBlueprintRegionIds: leaf.sourceBlueprintRegionIds,
      visibleStateId: "graph-overlay-visible", dismissible: true, root: child("graph-overlay-root") });
    const validated = VisualSemanticPlanSchema.parse(native);
    expect(assembleVisualSemanticGraph(serializeVisualSemanticGraph(validated), authority)).toEqual(validated);
  });
  it("rejects unreachable cycles and excessive graph budgets", () => {
    const { graph, authority } = sample();
    graph.nodes.push({ kind: "layout", id: "unused-a", childNodeIds: ["unused-b"] }, { kind: "layout", id: "unused-b", childNodeIds: ["unused-a"] });
    expect(() => assembleVisualSemanticGraph(graph, authority)).toThrow("SEMANTIC_GRAPH_CYCLE");
    graph.nodes = Array.from({ length: 1001 }, (_, index) => ({ kind: "control" as const, id: `too-many-${index}` }));
    expect(() => assembleVisualSemanticGraph(graph, authority)).toThrow("SEMANTIC_GRAPH_SCHEMA_INVALID");
  });
  it("bounds payload nesting before native normalization", () => {
    const { graph, authority } = sample();
    let nested: unknown = "leaf";
    for (let index = 0; index < 50; index++) nested = { nested };
    Object.assign(graph.plan, { theme: nested });
    expect(() => assembleVisualSemanticGraph(graph, authority)).toThrow("SEMANTIC_GRAPH_PAYLOAD_DEPTH");
  });
});
// end
