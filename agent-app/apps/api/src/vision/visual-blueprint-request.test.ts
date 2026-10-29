// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import { describe, expect, it } from "vitest";
import type { ModelRoute, VisualContinuationSnapshot } from "@kf/contracts";
// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { buildVisualBlueprintRequest, buildVisualBlueprintRepairRequest, freezeVisualBlueprintModel } from "./visual-blueprint-request.js";
// end
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import { readFileSync } from "node:fs";
import { CustomerSolutionBlueprintSchema } from "@kf/contracts";
// end

describe("visual blueprint model contract", () => {
  const route: ModelRoute = { provider: "deepseek", baseUrl: "https://blueprint.invalid/v1", model: "fixture",
    supportsJson: true, supportsThinking: false, supportsVision: false, maxContextTokens: 64000, timeoutMs: 1000, pricingVersion: null };
  const request = () => buildVisualBlueprintRequest({ inputHash: "a".repeat(64), content: {
    tenantId: "tenant-fixture", workspaceId: "workspace-fixture", conversationId: "conversation-fixture", runId: "run-fixture",
    blueprintModel: freezeVisualBlueprintModel(route), accepted: { reference: { marker: "untrusted-reference-text" } },
  } } as unknown as VisualContinuationSnapshot, "只生成静态演示界面");

  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  it("honors explicit server thinking for the blueprint and its one-shot repair without changing the default policy", () => {
    const thinkingRoute = { ...route, supportsThinking: true };
    const enabled = buildVisualBlueprintRequest({ inputHash: "a".repeat(64), content: {
      tenantId: "tenant-fixture", workspaceId: "workspace-fixture", conversationId: "conversation-fixture", runId: "run-fixture",
      blueprintModel: freezeVisualBlueprintModel(thinkingRoute, "once"), accepted: { reference: { marker: "untrusted-reference-text" } },
    } } as unknown as VisualContinuationSnapshot, "只生成静态演示界面");
    expect(enabled).toMatchObject({ thinking: true, reasoningEffort: "high", maxOutputTokens: 16_384, maxResponseBytes: 80 * 1024 });
    const repair = buildVisualBlueprintRepairRequest(enabled, { pages: [] }, [{ code: "VISUAL_BLUEPRINT_SOURCE_MISSING", regionIds: ["known-region"] }]);
    expect(repair.thinking).toBe(true);
    expect(repair.reasoningEffort).toBe("high");
    expect(repair.maxOutputTokens).toBe(enabled.maxOutputTokens);
    expect(() => buildVisualBlueprintRepairRequest({ ...enabled, thinking: false }, { pages: [] }, [{ code: "SCHEMA_INVALID" }]))
      .toThrow("VISUAL_BLUEPRINT_REPAIR_CONTEXT_INVALID");
    expect(request()).toMatchObject({ thinking: false, maxOutputTokens: 8192 });
    expect(request()).not.toHaveProperty("reasoningEffort");
  });
  // end
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  it("aligns a single reviewed text control with a whole-content observation without dropping any OCR item", () => {
    const system = request().messages[0]!.content as string;
    expect(system).toContain("单一text/richtext/button");
    expect(system).toContain("没有dataRequirement、映射为单一text/richtext/button");
    expect(system).toContain("全部非空text按原顺序以单个空格连接为一项expectedTexts");
    expect(system).toContain("不得遗漏任一原文");
    expect(system).toContain('例如同一来源["1号配电室","运行正常"]使用["1号配电室 运行正常"]');
  });
  // end

  it("versions the complete server-derived JSON schema instead of an approximate handwritten object shape", () => {
    // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    expect(freezeVisualBlueprintModel(route).promptVersion).toBe("visual-blueprint@14");
    // end
    // end
    // end
    // end
    // end
    const system = request().messages[0]!.content;
    expect(typeof system).toBe("string");
    const schemaText = (system as string).split("完整输出 JSON Schema：\n")[1];
    expect(schemaText).toBeDefined();
    const schema = JSON.parse(schemaText!) as { properties: { schema: { const: string }; pages: { items: { properties: {
      regions: { maxItems: number; items: { properties: { sampleData: { items: { additionalProperties: { type: string } } }; content: { minItems: number } } } };
    } } } }; required: string[] };
    expect(schema.required).toContain("schema");
    expect(schema.properties.schema.const).toBe("kf-design-plan/v3");
    const regions = schema.properties.pages.items.properties.regions;
    expect(regions.maxItems).toBe(12);
    expect(regions.items.properties.content.minItems).toBe(1);
    expect(regions.items.properties.sampleData.items.additionalProperties.type).toBe("string");
  });
  it("keeps the schema prefix stable and untrusted reference values in the user message only", () => {
    const first = request();
    expect(first.messages[0]).toEqual(request().messages[0]);
    expect(first.messages[0]!.content).not.toContain("untrusted-reference-text");
    expect(first.messages[1]!.content).toContain("untrusted-reference-text");
  });
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  it("freezes regional observation text policy and retains original failed data under the existing input bound", () => {
    const first = request();
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    expect(first.scope.promptVersion).toBe("visual-blueprint@14");
    // end
    const system = first.messages[0]!.content as string;
    expect(system).toContain("同一个视觉来源全部非空text项按原顺序以单个空格连接");
    expect(system).toContain("不为它添加observe步骤或新造描述文字");
    const draft = { pages: [], marker: "untrusted-original-layout-prose" };
    const repair = buildVisualBlueprintRepairRequest(first, draft, [{ code: "VISUAL_BLUEPRINT_OBSERVATION_TEXT_UNSUPPORTED",
      expectedTextIndexes: [0], availableTextRegionIds: ["source-known"] }]);
    expect(repair.messages[0]).toEqual(first.messages[0]);
    expect(repair.route).toEqual(first.route);
    expect(Buffer.byteLength(JSON.stringify(repair.messages))).toBeLessThanOrEqual(96 * 1024);
    const payload = JSON.parse(repair.messages[1]!.content as string) as { repairContext: { failedDraft: unknown } };
    expect(payload.repairContext.failedDraft).toEqual(draft);
  });
  // end
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  it("explicitly omits absent units instead of generating empty sample values", () => {
    expect(request().messages[0]!.content).toContain("无单位、无描述或不适用的可选字段直接省略该键");
  });
  it("retains the real empty-unit reply as a strict negative without silently dropping data", () => {
    const reply = JSON.parse(readFileSync(new URL("../../../../tests/fixtures/energy-overview-20261023/live-blueprint-empty-unit/provider-reply.json", import.meta.url), "utf8")) as { content: string };
    const result = CustomerSolutionBlueprintSchema.safeParse(JSON.parse(reply.content) as unknown);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ["pages", 0, "regions", 5, "sampleData", 2, "unit"], code: "too_small" }),
    ]));
  });
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  it("freezes an explicit default-off repair policy and derives bounded same-route feedback with a stable system prefix", () => {
    expect(freezeVisualBlueprintModel(route).repairPolicy).toBe("none");
    expect(freezeVisualBlueprintModel(route, "once").configHash).not.toBe(freezeVisualBlueprintModel(route).configHash);
    const original = request();
    const repair = buildVisualBlueprintRepairRequest(original, { pages: [] }, [{ code: "VISUAL_BLUEPRINT_SOURCE_MISSING", regionIds: ["known-region"] }]);
    expect(repair.messages[0]).toEqual(original.messages[0]);
    expect(repair.route).toEqual(original.route);
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    expect(repair.scope).toMatchObject({ task: "repair", promptVersion: "visual-blueprint-repair@8", runId: original.scope.runId });
    // end
    // end
    // end
    expect(repair.scope.inputHash).not.toBe(original.scope.inputHash);
    expect(repair.messages[1]!.content).toContain("known-region");
    expect(JSON.stringify(repair.messages)).not.toMatch(/image_url|base64|vcont1:|vref1:|leaseOwner/);
    expect(() => buildVisualBlueprintRepairRequest(original, { text: "x".repeat(32768) }, [{ code: "SCHEMA_INVALID" }])).toThrow("VISUAL_BLUEPRINT_REPAIR_CONTEXT_INVALID");
  });
  it("rejects a changed prefix or an old frozen identity instead of reusing its repair authority", () => {
    const base = request();
    expect(() => buildVisualBlueprintRepairRequest({ ...base, messages: [{ role: "system", content: "changed-prefix" }, base.messages[1]!] },
      "{bad}", [{ code: "BLUEPRINT_JSON_SYNTAX_INVALID" }])).toThrow("VISUAL_BLUEPRINT_REPAIR_CONTEXT_INVALID");
    expect(() => buildVisualBlueprintRequest({ inputHash: "a".repeat(64), content: {
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      blueprintModel: { ...freezeVisualBlueprintModel(route, "once"), promptVersion: "visual-blueprint@11" },
      // end
    } } as unknown as VisualContinuationSnapshot, "unchanged instruction")).toThrow("VISUAL_BLUEPRINT_CONFIG_CHANGED");
  });
  // end
  // end
});
// end
