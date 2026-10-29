<script setup>
// modified by jinlong.feng at 0901 冗余功能开发
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import CustomCard from "@/components/CustomCard/CustomCard.vue";
import CustomStyleTable from "@/components/CustomStyleTable/CustomStyleTable.vue";
import Loading from "@/components/Loading/LoadingComponent.vue";
import { redundancyAPI } from "@/api/redundancyAPI.js";
import { useRedundancyStore } from "@/stores/redundancyStore.js";
import { useOpsResourceStore } from "@/stores/opsResourceStore.js";
import {
  createRequestId,
  formatDateTime,
  joinResourceStatus,
} from "@/utils/redundancyUtils.js";
import RedundancyStatusTag from "@/components/Redundancy/RedundancyStatusTag.vue";
import NodeAppPanel from "@/components/Redundancy/NodeAppPanel.vue";
import ConfigDialog from "@/components/Redundancy/ConfigDialog.vue";
import AppManagerDialog from "@/components/Redundancy/AppManagerDialog.vue";
import CurrentExceptionDialog from "@/components/Redundancy/CurrentExceptionDialog.vue";
import OperationTaskDrawer from "@/components/Redundancy/OperationTaskDrawer.vue";
import SwitchDialog from "@/components/Redundancy/SwitchDialog.vue";
import { isOperationTaskTerminal } from "@/utils/operationTaskProgress.js";
import { showRedundancyMessage } from "@/utils/redundancyMessage.js";
import "@/styles/redundancy-tables.scss";

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const store = useRedundancyStore();
const resourceStore = useOpsResourceStore();
const keyword = ref("");
const configVisible = ref(false);
const appVisible = ref(false);
const currentExceptionVisible = ref(false);
const switchVisible = ref(false);
const editing = ref(null);
const taskVisible = ref(false);
let completionTimer = null;
const filtered = computed(() => {
  const key = keyword.value.trim().toLowerCase();
  return key
    ? store.configurations.filter((item) =>
        [
          item.name,
          item.primaryNode?.nodeName,
          item.primaryNode?.nodeIp,
          item.standbyNode?.nodeName,
          item.standbyNode?.nodeIp,
        ].some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(key),
        ),
      )
    : store.configurations;
});
const liveDetail = computed(() =>
  store.selectedId
    ? joinResourceStatus(store.detail, resourceStore.nodeResourceData)
    : null,
);
const selectedActions = computed(
  () => new Set(store.selected?.allowedActions || []),
);
const selectedOpenEvents = computed(() =>
  store.openEvents.filter(
    (event) =>
      event.redundancyId === store.selectedId && event.status === "OPEN",
  ),
);
const currentExceptionSummary = computed(() =>
  selectedOpenEvents.value
    .map((event) => event.summary)
    .filter(Boolean)
    .join("；"),
);
const requestedSelectionId = computed(() => {
  const value = route.query.redundancyId;
  if (Array.isArray(value)) return value[0] || "";
  return typeof value === "string" ? value : "";
});

onMounted(async () => {
  try {
    await Promise.all([
      store.loadList({
        requestedSelectionId: requestedSelectionId.value,
      }),
      store.loadOpenEvents(),
    ]);
  } catch {
    /* 全局请求层已提示 */
  }
});

watch(requestedSelectionId, async (id) => {
  if (
    !id ||
    id === store.selectedId ||
    !store.configurations.some((item) => item.redundancyId === id)
  ) {
    return;
  }
  try {
    await store.loadDetail(id);
  } catch {
    /* 全局请求层已提示 */
  }
});

async function selectRow(row) {
  if (row.redundancyId !== store.selectedId)
    await store.loadDetail(row.redundancyId);
}
/** 标记当前冗余配置，使列表选择与下方详情保持一致。 */
function configurationRowClass({ row }) {
  return row.redundancyId === store.selectedId ? "selected-redundancy-row" : "";
}
function createConfig() {
  editing.value = null;
  configVisible.value = true;
}
/** 返回配置当前激活节点的可读名称。 */
function activeNodeName(configuration) {
  if (configuration.activeNodeId === configuration.primaryNodeId) {
    return configuration.primaryNode?.nodeName || configuration.primaryNodeId;
  }
  if (configuration.activeNodeId === configuration.standbyNodeId) {
    return configuration.standbyNode?.nodeName || configuration.standbyNodeId;
  }
  return "—";
}
function editConfig() {
  editing.value = store.selected;
  configVisible.value = true;
}
/** 打开当前所选冗余配置的未恢复异常弹窗。 */
function openCurrentExceptions() {
  if (!liveDetail.value) return;
  currentExceptionVisible.value = true;
}
async function afterSaved() {
  await store.loadList({ background: true });
}

/** 清理任务成功后的自动收起计时器。 */
function clearCompletionTimer() {
  if (!completionTimer) return;
  window.clearTimeout(completionTimer);
  completionTimer = null;
}

/** 用户关闭任务抽屉后释放当前任务展示状态。 */
function handleTaskClosed() {
  clearCompletionTimer();
  store.clearActiveTask();
}

/** 成功任务短暂展示结果后自动收起；失败任务保持可见。 */
function scheduleTaskClose(taskResult) {
  if (taskResult?.status !== "SUCCEEDED") return;
  clearCompletionTimer();
  completionTimer = window.setTimeout(() => {
    taskVisible.value = false;
  }, 1500);
}

/**
 * 执行需要展示阶段进度的冗余操作，并使用任务详情接口校准最终结果。
 */
async function executeTracked(operationType, item, operation) {
  const requestId = createRequestId();
  clearCompletionTimer();
  store.startTaskTracking({
    requestId,
    operationType,
    redundancyId: item.redundancyId,
    configurationName: item.name,
  });
  taskVisible.value = true;
  try {
    const result = await store.runMutation(() => operation(requestId));
    store.applyTaskUpdate(result);
    if (result?.taskId) {
      try {
        await store.loadTaskDetail(item.redundancyId, result.taskId);
      } catch {
        /* WebSocket 与操作接口结果已可继续展示，详情查询仅作为校准。 */
      }
    }
    if (store.activeTask?.status === "SUCCEEDED") {
      showRedundancyMessage(
        "success",
        t(`redundancy.messages.${operationType.toLowerCase()}Succeeded`),
      );
      scheduleTaskClose(store.activeTask);
    }
  } catch {
    if (store.activeTask?.taskId) {
      try {
        await store.loadTaskDetail(item.redundancyId, store.activeTask.taskId);
      } catch {
        /* 全局请求层已提示原始错误。 */
      }
    }
    if (
      !store.activeTask?.taskId &&
      !isOperationTaskTerminal(store.activeTask)
    ) {
      taskVisible.value = false;
      store.clearActiveTask();
    }
  }
}
async function enable() {
  const item = store.selected;
  if (!item) return;
  await ElMessageBox.confirm(
    t("redundancy.confirmEnable"),
    t("redundancy.enableConfiguration"),
    {
      type: "warning",
      confirmButtonText: t("redundancy.enable"),
      cancelButtonText: t("cancel"),
    },
  );
  await executeTracked("ENABLE", item, (requestId) =>
    redundancyAPI.enable(item.redundancyId, {
      expectedRevision: item.revision,
      requestId,
    }),
  );
}
async function disable() {
  const item = store.selected;
  if (!item) return;
  await ElMessageBox.confirm(
    t("redundancy.confirmDisable"),
    t("redundancy.disableConfiguration"),
    {
      type: "warning",
      confirmButtonText: t("redundancy.disable"),
      cancelButtonText: t("cancel"),
    },
  );
  taskVisible.value = false;
  store.clearActiveTask();
  try {
    await store.runMutation(() =>
      redundancyAPI.disable(item.redundancyId, {
        expectedRevision: item.revision,
        requestId: createRequestId(),
      }),
    );
    showRedundancyMessage("success", t("redundancy.messages.disableSucceeded"));
  } catch {
    /* 全局请求层已提示 */
  }
}
function switchNode() {
  if (!liveDetail.value) return;
  switchVisible.value = true;
}

/** 接收切换弹窗校验后的普通或强制切换参数。 */
async function confirmSwitch({ targetNodeId, force, reason }) {
  const item = store.selected;
  if (!item) return;
  await executeTracked("SWITCH", item, (requestId) =>
    redundancyAPI.switchNode(item.redundancyId, {
      expectedRevision: item.revision,
      requestId,
      targetNodeId,
      force,
      ...(reason ? { reason } : {}),
    }),
  );
}
async function remove() {
  const item = store.selected;
  if (!item) return;
  await ElMessageBox.confirm(
    t("redundancy.confirmDelete", { name: item.name }),
    t("delete"),
    {
      type: "error",
      confirmButtonText: t("delete"),
      cancelButtonText: t("cancel"),
    },
  );
  await store.runMutation(() =>
    redundancyAPI.remove(item.redundancyId, item.revision),
  );
}

onBeforeUnmount(clearCompletionTimer);
// end
</script>

<!-- modified by jinlong.feng at 0901 冗余功能开发 -->
<template>
  <main class="redundancy-page">
    <CustomCard
      :title="t('redundancy.management')"
      icon-name="redundancy"
      class="redundancy-manager"
      shadow="never"
      background="transparent"
      border="0px"
    >
      <el-alert
        v-if="store.socketState === 'RECONNECTING'"
        :title="t('redundancy.reconnecting')"
        type="warning"
        show-icon
        :closable="false"
      />
      <header class="toolbar">
        <div class="button">
          <el-button type="primary" @click="createConfig">
            <el-icon class="mr-6"><IEpCirclePlus /></el-icon>
            {{ t("add") }}
          </el-button>
          <el-button
            :disabled="
              store.mutationPending ||
              !store.selected ||
              !selectedActions.has('EDIT')
            "
            @click="editConfig"
          >
            <el-icon class="mr-6"><IEpEdit /></el-icon>
            {{ t("edit") }}
          </el-button>
          <el-button
            type="primary"
            plain
            :disabled="store.mutationPending || !selectedActions.has('ENABLE')"
            @click="enable"
          >
            <el-icon class="mr-6"><IEpCircleCheck /></el-icon>
            {{ t("redundancy.enable") }}
          </el-button>
          <el-button
            type="danger"
            :disabled="store.mutationPending || !selectedActions.has('DISABLE')"
            @click="disable"
          >
            <el-icon class="mr-6"><IEpCircleClose /></el-icon>
            {{ t("redundancy.disable") }}
          </el-button>
          <el-button
            :disabled="store.mutationPending || !selectedActions.has('SWITCH')"
            @click="switchNode"
          >
            <el-icon class="mr-6"><IEpSwitch /></el-icon>
            {{ t("redundancy.switchNode") }}
          </el-button>
          <el-button
            type="danger"
            plain
            :disabled="store.mutationPending || !selectedActions.has('DELETE')"
            @click="remove"
          >
            <el-icon class="mr-6"><IEpDeleteFilled /></el-icon>
            {{ t("delete") }}
          </el-button>
          <el-button
            :disabled="
              store.mutationPending || !selectedActions.has('UPDATE_APPS')
            "
            @click="appVisible = true"
          >
            <el-icon class="mr-6"><IEpGrid /></el-icon>
            {{ t("redundancy.appManagement") }}
          </el-button>
          <el-button @click="router.push({ name: 'redundancyEvents' })">
            <el-icon class="mr-6"><IEpBell /></el-icon>
            {{ t("redundancy.eventRecords") }}
          </el-button>
        </div>
        <div class="search-box">
          <el-input
            v-model="keyword"
            clearable
            class="search-input"
            :placeholder="t('redundancy.searchPlaceholder')"
            ><template #prefix><IEpSearch /></template
          ></el-input>
        </div>
      </header>
      <CustomStyleTable
        :table-data="filtered"
        :page-sizes="[5, 10, 20, 50]"
        row-key="redundancyId"
        max-height="calc(100% - 52px)"
        class="configuration-table"
        table-class="redundancy-centered-table"
        :cal-row-class-name="configurationRowClass"
        @table-row-click="selectRow"
      >
        <el-table-column
          prop="name"
          :label="t('redundancy.configurationName')"
          min-width="150"
          show-overflow-tooltip
        />
        <el-table-column :label="t('redundancy.primaryNode')" min-width="165"
          ><template #default="{ row }"
            >{{ row.primaryNode?.nodeName || row.primaryNodeId
            }}<small>{{ row.primaryNode?.nodeIp || "" }}</small></template
          ></el-table-column
        >
        <el-table-column :label="t('redundancy.standbyNode')" min-width="165"
          ><template #default="{ row }"
            >{{ row.standbyNode?.nodeName || row.standbyNodeId
            }}<small>{{ row.standbyNode?.nodeIp || "" }}</small></template
          ></el-table-column
        >
        <el-table-column :label="t('redundancy.currentActive')" width="115"
          ><template #default="{ row }"
            ><el-tag type="primary" round>{{
              activeNodeName(row)
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column :label="t('redundancy.primaryNodeApps')" width="115"
          ><template #default="{ row }">{{
            row.primaryAppIds?.length || 0
          }}</template></el-table-column
        >
        <el-table-column :label="t('redundancy.standbyNodeApps')" width="115"
          ><template #default="{ row }">{{
            row.standbyAppIds?.length || 0
          }}</template></el-table-column
        >
        <el-table-column :label="t('redundancy.healthStatus')" width="110"
          ><template #default="{ row }"
            ><RedundancyStatusTag
              :value="
                row.lifecycle === 'DISABLED' ? 'DISABLED' : row.healthStatus
              " /></template
        ></el-table-column>
        <el-table-column :label="t('redundancy.lastSwitch')" min-width="165"
          ><template #default="{ row }">{{
            formatDateTime(row.lastSwitchAt, locale)
          }}</template></el-table-column
        >
      </CustomStyleTable>
    </CustomCard>

    <CustomCard
      :title="t('redundancy.configurationDetail')"
      class="redundancy-detail"
      shadow="never"
      background="transparent"
      border="0px"
    >
      <section v-if="liveDetail" class="detail-card">
        <div class="configuration-summary">
          <div class="configuration-identity">
            <strong>{{ liveDetail.name }}</strong>
            <RedundancyStatusTag
              :value="
                liveDetail.lifecycle === 'DISABLED'
                  ? 'DISABLED'
                  : liveDetail.healthStatus
              "
            />
          </div>
          <dl>
            <dt>{{ t("redundancy.currentActive") }}</dt>
            <dd>{{ activeNodeName(liveDetail) }}</dd>
            <!-- modified by jinlong.feng at 2026-10-14 冗余配置生效时间显示 -->
            <template v-if="liveDetail.lifecycle === 'ENABLED'">
              <i />
              <dt>{{ t("redundancy.effectiveTime") }}</dt>
              <dd>{{ formatDateTime(liveDetail.updatedAt, locale) }}</dd>
            </template>
            <!-- end -->
          </dl>
        </div>
        <div class="nodes">
          <div class="node-grid">
            <NodeAppPanel
              side="primary"
              :node="liveDetail.nodes.primary"
              :active-node-id="liveDetail.activeNodeId"
            />
            <div class="standby-bridge">
              <i />
              <span>{{ t("redundancy.coldStandby") }}</span>
              <i />
            </div>
            <NodeAppPanel
              side="standby"
              :node="liveDetail.nodes.standby"
              :active-node-id="liveDetail.activeNodeId"
            />
          </div>
          <div v-if="selectedOpenEvents.length" class="current-error">
            <el-icon><IEpWarningFilled /></el-icon>
            <strong>{{
              t("redundancy.currentAbnormalCount", {
                count: selectedOpenEvents.length,
              })
            }}</strong>
            <span class="current-error-summary">{{
              currentExceptionSummary
            }}</span>
            <el-button link type="primary" @click="openCurrentExceptions">{{
              t("redundancy.viewAll")
            }}</el-button>
          </div>
        </div>
      </section>
      <el-empty
        v-else-if="!store.loading"
        :description="t('redundancy.noConfiguration')"
      />
    </CustomCard>
    <ConfigDialog
      v-model:visible="configVisible"
      :editing="editing"
      @saved="afterSaved"
    />
    <AppManagerDialog
      v-model:visible="appVisible"
      :configuration="store.selected"
      @saved="afterSaved"
    />
    <CurrentExceptionDialog
      v-model:visible="currentExceptionVisible"
      :configuration="liveDetail"
    />
    <SwitchDialog
      v-model:visible="switchVisible"
      :configuration="liveDetail"
      @confirm="confirmSwitch"
    />
    <OperationTaskDrawer
      v-model:visible="taskVisible"
      :task="store.activeTask"
      @closed="handleTaskClosed"
    />
    <Loading
      :loading="store.loading || (store.mutationPending && !taskVisible)"
      :loading-text="t('redundancy.loading')"
    />
  </main>
</template>
<!-- end -->

<style scoped lang="scss">
/* modified by jinlong.feng at 0901 冗余功能开发 */
.redundancy-page {
  height: 100%;
  min-height: 0;
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #f4f6fb;
  color: #283044;
  box-sizing: border-box;
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.detail-card {
  min-height: 0;
  padding: 10px 14px;
  box-sizing: border-box;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 4px 18px rgb(48 70 120 / 5%);
}
.redundancy-manager,
.redundancy-detail {
  position: relative;
  min-height: 0;
}
.redundancy-manager {
  flex: 0 0 calc(50% - 6px);
}
.redundancy-detail {
  flex: 1;
}
.toolbar {
  flex-wrap: wrap;
  margin-bottom: 20px;
  gap: 10px;
  .button {
    display: flex;
    flex-wrap: wrap;
    gap: 0;
  }
  .search-box {
    min-width: 300px;
    margin-top: 8px;
    @media screen and (min-width: 768px) {
      margin-top: 0;
    }
    .search-input {
      width: 300px;
    }
  }
  :deep(.el-button + .el-button) {
    margin-left: 10px;
  }
}
.redundancy-manager :deep(.el-card__body),
.redundancy-detail :deep(.el-card__body) {
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.redundancy-manager :deep(.el-card__body) {
  height: calc(100% - 39px);
}
.redundancy-detail :deep(.el-card__body) {
  height: calc(100% - 37px);
}
.redundancy-manager :deep(.table-container) {
  flex: 1;
  min-height: 0;
}
.configuration-table :deep(.custom-row) {
  height: 40px;
}
.configuration-table :deep(.custom-row .el-table__cell) {
  padding: 0;
}
.configuration-table :deep(.selected-redundancy-row) {
  --el-table-tr-bg-color: #e8efff;
  --el-table-row-hover-bg-color: #e8efff;
}
small {
  display: inline;
  margin-left: 8px;
  color: #929aaa;
}
.detail-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  margin-top: 0;
}
.configuration-summary {
  flex: 0 0 38px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 8px;
  padding: 0 4px 8px;
  border-bottom: 1px solid #e5eaf2;
  overflow: hidden;
  .configuration-identity,
  dl {
    display: flex;
    align-items: center;
    white-space: nowrap;
  }
  .configuration-identity {
    min-width: 0;
    gap: 12px;
    strong {
      overflow: hidden;
      color: #2f3748;
      font-size: 15px;
      text-overflow: ellipsis;
    }
  }
  dl {
    flex: 0 0 auto;
    gap: 10px;
    margin: 0;
    font-size: 13px;
    dt {
      color: #7a8496;
    }
    dd {
      margin: 0;
      color: #3f4a61;
    }
    i {
      width: 1px;
      height: 14px;
      margin: 0 6px;
      background: #dce4f1;
    }
  }
}
.nodes {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.node-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 44px minmax(0, 1fr);
  gap: 8px;
}
.standby-bridge {
  display: flex;
  align-items: center;
  align-self: center;
  color: #5674c9;
  font-size: 12px;
  white-space: nowrap;
  i {
    flex: 1;
    min-width: 5px;
    border-top: 1px dashed #7694e7;
  }
  span {
    padding: 4px 6px;
    border: 1px solid #cad7f8;
    border-radius: 12px;
    background: #f5f8ff;
  }
}
.current-error {
  flex: 0 0 auto;
  display: flex;
  gap: 8px;
  align-items: center;
  height: 36px;
  margin-top: 8px;
  padding: 0 12px;
  box-sizing: border-box;
  border-radius: 5px;
  background: #fff0f0;
  color: #df4747;
  overflow: hidden;
  .el-icon {
    flex: 0 0 auto;
    font-size: 16px;
  }
  strong {
    flex: 0 0 auto;
    font-weight: 500;
  }
  .current-error-summary {
    overflow: hidden;
    color: #d65353;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .el-button {
    flex: 0 0 auto;
    margin-left: auto;
  }
}
@media (max-width: 1200px) {
  .configuration-summary dl {
    display: none;
  }
  .node-grid {
    grid-template-columns: minmax(0, 1fr) 32px minmax(0, 1fr);
  }
}
/* end */
</style>
