import {
  CapabilityCandidateBundleSchema,
  SolutionImplementationPlanSchema,
  UIImplementationSpecV2Schema,
  canonicalServerHash,
  workspaceAssetIdToModelId,
  type CapabilityCandidateBundle,
  type LayoutNode,
  type NodeIntent,
  type SolutionImplementationPlan,
  type SolutionNode,
} from "@kf/contracts";
import { describe, expect, it } from "vitest";
import { createDefaultModuleRegistry, ModuleRegistry } from "../modules/module-registry.js";
import { createPortalPlan } from "../modules/definitions/fixtures/portal-plan.js";
import { adaptLegacyModulePlan } from "../planning/legacy-module-plan-adapter.js";
import { createSemanticScriptApiContext } from "../interaction/semantic-script-api.js";
import {
  SolutionCompileError,
  compileSolutionImplementation,
  type SolutionCompileInput,
} from "./solution-compiler.js";
import { validateSolutionControlSemanticProjection } from "./solution-provenance.js";
// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { canonicalChangePlanHash, CustomerSolutionBlueprintSchema } from "@kf/contracts";
import { createHmacCreativeBuildFacade, resolveStoredPlan } from "@kf/build-jobs";
import { compileClientProject } from "../compile/client-compiler.js";
import { createKingClientDomainPack } from "../domain-pack/king-client-domain-pack.js";
import { createCreativeUIImplementationV2Compiler } from "../implementation/ui-implementation-v2-compiler.js";
import { attachRuntimeCorrelation } from "../implementation/runtime-correlation.js";
import { compileInteractions } from "../interaction/interaction-compiler.js";
import { inspectClientProject } from "../inspect/client-inspector.js";
import { importNativeClientPackage } from "../package/native-client-package.js";
// end
// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { compileSolutionImplementationWithProvenance, readSemanticCompilationProvenance } from "./solution-compiler.js";
// end

const CATALOG_VERSION = "1.0.0";
const WORKSPACE_ASSET_ID = "11111111-2222-3333-4444-555555555555";
const MODEL_ASSET_ID = workspaceAssetIdToModelId(WORKSPACE_ASSET_ID);
const SHA = "a".repeat(64);
const approvedAsset = {
  workspaceAssetId: WORKSPACE_ASSET_ID,
  targetPath: `project/res/images/${SHA}.png`,
  mediaType: "image/png" as const,
  sha256: SHA,
  sizeBytes: 4096,
};
const SECOND_WORKSPACE_ASSET_ID = "66666666-7777-8888-9999-aaaaaaaaaaaa";
const SECOND_MODEL_ASSET_ID = workspaceAssetIdToModelId(SECOND_WORKSPACE_ASSET_ID);
const SECOND_SHA = "b".repeat(64);
const secondApprovedAsset = {
  workspaceAssetId: SECOND_WORKSPACE_ASSET_ID,
  targetPath: `project/res/images/${SECOND_SHA}.png`,
  mediaType: "image/png" as const,
  sha256: SECOND_SHA,
  sizeBytes: 4096,
};

const theme = {
  background: "#0f172a", surface: "#172033", primary: "#3b82f6", accent: "#f59e0b",
  textPrimary: "#f8fafc", textSecondary: "#94a3b8", fontFamily: "Inter", spacingUnit: 8,
  radiusScale: { small: 4, medium: 10, large: 18 },
} as const;

function intent(
  readingOrder: number,
  width: NodeIntent["width"] = { mode: "fill" },
  height: NodeIntent["height"] = { mode: "content" },
  density: NodeIntent["density"] = "comfortable",
): NodeIntent {
  return {
    importance: readingOrder === 0 ? "primary" : "secondary",
    visualWeight: readingOrder === 0 ? 5 : 3,
    readingOrder,
    density,
    groupWith: [],
    width,
    height,
    align: "stretch",
  };
}

function textNode(id: string, region: string, content: string, order = 0): SolutionNode {
  return {
    kind: "control", id, sourceBlueprintRegionIds: [region], intent: intent(order),
    capabilityId: "text", content, properties: [], tabIds: [], styleRole: "body", eventBindings: [],
  };
}

function buttonNode(id: string, region: string, content: string, order = 0): SolutionNode {
  return {
    kind: "control", id, sourceBlueprintRegionIds: [region], intent: intent(order, { mode: "content" }),
    capabilityId: "button", content, properties: [], tabIds: [], styleRole: "action", eventBindings: [],
  };
}

function imageNode(id: string, region: string, order = 0): SolutionNode {
  return {
    kind: "control", id, sourceBlueprintRegionIds: [region],
    intent: intent(order, { mode: "ratio", value: 5 }, { mode: "content" }, "spacious"),
    capabilityId: "image", content: null,
    properties: [
      { name: "src", value: MODEL_ASSET_ID },
      { name: "fit", value: "cover" },
      { name: "alt", value: "智能工厂总览" },
    ],
    tabIds: [], styleRole: "media", eventBindings: [],
  };
}

function inputNode(id: string, region: string, order = 0): SolutionNode {
  return {
    kind: "control", id, sourceBlueprintRegionIds: [region], intent: intent(order),
    capabilityId: "input", content: null,
    properties: [{ name: "placeholder", value: "按名称筛选" }, { name: "value", value: "" }],
    tabIds: [], styleRole: "field", eventBindings: [],
  };
}

function layout(
  id: string,
  region: string,
  layoutKind: LayoutNode["layout"],
  children: SolutionNode[],
  order = 0,
): LayoutNode {
  return {
    kind: "layout", id, layout: layoutKind, children,
    sourceBlueprintRegionIds: [region], intent: intent(order),
  };
}

function candidate(
  sourcePages: readonly Readonly<{ pageId: string; regions: readonly string[] }>[],
  blueprintHash: string,
): CapabilityCandidateBundle {
  const ranked = (id: string) => ({
    id, score: 100, reasons: ["reviewed fixture capability"], limitations: [], knowledgeVersion: CATALOG_VERSION,
  });
  return CapabilityCandidateBundleSchema.parse({
    schema: "kf-capability-candidates/v1",
    knowledgeCatalogVersion: CATALOG_VERSION,
    blueprintHash,
    regions: sourcePages.flatMap((page) => page.regions.map((regionId) => ({
      pageId: page.pageId,
      regionId,
      controls: [ranked("text"), ranked("button"), ranked("image"), ranked("input")],
      layouts: [ranked("layout.2"), ranked("layout.4"), ranked("layout.5")],
      recipes: [ranked("portal-composition")],
    }))),
    detailedCapabilityIds: ["button", "image", "input", "layout.2", "layout.4", "layout.5", "text"],
    generatedAtPolicy: "deterministic-no-timestamp",
  });
}

function planWithBundle(
  projectKey: string,
  pages: SolutionImplementationPlan["pages"],
  sourcePages: readonly Readonly<{ pageId: string; regions: readonly string[] }>[],
  extras: Partial<Pick<SolutionImplementationPlan, "mockData" | "localState" | "overlays">> = {},
): Readonly<{ plan: SolutionImplementationPlan; bundle: CapabilityCandidateBundle }> {
  const blueprintHash = canonicalServerHash({ projectKey, sourcePages });
  const bundle = candidate(sourcePages, blueprintHash);
  const parsed = SolutionImplementationPlanSchema.parse({
    schema: "kf-solution-implementation/v1", projectKey, blueprintHash,
    candidateBundleHash: canonicalServerHash(bundle), theme,
    roleStyles: [
      { role: "body", declarations: { textColor: "{theme.textPrimary}", fontSize: 18, lineHeight: 1.5 }, states: {} },
      { role: "action", declarations: { backgroundColor: "{theme.primary}", textColor: "#ffffff", borderRadius: 8 }, states: { hover: { opacity: 0.9 } } },
      { role: "media", declarations: { borderRadius: 18 }, states: {} },
      { role: "field", declarations: { backgroundColor: "{theme.surface}", borderRadius: 8 }, states: {} },
    ],
    mockData: extras.mockData ?? [], localState: extras.localState ?? [], pages,
    overlays: extras.overlays ?? [], actions: [], scripts: [],
  });
  return { plan: parsed, bundle };
}

function compileFixture(fixture: Readonly<{ plan: SolutionImplementationPlan; bundle: CapabilityCandidateBundle }>) {
  return compileSolutionImplementation({
    plan: fixture.plan,
    candidateBundle: fixture.bundle,
    moduleRegistry: createDefaultModuleRegistry(),
    approvedAssets: [approvedAsset],
    activeCatalogVersion: CATALOG_VERSION,
  });
}

function compileInput(fixture: Readonly<{ plan: SolutionImplementationPlan; bundle: CapabilityCandidateBundle }>): SolutionCompileInput {
  return {
    plan: fixture.plan,
    candidateBundle: fixture.bundle,
    moduleRegistry: createDefaultModuleRegistry(),
    approvedAssets: [approvedAsset],
    activeCatalogVersion: CATALOG_VERSION,
  };
}

function portfolioFixture() {
  const sourcePages = [
    { pageId: "bp-home", regions: ["hero", "work"] },
    { pageId: "bp-about", regions: ["profile"] },
  ] as const;
  return planWithBundle("portfolio-solution", [{
    id: "home", title: "作品首页", purpose: "以视觉叙事展示代表项目", canvas: "desktop",
    sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["hero", "work"], initialStateIds: [],
    root: layout("home-root", "hero", "column", [
      layout("hero-split", "hero", "asymmetric-grid", [
        imageNode("hero-image", "hero"),
        layout("hero-copy", "hero", "column", [textNode("hero-title", "hero", "把复杂工业系统变成清晰产品", 0), buttonNode("hero-action", "hero", "查看案例", 1)]),
      ]),
      layout("work-grid", "work", "grid", [textNode("work-a", "work", "能源调度平台", 0), textNode("work-b", "work", "产线质量中枢", 1)]),
    ]),
  }, {
    id: "about", title: "关于", purpose: "呈现方法和经验", canvas: "responsive",
    sourceBlueprintPageId: "bp-about", sourceBlueprintRegionIds: ["profile"], initialStateIds: [],
    root: layout("about-root", "profile", "column", [textNode("about-title", "profile", "十二年跨行业产品经验"), textNode("about-body", "profile", "从研究到落地，持续把复杂约束转化为可操作的设计系统", 1)]),
  }], sourcePages);
}

function industrialFixture() {
  const sourcePages = [{ pageId: "bp-ops", regions: ["overview"] }] as const;
  const kpiModule: SolutionNode = {
    kind: "registered-module", id: "kpi-grid", moduleKind: "metric.kpi-grid", templateVersion: "1.0.0",
    variant: "compact", title: "实时生产指标", sourceBlueprintRegionIds: ["overview"], intent: intent(1),
    content: { kind: "record", fields: [{ name: "items", value: { kind: "list", items: [
      { kind: "record", fields: [{ name: "label", value: "设备在线率" }, { name: "value", value: "98.7%" }, { name: "trend", value: "+0.8%" }] },
      { kind: "record", fields: [{ name: "label", value: "今日产量" }, { name: "value", value: "12,480" }, { name: "trend", value: "+6.2%" }] },
    ] } }] },
    eventBindings: [], slots: [],
  };
  return planWithBundle("industrial-operations", [{
    id: "operations", title: "生产运行中枢", purpose: "监控设备和生产指标", canvas: "large-display",
    sourceBlueprintPageId: "bp-ops", sourceBlueprintRegionIds: ["overview"], initialStateIds: [],
    root: layout("ops-root", "overview", "dock", [
      textNode("ops-header", "overview", "华东工厂 · 实时运行", 0),
      layout("ops-side", "overview", "column", [textNode("alarm-title", "overview", "待处理告警"), buttonNode("alarm-open", "overview", "查看 4 条告警", 1)]),
      kpiModule,
    ]),
  }], sourcePages);
}

function adminFixture() {
  const sourcePages = [{ pageId: "bp-admin", regions: ["workspace"] }] as const;
  const records = {
    id: "people", purpose: "员工目录",
    fields: [{ key: "employeeId", label: "员工编号", type: "text" as const }, { key: "name", label: "姓名", type: "text" as const }],
    records: [
      { values: [{ field: "employeeId", value: "E-001" }, { field: "name", value: "陈妍" }] },
      { values: [{ field: "employeeId", value: "E-002" }, { field: "name", value: "赵衡" }] },
    ],
  };
  const personTemplate = textNode("person-name", "workspace", "placeholder");
  if (personTemplate.kind !== "control") throw new Error("fixture drift");
  const repeater: SolutionNode = {
    kind: "repeater", id: "people-list", mockDataId: "people", itemAlias: "person", keyField: "employeeId", maxItems: 8,
    sourceBlueprintRegionIds: ["workspace"], intent: intent(2),
    template: {
      ...personTemplate,
      content: { kind: "repeater-field", itemAlias: "person", field: "name" },
    },
  };
  const overlayRoot = layout("employee-overlay-root", "workspace", "overlay-anchor", [
    layout("employee-overlay-panel", "workspace", "column", [
      textNode("employee-overlay-title", "workspace", "员工资料"),
      buttonNode("employee-overlay-close", "workspace", "关闭", 1),
    ]),
  ]);
  return planWithBundle("management-admin", [{
    id: "admin", title: "人员管理", purpose: "筛选并管理员工资料", canvas: "desktop",
    sourceBlueprintPageId: "bp-admin", sourceBlueprintRegionIds: ["workspace"], initialStateIds: [],
    root: layout("admin-root", "workspace", "sidebar-content", [
      layout("admin-nav", "workspace", "column", [textNode("nav-title", "workspace", "组织管理"), buttonNode("nav-people", "workspace", "人员", 1)]),
      layout("admin-main", "workspace", "scroll-region", [textNode("admin-title", "workspace", "员工目录"), inputNode("people-filter", "workspace", 1), repeater]),
    ]),
  }], sourcePages, {
    mockData: [records],
    localState: [{ id: "employee-overlay-visible", purpose: "控制员工资料弹层", type: "boolean", initialValue: false }],
    overlays: [{
      id: "employee-overlay", title: "员工资料", purpose: "查看员工详细资料", presentation: "drawer",
      hostPageId: "admin", sourceBlueprintPageId: "bp-admin", sourceBlueprintRegionIds: ["workspace"],
      visibleStateId: "employee-overlay-visible", dismissible: true, root: overlayRoot,
    }],
  });
}

function nestedRepeaterModuleFixture() {
  const sourcePages = [{ pageId: "bp-nested", regions: ["nested"] }] as const;
  const module = industrialFixture().plan.pages[0]!.root;
  if (module.kind !== "layout" || module.children[2]?.kind !== "registered-module") throw new Error("fixture drift");
  return planWithBundle("nested-repeater-module", [{
    id: "nested-page", title: "嵌套模块", purpose: "验证嵌套展开 provenance", canvas: "desktop",
    sourceBlueprintPageId: "bp-nested", sourceBlueprintRegionIds: ["nested"], initialStateIds: [],
    root: layout("nested-root", "nested", "column", [
      repeaterNode("outer", "nested", "outer-data", "outerItem", layout("outer-template", "nested", "column", [
        repeaterNode("inner", "nested", "inner-data", "innerItem", {
          ...module.children[2],
          id: "nested-kpis",
          sourceBlueprintRegionIds: ["nested"],
        }),
      ])),
    ]),
  }], sourcePages, {
    mockData: [recordsDataSet("outer-data", 2), recordsDataSet("inner-data", 2)],
  });
}

function assetModuleFixture() {
  const sourcePages = [{ pageId: "bp-asset", regions: ["asset"] }] as const;
  const hero: SolutionNode = {
    kind: "registered-module", id: "asset-hero", moduleKind: "content.hero", templateVersion: "1.0.0",
    variant: "portrait-left", title: "人物介绍", assetId: MODEL_ASSET_ID,
    sourceBlueprintRegionIds: ["asset"], intent: intent(0), eventBindings: [], slots: [],
    content: { kind: "record", fields: [{ name: "title", value: "已审核人物" }] },
  };
  return planWithBundle("asset-module", [{
    id: "asset-page", title: "资产模块", purpose: "验证合法模块资产路径", canvas: "desktop",
    sourceBlueprintPageId: "bp-asset", sourceBlueprintRegionIds: ["asset"], initialStateIds: [],
    root: layout("asset-root", "asset", "column", [hero]),
  }], sourcePages);
}

function recordsDataSet(id: string, count: number) {
  return {
    id,
    purpose: "展开预算测试数据",
    fields: [{ key: "id", label: "编号", type: "text" as const }],
    records: Array.from({ length: count }, (_entry, index) => ({
      values: [{ field: "id", value: `R-${index}` }],
    })),
  };
}

function repeaterNode(
  id: string,
  region: string,
  mockDataId: string,
  itemAlias: string,
  template: SolutionNode,
  maxItems = 100,
): SolutionNode {
  return {
    kind: "repeater",
    id,
    mockDataId,
    itemAlias,
    keyField: "id",
    maxItems,
    sourceBlueprintRegionIds: [region],
    intent: intent(0),
    template,
  };
}

function exactExpansionBudgetFixture(recordCount: number) {
  const sourcePages = [{ pageId: "bp-budget", regions: ["budget"] }] as const;
  const template = layout("budget-template", "budget", "column", Array.from(
    { length: 8 },
    (_entry, index) => textNode(`budget-child-${index}`, "budget", `项目 ${index}`, index),
  ));
  return planWithBundle("expansion-budget", [{
    id: "budget-page",
    title: "展开预算",
    purpose: "验证展开边界",
    canvas: "desktop",
    sourceBlueprintPageId: "bp-budget",
    sourceBlueprintRegionIds: ["budget"],
    initialStateIds: [],
    root: layout("budget-root", "budget", "scroll-region", [
      repeaterNode("budget-repeater", "budget", "budget-data", "budgetItem", template),
      ...Array.from({ length: 9 }, (_entry, index) =>
        textNode(`budget-static-${index}`, "budget", `固定项目 ${index}`, index + 1)),
    ]),
  }], sourcePages, { mockData: [recordsDataSet("budget-data", recordCount)] });
}

// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
describe("compiler-owned semantic expansion provenance", () => {
  it("maps repeated template nodes to all actual emitted components without parsing ID prefixes", () => {
    const fixture = adminFixture();
    const input = { plan: fixture.plan, candidateBundle: fixture.bundle, moduleRegistry: createDefaultModuleRegistry(),
      approvedAssets: [], activeCatalogVersion: CATALOG_VERSION };
    const result = compileSolutionImplementationWithProvenance(input);
    expect(result.implementation).toEqual(compileSolutionImplementation(input));
    const provenance = readSemanticCompilationProvenance(result.provenance, fixture.plan);
    const names = provenance.filter(entry => entry.nodeId === "person-name");
    expect(names.map(entry => entry.componentId)).toEqual(["people-list--e-001--person-name", "people-list--e-002--person-name"]);
    expect(names.every(entry => entry.capabilityId === "text")).toBe(true);
    const compiled = result.implementation.pages.flatMap(page => page.compatibility === "native" ? page.controls : []);
    expect(provenance.map(entry => entry.componentId).sort()).toEqual(compiled.map(control => control.id).sort());
  });
  it("keeps registered module provenance through nested repeaters", () => {
    const fixture = nestedRepeaterModuleFixture();
    const result = compileSolutionImplementationWithProvenance({ plan: fixture.plan, candidateBundle: fixture.bundle,
      moduleRegistry: createDefaultModuleRegistry(), approvedAssets: [], activeCatalogVersion: CATALOG_VERSION });
    const provenance = readSemanticCompilationProvenance(result.provenance, fixture.plan);
    expect(provenance.filter(entry => entry.nodeId === "nested-kpis").length).toBeGreaterThan(4);
    expect(provenance.every(entry => fixture.plan.pages[0]!.root.id === entry.nodeId
      || ["outer", "outer-template", "inner", "nested-kpis"].includes(entry.nodeId))).toBe(true);
    expect(Object.isFrozen(provenance)).toBe(true);
    expect(provenance.every(entry => Object.isFrozen(entry))).toBe(true);
  });
  it("rejects forged or replayed provenance for a different semantic plan", () => {
    const fixture = adminFixture();
    const result = compileSolutionImplementationWithProvenance({ plan: fixture.plan, candidateBundle: fixture.bundle,
      moduleRegistry: createDefaultModuleRegistry(), approvedAssets: [], activeCatalogVersion: CATALOG_VERSION });
    expect(() => readSemanticCompilationProvenance({} as typeof result.provenance, fixture.plan)).toThrow("SEMANTIC_PROVENANCE_REQUIRED");
    expect(() => readSemanticCompilationProvenance(result.provenance, { ...fixture.plan, projectKey: "other-project" })).toThrow("SEMANTIC_PROVENANCE_PLAN_MISMATCH");
    expect(readSemanticCompilationProvenance(result.provenance, structuredClone(fixture.plan)))
      .toEqual(readSemanticCompilationProvenance(result.provenance, fixture.plan));
  });
});
// end

function nestedExpansionBombFixture() {
  const sourcePages = [{ pageId: "bp-bomb", regions: ["bomb"] }] as const;
  const nested = repeaterNode(
    "outer-repeater",
    "bomb",
    "outer-data",
    "outerItem",
    repeaterNode("inner-repeater", "bomb", "inner-data", "innerItem", textNode("bomb-leaf", "bomb", "叶子")),
  );
  return planWithBundle("expansion-bomb", [{
    id: "bomb-page",
    title: "嵌套展开",
    purpose: "验证饱和乘积预算",
    canvas: "desktop",
    sourceBlueprintPageId: "bp-bomb",
    sourceBlueprintRegionIds: ["bomb"],
    initialStateIds: [],
    root: layout("bomb-root", "bomb", "column", [nested]),
  }], sourcePages, {
    mockData: [recordsDataSet("outer-data", 100), recordsDataSet("inner-data", 100)],
  });
}

function cumulativeExpansionFixture() {
  const sourcePages = [
    { pageId: "bp-one", regions: ["shared"] },
    { pageId: "bp-two", regions: ["shared"] },
  ] as const;
  const repeatedRoot = (prefix: string) => layout(`${prefix}-root`, "shared", "grid", [
    repeaterNode(`${prefix}-repeater`, "shared", "shared-data", `${prefix}Item`, textNode(`${prefix}-leaf`, "shared", prefix)),
  ]);
  return planWithBundle("cumulative-expansion", [
    {
      id: "page-one", title: "页面一", purpose: "累计页面一", canvas: "desktop",
      sourceBlueprintPageId: "bp-one", sourceBlueprintRegionIds: ["shared"], initialStateIds: [], root: repeatedRoot("alpha"),
    },
    {
      id: "page-two", title: "页面二", purpose: "累计页面二", canvas: "desktop",
      sourceBlueprintPageId: "bp-two", sourceBlueprintRegionIds: ["shared"], initialStateIds: [], root: repeatedRoot("beta"),
    },
  ], sourcePages, {
    mockData: [recordsDataSet("shared-data", 100)],
    localState: [{ id: "budget-overlay-visible", purpose: "累计弹层", type: "boolean", initialValue: false }],
    overlays: [{
      id: "budget-overlay", title: "累计弹层", purpose: "累计弹层展开", presentation: "dialog",
      hostPageId: "page-one", sourceBlueprintPageId: "bp-one", sourceBlueprintRegionIds: ["shared"],
      visibleStateId: "budget-overlay-visible", dismissible: true, root: repeatedRoot("gamma"),
    }],
  });
}

function nativeControls(result: ReturnType<typeof compileFixture>) {
  return result.pages.flatMap((page) => page.compatibility === "native" ? page.controls : []);
}

// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
describe("native layout surface compilation", () => {
  function surfaceFixture(kind: LayoutNode["layout"] = "column") {
    const root = layout("surface", "overview", kind, [
      textNode("surface-first", "overview", "能源总览"),
      textNode("surface-second", "overview", "设备在线", 1),
    ]);
    const fixture = planWithBundle("surface-proof", [{
      id: "surface-page", title: "能源总览", purpose: "验证原生容器表面", canvas: "desktop",
      sourceBlueprintPageId: "bp-surface", sourceBlueprintRegionIds: ["overview"], initialStateIds: [], root,
    }], [{ pageId: "bp-surface", regions: ["overview"] }]);
    Object.assign(fixture.plan.pages[0]!.root, { styleRole: "card-surface" });
    fixture.plan.roleStyles.push({ role: "card-surface", declarations: {
      backgroundColor: "{theme.surface}", borderColor: "#dde5ec", borderRadius: 10,
      padding: 16, borderLeftWidth: 1, borderRightWidth: 3, borderTopWidth: 2, borderBottomWidth: 4,
    }, states: {} });
    return fixture;
  }

  it.each(["row", "column", "grid", "stack", "scroll-region"] as const)("keeps %s children inside padding and asymmetric borders", (kind) => {
    const fixture = surfaceFixture(kind);
    const controls = nativeControls(compileFixture(fixture));
    const surface = controls.find(control => control.id === "surface")!;
    expect(surface.style?.role).toBe("card-surface");
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    expect(surface.compiledStyle?.nativeFields).toMatchObject({ isShowBorder: true });
    expect(surface.compiledStyle?.nativeFields).not.toHaveProperty("backgroundColor");
    // end
    expect(surface.compiledStyle?.cssFragments).toContainEqual(expect.objectContaining({
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      selectorToken: "root", state: "normal", declarations: expect.objectContaining({ backgroundColor: theme.surface, padding: 16, borderRadius: 10 }),
      // end
    }));
    for (const child of controls.filter(control => control.parentId === surface.id)) {
      expect(child.geometry.x).toBeGreaterThanOrEqual(surface.geometry.x + 17);
      expect(child.geometry.y).toBeGreaterThanOrEqual(surface.geometry.y + 18);
      expect(child.geometry.x + child.geometry.width).toBeLessThanOrEqual(surface.geometry.x + surface.geometry.width - 19);
      expect(child.geometry.y + child.geometry.height).toBeLessThanOrEqual(surface.geometry.y + surface.geometry.height - 20);
    }
  });

  it("adds vertical insets exactly once and honors padding axes", () => {
    const styled = surfaceFixture();
    const plain = structuredClone(styled);
    Reflect.deleteProperty(plain.plan.pages[0]!.root, "styleRole");
    const plainControls = nativeControls(compileFixture(plain));
    const styledControls = nativeControls(compileFixture(styled));
    const outer = styledControls.find(control => control.id === "surface")!;
    expect(outer.geometry.height).toBe(plainControls.find(control => control.id === "surface")!.geometry.height + 38);
    styled.plan.roleStyles.find(role => role.role === "card-surface")!.declarations.paddingHorizontal = 24;
    styled.plan.roleStyles.find(role => role.role === "card-surface")!.declarations.paddingVertical = 8;
    const axes = nativeControls(compileFixture(styled));
    const first = axes.find(control => control.id === "surface-first")!;
    const parent = axes.find(control => control.id === "surface")!;
    expect(first.geometry.x - parent.geometry.x).toBe(25);
    expect(first.geometry.y - parent.geometry.y).toBe(10);
  });

  it("rejects a surface role that overrides compiler overflow", () => {
    const fixture = surfaceFixture();
    fixture.plan.roleStyles.find(role => role.role === "card-surface")!.declarations.overflow = "hidden";
    expect(() => compileFixture(fixture)).toThrow(/LAYOUT_SURFACE_OVERFLOW/);
  });

  it("quantizes decimal padding plus borders to the shared geometry precision", () => {
    const fixture = surfaceFixture();
    Object.assign(fixture.plan.roleStyles.find(role => role.role === "card-surface")!.declarations,
      { padding: 0.1, borderLeftWidth: 0.2, borderRightWidth: 0.2, borderTopWidth: 0.2, borderBottomWidth: 0.2 });
    const surface = nativeControls(compileFixture(fixture)).find(control => control.id === "surface")!;
    expect(surface.compiledLayout?.contentInsets).toEqual({ left: 0.3, right: 0.3, top: 0.3, bottom: 0.3 });
  });

  it("keeps nested card padding independent at each level", () => {
    const fixture = surfaceFixture();
    const root = fixture.plan.pages[0]!.root as LayoutNode;
    root.children = [{ ...layout("nested-surface", "overview", "column", root.children), styleRole: "card-surface" }];
    const controls = nativeControls(compileFixture(fixture));
    const outer = controls.find(control => control.id === "surface")!;
    const inner = controls.find(control => control.id === "nested-surface")!;
    const first = controls.find(control => control.id === "surface-first")!;
    expect(inner.geometry.x - outer.geometry.x).toBe(17);
    expect(first.geometry.x - inner.geometry.x).toBe(17);
    expect(inner.geometry.y - outer.geometry.y).toBe(18);
    expect(first.geometry.y - inner.geometry.y).toBe(18);
    expect(inner.geometry.x + inner.geometry.width).toBe(outer.geometry.x + outer.geometry.width - 19);
  });

  it("retains the bottom padding in a bounded scroll extent", () => {
    const fixture = surfaceFixture("scroll-region");
    fixture.plan.pages[0]!.root.intent.height = { mode: "fixed", value: 60 };
    const controls = nativeControls(compileFixture(fixture));
    const surface = controls.find(control => control.id === "surface")!;
    const children = controls.filter(control => control.parentId === surface.id);
    if (surface.compiledLayout?.kind !== "scroll-region") throw new Error("scroll fixture required");
    expect(surface.compiledLayout.scrollContentExtent.height).toBe(
      Math.max(...children.map(child => child.geometry.y + child.geometry.height)) - surface.geometry.y + 20,
    );
    expect(surface.compiledStyle?.cssFragments).toContainEqual(expect.objectContaining({
      declarations: expect.objectContaining({ overflow: "auto", padding: 16 }),
    }));
  });

  it("rejects border changes in container states before layout", () => {
    const fixture = surfaceFixture();
    fixture.plan.roleStyles.find(role => role.role === "card-surface")!.states.hover = { borderLeftWidth: 2 };
    expect(() => compileFixture(fixture)).toThrow(/LAYOUT_SURFACE_STATE_GEOMETRY/);
  });

  it("retains surface style and insets through signed native patch, validation, package and import", async () => {
    const fixture = surfaceFixture();
    const blueprint = CustomerSolutionBlueprintSchema.parse({
      schema: "kf-design-plan/v3", displayName: "容器样式验收", objective: "阅读能源状态", audiences: ["运维人员"], scenarios: ["阅读指标"],
      pages: [{ id: "bp-surface", title: "能源总览", purpose: "阅读状态", readingOrder: ["overview"], regions: [{ id: "overview", purpose: "能源状态",
        semanticRoles: ["content"], dataShape: "static", density: "comfortable", importance: "primary", content: ["能源总览", "设备在线"],
        sampleData: [], interactions: [], states: ["正常显示"], visualIntent: "白色卡片" }] }],
      journeys: [{ id: "read-surface", actor: "运维人员", goal: "阅读状态", steps: [{ kind: "observe", pageId: "bp-surface", regionId: "overview",
        action: "阅读能源总览", result: "看到能源总览", expectedTexts: ["能源总览"] }], completion: "已阅读状态" }],
      visualDirection: { tone: "清晰", colors: ["白色"], typography: "易读", spacingAndSurfaces: "卡片留白" },
      acceptanceScenarios: ["可以阅读能源状态"], openQuestions: [],
    });
    fixture.plan.blueprintHash = fixture.bundle.blueprintHash = canonicalServerHash(blueprint);
    fixture.plan.candidateBundleHash = canonicalServerHash(fixture.bundle);
    const correlated = attachRuntimeCorrelation({ workspaceId: "surface-workspace", baseRevisionId: "surface-base", implementation: compileFixture(fixture) });
    const interactions = compileInteractions({ blueprint, plan: fixture.plan, implementation: correlated });
    expect(interactions.diagnostics.errors).toEqual([]);
    expect(interactions.diagnostics.requests).toEqual([]);
    const facade = createHmacCreativeBuildFacade(Buffer.alloc(32, 0x51), createCreativeUIImplementationV2Compiler);
    const compiled = facade.compiler.compiler.compile({ workspaceId: "surface-workspace", baseRevisionId: "surface-base", blueprint,
      semanticPlan: fixture.plan, candidateBundle: fixture.bundle, implementation: interactions.implementation,
      compilerVersion: "1.0.0", evidenceVersion: "1.0.0" });
    const envelope = facade.authority.sign({ plan: compiled.plan, revisionId: "surface-base", semanticOperations: compiled.semanticOperations, creative: compiled.trustedCreativePayload });
    const hash = canonicalChangePlanHash(compiled.plan);
    const resolved = resolveStoredPlan(envelope, { expectedPlanHash: hash, expectedRevisionId: "surface-base" }, facade.authority);
    const base = await compileClientProject({ schema: "kf-client-project-ir/v1", id: "surface-base", name: "Surface", version: "1.0.0.1",
      pages: [{ id: "empty", name: "Page1", width: 1440, height: 900, controls: [] }], variables: [], scripts: [] }, { seed: "surface" });
    const pack = createKingClientDomainPack({ nativeAccepted: true });
    const candidate = await pack.patch({ baseWorkspace: base, changePlan: compiled.plan, expectedPlanHash: hash,
      semanticOperations: resolved.semanticOperations, creativeMaterialization: resolved.creativeMaterialization });
    const validation = await pack.validate({ baseWorkspace: base, candidateWorkspace: candidate, changePlan: compiled.plan,
      creativeMaterialization: resolved.creativeMaterialization });
    expect(validation.status, validation.warnings.join("\n")).toBe("pass");
    const imported = await importNativeClientPackage((await pack.package({ workspace: candidate })).bytes,
      await mkdtemp(path.join(tmpdir(), "kf-surface-import-")));
    const inspection = await inspectClientProject(imported);
    const serialized = JSON.stringify(inspection.raw.pages);
    expect(serialized).toContain('"isShowBorder":true');
    expect(serialized).toContain("border-style:solid");
    expect(serialized).toContain("padding:16px");
    expect(serialized).toContain("border-radius:10px");
    const artifact = structuredClone(correlated);
    const owner = nativeControls(artifact).find(control => control.id === "surface")!;
    owner.compiledLayout!.contentInsets!.left = 0;
    expect(() => validateSolutionControlSemanticProjection({ plan: fixture.plan, controls: nativeControls(artifact),
      root: fixture.plan.pages[0]!.root, moduleRegistry: createDefaultModuleRegistry() })).toThrow(/insets mismatch/);
  }, 30_000);
});
// end

function withRuntimeCorrelation(result: ReturnType<typeof compileFixture>) {
  const implementation = structuredClone(result);
  implementation.runtimeCorrelation = {
    controls: nativeControls(result).map((control, index) => ({
      semanticControlId: control.id,
      instanceName: `Control${index + 1}`,
    })),
    pages: result.pages.map((page, index) => ({
      semanticPageId: page.id,
      pageGuid: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    })),
  };
  return UIImplementationSpecV2Schema.parse(implementation);
}

function surfaceGroups(page: ReturnType<typeof compileFixture>["pages"][number]) {
  if (page.compatibility !== "native") return [];
  const children = new Map<string, typeof page.controls>();
  page.controls.forEach((control) => {
    if (control.parentId === undefined) return;
    const siblings = children.get(control.parentId) ?? [];
    siblings.push(control);
    children.set(control.parentId, siblings);
  });
  const overlayGroups = page.controls.filter((control) => control.overlayHost !== undefined).map((root) => {
    const controls = [root];
    const pending = [...(children.get(root.id) ?? [])];
    while (pending.length > 0) {
      const control = pending.pop()!;
      controls.push(control);
      pending.push(...(children.get(control.id) ?? []));
    }
    return { id: `${page.id}:overlay:${root.overlayHost!.overlayId}`, kind: "overlay" as const, root, controls };
  });
  const overlayIds = new Set(overlayGroups.flatMap((group) => group.controls.map((control) => control.id)));
  return [
    { id: `${page.id}:page`, kind: "page" as const, controls: page.controls.filter((control) => !overlayIds.has(control.id)) },
    ...overlayGroups,
  ];
}

function severePeerOverlaps(result: ReturnType<typeof compileFixture>): string[] {
  return result.pages.flatMap((page) => {
    if (page.compatibility !== "native") return [];
    return surfaceGroups(page).flatMap((surface) => {
      const findings: string[] = [];
      surface.controls.forEach((left, leftIndex) => surface.controls.slice(leftIndex + 1).forEach((right) => {
        if (left.parentId !== right.parentId) return;
        const overlapWidth = Math.max(0, Math.min(left.geometry.x + left.geometry.width, right.geometry.x + right.geometry.width) - Math.max(left.geometry.x, right.geometry.x));
        const overlapHeight = Math.max(0, Math.min(left.geometry.y + left.geometry.height, right.geometry.y + right.geometry.height) - Math.max(left.geometry.y, right.geometry.y));
        const smallerArea = Math.min(left.geometry.width * left.geometry.height, right.geometry.width * right.geometry.height);
        if (overlapWidth * overlapHeight > smallerArea * 0.5) findings.push(`${surface.id}:${left.id}/${right.id}`);
      }));
      return findings;
    });
  });
}

function excessiveUnusedVerticalSpace(result: ReturnType<typeof compileFixture>): string[] {
  return result.pages.flatMap((page) => {
    if (page.compatibility !== "native") return [];
    return surfaceGroups(page).flatMap((surface) => {
      if (surface.kind === "page") {
        const roots = surface.controls.filter((control) => control.parentId === undefined);
        const usedBottom = Math.max(...roots.map((control) => control.geometry.y + control.geometry.height));
        return page.height - usedBottom > page.height * 0.35 ? [surface.id] : [];
      }
      const contentRoots = surface.controls.filter((control) => control.parentId === surface.root.id);
      const usedBottom = Math.max(...contentRoots.map((control) => control.geometry.y + control.geometry.height));
      const rootBottom = surface.root.geometry.y + surface.root.geometry.height;
      return rootBottom - usedBottom > surface.root.geometry.height * 0.35 ? [surface.id] : [];
    });
  });
}

function outOfPageControls(result: ReturnType<typeof compileFixture>): string[] {
  return result.pages.flatMap((page) => {
    if (page.compatibility !== "native") return [];
    const byId = new Map(page.controls.map((control) => [control.id, control]));
    const hasScrollAncestor = (control: typeof page.controls[number]): boolean => {
      let parentId = control.parentId;
      while (parentId !== undefined) {
        const parent = byId.get(parentId);
        if (parent === undefined) return false;
        if (parent.compiledLayout?.kind === "scroll-region") return true;
        parentId = parent.parentId;
      }
      return false;
    };
    return surfaceGroups(page).flatMap((surface) => surface.controls.flatMap((control) => {
      if (hasScrollAncestor(control)) return [];
      const geometry = control.geometry;
      return geometry.x < 0 || geometry.y < 0
        || geometry.x + geometry.width > page.width
        || geometry.y + geometry.height > page.height
        ? [`${surface.id}:${control.id}`]
        : [];
    }));
  });
}

function errorFrom(run: () => void): SolutionCompileError {
  try {
    run();
    throw new Error("expected solution compilation to fail");
  } catch (error) {
    if (!(error instanceof SolutionCompileError)) throw error;
    expect(error).toBeInstanceOf(SolutionCompileError);
    return error;
  }
}

describe("compileSolutionImplementation", () => {
  it("keeps intrinsic and layout gaps consistent for an expanded repeater inside a scroll page", () => {
    const sourcePages = [{ pageId: "bp-skills", regions: ["skills"] }] as const;
    const fixture = planWithBundle("scroll-repeater-gaps", [{
      id: "skills-page", title: "技能", purpose: "浏览技能", canvas: "desktop",
      sourceBlueprintPageId: "bp-skills", sourceBlueprintRegionIds: ["skills"], initialStateIds: [],
      root: layout("skills-root", "skills", "scroll-region", [
        layout("skills-section", "skills", "column", [
          textNode("skills-heading", "skills", "核心技能"),
          repeaterNode("skills-list", "skills", "skills-data", "skill", textNode("skill-name", "skills", "技能"), 5),
        ]),
      ]),
    }], sourcePages, { mockData: [recordsDataSet("skills-data", 5)] });

    expect(() => compileFixture(fixture)).not.toThrow();
  });

  it("accepts exact compiler provenance for repeater expansions and registered-module components", () => {
    const admin = adminFixture();
    const adminImplementation = withRuntimeCorrelation(compileFixture(admin));
    for (const ownerControlId of ["people-filter", "people-list--e-001", "people-list--e-001--person-name"]) {
      expect(() => createSemanticScriptApiContext({
        plan: admin.plan,
        implementation: adminImplementation,
        ownerControlId,
      }), ownerControlId).not.toThrow();
    }

    const industrial = industrialFixture();
    const industrialImplementation = withRuntimeCorrelation(compileFixture(industrial));
    const moduleControl = nativeControls(industrialImplementation).find((control) => control.sourceModuleId === "kpi-grid")!;
    expect(() => createSemanticScriptApiContext({
      plan: industrial.plan,
      implementation: industrialImplementation,
      ownerControlId: moduleControl.id,
    })).not.toThrow();

    const nested = nestedRepeaterModuleFixture();
    const nestedImplementation = withRuntimeCorrelation(compileFixture(nested));
    const nestedControls = nativeControls(nestedImplementation);
    for (const ownerControlId of [
      "outer--r-0",
      "outer--r-0--outer-template",
      "outer--r-0--inner--r-0",
      nestedControls.find((control) => control.sourceModuleId === "outer--r-0--inner--r-0--nested-kpis")!.id,
    ]) {
      expect(() => createSemanticScriptApiContext({ plan: nested.plan, implementation: nestedImplementation, ownerControlId }), ownerControlId).not.toThrow();
    }

    const assetModule = assetModuleFixture();
    const assetImplementation = withRuntimeCorrelation(compileFixture(assetModule));
    const assetOwner = nativeControls(assetImplementation).find((control) => control.sourceModuleId === "asset-hero" && control.capabilityId === "image")!;
    expect(() => createSemanticScriptApiContext({ plan: assetModule.plan, implementation: assetImplementation, ownerControlId: assetOwner.id }))
      .not.toThrow();
  });

  it("rejects forged repeater and registered-module expansion provenance", () => {
    const fixture = adminFixture();
    const implementation = withRuntimeCorrelation(compileFixture(fixture));
    const reject = (mutate: (plan: SolutionImplementationPlan, implementation: ReturnType<typeof withRuntimeCorrelation>) => void) => {
      const plan = structuredClone(fixture.plan);
      const candidate = structuredClone(implementation);
      mutate(plan, candidate);
      expect(() => createSemanticScriptApiContext({ plan, implementation: candidate, ownerControlId: "people-filter" }))
        .toThrow("SCRIPT_API_CONTEXT_INVALID");
    };
    reject((plan, candidate) => {
      plan.mockData[0]!.records[0]!.values[0]!.value = "X-001";
      candidate.sourceSolutionPlanHash = canonicalServerHash(plan);
    });
    reject((_plan, candidate) => {
      nativeControls(candidate).find((control) => control.id === "people-list--e-001--person-name")!.sourceRepeaterId = "other";
    });
    reject((_plan, candidate) => {
      const control = nativeControls(candidate).find((entry) => entry.id === "people-list--e-001--person-name")!;
      control.parentId = "admin-main";
      control.depth = 2;
    });
    reject((_plan, candidate) => {
      nativeControls(candidate).find((control) => control.id === "people-list--e-001--person-name")!.sourceSolutionNodeId = "person-name";
    });
    reject((_plan, candidate) => {
      nativeControls(candidate).find((control) => control.id === "people-list--e-001--person-name")!.capabilityId = "button";
    });
    reject((_plan, candidate) => {
      nativeControls(candidate).find((control) => control.id === "people-list--e-001--person-name")!.dataBinding = { mockDataId: "people", records: [] };
    });
    reject((_plan, candidate) => {
      nativeControls(candidate).find((control) => control.id === "admin-root")!.dataBinding = { mockDataId: "people", records: [] };
    });
    reject((_plan, candidate) => {
      nativeControls(candidate).find((control) => control.id === "people-list--e-001")!.sourceBlueprintRegionIds = ["other-region"];
    });
    reject((_plan, candidate) => {
      nativeControls(candidate).find((control) => control.id === "people-list--e-001")!.capabilityId = "layout.evil";
    });
    reject((_plan, candidate) => {
      nativeControls(candidate).find((control) => control.id === "people-list--e-001")!.capabilityId = "layout.2";
    });

    const moduleFixture = industrialFixture();
    const moduleImplementation = withRuntimeCorrelation(compileFixture(moduleFixture));
    const moduleReject = (mutate: (implementation: ReturnType<typeof withRuntimeCorrelation>) => void) => {
      const candidate = structuredClone(moduleImplementation);
      mutate(candidate);
      const ownerControlId = nativeControls(candidate).find((control) => control.sourceModuleId === "kpi-grid")!.id;
      expect(() => createSemanticScriptApiContext({ plan: moduleFixture.plan, implementation: candidate, ownerControlId }))
        .toThrow("SCRIPT_API_CONTEXT_INVALID");
    };
    moduleReject((candidate) => {
      nativeControls(candidate).find((control) => control.sourceModuleId === "kpi-grid" && control.parentId?.startsWith("kpi-grid--") === true)!.parentId = "ops-root";
    });
    moduleReject((candidate) => {
      nativeControls(candidate).find((control) => control.sourceModuleId === "kpi-grid")!.capabilityId = "button";
    });
    moduleReject((candidate) => {
      nativeControls(candidate).find((control) => control.sourceModuleId === "kpi-grid")!.sourceSolutionNodeId = "ops-root";
    });
    moduleReject((candidate) => {
      nativeControls(candidate).find((control) => control.sourceModuleId === "kpi-grid")!.dataBinding = { mockDataId: "missing", records: [] };
    });
    moduleReject((candidate) => {
      nativeControls(candidate).find((control) => control.sourceModuleId === "kpi-grid")!.sourceBlueprintRegionIds = ["other-region"];
    });

    const cosmetic = structuredClone(moduleImplementation);
    const cosmeticOwner = nativeControls(cosmetic).find((control) => control.sourceModuleId === "kpi-grid" && control.capabilityId === "text")!;
    cosmeticOwner.nativeProperties = { text: "不会改变 semantic API resolution" };
    expect(() => createSemanticScriptApiContext({ plan: moduleFixture.plan, implementation: cosmetic, ownerControlId: cosmeticOwner.id }))
      .not.toThrow();
  });

  it("rejects semantic projection mutations directly across every compiled branch", () => {
    const admin = adminFixture();
    const adminImplementation = compileFixture(admin);
    const adminPage = adminImplementation.pages[0]!;
    if (adminPage.compatibility !== "native") throw new Error("native fixture required");
    const adminSurface = surfaceGroups(adminPage).find((surface) => surface.kind === "page")!.controls;
    const rejectAdmin = (mutate: (controls: typeof adminSurface) => void) => {
      const controls = structuredClone(adminSurface);
      mutate(controls);
      expect(() => validateSolutionControlSemanticProjection({
        plan: admin.plan,
        root: admin.plan.pages[0]!.root,
        controls,
        moduleRegistry: createDefaultModuleRegistry(),
      })).toThrow("SOLUTION_PROVENANCE_INVALID");
    };
    rejectAdmin((controls) => { controls.find((control) => control.id === "admin-root")!.dataBinding = { mockDataId: "people", records: [] }; });
    rejectAdmin((controls) => { controls.find((control) => control.id === "people-list--e-001")!.dataBinding = { mockDataId: "people", records: [] }; });
    rejectAdmin((controls) => { controls.find((control) => control.id === "people-list--e-001")!.assetIds = [MODEL_ASSET_ID]; });
    rejectAdmin((controls) => { controls.find((control) => control.id === "people-list--e-001")!.sourceBlueprintRegionIds = ["other-region"]; });
    rejectAdmin((controls) => { controls.find((control) => control.id === "people-list--e-001")!.capabilityId = "layout.evil"; });
    rejectAdmin((controls) => { controls.find((control) => control.id === "people-list--e-001")!.capabilityId = "layout.2"; });
    rejectAdmin((controls) => { controls.find((control) => control.id === "admin-root")!.sourceBlueprintPageId = "bp-other"; });

    const industrial = industrialFixture();
    const industrialImplementation = compileFixture(industrial);
    const industrialPage = industrialImplementation.pages[0]!;
    if (industrialPage.compatibility !== "native") throw new Error("native fixture required");
    const moduleControls = industrialPage.controls;
    const rejectModule = (mutate: (controls: typeof moduleControls) => void) => {
      const controls = structuredClone(moduleControls);
      mutate(controls);
      expect(() => validateSolutionControlSemanticProjection({
        plan: industrial.plan,
        root: industrial.plan.pages[0]!.root,
        controls,
        moduleRegistry: createDefaultModuleRegistry(),
      })).toThrow("SOLUTION_PROVENANCE_INVALID");
    };
    rejectModule((controls) => { controls.find((control) => control.sourceModuleId === "kpi-grid")!.dataBinding = { mockDataId: "missing", records: [] }; });
    rejectModule((controls) => { controls.find((control) => control.sourceModuleId === "kpi-grid")!.assetIds = [MODEL_ASSET_ID]; });
    rejectModule((controls) => { controls.find((control) => control.sourceModuleId === "kpi-grid")!.sourceBlueprintRegionIds = ["other-region"]; });
    rejectModule((controls) => { controls.find((control) => control.sourceModuleId === "kpi-grid")!.sourceBlueprintPageId = "bp-other"; });
  });

  it("rejects unknown and kind-incompatible layout capabilities in direct and context validation", () => {
    const fixture = planWithBundle("row-layout", [{
      id: "row-page", title: "横向布局", purpose: "验证布局能力与语义布局类型精确对应", canvas: "desktop",
      sourceBlueprintPageId: "bp-row", sourceBlueprintRegionIds: ["row"], initialStateIds: [],
      root: layout("row-root", "row", "row", [textNode("row-text", "row", "横向内容")]),
    }], [{ pageId: "bp-row", regions: ["row"] }]);
    const implementation = compileFixture(fixture);
    const page = implementation.pages[0]!;
    if (page.compatibility !== "native") throw new Error("native fixture required");

    const rejectDirect = (capabilityId: string) => {
      const controls = structuredClone(page.controls);
      controls.find((control) => control.id === "row-root")!.capabilityId = capabilityId;
      expect(() => validateSolutionControlSemanticProjection({
        plan: fixture.plan,
        root: fixture.plan.pages[0]!.root,
        controls,
        moduleRegistry: createDefaultModuleRegistry(),
      })).toThrow("SOLUTION_PROVENANCE_INVALID");
    };
    rejectDirect("layout.evil");
    rejectDirect("layout.4");

    const correlated = withRuntimeCorrelation(implementation);
    const rejectContext = (capabilityId: string) => {
      const candidate = structuredClone(correlated);
      nativeControls(candidate).find((control) => control.id === "row-root")!.capabilityId = capabilityId;
      expect(() => createSemanticScriptApiContext({
        plan: fixture.plan,
        implementation: candidate,
        ownerControlId: "row-text",
      })).toThrow("SCRIPT_API_CONTEXT_INVALID");
    };
    rejectContext("layout.evil");
    rejectContext("layout.4");
  });

  it("correlates semantic contexts only with the trusted default module registry", () => {
    const fixture = industrialFixture();
    const defaultRegistry = createDefaultModuleRegistry();
    const definition = defaultRegistry.require("metric.kpi-grid", "1.0.0");
    const customRegistry = new ModuleRegistry();
    customRegistry.register({ ...definition, compilerFingerprint: "custom-kpi-compiler-v1" });
    const implementation = compileSolutionImplementation({
      ...compileInput(fixture),
      moduleRegistry: customRegistry,
    });
    expect((implementation as unknown as { sourceModuleRegistryHash?: string }).sourceModuleRegistryHash).toMatch(/^[0-9a-f]{64}$/);
    const correlated = withRuntimeCorrelation(implementation);
    const ownerControlId = nativeControls(correlated).find((control) => control.sourceModuleId === "kpi-grid")!.id;
    expect(() => createSemanticScriptApiContext({ plan: fixture.plan, implementation: correlated, ownerControlId }))
      .toThrow(/module registry/i);

    const forgedRegistry = new ModuleRegistry();
    forgedRegistry.register({
      ...definition,
      compile: (input) => {
        const output = definition.compile(input);
        const first = output.components[0]!;
        return { ...output, components: [...output.components, { ...first, id: "forged-extra" }] };
      },
    });
    const forged = withRuntimeCorrelation(compileSolutionImplementation({
      ...compileInput(fixture),
      moduleRegistry: forgedRegistry,
    }));
    const forgedOwner = nativeControls(forged).find((control) => control.sourceModuleId === "kpi-grid")!.id;
    expect(() => createSemanticScriptApiContext({ plan: fixture.plan, implementation: forged, ownerControlId: forgedOwner }))
      .toThrow(/provenance|output count/i);
  });

  it("compiles three materially different deterministic solution compositions", () => {
    const portfolio = compileFixture(portfolioFixture());
    const industrial = compileFixture(industrialFixture());
    const admin = compileFixture(adminFixture());

    expect(UIImplementationSpecV2Schema.safeParse(portfolio).success).toBe(true);
    expect(portfolio.sourceSolutionPlanHash).toBe(canonicalServerHash(portfolioFixture().plan));
    expect(portfolio.schema).toBe("kf-ui-implementation/v2");
    expect(portfolio.compiledRoleStyles.body?.declarations.textColor).toBe("#f8fafc");
    expect(portfolio.pages).toHaveLength(2);
    expect(nativeControls(portfolio).some((control) => control.capabilityId === "image")).toBe(true);
    expect(nativeControls(portfolio).some((control) => control.capabilityId === "easyui.1")).toBe(false);

    expect(industrial.pages[0]!.width).toBe(1920);
    expect(nativeControls(industrial).some((control) => control.sourceModuleId === "kpi-grid")).toBe(true);
    expect(nativeControls(admin)
      .filter((control) => control.sourceRepeaterId === "people-list" && control.content !== undefined)
      .map((control) => control.content)).toEqual(["陈妍", "赵衡"]);

    const roots = [portfolio, industrial, admin].map((result) => nativeControls(result).filter((control) => control.depth === 0).map((control) => control.compiledLayout?.kind));
    expect(roots).toEqual([["column", "column"], ["dock"], ["sidebar-content", "overlay-anchor"]]);
    expect(nativeControls(admin).some((control) => control.overlayHost?.initiallyVisible === false)).toBe(true);
    for (const compiled of [portfolio, industrial, admin]) {
      expect(severePeerOverlaps(compiled)).toEqual([]);
      expect(excessiveUnusedVerticalSpace(compiled)).toEqual([]);
      expect(outOfPageControls(compiled)).toEqual([]);
    }
    expect([...portfolio.pages, ...industrial.pages, ...admin.pages].every((page) => page.height !== 900)).toBe(true);
    expect(canonicalServerHash(compileFixture(portfolioFixture()))).toBe(canonicalServerHash(portfolio));
    expect(Object.isFrozen(portfolio)).toBe(true);
    expect(Object.isFrozen(portfolio.pages)).toBe(true);
    expect(Object.isFrozen(nativeControls(portfolio)[0]!.nativeProperties)).toBe(true);
  });

  it("publishes only Task5-validated semantic style fragments", () => {
    const result = compileFixture(portfolioFixture());
    const controls = nativeControls(result);
    expect(controls.every((control) => control.compiledStyle !== undefined)).toBe(true);
    expect(controls.every((control) => !Object.hasOwn(control.nativeProperties, "styleDataNew"))).toBe(true);
    expect(JSON.stringify(result)).not.toContain("kf36-");
    expect(JSON.stringify(result)).not.toContain("#domId");

    const admin = compileFixture(adminFixture());
    const scroll = nativeControls(admin).find((control) => control.compiledLayout?.kind === "scroll-region")!;
    expect(scroll.compiledStyle?.cssFragments).toContainEqual({
      selectorToken: "root",
      state: "normal",
      declarations: { overflow: "auto" },
    });
  });

  it("keeps executable CSS witnesses out of the public v2 style program", () => {
    const result = compileFixture(portfolioFixture());
    for (const control of nativeControls(result)) {
      expect(control.compiledStyle).toBeDefined();
      expect(Object.hasOwn(control.compiledStyle!, "styleDataNew")).toBe(false);
      for (const fragment of control.compiledStyle!.cssFragments) {
        expect(Object.hasOwn(fragment, "persistedSelector")).toBe(false);
        expect(Object.hasOwn(fragment, "persistedDeclarations")).toBe(false);
      }
    }
  });

  it("keeps v2 action and script slots structurally empty", () => {
    const result = compileFixture(adminFixture());
    expect(result.compiledActions).toEqual([]);
    expect(result.compiledScripts).toEqual([]);
    expect(nativeControls(result).every((control) => control.eventBindings.length === 0)).toBe(true);
  });

  it("compiles the reserved legacy adapter branch without candidate evidence", () => {
    const legacy = createPortalPlan();
    legacy.assets = [];
    legacy.pages[0]!.modules = [structuredClone(legacy.pages[0]!.modules[1]!)];
    const adapted = adaptLegacyModulePlan(legacy);
    const result = compileSolutionImplementation({
      plan: adapted,
      moduleRegistry: createDefaultModuleRegistry(),
      approvedAssets: [],
      activeCatalogVersion: CATALOG_VERSION,
    });

    expect(result.compatibility).toBe("native");
    expect(nativeControls(result).some((control) => control.sourceModuleId === "portal-kpis")).toBe(true);
    expect(result.compiledActions).toEqual([]);
  });

  it("preserves the mature legacy data.table chain when it carries no style intent", () => {
    const legacy = createPortalPlan();
    legacy.assets = [];
    legacy.pages[0]!.mode = "vertical-flow";
    legacy.pages[0]!.modules = [{
      id: "admin-table",
      kind: "data.table",
      templateVersion: "1.0.0",
      variant: "default",
      title: "设备台账",
      content: JSON.stringify({
        table: {
          columns: [{ key: "name", label: "设备" }, { key: "temperature", label: "温度", align: "right" }],
          rows: [{ name: "泵 A", temperature: 42 }],
        },
      }),
      sourceBlueprintModuleIds: ["admin-table"],
      placement: {
        region: "main",
        order: 0,
        columnSpan: 12,
        preferredHeight: "small",
        alignment: "stretch",
        emphasis: "primary",
      },
      interactions: [],
    }];

    const result = compileSolutionImplementation({
      plan: adaptLegacyModulePlan(legacy),
      moduleRegistry: createDefaultModuleRegistry(),
      approvedAssets: [],
      activeCatalogVersion: CATALOG_VERSION,
    });
    const datagrid = nativeControls(result).find((control) => control.id === "admin-table--datagrid");

    expect(datagrid).toMatchObject({
      sourceModuleId: "admin-table",
      capabilityId: "easyui.1",
      compiledStyle: {
        nativeFields: {},
        cssFragments: [],
        warnings: [{ code: "STYLE_CAPABILITY_PRESERVE_ONLY" }],
      },
    });
  });

  it("derives page height from measured content instead of a fixed canvas", () => {
    const shortFixture = portfolioFixture();
    const longFixture = portfolioFixture();
    const aboutRoot = longFixture.plan.pages[1]!.root;
    if (aboutRoot.kind !== "layout" || aboutRoot.children[1]?.kind !== "control") throw new Error("fixture drift");
    aboutRoot.children[1].content = "复杂需求需要跨研究、架构、交互和工程验证形成闭环。".repeat(35);
    const shortPage = compileFixture(shortFixture).pages[1]!;
    const longPage = compileFixture(longFixture).pages[1]!;
    expect(longPage.height).toBeGreaterThan(shortPage.height);
  });

  it("uses the resolved root padding and letter spacing for both measurement and compiled style", () => {
    const fixtureFor = (declarations: { padding?: number; letterSpacing?: number }) => {
      const fixture = portfolioFixture();
      const aboutRoot = fixture.plan.pages[1]!.root;
      if (aboutRoot.kind !== "layout" || aboutRoot.children[0]?.kind !== "control") throw new Error("fixture drift");
      aboutRoot.children[0].intent.width = { mode: "content" };
      aboutRoot.children[0].intent.align = "start";
      const body = fixture.plan.roleStyles.find((style) => style.role === "body")!;
      body.declarations = { ...body.declarations, ...declarations };
      return compileFixture(fixture);
    };
    const baseline = nativeControls(fixtureFor({})).find((control) => control.id === "about-title")!;
    const padded = nativeControls(fixtureFor({ padding: 10 })).find((control) => control.id === "about-title")!;
    const spaced = nativeControls(fixtureFor({ padding: 10, letterSpacing: 4 })).find((control) => control.id === "about-title")!;

    expect(padded.geometry.height).toBeGreaterThan(baseline.geometry.height);
    expect(spaced.geometry.width).toBeGreaterThan(padded.geometry.width);
    expect(spaced.compiledStyle?.cssFragments).toContainEqual({
      selectorToken: "root",
      state: "normal",
      declarations: expect.objectContaining({ padding: 10, letterSpacing: 4 }),
    });
  });

  it("rejects a tall overlay instead of raising its host page height", () => {
    const fixture = adminFixture();
    const overlay = fixture.plan.overlays[0]!;
    if (overlay.root.kind !== "layout" || overlay.root.children[0]?.kind !== "layout") throw new Error("fixture drift");
    overlay.root.children[0].children.push(...Array.from({ length: 20 }, (_entry, index) =>
      textNode(`tall-overlay-row-${index}`, "workspace", `详情 ${index}`, index + 2)));

    const error = errorFrom(() => compileFixture(fixture));

    expect(error).toMatchObject({
      phase: "layout",
      nodeId: "employee-overlay",
      reasonCode: "OVERLAY_EXCEEDS_HOST_VIEWPORT",
    });
  });

  it("rejects stale, missing, mismatched, or wrong-catalog candidate evidence deterministically", () => {
    const fixture = portfolioFixture();
    const missing = errorFrom(() => compileSolutionImplementation({
      plan: fixture.plan, moduleRegistry: createDefaultModuleRegistry(), approvedAssets: [approvedAsset], activeCatalogVersion: CATALOG_VERSION,
    }));
    expect(missing).toMatchObject({ code: "SOLUTION_COMPILE_FAILED", phase: "candidate-validation" });

    const staleBundle = structuredClone(fixture.bundle);
    staleBundle.regions[0]!.controls = staleBundle.regions[0]!.controls.filter((entry) => entry.id !== "image");
    const mismatch = errorFrom(() => compileSolutionImplementation({
      plan: fixture.plan, candidateBundle: staleBundle, moduleRegistry: createDefaultModuleRegistry(), approvedAssets: [approvedAsset], activeCatalogVersion: CATALOG_VERSION,
    }));
    expect(mismatch.phase).toBe("candidate-validation");

    const catalog = errorFrom(() => compileSolutionImplementation({
      plan: fixture.plan, candidateBundle: fixture.bundle, moduleRegistry: createDefaultModuleRegistry(), approvedAssets: [approvedAsset], activeCatalogVersion: "2.0.0",
    }));
    expect(catalog).toMatchObject({ phase: "candidate-validation", nodeId: "$", code: "SOLUTION_COMPILE_FAILED" });
    expect(catalog.alternatives.length).toBeLessThanOrEqual(5);
  });

  it("rejects malformed discriminators and candidate bundles on the reserved legacy branch", () => {
    const fixture = portfolioFixture();
    const malformed = structuredClone(fixture.plan);
    Object.assign(malformed, { candidateBundleHash: "3e147b2b8351b526f10dd9dfc47c4c93bbfc29814d791400e3e5b02c38220840", roleStyles: fixture.plan.roleStyles });
    const invalid = errorFrom(() => compileSolutionImplementation({
      plan: malformed, moduleRegistry: createDefaultModuleRegistry(), approvedAssets: [], activeCatalogVersion: CATALOG_VERSION,
    }));
    expect(invalid.phase).toBe("parse");

    const legacyBundle = errorFrom(() => compileSolutionImplementation({
      plan: malformed, candidateBundle: fixture.bundle, moduleRegistry: createDefaultModuleRegistry(), approvedAssets: [], activeCatalogVersion: CATALOG_VERSION,
    }));
    expect(legacyBundle.phase).toBe("parse");
  });

  it("fails closed for preserve-only and unknown control capabilities", () => {
    const compileChangedCapability = (capabilityId: string) => {
      const fixture = portfolioFixture();
      const pageRoot = fixture.plan.pages[0]!.root;
      if (pageRoot.kind !== "layout" || pageRoot.children[0]?.kind !== "layout"
        || pageRoot.children[0].children[1]?.kind !== "layout"
        || pageRoot.children[0].children[1].children[0]?.kind !== "control") throw new Error("fixture drift");
      const target = pageRoot.children[0].children[1].children[0];
      target.capabilityId = capabilityId;
      target.content = null;
      const region = fixture.bundle.regions.find((entry) => entry.pageId === "bp-home" && entry.regionId === "hero")!;
      region.controls.push({
        id: capabilityId, score: 90, reasons: ["adversarial candidate"], limitations: [], knowledgeVersion: CATALOG_VERSION,
      });
      fixture.bundle.detailedCapabilityIds = [...fixture.bundle.detailedCapabilityIds, capabilityId].sort();
      fixture.plan.candidateBundleHash = canonicalServerHash(fixture.bundle);
      return errorFrom(() => compileFixture(fixture));
    };

    expect(compileChangedCapability("easyui.1")).toMatchObject({ phase: "style" });
    expect(compileChangedCapability("mystery-control")).toMatchObject({ phase: "measurement", nodeId: "hero-title" });
  });

  it("rejects module child-scope escape before layout and freezes trusted layout/style metadata", () => {
    const escaped = industrialFixture();
    const root = escaped.plan.pages[0]!.root;
    if (root.kind !== "layout" || root.children[2]?.kind !== "registered-module") throw new Error("fixture drift");
    root.children[2].slots = [{ slotId: "forged-child", children: [textNode("escaped-child", "overview", "越权内容")] }];
    const error = errorFrom(() => compileFixture(escaped));
    expect(error.phase).toBe("candidate-validation");

    const compiled = compileFixture(adminFixture());
    const layoutControl = nativeControls(compiled).find((control) => control.compiledLayout !== undefined)!;
    expect(() => Object.assign(layoutControl.compiledLayout!, { kind: "row" })).toThrow();
    expect(() => Object.assign(layoutControl.compiledStyle!, { warnings: [] })).toThrow();
  });

  it("reports stable structured errors instead of dependency exceptions", () => {
    const fixture = adminFixture();
    const escaped = structuredClone(fixture.plan);
    const page = escaped.pages[0]!;
    if (page.root.kind !== "layout" || page.root.children[1]?.kind !== "layout") throw new Error("fixture drift");
    const repeater = page.root.children[1].children[2];
    if (repeater?.kind !== "repeater" || repeater.template.kind !== "control") throw new Error("fixture drift");
    repeater.template.content = { kind: "repeater-field", itemAlias: "other", field: "name" };

    const first = errorFrom(() => compileSolutionImplementation({
      plan: escaped, candidateBundle: fixture.bundle, moduleRegistry: createDefaultModuleRegistry(), approvedAssets: [approvedAsset], activeCatalogVersion: CATALOG_VERSION,
    }));
    const second = errorFrom(() => compileSolutionImplementation({
      plan: escaped, candidateBundle: fixture.bundle, moduleRegistry: createDefaultModuleRegistry(), approvedAssets: [approvedAsset], activeCatalogVersion: CATALOG_VERSION,
    }));
    expect(first).toMatchObject({ code: "SOLUTION_COMPILE_FAILED", phase: "parse" });
    expect({ phase: first.phase, nodeId: first.nodeId, message: first.message, alternatives: first.alternatives })
      .toEqual({ phase: second.phase, nodeId: second.nodeId, message: second.message, alternatives: second.alternatives });
  });

  it("rejects saturated 100^n repeater fanout before allocating the expanded tree", () => {
    const error = errorFrom(() => compileFixture(nestedExpansionBombFixture()));
    expect(error).toMatchObject({
      code: "SOLUTION_COMPILE_FAILED",
      phase: "expansion",
      reasonCode: "EXPANSION_BUDGET_EXCEEDED",
    });
  });

  it("shares one expansion budget across pages and overlays", () => {
    const error = errorFrom(() => compileFixture(cumulativeExpansionFixture()));
    expect(error).toMatchObject({ phase: "expansion", reasonCode: "EXPANSION_BUDGET_EXCEEDED" });
  });

  it("accepts the exact global expansion boundary and rejects the next node", () => {
    expect(nativeControls(compileFixture(exactExpansionBudgetFixture(49)))).toHaveLength(500);
    const error = errorFrom(() => compileFixture(exactExpansionBudgetFixture(50)));
    expect(error).toMatchObject({ phase: "expansion", reasonCode: "EXPANSION_BUDGET_EXCEEDED" });
  });

  it("rejects cyclic and excessively deep raw plans before recursive schema parsing", () => {
    const cyclicFixture = portfolioFixture();
    const cyclicRoot = cyclicFixture.plan.pages[0]!.root;
    if (cyclicRoot.kind !== "layout") throw new Error("fixture drift");
    cyclicRoot.children.push(cyclicRoot);
    const cyclic = errorFrom(() => compileSolutionImplementation(compileInput(cyclicFixture)));
    expect(cyclic).toMatchObject({ phase: "parse", reasonCode: "INPUT_CYCLE" });

    const deepFixture = portfolioFixture();
    const deepRoot = deepFixture.plan.pages[0]!.root;
    if (deepRoot.kind !== "layout" || deepRoot.children[0]?.kind !== "layout"
      || deepRoot.children[0].children[1]?.kind !== "layout"
      || deepRoot.children[0].children[1].children[0]?.kind !== "control") throw new Error("fixture drift");
    let deepValue: object = { terminal: null };
    for (let depth = 0; depth < 100; depth += 1) deepValue = { nested: deepValue };
    Object.defineProperty(deepRoot.children[0].children[1].children[0], "content", {
      configurable: true,
      enumerable: true,
      value: deepValue,
    });
    const deep = errorFrom(() => compileSolutionImplementation(compileInput(deepFixture)));
    expect(deep).toMatchObject({ phase: "parse", reasonCode: "INPUT_DEPTH_EXCEEDED" });
  });

  it("contains accessors and hostile proxy traps at the public structured boundary", () => {
    const fixture = portfolioFixture();
    const accessorInput: SolutionCompileInput = {
      get plan(): SolutionImplementationPlan {
        throw new RangeError("accessor executed");
      },
      candidateBundle: fixture.bundle,
      moduleRegistry: createDefaultModuleRegistry(),
      approvedAssets: [approvedAsset],
      activeCatalogVersion: CATALOG_VERSION,
    };
    const accessor = errorFrom(() => compileSolutionImplementation(accessorInput));
    expect(accessor).toMatchObject({ phase: "parse", reasonCode: "INPUT_ACCESSOR_FORBIDDEN" });

    const proxyInput = compileInput(fixture);
    const hostilePlan = new Proxy(proxyInput.plan, {
      ownKeys() {
        throw new TypeError("proxy trap executed");
      },
    });
    const proxy = errorFrom(() => compileSolutionImplementation({ ...proxyInput, plan: hostilePlan }));
    expect(proxy).toMatchObject({ phase: "parse", reasonCode: "INPUT_INSPECTION_FAILED" });

    const nonPlainFixture = portfolioFixture();
    Object.defineProperty(nonPlainFixture.plan, "theme", {
      configurable: true,
      enumerable: true,
      value: new Map<string, string>(),
    });
    const nonPlain = errorFrom(() => compileSolutionImplementation(compileInput(nonPlainFixture)));
    expect(nonPlain).toMatchObject({ phase: "parse", reasonCode: "INPUT_NON_PLAIN_DATA" });

    const functionFixture = portfolioFixture();
    Object.defineProperty(functionFixture.plan, "theme", {
      configurable: true,
      enumerable: true,
      value: () => "not structured data",
    });
    const functionValue = errorFrom(() => compileSolutionImplementation(compileInput(functionFixture)));
    expect(functionValue).toMatchObject({ phase: "parse", reasonCode: "INPUT_NON_PLAIN_DATA" });

    const sparseFixture = portfolioFixture();
    const sparseAssets: typeof approvedAsset[] = [];
    sparseAssets.length = 1_000_000;
    const sparse = errorFrom(() => compileSolutionImplementation({
      ...compileInput(sparseFixture),
      approvedAssets: sparseAssets,
    }));
    expect(sparse).toMatchObject({ phase: "parse", reasonCode: "INPUT_SIZE_EXCEEDED" });
  });

  it("deduplicates one shared native/style asset and rejects two component-wide assets", () => {
    const sharedFixture = portfolioFixture();
    const sharedRoot = sharedFixture.plan.pages[0]!.root;
    if (sharedRoot.kind !== "layout" || sharedRoot.children[0]?.kind !== "layout"
      || sharedRoot.children[0].children[0]?.kind !== "control") throw new Error("fixture drift");
    sharedRoot.children[0].children[0].styleOverride = {
      declarations: { advanced: [{ kind: "background-image", assetId: MODEL_ASSET_ID }] },
      states: {},
    };
    const shared = compileFixture(sharedFixture);
    const sharedImage = nativeControls(shared).find((control) => control.id === "hero-image")!;
    expect(sharedImage.assetIds).toEqual([MODEL_ASSET_ID]);

    const twoAssetFixture = portfolioFixture();
    const twoAssetRoot = twoAssetFixture.plan.pages[0]!.root;
    if (twoAssetRoot.kind !== "layout" || twoAssetRoot.children[0]?.kind !== "layout"
      || twoAssetRoot.children[0].children[0]?.kind !== "control") throw new Error("fixture drift");
    twoAssetRoot.children[0].children[0].styleOverride = {
      declarations: { advanced: [{ kind: "background-image", assetId: SECOND_MODEL_ASSET_ID }] },
      states: {},
    };
    const error = errorFrom(() => compileSolutionImplementation({
      ...compileInput(twoAssetFixture),
      approvedAssets: [approvedAsset, secondApprovedAsset],
    }));
    expect(error).toMatchObject({ phase: "style", reasonCode: "COMPONENT_ASSET_BUDGET_EXCEEDED" });
  });
});
