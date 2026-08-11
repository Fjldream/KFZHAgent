import { describe, expect, it } from "vitest";
import { z } from "zod";
import type {
  CustomerEffectBlueprint,
  ModuleDeliveryGap,
  ModulePlan,
  UIComponentSpec,
  UIImplementationSpec,
} from "@kf/contracts";
import { evaluateModuleDelivery } from "./module-quality.js";
import { ModuleRegistry } from "./module-registry.js";

const theme = {
  background: "#101827", surface: "#1E293B", primary: "#2563EB", accent: "#38BDF8",
  textPrimary: "#F8FAFC", textSecondary: "#94A3B8", fontFamily: "Inter", spacingUnit: 8,
  radiusScale: { small: 4, medium: 8, large: 16 },
} as const;

function blueprint(ids: string[] = ["hero"]): CustomerEffectBlueprint {
  return {
    schema: "kf-design-plan/v2", displayName: "Portal", overview: { objective: "Show profile", audiences: ["Visitors"], scenarios: ["Browse"], valueProposition: "Clarity" },
    informationArchitecture: { narrative: "Hero first", wireframe: "hero" },
    modules: ids.map((id) => ({ id, name: id, purpose: "Present content", content: ["content"], sampleData: [], interactions: [], presentation: "Clear" })),
    visualDirection: { tone: "Dark", colors: ["blue"], typography: "Modern", spacingAndSurfaces: "Comfortable" }, highlights: ["Clear"],
    revisionNotes: { added: [], changed: [], retained: [] }, acceptanceCriteria: ["Works"], openQuestions: [],
  };
}

function plan(ids: string[] = ["hero"]): ModulePlan {
  return {
    schema: "kf-module-plan/v1", projectKey: "kingclient.portal", theme, assets: [], operations: [],
    pages: [{ id: "home", title: "Home", mode: "vertical-flow", modules: ids.map((id, order) => ({
      id, kind: "content.hero", templateVersion: "1.0.0", variant: "no-portrait", title: id,
      content: JSON.stringify({ title: id }), sourceBlueprintModuleIds: [id], placement: { region: "main", order, columnSpan: 12, preferredHeight: "medium", alignment: "stretch", emphasis: "primary" }, interactions: [],
    })) }],
  };
}

function component(moduleId = "hero", overrides: Partial<UIComponentSpec> = {}): UIComponentSpec {
  return {
    id: `${moduleId}/surface`, sourceModuleId: moduleId, role: "surface", capabilityId: "layout.2", critical: true,
    geometry: { x: 0, y: 0, width: 600, height: 240 }, properties: {}, style: { declarations: {}, states: {} }, ...overrides,
  };
}

function implementation(components: UIComponentSpec[] = [component(), component("hero", { id: "hero/title", role: "title", capabilityId: "text", critical: false })]): UIImplementationSpec {
  return { schema: "kf-ui-implementation/v1", theme, pages: [{ id: "home", width: 1440, height: 900, components }] };
}
function registry(): ModuleRegistry { const value = new ModuleRegistry(); const common = { version: "1.0.0", category: "content", maturity: "stable" as const, variants: ["no-portrait"], contentSchema: z.object({ title: z.string() }), assetSlots: [], requiredKfCapabilities: ["layout.2"], layout: { regions: ["main"] as const, minColumnSpan: 1, maxColumnSpan: 12, preferredHeights: ["medium"] as const, interactions: ["navigate"] as const, height: { min: 1, preferred: { compact: 1, small: 1, medium: 200, large: 300, full: 400 }, max: 400 } }, quality: { minimumComponentCount: 2, minimumCriticalComponentCount: 1, requiredRoles: ["surface"], requiredCriticalRoles: ["surface"], requiredCapabilityIds: ["layout.2"] }, compile: () => ({ components: [], deliveryGaps: [] }) }; value.register({ ...common, kind: "content.hero" }); value.register({ ...common, kind: "content.card-grid" }); return value; }

function evaluate(overrides: Partial<Parameters<typeof evaluateModuleDelivery>[0]> = {}) {
  const ui = implementation();
  return evaluateModuleDelivery({
    blueprint: blueprint(), plan: plan(), implementation: ui,
    traces: [{ schema: "kf-module-trace/v1", projectKey: "kingclient.portal", entries: ui.pages[0]!.components.map((item) => ({ pageId: "home", moduleId: "hero", outputId: item.id })) }],
    assetBindings: [], gaps: [], registry: registry(), assetsById: {}, trustedBlueprintModuleMapping: { hero: ["hero"] }, ...overrides,
  });
}

describe("evaluateModuleDelivery", () => {
  it("blocks delivery when a confirmed blueprint module is absent from ModulePlan", () => {
    const report = evaluate({ blueprint: blueprint(["hero", "projects"]), plan: plan(["hero"]) }).report;
    expect(report.status).toBe("blocked");
    expect(report.gaps).toContainEqual(expect.objectContaining({ moduleId: "hero", requirement: expect.stringContaining("projects"), reason: "BLUEPRINT_MODULE_UNMAPPED", severity: "blocking" }));
  });

  it.each([
    ["critical control", { implementation: implementation([component("hero", { critical: false })]) }],
    ["critical interaction", { plan: (() => { const value = plan(); value.pages[0]!.modules[0]!.interactions = [{ type: "navigate", pageId: "home" }]; return value; })() }],
  ])("blocks delivery for a missing %s", (_label, overrides) => {
    expect(evaluate(overrides).report.status).toBe("blocked");
  });

  it("blocks a broken requested asset binding", () => {
    const value = plan(); value.assets.push({ id: "portrait", kind: "image", name: "Portrait", mimeType: "image/png", description: "Portrait" });
    value.pages[0]!.modules[0]!.assetId = "portrait";
    expect(evaluate({ plan: value }).report.gaps).toContainEqual(expect.objectContaining({ reason: "ASSET_BINDING_MISSING", severity: "blocking" }));
  });

  it.each([
    ["seed token", component("hero", { content: "__KF_SEED_PLACEHOLDER__" })],
    ["nested seed token", component("hero", { properties: { nested: { value: "__KF_PLACEHOLDER_IMAGE__" } } })],
    ["placeholder asset", component("hero", { capabilityId: "image", properties: { src: "seed-placeholder-image" } })],
  ])("blocks template residue: %s", (_label, dirty) => {
    const report = evaluate({ implementation: implementation([dirty]) }).report;
    expect(report.status).toBe("blocked");
    expect(report.gaps).toContainEqual(expect.objectContaining({ reason: "TEMPLATE_RESIDUE" }));
  });

  it("blocks overflow and sibling overlap while allowing parent/child composition", () => {
    const overflow = component("hero", { geometry: { x: 1200, y: 0, width: 300, height: 240 } });
    const sibling = component("other", { geometry: { x: 1200, y: 10, width: 120, height: 200 } });
    const siblingPlan = plan(["hero", "other"]);
    const report = evaluate({ blueprint: blueprint(["hero", "other"]), plan: siblingPlan, implementation: implementation([overflow, sibling]), traces: [
      { schema: "kf-module-trace/v1", projectKey: "kingclient.portal", entries: [{ pageId: "home", moduleId: "hero", outputId: "hero/surface" }] },
      { schema: "kf-module-trace/v1", projectKey: "kingclient.portal", entries: [{ pageId: "home", moduleId: "other", outputId: "other/surface" }] },
    ] });
    expect(report.report.status).toBe("blocked");
    expect(report.report.gaps.map((gap) => gap.reason)).toEqual(expect.arrayContaining(["GEOMETRY_OVERFLOW", "CRITICAL_COMPONENT_OVERLAP"]));
  });

  it("blocks silent fallback and a complex module collapsed to a single text control", () => {
    const silentFallback = component("hero", { fallbackCapabilityId: "text" });
    const collapsedPlan = plan(); collapsedPlan.pages[0]!.modules[0]!.kind = "content.card-grid";
    const textOnly = component("hero", { capabilityId: "text", content: "Card content" });
    const fallback = evaluate({ implementation: implementation([silentFallback]) }).report;
    const collapsed = evaluate({ plan: collapsedPlan, implementation: implementation([textOnly]) }).report;
    expect(fallback.gaps).toContainEqual(expect.objectContaining({ reason: "SILENT_FALLBACK" }));
    expect(collapsed.gaps).toContainEqual(expect.objectContaining({ reason: "COMPLEX_MODULE_TEXT_COLLAPSE" }));
  });

  it("keeps documented non-critical differences deliverable with warnings", () => {
    const gap: ModuleDeliveryGap = { moduleId: "hero", requirement: "Minor shadow", severity: "warning", status: "unresolved", reason: "Minor visual difference" };
    expect(evaluate({ gaps: [gap] }).report.status).toBe("ready_with_warnings");
  });

  it("keeps a blocking repair owner for every module at the 250-gap report cap", () => {
    const moduleIds = Array.from({ length: 250 }, (_, index) => `module-${String(index).padStart(3, "0")}`);
    const cappedPlan = plan([moduleIds[0]!]);
    cappedPlan.pages = Array.from({ length: 5 }, (_, pageIndex) => ({
      id: `page-${pageIndex}`, title: `Page ${pageIndex}`, mode: "vertical-flow" as const,
      modules: moduleIds.slice(pageIndex * 50, (pageIndex + 1) * 50).map((id, order) => ({
        ...plan([id]).pages[0]!.modules[0]!, id, placement: { ...plan([id]).pages[0]!.modules[0]!.placement, order }, sourceBlueprintModuleIds: [id],
      })),
    }));
    const report = evaluate({ blueprint: blueprint(Array.from({ length: 12 }, (_, index) => `blueprint-${index}`)), plan: cappedPlan, implementation: undefined as never, traces: [] }).report;
    expect(report.status).toBe("blocked");
    expect(report.gaps).toHaveLength(250);
    expect(new Set(report.gaps.map((gap) => gap.moduleId))).toEqual(new Set(moduleIds));
  });

  it("rejects descriptor surprises without invoking their getters", () => {
    let reads = 0;
    const unsafe = blueprint() as unknown as Record<string, unknown>;
    Object.defineProperty(unsafe, "modules", { enumerable: true, get: () => { reads += 1; return []; } });
    expect(() => evaluate({ blueprint: unsafe as CustomerEffectBlueprint })).toThrow("MODULE_DELIVERY_UNSAFE_INPUT");
    expect(reads).toBe(0);
  });
});
