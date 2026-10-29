// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { SolutionImplementationPlanSchema, type SolutionNode } from "./solution-implementation-plan.js";
import { generatedStructureRetentionIssues, projectGeneratedStructure } from "./generated-project-structure.js";
const golden = JSON.parse(await readFile(new URL("../../../tests/fixtures/creative-goldens/industrial-dashboard.json", import.meta.url), "utf8")) as { plan: unknown };
const plan = () => SolutionImplementationPlanSchema.parse(structuredClone(golden.plan));
function controls(node: SolutionNode): SolutionNode[] {
  return [node, ...(node.kind === "layout" ? node.children.flatMap(controls) : node.kind === "registered-module"
    ? node.slots.flatMap(slot => slot.children.flatMap(controls)) : node.kind === "repeater" ? controls(node.template) : [])];
}
function repeatedPlan(key: string | number = "row-A") {
  const source = plan();
  const root = source.pages[0]!.root;
  if (root.kind !== "layout") throw new Error("layout fixture required");
  const template = source.pages.flatMap(page => controls(page.root)).find(node => node.kind === "control")!;
  if (template.kind !== "control") throw new Error("control fixture required");
  source.mockData.push({ id: "stable-status-data", purpose: "演示设备状态", fields: [
    { key: "code", label: "内部标识", type: typeof key === "number" ? "number" : "text" },
    { key: "label", label: "状态", type: "text" },
  ], records: [{ values: [{ field: "code", value: key }, { field: "label", value: "A正常" }] },
    { values: [{ field: "code", value: typeof key === "number" ? 2 : "row-C" }, { field: "label", value: "C离线" }] }] });
  root.children.push({ kind: "repeater", id: "stable-status-list", sourceBlueprintRegionIds: [...root.sourceBlueprintRegionIds],
    intent: structuredClone(root.intent), mockDataId: "stable-status-data", keyField: "code", itemAlias: "status", maxItems: 10,
    template: { ...structuredClone(template), id: "stable-status-label", content: { kind: "repeater-field", itemAlias: "status", field: "label" }, eventBindings: [] } });
  return SolutionImplementationPlanSchema.parse(source);
}
describe("bounded generated semantic structure", () => {
  it("contains only read-only semantic identities, structure and visible literal content", () => {
    const source = plan(); const before = structuredClone(source);
    const result = projectGeneratedStructure(source);
    expect(source).toEqual(before);
    expect(result.nodes.some(node => node.text === "华东精密制造中心 · 白班")).toBe(true);
    expect(Object.keys(result.nodes[0]!).sort()).toEqual(["capabilityId", "childNodeIds", "id", "kind", "layout", "parentNodeId", "rootId", "text"]);
    expect(JSON.stringify(result)).not.toMatch(/nativeGuid|runtimeCorrelation|storageKey|signature|nativeProperties|scriptModule/);
    expect(generatedStructureRetentionIssues(source, result)).toEqual([]);
  });
  it.each(["row-A", 1])("projects complete static values and raw repeater key type (%s) deterministically without mutating source", key => {
    const source = repeatedPlan(key); const before = structuredClone(source);
    const projected = projectGeneratedStructure(source);
    expect(projected.schema).toBe("kf-generated-project-structure/v2");
    expect(projected.mockData).toEqual(source.mockData);
    expect(projected.repeaters).toContainEqual({ id: "stable-status-list", mockDataId: "stable-status-data", keyField: "code", maxItems: 10 });
    expect(projected.mockData.at(-1)!.records[0]!.values[0]!.value).toBe(key);
    expect(projectGeneratedStructure(source)).toEqual(projected);
    expect(source).toEqual(before);
    projected.mockData.at(-1)!.purpose = "projection-only";
    expect(source).toEqual(before);
  });
  it("accepts existing keys with edited labels, row reorder, and a new independent repeater", () => {
    const source = repeatedPlan(); const known = projectGeneratedStructure(source);
    const dataset = source.mockData.at(-1)!;
    dataset.records[0]!.values[1]!.value = "B待机"; dataset.records.reverse();
    const root = source.pages[0]!.root;
    if (root.kind !== "layout") throw new Error("layout fixture required");
    const original = root.children.at(-1)!;
    if (original.kind !== "repeater") throw new Error("repeater fixture required");
    original.maxItems = 20;
    source.mockData.push({ ...structuredClone(dataset), id: "another-data" });
    root.children.push({ ...structuredClone(original), id: "another-list", mockDataId: "another-data", template: { ...structuredClone(original.template), id: "another-label" } });
    expect(generatedStructureRetentionIssues(source, known)).toEqual([]);
  });
  it.each(["replace", "type", "add", "remove", "dataset", "field", "normalized-alias"])("rejects existing repeater %s drift without rewriting proposal", mutation => {
    const source = repeatedPlan(1); const known = projectGeneratedStructure(source);
    const dataset = source.mockData.at(-1)!;
    const repeater = source.pages[0]!.root;
    if (repeater.kind !== "layout" || repeater.children.at(-1)!.kind !== "repeater") throw new Error("repeater fixture required");
    const list = repeater.children.at(-1)!;
    if (list.kind !== "repeater") throw new Error("repeater fixture required");
    if (mutation === "replace") dataset.records[0]!.values[0]!.value = 3;
    if (mutation === "type") dataset.records[0]!.values[0]!.value = "1";
    if (mutation === "add") dataset.records.push({ values: [{ field: "code", value: 3 }, { field: "label", value: "新设备" }] });
    if (mutation === "remove") dataset.records.pop();
    if (mutation === "dataset") list.mockDataId = "replacement-data";
    if (mutation === "field") list.keyField = "label";
    if (mutation === "normalized-alias") dataset.records[0]!.values[0]!.value = " １ ";
    const before = structuredClone(source);
    expect(generatedStructureRetentionIssues(source, known).join(" ")).toContain("stable-status-list");
    expect(source).toEqual(before);
  });
  it.each(["root", "parent", "layout"])("retains native-compatible existing %s identity", mutation => {
    const source = repeatedPlan(); const known = projectGeneratedStructure(source); const root = source.pages[0]!.root;
    if (root.kind !== "layout") throw new Error("layout fixture required");
    if (mutation === "root") source.pages[0]!.root = { ...structuredClone(root), id: "wrapper-root", children: [root] };
    if (mutation === "layout") root.layout = root.layout === "row" ? "column" : "row";
    if (mutation === "parent") { const old = root.children.pop()!; root.children.push({ ...structuredClone(root), id: "new-parent", children: [old] }); }
    expect(generatedStructureRetentionIssues(source, known).length).toBeGreaterThan(0);
  });
  it("rejects over-budget complete mock data instead of dropping rows", () => {
    const source = repeatedPlan(); source.mockData.at(-1)!.records = Array.from({ length: 100 }, (_, index) => ({ values: [
      { field: "code", value: `record-${index}` }, { field: "label", value: "演示数据".repeat(80) },
    ] }));
    expect(() => projectGeneratedStructure(source)).toThrow("SOLUTION_EXISTING_CONTEXT_TOO_LARGE");
  });
  it("uses canonical key validation without treating spelling-equivalent keys as interchangeable", () => {
    const source = repeatedPlan(); const known = projectGeneratedStructure(source); const dataset = source.mockData.at(-1)!;
    dataset.records[0]!.values[0]!.value = "row_a";
    expect(generatedStructureRetentionIssues(source, known).join(" ")).toContain("stable-status-list");
    dataset.records[1]!.values[0]!.value = "ROW A";
    expect(() => projectGeneratedStructure(source)).toThrow("SOLUTION_EXISTING_CONTEXT_INVALID");
    dataset.records[0]!.values[0]!.value = "../unsafe";
    expect(() => projectGeneratedStructure(source)).toThrow("SOLUTION_EXISTING_CONTEXT_INVALID");
  });
  it.each(["root", "node", "state", "action", "script", "repeater"])("bounds every %s retention diagnostic with a maximum-length semantic ID", kind => {
    const source = repeatedPlan();
    const existingId = kind === "root" ? source.pages[0]!.id : kind === "node" ? source.pages[0]!.root.id
      : kind === "state" ? source.localState[0]!.id : kind === "action" ? source.actions[0]!.id
        : kind === "script" ? source.scripts[0]!.id : "stable-status-list";
    const maximumId = "retained-" + "a".repeat(91);
    const maximumPlan = SolutionImplementationPlanSchema.parse(JSON.parse(JSON.stringify(source).replaceAll(JSON.stringify(existingId), JSON.stringify(maximumId))));
    const issues = generatedStructureRetentionIssues(source, projectGeneratedStructure(maximumPlan));
    expect(issues.join(" ")).toContain(maximumId);
    expect(issues.every(issue => issue.length <= 300)).toBe(true);
  });
  it.each(["purpose", "field-label", "value"])("rejects sensitive new mock data strings in %s", location => {
    const source = repeatedPlan(); const dataset = source.mockData.at(-1)!; const secret = "sk-" + "a".repeat(32);
    if (location === "purpose") dataset.purpose = secret;
    if (location === "field-label") dataset.fields[0]!.label = secret;
    if (location === "value") dataset.records[0]!.values[1]!.value = secret;
    expect(() => projectGeneratedStructure(source)).toThrow("SOLUTION_EXISTING_CONTEXT_SENSITIVE");
  });
  it("rejects replacement IDs while allowing a requested text update on the existing node", () => {
    const source = plan(); const previous = projectGeneratedStructure(source);
    const title = source.pages.flatMap(page => controls(page.root)).find(node => node.id === "industrial-factory-title")!;
    if (title.kind !== "control") throw new Error("control fixture required");
    title.content = "新标题";
    expect(generatedStructureRetentionIssues(source, previous)).toEqual([]);
    title.id = "replacement-title";
    expect(generatedStructureRetentionIssues(source, previous).join(" ")).toContain("industrial-factory-title");
  });
  it("projects stable local-state/action/script declarations and relations without executable source", () => {
    const source = plan(); const projected = projectGeneratedStructure(source);
    expect(projected.states.map(state => state.id)).toEqual(source.localState.map(state => state.id));
    expect(projected.actions.find(action => action.kind === "run-script")?.relatedIds).toContainEqual({ relation: "scriptId", id: source.scripts[0]!.id });
    expect(projected.scripts[0]!.inputs).toEqual(source.scripts[0]!.inputs.map(port => ({ refKind: port.refKind, refId: port.refId })));
    expect(JSON.stringify(projected)).not.toContain("$control");
    const valueEdit = structuredClone(source); valueEdit.localState[0]!.purpose = "更新用途";
    expect(generatedStructureRetentionIssues(valueEdit, projected)).toEqual([]);
    valueEdit.localState[0]!.id = "replacement-state"; valueEdit.actions[0]!.id = "replacement-action"; valueEdit.scripts[0]!.id = "replacement-script";
    const issues = generatedStructureRetentionIssues(valueEdit, projected).join(" ");
    expect(issues).toContain(source.localState[0]!.id); expect(issues).toContain(source.actions[0]!.id); expect(issues).toContain(source.scripts[0]!.id);
  });
  it("refuses over-budget structure rather than truncating old nodes or text", () => {
    const source = plan();
    source.pages.flatMap(page => controls(page.root)).forEach(node => { if (node.kind === "control") node.content = "测".repeat(2000); });
    expect(() => projectGeneratedStructure(source)).toThrow("SOLUTION_EXISTING_CONTEXT_TOO_LARGE");
  });
  it.each(["sk-" + "a".repeat(32), "Bearer private-test-token", "password=private-test-value", "/Users/example/private.json"])("rejects sensitive literal content before model projection", text => {
    const source = plan(); const title = source.pages.flatMap(page => controls(page.root)).find(node => node.kind === "control")!;
    if (title.kind !== "control") throw new Error("control fixture required"); title.content = text;
    expect(() => projectGeneratedStructure(source)).toThrow("SOLUTION_EXISTING_CONTEXT_SENSITIVE");
  });
});
// end
