<script setup lang="ts">
// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
// 运行状态条（T15 UI 层）：状态、用时、停止按钮。
// 停止请求后显示「正在停止…」，直到状态真的变成 CANCELLED/CANCELLING（不假装已完成）。
// end
import { computed, ref, watch } from "vue";
import type { WorkbenchRunStatus } from "./workbench-types";

const props = defineProps<{
  status: WorkbenchRunStatus;
  elapsedLabel: string;
  queuedCount?: number;
}>();

const emit = defineEmits<{
  (e: "stop"): void;
}>();

const stopping = ref(false);

const label = computed(() => {
  switch (props.status) {
    case "QUEUED":
      return "排队中";
    case "RUNNING":
      return "运行中";
    case "WAITING_INPUT":
      return "等待输入";
    case "WAITING_APPROVAL":
      return "等待审批";
    case "SUCCEEDED":
      return "已完成";
    case "FAILED":
      return "失败";
    case "CANCELLED":
      return "已取消";
    default:
      return props.status;
  }
});

const toneClass = computed(() => {
  if (props.status === "RUNNING") return "is-running";
  if (props.status === "WAITING_INPUT" || props.status === "WAITING_APPROVAL" || props.status === "QUEUED") return "is-waiting";
  if (props.status === "SUCCEEDED") return "is-done";
  if (props.status === "FAILED") return "is-error";
  return "";
});

const canStop = computed(() => props.status === "RUNNING" || props.status === "QUEUED");

// 状态真的走到终态后，停止按钮回到常态，避免一直卡在「正在停止」。
watch(
  () => props.status,
  (next) => {
    if (next === "CANCELLED" || next === "SUCCEEDED" || next === "FAILED") stopping.value = false;
  },
);

function onStop(): void {
  if (stopping.value) return;
  stopping.value = true;
  emit("stop");
}
</script>

<template>
  <div class="wb-run-pill" data-testid="run-status-bar">
    <span class="wb-run-status" :class="toneClass" role="status" aria-live="polite">
      <span v-if="status === 'RUNNING' || status === 'QUEUED'" class="wb-spinner" aria-hidden="true" />
      {{ label }}
    </span>
    <span>{{ elapsedLabel }}</span>
    <span v-if="(queuedCount ?? 0) > 0">队列 {{ queuedCount }}</span>
    <button
      v-if="canStop"
      type="button"
      class="wb-btn is-secondary is-small"
      data-testid="run-stop"
      :disabled="stopping"
      @click="onStop"
    >
      {{ stopping ? "正在停止…" : "■ 停止" }}
    </button>
  </div>
</template>
