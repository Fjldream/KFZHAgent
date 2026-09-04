import { useOpsResourceStore } from '@/stores/opsResourceStore';
import { useMainLeftMenus } from '@/stores/mainLeftMenusStore';
import { opsResourceData, getNodesResServer } from '@/api/allRequest/verifyAPI.js';
import { getDisplayAppListStatus, getPerformance, getCmdStatus, getMultiCmdStatus } from '@/api/allRequest/appAPI.js';
/**
 * 获取运维监视全部资源数据
 *
 * @returns 结果
 */
export const useOpsResourceData = async (isFlag = true) => {
  try {
    const { addNodeInfo } = useMainLeftMenus();
    const { setNodeResourceData, setBalancerResourceData } = useOpsResourceStore();
    //获取数据
    const { code, data } = await opsResourceData();
    if (code === 0) {
      //将获取的到节点名称及id填充到左侧
      addNodeInfo(data);
      //将获取到的代理信息存储
      setBalancerResourceData(data);
      if (isFlag) {
        //将获取到的节点资源存储
        setNodeResourceData(data);
      }
    }
    return true;
  } catch (error) {
    return false;
  }
};
//更新状态
export const useUpdateOpsResourcStatus = () => {
  const { updateAppListStatus } = useOpsResourceStore();
  const opsResourceStore = useOpsResourceStore();
  const polling = ref(true); //是否继续轮询
  const pollingInterval = 1000; //间隔时间 ms
  let timer = null;
  let controller = null;

  const pollHandle = async () => {
    if (!polling.value) {
      return;
    }
    if (controller) {
      controller.abort();
    }
    controller = new AbortController();
    try {
      await useOpsResourceData(false);
      //判断当前是否在节点管理目录
      if (opsResourceStore.currentNodeId) {
        const appIds = opsResourceStore.nodeResourceData
          .find((item) => item.nodeId === opsResourceStore.currentNodeId)
          .apps.map((app) => app.appId);
        if (appIds.length) {
          let appPerformaceArr = [];
          let appStatusArr = [];
          //需要更新的节点数据信息
          const updateAppPerformaceInfo = await getPerformance({ appIds });
          if (updateAppPerformaceInfo.code === 0) {
            appPerformaceArr = updateAppPerformaceInfo.data;
          }
          //需要更新的节点数据信息
          const updateAppStatusInfo = await getDisplayAppListStatus({ appIds });
          if (updateAppStatusInfo.code === 0) {
            appStatusArr = updateAppStatusInfo.data;
          }
          const map = new Map();
          appPerformaceArr.forEach((item) => {
            map.set(item.appId, { ...item });
          });
          appStatusArr.forEach((item) => {
            if (map.has(item.appId)) {
              Object.assign(map.get(item.appId), item);
            } else {
              map.set(item.appId, { ...item });
            }
          });
          updateAppListStatus(Array.from(map.values()));
        }
      }
    } catch (e) {
    } finally {
      start();
    }
  };

  const start = () => {
    timer = setTimeout(pollHandle, pollingInterval);
  };

  const stop = () => {
    polling.value = false;
    clearTimeout(timer);
    controller?.abort();
  };

  onMounted(() => {
    start();
  });

  onUnmounted(() => {
    stop();
  });

  return {
    start,
    stop,
    polling,
  };
};

//更新app命令状态
export const useUpdateAppStatus = () => {
  const polling = ref(true); //是否继续轮询
  const pollingInterval = 1 * 1000; //间隔时间 ms
  const timeout = 90 * 1000; //超时时间
  let timer = null;
  let controller = null;
  let startTime = 0;

  const pollHandle = async (cmdId, resolve) => {
    if (!polling.value) {
      return;
    }
    if (controller) {
      controller.abort();
    }
    controller = new AbortController();
    try {
      const result = await getCmdStatus(cmdId);
      if (result && result.code === 0) {
        polling.value = false;
        clearInterval(timer);
        resolve(true);
        return;
      }
    } catch (e) {}
    if (Date.now() - startTime >= timeout) {
      polling.value = false;
      clearInterval(timer);
      resolve(false);
    }
  };

  const multiAppsPollHandle = async (cmdIds, resolve) => {
    if (!polling.value) {
      return;
    }
    if (controller) {
      controller.abort();
    }
    controller = new AbortController();
    try {
      const result = await getMultiCmdStatus(cmdIds);
      if (result && result.code === 0) {
        polling.value = false;
        clearInterval(timer);
        resolve(true);
        return;
      }
    } catch (e) {}
    if (Date.now() - startTime >= timeout) {
      polling.value = false;
      clearInterval(timer);
      resolve(false);
    }
  };

  const start = (cmdId) => {
    polling.value = true;
    startTime = Date.now();
    return new Promise((resolve) => {
      timer = setInterval(() => {
        pollHandle(cmdId, resolve);
      }, pollingInterval);
    });
  };

  const multiStart = (cmdIds) => {
    polling.value = true;
    startTime = Date.now();
    return new Promise((resolve) => {
      timer = setInterval(() => {
        multiAppsPollHandle(cmdIds, resolve);
      }, pollingInterval);
    });
  };

  const stop = () => {
    polling.value = false;
    clearInterval(timer);
    controller?.abort();
  };

  onUnmounted(() => {
    stop();
  });

  return {
    start,
    multiStart,
    stop,
    polling,
  };
};
//更新节点性能数据
export const useUpdateNodesResStatus = () => {
  const { setCurrentNodesRes } = useOpsResourceStore();
  const opsResourceStore = useOpsResourceStore();
  const polling = ref(true); //是否继续轮询
  const pollingInterval = 10000; //间隔时间 ms
  let timer = null;
  let controller = null;
  const pollHandle = async () => {
    if (!polling.value) {
      return;
    }
    if (controller) {
      controller.abort();
    }
    controller = new AbortController();
    try {
      //判断当前是否在节点管理目录
      if (opsResourceStore.currentNodeId) {
        //获取节点性能数据
        const nodeRes = await getNodesResServer({ nodeId: opsResourceStore.currentNodeId });
        if (nodeRes) {
          setCurrentNodesRes(nodeRes);
        }
      }
    } catch (e) {
    } finally {
      start();
    }
  };
  const start = () => {
    timer = setTimeout(pollHandle, pollingInterval);
  };
  const stop = () => {
    polling.value = false;
    clearTimeout(timer);
    controller?.abort();
  };
  onMounted(() => {
    start();
  });
  onUnmounted(() => {
    stop();
  });
  return {
    start,
    stop,
    polling,
  };
};
