import { defineStore } from "pinia";
import { useLangStore } from "@/stores/langStore.js";
// modified by jinlong.feng at 2026-10-10 冗余功能构建期开关
import { REDUNDANCY_ENABLED } from "@/config/features.js";
// end modified by jinlong.feng at 2026-10-10 冗余功能构建期开关

export const useMainLeftMenus = defineStore(
  "mainLeftMenus",
  () => {
    const { i18nReactive } = useLangStore();
    const mainLeftMenus = ref([
      {
        id: "runningNodesManager",
        name: i18nReactive("title.runningNodesManager"),
        icon: "runningNodesManager",
        children: [],
      },
      {
        id: "loadBalancer",
        name: i18nReactive("title.loadBalancer"),
        icon: "loadBalancer",
        path: "loadBalancer",
        children: [],
      },
      // modified by jinlong.feng at 0901 冗余功能开发
      {
        id: "redundancy",
        name: i18nReactive("title.redundancy"),
        icon: "redundancy",
        path: "redundancy",
      },
      // end
      {
        id: "maintenanceLog",
        name: i18nReactive("title.maintenanceLog"),
        icon: "maintenanceLog",
        path: "opsserverLog",
      },
    ]);
    // modified by jinlong.feng at 2026-10-10 冗余功能构建期开关
    // 屏蔽版构建时把冗余菜单项从左侧菜单里移除。
    // 注意：本数组在下方 addNodeInfo 里曾按下标取值，已一并改为按 id 查找，
    // 否则移除冗余项后下标会前移导致取到 undefined。
    mainLeftMenus.value = mainLeftMenus.value.filter(
      (menu) => REDUNDANCY_ENABLED || menu.id !== "redundancy",
    );
    // end modified by jinlong.feng at 2026-10-10 冗余功能构建期开关
    const leftRowSelect = ref({});

    function setLeftRowSelect(row) {
      leftRowSelect.value = row;
    }
    function addNodeInfo(nodeInfo) {
      const { nodeResource } = nodeInfo;
      if (nodeResource) {
        mainLeftMenus.value[0].children = nodeResource.map((item) => ({
          path: "runningNodesManager",
          name: item.nodeName,
          id: item.nodeId,
          nodeStatus: item.nodeStatus,
        }));
        // modified by jinlong.feng at 0901 冗余功能开发
        // modified by jinlong.feng at 2026-10-10 冗余功能构建期开关
        // 冗余菜单项可能被构建期开关移除，下标会前移，这里改为按 id 查找，
        // 不再依赖写死的第 4 个菜单项。
        const maintenanceLogMenu = mainLeftMenus.value.find(
          (menu) => menu.id === "maintenanceLog",
        );
        maintenanceLogMenu.children = nodeResource.map((item) => ({
          path: "maintenanceLog",
          name: item.nodeName,
          id: item.nodeId + "_log",
          address: item.address,
          port: item.port,
          nodeStatus: item.nodeStatus,
        }));
        maintenanceLogMenu.children.unshift({
          id: "opsserverLog",
          name: i18nReactive("maintance"),
          path: "opsserverLog",
        });
        // end modified by jinlong.feng at 2026-10-10 冗余功能构建期开关
        // end
      }
    }
    const resetMenus = () => {
      leftRowSelect.value = {};
    };
    return {
      mainLeftMenus,
      leftRowSelect,
      setLeftRowSelect,
      addNodeInfo,
      resetMenus,
    };
  },
  {
    persist: {
      enabled: true,
      storage: sessionStorage, // 使用 sessionStorage
      key: "leftRowSelect",
      pick: ["leftRowSelect"],
    },
  },
);
