<script setup lang="ts">
defineProps<{
  status: "active" | "done" | "error" | "info";
  label: string;
}>();
</script>

<template>
  <span class="badge" :data-status="status" data-testid="status-badge">{{ label }}</span>
</template>

<style scoped>
.badge {
  display: inline-flex; align-items: center;
  font-size: 0.75rem; padding: 0.2rem 0.6rem; border-radius: 999px;
}
.badge[data-status="active"] { background: rgba(10, 132, 255, 0.14); color: var(--color-accent); }
.badge[data-status="done"] { background: rgba(52, 199, 89, 0.16); color: #1e7d3a; }
.badge[data-status="error"] { background: rgba(255, 59, 48, 0.14); color: var(--color-danger); }
.badge[data-status="info"] { background: rgba(134, 134, 139, 0.14); color: var(--color-text-secondary); }
</style>
