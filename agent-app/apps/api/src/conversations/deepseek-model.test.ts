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
