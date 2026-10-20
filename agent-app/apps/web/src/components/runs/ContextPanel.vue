<!-- modified by jinlong.feng at 2026-10-20 Agent工作台迭代 -->
<script setup lang="ts">
import { computed } from "vue";

export type ContextPane = { id: string; label: string };
export type UsageFacts = {
  callsUsed: number;
  callsLimit: number;
  costEstimate: string;
  inputTokens: number;
  inputLimit: number;
  outputTokens: number;
  outputLimit: number;
  cacheHitPercent?: number;
  repairUsed?: number;
  repairLimit?: number;
  usageUnknownCount?: number;
};

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
  usage?: UsageFacts;
  revisions?: Array<{ version: string; at: string; current?: boolean }>;
}>(), { controlCount: 0, revisions: () => [] });

const emit = defineEmits<{ "update:active": [id: string] }>();

const bar = (used: number, limit: number): string =>
  limit <= 0 ? "0%" : `${Math.min(100, Math.round((used / limit) * 100))}%`;

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

      <section v-if="usage" class="card">
        <h4>本轮预算（RunBudget）</h4>
        <div class="usage-num">
          <div class="unum"><div class="n">{{ usage.callsUsed }}<small>/{{ usage.callsLimit }}</small></div><div class="d">模型调用 / 预算</div></div>
          <div class="unum"><div class="n">{{ usage.costEstimate }}</div><div class="d">费用估算</div></div>
          <div class="unum"><div class="n">{{ usage.inputTokens }}<small>/{{ usage.inputLimit }}</small></div><div class="d">输入 token</div></div>
          <div class="unum"><div class="n">{{ usage.outputTokens }}<small>/{{ usage.outputLimit }}</small></div><div class="d">输出 token</div></div>
        </div>
        <div class="ubar"><div class="lbl"><span>物理调用</span><b>{{ usage.callsUsed }} / {{ usage.callsLimit }}</b></div><div class="track"><div class="fill orange" :style="{ width: bar(usage.callsUsed, usage.callsLimit) }" /></div></div>
        <div v-if="usage.cacheHitPercent !== undefined" class="ubar"><div class="lbl"><span>缓存命中</span><b>{{ usage.cacheHitPercent }}%</b></div><div class="track"><div class="fill green" :style="{ width: usage.cacheHitPercent + '%' }" /></div></div>
        <p v-if="usage.usageUnknownCount" class="unknown">⚠ {{ usage.usageUnknownCount }} 次调用 usage 未知（provider 未返回），已按保守上限占用预算；费用为估算值，非账单。</p>
      </section>

      <section v-if="revisions.length > 0" class="card">
        <h4>最近修订</h4>
        <div v-for="revision in revisions" :key="revision.version" class="rev">
          <span class="rv">{{ revision.version }}</span>
          <span v-if="revision.current" class="cur">当前</span>
          <span class="at">{{ revision.at }}</span>
        </div>
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

.usage-num { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }
.unum { padding: 8px; border-radius: 10px; background: var(--fill-quaternary); }
.unum .n { font-size: 16px; font-weight: 700; letter-spacing: -0.02em; }
.unum .n small { font-size: 11px; font-weight: 500; color: var(--color-text-secondary); }
.unum .d { font-size: 10px; color: var(--color-text-secondary); margin-top: 2px; }

.ubar { margin-bottom: 8px; }
.ubar .lbl { display: flex; justify-content: space-between; font-size: 11px; color: var(--color-text-secondary); margin-bottom: 3px; }
.ubar .lbl b { color: var(--color-text); font-family: var(--mono); font-weight: 600; }
.track { height: 5px; border-radius: 3px; background: var(--fill-quaternary); overflow: hidden; }
.fill { height: 100%; background: var(--color-accent); border-radius: 3px; }
.fill.orange { background: var(--color-warning); }
.fill.green { background: var(--color-success); }

.unknown { font-size: 11px; color: #b26a00; margin: 6px 0 0; }

.rev { display: flex; align-items: center; gap: 6px; padding: 4px 0; font-size: 12px; }
.rv { font-family: var(--mono); font-size: 11px; font-weight: 600; }
.cur { font-size: 10px; font-weight: 700; color: #1e9e43; background: rgba(52, 199, 89, 0.12); padding: 1px 6px; border-radius: 5px; }
.at { margin-left: auto; color: var(--color-text-secondary); font-size: 11px; }
</style>
<!-- end -->
