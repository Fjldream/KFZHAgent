// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ApprovalCard from "./ApprovalCard.vue";

const summary = { page: "能耗对比", controls: 12, layout: "Desktop 1440", baseVersion: "v1.3" };

const mountCard = (submitting = false) => mount(ApprovalCard, {
  props: { summary, planHash: "a3f9c21e4b7d", submitting },
});

describe("ApprovalCard", () => {
  it("shows the plan summary and a shortened signed hash", () => {
    const wrapper = mountCard();
    expect(wrapper.text()).toContain("能耗对比");
    expect(wrapper.text()).toContain("12");
    expect(wrapper.text()).toContain("已签名");
    expect(wrapper.find(".plan-hash code").text()).toBe("a3f9…4b7d");
    expect(wrapper.find(".plan-hash code").attributes("title")).toBe("a3f9c21e4b7d");
  });

  it("emits the three approval actions", async () => {
    const wrapper = mountCard();
    await wrapper.find(".btn.primary").trigger("click");
    await wrapper.find(".btn.secondary").trigger("click");
    await wrapper.find(".link").trigger("click");
    expect(wrapper.emitted("approve")).toHaveLength(1);
    expect(wrapper.emitted("revise")).toHaveLength(1);
    expect(wrapper.emitted("cancel")).toHaveLength(1);
  });

  it("blocks repeated clicks while submitting", async () => {
    const wrapper = mountCard(true);
    await wrapper.find(".btn.primary").trigger("click");
    expect(wrapper.emitted("approve")).toBeUndefined();
    expect(wrapper.find(".btn.primary").attributes("disabled")).toBeDefined();
  });
});
// end
