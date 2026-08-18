import { canonicalServerHash, SolutionImplementationPlanSchema, type ModulePlan, type SolutionNode } from "@kf/contracts";
import { describe, expect, it } from "vitest";
import { adaptLegacyModulePlan } from "../index.js";
import { createPortalPlan } from "../modules/definitions/fixtures/portal-plan.js";

function flattenNodes(root: SolutionNode): SolutionNode[] {
  if (root.kind === "layout") return [root, ...root.children.flatMap(flattenNodes)];
  if (root.kind === "registered-module") return [root, ...root.slots.flatMap((slot) => slot.children.flatMap(flattenNodes))];
  if (root.kind === "repeater") return [root, ...flattenNodes(root.template)];
  return [root];
}

describe("adaptLegacyModulePlan", () => {
  it.each([
    ["vertical-flow", "column"],
    ["dashboard-grid", "grid"],
    ["admin-shell", "sidebar-content"],
  ] as const)("maps %s pages to %s semantic roots", (mode, layout) => {
    const legacy = createPortalPlan();
    legacy.pages[0]!.mode = mode;

    expect(adaptLegacyModulePlan(legacy).pages[0]!.root).toMatchObject({ kind: "layout", layout });
  });

  it("preserves module identity, content, provenance, asset binding, order, and visual intent", () => {
    const legacy = createPortalPlan();
    const source = legacy.pages[0]!.modules[0]!;
    source.content = JSON.stringify({ headline: "Legacy hero", tags: ["one", "two"], featured: true, count: 2 });
    source.sourceBlueprintModuleIds = ["Hero region A", "Hero secondary region"];
    source.placement = {
      region: "main",
      order: 7,
      columnSpan: 8,
      preferredHeight: "large",
      alignment: "center",
      emphasis: "secondary",
    };

    const adapted = adaptLegacyModulePlan(legacy);
    const nodes = flattenNodes(adapted.pages[0]!.root);
    const modules = nodes.filter((node) => node.kind === "registered-module");
    const converted = modules.find((node) => node.id === source.id)!;

    expect(modules.map((node) => node.id)).toEqual(legacy.pages[0]!.modules.map((module) => module.id));
    expect(converted).toEqual(expect.objectContaining({
      id: source.id,
      kind: "registered-module",
      moduleKind: source.kind,
      templateVersion: source.templateVersion,
      variant: source.variant,
      title: source.title,
      assetId: source.assetId,
      sourceBlueprintRegionIds: ["Hero region A", "Hero secondary region"],
      slots: [],
      content: {
        kind: "record",
        fields: [
          { name: "headline", value: "Legacy hero" },
          { name: "tags", value: { kind: "list", items: ["one", "two"] } },
          { name: "featured", value: true },
          { name: "count", value: 2 },
        ],
      },
      intent: {
        importance: "secondary",
        visualWeight: 3,
        readingOrder: 7,
        density: "spacious",
        groupWith: [],
        width: { mode: "ratio", value: 8 },
        height: { mode: "ratio", value: 4 },
        align: "center",
      },
    }));
  });

  it("creates reachable navigation actions on their owning registered modules without faking unsupported effects", () => {
    const legacy = createPortalPlan();
    legacy.pages[0]!.modules[0]!.interactions = [
      { type: "navigate", pageId: "Page1" },
      { type: "scroll", moduleId: "portal-kpis" },
      { type: "open-modal", moduleId: "portal-kpis" },
      { type: "submit", action: "save-record" },
      { type: "filter", field: "status" },
      { type: "toggle", target: "portal-kpis" },
    ];

    const adapted = adaptLegacyModulePlan(legacy);
    const owner = flattenNodes(adapted.pages[0]!.root)
      .find((node) => node.kind === "registered-module" && node.id === "portal-hero");
    const navigation = adapted.actions.find((action) => action.kind === "navigate-page");

    expect(navigation).toEqual({
      id: expect.any(String),
      kind: "navigate-page",
      targetPageId: "Page1",
      afterActionIds: [],
    });
    expect(owner).toMatchObject({
      eventBindings: [{ semanticEvent: "navigate", actionIds: [navigation!.id] }],
    });
    expect(adapted.actions).toHaveLength(2);
    expect(adapted.actions.every((action) => action.kind === "navigate-page")).toBe(true);
  });

  it("is deterministic, schema-valid, immutable, and emits no creative-only artifacts", () => {
    const legacy = createPortalPlan();
    const before = structuredClone(legacy);

    const first = adaptLegacyModulePlan(legacy);
    const second = adaptLegacyModulePlan(legacy);

    expect(second).toEqual(first);
    expect(legacy).toEqual(before);
    expect(first).toMatchObject({
      schema: "kf-solution-implementation/v1",
      projectKey: legacy.projectKey,
      blueprintHash: canonicalServerHash(legacy),
      candidateBundleHash: "3e147b2b8351b526f10dd9dfc47c4c93bbfc29814d791400e3e5b02c38220840",
      theme: legacy.theme,
      roleStyles: [],
      mockData: [],
      localState: [],
      overlays: [],
      scripts: [],
    });
    expect(first.pages[0]).toMatchObject({
      id: legacy.pages[0]!.id,
      title: legacy.pages[0]!.title,
      purpose: legacy.pages[0]!.title,
      canvas: "responsive",
      sourceBlueprintPageId: legacy.pages[0]!.id,
      initialStateIds: [],
    });
    expect(first.pages[0]!.sourceBlueprintRegionIds).toEqual(
      legacy.pages[0]!.modules.flatMap((module) => module.sourceBlueprintModuleIds ?? [module.id]),
    );
    expect(flattenNodes(first.pages[0]!.root).some((node) => node.kind === "control")).toBe(false);
    expect(SolutionImplementationPlanSchema.parse(first)).toEqual(first);
  });

  it.each([
    ["compact", "compact", { mode: "ratio", value: 1 }],
    ["small", "compact", { mode: "ratio", value: 2 }],
    ["medium", "comfortable", { mode: "ratio", value: 3 }],
    ["large", "spacious", { mode: "ratio", value: 4 }],
    ["full", "spacious", { mode: "fill" }],
  ] as const)("preserves the %s preferred-height intent", (preferredHeight, density, height) => {
    const legacy: ModulePlan = createPortalPlan();
    legacy.pages[0]!.modules[0]!.placement.preferredHeight = preferredHeight;

    const module = flattenNodes(adaptLegacyModulePlan(legacy).pages[0]!.root)
      .find((node) => node.kind === "registered-module" && node.id === "portal-hero")!;

    expect(module.intent).toMatchObject({ density, height });
  });
});
