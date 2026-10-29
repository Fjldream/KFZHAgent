import type { RouteRecordRaw } from "vue-router";
import { RedundancyApi } from "./api/redundancy-api";
import { RedundancyHttpClient } from "./api/http-client";
import { KfNodeCatalog, type NodeCatalog } from "./api/node-catalog";
import { RedundancySocket } from "./api/redundancy-socket";
import { createUseRedundancyStore } from "./stores/redundancy";
import type { RedundancyRuntime } from "./runtime";

export interface RedundancyModuleOptions {
  getToken: () => string | null;
  canMaintain?: () => boolean;
  apiBaseUrl?: string;
  wsBaseUrl?: string;
  onUnauthorized?: () => void;
  nodeCatalog?: NodeCatalog;
}

export function createRedundancyModule(options: RedundancyModuleOptions): {
  runtime: RedundancyRuntime;
  routes: RouteRecordRaw[];
} {
  const http = new RedundancyHttpClient({
    baseURL: options.apiBaseUrl ?? "/api/v1",
    getToken: options.getToken,
    onUnauthorized: options.onUnauthorized,
  });
  const api = new RedundancyApi(http);
  const useStore = createUseRedundancyStore(api, {
    create: (onMessage, onStateChange) =>
      new RedundancySocket({
        getToken: options.getToken,
        baseUrl: options.wsBaseUrl,
        onMessage,
        onStateChange,
      }),
  });
  return {
    runtime: {
      api,
      useStore,
      nodeCatalog: options.nodeCatalog ?? new KfNodeCatalog(http),
      canMaintain: options.canMaintain ?? (() => true),
    },
    routes: [
      {
        path: "/redundancy",
        name: "redundancy-management",
        component: () => import("./views/RedundancyManagementView.vue"),
      },
      {
        path: "/redundancy/events",
        name: "redundancy-events",
        component: () => import("./views/RedundancyEventsView.vue"),
      },
    ],
  };
}

export { redundancyRuntimeKey } from "./runtime";
export { default as NotificationCenter } from "./components/NotificationCenter.vue";
export type * from "./types/redundancy";
