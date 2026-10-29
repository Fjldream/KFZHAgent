<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import type { RedundancyConfigDetail } from "../types/redundancy";
import { useRedundancyRuntime } from "../runtime";
import { createRequestId } from "../utils/format";

const props = defineProps<{
  modelValue: boolean;
  configuration: RedundancyConfigDetail | null;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  switched: [];
}>();
const runtime = useRedundancyRuntime();
const force = ref(false);
const reason = ref("");
const submitting = ref(false);
const source = computed(() => {
  if (!props.configuration) return null;
  return props.configuration.activeNodeId === props.configuration.primaryNodeId
    ? props.configuration.nodes.primary
    : props.configuration.nodes.standby;
});
const target = computed(() => {
  if (!props.configuration) return null;
  return props.configuration.activeNodeId === props.configuration.primaryNodeId
    ? props.configuration.nodes.standby
    : props.configuration.nodes.primary;
});
const sourceOffline = computed(() => source.value?.online === false);

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      force.value = sourceOffline.value;
      reason.value = "";
    }
  },
);

async function submit() {
  if (!props.configuration || !target.value) return;
  if (force.value && !reason.value.trim()) {
    ElMessage.error("强制切换必须填写原因");
    return;
  }
  submitting.value = true;
  try {
    await runtime.api.switchNode(props.configuration.redundancyId, {
      expectedRevision: props.configuration.revision,
      requestId: createRequestId(),
      targetNodeId: target.value.nodeId,
      force: force.value,
      reason: reason.value.trim() || undefined,
    });
    ElMessage.success("切换任务已创建");
    emit("update:modelValue", false);
    emit("switched");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "切换失败");
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="切换激活节点"
    width="620px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="switch-route">
      <div>
        <small>当前激活</small><strong>{{ source?.nodeName }}</strong
        ><span>{{ source?.nodeIp }}</span>
      </div>
      <div class="switch-route__arrow" aria-hidden="true">→</div>
      <div>
        <small>目标激活</small><strong>{{ target?.nodeName }}</strong
        ><span>{{ target?.nodeIp }}</span>
      </div>
    </div>
    <el-alert
      :title="
        sourceOffline
          ? '源节点离线，无法确认旧端 APP 已停止，强制切换可能产生双活风险。'
          : '系统将先停止当前激活节点全部受管 APP，再更新角色并启动目标节点 APP。'
      "
      :type="sourceOffline ? 'error' : 'warning'"
      show-icon
      :closable="false"
    />
    <div v-if="sourceOffline" class="force-fields">
      <el-checkbox v-model="force">我已了解双活风险，执行强制切换</el-checkbox>
      <el-input
        v-model="reason"
        type="textarea"
        :rows="3"
        resize="none"
        maxlength="200"
        show-word-limit
        placeholder="请填写强制切换原因"
      />
    </div>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button
        :type="sourceOffline ? 'danger' : 'primary'"
        :disabled="sourceOffline && !force"
        :loading="submitting"
        @click="submit"
      >
        {{ sourceOffline ? "强制切换" : "确认切换" }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.switch-route {
  display: grid;
  grid-template-columns: 1fr 48px 1fr;
  align-items: center;
  margin-bottom: 18px;
}
.switch-route > div:not(.switch-route__arrow) {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 14px;
  border: 1px solid var(--kf-border);
  border-radius: 8px;
  background: #f8faff;
}
.switch-route small,
.switch-route span {
  color: var(--kf-text-secondary);
}
.switch-route__arrow {
  text-align: center;
  color: var(--kf-primary);
  font-size: 24px;
}
.force-fields {
  display: grid;
  gap: 12px;
  margin-top: 16px;
}
</style>
