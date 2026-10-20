// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ConversationSidebar from "./ConversationSidebar.vue";
import type { SidebarConversation } from "./types.js";

const conversations: SidebarConversation[] = [
  { id: "c1", title: "能耗对比页面改版", state: "running", unread: 2, meta: "生成组件方案中 · 12 秒" },
  { id: "c2", title: "灌装车间报表", state: "queued" },
  { id: "c3", title: "锅炉监控大屏", state: "done", unread: 1, meta: "已完成 · 新版本 v1.4 可下载" },
  { id: "c4", title: "登录页样式讨论", state: "discuss" },
  { id: "c5", title: "一期历史遗留问题", state: "archived", meta: "归档 · 10-14" },
];

const mountSidebar = () => mount(ConversationSidebar, {
  props: { workspaceName: "💧 水处理监控工程", conversations, activeId: "c1" },
});

describe("ConversationSidebar", () => {
  it("renders the four live states and groups archived ones separately", () => {
    const wrapper = mountSidebar();
    expect(wrapper.find(".conv.active").text()).toContain("能耗对比页面改版");
    expect(wrapper.text()).toContain("排队中（本会话完成后执行）");
    expect(wrapper.text()).toContain("讨论 · 不构建");
    expect(wrapper.text()).toContain("已归档 (1)");
  });

  it("emits select with the clicked conversation id", async () => {
    const wrapper = mountSidebar();
    await wrapper.findAll(".conv")[2]?.trigger("click");
    expect(wrapper.emitted("select")?.[0]).toEqual(["c3"]);
  });

  it("filters by the search box", async () => {
    const wrapper = mountSidebar();
    await wrapper.find("input").setValue("报表");
    expect(wrapper.findAll(".conv")).toHaveLength(1);
    expect(wrapper.text()).toContain("灌装车间报表");
  });

  it("emits create when the new-conversation button is pressed", async () => {
    const wrapper = mountSidebar();
    await wrapper.find(".new-conv").trigger("click");
    expect(wrapper.emitted("create")).toHaveLength(1);
  });
});
// end
