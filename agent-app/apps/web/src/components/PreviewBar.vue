<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useGsap } from "../composables/useGsap";

const props = withDefaults(defineProps<{
  previewUrl?: string | undefined;
  fullscreen?: boolean;
}>(), { previewUrl: undefined, fullscreen: false });

const emit = defineEmits<{ (e: "toggle-fullscreen"): void }>();

const zoom = ref<"fit" | "full">("fit");
/** 最小化（收起为右下角悬浮球）后再次点击还原弹窗。 */
const minimized = ref(false);
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

function minimize(): void {
  minimized.value = true;
}

function restore(): void {
  minimized.value = false;
}
</script>

<template>
  <!-- 最小化状态：右下角悬浮球，点击还原弹窗 -->
  <button
    v-if="previewUrl !== undefined && previewUrl !== '' && minimized"
    type="button"
    class="preview-dock"
    data-testid="preview-dock"
    title="打开预览"
    @click="restore"
  >
    <span class="dock-dot" aria-hidden="true" />
    <span>页面预览</span>
  </button>

  <!-- 弹窗形态：右下角浮动窗口，可全屏 / 最小化 -->
  <div
    v-else-if="previewUrl !== undefined && previewUrl !== ''"
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
        <button type="button" class="ctrl" data-testid="preview-minimize" @click="minimize">最小化</button>
      </div>
    </div>
    <div class="frame-wrap" :class="{ zoomed: zoom === 'full' }">
      <iframe :src="previewUrl" data-testid="preview-frame" sandbox="" title="生成结果预览" class="frame" />
    </div>
  </div>
</template>

<style scoped>
/* 弹窗：固定右下角，可拖动的窗口形态 */
.preview-bar {
  position: fixed;
  right: 1.25rem;
  bottom: 1.25rem;
  width: min(660px, 92vw);
  height: min(480px, 72vh);
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-float);
  overflow: hidden;
  padding: 0.7rem 1.1rem 0.3rem;
  z-index: 40;
}
.preview-bar.fullscreen {
  inset: 0;
  right: 0;
  bottom: 0;
  width: auto;
  height: auto;
  border-radius: 0;
  padding: 0.8rem 1.2rem;
  z-index: 60;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: var(--blur-glass);
}
.head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.4rem; }
.title { margin: 0; font-size: 0.85rem; color: var(--color-text-secondary); }
.controls { display: flex; gap: 0.4rem; }
.ctrl {
  padding: 0.3rem 0.7rem; border: 1px solid var(--color-border); border-radius: 999px;
  background: var(--color-surface); color: var(--color-text); font-size: 0.75rem; cursor: pointer;
}
.ctrl:active { transform: scale(0.97); }
.frame-wrap { flex: 1; overflow: auto; min-height: 0; }
.frame { width: 100%; height: 100%; border: none; display: block; }
.frame-wrap.zoomed .frame { width: 1280px; height: 720px; }
.fullscreen .frame-wrap { flex: 1; }

/* 最小化悬浮球 */
.preview-dock {
  position: fixed;
  right: 1.25rem;
  bottom: 1.25rem;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.5rem 0.95rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  box-shadow: var(--shadow-float);
  color: var(--color-text);
  font-size: 0.8rem;
  cursor: pointer;
  z-index: 40;
}
.preview-dock:active { transform: scale(0.97); }
.dock-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--color-accent, #00a0e9);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent, #00a0e9) 25%, transparent);
}
</style>
