import { describe, expect, it } from "vitest";
import { cp, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ModulePlan, ModulePlanModule, ResolvedAsset } from "@kf/contracts";
import { compileModulePlan } from "../module-compiler.js";
import { createDefaultModuleRegistry } from "../module-registry.js";
import { compileUiImplementation } from "../../implementation/ui-implementation-compiler.js";
import { applyClientPatch } from "../../patch/client-patcher.js";
import { inspectClientProject } from "../../inspect/client-inspector.js";
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
const fixturesRoot = join(fileURLToPath(new URL(".", import.meta.url)), "../../../../../tests/fixtures");

async function fixture(name: string): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "kf-portal-tree-"));
  await cp(join(fixturesRoot, name), target, { recursive: true });
  return target;
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("expected a JSON object");
  }
  return value as Record<string, unknown>;
}

function controlName(control: Record<string, unknown>): string {
  const base = record(control["baseProperty"] ?? {});
  const name = base["name"] ?? control["name"];
  if (typeof name !== "string") throw new Error("control does not have a name");
  return name;
}

function childrenOf(control: Record<string, unknown>): Record<string, unknown>[] {
  const children = control["insiderObjects"];
  return Array.isArray(children) ? children.map(record) : [];
}

function namedChild(control: Record<string, unknown>, name: string): Record<string, unknown> {
  const child = childrenOf(control).find((entry) => controlName(entry) === name);
  if (child === undefined) throw new Error(`missing nested child ${name}`);
  return child;
}

function geometryOf(control: Record<string, unknown>): { x: number; y: number; width: number; height: number } {
  const base = record(control["baseProperty"] ?? {});
  const point = record(base["leftTopPt"] ?? control["leftTopPt"] ?? {});
  const x = point["x"];
  const y = point["y"];
  const width = base["width"] ?? control["width"];
  const height = base["height"] ?? control["height"];
  if (![x, y, width, height].every((value) => typeof value === "number")) {
    throw new Error(`invalid geometry for ${controlName(control)}`);
  }
  return { x: x as number, y: y as number, width: width as number, height: height as number };
}

function expectInsideParent(child: Record<string, unknown>, parent: Record<string, unknown>): void {
  const box = geometryOf(child);
  const parentBox = geometryOf(parent);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(parentBox.width);
  expect(box.y + box.height).toBeLessThanOrEqual(parentBox.height);
}

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
  it("keeps every portal definition bounds-safe for minimal and maximum content", () => {
    const max = {
      "navigation.top": { logo: "KF", items: Array.from({ length: 8 }, (_, i) => `Nav ${i + 1}`) },
      "content.hero": { title: "Hero", subtitle: "Subtitle", description: "Description", primaryAction: "Primary", secondaryAction: "Secondary" },
      "metric.kpi-grid": { items: Array.from({ length: 6 }, (_, i) => ({ label: `KPI ${i}`, value: `${i}`, trend: "up" })) },
      "content.card-grid": { items: Array.from({ length: 12 }, (_, i) => ({ title: `Card ${i}`, summary: "Summary", tag: "Tag", action: "Open" })) },
      "content.timeline": { items: Array.from({ length: 10 }, (_, i) => ({ title: `Event ${i}`, detail: "Detail", date: "2026" })) },
      "interaction.tabs-filter": { tabs: Array.from({ length: 8 }, (_, i) => `Tab ${i + 1}`), active: "Tab 1" },
      "form.record-editor": { fields: Array.from({ length: 8 }, (_, i) => ({ id: `field${i}`, label: `Field ${i}`, placeholder: "Value" })), submitLabel: "Send", resetLabel: "Reset" },
      "content.contact-footer": { contacts: Array.from({ length: 6 }, (_, i) => ({ label: `Contact ${i}`, value: "value@example.com" })), copyright: "© 2026", action: "Open" },
    } as const;
    const minimum = {
      "navigation.top": { logo: "KF", items: ["Home"] }, "content.hero": { title: "Hero" }, "metric.kpi-grid": { items: [{ label: "KPI", value: "1" }] }, "content.card-grid": { items: [{ title: "Card", summary: "Summary", tag: "Tag" }] }, "content.timeline": { items: [{ title: "Event", detail: "Detail", date: "2026" }] }, "interaction.tabs-filter": { tabs: ["All"] }, "form.record-editor": { fields: [{ id: "name", label: "Name", placeholder: "Name" }], submitLabel: "Send" }, "content.contact-footer": { contacts: [{ label: "Email", value: "a@b.com" }], copyright: "©" },
    } as const;
    const registry = createDefaultModuleRegistry();
    for (const kind of Object.keys(max) as Array<keyof typeof max>) {
      const definition = registry.require(kind, "1.0.0");
      for (const content of [minimum[kind], max[kind]]) for (const height of new Set([definition.layout.height.min, ...Object.values(definition.layout.height.preferred), definition.layout.height.max])) for (const width of [Math.max(1, definition.layout.minColumnSpan * 80), 1440]) {
        const instance = module(kind, "matrix", content); instance.variant = kind === "content.hero" ? "no-portrait" : "default";
        const result = definition.compile({ context: { definition, instance, content: definition.contentSchema.parse(content), asset: undefined, validationContext: { availableKfCapabilities: [], approvedAuthorizationRefs: [] }, bounds: { x: 0, y: 0, width, height } } });
        const ids = result.components.map((component) => component.id);
        if (result.components.length === 0) { expect(result.deliveryGaps).toContainEqual(expect.objectContaining({ severity: "blocking", reason: "module-bounds-insufficient" })); continue; }
        expect(new Set(ids).size).toBe(ids.length);
        for (const component of result.components) { const g = component.geometry; expect(Number.isInteger(g.x) && Number.isInteger(g.y) && Number.isInteger(g.width) && Number.isInteger(g.height)).toBe(true); expect(g.width).toBeGreaterThan(0); expect(g.height).toBeGreaterThan(0); expect(g.x).toBeGreaterThanOrEqual(0); expect(g.y).toBeGreaterThanOrEqual(0); expect(g.x + g.width).toBeLessThanOrEqual(width); expect(g.y + g.height).toBeLessThanOrEqual(height); const parent = component.properties["parentId"]; if (typeof parent === "string") expect(result.components.find((candidate) => candidate.id === parent)?.capabilityId).toMatch(/^layout\./); }
      }
    }
  });
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
      workspaceId: "workspace", pageGuidById: { Page1: "page-guid-home" },
      existingControlGuidByComponentId: {}, existingControlCapabilityIdByComponentId: {},
    });
    expect(change.plan.operations.filter((operation) => operation.op === "create")).not.toHaveLength(0);
    expect(change.plan.operations).toContainEqual(expect.objectContaining({
      op: "create", entityType: "control", properties: expect.objectContaining({ pageId: "page-guid-home" }),
    }));
    expect(change.plan.operations).toContainEqual(expect.objectContaining({
      op: "create", entityId: "portal-hero/primary-action", properties: expect.objectContaining({ parentId: "portal-hero/surface", action: { kind: "navigate", pageId: "Page1" } }),
    }));
  });

  it("materializes the golden portal as nested KF controls with a resolved navigation link", async () => {
    const compiled = compile(createPortalPlan());
    if (compiled.status !== "compiled") throw new Error("expected compiled portal");
    const change = compileUiImplementation(compiled.implementation, { workspaceId: "workspace", pageGuidById: { Page1: "page-guid-1" }, existingControlGuidByComponentId: {}, existingControlCapabilityIdByComponentId: {} });
    const root = await fixture("client-unknown-field");
    const candidate = await applyClientPatch(root, change.plan);
    const inspection = await inspectClientProject(candidate.rootDir);
    const indexedIds = Object.values(inspection.index.controls).map((entry) => entry.id);
    expect(indexedIds).toEqual(expect.arrayContaining([
      "portal-portfolio/surface",
      "portal-portfolio/card-1-surface",
      "portal-portfolio/card-1-title",
      "portal-portfolio/card-1-image",
      "portal-portfolio/card-1-action",
      "portal-hero/primary-action",
    ]));
    const page = JSON.parse(await readFile(join(candidate.rootDir, "1.0.0.1/project/page/Page1.json"), "utf8")) as Record<string, unknown>;
    const pageObjects = (page["objects"] as unknown[]).map(record);
    const portfolio = pageObjects.find((entry) => controlName(entry) === "portal-portfolio/surface");
    if (portfolio === undefined) throw new Error("missing portfolio surface");
    const card = namedChild(portfolio, "portal-portfolio/card-1-surface");
    const title = namedChild(card, "portal-portfolio/card-1-title");
    const image = namedChild(card, "portal-portfolio/card-1-image");
    const action = namedChild(card, "portal-portfolio/card-1-action");
    expectInsideParent(card, portfolio);
    expectInsideParent(title, card);
    expectInsideParent(image, card);
    expectInsideParent(action, card);

    const hero = pageObjects.find((entry) => controlName(entry) === "portal-hero/surface");
    if (hero === undefined) throw new Error("missing hero surface");
    const primaryAction = namedChild(hero, "portal-hero/primary-action");
    expect(primaryAction["linkMng"]).toEqual({ linkList: [{ action: "navigatePage", pageId: "page-guid-1" }] });
    expect(primaryAction["script"]).toBeUndefined();
    expect(Object.keys(record(primaryAction["linkMng"]))).toEqual(["linkList"]);
  });
});
