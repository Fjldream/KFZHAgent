<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { escapeModelText } from "../security";
import { useGsap } from "../composables/useGsap";
import { parseClarifyingQuestion, parseDesignPlan } from "../types";
import type { ChatMessage, ClarifyingQuestionView, DesignPlanView } from "../types";

/**
 * 连续对话面板（brief Step 1/3）。模型输出绝不用 v-html：所有内容以
 * 实体级转义（escapeModelText）或模板插值（Vue 自动转义）渲染。
 *
 * Task 6 气泡聊天样式：我=右侧 accent 气泡、助手=左侧浅色卡片气泡；
 * 流式阶段最后一条助手消息尾部追加 CSS 打字机光标（逐 token 帧管线
 * 属后端协议变更，超出本次范围，此处仅做视觉提示）。
 *
 * Task 10 展示增强（后端消息仍是纯文本，前端渲染层识别后增强）：
 *   - 澄清追问文本（问题\n①选项\n②选项）→ 问题 + 可点选选项按钮，
 *     点击选项 emit send(选项文本)；
 *   - 设计计划文本（formatDesignPlan 输出）→ 结构化卡片
 *     （工程名/摘要/布局/风格/分区/记忆点 + 「确认」按钮）；
 *   - 其余助手消息保持原有纯文本转义渲染。
 */
const props = defineProps<{
  messages: ChatMessage[];
  streaming?: boolean;
}>();

const emit = defineEmits<{
  (e: "send", content: string): void;
}>();

/** 渲染视图模型：每条消息预解析一次，模板只消费结果（纯函数，无副作用）。 */
interface RenderedMessage {
  key: string | number;
  role: "user" | "assistant";
  content: string;
  clarify: ClarifyingQuestionView | null;
  plan: DesignPlanView | null;
}

const renderedMessages = computed<RenderedMessage[]>(() =>
  props.messages.map((message, index) => ({
    key: message.id ?? index,
    role: message.role,
    content: message.content,
    // 流式拼接期间不做结构化解析：后端消息整条到达，中途按文本渲染可避免
    // 按钮/卡片分支闪烁（review P2）。
    clarify:
      message.role === "assistant" && props.streaming !== true
        ? parseClarifyingQuestion(message.content)
        : null,
    plan:
      message.role === "assistant" && props.streaming !== true
        ? parseDesignPlan(message.content)
        : null,
  })),
);

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

function displayContent(message: RenderedMessage): string {
  return message.role === "assistant" ? escapeModelText(message.content) : message.content;
}

/** 流式进行中且最后一条为助手消息时显示打字机光标（仅纯文本气泡适用）。 */
function isStreamingTail(index: number, message: RenderedMessage): boolean {
  return props.streaming === true && message.role === "assistant" && index === renderedMessages.value.length - 1;
}

/** 澄清选项 / 计划「确认」的回传：与输入框发送同路径，流式时忽略防误触。 */
function sendOption(text: string): void {
  if (props.streaming === true) return;
  emit("send", text);
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
      <div v-for="(message, index) in renderedMessages" :key="message.key" class="message" :data-role="message.role">
        <span class="role">{{ message.role === "user" ? "我" : "助手" }}</span>
        <template v-if="message.role === 'user'">
          <span class="content">{{ message.content }}</span>
        </template>
        <template v-else-if="message.clarify !== null">
          <div class="content clarify" data-testid="clarify-block">
            <p class="clarify-question">{{ message.clarify.question }}</p>
            <div class="clarify-options">
              <button
                v-for="option in message.clarify.options"
                :key="option"
                type="button"
                class="clarify-option"
                data-testid="clarify-option"
                @click="sendOption(option)"
              >
                {{ option }}
              </button>
            </div>
          </div>
        </template>
        <template v-else-if="message.plan !== null">
          <div class="content plan-card" data-testid="design-plan-card">
            <header class="plan-header">
              <span class="plan-badge">设计计划</span>
              <span v-if="message.plan.version" class="plan-version">{{ message.plan.version }}</span>
            </header>
            <h3 class="plan-name">{{ message.plan.engineeringName }}</h3>
            <p class="plan-summary">{{ message.plan.summary }}</p>
            <dl class="plan-meta">
              <div class="plan-meta-row"><dt>布局</dt><dd>{{ message.plan.layout }}</dd></div>
              <div class="plan-meta-row"><dt>风格</dt><dd>{{ message.plan.style }}</dd></div>
            </dl>
            <ul v-if="message.plan.sections.length > 0" class="plan-sections">
              <li v-for="section in message.plan.sections" :key="section.label" class="plan-section">
                <span class="section-label">{{ section.label }}</span>
                <span class="section-controls">{{ section.controls }}</span>
              </li>
            </ul>
            <p class="plan-signature">记忆点：{{ message.plan.signature }}</p>
            <button type="button" class="plan-confirm" data-testid="plan-confirm" @click="sendOption('确认')">
              确认
            </button>
          </div>
        </template>
        <span v-else class="content" :class="{ streaming: isStreamingTail(index, message) }">{{ displayContent(message) }}</span>
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
/* Task 10 澄清追问：问题 + 可点选选项按钮（与欢迎屏建议同款胶囊）。 */
.clarify-question { margin: 0; white-space: pre-wrap; word-break: break-word; }
.clarify-options { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.55rem; }
.clarify-option {
  padding: 0.35rem 0.8rem; border: 1px solid var(--color-border);
  border-radius: 999px; background: rgba(255, 255, 255, 0.7);
  color: var(--color-text); font-size: 0.83rem; cursor: pointer;
  transition: transform 140ms var(--ease-out), background 140ms var(--ease-out);
}
.clarify-option:hover { background: var(--color-surface); }
.clarify-option:active { transform: scale(0.97); }
/* Task 10 设计计划卡片：结构化字段 + 分区列表 + 确认落地入口。 */
.plan-card { display: flex; flex-direction: column; gap: 0.4rem; min-width: 0; }
.plan-header { display: flex; align-items: center; gap: 0.5rem; }
.plan-badge {
  padding: 0.12rem 0.5rem; border-radius: 999px; font-size: 0.72rem; font-weight: 600;
  background: var(--color-accent); color: #fff;
}
.plan-version { color: var(--color-text-secondary); font-size: 0.8rem; }
.plan-name { margin: 0; font-size: 1.02rem; letter-spacing: -0.01em; }
.plan-summary { margin: 0; color: var(--color-text-secondary); font-size: 0.85rem; line-height: 1.5; }
.plan-meta { margin: 0; display: flex; flex-direction: column; gap: 0.25rem; }
.plan-meta-row { display: flex; gap: 0.5rem; font-size: 0.85rem; }
.plan-meta-row dt { color: var(--color-text-secondary); flex-shrink: 0; }
.plan-meta-row dd { margin: 0; }
.plan-sections { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 0.3rem; }
.plan-section { font-size: 0.85rem; }
.section-label { font-weight: 600; margin-right: 0.4rem; color: var(--color-accent); }
.plan-signature { margin: 0; font-size: 0.82rem; color: var(--color-text-secondary); }
.plan-confirm {
  align-self: flex-start; margin-top: 0.15rem; padding: 0.45rem 1.2rem;
  border: none; border-radius: 999px; background: var(--color-accent);
  color: #fff; font-size: 0.88rem; cursor: pointer;
  transition: transform 140ms var(--ease-out), filter 140ms var(--ease-out);
}
.plan-confirm:hover { filter: brightness(1.06); }
.plan-confirm:active { transform: scale(0.97); }
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
