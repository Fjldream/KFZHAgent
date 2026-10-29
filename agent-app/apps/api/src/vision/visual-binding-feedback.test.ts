// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalServerHash, CustomerSolutionBlueprintSchema, VisualPlanningContextSchema, readVisualSemanticDeltaBase, type VisualSemanticDeltaGraph } from "@kf/contracts";
import { getDesignKnowledgeSnapshot, retrieveCapabilities } from "@kf/domain-client";
import type { ModelPortContext } from "@kf/agent-orchestrator";
import { inspectVisualSemanticResponse } from "./visual-semantic-output.js";
import { inspectVisualSemanticRepairResponse } from "./visual-semantic-repair.js";
import { inspectVisualSemanticCapabilities } from "./visual-semantic-diagnostics.js";
import { visualBindingObligations } from "./visual-layout-obligations.js";
import { buildVisualSemanticMessages, buildVisualSemanticRepairMessages } from "../conversations/deepseek-model.js";

function sample() {
  const root = new URL("../../../../tests/fixtures/energy-overview-20261023/live-delta-layout-binding/", import.meta.url);
  const read = (file: string): unknown => JSON.parse(readFileSync(new URL(file, root), "utf8"));
  const blueprint = CustomerSolutionBlueprintSchema.parse(read("blueprint.json"));
  const visualReference = VisualPlanningContextSchema.parse({ ...(read("reference-review.json") as object), acceptedDifferences: read("accepted-differences.json") });
  const candidates = retrieveCapabilities({ blueprint, visualReference, knowledge: getDesignKnowledgeSnapshot() });
  const context: ModelPortContext = { tenantId: "offline-tenant", userId: "offline-user", workspaceId: "offline-workspace", conversationId: "offline-conversation",
    currentRevisionId: "offline-revision", currentProjectKey: "kingclient", generationWorkflow: "creative-v2", recentMessages: [], assetCatalog: [],
    confirmedSolutionBlueprint: blueprint, visualReference, capabilityCandidates: candidates };
  const reply = read("initial-provider-reply.json") as { content: string; finishReason: string };
  const graph = readVisualSemanticDeltaBase(JSON.parse(reply.content));
  if (!graph) throw new Error("addressable graph required");
  const deltaReply = read("repair-delta-provider-reply.json") as { content: string; finishReason: string };
  const delta = JSON.parse(deltaReply.content) as { operations: Array<{ op: string; nodes: Array<Record<string, unknown> & { id: string }> }> };
  const first = inspectVisualSemanticResponse(context, { text: reply.content, finishReason: reply.finishReason }, []);
  if (first.inspection.ok) throw new Error("negative required");
  return { context, graph, delta, issues: first.inspection.issues, blueprint, visualReference, candidates };
}

describe("precise visual binding feedback", () => {
  it("keeps the full live journey failure and rejects a repair that rebinds a required layout to invented text", () => {
    const directory = new URL("../../../../tests/fixtures/energy-overview-20261023/live-full-journey-binding/", import.meta.url);
    const read = (file: string) => JSON.parse(readFileSync(new URL(file, directory), "utf8")) as Record<string, unknown>;
    const blueprint = CustomerSolutionBlueprintSchema.parse(read("blueprint.json"));
    const visualReference = VisualPlanningContextSchema.parse({ ...read("reference-review.json"), acceptedDifferences: read("accepted-differences.json") });
    const context: ModelPortContext = { tenantId: "offline-tenant", userId: "offline-user", workspaceId: "offline-workspace", conversationId: "offline-conversation",
      currentRevisionId: "offline-revision", currentProjectKey: "kingclient", generationWorkflow: "creative-v2", recentMessages: [], assetCatalog: [],
      confirmedSolutionBlueprint: blueprint, visualReference, capabilityCandidates: retrieveCapabilities({ blueprint, visualReference, knowledge: getDesignKnowledgeSnapshot() }) };
    const reply = read("initial-provider-reply.json"); const repair = read("repair-delta-provider-reply.json");
    const before = canonicalServerHash({ reply, repair, blueprint, visualReference });
    const initial = inspectVisualSemanticResponse(context, { text: reply.content as string, finishReason: reply.finishReason as string }, []);
    expect(initial.inspection).toMatchObject({ ok: false, repairable: true, issues: [expect.objectContaining({ code: "SEMANTIC_PLAN_INVALID",
      detail: expect.stringContaining("read-overview:2") })] });
    if (initial.inspection.ok) throw new Error("actual journey failure required");
    const result = inspectVisualSemanticRepairResponse(context, { text: repair.content as string, finishReason: repair.finishReason as string }, [], initial.raw, initial.inspection.issues);
    expect(result.inspection).toMatchObject({ ok: false, repairable: false, issues: [expect.objectContaining({
      code: "VISUAL_BLUEPRINT_CONTROL_CAPABILITY_MISMATCH", regionId: "content", nodeId: "node-content-desc",
      bindingRequirement: { requiredCapabilityId: "layout.4", actualKind: "control", actualCapabilityId: "richtext",
        directLayoutKinds: ["column", "stack", "scroll-region"], availableInnerLayoutKinds: ["row", "column"] },
    })] });
    expect(canonicalServerHash({ reply, repair, blueprint, visualReference })).toBe(before);
  });
  it("enriches the actual remaining first error with its own node and approved composition without duplicating it", () => {
    const test = sample(); const before = canonicalServerHash(test.graph);
    const result = inspectVisualSemanticRepairResponse(test.context, { text: JSON.stringify(test.delta), finishReason: "stop" }, [], test.graph, test.issues);
    expect(result.inspection).toMatchObject({ ok: false, repairable: false, issues: [expect.objectContaining({
      code: "VISUAL_BLUEPRINT_LAYOUT_CAPABILITY_MISMATCH", regionId: "devices", nodeId: "node-devices-column",
      bindingRequirement: { requiredCapabilityId: "layout.2", actualKind: "layout", actualLayout: "column", directLayoutKinds: ["row"],
        availableInnerLayoutKinds: ["row", "column"], suggestedInnerLayoutKind: "column" },
    })] });
    if (result.inspection.ok) throw new Error("negative required");
    expect(result.inspection.issues).toHaveLength(1);
    expect(canonicalServerHash(test.graph)).toBe(before);
  });
  it("shows allowed inner candidates for the ambiguous device region and keeps the repair bounded", () => {
    const test = sample(); const before = canonicalServerHash({ context: test.context, graph: test.graph });
    const obligations = visualBindingObligations(test.visualReference, test.blueprint, test.candidates, test.graph);
    const device = obligations.find(item => item.regionId === "devices")!;
    expect(device).toMatchObject({ requiredCapabilityId: "layout.2", directLayoutKinds: ["row"], availableInnerLayoutKinds: ["row", "column"],
      proposalBoundNodes: [{ nodeId: "node-devices-column", kind: "layout", layout: "column" }] });
    expect(device).not.toHaveProperty("contentArrangementHint");
    const messages = buildVisualSemanticRepairMessages(test.context, test.graph, test.issues);
    expect(messages[0]).toEqual(buildVisualSemanticMessages(test.context)[0]);
    expect(Buffer.byteLength(JSON.stringify(messages))).toBeLessThanOrEqual(128000);
    const payload = JSON.parse(messages[1]!.content) as { failedDraft: unknown };
    expect(payload.failedDraft).toEqual(test.graph);
    expect(canonicalServerHash({ context: test.context, graph: test.graph })).toBe(before);
  });
  it("does not borrow another region's column candidate or accept unvalidated layout observations", () => {
    const test = sample(); const candidates = structuredClone(test.candidates);
    const obligation = visualBindingObligations(test.visualReference, test.blueprint, candidates, test.graph).find(item => item.regionId === "devices")!;
    candidates.regions.find(region => region.pageId === obligation.pageId && region.regionId === obligation.blueprintRegionId)!.layouts
      = candidates.regions.find(region => region.pageId === obligation.pageId && region.regionId === obligation.blueprintRegionId)!.layouts.filter(layout => layout.id !== "layout.4");
    const context = { ...test.context, capabilityCandidates: candidates };
    const issue = inspectVisualSemanticCapabilities(context, test.graph, []).find(issue => issue.regionId === "devices")!;
    expect(issue).toMatchObject({ bindingRequirement: { requiredCapabilityId: "layout.2", directLayoutKinds: ["row"], availableInnerLayoutKinds: ["row"] } });
    expect(issue.bindingRequirement).not.toHaveProperty("suggestedInnerLayoutKind");
    const invalid = structuredClone(test.graph);
    (invalid.nodes.find(node => node.id === "node-devices-column") as Record<string, unknown>).layout = "column; injected observation";
    expect(inspectVisualSemanticCapabilities(test.context, invalid, []).some(issue => issue.regionId === "devices")).toBe(false);
  });
  it("still rejects the original delta and fully compiles only a model-authored outer/inner correction", () => {
    const test = sample(); const before = canonicalServerHash(test.graph);
    const unchanged = inspectVisualSemanticRepairResponse(test.context, { text: JSON.stringify(test.delta), finishReason: "stop" }, [], test.graph, test.issues);
    expect(unchanged.inspection).toMatchObject({ ok: false });
    const corrected = structuredClone(test.delta);
    const devices = corrected.operations[0]!.nodes.find(node => node.id === "node-devices-column")!;
    const inner = { ...structuredClone(devices), id: "node-devices-explicit-content" } as Record<string, unknown> & { id: string };
    delete inner.styleRole; delete inner.styleOverride;
    devices.layout = "row"; devices.childNodeIds = [inner.id]; corrected.operations[0]!.nodes.push(inner);
    const result = inspectVisualSemanticRepairResponse(test.context, { text: JSON.stringify(corrected), finishReason: "stop" }, [], test.graph, test.issues);
    expect(result.inspection).toMatchObject({ ok: true });
    expect((result.raw as VisualSemanticDeltaGraph).plan).toEqual(test.graph.plan);
    expect((result.raw as VisualSemanticDeltaGraph).bindings).toEqual(test.graph.bindings);
    expect(canonicalServerHash(test.graph)).toBe(before);
  });
  it("reports a control's exact required capability without suggesting a layout shell or echoing invalid observations", () => {
    const test = sample();
    const binding = test.graph.bindings.find(binding => {
      const node = test.graph.nodes.find(node => node.id === binding.nodeId);
      return node?.kind === "control" && (node as Record<string, unknown>).capabilityId !== "button";
    })!;
    const graph = structuredClone(test.graph);
    const node = graph.nodes.find(node => node.id === binding.nodeId)! as Record<string, unknown>;
    node.capabilityId = "button";
    const issue = inspectVisualSemanticCapabilities(test.context, graph, []).find(issue => issue.nodeId === binding.nodeId)!;
    expect(issue).toMatchObject({ code: "VISUAL_BLUEPRINT_CONTROL_CAPABILITY_MISMATCH", regionId: binding.regionId,
      bindingRequirement: { actualKind: "control", actualCapabilityId: "button", directLayoutKinds: [], availableInnerLayoutKinds: [] } });
    expect(issue.bindingRequirement).not.toHaveProperty("suggestedInnerLayoutKind");
    node.capabilityId = { native: "untrusted" };
    expect(inspectVisualSemanticCapabilities(test.context, graph, []).some(issue => issue.nodeId === binding.nodeId)).toBe(false);
  });
});
// end
