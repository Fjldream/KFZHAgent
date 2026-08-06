<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useGsap } from "../../composables/useGsap";

const props = withDefaults(defineProps<{
  label: string;
  value: string | number;
  hint?: string;
  icon?: string;
}>(), { hint: "", icon: "" });

const { gsap, track, reduceMotion } = useGsap();
const el = ref<HTMLElement | null>(null);

onMounted(() => {
  const card = el.value;
  if (card === null) return;
  if (reduceMotion()) {
    gsap.set(card, { opacity: 1, y: 0 });
    return;
  }
  const tl = gsap.timeline();
  tl.fromTo(card, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.35, ease: "power3.out" });
  track(tl);
});
</script>

<template>
  <div ref="el" class="stat-card" data-testid="stat-card">
    <span v-if="props.icon" class="icon">{{ props.icon }}</span>
    <div class="body">
      <span class="value" data-testid="stat-value">{{ value }}</span>
      <span class="label">{{ label }}</span>
      <span v-if="hint !== ''" class="hint">{{ hint }}</span>
    </div>
  </div>
</template>

<style scoped>
.stat-card {
  display: flex; align-items: center; gap: 0.8rem;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: var(--blur-glass);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  padding: 1.1rem 1.3rem;
  opacity: 0; /* GSAP 进入动画起点 */
}
.icon { font-size: 1.4rem; color: var(--color-accent); }
.body { display: flex; flex-direction: column; gap: 0.1rem; }
.value { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; }
.label { color: var(--color-text-secondary); font-size: 0.85rem; }
.hint { color: var(--color-text-secondary); font-size: 0.75rem; }
</style>
