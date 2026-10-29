<script setup lang="ts">
import type { OperationTask } from "../types/redundancy";
import { formatDateTime } from "../utils/format";
import RedundancyStatusTag from "./RedundancyStatusTag.vue";

defineProps<{ modelValue: boolean; task: OperationTask | null }>();
const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();

const operationLabels: Record<string, string> = {
  ENABLE: "首次生效",
  DISABLE: "停用配置",
  SWITCH: "切换节点",
  APP_CHANGE: "修改 APP",
  RECONCILE: "角色收敛",
};
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    title="操作任务详情"
    size="520px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template v-if="task">
      <el-descriptions :column="1" border size="small">
        <el-descriptions-item label="操作类型">{{
          operationLabels[task.operationType] || task.operationType
        }}</el-descriptions-item>
        <el-descriptions-item label="任务状态"
          ><RedundancyStatusTag
            :status="task.status === 'RUNNING' ? 'RUNNING_TASK' : task.status"
        /></el-descriptions-item>
        <el-descriptions-item label="当前阶段">{{
          task.currentStage || "—"
        }}</el-descriptions-item>
        <el-descriptions-item label="开始时间">{{
          formatDateTime(task.startedAt || task.createdAt)
        }}</el-descriptions-item>
        <el-descriptions-item label="完成时间">{{
          formatDateTime(task.finishedAt)
        }}</el-descriptions-item>
      </el-descriptions>
      <h3>逐 APP 执行步骤</h3>
      <el-timeline v-if="task.appSteps?.length">
        <el-timeline-item
          v-for="step in task.appSteps"
          :key="step.stepId"
          :timestamp="formatDateTime(step.finishedAt || step.startedAt)"
          :type="
            step.status === 'SUCCEEDED'
              ? 'success'
              : step.status === 'FAILED'
                ? 'danger'
                : 'primary'
          "
        >
          <div class="task-step">
            <strong>{{ step.appName || step.appId }}</strong
            ><span>{{ step.action }}</span
            ><RedundancyStatusTag
              :status="step.status === 'RUNNING' ? 'RUNNING_TASK' : step.status"
            />
          </div>
          <p v-if="step.message">{{ step.message }}</p>
        </el-timeline-item>
      </el-timeline>
      <el-empty v-else description="暂无逐 APP 步骤" :image-size="72" />
    </template>
  </el-drawer>
</template>

<style scoped>
h3 {
  margin: 22px 0 16px;
  font-size: 15px;
}
.task-step {
  display: flex;
  align-items: center;
  gap: 9px;
}
.task-step span {
  color: var(--kf-text-secondary);
}
p {
  margin: 7px 0 0;
  color: var(--kf-danger);
  font-size: 13px;
}
</style>
