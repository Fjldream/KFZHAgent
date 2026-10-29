<script setup>
// modified by jinlong.feng at 0901 冗余功能开发
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import CustomStyleTable from "@/components/CustomStyleTable/CustomStyleTable.vue";
import RedundancyStatusTag from "./RedundancyStatusTag.vue";
import { useOpsResourceStore } from "@/stores/opsResourceStore.js";
import { formatDateTime } from "@/utils/redundancyUtils.js";
import {
  getOperationAppProgress,
  getOperationSkippedActions,
  getOperationTaskStages,
  isOperationTaskTerminal,
  resolveOperationAppName,
  shouldFollowLatestAppStep,
} from "@/utils/operationTaskProgress.js";

const props = defineProps({
  task: { type: Object, default: null },
});
const emit = defineEmits(["closed"]);
const visible = defineModel("visible", { type: Boolean, default: false });
const { t, locale } = useI18n();
const resourceStore = useOpsResourceStore();
const taskTableRef = ref(null);

const stageTranslationKeys = Object.freeze({
  STOP_INACTIVE_APPS: "stageStopInactiveApps",
  SYNC_ROLES: "stageSyncRoles",
  START_ACTIVE_APPS: "stageStartActiveApps",
  STOP_SOURCE_APPS: "stageStopSourceApps",
  START_TARGET_APPS: "stageStartTargetApps",
});

const stages = computed(() => getOperationTaskStages(props.task));
const skippedActions = computed(() => getOperationSkippedActions(props.task));
const offlineSourceSkip = computed(() =>
  skippedActions.value.find(
    (item) =>
      item.action === "STOP_SOURCE_APPS" &&
      item.reasonCode === "SOURCE_NODE_OFFLINE",
  ),
);
const offlineSourceName = computed(() =>
  resolveNodeName(offlineSourceSkip.value?.nodeId),
);
const appProgress = computed(() => getOperationAppProgress(props.task));
const showBatchProgress = computed(
  () => appProgress.value.total > 0 && (appProgress.value.action || isTerminal.value),
);
const batchTitle = computed(() =>
  t(
    appProgress.value.action === "STOP"
      ? "redundancy.batchStoppingApps"
      : "redundancy.batchStartingApps",
    { total: appProgress.value.total },
  ),
);
const batchSubtitle = computed(() =>
  appProgress.value.returned === 0
    ? t("redundancy.waitingForAgentBatchResult")
    : t("redundancy.confirmingObservedAppState"),
);
const isTerminal = computed(() => isOperationTaskTerminal(props.task));
const isSucceeded = computed(() => props.task?.status === "SUCCEEDED");
const taskName = computed(
  () =>
    props.task?.configurationName ||
    props.task?.redundancyNameSnapshot ||
    props.task?.redundancyName ||
    "—",
);
const currentStageText = computed(() => {
  const current = stages.value.find((stage) => stage.state === "process");
  if (current) return translateStage(current.key);
  if (props.task?.status === "FAILED") return t("redundancy.taskFailed");
  if (props.task?.status === "SUCCEEDED") return t("redundancy.taskSucceeded");
  return t("redundancy.creatingTask");
});
const appRows = computed(() =>
  (props.task?.appSteps || []).map((step) => ({
    ...step,
    appName: resolveOperationAppName(step, resourceStore.nodeResourceData),
    nodeName: resolveNodeName(step.nodeId),
    displayStatus: step.commandStatus || step.status || "PENDING",
    displayMessage:
      step.failureMessage ||
      step.observedStatus ||
      ((step.commandStatus || step.status) === "UNKNOWN"
        ? t("redundancy.unconfirmedAppResult")
        : "—"),
  })),
);
const taskTableHeight = "min(462px, max(282px, calc(100vh - 560px)))";

watch(
  [() => visible.value, () => appRows.value.length],
  async ([nextVisible, nextCount], [previousVisible, previousCount]) => {
    const openedWithRows = nextVisible && !previousVisible && nextCount > 0;
    const receivedNewStep =
      nextVisible && shouldFollowLatestAppStep(previousCount, nextCount);
    if (!openedWithRows && !receivedNewStep) return;

    await nextTick();
    taskTableRef.value
      ?.getTableRef?.()
      ?.setScrollTop?.(Number.MAX_SAFE_INTEGER);
  },
  { flush: "post" },
);

/** 将后端阶段枚举转换为当前语言的可读文案。 */
function translateStage(stage) {
  const key = stageTranslationKeys[stage];
  return key ? t(`redundancy.${key}`) : stage || "—";
}

/** 从公共节点资源 Store 中解析节点名称。 */
function resolveNodeName(nodeId) {
  const node = resourceStore.nodeResourceData.find(
    (item) => item.nodeId === nodeId,
  );
  return node?.nodeName || node?.name || nodeId || "—";
}
// end
</script>

<!-- // modified by jinlong.feng at 0901 冗余功能开发 -->
<template>
  <el-drawer
    v-model="visible"
    class="operation-task-drawer"
    size="720px"
    :close-on-click-modal="isTerminal"
    @closed="emit('closed')"
  >
    <template #header>
      <div class="drawer-heading">
        <span
          class="heading-icon"
          :class="{
            success: isSucceeded,
            failed: task?.status === 'FAILED',
          }"
        >
          <el-icon v-if="isSucceeded"><IEpCircleCheckFilled /></el-icon>
          <el-icon v-else-if="task?.status === 'FAILED'"
            ><IEpCircleCloseFilled
          /></el-icon>
          <el-icon v-else class="is-loading"><IEpLoading /></el-icon>
        </span>
        <div>
          <h2>{{ t("redundancy.taskProgress") }}</h2>
          <p>{{ taskName }}</p>
        </div>
        <RedundancyStatusTag v-if="task" :value="task.status" />
      </div>
    </template>

    <div v-if="task" class="task-content" aria-live="polite">
      <section class="task-overview">
        <div class="overview-main">
          <span class="operation-label">{{
            t(`redundancy.enums.${task.operationType}`)
          }}</span>
          <strong>{{ currentStageText }}</strong>
        </div>
        <div class="overview-meta">
          <span>{{ formatDateTime(task.startedAt, locale) }}</span>
          <span v-if="appProgress.total">
            {{
              t("redundancy.completedApps", {
                completed: appProgress.completed,
                total: appProgress.total,
              })
            }}
          </span>
        </div>
      </section>

      <el-alert
        v-if="offlineSourceSkip"
        class="skip-alert"
        :title="
          t('redundancy.offlineSourceSkippedTitle', {
            node: offlineSourceName,
          })
        "
        :description="t('redundancy.offlineSourceSkippedDescription')"
        type="warning"
        show-icon
        :closable="false"
      />

      <section class="progress-section">
        <div class="section-title">
          <span>{{ t("redundancy.executionProgress") }}</span>
          <small>{{ t("redundancy.threeStages") }}</small>
        </div>
        <el-steps class="task-steps" align-center>
          <el-step
            v-for="(stage, index) in stages"
            :key="stage.key"
            :status="stage.state"
            :class="{ 'is-skipped': stage.skipped }"
          >
            <template #icon>
              <span class="stage-number">{{ index + 1 }}</span>
            </template>
            <template #title>
              <span>{{ translateStage(stage.key) }}</span>
            </template>
            <template v-if="stage.skipped" #description>
              <el-tag
                class="stage-skip-tag"
                size="small"
                type="warning"
                effect="light"
              >
                {{ t("redundancy.skipped") }}
              </el-tag>
            </template>
          </el-step>
        </el-steps>
      </section>

      <section class="app-section">
        <div class="section-title">
          <span>{{ t("redundancy.appExecutionDetail") }}</span>
          <small v-if="appProgress.total">
            {{ t("redundancy.appStepCount", { count: appProgress.total }) }}
          </small>
        </div>
        <div
          v-if="showBatchProgress"
          class="batch-progress"
          :class="{ terminal: isTerminal }"
        >
          <template v-if="!isTerminal">
            <div class="batch-progress__copy">
              <el-icon class="is-loading"><IEpLoading /></el-icon>
              <div>
                <strong>{{ batchTitle }}</strong>
                <span :title="batchSubtitle">{{ batchSubtitle }}</span>
              </div>
              <small>
                {{
                  t("redundancy.returnedAppResults", {
                    returned: appProgress.returned,
                    total: appProgress.total,
                  })
                }}
              </small>
            </div>
            <el-progress
              :percentage="100"
              :indeterminate="true"
              :duration="2"
              :show-text="false"
            />
          </template>
          <span v-else>
            {{
              t("redundancy.batchResultSummary", {
                total: appProgress.total,
                succeeded: appProgress.succeeded,
                failed: appProgress.failed,
                unknown: appProgress.unknown,
              })
            }}
          </span>
        </div>
        <CustomStyleTable
          v-if="appRows.length"
          ref="taskTableRef"
          class="task-table"
          :table-data="appRows"
          row-key="stepId"
          :show-pagination="false"
          :max-height="taskTableHeight"
          table-class="redundancy-centered-table"
        >
          <el-table-column
            prop="appName"
            :label="t('redundancy.appName')"
            min-width="145"
            show-overflow-tooltip
          />
          <el-table-column
            prop="nodeName"
            :label="t('redundancy.operationNode')"
            min-width="120"
            show-overflow-tooltip
          />
          <el-table-column :label="t('operation')" width="90">
            <template #default="{ row }">
              {{ t(`redundancy.enums.${row.action}`) }}
            </template>
          </el-table-column>
          <el-table-column :label="t('status')" width="120">
            <template #default="{ row }">
              <RedundancyStatusTag :value="row.displayStatus" />
            </template>
          </el-table-column>
          <el-table-column
            prop="displayMessage"
            :label="t('redundancy.executionInfo')"
            min-width="133"
            show-overflow-tooltip
          />
        </CustomStyleTable>
        <div v-else class="task-empty">
          <el-icon :class="{ 'is-loading': !isTerminal }"
            ><IEpLoading
          /></el-icon>
          <span>{{
            isTerminal
              ? t("redundancy.noAppOperations")
              : t("redundancy.waitingForAppSteps")
          }}</span>
        </div>
      </section>

      <section
        v-if="isTerminal"
        class="task-result"
        :class="isSucceeded ? 'success' : 'failed'"
      >
        <el-icon>
          <IEpCircleCheckFilled v-if="isSucceeded" />
          <IEpWarningFilled v-else />
        </el-icon>
        <div>
          <strong>{{
            isSucceeded
              ? t("redundancy.taskSucceeded")
              : t("redundancy.taskFailed")
          }}</strong>
          <p v-if="task.failureMessage">{{ task.failureMessage }}</p>
          <p v-else-if="isSucceeded">{{ t("redundancy.autoCloseTask") }}</p>
        </div>
      </section>
    </div>
  </el-drawer>
</template>
<!-- // end -->

<style scoped lang="scss">
/* modified by jinlong.feng at 0901 冗余功能开发 */
:global(.operation-task-drawer .el-drawer__header) {
  height: 72px;
  margin: 0;
  padding: 0 24px;
  border-bottom: 1px solid #e7ebf3;
}
:global(.operation-task-drawer .el-drawer__body) {
  padding: 20px 24px 24px;
  background: #f7f9fc;
}
.drawer-heading {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  color: #283044;
  .heading-icon {
    flex: 0 0 36px;
    width: 36px;
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    background: #edf2ff;
    color: #315ae8;
    font-size: 19px;
    &.success {
      background: #eaf8f0;
      color: #35a76f;
    }
    &.failed {
      background: #fff0f0;
      color: #df4c4c;
    }
  }
  div {
    min-width: 0;
    flex: 1;
  }
  h2,
  p {
    margin: 0;
  }
  h2 {
    font-size: 17px;
    line-height: 24px;
  }
  p {
    overflow: hidden;
    color: #8a93a5;
    font-size: 12px;
    line-height: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
.task-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.skip-alert {
  flex: 0 0 auto;
}
.task-overview,
.progress-section,
.app-section,
.task-result {
  border: 1px solid #e5eaf2;
  border-radius: 10px;
  background: #fff;
}
.task-overview {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 14px 16px;
  box-sizing: border-box;
  .overview-main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
    strong {
      overflow: hidden;
      color: #283044;
      font-size: 15px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
  .operation-label {
    color: #65718a;
    font-size: 12px;
  }
  .overview-meta {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
    color: #8a93a5;
    font-size: 12px;
  }
}
.progress-section,
.app-section {
  padding: 16px;
}
.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  color: #313a4d;
  font-size: 14px;
  font-weight: 600;
  &::before {
    width: 3px;
    height: 14px;
    margin-right: 8px;
    border-radius: 2px;
    background: #315ae8;
    content: "";
  }
  span {
    flex: 1;
  }
  small {
    color: #929aaa;
    font-size: 12px;
    font-weight: 400;
  }
}
.task-steps {
  padding: 2px 8px 4px;
  :deep(.el-step__title) {
    font-size: 13px;
    line-height: 20px;
  }
  :deep(.el-step__line) {
    top: 14px;
  }
  :deep(.el-step__icon) {
    width: 28px;
    height: 28px;
    border-width: 1px;
    background: #fff;
  }
  .stage-number {
    font-size: 12px;
    font-weight: 600;
  }
  :deep(.el-step.is-skipped .el-step__head),
  :deep(.el-step.is-skipped .el-step__title) {
    color: var(--el-color-warning);
  }
  .stage-skip-tag {
    margin-top: 4px;
  }
}
.app-section {
  min-height: 348px;
  height: min(548px, calc(100vh - 390px));
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  .section-title {
    flex: 0 0 auto;
    margin-bottom: 10px;
  }
}
.batch-progress {
  flex: 0 0 auto;
  margin-bottom: 10px;
  padding: 10px 12px;
  border: 1px solid #dfe7fb;
  border-radius: 8px;
  background: #f7f9ff;
  color: #44516a;
  &__copy {
    display: flex;
    align-items: center;
    gap: 9px;
    margin-bottom: 8px;
    > .el-icon {
      flex: 0 0 auto;
      color: #315ae8;
      font-size: 16px;
    }
    > div {
      min-width: 0;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    strong {
      font-size: 13px;
    }
    span,
    small {
      color: #8993a7;
      font-size: 12px;
    }
    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    small {
      flex: 0 0 auto;
    }
  }
  &.terminal {
    padding: 9px 12px;
    color: #65718a;
    font-size: 12px;
  }
  :deep(.el-progress-bar__outer) {
    height: 4px !important;
  }
}
.task-table {
  flex: 0 0 auto;
  :deep(.custom-row) {
    height: 42px;
  }
  :deep(.custom-row .el-table__cell) {
    padding: 0;
  }
}
.task-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 7px;
  background: #fafbfe;
  color: #8a93a5;
  font-size: 13px;
  .el-icon {
    color: #6281e7;
    font-size: 17px;
  }
}
.task-result {
  display: flex;
  gap: 10px;
  padding: 12px 14px;
  &.success {
    border-color: #ccebd9;
    background: #f0faf4;
    color: #2c9863;
  }
  &.failed {
    border-color: #f2cece;
    background: #fff3f3;
    color: #d94444;
  }
  > .el-icon {
    margin-top: 2px;
    font-size: 17px;
  }
  strong,
  p {
    margin: 0;
  }
  strong {
    font-size: 13px;
  }
  p {
    margin-top: 3px;
    font-size: 12px;
    line-height: 18px;
  }
}
@media (max-width: 900px) {
  :global(.operation-task-drawer) {
    width: min(720px, 94vw) !important;
  }
}
/* end */
</style>
