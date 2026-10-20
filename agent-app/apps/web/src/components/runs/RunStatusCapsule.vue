<!-- modified by jinlong.feng at 2026-10-20 Agent工作台迭代 -->
<script setup lang="ts">
import { computed } from "vue";
import type { RunStatusLike } from "../../runs-api.js";

const props = defineProps<{ status: RunStatusLike }>();

/** 文案遵循 UI 设计：对话中 / 待确认 / 构建中 / 完成 / 失败。 */
const LABELS: Record<RunStatusLike, { text: string; tone: "idle" | "wait" | "busy" | "ok" | "danger" }> = {
  QUEUED: { text: "排队中", tone: "busy" },
  RUNNING: { text: "构建中", tone: "busy" },
  BUILDING: { text: "构建中", tone: "busy" },
  WAITING_INPUT: { text: "待补充", tone: "wait" },
  WAITING_APPROVAL: { text: "待确认", tone: "wait" },
  CANCEL_REQUESTED: { text: "取消中", tone: "wait" },
  SUCCEEDED: { text: "已完成", tone: "ok" },
  FAILED: { text: "失败", tone: "danger" },
  CANCELLED: { text: "已取消", tone: "idle" },
};

const view = computed(() => LABELS[props.status]);
</script>

<template>
  <span class="capsule" :data-tone="view.tone" role="status" :aria-label="view.text">
    <span class="dot" aria-hidden="true" />
    {{ view.text }}
  </span>
</template>

<style scoped>
.capsule {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 13px;
  letter-spacing: 0.01em;
  color: var(--color-text-secondary);
  background: color-mix(in srgb, var(--color-surface) 88%, transparent);
  border: 1px solid var(--color-border);
  transition: color 200ms cubic-bezier(0.32, 0.72, 0, 1), background 200ms cubic-bezier(0.32, 0.72, 0, 1);
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.capsule[data-tone="busy"] { color: var(--color-accent); }
.capsule[data-tone="busy"] .dot { animation: pulse 1.4s ease-in-out infinite; }
.capsule[data-tone="wait"] { color: #b26a00; }
.capsule[data-tone="ok"] { color: var(--color-success); }
.capsule[data-tone="danger"] { color: var(--color-danger); }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

@media (prefers-reduced-motion: reduce) {
  .capsule[data-tone="busy"] .dot { animation: none; }
}
</style>
<!-- end -->
