<!-- modified by jinlong.feng at 2026-10-28 Agent工作台迭代 -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";

const props = defineProps<{ title: string; archived: boolean; disabled?: boolean }>();
const emit = defineEmits<{ rename: [title: string]; archive: [archived: boolean] }>();
const root = ref<HTMLElement>();
const trigger = ref<HTMLElement>();
const titleInput = ref<HTMLInputElement>();
const opened = ref(false);
const renaming = ref(false);
const draftTitle = ref("");
const panelId = useId();
const validTitle = computed(() => draftTitle.value.trim().length > 0 && [...draftTitle.value.trim()].length <= 100);

function close(restoreFocus = false) {
  opened.value = false;
  renaming.value = false;
  if (restoreFocus) trigger.value?.focus();
}
async function startRename() {
  draftTitle.value = props.title;
  renaming.value = true;
  await nextTick();
  titleInput.value?.focus();
  titleInput.value?.select();
}
function rename() {
  if (props.disabled || !validTitle.value) return;
  emit("rename", draftTitle.value.trim());
  close(true);
}
function archive() {
  if (props.disabled) return;
  emit("archive", !props.archived);
  close(true);
}
function outside(event: PointerEvent) {
  if (event.target instanceof Node && !root.value?.contains(event.target)) close();
}
watch(() => props.disabled, disabled => { if (disabled) close(); });
onMounted(() => document.addEventListener("pointerdown", outside));
onBeforeUnmount(() => document.removeEventListener("pointerdown", outside));
</script>

<template>
  <details ref="root" class="conversation-actions" :open="opened" @keydown.esc.stop.prevent="close(true)">
    <summary ref="trigger" class="action-trigger" aria-label="会话操作" :aria-controls="panelId" :aria-expanded="opened" :aria-disabled="disabled || undefined" @click.prevent="!disabled && (opened = !opened)">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
    </summary>
    <div v-if="opened" :id="panelId" class="action-panel">
      <form v-if="renaming" aria-label="会话管理" @submit.prevent="rename">
        <label :for="panelId + '-title'">重命名会话</label>
        <input :id="panelId + '-title'" ref="titleInput" v-model="draftTitle" aria-label="新会话名称" maxlength="200" :disabled="disabled" autocomplete="off">
        <p v-if="!validTitle" class="field-hint">请输入 1–100 个字符。</p>
        <div class="form-actions"><button type="button" @click="close(true)">取消</button><button type="submit" class="primary" :disabled="disabled || !validTitle">保存</button></div>
      </form>
      <div v-else role="group" aria-label="会话管理">
        <button type="button" class="menu-action" :disabled="disabled" @click="startRename"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m16 3 5 5L9 20l-6 1 1-6Z" /><path d="m13 6 5 5" /></svg>重命名</button>
        <button type="button" class="menu-action" :disabled="disabled" @click="archive"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v12h14V8M9 12h6" /></svg>{{ archived ? '恢复会话' : '归档会话' }}</button>
      </div>
    </div>
  </details>
</template>

<style scoped>
.conversation-actions { position: relative; flex: none; color: var(--color-text-secondary); }
.action-trigger { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 8px; cursor: pointer; list-style: none; }
.action-trigger::-webkit-details-marker { display: none; }
.action-trigger[aria-disabled="true"] { opacity: .45; cursor: default; }
.action-trigger:focus-visible, button:focus-visible, input:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
.action-panel { position: absolute; top: calc(100% + 8px); left: 0; z-index: 50; width: 248px; max-width: calc(100vw - 32px); padding: 6px; border: 1px solid var(--color-border); border-radius: 12px; background: var(--color-surface); box-shadow: 0 8px 30px rgba(0,0,0,.12); color: var(--color-text); font-size: 13px; }
.action-panel button { border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; border-radius: 7px; }
.menu-action { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 10px; text-align: left; }
.menu-action svg { flex: none; color: var(--color-text-secondary); }
.action-panel form { padding: 8px; }
.action-panel label { display: block; margin-bottom: 10px; font-weight: 600; }
.action-panel input { width: 100%; min-height: 36px; padding: 7px 10px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-bg); color: var(--color-text); font: inherit; }
.form-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 12px; }
.form-actions button { min-height: 32px; padding: 6px 12px; }
.form-actions .primary { background: var(--color-accent); color: #fff; }
.action-panel button:disabled { opacity: .45; cursor: default; }
.field-hint { margin-top: 6px; color: var(--color-text-secondary); font-size: 12px; }
@media (hover: hover) and (pointer: fine) { .action-trigger:hover, .menu-action:hover { background: var(--fill-quaternary); } }
.action-panel button:active:not(:disabled), .action-trigger:active:not([aria-disabled="true"]) { transform: scale(.97); }
</style>
<!-- end -->
