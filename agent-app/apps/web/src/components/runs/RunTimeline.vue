<!-- modified by jinlong.feng at 2026-10-20 Agent工作台迭代 -->
<script setup lang="ts">
import { computed, ref } from "vue";
import type { TimelineStep, TimelineStepStatus } from "./types.js";
const props = withDefaults(defineProps<{ steps: TimelineStep[]; title?: string; open?: boolean }>(), { title: "执行过程", open: true });
const expanded = ref(props.open);
const doneCount = computed(() => props.steps.filter(step => step.status === "done").length);
const dots: Record<TimelineStepStatus, { cls: string; text: string }> = {
  done: { cls: "done", text: "✓" }, running: { cls: "run", text: "" },
  failed: { cls: "warn", text: "!" }, pending: { cls: "pending", text: "" },
};
</script>
<template>
  <section class="timeline-card" :class="{ open: expanded }" data-task="T15">
    <button class="timeline-head" type="button" :aria-expanded="expanded" @click="expanded = !expanded">
      <span class="chev-t" aria-hidden="true">▶</span><span v-if="steps.some(step => step.status === 'running')" class="spinner" />
      <span class="t-main">{{ title }}</span><span class="t-elapsed"><span class="t-status">步骤 {{ doneCount }}/{{ steps.length }}</span></span>
    </button>
    <div v-if="expanded" class="timeline-body">
      <div v-for="step in steps" :key="step.stepKey" class="step">
        <div class="rail"><span class="dot" :class="dots[step.status].cls">{{ dots[step.status].text }}</span></div>
        <div class="s-body">
          <div class="s-title"><b>{{ step.label }}</b><span v-if="step.durationMs !== undefined" class="dur">{{ (step.durationMs / 1000).toFixed(1) }}s</span><span v-for="tag in step.tags ?? []" :key="tag.text" class="tag" :class="tag.tone">{{ tag.text }}</span></div>
          <div v-if="step.detail" class="s-detail">{{ step.detail }}</div>
        </div>
      </div>
    </div>
  </section>
</template>
<!-- end -->
