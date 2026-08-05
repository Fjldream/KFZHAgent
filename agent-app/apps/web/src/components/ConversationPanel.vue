<script setup lang="ts">
import { ref } from "vue";
import { escapeModelText } from "../security";
import type { ChatMessage } from "../types";

/**
 * 连续对话面板（brief Step 1/3）。模型输出绝不用 v-html：assistant 内容
 * 经过实体级转义（escapeModelText）后以纯文本插值渲染。
 */
const props = defineProps<{
  messages: ChatMessage[];
  streaming?: boolean;
}>();

const emit = defineEmits<{
  (e: "send", content: string): void;
}>();

const draft = ref("");

function displayContent(message: ChatMessage): string {
  return message.role === "assistant" ? escapeModelText(message.content) : message.content;
}

function submit(): void {
  const text = draft.value.trim();
  if (text.length === 0 || props.streaming === true) return;
  emit("send", text);
  draft.value = "";
}
</script>

<template>
  <section class="panel conversation" data-testid="conversation-panel">
    <h2>需求对话</h2>
    <div class="messages">
      <div v-for="(message, index) in messages" :key="message.id ?? index" class="message" :data-role="message.role">
        <span class="role">{{ message.role === "user" ? "我" : "助手" }}</span>
        <span class="content">{{ displayContent(message) }}</span>
      </div>
      <p v-if="messages.length === 0" class="empty">描述你的需求，例如「新建一个工程」或「把按钮改成红色」。</p>
    </div>
    <div class="composer">
      <input
        v-model="draft"
        data-testid="message-input"
        type="text"
        placeholder="描述需求…"
        :disabled="streaming"
        @keyup.enter="submit"
      />
      <button type="button" data-testid="send-message" :disabled="streaming" @click="submit">
        {{ streaming ? "生成中…" : "发送" }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.panel {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 1rem;
  background: #ffffff;
  display: flex;
  flex-direction: column;
}
.panel h2 {
  margin: 0 0 0.6rem;
  font-size: 1rem;
}
.messages {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-height: 8rem;
}
.message {
  display: flex;
  gap: 0.5rem;
  font-size: 0.9rem;
}
.role {
  flex: 0 0 auto;
  color: #475569;
  font-weight: 600;
}
.content {
  white-space: pre-wrap;
  word-break: break-word;
}
.empty {
  color: #94a3b8;
  font-size: 0.85rem;
}
.composer {
  display: flex;
  gap: 0.4rem;
  margin-top: 0.6rem;
}
.composer input {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
}
.composer button {
  padding: 0.45rem 0.9rem;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: #2563eb;
  color: #ffffff;
  cursor: pointer;
}
.composer button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
