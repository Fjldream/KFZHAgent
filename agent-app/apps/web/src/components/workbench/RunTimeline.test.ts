// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
// 时间线测试：默认折叠为一行摘要，展开后才渲染步骤细节。
// end
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import RunTimeline from "./RunTimeline.vue";
import { workbenchTimelineSteps } from "./workbench-mock";

describe("RunTimeline", () => {
  it("starts collapsed and expands to real step states on demand", async () => {
    const wrapper = mount(RunTimeline, {
      props: {
        steps: workbenchTimelineSteps,
        title: "正在生成组件方案",
        elapsedLabel: "已用时 12 秒",
        running: true,
      },
    });

    const toggle = wrapper.get('[data-testid="timeline-toggle"]');
    expect(toggle.attributes("aria-expanded")).toBe("false");
    expect(wrapper.get("#wb-timeline-body").attributes("style")).toContain("display: none");
    expect(wrapper.text()).toContain("步骤 3/5");

    await toggle.trigger("click");
    expect(toggle.attributes("aria-expanded")).toBe("true");
    expect(wrapper.get("#wb-timeline-body").attributes("style") ?? "").not.toContain("display: none");
    expect(wrapper.text()).toContain("缓存命中");
    expect(wrapper.text()).toContain("修复 ×1");
    wrapper.unmount();
  });
});
