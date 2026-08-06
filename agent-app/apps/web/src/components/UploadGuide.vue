<script setup lang="ts">
import { ref } from "vue";

const emit = defineEmits<{ (e: "file", file: File): void }>();
const dragging = ref(false);

function onDrop(e: DragEvent): void {
  dragging.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (file) emit("file", file);
}
function onPick(e: Event): void {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) emit("file", file);
  input.value = "";
}
</script>

<template>
  <div
    class="upload-zone"
    :class="{ dragging }"
    data-testid="upload-guide"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
  >
    <h2>上传 KF 源包</h2>
    <p class="sub">把 .gz 客户端包拖到这里，或点击选择文件。</p>
    <input ref="input" id="upload-input" type="file" accept=".gz" data-testid="upload-input" hidden @change="onPick" />
    <label class="pick" data-testid="upload-pick" for="upload-input">选择文件</label>
  </div>
</template>

<style scoped>
.upload-zone {
  border: 2px dashed rgba(10, 132, 255, 0.35); border-radius: var(--radius-card);
  padding: 2rem 1.2rem; text-align: center; display: flex; flex-direction: column; gap: 0.5rem;
  background: rgba(10, 132, 255, 0.04); transition: border-color 200ms var(--ease-out), background 200ms var(--ease-out);
}
.upload-zone.dragging { border-color: var(--color-accent); background: rgba(10, 132, 255, 0.1); }
.upload-zone h2 { margin: 0; font-size: 1.1rem; }
.sub { margin: 0; color: var(--color-text-secondary); font-size: 0.85rem; }
.pick {
  align-self: center; padding: 0.5rem 1.1rem; border-radius: var(--radius-button);
  background: var(--color-accent); color: #fff; font-size: 0.9rem; cursor: pointer;
}
.pick:active { transform: scale(0.97); }
</style>
