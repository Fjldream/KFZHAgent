<script setup lang="ts">
// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
// 用量面板（T01/T02 UI 层）：预算条、缓存命中、未知用量提示。
// 费用为估算值，不给账单口径承诺。
// end
import { computed } from "vue";
import type { UsageSummaryData } from "./workbench-types";

const props = defineProps<{
  usage: UsageSummaryData;
}>();

const invocationPercent = computed(() => {
  if (props.usage.maxInvocations <= 0) return 0;
  return Math.min(100, Math.round((props.usage.invocations / props.usage.maxInvocations) * 100));
});

const repairPercent = computed(() => {
  if (props.usage.repairMax <= 0) return 0;
  return Math.min(100, Math.round((props.usage.repairUsed / props.usage.repairMax) * 100));
});
</script>

<template>
  <div data-testid="usage-summary" style="display: flex; flex-direction: column; gap: 10px">
    <div class="wb-usage-nums">
      <div class="wb-unum">
        <div class="n">{{ usage.invocations }}<small>/{{ usage.maxInvocations }}</small></div>
        <div class="d">模型调用 / 预算</div>
      </div>
      <div class="wb-unum">
        <div class="n">{{ usage.cost }}</div>
        <div class="d">费用估算 · 非账单</div>
      </div>
      <div class="wb-unum">
        <div class="n">{{ usage.inputTokens }}<small>/{{ usage.inputBudget }}</small></div>
        <div class="d">输入 token</div>
      </div>
      <div class="wb-unum">
        <div class="n">{{ usage.outputTokens }}<small>/{{ usage.outputBudget }}</small></div>
        <div class="d">输出 token</div>
      </div>
    </div>

    <div class="wb-insp-card">
      <h4>本轮预算（RunBudget）</h4>
      <div class="wb-usage-bars">
        <div class="wb-ubar">
          <div class="lbl"><span>物理调用</span><b>{{ usage.invocations }} / {{ usage.maxInvocations }}</b></div>
          <div class="wb-track"><div class="wb-fill is-orange" :style="{ width: `${invocationPercent}%` }" /></div>
        </div>
        <div class="wb-ubar">
          <div class="lbl"><span>缓存命中</span><b>{{ usage.cacheHitRate }}%</b></div>
          <div class="wb-track"><div class="wb-fill is-green" :style="{ width: `${usage.cacheHitRate}%` }" /></div>
        </div>
        <div class="wb-ubar">
          <div class="lbl"><span>修复调用</span><b>{{ usage.repairUsed }} / {{ usage.repairMax }}</b></div>
          <div class="wb-track"><div class="wb-fill" :style="{ width: `${repairPercent}%` }" /></div>
        </div>
      </div>
    </div>

    <div v-if="usage.unknownInvocations > 0" class="wb-unknown-note">
      ⚠ {{ usage.unknownInvocations }} 次调用 usage 未知（provider 未返回），已按保守上限占用预算；费用为估算值，非账单。
    </div>

    <div class="wb-insp-card">
      <h4>调用明细</h4>
      <div class="wb-ctrl-list">
        <div v-for="item in usage.details" :key="item.label" class="wb-ctrl-row">
          <span>{{ item.label }}</span><span>{{ item.value }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
