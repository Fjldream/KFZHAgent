// @ts-nocheck -- mock-fetch 场景的 JS 风格测试；行为由 vitest 断言验证。
import { describe, expect, it, vi } from "vitest";
import { canonicalModuleCompilationHash } from "@kf/contracts";
import { createHmacModuleArtifactAuthority } from "@kf/build-jobs";
import { compileModulePlan, createDefaultModuleRegistry } from "@kf/domain-client";
import { DeepSeekModelPort, deriveExactModulePlanOperations, extractJson, DeepSeekModelOutputError, validateModulePlanForContext } from "./deepseek-model.js";
import { DeterministicFakeModelPort } from "./fake-model.js";

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

function uiImplementation(overrides: Record<string, unknown> = {}) {
  return {
    schema: "kf-ui-implementation/v1",
    theme: {
      background: "#0f172a",
      surface: "#111827",
      primary: "#2563eb",
      accent: "#38bdf8",
      textPrimary: "#f8fafc",
      textSecondary: "#cbd5e1",
      fontFamily: "Arial",
      spacingUnit: 8,
      radiusScale: { small: 4, medium: 8, large: 16 },
    },
    pages: [{
      id: "Page1",
      width: 1440,
      height: 900,
      components: [
        {
          id: "ProductsTitle",
          role: "section-heading",
          sourceModuleId: "products",
          capabilityId: "text",
          critical: true,
          content: "我的产品",
          geometry: { x: 60, y: 80, width: 300, height: 40 },
          properties: {},
          style: { declarations: { fontSize: 26, textColor: "{theme.textPrimary}" }, states: {} },
        },
        {
          id: "ProjectsTitle",
          role: "section-heading",
          sourceModuleId: "projects",
          capabilityId: "text",
          critical: true,
          content: "项目经历",
          geometry: { x: 60, y: 180, width: 300, height: 40 },
          properties: {},
          style: { declarations: { fontSize: 26, textColor: "{theme.textPrimary}" }, states: {} },
        },
      ],
    }],
    ...overrides,
  };
}

function modulePlanningContext(overrides: Record<string, unknown> = {}) {
  const blueprint = detailedBlueprint({
    modules: [
      {
        id: "products",
        name: "我的产品",
        purpose: "展示产品能力",
        content: ["产品定位"],
        sampleData: [{ label: "产品", value: "KingFusion" }],
        interactions: [],
        expectedKind: "content.hero",
        presentation: "首屏介绍",
      },
      {
        id: "projects",
        name: "项目经历",
        purpose: "展示项目成果",
        content: ["项目成果"],
        sampleData: [{ label: "项目", value: "工业平台" }],
        interactions: [],
        expectedKind: "content.timeline",
        presentation: "纵向时间线",
      },
    ],
  });
  const authority = createHmacModuleArtifactAuthority(new Uint8Array(32).fill(7));
  const signed = authority.signAcceptedBlueprint({
    schema: "kf-accepted-blueprint-artifact/v1",
    projectKey: "kingclient.portal",
    revisionId: "revision-1",
    blueprintHash: canonicalModuleCompilationHash(blueprint),
    modules: [
      { blueprintModuleId: "products", expectedKind: "content.hero", expectedCategory: "content", interactionRequirements: [] },
      { blueprintModuleId: "projects", expectedKind: "content.timeline", expectedCategory: "content", interactionRequirements: [] },
    ],
  });
  const acceptedBlueprintArtifact = authority.verifyAcceptedBlueprint(signed);
  return {
    tenantId: "t",
    userId: "u",
    workspaceId: "w",
    conversationId: "c",
    currentProjectKey: "kingclient.portal",
    currentRevisionId: "revision-1",
    recentMessages: [{ role: "user", content: "创建个人作品集" }],
    requirementText: "创建个人作品集",
    confirmedBlueprint: blueprint,
    acceptedBlueprintArtifact,
    modulePlanningCatalog: [
      {
        kind: "content.hero",
        version: "1.0.0",
        maturity: "stable",
        variants: ["no-portrait"],
        slots: [],
        interactions: [],
        layout: { regions: ["main"], minColumnSpan: 6, maxColumnSpan: 12, preferredHeights: ["large"] },
      },
      {
        kind: "content.timeline",
        version: "1.0.0",
        maturity: "stable",
        variants: ["experience"],
        slots: [],
        interactions: [],
        layout: { regions: ["main"], minColumnSpan: 6, maxColumnSpan: 12, preferredHeights: ["medium"] },
      },
      {
        kind: "data.table",
        version: "1.0.0",
        maturity: "beta",
        variants: ["default"],
        slots: [],
        interactions: [],
        layout: { regions: ["main"], minColumnSpan: 6, maxColumnSpan: 12, preferredHeights: ["medium"] },
      },
    ],
    assetCatalog: [{ id: "portrait", kind: "image", name: "头像", mimeType: "image/png", description: "已上传头像" }],
    ...overrides,
  };
}

function modulePlan(overrides: Record<string, unknown> = {}) {
  return {
    schema: "kf-module-plan/v1",
    projectKey: "kingclient.portal",
    theme: {
      background: "#0f172a", surface: "#111827", primary: "#2563eb", accent: "#38bdf8",
      textPrimary: "#f8fafc", textSecondary: "#cbd5e1", fontFamily: "Arial", spacingUnit: 8,
      radiusScale: { small: 4, medium: 8, large: 16 },
    },
    assets: [{ id: "portrait", kind: "image", name: "头像", mimeType: "image/png", description: "已上传头像" }],
    pages: [{
      id: "home", title: "个人作品集", mode: "vertical-flow",
      modules: [
        {
          id: "productsHero", kind: "content.hero", templateVersion: "1.0.0", variant: "no-portrait",
          title: "我的产品", content: '{"title":"KingFusion"}', sourceBlueprintModuleIds: ["products"],
          placement: { region: "main", order: 0, columnSpan: 12, preferredHeight: "large", alignment: "stretch", emphasis: "primary" },
          interactions: [],
        },
        {
          id: "projectsTimeline", kind: "content.timeline", templateVersion: "1.0.0", variant: "experience",
          title: "项目经历", content: '{"items":["工业平台"]}', sourceBlueprintModuleIds: ["projects"],
          placement: { region: "main", order: 1, columnSpan: 12, preferredHeight: "medium", alignment: "stretch", emphasis: "secondary" },
          interactions: [],
        },
      ],
    }],
    operations: [],
    ...overrides,
  };
}

function fakeCompileContext(kind: string) {
  const initialRegistry = createDefaultModuleRegistry();
  const definition = initialRegistry.require(kind, "1.0.0");
  const target = definition.runtimeEvidenceTarget!;
  const registry = createDefaultModuleRegistry([{
    kind, version: definition.version, runtimeFamily: target.runtimeFamily,
    runtimeVersion: target.runtimeVersion, baselineId: target.baselineId,
    verifiedCapabilities: [...definition.requiredKfCapabilities],
  }]);
  const blueprint = detailedBlueprint({
    displayName: `${kind} 测试`,
    modules: [{
      id: "module", name: "测试模块", purpose: "验证确定性 fake 模块规划", content: ["测试内容"],
      sampleData: [{ label: "名称", value: "示例" }], interactions: [], presentation: "测试",
      expectedKind: kind,
    }],
  });
  const authority = createHmacModuleArtifactAuthority(new Uint8Array(32).fill(11));
  const acceptedBlueprintArtifact = authority.verifyAcceptedBlueprint(authority.signAcceptedBlueprint({
    schema: "kf-accepted-blueprint-artifact/v1", projectKey: "kingclient.portal", revisionId: "revision-fake",
    blueprintHash: canonicalModuleCompilationHash(blueprint),
    modules: [{ blueprintModuleId: "module", expectedKind: kind, expectedCategory: definition.category, interactionRequirements: [] }],
  }));
  return {
    tenantId: "t", userId: "u", workspaceId: "w", conversationId: "c",
    currentProjectKey: "kingclient.portal", currentRevisionId: "revision-fake", recentMessages: [],
    requirementText: "生成工程", confirmedBlueprint: blueprint, acceptedBlueprintArtifact,
    modulePlanningCatalog: registry.listForPlanning(), assetCatalog: [], registry, definition,
  };
}

function fakeCompileContextForKinds(kinds: readonly string[]) {
  // The accepted artifact, registry evidence and catalog are deliberately built
  // together: this is the same authority boundary the fake port sees at runtime.
  const initialRegistry = createDefaultModuleRegistry();
  const definitions = kinds.map((kind) => initialRegistry.require(kind, "1.0.0"));
  const registry = createDefaultModuleRegistry(definitions.map((definition) => {
    const target = definition.runtimeEvidenceTarget!;
    return {
      kind: definition.kind,
      version: definition.version,
      runtimeFamily: target.runtimeFamily,
      runtimeVersion: target.runtimeVersion,
      baselineId: target.baselineId,
      verifiedCapabilities: [...definition.requiredKfCapabilities],
    };
  }));
  const modules = definitions.map((definition) => ({
    id: definition.kind === "content.hero" ? "hero" : "status",
    name: definition.kind === "content.hero" ? "首屏介绍" : "状态概览",
    purpose: "验证 fake 修订严格遵循已确认蓝图",
    content: ["测试内容"],
    sampleData: [{ label: "名称", value: "示例" }],
    interactions: [],
    presentation: "测试",
    expectedKind: definition.kind,
  }));
  const blueprint = detailedBlueprint({ displayName: "多模块 fake 修订测试", modules });
  const authority = createHmacModuleArtifactAuthority(new Uint8Array(32).fill(12));
  const acceptedBlueprintArtifact = authority.verifyAcceptedBlueprint(authority.signAcceptedBlueprint({
    schema: "kf-accepted-blueprint-artifact/v1",
    projectKey: "kingclient.portal",
    revisionId: "revision-fake-multi",
    blueprintHash: canonicalModuleCompilationHash(blueprint),
    modules: definitions.map((definition) => ({
      blueprintModuleId: definition.kind === "content.hero" ? "hero" : "status",
      expectedKind: definition.kind,
      expectedCategory: definition.category,
      interactionRequirements: [],
    })),
  }));
  return {
    tenantId: "t", userId: "u", workspaceId: "w", conversationId: "c",
    currentProjectKey: "kingclient.portal", currentRevisionId: "revision-fake-multi", recentMessages: [],
    requirementText: "生成工程", confirmedBlueprint: blueprint, acceptedBlueprintArtifact,
    modulePlanningCatalog: registry.listForPlanning(), assetCatalog: [], registry, definitions,
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

  it("creates a strict ModulePlan from server-verified accepted blueprint facts and stable registry entries", async () => {
    const candidate = modulePlan();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(candidate) } }] }),
    });
    const port = new DeepSeekModelPort({ apiKey: "test-key", fetch: fetchImpl, baseUrl: "https://mock.local" });

    const result = await port.createModulePlan(modulePlanningContext());

    expect(result).toEqual(candidate);
    expect(result.pages[0].modules.map((module) => module.sourceBlueprintModuleIds)).toEqual([
      ["products"], ["projects"],
    ]);
    const prompt = JSON.parse(fetchImpl.mock.calls[0][1].body).messages[1].content;
    expect(prompt).toContain("ModulePlan");
    expect(prompt).toContain("已确认且服务器签名的蓝图事实");
    expect(prompt).toContain("content.hero@1.0.0");
    expect(prompt).toContain("content.timeline@1.0.0");
    expect(prompt).not.toContain("data.table@1.0.0");
    expect(prompt).toContain("assetId");
    expect(prompt).toContain("禁止输出 geometry");
  });

  it("overwrites model-authored top-level assets with the current server catalog snapshot", async () => {
    const candidate = modulePlan({ assets: [{ id: "invented", kind: "image", name: "x", mimeType: "image/png", description: "x" }] });
    const result = await makePort(candidate).createModulePlan(modulePlanningContext());
    expect(result.assets).toEqual(modulePlanningContext().assetCatalog);
  });

  it("rejects non-empty create operations because pages are the authoritative snapshot", async () => {
    const candidate = modulePlan({ operations: [{ op: "add", pageId: "home", module: modulePlan().pages[0].modules[0] }] });
    await expect(makePort(candidate).createModulePlan(modulePlanningContext()))
      .rejects.toThrow("create ModulePlan operations must be empty");
  });

  it("rejects module output with forbidden implementation fields, unknown modules, beta modules, or unavailable assets", async () => {
    const candidates = [
      modulePlan({ pages: [{ ...modulePlan().pages[0], modules: [{ ...modulePlan().pages[0].modules[0], geometry: { x: 0 } }, modulePlan().pages[0].modules[1]] }]}),
      modulePlan({ pages: [{ ...modulePlan().pages[0], modules: [{ ...modulePlan().pages[0].modules[0], css: ".hero{}" }, modulePlan().pages[0].modules[1]] }]}),
      modulePlan({ pages: [{ ...modulePlan().pages[0], modules: [{ ...modulePlan().pages[0].modules[0], path: "/tmp/kf" }, modulePlan().pages[0].modules[1]] }]}),
      modulePlan({ pages: [{ ...modulePlan().pages[0], modules: [{ ...modulePlan().pages[0].modules[0], content: '{"storageKey":"assets/private"}' }, modulePlan().pages[0].modules[1]] }]}),
      modulePlan({ pages: [{ ...modulePlan().pages[0], modules: [{ ...modulePlan().pages[0].modules[0], content: '{"nested":[{"ｃｏｎｔｒｏｌＧｅｏｍｅｔｒｙ":{"x":1}},{"nativePayload":true},{"scriptBody":"x"},{"cssRules":"x"},{"pathValue":"x"}]}' }, modulePlan().pages[0].modules[1]] }]}),
      modulePlan({ pages: [{ ...modulePlan().pages[0], modules: [{ ...modulePlan().pages[0].modules[0], objectType: 3 }, modulePlan().pages[0].modules[1]] }]}),
      modulePlan({ pages: [{ ...modulePlan().pages[0], modules: [{ ...modulePlan().pages[0].modules[0], kind: "data.table", variant: "default" }, modulePlan().pages[0].modules[1]] }]}),
      modulePlan({ pages: [{ ...modulePlan().pages[0], modules: [{ ...modulePlan().pages[0].modules[0], assetId: "not-uploaded" }, modulePlan().pages[0].modules[1]] }]}),
    ];
    for (const candidate of candidates) {
      await expect(makePort(candidate).createModulePlan(modulePlanningContext()))
        .rejects.toThrow(DeepSeekModelOutputError);
    }
  });

  it("rejects an unverified or mismatched confirmed blueprint before it can reach the model", async () => {
    const context = modulePlanningContext();
    await expect(makePort(modulePlan()).createModulePlan({
      ...context,
      acceptedBlueprintArtifact: {} as never,
    })).rejects.toThrow("UNVERIFIED_ACCEPTED_BLUEPRINT_ARTIFACT");
    await expect(makePort(modulePlan()).createModulePlan({
      ...context,
      confirmedBlueprint: detailedBlueprint(),
    })).rejects.toThrow("confirmed blueprint does not match accepted artifact");
  });

  it("fails closed before any model call for stale accepted project or revision bindings", async () => {
    const fetchImpl = vi.fn();
    const port = new DeepSeekModelPort({ apiKey: "test-key", fetch: fetchImpl, baseUrl: "https://mock.local" });
    await expect(port.createModulePlan(modulePlanningContext({ currentProjectKey: "other-project" })))
      .rejects.toThrow("projectKey");
    await expect(port.createModulePlan(modulePlanningContext({ currentRevisionId: "revision-2" })))
      .rejects.toThrow("revisionId");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects unsafe prompt inputs without invoking accessors and normalizes full-width forbidden tokens", async () => {
    const reads = { value: 0 };
    const unsafeCatalog = [{
      version: "1.0.0", maturity: "stable", variants: ["no-portrait"], slots: [], interactions: [],
      layout: { regions: ["main"], minColumnSpan: 6, maxColumnSpan: 12, preferredHeights: ["large"] },
    }];
    Object.defineProperty(unsafeCatalog[0], "kind", {
      enumerable: true,
      get() { reads.value += 1; return "content.hero"; },
    });
    const fetchImpl = vi.fn();
    const port = new DeepSeekModelPort({ apiKey: "test-key", fetch: fetchImpl, baseUrl: "https://mock.local" });
    await expect(port.createModulePlan(modulePlanningContext({ modulePlanningCatalog: unsafeCatalog })))
      .rejects.toThrow("unsafe");
    expect(reads.value).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();

    const fullWidth = modulePlan({ pages: [{
      ...modulePlan().pages[0],
      modules: [{ ...modulePlan().pages[0].modules[0], content: '{"ｓｔｏｒａｇｅＫｅｙ":"private"}' }, modulePlan().pages[0].modules[1]],
    }] });
    await expect(makePort(fullWidth).createModulePlan(modulePlanningContext())).rejects.toThrow(DeepSeekModelOutputError);
  });

  it("does not call the model when accepted blueprint facts need an unavailable stable module", async () => {
    const fetchImpl = vi.fn();
    const port = new DeepSeekModelPort({ apiKey: "test-key", fetch: fetchImpl, baseUrl: "https://mock.local" });
    await expect(port.createModulePlan(modulePlanningContext({
      modulePlanningCatalog: [],
    }))).rejects.toThrow("no stable registry modules");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed before model invocation when bounded module-planning prompt inputs are oversized", async () => {
    const candidate = modulePlan();
    const fetchImpl = vi.fn();
    const port = new DeepSeekModelPort({ apiKey: "test-key", fetch: fetchImpl, baseUrl: "https://mock.local" });
    await expect(port.createModulePlan(modulePlanningContext({ requirementText: "x".repeat(6_001) })))
      .rejects.toThrow("requirement text exceeds prompt bound");
    expect(fetchImpl).not.toHaveBeenCalled();
    void candidate;
  });

  it("keeps the latest twenty recent messages in their original chronological order", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(modulePlan()) } }] }),
    });
    const recentMessages = Array.from({ length: 22 }, (_, index) => ({ role: "user" as const, content: `turn-${index}` }));
    await new DeepSeekModelPort({ apiKey: "test-key", fetch: fetchImpl, baseUrl: "https://mock.local" })
      .createModulePlan(modulePlanningContext({ recentMessages }));
    const prompt = JSON.parse(fetchImpl.mock.calls[0][1].body).messages[1].content;
    expect(prompt).not.toContain("turn-0");
    expect(prompt.indexOf("turn-2")).toBeLessThan(prompt.indexOf("turn-21"));
  });

  it("rejects an invalid recent-message role before invoking the model", async () => {
    const fetchImpl = vi.fn();
    await expect(new DeepSeekModelPort({ apiKey: "test-key", fetch: fetchImpl, baseUrl: "https://mock.local" })
      .createModulePlan(modulePlanningContext({ recentMessages: [{ role: "system", content: "no" }] }))).rejects.toThrow("recent messages failed schema validation");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("requires the exact signed interaction identity and canonical order per mapped module", async () => {
    const context = modulePlanningContext({
      modulePlanningCatalog: modulePlanningContext().modulePlanningCatalog.map((entry) => entry.kind === "content.hero"
        ? { ...entry, interactions: ["navigate", "submit"] }
        : entry),
    });
    const authority = createHmacModuleArtifactAuthority(new Uint8Array(32).fill(7));
    context.acceptedBlueprintArtifact = authority.verifyAcceptedBlueprint(authority.signAcceptedBlueprint({
      schema: "kf-accepted-blueprint-artifact/v1", projectKey: "kingclient.portal", revisionId: "revision-1",
      blueprintHash: canonicalModuleCompilationHash(context.confirmedBlueprint),
      modules: [
        { blueprintModuleId: "products", expectedKind: "content.hero", expectedCategory: "content", interactionRequirements: [
          { type: "navigate", actionKind: "navigate", target: "home" },
          { type: "submit", actionKind: "submit", target: "save" },
        ] },
        { blueprintModuleId: "projects", expectedKind: "content.timeline", expectedCategory: "content", interactionRequirements: [] },
      ],
    }));
    const exact = modulePlan({ pages: [{
      ...modulePlan().pages[0], modules: [
        { ...modulePlan().pages[0].modules[0], interactions: [{ type: "navigate", pageId: "home" }, { type: "submit", action: "save" }] },
        modulePlan().pages[0].modules[1],
      ],
    }] });
    await expect(makePort(exact).createModulePlan(context)).resolves.toEqual(expect.objectContaining({ schema: "kf-module-plan/v1" }));
    const wrongOrder = structuredClone(exact);
    wrongOrder.pages[0].modules[0].interactions.reverse();
    await expect(makePort(wrongOrder).createModulePlan(context)).rejects.toThrow("interactions do not exactly match signed requirements");
    const missing = structuredClone(exact);
    missing.pages[0].modules[0].interactions = [{ type: "navigate", pageId: "home" }];
    await expect(makePort(missing).createModulePlan(context)).rejects.toThrow("interactions do not exactly match signed requirements");
  });

  it("permits a remove only when the newly accepted blueprint no longer maps that module", async () => {
    const previous = modulePlan();
    const currentBlueprint = detailedBlueprint({
      modules: [modulePlanningContext().confirmedBlueprint.modules[0]],
    });
    const authority = createHmacModuleArtifactAuthority(new Uint8Array(32).fill(7));
    const context = modulePlanningContext({
      confirmedBlueprint: currentBlueprint,
      acceptedBlueprintArtifact: authority.verifyAcceptedBlueprint(authority.signAcceptedBlueprint({
        schema: "kf-accepted-blueprint-artifact/v1", projectKey: "kingclient.portal", revisionId: "revision-1",
        blueprintHash: canonicalModuleCompilationHash(currentBlueprint),
        modules: [{ blueprintModuleId: "products", expectedKind: "content.hero", expectedCategory: "content", interactionRequirements: [] }],
      })),
      previousModulePlan: previous,
    });
    const revised = modulePlan({
      pages: [{ ...previous.pages[0], modules: [previous.pages[0].modules[0]] }],
      operations: [{ op: "remove", pageId: "home", moduleId: "projectsTimeline" }],
    });
    await expect(makePort(revised).reviseModulePlan(context)).resolves.toEqual(expect.objectContaining({ schema: "kf-module-plan/v1" }));
  });

  it("revises a complete ModulePlan and rejects omitted or silently changed prior modules", async () => {
    const previous = modulePlan();
    const changed = modulePlan({
      pages: [{
        ...previous.pages[0],
        modules: previous.pages[0].modules.map((module) => module.id === "productsHero"
          ? { ...module, title: "更新后的产品", operations: undefined }
          : module),
      }],
      operations: [{
        op: "update", pageId: "home", moduleId: "productsHero", changes: { title: "更新后的产品" },
      }],
    });
    const result = await makePort(changed).reviseModulePlan(modulePlanningContext({
      previousModulePlan: previous,
      modulePlanRejectionReasons: ["hero 标题需要更具体"],
      requirementText: "把产品标题改得更具体",
    }));
    expect(result.pages[0].modules.map((module) => module.id)).toEqual(["productsHero", "projectsTimeline"]);
    expect(result.pages[0].modules[1]).toEqual(previous.pages[0].modules[1]);

    const omitted = modulePlan({ pages: [{ ...previous.pages[0], modules: [previous.pages[0].modules[0]] }] });
    await expect(makePort(omitted).reviseModulePlan(modulePlanningContext({ previousModulePlan: previous })))
      .rejects.toThrow("accepted blueprint still requires removed module");

    const silentChange = modulePlan({ pages: [{
      ...previous.pages[0],
      modules: [{ ...previous.pages[0].modules[0], title: "偷改标题" }, previous.pages[0].modules[1]],
    }] });
    await expect(makePort(silentChange).reviseModulePlan(modulePlanningContext({ previousModulePlan: previous })))
      .rejects.toThrow("operations do not exactly describe");

    const resizeMasksTitle = modulePlan({
      pages: [{ ...previous.pages[0], modules: [{ ...previous.pages[0].modules[0], title: "不该被 resize 掩盖" }, previous.pages[0].modules[1]] }],
      operations: [{ op: "resize", pageId: "home", moduleId: "productsHero", columnSpan: 12, preferredHeight: "large" }],
    });
    await expect(makePort(resizeMasksTitle).reviseModulePlan(modulePlanningContext({ previousModulePlan: previous })))
      .rejects.toThrow("operations do not exactly describe");
  });

  it("derives detached composite revision payloads", () => {
    const previous = modulePlan();
    const current = modulePlan({ pages: [{ ...previous.pages[0], modules: [
      { ...previous.pages[0].modules[0], placement: { ...previous.pages[0].modules[0].placement, alignment: "center" } },
      previous.pages[0].modules[1],
    ] }] });
    const operations = deriveExactModulePlanOperations(previous, current, new Set(["products", "projects"]));
    const move = operations.find((entry) => entry.op === "move");
    expect(move?.op).toBe("move");
    if (move?.op !== "move") throw new Error("expected move");
    move.placement.alignment = "end";
    expect(current.pages[0].modules[0].placement.alignment).toBe("center");
  });

  it("repairs malformed module JSON once but never retries semantic rejections", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"schema":"kf-module-plan/v1"' } }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(modulePlan()) } }] }),
      });
    const port = new DeepSeekModelPort({ apiKey: "test-key", fetch: fetchImpl, baseUrl: "https://mock.local" });
    await expect(port.createModulePlan(modulePlanningContext())).resolves.toEqual(modulePlan());
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).messages[1].content).toContain("只修复 JSON 语法");

    const semanticFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(modulePlan({ css: "*{}" })) } }] }),
    });
    await expect(new DeepSeekModelPort({ apiKey: "test-key", fetch: semanticFetch, baseUrl: "https://mock.local" })
      .createModulePlan(modulePlanningContext())).rejects.toThrow(DeepSeekModelOutputError);
    expect(semanticFetch).toHaveBeenCalledTimes(1);

    const forgedTextFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ ...modulePlan(), unexpected: "JSON_PARSE" }) } }] }),
    });
    await expect(new DeepSeekModelPort({ apiKey: "test-key", fetch: forgedTextFetch, baseUrl: "https://mock.local" })
      .createModulePlan(modulePlanningContext())).rejects.toThrow(DeepSeekModelOutputError);
    expect(forgedTextFetch).toHaveBeenCalledTimes(1);

    const lengthFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ finish_reason: "length", message: { content: "{" } }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(modulePlan()) } }] }) });
    await expect(new DeepSeekModelPort({ apiKey: "test-key", fetch: lengthFetch, baseUrl: "https://mock.local" })
      .createModulePlan(modulePlanningContext())).resolves.toEqual(modulePlan());
    expect(lengthFetch).toHaveBeenCalledTimes(2);
  });

  it.each(["content.hero", "data.status-grid", "data.detail"])("fake mode plans and compiles stable %s without network", async (kind) => {
    const context = fakeCompileContext(kind);
    const plan = await new DeterministicFakeModelPort().createModulePlan(context);
    const result = compileModulePlan({
      plan,
      acceptedBlueprintArtifact: context.acceptedBlueprintArtifact,
      registry: context.registry,
      assetsById: {},
      validationContext: { availableKfCapabilities: [...context.definition.requiredKfCapabilities], approvedAuthorizationRefs: [] },
    });
    expect(result.status).toBe("compiled");
  });

  it("fake mode truthfully refuses chart planning without stable runtime evidence", async () => {
    const context = fakeCompileContext("data.chart-panel");
    context.modulePlanningCatalog = [];
    await expect(new DeterministicFakeModelPort().createModulePlan(context))
      .rejects.toThrow("no stable registry modules");
  });

  it("fake revision derives a truthful empty delta when the accepted final snapshot is unchanged", async () => {
    const context = fakeCompileContext("content.hero");
    const fake = new DeterministicFakeModelPort();
    const first = await fake.createModulePlan(context);
    const second = await fake.reviseModulePlan({ ...context, previousModulePlan: first });
    expect(second.pages).toEqual(first.pages);
    expect(second.operations).toEqual([]);
  });

  it("fake revision preserves the existing page identity and mode", async () => {
    const context = fakeCompileContext("content.hero");
    const fake = new DeterministicFakeModelPort();
    const first = await fake.createModulePlan(context);
    const previous = { ...first, pages: [{ ...first.pages[0], id: "existing", title: "保留标题", mode: "admin-shell" }] };
    const revised = await fake.reviseModulePlan({ ...context, previousModulePlan: previous });
    expect(revised.pages[0]).toEqual(expect.objectContaining({ id: "existing", title: "保留标题", mode: "admin-shell" }));
  });

  it("fake revision adds and removes accepted modules as compilable authoritative snapshots", async () => {
    const fake = new DeterministicFakeModelPort();
    const heroContext = fakeCompileContextForKinds(["content.hero"]);
    const heroPlan = await fake.createModulePlan(heroContext);
    const withStatusContext = fakeCompileContextForKinds(["content.hero", "data.status-grid"]);
    const added = await fake.reviseModulePlan({ ...withStatusContext, previousModulePlan: heroPlan });

    expect(added.operations).toEqual([expect.objectContaining({ op: "add", module: expect.objectContaining({ kind: "data.status-grid" }) })]);
    expect(validateModulePlanForContext({ ...withStatusContext, previousModulePlan: heroPlan }, added, true)).toEqual(added);
    expect(compileModulePlan({
      plan: added,
      acceptedBlueprintArtifact: withStatusContext.acceptedBlueprintArtifact,
      registry: withStatusContext.registry,
      assetsById: {},
      validationContext: {
        availableKfCapabilities: withStatusContext.definitions.flatMap((definition) => definition.requiredKfCapabilities),
        approvedAuthorizationRefs: [],
      },
    }).status).toBe("compiled");

    const unchanged = await fake.reviseModulePlan({ ...withStatusContext, previousModulePlan: added });
    expect(unchanged.operations).toEqual([]);

    const removed = await fake.reviseModulePlan({ ...heroContext, previousModulePlan: unchanged });
    expect(removed.operations).toEqual([expect.objectContaining({ op: "remove", moduleId: "module-status" })]);
    expect(validateModulePlanForContext({ ...heroContext, previousModulePlan: unchanged }, removed, true)).toEqual(removed);
    expect(compileModulePlan({
      plan: removed,
      acceptedBlueprintArtifact: heroContext.acceptedBlueprintArtifact,
      registry: heroContext.registry,
      assetsById: {},
      validationContext: {
        availableKfCapabilities: heroContext.definitions.flatMap((definition) => definition.requiredKfCapabilities),
        approvedAuthorizationRefs: [],
      },
    }).status).toBe("compiled");
  });

  it("createUiImplementation converts every blueprint module into structured components", async () => {
    const implementation = uiImplementation();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(implementation) } }] }),
    });
    const port = new DeepSeekModelPort({ apiKey: "test-key", fetch: fetchImpl, baseUrl: "https://mock.local" });

    const result = await port.createUiImplementation({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [],
      designPlan: detailedBlueprint(),
      revisionSummary: "页面 Page1 (1440x900)",
      editableEntities: [{ kind: "page", name: "Page1", type: "page", guid: "page-guid" }],
    });

    expect(result.pages[0].components.map((component) => component.sourceModuleId)).toEqual([
      "products",
      "projects",
    ]);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    const systemPrompt = body.messages[0].content;
    const prompt = body.messages[1].content;
    expect(prompt).toContain("UIImplementationSpec");
    expect(prompt).toContain("sourceModuleId");
    expect(prompt).toContain("products");
    expect(prompt).toContain("projects");
    expect(prompt).toContain("Page1");
    expect(prompt).toContain("禁止输出原始 CSS");
    expect(prompt).toContain("每个蓝图模块");
    expect(prompt).toContain("首版优先使用页面绝对几何布局");
    expect(prompt).toContain("不得输出 justifyContent");
    expect(prompt).toContain("以下 capabilityId 只允许空 style");
    expect(prompt).toContain("list");
    expect(systemPrompt).toContain("仅当输出 ChangePlan 时");
    expect(systemPrompt).toContain("UIImplementationSpec 的 component.id 必须使用稳定语义 ID");
    expect(body.max_tokens).toBe(8000);
  });

  it("retries once with a compact regeneration prompt when the first implementation JSON is malformed", async () => {
    const implementation = uiImplementation();
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            finish_reason: "length",
            message: { content: '{"schema":"kf-ui-implementation/v1","theme":{' },
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ finish_reason: "stop", message: { content: JSON.stringify(implementation) } }],
        }),
      });
    const port = new DeepSeekModelPort({
      apiKey: "test-key",
      fetch: fetchImpl,
      baseUrl: "https://mock.local",
    });

    const result = await port.createUiImplementation({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [],
      designPlan: detailedBlueprint(),
      revisionSummary: "页面 Page1 (1440x900)",
      editableEntities: [{ kind: "page", name: "Page1", type: "page", guid: "page-guid" }],
    });

    expect(result).toEqual(implementation);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(retryBody.messages[1].content).toContain("上一轮输出未形成完整合法 JSON");
    expect(retryBody.messages[1].content).toContain("每个蓝图模块 1-2 个组件");
    expect(retryBody.messages[1].content).toContain("不得输出 transform、transition 或 cursor");
  });

  it("canonicalizes safe CSS-style aliases before applying the strict implementation schema", async () => {
    const raw = JSON.parse(JSON.stringify(uiImplementation()));
    raw.pages[0].components[0].style.declarations = {
      color: "{theme.textPrimary}",
      fontWeight: "bold",
    };
    const port = makePort(raw);

    const result = await port.createUiImplementation({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [],
      designPlan: detailedBlueprint(),
    });

    expect(result.pages[0].components[0].style.declarations).toEqual({
      textColor: "{theme.textPrimary}",
      fontWeight: 700,
    });
  });

  it("moves duplicated text content out of semantic properties before compilation", async () => {
    const raw = JSON.parse(JSON.stringify(uiImplementation()));
    raw.pages[0].components[0].capabilityId = "richtext";
    raw.pages[0].components[0].content = "完整的个人简介";
    raw.pages[0].components[0].properties = { content: "完整的个人简介" };
    const port = makePort(raw);

    const result = await port.createUiImplementation({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [],
      designPlan: detailedBlueprint(),
    });

    expect(result.pages[0].components[0].content).toBe("完整的个人简介");
    expect(result.pages[0].components[0].properties).toEqual({});
  });

  it("fits model-authored component geometry inside the declared KF page", async () => {
    const raw = JSON.parse(JSON.stringify(uiImplementation()));
    const inBoundsGeometry = { ...raw.pages[0].components[0].geometry };
    raw.pages[0].components[1].geometry = { x: 100, y: 920, width: 600, height: 200 };
    const port = makePort(raw);

    const result = await port.createUiImplementation({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [],
      designPlan: detailedBlueprint(),
    });

    for (const component of result.pages[0].components) {
      expect(component.geometry.x + component.geometry.width).toBeLessThanOrEqual(1440);
      expect(component.geometry.y + component.geometry.height).toBeLessThanOrEqual(900);
    }
    expect(result.pages[0].components[0].geometry).toEqual(inBoundsGeometry);
  });

  it("converts a semantic image shape alias into reviewed border radius styling", async () => {
    const raw = JSON.parse(JSON.stringify(uiImplementation()));
    raw.pages[0].components[0].capabilityId = "image";
    raw.pages[0].components[0].properties = {
      src: "professional_portrait.jpg",
      fit: "cover",
      alt: "个人头像",
      shape: "circle",
    };
    const port = makePort(raw);

    const result = await port.createUiImplementation({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [],
      designPlan: detailedBlueprint(),
    });

    expect(result.pages[0].components[0].properties).not.toHaveProperty("shape");
    expect(result.pages[0].components[0].style.declarations.borderRadius).toBe(100);
  });

  it("canonicalizes common theme radius scale aliases", async () => {
    const raw = JSON.parse(JSON.stringify(uiImplementation()));
    raw.theme.radiusScale = { sm: 4, md: 8, lg: 16 };
    const port = makePort(raw);

    const result = await port.createUiImplementation({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [],
      designPlan: detailedBlueprint(),
    });

    expect(result.theme.radiusScale).toEqual({ small: 4, medium: 8, large: 16 });
  });

  it("canonicalizes safe numeric style values with an optional px suffix", async () => {
    const raw = JSON.parse(JSON.stringify(uiImplementation()));
    raw.pages[0].components[0].style.declarations = {
      padding: "24px",
      margin: "12",
      fontSize: "18px",
    };
    const port = makePort(raw);

    const result = await port.createUiImplementation({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [],
      designPlan: detailedBlueprint(),
    });

    expect(result.pages[0].components[0].style.declarations).toMatchObject({
      padding: 24,
      margin: 12,
      fontSize: 18,
    });
  });

  it("canonicalizes a safe CSS box shadow into a reviewed semantic shadow tier", async () => {
    const raw = JSON.parse(JSON.stringify(uiImplementation()));
    raw.pages[0].components[0].style.declarations.boxShadow =
      "0 4px 12px rgba(0, 0, 0, 0.15)";
    const port = makePort(raw);

    const result = await port.createUiImplementation({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [],
      designPlan: detailedBlueprint(),
    });

    expect(result.pages[0].components[0].style.declarations.boxShadow).toBe("medium");
  });

  it("assigns stable semantic IDs to model-authored tab labels", async () => {
    const raw = JSON.parse(JSON.stringify(uiImplementation()));
    raw.pages[0].components[0].capabilityId = "tabs";
    raw.pages[0].components[0].properties = {
      tabs: [{ label: "全部" }, { label: "网页设计" }, { label: "移动应用" }],
    };
    const port = makePort(raw);

    const result = await port.createUiImplementation({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [],
      designPlan: detailedBlueprint(),
    });

    const reversedRaw = JSON.parse(JSON.stringify(raw));
    reversedRaw.pages[0].components[0].properties.tabs.reverse();
    const reversed = await makePort(reversedRaw).createUiImplementation({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [],
      designPlan: detailedBlueprint(),
    });
    const idByLabel = Object.fromEntries(
      result.pages[0].components[0].properties.tabs.map((tab: { id: string; label: string }) => [
        tab.label,
        tab.id,
      ]),
    );
    const reversedIdByLabel = Object.fromEntries(
      reversed.pages[0].components[0].properties.tabs.map((tab: { id: string; label: string }) => [
        tab.label,
        tab.id,
      ]),
    );
    expect(reversedIdByLabel).toEqual(idByLabel);
    expect(new Set(Object.values(idByLabel)).size).toBe(3);
  });

  it("never collides a generated tab ID with an explicit model-authored ID", async () => {
    const raw = JSON.parse(JSON.stringify(uiImplementation()));
    raw.pages[0].components[0].capabilityId = "tabs";
    raw.pages[0].components[0].properties = {
      tabs: [{ id: "tab-2", label: "全部" }, { label: "网页设计" }],
    };

    const result = await makePort(raw).createUiImplementation({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [],
      designPlan: detailedBlueprint(),
    });

    const ids = result.pages[0].components[0].properties.tabs.map(
      (tab: { id: string }) => tab.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("maps a model-authored button label to the KF component content field", async () => {
    const raw = JSON.parse(JSON.stringify(uiImplementation()));
    raw.pages[0].components[0].capabilityId = "button";
    raw.pages[0].components[0].properties = { label: "联系我" };
    delete raw.pages[0].components[0].content;
    const port = makePort(raw);

    const result = await port.createUiImplementation({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [],
      designPlan: detailedBlueprint(),
    });

    expect(result.pages[0].components[0].properties).toEqual({});
    expect(result.pages[0].components[0].content).toBe("联系我");
  });

  it("drops redundant content from an image that already has a resource source", async () => {
    const raw = JSON.parse(JSON.stringify(uiImplementation()));
    raw.pages[0].components[0].capabilityId = "image";
    raw.pages[0].components[0].content = "个人头像";
    raw.pages[0].components[0].properties = {
      src: "professional_portrait.jpg",
      fit: "cover",
      alt: "个人头像",
    };
    const port = makePort(raw);

    const result = await port.createUiImplementation({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [],
      designPlan: detailedBlueprint(),
    });

    expect(result.pages[0].components[0].content).toBeUndefined();
    expect(result.pages[0].components[0].properties).toMatchObject({
      src: "professional_portrait.jpg",
      alt: "个人头像",
    });
  });

  it("reviseUiImplementation includes the previous spec and bounded rejection reasons", async () => {
    const previous = uiImplementation();
    const revised = uiImplementation({
      pages: [{
        ...previous.pages[0],
        components: previous.pages[0].components.map((component) => ({
          ...component,
          geometry: { ...component.geometry, y: component.geometry.y + 20 },
        })),
      }],
    });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(revised) } }] }),
    });
    const port = new DeepSeekModelPort({ apiKey: "test-key", fetch: fetchImpl, baseUrl: "https://mock.local" });

    await port.reviseUiImplementation({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [],
      requirementText: "整体向下移动",
      designPlan: detailedBlueprint(),
      uiImplementation: previous,
      implementationRejectionReasons: ["missing blueprint module: projects"],
    });

    const prompt = JSON.parse(fetchImpl.mock.calls[0][1].body).messages[1].content;
    expect(prompt).toContain("上一版 UIImplementationSpec");
    expect(prompt).toContain(JSON.stringify(previous));
    expect(prompt).toContain("整体向下移动");
    expect(prompt).toContain("missing blueprint module: projects");
  });

  it("createUiImplementation rejects raw or schema-invalid implementation output", async () => {
    const port = makePort(uiImplementation({ pages: [] }));
    await expect(port.createUiImplementation({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [],
      designPlan: detailedBlueprint(),
    })).rejects.toThrow(DeepSeekModelOutputError);
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
