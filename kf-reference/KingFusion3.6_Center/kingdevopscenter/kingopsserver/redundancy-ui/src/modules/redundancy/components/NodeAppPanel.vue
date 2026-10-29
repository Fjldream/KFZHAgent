<script setup lang="ts">
import type { RedundancyNode } from "../types/redundancy";
import RedundancyStatusTag from "./RedundancyStatusTag.vue";

defineProps<{ title: string; node: RedundancyNode; expectedActive: boolean }>();
</script>

<template>
  <section class="node-panel" :class="{ 'node-panel--active': expectedActive }">
    <header class="node-panel__header">
      <div class="node-panel__identity">
        <span class="node-panel__title">{{ title }}</span>
        <strong>{{ node.nodeName || node.nodeId }}</strong>
        <span class="redundancy-muted">{{ node.nodeIp || node.nodeId }}</span>
      </div>
      <div class="node-panel__tags">
        <RedundancyStatusTag :status="node.online ? 'ONLINE' : 'OFFLINE'" />
        <RedundancyStatusTag :status="expectedActive ? 'ACTIVE' : 'INACTIVE'" />
      </div>
    </header>

    <div class="node-panel__summary">
      <span
        >配置 APP <strong>{{ node.apps.length }}</strong> 个</span
      >
      <span
        >运行
        <strong>{{ node.apps.filter((app) => app.running).length }}</strong>
        个</span
      >
      <span
        >停止
        <strong>{{ node.apps.filter((app) => !app.running).length }}</strong>
        个</span
      >
      <span
        >异常
        <strong class="danger">{{
          node.apps.filter(
            (app) =>
              !app.exists ||
              !app.deployed ||
              (expectedActive ? !app.running : app.running),
          ).length
        }}</strong>
        个</span
      >
    </div>

    <el-table
      :data="node.apps.slice(0, 4)"
      size="small"
      max-height="216"
      empty-text="未配置 APP"
    >
      <el-table-column
        prop="appName"
        label="APP 名称"
        min-width="160"
        show-overflow-tooltip
      />
      <el-table-column label="状态" width="92">
        <template #default="scope">
          <RedundancyStatusTag
            :status="
              !scope.row.exists || !scope.row.deployed
                ? 'OFFLINE'
                : scope.row.running
                  ? 'RUNNING'
                  : 'STOPPED'
            "
          />
        </template>
      </el-table-column>
    </el-table>
    <footer v-if="node.apps.length > 4" class="node-panel__footer">
      共 {{ node.apps.length }} 个 APP，完整列表请点击“修改 APP”
    </footer>
  </section>
</template>

<style scoped>
.node-panel {
  min-width: 0;
  padding: 14px 16px 10px;
  border: 1px solid var(--kf-border);
  border-radius: 8px;
  background: #fff;
}
.node-panel--active {
  border-color: #b9cdfd;
  background: #fbfdff;
}
.node-panel__header,
.node-panel__identity,
.node-panel__tags,
.node-panel__summary {
  display: flex;
  align-items: center;
}
.node-panel__header {
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.node-panel__identity {
  min-width: 0;
  gap: 10px;
}
.node-panel__title {
  color: #4b5565;
  font-weight: 600;
}
.node-panel__tags {
  gap: 6px;
}
.node-panel__summary {
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  color: #5b6473;
  font-size: 13px;
}
.danger {
  color: var(--kf-danger);
}
.node-panel__footer {
  padding: 9px 2px 0;
  color: var(--kf-primary);
  font-size: 13px;
}
@media (max-width: 920px) {
  .node-panel__summary {
    flex-wrap: wrap;
    justify-content: flex-start;
  }
}
</style>
