// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalServerHash, CustomerSolutionBlueprintSchema, SolutionImplementationPlanSchema, SolutionNodeSchema, VisualPlanningContextSchema } from "@kf/contracts";
import type { ModelPortContext } from "@kf/agent-orchestrator";
import { getDesignKnowledgeSnapshot, retrieveCapabilities } from "@kf/domain-client";
import { buildVisualSemanticMessages, validateVisualSemanticOutput } from "../conversations/deepseek-model.js";
import { inspectVisualSemanticOutput, validateVisualSemanticCompilation } from "./visual-semantic-output.js";
import { buildVisualSemanticRepairRequest, buildVisualSemanticRequest, freezeVisualSemanticModel } from "./visual-semantic-request.js";
import type { ModelRoute, VisualEngineeringContinuation } from "@kf/contracts";
import { createVisualPlanningRuntime } from "./visual-blueprint-runtime.js";
import type { PrismaClient } from "@prisma/client";
import { reviewedEnergyDecorationOmissions } from "../../../../tests/helpers/energy-reference-review.js";

function energySample() {
  const directory = new URL("../../../../tests/fixtures/energy-overview-20261023/live-semantic-envelope/", import.meta.url);
  const read = (name: string): unknown => JSON.parse(readFileSync(new URL(name, directory), "utf8")) as unknown;
  const blueprint = CustomerSolutionBlueprintSchema.parse(read("blueprint.json"));
  const visualReference = VisualPlanningContextSchema.parse({ ...(read("reference-review.json") as Record<string, unknown>), acceptedDifferences: read("accepted-differences.json") });
  const candidates = retrieveCapabilities({ blueprint, knowledge: getDesignKnowledgeSnapshot(), visualReference });
  const context: ModelPortContext = { tenantId: "tenant", userId: "user", workspaceId: "workspace", conversationId: "conversation",
    currentRevisionId: "revision", generationWorkflow: "creative-v2", currentProjectKey: "kingclient", recentMessages: [], assetCatalog: [],
    confirmedSolutionBlueprint: blueprint, capabilityCandidates: candidates, visualReference };
  const reply = read("provider-reply.json") as { content: string };
  return { context, raw: JSON.parse(reply.content) as unknown };
}
const route: ModelRoute = { provider: "deepseek", baseUrl: "https://semantic.invalid/v1", model: "fixture", supportsJson: true,
  supportsThinking: false, supportsVision: false, maxContextTokens: 1048576, timeoutMs: 1000, pricingVersion: null };

describe("bounded visual semantic feedback", () => {
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  it.each([false, true])("honors explicit semantic thinking=%s and reserves the same policy for its one-shot repair", supportsThinking => {
    const { context, raw } = energySample();
    const semanticRoute = { ...route, supportsThinking };
    const snapshot = { inputHash: "a".repeat(64), content: { ...context, requestedByUserId: context.userId,
      baseRevisionId: "revision", runId: "run-fixture", semanticModel: freezeVisualSemanticModel(semanticRoute, "once"),
      blueprintReview: { content: { blueprint: context.confirmedSolutionBlueprint } }, accepted: { reference: context.visualReference } } } as unknown as VisualEngineeringContinuation;
    const prepared = buildVisualSemanticRequest(snapshot, context.capabilityCandidates!, []);
    expect(prepared.request).toMatchObject({ thinking: supportsThinking, maxOutputTokens: 32000, maxResponseBytes: 2 * 1024 * 1024 });
    if (supportsThinking) expect(prepared.request.reasoningEffort).toBe("high");
    else expect(prepared.request).not.toHaveProperty("reasoningEffort");
    const feedback = [{ code: "VISUAL_ENVELOPE_INVALID" }];
    const repair = buildVisualSemanticRepairRequest(prepared.request, prepared.context, raw, feedback);
    expect(repair.thinking).toBe(supportsThinking);
    expect(repair.reasoningEffort).toBe(prepared.request.reasoningEffort);
    expect(repair.maxOutputTokens).toBe(prepared.request.maxOutputTokens);
    expect(repair.maxResponseBytes).toBe(prepared.request.maxResponseBytes);
    for (const changed of [
      { ...prepared.request, thinking: !supportsThinking },
      { ...prepared.request, reasoningEffort: supportsThinking ? "low" as const : "high" as const },
      { ...prepared.request, maxOutputTokens: 32001 },
      { ...prepared.request, maxResponseBytes: 2 * 1024 * 1024 + 1 },
    ]) expect(() => buildVisualSemanticRepairRequest(changed, prepared.context, raw, feedback))
      .toThrow("VISUAL_SEMANTIC_REPAIR_CONTEXT_INVALID");
  });
  // end
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  it("binds the exact base project to the visual prompt and request hash, rejecting the old frozen protocol", () => {
    const { context } = energySample();
    const snapshot = { inputHash: "a".repeat(64), content: { ...context, requestedByUserId: context.userId,
      baseRevisionId: "revision", runId: "run-fixture", semanticModel: freezeVisualSemanticModel(route, "once"),
      blueprintReview: { content: { blueprint: context.confirmedSolutionBlueprint } }, accepted: { reference: context.visualReference } } } as unknown as VisualEngineeringContinuation;
    const prior = buildVisualSemanticRequest(snapshot, context.capabilityCandidates!, [], "device-overview-status");
    const other = buildVisualSemanticRequest(snapshot, context.capabilityCandidates!, [], "other-project");
    expect(prior.context.currentProjectKey).toBe("device-overview-status");
    expect(prior.request.messages[1]!.content).toContain('"serverProjectIdentity":{"projectKey":"device-overview-status"}');
    expect(prior.request.scope.inputHash).not.toBe(other.request.scope.inputHash);
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    expect(prior.request.scope.promptVersion).toBe("visual-semantic@24");
    // end
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    for (const promptVersion of ["visual-semantic@21", "visual-semantic@22", "visual-semantic@23"] as const) {
    // end
      const old = structuredClone(snapshot);
      old.content.semanticModel!.promptVersion = promptVersion as never;
      expect(() => buildVisualSemanticRequest(old, context.capabilityCandidates!, [], "device-overview-status")).toThrow("VISUAL_SEMANTIC_CONFIG_CHANGED");
    }
    // end
  });
  // end
  it.each([
    { directory: "live-semantic-repair-repeater", expectedIssue: { code: "SEMANTIC_PLAN_INVALID", detail: expect.stringContaining("sourceBlueprintRegionIds") } },
    { directory: "live-semantic-layout-style-role", expectedIssue: { code: "VISUAL_BLUEPRINT_LAYOUT_CAPABILITY_MISMATCH", regionId: "content" } },
  ])("keeps the actual repaired $directory proposal invalid without dropping styles or inventing node metadata", ({ directory, expectedIssue }) => {
    const location = new URL(`../../../../tests/fixtures/energy-overview-20261023/${directory}/`, import.meta.url);
    const read = (name: string): unknown => JSON.parse(readFileSync(new URL(name, location), "utf8")) as unknown;
    const blueprint = CustomerSolutionBlueprintSchema.parse(read("blueprint.json"));
    const visualReference = VisualPlanningContextSchema.parse({ ...(read("reference-review.json") as Record<string, unknown>), acceptedDifferences: read("accepted-differences.json") });
    const context = { ...energySample().context, confirmedSolutionBlueprint: blueprint, visualReference,
      capabilityCandidates: retrieveCapabilities({ blueprint, visualReference, knowledge: getDesignKnowledgeSnapshot() }) };
    const raw = JSON.parse((read("repaired-provider-reply.json") as { content: string }).content) as unknown;
    const hash = canonicalServerHash(raw);
    const result = inspectVisualSemanticOutput(context, raw, []);
    expect(result).toMatchObject({ ok: false, issues: expect.arrayContaining([
      expect.objectContaining(expectedIssue),
    ]) });
    expect(canonicalServerHash(raw)).toBe(hash);
    if (directory === "live-semantic-layout-style-role") {
      const plan = (raw as { plan: { pages: { root: unknown }[] } }).plan;
      const pending = plan.pages.map(page => SolutionNodeSchema.parse(page.root));
      let styledLayouts = 0;
      while (pending.length) {
        const node = pending.pop()!;
        if (node.kind === "layout") {
          if (node.styleRole === "card-surface") styledLayouts++;
          pending.push(...node.children);
        }
      }
      expect(styledLayouts).toBe(5);
    }
  });
  it("rejects two distinct reviewed regions claiming the same actually compiled component", () => {
    const golden = JSON.parse(readFileSync(new URL("../../../../tests/fixtures/creative-goldens/management-admin.json", import.meta.url), "utf8")) as { blueprint: unknown; plan: unknown };
    const blueprint = CustomerSolutionBlueprintSchema.parse(golden.blueprint);
    blueprint.pages[0]!.regions.find(region => region.id === "admin-sidebar-brand")!.visualRegionIds = ["heading", "heading-copy"];
    const original = energySample().context.visualReference!;
    const spec = { ...original.spec, uncertainties: [], regions: ["heading", "heading-copy"].map(id => ({ id, parentId: null, role: "text" as const,
      box: { x: 0, y: 0, width: 0.2, height: 0.1 }, text: ["知序组织"], confidence: 1, interactionHint: null })) };
    const visualReference = VisualPlanningContextSchema.parse({ ...original, spec, specHash: canonicalServerHash(spec),
      mappings: spec.regions.map(region => ({ regionId: region.id, controlType: "richtext", capabilityId: "richtext", support: "supported_unverified",
        reason: "test reviewed heading", evidenceIds: [], fallback: null })),
      acceptedDifferences: spec.regions.map(region => ({ regionId: region.id, disposition: "accept-unverified", capabilityId: "richtext", reason: "test reviewed heading" })) });
    const context = { ...energySample().context, confirmedSolutionBlueprint: blueprint, visualReference,
      capabilityCandidates: retrieveCapabilities({ blueprint, visualReference, knowledge: getDesignKnowledgeSnapshot() }) };
    const plan = SolutionImplementationPlanSchema.parse(golden.plan);
    const pending = plan.pages.map(page => page.root);
    while (pending.length) {
      const node = pending.pop()!;
      if (node.kind === "control" && node.id === "admin-brand-title") node.capabilityId = "richtext";
      if (node.kind === "layout") pending.push(...node.children);
    }
    const raw = { schema: "kf-visual-semantic-plan/v1", plan, bindings: spec.regions.map(region => ({ regionId: region.id, nodeId: "admin-brand-title" })) };
    expect(() => validateVisualSemanticCompilation(context, raw, [])).toThrow("VISUAL_COMPONENT_OWNERSHIP_CONFLICT");
  });
  it("prepares the actual independently accepted blueprint after removing unadvertised provisional detail identities", () => {
    const directory = new URL("../../../../tests/fixtures/energy-overview-20261023/live-detail-reservation/", import.meta.url);
    const read = (name: string): unknown => JSON.parse(readFileSync(new URL(name, directory), "utf8")) as unknown;
    const blueprint = CustomerSolutionBlueprintSchema.parse(read("blueprint.json"));
    const visualReference = VisualPlanningContextSchema.parse({ ...(read("reference-review.json") as Record<string, unknown>), acceptedDifferences: read("accepted-differences.json") });
    const context = { ...energySample().context, confirmedSolutionBlueprint: blueprint, visualReference,
      capabilityCandidates: retrieveCapabilities({ blueprint, visualReference, knowledge: getDesignKnowledgeSnapshot() }) };
    expect(context.capabilityCandidates.detailedCapabilityIds).toHaveLength(14);
    const messages = buildVisualSemanticMessages(context);
    expect(Buffer.byteLength(JSON.stringify(messages), "utf8")).toBeLessThanOrEqual(128000);
    expect(messages[1]!.content).toContain("requiredVisualBindings");
  });
  it("keeps explicit fixed-image decoration omissions separate from business text, actions and production mapping", () => {
    const directory = new URL("../../../../tests/fixtures/energy-overview-20261023/live-semantic-repair-static-marker/", import.meta.url);
    const reference = JSON.parse(readFileSync(new URL("reference-review.json", directory), "utf8")) as { spec: import("@kf/contracts").VisualReferenceSpec };
    const hash = canonicalServerHash(reference.spec);
    expect(reviewedEnergyDecorationOmissions(reference.spec).map(item => item.regionId)).toEqual(expect.arrayContaining(["device-2-status-dot", "device-3-status-dot"]));
    expect(reviewedEnergyDecorationOmissions({ ...reference.spec, sourceHash: "0".repeat(64) })).toEqual([]);
    const noStatus = structuredClone(reference.spec);
    noStatus.regions.forEach(region => { region.text = region.text.filter(text => !["运行正常", "待检修"].includes(text)); });
    expect(reviewedEnergyDecorationOmissions(noStatus).some(item => item.regionId === "device-2-status-dot")).toBe(false);
    const interactive = structuredClone(reference.spec);
    interactive.regions.find(region => region.id === "device-2-status-dot")!.interactionHint = "点击查看状态";
    expect(reviewedEnergyDecorationOmissions(interactive).some(item => item.regionId === "device-2-status-dot")).toBe(false);
    expect(canonicalServerHash(reference.spec)).toBe(hash);
    expect(reviewedEnergyDecorationOmissions(reference.spec).every(item => reference.spec.regions.find(region => region.id === item.regionId)!.text.length === 0)).toBe(true);
  });
  it("diagnoses the unmodified real envelope, absent event arrays, binding and native geometry without accepting or mutating it", () => {
    const { context, raw } = energySample(); const hash = canonicalServerHash(raw);
    expect(() => validateVisualSemanticOutput(context, raw)).toThrow("schema");
    const inspected = inspectVisualSemanticOutput(context, raw, []);
    expect(inspected).toMatchObject({ ok: false, repairable: true });
    if (inspected.ok) throw new Error("the original real draft must remain invalid");
    expect(inspected.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "VISUAL_ENVELOPE_INVALID" }),
      expect.objectContaining({ code: "EVENT_BINDINGS_REQUIRED" }),
      expect.objectContaining({ code: "VISUAL_BLUEPRINT_LAYOUT_CAPABILITY_MISMATCH", regionId: "main" }),
      expect.objectContaining({ code: "NATIVE_LAYOUT_UNSATISFIABLE", detail: expect.stringContaining("node-header-divider") }),
    ]));
    expect(inspected.issues.length).toBeLessThanOrEqual(12);
    expect(canonicalServerHash(raw)).toBe(hash);
    expect(() => validateVisualSemanticOutput(context, raw)).toThrow("schema");
  });

  it("fits complete approved repair facts and the real failed draft under the unchanged input bound", () => {
    const { context, raw } = energySample();
    const snapshot = { inputHash: "a".repeat(64), content: { ...context, requestedByUserId: context.userId, baseRevisionId: "revision", runId: "run-fixture",
      semanticModel: freezeVisualSemanticModel(route, "once"), blueprintReview: { content: { blueprint: context.confirmedSolutionBlueprint } },
      accepted: { reference: context.visualReference } } } as unknown as VisualEngineeringContinuation;
    const base = buildVisualSemanticRequest(snapshot, context.capabilityCandidates!, []);
    const inspected = inspectVisualSemanticOutput(context, raw, []);
    if (inspected.ok) throw new Error("negative required");
    const repair = buildVisualSemanticRepairRequest(base.request, base.context, raw, inspected.issues);
    expect(repair.route).toEqual(base.request.route);
    expect(repair.messages[0]).toEqual(base.request.messages[0]);
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    expect(repair.scope).toMatchObject({ task: "repair", promptVersion: "visual-semantic-repair@13", attempt: 2 });
    // end
    // end
    // end
    expect(repair.scope.inputHash).not.toBe(base.request.scope.inputHash);
    expect(Buffer.byteLength(JSON.stringify(repair.messages), "utf8")).toBeLessThanOrEqual(128000);
    const payload = JSON.parse(repair.messages[1]!.content as string) as Record<string, unknown>;
    expect(payload.blueprint).toEqual(context.confirmedSolutionBlueprint);
    expect(payload.failedDraft).toEqual(raw);
    expect(payload.requiredVisualBindings).toHaveLength(context.visualReference!.spec.regions.length);
    expect(JSON.stringify(repair.messages)).not.toMatch(/image_url|base64|veng1:|vref1:|leaseOwner/);
    expect(() => buildVisualSemanticRepairRequest(base.request, base.context, { text: "x".repeat(65536) }, inspected.issues))
      .toThrow("VISUAL_SEMANTIC_REPAIR_CONTEXT_INVALID");
    expect(() => buildVisualSemanticRepairRequest({ ...base.request, route: { ...route, maxContextTokens: 33000 } }, base.context, raw, inspected.issues))
      .toThrow("VISUAL_SEMANTIC_REPAIR_CONTEXT_TOO_LARGE");
    expect(() => buildVisualSemanticRepairRequest(base.request, base.context, raw, [{ code: "INVALID", detail: "x".repeat(128000) }]))
      .toThrow("VISUAL_SEMANTIC_REPAIR_CONTEXT_TOO_LARGE");
    expect(() => buildVisualSemanticRepairRequest(base.request, base.context, raw, Array.from({ length: 13 }, () => ({ code: "INVALID" }))))
      .toThrow("VISUAL_SEMANTIC_REPAIR_CONTEXT_INVALID");
    expect(() => buildVisualSemanticRepairRequest({ ...base.request, scope: { ...base.request.scope, task: "repair" } }, base.context, raw, inspected.issues))
      .toThrow("VISUAL_SEMANTIC_REPAIR_CONTEXT_INVALID");
    const changedContext = structuredClone(base.context);
    changedContext.visualReference!.acceptedDifferences[0]!.reason = "different approved context";
    expect(() => buildVisualSemanticRepairRequest(base.request, changedContext, raw, inspected.issues))
      .toThrow("VISUAL_SEMANTIC_REPAIR_CONTEXT_INVALID");
    expect(freezeVisualSemanticModel(route).repairPolicy).toBe("none");
    expect(freezeVisualSemanticModel(route, "once").configHash).not.toBe(freezeVisualSemanticModel(route).configHash);
  });

  it("does not erase explicit invalid event values or forbidden fields while producing diagnostics", () => {
    const { context, raw } = energySample();
    const draft = raw as { plan: { pages: { root: Record<string, unknown> }[] } };
    const pending = [draft.plan.pages[0]!.root];
    let changed = false;
    while (pending.length) {
      const node = pending.pop()!;
      if (node.kind === "control") { node.eventBindings = null; node.nativeIds = ["forbidden-native-id"]; changed = true; break; }
      if (Array.isArray(node.children)) pending.push(...node.children as Record<string, unknown>[]);
    }
    expect(changed).toBe(true);
    const hash = canonicalServerHash(raw);
    expect(inspectVisualSemanticOutput(context, raw, [])).toMatchObject({ ok: false });
    expect(canonicalServerHash(raw)).toBe(hash);
    expect(() => validateVisualSemanticOutput(context, raw)).toThrow();
  });

  it("never treats corrupted approved context or asset metadata as model-repairable output", () => {
    const { context, raw } = energySample();
    context.visualReference!.specHash = "0".repeat(64);
    expect(inspectVisualSemanticOutput(context, raw, [])).toMatchObject({ ok: false, repairable: false });
    const fresh = energySample();
    expect(inspectVisualSemanticOutput(fresh.context, fresh.raw, [{ workspaceAssetId: "invalid" } as never]))
      .toMatchObject({ ok: false, repairable: false });
  });

  it("never enables an unrecognized semantic repair policy", () => {
    const environment = { MODEL_PORT_MODE: "deepseek", DEEPSEEK_API_KEY: "fixture-key", DEEPSEEK_MODEL: "deepseek-chat",
      KF_SERVER_PLAN_HMAC_KEY_BASE64: Buffer.alloc(32, 0x48).toString("base64") };
    expect(createVisualPlanningRuntime({} as PrismaClient, environment).semantics).not.toBeNull();
    expect(createVisualPlanningRuntime({} as PrismaClient, { ...environment, KF_VISUAL_SEMANTIC_REPAIR: "once" }).semantics).not.toBeNull();
    expect(createVisualPlanningRuntime({} as PrismaClient, { ...environment, KF_VISUAL_SEMANTIC_REPAIR: "unbounded" }).semantics).toBeNull();
  });
});
// end
