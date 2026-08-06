<script setup lang="ts">
withDefaults(defineProps<{ count?: number }>(), { count: 3 });
</script>

<template>
  <div class="skeletons" data-testid="skeleton-list">
    <div v-for="i in count" :key="i" class="skeleton-card" />
  </div>
</template>

<style scoped>
.skeletons { display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); gap: 1rem; }
.skeleton-card {
  height: 7rem; border-radius: var(--radius-card);
  background: linear-gradient(90deg, rgba(0,0,0,0.05) 25%, rgba(0,0,0,0.09) 50%, rgba(0,0,0,0.05) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}
@keyframes shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}
</style>
