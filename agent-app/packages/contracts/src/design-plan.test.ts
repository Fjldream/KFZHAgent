import { describe, expect, it } from "vitest";
import { CustomerEffectBlueprintSchema, DesignPlanSchema } from "./design-plan.js";

const detailedBlueprint = {
  schema: "kf-design-plan/v2",
  displayName: "个人求职作品集",
  overview: {
    objective: "让招聘经理快速理解候选人的能力、产品和项目成果",
    audiences: ["招聘经理", "面试官"],
    scenarios: ["求职应聘"],
    valueProposition: "用产品与项目证据展示候选人的实际价值",
  },
  informationArchitecture: {
    narrative: "从个人定位到产品、项目、履历和联系方式",
    wireframe: "首屏 → 产品 → 项目 → 履历 → 联系方式",
  },
  modules: [
    {
      id: "products",
      name: "我的产品",
      purpose: "展示主导或参与的产品",
      content: ["产品定位", "个人职责", "量化成果"],
      sampleData: [{ label: "产品名称", value: "工业低代码平台" }],
      interactions: ["点击卡片展开详情"],
      presentation: "大尺寸产品卡片",
    },
  ],
  visualDirection: {
    tone: "专业可信",
    colors: ["深蓝", "暖金"],
    typography: "标题与正文形成清晰层级",
    spacingAndSurfaces: "大留白与轻边框卡片",
  },
  highlights: ["产品与项目形成完整证据链"],
  revisionNotes: { added: ["完整产品模块"], changed: [], retained: [] },
  acceptanceCriteria: ["至少展示两个包含职责和成果的产品案例"],
  openQuestions: ["是否使用真实头像"],
} as const;

describe("DesignPlanSchema", () => {
  it("accepts a valid design plan", () => {
    const ok = DesignPlanSchema.safeParse({
      schema: "kf-design-plan/v1",
      displayName: "生产监控大屏",
      summary: "深色工业风监控大屏",
      layoutConcept: "顶部标题 + 中部趋势区 + 右侧状态区",
      styleDirection: "深色工业风 #0f172a + 青绿 #10b981",
      sections: [
        { id: "kpi", label: "顶部 KPI 区", controls: [{ type: "text", text: "产量", note: "KPI 数字" }] },
        { id: "trend", label: "中部趋势区", controls: [{ type: "text", text: "趋势曲线", note: "预留图表区" }] },
      ],
      signature: "中部趋势区联动 KPI 高亮",
    });
    expect(ok.success).toBe(true);
  });
  it("rejects unknown control types", () => {
    const bad = DesignPlanSchema.safeParse({
      schema: "kf-design-plan/v1",
      displayName: "x", summary: "s", layoutConcept: "l", styleDirection: "d",
      sections: [{ id: "a", label: "区", controls: [{ type: "gauge" }] }],
      signature: "sig",
    });
    expect(bad.success).toBe(false);
  });
  it("rejects >8 sections or >12 controls per section", () => {
    const manySections = Array.from({ length: 9 }, (_, i) => ({ id: `s${i}`, label: `区${i}`, controls: [{ type: "text" }] }));
    const bad = DesignPlanSchema.safeParse({
      schema: "kf-design-plan/v1", displayName: "x", summary: "s", layoutConcept: "l", styleDirection: "d",
      sections: manySections, signature: "sig",
    });
    expect(bad.success).toBe(false);
  });

  it("accepts a complete customer effect blueprint and the versioned union", () => {
    expect(CustomerEffectBlueprintSchema.safeParse(detailedBlueprint).success).toBe(true);
    expect(DesignPlanSchema.safeParse(detailedBlueprint).success).toBe(true);
  });

  it("rejects a customer effect blueprint without modules", () => {
    expect(
      CustomerEffectBlueprintSchema.safeParse({ ...detailedBlueprint, modules: [] }).success,
    ).toBe(false);
  });

  it("rejects a customer effect blueprint without observable acceptance criteria", () => {
    expect(
      CustomerEffectBlueprintSchema.safeParse({ ...detailedBlueprint, acceptanceCriteria: [] })
        .success,
    ).toBe(false);
  });
});
