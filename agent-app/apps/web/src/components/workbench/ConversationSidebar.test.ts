// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
// 会话导航测试：默认隐藏归档、搜索过滤、点击回传选中会话。
// end
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ConversationSidebar from "./ConversationSidebar.vue";
import { workbenchConversations } from "./workbench-mock";

function mountSidebar() {
  return mount(ConversationSidebar, {
    props: {
      workspaceName: "水处理监控工程",
      conversations: workbenchConversations,
      activeId: "conv-energy",
    },
  });
}

describe("ConversationSidebar", () => {
  it("separates active conversations from archived ones", async () => {
    const wrapper = mountSidebar();
    expect(wrapper.find('[data-testid="conversation-conv-energy"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="conversation-conv-legacy"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("归档管理");

    await wrapper.get('[data-testid="toggle-archive"]').trigger("click");
    expect(wrapper.find('[data-testid="conversation-conv-legacy"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it("filters by title and emits the selected conversation", async () => {
    const wrapper = mountSidebar();
    await wrapper.get('[data-testid="conversation-search"]').setValue("锅炉");
    expect(wrapper.find('[data-testid="conversation-conv-boiler"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="conversation-conv-energy"]').exists()).toBe(false);

    await wrapper.get('[data-testid="conversation-conv-boiler"]').trigger("click");
    expect(wrapper.emitted("select")).toEqual([["conv-boiler"]]);
    wrapper.unmount();
  });

  it("marks the active conversation and shows unread badges", () => {
    const wrapper = mountSidebar();
    expect(wrapper.get('[data-testid="conversation-conv-energy"]').attributes("aria-current")).toBe("true");
    expect(wrapper.text()).toContain("2");
    wrapper.unmount();
  });
});
