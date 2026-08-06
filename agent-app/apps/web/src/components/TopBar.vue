<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useGsap } from "../composables/useGsap";
import BrandLogo from "./BrandLogo.vue";
import type { WorkflowStage } from "../stores/stage";

const props = defineProps<{
  workspaceName: string;
  stage: WorkflowStage;
}>();

defineEmits<{ (e: "back"): void; (e: "logout"): void; (e: "delete-workspace"): void }>();

const { gsap, track, trackTween, reduceMotion } = useGsap();
const barEl = ref<HTMLElement | null>(null);
const chipEl = ref<HTMLElement | null>(null);

const stageLabel: Record<WorkflowStage, string> = {
  idle: "对话中", approval: "待确认", building: "构建中", ready: "已完成", error: "出错",
};

onMounted(() => {
  const el = barEl.value;
  if (el === null) return;
  if (reduceMotion()) {
    gsap.set(el, { opacity: 1, y: 0 });
    return;
  }
  const tl = gsap.timeline();
  tl.fromTo(el, { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: 0.35, ease: "power3.out" });
  track(tl);
});

// 状态胶囊变化：轻弹反馈（scale 脉冲），让阶段切换有「手感」。
watch(
  () => props.stage,
  () => {
    const chip = chipEl.value;
    if (chip === null || reduceMotion()) return;
    trackTween(gsap.fromTo(chip, { scale: 1 }, { scale: 1.12, duration: 0.18, ease: "power2.out", yoyo: true, repeat: 1 }));
  },
);
</script>

<template>
  <header ref="barEl" class="topbar glass">
    <div class="brand">
      <button type="button" class="back" data-testid="back-to-list" aria-label="返回工程列表" @click="$emit('back')">←</button>
      <BrandLogo :size="24" text="智绘" />
    </div>
    <div class="center">
      <span class="crumb-muted">工程列表</span>
      <span class="crumb-sep">/</span>
      <span class="ws-name">{{ workspaceName }}</span>
      <span ref="chipEl" class="chip" :data-stage="stage">{{ stageLabel[stage] }}</span>
    </div>
    <div class="user">
      <button type="button" class="quiet" data-testid="delete-workspace" @click="$emit('delete-workspace')">删除</button>
      <button type="button" data-testid="logout" @click="$emit('logout')">退出</button>
    </div>
  </header>
</template>

<style scoped>
.glass { background: rgba(255, 255, 255, 0.6); backdrop-filter: var(--blur-glass); border-bottom: 1px solid var(--color-border); }
.topbar { display: flex; align-items: center; justify-content: space-between; padding: 0.7rem 1.4rem; gap: 1rem; opacity: 0; }
.brand { display: flex; align-items: center; gap: 0.5rem; font-weight: 600; }
.back {
  padding: 0.2rem 0.55rem; border: none; border-radius: 999px;
  background: var(--color-surface); color: var(--color-text-secondary);
  box-shadow: var(--shadow-card); cursor: pointer; font-size: 0.95rem; line-height: 1.2;
}
.back:hover { color: var(--color-text); }
.back:active { transform: scale(0.95); }
.crumb-muted { color: var(--color-text-secondary); font-size: 0.85rem; white-space: nowrap; }
.crumb-sep { color: var(--color-text-secondary); opacity: 0.6; }
.center { display: flex; align-items: center; gap: 0.7rem; min-width: 0; }
.ws-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chip {
  font-size: 0.75rem; padding: 0.2rem 0.6rem; border-radius: 999px;
  background: rgba(134, 134, 139, 0.15); color: var(--color-text-secondary);
}
.chip[data-stage="approval"] { background: rgba(10, 132, 255, 0.15); color: var(--color-accent); }
.chip[data-stage="building"] { background: rgba(10, 132, 255, 0.15); color: var(--color-accent); }
.chip[data-stage="ready"] { background: rgba(52, 199, 89, 0.18); color: #1e7d3a; }
.chip[data-stage="error"] { background: rgba(255, 59, 48, 0.15); color: var(--color-danger); }
.user { display: flex; gap: 0.6rem; }
.user button {
  padding: 0.4rem 0.9rem; border: none; border-radius: var(--radius-button);
  background: var(--color-accent); color: #fff; cursor: pointer;
}
.user button:active { transform: scale(0.97); }
.user button.quiet { background: var(--color-surface); color: var(--color-danger); box-shadow: var(--shadow-card); }
</style>
