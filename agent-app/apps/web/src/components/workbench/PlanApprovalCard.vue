<script setup lang="ts">
// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
// 方案审批卡：展示签名计划摘要；未签名时明确提示不可构建。
// end
import type { PlanSummary } from "./workbench-types";

defineProps<{
  plan: PlanSummary;
}>();

const emit = defineEmits<{
  (e: "approve"): void;
  (e: "adjust"): void;
  (e: "cancel"): void;
}>();
</script>

<template>
  <section class="wb-card" data-testid="plan-approval" aria-label="方案待确认">
    <div class="wb-card-head">
      <span aria-hidden="true">🧭</span>
      <b>方案待确认</b>
      <span class="wb-head-hint">确认后才进入编译构建</span>
    </div>
    <div class="wb-card-body">
      <div class="wb-plan-grid">
        <div class="wb-plan-cell"><span class="k">页面</span><span class="v">{{ plan.page }}</span></div>
        <div class="wb-plan-cell"><span class="k">控件数</span><span class="v">{{ plan.controlCount }}</span></div>
        <div class="wb-plan-cell"><span class="k">布局</span><span class="v">{{ plan.layout }}</span></div>
        <div class="wb-plan-cell"><span class="k">基线版本</span><span class="v">{{ plan.baseRevision }}</span></div>
      </div>
      <div class="wb-plan-hash">
        planHash {{ plan.planHash }}
        <span v-if="plan.signed" class="wb-sig">已签名</span>
        <span v-else class="wb-sup is-unsupported">未签名 · 不可构建</span>
      </div>
      <div class="wb-done-actions">
        <button
          type="button"
          class="wb-btn is-primary"
          data-testid="plan-approve"
          :disabled="!plan.signed"
          @click="emit('approve')"
        >确认并构建</button>
        <button type="button" class="wb-btn is-secondary" data-testid="plan-adjust" @click="emit('adjust')">调整方案</button>
        <button type="button" class="wb-btn is-danger-ghost" data-testid="plan-cancel" @click="emit('cancel')">取消本轮</button>
      </div>
    </div>
  </section>
</template>
