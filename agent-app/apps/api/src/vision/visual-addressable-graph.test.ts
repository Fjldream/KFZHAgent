// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalServerHash, CustomerSolutionBlueprintSchema, VisualPlanningContextSchema, readVisualSemanticDeltaBase,
  VisualSemanticGraphSchema, type VisualSemanticDeltaGraph } from "@kf/contracts";
import { getDesignKnowledgeSnapshot, retrieveCapabilities } from "@kf/domain-client";
import type { ModelPortContext } from "@kf/agent-orchestrator";
import { inspectVisualSemanticResponse } from "./visual-semantic-output.js";
import { inspectVisualSemanticRepairResponse, visualSemanticRepairProtocol } from "./visual-semantic-repair.js";
import { inspectVisualGraphCompleteness } from "./visual-semantic-completeness.js";
import { inspectVisualSemanticCapabilities } from "./visual-semantic-diagnostics.js";
import { buildVisualSemanticMessages, buildVisualSemanticRepairMessages } from "../conversations/deepseek-model.js";

function sample(directoryName = "live-static-data-empty-layout") {
  const directory = new URL(`../../../../tests/fixtures/energy-overview-20261023/${directoryName}/`, import.meta.url);
  const read = (file: string): unknown => JSON.parse(readFileSync(new URL(file, directory), "utf8"));
  const blueprint = CustomerSolutionBlueprintSchema.parse(read("blueprint.json"));
  const visualReference = VisualPlanningContextSchema.parse({ ...(read("reference-review.json") as object), acceptedDifferences: read("accepted-differences.json") });
  const context: ModelPortContext = { tenantId: "offline-tenant", userId: "offline-user", workspaceId: "offline-workspace", conversationId: "offline-conversation",
    currentRevisionId: "offline-revision", currentProjectKey: "kingclient", generationWorkflow: "creative-v2", recentMessages: [], assetCatalog: [],
    confirmedSolutionBlueprint: blueprint, visualReference, capabilityCandidates: retrieveCapabilities({ blueprint, visualReference, knowledge: getDesignKnowledgeSnapshot() }) };
  const reply = read("initial-provider-reply.json") as { content: string; finishReason: string };
  const graph = readVisualSemanticDeltaBase(JSON.parse(reply.content));
  if (!graph) throw new Error("addressable fixture required");
  return { context, reply, graph, read };
}

/** An explicit test-authored model proposal, never imported by the production repair path. */
function explicitFixtureProposal(graph: VisualSemanticDeltaGraph) {
  const empty = graph.nodes.filter(node => node.kind === "layout" && !node.childNodeIds.length).map(node => node.id);
  const nodes = structuredClone(graph.nodes.filter(node => !empty.includes(node.id))) as Array<Record<string, unknown> & { id: string }>;
  for (const node of nodes) {
    node.intent = { ...(node.intent as object), groupWith: [] };
    if (node.kind === "layout") node.childNodeIds = (node.childNodeIds as string[]).filter(id => !empty.includes(id));
  }
  const devices = nodes.find(node => node.id === "node-devices")!;
  const inner = structuredClone(devices); inner.id = "node-devices-explicit-content";
  delete inner.styleRole; delete inner.styleOverride;
  devices.layout = "row"; devices.childNodeIds = [inner.id]; nodes.push(inner);
  const replacements = nodes.filter(node => canonicalServerHash(node) !== canonicalServerHash(graph.nodes.find(original => original.id === node.id) ?? null));
  return { schema: "kf-visual-semantic-graph-delta/v1", baseDraftHash: canonicalServerHash(graph), operations: [
    { op: "remove-nodes", nodeIds: empty }, { op: "upsert-nodes", nodes: replacements },
  ] };
}

describe("addressable failed visual proposals", () => {
  it("jointly diagnoses actual empty layouts, hidden groups and approved-layout mismatch in the original bytes", () => {
    const test = sample(); const before = canonicalServerHash(test.graph);
    const inspected = inspectVisualSemanticResponse(test.context, { text: test.reply.content, finishReason: test.reply.finishReason }, []);
    expect(inspected.inspection).toMatchObject({ ok: false, repairable: true, issues: expect.arrayContaining([
      expect.objectContaining({ code: "SEMANTIC_GRAPH_SCHEMA_INVALID", path: "nodes.19.childNodeIds" }),
      expect.objectContaining({ code: "SEMANTIC_GRAPH_EMPTY_LAYOUTS", count: 3, nodeIds: ["node-kpi-today-col", "node-kpi-power-col", "node-kpi-online-col"] }),
      expect.objectContaining({ code: "VISUAL_LAYOUT_GROUP_INVALID", nodeId: "node-kpi-today-col" }),
      expect.objectContaining({ code: "VISUAL_BLUEPRINT_LAYOUT_CAPABILITY_MISMATCH", regionId: "devices" }),
    ]) });
    if (inspected.inspection.ok) throw new Error("negative required");
    expect(inspected.inspection.issues.length).toBeLessThanOrEqual(12);
    expect(visualSemanticRepairProtocol(test.graph, inspected.inspection.issues)).toMatchObject({ mode: "delta", scope: { roleIds: [] } });
    const messages = buildVisualSemanticRepairMessages(test.context, test.graph, inspected.inspection.issues);
    expect(messages[0]).toEqual(buildVisualSemanticMessages(test.context)[0]);
    expect(Buffer.byteLength(JSON.stringify(messages))).toBeLessThanOrEqual(128000);
    const payload = JSON.parse(messages[1]!.content) as { failedDraft: unknown; repairProtocol: { mode: string } };
    expect(payload.failedDraft).toEqual(test.graph);
    expect(payload.repairProtocol.mode).toBe("delta");
    expect(VisualSemanticGraphSchema.safeParse(test.graph).success).toBe(false);
    expect(canonicalServerHash(test.graph)).toBe(before);
  });
  it("fully compiles an explicit two-operation repair without changing untouched nodes, metadata or styles", () => {
    const test = sample(); const before = canonicalServerHash(test.graph);
    const delta = explicitFixtureProposal(test.graph);
    const result = inspectVisualSemanticRepairResponse(test.context, { text: JSON.stringify(delta), finishReason: "stop" }, [], test.graph, []);
    expect(result.inspection, JSON.stringify(result.inspection.ok ? { ok: true } : result.inspection)).toMatchObject({ ok: true });
    const merged = result.raw as VisualSemanticDeltaGraph;
    expect(merged.plan).toEqual(test.graph.plan);
    expect(merged.bindings).toEqual(test.graph.bindings);
    const changed = new Set(delta.operations.flatMap(operation => operation.nodes?.map(node => node.id) ?? operation.nodeIds ?? []));
    expect(merged.nodes.filter(node => !changed.has(node.id))).toEqual(test.graph.nodes.filter(node => !changed.has(node.id)));
    expect(canonicalServerHash(test.graph)).toBe(before);
  });
  it("rejects partial repairs, dangling removals, whole-graph responses and wrong hashes without a fallback", () => {
    const test = sample(); const delta = explicitFixtureProposal(test.graph); const before = canonicalServerHash(test.graph);
    const invalid = [
      { ...delta, operations: delta.operations.slice(0, 1) },
      { ...delta, operations: [{ op: "set-node-field", nodeId: "node-kpi-today", field: "intent", value: { groupWith: [] } }] },
      test.graph,
      { ...delta, baseDraftHash: "0".repeat(64) },
    ];
    for (const proposal of invalid) expect(inspectVisualSemanticRepairResponse(test.context,
      { text: JSON.stringify(proposal), finishReason: "stop" }, [], test.graph, []).inspection).toMatchObject({ ok: false, repairable: false });
    expect(canonicalServerHash(test.graph)).toBe(before);
  });
  it("keeps ambiguous, unknown, oversized and deeply nested data outside independent graph diagnostics", () => {
    const test = sample();
    const ambiguous = structuredClone(test.graph); ambiguous.nodes.push(structuredClone(ambiguous.nodes[0]!));
    const oversized = { ...test.graph, padding: "界".repeat(22000) };
    const unknown = { ...test.graph, nativeIds: [] };
    const deep: Record<string, unknown> = {}; let pointer = deep;
    for (let index = 0; index < 50; index++) { const next = {}; pointer.child = next; pointer = next; }
    for (const raw of [ambiguous, oversized, unknown, { ...test.graph, deep }]) {
      expect(inspectVisualGraphCompleteness(test.context.visualReference!, raw)).toEqual([]);
      expect(inspectVisualSemanticCapabilities(test.context, raw, [])).toEqual([]);
    }
  });
  it("keeps the latest actual delta invalid only for its reviewed device binding and verifies an explicit local composition", () => {
    const test = sample("live-delta-layout-binding"); const before = canonicalServerHash(test.graph);
    const first = inspectVisualSemanticResponse(test.context, { text: test.reply.content, finishReason: test.reply.finishReason }, []);
    expect(first.inspection).toMatchObject({ ok: false, issues: expect.arrayContaining([
      expect.objectContaining({ code: "SEMANTIC_GRAPH_UNREACHABLE_NODES", count: 24 }),
    ]) });
    if (first.inspection.ok) throw new Error("negative required");
    const reply = test.read("repair-delta-provider-reply.json") as { content: string; finishReason: string };
    const merged = inspectVisualSemanticRepairResponse(test.context, { text: reply.content, finishReason: reply.finishReason }, [], test.graph, first.inspection.issues);
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    expect(merged.inspection).toMatchObject({ ok: false, repairable: false, issues: [{ code: "VISUAL_BLUEPRINT_LAYOUT_CAPABILITY_MISMATCH", regionId: "devices", nodeId: "node-devices-column" }] });
    // end
    const counterfactual = structuredClone(merged.raw) as VisualSemanticDeltaGraph;
    const devices = counterfactual.nodes.find(node => node.id === "node-devices-column")! as VisualSemanticDeltaGraph["nodes"][number] & Record<string, unknown>;
    if (devices.kind !== "layout") throw new Error("layout required");
    const inner = { ...structuredClone(devices), id: "node-devices-explicit-content" } as VisualSemanticDeltaGraph["nodes"][number] & Record<string, unknown>;
    delete inner.styleRole; delete inner.styleOverride;
    devices.layout = "row"; devices.childNodeIds = [inner.id]; counterfactual.nodes.push(inner);
    expect(inspectVisualSemanticResponse(test.context, { text: JSON.stringify(counterfactual), finishReason: "stop" }, []).inspection).toMatchObject({ ok: true });
    expect(counterfactual.plan).toEqual(test.graph.plan);
    expect(counterfactual.bindings).toEqual(test.graph.bindings);
    expect(canonicalServerHash(test.graph)).toBe(before);
  });
});
// end
