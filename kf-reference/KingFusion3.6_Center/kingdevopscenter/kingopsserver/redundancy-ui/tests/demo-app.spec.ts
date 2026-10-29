// modified by jinlong.feng at 0901 冗余功能开发
import { render, screen } from "@testing-library/vue";
import ElementPlus from "element-plus";
import { createPinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it, vi } from "vitest";
import App from "../src/demo/App.vue";
import { createMockRuntime } from "../src/demo/mock-runtime";
import { redundancyRuntimeKey } from "../src/modules/redundancy/runtime";

describe("Mock 演示入口", () => {
  it("Mock 模式无需登录即可进入页面，并显示演示账号", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/", component: { template: "<div>冗余页面</div>" } },
        {
          path: "/redundancy",
          component: { template: "<div>冗余管理</div>" },
        },
        {
          path: "/redundancy/events",
          component: { template: "<div>冗余事件</div>" },
        },
      ],
    });
    await router.push("/");
    await router.isReady();

    render(App, {
      props: { mockMode: true },
      global: {
        plugins: [createPinia(), router, ElementPlus],
        provide: {
          [redundancyRuntimeKey as symbol]: createMockRuntime(),
        },
      },
    });

    expect(screen.getByText("冗余页面")).toBeTruthy();
    expect(screen.getByText("admin001⌄")).toBeTruthy();
    expect(screen.queryByText("请登录运维中心后查看真实冗余配置")).toBeNull();
  });

  it("登录后由顶层应用维持全局 WebSocket 生命周期", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/", component: { template: "<div>首页</div>" } },
        {
          path: "/redundancy",
          component: { template: "<div>冗余管理</div>" },
        },
        {
          path: "/redundancy/events",
          component: { template: "<div>冗余事件</div>" },
        },
      ],
    });
    await router.push("/");
    await router.isReady();
    const connectSocket = vi.fn();
    const disconnectSocket = vi.fn();
    const store = {
      abnormalCount: 0,
      openEvents: [],
      socketState: "CLOSED",
      connectSocket,
      disconnectSocket,
      loadDetail: vi.fn(),
      loadOpenEvents: vi.fn(),
    };

    const view = render(App, {
      props: { mockMode: true },
      global: {
        plugins: [createPinia(), router, ElementPlus],
        provide: {
          [redundancyRuntimeKey as symbol]: {
            ...createMockRuntime(),
            useStore: () => store,
          },
        },
        stubs: { NotificationCenter: true },
      },
    });

    expect(connectSocket).toHaveBeenCalledOnce();

    view.unmount();
    expect(disconnectSocket).toHaveBeenCalledOnce();
  });
});
// end
