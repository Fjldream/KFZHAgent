// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalServerHash, CustomerSolutionBlueprintSchema, VisualPlanningContextSchema, readVisualSemanticDeltaBase, type VisualSemanticDeltaGraph } from "@kf/contracts";
import { getDesignKnowledgeSnapshot, retrieveCapabilities } from "@kf/domain-client";
import type { ModelPortContext } from "@kf/agent-orchestrator";
import { normalizeSolutionStyleAliases, buildVisualSemanticRepairMessages, buildVisualSemanticMessages } from "../conversations/deepseek-model.js";
import { inspectVisualSemanticResponse } from "./visual-semantic-output.js";
import { inspectVisualSemanticRepairResponse } from "./visual-semantic-repair.js";
import { inspectVisualNodeMetadata, visualNodeMetadataContract } from "./visual-node-metadata.js";

function sample() {
  const root = new URL("../../../../tests/fixtures/energy-overview-20261023/live-binding-fixed-missing-roles/", import.meta.url);
  const read = (file: string): unknown => JSON.parse(readFileSync(new URL(file, root), "utf8"));
  const blueprint = CustomerSolutionBlueprintSchema.parse(read("blueprint.json"));
  const visualReference = VisualPlanningContextSchema.parse({ ...(read("reference-review.json") as object), acceptedDifferences: read("accepted-differences.json") });
  const context: ModelPortContext = { tenantId: "offline-tenant", userId: "offline-user", workspaceId: "offline-workspace", conversationId: "offline-conversation",
    currentRevisionId: "offline-revision", currentProjectKey: "kingclient", generationWorkflow: "creative-v2", recentMessages: [], assetCatalog: [], confirmedSolutionBlueprint: blueprint,
    visualReference, capabilityCandidates: retrieveCapabilities({ blueprint, visualReference, knowledge: getDesignKnowledgeSnapshot() }) };
  const reply = read("initial-provider-reply.json") as { content: string; finishReason: string };
  const graph = readVisualSemanticDeltaBase(JSON.parse(reply.content)); if (!graph) throw new Error("addressable graph required");
  const delta = JSON.parse((read("repair-delta-provider-reply.json") as { content: string }).content) as { operations: Array<{ op: string; nodes: Array<Record<string, unknown> & { id: string }> }> };
  return { context, graph, delta };
}
describe("bounded flat node metadata feedback", () => {
  it("locates all twelve actual missing control roles by stable node ids without filling a value", () => {
    const test = sample(); const before = canonicalServerHash(test.graph);
    const issues = inspectVisualNodeMetadata(test.graph, normalizeSolutionStyleAliases);
    expect(issues).toEqual([expect.objectContaining({ code: "SEMANTIC_NODE_FIELD_INVALID", nodeField: "styleRole", missing: true, count: 12,
      nodeIds: expect.arrayContaining(["node-header-page", "node-main-heading", "node-devices-title", "node-summary-time-label"]) })]);
    expect(canonicalServerHash(test.graph)).toBe(before);
    expect(visualNodeMetadataContract().requiredFields.control).toContain("styleRole");
    expect(visualNodeMetadataContract().requiredFields.layout).not.toContain("styleRole");
  });
  it("rejects the real binding-only delta and compiles only an explicit complete metadata proposal", () => {
    const test = sample(); const before = canonicalServerHash(test.graph);
    const first = inspectVisualSemanticResponse(test.context, { text: JSON.stringify(test.graph), finishReason: "stop" }, []);
    if (first.inspection.ok) throw new Error("negative required");
    const original = inspectVisualSemanticRepairResponse(test.context, { text: JSON.stringify(test.delta), finishReason: "stop" }, [], test.graph, first.inspection.issues);
    expect(original.inspection).toMatchObject({ ok: false, repairable: false, issues: expect.arrayContaining([
      expect.objectContaining({ code: "SEMANTIC_NODE_FIELD_INVALID", nodeField: "styleRole", count: 12 }),
    ]) });
    const corrected = structuredClone(test.delta);
    for (const node of test.graph.nodes) {
      const payload: Record<string, unknown> = node;
      if (node.kind === "control" && payload.styleRole === undefined) corrected.operations[0]!.nodes.push({ ...structuredClone(payload), id: node.id, styleRole: "kpi-label" });
    }
    const result = inspectVisualSemanticRepairResponse(test.context, { text: JSON.stringify(corrected), finishReason: "stop" }, [], test.graph, first.inspection.issues);
    expect(result.inspection, JSON.stringify(result.inspection.ok ? { ok: true } : result.inspection)).toMatchObject({ ok: true });
    expect((result.raw as VisualSemanticDeltaGraph).plan).toEqual(test.graph.plan);
    expect(canonicalServerHash(test.graph)).toBe(before);
  });
  it("bounds grouped diagnostics and does not echo arbitrary values or normalize an unbounded graph", () => {
    const test = sample();
    for (const node of test.graph.nodes) {
      const payload: Record<string, unknown> = node;
      payload.intent = "untrusted private metadata"; payload.sourceBlueprintRegionIds = null;
      if (node.kind === "control") { payload.capabilityId = null; payload.content = { injected: "private value" }; payload.properties = null; }
    }
    const issues = inspectVisualNodeMetadata(test.graph, normalizeSolutionStyleAliases);
    expect(issues.length).toBeLessThanOrEqual(5);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every(issue => (issue.nodeIds?.length ?? 0) <= 20)).toBe(true);
    expect(JSON.stringify(issues)).not.toMatch(/untrusted private|private value/);
    let called = false;
    const normalize = (value: unknown) => { called = true; return value; };
    const large = { ...test.graph, plan: { ...test.graph.plan, mockData: "界".repeat(22000) } };
    expect(inspectVisualNodeMetadata(large, normalize)).toEqual([]); expect(called).toBe(false);
  });
  it("puts the same required field list in the stable prompt and keeps all approved inputs within the original budget", () => {
    const test = sample();
    const first = inspectVisualSemanticResponse(test.context, { text: JSON.stringify(test.graph), finishReason: "stop" }, []);
    if (first.inspection.ok) throw new Error("negative required");
    expect(first.inspection.issues.length).toBeLessThanOrEqual(12);
    const messages = buildVisualSemanticRepairMessages(test.context, test.graph, first.inspection.issues);
    expect(messages[0]).toEqual(buildVisualSemanticMessages(test.context)[0]);
    expect(messages[0]!.content).toContain("必填元数据");
    expect(Buffer.byteLength(JSON.stringify(messages))).toBeLessThanOrEqual(128000);
    expect((JSON.parse(messages[1]!.content) as { failedDraft: unknown }).failedDraft).toEqual(test.graph);
  });
  it("identifies an undeclared role without supplying a replacement or exposing its value", () => {
    const test = sample(); const original = canonicalServerHash(test.graph);
    const graph = structuredClone(test.graph);
    for (const node of graph.nodes) if (node.kind === "control") (node as Record<string, unknown>).styleRole = "kpi-label";
    const target = graph.nodes.find(node => node.kind === "control")!;
    (target as Record<string, unknown>).styleRole = "undeclared-private-role";
    const issues = inspectVisualNodeMetadata(graph, normalizeSolutionStyleAliases);
    expect(issues).toEqual([expect.objectContaining({ nodeId: target.id, nodeField: "styleRole", schemaCode: "unknown-role", missing: false, count: 1 })]);
    expect(JSON.stringify(issues)).not.toContain("undeclared-private-role");
    expect(canonicalServerHash(test.graph)).toBe(original);
  });
});
// end
