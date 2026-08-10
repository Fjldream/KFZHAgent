// @ts-nocheck -- mock-fetch 场景的 JS 风格测试；行为由 vitest 断言验证（与 deepseek-model.test.ts 一致）。
import { describe, expect, it, vi } from "vitest";
import {
  KF_DESIGN_PRINCIPLES,
  KF_DESIGN_PRINCIPLES_FULL,
} from "./kf-design-principles.js";
import { DeepSeekModelPort } from "./deepseek-model.js";

/** 支持的全部 31 种 KF 控件类型（与 CONTROL_TYPE_BY_UIMODEL_TYPE 对齐）。 */
const CONTROLS = [
  "text",
  "button",
  "inputnumber",
  "switch",
  "checkbox",
  "radio",
  "select",
  "image",
  "tabs",
  "table",
  "richtext",
  "spacer",
  "radiolegacy",
  "checkboxlegacy",
  "combobox",
  "scale",
  "list",
  "treeview",
  "webcontainer",
  "gantt",
  "factorycalendar",
  "input",
  "cascader",
  "datetimepicker",
  "dropdown",
  "navmenu",
  "tree",
  "upload",
  "transfer",
  "tag",
  "timeline",
  "steps",
];

describe("KF_DESIGN_PRINCIPLES", () => {
  it("is a non-empty design guidance string", () => {
    expect(KF_DESIGN_PRINCIPLES.length).toBeGreaterThan(500);
  });

  it("includes two-pass and restraint principles", () => {
    expect(KF_DESIGN_PRINCIPLES).toContain("两遍");
    expect(KF_DESIGN_PRINCIPLES).toContain("记忆点");
  });

  it("defines the first pass as a complete customer effect blueprint", () => {
    expect(KF_DESIGN_PRINCIPLES).toContain("客户效果蓝图");
    expect(KF_DESIGN_PRINCIPLES).toContain("示例数据");
    expect(KF_DESIGN_PRINCIPLES).toContain("验收标准");
  });

  it("mentions the KF control vocabulary instead of CSS", () => {
    expect(KF_DESIGN_PRINCIPLES).not.toContain("flexbox");
    expect(KF_DESIGN_PRINCIPLES).toContain("分区");
  });
});

describe("KF_DESIGN_PRINCIPLES_FULL", () => {
  it("adds the control-capability boundary section on top of the principles", () => {
    expect(KF_DESIGN_PRINCIPLES_FULL).toContain(KF_DESIGN_PRINCIPLES);
    expect(KF_DESIGN_PRINCIPLES_FULL).toContain("控件能力边界");
    expect(KF_DESIGN_PRINCIPLES_FULL).toContain("占位");
  });

  it("lists all supported KF control types", () => {
    for (const control of CONTROLS) {
      expect(KF_DESIGN_PRINCIPLES_FULL).toContain(control);
    }
  });

  it("forbids faking a chart with a button", () => {
    expect(KF_DESIGN_PRINCIPLES_FULL).toContain("不得用按钮冒充");
  });

  it("lists easyui container controls in the capability boundary", () => {
    for (const container of [
      "datagrid",
      "linkbutton",
      "treegrid",
      "sidemenu",
      "combobox",
      "propertygrid",
      "textbox",
    ]) {
      expect(KF_DESIGN_PRINCIPLES_FULL).toContain(container);
    }
  });

  it("explains the layout container with layoutType semantics and recursive nesting", () => {
    expect(KF_DESIGN_PRINCIPLES_FULL).toContain("layout");
    expect(KF_DESIGN_PRINCIPLES_FULL).toContain("layoutType");
    expect(KF_DESIGN_PRINCIPLES_FULL).toContain("children");
    expect(KF_DESIGN_PRINCIPLES_FULL).toContain("2=水平");
    expect(KF_DESIGN_PRINCIPLES_FULL).toContain("4=垂直");
    expect(KF_DESIGN_PRINCIPLES_FULL).toContain("3=选项卡");
    expect(KF_DESIGN_PRINCIPLES_FULL).toContain("5=Docking");
    expect(KF_DESIGN_PRINCIPLES_FULL).toContain("0=折叠");
    expect(KF_DESIGN_PRINCIPLES_FULL).toContain("6=导航");
    expect(KF_DESIGN_PRINCIPLES_FULL).toContain("嵌套");
  });

  it("explains that containers carry static controls (datagrid columns, layout children)", () => {
    expect(KF_DESIGN_PRINCIPLES_FULL).toContain("承载静态控件");
    expect(KF_DESIGN_PRINCIPLES_FULL).toContain("数据表格");
    expect(KF_DESIGN_PRINCIPLES_FULL).toContain("内嵌列");
  });
});

describe("DeepSeekModelPort integration", () => {
  it("injects KF_DESIGN_PRINCIPLES_FULL into the shared system prompt", async () => {
    const plan = {
      schema: "kf-design-plan/v2",
      displayName: "监控大屏客户效果方案",
      overview: {
        objective: "帮助值班人员掌握生产状态",
        audiences: ["值班人员"],
        scenarios: ["生产监控"],
        valueProposition: "集中呈现关键状态",
      },
      informationArchitecture: { narrative: "总览到趋势", wireframe: "总览 → 趋势" },
      modules: [{
        id: "kpi",
        name: "KPI 区",
        purpose: "展示关键指标",
        content: ["产量", "达成率"],
        sampleData: [{ label: "产量", value: "12,680 件" }],
        interactions: ["查看指标详情"],
        presentation: "指标卡片",
      }],
      visualDirection: {
        tone: "深色工业风",
        colors: ["深蓝", "青绿"],
        typography: "指标数字突出",
        spacingAndSurfaces: "深色卡片",
      },
      highlights: ["趋势联动 KPI"],
      revisionNotes: { added: ["完整 KPI 模块"], changed: [], retained: [] },
      acceptanceCriteria: ["首屏展示产量和达成率"],
      openQuestions: [],
    };
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(plan) } }],
      }),
    });
    const port = new DeepSeekModelPort({
      apiKey: "test-key",
      fetch: fetchImpl,
      baseUrl: "https://mock.local",
    });
    await port.createDesignPlan({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [],
      requirementText: "做一个监控大屏",
    });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("控件能力边界");
    expect(body.messages[0].content).toContain("两遍");
    expect(body.messages[0].content).toContain("datagrid");
    expect(body.messages[0].content).toContain("layoutType");
    expect(body.messages[0].content).toContain("2=水平");
  });
});
