// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import { describe, expect, it } from "vitest";
import { canonicalServerHash, CustomerSolutionBlueprintSchema, SolutionImplementationPlanSchema, type UIImplementationControlV2 } from "@kf/contracts";
import { getDesignKnowledgeSnapshot } from "../design-knowledge/design-knowledge-catalog.js";
import { retrieveCapabilities } from "../planning/capability-retrieval.js";
import { createDefaultModuleRegistry } from "../modules/module-registry.js";
import { compileSolutionImplementationWithProvenance, readSemanticCompilationProvenance } from "../solution-compile/solution-compiler.js";
import { compileInteractions } from "./interaction-compiler.js";

function fixture() {
  const blueprint = CustomerSolutionBlueprintSchema.parse({ schema: "kf-design-plan/v3", displayName: "设备概况", objective: "阅读演示设备", audiences: ["操作员"], scenarios: ["设备概况"],
    pages: [{ id: "bp-overview", title: "设备总览", purpose: "阅读设备", readingOrder: ["devices"], regions: [{ id: "devices", purpose: "展示设备名称", semanticRoles: ["text", "status-summary"], dataShape: "summary", density: "comfortable", importance: "primary", content: ["设备A", "设备B"], sampleData: [], interactions: [], states: ["初始"], visualIntent: "清晰" }] }],
    journeys: [{ id: "read-devices", actor: "操作员", goal: "阅读设备", steps: [{ kind: "observe", pageId: "bp-overview", regionId: "devices", action: "阅读设备名称", result: "看到设备A和设备B", expectedTexts: ["设备A", "设备B"] }], completion: "名称可见" }],
    visualDirection: { tone: "清晰", colors: ["蓝色"], typography: "清晰", spacingAndSurfaces: "舒适" }, acceptanceScenarios: ["设备名称正确"], openQuestions: [] });
  const bundle = retrieveCapabilities({ blueprint, knowledge: getDesignKnowledgeSnapshot() });
  const intent = { importance: "primary", visualWeight: 1, readingOrder: 0, density: "comfortable", groupWith: [], width: { mode: "fill" }, height: { mode: "content" }, align: "start" };
  const plan = SolutionImplementationPlanSchema.parse({ schema: "kf-solution-implementation/v1", projectKey: "devices", blueprintHash: canonicalServerHash(blueprint), candidateBundleHash: canonicalServerHash(bundle),
    theme: { background: "#f4f7fb", surface: "#ffffff", primary: "#163a5f", accent: "#e47b32", textPrimary: "#14212b", textSecondary: "#52616d", fontFamily: "Inter", spacingUnit: 8, radiusScale: { small: 4, medium: 8, large: 16 } },
    roleStyles: [{ role: "content", declarations: {}, states: {} }], localState: [], actions: [], scripts: [], overlays: [],
    mockData: [{ id: "device-records", purpose: "演示设备", fields: [{ key: "id", label: "标识", type: "text" }, { key: "name", label: "设备", type: "text" }], records: ["A", "B"].map((name) => ({ values: [{ field: "id", value: name }, { field: "name", value: `设备${name}` }] })) }],
    pages: [{ id: "overview", title: "总览", purpose: "阅读设备", canvas: "desktop", sourceBlueprintPageId: "bp-overview", sourceBlueprintRegionIds: ["devices"], initialStateIds: [],
      root: { id: "page-root", kind: "layout", layout: "column", sourceBlueprintRegionIds: ["devices"], intent: { ...intent, height: { mode: "viewport" } },
        children: [{ id: "device-list", kind: "repeater", mockDataId: "device-records", itemAlias: "device", keyField: "id", maxItems: 2, sourceBlueprintRegionIds: ["devices"], intent,
          template: { id: "device-name", kind: "control", capabilityId: "text", content: { kind: "repeater-field", itemAlias: "device", field: "name" }, properties: [], tabIds: [], styleRole: "content", eventBindings: [], sourceBlueprintRegionIds: ["devices"], intent } }] } }],
  });
  const compiled = compileSolutionImplementationWithProvenance({ plan, candidateBundle: bundle, moduleRegistry: createDefaultModuleRegistry(), approvedAssets: [], activeCatalogVersion: bundle.knowledgeCatalogVersion });
  const implementation = structuredClone(compiled.implementation);
  // Unit-only runtime names; public browser acceptance separately exercises workspace-derived identities.
  implementation.runtimeCorrelation = { controls: implementation.pages.flatMap((page) => page.compatibility === "native" ? page.controls : []).map((control, index) => ({ semanticControlId: control.id, instanceName: `Control${index + 1}` })),
    pages: [{ semanticPageId: "overview", pageGuid: "k00000000-0000-4000-8000-000000000001" }] };
  return { blueprint, plan, compiled, implementation };
}
function compileFixture({ blueprint, plan, implementation }: ReturnType<typeof fixture>) {
  return compileInteractions({ blueprint, plan, implementation });
}

describe("bounded repeater observation through the real native compiler", () => {
  it("proves actual per-record native text using the original compiled provenance", () => {
    const input = fixture();
    expect(readSemanticCompilationProvenance(input.compiled.provenance, input.plan).filter((entry) => entry.nodeId === "device-name").map((entry) => entry.componentId))
      .toEqual(["device-list--a--device-name", "device-list--b--device-name"]);
    const result = compileFixture(input);
    expect(result.diagnostics.errors).toEqual([]);
    expect(result.implementation.compiledActions).toEqual([]);
  });
  it.each(["text", "record", "instance", "repeater", "hidden", "parent-hidden", "offscreen"])("rejects corrupted actual repeated output: %s", (failure) => {
    const input = fixture();
    const page = input.implementation.pages[0]!;
    if (page.compatibility !== "native") throw new Error("native page required");
    const leaf: UIImplementationControlV2 = page.controls.find((control) => control.id === "device-list--a--device-name")!;
    const parent = page.controls.find((control) => control.id === leaf.parentId)!;
    if (failure === "text") leaf.nativeProperties["text"] = "错误名称";
    if (failure === "record") { leaf.content = "设备B"; leaf.nativeProperties["text"] = "设备B"; }
    if (failure === "instance") leaf.sourceSolutionNodeId = "device-list--b--device-name";
    if (failure === "repeater") leaf.sourceRepeaterId = "other-repeater";
    if (failure === "hidden") leaf.nativeProperties["runVisible"] = false;
    if (failure === "parent-hidden") parent.style = { declarations: { opacity: 0 }, states: {} };
    if (failure === "offscreen") leaf.geometry.y = page.height + 1;
    if (failure === "offscreen") expect(() => compileFixture(input)).toThrow("geometry exceeds");
    else expect(compileFixture(input).diagnostics.errors.some((error) => error.code === "JOURNEY_OBSERVATION_UNPROVEN")).toBe(true);
  });
});
// end
