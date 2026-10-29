<!-- modified by jinlong.feng at 2026-10-28 Agent工作台迭代 -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId } from "vue";

const props = defineProps<{ allowed: boolean | null; admin: boolean; visionEnabled: boolean; busy: boolean; error: string }>();
const emit = defineEmits<{ toggle: [] }>();
const root = ref<HTMLElement>();
const trigger = ref<HTMLElement>();
const opened = ref(false);
const panelId = useId();
const status = computed(() => props.error ? "读取失败" : props.allowed === null ? "读取中" : !props.visionEnabled ? "未开放" : props.allowed ? "已开启" : "未授权");
function close(restoreFocus = false) {
  opened.value = false;
  if (restoreFocus) trigger.value?.focus();
}
function outside(event: PointerEvent) {
  if (event.target instanceof Node && !root.value?.contains(event.target)) close();
}
onMounted(() => document.addEventListener("pointerdown", outside));
onBeforeUnmount(() => document.removeEventListener("pointerdown", outside));
</script>

<template>
  <details ref="root" class="image-settings" :open="opened" @keydown.esc.stop.prevent="close(true)">
    <summary ref="trigger" class="settings-trigger" :aria-expanded="opened" :aria-controls="panelId" aria-label="图片发送设置" @click.prevent="opened = !opened">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
      <span>图片设置</span><span class="settings-status">{{ status }}</span><span aria-hidden="true">⌃</span>
    </summary>
    <section v-if="opened" :id="panelId" class="settings-panel" aria-label="租户图片外发授权">
      <div class="settings-heading"><h3>参考图发送设置</h3><button class="close-button" type="button" aria-label="关闭图片设置" @click="close(true)">×</button></div>
      <p>开启后允许参考图及识别结构发送至配置的视觉模型，每轮仍需本人同意。</p>
      <div class="permission-state"><span>当前工程所在租户</span><span :class="{ enabled: allowed && visionEnabled }">{{ status }}</span></div>
      <p v-if="!visionEnabled">服务端尚未开放视觉功能，请联系管理员检查视觉功能与模型配置。</p>
      <button v-if="admin" class="permission-button" type="button" :disabled="busy || allowed === null" @click="emit('toggle')">{{ busy ? '正在保存…' : allowed ? '关闭租户图片外发' : '授权租户图片外发' }}</button>
      <p v-else-if="allowed === false">请联系租户管理员授权图片外发后再使用参考图。</p>
      <p v-if="error" class="settings-error" role="alert">{{ error }}</p>
    </section>
  </details>
</template>

<style scoped>
.image-settings { position: relative; flex: none; margin-left: auto; color: var(--color-text-secondary); }
.settings-trigger { display: flex; align-items: center; gap: 5px; min-height: 28px; padding: 3px 7px; border-radius: 7px; font-size: 11px; cursor: pointer; list-style: none; }
.settings-trigger::-webkit-details-marker { display: none; }
.settings-status { color: var(--color-text-secondary); }
.settings-trigger:focus-visible, button:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
.settings-panel { position: absolute; right: 0; bottom: calc(100% + 10px); z-index: 50; width: 320px; max-width: calc(100vw - 32px); padding: 16px; border: 1px solid var(--color-border); border-radius: 14px; background: var(--color-surface); color: var(--color-text-secondary); box-shadow: 0 8px 30px rgba(0,0,0,.12); font-size: 12px; line-height: 1.6; }
.settings-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.settings-heading h3 { color: var(--color-text); font-size: 13px; font-weight: 600; }
.settings-panel button { border: 0; background: transparent; font: inherit; cursor: pointer; }
.settings-heading .close-button { width: 24px; height: 24px; border-radius: 6px; color: var(--color-text-secondary); font-size: 20px; line-height: 1; }
.permission-state { display: flex; justify-content: space-between; gap: 12px; margin: 14px 0 10px; padding-top: 12px; border-top: 1px solid var(--color-border); }
.permission-state .enabled { color: #238747; }
.settings-panel .permission-button { width: 100%; min-height: 34px; margin-top: 6px; padding: 6px 10px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-bg); color: var(--color-text); font-size: 12px; }
.permission-button:disabled { opacity: .45; cursor: default; }
.settings-panel .settings-error { margin-top: 10px; color: #c53030; overflow-wrap: anywhere; }
@media (hover: hover) and (pointer: fine) { .settings-trigger:hover, .close-button:hover { background: var(--fill-quaternary); } }
.settings-panel button:active:not(:disabled), .settings-trigger:active { transform: scale(.97); }
@media (max-width: 640px) { .settings-status { display: none; } .settings-trigger { padding-inline: 3px; } }
</style>
<!-- end -->
