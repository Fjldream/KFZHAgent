<script setup lang="ts">
/**
 * 安全预览（brief Step 5）：生成 HTML 只能进入 sandbox 且无 allow-scripts
 * 的 iframe。previewUrl 由父组件通过两段式下载协议转换为 blob URL 后传入。
 */
const props = withDefaults(defineProps<{ previewUrl?: string }>(), { previewUrl: "" });
</script>

<template>
  <section class="panel preview" data-testid="preview-panel">
    <h2>页面预览</h2>
    <iframe
      v-if="props.previewUrl !== ''"
      :src="props.previewUrl"
      data-testid="preview-frame"
      sandbox=""
      title="生成结果预览"
      class="preview-frame"
    />
    <p v-else class="empty">无预览</p>
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
.preview-frame {
  width: 100%;
  height: 420px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #ffffff;
}
.empty {
  color: #94a3b8;
  font-size: 0.85rem;
}
</style>
