// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import { describe, expect, it } from "vitest";
import { SolutionImplementationPlanSchema, type RepeaterNode, type NodeIntent } from "./solution-implementation-plan.js";
import { projectSolutionNodes, projectedObservationText } from "./solution-node-projection.js";
import { validateObservationJourneys } from "./observation-journeys.js";
import type { CustomerSolutionBlueprint } from "./solution-blueprint.js";

const intent: NodeIntent = { importance: "primary", visualWeight: 1, readingOrder: 0, density: "comfortable", groupWith: [], width: { mode: "fill" }, height: { mode: "fixed", value: 40 }, align: "start" };
function fixture() {
  const plan = SolutionImplementationPlanSchema.parse({ schema: "kf-solution-implementation/v1", projectKey: "observation",
    blueprintHash: "a".repeat(64), candidateBundleHash: "b".repeat(64),
    theme: { background: "#fff", surface: "#fff", primary: "#123456", accent: "#654321", textPrimary: "#111", textSecondary: "#555", fontFamily: "Inter", spacingUnit: 8, radiusScale: { small: 4, medium: 8, large: 16 } },
    roleStyles: [{ role: "content", declarations: {}, states: {} }], localState: [], overlays: [], actions: [], scripts: [],
    mockData: [{ id: "metrics", purpose: "演示指标", fields: [{ key: "id", label: "标识", type: "text" }, { key: "label", label: "指标", type: "text" }],
      records: [{ values: [{ field: "id", value: "metric-01" }, { field: "label", value: "今日用电量" }] }, { values: [{ field: "id", value: "metric-02" }, { field: "label", value: "当前总功率" }] }] }],
    pages: [{ id: "overview", title: "总览", purpose: "阅读指标", canvas: "desktop", sourceBlueprintPageId: "bp-overview", sourceBlueprintRegionIds: ["metrics-region"], initialStateIds: [],
      root: { id: "metric-list", kind: "repeater", mockDataId: "metrics", itemAlias: "metric", keyField: "id", maxItems: 2,
        sourceBlueprintRegionIds: ["metrics-region"], intent, template: { id: "metric-label", kind: "control", capabilityId: "text", content: { kind: "repeater-field", itemAlias: "metric", field: "label" },
          properties: [], tabIds: [], styleRole: "content", eventBindings: [], sourceBlueprintRegionIds: ["metrics-region"], intent } } }],
  });
  const blueprint: CustomerSolutionBlueprint = { schema: "kf-design-plan/v3", displayName: "演示概览", objective: "阅读演示指标", audiences: ["操作员"], scenarios: ["阅读指标"],
    pages: [{ id: "bp-overview", title: "总览", purpose: "阅读指标", readingOrder: ["metrics-region"], regions: [{ id: "metrics-region", purpose: "指标概况", semanticRoles: ["指标"], dataShape: "summary", density: "comfortable", importance: "primary", content: ["指标名称"], sampleData: [], interactions: [], states: ["初始"], visualIntent: "清晰" }] }],
    journeys: [{ id: "read-metrics", actor: "操作员", goal: "阅读演示指标", steps: [{ kind: "observe", pageId: "bp-overview", regionId: "metrics-region", action: "阅读指标名称", result: "看到指标名称", expectedTexts: ["今日用电量", "当前总功率"] }], completion: "指标可见" }],
    visualDirection: { tone: "清晰", colors: ["蓝色"], typography: "清晰", spacingAndSurfaces: "舒适" }, acceptanceScenarios: ["指标名称正确"], openQuestions: [] };
  return { plan, blueprint, root: plan.pages[0]!.root as RepeaterNode };
}

describe("shared bounded solution node projection", () => {
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  it("requires a whole static control observation and never treats its text fragments as exact witnesses", () => {
    const { plan, blueprint, root } = fixture();
    if (root.template.kind !== "control") throw new Error("text template required");
    plan.pages[0]!.root = { ...root.template, id: "device-label", content: "设备甲 待机" };
    const step = blueprint.journeys[0]!.steps[0]!;
    if (step.kind !== "observe") throw new Error("observation required");
    step.expectedTexts = ["设备甲", "待机"];
    const originalPlan = structuredClone(plan);
    expect(validateObservationJourneys(blueprint, plan).map(issue => issue.expectedText)).toEqual(["设备甲", "待机"]);
    const newUnapprovedBlueprint = structuredClone(blueprint);
    const revisedStep = newUnapprovedBlueprint.journeys[0]!.steps[0]!;
    if (revisedStep.kind !== "observe") throw new Error("observation required");
    revisedStep.expectedTexts = ["设备甲 待机"];
    expect(validateObservationJourneys(newUnapprovedBlueprint, plan)).toEqual([]);
    expect(plan).toEqual(originalPlan);
    expect(step.expectedTexts).toEqual(["设备甲", "待机"]);
  });
  // end
  it("reuses stable expanded ids, parents and scoped records", () => {
    const { plan, root } = fixture();
    const result = projectSolutionNodes(plan, root);
    const item = result.get("metric-list--metric-01--metric-label")!;
    expect(item).toMatchObject({ parentId: "metric-list--metric-01", sourceRepeaterId: "metric-list", kind: "control" });
    expect(projectedObservationText(root.template.kind === "control" ? root.template.content : null, item)).toBe("今日用电量");
    expect(result.size).toBe(4);
  });
  it("proves only values actually rendered through a bounded template", () => {
    const { plan, blueprint } = fixture();
    expect(validateObservationJourneys(blueprint, plan)).toEqual([]);
  });
  it("preserves nested alias scopes without borrowing values from another row", () => {
    const { plan, root } = fixture();
    const leaf = root.template;
    if (leaf.kind !== "control") throw new Error("text template required");
    root.template = { ...root, id: "nested", itemAlias: "inner", template: { kind: "layout", id: "pair", layout: "column", intent,
      sourceBlueprintRegionIds: ["metrics-region"], children: [{ ...leaf, id: "outer-label" }, { ...leaf, id: "inner-label", content: { kind: "repeater-field", itemAlias: "inner", field: "label" } }] } };
    const projected = projectSolutionNodes(plan, root);
    const outer = projected.get("metric-list--metric-01--nested--metric-02--outer-label")!;
    const inner = projected.get("metric-list--metric-01--nested--metric-02--inner-label")!;
    expect(outer.parentId).toBe("metric-list--metric-01--nested--metric-02--pair");
    expect(projectedObservationText(leaf.content, outer)).toBe("今日用电量");
    expect(projectedObservationText({ kind: "repeater-field", itemAlias: "inner", field: "label" }, inner)).toBe("当前总功率");
  });
  it("bounds nested instance growth at 5000 entries", () => {
    const { plan, root } = fixture();
    plan.mockData[0]!.records = Array.from({ length: 100 }, (_, index) => ({ values: [{ field: "id", value: `metric-${index}` }, { field: "label", value: "演示指标" }] }));
    root.maxItems = 100;
    root.template = { ...root, id: "nested", itemAlias: "inner", template: root.template };
    expect(() => projectSolutionNodes(plan, root)).toThrow("expanded node limit exceeded");
  });
  it("rejects collisions between an expanded instance and a distinct literal node id", () => {
    const { plan, root } = fixture();
    if (root.template.kind !== "control") throw new Error("text template required");
    const pageRoot = { id: "page-root", kind: "layout" as const, layout: "column" as const, sourceBlueprintRegionIds: ["metrics-region"], intent,
      children: [root, { ...root.template, id: "metric-list--metric-01", content: "独立文字" }] };
    expect(() => projectSolutionNodes(plan, pageRoot)).toThrow("expanded id collision");
  });
  it.each(["missing-dataset", "max-items", "normalized-key", "expanded-id"])("rejects invalid expansion: %s", (failure) => {
    const { plan, root } = fixture();
    if (failure === "missing-dataset") root.mockDataId = "missing";
    if (failure === "max-items") root.maxItems = 1;
    if (failure === "normalized-key") plan.mockData[0]!.records[1]!.values[0]!.value = "METRIC 01";
    if (failure === "expanded-id") root.template.id = "n".repeat(95);
    expect(() => projectSolutionNodes(plan, root)).toThrow("SOLUTION_PROVENANCE_INVALID");
  });
  it.each(["wrong-alias", "wrong-field", "number", "object", "unused-value"])("does not stringify or use unrelated data: %s", (failure) => {
    const { plan, blueprint, root } = fixture();
    if (root.template.kind !== "control") throw new Error("text template required");
    if (failure === "wrong-alias") root.template.content = { kind: "repeater-field", itemAlias: "other", field: "label" };
    if (failure === "wrong-field") root.template.content = { kind: "repeater-field", itemAlias: "metric", field: "missing" };
    if (failure === "number") plan.mockData[0]!.records[0]!.values[1]!.value = 123;
    if (failure === "object") root.template.content = { kind: "record", fields: [{ name: "label", value: "今日用电量" }] };
    if (failure === "unused-value") root.template.content = "未绑定指标";
    expect(validateObservationJourneys(blueprint, plan).length).toBeGreaterThan(0);
  });
});
// end
