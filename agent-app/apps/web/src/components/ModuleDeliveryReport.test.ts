import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ModuleDeliveryReport from "./ModuleDeliveryReport.vue";

const result = {
  modulePlanHash: "1".repeat(64),
  projectKey: "kingclient",
  status: "ready_with_warnings" as const,
  implementedModules: [
    { pageId: "home", moduleId: "hero", kind: "content.hero" },
    { pageId: "home", moduleId: "contact", kind: "content.contact-footer" },
  ],
  gaps: [{
    moduleId: "hero",
    requirement: "使用柔和投影",
    severity: "warning" as const,
    status: "unresolved" as const,
    reason: "当前 KF 运行时仅支持基础投影",
    alternatives: ["使用浅色边框增强层级"],
  }],
  repairCount: 2,
  revisionDiff: { changedModules: ["hero"], preservedModules: ["contact"] },
};

describe("ModuleDeliveryReport", () => {
  it("shows customer-facing implementation, warnings, repairs, and revision diff", () => {
    const wrapper = mount(ModuleDeliveryReport, { props: { result } });

    expect(wrapper.get('[data-testid="delivery-status"]').text()).toContain("可交付，有提示");
    expect(wrapper.text()).toContain("hero");
    expect(wrapper.text()).toContain("contact");
    expect(wrapper.text()).toContain("当前 KF 运行时仅支持基础投影");
    expect(wrapper.text()).toContain("自动修复 2 次");
    expect(wrapper.text()).toContain("本次调整");
    expect(wrapper.text()).toContain("完整保留");
    expect(wrapper.text()).not.toMatch(/modulePlanHash|kf-module-plan|kf-change-plan|11111111/);
  });

  it("keeps a blocked requirement visible and marks delivery as unavailable", () => {
    const wrapper = mount(ModuleDeliveryReport, {
      props: {
        result: {
          ...result,
          status: "blocked" as const,
          gaps: [{
            moduleId: "hero",
            status: "unresolved" as const,
            alternatives: ["使用浅色边框增强层级"],
            severity: "blocking" as const,
            requirement: "提供可用的个人头像资源",
            reason: "缺少已批准的图片资源",
          }],
        },
      },
    });

    expect(wrapper.get('[data-testid="delivery-status"]').text()).toContain("暂不可交付");
    expect(wrapper.get('[data-testid="unsupported-requirements"]').text()).toContain("提供可用的个人头像资源");
    expect(wrapper.text()).toContain("缺少已批准的图片资源");
  });
});
