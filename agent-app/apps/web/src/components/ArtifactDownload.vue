<script setup lang="ts">
import { computed } from "vue";
import type { BuildJobStatus } from "../types";

/**
 * 下载入口（brief Step 5）：下载只通过授权 artifact 端点。
 * 仅当构建成功且存在制品时显示下载按钮。
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
  <section class="panel download" data-testid="artifact-download">
    <h2>产物下载</h2>
    <button
      v-if="ready"
      type="button"
      data-testid="download-artifact"
      @click="onDownload"
    >
      下载客户端包（{{ fileName ?? "artifact.gz" }}）
    </button>
    <p v-else class="empty">{{ jobStatus === 'SUCCEEDED' ? '暂无制品' : '构建完成后可下载' }}</p>
  </section>
</template>

<style scoped>
.panel {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 1rem;
  background: #ffffff;
}
.panel h2 {
  margin: 0 0 0.6rem;
  font-size: 1rem;
}
.panel button {
  padding: 0.45rem 0.9rem;
  border-radius: 6px;
  border: none;
  background: #059669;
  color: #ffffff;
  cursor: pointer;
}
.empty {
  color: #94a3b8;
  font-size: 0.85rem;
  margin: 0;
}
</style>
