import { type SolutionImplementationPlan } from "@kf/contracts";
import { describe, expect, it } from "vitest";
import { lowerReviewedInteractionIntents } from "./interaction-intent-lowering.js";

const intent = {
  importance: "primary" as const, visualWeight: 3, readingOrder: 0, density: "comfortable" as const,
  groupWith: [], width: { mode: "fixed" as const, value: 160 },
  height: { mode: "fixed" as const, value: 40 }, align: "start" as const,
};

function customFilterFixture(): SolutionImplementationPlan {
  return {
    schema: "kf-solution-implementation/v1", projectKey: "intent-lowering",
    blueprintHash: "a".repeat(64), candidateBundleHash: "b".repeat(64),
    theme: {
      background: "#f4f7fb", surface: "#ffffff", primary: "#163a5f", accent: "#e47b32",
      textPrimary: "#14212b", textSecondary: "#52616d", fontFamily: "Inter", spacingUnit: 8,
      radiusScale: { small: 4, medium: 8, large: 16 },
    },
    roleStyles: [{ role: "content", declarations: {}, states: {} }],
    mockData: [{
      id: "visitor-records", purpose: "访客记录",
      fields: [{ key: "status", label: "状态", type: "text" }],
      records: [{ values: [{ field: "status", value: "open" }] }],
    }],
    localState: [], overlays: [],
    pages: [{
      id: "home", title: "访客", purpose: "筛选访客", canvas: "desktop",
      sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["records-region"], initialStateIds: [],
      root: {
        id: "root", kind: "layout", layout: "column", sourceBlueprintRegionIds: ["records-region"], intent,
        children: [
          {
            id: "status-filter", kind: "control", capabilityId: "select", content: null,
            properties: [
              { name: "filterField", value: "status" },
              { name: "filterMode", value: "equals" },
            ],
            tabIds: [], styleRole: "content", sourceBlueprintRegionIds: ["records-region"], intent,
            eventBindings: [{ semanticEvent: "change", actionIds: ["run-filter"] }],
          },
          {
            id: "records-table", kind: "control", capabilityId: "easyui.1", content: "访客记录",
            properties: [{ name: "filterCombine", value: "all" }], mockDataId: "visitor-records",
            tabIds: [], styleRole: "content", sourceBlueprintRegionIds: ["records-region"], intent, eventBindings: [],
          },
        ],
      },
    }],
    actions: [{
      id: "run-filter", kind: "run-script", scriptId: "filter-records", afterActionIds: [], journeyStepRefs: [],
    }],
    scripts: [{
      id: "filter-records", kind: "custom", purpose: "筛选访客记录", programVersion: "declarative-steps/v1",
      inputs: [
        { name: "records", description: "原始访客记录", refKind: "mock-data", refId: "visitor-records" },
        { name: "criterion-1-value", description: "状态筛选值", refKind: "control", refId: "status-filter" },
      ],
      outputs: [{ name: "view", description: "筛选结果表格", refKind: "control", refId: "records-table" }],
      steps: [{
        order: 1, intent: "按已声明条件筛选记录并更新表格", inputNames: ["records", "criterion-1-value"], outputNames: ["view"],
      }],
    }],
  };
}

function customFormFixture(): SolutionImplementationPlan {
  const plan = customFilterFixture();
  plan.mockData = [];
  plan.localState = [{ id: "submitted-state", purpose: "提交状态", type: "boolean", initialValue: false }];
  plan.pages[0]!.initialStateIds = ["submitted-state"];
  const root = plan.pages[0]!.root;
  if (root.kind !== "layout") throw new Error("layout fixture required");
  root.children = [
    {
      id: "visitor-name", kind: "control", capabilityId: "input", content: null,
      properties: [
        { name: "required", value: true },
        { name: "validationMessage", value: "请输入访客姓名" },
      ],
      tabIds: [], styleRole: "content", sourceBlueprintRegionIds: ["records-region"], intent, eventBindings: [],
    },
    {
      id: "submit-button", kind: "control", capabilityId: "button", content: "提交",
      properties: [{ name: "successMessage", value: "访客信息已模拟提交" }],
      tabIds: [], styleRole: "content", sourceBlueprintRegionIds: ["records-region"], intent,
      eventBindings: [{ semanticEvent: "click", actionIds: ["run-filter"] }],
    },
  ];
  plan.scripts = [{
    id: "filter-records", kind: "custom", purpose: "校验表单并提交", programVersion: "declarative-steps/v1",
    inputs: [{ name: "field-1", description: "访客姓名", refKind: "control", refId: "visitor-name" }],
    outputs: [{ name: "submitted", description: "提交状态", refKind: "local-state", refId: "submitted-state" }],
    steps: [{ order: 1, intent: "校验已声明字段并模拟提交", inputNames: ["field-1"], outputNames: ["submitted"] }],
  }];
  return plan;
}

describe("reviewed interaction intent lowering", () => {
  it("lowers a fully parameterized one-to-one filter intent without mutating model bytes", () => {
    const input = customFilterFixture();
    const original = structuredClone(input);
    const lowered = lowerReviewedInteractionIntents(input);

    expect(input).toEqual(original);
    expect(lowered.scripts[0]).toEqual({
      id: "filter-records", kind: "template", template: "multi-filter", purpose: "筛选访客记录",
      inputs: [
        { name: "records", description: "原始访客记录", refKind: "mock-data", refId: "visitor-records" },
        { name: "criterion-1-value", description: "状态筛选值", refKind: "control", refId: "status-filter" },
      ],
      outputs: [{ name: "view", description: "筛选结果表格", refKind: "control", refId: "records-table" }],
      parameters: [
        { name: "combine", value: "all" },
        { name: "criterion-1-field", value: "status" },
        { name: "criterion-1-mode", value: "equals" },
      ],
    });
    expect(Object.isFrozen(lowered)).toBe(true);
    expect(Object.isFrozen(lowered.scripts[0])).toBe(true);
    expect(Object.isFrozen(lowered.pages[0]!.root)).toBe(true);
  });

  it("lowers a fully parameterized form validation intent from field and trigger properties", () => {
    const lowered = lowerReviewedInteractionIntents(customFormFixture());
    expect(lowered.scripts[0]).toEqual({
      id: "filter-records", kind: "template", template: "form-validate-submit", purpose: "校验表单并提交",
      inputs: [{ name: "field-1", description: "访客姓名", refKind: "control", refId: "visitor-name" }],
      outputs: [{ name: "submitted", description: "提交状态", refKind: "local-state", refId: "submitted-state" }],
      parameters: [
        { name: "field-1-required", value: true },
        { name: "field-1-message", value: "请输入访客姓名" },
        { name: "success-message", value: "访客信息已模拟提交" },
      ],
    });
  });

  it.each([
    ["filter with an extra step", customFilterFixture, (plan: SolutionImplementationPlan) => {
      const script = plan.scripts[0]!;
      if (script.kind === "custom") script.steps!.push({ order: 2, intent: "另外导出筛选结果", inputNames: ["records"], outputNames: [] });
    }],
    ["filter step omitting a declared input", customFilterFixture, (plan: SolutionImplementationPlan) => {
      const script = plan.scripts[0]!;
      if (script.kind === "custom") script.steps![0]!.inputNames = ["records"];
    }],
    ["filter step omitting the declared output", customFilterFixture, (plan: SolutionImplementationPlan) => {
      const script = plan.scripts[0]!;
      if (script.kind === "custom") script.steps![0]!.outputNames = [];
    }],
    ["filter step mixing another behavior", customFilterFixture, (plan: SolutionImplementationPlan) => {
      const script = plan.scripts[0]!;
      if (script.kind === "custom") script.steps![0]!.intent = "按已声明条件筛选记录、发送通知并更新表格";
    }],
    ["form with an extra step", customFormFixture, (plan: SolutionImplementationPlan) => {
      const script = plan.scripts[0]!;
      if (script.kind === "custom") script.steps!.push({ order: 2, intent: "另外导航到结果页", inputNames: [], outputNames: [] });
    }],
    ["form step omitting a declared input", customFormFixture, (plan: SolutionImplementationPlan) => {
      const script = plan.scripts[0]!;
      if (script.kind === "custom") script.steps![0]!.inputNames = [];
    }],
    ["form step omitting the declared output", customFormFixture, (plan: SolutionImplementationPlan) => {
      const script = plan.scripts[0]!;
      if (script.kind === "custom") script.steps![0]!.outputNames = [];
    }],
  ])("preserves custom intent for non-exact topology: %s", (_name, fixture, mutate) => {
    const plan = fixture();
    mutate(plan);
    expect(lowerReviewedInteractionIntents(plan).scripts[0]!.kind).toBe("custom");
  });

  it.each([
    ["missing field", (plan: SolutionImplementationPlan) => {
      const root = plan.pages[0]!.root; if (root.kind === "layout" && root.children[0]!.kind === "control") root.children[0]!.properties = [{ name: "filterMode", value: "equals" }];
    }],
    ["source/output alias", (plan: SolutionImplementationPlan) => {
      const script = plan.scripts[0]!; if (script.kind === "custom") script.outputs[0] = { ...script.outputs[0]!, refId: "status-filter" };
    }],
    ["multiple unmapped controls", (plan: SolutionImplementationPlan) => {
      const script = plan.scripts[0]!; if (script.kind === "custom") script.inputs.push({ name: "other-filter", description: "额外筛选", refKind: "control", refId: "records-table" });
    }],
    ["unknown mode", (plan: SolutionImplementationPlan) => {
      const root = plan.pages[0]!.root; if (root.kind === "layout" && root.children[0]!.kind === "control") root.children[0]!.properties[1] = { name: "filterMode", value: "approximately" };
    }],
    ["unrecognized workflow", (plan: SolutionImplementationPlan) => {
      const script = plan.scripts[0]!; if (script.kind === "custom") { script.purpose = "导出访客记录"; script.steps![0]!.intent = "导出记录"; }
    }],
    ["ambiguous multi-match", (plan: SolutionImplementationPlan) => {
      const script = plan.scripts[0]!; if (script.kind === "custom") { script.purpose = "筛选并校验提交"; script.steps![0]!.intent = "筛选记录并校验表单提交"; }
    }],
  ])("preserves custom intent when %s prevents an exact reviewed match", (_name, mutate) => {
    const plan = customFilterFixture();
    mutate(plan);
    expect(lowerReviewedInteractionIntents(plan).scripts[0]!.kind).toBe("custom");
  });

  it("rejects proxy and accessor input before schema validation", () => {
    expect(() => lowerReviewedInteractionIntents(new Proxy(customFilterFixture(), {}))).toThrow(/INTERACTION_INTENT_INPUT_INVALID/);
    const accessor = customFilterFixture() as SolutionImplementationPlan & { hostile?: string };
    Object.defineProperty(accessor, "hostile", { enumerable: true, get: () => "read" });
    expect(() => lowerReviewedInteractionIntents(accessor)).toThrow(/INTERACTION_INTENT_INPUT_INVALID/);
  });
});
