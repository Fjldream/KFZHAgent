<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useGsap } from "../composables/useGsap";

const props = withDefaults(defineProps<{
  previewUrl?: string | undefined;
  fullscreen?: boolean;
}>(), { previewUrl: undefined, fullscreen: false });

const emit = defineEmits<{ (e: "toggle-fullscreen"): void }>();

const zoom = ref<"fit" | "full">("fit");
const { gsap, trackTween, reduceMotion } = useGsap();
const barEl = ref<HTMLElement | null>(null);

onMounted(() => {
  const bar = barEl.value;
  if (bar === null || props.fullscreen) return;
  if (reduceMotion()) return;
  trackTween(gsap.fromTo(bar, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.35, ease: "power3.out" }));
});

function toggleZoom(): void {
  zoom.value = zoom.value === "fit" ? "full" : "fit";
}
</script>

<template>
  <div
    v-if="previewUrl !== undefined && previewUrl !== ''"
    ref="barEl"
    class="preview-bar"
    :class="{ fullscreen }"
    data-testid="preview-panel"
  >
    <div class="head">
      <h2 class="title">页面预览</h2>
      <div class="controls">
        <button type="button" class="ctrl" data-testid="preview-zoom" @click="toggleZoom">
          {{ zoom === "fit" ? "适应宽度" : "100%" }}
        </button>
        <button type="button" class="ctrl" data-testid="preview-fullscreen" @click="emit('toggle-fullscreen')">
          {{ fullscreen ? "退出全屏" : "全屏" }}
        </button>
      </div>
    </div>
    <div class="frame-wrap" :class="{ zoomed: zoom === 'full' }">
      <iframe :src="previewUrl" data-testid="preview-frame" sandbox="" title="生成结果预览" class="frame" />
    </div>
  </div>
</template>

<style scoped>
.preview-bar {
  background: var(--color-surface); border-radius: var(--radius-card) var(--radius-card) 0 0;
  box-shadow: var(--shadow-float); overflow: hidden;
  padding: 0.6rem 1.2rem 0.2rem;
}
.preview-bar.fullscreen {
  position: fixed; inset: 0; z-index: 60;
  border-radius: 0; display: flex; flex-direction: column;
  padding: 0.8rem 1.2rem;
  background: rgba(255, 255, 255, 0.92); backdrop-filter: var(--blur-glass);
}
.head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.4rem; }
.title { margin: 0; font-size: 0.85rem; color: var(--color-text-secondary); }
.controls { display: flex; gap: 0.4rem; }
.ctrl {
  padding: 0.3rem 0.7rem; border: 1px solid var(--color-border); border-radius: 999px;
  background: var(--color-surface); color: var(--color-text); font-size: 0.75rem; cursor: pointer;
}
.ctrl:active { transform: scale(0.97); }
.frame-wrap { overflow: auto; }
.frame { width: 100%; height: 320px; border: none; display: block; }
.frame-wrap.zoomed .frame { width: 1280px; height: 720px; }
.fullscreen .frame-wrap { flex: 1; }
.fullscreen .frame { height: 100%; }
</style>
