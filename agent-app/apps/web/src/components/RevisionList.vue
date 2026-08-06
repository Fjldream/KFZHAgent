<script setup lang="ts">
import { computed } from "vue";
import type { Revision } from "../types";

/**
 * 修订历史（brief Step 3）：同屏列出不可变修订并高亮当前版本；
 * 点击切换时向父组件发射 select 事件。
 */
const props = withDefaults(
  defineProps<{
    revisions: Revision[];
    currentRevisionId?: string | null;
  }>(),
  { currentRevisionId: "" },
);

const emit = defineEmits<{
  (e: "select", revisionId: string): void;
}>();

const kindLabel = computed<Record<string, string>>(() => ({
  initial: "初始",
  source: "源包",
  built: "构建",
  rollback: "回滚",
}));

function labelOf(revision: Revision): string {
  return kindLabel.value[revision.kind] ?? revision.kind;
}

function onSelect(revision: Revision): void {
  emit("select", revision.id);
}
</script>

<template>
  <section class="panel revisions" data-testid="revision-list">
    <h2>修订历史</h2>
    <ul class="revisions">
      <li
        v-for="revision in revisions"
        :key="revision.id"
        :data-revision-id="revision.id"
        class="revision"
        :class="{ current: revision.id === currentRevisionId }"
        role="button"
        @click="onSelect(revision)"
      >
        <span class="rev-number">R{{ revision.revisionNumber }}</span>
        <span class="rev-kind">{{ labelOf(revision) }}</span>
        <span class="rev-time">{{ new Date(revision.createdAt).toLocaleString() }}</span>
      </li>
    </ul>
    <p v-if="revisions.length === 0" class="empty">暂无修订。</p>
  </section>
</template>

<style scoped>
.panel {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: 1rem;
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}
.panel h2 {
  margin: 0 0 0.6rem;
  font-size: 1rem;
}
.revisions {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.revision {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  font-size: 0.85rem;
  padding: 0.35rem 0.5rem;
  border-radius: var(--radius-button);
  cursor: pointer;
}
.revision.current {
  background: rgba(10, 132, 255, 0.08);
  border: 1px solid rgba(10, 132, 255, 0.25);
}
.rev-number {
  font-weight: 700;
  color: var(--color-accent);
}
.rev-kind {
  color: var(--color-text);
}
.rev-time {
  color: var(--color-text-secondary);
  font-size: 0.75rem;
}
.empty {
  color: var(--color-text-secondary);
  font-size: 0.85rem;
}
</style>
