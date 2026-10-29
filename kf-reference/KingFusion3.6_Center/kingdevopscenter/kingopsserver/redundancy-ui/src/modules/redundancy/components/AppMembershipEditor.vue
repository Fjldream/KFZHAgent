<script setup lang="ts">
// modified by jinlong.feng at 0901 冗余功能开发
import { computed, ref, watch } from "vue";
import { Search } from "@element-plus/icons-vue";
import type { AppCandidate } from "../types/redundancy";

type StatusFilter = "ALL" | "RUNNING" | "STOPPED" | "OFFLINE";

const props = defineProps<{
  apps: AppCandidate[];
  modelValue: string[];
  originalAppIds: string[];
}>();
const emit = defineEmits<{
  "update:modelValue": [value: string[]];
}>();

const search = ref("");
const typeFilter = ref("ALL");
const statusFilter = ref<StatusFilter>("ALL");
const candidateChecks = ref<string[]>([]);
const managedChecks = ref<string[]>([]);

const selectedSet = computed(() => new Set(props.modelValue));
const originalSet = computed(() => new Set(props.originalAppIds));
const appTypes = computed(() =>
  [...new Set(props.apps.map((app) => app.appType).filter(Boolean))].sort(),
);
const filteredApps = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  return props.apps.filter((app) => {
    const matchesKeyword =
      !keyword ||
      [app.appName, app.appId, app.appType, app.port]
        .filter((value) => value !== undefined)
        .some((value) => String(value).toLowerCase().includes(keyword));
    const matchesType =
      typeFilter.value === "ALL" || app.appType === typeFilter.value;
    const matchesStatus =
      statusFilter.value === "ALL" || appStatusKey(app) === statusFilter.value;
    return matchesKeyword && matchesType && matchesStatus;
  });
});
const managedApps = computed(() =>
  props.modelValue
    .map((appId) => props.apps.find((app) => app.appId === appId))
    .filter((app): app is AppCandidate => Boolean(app)),
);
const addableChecks = computed(() =>
  candidateChecks.value.filter((appId) => !selectedSet.value.has(appId)),
);
const visibleAddableIds = computed(() =>
  filteredApps.value
    .filter((app) => !selectedSet.value.has(app.appId))
    .map((app) => app.appId),
);
const allVisibleAddableChecked = computed(
  () =>
    visibleAddableIds.value.length > 0 &&
    visibleAddableIds.value.every((appId) =>
      candidateChecks.value.includes(appId),
    ),
);

watch(
  () => props.modelValue,
  (selected) => {
    const selectedIds = new Set(selected);
    candidateChecks.value = candidateChecks.value.filter(
      (appId) => !selectedIds.has(appId),
    );
    managedChecks.value = managedChecks.value.filter((appId) =>
      selectedIds.has(appId),
    );
  },
);

/** 返回 APP 的标准运行状态，供筛选和状态标签共同使用。 */
function appStatusKey(app: AppCandidate): Exclude<StatusFilter, "ALL"> {
  if (!app.exists || !app.deployed) return "OFFLINE";
  return app.running ? "RUNNING" : "STOPPED";
}

/** 返回界面展示的中文运行状态。 */
function appStatusLabel(app: AppCandidate): string {
  return { RUNNING: "运行", STOPPED: "停止", OFFLINE: "离线" }[
    appStatusKey(app)
  ];
}

/** 选择或取消一条待加入 APP。 */
function toggleCandidate(appId: string, checked: boolean): void {
  const selected = new Set(candidateChecks.value);
  checked ? selected.add(appId) : selected.delete(appId);
  candidateChecks.value = [...selected];
}

/** 对当前筛选结果执行全选或取消全选。 */
function toggleVisibleCandidates(checked: boolean): void {
  const selected = new Set(candidateChecks.value);
  visibleAddableIds.value.forEach((appId) =>
    checked ? selected.add(appId) : selected.delete(appId),
  );
  candidateChecks.value = [...selected];
}

/** 将勾选的候选 APP 加入最终配置。 */
function addChecked(): void {
  if (!addableChecks.value.length) return;
  emit("update:modelValue", [
    ...props.modelValue,
    ...addableChecks.value.filter((appId) => !selectedSet.value.has(appId)),
  ]);
  candidateChecks.value = [];
}

/** 将右侧勾选 APP 从最终配置中移出。 */
function removeChecked(): void {
  if (!managedChecks.value.length) return;
  const removed = new Set(managedChecks.value);
  emit(
    "update:modelValue",
    props.modelValue.filter((appId) => !removed.has(appId)),
  );
  managedChecks.value = [];
}

/** 快速移出右侧单条 APP。 */
function removeOne(appId: string): void {
  emit(
    "update:modelValue",
    props.modelValue.filter((selectedId) => selectedId !== appId),
  );
}

/** 选择或取消一条待移出 APP，避免 Checkbox 直接绑定数组产生版本兼容问题。 */
function toggleManaged(appId: string, checked: boolean): void {
  const selected = new Set(managedChecks.value);
  checked ? selected.add(appId) : selected.delete(appId);
  managedChecks.value = [...selected];
}
// end
</script>

<template>
  <div class="membership-editor">
    <section class="transfer-panel candidate-panel">
      <header class="panel-title">
        <div>
          <strong>节点全部 APP</strong>
          <small>共 {{ apps.length }} 个</small>
        </div>
      </header>
      <div class="filter-bar">
        <el-input
          v-model="search"
          clearable
          :prefix-icon="Search"
          placeholder="搜索 APP 名称或 appId"
        />
        <el-select v-model="typeFilter" aria-label="工程类型筛选">
          <el-option label="全部工程类型" value="ALL" />
          <el-option
            v-for="type in appTypes"
            :key="type"
            :label="type"
            :value="type"
          />
        </el-select>
        <el-select v-model="statusFilter" aria-label="运行状态筛选">
          <el-option label="全部状态" value="ALL" />
          <el-option label="运行" value="RUNNING" />
          <el-option label="停止" value="STOPPED" />
          <el-option label="离线" value="OFFLINE" />
        </el-select>
      </div>
      <div class="table-frame" data-scroll-region="app-table">
        <table>
          <thead>
            <tr>
              <th class="check-cell">
                <el-checkbox
                  :model-value="allVisibleAddableChecked"
                  aria-label="全选当前可加入 APP"
                  @change="toggleVisibleCandidates(Boolean($event))"
                />
              </th>
              <th>APP 名称</th>
              <th>工程类型</th>
              <th>端口</th>
              <th>当前状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="app in filteredApps" :key="app.appId">
              <td class="check-cell">
                <el-checkbox
                  :model-value="
                    selectedSet.has(app.appId) ||
                    candidateChecks.includes(app.appId)
                  "
                  :disabled="selectedSet.has(app.appId)"
                  :aria-label="`选择 ${app.appName}`"
                  @change="toggleCandidate(app.appId, Boolean($event))"
                />
              </td>
              <td class="app-name" :title="app.appName">{{ app.appName }}</td>
              <td>{{ app.appType || "—" }}</td>
              <td>{{ app.port || "—" }}</td>
              <td>
                <span
                  class="status-text"
                  :class="appStatusKey(app).toLowerCase()"
                >
                  <i></i>{{ appStatusLabel(app) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!filteredApps.length" class="table-empty">
          暂无匹配的 APP
        </div>
      </div>
    </section>

    <div class="transfer-actions" aria-label="APP 加入和移出操作">
      <el-button
        type="primary"
        :disabled="!addableChecks.length"
        @click="addChecked"
      >
        加入 <span aria-hidden="true">›</span>
      </el-button>
      <el-button :disabled="!managedChecks.length" @click="removeChecked">
        <span aria-hidden="true">‹</span> 移出
      </el-button>
    </div>

    <section class="transfer-panel managed-panel">
      <header class="panel-title">
        <div>
          <strong>已纳入冗余 APP</strong>
          <small>（{{ managedApps.length }}）</small>
        </div>
      </header>
      <div class="table-frame managed-table" data-scroll-region="app-table">
        <table>
          <thead>
            <tr>
              <th class="check-cell"></th>
              <th>APP 名称</th>
              <th>工程类型</th>
              <th>端口</th>
              <th>当前状态</th>
              <th>变更</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="app in managedApps" :key="app.appId">
              <td class="check-cell">
                <el-checkbox
                  :model-value="managedChecks.includes(app.appId)"
                  :aria-label="`选择移出 ${app.appName}`"
                  @change="toggleManaged(app.appId, Boolean($event))"
                />
              </td>
              <td class="app-name" :title="app.appName">{{ app.appName }}</td>
              <td>{{ app.appType || "—" }}</td>
              <td>{{ app.port || "—" }}</td>
              <td>
                <span
                  class="status-text"
                  :class="appStatusKey(app).toLowerCase()"
                >
                  <i></i>{{ appStatusLabel(app) }}
                </span>
              </td>
              <td>
                <el-tag
                  v-if="!originalSet.has(app.appId)"
                  type="success"
                  size="small"
                  effect="plain"
                  >新增</el-tag
                >
                <span v-else>—</span>
              </td>
              <td>
                <el-button link type="primary" @click="removeOne(app.appId)"
                  >移出</el-button
                >
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!managedApps.length" class="table-empty">
          当前节点尚未配置 APP
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* // modified by jinlong.feng at 0901 冗余功能开发 */
.membership-editor {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 96px minmax(0, 1.08fr);
  min-height: 0;
  flex: 1;
  overflow: hidden;
}
.transfer-panel {
  display: flex;
  min-height: 0;
  min-width: 0;
  flex-direction: column;
}
.candidate-panel {
  padding-right: 14px;
  border-right: 1px solid var(--kf-border);
}
.managed-panel {
  padding-left: 14px;
  border-left: 1px solid var(--kf-border);
}
.panel-title {
  display: flex;
  align-items: center;
  min-height: 38px;
}
.panel-title > div {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.panel-title strong {
  color: var(--kf-text-primary);
  font-size: 15px;
}
.panel-title small {
  color: var(--kf-text-secondary);
  font-size: 12px;
}
.filter-bar {
  display: grid;
  grid-template-columns: minmax(180px, 1.5fr) minmax(120px, 0.9fr) 110px;
  gap: 10px;
  margin-bottom: 10px;
}
.table-frame {
  position: relative;
  min-height: 0;
  flex: 1;
  overflow: auto;
  border: 1px solid var(--kf-border);
  border-radius: 7px;
  scrollbar-gutter: stable;
}
table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 12px;
}
th,
td {
  height: 37px;
  padding: 0 7px;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}
th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f4f6fa;
  color: #657085;
  font-weight: 600;
}
td {
  border-top: 1px solid #edf0f5;
  color: #4b5565;
}
tbody tr:hover td {
  background: #f7faff;
}
.check-cell {
  width: 34px;
  text-align: center;
}
.app-name {
  color: #252b37;
  font-weight: 600;
}
.status-text {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.status-text i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #b7beca;
}
.status-text.running i {
  background: var(--kf-success);
}
.status-text.offline i {
  background: var(--kf-danger);
}
.table-empty {
  position: absolute;
  inset: 38px 0 0;
  display: grid;
  place-items: center;
  color: #98a2b3;
}
.transfer-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 12px;
  padding-top: 74px;
}
.transfer-actions :deep(.el-button) {
  width: 76px;
  margin-left: 0;
}
@media (max-width: 980px) {
  .membership-editor {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 1fr) auto minmax(0, 1fr);
    gap: 12px;
  }
  .candidate-panel,
  .managed-panel {
    padding: 0;
    border: 0;
  }
  .transfer-actions {
    flex-direction: row;
    padding: 0;
  }
}
/* // end */
</style>
