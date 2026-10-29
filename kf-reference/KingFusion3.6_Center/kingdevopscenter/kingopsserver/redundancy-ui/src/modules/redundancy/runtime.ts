import { inject, type InjectionKey } from "vue";
import type { RedundancyApi } from "./api/redundancy-api";
import type { NodeCatalog } from "./api/node-catalog";
import type { createUseRedundancyStore } from "./stores/redundancy";

export interface RedundancyRuntime {
  api: RedundancyApi;
  nodeCatalog: NodeCatalog;
  useStore: ReturnType<typeof createUseRedundancyStore>;
  canMaintain: () => boolean;
}

export const redundancyRuntimeKey: InjectionKey<RedundancyRuntime> = Symbol(
  "kf-redundancy-runtime",
);

export function useRedundancyRuntime(): RedundancyRuntime {
  const runtime = inject(redundancyRuntimeKey);
  if (!runtime) throw new Error("节点冗余模块尚未安装运行时适配器");
  return runtime;
}
