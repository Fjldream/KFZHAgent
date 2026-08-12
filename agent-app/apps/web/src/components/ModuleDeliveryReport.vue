<script setup lang="ts">
import { computed } from "vue";
import type { ModuleDeliveryResult } from "../types";

const props = defineProps<{ result: ModuleDeliveryResult }>();

const statusLabel = computed(() => {
  switch (props.result.status) {
    case "ready": return "可交付";
    case "ready_with_warnings": return "可交付，有提示";
    case "blocked": return "暂不可交付";
  }
});

const unresolved = computed(() => props.result.gaps.filter((gap) => gap.status === "unresolved"));
</script>

<template>
  <section class="delivery-report" data-testid="module-delivery-report">
    <header class="delivery-header">
      <div>
        <p class="eyebrow">工程交付结果</p>
        <h2 data-testid="delivery-status">{{ statusLabel }}</h2>
      </div>
      <span class="status-dot" :data-status="result.status" />
    </header>

    <p class="repair-count">自动修复 {{ result.repairCount }} 次</p>

    <section class="report-section">
      <h3>本次实现</h3>
      <ul class="module-list">
        <li v-for="module in result.implementedModules" :key="`${module.pageId}/${module.moduleId}`">
          <strong>{{ module.moduleId }}</strong>
          <span>{{ module.kind }}</span>
        </li>
      </ul>
    </section>

    <section v-if="unresolved.length > 0" class="report-section gaps" data-testid="unsupported-requirements">
      <h3>{{ result.status === "blocked" ? "需要解决" : "交付提示" }}</h3>
      <article v-for="gap in unresolved" :key="`${gap.moduleId}/${gap.requirement}`" class="gap">
        <strong>{{ gap.requirement }}</strong>
        <p>{{ gap.reason }}</p>
        <p v-if="gap.alternatives?.length" class="alternatives">可选方案：{{ gap.alternatives.join("；") }}</p>
      </article>
    </section>

    <section class="report-section revision-diff">
      <div>
        <h3>本次调整</h3>
        <p>{{ result.revisionDiff.changedModules.length > 0 ? result.revisionDiff.changedModules.join("、") : "无" }}</p>
      </div>
      <div>
        <h3>完整保留</h3>
        <p>{{ result.revisionDiff.preservedModules.length > 0 ? result.revisionDiff.preservedModules.join("、") : "无" }}</p>
      </div>
    </section>
  </section>
</template>

<style scoped>
.delivery-report { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-card); box-shadow: var(--shadow-card); padding: 1rem 1.1rem; }
.delivery-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
.eyebrow { margin: 0 0 0.15rem; color: var(--color-text-secondary); font-size: 0.72rem; }
h2 { margin: 0; font-size: 1rem; }
.status-dot { width: 0.7rem; height: 0.7rem; margin-top: 0.35rem; border-radius: 50%; background: var(--color-success); }
.status-dot[data-status="ready_with_warnings"] { background: #f59e0b; }
.status-dot[data-status="blocked"] { background: var(--color-danger); }
.repair-count { margin: 0.35rem 0 0; color: var(--color-text-secondary); font-size: 0.76rem; }
.report-section { margin-top: 0.85rem; padding-top: 0.75rem; border-top: 1px solid var(--color-border); }
.report-section h3 { margin: 0 0 0.4rem; font-size: 0.82rem; }
.module-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.35rem; margin: 0; padding: 0; list-style: none; }
.module-list li { display: flex; flex-direction: column; min-width: 0; padding: 0.4rem 0.5rem; border-radius: 8px; background: rgba(15, 23, 42, 0.04); font-size: 0.75rem; }
.module-list span { overflow: hidden; color: var(--color-text-secondary); text-overflow: ellipsis; white-space: nowrap; }
.gap { margin-top: 0.45rem; padding: 0.55rem; border-radius: 8px; background: rgba(245, 158, 11, 0.09); font-size: 0.76rem; }
.gap p { margin: 0.2rem 0 0; color: var(--color-text-secondary); }
.alternatives { font-size: 0.72rem; }
.revision-diff { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
.revision-diff p { margin: 0; color: var(--color-text-secondary); font-size: 0.76rem; }
@media (max-width: 720px) { .module-list, .revision-diff { grid-template-columns: 1fr; } }
</style>
