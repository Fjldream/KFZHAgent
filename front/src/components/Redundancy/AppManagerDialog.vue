<script setup>
// modified by jinlong.feng at 0901 冗余功能开发
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import CustomStyleTable from "@/components/CustomStyleTable/CustomStyleTable.vue";
import { redundancyAPI } from "@/api/redundancyAPI.js";
// modified by jinlong.feng at 20260914 冗余功能-APP列表两侧同时提交
import {
  buildAppMembershipChanges,
  createAppSelectionDrafts,
  createRequestId,
  // modified by jinlong.feng at 2026-10-09 冗余APP列表每侧至少一个
  findEmptyAppSide,
  // end modified by jinlong.feng at 2026-10-09 冗余APP列表每侧至少一个
  getProjectTypeText,
  isAppRunning,
} from "@/utils/redundancyUtils.js";
// end modified by jinlong.feng at 20260914 冗余功能-APP列表两侧同时提交
import { showRedundancyMessage } from "@/utils/redundancyMessage.js";
import { useOpsResourceStore } from "@/stores/opsResourceStore.js";

const props = defineProps({ configuration: { type: Object, default: null } });
const visible = defineModel("visible", { type: Boolean, default: false });
const emit = defineEmits(["saved"]);
const { t } = useI18n();
const resourceStore = useOpsResourceStore();
const activeSide = ref("primary");
// modified by jinlong.feng at 20260914 冗余功能-APP列表两侧同时提交
const selectedIdsBySide = ref(createAppSelectionDrafts(props.configuration));
const selectedIds = computed(
  () => selectedIdsBySide.value[activeSide.value] || [],
);
// end modified by jinlong.feng at 20260914 冗余功能-APP列表两侧同时提交
const keyword = ref("");
const saving = ref(false);
const nodeId = computed(
  () => props.configuration?.[`${activeSide.value}NodeId`] || "",
);
const originalIds = computed(
  () => props.configuration?.[`${activeSide.value}AppIds`] || [],
);
const node = computed(() =>
  resourceStore.nodeResourceData.find((item) => item.nodeId === nodeId.value),
);
const candidates = computed(() =>
  (node.value?.apps || []).filter(
    (app) =>
      !keyword.value ||
      app.appName?.toLowerCase().includes(keyword.value.toLowerCase()),
  ),
);
const configured = computed(() =>
  (node.value?.apps || []).filter((app) =>
    selectedIds.value.includes(app.appId),
  ),
);
const added = computed(() =>
  selectedIds.value.filter((id) => !originalIds.value.includes(id)),
);
const removed = computed(() =>
  originalIds.value.filter((id) => !selectedIds.value.includes(id)),
);
// modified by jinlong.feng at 20260914 冗余功能-APP列表两侧同时提交
const pendingChanges = computed(() =>
  buildAppMembershipChanges(props.configuration, selectedIdsBySide.value),
);
// end modified by jinlong.feng at 20260914 冗余功能-APP列表两侧同时提交

// modified by jinlong.feng at 2026-10-09 冗余APP列表每侧至少一个
/** 主、从两侧中第一侧被清空的页签；两侧都非空时为 null。 */
const emptyAppSide = computed(() => findEmptyAppSide(selectedIdsBySide.value));
// end modified by jinlong.feng at 2026-10-09 冗余APP列表每侧至少一个

// modified by jinlong.feng at 20260914 冗余功能-APP列表两侧同时提交
watch(
  visible,
  (isVisible) => {
    if (isVisible) {
      selectedIdsBySide.value = createAppSelectionDrafts(
        props.configuration,
      );
    }
  },
  { immediate: true },
);
function setIncluded(appId, included) {
  const nextIds = included
    ? [...new Set([...selectedIds.value, appId])]
    : selectedIds.value.filter((id) => id !== appId);
  selectedIdsBySide.value = {
    ...selectedIdsBySide.value,
    [activeSide.value]: nextIds,
  };
}
// end modified by jinlong.feng at 20260914 冗余功能-APP列表两侧同时提交

// modified by jinlong.feng at 20260914 冗余功能-APP列表两侧同时提交
/** 一次保存主、从节点全部 APP 成员变化。 */
async function save() {
  // modified by jinlong.feng at 2026-10-09 冗余APP列表每侧至少一个
  // 主、从两侧都必须至少保留一个 APP；后端同样校验，这里只是提前给出提示。
  if (emptyAppSide.value) {
    showRedundancyMessage("warning", t("redundancy.validation.apps"));
    return;
  }
  // end modified by jinlong.feng at 2026-10-09 冗余APP列表每侧至少一个
  saving.value = true;
  try {
    await redundancyAPI.updateApps(props.configuration.redundancyId, {
      expectedRevision: props.configuration.revision,
      requestId: createRequestId(),
      changes: pendingChanges.value,
    });
    showRedundancyMessage("success", t("redundancy.messages.appsUpdated"));
    visible.value = false;
    emit("saved");
  } finally {
    saving.value = false;
  }
}
// end modified by jinlong.feng at 20260914 冗余功能-APP列表两侧同时提交
// end
</script>

<!-- modified by jinlong.feng at 0901 冗余功能开发 -->
<template>
  <el-dialog
    v-model="visible"
    :title="t('redundancy.modifyApps')"
    width="min(1260px, calc(100vw - 32px))"
    class="app-manager-dialog"
    destroy-on-close
  >
    <div class="node-tabs">
      <button
        v-for="side in ['primary', 'standby']"
        :key="side"
        :class="{ active: activeSide === side }"
        @click="activeSide = side"
      >
        <strong>{{
          side === "primary"
            ? t("redundancy.primaryNode")
            : t("redundancy.standbyNode")
        }}</strong
        ><span>{{
          configuration?.[`${side}Node`]?.nodeName ||
          configuration?.[`${side}NodeId`]
        }}</span
        ><small>{{
          t("redundancy.configuredApps", {
            count: configuration?.[`${side}AppIds`]?.length || 0,
          })
        }}</small>
      </button>
    </div>
    <div class="membership-grid">
      <section>
        <h3>
          {{ t("redundancy.allNodeApps") }}
          <small>{{ candidates.length }}</small>
        </h3>
        <el-input
          v-model="keyword"
          clearable
          :placeholder="t('redundancy.searchApps')"
        />
        <CustomStyleTable
          :table-data="candidates"
          row-key="appId"
          :show-pagination="false"
          max-height="380px"
          :show-highlight="false"
          table-class="redundancy-centered-table"
        >
          <el-table-column width="48"
            ><template #default="{ row }"
              ><el-checkbox
                :model-value="selectedIds.includes(row.appId)"
                @click.stop
                @change="setIncluded(row.appId, $event)" /></template
          ></el-table-column>
          <el-table-column
            prop="appName"
            :label="t('redundancy.appName')"
            min-width="150"
            show-overflow-tooltip
          />
          <el-table-column
            prop="projectType"
            :label="t('projectType')"
            min-width="110"
          >
            <template #default="{ row }">
              {{ getProjectTypeText(row.projectType, t) }}
            </template>
          </el-table-column>
          <el-table-column
            prop="port"
            :label="t('port')"
            width="80"
          /><el-table-column :label="t('status')" width="90"
            ><template #default="{ row }"
              ><span :class="isAppRunning(row) ? 'green' : 'muted'"
                >●
                {{
                  isAppRunning(row)
                    ? t("redundancy.enums.RUNNING")
                    : t("redundancy.enums.STOPPED")
                }}</span
              ></template
            ></el-table-column
          >
        </CustomStyleTable>
      </section>
      <div class="direction">→<br />←</div>
      <section>
        <h3>
          {{ t("redundancy.includedApps") }}
          <small>{{ configured.length }}</small>
        </h3>
        <div class="search-spacer" />
        <CustomStyleTable
          :table-data="configured"
          row-key="appId"
          :show-pagination="false"
          max-height="380px"
          :show-highlight="false"
          table-class="redundancy-centered-table"
        >
          <el-table-column
            prop="appName"
            :label="t('redundancy.appName')"
            min-width="170"
            show-overflow-tooltip
          />
          <el-table-column
            prop="projectType"
            :label="t('projectType')"
            min-width="110"
          >
            <template #default="{ row }">
              {{ getProjectTypeText(row.projectType, t) }}
            </template>
          </el-table-column>
          <el-table-column
            prop="port"
            :label="t('port')"
            width="80"
          /><el-table-column :label="t('operation')" width="90"
            ><template #default="{ row }"
              ><el-button
                link
                type="primary"
                @click.stop="setIncluded(row.appId, false)"
                >{{ t("redundancy.remove") }}</el-button
              ></template
            ></el-table-column
          >
        </CustomStyleTable>
      </section>
    </div>
    <div class="change-summary">
      {{ t("redundancy.changeSummary") }}　<span class="green">{{
        t("redundancy.added", { count: added.length })
      }}</span
      >　<span class="red">{{
        t("redundancy.removed", { count: removed.length })
      }}</span
      >　{{ t("redundancy.afterConfigured", { count: selectedIds.length }) }}
    </div>
    <template #footer
      ><el-button @click="visible = false">{{ t("cancel") }}</el-button
      ><el-button
        type="primary"
        :loading="saving"
        :disabled="!pendingChanges.length"
        @click="save"
        >{{ t("redundancy.saveAndUpdate") }}</el-button
      ></template
    >
  </el-dialog>
</template>
<!-- end -->

<style scoped lang="scss">
/* modified by jinlong.feng at 0901 冗余功能开发 */
.node-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
  button {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 14px;
    align-items: center;
    padding: 13px 16px;
    border: 1px solid #dce3ef;
    border-radius: 6px;
    background: #fff;
    color: #556079;
    text-align: left;
    cursor: pointer;
    &.active {
      border-color: #315ce8;
      box-shadow: inset 0 -2px 0 #315ce8;
    }
    small {
      grid-column: 1 / -1;
    }
  }
}
.membership-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 54px minmax(0, 1fr);
  margin-top: 18px;
  section {
    min-width: 0;
    h3 {
      height: 32px;
      margin: 0;
      color: #4b566d;
      font-size: 15px;
    }
    .el-input,
    .search-spacer {
      height: 32px;
    }
    :deep(.table-container) {
      padding: 8px 0;
      border-radius: 0;
    }
  }
  .direction {
    align-self: center;
    text-align: center;
    color: #315ce8;
    font-size: 22px;
    line-height: 2.4;
  }
}
.change-summary {
  padding: 12px;
  border: 1px solid #e2e7f0;
  border-radius: 4px;
  color: #59647a;
}
.green {
  color: #31a75d;
}
.red {
  color: #ef4f4f;
}
.muted {
  color: #a5adba;
}
/* end */
</style>
