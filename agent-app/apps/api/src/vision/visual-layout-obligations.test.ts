// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalServerHash, CustomerSolutionBlueprintSchema, VisualPlanningContextSchema, VisualSemanticGraphSchema,
  type ModelRoute, type VisualEngineeringContinuation } from "@kf/contracts";
import type { ModelPortContext } from "@kf/agent-orchestrator";
import { getDesignKnowledgeSnapshot, retrieveCapabilities } from "@kf/domain-client";
import { visualBindingObligations } from "./visual-layout-obligations.js";
import { inspectVisualSemanticResponse } from "./visual-semantic-output.js";
import { buildVisualSemanticRepairRequest, buildVisualSemanticRequest, freezeVisualSemanticModel } from "./visual-semantic-request.js";

function sample() {
  const directory = new URL("../../../../tests/fixtures/energy-overview-20261023/live-semantic-graph-layout-constraints/", import.meta.url);
  const read = (name: string): unknown => JSON.parse(readFileSync(new URL(name, directory), "utf8"));
  const blueprint = CustomerSolutionBlueprintSchema.parse(read("blueprint.json"));
  const visualReference = VisualPlanningContextSchema.parse({ ...(read("reference-review.json") as object), acceptedDifferences: read("accepted-differences.json") });
  const candidates = retrieveCapabilities({ blueprint, visualReference, knowledge: getDesignKnowledgeSnapshot() });
  const context: ModelPortContext = { tenantId: "offline-tenant", userId: "offline-user", workspaceId: "offline-workspace", conversationId: "offline-conversation",
    currentRevisionId: "offline-revision", currentProjectKey: "kingclient", generationWorkflow: "creative-v2", recentMessages: [], assetCatalog: [],
    confirmedSolutionBlueprint: blueprint, visualReference, capabilityCandidates: candidates };
  const initial = read("initial-provider-reply.json") as { content: string; finishReason: string };
  const repaired = read("repaired-provider-reply.json") as { content: string; finishReason: string };
  return { blueprint, visualReference, candidates, context, initial, repaired };
}
const route: ModelRoute = { provider: "deepseek", baseUrl: "https://semantic.invalid/v1", model: "fixture", supportsJson: true,
  supportsThinking: false, supportsVision: false, maxContextTokens: 1048576, timeoutMs: 1000, pricingVersion: null };

describe("approved visual layout obligations", () => {
  it("preserves the actual native width and accepted-layout failures without mutating either response", () => {
    const test = sample();
    for (const [reply, code] of [[test.initial, "NATIVE_LAYOUT_UNSATISFIABLE"], [test.repaired, "VISUAL_BLUEPRINT_LAYOUT_CAPABILITY_MISMATCH"]] as const) {
      const before = canonicalServerHash(reply);
      const inspected = inspectVisualSemanticResponse(test.context, { text: reply.content, finishReason: reply.finishReason }, []);
      expect(inspected.inspection).toMatchObject({ ok: false, repairable: true, issues: expect.arrayContaining([expect.objectContaining({ code })]) });
      expect(canonicalServerHash(reply)).toBe(before);
    }
  });
  it("separates the approved outer row from a suggested inner column and the unapproved draft binding", () => {
    const test = sample();
    const draft: unknown = JSON.parse(test.repaired.content);
    const before = canonicalServerHash({ visual: test.visualReference, draft, candidates: test.candidates });
    const obligations = visualBindingObligations(test.visualReference, test.blueprint, test.candidates, draft);
    expect(obligations.find(item => item.regionId === "content")).toMatchObject({ requiredCapabilityId: "layout.2", directLayoutKinds: ["row"],
      availableInnerLayoutKinds: expect.arrayContaining(["column"]), contentArrangementHint: { axis: "column" },
      proposalBoundNodes: [{ nodeId: "node-content", kind: "layout", layout: "column" }] });
    expect(obligations).toHaveLength(44);
    expect(canonicalServerHash({ visual: test.visualReference, draft, candidates: test.candidates })).toBe(before);
  });
  it("does not let draft fields or a missing candidate manufacture new layout authority", () => {
    const test = sample();
    const candidates = structuredClone(test.candidates);
    candidates.regions.forEach(region => { region.layouts = region.layouts.filter(layout => layout.id !== "layout.4"); });
    const obligations = visualBindingObligations(test.visualReference, test.blueprint, candidates, { requiredCapabilityId: "invented", nodes: [] });
    expect(obligations.find(item => item.regionId === "content")).toMatchObject({ requiredCapabilityId: "layout.2", directLayoutKinds: ["row"] });
    expect(obligations.find(item => item.regionId === "content")!.availableInnerLayoutKinds).not.toContain("column");
    expect(obligations.every(item => item.proposalBoundNodes === undefined)).toBe(true);
  });
  it("keeps the full original graph and obligations inside the unchanged repair budget with the same system prefix", () => {
    const test = sample();
    const snapshot = { inputHash: "a".repeat(64), content: { ...test.context, requestedByUserId: test.context.userId, baseRevisionId: "offline-revision", runId: "new-test-run",
      semanticModel: freezeVisualSemanticModel(route, "once"), blueprintReview: { content: { blueprint: test.blueprint } }, accepted: { reference: test.visualReference } } } as unknown as VisualEngineeringContinuation;
    const base = buildVisualSemanticRequest(snapshot, test.candidates, []);
    const inspected = inspectVisualSemanticResponse(test.context, { text: test.initial.content, finishReason: "stop" }, []);
    if (inspected.inspection.ok) throw new Error("negative expected");
    const repair = buildVisualSemanticRepairRequest(base.request, base.context, inspected.raw, inspected.inspection.issues);
    const payload = JSON.parse(repair.messages[1]!.content as string);
    expect(payload.failedDraft).toEqual(JSON.parse(test.initial.content));
    expect(payload.requiredVisualBindings).toHaveLength(44);
    expect(payload.requiredVisualBindings.find((item: { regionId: string }) => item.regionId === "content")).toMatchObject({ requiredCapabilityId: "layout.2", parentRegionId: test.visualReference.spec.regions.find(item => item.id === "content")!.parentId,
      proposalBoundNodes: [{ nodeId: "node-body-split", kind: "layout", layout: "row" }] });
    expect(repair.messages[0]!.content).toContain("唯一child为column");
    expect(repair.messages[0]).toEqual(base.request.messages[0]);
    expect(Buffer.byteLength(JSON.stringify(repair.messages), "utf8")).toBeLessThanOrEqual(128000);
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    expect(repair.scope).toMatchObject({ promptVersion: "visual-semantic-repair@13", attempt: 2 });
    // end
    // end
    // end
  });
  it("can compile explicit row shells around column contents without changing the historical accepted capabilities", () => {
    const test = sample();
    const original = canonicalServerHash(test.repaired);
    const graph = VisualSemanticGraphSchema.parse(JSON.parse(test.repaired.content));
    // Counterfactual fixture only. Production never rewrites model nodes or historical approvals.
    const layoutIds = new Set(test.visualReference.mappings.filter(mapping => mapping.capabilityId === "layout.2").map(mapping => mapping.regionId));
    for (const binding of graph.bindings.filter(binding => layoutIds.has(binding.regionId))) {
      const node = graph.nodes.find(node => node.id === binding.nodeId)!;
      if (node.kind !== "layout") continue;
      const layout = node as typeof node & { layout: unknown; styleRole?: unknown };
      if (layout.layout !== "column") continue;
      const innerId = `${node.id}-column-content`;
      const inner = { ...layout, id: innerId };
      delete inner.styleRole;
      graph.nodes.push(inner);
      layout.layout = "row";
      node.childNodeIds = [innerId];
    }
    const inspected = inspectVisualSemanticResponse(test.context, { text: JSON.stringify(graph), finishReason: "stop" }, []);
    expect(inspected.inspection).toMatchObject({ ok: true });
    expect(canonicalServerHash(test.repaired)).toBe(original);
  });
});
// end
