import { canonicalServerHash, ModulePlanSchema, SolutionImplementationPlanSchema, type ModulePlan, type ModulePlanModule, type SolutionNode } from "@kf/contracts";
import { describe, expect, it } from "vitest";
import { adaptLegacyModulePlan } from "../index.js";
import { createPortalPlan } from "../modules/definitions/fixtures/portal-plan.js";

function flattenNodes(root: SolutionNode): SolutionNode[] {
  if (root.kind === "layout") return [root, ...root.children.flatMap(flattenNodes)];
  if (root.kind === "registered-module") return [root, ...root.slots.flatMap((slot) => slot.children.flatMap(flattenNodes))];
  if (root.kind === "repeater") return [root, ...flattenNodes(root.template)];
  return [root];
}

function moduleFixture(id: string, order: number, interactions: ModulePlanModule["interactions"] = []): ModulePlanModule {
  const source = createPortalPlan().pages[0]!.modules[1]!;
  return {
    ...structuredClone(source),
    id,
    title: `Module ${id}`,
    sourceBlueprintModuleIds: [`Region ${id}`],
    placement: { ...source.placement, order },
    interactions,
  };
}

function planWithModules(moduleCount: number): ModulePlan {
  const legacy = createPortalPlan();
  legacy.assets = [];
  legacy.pages[0]!.modules = Array.from({ length: moduleCount }, (_, index) => moduleFixture(`module-${index + 1}`, index));
  return ModulePlanSchema.parse(legacy);
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
    legacy.pages[0]!.modules.forEach((module) => { module.interactions = []; });
    legacy.pages.push({
      id: "Page2",
      title: "Distinct navigation target",
      mode: "vertical-flow",
      modules: [moduleFixture("target-module", 0)],
    });
    legacy.pages[0]!.modules[0]!.interactions = [
      { type: "navigate", pageId: "Page2" },
      { type: "scroll", moduleId: "target-module" },
      { type: "open-modal", moduleId: "target-module" },
      { type: "submit", action: "save-record" },
      { type: "filter", field: "status" },
      { type: "toggle", target: "target-module" },
    ];

    const adapted = adaptLegacyModulePlan(legacy);
    const owner = flattenNodes(adapted.pages[0]!.root)
      .find((node) => node.kind === "registered-module" && node.id === "portal-hero");
    const navigation = adapted.actions.find((action) => action.kind === "navigate-page");

    expect(navigation).toEqual({
      id: expect.any(String),
      kind: "navigate-page",
      targetPageId: "Page2",
      afterActionIds: [],
    });
    expect(owner).toMatchObject({
      eventBindings: [{ semanticEvent: "navigate", actionIds: [navigation!.id] }],
    });
    expect(adapted.actions).toHaveLength(1);
    expect(adapted.actions.every((action) => action.kind === "navigate-page")).toBe(true);
  });

  it("preserves thirteen distinct provenance labels on one page", () => {
    const legacy = planWithModules(13);

    const adapted = adaptLegacyModulePlan(legacy);

    expect(adapted.pages[0]!.sourceBlueprintRegionIds).toEqual(
      Array.from({ length: 13 }, (_, index) => `Region module-${index + 1}`),
    );
    expect(SolutionImplementationPlanSchema.safeParse(adapted).success).toBe(true);
  });

  it.each([25, 50])("groups %i legacy modules without changing module order or IDs", (moduleCount) => {
    const legacy = planWithModules(moduleCount);
    legacy.pages[0]!.modules.forEach((module, moduleIndex) => {
      module.sourceBlueprintModuleIds = Array.from(
        { length: 12 },
        (_, provenanceIndex) => `Region ${moduleIndex + 1}-${provenanceIndex + 1}`,
      );
    });

    const adapted = adaptLegacyModulePlan(legacy);
    const nodes = flattenNodes(adapted.pages[0]!.root);

    expect(nodes.filter((node) => node.kind === "registered-module").map((node) => node.id)).toEqual(
      legacy.pages[0]!.modules.map((module) => module.id),
    );
    expect(adapted.pages[0]!.sourceBlueprintRegionIds).toHaveLength(moduleCount * 12);
    expect(nodes.filter((node) => node.kind === "layout").every((node) => node.children.length <= 24)).toBe(true);
    expect(SolutionImplementationPlanSchema.safeParse(adapted).success).toBe(true);
  });

  it("allows the same provenance label to belong independently to different pages", () => {
    const legacy = createPortalPlan();
    legacy.pages[0]!.modules = [moduleFixture("first-module", 0)];
    legacy.pages[0]!.modules[0]!.sourceBlueprintModuleIds = ["Shared Region"];
    legacy.pages.push({
      id: "Page2",
      title: "Second page",
      mode: "dashboard-grid",
      modules: [moduleFixture("second-module", 0)],
    });
    legacy.pages[1]!.modules[0]!.sourceBlueprintModuleIds = ["Shared Region"];
    const persisted = ModulePlanSchema.parse(legacy);

    const adapted = adaptLegacyModulePlan(persisted);

    expect(adapted.pages.map((page) => page.sourceBlueprintRegionIds)).toEqual([["Shared Region"], ["Shared Region"]]);
    expect(SolutionImplementationPlanSchema.safeParse(adapted).success).toBe(true);
  });

  it("converts the maximum 3000 supported navigation interactions in a valid ModulePlan", () => {
    const legacy = createPortalPlan();
    legacy.assets = [];
    legacy.pages = Array.from({ length: 5 }, (_, pageIndex) => {
      const pageId = `Page${pageIndex + 1}`;
      return {
        id: pageId,
        title: `Page ${pageIndex + 1}`,
        mode: "vertical-flow" as const,
        modules: Array.from({ length: 50 }, (_, moduleIndex) => moduleFixture(
          `module-${pageIndex + 1}-${moduleIndex + 1}`,
          moduleIndex,
          Array.from({ length: 12 }, () => ({ type: "navigate" as const, pageId })),
        )),
      };
    });
    const persisted = ModulePlanSchema.parse(legacy);

    const adapted = adaptLegacyModulePlan(persisted);

    expect(adapted.actions).toHaveLength(3_000);
    expect(adapted.actions.every((action) => action.kind === "navigate-page")).toBe(true);
    expect(SolutionImplementationPlanSchema.safeParse(adapted).success).toBe(true);
  });

  it.each([
    ["forbidden-looking JSON key", JSON.stringify({ css: "color: red" })],
    ["33-item JSON array", JSON.stringify(Array.from({ length: 33 }, (_, index) => index))],
    ["large finite JSON number", JSON.stringify({ value: 1_000_000_001 })],
    ["code-shaped non-JSON prose", "return selected;"],
  ])("preserves %s exactly as inert legacy content", (_caseName, content) => {
    const legacy = createPortalPlan();
    legacy.pages[0]!.modules[0]!.content = content;
    const persisted = ModulePlanSchema.parse(legacy);

    const adapted = adaptLegacyModulePlan(persisted);
    const module = flattenNodes(adapted.pages[0]!.root)
      .find((node) => node.kind === "registered-module" && node.id === "portal-hero")!;

    expect(module).toMatchObject({ content });
    expect(SolutionImplementationPlanSchema.safeParse(adapted).success).toBe(true);
  });

  it("preserves deeply nested JSON exactly when it exceeds the semantic-value depth", () => {
    let nested: unknown = "leaf";
    for (let depth = 0; depth < 10; depth += 1) nested = { nested };
    const content = JSON.stringify(nested);
    const legacy = createPortalPlan();
    legacy.pages[0]!.modules[0]!.content = content;
    const persisted = ModulePlanSchema.parse(legacy);

    const adapted = adaptLegacyModulePlan(persisted);
    const module = flattenNodes(adapted.pages[0]!.root)
      .find((node) => node.kind === "registered-module" && node.id === "portal-hero")!;

    expect(module).toMatchObject({ content });
    expect(SolutionImplementationPlanSchema.safeParse(adapted).success).toBe(true);
  });

  it("preserves valid legacy reserved identifiers and code-looking provenance verbatim", () => {
    const legacy = createPortalPlan();
    legacy.pages[0]!.id = "script";
    legacy.pages[0]!.modules = [moduleFixture("css", 0, [{ type: "navigate", pageId: "script" }])];
    legacy.pages[0]!.modules[0]!.variant = "guid";
    legacy.pages[0]!.modules[0]!.sourceBlueprintModuleIds = [
      "a0b1c2d3-e4f5-6789-abcd-ef0123456789",
      "javascript:legacyReference()",
    ];
    const persisted = ModulePlanSchema.parse(legacy);

    const adapted = adaptLegacyModulePlan(persisted);
    const module = flattenNodes(adapted.pages[0]!.root)
      .find((node) => node.kind === "registered-module")!;

    expect(adapted.pages[0]).toMatchObject({ id: "script", sourceBlueprintPageId: "script" });
    expect(module).toMatchObject({
      id: "css",
      variant: "guid",
      sourceBlueprintRegionIds: [
        "a0b1c2d3-e4f5-6789-abcd-ef0123456789",
        "javascript:legacyReference()",
      ],
    });
    expect(adapted.actions[0]).toMatchObject({ kind: "navigate-page", targetPageId: "script" });
    expect(SolutionImplementationPlanSchema.safeParse(adapted).success).toBe(true);
  });

  it("preserves a legacy module ID that is also a page ID", () => {
    const legacy = createPortalPlan();
    legacy.pages[0]!.id = "shared-id";
    legacy.pages[0]!.modules = [moduleFixture("shared-id", 0, [{ type: "navigate", pageId: "shared-id" }])];
    const persisted = ModulePlanSchema.parse(legacy);

    const adapted = adaptLegacyModulePlan(persisted);

    expect(adapted.pages[0]!.id).toBe("shared-id");
    expect(flattenNodes(adapted.pages[0]!.root).some((node) => node.kind === "registered-module" && node.id === "shared-id")).toBe(true);
    expect(SolutionImplementationPlanSchema.safeParse(adapted).success).toBe(true);
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
