<script setup lang="ts">
// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
// 基线冲突提示（stale-base）：不自动换基线，必须由用户选择重新规划或查看差异。
// end
defineProps<{
  currentVersion: string;
  baseVersion: string;
}>();

const emit = defineEmits<{
  (e: "diff"): void;
  (e: "replan"): void;
}>();
</script>

<template>
  <section class="wb-conflict" data-testid="conflict-banner" role="alert">
    <span aria-hidden="true">⚠️</span>
    <div>
      <b>检测到工程已被其他会话更新（当前 {{ currentVersion }}，本轮基于 {{ baseVersion }}）</b><br />
      <span style="color: var(--color-text-secondary)">
        为避免覆盖，排队任务不会自动换基线。可基于最新版本重新规划，或查看两版差异。
      </span>
    </div>
    <div class="wb-conflict-actions">
      <button type="button" class="wb-btn is-secondary is-small" data-testid="conflict-diff" @click="emit('diff')">查看差异</button>
      <button type="button" class="wb-btn is-primary is-small" data-testid="conflict-replan" @click="emit('replan')">基于 {{ currentVersion }} 重新规划</button>
    </div>
  </section>
</template>
