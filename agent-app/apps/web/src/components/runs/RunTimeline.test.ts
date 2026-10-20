// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import RunTimeline, { type TimelineStep } from "./RunTimeline.vue";

const steps: TimelineStep[] = [
  { stepKey: "upload", label: "上传校验", status: "done", durationMs: 300, detail: "PNG · 1440×900" },
  { stepKey: "plan", label: "方案生成", status: "failed", durationMs: 8400,
    tags: [{ text: "修复 ×1", tone: "repair" }] },
];

describe("RunTimeline", () => {
  it("shows the step counter and each step's duration", () => {
    const wrapper = mount(RunTimeline, { props: { steps } });
    expect(wrapper.find(".t-status").text()).toBe("步骤 1/2");
    expect(wrapper.text()).toContain("0.3s");
    expect(wrapper.text()).toContain("8.4s");
  });

  it("marks failed steps in the warning tone and keeps details", () => {
    const wrapper = mount(RunTimeline, { props: { steps } });
    const dots = wrapper.findAll(".dot");
    expect(dots[0]?.classes()).toContain("done");
    expect(dots[1]?.classes()).toContain("warn");
    expect(wrapper.text()).toContain("修复 ×1");
    expect(wrapper.text()).toContain("PNG · 1440×900");
  });

  it("collapses the body when the header is clicked", async () => {
    const wrapper = mount(RunTimeline, { props: { steps } });
    await wrapper.find(".timeline-head").trigger("click");
    expect(wrapper.find(".timeline-body").exists()).toBe(false);
  });
});
// end
