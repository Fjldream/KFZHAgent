// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import MessageBubble from "./MessageBubble.vue";

describe("MessageBubble", () => {
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
