// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalServerHash, CustomerSolutionBlueprintSchema, NodeIntentSchema, VisualPlanningContextSchema, VisualSemanticGraphSchema } from "@kf/contracts";
import type { ModelPortContext } from "@kf/agent-orchestrator";
import { getDesignKnowledgeSnapshot, retrieveCapabilities } from "@kf/domain-client";
import { inspectVisualSemanticResponse } from "./visual-semantic-output.js";
import { inspectVisualGraphCompleteness } from "./visual-semantic-completeness.js";

function sample() {
  const root = new URL("../../../../tests/fixtures/energy-overview-20261023/live-layout-proposal-incomplete-graph/", import.meta.url);
  const read = (name: string): unknown => JSON.parse(readFileSync(new URL(name, root), "utf8"));
  const blueprint = CustomerSolutionBlueprintSchema.parse(read("blueprint.json"));
  const visualReference = VisualPlanningContextSchema.parse({ ...(read("reference-review.json") as object), acceptedDifferences: read("accepted-differences.json") });
  const context: ModelPortContext = { tenantId: "offline-tenant", userId: "offline-user", workspaceId: "offline-workspace", conversationId: "offline-conversation",
    currentRevisionId: "offline-revision", currentProjectKey: "kingclient", generationWorkflow: "creative-v2", recentMessages: [], assetCatalog: [],
    confirmedSolutionBlueprint: blueprint, visualReference, capabilityCandidates: retrieveCapabilities({ blueprint, visualReference, knowledge: getDesignKnowledgeSnapshot() }) };
  const initial = read("initial-provider-reply.json") as { content: string; finishReason: string };
  const repaired = read("repaired-provider-reply.json") as { content: string; finishReason: string };
  return { context, initial, repaired };
}
const inspect = (context: ModelPortContext, reply: { content: string; finishReason: string }) => inspectVisualSemanticResponse(context,
  { text: reply.content, finishReason: reply.finishReason }, []);

describe("bounded complete-graph feedback", () => {
  it("reports all 39 missing reviewed regions alongside the original journey failure", () => {
    const test = sample(); const before = canonicalServerHash(test.initial);
    const result = inspect(test.context, test.initial);
    expect(result.inspection).toMatchObject({ ok: false, repairable: true, issues: expect.arrayContaining([
      expect.objectContaining({ code: "SEMANTIC_PLAN_INVALID" }),
      expect.objectContaining({ code: "VISUAL_REGION_COVERAGE_INCOMPLETE", count: 39,
        regionIds: expect.arrayContaining(["main", "sidebar", "kpi-row"]) }),
    ]) });
    expect(result.raw).toEqual(JSON.parse(test.initial.content));
    expect(canonicalServerHash(test.initial)).toBe(before);
  });
  it("diagnoses the disconnected header and the independent KPI grouping cycle without adding or deleting an edge", () => {
    const test = sample(); const before = canonicalServerHash(test.repaired);
    const result = inspect(test.context, test.repaired);
    expect(result.inspection).toMatchObject({ ok: false, repairable: true, issues: expect.arrayContaining([
      expect.objectContaining({ code: "SEMANTIC_GRAPH_ORPHAN", nodeId: "node-header-band" }),
      expect.objectContaining({ code: "SEMANTIC_GRAPH_UNREACHABLE_NODES", count: 4, nodeIds: expect.arrayContaining(["node-header-band"]) }),
      expect.objectContaining({ code: "VISUAL_LAYOUT_GROUP_INVALID", nodeId: "node-kpi-today" }),
    ]) });
    expect(canonicalServerHash(test.repaired)).toBe(before);
  });
  it("does not turn unknown finish reasons or corrupted authority into a completeness repair", () => {
    const test = sample();
    expect(inspect(test.context, { ...test.initial, finishReason: "length" }).inspection).toMatchObject({ ok: false, repairable: false });
    test.context.visualReference!.specHash = "0".repeat(64);
    expect(inspect(test.context, test.initial).inspection).toMatchObject({ ok: false, repairable: false, issues: [{ code: "VISUAL_SEMANTIC_TRUSTED_CONTEXT_INVALID" }] });
  });
  it("reports unknown binding regions and absent binding nodes without treating duplicate bindings as coverage", () => {
    const test = sample(); const graph = VisualSemanticGraphSchema.parse(JSON.parse(test.initial.content));
    graph.bindings.push(...graph.bindings, { regionId: "unreviewed", nodeId: "absent-node" });
    const before = canonicalServerHash(graph);
    const result = inspectVisualGraphCompleteness(test.context.visualReference!, graph);
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "VISUAL_REGION_COVERAGE_INCOMPLETE", count: 39 }),
      expect.objectContaining({ code: "VISUAL_BINDING_REGION_INVALID", regionIds: ["unreviewed"] }),
      expect.objectContaining({ code: "VISUAL_BINDING_NODE_MISSING", nodeIds: ["absent-node"] }),
    ]));
    expect(canonicalServerHash(graph)).toBe(before);
  });
  it("terminates on cyclic structural references while leaving the strict graph cycle rejection intact", () => {
    const test = sample(); const graph = VisualSemanticGraphSchema.parse(JSON.parse(test.initial.content));
    const root = graph.nodes.find(node => node.id === graph.plan.pages[0]!.rootNodeId)!;
    if (root.kind !== "layout") throw new Error("layout root expected");
    root.childNodeIds.push(root.id);
    expect(() => inspectVisualGraphCompleteness(test.context.visualReference!, graph)).not.toThrow();
    expect(inspect(test.context, { content: JSON.stringify(graph), finishReason: "stop" }).inspection)
      .toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "SEMANTIC_GRAPH_CYCLE" })]) });
  });
  it("keeps bounded grouping diagnostics and never supplies a missing/null groupWith value", () => {
    const test = sample(); const graph = VisualSemanticGraphSchema.parse(JSON.parse(test.repaired.content));
    for (const node of graph.nodes) {
      const payload: Record<string, unknown> = node;
      payload.intent = { ...NodeIntentSchema.parse(payload.intent), groupWith: [node.id] };
    }
    const response = { content: JSON.stringify(graph), finishReason: "stop" };
    const before = canonicalServerHash(response);
    const checked = inspect(test.context, response).inspection;
    if (checked.ok) throw new Error("invalid grouping cannot be accepted");
    expect(checked.issues.length).toBeLessThanOrEqual(12);
    expect(checked.issues.filter(issue => issue.code === "VISUAL_LAYOUT_GROUP_INVALID").length).toBeGreaterThan(0);
    expect(canonicalServerHash(response)).toBe(before);
    for (const node of graph.nodes) {
      const payload: Record<string, unknown> = node;
      payload.intent = { ...NodeIntentSchema.parse(payload.intent), groupWith: null };
    }
    expect(inspectVisualGraphCompleteness(test.context.visualReference!, graph).some(issue => issue.code === "VISUAL_LAYOUT_GROUP_INVALID")).toBe(false);
  });
  it("allows valid nonempty acyclic sibling groups in the diagnostic projection without declaring the semantic plan successful", () => {
    const test = sample(); const graph = VisualSemanticGraphSchema.parse(JSON.parse(test.repaired.content));
    const root = graph.nodes.find(node => node.id === graph.plan.pages[0]!.rootNodeId)!;
    if (root.kind !== "layout") throw new Error("layout root expected");
    root.childNodeIds.unshift("node-header-band");
    for (const node of graph.nodes) {
      const payload: Record<string, unknown> = node;
      payload.intent = { ...NodeIntentSchema.parse(payload.intent), groupWith: node.id === "node-kpi-today" ? ["node-kpi-power"] : [] };
    }
    expect(inspectVisualGraphCompleteness(test.context.visualReference!, graph)).toEqual([]);
    expect(inspect(test.context, { content: JSON.stringify(graph), finishReason: "stop" }).inspection.ok).toBe(false);
  });
});
// end
