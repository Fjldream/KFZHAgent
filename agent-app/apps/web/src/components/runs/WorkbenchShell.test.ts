// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import WorkbenchShell from "./WorkbenchShell.vue";

const slots = {
  sidebar: "<div>会话列表</div>",
  main: "<div>对话流</div>",
  inspector: "<div>情境面板</div>",
  titlebar: "<span>已完成</span>",
};

describe("WorkbenchShell", () => {
  it("renders the three regions from the design", () => {
    const wrapper = mount(WorkbenchShell, { props: { title: "能耗对比页面改版" }, slots });
    expect(wrapper.find(".sidebar").text()).toContain("会话列表");
    expect(wrapper.find(".main-body").text()).toContain("对话流");
    expect(wrapper.find(".inspector").text()).toContain("情境面板");
    expect(wrapper.find(".title").text()).toBe("能耗对比页面改版");
    expect(wrapper.find(".titlebar-end").text()).toContain("已完成");
  });

  it("drops the inspector when asked, keeping the main area", () => {
    const wrapper = mount(WorkbenchShell, {
      props: { title: "x", inspectorVisible: false },
      slots,
    });
    expect(wrapper.find(".inspector").exists()).toBe(false);
    expect(wrapper.classes()).toContain("inspector-hidden");
  });
});
// end
