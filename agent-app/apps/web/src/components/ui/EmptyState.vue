<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useGsap } from "../../composables/useGsap";

withDefaults(defineProps<{
  title: string;
  desc?: string;
  actionText?: string;
}>(), { desc: "", actionText: "" });

defineEmits<{ (e: "action"): void }>();

const { gsap, track, reduceMotion } = useGsap();
const el = ref<HTMLElement | null>(null);

onMounted(() => {
  const box = el.value;
  if (box === null) return;
  if (reduceMotion()) {
    gsap.set(box, { opacity: 1, y: 0 });
    return;
  }
  const tl = gsap.timeline();
  tl.fromTo(box, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3, ease: "power3.out" });
  track(tl);
});
</script>

<template>
  <div ref="el" class="empty-state" data-testid="empty-state">
    <div class="decor" aria-hidden="true">◈</div>
    <h3 class="title">{{ title }}</h3>
    <p v-if="desc !== ''" class="desc">{{ desc }}</p>
    <button v-if="actionText !== ''" type="button" class="action" data-testid="empty-action" @click="$emit('action')">
      {{ actionText }}
    </button>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex; flex-direction: column; align-items: center; gap: 0.6rem;
  text-align: center; padding: 2.4rem 1rem;
  opacity: 0; /* GSAP 进入动画起点 */
}
.decor {
  width: 3rem; height: 3rem; border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.6rem; color: var(--color-accent);
  background: rgba(10, 132, 255, 0.08);
}
.title { margin: 0; font-size: 1.1rem; }
.desc { margin: 0; color: var(--color-text-secondary); font-size: 0.9rem; }
.action {
  margin-top: 0.4rem; padding: 0.55rem 1.2rem;
  border: none; border-radius: var(--radius-button);
  background: var(--color-accent); color: #fff; font-size: 0.9rem; cursor: pointer;
}
.action:active { transform: scale(0.97); background: var(--color-accent-pressed); }
</style>
