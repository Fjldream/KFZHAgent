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

const usage = {
  callsUsed: 5, callsLimit: 8, costEstimate: "¥0.42",
  inputTokens: 42300, inputLimit: 120000, outputTokens: 6100, outputLimit: 80000,
  cacheHitPercent: 71, usageUnknownCount: 1,
};

describe("ContextPanel", () => {
  it("renders the four tabs and marks the active one", () => {
    const wrapper = mount(ContextPanel, { props: { panes, active: "plan", facts } });
    expect(wrapper.findAll(".tabs button")).toHaveLength(4);
    expect(wrapper.findAll(".tabs button")[0]?.classes()).toContain("on");
  });

  it("shows plan facts with shortened hashes and the signed mark", () => {
    const wrapper = mount(ContextPanel, { props: { panes, active: "plan", facts, controlCount: 12 } });
    expect(wrapper.text()).toContain("a3f9…4b7d");
    expect(wrapper.text()).toContain("✓已签名");
    expect(wrapper.text()).toContain("控件清单（12）");
  });

  it("renders budget usage with bars and the unknown-usage warning", () => {
    const wrapper = mount(ContextPanel, { props: { panes, active: "usage", facts, usage } });
    expect(wrapper.text()).toContain("¥0.42");
    expect(wrapper.text()).toContain("5/8");
    expect(wrapper.find(".fill.orange").attributes("style")).toContain("63%");
    expect(wrapper.find(".fill.green").attributes("style")).toContain("71%");
    expect(wrapper.text()).toContain("1 次调用 usage 未知");
  });

  it("lists revisions and marks the current one", () => {
    const wrapper = mount(ContextPanel, {
      props: { panes, active: "revision", facts,
        revisions: [{ version: "v1.3", at: "10-19", current: true }, { version: "v1.2", at: "10-11" }] },
    });
    expect(wrapper.findAll(".rev")).toHaveLength(2);
    expect(wrapper.text()).toContain("当前");
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
