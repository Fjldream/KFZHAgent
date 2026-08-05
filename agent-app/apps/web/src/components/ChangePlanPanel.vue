<script setup lang="ts">
import { computed } from "vue";
import type { ChangePlanDisplay, ScriptChange } from "../types";

/**
 * 确认 UX（brief Step 4）：展示计划摘要、精确 create/update/delete 操作、
 * 破坏性操作警告、预览与 planHash。批准只发送屏幕上展示的 planHash；
 * planHash 缺失时批准按钮必须禁用（brief Step 1 逐字断言）。
 *
 * I5：涉及 linkMng（控件事件脚本）子树的变更由服务端单独标注为
 * `scriptChanges`，本面板在操作列表与专门的「脚本类变更」区块两处显式
 * 展示，确保自由脚本在确认前可见。
 */
const props = withDefaults(
  defineProps<{
    plan: ChangePlanDisplay | null;
    planHash?: string;
    summary?: string;
    changePlanId?: string;
    diffArtifactId?: string;
    previewArtifactId?: string;
    scriptChanges?: ScriptChange[];
    busy?: boolean;
  }>(),
  {
    planHash: "",
    summary: "",
    changePlanId: "",
    diffArtifactId: "",
    previewArtifactId: "",
    scriptChanges: () => [],
    busy: false,
  },
);

const emit = defineEmits<{
  (e: "approve", planHash: string): void;
  (e: "revise", planHash: string): void;
  (e: "cancel", planHash: string): void;
}>();

const hasPlanHash = computed(() => props.planHash !== "");

const hasDestructive = computed(
  () => props.plan?.operations.some((op) => op.op === "delete") ?? false,
);

/** 计划中是否有涉及 linkMng 的脚本类变更。 */
const hasScriptChanges = computed(() => props.scriptChanges.length > 0);

function isScriptPath(path: string): boolean {
  return path === "/linkMng" || path.startsWith("/linkMng/");
}

function hasScriptChangesIn(op: ChangePlanDisplay["operations"][number]): boolean {
  return (op.changes ?? []).some((c) => isScriptPath(c.path));
}

function opLabel(op: ChangePlanDisplay["operations"][number]): string {
  switch (op.op) {
    case "create":
      return `创建 ${op.entityType ?? "实体"}「${op.entityId}」`;
    case "update":
      return `修改「${op.entityId}」${(op.changes ?? []).map((c) => c.path).join("、")}`;
    case "delete":
      return `删除「${op.entityId}」（破坏性）`;
    default:
      return op.op;
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
  <section class="panel change-plan" data-testid="change-plan-panel">
    <h2>变更计划</h2>
    <template v-if="plan !== null && plan !== undefined">
      <p class="plan-summary" data-testid="plan-summary">
        计划摘要：{{ summary ?? `共 ${plan.operations.length} 个操作` }}
      </p>
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
      <div class="actions">
        <button
          type="button"
          data-testid="approve-plan"
          :disabled="!hasPlanHash || busy"
          @click="action('approve')"
        >
          批准计划
        </button>
        <button
          type="button"
          data-testid="revise-plan"
          :disabled="!hasPlanHash || busy"
          @click="action('revise')"
        >
          要求修改
        </button>
        <button
          type="button"
          data-testid="cancel-plan"
          :disabled="!hasPlanHash || busy"
          @click="action('cancel')"
        >
          取消计划
        </button>
      </div>
    </template>
    <p v-else class="empty">暂无待确认计划。</p>
  </section>
</template>

<style scoped>
.panel {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 1rem;
  background: #ffffff;
}
.panel h2 {
  margin: 0 0 0.6rem;
  font-size: 1rem;
}
.operations {
  list-style: none;
  padding: 0;
  margin: 0.5rem 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.operation {
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.op-badge {
  background: #eef2ff;
  color: #4338ca;
  border-radius: 4px;
  padding: 0 0.35rem;
  font-size: 0.75rem;
}
.warning {
  color: #b91c1c;
  font-weight: 600;
}
.warning-tag {
  color: #b91c1c;
  border: 1px solid #fca5a5;
  border-radius: 4px;
  padding: 0 0.3rem;
  font-size: 0.7rem;
}
.script-tag {
  color: #6d28d9;
  border: 1px solid #c4b5fd;
  border-radius: 4px;
  padding: 0 0.3rem;
  font-size: 0.7rem;
}
.script-changes {
  margin-top: 0.5rem;
  padding: 0.5rem 0.6rem;
  border: 1px solid #c4b5fd;
  border-radius: 6px;
  background: #f5f3ff;
}
.script-title {
  margin: 0 0 0.3rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: #6d28d9;
}
.script-changes ul {
  margin: 0;
  padding-left: 1.1rem;
}
.script-changes li {
  font-size: 0.8rem;
  color: #4c1d95;
}
.plan-hash {
  font-size: 0.8rem;
  word-break: break-all;
}
.actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.8rem;
}
.actions button {
  padding: 0.45rem 0.9rem;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  cursor: pointer;
}
.actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.empty {
  color: #94a3b8;
}
</style>
