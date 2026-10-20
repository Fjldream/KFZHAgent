// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
// 视觉确认卡测试：区域叠层与映射行双向联动。
// end
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import VisualConfirmCard from "./VisualConfirmCard.vue";
import { workbenchRegions } from "./workbench-mock";

describe("VisualConfirmCard", () => {
  it("highlights the matching region when a mapping row is hovered", async () => {
    const wrapper = mount(VisualConfirmCard, { props: { regions: workbenchRegions } });

    const row = wrapper.get('[data-testid="mapping-4"]');
    await row.trigger("mouseenter");
    expect(wrapper.get('[data-testid="region-4"]').classes()).toContain("is-hl");

    await row.trigger("mouseleave");
    expect(wrapper.get('[data-testid="region-4"]').classes()).not.toContain("is-hl");
    wrapper.unmount();
  });

  it("highlights the mapping row when a region receives keyboard focus", async () => {
    const wrapper = mount(VisualConfirmCard, { props: { regions: workbenchRegions } });

    await wrapper.get('[data-testid="region-2"]').trigger("focus");
    expect(wrapper.get('[data-testid="mapping-2"]').classes()).toContain("is-hl");

    await wrapper.get('[data-testid="region-2"]').trigger("blur");
    expect(wrapper.get('[data-testid="mapping-2"]').classes()).not.toContain("is-hl");
    wrapper.unmount();
  });

  it("shows low-confidence regions as unverified instead of relying on color only", () => {
    const wrapper = mount(VisualConfirmCard, { props: { regions: workbenchRegions } });
    const lowConfidence = wrapper.get('[data-testid="mapping-4"]');
    expect(lowConfidence.text()).toContain("未验证");
    expect(wrapper.get('[data-testid="region-4"]').classes()).toContain("is-lowconf");
    wrapper.unmount();
  });
});
