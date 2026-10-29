import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { RedundancyApi } from "../api/redundancy-api";
import { RedundancyApiError } from "../api/http-client";
import type { RedundancySocket, SocketState } from "../api/redundancy-socket";
import type {
  OperationTask,
  RedundancyConfigDetail,
  RedundancyConfigSummary,
  RedundancyEvent,
  WsMessage,
} from "../types/redundancy";

export interface RedundancySocketFactory {
  create(
    onMessage: (message: WsMessage) => void,
    onStateChange: (state: SocketState) => void,
  ): RedundancySocket;
}

export function createUseRedundancyStore(
  api: RedundancyApi,
  socketFactory?: RedundancySocketFactory,
) {
  return defineStore("kf-redundancy", () => {
    const configurations = ref<RedundancyConfigSummary[]>([]);
    const selectedId = ref<string | null>(null);
    const detail = ref<RedundancyConfigDetail | null>(null);
    const openEvents = ref<RedundancyEvent[]>([]);
    const latestAlertEvent = ref<RedundancyEvent | null>(null);
    const alertSequence = ref(0);
    const activeTask = ref<OperationTask | null>(null);
    const loading = ref(false);
    const refreshing = ref(false);
    const mutationPending = ref(false);
    const socketState = ref<SocketState>("CLOSED");
    const errorMessage = ref("");
    const accessDenied = ref(false);
    let socket: RedundancySocket | null = null;
    const seenAlertEventIds = new Set<string>();

    const selected = computed(
      () =>
        configurations.value.find(
          (item) => item.redundancyId === selectedId.value,
        ) ?? null,
    );
    const abnormalCount = computed(() => openEvents.value.length);

    async function loadList(
      options: { background?: boolean; preserveSelection?: boolean } = {},
    ) {
      const target = options.background ? refreshing : loading;
      target.value = true;
      errorMessage.value = "";
      accessDenied.value = false;
      try {
        configurations.value = await api.list();
        const currentStillExists = configurations.value.some(
          (item) => item.redundancyId === selectedId.value,
        );
        if (!options.preserveSelection || !currentStillExists) {
          selectedId.value = configurations.value[0]?.redundancyId ?? null;
        }
        if (selectedId.value) await loadDetail(selectedId.value);
      } catch (error) {
        accessDenied.value =
          error instanceof RedundancyApiError && error.status === 403;
        errorMessage.value = toMessage(error);
      } finally {
        target.value = false;
      }
    }

    async function loadDetail(id: string) {
      selectedId.value = id;
      try {
        detail.value = await api.detail(id);
        activeTask.value = detail.value.currentTask ?? null;
      } catch (error) {
        errorMessage.value = toMessage(error);
        throw error;
      }
    }

    async function loadOpenEvents() {
      try {
        openEvents.value = await api.listEvents({ status: "OPEN" });
      } catch (error) {
        errorMessage.value = toMessage(error);
      }
    }

    async function runMutation<T>(operation: () => Promise<T>): Promise<T> {
      mutationPending.value = true;
      errorMessage.value = "";
      try {
        const result = await operation();
        await Promise.all([
          loadList({ background: true, preserveSelection: true }),
          loadOpenEvents(),
        ]);
        return result;
      } catch (error) {
        errorMessage.value = toMessage(error);
        throw error;
      } finally {
        mutationPending.value = false;
      }
    }

    function handleSocketMessage(message: WsMessage) {
      if (message.type === "REDUNDANCY_SNAPSHOT") {
        const payload = message.payload as {
          redundancies: RedundancyConfigSummary[];
          openEvents: RedundancyEvent[];
        };
        configurations.value = payload.redundancies;
        openEvents.value = payload.openEvents;
        payload.openEvents.forEach((event) =>
          seenAlertEventIds.add(event.eventId),
        );
        if (!selectedId.value && configurations.value.length > 0) {
          selectedId.value = configurations.value[0].redundancyId;
        }
        return;
      }
      if (message.type === "REDUNDANCY_EVENT_CHANGED") {
        const event = message.payload as RedundancyEvent;
        if (event.status === "OPEN" && !seenAlertEventIds.has(event.eventId)) {
          seenAlertEventIds.add(event.eventId);
          latestAlertEvent.value = event;
          alertSequence.value += 1;
        }
        void loadOpenEvents();
      }
      if (
        [
          "REDUNDANCY_STATUS_CHANGED",
          "REDUNDANCY_TASK_CHANGED",
          "REDUNDANCY_TASK_APP_CHANGED",
        ].includes(message.type)
      ) {
        void loadList({ background: true, preserveSelection: true });
      }
    }

    function connectSocket() {
      if (!socketFactory || socket) return;
      socket = socketFactory.create(handleSocketMessage, (state) => {
        socketState.value = state;
      });
      socket.connect();
    }

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
      accessDenied,
      abnormalCount,
      loadList,
      loadDetail,
      loadOpenEvents,
      runMutation,
      handleSocketMessage,
      connectSocket,
      disconnectSocket,
    };
  });
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}
