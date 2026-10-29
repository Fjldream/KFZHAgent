// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalServerHash, CustomerSolutionBlueprintSchema, VisualPlanningContextSchema, type ModelRoute, type VisualEngineeringContinuation } from "@kf/contracts";
import { getDesignKnowledgeSnapshot, retrieveCapabilities } from "@kf/domain-client";
import type { ModelPortContext } from "@kf/agent-orchestrator";
import { inspectVisualSemanticResponse } from "./visual-semantic-output.js";
import { buildVisualSemanticRepairRequest, buildVisualSemanticRequest, freezeVisualSemanticModel } from "./visual-semantic-request.js";

function syntaxSample() {
  const directory = new URL("../../../../tests/fixtures/energy-overview-20261023/live-semantic-json-syntax/", import.meta.url);
  const read = (name: string): unknown => JSON.parse(readFileSync(new URL(name, directory), "utf8")) as unknown;
  const blueprint = CustomerSolutionBlueprintSchema.parse(read("blueprint.json"));
  const visualReference = VisualPlanningContextSchema.parse({ ...(read("reference-review.json") as Record<string, unknown>), acceptedDifferences: read("accepted-differences.json") });
  const context: ModelPortContext = { tenantId: "tenant", userId: "user", workspaceId: "workspace", conversationId: "conversation",
    currentRevisionId: "revision", generationWorkflow: "creative-v2", currentProjectKey: "kingclient", recentMessages: [], assetCatalog: [],
    confirmedSolutionBlueprint: blueprint, visualReference, capabilityCandidates: retrieveCapabilities({ blueprint, visualReference, knowledge: getDesignKnowledgeSnapshot() }) };
  const reply = read("provider-reply.json") as { content: string; finishReason: string };
  return { context, response: { text: reply.content, finishReason: reply.finishReason } };
}

describe("bounded syntax feedback for a stopped visual response", () => {
  it("retains the exact non-truncated real text for repair without interpreting invalid braces as a plan", () => {
    const { context, response } = syntaxSample(); const hash = canonicalServerHash(response);
    expect(() => JSON.parse(response.text) as unknown).toThrow();
    const checked = inspectVisualSemanticResponse(context, response, []);
    expect(checked.raw).toBe(response.text);
    expect(checked.inspection).toMatchObject({ ok: false, repairable: true, issues: [{ code: "SEMANTIC_JSON_SYNTAX_INVALID" }] });
    expect(canonicalServerHash(response)).toBe(hash);
    const route: ModelRoute = { provider: "deepseek", baseUrl: "https://semantic.invalid/v1", model: "fixture", supportsJson: true,
      supportsThinking: false, supportsVision: false, maxContextTokens: 1048576, timeoutMs: 1000, pricingVersion: null };
    const snapshot = { inputHash: "a".repeat(64), content: { ...context, requestedByUserId: context.userId, baseRevisionId: "revision", runId: "run-fixture",
      semanticModel: freezeVisualSemanticModel(route, "once"), blueprintReview: { content: { blueprint: context.confirmedSolutionBlueprint } },
      accepted: { reference: context.visualReference } } } as unknown as VisualEngineeringContinuation;
    const base = buildVisualSemanticRequest(snapshot, context.capabilityCandidates!, []);
    if (checked.inspection.ok) throw new Error("the invalid raw text must never be accepted");
    const repair = buildVisualSemanticRepairRequest(base.request, base.context, checked.raw, checked.inspection.issues);
    expect((JSON.parse(repair.messages[1]!.content as string) as { failedDraft: string }).failedDraft).toBe(response.text);
    expect(Buffer.byteLength(JSON.stringify(repair.messages), "utf8")).toBeLessThanOrEqual(128000);
  });
  it.each([
    { text: "{", finishReason: "stop" },
    { text: "{bad}", finishReason: "length" },
    { text: "{bad}", finishReason: null },
    { text: "{bad} trailing text", finishReason: "stop" },
    { text: `{${"x".repeat(65536)}}`, finishReason: "stop" },
  ])("does not repair partial, truncated, unknown or oversized response $finishReason", response => {
    expect(inspectVisualSemanticResponse(syntaxSample().context, response, []).inspection).toMatchObject({ ok: false, repairable: false });
  });
  it("does not turn invalid approval facts into a syntax repair even when the raw response has a complete frame", () => {
    const { context, response } = syntaxSample();
    context.visualReference!.specHash = "0".repeat(64);
    expect(inspectVisualSemanticResponse(context, response, []).inspection).toMatchObject({ ok: false, repairable: false });
  });
  it.each([
    { name: "initial-provider-reply.json", offset: 25545 },
    { name: "repaired-provider-reply.json", offset: 23731 },
  ])("retains the unmodified deep-tree $name with a bounded UTF-16 position", ({ name, offset }) => {
    const directory = new URL("../../../../tests/fixtures/energy-overview-20261023/live-semantic-unbalanced-tree/", import.meta.url);
    const blueprint = CustomerSolutionBlueprintSchema.parse(JSON.parse(readFileSync(new URL("blueprint.json", directory), "utf8")));
    const reference = JSON.parse(readFileSync(new URL("reference-review.json", directory), "utf8")) as Record<string, unknown>;
    const visualReference = VisualPlanningContextSchema.parse({ ...reference, acceptedDifferences: JSON.parse(readFileSync(new URL("accepted-differences.json", directory), "utf8")) });
    const context = { ...syntaxSample().context, confirmedSolutionBlueprint: blueprint, visualReference,
      capabilityCandidates: retrieveCapabilities({ blueprint, visualReference, knowledge: getDesignKnowledgeSnapshot() }) };
    const reply = JSON.parse(readFileSync(new URL(name, directory), "utf8")) as { content: string; finishReason: string };
    const hash = canonicalServerHash(reply);
    const checked = inspectVisualSemanticResponse(context, { text: reply.content, finishReason: reply.finishReason }, []);
    expect(checked).toMatchObject({ raw: reply.content, inspection: { ok: false, repairable: true,
      issues: [{ code: "SEMANTIC_JSON_SYNTAX_INVALID", syntaxLocation: { unit: "utf16", offset } }] } });
    expect(canonicalServerHash(reply)).toBe(hash);
  });
});
// end
