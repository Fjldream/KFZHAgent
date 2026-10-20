<script setup lang="ts">
// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
// 输入区（T16 UI 层）：讨论/规划/生成修改三模式、附件托盘、IME 安全的 Enter 发送。
// 当前为 UI 演示：附件上传用本地计时器模拟进度，不调用真实上传接口。
// end
import { computed, onBeforeUnmount, ref } from "vue";
import AttachmentTray from "./AttachmentTray.vue";
import { canSubmitDraft, modeMeta, shouldSubmitOnEnter, validateAttachment } from "./composer-logic";
import type { ComposerAttachment, ComposerDraft, WorkbenchMode } from "./workbench-types";

const props = withDefaults(defineProps<{
  running?: boolean;
  disabled?: boolean;
}>(), { running: false, disabled: false });

const emit = defineEmits<{
  (e: "submit", draft: ComposerDraft): void;
  (e: "mode-change", mode: WorkbenchMode): void;
}>();

const modes: WorkbenchMode[] = ["discuss", "plan", "build"];

const text = ref("");
const mode = ref<WorkbenchMode>("build");
const attachments = ref<ComposerAttachment[]>([]);
const composing = ref(false);
const error = ref<string | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const dragging = ref(false);

const uploadTimers = new Map<string, number>();

const submitEnabled = computed(() => !props.disabled && canSubmitDraft({
  text: text.value,
  mode: mode.value,
  attachments: attachments.value,
}));

function setMode(next: WorkbenchMode): void {
  mode.value = next;
  emit("mode-change", next);
}

function onKeydown(event: KeyboardEvent): void {
  if (!shouldSubmitOnEnter(event, composing.value)) return;
  event.preventDefault();
  submit();
}

function submit(): void {
  if (!submitEnabled.value) return;
  emit("submit", {
    text: text.value.trim(),
    mode: mode.value,
    attachments: attachments.value.map((item) => ({ ...item })),
  });
}

function clearDraft(): void {
  text.value = "";
  attachments.value = [];
  error.value = null;
}

function openPicker(): void {
  fileInput.value?.click();
}

function onPick(event: Event): void {
  const input = event.target as HTMLInputElement;
  if (input.files !== null) addFiles(Array.from(input.files));
  input.value = "";
}

function onDrop(event: DragEvent): void {
  dragging.value = false;
  const files = event.dataTransfer?.files;
  if (files !== undefined && files !== null) addFiles(Array.from(files));
}

function onPaste(event: ClipboardEvent): void {
  const items = event.clipboardData?.items;
  if (items === undefined) return;
  const files: File[] = [];
  for (const item of Array.from(items)) {
    if (item.kind === "file") {
      const file = item.getAsFile();
      if (file !== null) files.push(file);
    }
  }
  if (files.length > 0) {
    event.preventDefault();
    addFiles(files);
  }
}

function addFiles(files: File[]): void {
  error.value = null;
  for (const file of files) {
    const message = validateAttachment(file, attachments.value);
    if (message !== null) {
      error.value = message;
      continue;
    }
    const clientId = `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    attachments.value.push({
      clientId,
      assetId: null,
      name: file.name,
      purpose: "reference",
      status: "uploading",
      progress: 0,
      error: null,
    });
    simulateUpload(clientId);
  }
}

/** UI 演示用：用计时器推进进度，不发送任何文件。 */
function simulateUpload(clientId: string): void {
  const timer = window.setInterval(() => {
    const item = attachments.value.find((entry) => entry.clientId === clientId);
    if (item === undefined) {
      window.clearInterval(timer);
      uploadTimers.delete(clientId);
      return;
    }
    item.progress = Math.min(100, item.progress + 25);
    if (item.progress >= 100) {
      item.status = "ready";
      item.assetId = `mock-asset-${clientId}`;
      window.clearInterval(timer);
      uploadTimers.delete(clientId);
    }
  }, 160);
  uploadTimers.set(clientId, timer);
}

function removeAttachment(clientId: string): void {
  const timer = uploadTimers.get(clientId);
  if (timer !== undefined) {
    window.clearInterval(timer);
    uploadTimers.delete(clientId);
  }
  attachments.value = attachments.value.filter((item) => item.clientId !== clientId);
}

function retryAttachment(clientId: string): void {
  const item = attachments.value.find((entry) => entry.clientId === clientId);
  if (item === undefined) return;
  item.status = "uploading";
  item.progress = 0;
  item.error = null;
  simulateUpload(clientId);
}

function togglePurpose(clientId: string): void {
  const item = attachments.value.find((entry) => entry.clientId === clientId);
  if (item === undefined || item.status !== "ready") return;
  item.purpose = item.purpose === "reference" ? "material" : "reference";
}

onBeforeUnmount(() => {
  for (const timer of uploadTimers.values()) window.clearInterval(timer);
  uploadTimers.clear();
});

defineExpose({ clearDraft });
</script>

<template>
  <div class="wb-composer" data-testid="message-composer">
    <div class="wb-composer-inner">
      <div class="wb-seg" role="group" aria-label="输入模式">
        <button
          v-for="item in modes"
          :key="item"
          type="button"
          :class="{ 'is-on': mode === item }"
          :data-testid="`mode-${item}`"
          :aria-pressed="mode === item"
          @click="setMode(item)"
        >
          <span aria-hidden="true">{{ modeMeta(item).icon }}</span>
          {{ modeMeta(item).label }}
          <span class="wb-mode-hint">{{ modeMeta(item).hint }}</span>
        </button>
      </div>

      <div class="wb-composer-row">
        <!-- 拖放/粘贴入口：整块可接收文件 -->
        <div
          class="wb-composer-box"
          :class="{ 'is-dragging': dragging }"
          @dragover.prevent="dragging = true"
          @dragleave="dragging = false"
          @drop.prevent="onDrop"
        >
          <AttachmentTray
            :attachments="attachments"
            @remove="removeAttachment"
            @retry="retryAttachment"
            @toggle-purpose="togglePurpose"
          />
          <textarea
            v-model="text"
            data-testid="composer-input"
            rows="2"
            placeholder="描述你的需求…（Enter 发送，Shift+Enter 换行）"
            :disabled="disabled"
            @keydown="onKeydown"
            @compositionstart="composing = true"
            @compositionend="composing = false"
            @paste="onPaste"
          />
          <div class="wb-composer-tools">
            <button
              type="button"
              class="wb-tool-btn"
              data-testid="composer-attach"
              title="上传参考图 / 业务素材"
              aria-label="上传参考图或业务素材"
              :disabled="disabled"
              @click="openPicker"
            >📎</button>
            <span style="font-size: 10.5px; color: var(--color-text-secondary)">参考图默认 · 业务素材需显式标记（不打包参考图）</span>
            <input
              ref="fileInput"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              hidden
              data-testid="composer-file-input"
              @change="onPick"
            />
          </div>
        </div>
        <button
          type="button"
          class="wb-send"
          data-testid="composer-send"
          :disabled="!submitEnabled"
          @click="submit"
        >
          发送
          <span v-if="running" class="wb-q">运行中将排队</span>
        </button>
      </div>

      <p v-if="error !== null" class="wb-fine" style="color: var(--color-danger); margin: 0" role="alert" data-testid="composer-error">
        {{ error }}
      </p>

      <div class="wb-composer-foot">
        <span><span class="wb-kbd">Enter</span> 发送 · <span class="wb-kbd">⇧Enter</span> 换行</span>
        <span v-if="running">当前任务完成后处理本轮输入</span>
        <span class="wb-ext-note">🔒 参考图将发送至 DeepSeek 视觉模型 · 发送策略由租户管理员控制（界面演示，未实际外发）</span>
      </div>
    </div>
  </div>
</template>
