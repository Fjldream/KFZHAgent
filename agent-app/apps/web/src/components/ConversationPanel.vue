<script setup lang="ts">
import { ref, watch } from "vue";
import { escapeModelText } from "../security";
import { useGsap } from "../composables/useGsap";
import type { ChatMessage } from "../types";

/**
 * 连续对话面板（brief Step 1/3）。模型输出绝不用 v-html：assistant 内容
 * 经过实体级转义（escapeModelText）后以纯文本插值渲染。
 *
 * Task 6 气泡聊天样式：我=右侧 accent 气泡、助手=左侧浅色卡片气泡；
 * 流式阶段最后一条助手消息尾部追加 CSS 打字机光标（逐 token 帧管线
 * 属后端协议变更，超出本次范围，此处仅做视觉提示）。
 */
const props = defineProps<{
  messages: ChatMessage[];
  streaming?: boolean;
}>();

const emit = defineEmits<{
  (e: "send", content: string): void;
}>();

const draft = ref("");
const inputEl = ref<HTMLInputElement | null>(null);
const messagesEl = ref<HTMLElement | null>(null);
const { gsap, trackTween, reduceMotion } = useGsap();

// 空对话欢迎屏：常用意图作为可点击建议，点选只填 draft 不自动发送。
const suggestions = [
  "新建一个设备监控大屏",
  "给按钮加上报警联动",
  "在页面底部加一个状态栏",
];

function useSuggestion(text: string): void {
  draft.value = text;
  // 聚焦输入框，让用户确认后 Enter/点击发送。
  const input = inputEl.value;
  if (input !== null && props.streaming !== true) {
    input.focus();
  }
}

// 新消息滑入：最后一条气泡 y:8→0 + 淡入（发送/接收时都有反馈）。
// flush: "post" 确保在 Vue DOM patch 之后回调，querySelector 拿到的
// last-of-type 才是刚渲染的新消息（否则会动画到旧消息上）。
// 首次加载（历史恢复）跳过：messages 从空变历史时不播新消息动画。
let hasRenderedOnce = false;
watch(
  () => props.messages.length,
  () => {
    if (!hasRenderedOnce) {
      hasRenderedOnce = true;
      return;
    }
    const box = messagesEl.value;
    if (box === null || props.messages.length === 0) return;
    if (reduceMotion()) return;
    const tail = box.querySelector(".message:last-of-type");
    if (tail === null) return;
    trackTween(gsap.fromTo(tail, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.28, ease: "power3.out" }));
  },
  { flush: "post" },
);

function displayContent(message: ChatMessage): string {
  return message.role === "assistant" ? escapeModelText(message.content) : message.content;
}

/** 流式进行中且最后一条为助手消息时显示打字机光标。 */
function isStreamingTail(index: number, message: ChatMessage): boolean {
  return props.streaming === true && message.role === "assistant" && index === props.messages.length - 1;
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
    <div ref="messagesEl" class="messages">
      <div v-if="messages.length === 0" class="welcome" data-testid="conversation-welcome">
        <h2 class="welcome-title">用一句话，生成你的 KingFusion 工程</h2>
        <p class="welcome-sub">描述需求，智绘帮你设计、构建并验证完整的客户端工程。</p>
        <div class="suggestions">
          <button
            v-for="s in suggestions"
            :key="s"
            type="button"
            class="suggestion"
            @click="useSuggestion(s)"
          >
            {{ s }}
          </button>
        </div>
      </div>
      <div v-for="(message, index) in messages" :key="message.id ?? index" class="message" :data-role="message.role">
        <span class="role">{{ message.role === "user" ? "我" : "助手" }}</span>
        <span class="content" :class="{ streaming: isStreamingTail(index, message) }">{{ displayContent(message) }}</span>
      </div>
    </div>
    <div class="composer">
      <input
        ref="inputEl"
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
.panel { display: flex; flex-direction: column; background: transparent; flex: 1; min-height: 0; }
.messages { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.6rem; padding: 0.2rem 0; }
.message { display: flex; gap: 0.5rem; font-size: 0.92rem; }
.message[data-role="user"] { justify-content: flex-end; }
.message[data-role="user"] .content {
  background: var(--color-accent); color: #fff; border-radius: 18px 18px 4px 18px; padding: 0.55rem 0.9rem; max-width: 78%;
}
.message[data-role="assistant"] .content {
  background: var(--color-surface); color: var(--color-text); border-radius: 18px 18px 18px 4px;
  box-shadow: var(--shadow-card); padding: 0.55rem 0.9rem; max-width: 78%; white-space: pre-wrap; word-break: break-word;
}
.role { display: none; }
.welcome {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center; gap: 0.55rem; padding: 1rem 0.5rem;
}
.welcome-title { margin: 0; font-size: 1.15rem; letter-spacing: -0.02em; }
.welcome-sub { margin: 0; color: var(--color-text-secondary); font-size: 0.88rem; }
.suggestions { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.5rem; margin-top: 0.5rem; }
.suggestion {
  padding: 0.45rem 0.9rem; border: 1px solid var(--color-border);
  border-radius: 999px; background: rgba(255, 255, 255, 0.7);
  color: var(--color-text); font-size: 0.85rem; cursor: pointer;
  transition: transform 140ms var(--ease-out), background 140ms var(--ease-out);
}
.suggestion:hover { background: var(--color-surface); }
.suggestion:active { transform: scale(0.97); }
.content.streaming::after { content: "▍"; animation: blink 1s steps(1) infinite; margin-left: 0.15rem; }
@keyframes blink { 50% { opacity: 0; } }
.composer {
  display: flex; gap: 0.5rem; margin-top: 0.7rem;
  background: rgba(255, 255, 255, 0.6); backdrop-filter: var(--blur-glass);
  border: 1px solid var(--color-border); border-radius: 999px; padding: 0.4rem 0.4rem 0.4rem 1rem;
}
.composer input { flex: 1; border: none; outline: none; background: transparent; font-size: 0.95rem; }
.composer button {
  padding: 0.5rem 1.1rem; border: none; border-radius: 999px;
  background: var(--color-accent); color: #fff; cursor: pointer;
}
.composer button:disabled { opacity: 0.5; cursor: not-allowed; }
.composer button:active { transform: scale(0.97); }
</style>
