// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import RunWorkbenchView from "./RunWorkbenchView.vue";

describe("RunWorkbenchView", () => {
  it("composes the shell, status capsule, composer and context panel", () => {
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } });
    expect(wrapper.find(".shell").exists()).toBe(true);
    expect(wrapper.find(".capsule").exists()).toBe(true);
    expect(wrapper.find(".composer").exists()).toBe(true);
    expect(wrapper.find(".insp").exists()).toBe(true);
    expect(wrapper.text()).toContain("发送一条需求即可开始一次运行");
  });

  it("refuses to submit before a conversation is selected", async () => {
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } });
    const textarea = wrapper.find("textarea");
    await textarea.setValue("做一个能耗页面");
    await textarea.trigger("keydown", { key: "Enter" });
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("尚未选择会话");
  });
});
// end
