// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalServerHash, CustomerSolutionBlueprintSchema, VisualPlanningContextSchema, VisualSemanticGraphSchema,
  applyVisualSemanticDelta, type VisualSemanticGraph } from "@kf/contracts";
import { getDesignKnowledgeSnapshot, retrieveCapabilities } from "@kf/domain-client";
import type { ModelPortContext } from "@kf/agent-orchestrator";
import { inspectVisualSemanticResponse } from "./visual-semantic-output.js";
import { inspectVisualSemanticRepairResponse, visualSemanticRepairProtocol } from "./visual-semantic-repair.js";

function sample() {
  const directory = new URL("../../../../tests/fixtures/energy-overview-20261023/live-semantic-completeness-style-regression/", import.meta.url);
  const read = (name: string) => JSON.parse(readFileSync(new URL(name, directory), "utf8"));
  const blueprint = CustomerSolutionBlueprintSchema.parse(read("blueprint.json"));
  const visualReference = VisualPlanningContextSchema.parse({ ...read("reference-review.json"), acceptedDifferences: read("accepted-differences.json") });
  const context: ModelPortContext = { tenantId: "offline-tenant", userId: "offline-user", workspaceId: "offline-workspace", conversationId: "offline-conversation",
    currentRevisionId: "offline-revision", currentProjectKey: "kingclient", generationWorkflow: "creative-v2", recentMessages: [], assetCatalog: [],
    confirmedSolutionBlueprint: blueprint, visualReference, capabilityCandidates: retrieveCapabilities({ blueprint, visualReference, knowledge: getDesignKnowledgeSnapshot() }) };
  const reply = read("initial-provider-reply.json") as { content: string; finishReason: string };
  const graph = VisualSemanticGraphSchema.parse(JSON.parse(reply.content));
  const inspected = inspectVisualSemanticResponse(context, { text: reply.content, finishReason: reply.finishReason }, []);
  if (inspected.inspection.ok) throw new Error("original must remain invalid");
  return { context, graph, issues: inspected.inspection.issues };
}
describe("scoped repair and independent native diagnostics", () => {
  it("sees the actual orphan, approved layout mismatch and selected-state failure in the same unmodified draft", () => {
    const test = sample();
    expect(test.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "SEMANTIC_GRAPH_ORPHAN" }),
      expect.objectContaining({ code: "VISUAL_BLUEPRINT_LAYOUT_CAPABILITY_MISMATCH", regionId: "devices" }),
      expect.objectContaining({ code: "NATIVE_STYLE_STATE_UNSUPPORTED", roleIds: ["nav-item-text"] }),
    ]));
    const protocol = visualSemanticRepairProtocol(test.graph, test.issues);
    expect(protocol).toMatchObject({ mode: "delta", scope: { roleIds: ["nav-item-text"] } });
  });
  it("can validate explicit local fixes without rewriting the other roles or any metadata", () => {
    const test = sample(); const before = canonicalServerHash(test.graph);
    const protocol = visualSemanticRepairProtocol(test.graph, test.issues);
    if (protocol.mode !== "delta") throw new Error("delta required");
    const main = test.graph.nodes.find(node => node.id === "node-main")!;
    const binding = test.graph.bindings.find(binding => binding.regionId === "devices")!;
    const device = test.graph.nodes.find(node => node.id === binding.nodeId)!;
    if (main.kind !== "layout" || device.kind !== "layout") throw new Error("layout fixture required");
    const inner = { ...device, id: `${device.id}-content` } as VisualSemanticGraph["nodes"][number] & Record<string, unknown>;
    delete inner.styleRole;
    const styles = (test.graph.plan as Record<string, unknown>).roleStyles as Array<{ role: string; states: Record<string, unknown> }>;
    const states = { ...styles.find(style => style.role === "nav-item-text")!.states }; delete states.selected;
    const delta = { schema: protocol.schema, baseDraftHash: protocol.baseDraftHash, operations: [
      { op: "set-node-field", nodeId: main.id, field: "childNodeIds", value: [...main.childNodeIds.slice(0, 1), "node-main-subtitle", ...main.childNodeIds.slice(1)] },
      { op: "upsert-nodes", nodes: [inner] },
      { op: "set-node-field", nodeId: device.id, field: "layout", value: "row" },
      { op: "set-node-field", nodeId: device.id, field: "childNodeIds", value: [inner.id] },
      { op: "set-role-field", role: "nav-item-text", field: "states", value: states },
    ] };
    const merged = applyVisualSemanticDelta(test.graph, delta, protocol.scope);
    const otherRoles = (value: typeof merged) => ((value.plan as Record<string, unknown>).roleStyles as Array<{ role: string }>).filter(role => role.role !== "nav-item-text");
    expect(otherRoles(merged)).toEqual(otherRoles(test.graph));
    expect(merged.plan.pages).toEqual(test.graph.plan.pages);
    expect(inspectVisualSemanticRepairResponse(test.context, { text: JSON.stringify(delta), finishReason: "stop" }, [], test.graph, test.issues).inspection)
      .toMatchObject({ ok: true });
    expect(canonicalServerHash(test.graph)).toBe(before);
  });
  it("rejects a full rewritten graph, wrong base, or truncated delta without changing formats or granting another allowance", () => {
    const test = sample();
    for (const response of [{ text: JSON.stringify(test.graph), finishReason: "stop" },
      { text: JSON.stringify({ schema: "kf-visual-semantic-graph-delta/v1", baseDraftHash: "0".repeat(64), operations: [] }), finishReason: "stop" },
      { text: "{}", finishReason: "length" }]) {
      expect(inspectVisualSemanticRepairResponse(test.context, response, [], test.graph, test.issues).inspection).toMatchObject({ ok: false, repairable: false });
    }
    expect(visualSemanticRepairProtocol("{bad}", test.issues)).toMatchObject({ mode: "full-graph" });
  });
});
// end
