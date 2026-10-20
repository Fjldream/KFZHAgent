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
  props.status !== null && ["QUEUED", "RUNNING", "BUILDING"].includes(props.status));

const BUSY_TEXT: Partial<Record<RunStatusLike, string>> = {
  QUEUED: "排队中", RUNNING: "RUNNING", BUILDING: "构建中",
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
    <button v-if="cancelable" type="button" class="btn-stop" @click="emit('stop')">■ 停止</button>
  </div>
</template>

<style scoped>
.run-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--fill-quaternary);
  font-size: 12px;
  color: var(--color-text-secondary);
}

.t-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--color-accent);
  font-weight: 600;
  font-family: var(--mono);
  font-size: 11px;
}

.spinner {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 1.5px solid var(--fill-tertiary);
  border-top-color: var(--color-accent);
  animation: spin 900ms linear infinite;
}

.elapsed { font-family: var(--mono); font-size: 11px; }

.btn-stop {
  border: 0;
  border-radius: 7px;
  background: var(--color-danger);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  cursor: pointer;
}

.btn-stop:active { transform: scale(0.97); }

@keyframes spin { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .spinner { animation: none; }
}
</style>
<!-- end -->
