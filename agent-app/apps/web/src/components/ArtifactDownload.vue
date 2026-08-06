<script setup lang="ts">
import { computed } from "vue";
import type { BuildJobStatus } from "../types";

/**
 * 下载入口（brief Step 5）：下载只通过授权 artifact 端点。
 * 仅当构建成功且存在制品时显示下载按钮。
 *
 * Task 6：面板容器已由 ContextPanel 承载，本组件仅保留按钮部分。
 */
const props = withDefaults(
  defineProps<{
    artifactId?: string;
    jobStatus?: BuildJobStatus | null;
    fileName?: string;
  }>(),
  {
    artifactId: "",
    jobStatus: null,
    fileName: "",
  },
);

const emit = defineEmits<{
  (e: "download", artifactId: string): void;
}>();

const ready = computed(() => props.jobStatus === "SUCCEEDED" && props.artifactId !== "");

function onDownload(): void {
  if (props.artifactId === "") return;
  emit("download", props.artifactId);
}
</script>

<template>
  <div class="download" data-testid="artifact-download">
    <button
      v-if="ready"
      type="button"
      data-testid="download-artifact"
      @click="onDownload"
    >
      下载客户端包{{ fileName !== "" ? `（${fileName}）` : "" }}
    </button>
    <p v-else class="empty">{{ jobStatus === 'SUCCEEDED' ? '暂无制品' : '构建完成后可下载' }}</p>
  </div>
</template>

<style scoped>
.download button {
  padding: 0.5rem 1.1rem;
  border: none;
  border-radius: var(--radius-button);
  background: var(--color-success);
  color: #ffffff;
  cursor: pointer;
  font-size: 0.9rem;
}
.download button:active { transform: scale(0.97); }
.empty {
  color: var(--color-text-secondary);
  font-size: 0.85rem;
  margin: 0;
}
</style>
