<!-- modified by jinlong.feng at 2026-10-20 Agent工作台迭代 -->
<script setup lang="ts">
import { computed } from "vue";

export type PlanSummary = {
  page: string;
  controls: number;
  layout: string;
  baseVersion: string;
};

const props = withDefaults(defineProps<{
  summary: PlanSummary;
  planHash: string;
  signed?: boolean;
  submitting?: boolean;
}>(), { signed: true, submitting: false });

const emit = defineEmits<{
  approve: [];
  revise: [];
  cancel: [];
}>();

/** 长哈希只展示首尾，完整值仍在 title 里可复制；这是设计稿的展示约定。 */
const shortHash = computed(() =>
  props.planHash.length <= 8 ? props.planHash : `${props.planHash.slice(0, 4)}…${props.planHash.slice(-4)}`);
</script>

<template>
  <section class="approve-card" aria-label="方案待确认">
    <header class="approve-head">🧭 方案待确认</header>

    <div class="approve-body">
      <div class="plan-grid">
        <div class="plan-cell"><span class="k">页面</span><span class="v">{{ summary.page }}</span></div>
        <div class="plan-cell"><span class="k">控件数</span><span class="v">{{ summary.controls }}</span></div>
        <div class="plan-cell"><span class="k">布局</span><span class="v">{{ summary.layout }}</span></div>
        <div class="plan-cell"><span class="k">基线版本</span><span class="v">{{ summary.baseVersion }}</span></div>
      </div>

      <div class="plan-hash">
        planHash <code :title="planHash">{{ shortHash }}</code>
        <span v-if="signed" class="sig">已签名</span>
        <span>确认后才进入编译构建</span>
      </div>
    </div>

    <footer class="actions">
      <button type="button" class="btn primary" :disabled="submitting" @click="emit('approve')">批准计划</button>
      <button type="button" class="btn secondary" :disabled="submitting" @click="emit('revise')">要求修改</button>
      <button type="button" class="link" :disabled="submitting" @click="emit('cancel')">取消计划</button>
    </footer>
  </section>
</template>

<style scoped>
.approve-card {
  border-radius: var(--radius-card);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-card);
  overflow: hidden;
}

.approve-head {
  padding: 12px 16px;
  font-size: 13px;
  font-weight: 700;
  background: rgba(10, 132, 255, 0.06);
  border-bottom: 1px solid var(--color-border);
}

.approve-body { padding: 14px 16px; }

.plan-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 8px;
  margin-bottom: 10px;
}

.plan-cell {
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--fill-quaternary);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.k { font-size: 11px; color: var(--color-text-secondary); }
.v { font-size: 14px; font-weight: 600; }

.plan-hash {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.plan-hash code { font-family: var(--mono); font-size: 11px; }

.sig {
  font-size: 10px;
  font-weight: 700;
  color: #1e9e43;
  background: rgba(52, 199, 89, 0.12);
  padding: 1px 7px;
  border-radius: 5px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid var(--color-border);
}

.btn {
  border: 0;
  border-radius: var(--radius-button);
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.btn.primary { background: var(--color-accent); color: #fff; }
.btn.primary:not(:disabled):active { background: var(--color-accent-pressed); transform: scale(0.97); }
.btn.secondary { background: var(--fill-quaternary); color: var(--color-text); }
.btn.secondary:not(:disabled):active { transform: scale(0.97); }
.btn:disabled { opacity: 0.5; cursor: default; }

.link {
  margin-left: auto;
  border: 0;
  background: none;
  color: var(--color-text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.link:not(:disabled):hover { color: var(--color-danger); }
</style>
<!-- end -->
