<!-- modified by jinlong.feng at 2026-10-20 Agent工作台迭代 -->
<script setup lang="ts">
import { computed } from "vue";

export type ContextPane = { id: string; label: string };
export type PlanFacts = {
  page: string;
  mode: string;
  baseVersion: string;
  planHash: string;
  analysisVersion?: string;
};

const props = withDefaults(defineProps<{
  panes: ContextPane[];
  active: string;
  facts?: PlanFacts;
  controlCount?: number;
}>(), { controlCount: 0 });

const emit = defineEmits<{ "update:active": [id: string] }>();

const short = (value: string): string =>
  value.length <= 8 ? value : `${value.slice(0, 4)}…${value.slice(-4)}`;

const rows = computed(() => {
  const facts = props.facts;
  if (facts === undefined) return [];
  return [
    { k: "页面", v: facts.page },
    { k: "生成模式", v: facts.mode },
    { k: "基线版本", v: facts.baseVersion },
    { k: "planHash", v: short(facts.planHash), mono: true, signed: true },
    ...(facts.analysisVersion === undefined
      ? []
      : [{ k: "分析版本", v: short(facts.analysisVersion), mono: true }]),
  ];
});
</script>

<template>
  <div class="insp">
    <div class="tabs" role="tablist">
      <button
        v-for="pane in panes"
        :key="pane.id"
        type="button"
        role="tab"
        :aria-selected="pane.id === active"
        :class="{ on: pane.id === active }"
        @click="emit('update:active', pane.id)"
      >
        {{ pane.label }}
      </button>
    </div>

    <div class="body">
      <section v-if="facts" class="card">
        <h4>当前方案</h4>
        <div v-for="row in rows" :key="row.k" class="kv">
          <span class="k">{{ row.k }}</span>
          <span class="v" :class="{ mono: row.mono }">
            {{ row.v }}<span v-if="row.signed" class="sig">✓已签名</span>
          </span>
        </div>
      </section>

      <section v-if="controlCount > 0" class="card">
        <h4>控件清单（{{ controlCount }}）</h4>
        <div class="ctrl-hint">按区域分组，未验证控件会单独标注</div>
      </section>

      <slot />
    </div>
  </div>
</template>

<style scoped>
.insp { display: flex; flex-direction: column; height: 100%; }

.tabs {
  display: flex;
  gap: 2px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--color-border);
}

.tabs button {
  border: 0;
  background: none;
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.tabs button.on { background: var(--fill-quaternary); color: var(--color-text); font-weight: 600; }

.body { padding: 10px; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; }

.card {
  border-radius: var(--radius-card);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  padding: 12px;
}

.card h4 { margin: 0 0 8px; font-size: 12px; font-weight: 700; color: var(--color-text-secondary); }

.kv { display: flex; justify-content: space-between; gap: 10px; padding: 3px 0; font-size: 12px; }
.kv .k { color: var(--color-text-secondary); }
.kv .v { color: var(--color-text); text-align: right; }
.kv .v.mono { font-family: var(--mono); font-size: 11px; }

.sig { margin-left: 4px; font-size: 10px; font-weight: 700; color: #1e9e43; }

.ctrl-hint { font-size: 11px; color: var(--color-text-secondary); }
</style>
<!-- end -->
