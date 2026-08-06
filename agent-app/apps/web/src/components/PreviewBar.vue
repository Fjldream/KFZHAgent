<script setup lang="ts">
defineProps<{ previewUrl?: string | undefined }>();
</script>

<template>
  <div v-if="previewUrl" class="preview-bar" data-testid="preview-panel">
    <h2 class="title">页面预览</h2>
    <iframe :src="previewUrl" data-testid="preview-frame" sandbox="" title="生成结果预览" class="frame" />
  </div>
</template>

<style scoped>
.preview-bar {
  background: var(--color-surface); border-radius: var(--radius-card) var(--radius-card) 0 0;
  box-shadow: var(--shadow-float); overflow: hidden; display: flex; align-items: stretch; gap: 1rem;
  padding: 0.8rem 1.2rem 0.2rem;
}
.title { margin: 0; font-size: 0.85rem; color: var(--color-text-secondary); writing-mode: vertical-rl; }
.frame { width: 100%; height: 320px; border: none; }
</style>
