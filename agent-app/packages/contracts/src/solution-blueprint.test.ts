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

function page(id: string, regionId: string) {
  return {
    ...valid.pages[0],
    id,
    title: `${id} 页面`,
    readingOrder: [regionId],
    regions: [{ ...valid.pages[0].regions[0], id: regionId }],
  };
}

// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
describe("optional journey display completion", () => {
  it("preserves an absent display caption without inventing a completion fact", () => {
    const journey: Record<string, unknown> = { ...valid.journeys[0] };
    delete journey.completion;
    const parsed = CustomerSolutionBlueprintSchema.parse({ ...valid, journeys: [journey] });
    expect(Object.hasOwn(parsed.journeys[0]!, "completion")).toBe(false);
    expect(parsed.journeys[0]!.steps).toEqual(valid.journeys[0].steps);
  });
  it.each(["", null, 0])("retains validation when an invalid display caption is explicitly provided: %s", completion => {
    expect(CustomerSolutionBlueprintSchema.safeParse({ ...valid, journeys: [{ ...valid.journeys[0], completion }] }).success).toBe(false);
  });
  it("still requires executable or observable journey steps", () => {
    const journey: Record<string, unknown> = { ...valid.journeys[0] };
    delete journey.completion;
    delete journey.steps;
    expect(CustomerSolutionBlueprintSchema.safeParse({ ...valid, journeys: [journey] }).success).toBe(false);
  });
});
// end

function journey(id: string, pageId = "visitor-overview", regionId = "records") {
  return { ...valid.journeys[0], id, steps: [{ ...valid.journeys[0].steps[0], pageId, regionId }] };
}

function withPrimaryRegion(change: Record<string, unknown>) {
  return {
    ...valid,
    pages: [{
      ...valid.pages[0],
      regions: [{ ...valid.pages[0].regions[0], ...change }, ...valid.pages[0].regions.slice(1)],
    }],
  };
}

describe("CustomerSolutionBlueprintSchema", () => {
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  it("preserves legacy region shape and accepts bounded visual provenance without implementation data", () => {
    const legacy = CustomerSolutionBlueprintSchema.parse(valid);
    expect(legacy.pages[0]!.regions[0]).not.toHaveProperty("visualRegionIds");
    const candidate = { ...valid, pages: [{ ...valid.pages[0], regions: valid.pages[0].regions.map((region) => ({ ...region, visualRegionIds: ["image-region-1"] })) }] };
    expect(CustomerSolutionBlueprintSchema.parse(candidate).pages[0]!.regions[0]!.visualRegionIds).toEqual(["image-region-1"]);
  });
  it.each([[], ["duplicate", "duplicate"], ["not:a-visual-id"], Array.from({ length: 101 }, (_, index) => `r-${index}`)].map((visualRegionIds) => ({ visualRegionIds })))("rejects invalid visual source references %j", ({ visualRegionIds }) => {
    expect(CustomerSolutionBlueprintSchema.safeParse({ ...valid, pages: [{ ...valid.pages[0], regions: valid.pages[0].regions.map((region) => ({ ...region, visualRegionIds })) }] }).success).toBe(false);
  });
  // end
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  it("preserves legacy steps and accepts explicit bounded observation text", () => {
    const legacy = CustomerSolutionBlueprintSchema.parse(valid).journeys[0]!.steps[0]!;
    expect(legacy).not.toHaveProperty("kind");
    const observed = structuredClone(valid) as unknown as Record<string, unknown>;
    observed.journeys = [{ ...valid.journeys[0], steps: [{ ...legacy, kind: "observe", expectedTexts: ["待审核预约数"] }] }];
    expect(CustomerSolutionBlueprintSchema.parse(observed).journeys[0]!.steps[0]).toMatchObject({ kind: "observe", expectedTexts: ["待审核预约数"] });
  });
  it.each([
    { kind: "observe" }, { kind: "observe", expectedTexts: [] },
    { kind: "observe", expectedTexts: ["重复", "重复"] },
    { kind: "observe", expectedTexts: [" "] },
    { kind: "observe", expectedTexts: Array.from({ length: 13 }, (_, index) => `文字${index}`) },
    { kind: "interact", expectedTexts: ["不可使用"] }, { expectedTexts: ["不可隐式观察"] },
    { kind: "read", expectedTexts: ["未知类型"] },
  ])("rejects ambiguous observation contract %j", (change) => {
    const candidate = { ...valid, journeys: [{ ...valid.journeys[0], steps: [{ ...valid.journeys[0].steps[0], ...change }] }] };
    expect(CustomerSolutionBlueprintSchema.safeParse(candidate).success).toBe(false);
  });
  // end
  it("accepts a customer solution blueprint expressed only in customer semantics", () => {
    expect(CustomerSolutionBlueprintSchema.parse(valid).pages[0]?.id).toBe("visitor-overview");
    expect(DesignPlanSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts normal Chinese, KPI, and version descriptions", () => {
    expect(CustomerSolutionBlueprintSchema.safeParse({
      ...valid,
      objective: "围绕园区KPI（关键指标）持续优化版本3.6的审核体验",
      visualDirection: { ...valid.visualDirection, tone: "专业、友好且便于一线同事理解" },
    }).success).toBe(true);
  });

  it.each([
    "Node.js 与 TypeScript 项目经验",
    "代码主页：https://github.com/example/profile",
    "头像：https://images.example.com/avatar.png",
  ])("accepts benign customer-facing dotted text: %s", (content) => {
    expect(CustomerSolutionBlueprintSchema.safeParse(withPrimaryRegion({ content: [content] })).success).toBe(true);
  });

  it.each(["content.hero", "data.status-grid", "navigation.top"])(
    "rejects a KF implementation namespace token: %s",
    (objective) => {
      expect(CustomerSolutionBlueprintSchema.safeParse({ ...valid, objective }).success).toBe(false);
    },
  );

  it.each(["Version(3.6)", "KPI(关键指标)"])("accepts an unspaced benign product label: %s", (content) => {
    expect(CustomerSolutionBlueprintSchema.safeParse(withPrimaryRegion({ content: [content] })).success).toBe(true);
  });

  it.each(["KPI: 95%;", "Version: 3.6;"])("accepts normal metric and version copy: %s", (objective) => {
    expect(CustomerSolutionBlueprintSchema.safeParse({ ...valid, objective }).success).toBe(true);
  });

  it.each(["Version (3.6)", "Status (open)"])("accepts a normal spaced label: %s", (objective) => {
    expect(CustomerSolutionBlueprintSchema.safeParse({ ...valid, objective }).success).toBe(true);
  });

  it("rejects implementation-specific fields", () => {
    expect(CustomerSolutionBlueprintSchema.safeParse({
      ...valid,
      pages: [{ ...valid.pages[0], regions: [{ ...valid.pages[0].regions[0], expectedKind: "data.table" }] }],
    }).success).toBe(false);
  });

  it.each([
    "expectedKind",
    "expected_kind",
    "EXPECTED-KIND",
    "moduleKind",
    "moduleKinds",
    "capabilityId",
    "capabilityIds",
    "guid",
    "objectType",
    "uiModelType",
    "x",
    "y",
    "leftTopPt",
    "styleData",
    "styleDataNew",
    "selector",
    "css",
    "js",
    "javascript",
    "linkId",
    "configureData",
  ])("rejects the implementation key %s in arbitrary sample data", (key) => {
    expect(CustomerSolutionBlueprintSchema.safeParse(withPrimaryRegion({
      sampleData: [{ [key]: "不应进入客户蓝图" }],
    })).success).toBe(false);
  });

  it.each([
    ["canonical UUID", "550e8400-e29b-41d4-a716-446655440000"],
    ["raw JSON object", '{"访客":"陈嘉宁"}'],
    ["raw JSON array", '[{"访客":"陈嘉宁"}]'],
    ["quoted implementation JSON", '说明："{\\"styleDataNew\\":{}}"'],
    ["CSS declaration", ".records { color: red; }"],
    ["CSS selector", "#visitor-records > .record"],
    ["lowercase JavaScript call", "loadrecords()"],
    ["camelCase JavaScript call", "openVisitorDetail()"],
  ])("rejects %s in an ordinary text field", (_label, value) => {
    expect(CustomerSolutionBlueprintSchema.safeParse({ ...valid, objective: value }).success).toBe(false);
  });

  it.each([
    "color: red",
    "position: absolute",
    "div::before",
    "--brand-color: red",
    "export default 42",
  ])("rejects a targeted raw implementation example without requiring a full rule: %s", (objective) => {
    expect(CustomerSolutionBlueprintSchema.safeParse({ ...valid, objective }).success).toBe(false);
  });

  it.each([
    "550e8400-e29b-41d4-a716-446655440000",
    '{"linkId":"implementation"}',
    "openVisitorDetail()",
  ])("rejects implementation payloads in arbitrary sample-data values", (value) => {
    expect(CustomerSolutionBlueprintSchema.safeParse(withPrimaryRegion({
      sampleData: [{ "访客姓名": value }],
    })).success).toBe(false);
  });

  it("rejects normalized coordinate metadata in arbitrary sample-data keys", () => {
    expect(CustomerSolutionBlueprintSchema.safeParse(withPrimaryRegion({
      sampleData: [{ coordinate: "120, 48" }],
    })).success).toBe(false);
  });

  it.each(["coords", "bounds", "rect", "xPos", "yPos"])("rejects coordinate alias %s in arbitrary sample data", (key) => {
    expect(CustomerSolutionBlueprintSchema.safeParse(withPrimaryRegion({
      sampleData: [{ [key]: "120, 48" }],
    })).success).toBe(false);
  });

  it.each([
    ["left", "120"],
    ["top", "48"],
  ])("rejects positional key %s in arbitrary sample data", (key, value) => {
    expect(CustomerSolutionBlueprintSchema.safeParse(withPrimaryRegion({
      sampleData: [{ [key]: value }],
    })).success).toBe(false);
  });

  it("accepts normal industry sample-data fields that are not coordinates", () => {
    expect(CustomerSolutionBlueprintSchema.safeParse(withPrimaryRegion({
      sampleData: [{ position: "销售经理", width: "60厘米", height: "120厘米" }],
    })).success).toBe(true);
  });

  it.each([
    "页面使用 content.hero，模块字段 expectedKind=data.table",
    "OpenVisitorDetail()",
    "[data-region=records]",
    ".records:hover",
  ])("rejects implementation syntax in ordinary text: %s", (objective) => {
    expect(CustomerSolutionBlueprintSchema.safeParse({ ...valid, objective }).success).toBe(false);
  });

  it.each(["OpenVisitorDetail(访客)", "openVisitorDetail({ id: 1 })"])("rejects implementation call shape: %s", (objective) => {
    expect(CustomerSolutionBlueprintSchema.safeParse({ ...valid, objective }).success).toBe(false);
  });

  it.each(["[disabled]", "button[data-region]", "button:hover"])("rejects CSS selector context: %s", (objective) => {
    expect(CustomerSolutionBlueprintSchema.safeParse({ ...valid, objective }).success).toBe(false);
  });

  it("accepts ordinary bracketed design-system copy", () => {
    expect(CustomerSolutionBlueprintSchema.safeParse({ ...valid, objective: "遵循 [Design-System] 的客户体验原则" }).success).toBe(true);
  });

  it.each(["linkId", "link-id", "configureData"])("rejects reserved implementation identifier %s", (id) => {
    expect(CustomerSolutionBlueprintSchema.safeParse({
      ...valid,
      pages: [{
        ...valid.pages[0],
        readingOrder: [id, "filters", "records"],
        regions: [{ ...valid.pages[0].regions[0], id }, ...valid.pages[0].regions.slice(1)],
      }],
    }).success).toBe(false);
  });

  it("rejects journey steps that do not target a declared page region", () => {
    expect(CustomerSolutionBlueprintSchema.safeParse({
      ...valid,
      journeys: [{ ...valid.journeys[0], steps: [{ ...valid.journeys[0].steps[0], pageId: "missing" }] }],
    }).success).toBe(false);
  });

  it("rejects more than eight pages", () => {
    const pages = Array.from({ length: 9 }, (_, index) => page(`page-${index + 1}`, `region-${index + 1}`));
    expect(CustomerSolutionBlueprintSchema.safeParse({ ...valid, pages }).success).toBe(false);
  });

  it("rejects more than twelve regions on one page", () => {
    const extraRegions = Array.from({ length: 10 }, (_, index) => ({
      ...valid.pages[0].regions[0],
      id: `extra-region-${index + 1}`,
    }));
    expect(CustomerSolutionBlueprintSchema.safeParse({
      ...valid,
      pages: [{
        ...valid.pages[0],
        readingOrder: [...valid.pages[0].readingOrder, ...extraRegions.map((region) => region.id)],
        regions: [...valid.pages[0].regions, ...extraRegions],
      }],
    }).success).toBe(false);
  });

  it("rejects more than twelve journeys", () => {
    expect(CustomerSolutionBlueprintSchema.safeParse({
      ...valid,
      journeys: Array.from({ length: 13 }, (_, index) => journey(`journey-${index + 1}`)),
    }).success).toBe(false);
  });

  it("rejects more than twelve steps in one journey", () => {
    expect(CustomerSolutionBlueprintSchema.safeParse({
      ...valid,
      journeys: [{ ...valid.journeys[0], steps: Array.from({ length: 13 }, () => valid.journeys[0].steps[0]) }],
    }).success).toBe(false);
  });

  it("accepts exactly eight pages", () => {
    const pages = [
      page("visitor-overview", "records"),
      ...Array.from({ length: 7 }, (_, index) => page(`page-${index + 1}`, `region-${index + 1}`)),
    ];
    expect(CustomerSolutionBlueprintSchema.safeParse({ ...valid, pages }).success).toBe(true);
  });

  it("accepts exactly twelve regions on one page", () => {
    const extraRegions = Array.from({ length: 9 }, (_, index) => ({
      ...valid.pages[0].regions[0],
      id: `extra-region-${index + 1}`,
    }));
    expect(CustomerSolutionBlueprintSchema.safeParse({
      ...valid,
      pages: [{
        ...valid.pages[0],
        readingOrder: [...valid.pages[0].readingOrder, ...extraRegions.map((region) => region.id)],
        regions: [...valid.pages[0].regions, ...extraRegions],
      }],
    }).success).toBe(true);
  });

  it("accepts exactly twelve journeys", () => {
    expect(CustomerSolutionBlueprintSchema.safeParse({
      ...valid,
      journeys: Array.from({ length: 12 }, (_, index) => journey(`journey-${index + 1}`)),
    }).success).toBe(true);
  });

  it("accepts exactly twelve steps in one journey", () => {
    expect(CustomerSolutionBlueprintSchema.safeParse({
      ...valid,
      journeys: [{ ...valid.journeys[0], steps: Array.from({ length: 12 }, () => valid.journeys[0].steps[0]) }],
    }).success).toBe(true);
  });

  it("rejects duplicate page IDs", () => {
    expect(CustomerSolutionBlueprintSchema.safeParse({
      ...valid,
      pages: [valid.pages[0], page("visitor-overview", "another-region")],
    }).success).toBe(false);
  });

  it("rejects duplicate region IDs globally", () => {
    expect(CustomerSolutionBlueprintSchema.safeParse({
      ...valid,
      pages: [valid.pages[0], page("another-page", "summary")],
    }).success).toBe(false);
  });

  it("rejects duplicate journey IDs", () => {
    expect(CustomerSolutionBlueprintSchema.safeParse({
      ...valid,
      journeys: [valid.journeys[0], journey("review-visitor")],
    }).success).toBe(false);
  });

  it("rejects an unknown reading-order region", () => {
    expect(CustomerSolutionBlueprintSchema.safeParse({
      ...valid,
      pages: [{ ...valid.pages[0], readingOrder: ["summary", "missing", "records"] }],
    }).success).toBe(false);
  });

  it("rejects a duplicate reading-order region", () => {
    expect(CustomerSolutionBlueprintSchema.safeParse({
      ...valid,
      pages: [{ ...valid.pages[0], readingOrder: ["summary", "summary", "records"] }],
    }).success).toBe(false);
  });

  it("rejects a journey step with a missing page", () => {
    expect(CustomerSolutionBlueprintSchema.safeParse({
      ...valid,
      journeys: [journey("review-visitor", "missing-page", "records")],
    }).success).toBe(false);
  });

  it("rejects a journey step with a missing region", () => {
    expect(CustomerSolutionBlueprintSchema.safeParse({
      ...valid,
      journeys: [journey("review-visitor", "visitor-overview", "missing-region")],
    }).success).toBe(false);
  });

  it("rejects a journey step whose page and region exist but are not paired", () => {
    expect(CustomerSolutionBlueprintSchema.safeParse({
      ...valid,
      pages: [valid.pages[0], page("second-page", "second-region")],
      journeys: [journey("review-visitor", "visitor-overview", "second-region")],
    }).success).toBe(false);
  });
});
