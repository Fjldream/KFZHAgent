// @ts-nocheck -- mutation fixtures intentionally probe malformed runtime values.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import {
  ActionPlanSchema,
  ScriptPlanSchema,
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
  eventBindings: [{ semanticEvent: "click", actionIds: ["open-detail"] }],
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
      keyField: "recordKey",
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
            eventBindings: [],
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
            eventBindings: [{ semanticEvent: "navigate", actionIds: ["go-operations"] }],
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
                    eventBindings: [],
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
        eventBindings: [{ semanticEvent: "click", actionIds: ["close-detail"] }],
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

  it("validates style-role, initial-state, group, and semantic event-action references", () => {
    for (const mutate of [
      (plan: any) => { findNode(plan, "equipment-name").styleRole = "missing-role"; },
      (plan: any) => { plan.pages[0].initialStateIds = ["missing-state"]; },
      (plan: any) => { findNode(plan, "equipment-name").intent.groupWith = ["missing-node"]; },
      (plan: any) => { findNode(plan, "equipment-name").eventBindings[0].actionIds = ["missing-action"]; },
      (plan: any) => { findNode(plan, "equipment-detail-module").eventBindings[0].actionIds = ["missing-action"]; },
    ]) {
      const plan = cloneFixture();
      mutate(plan);
      expect(SolutionImplementationPlanSchema.safeParse(plan).success).toBe(false);
    }
  });

  it("requires bounded semantic event bindings instead of bare action-id arrays", () => {
    const legacy = cloneFixture();
    const control = findNode(legacy, "equipment-name");
    delete control.eventBindings;
    control.eventActionIds = ["open-detail"];
    expect(SolutionImplementationPlanSchema.safeParse(legacy).success).toBe(false);

    const unknownEvent = cloneFixture();
    findNode(unknownEvent, "equipment-name").eventBindings[0].semanticEvent = "execute-code";
    expect(SolutionImplementationPlanSchema.safeParse(unknownEvent).success).toBe(false);

    const duplicateEvent = cloneFixture();
    findNode(duplicateEvent, "equipment-name").eventBindings.push({ semanticEvent: "click", actionIds: ["open-detail"] });
    expect(SolutionImplementationPlanSchema.safeParse(duplicateEvent).success).toBe(false);

    const duplicateAction = cloneFixture();
    findNode(duplicateAction, "equipment-name").eventBindings[0].actionIds.push("open-detail");
    expect(SolutionImplementationPlanSchema.safeParse(duplicateAction).success).toBe(false);
  });

  it("requires every action to be reachable from a control or module binding", () => {
    const unreachable = cloneFixture();
    unreachable.actions.push({ id: "orphan-feedback", kind: "show-feedback", level: "info", message: "尚未触发" });
    expect(SolutionImplementationPlanSchema.safeParse(unreachable).success).toBe(false);

    const moduleTriggered = cloneFixture();
    moduleTriggered.actions.push({ id: "module-feedback", kind: "show-feedback", level: "info", message: "模块已触发" });
    findNode(moduleTriggered, "equipment-detail-module").eventBindings.push({
      semanticEvent: "submit",
      actionIds: ["module-feedback"],
    });
    expect(SolutionImplementationPlanSchema.safeParse(moduleTriggered).success).toBe(true);
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

  it("rejects duplicate declarative action dependency edges", () => {
    const plan = cloneFixture();
    plan.actions[1].afterActionIds = ["mark-detail-open", "mark-detail-open"];
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
    findNode(validTab, "equipment-table").eventBindings.push({ semanticEvent: "tab-click", actionIds: ["switch-view"] });
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
      keyField: "recordKey",
    });
    listState.actions.push({
      id: "select-equipment-list",
      kind: "set-state",
      stateId: "selected-equipment-list",
      value: { kind: "list", items: ["pump-a"] },
    });
    findNode(listState, "equipment-table").eventBindings.push({
      semanticEvent: "change",
      actionIds: ["select-equipment-list", "copy-selection"],
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

  it("validates record-key state against the declared dataset key domain", () => {
    const missingKeyField = cloneFixture();
    delete missingKeyField.localState[1].keyField;
    expect(SolutionImplementationPlanSchema.safeParse(missingKeyField).success).toBe(false);

    const unknownKeyField = cloneFixture();
    unknownKeyField.localState[1].keyField = "missingField";
    expect(SolutionImplementationPlanSchema.safeParse(unknownKeyField).success).toBe(false);

    const unknownInitialKey = cloneFixture();
    unknownInitialKey.localState[1].initialValue = "pump-missing";
    expect(SolutionImplementationPlanSchema.safeParse(unknownInitialKey).success).toBe(false);

    const unstableActualKey = cloneFixture();
    unstableActualKey.mockData[0].records[0].values[0].value = "Pump A";
    unstableActualKey.localState[1].initialValue = "Pump A";
    expect(SolutionImplementationPlanSchema.safeParse(unstableActualKey).success).toBe(false);

    const unselected = cloneFixture();
    unselected.localState[1].initialValue = null;
    expect(SolutionImplementationPlanSchema.safeParse(unselected).success).toBe(true);
  });

  it("validates record-key lists and set-state values against actual record keys", () => {
    const listPlan = cloneFixture();
    listPlan.localState.push({
      id: "selected-equipment-list",
      purpose: "保存批量选择的设备记录标识",
      type: "record-key-list",
      initialValue: ["pump-a"],
      mockDataId: "equipment-data",
      keyField: "recordKey",
    });

    const duplicateInitial = structuredClone(listPlan);
    duplicateInitial.localState.at(-1).initialValue = ["pump-a", "pump-a"];
    expect(SolutionImplementationPlanSchema.safeParse(duplicateInitial).success).toBe(false);

    const unknownInitial = structuredClone(listPlan);
    unknownInitial.localState.at(-1).initialValue = ["pump-missing"];
    expect(SolutionImplementationPlanSchema.safeParse(unknownInitial).success).toBe(false);

    const unknownSetValue = structuredClone(listPlan);
    unknownSetValue.actions.push({
      id: "select-missing-equipment",
      kind: "set-state",
      stateId: "selected-equipment-list",
      value: { kind: "list", items: ["pump-missing"] },
    });
    findNode(unknownSetValue, "equipment-table").eventBindings.push({
      semanticEvent: "change",
      actionIds: ["select-missing-equipment"],
    });
    expect(SolutionImplementationPlanSchema.safeParse(unknownSetValue).success).toBe(false);

    const validUnselect = cloneFixture();
    validUnselect.actions.push({
      id: "clear-selection",
      kind: "set-state",
      stateId: "selected-equipment",
      value: null,
    });
    findNode(validUnselect, "equipment-table").eventBindings.push({ semanticEvent: "clear", actionIds: ["clear-selection"] });
    expect(SolutionImplementationPlanSchema.safeParse(validUnselect).success).toBe(true);
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
      "detail.text ||= selection",
      "detail.text &&= selection",
      "detail.text ??= selection",
      "detail.text %= selection",
      "detail.text &= selection",
      "detail.text |= selection",
      "detail.text ^= selection",
      "detail.text **= selection",
      "delete detail.text",
      "return selected",
      "return 42",
      "throw error",
      "throw \"error\"",
      "await selection",
      "yield 1",
      "break",
      "continue",
      "debugger",
      "window.location.href",
      "document.body.innerHTML",
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
      expect(ScriptPlanSchema.safeParse(plan.scripts[1]).success, `standalone: ${codeLikeIntent}`).toBe(false);
    }
  });

  it("allows ordinary customer language and semantic field names that merely resemble programming words", () => {
    const plan = cloneFixture();
    findNode(plan, "equipment-name").content = "Return policy and equipment class";
    findNode(plan, "equipment-name").properties.push({ name: "code", value: "PUMP-A" });
    expect(SolutionImplementationPlanSchema.safeParse(plan).success).toBe(true);
  });

  it("rejects implementation leakage through semantic properties and record fields", () => {
    for (const [name, value] of [
      ["left", 0], ["top", 0], ["x", 0], ["y", 0], ["coords", "0,0"], ["bounds", "full"],
      ["rect", "page"], ["xPos", 12], ["yPos", 16], ["width", 1024], ["height", 768],
      ["position", "absolute"], ["geometry", "fixed"], ["coordinate", "screen"], ["right", 0],
      ["bottom", 0], ["zIndex", 2], ["marginTop", "8px"], ["padding", "8px"], ["gap", "8px"],
      ["backgroundColor", "red"], ["borderRadius", "4px"], ["fontSize", "12px"],
      ["gridColumn", "1 / 2"], ["transitionDuration", "200ms"], ["boxShadow", "small"],
      ["textAlign", "center"], ["lineHeight", 1.5], ["display", "grid"],
      ["objectType", "control"], ["uiModelType", "text"], ["styleDataNew", "raw"],
      ["linkId", "raw-link"], ["configureData", "raw-config"],
    ] as const) {
      const propertyPlan = cloneFixture();
      findNode(propertyPlan, "equipment-name").properties.push({ name, value });
      expect(SolutionImplementationPlanSchema.safeParse(propertyPlan).success, `property ${name}`).toBe(false);

      const recordPlan = cloneFixture();
      findNode(recordPlan, "equipment-detail-module").content.fields.push({ name, value });
      expect(SolutionImplementationPlanSchema.safeParse(recordPlan).success, `record field ${name}`).toBe(false);
    }

    const domainCompounds = cloneFixture();
    findNode(domainCompounds, "equipment-name").properties.push(
      { name: "backgroundCheckStatus", value: "complete" },
      { name: "borderCheckpoint", value: "north-gate" },
      { name: "fontLicense", value: "licensed" },
      { name: "gridOperator", value: "regional-team" },
      { name: "transitionOwner", value: "operations" },
    );
    findNode(domainCompounds, "equipment-detail-module").content.fields.push(
      { name: "backgroundCheckStatus", value: "complete" },
      { name: "borderCheckpoint", value: "north-gate" },
      { name: "fontLicense", value: "licensed" },
      { name: "gridOperator", value: "regional-team" },
      { name: "transitionOwner", value: "operations" },
    );
    expect(SolutionImplementationPlanSchema.safeParse(domainCompounds).success).toBe(true);
  });

  it("rejects value-level CSS and executable syntax while preserving semantic prose and source data", () => {
    for (const content of [
      "color: red",
      "#app.active",
      "value = selection",
      "detail.text.value",
      "detail.text.value = selection",
      "records[index]",
      "records[index] = value",
      "refresh()",
      ".card .title",
      ".card:hover",
      "records[0]",
      "records[\"id\"]",
      "(detail.text = selection)",
      "value = []",
      "refresh?.()",
    ]) {
      const plan = cloneFixture();
      findNode(plan, "equipment-name").content = content;
      expect(SolutionImplementationPlanSchema.safeParse(plan).success, content).toBe(false);

      const scriptPlan = cloneFixture();
      scriptPlan.scripts[1].steps[0].intent = content;
      expect(SolutionImplementationPlanSchema.safeParse(scriptPlan).success, `script: ${content}`).toBe(false);
    }

    const semanticPlan = cloneFixture();
    semanticPlan.mockData[0].fields[2].key = "source";
    semanticPlan.mockData[0].records[0].values[2].field = "source";
    semanticPlan.mockData[0].records[0].values[1].value = "example.com";
    findNode(semanticPlan, "equipment-name").content = "api.example.com";
    semanticPlan.scripts[1].steps[0].intent = "Show empty state if no record is selected";
    semanticPlan.scripts[1].steps[1].intent = "Show guidance for new operators while records are loading";
    expect(SolutionImplementationPlanSchema.safeParse(semanticPlan).success).toBe(true);
  });

  it("rejects chained selectors, literal assignments, and index-member expressions in semantic text", () => {
    const bypasses = [
      ".card.title:hover",
      "div .card",
      "value = [1]",
      "records[0].name",
    ];
    const results = bypasses.map((content) => {
      const contentPlan = cloneFixture();
      findNode(contentPlan, "equipment-name").content = content;
      const scriptPlan = cloneFixture();
      scriptPlan.scripts[1].steps[0].intent = content;
      return {
        content: SolutionImplementationPlanSchema.safeParse(contentPlan).success,
        script: SolutionImplementationPlanSchema.safeParse(scriptPlan).success,
      };
    });
    expect(results).toEqual([
      { content: false, script: false },
      { content: false, script: false },
      { content: false, script: false },
      { content: false, script: false },
    ]);
  });

  it("accepts ordinary colon-delimited semantic tokens", () => {
    for (const token of ["status:pending", "urn:isbn"]) {
      const contentPlan = cloneFixture();
      findNode(contentPlan, "equipment-name").content = token;
      expect(SolutionImplementationPlanSchema.safeParse(contentPlan).success, `content: ${token}`).toBe(true);

      const scriptPlan = cloneFixture();
      scriptPlan.scripts[1].steps[0].intent = token;
      expect(SolutionImplementationPlanSchema.safeParse(scriptPlan).success, `script: ${token}`).toBe(true);
    }
  });

  it("keeps registry-owned module slot membership out of the Task 3 schema", () => {
    const syntacticOnly = cloneFixture();
    findNode(syntacticOnly, "equipment-detail-module").slots[0].slotId = "future-slot";
    expect(SolutionImplementationPlanSchema.safeParse(syntacticOnly).success).toBe(true);

    const duplicate = cloneFixture();
    const module = findNode(duplicate, "equipment-detail-module");
    module.slots.push(structuredClone(module.slots[0]));
    module.slots[1].children[0].id = "second-detail-action";
    expect(SolutionImplementationPlanSchema.safeParse(duplicate).success).toBe(false);

    const malformed = cloneFixture();
    findNode(malformed, "equipment-detail-module").slots[0].slotId = "slot with spaces";
    expect(SolutionImplementationPlanSchema.safeParse(malformed).success).toBe(false);
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
