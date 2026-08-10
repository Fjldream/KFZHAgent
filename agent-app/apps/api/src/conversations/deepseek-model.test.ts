// @ts-nocheck -- mock-fetch 场景的 JS 风格测试；行为由 vitest 断言验证。
import { describe, expect, it, vi } from "vitest";
import { DeepSeekModelPort, extractJson, DeepSeekModelOutputError } from "./deepseek-model.js";

function makePort(reply: unknown, status = 200) {
  const fetchImpl = vi.fn().mockResolvedValue({
    ok: status === 200,
    status,
    text: () => Promise.resolve("boom"),
    json: () =>
      Promise.resolve({
        choices: [{ message: { content: typeof reply === "string" ? reply : JSON.stringify(reply) } }],
      }),
  });
  return new DeepSeekModelPort({ apiKey: "test-key", fetch: fetchImpl, baseUrl: "https://mock.local" });
}

function detailedBlueprint(overrides: Record<string, unknown> = {}) {
  return {
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
    modules: [
      {
        id: "products",
        name: "我的产品",
        purpose: "展示主导或参与的产品",
        content: ["产品定位", "个人职责", "量化成果"],
        sampleData: [{ label: "产品名称", value: "KingFusion 工业低代码平台" }],
        interactions: ["点击产品卡片展开详情"],
        presentation: "大尺寸产品卡片",
      },
      {
        id: "projects",
        name: "项目经历",
        purpose: "展示项目背景、职责、方案和成果",
        content: ["项目背景", "个人职责", "解决方案", "量化成果"],
        sampleData: [{ label: "项目名称", value: "汽车工厂能源管理平台" }],
        interactions: ["展开项目详情"],
        presentation: "纵向时间线",
      },
    ],
    visualDirection: {
      tone: "专业可信",
      colors: ["深蓝", "暖金"],
      typography: "标题与正文形成清晰层级",
      spacingAndSurfaces: "大留白与轻边框卡片",
    },
    highlights: ["产品与项目形成完整证据链"],
    revisionNotes: { added: ["完整客户效果蓝图"], changed: [], retained: [] },
    acceptanceCriteria: ["至少展示两个产品案例和三个完整项目案例"],
    openQuestions: ["是否使用真实头像"],
    ...overrides,
  };
}

describe("extractJson", () => {
  it("parses plain JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it("strips markdown fences", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it("tolerates leading/trailing prose", () => {
    expect(extractJson('here you go {"a":1} done')).toEqual({ a: 1 });
  });
  it("rejects missing JSON", () => {
    expect(() => extractJson("no json here")).toThrow(DeepSeekModelOutputError);
  });
});

describe("DeepSeekModelPort", () => {
  it("classifyIntent routes a real requirement to NEW_REQUIREMENT", async () => {
    const port = makePort({ intent: "NEW_REQUIREMENT", requestedDomains: ["kingclient"], reply: "好的" });
    const result = await port.classifyIntent({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [{ role: "user", content: "新建一个客户端工程" }],
      requirementText: "新建一个客户端工程",
    });
    expect(result.intent).toBe("NEW_REQUIREMENT");
  });

  it("classifyIntent falls back to QUESTION on invalid output", async () => {
    const port = makePort({ intent: "INVENTED_INTENT" });
    const result = await port.classifyIntent({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [],
    });
    expect(result.intent).toBe("QUESTION");
  });

  it("classifyIntent returns CLARIFY with a question when the requirement is underspecified", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: "CLARIFY",
                requestedDomains: ["kingclient"],
                needsClarification: true,
                clarifyingQuestion: {
                  question: "主题是哪种？",
                  options: ["①生产监控", "②设备状态", "③能源管理"],
                },
              }),
            },
          },
        ],
      }),
    });
    const port = new DeepSeekModelPort({
      apiKey: "test-key",
      fetch: fetchImpl,
      baseUrl: "https://mock.local",
    });
    const result = await port.classifyIntent({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [{ role: "user", content: "做一个大屏" }],
      requirementText: "做一个大屏",
    });
    expect(result.intent).toBe("CLARIFY");
    expect(result.clarifyingQuestion?.question).toBe("主题是哪种？");
    expect(result.clarifyingQuestion?.options?.length).toBeGreaterThan(0);
    expect(result.needsClarification).toBe(true);
    // 澄清引导必须出现在 prompt 里：CLARIFY 是可选意图，且信息不足时禁止猜测需求。
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    const userPrompt = body.messages[1].content;
    expect(userPrompt).toContain("CLARIFY");
    expect(userPrompt).toContain("禁止猜测需求");
  });

  it("classifyIntent backfills a default question when the model emits CLARIFY without one", async () => {
    const port = makePort({ intent: "CLARIFY", requestedDomains: ["kingclient"] });
    const result = await port.classifyIntent({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [{ role: "user", content: "做一个大屏" }],
      requirementText: "做一个大屏",
    });
    expect(result.intent).toBe("CLARIFY");
    expect(result.clarifyingQuestion?.question.length).toBeGreaterThan(0);
    expect(result.needsClarification).toBe(true);
  });

  it("classifyIntent user prompt enforces polite greeting and numbered clarifying options", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({ intent: "NEW_REQUIREMENT", requestedDomains: ["kingclient"] }),
            },
          },
        ],
      }),
    });
    const port = new DeepSeekModelPort({
      apiKey: "test-key",
      fetch: fetchImpl,
      baseUrl: "https://mock.local",
    });
    await port.classifyIntent({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [{ role: "user", content: "做一个大屏" }],
      requirementText: "做一个大屏",
    });
    // 澄清 prompt 约束必须落地：礼貌开场格式、序号强制、序号符号白名单。
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    const userPrompt = body.messages[1].content;
    expect(userPrompt).toContain("您好，为了帮您把方案做得更贴合需求");
    expect(userPrompt).toContain("请选择或直接告诉我");
    expect(userPrompt).toContain("选项必须带序号");
    expect(userPrompt).toContain("①②③④⑤");
    // persona 首句（客服顾问口吻）必须注入 SYSTEM_PROMPT
    expect(body.messages[0].content).toContain("你以礼貌、专业的客服顾问口吻与客户沟通");
  });

  it("classifyIntent prompt includes design-review and preview-review intents", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: "REVISE_DESIGN",
                requestedDomains: ["kingclient"],
              }),
            },
          },
        ],
      }),
    });
    const port = new DeepSeekModelPort({
      apiKey: "test-key",
      fetch: fetchImpl,
      baseUrl: "https://mock.local",
    });

    await port.classifyIntent({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [{ role: "user", content: "增加项目经历" }],
      requirementText: "增加项目经历",
    });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    const userPrompt = body.messages[1].content;
    expect(userPrompt).toContain("CONFIRM_DESIGN");
    expect(userPrompt).toContain("REVISE_DESIGN");
    expect(userPrompt).toContain("CONFIRM_BUILD");
  });

  it("passes through numbered clarifying options verbatim", async () => {
    const port = makePort({
      intent: "CLARIFY",
      requestedDomains: ["kingclient"],
      needsClarification: true,
      clarifyingQuestion: {
        question: "您希望监控哪个场景？",
        options: ["① 生产车间监控", "② 机房设备监控", "③ 能源管理"],
      },
    });
    const result = await port.classifyIntent({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [{ role: "user", content: "做一个大屏" }],
      requirementText: "做一个大屏",
    });
    expect(result.intent).toBe("CLARIFY");
    // 全部选项原样透传（含序号），证明「verbatim」语义
    expect(result.clarifyingQuestion?.options).toEqual([
      "① 生产车间监控",
      "② 机房设备监控",
      "③ 能源管理",
    ]);
  });

  it("createProjectDesign assembles a valid SolutionIR", async () => {
    const port = makePort({ displayName: "演示工程" });
    const design = await port.createProjectDesign({
      tenantId: "t",
      userId: "u",
      workspaceId: "ws-1",
      conversationId: "c",
      recentMessages: [],
      requirementText: "生成一个工程",
    });
    expect(design.schema).toBe("kf-solution-ir/v1");
    expect(design.displayName).toBe("演示工程");
    expect(Array.isArray(design.projects)).toBe(true);
  });

  it("createDesignPlan returns a complete customer effect blueprint from the first revision", async () => {
    const plan = detailedBlueprint();
    const port = makePort(plan);
    const result = await port.createDesignPlan({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [],
      requirementText: "做一个监控大屏",
    });
    expect(result.schema).toBe("kf-design-plan/v2");
    expect(result.displayName).toBe("个人求职作品集");
    expect(result.modules.map((module) => module.name)).toEqual(["我的产品", "项目经历"]);
    expect(result.modules[0].sampleData[0].value).toBe("KingFusion 工业低代码平台");
    expect(result.acceptanceCriteria).toEqual(["至少展示两个产品案例和三个完整项目案例"]);
  });

  it("createDesignPlan prompt preserves the initial requirement and clarification answer", async () => {
    const plan = detailedBlueprint();
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
      recentMessages: [
        { role: "user", content: "个人简历网站" },
        { role: "assistant", content: "网站主要面向什么场景？" },
        { role: "user", content: "① 求职应聘" },
      ],
      requirementText: "① 求职应聘",
    });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    const userPrompt = body.messages[1].content;
    expect(userPrompt).toContain("个人简历网站");
    expect(userPrompt).toContain("① 求职应聘");
    expect(userPrompt).toContain("第一次生成");
    expect(userPrompt).toContain("示例数据");
    expect(userPrompt).toContain("验收标准");
    expect(userPrompt).toContain("客户看不到内部");
    expect(body.max_tokens).toBe(8000);
  });

  it("createDesignPlan rejects output that fails the zod gate", async () => {
    const port = makePort({
      schema: "kf-design-plan/v1",
      displayName: "x",
      summary: "s",
      layoutConcept: "l",
      styleDirection: "d",
      sections: [{ id: "s1", label: "区", controls: [{ type: "gauge" }] }],
      signature: "sig",
    });
    await expect(
      port.createDesignPlan({ tenantId: "t", userId: "u", workspaceId: "w", conversationId: "c", recentMessages: [] }),
    ).rejects.toThrow(DeepSeekModelOutputError);
  });

  it("createDesignPlan injects the previous plan and revision notes when revising", async () => {
    const previousPlan = {
      schema: "kf-design-plan/v1",
      displayName: "监控大屏",
      summary: "旧版",
      layoutConcept: "顶部标题 + 中部趋势区",
      styleDirection: "深色工业风",
      sections: [{ id: "kpi", label: "KPI 区", controls: [{ type: "text", text: "产量" }] }],
      signature: "趋势联动 KPI",
    };
    const revised = detailedBlueprint({
      revisionNotes: {
        added: ["新增我的产品模块"],
        changed: ["项目经历补充背景、职责、方案和成果"],
        retained: ["保留个人介绍"],
      },
    });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify(revised),
            },
          },
        ],
      }),
    });
    const port = new DeepSeekModelPort({
      apiKey: "test-key",
      fetch: fetchImpl,
      baseUrl: "https://mock.local",
    });
    const result = await port.createDesignPlan(
      {
        tenantId: "t",
        userId: "u",
        workspaceId: "w",
        conversationId: "c",
        recentMessages: [],
        requirementText: "把大标题改成红色",
        designPlan: previousPlan,
      },
      {
        revising: true,
        rejectionReasons: ["蓝图主体没有实质变化", "修订没有声明新增或调整内容"],
      },
    );
    expect(result.schema).toBe("kf-design-plan/v2");
    // 修订上下文必须出现在 user prompt：上一版计划 + 客户修改意见 + 修订指令。
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    const userPrompt = body.messages[1].content;
    expect(userPrompt).toContain("上一版设计计划");
    expect(userPrompt).toContain(JSON.stringify(previousPlan));
    expect(userPrompt).toContain("把大标题改成红色");
    expect(userPrompt).toContain("在上一版基础上修订");
    expect(userPrompt).toContain("蓝图主体没有实质变化");
    expect(userPrompt).toContain("不要只改 revisionNotes");
  });

  it("createChangePlan keeps only operations referencing known entity GUIDs", async () => {
    const knownGuid = "11111111-1111-4111-8111-111111111111";
    const port = makePort({
      operations: [
        { op: "update", entityId: knownGuid, entityType: "text", changes: [{ path: "/text", value: "hello" }] },
        { op: "update", entityId: "hallucinated-guid", entityType: "text", changes: [{ path: "/text", value: "x" }] },
      ],
    });
    const plan = await port.createChangePlan({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [],
      requirementText: "把标题改成 hello",
      revisionSummary: "页面 Page1；共 1 页",
      editableEntities: [{ kind: "control", name: "Text1", type: "text", guid: knownGuid }],
    });
    expect(plan.operations).toHaveLength(1);
    expect(plan.operations[0].entityId).toBe(knownGuid);
  });

  it("system prompt exposes easyui and layout container generation capability", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({ intent: "NEW_REQUIREMENT", requestedDomains: ["kingclient"] }),
            },
          },
        ],
      }),
    });
    const port = new DeepSeekModelPort({
      apiKey: "test-key",
      fetch: fetchImpl,
      baseUrl: "https://mock.local",
    });
    await port.classifyIntent({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [{ role: "user", content: "做一个大屏" }],
      requirementText: "做一个大屏",
    });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    const system = body.messages[0].content;
    // 静态控件清单之后必须跟随容器能力（easyui 容器 + 布局容器）。
    expect(system).toContain("容器类");
    expect(system).toContain("datagrid");
    expect(system).toContain("linkbutton");
    expect(system).toContain("treegrid");
    expect(system).toContain("sidemenu");
    expect(system).toContain("propertygrid");
    // 布局容器 layout 语义（layoutType + children 递归嵌套）。
    expect(system).toContain("布局容器 layout");
    expect(system).toContain("layoutType");
    expect(system).toContain("2=水平");
    expect(system).toContain("4=垂直");
    expect(system).toContain("3=选项卡");
    expect(system).toContain("5=Docking");
    expect(system).toContain("0=折叠");
    expect(system).toContain("6=导航");
    expect(system).toContain("children");
    expect(system).toContain("递归");
    expect(system).toContain("承载");
  });

  it("system prompt exposes KF special nodes (prototype) as complex-config passthrough", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({ intent: "NEW_REQUIREMENT", requestedDomains: ["kingclient"] }),
            },
          },
        ],
      }),
    });
    const port = new DeepSeekModelPort({
      apiKey: "test-key",
      fetch: fetchImpl,
      baseUrl: "https://mock.local",
    });
    await port.classifyIntent({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [{ role: "user", content: "做一个带趋势图和报警窗口的大屏" }],
      requirementText: "做一个带趋势图和报警窗口的大屏",
    });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    const system = body.messages[0].content;
    // 特殊节点段必须出现：prototype 判别 + 全部 7 种 prototypeName。
    expect(system).toContain("prototype");
    for (const node of [
      "CustomCharts",
      "AlarmWindow",
      "EventWindow",
      "TrendChart",
      "BarChart",
      "PieChart",
      "XYChart",
    ]) {
      expect(system).toContain(node);
    }
    // 复杂配置不对话生成、原样保留；图表占位（KF 渲染才出真图）。
    expect(system).toContain("复杂配置");
    expect(system).toContain("原样保留");
    expect(system).toContain("type=prototype");
    expect(system).toContain("prototypeName");
    expect(system).toContain("KF 渲染");
    expect(system).toContain("占位");
  });

  it("createChangePlan prompt whitelists prototype in create type union", async () => {
    const pageGuid = "22222222-2222-4222-8222-222222222222";
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ operations: [] }) } }] }),
    });
    const port = new DeepSeekModelPort({
      apiKey: "test-key",
      fetch: fetchImpl,
      baseUrl: "https://mock.local",
    });
    await port.createChangePlan({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [],
      requirementText: "加一个趋势图",
      revisionSummary: "页面 Page1；共 1 页",
      editableEntities: [
        { kind: "page", name: "Page1", type: "page", guid: pageGuid },
        { kind: "control", name: "Text1", type: "text", guid: "11111111-1111-4111-8111-111111111111" },
      ],
    });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    const userPrompt = body.messages[1].content;
    // create 类型白名单（| 分隔的联合）必须包含 prototype。
    expect(userPrompt).toContain("|prototype");
  });

  it("createChangePlan keeps create ops whose pageId hits a known page GUID", async () => {
    const pageGuid = "22222222-2222-4222-8222-222222222222";
    const port = makePort({
      operations: [
        { op: "create", entityType: "control", entityId: "NewTitle", properties: { pageId: pageGuid, type: "text", text: "hi", x: 60, y: 50 } },
        { op: "create", entityType: "control", entityId: "Bad", properties: { pageId: "invented-page", type: "text" } },
      ],
    });
    const plan = await port.createChangePlan({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [],
      requirementText: "加一个标题",
      revisionSummary: "页面 Page1；共 1 页",
      editableEntities: [
        { kind: "page", name: "Page1", type: "page", guid: pageGuid },
        { kind: "control", name: "Text1", type: "text", guid: "11111111-1111-4111-8111-111111111111" },
      ],
    });
    expect(plan.operations).toHaveLength(1);
    expect(plan.operations[0].entityId).toBe("NewTitle");
  });

  it("reviseChangePlan rejects a plan with no valid operations", async () => {
    const port = makePort({ operations: [{ op: "update", entityId: "nope", changes: [] }] });
    await expect(
      port.reviseChangePlan({
        tenantId: "t",
        userId: "u",
        workspaceId: "w",
        conversationId: "c",
        recentMessages: [],
        requirementText: "再改一下",
        editableEntities: [],
      }),
    ).rejects.toThrow(DeepSeekModelOutputError);
  });

  it("explainValidation extracts the explanation field", async () => {
    const port = makePort({ explanation: "校验通过，无问题" });
    const text = await port.explainValidation({
      tenantId: "t",
      report: { status: "pass", checks: {}, warnings: [] },
    });
    expect(text).toBe("校验通过，无问题");
  });

  it("propagates non-200 api responses as DeepSeekModelOutputError", async () => {
    const port = makePort({}, 401);
    await expect(port.classifyIntent({ tenantId: "t", userId: "u", workspaceId: "w", conversationId: "c", recentMessages: [] })).rejects.toThrow(DeepSeekModelOutputError);
  });
});
