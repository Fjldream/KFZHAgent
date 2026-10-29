import { nextTick } from "vue";
import { render } from "@testing-library/vue";
import ElementPlus from "element-plus";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RedundancyApi } from "../src/modules/redundancy/api/redundancy-api";
import NotificationCenter from "../src/modules/redundancy/components/NotificationCenter.vue";
import { redundancyRuntimeKey } from "../src/modules/redundancy/runtime";
import { createUseRedundancyStore } from "../src/modules/redundancy/stores/redundancy";
import type { RedundancyEvent } from "../src/modules/redundancy/types/redundancy";

const notify = vi.hoisted(() => vi.fn(() => ({ close: vi.fn() })));

vi.mock("element-plus", async (importOriginal) => ({
  ...(await importOriginal<typeof import("element-plus")>()),
  ElNotification: notify,
}));

describe("NotificationCenter", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    notify.mockClear();
  });

  it("收到新的 OPEN 异常后显示持久的右上角通知", async () => {
    const api = {
      listEvents: vi.fn().mockResolvedValue([]),
    } as unknown as RedundancyApi;
    const useStore = createUseRedundancyStore(api);
    const store = useStore();
    render(NotificationCenter, {
      global: {
        plugins: [ElementPlus],
        provide: {
          [redundancyRuntimeKey as symbol]: {
            api,
            useStore,
            nodeCatalog: {},
            canMaintain: () => true,
          },
        },
      },
    });
    const event = {
      eventId: "event-new",
      tenantId: "tenant-1",
      redundancyId: "rd-1",
      redundancyName: "生产线冗余",
      status: "OPEN",
      reasonCode: "REDUNDANCY_NODE_OFFLINE",
      summary: "主节点已离线",
      openedAt: "2026-09-02T08:00:00.000Z",
    } as RedundancyEvent;

    store.handleSocketMessage({
      type: "REDUNDANCY_EVENT_CHANGED",
      sentAt: event.openedAt,
      payload: event,
    });
    await nextTick();

    expect(notify).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "节点冗余异常",
        type: "error",
        duration: 0,
        position: "top-right",
      }),
    );
  });
});
