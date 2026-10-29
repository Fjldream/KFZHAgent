// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalServerHash, VisualPlanningContextSchema, type ModelRoute, type VisualContinuationSnapshot } from "@kf/contracts";
import { inspectVisualBlueprintResponse } from "./visual-blueprint-output.js";
import { buildVisualBlueprintRequest, buildVisualBlueprintRepairRequest, freezeVisualBlueprintModel } from "./visual-blueprint-request.js";

function realSyntaxSample() {
  const directory = new URL("../../../../tests/fixtures/energy-overview-20261023/live-blueprint-json-syntax/", import.meta.url);
  const read = (name: string): unknown => JSON.parse(readFileSync(new URL(name, directory), "utf8")) as unknown;
  const reference = VisualPlanningContextSchema.parse({ ...(read("reference-review.json") as Record<string, unknown>), acceptedDifferences: read("accepted-differences.json") });
  const reply = read("provider-reply.json") as { content: string; finishReason: string };
  return { reference, response: { text: reply.content, finishReason: reply.finishReason } };
}

describe("bounded blueprint syntax repair", () => {
  it("retains the exact real malformed text as feedback, never as an approved blueprint", () => {
    const { reference, response } = realSyntaxSample();
    const hash = canonicalServerHash(response);
    expect(() => JSON.parse(response.text) as unknown).toThrow();
    const checked = inspectVisualBlueprintResponse(response, reference);
    expect(checked).toEqual({ raw: response.text, inspection: { ok: false, repairable: true,
      issues: [{ code: "BLUEPRINT_JSON_SYNTAX_INVALID" }] } });
    expect(canonicalServerHash(response)).toBe(hash);
    const route: ModelRoute = { provider: "deepseek", baseUrl: "https://blueprint.invalid/v1", model: "fixture", supportsJson: true,
      supportsThinking: false, supportsVision: false, maxContextTokens: 1048576, timeoutMs: 1000, pricingVersion: null };
    const snapshot = { inputHash: "a".repeat(64), content: { tenantId: "tenant", workspaceId: "workspace", conversationId: "conversation", runId: "run",
      blueprintModel: freezeVisualBlueprintModel(route, "once"), accepted: { reference } } } as unknown as VisualContinuationSnapshot;
    const base = buildVisualBlueprintRequest(snapshot, "生成静态能源总览");
    if (checked.inspection.ok) throw new Error("malformed text must not be accepted");
    const repair = buildVisualBlueprintRepairRequest(base, checked.raw, checked.inspection.issues);
    const payload = JSON.parse(repair.messages[1]!.content as string) as { repairContext: { failedDraft: string } };
    expect(payload.repairContext.failedDraft).toBe(response.text);
    expect(repair.messages[0]).toEqual(base.messages[0]);
    expect(repair.route).toEqual(base.route);
    expect(Buffer.byteLength(JSON.stringify(repair.messages), "utf8")).toBeLessThanOrEqual(96 * 1024);
  });

  it.each([
    { text: "{", finishReason: "stop" },
    { text: "{bad}", finishReason: "length" },
    { text: "{bad}", finishReason: null },
    { text: "{bad}", finishReason: "content_filter" },
    { text: "{}", finishReason: null },
    { text: "{}", finishReason: "content_filter" },
    { text: "{bad} trailing", finishReason: "stop" },
    { text: "```json\n{bad}\n```", finishReason: "stop" },
    { text: "[bad]", finishReason: "stop" },
    { text: "[]", finishReason: "stop" },
    { text: "null", finishReason: "stop" },
    { text: `{"${"界".repeat(12000)}":bad}`, finishReason: "stop" },
  ])("refuses partial, wrapped, truncated, non-object or oversized drafts $finishReason", response => {
    expect(inspectVisualBlueprintResponse(response, realSyntaxSample().reference).inspection).toMatchObject({ ok: false, repairable: false });
  });

  it("uses serialized UTF-8 bytes and retains the existing 32 KiB repair limit", () => {
    const reference = realSyntaxSample().reference;
    const exact = `{${"x".repeat(32764)}}`;
    expect(Buffer.byteLength(JSON.stringify(exact), "utf8")).toBe(32768);
    expect(inspectVisualBlueprintResponse({ text: exact, finishReason: "stop" }, reference).inspection).toMatchObject({ ok: false, repairable: true });
    expect(inspectVisualBlueprintResponse({ text: `${exact.slice(0, -1)}x}`, finishReason: "stop" }, reference).inspection)
      .toMatchObject({ ok: false, repairable: false });
  });

  it("does not repair a response against corrupted approval facts", () => {
    const { reference, response } = realSyntaxSample();
    reference.specHash = "0".repeat(64);
    expect(inspectVisualBlueprintResponse(response, reference).inspection).toEqual({ ok: false, repairable: false,
      issues: [{ code: "VISUAL_BLUEPRINT_TRUSTED_CONTEXT_INVALID" }] });
  });
});
// end
