<script setup lang="ts">
// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
// 运行时间线（T15 UI 层）：默认折叠为一行摘要，展开显示真实步骤状态。
// 不渲染模型原始思维链，只展示可公开的步骤标题与简短依据。
// end
import { computed, ref } from "vue";
import type { TimelineStep } from "./workbench-types";

const props = withDefaults(defineProps<{
  steps: TimelineStep[];
  title: string;
  elapsedLabel: string;
  running?: boolean;
  defaultOpen?: boolean;
}>(), { running: false, defaultOpen: false });

const open = ref(props.defaultOpen);

const doneCount = computed(() => props.steps.filter((step) => step.state === "done").length);

function dotClass(state: TimelineStep["state"]): string {
  return `is-${state}`;
}

function dotText(state: TimelineStep["state"]): string {
  if (state === "done") return "✓";
  if (state === "warn" || state === "error") return "!";
  return "";
}

function tagClass(tag: TimelineStep["tags"][number]): string {
  return `is-${tag}`;
}

function tagText(tag: TimelineStep["tags"][number]): string {
  if (tag === "cache") return "缓存命中";
  if (tag === "repair") return "修复 ×1";
  return "第 2 次尝试";
}
</script>

<template>
  <section class="wb-timeline" :class="{ 'is-open': open }" data-testid="run-timeline" aria-label="运行过程">
    <button
      type="button"
      class="wb-timeline-head"
      data-testid="timeline-toggle"
      :aria-expanded="open"
      aria-controls="wb-timeline-body"
      @click="open = !open"
    >
      <span class="wb-chev" aria-hidden="true">▶</span>
      <span v-if="running" class="wb-spinner" aria-hidden="true" />
      <span class="wb-t-main">{{ title }}</span>
      <span class="wb-t-elapsed">
        <span>步骤 {{ doneCount }}/{{ steps.length }}</span>
        <span>{{ elapsedLabel }}</span>
      </span>
    </button>
    <div v-show="open" id="wb-timeline-body" class="wb-timeline-body">
      <div v-for="(step, index) in steps" :key="step.id" class="wb-step" :data-testid="`timeline-step-${step.id}`">
        <div class="wb-step-rail" aria-hidden="true">
          <span class="wb-step-dot" :class="dotClass(step.state)">{{ dotText(step.state) }}</span>
          <span v-if="index < steps.length - 1" class="wb-step-line" />
        </div>
        <div class="wb-step-body">
          <div class="wb-step-title">
            <b>{{ step.title }}</b>
            <span v-if="step.duration !== null" class="wb-step-dur">{{ step.duration }}</span>
            <span v-for="tag in step.tags" :key="tag" class="wb-tag" :class="tagClass(tag)">{{ tagText(tag) }}</span>
            <span v-if="step.state === 'run'" class="wb-tag">执行中…</span>
          </div>
          <div class="wb-step-detail">{{ step.detail }}</div>
        </div>
      </div>
    </div>
  </section>
</template>
