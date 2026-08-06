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

  it("createDesignPlan returns a valid DesignPlan", async () => {
    const plan = {
      schema: "kf-design-plan/v1",
      displayName: "监控大屏",
      summary: "深色工业风",
      layoutConcept: "顶部标题 + 中部趋势区",
      styleDirection: "深色工业风",
      sections: [{ id: "kpi", label: "KPI 区", controls: [{ type: "text", text: "产量" }] }],
      signature: "趋势联动 KPI",
    };
    const port = makePort(plan);
    const result = await port.createDesignPlan({
      tenantId: "t",
      userId: "u",
      workspaceId: "w",
      conversationId: "c",
      recentMessages: [],
      requirementText: "做一个监控大屏",
    });
    expect(result.displayName).toBe("监控大屏");
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].controls[0].type).toBe("text");
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
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                ...previousPlan,
                displayName: "监控大屏v2",
                summary: "修订版",
                signature: "大标题吸色",
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
      { revising: true },
    );
    expect(result.displayName).toBe("监控大屏v2");
    // 修订上下文必须出现在 user prompt：上一版计划 + 客户修改意见 + 修订指令。
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    const userPrompt = body.messages[1].content;
    expect(userPrompt).toContain("上一版设计计划");
    expect(userPrompt).toContain(JSON.stringify(previousPlan));
    expect(userPrompt).toContain("把大标题改成红色");
    expect(userPrompt).toContain("在上一版基础上修订");
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
