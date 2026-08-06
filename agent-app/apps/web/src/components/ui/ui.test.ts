// @ts-nocheck -- 组件测试 JS 风格；运行时断言由 vitest 验证。
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import StatCard from "./StatCard.vue";
import EmptyState from "./EmptyState.vue";
import StatusBadge from "./StatusBadge.vue";
import SkeletonCard from "./SkeletonCard.vue";

describe("StatCard", () => {
  it("renders label and value", () => {
    const wrapper = mount(StatCard, { props: { label: "工程总数", value: 3 } });
    expect(wrapper.get('[data-testid="stat-value"]').text()).toBe("3");
    expect(wrapper.text()).toContain("工程总数");
  });
});

describe("EmptyState", () => {
  it("emits action when CTA clicked", async () => {
    const wrapper = mount(EmptyState, { props: { title: "还没有工程", actionText: "新建工程" } });
    await wrapper.get('[data-testid="empty-action"]').trigger("click");
    expect(wrapper.emitted("action")).toBeTruthy();
  });
});

describe("StatusBadge", () => {
  it("maps status to data-status", () => {
    const wrapper = mount(StatusBadge, { props: { status: "active", label: "进行中" } });
    expect(wrapper.get('[data-testid="status-badge"]').attributes("data-status")).toBe("active");
  });
});

describe("SkeletonCard", () => {
  it("renders count cards", () => {
    const wrapper = mount(SkeletonCard, { props: { count: 2 } });
    expect(wrapper.findAll(".skeleton-card")).toHaveLength(2);
  });
});
