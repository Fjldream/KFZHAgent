import { defineStore } from 'pinia';
import { useLangStore } from '@/stores/langStore.js';

export const useMainLeftMenus = defineStore(
  'mainLeftMenus',
  () => {
    const { i18nReactive } = useLangStore();
    const mainLeftMenus = ref([
      {
        id: 'runningNodesManager',
        name: i18nReactive('title.runningNodesManager'),
        icon: 'runningNodesManager',
        children: [],
      },
      {
        id: 'loadBalancer',
        name: i18nReactive('title.loadBalancer'),
        icon: 'loadBalancer',
        path: 'loadBalancer',
        children: [],
      },
      {
        id: 'maintenanceLog',
        name: i18nReactive('title.maintenanceLog'),
        icon: 'maintenanceLog',
        path: 'opsserverLog',
      },
    ]);
    const leftRowSelect = ref({});

    function setLeftRowSelect(row) {
      leftRowSelect.value = row;
    }
    function addNodeInfo(nodeInfo) {
      const { nodeResource } = nodeInfo;
      if (nodeResource) {
        mainLeftMenus.value[0].children = nodeResource.map((item) => ({
          path: 'runningNodesManager',
          name: item.nodeName,
          id: item.nodeId,
          nodeStatus: item.nodeStatus,
        }));
        mainLeftMenus.value[2].children = nodeResource.map((item) => ({
          path: 'maintenanceLog',
          name: item.nodeName,
          id: item.nodeId + '_log',
          address: item.address,
          port: item.port,
          nodeStatus: item.nodeStatus,
        }));
        mainLeftMenus.value[2].children.unshift({
          id: 'opsserverLog',
          name: i18nReactive('maintance'),
          path: 'opsserverLog',
        });
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
      key: 'leftRowSelect',
      pick: ['leftRowSelect'],
    },
  },
);
