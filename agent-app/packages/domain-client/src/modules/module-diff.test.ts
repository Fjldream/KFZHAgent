import { describe, expect, it } from "vitest";
import type { ModuleCompilationMetadata, ModulePlan, UIComponentSpec, UIImplementationSpec } from "@kf/contracts";
import { diffModulePlans as rawDiffModulePlans } from "./module-diff.js";

const theme = { background: "#101827", surface: "#1E293B", primary: "#2563EB", accent: "#38BDF8", textPrimary: "#F8FAFC", textSecondary: "#94A3B8", fontFamily: "Inter", spacingUnit: 8, radiusScale: { small: 4, medium: 8, large: 16 } } as const;
function plan(ids: string[]): ModulePlan { return { schema: "kf-module-plan/v1", projectKey: "kingclient.portal", theme, assets: [], operations: [], pages: [{ id: "home", title: "Home", mode: "vertical-flow", modules: ids.map((id, order) => ({ id, kind: "content.hero", templateVersion: "1.0.0", variant: "no-portrait", title: id, content: JSON.stringify({ title: id }), placement: { region: "main", order, columnSpan: 12, preferredHeight: "medium", alignment: "stretch", emphasis: "primary" }, interactions: [] })) }] }; }
function implementation(ids: string[], changed = new Set<string>()): UIImplementationSpec { const components: UIComponentSpec[] = ids.map((id, index) => ({ id: `${id}/surface`, sourceModuleId: id, role: "surface", capabilityId: "layout.2", critical: true, geometry: { x: 48, y: 48 + index * 224 + (changed.has(id) ? 1 : 0), width: 1344, height: 200 }, properties: {}, style: { declarations: {}, states: {} } })); return { schema: "kf-ui-implementation/v1", theme, pages: [{ id: "home", width: 1440, height: 900, components }] }; }
function metadata(value: ModulePlan, compilerFingerprint = "content-hero-compiler-v1"): ModuleCompilationMetadata { return { schema: "kf-module-compilation-metadata/v1", projectKey: value.projectKey, moduleDefinitions: value.pages.flatMap((page) => page.modules.map((module) => ({ pageId: page.id, moduleId: module.id, kind: module.kind, templateVersion: module.templateVersion, compilerFingerprint, layoutFingerprint: "content-hero-layout-v1" }))), assets: value.pages.flatMap((page) => page.modules.flatMap((module) => module.assetId === undefined ? [] : [{ pageId: page.id, moduleId: module.id, assetId: module.assetId, status: "resolved" as const, assetIdentity: `${module.assetId}|resolved` }])), blueprintMappings: [], generatedSeeds: [] }; }
function diffModulePlans(input: Parameters<typeof rawDiffModulePlans>[0] | Record<string, unknown>) { const value = input as Parameters<typeof rawDiffModulePlans>[0]; return rawDiffModulePlans({ ...value, previousMetadata: value.previousMetadata ?? metadata(value.previousPlan), metadata: value.metadata ?? metadata(value.plan) }); }

describe("diffModulePlans", () => {
  it("preserves unrelated implementation objects byte-for-byte for content-only revisions", () => {
    const previous = plan(["hero", "projects", "contact"]);
    const revised = structuredClone(previous);
    revised.pages[0]!.modules[1]!.content = JSON.stringify({ title: "New projects" });
    const before = implementation(["hero", "projects", "contact"]);
    const after = structuredClone(before);
    after.pages[0]!.components[1]!.content = "New projects";
    const diff = diffModulePlans({ previousPlan: previous, plan: revised, previousImplementation: before, implementation: after });
    expect(diff.changedModules).toEqual(["projects"]);
    expect(diff.unchangedModules).toEqual(["contact", "hero"]);
    expect(diff.unexpectedChanges).toEqual([]);
  });

  it("reports a changed untouched module instead of silently accepting it", () => {
    const previous = plan(["hero", "projects"]);
    const revised = structuredClone(previous);
    revised.pages[0]!.modules[0]!.title = "Revised hero";
    const before = implementation(["hero", "projects"]);
    const after = implementation(["hero", "projects"], new Set(["projects"]));
    const diff = diffModulePlans({ previousPlan: previous, plan: revised, previousImplementation: before, implementation: after });
    expect(diff.unexpectedChanges).toContainEqual(expect.objectContaining({ moduleId: "projects", reason: "UNTOUCHED_MODULE_IMPLEMENTATION_CHANGED" }));
  });

  it("accepts compiler-definition identity changes but still rejects same-identity output drift", () => {
    const before = implementation(["hero"]);
    const after = implementation(["hero"], new Set(["hero"]));
    const drift = diffModulePlans({
      previousPlan: plan(["hero"]), plan: plan(["hero"]), previousImplementation: before, implementation: after,
      previousMetadata: metadata(plan(["hero"]), "content-hero-compiler-a"),
      metadata: metadata(plan(["hero"]), "content-hero-compiler-b"),
    });
    expect(drift.changedModules).toEqual(["hero"]);
    expect(drift.unexpectedChanges).toEqual([]);

    const unchangedIdentity = diffModulePlans({
      previousPlan: plan(["hero"]), plan: plan(["hero"]), previousImplementation: before, implementation: after,
      previousMetadata: metadata(plan(["hero"]), "content-hero-compiler-a"),
      metadata: metadata(plan(["hero"]), "content-hero-compiler-a"),
    });
    expect(unchangedIdentity.unexpectedChanges).toContainEqual(expect.objectContaining({ reason: "UNTOUCHED_MODULE_IMPLEMENTATION_CHANGED" }));
  });

  it("keeps changed and unchanged module sets mutually exclusive", () => {
    const before = implementation(["hero"]);
    const after = structuredClone(before);
    after.pages[0]!.components[0]!.style.declarations = { textColor: "#fff" };
    const revised = plan(["hero"]);
    revised.theme = { ...theme, primary: "#ffffff" };
    const diff = diffModulePlans({ previousPlan: plan(["hero"]), plan: revised, previousImplementation: before, implementation: after });
    expect(diff.changedModules).toEqual(["hero"]);
    expect(diff.unchangedModules).toEqual([]);
  });

  it("preserves unrelated implementation objects for an asset-only revision", () => {
    const previous = plan(["hero", "projects"]);
    previous.assets.push({ id: "portrait", kind: "image", name: "Portrait", mimeType: "image/png", description: "Portrait" });
    previous.pages[0]!.modules[0]!.assetId = "portrait";
    const revised = structuredClone(previous);
    revised.assets.push({ id: "portraitNew", kind: "image", name: "New portrait", mimeType: "image/png", description: "New portrait" });
    revised.pages[0]!.modules[0]!.assetId = "portraitNew";
    const before = implementation(["hero", "projects"]);
    const after = structuredClone(before);
    after.pages[0]!.components[0]!.properties = { src: "asset:portraitNew" };
    const diff = diffModulePlans({ previousPlan: previous, plan: revised, previousImplementation: before, implementation: after });
    expect(diff.changedModules).toEqual(["hero"]);
    expect(diff.unexpectedChanges).toEqual([]);
  });

  it("treats a resolved-to-pending referenced asset as an affected module, not an unexpected change", () => {
    const previous = plan(["hero", "projects"]);
    previous.assets.push({ id: "portrait", kind: "image", name: "Portrait", mimeType: "image/png", description: "Portrait" });
    previous.pages[0]!.modules[0]!.assetId = "portrait";
    const after = structuredClone(implementation(["hero", "projects"]));
    after.pages[0]!.components[0]!.content = "asset pending";
    const diff = diffModulePlans({
      previousPlan: previous, plan: structuredClone(previous), previousImplementation: implementation(["hero", "projects"]), implementation: after,
      previousMetadata: { ...metadata(previous), assets: [{ pageId: "home", moduleId: "hero", assetId: "portrait", status: "resolved", assetIdentity: "portrait|resolved|Portrait" }] },
      metadata: { ...metadata(previous), assets: [{ pageId: "home", moduleId: "hero", assetId: "portrait", status: "pending", assetIdentity: "portrait|pending|" }] },
    });
    expect(diff.changedModules).toEqual(["hero"]);
    expect(diff.unchangedModules).toEqual(["projects"]);
    expect(diff.unexpectedChanges).toEqual([]);
  });

  it("fails closed when a previous revision references an asset without its persisted snapshot", () => {
    const previous = plan(["hero"]);
    previous.assets.push({ id: "portrait", kind: "image", name: "Portrait", mimeType: "image/png", description: "Portrait" });
    previous.pages[0]!.modules[0]!.assetId = "portrait";
    expect(() => rawDiffModulePlans({ previousPlan: previous, plan: structuredClone(previous), previousImplementation: implementation(["hero"]), implementation: implementation(["hero"]), previousMetadata: { ...metadata(previous), assets: [] }, metadata: metadata(previous) }))
      .toThrow("MISSING_COMPILATION_METADATA_ASSET");
  });

  it("rejects descriptor surprises without invoking their getters", () => {
    let reads = 0;
    const unsafe = plan(["hero"]);
    Object.defineProperty(unsafe, "pages", { enumerable: true, get: () => { reads += 1; return []; } });
    expect(() => rawDiffModulePlans({ previousPlan: unsafe, plan: plan(["hero"]), previousImplementation: implementation(["hero"]), implementation: implementation(["hero"]), previousMetadata: metadata(plan(["hero"])), metadata: metadata(plan(["hero"])) }))
      .toThrow("MODULE_DIFF_UNSAFE_INPUT");
    expect(reads).toBe(0);
  });

  it.each([
    ["add", ["hero", "new", "projects", "contact"], ["new", "projects", "contact"]],
    ["remove", ["hero", "contact"], ["contact"]],
    ["move", ["projects", "hero", "contact"], ["projects", "hero", "contact"]],
  ])("limits %s layout recalculation to the affected interval", (_operation, ids, affected) => {
    const previous = plan(["hero", "projects", "contact"]);
    const revised = plan(ids);
    const diff = diffModulePlans({ previousPlan: previous, plan: revised, previousImplementation: implementation(["hero", "projects", "contact"]), implementation: implementation(ids) });
    expect(diff.layoutAffectedModules).toEqual(affected);
    expect(diff.unexpectedChanges).toEqual([]);
  });
});
