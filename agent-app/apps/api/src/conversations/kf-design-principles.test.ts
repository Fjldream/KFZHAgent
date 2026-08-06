// @ts-nocheck -- mock-fetch 场景的 JS 风格测试；行为由 vitest 断言验证（与 deepseek-model.test.ts 一致）。
import { describe, expect, it, vi } from "vitest";
import {
  KF_DESIGN_PRINCIPLES,
  KF_DESIGN_PRINCIPLES_FULL,
} from "./kf-design-principles.js";
import { DeepSeekModelPort } from "./deepseek-model.js";

/** 设计计划层支持的 12 种控件类型（与 DesignPlanControlType 对齐）。 */
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
];

describe("KF_DESIGN_PRINCIPLES", () => {
  it("is a non-empty design guidance string", () => {
    expect(KF_DESIGN_PRINCIPLES.length).toBeGreaterThan(500);
  });

  it("includes two-pass and restraint principles", () => {
    expect(KF_DESIGN_PRINCIPLES).toContain("两遍");
    expect(KF_DESIGN_PRINCIPLES).toContain("记忆点");
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

  it("lists all 12 supported KF control types", () => {
    for (const control of CONTROLS) {
      expect(KF_DESIGN_PRINCIPLES_FULL).toContain(control);
    }
  });

  it("forbids faking a chart with a button", () => {
    expect(KF_DESIGN_PRINCIPLES_FULL).toContain("不得用按钮冒充");
  });
});

describe("DeepSeekModelPort integration", () => {
  it("injects KF_DESIGN_PRINCIPLES_FULL into the shared system prompt", async () => {
    const plan = {
      schema: "kf-design-plan/v1",
      displayName: "监控大屏",
      summary: "深色工业风",
      layoutConcept: "顶部标题 + 中部趋势区",
      styleDirection: "深色工业风",
      sections: [{ id: "kpi", label: "KPI 区", controls: [{ type: "text", text: "产量" }] }],
      signature: "趋势联动 KPI",
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
  });
});
