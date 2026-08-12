import { describe, expect, it } from "vitest";
import { z } from "zod";
import type {
  AcceptedBlueprintArtifact,
  ModuleDeliveryGap,
  ModulePlan,
  ModulePlanModule,
  UIComponentSpec,
  UIImplementationSpec,
} from "@kf/contracts";
import { evaluateModuleDelivery } from "./module-quality.js";
import { createDefaultModuleRegistry, ModuleRegistry } from "./module-registry.js";
import { stableModuleComponentId } from "./stable-ids.js";

const theme = {
  background: "#101827", surface: "#1E293B", primary: "#2563EB", accent: "#38BDF8",
  textPrimary: "#F8FAFC", textSecondary: "#94A3B8", fontFamily: "Inter", spacingUnit: 8,
  radiusScale: { small: 4, medium: 8, large: 16 },
} as const;

function acceptedBlueprint(ids: string[] = ["hero"]): AcceptedBlueprintArtifact {
  return {
    schema: "kf-accepted-blueprint-artifact/v1", projectKey: "kingclient.portal", revisionId: "revision-test",
    blueprintHash: "a".repeat(64), signature: "b".repeat(64),
    modules: [...ids].sort().map((id) => ({ blueprintModuleId: id, expectedKind: "content.hero", expectedCategory: "content", interactionRequirements: [] })),
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

function implementation(components: UIComponentSpec[] = [component(), component("hero", { id: "hero/title", role: "title", capabilityId: "text", critical: false, geometry: { x: 20, y: 20, width: 200, height: 32 }, properties: { parentId: "hero/surface" } })]): UIImplementationSpec {
  return { schema: "kf-ui-implementation/v1", theme, pages: [{ id: "home", width: 1440, height: 900, components }] };
}
function registry(): ModuleRegistry { const value = new ModuleRegistry(); const common = { version: "1.0.0", category: "content", maturity: "stable" as const, variants: ["no-portrait"], contentSchema: z.object({ title: z.string() }), assetSlots: [], requiredKfCapabilities: ["layout.2"], compilerFingerprint: "test-content-compiler-v1", layoutFingerprint: "test-content-layout-v1", layout: { regions: ["main"] as const, minColumnSpan: 1, maxColumnSpan: 12, preferredHeights: ["medium"] as const, interactions: ["navigate"] as const, height: { min: 1, preferred: { compact: 1, small: 1, medium: 200, large: 300, full: 400 }, max: 400 } }, quality: { minimumComponentCount: 2, minimumCriticalComponentCount: 1, requiredRoles: ["surface"], requiredCriticalRoles: ["surface"], requiredCapabilityIds: ["layout.2"], variantRequiredOutputs: { "no-portrait": [{ outputId: "surface", role: "surface", capabilityId: "layout.2", critical: true }] }, deriveRequiredOutputs: () => [{ outputId: "surface", role: "surface", capabilityId: "layout.2", critical: true }] }, compile: () => ({ components: [], deliveryGaps: [] }) }; value.register({ ...common, kind: "content.hero" }); value.register({ ...common, kind: "content.card-grid" }); return value; }

function evaluate(overrides: Partial<Parameters<typeof evaluateModuleDelivery>[0]> = {}) {
  const ui = implementation();
  return evaluateModuleDelivery({
    acceptedBlueprint: acceptedBlueprint(), plan: plan(), implementation: ui,
    traces: [{ schema: "kf-module-trace/v1", projectKey: "kingclient.portal", entries: ui.pages[0]!.components.map((item) => ({ pageId: "home", moduleId: "hero", outputId: item.id })) }],
    assetBindings: [], gaps: [], registry: registry(), assetsById: {}, metadata: { schema: "kf-module-compilation-metadata/v1", projectKey: "kingclient.portal", moduleDefinitions: [], assets: [], blueprintMappings: [{ blueprintModuleId: "hero", pageId: "home", moduleId: "hero", expectedKind: "content.hero", expectedCategory: "content", interactionBindings: [] }] }, ...overrides,
  });
}

function realInstance(kind: string, variant: string): ModulePlanModule {
  const contentByKind: Record<string, Record<string, unknown>> = {
    "navigation.top": { logo: "KF", items: ["Home"] },
    "navigation.sidebar": { groups: [{ label: "Main", items: ["Home"] }] },
    "content.hero": { title: "Profile", primaryAction: "Open" },
    "metric.kpi-grid": { items: [{ label: "Availability", value: "99%" }] },
    "content.card-grid": { items: [{ title: "Project", summary: "Summary", tag: "New", action: "Open" }] },
    "content.timeline": { items: [{ title: "Started", detail: "Detail", date: "2026" }] },
    "data.chart-panel": { chart: { kind: variant, labels: ["A"], series: [{ name: "Value", values: [1] }] } },
    "data.status-grid": { items: [{ name: "Pump", severity: "online", detail: "Healthy" }] },
    "data.table": { table: { columns: [{ key: "name", label: "Name" }], rows: [{ name: "Pump" }] } },
    "data.detail": { fields: [{ label: "Name", value: "Pump", editable: true }] },
    "interaction.tabs-filter": { tabs: ["All"], active: "All" },
    "form.record-editor": { fields: [{ id: "name", label: "Name", placeholder: "Enter name" }], submitLabel: "Save" },
    "action.toolbar": { actions: [{ label: "Open" }] },
    "feedback.alert-list": { alerts: [{ title: "Alert", message: "Check", severity: "warning" }] },
    "content.contact-footer": { contacts: [{ label: "Email", value: "a@b.com" }], copyright: "2026", action: "Open" },
  };
  const navigable = new Set(["navigation.top", "navigation.sidebar", "content.hero", "content.card-grid", "action.toolbar", "content.contact-footer"]);
  const region = kind === "navigation.top" ? "header" : kind === "navigation.sidebar" ? "sidebar" : kind === "action.toolbar" ? "toolbar" : "main";
  return {
    id: "module", kind, templateVersion: "1.0.0", variant, title: "Module",
    content: JSON.stringify(contentByKind[kind]), sourceBlueprintModuleIds: ["module"],
    placement: { region, order: 0, columnSpan: 12, preferredHeight: "full", alignment: "stretch", emphasis: "primary" },
    interactions: navigable.has(kind) ? [{ type: "navigate", pageId: "home" }] : [],
    ...(kind === "content.hero" && variant !== "no-portrait" ? { assetId: "portrait" } : {}),
  };
}

describe("evaluateModuleDelivery", () => {
  it("blocks delivery when a confirmed blueprint module is absent from ModulePlan", () => {
    const report = evaluate({ acceptedBlueprint: acceptedBlueprint(["hero", "projects"]), plan: plan(["hero"]) }).report;
    expect(report.status).toBe("blocked");
    expect(report.gaps).toContainEqual(expect.objectContaining({ moduleId: "hero", requirement: expect.stringContaining("projects"), reason: "BLUEPRINT_MODULE_UNMAPPED", severity: "blocking" }));
  });

  it.each([
    ["critical control", { implementation: implementation([component("hero", { critical: false })]) }],
    ["critical interaction", { plan: (() => { const value = plan(); value.pages[0]!.modules[0]!.interactions = [{ type: "navigate", pageId: "home" }]; return value; })() }],
  ])("blocks delivery for a missing %s", (_label, overrides) => {
    expect(evaluate(overrides).report.status).toBe("blocked");
  });

  it("blocks two accepted blueprint requirements from reusing one implementation output", () => {
    const accepted = acceptedBlueprint(["hero-a", "hero-b"]);
    accepted.modules = accepted.modules.map((entry) => ({ ...entry, interactionRequirements: [{ type: "navigate", actionKind: "navigate", target: "home" }] }));
    const modulePlan = plan(["hero"]);
    modulePlan.pages[0]!.modules[0]!.sourceBlueprintModuleIds = ["hero-a", "hero-b"];
    modulePlan.pages[0]!.modules[0]!.interactions = [{ type: "navigate", pageId: "home" }];
    const action = component("hero", { id: "hero/action", role: "action", capabilityId: "button", properties: { action: { kind: "navigate", pageId: "home" } } });
    const report = evaluate({
      acceptedBlueprint: accepted,
      plan: modulePlan,
      implementation: implementation([component(), action]),
      metadata: {
        schema: "kf-module-compilation-metadata/v1", projectKey: "kingclient.portal", moduleDefinitions: [], assets: [],
        blueprintMappings: accepted.modules.map((entry) => ({ blueprintModuleId: entry.blueprintModuleId, pageId: "home", moduleId: "hero", expectedKind: "content.hero", expectedCategory: "content", interactionBindings: [{ ...entry.interactionRequirements[0]!, outputId: action.id }] })),
      },
    });
    expect(report.report.gaps).toContainEqual(expect.objectContaining({ reason: "BLUEPRINT_INTERACTION_OUTPUT_REUSED", severity: "blocking" }));
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
    const report = evaluate({ acceptedBlueprint: acceptedBlueprint(["hero", "other"]), plan: siblingPlan, implementation: implementation([overflow, sibling]), traces: [
      { schema: "kf-module-trace/v1", projectKey: "kingclient.portal", entries: [{ pageId: "home", moduleId: "hero", outputId: "hero/surface" }] },
      { schema: "kf-module-trace/v1", projectKey: "kingclient.portal", entries: [{ pageId: "home", moduleId: "other", outputId: "other/surface" }] },
    ] });
    expect(report.report.status).toBe("blocked");
    expect(report.report.gaps.map((gap) => gap.reason)).toEqual(expect.arrayContaining(["GEOMETRY_OVERFLOW", "CRITICAL_COMPONENT_OVERLAP"]));

    const parent = component("hero");
    const left = component("hero", { id: "hero/left", role: "title", capabilityId: "text", geometry: { x: 20, y: 20, width: 200, height: 80 }, properties: { parentId: parent.id } });
    const right = component("hero", { id: "hero/right", role: "description", capabilityId: "text", geometry: { x: 100, y: 40, width: 200, height: 80 }, properties: { parentId: parent.id } });
    const sameModule = evaluate({ implementation: implementation([parent, left, right]) });
    expect(sameModule.report.gaps).toContainEqual(expect.objectContaining({ reason: "CRITICAL_COMPONENT_OVERLAP" }));
    expect(sameModule.report.gaps.filter((gap) => gap.reason === "CRITICAL_COMPONENT_OVERLAP")).toHaveLength(1);
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
    const report = evaluate({ acceptedBlueprint: acceptedBlueprint(Array.from({ length: 12 }, (_, index) => `blueprint-${index}`)), plan: cappedPlan, implementation: undefined as never, traces: [] }).report;
    expect(report.status).toBe("blocked");
    expect(report.gaps).toHaveLength(250);
    expect(new Set(report.gaps.map((gap) => gap.moduleId))).toEqual(new Set(moduleIds));
  });

  it("applies every real V1 variant contract to its legal compiler output and blocks required-output mutation", () => {
    const defaults = createDefaultModuleRegistry();
    const kinds = ["navigation.top", "navigation.sidebar", "content.hero", "metric.kpi-grid", "content.card-grid", "content.timeline", "data.chart-panel", "data.status-grid", "data.table", "data.detail", "interaction.tabs-filter", "form.record-editor", "action.toolbar", "feedback.alert-list", "content.contact-footer"];
    for (const kind of kinds) {
      const definition = defaults.require(kind, "1.0.0");
      for (const variant of definition.variants) {
        const instance = realInstance(kind, variant);
        const asset = instance.assetId === undefined ? undefined : { assetId: instance.assetId, status: "resolved" as const, resolvedName: `${instance.assetId}.png` };
        const compiled = definition.compile({ context: { definition, instance, content: definition.contentSchema.parse(JSON.parse(instance.content!)), asset, validationContext: { availableKfCapabilities: definition.requiredKfCapabilities, approvedAuthorizationRefs: [] }, bounds: { x: 0, y: 0, width: 1200, height: definition.layout.height.max } } });
        const requiredManifest = definition.quality!.deriveRequiredOutputs!({
          instance,
          content: definition.contentSchema.parse(JSON.parse(instance.content!)),
        });
        expect(Object.keys(definition.quality!.variantRequiredOutputs)).toContain(variant);
        if (kind === "data.chart-panel") {
          expect(compiled.components).toEqual([]);
          expect(compiled.deliveryGaps).toContainEqual(expect.objectContaining({ severity: "blocking", reason: "kf36-static-chart-series-mapping-unverified" }));
          continue;
        }
        expect(compiled.components.length, `${kind}/${variant} must have legal output`).toBeGreaterThan(0);
        expect(requiredManifest.map((entry) => entry.outputId).sort(), `${kind}/${variant} critical manifest`).toEqual(compiled.components.filter((entry) => entry.critical).map((entry) => entry.id).sort());
        const components = compiled.components.map((entry) => ({ ...entry, id: stableModuleComponentId(instance.id, entry.id), sourceModuleId: instance.id, properties: { ...entry.properties, ...(typeof entry.properties.parentId === "string" ? { parentId: stableModuleComponentId(instance.id, entry.properties.parentId) } : {}) } }));
        const modulePlan = plan([instance.id]); modulePlan.pages[0]!.modules[0] = instance; modulePlan.pages[0]!.modules[0].placement = { ...instance.placement, preferredHeight: "full" };
        modulePlan.assets = instance.assetId === undefined ? [] : [{ id: instance.assetId, kind: "image", name: "Asset", mimeType: "image/png", description: "Asset" }];
        const interactionRequirements = instance.interactions.map((interaction) => ({ type: interaction.type, actionKind: definition.quality!.interactionActionKinds![interaction.type]!, target: interaction.type === "navigate" ? interaction.pageId : "unsupported" }));
        const effect = acceptedBlueprint([instance.id]); effect.modules[0] = { ...effect.modules[0]!, expectedKind: kind, expectedCategory: definition.category, interactionRequirements };
        const interactionBindings = interactionRequirements.map((requirement) => ({ ...requirement, outputId: components.find((entry) => ((entry.properties as Record<string, unknown>).action as { kind?: string; pageId?: string } | undefined)?.kind === requirement.actionKind && (((entry.properties as Record<string, unknown>).action as { pageId?: string }).pageId === requirement.target))!.id }));
        const metadata = { schema: "kf-module-compilation-metadata/v1" as const, projectKey: modulePlan.projectKey, moduleDefinitions: [], assets: [], blueprintMappings: [{ blueprintModuleId: instance.id, pageId: "home", moduleId: instance.id, expectedKind: kind, expectedCategory: definition.category, interactionBindings }] };
        const evaluateMatrix = (current: UIComponentSpec[]) => evaluateModuleDelivery({ acceptedBlueprint: effect, plan: modulePlan, implementation: { schema: "kf-ui-implementation/v1", theme, pages: [{ id: "home", width: 1200, height: definition.layout.height.max, components: current }] }, traces: [{ schema: "kf-module-trace/v1", projectKey: modulePlan.projectKey, entries: current.map((entry) => ({ pageId: "home", moduleId: instance.id, outputId: entry.id })) }], assetBindings: instance.assetId === undefined ? [] : [{ moduleId: instance.id, assetId: instance.assetId }], gaps: compiled.deliveryGaps, registry: defaults, assetsById: instance.assetId === undefined ? {} : { [instance.assetId]: asset! }, metadata }).report;
        expect(evaluateMatrix(components).status, `${kind}/${variant} golden`).not.toBe("blocked");
        for (const critical of components.filter((entry) => entry.critical)) {
          expect(evaluateMatrix(components.filter((entry) => entry.id !== critical.id)).status, `${kind}/${variant} delete actual critical ${critical.id}`).toBe("blocked");
        }
        for (const assetOutput of components.filter((entry) => (entry.properties as Record<string, unknown>).src === "asset")) {
          expect(evaluateMatrix(components.filter((entry) => entry.id !== assetOutput.id)).status, `${kind}/${variant} delete actual asset ${assetOutput.id}`).toBe("blocked");
        }
        for (const actionOutput of components.filter((entry) => (entry.properties as Record<string, unknown>).action !== undefined)) {
          expect(evaluateMatrix(components.filter((entry) => entry.id !== actionOutput.id)).status, `${kind}/${variant} delete actual action ${actionOutput.id}`).toBe("blocked");
        }
        for (const required of definition.quality!.variantRequiredOutputs[variant]!) {
          const without = components.filter((entry) => required.outputId === undefined ? entry.role !== required.role : entry.id !== stableModuleComponentId(instance.id, required.outputId));
          expect(evaluateMatrix(without).status, `${kind}/${variant} delete ${required.outputId ?? required.role}`).toBe("blocked");
          const replaced = components.map((entry) => (required.outputId === undefined ? entry.role === required.role : entry.id === stableModuleComponentId(instance.id, required.outputId)) ? { ...entry, capabilityId: entry.capabilityId === "text" ? "button" : "text" } : entry);
          expect(evaluateMatrix(replaced).status, `${kind}/${variant} replace ${required.outputId ?? required.role}`).toBe("blocked");
          const nonCritical = components.map((entry) => (required.outputId === undefined ? entry.role === required.role : entry.id === stableModuleComponentId(instance.id, required.outputId)) ? { ...entry, critical: false } : entry);
          expect(evaluateMatrix(nonCritical).status, `${kind}/${variant} critical ${required.outputId ?? required.role}`).toBe("blocked");
          if (required.assetSlotId !== undefined) {
            const unbound = components.map((entry) => entry.id === stableModuleComponentId(instance.id, required.outputId!) ? { ...entry, properties: { ...entry.properties, src: "placeholder" } } : entry);
            expect(evaluateMatrix(unbound).status, `${kind}/${variant} asset ${required.outputId}`).toBe("blocked");
          }
          if (required.actionType !== undefined && instance.interactions.some((interaction) => interaction.type === required.actionType)) {
            const noAction = components.map((entry) => (required.outputId === undefined ? entry.role === required.role : entry.id === stableModuleComponentId(instance.id, required.outputId)) ? { ...entry, properties: Object.fromEntries(Object.entries(entry.properties).filter(([key]) => key !== "action")) } : entry);
            expect(evaluateMatrix(noAction).status, `${kind}/${variant} action ${required.outputId ?? required.role}`).toBe("blocked");
          }
        }
      }
    }
  });

  it("rejects descriptor surprises without invoking their getters", () => {
    let reads = 0;
    const unsafe = acceptedBlueprint() as unknown as Record<string, unknown>;
    Object.defineProperty(unsafe, "modules", { enumerable: true, get: () => { reads += 1; return []; } });
    expect(() => evaluate({ acceptedBlueprint: unsafe as AcceptedBlueprintArtifact })).toThrow("MODULE_DELIVERY_UNSAFE_INPUT");
    expect(reads).toBe(0);
  });
});
