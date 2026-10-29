// modified by jinlong.feng at 0901 冗余功能开发
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { redundancyAPI } from "@/api/redundancyAPI.js";
import { RedundancySocket } from "@/api/redundancySocket.js";
import {
  createTrackedOperationTask,
  isOperationTaskTerminal,
  mergeOperationAppStep,
  mergeOperationTask,
} from "@/utils/operationTaskProgress.js";
import { resolveRedundancySelectionId } from "@/utils/redundancyUtils.js";
import { useOpsResourceStore } from "@/stores/opsResourceStore.js";
import { useUserStore } from "@/stores/userStore.js";

/** 节点冗余领域状态。节点与 APP 实时状态仍由 opsResourceStore 统一持有。 */
export const useRedundancyStore = defineStore("redundancy", () => {
  const configurations = ref([]);
  const selectedId = ref("");
  const detail = ref(null);
  const openEvents = ref([]);
  const latestAlertEvent = ref(null);
  const alertSequence = ref(0);
  const activeTask = ref(null);
  const loading = ref(false);
  const refreshing = ref(false);
  const mutationPending = ref(false);
  const socketState = ref("CLOSED");
  const errorMessage = ref("");
  let socket = null;
  const seenEventIds = new Set();

  const selected = computed(
    () =>
      configurations.value.find(
        (item) => item.redundancyId === selectedId.value,
      ) || null,
  );
  const abnormalCount = computed(() => openEvents.value.length);

  /** 将后端详情携带的状态写入公共资源 Store，并保存冗余领域详情。 */
  function acceptDetail(value) {
    detail.value = value;
    if (value?.currentTask) {
      activeTask.value = activeTask.value
        ? mergeOperationTask(activeTask.value, value.currentTask)
        : { ...value.currentTask, appSteps: value.currentTask.appSteps || [] };
    }
    const resourceStore = useOpsResourceStore();
    for (const side of ["primary", "standby"]) {
      const node = value?.nodes?.[side];
      if (node?.nodeId && Array.isArray(node.apps)) {
        resourceStore.updateNodeAppListStatus(node.nodeId, node.apps);
      }
    }
  }

  /** 在操作接口返回前创建任务占位，使界面可以立即展示真实阶段。 */
  function startTaskTracking(params) {
    activeTask.value = createTrackedOperationTask(params);
    return activeTask.value;
  }

  /** 合并 WebSocket 或 HTTP 返回的任务主记录。 */
  function applyTaskUpdate(taskUpdate) {
    activeTask.value = mergeOperationTask(activeTask.value, taskUpdate);
    return activeTask.value;
  }

  /** 合并 WebSocket 返回的单个 APP 执行步骤。 */
  function applyTaskAppUpdate(stepUpdate) {
    activeTask.value = mergeOperationAppStep(activeTask.value, stepUpdate);
    return activeTask.value;
  }

  /**
   * 通过任务详情接口校准最终数据，作为 WebSocket 丢包或晚到时的回退路径。
   */
  async function loadTaskDetail(redundancyId, taskId) {
    if (!redundancyId || !taskId) return activeTask.value;
    const taskDetail = await redundancyAPI.task(redundancyId, taskId);
    activeTask.value = mergeOperationTask(activeTask.value, taskDetail);
    return activeTask.value;
  }

  /** 清除已经展示完毕或由用户关闭的任务。 */
  function clearActiveTask() {
    activeTask.value = null;
  }

  /** 加载冗余配置列表并保持当前选择。 */
  async function loadList({
    background = false,
    preserveSelection = true,
    requestedSelectionId = "",
  } = {}) {
    const state = background ? refreshing : loading;
    state.value = true;
    errorMessage.value = "";
    try {
      configurations.value = (await redundancyAPI.list()) || [];
      selectedId.value = resolveRedundancySelectionId(
        configurations.value,
        requestedSelectionId,
        preserveSelection ? selectedId.value : "",
      );
      if (selectedId.value) await loadDetail(selectedId.value);
      else detail.value = null;
    } catch (error) {
      errorMessage.value = error?.message || String(error);
      throw error;
    } finally {
      state.value = false;
    }
  }

  /** 加载指定冗余配置详情。 */
  async function loadDetail(id) {
    selectedId.value = id;
    const value = await redundancyAPI.detail(id);
    acceptDetail(value);
    return value;
  }

  /** 加载当前未恢复异常。 */
  async function loadOpenEvents() {
    openEvents.value = (await redundancyAPI.events({ status: "OPEN" })) || [];
    openEvents.value.forEach((event) => seenEventIds.add(event.eventId));
  }

  /** 执行变更，并在完成后统一刷新配置与异常状态。 */
  async function runMutation(operation) {
    mutationPending.value = true;
    errorMessage.value = "";
    try {
      const result = await operation();
      await Promise.all([loadList({ background: true }), loadOpenEvents()]);
      return result;
    } catch (error) {
      errorMessage.value = error?.message || String(error);
      throw error;
    } finally {
      mutationPending.value = false;
    }
  }

  /** 处理实时快照、异常、状态与任务消息。 */
  function handleSocketMessage(message) {
    if (message?.type === "REDUNDANCY_SNAPSHOT") {
      configurations.value = message.payload?.redundancies || [];
      openEvents.value = message.payload?.openEvents || [];
      openEvents.value.forEach((event) => seenEventIds.add(event.eventId));
      if (!selectedId.value)
        selectedId.value = configurations.value[0]?.redundancyId || "";
      if (selectedId.value) void loadDetail(selectedId.value);
      return;
    }
    if (message?.type === "REDUNDANCY_EVENT_CHANGED") {
      const event = message.payload;
      if (event?.status === "OPEN" && !seenEventIds.has(event.eventId)) {
        seenEventIds.add(event.eventId);
        latestAlertEvent.value = event;
        alertSequence.value += 1;
      }
      void loadOpenEvents();
      return;
    }
    if (message?.type === "REDUNDANCY_TASK_CHANGED") {
      const updatedTask = applyTaskUpdate(message.payload);
      if (isOperationTaskTerminal(updatedTask)) {
        void Promise.all([loadList({ background: true }), loadOpenEvents()]);
      }
      return;
    }
    if (message?.type === "REDUNDANCY_TASK_APP_CHANGED") {
      applyTaskAppUpdate(message.payload);
      return;
    }
    if (message?.type === "REDUNDANCY_STATUS_CHANGED") {
      void loadList({ background: true });
    }
  }

  /** 初始化全局冗余实时连接，重复调用不会创建第二条连接。 */
  function connectSocket() {
    if (socket) return;
    const userStore = useUserStore();
    socket = new RedundancySocket({
      getToken: () => userStore.loginInfo.access_token,
      onMessage: handleSocketMessage,
      onStateChange: (state) => {
        socketState.value = state;
      },
    });
    socket.connect();
  }

  /** 关闭全局实时连接。 */
  function disconnectSocket() {
    socket?.close();
    socket = null;
  }

  return {
    configurations,
    selectedId,
    selected,
    detail,
    openEvents,
    latestAlertEvent,
    alertSequence,
    activeTask,
    loading,
    refreshing,
    mutationPending,
    socketState,
    errorMessage,
    abnormalCount,
    loadList,
    loadDetail,
    loadOpenEvents,
    startTaskTracking,
    applyTaskUpdate,
    applyTaskAppUpdate,
    loadTaskDetail,
    clearActiveTask,
    runMutation,
    connectSocket,
    disconnectSocket,
  };
});
// end
