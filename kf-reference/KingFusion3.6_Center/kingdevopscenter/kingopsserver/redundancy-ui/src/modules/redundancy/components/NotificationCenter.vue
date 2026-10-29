<script setup lang="ts">
import { h, onBeforeUnmount, watch } from "vue";
import { Bell } from "@element-plus/icons-vue";
import { ElMessage, ElNotification } from "element-plus";
import { useRedundancyRuntime } from "../runtime";
import { formatDateTime } from "../utils/format";

const emit = defineEmits<{
  navigateEvents: [];
  selectConfiguration: [id: string];
}>();
const runtime = useRedundancyRuntime();
const store = runtime.useStore();
const activeNotifications = new Set<ReturnType<typeof ElNotification>>();

watch(
  () => store.alertSequence,
  () => {
    const event = store.latestAlertEvent;
    if (!event) return;
    let notification: ReturnType<typeof ElNotification> | undefined;
    const viewDetails = () => {
      emit("selectConfiguration", event.redundancyId);
      notification?.close();
    };
    notification = ElNotification({
      title: "节点冗余异常",
      type: "error",
      duration: 0,
      position: "top-right",
      customClass: "redundancy-alert-notification",
      message: h("div", { class: "redundancy-alert-content" }, [
        h("strong", event.redundancyName || "节点冗余配置"),
        h("p", event.summary),
        h("div", { class: "redundancy-alert-meta" }, [
          h(
            "time",
            { datetime: event.openedAt },
            formatDateTime(event.openedAt),
          ),
          h("button", { type: "button", onClick: viewDetails }, "查看详情"),
        ]),
      ]),
      onClose: () => {
        if (notification) activeNotifications.delete(notification);
      },
    });
    activeNotifications.add(notification);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  activeNotifications.forEach((notification) => notification.close());
  activeNotifications.clear();
});

async function acknowledge(redundancyId: string, eventId: string) {
  try {
    await runtime.api.acknowledge(redundancyId, eventId);
    await store.loadOpenEvents();
    ElMessage.success("异常已确认；恢复前仍会保留在当前异常中");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "确认失败");
  }
}
</script>

<template>
  <el-popover
    placement="bottom-end"
    :width="420"
    trigger="click"
    popper-class="redundancy-notification-popover"
  >
    <template #reference>
      <el-badge
        :value="store.abnormalCount"
        :hidden="store.abnormalCount === 0"
        :max="99"
      >
        <el-button
          class="notification-trigger"
          circle
          text
          aria-label="通知中心"
        >
          <el-icon :size="19"><Bell /></el-icon>
        </el-button>
      </el-badge>
    </template>
    <div class="notification-header">
      <strong>当前异常</strong
      ><button type="button" @click="emit('navigateEvents')">
        查看事件记录
      </button>
    </div>
    <div v-if="store.openEvents.length" class="notification-list">
      <article v-for="event in store.openEvents" :key="event.eventId">
        <span class="notification-dot" aria-hidden="true"></span>
        <div>
          <strong>{{ event.redundancyName || "节点冗余配置" }}</strong>
          <p>{{ event.summary }}</p>
          <small>{{ formatDateTime(event.openedAt) }}</small>
        </div>
        <div class="notification-actions">
          <button
            type="button"
            @click="emit('selectConfiguration', event.redundancyId)"
          >
            查看
          </button>
          <button
            v-if="!event.acknowledgedAt"
            type="button"
            @click="acknowledge(event.redundancyId, event.eventId)"
          >
            确认
          </button>
        </div>
      </article>
    </div>
    <el-empty v-else description="暂无消息" :image-size="66" />
    <div v-if="store.socketState !== 'OPEN'" class="notification-connection">
      实时连接已断开，系统正在重连；可手动刷新当前页面。
    </div>
  </el-popover>
</template>

<style scoped>
.notification-trigger {
  width: 34px;
  height: 34px;
}
.notification-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 2px 12px;
  border-bottom: 1px solid var(--kf-border);
}
button {
  border: 0;
  background: transparent;
  color: var(--kf-primary);
  cursor: pointer;
  font: inherit;
}
button:focus-visible {
  outline: 2px solid #8ab0ff;
  outline-offset: 2px;
}
.notification-list {
  max-height: 390px;
  overflow: auto;
  scrollbar-gutter: stable;
}
article {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto;
  gap: 9px;
  padding: 13px 2px;
  border-bottom: 1px solid #edf0f5;
}
.notification-dot {
  width: 7px;
  height: 7px;
  margin-top: 7px;
  border-radius: 50%;
  background: var(--kf-danger);
}
article p {
  margin: 4px 0;
  line-height: 1.45;
}
article small {
  color: var(--kf-text-secondary);
}
.notification-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.notification-connection {
  margin-top: 10px;
  padding: 9px 10px;
  border-radius: 5px;
  background: #fff7e8;
  color: #9a5d00;
  font-size: 12px;
}
:global(.redundancy-alert-notification) {
  width: 380px;
  border-left: 3px solid var(--kf-danger);
  border-radius: var(--kf-radius-panel);
  box-shadow: 0 10px 30px rgb(31 41 55 / 14%);
}
:global(.redundancy-alert-notification .el-notification__title) {
  color: var(--kf-text);
  font-weight: 600;
}
:global(.redundancy-alert-content > strong) {
  display: block;
  color: var(--kf-text);
  font-weight: 600;
}
:global(.redundancy-alert-content > p) {
  margin: 6px 0 10px;
  color: var(--kf-text-secondary);
  line-height: 1.5;
}
:global(.redundancy-alert-meta) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
:global(.redundancy-alert-meta time) {
  color: var(--kf-text-secondary);
  font-size: 12px;
}
:global(.redundancy-alert-meta button) {
  border: 0;
  background: transparent;
  color: var(--kf-primary);
  cursor: pointer;
  font: inherit;
  font-weight: 500;
}
:global(.redundancy-alert-meta button:focus-visible) {
  border-radius: var(--kf-radius-control);
  outline: 2px solid #8ab0ff;
  outline-offset: 2px;
}
</style>
