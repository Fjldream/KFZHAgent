import { describe, expect, it } from "vitest";
import { DesignPlanSchema } from "./design-plan.js";
import { CustomerSolutionBlueprintSchema } from "./solution-blueprint.js";

const valid = {
  schema: "kf-design-plan/v3",
  displayName: "华东园区访客通行中心",
  objective: "帮助园区前台快速审核预约并处理异常通行",
  audiences: ["园区前台", "安保主管"],
  scenarios: ["预约审核", "到访核验", "异常处置"],
  pages: [{
    id: "visitor-overview",
    title: "访客总览",
    purpose: "浏览当日预约并进入访客详情",
    readingOrder: ["summary", "filters", "records"],
    regions: [{
      id: "summary",
      purpose: "展示待处理预约概况",
      semanticRoles: ["status-summary"],
      dataShape: "summary",
      density: "comfortable",
      importance: "secondary",
      content: ["待审核预约数"],
      sampleData: [{ "待审核预约数": "12" }],
      interactions: ["查看待审核记录"],
      states: ["initial"],
      visualIntent: "清晰展示今日待处理任务",
    }, {
      id: "filters",
      purpose: "按条件缩小预约范围",
      semanticRoles: ["filter-controls"],
      dataShape: "filter-set",
      density: "compact",
      importance: "secondary",
      content: ["审核状态", "预约时段"],
      sampleData: [],
      interactions: ["按审核状态筛选"],
      states: ["initial", "filtered"],
      visualIntent: "紧凑且易于快速操作",
    }, {
      id: "records",
      purpose: "筛选和选择预约记录",
      semanticRoles: ["filter-controls", "structured-record-list"],
      dataShape: "record-list",
      density: "comfortable",
      importance: "primary",
      content: ["访客姓名", "受访部门", "预约时段", "审核状态"],
      sampleData: [{ "访客姓名": "陈嘉宁", "受访部门": "数字能源部", "审核状态": "待审核" }],
      interactions: ["按审核状态筛选", "选择记录查看详情"],
      states: ["initial", "filtered", "selected", "empty"],
      visualIntent: "清晰、可信、强调待处理任务",
    }],
  }],
  journeys: [{
    id: "review-visitor",
    actor: "园区前台",
    goal: "完成一条预约审核",
    steps: [
      { pageId: "visitor-overview", regionId: "records", action: "筛选待审核记录", result: "显示待审核访客" },
      { pageId: "visitor-overview", regionId: "records", action: "打开访客详情", result: "显示详情弹窗" },
    ],
    completion: "显示审核成功反馈并更新列表状态",
  }],
  visualDirection: { tone: "专业而友好", colors: ["深海蓝", "通行绿"], typography: "中文信息密集但层级清晰", spacingAndSurfaces: "紧凑工具区与舒适内容区" },
  acceptanceScenarios: ["用户可以完成筛选、查看详情和模拟审核闭环"],
  openQuestions: [],
} as const;

describe("CustomerSolutionBlueprintSchema", () => {
  it("accepts a customer solution blueprint expressed only in customer semantics", () => {
    expect(CustomerSolutionBlueprintSchema.parse(valid).pages[0]?.id).toBe("visitor-overview");
    expect(DesignPlanSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects implementation-specific fields", () => {
    expect(CustomerSolutionBlueprintSchema.safeParse({
      ...valid,
      pages: [{ ...valid.pages[0], regions: [{ ...valid.pages[0].regions[0], expectedKind: "data.table" }] }],
    }).success).toBe(false);
  });

  it("rejects journey steps that do not target a declared page region", () => {
    expect(CustomerSolutionBlueprintSchema.safeParse({
      ...valid,
      journeys: [{ ...valid.journeys[0], steps: [{ ...valid.journeys[0].steps[0], pageId: "missing" }] }],
    }).success).toBe(false);
  });

  it("rejects duplicate identifiers and an unknown reading-order region", () => {
    expect(CustomerSolutionBlueprintSchema.safeParse({
      ...valid,
      pages: [{
        ...valid.pages[0],
        readingOrder: ["summary", "missing"],
        regions: [...valid.pages[0].regions, valid.pages[0].regions[0]],
      }, valid.pages[0]],
      journeys: [valid.journeys[0], valid.journeys[0]],
    }).success).toBe(false);
  });
});
