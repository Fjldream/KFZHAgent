import { describe, expect, it } from "vitest";
import type { ModulePlan, ModulePlanModule, ResolvedAsset } from "@kf/contracts";
import { compileModulePlan } from "../module-compiler.js";
import { createDefaultModuleRegistry } from "../module-registry.js";
import { compileUiImplementation } from "../../implementation/ui-implementation-compiler.js";
import { createPortalPlan } from "./fixtures/portal-plan.js";

const theme = {
  background: "#101827", surface: "#1E293B", primary: "#2563EB", accent: "#38BDF8",
  textPrimary: "#F8FAFC", textSecondary: "#94A3B8", fontFamily: "Inter", spacingUnit: 8,
  radiusScale: { small: 4, medium: 8, large: 16 },
} as const;

const assets: Readonly<Record<string, ResolvedAsset>> = {
  portrait: { assetId: "portrait", status: "resolved", resolvedName: "portrait.png" },
  project: { assetId: "project", status: "resolved", resolvedName: "project.png" },
};

function module(kind: string, id = "module", content: Record<string, unknown> = {}): ModulePlanModule {
  return {
    id,
    kind,
    templateVersion: "1.0.0",
    variant: "default",
    title: "Module title",
    content: JSON.stringify(content),
    placement: { region: "main", order: 0, columnSpan: 12, preferredHeight: "large", alignment: "stretch", emphasis: "primary" },
    interactions: [],
  };
}

function plan(modules: ModulePlanModule[]): ModulePlan {
  return {
    schema: "kf-module-plan/v1", projectKey: "kingclient.portal", theme,
    assets: [
      { id: "portrait", kind: "image", name: "Portrait", mimeType: "image/png", description: "Portrait" },
      { id: "project", kind: "image", name: "Project", mimeType: "image/png", description: "Project" },
    ],
    pages: [{ id: "home", title: "Home", mode: "vertical-flow", modules }], operations: [],
  };
}

function compile(input: ModulePlan) {
  return compileModulePlan({
    plan: input,
    registry: createDefaultModuleRegistry(),
    assetsById: assets,
    validationContext: { availableKfCapabilities: ["layout.2", "text", "richtext", "image", "button", "tag", "timeline", "tabs", "input", "navmenu"], approvedAuthorizationRefs: [] },
  });
}

describe("portal module definitions", () => {
  it.each([
    ["navigation.top", "default", "header", { logo: "KF", items: ["Home", "Projects"] }],
    ["content.hero", "no-portrait", "main", { title: "Lin", subtitle: "Designer", description: "Builds useful products", primaryAction: "Contact" }],
    ["metric.kpi-grid", "default", "main", { items: [{ label: "Projects", value: "40+" }] }],
    ["content.card-grid", "default", "main", { items: [{ title: "Portfolio", summary: "Case study", tag: "Web" }] }],
    ["content.timeline", "default", "main", { items: [{ title: "Senior designer", detail: "2024-now", date: "2024" }] }],
    ["interaction.tabs-filter", "default", "main", { tabs: ["All", "Web"] }],
    ["form.record-editor", "default", "main", { fields: [{ id: "name", label: "Name", placeholder: "Your name" }], submitLabel: "Send" }],
    ["content.contact-footer", "default", "main", { contacts: [{ label: "Email", value: "hello@example.com" }], copyright: "© 2026" }],
  ])("compiles %s into distinct native controls", (kind, variant, region, content) => {
    const instance = module(kind, "module", content);
    instance.variant = variant;
    instance.placement = { ...instance.placement, region: region as ModulePlanModule["placement"]["region"] };
    const result = compile(plan([instance]));
    expect(result.status).toBe("compiled");
    if (result.status !== "compiled") return;
    expect(result.implementation.pages[0]?.components.length).toBeGreaterThan(1);
    expect(new Set(result.implementation.pages[0]?.components.map((component) => component.id)).size)
      .toBe(result.implementation.pages[0]?.components.length);
    expect(result.implementation.pages[0]?.components.every((component) => component.geometry.x >= 0 && Number.isInteger(component.geometry.x))).toBe(true);
  });

  it("requires a portrait for portrait hero variants and never silently substitutes it", () => {
    const portraitLeft = module("content.hero", "hero", { title: "Lin", subtitle: "Designer", description: "Builds useful products" });
    portraitLeft.variant = "portrait-left";
    expect(() => compile(plan([portraitLeft]))).toThrow("MODULE_ASSET_SLOT_REQUIRED");

    const noPortrait = { ...portraitLeft, variant: "no-portrait" };
    expect(compile(plan([noPortrait])).status).toBe("compiled");
  });

  it.each([
    ["navigation.top", "compact", "header", { logo: "KF", items: ["Home"] }],
    ["content.hero", "portrait-right", "main", { title: "Lin", subtitle: "Designer" }],
    ["metric.kpi-grid", "compact", "main", { items: [{ label: "Projects", value: "40+" }] }],
    ["content.card-grid", "portfolio", "main", { items: [{ title: "Portfolio", summary: "Case study", tag: "Web" }] }],
    ["content.timeline", "experience", "main", { items: [{ title: "Senior designer", detail: "2024-now", date: "2024" }] }],
    ["interaction.tabs-filter", "compact", "main", { tabs: ["All"] }],
    ["form.record-editor", "contact", "main", { fields: [{ id: "name", label: "Name", placeholder: "Your name" }], submitLabel: "Send" }],
    ["content.contact-footer", "compact", "main", { contacts: [{ label: "Email", value: "hello@example.com" }], copyright: "© 2026" }],
  ])("compiles the registered %s %s variant", (kind, variant, region, content) => {
    const instance = module(kind, "variant", content);
    instance.variant = variant;
    instance.placement = { ...instance.placement, region: region as ModulePlanModule["placement"]["region"] };
    if (kind === "content.hero") instance.assetId = "portrait";
    expect(compile(plan([instance])).status).toBe("compiled");
  });

  it("rejects overlong repeated content before emitting a lossy merged text block", () => {
    const cards = module("content.card-grid", "cards", {
      items: Array.from({ length: 13 }, (_, index) => ({ title: `Card ${index}`, summary: "Summary", tag: "Tag" })),
    });
    expect(() => compile(plan([cards]))).toThrow("MODULE_CONTENT_INVALID");
  });

  it("emits a real native navigate action and rejects unsupported submit/filter interactions", () => {
    const hero = module("content.hero", "contact", { title: "Lin", primaryAction: "Open" });
    hero.variant = "no-portrait";
    hero.interactions = [{ type: "navigate", pageId: "home" }];
    const result = compile(plan([hero]));
    expect(result.status).toBe("compiled");
    if (result.status !== "compiled") return;
    expect(result.implementation.pages[0]?.components).toContainEqual(expect.objectContaining({ capabilityId: "button", properties: { parentId: "contact/surface", action: { kind: "navigate", pageId: "home" } } }));
    const form = module("form.record-editor", "form", { fields: [{ id: "name", label: "Name", placeholder: "Your name" }], submitLabel: "Send" });
    form.interactions = [{ type: "submit", action: "send" }];
    expect(() => compile(plan([form]))).toThrow("MODULE_LAYOUT_INVALID");
  });

  it("keeps modules beta without matching real KF runtime verification", () => {
    const registry = createDefaultModuleRegistry();
    expect(registry.require("content.hero", "1.0.0").maturity).toBe("beta");
    expect(registry.listForPlanning()).toEqual([]);
    expect(registry.listForInternalPlanning().map((definition) => definition.kind)).toContain("content.hero");
  });

  it("requires exact module runtime evidence before removing the beta delivery gap", () => {
    const hero = module("content.hero", "hero", { title: "Lin" });
    hero.variant = "no-portrait";
    const base = { ...plan([hero]), assets: [] };
    const generic = compileModulePlan({ plan: base, registry: createDefaultModuleRegistry(), assetsById: {}, validationContext: { availableKfCapabilities: ["layout.2", "text", "image", "button"], approvedAuthorizationRefs: [], moduleRuntimeEvidence: [{ kind: "content.hero", version: "2.0.0", runtimeFamily: "KingFusion", runtimeVersion: "3.6", baselineId: "kf36-portal-v1", verifiedCapabilities: ["layout.2", "text", "image", "button"] }] } });
    expect(generic.gaps).toContainEqual(expect.objectContaining({ moduleId: "hero", severity: "warning" }));
    const accepted = compileModulePlan({ plan: base, registry: createDefaultModuleRegistry(), assetsById: {}, validationContext: { availableKfCapabilities: ["layout.2", "text", "image", "button"], approvedAuthorizationRefs: [], moduleRuntimeEvidence: [{ kind: "content.hero", version: "1.0.0", runtimeFamily: "KingFusion", runtimeVersion: "3.6", baselineId: "kf36-portal-v1", verifiedCapabilities: ["layout.2", "text", "image", "button"] }] } });
    expect(accepted.gaps.some((gap) => gap.moduleId === "hero" && gap.requirement.includes("Mature"))).toBe(false);
  });

  it("compiles the golden portal as separate hero, kpi, portfolio, timeline and contact control trees", () => {
    const result = compile(createPortalPlan());
    expect(result.status).toBe("compiled");
    if (result.status !== "compiled") return;
    const components = result.implementation.pages[0]?.components ?? [];
    for (const moduleId of ["portal-hero", "portal-kpis", "portal-portfolio", "portal-timeline", "portal-contact"]) {
      expect(components.filter((component) => component.sourceModuleId === moduleId).length).toBeGreaterThan(1);
    }
    expect(components.filter((component) => component.capabilityId === "richtext")).toHaveLength(0);
    expect(components.some((component) => component.capabilityId === "image")).toBe(true);
    expect(components.some((component) => component.capabilityId === "input")).toBe(true);
    expect(components.filter((component) => component.sourceModuleId === "portal-timeline" && component.capabilityId === "text").length).toBeGreaterThan(1);
    expect(result.gaps).toContainEqual(expect.objectContaining({ moduleId: "portal-portfolio", reason: "per-item-assets-unsupported" }));
  });

  it("takes the golden portal through the real UI implementation compiler with contained native controls", () => {
    const result = compile(createPortalPlan());
    expect(result.status).toBe("compiled");
    if (result.status !== "compiled") return;
    const change = compileUiImplementation(result.implementation, {
      workspaceId: "workspace", pageGuidById: { home: "page-guid-home" },
      existingControlGuidByComponentId: {}, existingControlCapabilityIdByComponentId: {},
    });
    expect(change.plan.operations.filter((operation) => operation.op === "create")).not.toHaveLength(0);
    expect(change.plan.operations).toContainEqual(expect.objectContaining({
      op: "create", entityType: "control", properties: expect.objectContaining({ pageId: "page-guid-home" }),
    }));
    expect(change.plan.operations).toContainEqual(expect.objectContaining({
      op: "create", entityId: "portal-hero/primary-action", properties: expect.objectContaining({ parentId: "portal-hero/surface", action: { kind: "navigate", pageId: "home" } }),
    }));
  });
});
