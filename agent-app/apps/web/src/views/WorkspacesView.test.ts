// @ts-nocheck -- 组件测试为 JS 风格（vi.mock 工厂返回非类型化桩对象）。
// Task 9 Step 2：列表页 WorkspacesView——渲染列表、空态、新建/上传跳转、错误态。
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import WorkspacesView from "./WorkspacesView.vue";

const pushMock = vi.hoisted(() => vi.fn());
const listWorkspacesMock = vi.hoisted(() => vi.fn());
const createWorkspaceMock = vi.hoisted(() => vi.fn());
const deleteWorkspaceMock = vi.hoisted(() => vi.fn());
const sessionState = vi.hoisted(() => ({
  tenantName: "E2E Acme",
  user: { username: "alice" },
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: pushMock }),
  useRoute: () => ({ query: {} }),
}));
vi.mock("../api", () => ({
  api: {
    listWorkspaces: listWorkspacesMock,
    createWorkspace: createWorkspaceMock,
    deleteWorkspace: deleteWorkspaceMock,
  },
}));
vi.mock("../stores/session", () => ({
  useSession: () => ({ state: sessionState, logout: vi.fn() }),
}));

const wsA = { id: "ws-1", name: "客户展示大屏", mode: "new", currentRevisionId: "r9" };
const wsB = { id: "ws-2", name: "设备监控", mode: "upload", currentRevisionId: null };

afterEach(() => {
  pushMock.mockClear();
  listWorkspacesMock.mockReset();
  createWorkspaceMock.mockReset();
  deleteWorkspaceMock.mockReset();
});

describe("WorkspacesView", () => {
  it("renders workspace cards from api.listWorkspaces", async () => {
    listWorkspacesMock.mockResolvedValue([wsA, wsB]);
    const wrapper = mount(WorkspacesView);
    await flushPromises();
    const cards = wrapper.findAll("[data-workspace-id]");
    expect(cards.length).toBe(2);
    expect(cards[0].attributes("data-workspace-id")).toBe("ws-1");
    expect(cards[1].attributes("data-workspace-id")).toBe("ws-2");
    expect(wrapper.text()).toContain("客户展示大屏");
    expect(wrapper.text()).toContain("上传工程");
  });

  it("shows the empty state when no workspaces exist", async () => {
    listWorkspacesMock.mockResolvedValue([]);
    const wrapper = mount(WorkspacesView);
    await flushPromises();
    expect(wrapper.get('[data-testid="empty-state"]').text()).toContain("还没有工程");
    expect(wrapper.find("[data-workspace-id]").exists()).toBe(false);
  });

  it("filters workspace cards by search query", async () => {
    listWorkspacesMock.mockResolvedValue([wsA, wsB]);
    const wrapper = mount(WorkspacesView);
    await flushPromises();
    expect(wrapper.findAll("[data-workspace-id]").length).toBe(2);

    await wrapper.get('[data-testid="workspace-search"]').setValue("设备");
    await flushPromises();
    const cards = wrapper.findAll("[data-workspace-id]");
    expect(cards.length).toBe(1);
    expect(cards[0].attributes("data-workspace-id")).toBe("ws-2");

    await wrapper.get('[data-testid="workspace-search"]').setValue("不存在的工程");
    await flushPromises();
    expect(wrapper.findAll("[data-workspace-id]").length).toBe(0);
    expect(wrapper.get('[data-testid="empty-state"]').text()).toContain("没有匹配的工程");
  });

  it("creates a workspace from the empty-state action with a fallback name", async () => {
    listWorkspacesMock.mockResolvedValue([]);
    createWorkspaceMock.mockResolvedValue({ ...wsA, id: "ws-empty", name: "未命名方案" });
    const wrapper = mount(WorkspacesView);
    await flushPromises();
    await wrapper.get('[data-testid="empty-action"]').trigger("click");
    await flushPromises();
    expect(createWorkspaceMock).toHaveBeenCalledWith({ name: "未命名方案", mode: "new" });
    expect(pushMock).toHaveBeenCalledWith("/workspaces/ws-empty");
  });

  it("creates a new workspace and navigates to /workspaces/{id}", async () => {
    listWorkspacesMock.mockResolvedValue([]);
    createWorkspaceMock.mockResolvedValue({ ...wsA, id: "ws-new", name: "新方案" });
    const wrapper = mount(WorkspacesView);
    await flushPromises();
    await wrapper.get('[data-testid="workspace-name"]').setValue("新方案");
    await wrapper.get('[data-testid="create-workspace"]').trigger("click");
    await flushPromises();
    expect(createWorkspaceMock).toHaveBeenCalledWith({ name: "新方案", mode: "new" });
    expect(pushMock).toHaveBeenCalledWith("/workspaces/ws-new");
  });

  it("creates an upload workspace and navigates to /workspaces/{id}", async () => {
    listWorkspacesMock.mockResolvedValue([]);
    createWorkspaceMock.mockResolvedValue({ ...wsB, id: "ws-up", name: "导入方案" });
    const wrapper = mount(WorkspacesView);
    await flushPromises();
    await wrapper.get('[data-testid="workspace-name"]').setValue("导入方案");
    await wrapper.get('[data-testid="upload-workspace"]').trigger("click");
    await flushPromises();
    expect(createWorkspaceMock).toHaveBeenCalledWith({ name: "导入方案", mode: "upload" });
    expect(pushMock).toHaveBeenCalledWith("/workspaces/ws-up");
  });

  it("shows workspace-error when listing workspaces fails", async () => {
    listWorkspacesMock.mockRejectedValue(new Error("数据库连接失败"));
    const wrapper = mount(WorkspacesView);
    await flushPromises();
    expect(wrapper.get('[data-testid="workspace-error"]').text()).toContain("数据库连接失败");
  });

  it("deletes a workspace from the card and refreshes the list", async () => {
    listWorkspacesMock.mockResolvedValue([wsA, wsB]);
    const wrapper = mount(WorkspacesView);
    await flushPromises();

    // 打开行操作菜单 → 点击删除 → 打开确认弹层，且不触发进入详情页的跳转。
    await wrapper.get('[data-testid="workspace-menu-ws-1"]').trigger("click");
    await wrapper.get('[data-testid="menu-delete"]').trigger("click");
    expect(pushMock).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="delete-confirm-list"]').text()).toContain("客户展示大屏");

    // 确认删除 → 调用 API 并刷新列表（ws-1 消失）。
    deleteWorkspaceMock.mockResolvedValue(undefined);
    listWorkspacesMock.mockResolvedValue([wsB]);
    await wrapper.get('[data-testid="delete-confirm-list-action"]').trigger("click");
    await flushPromises();
    expect(deleteWorkspaceMock).toHaveBeenCalledWith("ws-1");
    expect(wrapper.findAll("[data-workspace-id]").length).toBe(1);
    expect(wrapper.find('[data-testid="delete-confirm-list"]').exists()).toBe(false);
  });

  it("keeps the dialog open and shows the error when deletion fails", async () => {
    listWorkspacesMock.mockResolvedValue([wsA]);
    const wrapper = mount(WorkspacesView);
    await flushPromises();

    await wrapper.get('[data-testid="workspace-menu-ws-1"]').trigger("click");
    await wrapper.get('[data-testid="menu-delete"]').trigger("click");
    deleteWorkspaceMock.mockRejectedValue(new Error("删除失败"));
    await wrapper.get('[data-testid="delete-confirm-list-action"]').trigger("click");
    await flushPromises();
    expect(wrapper.get('[data-testid="delete-list-error"]').text()).toContain("删除失败");
    // 弹层保持打开，允许重试或取消。
    expect(wrapper.get('[data-testid="delete-confirm-list"]').exists()).toBe(true);
  });

  it("card delete button click does not navigate into the workspace", async () => {
    listWorkspacesMock.mockResolvedValue([wsA]);
    const wrapper = mount(WorkspacesView);
    await flushPromises();
    await wrapper.get('[data-testid="workspace-menu-ws-1"]').trigger("click");
    await wrapper.get('[data-testid="menu-delete"]').trigger("click");
    expect(pushMock).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="delete-confirm-list"]').exists()).toBe(true);
  });

  it("card Enter key navigates into the workspace", async () => {
    listWorkspacesMock.mockResolvedValue([wsA]);
    const wrapper = mount(WorkspacesView);
    await flushPromises();
    await wrapper.get('[data-workspace-id="ws-1"]').trigger("keydown", { key: "Enter" });
    expect(pushMock).toHaveBeenCalledWith("/workspaces/ws-1");
  });
});
