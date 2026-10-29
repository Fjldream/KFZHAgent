<script setup>
// modified by jinlong.feng at 0901 冗余功能开发
import { h, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { useRedundancyStore } from "@/stores/redundancyStore.js";
import {
  createRedundancyManagementLocation,
  formatDateTime,
} from "@/utils/redundancyUtils.js";

const { t, locale } = useI18n();
const router = useRouter();
const store = useRedundancyStore();
const popoverVisible = ref(false);

/** 获取事件所属的冗余配置名称。 */
function getEventName(event) {
  return event.redundancyName || t("redundancy.unnamedConfiguration");
}

/** 将事件发生时间格式化为通知列表使用的时分秒。 */
function formatNoticeTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleTimeString(locale.value, { hour12: false });
}

/** 打开指定异常所属的冗余配置，并同步管理页选中项。 */
async function openEvent(event) {
  popoverVisible.value = false;
  await router.push(createRedundancyManagementLocation(event.redundancyId));
  if (event.redundancyId && store.selectedId !== event.redundancyId) {
    try {
      await store.loadDetail(event.redundancyId);
    } catch {
      /* 全局请求层已提示 */
    }
  }
}

/** 打开全部冗余异常事件。 */
function openAllEvents() {
  popoverVisible.value = false;
  router.push({ name: "redundancyEvents" });
}

/** 创建紧凑的冗余异常通知内容。 */
function createAlertMessage(event) {
  return h("div", { class: "redundancy-alert__content" }, [
    h("div", { class: "redundancy-alert__heading" }, [
      h(
        "strong",
        { class: "redundancy-alert__title" },
        t("redundancy.exceptionNotification"),
      ),
      h(
        "span",
        { class: "redundancy-alert__status" },
        t("redundancy.currentAbnormal"),
      ),
    ]),
    h(
      "strong",
      { class: "redundancy-alert__name" },
      getEventName(event),
    ),
    h(
      "p",
      { class: "redundancy-alert__summary" },
      event.summary || "—",
    ),
    h("div", { class: "redundancy-alert__footer" }, [
      h(
        "time",
        {
          class: "redundancy-alert__time",
          datetime: event.openedAt || undefined,
        },
        formatDateTime(event.openedAt, locale.value),
      ),
      h("span", { class: "redundancy-alert__action" }, [
        t("redundancy.viewDetail"),
        h("span", { "aria-hidden": "true" }, "→"),
      ]),
    ]),
  ]);
}

watch(
  () => store.alertSequence,
  () => {
    const event = store.latestAlertEvent;
    if (!event) return;
    ElNotification({
      message: createAlertMessage(event),
      type: "warning",
      // modified by jinlong.feng at 2026-10-09 冗余事件列与通知时长调整 通知弹窗 120000ms -> 20000ms
      duration: 20000,
      // end
      customClass: "redundancy-alert-notification",
      onClick: () => openEvent(event),
    });
  },
);

onMounted(async () => {
  store.connectSocket();
  try {
    await store.loadOpenEvents();
  } catch {
    /* 页面请求层统一提示 */
  }
});

onBeforeUnmount(() => {
  store.disconnectSocket();
});
// end
</script>

<!-- modified by jinlong.feng at 0901 冗余功能开发 -->
<template>
  <el-popover
    v-model:visible="popoverVisible"
    placement="bottom-end"
    :offset="6"
    :show-arrow="true"
    :width="420"
    trigger="click"
    popper-class="redundancy-notification-popover"
  >
    <template #reference>
      <el-badge
        :value="store.abnormalCount"
        :hidden="!store.abnormalCount"
        :max="99"
        class="notification-badge"
      >
        <el-button
          text
          circle
          class="notification-trigger"
          :class="{ 'is-active': popoverVisible }"
          :aria-label="t('redundancy.notificationCenter')"
        >
          <IEpBell />
        </el-button>
      </el-badge>
    </template>

    <header class="notice-heading">
      <strong>{{ t("redundancy.notificationCenter") }}</strong>
      <span v-if="store.abnormalCount" class="notice-count">
        {{
          t("redundancy.currentAbnormalCount", { count: store.abnormalCount })
        }}
      </span>
    </header>

    <div v-if="store.openEvents.length" class="notice-list">
      <button
        v-for="event in store.openEvents"
        :key="event.eventId"
        type="button"
        class="notice-item"
        @click="openEvent(event)"
      >
        <span class="notice-icon" aria-hidden="true">
          <IEpCircleCloseFilled />
        </span>
        <span class="notice-main">
          <span class="notice-row-header">
            <strong>{{ getEventName(event) }}</strong>
            <time :datetime="event.openedAt || undefined">
              {{ formatNoticeTime(event.openedAt) }}
            </time>
          </span>
          <em>{{ event.summary }}</em>
        </span>
        <span class="notice-chevron" aria-hidden="true">
          <IEpArrowRight />
        </span>
      </button>
    </div>

    <div v-else class="notice-empty">
      <span class="notice-empty__icon" aria-hidden="true">
        <IEpCircleCheck />
      </span>
      <span>{{ t("redundancy.noMessages") }}</span>
    </div>

    <button type="button" class="notice-footer" @click="openAllEvents">
      <span>{{ t("redundancy.viewAllNotifications") }}</span>
      <IEpArrowRight />
    </button>
  </el-popover>
</template>
<!-- end -->

<style scoped lang="scss">
/* modified by jinlong.feng at 0901 冗余功能开发 */
.notification-badge {
  --el-badge-size: 16px;
  --el-badge-font-size: 10px;
  --el-badge-padding: 4px;
  display: inline-flex;
  align-items: center;
}

.notification-trigger.el-button {
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid transparent;
  color: #3f4a60;
  font-size: 20px;
  transition:
    color 0.16s ease,
    background-color 0.16s ease,
    border-color 0.16s ease;

  svg {
    width: 20px;
    height: 20px;
  }

  &:hover,
  &.is-active {
    border-color: #9eb8ff;
    background: #f4f7ff;
    color: #0348dd;
  }
}

.notice-heading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 22px 14px;
  border-bottom: 1px solid #e4e9f2;

  strong {
    color: #1f2937;
    font-size: 17px;
    line-height: 24px;
  }
}

.notice-count {
  padding: 2px 8px;
  border-radius: 10px;
  background: #fff0ef;
  color: #d94749;
  font-size: 12px;
  line-height: 20px;
}

.notice-list {
  max-height: 348px;
  overflow-y: auto;
  scrollbar-gutter: stable;
  padding: 14px 16px;
}

.notice-item {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 12px;
  padding: 13px 14px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: #fff5f4;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;

  & + & {
    margin-top: 8px;
  }

  &:hover,
  &:focus-visible {
    border-color: #ffc9c6;
    background: #ffefed;
    outline: none;
  }
}

.notice-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid #ffd4d1;
  border-radius: 7px;
  background: #fff;
  color: #e94c4f;
  font-size: 20px;
}

.notice-main {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 4px;

  em {
    overflow: hidden;
    color: #667085;
    font-style: normal;
    line-height: 20px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.notice-row-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  strong {
    overflow: hidden;
    color: #1f2937;
    font-size: 14px;
    line-height: 22px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  time {
    flex: 0 0 auto;
    color: #8b95a7;
    font-size: 12px;
  }
}

.notice-chevron {
  display: inline-flex;
  flex: 0 0 auto;
  color: #7c8799;
  font-size: 17px;
}

.notice-empty {
  display: flex;
  min-height: 150px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #8b95a7;
}

.notice-empty__icon {
  display: inline-flex;
  color: #55ad6d;
  font-size: 20px;
}

.notice-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  gap: 5px;
  padding: 14px 20px;
  border: 0;
  border-top: 1px solid #e4e9f2;
  border-radius: 0 0 11px 11px;
  background: #fff;
  color: #0348dd;
  font-size: 14px;
  cursor: pointer;

  svg {
    width: 14px;
    height: 14px;
  }

  &:hover,
  &:focus-visible {
    background: #f7f9ff;
    outline: none;
  }
}
/* end */
</style>

<style lang="scss">
/* modified by jinlong.feng at 0901 冗余功能开发 */
.redundancy-notification-popover.el-popover.el-popper {
  overflow: visible;
  padding: 0;
  border: 1px solid #dce3ef;
  border-radius: 12px;
  box-shadow: 0 12px 32px rgb(31 41 55 / 16%);

  > .el-popper__arrow::before {
    border-color: #dce3ef;
    background: #fff;
  }
}

.redundancy-alert-notification.el-notification {
  width: 392px;
  align-items: flex-start;
  overflow: hidden;
  padding: 0;
  border: 1px solid #e2e8f2;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 14px 34px rgb(31 41 55 / 16%);
  cursor: pointer;

  &:hover {
    border-color: #cbd6e8;
    box-shadow: 0 16px 38px rgb(31 41 55 / 20%);
  }

  > .el-notification__icon {
    width: 34px;
    height: 34px;
    flex: 0 0 34px;
    margin: 16px 0 0 16px;
    padding: 7px;
    border-radius: 8px;
    background: #fff7e8;
    color: #e6a23c;
    font-size: 20px;
  }

  > .el-notification__group {
    min-width: 0;
    flex: 1;
    margin: 0;

    > .el-notification__title {
      display: none;
    }

    > .el-notification__content {
      width: 100%;
      margin: 0;
      color: inherit;
      text-align: left;
    }
  }

  > .el-notification__closeBtn {
    top: 15px;
    right: 15px;
    color: #7b8496;
    font-size: 16px;

    &:hover {
      color: #344054;
    }
  }

  .redundancy-alert__content {
    min-width: 0;
    padding: 14px 46px 0 12px;
  }

  .redundancy-alert__heading {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 9px;
  }

  .redundancy-alert__title {
    overflow: hidden;
    color: #1f2937;
    font-size: 16px;
    font-weight: 600;
    line-height: 22px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .redundancy-alert__status {
    flex: 0 0 auto;
    padding: 1px 8px;
    border: 1px solid #f6d79f;
    border-radius: 6px;
    background: #fff7e8;
    color: #d98a12;
    font-size: 12px;
    line-height: 20px;
  }

  .redundancy-alert__name {
    display: block;
    overflow: hidden;
    margin-top: 8px;
    color: #30394b;
    font-size: 14px;
    font-weight: 600;
    line-height: 20px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .redundancy-alert__summary {
    display: -webkit-box;
    overflow: hidden;
    margin: 3px 0 0;
    color: #7b8496;
    font-size: 14px;
    line-height: 20px;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .redundancy-alert__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 42px;
    margin: 12px -46px 0 -62px;
    padding: 10px 18px 10px 62px;
    border-top: 1px solid #edf1f6;
    gap: 16px;
  }

  .redundancy-alert__time {
    overflow: hidden;
    color: #8b95a7;
    font-size: 12px;
    line-height: 20px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .redundancy-alert__action {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 5px;
    color: #2457e6;
    font-size: 13px;
    font-weight: 500;
    line-height: 20px;
  }
}
/* end */
</style>
