<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  CircleCheck,
  Delete,
  Edit,
  Plus,
  Refresh,
  SetUp,
  SwitchButton,
} from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useRedundancyRuntime } from "../runtime";
import type {
  OperationTask,
  RedundancyConfigSummary,
} from "../types/redundancy";
import { createRequestId, formatDateTime } from "../utils/format";
import RedundancyStatusTag from "../components/RedundancyStatusTag.vue";
import NodeAppPanel from "../components/NodeAppPanel.vue";
import ConfigDialog from "../components/ConfigDialog.vue";
import AppManagerDialog from "../components/AppManagerDialog.vue";
import SwitchDialog from "../components/SwitchDialog.vue";
import OperationTaskDrawer from "../components/OperationTaskDrawer.vue";

const runtime = useRedundancyRuntime();
const store = runtime.useStore();
const router = useRouter();
const route = useRoute();
const query = ref(String(route.query.q ?? ""));
const configDialogOpen = ref(false);
const editingConfiguration = ref<RedundancyConfigSummary | null>(null);
const appDialogOpen = ref(false);
const switchDialogOpen = ref(false);
const taskDrawerOpen = ref(false);
const taskDetail = ref<OperationTask | null>(null);
const page = ref(1);
const pageSize = ref(10);

const filteredConfigurations = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  if (!keyword) return store.configurations;
  return store.configurations.filter((item) =>
    [
      item.name,
      item.primaryNode.nodeName,
      item.primaryNode.nodeIp,
      item.standbyNode.nodeName,
      item.standbyNode.nodeIp,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword)),
  );
});
const pagedConfigurations = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return filteredConfigurations.value.slice(start, start + pageSize.value);
});
const canMaintain = computed(() => runtime.canMaintain());
const selectedActions = computed(
  () => new Set(store.selected?.allowedActions ?? []),
);

watch(query, (value) => {
  page.value = 1;
  void router.replace({ query: { ...route.query, q: value || undefined } });
});

watch(
  () => filteredConfigurations.value.length,
  (total) => {
    const lastPage = Math.max(1, Math.ceil(total / pageSize.value));
    if (page.value > lastPage) page.value = lastPage;
  },
);

onMounted(async () => {
  document.title = "节点冗余管理 — KingFusion3.6";
  await Promise.all([store.loadList(), store.loadOpenEvents()]);
});

async function selectRow(row: RedundancyConfigSummary) {
  await store.loadDetail(row.redundancyId);
}

function createConfiguration() {
  editingConfiguration.value = null;
  configDialogOpen.value = true;
}

function editConfiguration() {
  if (!store.selected) return;
  editingConfiguration.value = store.selected;
  configDialogOpen.value = true;
}

async function refresh() {
  await Promise.all([
    store.loadList({ background: true, preserveSelection: true }),
    store.loadOpenEvents(),
  ]);
  ElMessage.success("数据已刷新");
}

async function enableConfiguration() {
  if (!store.selected) return;
  await ElMessageBox.confirm(
    `首次生效后将停止失活节点 APP，并启动“${store.selected.initialActiveNodeId === store.selected.primaryNodeId ? "主节点" : "从节点"}”的受管 APP。`,
    "确认生效冗余配置",
    {
      confirmButtonText: "生效",
      cancelButtonText: "取消",
      type: "warning",
      autofocus: false,
    },
  );
  await executeOperation(() =>
    runtime.api.enable(
      store.selected!.redundancyId,
      store.selected!.revision,
      createRequestId(),
    ),
  );
}

async function disableConfiguration() {
  if (!store.selected) return;
  await ElMessageBox.confirm(
    "停用只解除冗余管控，不会启动或停止两侧 APP。停用后请自行确认 APP 状态。",
    "确认停用冗余配置",
    {
      confirmButtonText: "停用",
      cancelButtonText: "取消",
      type: "warning",
      autofocus: false,
    },
  );
  await executeOperation(() =>
    runtime.api.disable(
      store.selected!.redundancyId,
      store.selected!.revision,
      createRequestId(),
    ),
  );
}

async function deleteConfiguration() {
  if (!store.selected) return;
  await ElMessageBox.confirm(
    `将永久删除未生效配置“${store.selected.name}”，删除后无法恢复。`,
    "删除冗余配置",
    {
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      type: "error",
      autofocus: false,
    },
  );
  await store.runMutation(() =>
    runtime.api.remove(store.selected!.redundancyId, store.selected!.revision),
  );
  ElMessage.success("冗余配置已删除");
}

async function executeOperation(operation: () => Promise<OperationTask>) {
  try {
    const task = await store.runMutation(operation);
    taskDetail.value = task;
    taskDrawerOpen.value = true;
    ElMessage.success("操作任务已创建");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "操作失败");
  }
}

async function openTask(task: OperationTask) {
  if (!store.selected) return;
  try {
    taskDetail.value = await runtime.api.task(
      store.selected.redundancyId,
      task.taskId,
    );
    taskDrawerOpen.value = true;
  } catch (error) {
    ElMessage.error(
      error instanceof Error ? error.message : "任务详情加载失败",
    );
  }
}
</script>

<template>
  <main class="redundancy-module redundancy-management">
    <header class="page-heading">
      <div>
        <h1>节点冗余管理</h1>
        <p>配置双节点冷备、查看当前异常并执行人工切换</p>
      </div>
      <el-button :icon="Refresh" :loading="store.refreshing" @click="refresh"
        >刷新</el-button
      >
    </header>

    <el-alert
      v-if="!store.accessDenied && store.socketState === 'RECONNECTING'"
      class="connection-alert"
      title="实时连接中断，正在自动重连；当前数据可手动刷新。"
      type="warning"
      show-icon
      :closable="false"
    />
    <el-alert
      v-if="!store.accessDenied && store.errorMessage"
      class="connection-alert"
      :title="store.errorMessage"
      type="error"
      show-icon
      :closable="false"
    />

    <el-result
      v-if="store.accessDenied"
      icon="warning"
      title="无权查看节点冗余"
      sub-title="当前账号缺少冗余查看权限，请联系管理员授权。"
    />

    <section v-if="!store.accessDenied" class="redundancy-panel list-panel">
      <div class="toolbar">
        <div class="toolbar__actions">
          <el-button
            type="primary"
            :icon="Plus"
            :disabled="!canMaintain || store.mutationPending"
            @click="createConfiguration"
            >添加</el-button
          >
          <el-button
            :icon="Edit"
            :disabled="
              !canMaintain ||
              store.mutationPending ||
              !selectedActions.has('EDIT')
            "
            @click="editConfiguration"
            >编辑</el-button
          >
          <el-button
            type="primary"
            plain
            :icon="CircleCheck"
            :disabled="
              !canMaintain ||
              store.mutationPending ||
              !selectedActions.has('ENABLE')
            "
            @click="enableConfiguration"
            >生效</el-button
          >
          <el-button
            type="danger"
            plain
            :icon="SwitchButton"
            :disabled="
              !canMaintain ||
              store.mutationPending ||
              !selectedActions.has('DISABLE')
            "
            @click="disableConfiguration"
            >停用</el-button
          >
          <el-button
            :icon="SetUp"
            :disabled="
              !canMaintain ||
              store.mutationPending ||
              !selectedActions.has('UPDATE_APPS')
            "
            @click="appDialogOpen = true"
            >修改 APP</el-button
          >
          <el-button
            :icon="SwitchButton"
            :disabled="
              !canMaintain ||
              store.mutationPending ||
              !selectedActions.has('SWITCH')
            "
            @click="switchDialogOpen = true"
            >切换</el-button
          >
          <el-button
            type="danger"
            :icon="Delete"
            :disabled="
              !canMaintain ||
              store.mutationPending ||
              !selectedActions.has('DELETE')
            "
            @click="deleteConfiguration"
            >删除</el-button
          >
        </div>
        <el-input
          v-model="query"
          clearable
          class="toolbar__search"
          placeholder="请输入冗余名称或节点 IP"
          aria-label="搜索冗余配置"
        />
      </div>

      <el-table
        v-loading="store.loading"
        :data="pagedConfigurations"
        row-key="redundancyId"
        highlight-current-row
        height="286"
        empty-text="暂无冗余配置"
        @row-click="selectRow"
      >
        <el-table-column
          label="冗余名称"
          prop="name"
          min-width="150"
          show-overflow-tooltip
        />
        <el-table-column label="主节点" min-width="150"
          ><template #default="scope"
            ><span>{{
              scope.row.primaryNode.nodeIp || scope.row.primaryNode.nodeName
            }}</span></template
          ></el-table-column
        >
        <el-table-column label="从节点" min-width="150"
          ><template #default="scope"
            ><span>{{
              scope.row.standbyNode.nodeIp || scope.row.standbyNode.nodeName
            }}</span></template
          ></el-table-column
        >
        <el-table-column label="当前激活" width="120"
          ><template #default="scope"
            ><el-tag
              v-if="scope.row.activeNodeId"
              size="small"
              effect="plain"
              >{{
                scope.row.activeNodeId === scope.row.primaryNodeId
                  ? "主节点"
                  : "从节点"
              }}</el-tag
            ><span v-else>—</span></template
          ></el-table-column
        >
        <el-table-column label="主节点 APP" width="116" align="center"
          ><template #default="scope">{{
            scope.row.primaryAppSummary.total
          }}</template></el-table-column
        >
        <el-table-column label="从节点 APP" width="116" align="center"
          ><template #default="scope">{{
            scope.row.standbyAppSummary.total
          }}</template></el-table-column
        >
        <el-table-column label="冗余状态" width="110"
          ><template #default="scope"
            ><RedundancyStatusTag :status="scope.row.healthStatus" /></template
        ></el-table-column>
        <el-table-column label="最近切换" width="178"
          ><template #default="scope">{{
            formatDateTime(scope.row.lastSwitchAt)
          }}</template></el-table-column
        >
        <el-table-column label="操作" width="110" fixed="right"
          ><template #default="scope"
            ><el-button link type="primary" @click.stop="selectRow(scope.row)"
              >查看</el-button
            ><el-button
              v-if="scope.row.currentTask"
              link
              type="primary"
              @click.stop="openTask(scope.row.currentTask)"
              >任务</el-button
            ></template
          ></el-table-column
        >
      </el-table>
      <footer class="table-footer">
        <span>共 {{ filteredConfigurations.length }} 条</span>
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          background
          layout="sizes, prev, pager, next, jumper"
          :page-sizes="[10, 20, 50]"
          :total="filteredConfigurations.length"
        />
      </footer>
    </section>

    <section v-if="!store.accessDenied" class="redundancy-panel detail-panel">
      <header class="detail-panel__heading">
        <h2 class="redundancy-section-title">冗余配置详情</h2>
        <span v-if="store.detail" class="redundancy-muted"
          >Revision {{ store.detail.revision }}</span
        >
      </header>
      <div v-if="store.detail" class="detail-layout">
        <aside class="basic-info">
          <h3>基本信息</h3>
          <dl>
            <dt>冗余名称</dt>
            <dd>{{ store.detail.name }}</dd>
            <dt>冗余状态</dt>
            <dd><RedundancyStatusTag :status="store.detail.healthStatus" /></dd>
            <dt>当前激活</dt>
            <dd>
              {{
                store.detail.activeNodeId
                  ? store.detail.activeNodeId === store.detail.primaryNodeId
                    ? "主节点"
                    : "从节点"
                  : "未激活"
              }}
            </dd>
            <dt>冗余模式</dt>
            <dd>人工冷切</dd>
            <dt>生效时间</dt>
            <dd>{{ formatDateTime(store.detail.updatedAt) }}</dd>
          </dl>
        </aside>
        <div class="node-details">
          <div class="node-details__grid">
            <NodeAppPanel
              title="主节点"
              :node="store.detail.nodes.primary"
              :expected-active="
                store.detail.activeNodeId === store.detail.primaryNodeId
              "
            />
            <NodeAppPanel
              title="从节点"
              :node="store.detail.nodes.standby"
              :expected-active="
                store.detail.activeNodeId === store.detail.standbyNodeId
              "
            />
          </div>
          <div
            v-if="store.detail.healthReasons.length"
            class="current-abnormal"
          >
            <span aria-hidden="true"></span><strong>当前异常：</strong>
            <p>
              {{
                store.detail.healthReasons
                  .map((reason) => reason.summary)
                  .join("；")
              }}
            </p>
            <el-button
              link
              type="primary"
              @click="router.push('/redundancy/events')"
              >查看详情</el-button
            >
          </div>
          <div v-else class="current-normal">
            <span aria-hidden="true"></span>当前无异常
          </div>
        </div>
      </div>
      <div v-else class="redundancy-empty">请在上方列表中选择一套冗余配置</div>
    </section>

    <ConfigDialog
      v-model="configDialogOpen"
      :configuration="editingConfiguration"
      @saved="store.loadList({ preserveSelection: true })"
    />
    <AppManagerDialog
      v-model="appDialogOpen"
      :configuration="store.detail"
      @saved="store.loadList({ preserveSelection: true })"
    />
    <SwitchDialog
      v-model="switchDialogOpen"
      :configuration="store.detail"
      @switched="store.loadList({ preserveSelection: true })"
    />
    <OperationTaskDrawer v-model="taskDrawerOpen" :task="taskDetail" />
  </main>
</template>

<style scoped>
.redundancy-management {
  display: grid;
  gap: 14px;
  padding: 18px 20px 22px;
}
.page-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.page-heading h1 {
  margin: 0;
  font-size: 20px;
}
.page-heading p {
  margin: 5px 0 0;
  color: var(--kf-text-secondary);
  font-size: 13px;
}
.connection-alert {
  margin-bottom: 0;
}
.list-panel {
  padding: 14px 16px 8px;
  overflow: hidden;
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 13px;
}
.toolbar__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.toolbar__actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.toolbar__search {
  width: 310px;
  flex: 0 0 auto;
}
.table-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 9px 2px 2px;
  color: #4b5563;
  font-size: 13px;
}
@media (max-width: 900px) {
  .table-footer {
    align-items: flex-start;
    flex-direction: column;
  }
}
.detail-panel {
  padding: 14px 16px 16px;
}
.detail-panel__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 13px;
}
.detail-layout {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 16px;
}
.basic-info {
  padding: 14px 16px;
  border: 1px solid #cfdaf0;
  border-radius: 8px;
}
.basic-info h3 {
  margin: 0 0 14px;
  font-size: 14px;
}
.basic-info dl {
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr);
  gap: 13px 8px;
  margin: 0;
}
.basic-info dt {
  color: var(--kf-text-secondary);
}
.basic-info dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}
.node-details {
  min-width: 0;
}
.node-details__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.current-abnormal,
.current-normal {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 11px;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 13px;
}
.current-abnormal {
  background: #fff0ef;
  color: #b42318;
}
.current-normal {
  background: #edf9f1;
  color: #237a3d;
}
.current-abnormal > span,
.current-normal > span {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: currentColor;
}
.current-abnormal p {
  min-width: 0;
  flex: 1;
  margin: 0;
}
@media (max-width: 1180px) {
  .toolbar {
    align-items: flex-start;
    flex-direction: column;
  }
  .toolbar__search {
    width: min(100%, 420px);
  }
  .detail-layout {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 820px) {
  .redundancy-management {
    padding: 12px;
  }
  .node-details__grid {
    grid-template-columns: 1fr;
  }
}
</style>
