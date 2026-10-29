<script setup lang="ts">
// modified by jinlong.feng at 0901 冗余功能开发
import { computed, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import AppMembershipEditor from "./AppMembershipEditor.vue";
import { useRedundancyRuntime } from "../runtime";
import type { AppCandidate, RedundancyConfigDetail } from "../types/redundancy";
import {
  buildAppMembershipChanges,
  hasAppMembershipChanges,
} from "../utils/app-membership";
import { createRequestId } from "../utils/format";

type NodeSide = "primary" | "standby";

const props = defineProps<{
  modelValue: boolean;
  configuration: RedundancyConfigDetail | null;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  saved: [];
}>();
const runtime = useRedundancyRuntime();
const primaryCandidates = ref<AppCandidate[]>([]);
const standbyCandidates = ref<AppCandidate[]>([]);
const primarySelected = ref<string[]>([]);
const standbySelected = ref<string[]>([]);
const originalPrimary = ref<string[]>([]);
const originalStandby = ref<string[]>([]);
const activeSide = ref<NodeSide>("primary");
const editorRevision = ref(0);
const loading = ref(false);
const saving = ref(false);

const activeOriginalIds = computed(() =>
  activeSide.value === "primary"
    ? originalPrimary.value
    : originalStandby.value,
);
const activeSelectedIds = computed(() =>
  activeSide.value === "primary"
    ? primarySelected.value
    : standbySelected.value,
);
const activeAddedCount = computed(
  () =>
    activeSelectedIds.value.filter(
      (appId) => !activeOriginalIds.value.includes(appId),
    ).length,
);
const activeRemovedCount = computed(
  () =>
    activeOriginalIds.value.filter(
      (appId) => !activeSelectedIds.value.includes(appId),
    ).length,
);
const hasChanges = computed(
  () =>
    activeDiffCount(primarySelected.value, originalPrimary.value) > 0 ||
    activeDiffCount(standbySelected.value, originalStandby.value) > 0,
);

watch(
  () => props.modelValue,
  async (open) => {
    if (!open || !props.configuration) return;
    activeSide.value = "primary";
    loading.value = true;
    try {
      const [primary, standby] = await Promise.all([
        runtime.api.candidates(
          props.configuration.redundancyId,
          props.configuration.primaryNodeId,
        ),
        runtime.api.candidates(
          props.configuration.redundancyId,
          props.configuration.standbyNodeId,
        ),
      ]);
      primaryCandidates.value = primary;
      standbyCandidates.value = standby;
      originalPrimary.value = [...props.configuration.primaryAppIds];
      originalStandby.value = [...props.configuration.standbyAppIds];
      primarySelected.value = [...originalPrimary.value];
      standbySelected.value = [...originalStandby.value];
      editorRevision.value += 1;
    } catch (error) {
      ElMessage.error(
        error instanceof Error ? error.message : "APP 候选列表加载失败",
      );
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

/** 计算一个节点新增和移出 APP 的总数量。 */
function activeDiffCount(selected: string[], original: string[]): number {
  return (
    selected.filter((appId) => !original.includes(appId)).length +
    original.filter((appId) => !selected.includes(appId)).length
  );
}

/** 恢复弹窗打开时的主从节点 APP 配置。 */
function restoreOriginal(): void {
  primarySelected.value = [...originalPrimary.value];
  standbySelected.value = [...originalStandby.value];
  editorRevision.value += 1;
  ElMessage.info("已恢复打开弹窗时的 APP 配置");
}

/** 保存两侧最终 APP 列表，并由后端按差量更新运行状态。 */
async function save(): Promise<void> {
  if (!props.configuration) return;
  const changes = buildAppMembershipChanges(
    props.configuration,
    primarySelected.value,
    standbySelected.value,
  );
  if (!hasAppMembershipChanges(changes)) {
    ElMessage.info("APP 列表没有变化");
    return;
  }
  saving.value = true;
  try {
    await runtime.api.updateApps(props.configuration.redundancyId, {
      expectedRevision: props.configuration.revision,
      requestId: createRequestId(),
      changes,
    });
    ElMessage.success("APP 列表已保存，正在按当前角色更新运行状态");
    emit("update:modelValue", false);
    emit("saved");
  } catch (error) {
    ElMessage.error(
      error instanceof Error ? error.message : "APP 列表更新失败",
    );
  } finally {
    saving.value = false;
  }
}
// end
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    width="1440px"
    class="app-manager-dialog"
    body-class="app-manager-dialog__body"
    destroy-on-close
    align-center
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #header>
      <div class="dialog-heading">
        <h2>修改 APP 列表</h2>
        <p>{{ configuration?.name }}</p>
      </div>
    </template>

    <div v-loading="loading" class="manager-body">
      <div v-if="configuration" class="node-switcher" role="tablist">
        <button
          type="button"
          class="node-card"
          :class="{ active: activeSide === 'primary' }"
          role="tab"
          :aria-selected="activeSide === 'primary'"
          @click="activeSide = 'primary'"
        >
          <span class="node-role">主节点</span>
          <strong>{{ configuration.nodes.primary.nodeName }}</strong>
          <span>{{ configuration.nodes.primary.nodeIp || "—" }}</span>
          <el-tag
            :type="configuration.nodes.primary.online ? 'success' : 'danger'"
            size="small"
            effect="plain"
          >
            {{ configuration.nodes.primary.online ? "在线" : "离线" }}
          </el-tag>
          <el-tag
            :type="
              configuration.activeNodeId === configuration.primaryNodeId
                ? 'primary'
                : 'info'
            "
            size="small"
            effect="plain"
          >
            {{
              configuration.activeNodeId === configuration.primaryNodeId
                ? "激活"
                : "失活"
            }}
          </el-tag>
          <small>已配置 {{ primarySelected.length }} 个</small>
        </button>
        <button
          type="button"
          class="node-card"
          :class="{ active: activeSide === 'standby' }"
          role="tab"
          :aria-selected="activeSide === 'standby'"
          @click="activeSide = 'standby'"
        >
          <span class="node-role">从节点</span>
          <strong>{{ configuration.nodes.standby.nodeName }}</strong>
          <span>{{ configuration.nodes.standby.nodeIp || "—" }}</span>
          <el-tag
            :type="configuration.nodes.standby.online ? 'success' : 'danger'"
            size="small"
            effect="plain"
          >
            {{ configuration.nodes.standby.online ? "在线" : "离线" }}
          </el-tag>
          <el-tag
            :type="
              configuration.activeNodeId === configuration.standbyNodeId
                ? 'primary'
                : 'info'
            "
            size="small"
            effect="plain"
          >
            {{
              configuration.activeNodeId === configuration.standbyNodeId
                ? "激活"
                : "失活"
            }}
          </el-tag>
          <small>已配置 {{ standbySelected.length }} 个</small>
        </button>
      </div>

      <AppMembershipEditor
        v-if="activeSide === 'primary'"
        :key="`primary-${editorRevision}`"
        v-model="primarySelected"
        :apps="primaryCandidates"
        :original-app-ids="originalPrimary"
      />
      <AppMembershipEditor
        v-else
        :key="`standby-${editorRevision}`"
        v-model="standbySelected"
        :apps="standbyCandidates"
        :original-app-ids="originalStandby"
      />

      <div class="change-summary" aria-live="polite">
        <strong>变更汇总</strong>
        <span class="added">新增 {{ activeAddedCount }} 个</span>
        <span class="removed">移出 {{ activeRemovedCount }} 个</span>
        <span>配置后共 {{ activeSelectedIds.length }} 个</span>
        <small
          >当前显示{{ activeSide === "primary" ? "主节点" : "从节点" }}</small
        >
      </div>
    </div>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button :disabled="loading || !hasChanges" @click="restoreOriginal"
        >恢复原配置</el-button
      >
      <el-button
        type="primary"
        :disabled="loading || !hasChanges"
        :loading="saving"
        @click="save"
        >保存并更新</el-button
      >
    </template>
  </el-dialog>
</template>

<style scoped>
/* // modified by jinlong.feng at 0901 冗余功能开发 */
:global(.app-manager-dialog) {
  display: flex;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 24px);
  margin: 12px auto;
  flex-direction: column;
}
:global(.app-manager-dialog .el-dialog__body) {
  display: flex;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}
.dialog-heading h2 {
  margin: 0;
  color: var(--kf-text-primary);
  font-size: 18px;
}
.dialog-heading p {
  margin: 4px 0 0;
  color: var(--kf-text-secondary);
  font-size: 13px;
}
.manager-body {
  display: flex;
  width: 100%;
  height: min(570px, calc(100vh - 170px));
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}
.node-switcher {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
  margin-bottom: 10px;
}
.node-card {
  display: grid;
  grid-template-columns: auto auto minmax(100px, 1fr) auto auto;
  align-items: center;
  min-height: 64px;
  padding: 10px 16px;
  border: 1px solid var(--kf-border);
  border-radius: 7px;
  background: #fff;
  color: #465064;
  cursor: pointer;
  gap: 10px;
  text-align: left;
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    background 0.16s ease;
}
.node-card:hover {
  border-color: #9eb9f5;
  background: #fbfcff;
}
.node-card:focus-visible {
  outline: 2px solid var(--kf-primary);
  outline-offset: 2px;
}
.node-card.active {
  border-color: var(--kf-primary);
  box-shadow: inset 0 0 0 1px var(--kf-primary);
  background: #fbfdff;
}
.node-card strong {
  color: var(--kf-text-primary);
  font-size: 14px;
}
.node-card small {
  grid-column: 1 / -1;
  color: var(--kf-text-secondary);
  font-size: 12px;
}
.node-role {
  color: var(--kf-text-primary);
  font-weight: 600;
}
.change-summary {
  display: flex;
  align-items: center;
  min-height: 38px;
  margin-top: 10px;
  padding: 0 12px;
  border: 1px solid var(--kf-border);
  border-radius: 6px;
  color: #4b5565;
  gap: 18px;
  font-size: 13px;
}
.change-summary strong {
  padding-right: 18px;
  border-right: 1px solid var(--kf-border);
}
.change-summary .added {
  color: var(--kf-success);
}
.change-summary .removed {
  color: var(--kf-danger);
}
.change-summary small {
  margin-left: auto;
  color: var(--kf-text-secondary);
}
@media (max-width: 980px) {
  .manager-body {
    height: calc(100vh - 180px);
  }
  .node-switcher {
    grid-template-columns: 1fr;
  }
}
/* // end */
</style>
