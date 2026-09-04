import { defineStore } from 'pinia';
import { ref } from 'vue';
export const useOpsResourceStore = defineStore(
  'opsResource',
  () => {
    //全部节点信息(包含节点内的app)
    const nodeResourceData = ref([]);
    //当前节点的性能数据
    const currentNodesRes = ref({});
    //全部代理信息
    const balancerResourceData = ref([]);
    //当前节点的id
    const currentNodeId = ref('');
    //添加全部节点信息
    function setNodeResourceData(data) {
      //nodeResource(节点)<=nodeId=>nodeProApp(节点存储的appId)<=appId=>appResource(app信息)
      const { appResource, nodeProApp, nodeResource } = data;
      //建立一个appId-->appInfo的map
      const appMap = {};
      appResource.forEach((app) => {
        appMap[app.appId] = app;
      });
      //建立一个nodeId-->appId[]的map
      const nodeAppMap = {};
      nodeProApp.forEach((item) => {
        nodeAppMap[item.nodeId] = item.appPros.map((app) => app.appId);
      });
      //遍历nodeResource,组装每个node的apps
      nodeResourceData.value = nodeResource.map((node) => {
        const { nodeId } = node;
        const appIds = nodeAppMap[nodeId] || [];
        const apps = appIds.map((id) => appMap[id]).filter(Boolean);
        return { ...node, apps };
      });
    }
    //添加全部代理信息
    function setBalancerResourceData(data) {
      const { balancerResource, nodeResource } = data;
      balancerResourceData.value = balancerResource.map((item) => ({
        ...item,
        runningNode: nodeResource.find((node) => node.nodeId === item.nodeId)?.nodeName ?? '',
      }));
      for (const ele of nodeResourceData.value) {
        for (const element of nodeResource) {
          if (ele.nodeId === element.nodeId) {
            ele.nodeStatus = element.nodeStatus;
            break;
          }
        }
      }
    }
    //更新节点状态
    function updateNodeListStatus(data) {
      for (let index = 0; index < data.length; index++) {
        const nodeInfo = data[index];
        const oldNodeInfo = nodeResourceData.value.find((item) => item.nodeId === nodeInfo.nodeId);
        if (oldNodeInfo) {
          Object.assign(oldNodeInfo, nodeInfo);
        }
      }
    }
    //更新app状态
    function updateAppListStatus(data) {
      const oldNodeInfo = nodeResourceData.value.find((item) => item.nodeId === currentNodeId.value);
      if (oldNodeInfo) {
        for (let index = 0; index < data.length; index++) {
          const newNodeInfo = data[index];
          const perf = newNodeInfo.perfData || {};
          //找出对应app(通过appId)
          const appIndex = oldNodeInfo.apps.findIndex((item) => item.appId === newNodeInfo.appId);
          if (appIndex !== -1) {
            oldNodeInfo.apps.splice(appIndex, 1, {
              ...oldNodeInfo.apps[appIndex],
              aliveTime: perf.aliveTime,
              cpuUseRate: perf.cpuUseRate,
              memUseRate: perf.memUseRate,
              requestsLastMinute: perf.requestsLastMinute,
              startTime: perf.startTime,
              appStatus: newNodeInfo.appStatus,
              authState: newNodeInfo.authState,
              appDeployStatus: newNodeInfo.appDeployStatus,
            });
          }
        }
      }
    }
    //设置当前节点信息
    function setCurrentNodeId(nodeId) {
      currentNodeId.value = nodeId;
    }
    //设置当前节点性能信息
    function setCurrentNodesRes(data) {
      if (!data) {
        currentNodesRes.value = {};
      } else {
        //初始化塞两个数据形成线段
        if (!Object.hasOwn(currentNodesRes.value, 'netSendArr')) {
          currentNodesRes.value.netSendArr = [];
          currentNodesRes.value.netSendArr.push(data.netio_speed_send);
        }
        if (!Object.hasOwn(currentNodesRes.value, 'netReceiveArr')) {
          currentNodesRes.value.netReceiveArr = [];
          currentNodesRes.value.netReceiveArr.push(data.netio_speed_receive);
        }
        if (currentNodesRes.value.netSendArr.length === 7) {
          currentNodesRes.value.netSendArr.shift();
        }
        currentNodesRes.value.netSendArr.push(data.netio_speed_send);
        if (currentNodesRes.value.netReceiveArr.length === 7) {
          currentNodesRes.value.netReceiveArr.shift();
        }
        currentNodesRes.value.netReceiveArr.push(data.netio_speed_receive);
        currentNodesRes.value = { ...currentNodesRes.value, ...data };
      }
    }
    return {
      nodeResourceData,
      balancerResourceData,
      currentNodeId,
      currentNodesRes,
      setNodeResourceData,
      setBalancerResourceData,
      updateNodeListStatus,
      updateAppListStatus,
      setCurrentNodeId,
      setCurrentNodesRes,
    };
  },
  {
    persist: {
      enabled: true,
      storage: sessionStorage, // 使用 sessionStorage
      key: 'opsResource',
      pick: ['opsResource'],
    },
  },
);
