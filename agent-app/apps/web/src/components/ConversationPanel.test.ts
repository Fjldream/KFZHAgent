// Task 10：前端对话展示增强——澄清追问可点选、设计计划结构化卡片。
// 解析辅助函数（parseClarifyingQuestion / parseDesignPlan）为 types.ts 导出的纯函数，
// 组件测试覆盖解析命中/未命中与组件的点选/确认交互（不进真实浏览器）。
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ConversationPanel from "./ConversationPanel.vue";
import {
  parseClarifyingQuestion,
  parseCustomerEffectBlueprint,
  parseDesignPlan,
} from "../types";

it("disables the composer while an approval request is busy", () => {
  const wrapper = mount(ConversationPanel, {
    props: { messages: [], busy: true },
  });
  expect(wrapper.get('[data-testid="message-input"]').attributes("disabled")).toBeDefined();
  expect(wrapper.get('[data-testid="send-message"]').attributes("disabled")).toBeDefined();
  expect(wrapper.get('[data-testid="send-message"]').text()).toBe("处理中…");
});

function blueprintMessage(revision = 1): string {
  return `KF_BLUEPRINT_MESSAGE/1\n${JSON.stringify({
    kind: "kf-customer-effect-blueprint",
    version: 1,
    revision,
    blueprint: {
      schema: "kf-design-plan/v2",
      displayName: "个人求职作品集",
      overview: {
        objective: "让招聘经理快速理解候选人的产品与项目成果",
        audiences: ["招聘经理", "面试官"],
        scenarios: ["求职应聘"],
        valueProposition: "用真实感案例证明候选人的能力",
      },
      informationArchitecture: {
        narrative: "从个人定位到产品、项目、履历和联系方式",
        wireframe: "首屏 → 我的产品 → 项目经历 → 履历 → 联系方式",
      },
      modules: [{
        id: "products",
        name: "我的产品",
        purpose: "展示主导或参与的产品",
        content: ["产品定位", "个人职责", "量化成果"],
        sampleData: [{ label: "产品名称", value: "KingFusion 工业低代码平台" }],
        interactions: ["点击产品卡片展开详情"],
        presentation: "大尺寸产品卡片",
      }],
      visualDirection: {
        tone: "专业可信",
        colors: ["深蓝", "暖金"],
        typography: "标题与正文形成清晰层级",
        spacingAndSurfaces: "大留白与轻边框卡片",
      },
      highlights: ["产品与项目形成完整证据链"],
      revisionNotes: {
        added: [revision === 1 ? "完整的产品与项目内容" : "新增独立产品展示区"],
        changed: revision === 1 ? [] : ["项目经历补充背景、职责、方案和成果"],
        retained: revision === 1 ? [] : ["保留专业深蓝风格"],
      },
      acceptanceCriteria: ["至少展示两个包含职责和成果的产品案例"],
      openQuestions: ["是否使用真实头像"],
    },
  })}`;
}

function solutionBlueprintMessage(revision = 1): string {
  return `KF_BLUEPRINT_MESSAGE/1\n${JSON.stringify({
    kind: "kf-customer-effect-blueprint",
    version: 1,
    revision,
    blueprint: {
      schema: "kf-design-plan/v3",
      displayName: "园区访客协同中心",
      objective: "让前台和安保顺畅完成访客预约审核与到访核验",
      audiences: ["园区前台", "安保人员"],
      scenarios: ["预约审核", "到访核验"],
      pages: [
        {
          id: "visitor-overview",
          title: "访客总览",
          purpose: "集中处理当日访客预约",
          readingOrder: ["visitor-list", "visitor-status"],
          regions: [
            {
              id: "visitor-list",
              purpose: "浏览并选择待处理访客",
              semanticRoles: ["记录列表", "选择入口"],
              dataShape: "访客预约记录",
              density: "comfortable",
              importance: "primary",
              content: ["访客姓名", "来访单位", "预约时段"],
              sampleData: [{ 访客姓名: "陈嘉宁", 来访单位: "海岚智造", 预约时段: "14:30" }],
              interactions: ["选择访客后查看预约详情"],
              states: ["待审核", "已通过", "已拒绝"],
              visualIntent: "突出待处理记录并便于扫读",
            },
            {
              id: "visitor-status",
              purpose: "概览今日接待状态",
              semanticRoles: ["状态摘要"],
              dataShape: "状态统计",
              density: "compact",
              importance: "supporting",
              content: ["待审核数量", "已到访数量"],
              sampleData: [{ 待审核数量: "6", 已到访数量: "18" }],
              interactions: [],
              states: ["正常接待"],
              visualIntent: "轻量展示并服务主任务",
            },
          ],
        },
        {
          id: "visitor-detail",
          title: "预约详情",
          purpose: "核验预约并做出审核决定",
          readingOrder: ["visitor-profile"],
          regions: [{
            id: "visitor-profile",
            purpose: "核对访客与来访信息",
            semanticRoles: ["详情", "审核操作"],
            dataShape: "单条预约详情",
            density: "comfortable",
            importance: "primary",
            content: ["证件姓名", "接待人", "来访事由"],
            sampleData: [{ 证件姓名: "陈嘉宁", 接待人: "李雯", 来访事由: "方案评审" }],
            interactions: ["通过或拒绝预约"],
            states: ["核验中", "审核完成"],
            visualIntent: "关键信息与决定入口清楚分组",
          }],
        },
      ],
      journeys: [{
        id: "review-visitor",
        actor: "园区前台",
        goal: "审核一条访客预约",
        steps: [
          { pageId: "visitor-overview", regionId: "visitor-list", action: "选择陈嘉宁的预约", result: "进入预约详情" },
          { pageId: "visitor-detail", regionId: "visitor-profile", action: "核验信息并通过", result: "预约状态更新为已通过" },
        ],
        completion: "前台看到审核成功反馈，安保可核验到访",
      }],
      visualDirection: {
        tone: "专业友好",
        colors: ["深海蓝", "暖橙"],
        typography: "标题、状态和正文层级清楚",
        spacingAndSurfaces: "舒适留白与轻量分区",
      },
      acceptanceScenarios: ["前台可以从总览进入详情并完成预约审核"],
      openQuestions: ["是否需要展示访客头像"],
    },
  })}`;
}

// ---------------------------------------------------------------------------
// parseClarifyingQuestion：识别「问题\n①选项\n②选项」格式
// ---------------------------------------------------------------------------

describe("parseClarifyingQuestion", () => {
  it("parses ①②③ circled options after a question line", () => {
    const parsed = parseClarifyingQuestion("主题是哪种？\n①生产监控\n②设备状态\n③能源管理");
    expect(parsed).toEqual({
      question: "主题是哪种？",
      options: ["①生产监控", "②设备状态", "③能源管理"],
    });
  });

  it("parses numeric options with a 1. 2. prefix", () => {
    const parsed = parseClarifyingQuestion("请选择布局？\n1. 上下结构\n2. 左右结构");
    expect(parsed).toEqual({
      question: "请选择布局？",
      options: ["1. 上下结构", "2. 左右结构"],
    });
  });

  it("returns null for plain text without options", () => {
    expect(parseClarifyingQuestion("正在为你生成设计计划，请稍候…")).toBeNull();
  });

  it("returns null for a single-line question", () => {
    expect(parseClarifyingQuestion("请补充更多需求细节")).toBeNull();
  });

  it("returns null when more than five options are present", () => {
    const content = "请选择？\n①a\n②b\n③c\n④d\n⑤e\n⑥f";
    expect(parseClarifyingQuestion(content)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseDesignPlan：识别 Task 6 formatDesignPlan 输出的「设计计划 vN」文本
// ---------------------------------------------------------------------------

describe("parseDesignPlan", () => {
  // 与 formatDesignPlan 真实输出一致：问候语首行 + 「设计计划 v1」标题行
  const planText = [
    "您好，我已根据您的需求整理出一份设计草案，请您过目：",
    "设计计划 v1",
    "工程名：客户展示大屏",
    "摘要：面向展厅的大屏监控界面，展示实时数据",
    "布局：上下结构，顶部标题栏，中部主监控区，底部状态栏",
    "风格：深色科技风，蓝紫渐变",
    "分区：",
    "  标题区：Text(客户展示大屏)、Text(实时监控)",
    "  监控区：Chart(能耗趋势)、Gauge(设备负载)",
    "  状态区：Text(系统状态)",
    "记忆点：深色底 + 蓝紫渐变 + 实时数据",
    "您可以随时告诉我哪里需要调整；确认没问题的话，回复「确认」即可。",
  ].join("\n");

  it("parses the full design plan format and extracts every field", () => {
    const plan = parseDesignPlan(planText);
    expect(plan).not.toBeNull();
    expect(plan!.version).toBe("v1");
    expect(plan!.engineeringName).toBe("客户展示大屏");
    expect(plan!.summary).toContain("展厅");
    expect(plan!.layout).toContain("上下结构");
    expect(plan!.style).toContain("深色科技风");
    expect(plan!.signature).toContain("蓝紫渐变");
    expect(plan!.sections).toEqual([
      { label: "标题区", controls: "Text(客户展示大屏)、Text(实时监控)" },
      { label: "监控区", controls: "Chart(能耗趋势)、Gauge(设备负载)" },
      { label: "状态区", controls: "Text(系统状态)" },
    ]);
  });

  it("returns null for content that does not start with 设计计划", () => {
    expect(parseDesignPlan("好的，我来设计一个监控大屏")).toBeNull();
  });

  it("parses a design plan whose first line is a greeting (warm-professional copy)", () => {
    const view = parseDesignPlan(
      "您好，我已根据您的需求整理出一份设计草案，请您过目：\n设计计划 v1\n工程名：监控大屏\n分区：\n  中部趋势区：text\n记忆点：深色工业风",
    );
    expect(view).not.toBeNull();
    expect(view?.engineeringName).toBe("监控大屏");
    expect(view?.version).toBe("v1");
  });

  it("returns null when the header matches but no plan fields follow", () => {
    expect(parseDesignPlan("设计计划\n请稍候")).toBeNull();
  });
});

describe("parseCustomerEffectBlueprint", () => {
  it("parses every customer-visible section from a versioned blueprint message", () => {
    const view = parseCustomerEffectBlueprint(blueprintMessage());
    expect(view?.schema).toBe("kf-design-plan/v2");
    if (view?.schema !== "kf-design-plan/v2") throw new Error("expected a v2 blueprint view");
    expect(view?.revision).toBe(1);
    expect(view?.displayName).toBe("个人求职作品集");
    expect(view?.overview.objective).toContain("招聘经理");
    expect(view?.modules[0]?.name).toBe("我的产品");
    expect(view?.modules[0]?.sampleData[0]).toEqual({
      label: "产品名称",
      value: "KingFusion 工业低代码平台",
    });
    expect(view?.modules[0]?.interactions).toEqual(["点击产品卡片展开详情"]);
    expect(view?.acceptanceCriteria).toEqual(["至少展示两个包含职责和成果的产品案例"]);
  });

  it("returns null for malformed or ordinary messages", () => {
    expect(parseCustomerEffectBlueprint("普通回复")).toBeNull();
    expect(parseCustomerEffectBlueprint("KF_BLUEPRINT_MESSAGE/1\n{broken")).toBeNull();
  });

  it("parses a bounded v3 solution blueprint envelope into a typed customer view", () => {
    const view = parseCustomerEffectBlueprint(solutionBlueprintMessage());

    expect(view).toMatchObject({
      schema: "kf-design-plan/v3",
      revision: 1,
      displayName: "园区访客协同中心",
      objective: expect.stringContaining("访客预约审核"),
      pages: [
        expect.objectContaining({
          title: "访客总览",
          readingOrder: ["visitor-list", "visitor-status"],
          regions: [expect.objectContaining({
            states: ["待审核", "已通过", "已拒绝"],
            interactions: ["选择访客后查看预约详情"],
          }), expect.any(Object)],
        }),
        expect.objectContaining({ title: "预约详情" }),
      ],
      journeys: [expect.objectContaining({ completion: expect.stringContaining("审核成功") })],
      acceptanceScenarios: ["前台可以从总览进入详情并完成预约审核"],
    });
  });

  it("rejects an otherwise valid v3 envelope that exceeds the bounded page count", () => {
    const envelope = JSON.parse(solutionBlueprintMessage().slice("KF_BLUEPRINT_MESSAGE/1\n".length));
    envelope.blueprint.pages = Array.from({ length: 9 }, (_, index) => ({
      ...envelope.blueprint.pages[0],
      id: `page-${index}`,
      regions: envelope.blueprint.pages[0].regions.map((region: Record<string, unknown>, regionIndex: number) => ({
        ...region,
        id: `region-${index}-${regionIndex}`,
      })),
      readingOrder: ["region-0-0"],
    }));

    expect(parseCustomerEffectBlueprint(`KF_BLUEPRINT_MESSAGE/1\n${JSON.stringify(envelope)}`)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ConversationPanel 增强渲染：澄清可点选 / 计划卡片 / 纯文本仍转义
// ---------------------------------------------------------------------------

describe("ConversationPanel enriched rendering", () => {
  it("renders a clarifying question with clickable options that emit send", async () => {
    const wrapper = mount(ConversationPanel, {
      props: {
        messages: [{ role: "assistant", content: "主题是哪种？\n①生产监控\n②设备状态" }],
      },
    });
    expect(wrapper.text()).toContain("主题是哪种？");
    const options = wrapper.findAll('[data-testid="clarify-option"]');
    expect(options.length).toBe(2);
    expect(options[0]!.text()).toBe("①生产监控");
    await options[1]!.trigger("click");
    const sends = wrapper.emitted("send");
    expect(sends).toBeTruthy();
    expect(sends?.[0]?.[0]).toBe("②设备状态");
  });

  it("renders a design plan as a structured card with sections and a confirm button", async () => {
    const planText = [
      "设计计划 v2",
      "工程名：客户展示大屏",
      "摘要：面向展厅的监控界面",
      "布局：上下结构",
      "风格：深色科技风",
      "分区：",
      "  监控区：Chart(能耗趋势)、Gauge(设备负载)",
      "  状态区：Text(系统状态)",
      "记忆点：蓝紫渐变",
      "回复调整意见或「确认」",
    ].join("\n");
    const wrapper = mount(ConversationPanel, {
      props: { messages: [{ role: "assistant", content: planText }] },
    });
    expect(wrapper.find('[data-testid="design-plan-card"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("客户展示大屏");
    expect(wrapper.text()).toContain("监控区");
    expect(wrapper.text()).toContain("蓝紫渐变");
    const confirm = wrapper.get('[data-testid="plan-confirm"]');
    await confirm.trigger("click");
    const sends = wrapper.emitted("send");
    expect(sends).toBeTruthy();
    expect(sends?.[0]?.[0]).toBe("确认");
  });

  it("renders a complete first customer effect blueprint without exposing the internal schema", async () => {
    const wrapper = mount(ConversationPanel, {
      props: { messages: [{ role: "assistant", content: blueprintMessage() }] },
    });
    const card = wrapper.get('[data-testid="effect-blueprint-card"]');
    expect(card.find(".plan-badge").text()).toBe("效果蓝图");
    expect(card.find(".plan-version").text()).toBe("v1");
    expect(wrapper.text()).toContain("方案目标");
    expect(wrapper.text()).toContain("我的产品");
    expect(wrapper.text()).toContain("KingFusion 工业低代码平台");
    expect(wrapper.text()).toContain("点击产品卡片展开详情");
    expect(wrapper.text()).toContain("最终验收效果");
    expect(wrapper.text()).toContain("至少展示两个包含职责和成果的产品案例");
    expect(wrapper.text()).not.toContain("kf-design-plan/v2");

    await wrapper.get('[data-testid="blueprint-confirm"]').trigger("click");
    expect(wrapper.emitted("send")?.[0]?.[0]).toBe("确认");
  });

  it("renders every customer-review boundary of a v3 blueprint and emits its confirmation", async () => {
    const wrapper = mount(ConversationPanel, {
      props: { messages: [{ role: "assistant", content: solutionBlueprintMessage() }] },
    });

    const card = wrapper.get('[data-testid="solution-blueprint-card"]');
    const text = card.text();
    expect(text).toContain("园区访客协同中心");
    expect(text).toContain("访客总览");
    expect(text).toContain("预约详情");
    expect(text).toContain("访客姓名");
    expect(text).toContain("待审核");
    expect(text).toContain("选择访客后查看预约详情");
    expect(text).toContain("审核一条访客预约");
    expect(text).toContain("专业友好");
    expect(text).toContain("前台可以从总览进入详情并完成预约审核");
    expect(text).not.toContain("kf-design-plan/v3");

    await card.get('[data-testid="blueprint-confirm"]').trigger("click");
    expect(wrapper.emitted("send")?.[0]?.[0]).toBe("确认");
  });

  it("does not let a confirmed historical blueprint submit another confirmation", () => {
    const wrapper = mount(ConversationPanel, {
      props: {
        messages: [
          { id: "blueprint-1", role: "assistant", content: blueprintMessage() },
          { id: "confirm-1", role: "user", content: "确认" },
          { id: "preview-1", role: "assistant", content: "预览已生成，您可以查看实际效果。" },
        ],
      },
    });

    expect(wrapper.find('[data-testid="blueprint-confirm"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="blueprint-status"]').text()).toBe("已确认");
    expect(wrapper.emitted("send")).toBeUndefined();
  });

  it("allows retrying a blueprint confirmation after implementation planning failed", async () => {
    const wrapper = mount(ConversationPanel, {
      props: {
        messages: [
          { id: "blueprint-1", role: "assistant", content: blueprintMessage() },
          { id: "confirm-1", role: "user", content: "确认" },
          {
            id: "failure-1",
            role: "assistant",
            content: "工程实施计划暂未生成：模型输出不完整。请点击下方按钮重试。",
          },
        ],
      },
    });

    const retry = wrapper.get('[data-testid="blueprint-confirm"]');
    expect(retry.text()).toContain("重新生成工程实施计划");
    await retry.trigger("click");
    expect(wrapper.emitted("send")?.[0]?.[0]).toBe("重新生成工程实施计划");
  });

  it("shows substantive changes before module details on later revisions", () => {
    const wrapper = mount(ConversationPanel, {
      props: { messages: [{ role: "assistant", content: blueprintMessage(2) }] },
    });
    const text = wrapper.text();
    expect(wrapper.find(".plan-version").text()).toBe("v2");
    expect(text).toContain("本次更新");
    expect(text.indexOf("新增独立产品展示区")).toBeLessThan(text.indexOf("我的产品"));
  });

  it("keeps plain-text assistant messages escaped (no v-html)", async () => {
    const wrapper = mount(ConversationPanel, {
      props: { messages: [{ role: "assistant", content: "<b>计划已生成</b>" }] },
    });
    expect(wrapper.find("b").exists()).toBe(false);
    expect(wrapper.html()).not.toContain("<b>计划已生成</b>");
    expect(wrapper.text()).toContain("&lt;b&gt;计划已生成&lt;/b&gt;");
  });

  it("never renders technical ModulePlan or ChangePlan JSON as conversation content", () => {
    const technical = JSON.stringify({
      schema: "kf-module-plan/v1",
      operations: [{ op: "add", moduleId: "internal-hero" }],
      changePlan: { schema: "kf-change-plan/v1", signature: "server-secret" },
    });
    const wrapper = mount(ConversationPanel, {
      props: { messages: [{ role: "assistant", content: technical }] },
    });

    expect(wrapper.text()).toContain("工程正在按已确认的效果蓝图生成");
    expect(wrapper.text()).not.toMatch(/kf-module-plan|kf-change-plan|internal-hero|server-secret/);
  });
});
