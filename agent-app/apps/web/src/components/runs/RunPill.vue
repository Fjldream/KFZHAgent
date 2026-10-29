<!-- modified by jinlong.feng at 2026-10-20 Agent工作台迭代 -->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { RunStatusLike } from "../../runs-api.js";

const props = withDefaults(defineProps<{
  status: RunStatusLike | null;
  elapsedSeconds?: number;
  cancelable?: boolean;
}>(), { elapsedSeconds: 0, cancelable: true });

const emit = defineEmits<{ stop: [] }>();

/** 活跃态才显示胶囊；终态由「已完成/失败」胶囊（RunStatusCapsule）接管。 */
const active = computed(() =>
  props.status !== null && ["QUEUED", "RUNNING", "BUILDING", "CANCEL_REQUESTED"].includes(props.status));

const BUSY_TEXT: Partial<Record<RunStatusLike, string>> = {
  QUEUED: "排队中", RUNNING: "RUNNING", BUILDING: "构建中",
  CANCEL_REQUESTED: "正在停止",
};
const text = computed(() => (props.status === null ? "" : BUSY_TEXT[props.status] ?? ""));

// 没有外部计时时本地走秒；有外部值（事件推导）则以外部为准。
const localSeconds = ref(0);
let timer: ReturnType<typeof setInterval> | undefined;
watch(active, (on) => {
  if (on && props.elapsedSeconds === 0) {
    timer = setInterval(() => { localSeconds.value += 1; }, 1_000);
  } else if (timer !== undefined) {
    clearInterval(timer);
    timer = undefined;
  }
}, { immediate: true });
onBeforeUnmount(() => { if (timer !== undefined) clearInterval(timer); });

const seconds = computed(() => (props.elapsedSeconds > 0 ? props.elapsedSeconds : localSeconds.value));
</script>

<template>
  <div v-if="active" class="run-pill">
    <span class="t-status"><span class="spinner" aria-hidden="true" />{{ text }}</span>
    <span class="elapsed">已用时 {{ seconds }} 秒</span>
    <button type="button" :disabled="!cancelable || status === 'CANCEL_REQUESTED'" :title="status === 'CANCEL_REQUESTED' ? '等待执行者在安全边界停止' : cancelable ? '停止当前任务' : '当前不能重复提交停止请求'" class="btn-stop" @click="emit('stop')">■ 停止</button>
  </div>
</template>


<!-- end -->
