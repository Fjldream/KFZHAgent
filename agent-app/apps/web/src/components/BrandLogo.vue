<script setup lang="ts">
/**
 * 智绘品牌 logo（KF leftIcon.png 静态资源，本地 public/）。
 * size 控制展示尺寸；可配 text 显示品牌名（可选）。
 */
withDefaults(
  defineProps<{
    size?: number;
    text?: string;
  }>(),
  { size: 28, text: "" },
);
</script>

<template>
  <span class="brand-logo" :class="{ 'with-text': text !== '' }">
    <img class="brand-img" :src="'/leftIcon.png'" :width="size" :height="size" alt="智绘" data-testid="brand-logo" />
    <span v-if="text !== ''" class="brand-text">{{ text }}</span>
  </span>
</template>

<style scoped>
.brand-logo {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}
.brand-img {
  border-radius: 8px;
  object-fit: cover;
  display: block;
}
.brand-text {
  font-weight: 600;
  font-size: 1.05rem;
  letter-spacing: -0.02em;
}
</style>
