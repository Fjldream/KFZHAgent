// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import MessageBubble from "./MessageBubble.vue";
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import { parseCustomerEffectBlueprint } from "../../types.js";
// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
function blueprintMessage(step: Record<string, unknown>, region: Record<string, unknown> = {}) {
// end
  return "KF_BLUEPRINT_MESSAGE/1\n" + JSON.stringify({ kind: "kf-customer-effect-blueprint", version: 1,
    revision: 1, designPlanHash: "a".repeat(64), blueprint: { schema: "kf-design-plan/v3", displayName: "能源总览", objective: "查看演示能源信息",
      audiences: ["操作员"], scenarios: ["阅读概览"], pages: [{ id: "overview", title: "总览", purpose: "阅读能源概况", readingOrder: ["summary"],
        regions: [{ id: "summary", purpose: "演示概况", semanticRoles: ["摘要"], dataShape: "summary", density: "comfortable", importance: "primary",
          // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
          content: ["今日用电量"], sampleData: [], interactions: [], states: ["初始"], visualIntent: "清晰", ...region }] }],
          // end
      journeys: [{ id: "read-overview", actor: "操作员", goal: "阅读能源信息", steps: [{ pageId: "overview", regionId: "summary", action: "查看用电量", result: "看到指标", ...step }], completion: "指标可读" }],
      visualDirection: { tone: "清晰", colors: ["蓝色"], typography: "清晰", spacingAndSurfaces: "舒适" }, acceptanceScenarios: ["指标可见"], openQuestions: [] } });
}
// end

describe("MessageBubble", () => {
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  it("shows the exact proposed visual source association before confirmation", () => {
    const text = blueprintMessage({}, { visualRegionIds: ["kpi-label", "kpi-value"] });
    expect(mount(MessageBubble, { props: { role: "assistant", text } }).text()).toContain("参考图来源：kpi-label、kpi-value");
  });
  it.each([[], ["same", "same"], ["unknown:id"], Array.from({ length: 101 }, (_, index) => `region-${index}`)].map((visualRegionIds) => ({ visualRegionIds })))("rejects invalid visual source metadata %j", ({ visualRegionIds }) => {
    expect(parseCustomerEffectBlueprint(blueprintMessage({}, { visualRegionIds }))).toBeNull();
  });
  // end
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  it("shows the approved observation kind and exact expected text", () => {
    const text = blueprintMessage({ kind: "observe", expectedTexts: ["今日用电量", "12,480"] });
    const wrapper = mount(MessageBubble, { props: { role: "assistant", text } });
    expect(wrapper.text()).toContain("观察内容");
    expect(wrapper.text()).toContain("应看到的文字：今日用电量、12,480");
  });
  it("keeps legacy steps interactive without injecting a kind", () => {
    const text = blueprintMessage({});
    const parsed = parseCustomerEffectBlueprint(text);
    expect(parsed?.schema === "kf-design-plan/v3" && parsed.journeys[0]?.steps[0]).not.toHaveProperty("kind");
    expect(mount(MessageBubble, { props: { role: "assistant", text } }).text()).toContain("执行交互");
  });
  it.each([{ kind: "observe" }, { kind: "observe", expectedTexts: [] }, { kind: "observe", expectedTexts: ["重复", "重复"] },
    { expectedTexts: ["不可隐式观察"] }, { kind: "interact", expectedTexts: ["不应有此字段"] }, { kind: "read" }])("rejects ambiguous observation views %j", (step) => {
    expect(parseCustomerEffectBlueprint(blueprintMessage(step))).toBeNull();
  });
  // end
  it("right-aligns user messages with attachment purpose tags", () => {
    const wrapper = mount(MessageBubble, {
      props: { role: "user", text: "参考这张图做页面", attachments: [{ name: "a.png", kind: "reference" as const }] },
    });
    expect(wrapper.classes()).toContain("msg-user");
    expect(wrapper.text()).toContain("参考图");
    expect(wrapper.text()).toContain("参考图默认不打包进交付工程");
  });

  it("renders an assistant decision summary under its label", () => {
    const wrapper = mount(MessageBubble, {
      props: { role: "assistant", label: "📌 决策摘要", text: "识别到 7 个区域" },
    });
    expect(wrapper.classes()).toContain("msg-assistant");
    expect(wrapper.find(".ds-label").text()).toContain("决策摘要");
    expect(wrapper.text()).toContain("识别到 7 个区域");
  });
});
// end
