// @ts-nocheck -- mutation fixtures intentionally probe malformed runtime values.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import {
  ActionPlanSchema,
  SolutionImplementationPlanSchema,
  SolutionNodeSchema,
} from "./solution-implementation-plan.js";

const theme = {
  background: "#f4f7fb",
  surface: "#ffffff",
  primary: "#163a5f",
  accent: "#e47b32",
  textPrimary: "#14212b",
  textSecondary: "#52616d",
  fontFamily: "Inter",
  spacingUnit: 8,
  radiusScale: { small: 4, medium: 8, large: 16 },
} as const;

const intent = {
  importance: "primary",
  visualWeight: 4,
  readingOrder: 0,
  density: "comfortable",
  groupWith: [],
  width: { mode: "fill" },
  height: { mode: "content" },
  align: "stretch",
} as const;

const textControl = {
  kind: "control",
  id: "equipment-name",
  sourceBlueprintRegionIds: ["equipment-region"],
  intent,
  capabilityId: "text",
  content: "一号循环泵",
  properties: [{ name: "emphasis", value: "strong" }],
  mockDataId: "equipment-data",
  styleRole: "record-title",
  eventActionIds: ["open-detail"],
} as const;

const solutionPlanFixture = {
  schema: "kf-solution-implementation/v1",
  projectKey: "operations-demo",
  blueprintHash: "a".repeat(64),
  candidateBundleHash: "b".repeat(64),
  theme,
  roleStyles: [
    {
      role: "record-title",
      declarations: { fontSize: 18, fontWeight: 600 },
      states: { selected: { textColor: "{theme.accent}" } },
    },
    {
      role: "primary-action",
      declarations: { backgroundColor: "{theme.primary}", textColor: "#ffffff" },
      states: {},
    },
  ],
  mockData: [
    {
      id: "equipment-data",
      purpose: "演示循环水设备的运行记录",
      fields: [
        { key: "recordKey", label: "记录标识", type: "text" },
        { key: "name", label: "设备名称", type: "text" },
        { key: "status", label: "运行状态", type: "text" },
      ],
      records: [
        {
          values: [
            { field: "recordKey", value: "pump-a" },
            { field: "name", value: "一号循环泵" },
            { field: "status", value: "稳定运行" },
          ],
        },
      ],
    },
  ],
  localState: [
    {
      id: "detail-visible",
      purpose: "记录设备详情窗口是否打开",
      type: "boolean",
      initialValue: false,
    },
    {
      id: "selected-equipment",
      purpose: "保存当前选中设备的记录标识",
      type: "record-key",
      initialValue: "pump-a",
      mockDataId: "equipment-data",
    },
  ],
  pages: [
    {
      id: "operations-page",
      title: "循环水运行中心",
      purpose: "浏览设备并查看运行详情",
      canvas: "responsive",
      sourceBlueprintPageId: "operations-blueprint",
      sourceBlueprintRegionIds: ["equipment-region"],
      initialStateIds: ["detail-visible", "selected-equipment"],
      root: {
        kind: "layout",
        id: "operations-root",
        sourceBlueprintRegionIds: ["equipment-region"],
        intent,
        layout: "master-detail",
        recipeId: "master-detail-workspace",
        children: [
          {
            kind: "repeater",
            id: "equipment-list",
            sourceBlueprintRegionIds: ["equipment-region"],
            intent,
            mockDataId: "equipment-data",
            itemAlias: "equipment",
            keyField: "recordKey",
            maxItems: 12,
            template: textControl,
          },
          {
            kind: "control",
            id: "equipment-table",
            sourceBlueprintRegionIds: ["equipment-region"],
            intent,
            capabilityId: "easyui.1",
            content: "循环水设备运行记录",
            properties: [{ name: "selectionMode", value: "single" }],
            tabIds: ["active-tab", "maintenance-tab"],
            mockDataId: "equipment-data",
            styleRole: "record-title",
            eventActionIds: [],
          },
          {
            kind: "registered-module",
            id: "equipment-detail-module",
            sourceBlueprintRegionIds: ["equipment-region"],
            intent,
            moduleKind: "data.detail",
            templateVersion: "1.0.0",
            variant: "default",
            title: "设备详情",
            content: {
              kind: "record",
              fields: [{ name: "summary", value: "展示所选设备的运行摘要" }],
            },
            slots: [
              {
                slotId: "actions",
                children: [
                  {
                    kind: "control",
                    id: "detail-action",
                    sourceBlueprintRegionIds: ["equipment-region"],
                    intent: { ...intent, readingOrder: 3, visualWeight: 3 },
                    capabilityId: "easyui.2",
                    content: "查看完整详情",
                    properties: [],
                    styleRole: "primary-action",
                    eventActionIds: ["go-operations"],
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  ],
  overlays: [
    {
      id: "equipment-overlay",
      title: "设备运行详情",
      purpose: "在保留列表上下文时聚焦查看设备",
      presentation: "dialog",
      hostPageId: "operations-page",
      sourceBlueprintPageId: "operations-blueprint",
      sourceBlueprintRegionIds: ["equipment-region"],
      visibleStateId: "detail-visible",
      dismissible: true,
      root: {
        kind: "control",
        id: "overlay-summary",
        sourceBlueprintRegionIds: ["equipment-region"],
        intent,
        capabilityId: "richtext",
        content: "一号循环泵当前运行平稳，最近一次巡检无异常。",
        properties: [],
        styleRole: "record-title",
        eventActionIds: ["close-detail"],
      },
    },
  ],
  actions: [
    { id: "go-operations", kind: "navigate-page", targetPageId: "operations-page", afterActionIds: [] },
    { id: "open-detail", kind: "open-overlay", overlayId: "equipment-overlay", afterActionIds: ["mark-detail-open"] },
    { id: "close-detail", kind: "close-overlay", overlayId: "equipment-overlay", result: "dismissed", afterActionIds: [] },
    { id: "mark-detail-open", kind: "set-state", stateId: "detail-visible", value: true, afterActionIds: ["prepare-detail"] },
    { id: "prepare-detail", kind: "run-script", scriptId: "prepare-detail-script", afterActionIds: [] },
  ],
  scripts: [
    {
      id: "prepare-detail-script",
      kind: "template",
      template: "master-detail-fill",
      purpose: "把选中设备的声明式数据意图传递给详情区域",
      inputs: [
        { name: "records", description: "设备记录集合", refKind: "mock-data", refId: "equipment-data" },
        { name: "selection", description: "选中的设备记录", refKind: "local-state", refId: "selected-equipment" },
      ],
      outputs: [{ name: "detail", description: "设备详情控件", refKind: "control", refId: "overlay-summary" }],
      parameters: [
        { name: "emptyMessage", value: "请选择一台设备" },
        { name: "target", refKind: "control", refId: "overlay-summary" },
      ],
    },
    {
      id: "describe-maintenance",
      kind: "custom",
      purpose: "声明设备维护摘要的准备步骤",
      inputs: [{ name: "selection", description: "当前设备", refKind: "local-state", refId: "selected-equipment" }],
      outputs: [{ name: "detail", description: "详情展示", refKind: "control", refId: "overlay-summary" }],
      steps: [
        { order: 1, intent: "读取当前选择的设备记录", inputNames: ["selection"], outputNames: [] },
        { order: 2, intent: "形成客户可读的维护摘要", inputNames: ["selection"], outputNames: ["detail"] },
      ],
    },
  ],
} as const;

function cloneFixture(): any {
  return structuredClone(solutionPlanFixture);
}

function findNode(plan: any, id: string): any {
  const pending = [plan.pages[0].root, ...plan.overlays.map((overlay: any) => overlay.root)];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node.id === id) return node;
    if (node.kind === "layout") pending.push(...node.children);
    if (node.kind === "registered-module") pending.push(...node.slots.flatMap((slot: any) => slot.children));
    if (node.kind === "repeater") pending.push(node.template);
  }
  throw new Error(`node not found: ${id}`);
}

describe("SolutionImplementationPlanSchema", () => {
  it("accepts the complete semantic implementation tree and preserves the exact top-level vocabulary", () => {
    const parsed = SolutionImplementationPlanSchema.parse(solutionPlanFixture);
    expect(parsed.schema).toBe("kf-solution-implementation/v1");
    expect(Object.keys(parsed)).toEqual([
      "schema", "projectKey", "blueprintHash", "candidateBundleHash", "theme", "roleStyles",
      "mockData", "localState", "pages", "overlays", "actions", "scripts",
    ]);
  });

  it("accepts exactly the planned layout relationship vocabulary", () => {
    const layouts = [
      "row", "column", "grid", "asymmetric-grid", "split", "stack", "dock", "sidebar-content",
      "master-detail", "scroll-region", "overlay-anchor",
    ];
    for (const layout of layouts) {
      expect(SolutionNodeSchema.safeParse({ ...solutionPlanFixture.pages[0].root, layout }).success).toBe(true);
    }
    expect(SolutionNodeSchema.safeParse({ ...solutionPlanFixture.pages[0].root, layout: "absolute" }).success).toBe(false);
  });

  it("accepts exactly the phase-four target action vocabulary", () => {
    const actions = [
      { id: "a", kind: "navigate-page", targetPageId: "operations-page" },
      { id: "a", kind: "open-overlay", overlayId: "equipment-overlay", afterActionIds: [] },
      { id: "a", kind: "close-overlay", overlayId: "equipment-overlay", result: null, afterActionIds: [] },
      { id: "a", kind: "set-visibility", targetId: "operations-root", visible: true, afterActionIds: [] },
      { id: "a", kind: "switch-tab", targetId: "equipment-table", tabId: "active-tab", afterActionIds: [] },
      { id: "a", kind: "set-state", stateId: "detail-visible", value: true, afterActionIds: [] },
      { id: "a", kind: "set-control-value", targetId: "equipment-name", value: { kind: "literal", value: "一号循环泵" }, afterActionIds: [] },
      { id: "a", kind: "show-feedback", level: "success", message: "设备详情已更新", afterActionIds: [] },
      { id: "a", kind: "run-script", scriptId: "prepare-detail-script", afterActionIds: [] },
    ];
    actions.forEach((action) => expect(ActionPlanSchema.safeParse(action).success, action.kind).toBe(true));
    expect(ActionPlanSchema.safeParse({ id: "a", kind: "execute-javascript", afterActionIds: [] }).success).toBe(false);
  });

  it("uses real dotted phase-one capability ids without treating modules as control candidates", () => {
    expect(SolutionImplementationPlanSchema.safeParse(solutionPlanFixture).success).toBe(true);
    const plan = cloneFixture();
    findNode(plan, "equipment-table").capabilityId = "prototype.NotInCandidateBundle";
    findNode(plan, "equipment-detail-module").moduleKind = "unregistered.semantic-module";
    expect(SolutionImplementationPlanSchema.safeParse(plan).success).toBe(true);
  });

  it("rejects geometry and implementation-owned fields anywhere in the recursive tree", () => {
    for (const [field, value] of [
      ["geometry", { x: 0, y: 0, width: 100, height: 100 }],
      ["guid", "a0b1c2d3-e4f5-6789-abcd-ef0123456789"],
      ["styleDataNew", {}],
      ["linkId", 200001],
      ["configureData", "deferred"],
      ["selector", "#app"],
      ["css", "body { display: none; }"],
    ] as const) {
      const plan = cloneFixture();
      findNode(plan, "equipment-name")[field] = value;
      expect(SolutionImplementationPlanSchema.safeParse(plan).success, field).toBe(false);
    }
  });

  it("rejects raw JSON, CSS rules and JavaScript disguised as semantic text", () => {
    for (const content of [
      '{"objectType":"button"}',
      ".record { color: red; }",
      "document.querySelector('#record')",
      "const selected = records.filter((item) => item.active);",
      "设备实例 a0b1c2d3-e4f5-6789-abcd-ef0123456789",
      "alert('unexpected')",
      "#app",
      'payload: {"objectType":"button"}',
      "payload: [1,2]",
      "#app .record",
      "main:first-child",
    ]) {
      const plan = cloneFixture();
      findNode(plan, "equipment-name").content = content;
      expect(SolutionImplementationPlanSchema.safeParse(plan).success, content).toBe(false);
    }
  });

  it("rejects unknown and duplicate mock-data references", () => {
    const unknown = cloneFixture();
    findNode(unknown, "equipment-list").mockDataId = "missing-data";
    expect(SolutionImplementationPlanSchema.safeParse(unknown).success).toBe(false);

    const duplicate = cloneFixture();
    duplicate.mockData.push({ ...duplicate.mockData[0], purpose: "另一份设备数据" });
    expect(SolutionImplementationPlanSchema.safeParse(duplicate).success).toBe(false);
  });

  it("validates repeater keys and mock record fields against the declared dataset", () => {
    const unknownKey = cloneFixture();
    findNode(unknownKey, "equipment-list").keyField = "missingKey";
    expect(SolutionImplementationPlanSchema.safeParse(unknownKey).success).toBe(false);

    const duplicateField = cloneFixture();
    duplicateField.mockData[0].records[0].values.push({ field: "status", value: "等待检修" });
    expect(SolutionImplementationPlanSchema.safeParse(duplicateField).success).toBe(false);
  });

  it("rejects technical placeholder mock content", () => {
    for (const placeholder of ["ONLINE", "INFO", "Item 1", "Lorem ipsum dolor sit amet"]) {
      const plan = cloneFixture();
      plan.mockData[0].records[0].values[2].value = placeholder;
      expect(SolutionImplementationPlanSchema.safeParse(plan).success, placeholder).toBe(false);
    }
  });

  it("requires repeater key values to be unique in its dataset", () => {
    const plan = cloneFixture();
    plan.mockData[0].records.push(structuredClone(plan.mockData[0].records[0]));
    expect(SolutionImplementationPlanSchema.safeParse(plan).success).toBe(false);
  });

  it("enforces global stable-id uniqueness across entities and recursive nodes", () => {
    for (const mutate of [
      (plan: any) => { plan.localState[0].id = "equipment-data"; },
      (plan: any) => { plan.actions[0].id = "operations-page"; },
      (plan: any) => { findNode(plan, "equipment-table").id = "operations-root"; },
      (plan: any) => { plan.scripts[0].id = "equipment-overlay"; },
    ]) {
      const plan = cloneFixture();
      mutate(plan);
      expect(SolutionImplementationPlanSchema.safeParse(plan).success).toBe(false);
    }
  });

  it("validates page and node blueprint provenance", () => {
    const unknownRegion = cloneFixture();
    findNode(unknownRegion, "equipment-name").sourceBlueprintRegionIds = ["invented-region"];
    expect(SolutionImplementationPlanSchema.safeParse(unknownRegion).success).toBe(false);

    const wrongOverlayPage = cloneFixture();
    wrongOverlayPage.overlays[0].sourceBlueprintPageId = "invented-page";
    expect(SolutionImplementationPlanSchema.safeParse(wrongOverlayPage).success).toBe(false);

    const duplicateBlueprintPage = cloneFixture();
    duplicateBlueprintPage.pages.push({ ...structuredClone(duplicateBlueprintPage.pages[0]), id: "second-page" });
    expect(SolutionImplementationPlanSchema.safeParse(duplicateBlueprintPage).success).toBe(false);
  });

  it("scopes overlay descendants to the overlay's declared blueprint regions", () => {
    const plan = cloneFixture();
    plan.pages[0].sourceBlueprintRegionIds.push("maintenance-region");
    plan.pages[0].root.sourceBlueprintRegionIds.push("maintenance-region");
    plan.overlays[0].root.sourceBlueprintRegionIds = ["maintenance-region"];
    expect(SolutionImplementationPlanSchema.safeParse(plan).success).toBe(false);
  });

  it("requires overlay descendants to cover every declared blueprint region", () => {
    const plan = cloneFixture();
    plan.pages[0].sourceBlueprintRegionIds.push("maintenance-region");
    plan.pages[0].root.sourceBlueprintRegionIds.push("maintenance-region");
    plan.overlays[0].sourceBlueprintRegionIds.push("maintenance-region");
    expect(SolutionImplementationPlanSchema.safeParse(plan).success).toBe(false);
  });

  it("preserves bounded human-readable legacy provenance labels", () => {
    const plan = cloneFixture();
    const replaced = JSON.parse(
      JSON.stringify(plan)
        .replaceAll("operations-blueprint", "Operations Blueprint")
        .replaceAll("equipment-region", "Equipment Region"),
    );
    expect(SolutionImplementationPlanSchema.safeParse(replaced).success).toBe(true);
  });

  it("validates style-role, initial-state, group, and event-action references", () => {
    for (const mutate of [
      (plan: any) => { findNode(plan, "equipment-name").styleRole = "missing-role"; },
      (plan: any) => { plan.pages[0].initialStateIds = ["missing-state"]; },
      (plan: any) => { findNode(plan, "equipment-name").intent.groupWith = ["missing-node"]; },
      (plan: any) => { findNode(plan, "equipment-name").eventActionIds = ["missing-action"]; },
    ]) {
      const plan = cloneFixture();
      mutate(plan);
      expect(SolutionImplementationPlanSchema.safeParse(plan).success).toBe(false);
    }
  });

  it("validates navigation, overlay, local-state, control, action, and script targets", () => {
    const cases: Array<(plan: any) => void> = [
      (plan) => { plan.actions[0].targetPageId = "missing-page"; },
      (plan) => { plan.actions[1].overlayId = "missing-overlay"; },
      (plan) => { plan.actions[3].stateId = "missing-state"; },
      (plan) => { plan.actions[4].scriptId = "missing-script"; },
      (plan) => { plan.actions[1].afterActionIds = ["missing-action"]; },
      (plan) => { plan.scripts[0].outputs[0].refId = "missing-control"; },
      (plan) => { plan.overlays[0].visibleStateId = "missing-state"; },
    ];
    for (const mutate of cases) {
      const plan = cloneFixture();
      mutate(plan);
      expect(SolutionImplementationPlanSchema.safeParse(plan).success).toBe(false);
    }
  });

  it("rejects cycles in declarative action dependencies", () => {
    const plan = cloneFixture();
    plan.actions[0].afterActionIds = ["open-detail"];
    plan.actions[1].afterActionIds = ["go-operations"];
    expect(SolutionImplementationPlanSchema.safeParse(plan).success).toBe(false);
  });

  it("validates typed state effects, overlay visibility state, and declared tab targets", () => {
    const wrongStateValue = cloneFixture();
    wrongStateValue.actions[3].value = "not-boolean";
    expect(SolutionImplementationPlanSchema.safeParse(wrongStateValue).success).toBe(false);

    const wrongVisibleState = cloneFixture();
    wrongVisibleState.overlays[0].visibleStateId = "selected-equipment";
    expect(SolutionImplementationPlanSchema.safeParse(wrongVisibleState).success).toBe(false);

    const missingTab = cloneFixture();
    missingTab.actions.push({ id: "switch-view", kind: "switch-tab", targetId: "equipment-table", tabId: "missing-tab" });
    expect(SolutionImplementationPlanSchema.safeParse(missingTab).success).toBe(false);

    const validTab = cloneFixture();
    validTab.actions.push({ id: "switch-view", kind: "switch-tab", targetId: "equipment-table", tabId: "active-tab" });
    expect(SolutionImplementationPlanSchema.safeParse(validTab).success).toBe(true);
  });

  it("supports bounded list state and declarative control-value references", () => {
    const listState = cloneFixture();
    listState.localState.push({
      id: "selected-equipment-list",
      purpose: "保存批量选择的设备记录标识",
      type: "record-key-list",
      initialValue: ["pump-a"],
      mockDataId: "equipment-data",
    });
    listState.actions.push({
      id: "select-equipment-list",
      kind: "set-state",
      stateId: "selected-equipment-list",
      value: { kind: "list", items: ["pump-a"] },
    });
    listState.actions.push({
      id: "copy-selection",
      kind: "set-control-value",
      targetId: "equipment-name",
      value: { kind: "local-state", stateId: "selected-equipment" },
    });
    expect(SolutionImplementationPlanSchema.safeParse(listState).success).toBe(true);

    const unknownValueReference = structuredClone(listState);
    unknownValueReference.actions.at(-1).value.stateId = "missing-state";
    expect(SolutionImplementationPlanSchema.safeParse(unknownValueReference).success).toBe(false);
  });

  it("keeps phase-two custom scripts purely declarative with no source or code-shaped fields", () => {
    const scriptIndex = solutionPlanFixture.scripts.findIndex((script) => script.kind === "custom");
    for (const [field, value] of [
      ["source", "return records;"],
      ["code", "return records;"],
      ["javascript", "return records;"],
      ["body", "return records;"],
    ]) {
      const plan = cloneFixture();
      plan.scripts[scriptIndex][field] = value;
      expect(SolutionImplementationPlanSchema.safeParse(plan).success, field).toBe(false);
    }
  });

  it("rejects executable content in declarative custom-script steps", () => {
    for (const codeLikeIntent of [
      "const selected = records.filter(item => item.active)",
      "$control.setValue('detail', value)",
      "function buildDetail() { return selected; }",
      "document.querySelector('#detail')",
      "if (selected) { detail = selected; }",
      "alert('unexpected')",
      "detail.text = selection",
      "counter++",
      "records[0] = value",
      "detail.text.value = selection",
      "window.location.href = selection",
      "records[index].value = selection",
    ]) {
      const plan = cloneFixture();
      plan.scripts[1].steps[0].intent = codeLikeIntent;
      expect(SolutionImplementationPlanSchema.safeParse(plan).success, codeLikeIntent).toBe(false);
    }
  });

  it("allows ordinary customer language and semantic field names that merely resemble programming words", () => {
    const plan = cloneFixture();
    findNode(plan, "equipment-name").content = "Return policy and equipment class";
    findNode(plan, "equipment-name").properties.push({ name: "code", value: "PUMP-A" });
    expect(SolutionImplementationPlanSchema.safeParse(plan).success).toBe(true);
  });

  it("requires coherent semantic sizing intent and bounds recursive depth", () => {
    const invalidWidth = cloneFixture();
    findNode(invalidWidth, "equipment-name").intent.width = { mode: "fixed" };
    expect(SolutionImplementationPlanSchema.safeParse(invalidWidth).success).toBe(false);

    const tooDeep = cloneFixture();
    let child = tooDeep.pages[0].root.children[0].template;
    for (let depth = 0; depth < 13; depth += 1) {
      const wrapper = {
        kind: "layout",
        id: `nested-${depth}`,
        sourceBlueprintRegionIds: ["equipment-region"],
        intent,
        layout: "column",
        children: [child],
      };
      child = wrapper;
    }
    tooDeep.pages[0].root.children[0].template = child;
    expect(SolutionImplementationPlanSchema.safeParse(tooDeep).success).toBe(false);
  });

  it("rejects unknown top-level fields and malformed hashes", () => {
    expect(SolutionImplementationPlanSchema.safeParse({ ...solutionPlanFixture, operations: [] }).success).toBe(false);
    expect(SolutionImplementationPlanSchema.safeParse({ ...solutionPlanFixture, blueprintHash: "A".repeat(64) }).success).toBe(false);
    expect(SolutionImplementationPlanSchema.safeParse({ ...solutionPlanFixture, candidateBundleHash: "short" }).success).toBe(false);
  });
});
