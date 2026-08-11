import { describe, expect, it } from "vitest";
import type { ModulePlan, UIComponentSpec, UIImplementationSpec } from "@kf/contracts";
import { diffModulePlans } from "./module-diff.js";

const theme = { background: "#101827", surface: "#1E293B", primary: "#2563EB", accent: "#38BDF8", textPrimary: "#F8FAFC", textSecondary: "#94A3B8", fontFamily: "Inter", spacingUnit: 8, radiusScale: { small: 4, medium: 8, large: 16 } } as const;
function plan(ids: string[]): ModulePlan { return { schema: "kf-module-plan/v1", projectKey: "kingclient.portal", theme, assets: [], operations: [], pages: [{ id: "home", title: "Home", mode: "vertical-flow", modules: ids.map((id, order) => ({ id, kind: "content.hero", templateVersion: "1.0.0", variant: "no-portrait", title: id, content: JSON.stringify({ title: id }), placement: { region: "main", order, columnSpan: 12, preferredHeight: "medium", alignment: "stretch", emphasis: "primary" }, interactions: [] })) }] }; }
function implementation(ids: string[], changed = new Set<string>()): UIImplementationSpec { const components: UIComponentSpec[] = ids.map((id, index) => ({ id: `${id}/surface`, sourceModuleId: id, role: "surface", capabilityId: "layout.2", critical: true, geometry: { x: 48, y: 48 + index * 224 + (changed.has(id) ? 1 : 0), width: 1344, height: 200 }, properties: {}, style: { declarations: {}, states: {} } })); return { schema: "kf-ui-implementation/v1", theme, pages: [{ id: "home", width: 1440, height: 900, components }] }; }

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

  it("rejects descriptor surprises without invoking their getters", () => {
    let reads = 0;
    const unsafe = plan(["hero"]);
    Object.defineProperty(unsafe, "pages", { enumerable: true, get: () => { reads += 1; return []; } });
    expect(() => diffModulePlans({ previousPlan: unsafe, plan: plan(["hero"]), previousImplementation: implementation(["hero"]), implementation: implementation(["hero"]) }))
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
