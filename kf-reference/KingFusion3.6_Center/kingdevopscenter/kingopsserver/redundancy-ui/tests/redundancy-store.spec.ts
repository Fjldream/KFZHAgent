import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { createUseRedundancyStore } from "../src/modules/redundancy/stores/redundancy";
import { RedundancyApiError } from "../src/modules/redundancy/api/http-client";
import type { RedundancyApi } from "../src/modules/redundancy/api/redundancy-api";
import type {
  RedundancyConfigDetail,
  RedundancyConfigSummary,
  RedundancyEvent,
} from "../src/modules/redundancy/types/redundancy";

const summary = {
  redundancyId: "rd-1",
  name: "冗余配置1",
  lifecycle: "ENABLED",
  healthStatus: "NORMAL",
  allowedActions: ["SWITCH"],
} as RedundancyConfigSummary;

describe("redundancy store", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("loads list and automatically selects the first configuration", async () => {
    const api = {
      list: vi.fn().mockResolvedValue([summary]),
      detail: vi.fn().mockResolvedValue({
        ...summary,
        nodes: {},
        openEvents: [],
        recentTasks: [],
      }),
    } as unknown as RedundancyApi;
    const useStore = createUseRedundancyStore(api);
    const store = useStore();

    await store.loadList();

    expect(store.selectedId).toBe("rd-1");
    expect(api.detail).toHaveBeenCalledWith("rd-1");
  });

  it("keeps only current OPEN events from the websocket snapshot", () => {
    const useStore = createUseRedundancyStore({} as RedundancyApi);
    const store = useStore();

    store.handleSocketMessage({
      type: "REDUNDANCY_SNAPSHOT",
      sentAt: new Date().toISOString(),
      payload: {
        redundancies: [summary],
        openEvents: [{ eventId: "event-1", status: "OPEN" }],
      },
    });

    expect(store.abnormalCount).toBe(1);
    expect(store.configurations).toHaveLength(1);
    expect(store.latestAlertEvent).toBeNull();
  });

  it("only exposes a newly opened incremental event once for popup notification", () => {
    const useStore = createUseRedundancyStore({
      listEvents: vi.fn().mockResolvedValue([]),
    } as unknown as RedundancyApi);
    const store = useStore();
    const event = {
      eventId: "event-new",
      tenantId: "tenant-1",
      redundancyId: "rd-1",
      redundancyName: "冗余配置1",
      status: "OPEN",
      reasonCode: "REDUNDANCY_NODE_OFFLINE",
      summary: "主节点已离线",
      openedAt: "2026-09-02T08:00:00.000Z",
    } as RedundancyEvent;

    store.handleSocketMessage({
      type: "REDUNDANCY_EVENT_CHANGED",
      sentAt: new Date().toISOString(),
      payload: event,
    });

    expect(store.latestAlertEvent).toEqual(event);
    expect(store.alertSequence).toBe(1);

    store.handleSocketMessage({
      type: "REDUNDANCY_EVENT_CHANGED",
      sentAt: new Date().toISOString(),
      payload: event,
    });

    expect(store.alertSequence).toBe(1);
  });

  it("refreshes canonical detail after a successful mutation", async () => {
    const api = {
      list: vi.fn().mockResolvedValue([summary]),
      detail: vi.fn().mockResolvedValue({
        ...summary,
        nodes: {},
        openEvents: [],
        recentTasks: [],
      } as unknown as RedundancyConfigDetail),
      listEvents: vi.fn().mockResolvedValue([]),
    } as unknown as RedundancyApi;
    const useStore = createUseRedundancyStore(api);
    const store = useStore();
    store.selectedId = "rd-1";

    await store.runMutation(() => Promise.resolve("done"));

    expect(api.list).toHaveBeenCalledOnce();
    expect(api.detail).toHaveBeenCalledWith("rd-1");
    expect(store.mutationPending).toBe(false);
  });

  it("exposes a dedicated access-denied state for a 403 list response", async () => {
    const api = {
      list: vi
        .fn()
        .mockRejectedValue(
          new RedundancyApiError(
            "REDUNDANCY_PERMISSION_DENIED",
            "无冗余查看权限",
            403,
          ),
        ),
    } as unknown as RedundancyApi;
    const useStore = createUseRedundancyStore(api);
    const store = useStore();

    await store.loadList();

    expect(store.accessDenied).toBe(true);
    expect(store.errorMessage).toBe("无冗余查看权限");
  });
});
