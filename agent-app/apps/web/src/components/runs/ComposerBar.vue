<!-- modified by jinlong.feng at 2026-10-20 Agent工作台迭代 -->
<script setup lang="ts">
import { computed, ref } from "vue";

export type ComposerMode = "discuss" | "plan" | "build";
export type ComposerFile = { name: string; state: "uploading" | "ready"; progress?: number };

const props = withDefaults(defineProps<{
  mode: ComposerMode;
  busy?: boolean;
  files?: ComposerFile[];
}>(), { busy: false, files: () => [] });

const emit = defineEmits<{
  "update:mode": [mode: ComposerMode];
  send: [text: string];
  attach: [];
  removeFile: [name: string];
}>();

const MODES: ReadonlyArray<{ value: ComposerMode; label: string; hint: string }> = [
  { value: "discuss", label: "💬 讨论", hint: "不构建" },
  { value: "plan", label: "🧭 规划", hint: "停在方案确认" },
  { value: "build", label: "🛠 生成修改", hint: "确认后构建" },
];

const text = ref("");
const canSend = computed(() => text.value.trim().length > 0);

const send = (): void => {
  if (!canSend.value) return;
  emit("send", text.value.trim());
  text.value = "";
};

const onKeydown = (event: KeyboardEvent): void => {
  // Enter 发送，Shift+Enter 换行；输入法组字期间不拦截。
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  send();
};
</script>

<template>
  <div class="composer">
    <div class="seg" role="tablist" aria-label="模式">
      <button
        v-for="item in MODES"
        :key="item.value"
        type="button"
        role="tab"
        :aria-selected="item.value === mode"
        :class="{ on: item.value === mode }"
        @click="emit('update:mode', item.value)"
      >
        {{ item.label }} <span class="mode-hint">{{ item.hint }}</span>
      </button>
    </div>

    <div class="row">
      <div class="box">
        <div v-if="files.length > 0" class="files">
          <div v-for="file in files" :key="file.name" class="cfile">
            <span class="cthumb" :class="{ uploading: file.state === 'uploading' }" aria-hidden="true" />
            <span class="fname">{{ file.name }}</span>
            <span class="fstate">{{ file.state === "uploading" ? `上传中 ${file.progress ?? 0}%` : "参考图 · 就绪" }}</span>
            <button type="button" class="x" :aria-label="`移除 ${file.name}`" @click="emit('removeFile', file.name)">✕</button>
          </div>
        </div>

        <textarea
          v-model="text"
          rows="1"
          placeholder="描述你的需求…（Enter 发送，Shift+Enter 换行）"
          @keydown="onKeydown"
        />

        <div class="tools">
          <button type="button" class="tool-btn" title="上传参考图 / 业务素材" @click="emit('attach')">📎</button>
          <span class="hint">参考图默认 · 业务素材需显式标记</span>
        </div>
      </div>

      <button type="button" class="btn-send" :disabled="!canSend" @click="send">
        发送<span v-if="busy" class="q">运行中将排队</span>
      </button>
    </div>

    <div class="foot">
      <span><span class="kbd">Enter</span> 发送 · <span class="kbd">⇧Enter</span> 换行</span>
      <span class="ext-note">🔒 参考图将发送至视觉模型 · 发送策略由租户管理员控制</span>
    </div>
  </div>
</template>

<style scoped>
.composer {
  flex: none;
  border-top: 1px solid var(--color-border);
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: var(--blur-glass);
  -webkit-backdrop-filter: var(--blur-glass);
  padding: 12px 18px 10px;
}

.seg {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  margin-bottom: 8px;
  border-radius: var(--radius-button);
  background: var(--fill-quaternary);
}

.seg button {
  border: 0;
  background: none;
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.seg button.on {
  background: var(--color-surface);
  color: var(--color-text);
  font-weight: 600;
  box-shadow: var(--shadow-card);
}

.mode-hint { font-size: 10px; color: var(--color-text-secondary); margin-left: 2px; }

.row { display: flex; gap: 10px; align-items: flex-end; }

.box {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
  padding: 8px 10px;
}

.files { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 6px; }

.cfile {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px;
  border-radius: 8px;
  background: var(--fill-quaternary);
  font-size: 11px;
}

.cthumb { width: 18px; height: 18px; border-radius: 4px; background: var(--fill-tertiary); }
.cthumb.uploading { background: linear-gradient(90deg, var(--fill-tertiary), var(--color-accent)); opacity: 0.7; }
.fname { font-weight: 600; }
.fstate { color: var(--color-text-secondary); }
.x { border: 0; background: none; cursor: pointer; color: var(--color-text-secondary); font-size: 11px; }

textarea {
  width: 100%;
  border: 0;
  outline: none;
  resize: none;
  font: inherit;
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-text);
  background: none;
  max-height: 160px;
}

.tools { display: flex; align-items: center; gap: 8px; }
.tool-btn { border: 0; background: none; cursor: pointer; font-size: 14px; padding: 2px 4px; }
.hint { font-size: 11px; color: var(--color-text-secondary); }

.btn-send {
  flex: none;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  padding: 9px 18px;
  border: 0;
  border-radius: var(--radius-button);
  background: var(--color-accent);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.btn-send:disabled { background: var(--fill-tertiary); color: var(--color-text-secondary); cursor: default; }
.btn-send:not(:disabled):active { transform: scale(0.97); background: var(--color-accent-pressed); }
.q { font-size: 9px; opacity: 0.85; font-weight: 500; }

.foot {
  display: flex;
  gap: 16px;
  margin-top: 8px;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.kbd {
  padding: 0 4px;
  border-radius: 4px;
  background: var(--fill-quaternary);
  font-family: var(--mono);
  font-size: 10px;
}

.ext-note { margin-left: auto; }

@media (prefers-reduced-transparency: reduce) {
  .composer { backdrop-filter: none; -webkit-backdrop-filter: none; background: var(--color-surface); }
}
</style>
<!-- end -->
