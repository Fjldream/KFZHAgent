import {
  canonicalServerHash,
  UIImplementationControlV2Schema,
  type CapabilityCandidateBundle,
  type CustomerSolutionBlueprint,
  type LayoutNode,
  type LocalStateDefinition,
  type MockDataSet,
  type NodeIntent,
  type OverlayPlan,
  type SolutionImplementationPlan,
  type SolutionNode,
} from "@kf/contracts";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { getDesignKnowledgeSnapshot } from "../design-knowledge/design-knowledge-catalog.js";
import { validateCreateComponentProperties } from "../implementation/component-properties.js";
import { createDefaultModuleRegistry, ModuleRegistry, type ModuleDefinition } from "../modules/module-registry.js";
import { retrieveCapabilities } from "../planning/capability-retrieval.js";
import {
  ComponentCompileError,
  compileComponents,
  compileOverlay,
} from "./component-compiler.js";
import type { CompiledLayoutNode, CompiledLayoutTree, LayoutGeometry } from "./layout-compiler.js";

const theme = {
  background: "#f4f7fb", surface: "#ffffff", primary: "#163a5f", accent: "#e47b32",
  textPrimary: "#14212b", textSecondary: "#52616d", fontFamily: "Inter", spacingUnit: 8,
  radiusScale: { small: 4, medium: 8, large: 16 },
} as const;

const blueprint: CustomerSolutionBlueprint = {
  schema: "kf-design-plan/v3", displayName: "园区访客工作台", objective: "审核访客申请并查看到访状态",
  audiences: ["园区前台"], scenarios: ["审核申请"],
  pages: [{ id: "bp-page", title: "访客审核", purpose: "集中查看访客申请", readingOrder: ["main"], regions: [{
    id: "main", purpose: "展示访客姓名和审核状态", semanticRoles: ["heading", "narrative-content", "status"],
    dataShape: "record-list", density: "comfortable", importance: "primary", content: ["访客姓名", "审核状态"],
    sampleData: [{ 姓名: "陈佳宁", 状态: "待审核" }], interactions: [], states: ["initial"],
    visualIntent: "清晰且易于扫描的文字层级",
  }] }],
  journeys: [{ id: "review", actor: "园区前台", goal: "审核访客申请", steps: [{
    pageId: "bp-page", regionId: "main", action: "查看申请", result: "理解申请状态",
  }], completion: "完成申请核对" }],
  visualDirection: { tone: "清晰克制", colors: ["深蓝", "暖白"], typography: "正文清晰", spacingAndSurfaces: "舒适间距" },
  acceptanceScenarios: ["前台能够查看申请"], openQuestions: [],
};

const realBundle = retrieveCapabilities({ blueprint, knowledge: getDesignKnowledgeSnapshot() });
const registry = createDefaultModuleRegistry();

function intent(readingOrder = 0): NodeIntent {
  return {
    importance: "secondary", visualWeight: 3, readingOrder, density: "comfortable", groupWith: [],
    width: { mode: "fill" }, height: { mode: "content" }, align: "stretch",
  };
}

function control(id: string, content = id): SolutionNode {
  return {
    kind: "control", id, sourceBlueprintRegionIds: ["main"], intent: intent(), capabilityId: "text",
    content, properties: [], tabIds: [], styleRole: "body", eventBindings: [],
  };
}

function layout(id: string, kind: LayoutNode["layout"], children: SolutionNode[]): LayoutNode {
  return { kind: "layout", id, sourceBlueprintRegionIds: ["main"], intent: intent(), layout: kind, children };
}

function plan(
  root: SolutionNode,
  bundle: CapabilityCandidateBundle = realBundle,
  mockData: MockDataSet[] = [],
  localState: LocalStateDefinition[] = [],
  overlays: OverlayPlan[] = [],
): SolutionImplementationPlan {
  return {
    schema: "kf-solution-implementation/v1", projectKey: "visitor-workspace", blueprintHash: bundle.blueprintHash,
    candidateBundleHash: canonicalServerHash(bundle), theme, roleStyles: [], mockData, localState,
    pages: [{
      id: "visitor-page", title: "访客审核", purpose: "集中审核访客申请", canvas: "desktop",
      sourceBlueprintPageId: "bp-page", sourceBlueprintRegionIds: ["main"], initialStateIds: [], root,
    }],
    overlays, actions: [], scripts: [],
  };
}

function geometry(x: number, y: number, width: number, height: number): LayoutGeometry {
  return { x, y, width, height };
}

function compiledNode(
  id: string,
  kind: CompiledLayoutNode["kind"],
  box: LayoutGeometry,
  children: readonly CompiledLayoutNode[] = [],
  semanticLayout?: LayoutNode["layout"],
  zIndex = 0,
  scrollContentExtent?: Readonly<{ width: number; height: number }>,
): CompiledLayoutNode {
  return {
    id, kind, layout: semanticLayout, geometry: box, zIndex,
    overflow: semanticLayout === "scroll-region" ? "local-scroll" : "visible",
    ...(scrollContentExtent === undefined ? {} : { scrollContentExtent }), children,
  };
}

function compiledTree(root: CompiledLayoutNode, pageHeight = 320): CompiledLayoutTree {
  const byId = new Map<string, CompiledLayoutNode>();
  const visit = (node: CompiledLayoutNode): void => {
    byId.set(node.id, node);
    node.children.forEach(visit);
  };
  visit(root);
  return { pageWidth: 1440, pageHeight, root, byId };
}

function basicTree(rootKind: LayoutNode["layout"] = "column"): CompiledLayoutTree {
  const child = compiledNode("title", "control", geometry(40, 64, 400, 40), [], undefined, 1);
  return compiledTree(compiledNode("root", "layout", geometry(40, 40, 1_360, 120), [child], rootKind), 200);
}

function compileInput(
  inputPlan: SolutionImplementationPlan,
  layoutTree: CompiledLayoutTree,
  bundle: CapabilityCandidateBundle = realBundle,
  moduleRegistry: ModuleRegistry = registry,
) {
  return { plan: inputPlan, bundle, layout: layoutTree, moduleRegistry, approvedAssets: [] };
}

function repeaterModuleRegistry(): ModuleRegistry {
  const moduleRegistry = new ModuleRegistry();
  const definition: ModuleDefinition = {
    kind: "test.repeater-label",
    version: "1.0.0",
    category: "test",
    maturity: "stable",
    variants: ["default"],
    contentSchema: z.object({ label: z.string().min(1).max(200) }).strict(),
    assetSlots: [],
    requiredKfCapabilities: ["layout.4", "text"],
    compilerFingerprint: "test-repeater-label-v1",
    layoutFingerprint: "test-repeater-label-layout-v1",
    layout: {
      regions: ["main"], minColumnSpan: 1, maxColumnSpan: 12, preferredHeights: ["compact"], interactions: [],
      height: { min: 40, preferred: { compact: 40, small: 48, medium: 56, large: 64, full: 72 }, max: 80 },
    },
    compile: ({ context }) => ({
      components: [{
        id: "surface", role: "surface", capabilityId: "layout.4", critical: true,
        geometry: { x: 0, y: 0, width: context.bounds.width, height: context.bounds.height },
        properties: {}, style: { declarations: {}, states: {} },
      }, {
        id: "value", role: "body", capabilityId: "text", critical: true,
        content: String(context.content.label), geometry: { x: 8, y: 8, width: 200, height: 24 },
        properties: { parentId: "surface" }, style: { declarations: {}, states: {} },
      }],
      deliveryGaps: [],
    }),
  };
  moduleRegistry.register(definition);
  return moduleRegistry;
}

function repeaterModule(id: string, alias: string, field = "name"): SolutionNode {
  return {
    kind: "registered-module", id, sourceBlueprintRegionIds: ["main"], intent: intent(),
    moduleKind: "test.repeater-label", templateVersion: "1.0.0", variant: "default", title: "访客资料",
    content: { kind: "record", fields: [{ name: "label", value: { kind: "repeater-field", itemAlias: alias, field } }] },
    eventBindings: [], slots: [],
  };
}

function dataSet(id: string, values: readonly Readonly<{ key: string; name: string }>[]): MockDataSet {
  return {
    id, purpose: "访客卡片",
    fields: [{ key: "key", label: "稳定键", type: "text" }, { key: "name", label: "姓名", type: "text" }],
    records: values.map((value) => ({ values: [
      { field: "key", value: value.key }, { field: "name", value: value.name },
    ] })),
  };
}

function repeaterPlan(records: readonly Readonly<{ key: string; name: string }>[]) {
  const template = { ...control("name"), content: { kind: "repeater-field" as const, itemAlias: "visitor", field: "name" } };
  const repeater: SolutionNode = {
    kind: "repeater", id: "visitor-cards", sourceBlueprintRegionIds: ["main"], intent: intent(),
    mockDataId: "visitors", itemAlias: "visitor", keyField: "key", maxItems: 12, template,
  };
  return plan(layout("root", "column", [repeater]), realBundle, [dataSet("visitors", records)]);
}

function repeaterTree(records: readonly Readonly<{ key: string; name: string }>[]): CompiledLayoutTree {
  const items = records.map((record, index) => {
    const itemId = `visitor-cards--${record.key}`;
    const y = 56 + index * 44;
    const field = compiledNode(`${itemId}--name`, "control", geometry(56, y, 400, 32), [], undefined, 2);
    return compiledNode(itemId, "layout", geometry(48, y - 4, 1_320, 40), [field], "column", 1);
  });
  const height = 32 + Math.max(1, records.length) * 44;
  return compiledTree(compiledNode("root", "layout", geometry(40, 40, 1_360, height), items, "column"), height + 80);
}

function readCompileError(run: () => void): ComponentCompileError {
  try {
    run();
    throw new Error("expected component compilation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(ComponentCompileError);
    if (!(error instanceof ComponentCompileError)) throw error;
    return error;
  }
}

describe("compileComponents", () => {
  it("emits strict native-v2 layout and control records from real candidate evidence", () => {
    const inputPlan = plan(layout("root", "column", [control("title", "访客申请")]));
    const controls = compileComponents(compileInput(inputPlan, basicTree()));

    expect(controls).toHaveLength(2);
    expect(controls.every((item) => UIImplementationControlV2Schema.safeParse(item).success)).toBe(true);
    controls.forEach((item) => {
      expect(validateCreateComponentProperties(item.capabilityId, item.nativeProperties)).toEqual(item.nativeProperties);
    });
    expect(controls[0]).toMatchObject({
      id: "root", capabilityId: "layout.4", depth: 0,
      compiledLayout: { kind: "column", overflow: "visible" },
      sourceBlueprintPageId: "bp-page", sourceBlueprintRegionIds: ["main"],
    });
    expect(controls[1]).toMatchObject({
      id: "title", parentId: "root", capabilityId: "text", content: "访客申请", depth: 1,
      nativeProperties: { text: "访客申请", parentId: "root" },
    });
  });

  it("uses candidate order before the code-point tie break for a compatible layout", () => {
    const bundle = structuredClone(realBundle);
    bundle.regions[0]!.layouts = [
      bundle.regions[0]!.layouts.find((candidate) => candidate.id === "layout.4")!,
      bundle.regions[0]!.layouts.find((candidate) => candidate.id === "layout.2")!,
    ];
    const controls = compileComponents(compileInput(plan(layout("root", "grid", [control("title")]), bundle), basicTree("grid"), bundle));
    expect(controls[0]!.capabilityId).toBe("layout.4");
  });

  function actualTabsFixture() {
    const bundle = structuredClone(realBundle);
    const source = bundle.regions[0]!.controls.find((candidate) => candidate.id === "text")
      ?? bundle.regions[0]!.controls[0]!;
    const other = bundle.regions[0]!.controls.find((candidate) => candidate.id !== source.id)!;
    bundle.regions[0]!.controls = [source, other, { ...source, id: "tabs" }];
    bundle.detailedCapabilityIds = [...new Set([...bundle.detailedCapabilityIds, "tabs"])].sort();
    for (const regionId of ["profile-region", "activity-region"]) {
      bundle.regions.push({ ...structuredClone(bundle.regions[0]!), regionId });
    }
    const tabs = control("profile-tabs") as Extract<SolutionNode, { kind: "control" }>;
    tabs.capabilityId = "tabs";
    tabs.content = null;
    tabs.sourceBlueprintRegionIds = ["main"];
    tabs.tabIds = ["profile", "activity"];
    tabs.properties = [{ name: "tabs", value: { kind: "list", items: [
      { kind: "record", fields: [
        { name: "id", value: "profile" }, { name: "label", value: "基本资料" },
        { name: "regionId", value: "profile-region" }, { name: "paneNodeId", value: "profile-pane" },
      ] },
      { kind: "record", fields: [
        { name: "id", value: "activity" }, { name: "label", value: "操作记录" },
        { name: "regionId", value: "activity-region" }, { name: "paneNodeId", value: "activity-pane" },
      ] },
    ] } }, { name: "activeId", value: "profile" }];
    const profileText = control("profile-field", "陈予安");
    profileText.sourceBlueprintRegionIds = ["profile-region"];
    const activityText = control("activity-field", "2026-08-25 更新权限");
    activityText.sourceBlueprintRegionIds = ["activity-region"];
    const profilePane = layout("profile-pane", "column", [profileText]);
    profilePane.sourceBlueprintRegionIds = ["profile-region"];
    const activityPane = layout("activity-pane", "column", [activityText]);
    activityPane.sourceBlueprintRegionIds = ["activity-region"];
    const stage = layout("tabs-stage", "column", [tabs, profilePane, activityPane]);
    const box = geometry(40, 40, 600, 360);
    const ownerBox = geometry(40, 40, 600, 180);
    const tree = compiledTree(compiledNode("tabs-stage", "layout", box, [
      compiledNode("profile-tabs", "control", ownerBox, [], undefined, 1),
      compiledNode("profile-pane", "layout", geometry(40, 240, 600, 60), [
        compiledNode("profile-field", "control", geometry(60, 250, 240, 40), [], undefined, 3),
      ], "column", 2),
      compiledNode("activity-pane", "layout", geometry(40, 320, 600, 60), [
        compiledNode("activity-field", "control", geometry(60, 330, 320, 40), [], undefined, 4),
      ], "column", 3),
    ], "column"), 440);
    return { bundle, inputPlan: plan(stage, bundle), tree, tabs, profilePane, activityPane, ownerBox };
  }

  it("compiles semantic tab ids and region-owned panes into signed native ownership", () => {
    const fixture = actualTabsFixture();
    const compiled = compileComponents(compileInput(fixture.inputPlan, fixture.tree, fixture.bundle));
    expect(compiled.find((item) => item.id === "profile-tabs")!.nativeProperties).toEqual({
      tabs: [
        { id: "profile", label: "基本资料", regionId: "profile-region", paneNodeId: "profile-pane" },
        { id: "activity", label: "操作记录", regionId: "activity-region", paneNodeId: "activity-pane" },
      ],
      activeId: "profile",
      parentId: "tabs-stage",
    });
    expect(compiled.find((item) => item.id === "profile-pane")).toMatchObject({
      parentId: "profile-tabs", depth: 2,
      geometry: fixture.ownerBox,
      tabPane: { ownerSemanticControlId: "profile-tabs", tabId: "profile", sourceBlueprintRegionId: "profile-region" },
      nativeProperties: { parentId: "profile-tabs" },
    });
    expect(compiled.find((item) => item.id === "profile-field")).toMatchObject({
      parentId: "profile-pane", depth: 3, geometry: geometry(60, 50, 240, 40),
    });
    expect(compiled.find((item) => item.id === "activity-pane")).toMatchObject({
      parentId: "profile-tabs", depth: 2,
      geometry: fixture.ownerBox,
      tabPane: { ownerSemanticControlId: "profile-tabs", tabId: "activity", sourceBlueprintRegionId: "activity-region" },
    });
    expect(compiled.find((item) => item.id === "activity-field")).toMatchObject({
      parentId: "activity-pane", depth: 3, geometry: geometry(60, 50, 320, 40),
    });
  });

  it.each([
    ["missing pane", (fixture: ReturnType<typeof actualTabsFixture>) => {
      const stage = fixture.inputPlan.pages[0]!.root as LayoutNode;
      stage.children = stage.children.filter((node) => node.id !== "activity-pane");
    }, /COMPONENT_TAB_PANE_MISSING/],
    ["duplicate pane", (fixture: ReturnType<typeof actualTabsFixture>) => {
      const tabsValue = fixture.tabs.properties[0]!.value;
      if (typeof tabsValue !== "object" || tabsValue === null || tabsValue.kind !== "list") throw new Error("tabs fixture drift");
      const second = tabsValue.items[1];
      if (typeof second !== "object" || second === null || second.kind !== "record") throw new Error("tabs fixture drift");
      second.fields.find((field) => field.name === "paneNodeId")!.value = "profile-pane";
    }, /COMPONENT_TAB_PANE_DUPLICATE/],
    ["missing ownership", (fixture: ReturnType<typeof actualTabsFixture>) => {
      const tabsValue = fixture.tabs.properties[0]!.value;
      if (typeof tabsValue !== "object" || tabsValue === null || tabsValue.kind !== "list") throw new Error("tabs fixture drift");
      const first = tabsValue.items[0];
      if (typeof first !== "object" || first === null || first.kind !== "record") throw new Error("tabs fixture drift");
      first.fields = first.fields.filter((field) => field.name !== "regionId");
    }, /COMPONENT_TAB_OWNERSHIP_REQUIRED|INVALID_COMPONENT_PROPERTY/],
    ["duplicate region", (fixture: ReturnType<typeof actualTabsFixture>) => {
      const tabsValue = fixture.tabs.properties[0]!.value;
      if (typeof tabsValue !== "object" || tabsValue === null || tabsValue.kind !== "list") throw new Error("tabs fixture drift");
      const second = tabsValue.items[1];
      if (typeof second !== "object" || second === null || second.kind !== "record") throw new Error("tabs fixture drift");
      second.fields.find((field) => field.name === "regionId")!.value = "profile-region";
    }, /COMPONENT_TAB_REGION_DUPLICATE/],
    ["invalid active", (fixture: ReturnType<typeof actualTabsFixture>) => {
      fixture.tabs.properties.find((property) => property.name === "activeId")!.value = "missing";
    }, /COMPONENT_TAB_ACTIVE_ID_INVALID|TAB_ACTIVE_ID_UNKNOWN/],
  ] as const)("rejects invalid native Tabs pane ownership: %s", (_label, mutate, expected) => {
    const fixture = actualTabsFixture();
    mutate(fixture);
    expect(() => compileComponents(compileInput(fixture.inputPlan, fixture.tree, fixture.bundle))).toThrow(expected);
  });

  it("fails closed when a Tabs pane owner is on another semantic page", () => {
    const fixture = actualTabsFixture();
    const tabsValue = fixture.tabs.properties[0]!.value;
    if (typeof tabsValue !== "object" || tabsValue === null || tabsValue.kind !== "list") throw new Error("tabs fixture drift");
    const second = tabsValue.items[1];
    if (typeof second !== "object" || second === null || second.kind !== "record") throw new Error("tabs fixture drift");
    second.fields.find((field) => field.name === "paneNodeId")!.value = "foreign-pane";
    second.fields.find((field) => field.name === "regionId")!.value = "foreign-region";
    const foreignPane = layout("foreign-pane", "column", [control("foreign-content", "跨页")]);
    foreignPane.sourceBlueprintRegionIds = ["foreign-region"];
    fixture.inputPlan.pages.push({
      id: "foreign-page", title: "其他页", purpose: "隔离 Tabs pane", canvas: "desktop",
      sourceBlueprintPageId: "bp-foreign", sourceBlueprintRegionIds: ["foreign-region"], initialStateIds: [], root: foreignPane,
    });
    fixture.bundle.regions.push({ ...structuredClone(fixture.bundle.regions[0]!), pageId: "bp-foreign", regionId: "foreign-region" });
    fixture.inputPlan.candidateBundleHash = canonicalServerHash(fixture.bundle);
    expect(() => compileComponents(compileInput(fixture.inputPlan, fixture.tree, fixture.bundle)))
      .toThrow(/COMPONENT_TAB_PANE_CROSS_PAGE|COMPONENT_TAB_REGION_CROSS_PAGE/);
  });

  it("fails closed for absent compatible candidates, wrong provenance, and stale knowledge versions", () => {
    const absent = structuredClone(realBundle);
    absent.regions[0]!.layouts = [absent.regions[0]!.layouts.find((candidate) => candidate.id === "layout.5")!];
    expect(() => compileComponents(compileInput(plan(layout("root", "grid", [control("title")]), absent), basicTree("grid"), absent)))
      .toThrow(/LAYOUT_CAPABILITY_CANDIDATE_MISSING.*root/);

    const wrongPagePlan = plan(layout("root", "column", [control("title")]));
    wrongPagePlan.pages[0]!.sourceBlueprintPageId = "other-page";
    expect(() => compileComponents(compileInput(wrongPagePlan, basicTree())))
      .toThrow(/CANDIDATE_PROVENANCE_MISMATCH.*other-page\/main/);

    const stale = structuredClone(realBundle);
    stale.regions[0]!.controls.find((candidate) => candidate.id === "text")!.knowledgeVersion = "9.9.9";
    expect(() => compileComponents(compileInput(plan(layout("root", "column", [control("title")]), stale), basicTree(), stale)))
      .toThrow(/CANDIDATE_VERSION_MISMATCH.*text/);
  });

  it("reports exact wrong-region evidence and a stale canonical bundle hash", () => {
    const wrongRegionRoot = layout("root", "column", [control("title")]);
    wrongRegionRoot.children[0]!.sourceBlueprintRegionIds = ["other-region"];
    const wrongRegion = readCompileError(() => compileComponents(compileInput(plan(wrongRegionRoot), basicTree())));
    expect(wrongRegion).toMatchObject({ code: "CANDIDATE_PROVENANCE_MISMATCH", path: ["title", "capabilityId"] });

    const mutatedBundle = structuredClone(realBundle);
    mutatedBundle.regions[0]!.controls[0]!.reasons[0] = "Canonical bundle changed after plan acceptance.";
    const staleHash = readCompileError(() => compileComponents(compileInput(
      plan(layout("root", "column", [control("title")])),
      basicTree(),
      mutatedBundle,
    )));
    expect(staleHash).toMatchObject({ code: "CANDIDATE_BUNDLE_HASH_MISMATCH", path: ["plan", "candidateBundleHash"] });
  });

  it("expands twelve records with normalized stable ids and exact parent links", () => {
    const records = [
      { key: "chen-jianing", name: "陈佳宁" },
      ...Array.from({ length: 11 }, (_entry, index) => ({ key: `visitor-${index + 2}`, name: `访客${index + 2}` })),
    ];
    const controls = compileComponents(compileInput(repeaterPlan(records), repeaterTree(records)));
    const expanded = controls.filter((item) => item.sourceRepeaterId === "visitor-cards");

    expect(expanded).toHaveLength(24);
    expect(expanded.filter((item) => item.role === "repeater-item")).toHaveLength(12);
    expect(expanded.filter((item) => item.role !== "repeater-item")).toHaveLength(12);
    expect(new Set(controls.map((item) => item.id)).size).toBe(controls.length);
    expect(controls.find((item) => item.id === "visitor-cards--chen-jianing--name")).toMatchObject({
      parentId: "visitor-cards--chen-jianing", content: "陈佳宁",
      nativeProperties: { text: "陈佳宁", parentId: "visitor-cards--chen-jianing" },
    });
  });

  it("shadows an outer alias with the nested repeater's current record", () => {
    const innerValue = { ...control("value"), content: { kind: "repeater-field" as const, itemAlias: "item", field: "name" } };
    const inner: SolutionNode = {
      kind: "repeater", id: "inner", sourceBlueprintRegionIds: ["main"], intent: intent(),
      mockDataId: "inner-data", itemAlias: "item", keyField: "key", maxItems: 4, template: innerValue,
    };
    const outer: SolutionNode = {
      kind: "repeater", id: "outer", sourceBlueprintRegionIds: ["main"], intent: intent(),
      mockDataId: "outer-data", itemAlias: "item", keyField: "key", maxItems: 4, template: inner,
    };
    const inputPlan = plan(layout("root", "column", [outer]), realBundle, [
      dataSet("outer-data", [{ key: "outer-key", name: "外层值" }]),
      dataSet("inner-data", [{ key: "inner-key", name: "内层值" }]),
    ]);
    const leaf = compiledNode("outer--outer-key--inner--inner-key--value", "control", geometry(64, 64, 300, 32), [], undefined, 3);
    const innerHost = compiledNode("outer--outer-key--inner--inner-key", "layout", geometry(56, 60, 400, 40), [leaf], "column", 2);
    const outerHost = compiledNode("outer--outer-key", "layout", geometry(48, 52, 500, 56), [innerHost], "column", 1);
    const tree = compiledTree(compiledNode("root", "layout", geometry(40, 40, 1_360, 80), [outerHost], "column"), 160);

    const controls = compileComponents(compileInput(inputPlan, tree));
    expect(controls.find((item) => item.id === "outer--outer-key"))
      .toMatchObject({ role: "repeater-item", sourceRepeaterId: "outer" });
    expect(controls.find((item) => item.id === "outer--outer-key--inner--inner-key"))
      .toMatchObject({ role: "repeater-item", sourceRepeaterId: "inner" });
    expect(controls.find((item) => item.id.endsWith("--value"))).toMatchObject({ content: "内层值", sourceRepeaterId: "inner" });
  });

  it("resolves registered-module content from its repeater record and fails unresolved fields", () => {
    const module = repeaterModule("profile", "item");
    const repeater: SolutionNode = {
      kind: "repeater", id: "modules", sourceBlueprintRegionIds: ["main"], intent: intent(),
      mockDataId: "module-data", itemAlias: "item", keyField: "key", maxItems: 4, template: module,
    };
    const inputPlan = plan(layout("root", "column", [repeater]), realBundle, [
      dataSet("module-data", [{ key: "one", name: "模块值" }]),
    ]);
    const allocated = compiledNode("modules--one--profile", "registered-module", geometry(56, 56, 300, 40), [], undefined, 2);
    const itemHost = compiledNode("modules--one", "layout", geometry(48, 52, 500, 48), [allocated], "column", 1);
    const tree = compiledTree(compiledNode("root", "layout", geometry(40, 40, 1_360, 80), [itemHost], "column"), 160);
    const moduleRegistry = repeaterModuleRegistry();

    const controls = compileComponents(compileInput(inputPlan, tree, realBundle, moduleRegistry));
    expect(controls.find((item) => item.id === "modules--one--profile--value"))
      .toMatchObject({ content: "模块值", sourceRepeaterId: "modules" });

    if (module.kind !== "registered-module") throw new Error("invalid module fixture");
    module.content = { kind: "record", fields: [{
      name: "label", value: { kind: "repeater-field", itemAlias: "item", field: "missing" },
    }] };
    expect(() => compileComponents(compileInput(inputPlan, tree, realBundle, moduleRegistry)))
      .toThrow(/REPEATER_FIELD_UNRESOLVED.*item\.missing/);
  });

  it("shadows a same-name outer alias for registered modules in a nested real plan", () => {
    const module = repeaterModule("profile", "item");
    const inner: SolutionNode = {
      kind: "repeater", id: "inner", sourceBlueprintRegionIds: ["main"], intent: intent(),
      mockDataId: "inner-data", itemAlias: "item", keyField: "key", maxItems: 4, template: module,
    };
    const outer: SolutionNode = {
      kind: "repeater", id: "outer", sourceBlueprintRegionIds: ["main"], intent: intent(),
      mockDataId: "outer-data", itemAlias: "item", keyField: "key", maxItems: 4, template: inner,
    };
    const inputPlan = plan(layout("root", "column", [outer]), realBundle, [
      dataSet("outer-data", [{ key: "outer-key", name: "外层模块值" }]),
      dataSet("inner-data", [{ key: "inner-key", name: "内层模块值" }]),
    ]);
    const allocated = compiledNode(
      "outer--outer-key--inner--inner-key--profile",
      "registered-module",
      geometry(64, 60, 300, 40),
      [],
      undefined,
      3,
    );
    const innerHost = compiledNode(
      "outer--outer-key--inner--inner-key",
      "layout",
      geometry(56, 56, 420, 56),
      [allocated],
      "column",
      2,
    );
    const outerHost = compiledNode("outer--outer-key", "layout", geometry(48, 52, 500, 72), [innerHost], "column", 1);
    const tree = compiledTree(compiledNode("root", "layout", geometry(40, 40, 1_360, 104), [outerHost], "column"), 184);

    const controls = compileComponents(compileInput(inputPlan, tree, realBundle, repeaterModuleRegistry()));
    expect(controls.find((item) => item.id.endsWith("--profile--value")))
      .toMatchObject({ content: "内层模块值", sourceRepeaterId: "inner" });
  });

  it.each([
    ["max items", Array.from({ length: 13 }, (_entry, index) => ({ key: `key-${index}`, name: `访客${index}` })), "REPEATER_MAX_ITEMS_EXCEEDED"],
    ["duplicate key", [{ key: "same", name: "甲" }, { key: "same", name: "乙" }], "REPEATER_KEY_DUPLICATE"],
    ["normalized collision", [{ key: "same key", name: "甲" }, { key: "same-key", name: "乙" }], "REPEATER_KEY_COLLISION"],
    ["unsafe key", [{ key: "__proto__", name: "甲" }], "REPEATER_KEY_UNSAFE"],
  ] as const)("rejects %s before emitting a legal-looking fallback id", (_label, records, code) => {
    const error = readCompileError(() => compileComponents(compileInput(repeaterPlan(records), repeaterTree(records))));
    expect(error.code).toBe(code);
    expect(error.path[0]).toBe("visitor-cards");
  });

  it("rejects Unicode repeater keys and NFKC normalization collisions with exact codes", () => {
    const unsafe = readCompileError(() => compileComponents(compileInput(
      repeaterPlan([{ key: "访客一", name: "甲" }]),
      repeaterTree([{ key: "访客一", name: "甲" }]),
    )));
    expect(unsafe).toMatchObject({ code: "REPEATER_KEY_UNSAFE", path: ["visitor-cards", "records", 0, "key"] });

    const collisionPlan = repeaterPlan([{ key: "Ｓａｍｅ", name: "甲" }, { key: "same", name: "乙" }]);
    const collision = readCompileError(() => compileComponents(compileInput(
      collisionPlan,
      repeaterTree([{ key: "same", name: "甲" }]),
    )));
    expect(collision).toMatchObject({ code: "REPEATER_KEY_COLLISION", path: ["visitor-cards", "records", 1, "key"] });
  });

  it("rejects missing keys and unresolved current-record fields with structured paths", () => {
    const missingKeyPlan = repeaterPlan([{ key: "present", name: "甲" }]);
    missingKeyPlan.mockData[0]!.records[0]!.values = [{ field: "name", value: "甲" }];
    const missingKey = readCompileError(() => compileComponents(compileInput(missingKeyPlan, repeaterTree([{ key: "present", name: "甲" }]))));
    expect(missingKey).toMatchObject({ code: "REPEATER_KEY_MISSING", path: ["visitor-cards", "records", 0, "key"] });

    const missingFieldPlan = repeaterPlan([{ key: "present", name: "甲" }]);
    const repeater = (missingFieldPlan.pages[0]!.root as LayoutNode).children[0]!;
    if (repeater.kind !== "repeater" || repeater.template.kind !== "control") throw new Error("invalid test fixture");
    repeater.template.content = { kind: "repeater-field", itemAlias: "visitor", field: "missing" };
    const missingField = readCompileError(() => compileComponents(compileInput(missingFieldPlan, repeaterTree([{ key: "present", name: "甲" }]))));
    expect(missingField.code).toBe("REPEATER_FIELD_UNRESOLVED");
    expect(missingField.path.join(".")).toContain("content");
  });

  it("rejects malicious semantic keys and cyclic values without evaluating them", () => {
    const malicious = control("title", "safe");
    if (malicious.kind !== "control") throw new Error("invalid test fixture");
    malicious.properties = [{ name: "constructor", value: "payload" }];
    expect(() => compileComponents(compileInput(plan(layout("root", "column", [malicious])), basicTree())))
      .toThrow(/SEMANTIC_DATA_UNSAFE_KEY.*constructor/);

    const cyclic = { kind: "record" as const, fields: [] as Array<{ name: string; value: string }> };
    cyclic.fields.push({ name: "safe", value: cyclic as never });
    malicious.properties = [{ name: "value", value: cyclic }];
    expect(() => compileComponents(compileInput(plan(layout("root", "column", [malicious])), basicTree())))
      .toThrow(/SEMANTIC_DATA_CYCLE/);
  });

  it("preserves trusted scroll metadata while expressing overflow only as reviewed style", () => {
    const root = layout("root", "scroll-region", [control("first", "第一项"), control("second", "第二项")]);
    const first = compiledNode("first", "control", geometry(40, 40, 400, 40), [], undefined, 1);
    const second = compiledNode("second", "control", geometry(40, 120, 400, 40), [], undefined, 1);
    const tree = compiledTree(compiledNode("root", "layout", geometry(40, 40, 1_360, 100), [first, second], "scroll-region", 0, { width: 1_360, height: 120 }), 180);

    const controls = compileComponents(compileInput(plan(root), tree));
    expect(controls[0]).toMatchObject({
      compiledLayout: { kind: "scroll-region", overflow: "local-scroll", scrollContentExtent: { width: 1_360, height: 120 } },
      style: { declarations: { overflow: "auto" }, states: {} },
    });
    expect(controls[0]!.nativeProperties).toEqual({});
    expect(validateCreateComponentProperties(controls[0]!.capabilityId, controls[0]!.nativeProperties)).toEqual({});
    const secondGeometry = controls.find((item) => item.id === "second")!.geometry;
    expect(secondGeometry.y + secondGeometry.height).toBeGreaterThan(controls[0]!.geometry.y + controls[0]!.geometry.height);
  });

  it("calls the trusted layout boundary for a column relabel and missing metadata", () => {
    expect(() => compileComponents(compileInput(plan(layout("root", "column", [control("title")])), basicTree("row"))))
      .toThrow(/kind mismatch.*root.*expected row.*actual column/);

    const trustedColumn = compiledTree(compiledNode("root", "layout", geometry(40, 40, 400, 40), [], "column"), 120);
    expect(() => compileComponents(compileInput(plan(control("root", "not a layout")), trustedColumn)))
      .toThrow(/compiledLayout mismatch.*root/);
  });
});

describe("compileOverlay", () => {
  function overlayFixture(initiallyVisible = false) {
    const overlayRoot = layout("dialog-root", "column", [control("dialog-title", "确认提交")]);
    const overlay: OverlayPlan = {
      id: "approval-dialog", title: "确认提交", purpose: "确认审核结果", presentation: "dialog",
      hostPageId: "visitor-page", sourceBlueprintPageId: "bp-page", sourceBlueprintRegionIds: ["main"],
      visibleStateId: "dialog-visible", dismissible: true, root: overlayRoot,
    };
    const state: LocalStateDefinition = {
      id: "dialog-visible", purpose: "控制确认弹窗显隐", type: "boolean", initialValue: initiallyVisible,
    };
    const inputPlan = plan(layout("root", "column", [control("title")]), realBundle, [], [state], [overlay]);
    const child = compiledNode("dialog-title", "control", geometry(180, 120, 400, 40), [], undefined, 1);
    const tree = compiledTree(compiledNode("dialog-root", "layout", geometry(160, 96, 640, 240), [child], "column"), 376);
    return { inputPlan, tree };
  }

  it("keeps overlay ownership separate, hidden, explicit, and above normal controls", () => {
    const { inputPlan, tree } = overlayFixture();
    const normal = compileComponents(compileInput(inputPlan, basicTree()));
    const compiled = compileOverlay({ ...compileInput(inputPlan, tree), overlayId: "approval-dialog" });

    expect(compiled.hostPageId).toBe("visitor-page");
    expect(normal.every((item) => item.overlayHost === undefined)).toBe(true);
    expect(compiled.controls[0]).toMatchObject({
      id: "dialog-root",
      overlayHost: {
        overlayId: "approval-dialog", hostPageId: "visitor-page", presentation: "dialog",
        visibleStateId: "dialog-visible", dismissible: true, initiallyVisible: false,
      },
      sourceBlueprintPageId: "bp-page",
    });
    expect(compiled.controls[0]!.nativeProperties).toEqual({});
    expect(validateCreateComponentProperties(
      compiled.controls[0]!.capabilityId,
      compiled.controls[0]!.nativeProperties,
    )).toEqual({});
    expect(compiled.controls[0]!.zIndex).toBeGreaterThan(Math.max(...normal.map((item) => item.zIndex)));
    expect(compiled.controls.slice(1).every((item) => item.parentId === "dialog-root" && item.overlayHost === undefined)).toBe(true);
  });

  it("fails instead of compiling an initially visible overlay", () => {
    const { inputPlan, tree } = overlayFixture(true);
    expect(() => compileOverlay({ ...compileInput(inputPlan, tree), overlayId: "approval-dialog" }))
      .toThrow(/OVERLAY_INITIAL_STATE_VISIBLE.*dialog-visible/);
  });

  it("rejects overlay ownership that does not match its explicit host page", () => {
    const { inputPlan, tree } = overlayFixture();
    inputPlan.overlays[0]!.sourceBlueprintPageId = "other-blueprint-page";
    expect(() => compileOverlay({ ...compileInput(inputPlan, tree), overlayId: "approval-dialog" }))
      .toThrow(/OVERLAY_HOST_PROVENANCE_MISMATCH.*other-blueprint-page.*bp-page/);
  });
});
