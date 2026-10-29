<script setup>
// modified by jinlong.feng at 0901 冗余功能开发
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import CustomStyleTable from "@/components/CustomStyleTable/CustomStyleTable.vue";
import {
  getProjectTypeText,
  isAppRunning,
} from "@/utils/redundancyUtils.js";

const props = defineProps({
  node: { type: Object, required: true },
  activeNodeId: { type: String, default: "" },
  side: {
    type: String,
    default: "primary",
    validator: (value) => ["primary", "standby"].includes(value),
  },
});
const { t } = useI18n();
const isActive = computed(() => props.node.nodeId === props.activeNodeId);
const runningCount = computed(
  () => props.node.apps?.filter(isAppRunning).length || 0,
);

/** 激活节点的未运行 APP 使用异常行样式，失活节点停止属于正常冷备状态。 */
function appRowClassName({ row }) {
  return isActive.value && !isAppRunning(row) ? "active-abnormal-row" : "";
}
// end
</script>

<!-- modified by jinlong.feng at 0901 冗余功能开发 -->
<template>
  <section class="node-panel" :class="{ active: isActive }">
    <header>
      <div class="node-identity">
        <strong>{{
          side === "primary"
            ? t("redundancy.primaryNode")
            : t("redundancy.standbyNode")
        }}</strong>
        <span>{{ node.nodeName }}</span>
        <i />
        <span>{{ node.nodeIp || "—" }}</span>
        <el-tag size="small" :type="node.online ? 'success' : 'danger'" round>
          {{ node.online ? t("online") : t("offline") }}
        </el-tag>
        <el-tag size="small" :type="isActive ? 'primary' : 'info'" round>
          {{
            isActive
              ? t("redundancy.enums.ACTIVE")
              : t("redundancy.enums.INACTIVE")
          }}
        </el-tag>
      </div>
      <div class="summary">
        <span>{{
          t("redundancy.configuredApps", { count: node.apps?.length || 0 })
        }}</span>
        <i />
        <span>{{ t("redundancy.runningApps", { count: runningCount }) }}</span>
        <i />
        <span>{{
          t("redundancy.stoppedApps", {
            count: (node.apps?.length || 0) - runningCount,
          })
        }}</span>
      </div>
    </header>
    <CustomStyleTable
      :table-data="node.apps || []"
      row-key="appId"
      :show-pagination="false"
      max-height="calc(100% - 44px)"
      :show-highlight="false"
      :stripe-flag="false"
      :cal-row-class-name="appRowClassName"
      table-class="redundancy-centered-table"
    >
      <el-table-column
        prop="appName"
        :label="t('redundancy.appName')"
        min-width="140"
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
      <el-table-column prop="port" :label="t('port')" width="86" />
      <el-table-column :label="t('status')" width="92">
        <template #default="{ row }">
          <span class="state"
            ><i
              :class="
                isAppRunning(row)
                  ? 'running'
                  : isActive
                    ? 'abnormal'
                    : 'stopped'
              "
            />{{
              isAppRunning(row)
                ? t("redundancy.enums.RUNNING")
                : t("redundancy.enums.STOPPED")
            }}</span
          >
        </template>
      </el-table-column>
    </CustomStyleTable>
  </section>
</template>
<!-- end -->

<style scoped lang="scss">
/* modified by jinlong.feng at 0901 冗余功能开发 */
.node-panel {
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  border: 1px solid #dfe6f3;
  border-radius: 6px;
  padding: 0 14px 8px;
  background: #fff;
  overflow: hidden;
  &.active {
    position: relative;
    &::before {
      position: absolute;
      top: -1px;
      left: -1px;
      width: 116px;
      height: 3px;
      border-radius: 6px 0;
      background: #315ce8;
      content: "";
    }
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 44px;
    color: #46516a;
  }
  .node-identity,
  .summary {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 9px;
    white-space: nowrap;
    i {
      width: 1px;
      height: 14px;
      background: #dce4f1;
    }
  }
  .node-identity {
    overflow: hidden;
    > span {
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
  .summary {
    flex: 0 0 auto;
    gap: 10px;
    color: #5d677c;
    font-size: 13px;
  }
  :deep(.table-container) {
    flex: 1;
    min-height: 0;
    padding: 0;
    border-radius: 0;
  }
  :deep(.custom-header-row) {
    height: 34px;
  }
  :deep(.custom-row) {
    height: 34px;
  }
  :deep(.custom-row .el-table__cell) {
    padding: 0;
  }
  :deep(.active-abnormal-row) {
    --el-table-tr-bg-color: #fff5f5;
    --el-table-row-hover-bg-color: #fff0f0;
  }
  .state {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    i {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      &.running {
        background: #39ad65;
      }
      &.stopped {
        background: #b9c0cc;
      }
      &.abnormal {
        background: #eb4d4d;
      }
    }
  }
}
/* end */
</style>
