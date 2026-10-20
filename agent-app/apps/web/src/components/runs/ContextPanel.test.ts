// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ContextPanel from "./ContextPanel.vue";

const panes = [
  { id: "plan", label: "方案" },
  { id: "project", label: "工程" },
  { id: "revision", label: "版本" },
  { id: "usage", label: "用量" },
];

const facts = {
  page: "能耗对比（1 页）",
  mode: "图生工程",
  baseVersion: "v1.3",
  planHash: "a3f9c21e4b7d",
  analysisVersion: "9f2a01cc9e77",
};

describe("ContextPanel", () => {
  it("renders the four tabs and marks the active one", () => {
    const wrapper = mount(ContextPanel, { props: { panes, active: "plan", facts } });
    const tabs = wrapper.findAll(".tabs button");
    expect(tabs).toHaveLength(4);
    expect(tabs[0]?.classes()).toContain("on");
    expect(tabs[1]?.classes()).not.toContain("on");
  });

  it("shows plan facts with shortened hashes and the signed mark", () => {
    const wrapper = mount(ContextPanel, { props: { panes, active: "plan", facts, controlCount: 12 } });
    expect(wrapper.text()).toContain("能耗对比（1 页）");
    expect(wrapper.text()).toContain("a3f9…4b7d");
    expect(wrapper.text()).toContain("✓已签名");
    expect(wrapper.text()).toContain("控件清单（12）");
  });

  it("emits the tab id when switched", async () => {
    const wrapper = mount(ContextPanel, { props: { panes, active: "plan", facts } });
    await wrapper.findAll(".tabs button")[2]?.trigger("click");
    expect(wrapper.emitted("update:active")?.[0]).toEqual(["revision"]);
  });

  it("omits the analysis row when the value is absent", () => {
    const wrapper = mount(ContextPanel, {
      props: { panes, active: "plan", facts: { ...facts, analysisVersion: undefined } },
    });
    expect(wrapper.text()).not.toContain("分析版本");
  });
});
// end
