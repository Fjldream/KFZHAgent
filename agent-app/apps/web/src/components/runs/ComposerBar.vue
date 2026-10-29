<!-- modified by jinlong.feng at 2026-10-20 Agent工作台迭代 -->
<script setup lang="ts">
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { computed, ref, watch } from "vue";
export type ComposerMode = "discuss" | "plan" | "build";
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
export type ComposerFile = { name: string; state: "uploading" | "ready" | "failed"; progress?: number };
// end
// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
const props = withDefaults(defineProps<{ mode: ComposerMode; draft?: string; busy?: boolean; disabled?: boolean; sendDisabled?: boolean; attachDisabled?: boolean; modeLocked?: boolean; files?: ComposerFile[]; submitted?: number; referenceImagesEnabled?: boolean }>(), {
  busy: false, files: () => [], submitted: 0, referenceImagesEnabled: false,
});
// end
// end
const emit = defineEmits<{ "update:draft": [text: string]; "update:mode": [mode: ComposerMode]; send: [text: string]; attach: []; removeFile: [name: string] }>();
const modes: Array<{ value: ComposerMode; label: string; hint: string }> = [
  { value: "discuss", label: "💬 讨论", hint: "不构建" },
  { value: "plan", label: "🧭 规划", hint: "停在方案确认" },
  { value: "build", label: "🛠 生成修改", hint: "确认后构建" },
];
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
const text = ref(props.draft ?? "");
watch(() => props.draft, draft => { if (draft !== undefined) text.value = draft; });
watch(text, draft => emit("update:draft", draft));
// end
// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
const canSend = computed(() => !props.disabled && !props.sendDisabled && text.value.trim().length > 0);
// end
// end
const send = () => { if (canSend.value) emit("send", text.value.trim()); };
watch(() => props.submitted, () => { text.value = ""; });
function onKeydown(event: KeyboardEvent) {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  send();
}
// end
</script>
<template>
<!-- modified by jinlong.feng at 2026-10-27 Agent工作台迭代 -->
  <div class="composer" data-task="T16">
    <span class="task-badge tb-region">T16</span>
    <div class="composer-inner">
      <div class="seg" role="tablist" aria-label="模式">
        <!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
        <button v-for="item in modes" :key="item.value" type="button" role="tab" :disabled="disabled || modeLocked" :aria-selected="mode === item.value" :class="{ on: mode === item.value }" @click="emit('update:mode', item.value)">
        <!-- end -->
          {{ item.label }} <span class="mode-hint">{{ item.hint }}</span>
        </button>
      </div>
      <div class="composer-row row">
        <div class="composer-box box">
          <div v-if="files.length" class="composer-files files">
            <div v-for="file in files" :key="file.name" class="cfile">
              <div class="cthumb" :class="{ uploading: file.state === 'uploading' }"><div v-if="file.state === 'uploading'" class="pbar" :style="{ width: (file.progress ?? 0) + '%' }" /></div>
              <!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
              <span class="fname">{{ file.name }}</span><span class="fstate">{{ file.state === 'failed' ? '上传失败 · 请重传' : file.state === 'uploading' ? file.progress === undefined ? '上传中…' : '上传中 ' + file.progress + '%' : '参考图 · 就绪' }}</span>
              <!-- end -->
              <!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
              <button type="button" class="x" :disabled="disabled" :aria-label="'移除 ' + file.name" @click="emit('removeFile', file.name)">✕</button>
              <!-- end -->
            </div>
          </div>
          <textarea v-model="text" rows="2" :disabled="disabled" aria-label="描述你的需求" placeholder="描述你的需求…（Enter 发送，Shift+Enter 换行）" @keydown="onKeydown" />
          <!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
          <!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
          <div class="composer-tools tools"><button type="button" class="tool-btn" aria-label="上传参考图或业务素材" :title="referenceImagesEnabled ? attachDisabled ? '已有单图附件或任务正在运行' : '上传单张参考图（PNG / JPEG / WebP，最大 10 MiB）' : '参考图当前不可用'" :disabled="disabled || attachDisabled || !referenceImagesEnabled" @click="emit('attach')">📎</button><span class="tool-hint">{{ referenceImagesEnabled ? '单张参考图 · 仅生成修改模式' : '参考图当前不可用' }}</span></div>
          <!-- end -->
          <!-- end -->
        </div>
        <!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
        <button type="button" class="btn-send" :disabled="!canSend" @click="send">发送<span v-if="busy" class="q">运行中将排队</span></button>
        <!-- end -->
      </div>
      <div class="composer-foot foot">
        <span><span class="kbd">Enter</span> 发送 · <span class="kbd">⇧Enter</span> 换行</span>
        <!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
        <span v-if="busy" class="queue-note">下一轮按顺序处理；遇到确认或审批时先等待你的操作</span>
        <!-- end -->
        <!-- modified by jinlong.feng at 2026-10-28 Agent工作台迭代 -->
        <slot name="reference-settings">
          <span class="ext-note">{{ referenceImagesEnabled ? '🔒 参考图将发送至视觉模型 · 发送策略由租户管理员控制' : '🔒 参考图尚未开放，不会向模型发送图片' }}</span>
        </slot>
        <!-- end -->
      </div>
    </div>
  </div>
<!-- end -->
</template>
<!-- end -->
