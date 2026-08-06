<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { ChangePlanDisplay, ScriptChange } from "../types";

const props = withDefaults(
  defineProps<{
    plan: ChangePlanDisplay | null;
    planHash?: string;
    summary?: string;
    scriptChanges?: ScriptChange[];
    busy?: boolean;
  }>(),
  { planHash: "", summary: "", scriptChanges: () => [], busy: false },
);

const emit = defineEmits<{
  (e: "approve", planHash: string): void;
  (e: "revise", planHash: string): void;
  (e: "cancel", planHash: string): void;
}>();

const hasPlanHash = computed(() => props.planHash !== "");
const hasDestructive = computed(() => props.plan?.operations.some((op) => op.op === "delete") ?? false);
const hasScriptChanges = computed(() => props.scriptChanges.length > 0);
const sheetEl = ref<HTMLElement | null>(null);

/** 进入动画：iOS 风格 spring 近似（WAAPI，可中断）。 */
onMounted(() => {
  const el = sheetEl.value;
  if (!el) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  el.animate(
    [
      { opacity: 0, transform: "scale(0.92) translateY(28px)" },
      { opacity: 1, transform: "scale(1) translateY(0)" },
    ],
    { duration: 380, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "backwards" },
  );
});

function isScriptPath(path: string): boolean {
  return path === "/linkMng" || path.startsWith("/linkMng/");
}
function hasScriptChangesIn(op: ChangePlanDisplay["operations"][number]): boolean {
  return (op.changes ?? []).some((c) => isScriptPath(c.path));
}
function opLabel(op: ChangePlanDisplay["operations"][number]): string {
  switch (op.op) {
    case "create": return `创建 ${op.entityType ?? "实体"}「${op.entityId}」`;
    case "update": return `修改「${op.entityId}」${(op.changes ?? []).map((c) => c.path).join("、")}`;
    case "delete": return `删除「${op.entityId}」（破坏性）`;
    default: return op.op;
  }
}
function action(kind: "approve" | "revise" | "cancel"): void {
  if (props.planHash === "") return;
  if (kind === "approve") emit("approve", props.planHash);
  else if (kind === "revise") emit("revise", props.planHash);
  else emit("cancel", props.planHash);
}
</script>

<template>
  <div class="scrim" data-testid="change-plan-panel">
    <section ref="sheetEl" class="sheet">
      <header class="sheet-head">
        <h2>确认变更计划</h2>
        <p class="plan-summary" data-testid="plan-summary">
          {{ summary !== "" ? summary : plan !== null ? `共 ${plan.operations.length} 个操作` : "计划加载中…" }}
        </p>
      </header>

      <div v-if="plan !== null && plan !== undefined" class="sheet-body">
        <ul class="operations">
          <li v-for="(op, index) in plan.operations" :key="`${op.op}-${index}`" :data-op="op.op" class="operation">
            <span class="op-badge">{{ op.op }}</span>
            {{ opLabel(op) }}
            <span v-if="op.op === 'delete'" class="warning-tag">破坏性</span>
            <span v-if="hasScriptChangesIn(op)" class="script-tag">脚本类变更</span>
          </li>
        </ul>

        <div v-if="hasScriptChanges" class="script-changes" data-testid="script-changes">
          <p class="script-title">脚本类变更（自由脚本最终构建前单独展示）</p>
          <ul>
            <li v-for="(change, index) in scriptChanges" :key="`script-${index}`" data-testid="script-change">
              修改「{{ change.entityId }}」{{ change.paths.join("、") }}
            </li>
          </ul>
        </div>

        <p v-if="hasDestructive" class="warning" data-testid="destructive-warning">
          警告：本计划包含破坏性操作，批准后将不可撤销。
        </p>

        <p class="plan-hash" data-testid="plan-hash">
          planHash：<code>{{ planHash !== "" ? planHash : "（未生成）" }}</code>
        </p>
      </div>
      <p v-else class="loading">正在加载计划详情…</p>

      <footer class="actions">
        <button type="button" class="ghost" data-testid="cancel-plan" :disabled="!hasPlanHash || busy" @click="action('cancel')">
          取消计划
        </button>
        <button type="button" class="ghost" data-testid="revise-plan" :disabled="!hasPlanHash || busy" @click="action('revise')">
          要求修改
        </button>
        <button type="button" class="primary" data-testid="approve-plan" :disabled="!hasPlanHash || busy" @click="action('approve')">
          {{ busy ? "处理中…" : "批准计划" }}
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.scrim {
  position: fixed; inset: 0; z-index: 50;
  background: rgba(0, 0, 0, 0.35); backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center; padding: 1.5rem;
}
.sheet {
  width: min(38rem, 92vw); max-height: 84vh; overflow-y: auto;
  background: rgba(255, 255, 255, 0.92); backdrop-filter: var(--blur-glass);
  border-radius: var(--radius-sheet); box-shadow: var(--shadow-float);
  display: flex; flex-direction: column;
}
.sheet-head { padding: 1.6rem 1.8rem 0.6rem; }
.sheet-head h2 { margin: 0 0 0.3rem; font-size: 1.3rem; }
.plan-summary { margin: 0; color: var(--color-text-secondary); font-size: 0.9rem; }
.sheet-body { padding: 0.6rem 1.8rem 1rem; }
.operations { list-style: none; margin: 0.5rem 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
.operation { font-size: 0.88rem; display: flex; align-items: center; gap: 0.4rem; }
.op-badge { background: rgba(10, 132, 255, 0.12); color: var(--color-accent); border-radius: 6px; padding: 0 0.4rem; font-size: 0.75rem; }
.warning { color: var(--color-danger); font-weight: 600; }
.warning-tag { color: var(--color-danger); border: 1px solid rgba(255, 59, 48, 0.4); border-radius: 4px; padding: 0 0.3rem; font-size: 0.7rem; }
.script-tag { color: #6d28d9; border: 1px solid rgba(109, 40, 217, 0.4); border-radius: 4px; padding: 0 0.3rem; font-size: 0.7rem; }
.script-changes { margin-top: 0.6rem; padding: 0.6rem 0.8rem; border: 1px solid rgba(109, 40, 217, 0.3); border-radius: 10px; background: rgba(109, 40, 217, 0.05); }
.script-title { margin: 0 0 0.3rem; font-size: 0.8rem; font-weight: 600; color: #6d28d9; }
.script-changes ul { margin: 0; padding-left: 1.1rem; }
.script-changes li { font-size: 0.8rem; color: #4c1d95; }
.plan-hash { font-size: 0.8rem; word-break: break-all; color: var(--color-text-secondary); }
.loading { padding: 1rem 1.8rem; color: var(--color-text-secondary); }
.actions {
  display: flex; justify-content: flex-end; gap: 0.6rem;
  padding: 1rem 1.8rem 1.4rem; border-top: 1px solid var(--color-border);
}
.actions button { padding: 0.6rem 1.2rem; border-radius: 999px; font-size: 0.9rem; cursor: pointer; }
.actions .primary { border: none; background: var(--color-accent); color: #fff; }
.actions .ghost { border: 1px solid var(--color-border); background: transparent; color: var(--color-text); }
.actions button:active { transform: scale(0.97); }
.actions button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
