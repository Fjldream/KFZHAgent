<script setup lang="ts">
// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
// 附件托盘：展示上传进度/失败与用途标签；删除与重试由父组件处理。
// end
import { purposeLabel } from "./composer-logic";
import type { ComposerAttachment } from "./workbench-types";

defineProps<{
  attachments: ComposerAttachment[];
}>();

const emit = defineEmits<{
  (e: "remove", clientId: string): void;
  (e: "retry", clientId: string): void;
  (e: "toggle-purpose", clientId: string): void;
}>();

function stateText(item: ComposerAttachment): string {
  if (item.status === "uploading") return `上传中 ${item.progress}%`;
  if (item.status === "failed") return item.error ?? "上传失败";
  return `${purposeLabel(item.purpose)} · 就绪`;
}
</script>

<template>
  <div v-if="attachments.length > 0" class="wb-composer-files" data-testid="attachment-tray">
    <div
      v-for="item in attachments"
      :key="item.clientId"
      class="wb-cfile"
      :class="{ 'is-failed': item.status === 'failed' }"
      :data-testid="`attachment-${item.name}`"
    >
      <span
        class="wb-cthumb"
        :class="{ 'is-material': item.purpose === 'material', 'is-failed': item.status === 'failed' }"
        aria-hidden="true"
      >
        <span v-if="item.status === 'uploading'" class="wb-pbar" :style="{ transform: `scaleY(${1 - item.progress / 100})` }" />
        {{ item.purpose === "material" ? "📊" : "🖼" }}
      </span>
      <span>{{ item.name }}</span>
      <button
        type="button"
        class="wb-purpose-tag"
        :class="{ 'is-material': item.purpose === 'material' }"
        style="border: none; cursor: pointer"
        :title="item.status === 'ready' ? '切换参考图 / 业务素材' : undefined"
        :disabled="item.status !== 'ready'"
        @click="emit('toggle-purpose', item.clientId)"
      >{{ purposeLabel(item.purpose) }}</button>
      <span class="wb-fstate">{{ stateText(item) }}</span>
      <button
        v-if="item.status === 'failed'"
        type="button"
        class="wb-mini-btn"
        @click="emit('retry', item.clientId)"
      >重试</button>
      <button
        type="button"
        class="wb-cfile-x"
        :aria-label="`移除 ${item.name}`"
        @click="emit('remove', item.clientId)"
      >✕</button>
    </div>
  </div>
</template>
