// @ts-nocheck -- mock-fetch 场景的 JS 风格测试；行为由 vitest 断言验证。
import { describe, expect, it, vi } from "vitest";
import { canonicalModuleCompilationHash, canonicalServerHash } from "@kf/contracts";
import { createHmacModuleArtifactAuthority } from "@kf/build-jobs";
import { adaptLegacyModulePlan, compileModulePlan, createDefaultModuleRegistry, getDesignKnowledgeSnapshot } from "@kf/domain-client";
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

function solutionBlueprint(overrides: Record<string, unknown> = {}) {
  return {
    schema: "kf-design-plan/v3",
    displayName: "园区访客协同中心",
    objective: "帮助园区前台完成访客预约审核与到访接待",
    audiences: ["园区前台", "安保人员"],
    scenarios: ["预约审核", "到访核验"],
    pages: [{
      id: "visitor-overview",
      title: "访客总览",
      purpose: "集中处理当日访客预约",
      readingOrder: ["visitor-list"],
      regions: [{
        id: "visitor-list",
        purpose: "浏览并选择待处理访客",
        semanticRoles: ["record-list", "selection"],
        dataShape: "record-list",
        density: "comfortable",
        importance: "primary",
        content: ["访客姓名", "来访单位", "预约时段"],
        sampleData: [{ 访客姓名: "陈嘉宁", 来访单位: "海岚智造", 预约时段: "14:30" }],
        interactions: ["选择访客并查看预约详情"],
        states: ["待审核", "已通过", "已拒绝"],
        visualIntent: "清晰可信且便于快速扫读",
      }],
    }],
    journeys: [{
      id: "review-visitor",
      actor: "园区前台",
      goal: "审核一条访客预约",
      steps: [{
        pageId: "visitor-overview",
        regionId: "visitor-list",
        action: "选择陈嘉宁的预约",
        result: "展示预约详情并可决定是否通过",
      }],
      completion: "预约状态更新并给出明确反馈",
    }],
    visualDirection: {
      tone: "专业友好",
      colors: ["深海蓝", "暖橙"],
      typography: "标题、状态和正文层级清楚",
      spacingAndSurfaces: "舒适留白与轻量分区",
    },
    acceptanceScenarios: ["前台可以完成预约审核并看到结果"],
    openQuestions: [],
    ...overrides,
  };
}

function capabilityCandidateBundle(blueprint = solutionBlueprint()) {
  const ranked = (id: string) => ({
    id,
    score: 10,
    reasons: ["语义匹配"],
    limitations: [],
    knowledgeVersion: "1.0.0",
  });
  return {
    schema: "kf-capability-candidates/v1",
    knowledgeCatalogVersion: "1.0.0",
    blueprintHash: canonicalServerHash(blueprint),
    regions: [{
      pageId: "visitor-overview",
      regionId: "visitor-list",
      controls: [ranked("button"), ranked("easyui.1"), ranked("text")],
      layouts: [ranked("layout.2")],
      recipes: [ranked("filtered-record-workspace")],
    }],
    detailedCapabilityIds: ["button", "easyui.1", "layout.2", "text"],
    generatedAtPolicy: "deterministic-no-timestamp",
  };
}

type CapabilityCandidateBundleFixture = ReturnType<typeof capabilityCandidateBundle>;

function solutionImplementationPlan(blueprint = solutionBlueprint(), candidates = capabilityCandidateBundle(blueprint)) {
  const intent = {
    importance: "primary",
    visualWeight: 4,
    readingOrder: 0,
    density: "comfortable",
    groupWith: [],
    width: { mode: "fill" },
    height: { mode: "content" },
    align: "stretch",
  };
  return {
    schema: "kf-solution-implementation/v1",
    projectKey: "visitor-center",
    blueprintHash: canonicalServerHash(blueprint),
    candidateBundleHash: canonicalServerHash(candidates),
    theme: {
      background: "#f4f7fb", surface: "#ffffff", primary: "#163a5f", accent: "#e47b32",
      textPrimary: "#14212b", textSecondary: "#52616d", fontFamily: "Inter", spacingUnit: 8,
      radiusScale: { small: 4, medium: 8, large: 16 },
    },
    roleStyles: [{ role: "record-title", declarations: {}, states: {} }],
    mockData: [],
    localState: [],
    pages: [{
      id: "visitor-solution-page",
      title: "访客总览",
      purpose: "查看当日预约",
      canvas: "responsive",
      sourceBlueprintPageId: "visitor-overview",
      sourceBlueprintRegionIds: ["visitor-list"],
      initialStateIds: [],
      root: {
        kind: "layout",
        id: "visitor-root",
        sourceBlueprintRegionIds: ["visitor-list"],
        intent,
        layout: "row",
        children: [{
          kind: "control",
          id: "visitor-title",
          sourceBlueprintRegionIds: ["visitor-list"],
          intent,
          capabilityId: "text",
          content: "今日访客",
          properties: [],
          tabIds: [],
          styleRole: "record-title",
          eventBindings: [],
        }],
      },
    }],
    overlays: [],
    actions: [],
    scripts: [],
  };
}

function solutionPlanningContext(overrides: Record<string, unknown> = {}) {
  const blueprint = solutionBlueprint();
  const candidates = capabilityCandidateBundle(blueprint);
  return {
    tenantId: "tenant-marker-must-not-leak",
    userId: "user-marker-must-not-leak",
    workspaceId: "workspace-marker-must-not-leak",
    conversationId: "conversation-marker-must-not-leak",
    generationWorkflow: "creative-v2",
    recentMessages: [{ role: "user", content: "UNRELATED_RECENT_MESSAGE_MARKER" }],
    conversationSummary: "UNRELATED_CONVERSATION_SUMMARY_MARKER",
    revisionSummary: "UNRELATED_REVISION_SUMMARY_MARKER",
    requirementText: "UNRELATED_REQUIREMENT_MARKER",
    confirmedSolutionBlueprint: blueprint,
    capabilityCandidates: candidates,
    assetCatalog: [{
      id: "visitor-portrait",
      kind: "image",
      name: "访客头像示例",
      mimeType: "image/png",
      description: "用于预约详情的已登记图片",
    }],
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

  it("allows interpolation examples in ordinary intent-classification discussion", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: { content: JSON.stringify({ intent: "QUESTION", requestedDomains: ["kingclient"] }) },
        }],
      }),
    });
    const port = new DeepSeekModelPort({ apiKey: "test-key", fetch: fetchImpl, baseUrl: "https://mock.local" });
    const interpolationExample = "$" + "{name}";

    await expect(port.classifyIntent({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [{ role: "user", content: `如何解释 ${interpolationExample}` }],
      requirementText: `如何解释 ${interpolationExample}`,
    })).resolves.toMatchObject({ intent: "QUESTION" });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.messages[1].content).toContain(interpolationExample);
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

  it("creates a schema-gated v3 customer blueprint for creative-v2 without leaking implementation vocabulary", async () => {
    const blueprint = solutionBlueprint();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(blueprint) } }] }),
    });
    const port = new DeepSeekModelPort({ apiKey: "test-key", fetch: fetchImpl, baseUrl: "https://mock.local" });

    const result = await port.createDesignPlan({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      generationWorkflow: "creative-v2",
      recentMessages: [{ role: "user", content: "做一个多页面园区访客协同中心" }],
      requirementText: "做一个多页面园区访客协同中心",
      modulePlanningCatalog: [{
        kind: "content.hero",
        version: "1.0.0",
        maturity: "stable",
        variants: ["default"],
        slots: [],
        interactions: [],
        layout: { regions: ["main"], minColumnSpan: 1, maxColumnSpan: 12, preferredHeights: ["large"] },
      }],
      editableEntities: [{ kind: "page", name: "Page1", type: "page", guid: "11111111-1111-4111-8111-111111111111" }],
    });

    expect(result).toEqual(blueprint);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    const blueprintSystemPrompt = body.messages[0].content as string;
    const capturedBlueprintPrompt = body.messages.map((message: { content: string }) => message.content).join("\n");
    expect(capturedBlueprintPrompt).toContain("kf-design-plan/v3");
    expect(capturedBlueprintPrompt).toContain("客户任务");
    expect(capturedBlueprintPrompt).toContain("多页面");
    expect(capturedBlueprintPrompt).toContain("信息架构");
    expect(capturedBlueprintPrompt).toContain("交互旅程");
    expect(capturedBlueprintPrompt).toContain("视觉方向");
    expect(capturedBlueprintPrompt).toContain("重新设计");
    expect(capturedBlueprintPrompt).not.toContain("expectedKind");
    expect(capturedBlueprintPrompt).not.toContain("content.hero");
    expect(capturedBlueprintPrompt).not.toContain("11111111-1111-4111-8111-111111111111");
    expect(blueprintSystemPrompt).toContain('"pages":[{"id"');
    expect(blueprintSystemPrompt).toContain('"regions":[{"id"');
    expect(blueprintSystemPrompt).toContain('"readingOrder"');
    expect(blueprintSystemPrompt).toContain('"journeys":[{"id"');
    expect(blueprintSystemPrompt).toContain('"acceptanceScenarios"');
    expect(new TextEncoder().encode(capturedBlueprintPrompt).byteLength).toBeLessThanOrEqual(128_000);
  });

  it("rejects a creative-v2 blueprint containing a forbidden implementation key at recursive depth", async () => {
    const poisoned = solutionBlueprint();
    poisoned.pages[0].regions[0].sampleData = [{ 访客姓名: "陈嘉宁", nested: { x: 40 } }];

    await expect(makePort(poisoned).createDesignPlan({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      generationWorkflow: "creative-v2",
      recentMessages: [],
      requirementText: "访客中心",
    })).rejects.toThrow(/forbidden field.*x/i);
  });

  it("repairs creative-v2 JSON extraction at most once", async () => {
    const blueprint = solutionBlueprint();
    const response = (content: string, finish_reason = "stop") => ({
      ok: true,
      json: async () => ({ choices: [{ finish_reason, message: { content } }] }),
    });
    const repairedFetch = vi.fn()
      .mockResolvedValueOnce(response('{"schema":"kf-design-plan/v3"', "length"))
      .mockResolvedValueOnce(response(JSON.stringify(blueprint)));
    const repairedPort = new DeepSeekModelPort({ apiKey: "test-key", fetch: repairedFetch, baseUrl: "https://mock.local" });
    await expect(repairedPort.createDesignPlan({
      tenantId: "t", userId: "u", workspaceId: "w", conversationId: "c",
      generationWorkflow: "creative-v2", recentMessages: [], requirementText: "访客中心",
    })).resolves.toEqual(blueprint);
    expect(repairedFetch).toHaveBeenCalledTimes(2);

    const exhaustedFetch = vi.fn().mockResolvedValue(response('{"schema":"kf-design-plan/v3"', "length"));
    const exhaustedPort = new DeepSeekModelPort({ apiKey: "test-key", fetch: exhaustedFetch, baseUrl: "https://mock.local" });
    await expect(exhaustedPort.createDesignPlan({
      tenantId: "t", userId: "u", workspaceId: "w", conversationId: "c",
      generationWorkflow: "creative-v2", recentMessages: [], requirementText: "访客中心",
    })).rejects.toThrow(DeepSeekModelOutputError);
    expect(exhaustedFetch).toHaveBeenCalledTimes(2);
  });

  it("sends only bounded semantic planning inputs and filtered exact-ID knowledge", async () => {
    const context = solutionPlanningContext();
    const plan = solutionImplementationPlan(context.confirmedSolutionBlueprint, context.capabilityCandidates);
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(plan) } }] }),
    });
    const port = new DeepSeekModelPort({ apiKey: "test-key", fetch: fetchImpl, baseUrl: "https://mock.local" });

    await expect(port.createSolutionImplementationPlan(context)).resolves.toEqual(plan);

    const serializedBody = fetchImpl.mock.calls[0][1].body as string;
    const body = JSON.parse(serializedBody);
    const implementationSystemPrompt = body.messages[0].content as string;
    const capturedImplementationPrompt = body.messages.map((message: { content: string }) => message.content).join("\n");
    const marker = "语义规划输入(JSON)：";
    const payloadText = body.messages[1].content.slice(body.messages[1].content.indexOf(marker) + marker.length).trim();
    const payload = JSON.parse(payloadText);
    const detailedIds = context.capabilityCandidates.detailedCapabilityIds;
    expect(payload).toEqual(expect.objectContaining({
      blueprint: context.confirmedSolutionBlueprint,
      capabilityCandidates: context.capabilityCandidates,
      assetCatalog: context.assetCatalog,
    }));
    expect(Object.keys(payload).sort()).toEqual([
      "assetCatalog", "blueprint", "capabilityCandidates", "detailedDesignKnowledge",
    ]);
    expect(payload.detailedDesignKnowledge.controlProfiles.map((profile: { capabilityId: string }) => profile.capabilityId)).toEqual(detailedIds);
    expect(payload.detailedDesignKnowledge.styleProfiles.map((profile: { capabilityId: string }) => profile.capabilityId)).toEqual(detailedIds);
    expect(payload.detailedDesignKnowledge.scriptProfiles.map((profile: { capabilityId: string }) => profile.capabilityId)).toEqual(detailedIds);
    expect(payload.detailedDesignKnowledge.controlProfiles).toHaveLength(4);
    expect(payload.detailedDesignKnowledge.recipes).toEqual([
      expect.objectContaining({ id: "filtered-record-workspace", version: "1.0.0" }),
    ]);
    expect(capturedImplementationPrompt).toContain("kf-capability-candidates/v1");
    expect(capturedImplementationPrompt).toContain("可以自由组合或忽略组合经验");
    expect(capturedImplementationPrompt).toContain("页面");
    expect(capturedImplementationPrompt).toContain("浮层");
    expect(capturedImplementationPrompt).toContain("行业模拟数据");
    expect(capturedImplementationPrompt).toContain("本地状态");
    expect(capturedImplementationPrompt).toContain("声明式意图和步骤");
    expect(capturedImplementationPrompt).toContain("不得输出可执行 JavaScript 或源代码");
    expect(capturedImplementationPrompt).not.toContain("styleDataNew");
    expect(capturedImplementationPrompt).not.toContain("linkId");
    expect(capturedImplementationPrompt).not.toContain("configureData");
    expect(capturedImplementationPrompt).not.toContain("evidence");
    expect(capturedImplementationPrompt).not.toContain("agent-app/packages/domain-client");
    expect(capturedImplementationPrompt).not.toContain("UNRELATED_RECENT_MESSAGE_MARKER");
    expect(capturedImplementationPrompt).not.toContain("UNRELATED_CONVERSATION_SUMMARY_MARKER");
    expect(capturedImplementationPrompt).not.toContain("UNRELATED_REVISION_SUMMARY_MARKER");
    expect(capturedImplementationPrompt).not.toContain("UNRELATED_REQUIREMENT_MARKER");
    expect(implementationSystemPrompt).toContain('"candidateBundleHash"');
    expect(implementationSystemPrompt).toContain('"roleStyles"');
    expect(implementationSystemPrompt).toContain('"mockData"');
    expect(implementationSystemPrompt).toContain('"localState"');
    expect(implementationSystemPrompt).toContain('"overlays"');
    expect(implementationSystemPrompt).toContain('"actions"');
    expect(implementationSystemPrompt).toContain('"scripts"');
    expect(implementationSystemPrompt).toContain('"kind":"layout"');
    expect(implementationSystemPrompt).toContain('"kind":"registered-module"');
    expect(implementationSystemPrompt).toContain('"kind":"control"');
    expect(implementationSystemPrompt).toContain('"kind":"repeater"');
    expect(implementationSystemPrompt).toContain('"kind":"list","items"');
    expect(implementationSystemPrompt).toContain('"kind":"record","fields"');
    expect(implementationSystemPrompt).toContain(
      '语义值精确联合：字符串 | 有限数字 | 布尔值 | null | {"kind":"list","items":[语义值]} | {"kind":"record","fields":[{"name":"semantic-name","value":语义值}]} | {"kind":"repeater-field","itemAlias":"semantic-name","field":"semantic-name"}',
    );
    expect(implementationSystemPrompt).toContain("字段引用只能使用上述 repeater-field 对象，禁止使用美元符号、花括号或字符串插值");
    expect(capturedImplementationPrompt).not.toContain("${");
    expect(implementationSystemPrompt).toContain('"kind":"custom"');
    expect(implementationSystemPrompt).toContain('"steps"');
    expect(implementationSystemPrompt).toContain('"styleOverride":{"declarations":{},"states":{}}');
    expect(implementationSystemPrompt).toContain('"kind":"navigate-page","id":"stable-id","afterActionIds":[],"targetPageId"');
    expect(implementationSystemPrompt).toContain('"kind":"set-control-value","id":"stable-id","afterActionIds":[],"targetId"');
    expect(implementationSystemPrompt).toContain('"kind":"literal","value"');
    expect(implementationSystemPrompt).toContain('"mode":"fixed","value"');
    expect(implementationSystemPrompt).toContain('"mode":"minmax","min"');
    expect(capturedImplementationPrompt).toContain(
      'width 精确联合：{"mode":"content"} | {"mode":"fill"} | {"mode":"fixed","value":320} | {"mode":"ratio","value":1.5} | {"mode":"minmax","min":240,"max":640}',
    );
    expect(capturedImplementationPrompt).toContain(
      'height 精确联合：{"mode":"content"} | {"mode":"fill"} | {"mode":"viewport"} | {"mode":"fixed","value":320} | {"mode":"ratio","value":1.5} | {"mode":"minmax","min":240,"max":640}',
    );
    expect(capturedImplementationPrompt).toContain(
      'parameters 每项精确联合：{"name":"limit","value":20} | {"name":"source","refKind":"mock-data|local-state|control","refId":"已声明 id"}',
    );
    expect(capturedImplementationPrompt).not.toContain('fixed/ratio 必须是 {"mode":"fixed"');
    expect(capturedImplementationPrompt).not.toContain('"parameters":[字面量或语义引用参数]');
    expect(implementationSystemPrompt).toContain("语义样式意图");
    expect(implementationSystemPrompt).toContain("引用");
    const allProfileIds = getDesignKnowledgeSnapshot().controlDesignProfiles.map((profile) => profile.capabilityId);
    const omittedProfileId = allProfileIds.find((id) => !detailedIds.includes(id));
    expect(omittedProfileId).toBeDefined();
    expect(capturedImplementationPrompt).not.toContain(`"capabilityId":"${omittedProfileId}"`);
    expect(new TextEncoder().encode(capturedImplementationPrompt).byteLength).toBeLessThanOrEqual(128_000);
    expect(new TextEncoder().encode(serializedBody).byteLength).toBeLessThanOrEqual(128_000);
  });

  it.each([
    ["catalog version", (candidates: CapabilityCandidateBundleFixture) => { candidates.knowledgeCatalogVersion = "9.9.9"; }, /catalog version.*9\.9\.9/i],
    ["candidate profile version", (candidates: CapabilityCandidateBundleFixture) => { candidates.regions[0].controls[0].knowledgeVersion = "9.9.9"; }, /candidate profile.*9\.9\.9/i],
    ["extra detailed identity", (candidates: CapabilityCandidateBundleFixture) => {
      candidates.detailedCapabilityIds = ["button", "easyui.1", "image", "layout.2", "text"];
    }, /detailed capability IDs/i],
    ["missing detailed identity", (candidates: CapabilityCandidateBundleFixture) => {
      candidates.detailedCapabilityIds = candidates.detailedCapabilityIds.filter((id: string) => id !== "text");
    }, /detailed/i],
    ["duplicate detailed identity", (candidates: CapabilityCandidateBundleFixture) => {
      candidates.detailedCapabilityIds = ["button", ...candidates.detailedCapabilityIds];
    }, /detailed/i],
    ["stale recipe version", (candidates: CapabilityCandidateBundleFixture) => { candidates.regions[0].recipes[0].knowledgeVersion = "9.9.9"; }, /recipe.*9\.9\.9/i],
    ["unknown recipe identity", (candidates: CapabilityCandidateBundleFixture) => { candidates.regions[0].recipes[0].id = "unknown-recipe"; }, /recipe.*unknown-recipe/i],
  ])("rejects a %s mismatch before fetching semantic output", async (_label, mutate, expectedError) => {
    const context = solutionPlanningContext();
    const candidates = structuredClone(context.capabilityCandidates);
    mutate(candidates);
    const responsePlan = solutionImplementationPlan(context.confirmedSolutionBlueprint, candidates);
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(responsePlan) } }] }),
    });
    const port = new DeepSeekModelPort({ apiKey: "test-key", fetch: fetchImpl, baseUrl: "https://mock.local" });

    await expect(port.createSolutionImplementationPlan({ ...context, capabilityCandidates: candidates }))
      .rejects.toThrow(expectedError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("includes only bounded prior plan and rejection reasons in semantic repair", async () => {
    const context = solutionPlanningContext();
    const previous = solutionImplementationPlan(context.confirmedSolutionBlueprint, context.capabilityCandidates);
    const revised = structuredClone(previous);
    revised.pages[0].title = "访客预约总览";
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(revised) } }] }),
    });
    const port = new DeepSeekModelPort({ apiKey: "test-key", fetch: fetchImpl, baseUrl: "https://mock.local" });

    await expect(port.reviseSolutionImplementationSubtree({
      ...context,
      previousSolutionImplementationPlan: previous,
      solutionPlanRejectionReasons: ["visitor-title: capability must use an exact candidate"],
    })).resolves.toEqual(revised);

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    const prompt = body.messages[1].content as string;
    const marker = "语义规划输入(JSON)：";
    const payload = JSON.parse(prompt.slice(prompt.indexOf(marker) + marker.length).trim());
    expect(payload.previousPlan).toEqual(previous);
    expect(payload.rejectionReasons).toEqual(["visitor-title: capability must use an exact candidate"]);
    expect(Object.keys(payload).sort()).toEqual([
      "assetCatalog", "blueprint", "capabilityCandidates", "detailedDesignKnowledge", "previousPlan", "rejectionReasons",
    ]);
    expect(new TextEncoder().encode(body.messages.map((message: { content: string }) => message.content).join("\n")).byteLength).toBeLessThanOrEqual(128_000);
  });

  it("rejects every create-call repair-context contaminant before sending a request", async () => {
    const context = solutionPlanningContext();
    const previous = solutionImplementationPlan(context.confirmedSolutionBlueprint, context.capabilityCandidates);
    const fetchImpl = vi.fn();
    const port = new DeepSeekModelPort({ apiKey: "test-key", fetch: fetchImpl, baseUrl: "https://mock.local" });

    await expect(port.createSolutionImplementationPlan({
      ...context,
      previousSolutionImplementationPlan: previous,
    })).rejects.toThrow(/create.*prior|repair context/i);
    await expect(port.createSolutionImplementationPlan({
      ...context,
      solutionPlanRejectionReasons: ["must not enter create"],
    })).rejects.toThrow(/create.*rejection|repair context/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("allows repair with bounded reasons and no schema-valid prior plan", async () => {
    const context = solutionPlanningContext();
    const repaired = solutionImplementationPlan(context.confirmedSolutionBlueprint, context.capabilityCandidates);
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(repaired) } }] }),
    });
    const port = new DeepSeekModelPort({ apiKey: "test-key", fetch: fetchImpl, baseUrl: "https://mock.local" });

    await expect(port.reviseSolutionImplementationSubtree({
      ...context,
      solutionPlanRejectionReasons: ["pages.0.root: candidate reference was rejected"],
    })).resolves.toEqual(repaired);

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    const marker = "语义规划输入(JSON)：";
    const payload = JSON.parse(body.messages[1].content.slice(body.messages[1].content.indexOf(marker) + marker.length).trim());
    expect(payload.previousPlan).toBeUndefined();
    expect(payload.rejectionReasons).toEqual(["pages.0.root: candidate reference was rejected"]);
  });

  it("rejects a legacy compatibility prior before inert code-like content can enter a repair request", async () => {
    const context = solutionPlanningContext();
    const source = modulePlan();
    source.pages[0].modules[0].content = "const privateValue = window.hiddenValue;";
    const legacyPrior = adaptLegacyModulePlan(source);
    const fetchImpl = vi.fn();
    const port = new DeepSeekModelPort({ apiKey: "test-key", fetch: fetchImpl, baseUrl: "https://mock.local" });

    await expect(port.reviseSolutionImplementationSubtree({
      ...context,
      previousSolutionImplementationPlan: legacyPrior,
      solutionPlanRejectionReasons: ["repair the selected region"],
    })).rejects.toThrow(/legacy.*prior|native.*prior/i);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain("privateValue");
  });

  it.each(["guid", "objectType", "uiModelType", "styleDataNew", "selector", "css", "x", "y", "leftTopPt", "linkId", "configureData"])(
    "recursively rejects semantic plan output containing forbidden key %s",
    async (forbiddenKey) => {
      const context = solutionPlanningContext();
      const plan = solutionImplementationPlan(context.confirmedSolutionBlueprint, context.capabilityCandidates);
      plan.pages[0].root.children[0].content = {
        kind: "record",
        fields: [{ name: "safe", value: { kind: "record", fields: [], [forbiddenKey]: "poison" } }],
      };

      await expect(makePort(plan).createSolutionImplementationPlan(context)).rejects.toThrow(
        new RegExp(`forbidden field.*${forbiddenKey}`, "i"),
      );
    },
  );

  it("fails closed before a semantic model call when required payload cannot fit 128000 UTF-8 bytes", async () => {
    const context = solutionPlanningContext({
      assetCatalog: Array.from({ length: 100 }, (_, index) => ({
        id: `asset-${index}`,
        kind: "image",
        name: `资源 ${index}`,
        mimeType: "image/png",
        description: "界".repeat(1_000),
      })),
    });
    const fetchImpl = vi.fn();
    const port = new DeepSeekModelPort({ apiKey: "test-key", fetch: fetchImpl, baseUrl: "https://mock.local" });

    await expect(port.createSolutionImplementationPlan(context)).rejects.toThrow(/128000|prompt.*bound/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("recursively rejects interpolation syntax in asset metadata before fetching", async () => {
    const context = solutionPlanningContext({
      assetCatalog: [{
        id: "visitor-portrait",
        kind: "image",
        name: "访客头像示例",
        mimeType: "image/png",
        description: "已登记头像 $" + "{variant}",
      }],
    });
    const fetchImpl = vi.fn();
    const port = new DeepSeekModelPort({ apiKey: "test-key", fetch: fetchImpl, baseUrl: "https://mock.local" });

    await expect(port.createSolutionImplementationPlan(context)).rejects.toThrow(/interpolation.*assetCatalog|assetCatalog.*interpolation/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed when JSON escaping pushes the serialized HTTP request beyond 128000 UTF-8 bytes", async () => {
    const context = solutionPlanningContext({
      assetCatalog: Array.from({ length: 35 }, (_, index) => ({
        id: `quoted-asset-${index}`,
        kind: "image",
        name: `quoted asset ${index}`,
        mimeType: "image/png",
        description: "\"".repeat(1_000),
      })),
    });
    const plan = solutionImplementationPlan(context.confirmedSolutionBlueprint, context.capabilityCandidates);
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(plan) } }] }),
    });
    const port = new DeepSeekModelPort({ apiKey: "test-key", fetch: fetchImpl, baseUrl: "https://mock.local" });

    await expect(port.createSolutionImplementationPlan(context)).rejects.toThrow(/serialized HTTP request.*128000/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("repairs semantic-plan JSON extraction once and never makes a third model-port call", async () => {
    const context = solutionPlanningContext();
    const plan = solutionImplementationPlan(context.confirmedSolutionBlueprint, context.capabilityCandidates);
    const response = (content: string, finish_reason = "stop") => ({
      ok: true,
      json: async () => ({ choices: [{ finish_reason, message: { content } }] }),
    });
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response('{"schema":"kf-solution-implementation/v1"', "length"))
      .mockResolvedValueOnce(response(JSON.stringify(plan)));
    const port = new DeepSeekModelPort({ apiKey: "test-key", fetch: fetchImpl, baseUrl: "https://mock.local" });

    await expect(port.createSolutionImplementationPlan(context)).resolves.toEqual(plan);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const exhaustedFetch = vi.fn().mockResolvedValue(response("not json"));
    const exhaustedPort = new DeepSeekModelPort({ apiKey: "test-key", fetch: exhaustedFetch, baseUrl: "https://mock.local" });
    await expect(exhaustedPort.createSolutionImplementationPlan(context)).rejects.toThrow(DeepSeekModelOutputError);
    expect(exhaustedFetch).toHaveBeenCalledTimes(2);
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

  it("requires module-v1 blueprints to use only exact stable catalog kinds", async () => {
    const plan = detailedBlueprint({
      modules: [{
        id: "hero",
        name: "核心介绍",
        purpose: "介绍个人定位",
        content: ["姓名", "职业定位"],
        sampleData: [{ label: "姓名", value: "李明" }],
        interactions: [],
        expectedKind: "content.hero",
        expectedCategory: "content",
        interactionRequirements: [],
        presentation: "首屏重点介绍",
      }],
    });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(plan) } }] }),
    });
    const port = new DeepSeekModelPort({ apiKey: "test-key", fetch: fetchImpl, baseUrl: "https://mock.local" });

    await port.createDesignPlan({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [],
      requirementText: "只生成核心介绍",
      modulePlanningCatalog: [{
        kind: "content.hero",
        version: "1.0.0",
        maturity: "stable",
        variants: ["no-portrait"],
        slots: [],
        interactions: [],
      }],
      editableEntities: [{ kind: "page", name: "Page1", type: "page", guid: "page-guid" }],
    });

    const prompt = JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string).messages[1].content as string;
    expect(prompt).toContain("content.hero@1.0.0");
    expect(prompt).toContain("expectedKind");
    expect(prompt).toContain("不得把 @version 写进 expectedKind");
    expect(prompt).toContain("不得创建目录以外的模块");
    expect(prompt).toContain('interactionRequirements 的每一项必须是对象 {"type":"navigate","actionKind":"导航","target":"home"}');
    expect(prompt).toContain("不得输出字符串数组");
    expect(prompt).toContain("interactions 与 interactionRequirements 必须逐项对应");
    expect(prompt).toContain("纯展示模块必须把这两个字段都写成空数组");
    expect(prompt).toContain('navigate 的 target 必须逐字使用现有 KF 页面 ID： ["Page1"]');
    expect(prompt).not.toContain("content.timeline@1.0.0");
  });

  it("binds a single-page blueprint navigation target to the server-owned KF page identity", async () => {
    const plan = detailedBlueprint({
      modules: [{
        id: "nav",
        name: "顶部导航",
        purpose: "返回首页",
        content: ["首页"],
        sampleData: [{ label: "导航", value: "首页" }],
        interactions: ["返回首页"],
        expectedKind: "navigation.top",
        expectedCategory: "navigation",
        interactionRequirements: [{ type: "navigate", actionKind: "导航", target: "home" }],
        presentation: "顶部导航",
      }],
    });
    const port = makePort(plan);
    const result = await port.createDesignPlan({
      tenantId: "t", userId: "u", workspaceId: "w", conversationId: "c", recentMessages: [],
      requirementText: "生成导航",
      modulePlanningCatalog: [{ kind: "navigation.top", version: "1.0.0", maturity: "stable", variants: ["default"], slots: [], interactions: ["navigate"] }],
      editableEntities: [{ kind: "page", name: "Page1", type: "page", guid: "page-guid" }],
    });

    expect(result.schema).toBe("kf-design-plan/v2");
    if (result.schema !== "kf-design-plan/v2") throw new Error("expected v2 blueprint");
    expect(result.modules[0]?.interactionRequirements).toEqual([{ type: "navigate", actionKind: "导航", target: "Page1" }]);
  });

  it("spells out the complete strict ModulePlan theme contract", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(modulePlan()) } }] }),
    });
    const port = new DeepSeekModelPort({ apiKey: "test-key", fetch: fetchImpl, baseUrl: "https://mock.local" });

    await port.createModulePlan(modulePlanningContext());

    const prompt = JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string).messages[1].content as string;
    expect(prompt).toContain('"background":"#0f172a"');
    expect(prompt).toContain('"radiusScale":{"small":4,"medium":8,"large":16}');
    expect(prompt).toContain("这 10 个字段，一个都不能省略");
    expect(prompt).toContain('"mode":"vertical-flow"');
    expect(prompt).toContain("每个 page 必须包含 id、title、mode、modules");
    expect(prompt).toContain("每个 module 必须包含 id、kind、templateVersion、variant、title");
    expect(prompt).toContain('emphasis 只能是 "primary"、"secondary" 或 "subtle"');
    expect(prompt).toContain('alignment 必须使用 "stretch"');
    expect(prompt).toContain("module-bounds-insufficient");
    expect(prompt).toContain("不得输出 revisionId");
    expect(prompt).toContain('navigate 必须输出 {"type":"navigate","pageId":"<signed target>"}');
    expect(prompt).toContain('submit 必须输出 {"type":"submit","action":"<signed target>"}');
  });

  it("forces asset-free planning to choose only variants without required asset slots", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(modulePlan()) } }] }),
    });
    const port = new DeepSeekModelPort({ apiKey: "test-key", fetch: fetchImpl, baseUrl: "https://mock.local" });

    await port.createModulePlan(modulePlanningContext({
      assetCatalog: [],
      modulePlanningCatalog: [{
        kind: "content.hero",
        version: "1.0.0",
        maturity: "stable",
        variants: ["portrait-left", "portrait-right", "no-portrait"],
        slots: [{ id: "portrait", required: false, requiredForVariants: ["portrait-left", "portrait-right"], allowedKinds: ["image"] }],
        interactions: [],
        layout: { regions: ["main"], minColumnSpan: 6, maxColumnSpan: 12, preferredHeights: ["large"] },
      }, modulePlanningContext().modulePlanningCatalog[1]],
    }));

    const prompt = JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string).messages[1].content as string;
    expect(prompt).toContain("服务器资产目录为空");
    expect(prompt).toContain("content.hero 只能选择无需资源的 no-portrait");
    expect(prompt).toContain("不得选择 portrait-left 或 portrait-right");
  });

  it("binds module planning to server-owned existing page identities", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(modulePlan()) } }] }),
    });
    const port = new DeepSeekModelPort({ apiKey: "test-key", fetch: fetchImpl, baseUrl: "https://mock.local" });

    await port.createModulePlan(modulePlanningContext({
      editableEntities: [{ kind: "page", name: "home", type: "page", guid: "page-guid-home" }],
    }));
    const prompt = JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string).messages[1].content as string;
    expect(prompt).toContain('现有 KF 页面 ID（pages[].id 只能逐字使用这些值）：["home"]');

    await expect(port.createModulePlan(modulePlanningContext({
      editableEntities: [{ kind: "page", name: "Page1", type: "page", guid: "page-guid-page1" }],
    }))).rejects.toThrow(/unknown KF page/i);
  });

  it("includes server-owned content examples in the strict ModulePlan prompt", async () => {
    const oneHeroPlan = modulePlan({
      pages: [{
        ...modulePlan().pages[0],
        modules: [modulePlan().pages[0].modules[0]],
      }],
    });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(oneHeroPlan) } }] }),
    });
    const port = new DeepSeekModelPort({ apiKey: "test-key", fetch: fetchImpl, baseUrl: "https://mock.local" });

    await port.createModulePlan(modulePlanningContext({
      modulePlanningCatalog: [{
        kind: "content.hero",
        version: "1.0.0",
        maturity: "stable",
        variants: ["no-portrait"],
        slots: [],
        interactions: [],
        contentExample: { title: "工业智能平台", subtitle: "连接数据、现场与决策", description: "可信实时数据" },
        layout: { regions: ["main"], minColumnSpan: 6, maxColumnSpan: 12, preferredHeights: ["large"] },
      }],
      confirmedBlueprint: detailedBlueprint({
        modules: [{
          id: "products", name: "我的产品", purpose: "展示产品能力", content: ["产品定位"],
          sampleData: [{ label: "产品", value: "KingFusion" }], interactions: [], expectedKind: "content.hero",
          expectedCategory: "content", interactionRequirements: [], presentation: "首屏介绍",
        }],
      }),
      acceptedBlueprintArtifact: (() => {
        const blueprint = detailedBlueprint({
          modules: [{
            id: "products", name: "我的产品", purpose: "展示产品能力", content: ["产品定位"],
            sampleData: [{ label: "产品", value: "KingFusion" }], interactions: [], expectedKind: "content.hero",
            expectedCategory: "content", interactionRequirements: [], presentation: "首屏介绍",
          }],
        });
        const authority = createHmacModuleArtifactAuthority(new Uint8Array(32).fill(7));
        return authority.verifyAcceptedBlueprint(authority.signAcceptedBlueprint({
          schema: "kf-accepted-blueprint-artifact/v1", projectKey: "kingclient.portal", revisionId: "revision-1",
          blueprintHash: canonicalModuleCompilationHash(blueprint),
          modules: [{ blueprintModuleId: "products", expectedKind: "content.hero", expectedCategory: "content", interactionRequirements: [] }],
        }));
      })(),
    }));

    const prompt = JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string).messages[1].content as string;
    expect(prompt).toContain('contentExample={"description":"可信实时数据","subtitle":"连接数据、现场与决策","title":"工业智能平台"}');
    expect(prompt).toContain("content 必须是严格 JSON 字符串");
    expect(prompt).toContain("MODULE_CONTENT_INVALID");
    expect(prompt).toContain("所有字符串字段都必须保留为非空字符串");
    expect(prompt).toContain("navigation.top 的 items 数量必须与该模块签名的 navigate 要求数量完全一致");
  });

  it("keeps stable registry content examples in the runtime planning prompt", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(modulePlan()) } }] }),
    });
    const port = new DeepSeekModelPort({ apiKey: "test-key", fetch: fetchImpl, baseUrl: "https://mock.local" });
    const context = modulePlanningContext();
    const stableStatus = createDefaultModuleRegistry([{
      kind: "data.status-grid", version: "1.0.0", runtimeFamily: "KingFusion", runtimeVersion: "3.6",
      baselineId: "kf36-dashboard-admin-v1", verifiedCapabilities: ["layout.2", "text", "tag"],
    }]).listForPlanning()[0]!;

    await port.createModulePlan({ ...context, modulePlanningCatalog: [...context.modulePlanningCatalog, stableStatus] });

    const prompt = JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string).messages[1].content as string;
    expect(prompt).toContain('data.status-grid@1.0.0');
    expect(prompt).toContain('"severity":"online"');
    expect(prompt).toContain('data.status-grid@1.0.0 variants=compact,default');
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

  it("rejects normalized native keys in direct, nested-object, and nested-array module content", async () => {
    const unsafeKeys = [
      "x", "Y", "width", "HEIGHT", "geometryValue", "Geometry_Value", "ｃｓｓＲｕｌｅｓ", "CSSRules",
      "scriptCode", "nativeConfig", "pathName", "objectType", "Object_Type", "ｕｉＭｏｄｅｌＴｙｐｅ",
      "styleDataNew", "STYLE-DATA", "baseProperty", "leftTopPt", "insideObjects", "insiderObjects",
      "configureData", "layoutType", "controlGeometry", "nativePayload", "scriptBody", "pathValue",
      "__ｐｒｏｔｏ__", "prototypePollution", "constructor",
      "prefixObjectTypeSuffix", "prefixUiModelTypeSuffix", "prefixStyleDataNewSuffix",
      "prefixConfigureDataSuffix", "prefixBasePropertySuffix", "prefixLeftTopPtSuffix",
      "prefixInsideObjectsSuffix", "prefixInsiderObjectsSuffix", "prefixLayoutTypeSuffix",
      "prefixControlGeometrySuffix", "prefixNativePayloadSuffix", "prefixScriptBodySuffix",
      "prefixCssRulesSuffix", "prefixPathValueSuffix", "preferredHeight", "preferredHeightConfig",
    ];
    const first = modulePlan().pages[0].modules[0];
    const second = modulePlan().pages[0].modules[1];
    const withFirstModule = (replacement: Record<string, unknown>) => modulePlan({
      pages: [{ ...modulePlan().pages[0], modules: [{ ...first, ...replacement }, second] }],
    });
    const candidates = unsafeKeys.flatMap((key) => [
      withFirstModule({ content: { [key]: "unsafe" } }),
      withFirstModule({ content: JSON.stringify({ semanticContent: { [key]: "unsafe" } }) }),
      withFirstModule({ content: JSON.stringify({ semanticContent: [{ title: "safe" }, { [key]: "unsafe" }] }) }),
    ]);

    for (const candidate of candidates) {
      await expect(makePort(candidate).createModulePlan(modulePlanningContext()))
        .rejects.toThrow(/contains forbidden field|unsafe key/);
    }

    const safe = withFirstModule({ content: JSON.stringify({ title: "安全标题", description: "安全描述", asset: { id: "portrait", label: "头像" } }) });
    await expect(makePort(safe).createModulePlan(modulePlanningContext())).resolves.toEqual(safe);

    const embeddedOperationsWrapper = withFirstModule({
      content: JSON.stringify({ operations: [{ op: "move", placement: { preferredHeight: "large" } }] }),
    });
    await expect(makePort(embeddedOperationsWrapper).createModulePlan(modulePlanningContext()))
      .rejects.toThrow("contains forbidden field: preferredHeight");

    const wrongRootOperation = modulePlan({
      operations: [{ op: "remove", pageId: "home", moduleId: "productsHero", placement: { preferredHeight: "large" } }],
    });
    await expect(makePort(wrongRootOperation).createModulePlan(modulePlanningContext()))
      .rejects.toThrow("contains forbidden field: preferredHeight");
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

    const movedPlacement = { ...previous.pages[0].modules[0].placement, alignment: "center" };
    const moved = modulePlan({
      pages: [{ ...previous.pages[0], modules: [{ ...previous.pages[0].modules[0], placement: movedPlacement }, previous.pages[0].modules[1]] }],
      operations: [{ op: "move", pageId: "home", moduleId: "productsHero", placement: movedPlacement }],
    });
    await expect(makePort(moved).reviseModulePlan(modulePlanningContext({ previousModulePlan: previous })))
      .resolves.toEqual(expect.objectContaining({ schema: "kf-module-plan/v1" }));

    const omitted = modulePlan({ pages: [{ ...previous.pages[0], modules: [previous.pages[0].modules[0]] }] });
    await expect(makePort(omitted).reviseModulePlan(modulePlanningContext({ previousModulePlan: previous })))
      .rejects.toThrow("accepted blueprint still requires removed module");

    const silentChange = modulePlan({ pages: [{
      ...previous.pages[0],
      modules: [{ ...previous.pages[0].modules[0], title: "偷改标题" }, previous.pages[0].modules[1]],
    }] });
    await expect(makePort(silentChange).reviseModulePlan(modulePlanningContext({ previousModulePlan: previous })))
      .resolves.toMatchObject({ operations: [{ op: "update", moduleId: "productsHero", changes: { title: "偷改标题" } }] });

    const resizeMasksTitle = modulePlan({
      pages: [{ ...previous.pages[0], modules: [{ ...previous.pages[0].modules[0], title: "不该被 resize 掩盖" }, previous.pages[0].modules[1]] }],
      operations: [{ op: "resize", pageId: "home", moduleId: "productsHero", columnSpan: 12, preferredHeight: "large" }],
    });
    await expect(makePort(resizeMasksTitle).reviseModulePlan(modulePlanningContext({ previousModulePlan: previous })))
      .resolves.toMatchObject({
        operations: [{ op: "update", moduleId: "productsHero", changes: { title: "不该被 resize 掩盖" } }],
      });
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

  it("rejects model-authored compiler asset bindings instead of persisting or ignoring them", async () => {
    const port = makePort({
      operations: [],
      assetBindings: [{
        assetId: "asset-00000000000040008000000000000001",
        entityId: "portrait",
      }],
    });
    await expect(port.createChangePlan({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [],
      requirementText: "使用头像",
      editableEntities: [],
    })).rejects.toThrow(/assetBindings.*server|compiler-owned/i);
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
