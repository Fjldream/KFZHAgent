<!-- modified by jinlong.feng at 2026-10-20 Agent工作台迭代 -->
<script setup lang="ts">
import { computed, ref } from "vue";

import type { TimelineStep } from "./types.js";

const props = withDefaults(defineProps<{
  steps: TimelineStep[];
  title?: string;
  open?: boolean;
}>(), { title: "执行过程", open: true });

const expanded = ref(props.open);
const doneCount = computed(() => props.steps.filter((step) => step.status === "done").length);

const DOT: Record<TimelineStepStatus, { cls: string; text: string }> = {
  done: { cls: "done", text: "✓" },
  running: { cls: "run", text: "" },
  failed: { cls: "warn", text: "!" },
  pending: { cls: "pending", text: "" },
};

const seconds = (ms: number | undefined): string =>
  ms === undefined ? "" : `${(ms / 1000).toFixed(1)}s`;
</script>

<template>
  <div class="timeline-card" :class="{ open: expanded }">
    <button class="timeline-head" type="button" :aria-expanded="expanded" @click="expanded = !expanded">
      <span class="chev" aria-hidden="true">▶</span>
      <span v-if="steps.some((step) => step.status === 'running')" class="mini-spinner" aria-hidden="true" />
      <span class="t-main">{{ title }}</span>
      <span class="t-meta">
        <span class="t-status">步骤 {{ doneCount }}/{{ steps.length }}</span>
      </span>
    </button>

    <div v-if="expanded" class="timeline-body">
      <div v-for="step in steps" :key="step.stepKey" class="step">
        <div class="rail">
          <span class="dot" :class="DOT[step.status].cls">{{ DOT[step.status].text }}</span>
        </div>
        <div class="s-body">
          <div class="s-title">
            <b>{{ step.label }}</b>
            <span v-if="step.durationMs !== undefined" class="dur">{{ seconds(step.durationMs) }}</span>
            <span v-for="tag in step.tags ?? []" :key="tag.text" class="tag" :class="tag.tone">{{ tag.text }}</span>
          </div>
          <div v-if="step.detail" class="s-detail">{{ step.detail }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline-card {
  border-radius: var(--radius-card);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-card);
  overflow: hidden;
}

.timeline-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 14px;
  background: none;
  border: 0;
  cursor: pointer;
  text-align: left;
  color: inherit;
}

.chev {
  font-size: 10px;
  color: var(--color-text-secondary);
  transition: transform 200ms var(--ease-out);
}

.timeline-card.open .chev { transform: rotate(90deg); }

.mini-spinner {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--fill-tertiary);
  border-top-color: var(--color-accent);
  animation: spin 900ms linear infinite;
}

.t-main { font-size: 13px; font-weight: 600; }

.t-meta {
  margin-left: auto;
  font-size: 11px;
  color: var(--color-text-secondary);
  font-family: var(--mono);
}

.timeline-body { padding: 4px 14px 12px; }

.step { display: flex; gap: 10px; padding: 6px 0; align-items: flex-start; font-size: 13px; }

.rail { display: flex; flex-direction: column; align-items: center; width: 16px; flex: none; padding-top: 2px; }

.dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  color: #fff;
  background: var(--fill-tertiary);
}

.dot.done { background: var(--color-success); }
.dot.warn { background: var(--color-warning); }
.dot.run { background: transparent; border: 2px solid var(--color-accent); }
.dot.run::after {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-accent);
  animation: pulse 1s infinite alternate;
}

.s-body { flex: 1; min-width: 0; }
.s-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.s-title b { font-weight: 600; }
.dur { font-size: 11px; color: var(--color-text-secondary); font-family: var(--mono); }
.s-detail { font-size: 12px; color: var(--color-text-secondary); margin-top: 2px; }

.tag { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 5px; }
.tag.cache { background: rgba(52, 199, 89, 0.12); color: #1e9e43; }
.tag.attempt { background: rgba(255, 159, 10, 0.14); color: #b26a00; }
.tag.repair { background: rgba(255, 59, 48, 0.1); color: #d70015; }

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes pulse { from { opacity: 0.3; } to { opacity: 1; } }

@media (prefers-reduced-motion: reduce) {
  .mini-spinner, .dot.run::after { animation: none; }
}
</style>
<!-- end -->
