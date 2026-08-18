<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { escapeModelText } from "../security";
import { useGsap } from "../composables/useGsap";
import {
  parseClarifyingQuestion,
  parseCustomerEffectBlueprint,
  parseDesignPlan,
} from "../types";
import type {
  ChatMessage,
  ClarifyingQuestionView,
  CustomerBlueprintView,
  DesignPlanView,
} from "../types";

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
const props = withDefaults(
  defineProps<{
    messages: ChatMessage[];
    streaming?: boolean;
    busy?: boolean;
    phaseHint?: string | null;
  }>(),
  { streaming: false, busy: false, phaseHint: null },
);

const emit = defineEmits<{
  (e: "send", content: string): void;
}>();

/** 渲染视图模型：每条消息预解析一次，模板只消费结果（纯函数，无副作用）。 */
interface RenderedMessage {
  key: string | number;
  role: "user" | "assistant";
  content: string;
  clarify: ClarifyingQuestionView | null;
  blueprint: CustomerBlueprintView | null;
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
    blueprint:
      message.role === "assistant" && props.streaming !== true
        ? parseCustomerEffectBlueprint(message.content)
        : null,
    plan:
      message.role === "assistant" && props.streaming !== true
        ? parseDesignPlan(message.content)
        : null,
  })),
);

const BLUEPRINT_CONFIRMATIONS = new Set(["确认", "确认蓝图", "确认效果蓝图"]);
const BLUEPRINT_RETRY_REQUEST = "重新生成工程实施计划";
const IMPLEMENTATION_FAILURE_PREFIX = "工程实施计划暂未生成：";

const latestBlueprintIndex = computed(() => {
  for (let index = renderedMessages.value.length - 1; index >= 0; index -= 1) {
    if (renderedMessages.value[index]?.blueprint !== null) return index;
  }
  return -1;
});

function isBlueprintConfirmed(index: number): boolean {
  const tail = renderedMessages.value.slice(index + 1);
  let latestSubmission = -1;
  let latestFailure = -1;
  tail.forEach((message, offset) => {
    if (
      message.role === "user"
      && (BLUEPRINT_CONFIRMATIONS.has(message.content.trim())
        || message.content.trim() === BLUEPRINT_RETRY_REQUEST)
    ) {
      latestSubmission = offset;
    }
    if (message.role === "assistant" && message.content.startsWith(IMPLEMENTATION_FAILURE_PREFIX)) {
      latestFailure = offset;
    }
  });
  return latestSubmission >= 0 && latestSubmission > latestFailure;
}

function needsImplementationRetry(index: number): boolean {
  const tail = renderedMessages.value.slice(index + 1);
  let latestSubmission = -1;
  let latestFailure = -1;
  tail.forEach((message, offset) => {
    if (
      message.role === "user"
      && (BLUEPRINT_CONFIRMATIONS.has(message.content.trim())
        || message.content.trim() === BLUEPRINT_RETRY_REQUEST)
    ) {
      latestSubmission = offset;
    }
    if (message.role === "assistant" && message.content.startsWith(IMPLEMENTATION_FAILURE_PREFIX)) {
      latestFailure = offset;
    }
  });
  return latestFailure > latestSubmission;
}

function isBlueprintActionable(index: number): boolean {
  return index === latestBlueprintIndex.value
    && (!isBlueprintConfirmed(index) || needsImplementationRetry(index));
}

function blueprintActionLabel(index: number): string {
  return needsImplementationRetry(index) ? BLUEPRINT_RETRY_REQUEST : "确认效果蓝图";
}

function submitBlueprint(index: number): void {
  sendOption(needsImplementationRetry(index) ? BLUEPRINT_RETRY_REQUEST : "确认");
}

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
  if (message.content.startsWith("KF_BLUEPRINT_MESSAGE/1\n")) {
    return "这份效果蓝图暂时无法显示，请重新生成。";
  }
  if (message.role === "assistant" && containsTechnicalPlan(message.content)) {
    return "工程正在按已确认的效果蓝图生成，技术实施细节由系统自动校验。";
  }
  return message.role === "assistant" ? escapeModelText(message.content) : message.content;
}

function containsTechnicalPlan(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  return /"schema"\s*:\s*"kf-(?:module-plan|change-plan)\/v\d+"/.test(trimmed);
}

/** 流式进行中且最后一条为助手消息时显示打字机光标（仅纯文本气泡适用）。 */
function isStreamingTail(index: number, message: RenderedMessage): boolean {
  return props.streaming === true && message.role === "assistant" && index === renderedMessages.value.length - 1;
}

/** 澄清选项 / 计划「确认」的回传：与输入框发送同路径，流式时忽略防误触。 */
function sendOption(text: string): void {
  if (props.streaming === true || props.busy === true) return;
  emit("send", text);
}

function submit(): void {
  const text = draft.value.trim();
  if (text.length === 0 || props.streaming === true || props.busy === true) return;
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
        <img v-if="message.role === 'assistant'" class="avatar" src="/leftIcon.png" alt="智绘" data-testid="assistant-avatar" />
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
        <template v-else-if="message.blueprint !== null">
          <article
            class="content effect-blueprint"
            :data-testid="message.blueprint.schema === 'kf-design-plan/v3' ? 'solution-blueprint-card' : 'effect-blueprint-card'"
          >
            <header class="blueprint-header">
              <div>
                <span class="plan-badge">效果蓝图</span>
                <span class="plan-version">v{{ message.blueprint.revision }}</span>
              </div>
              <h3 class="plan-name">{{ message.blueprint.displayName }}</h3>
            </header>

            <template v-if="message.blueprint.schema === 'kf-design-plan/v2'">
            <section class="blueprint-section revision-summary">
              <h4>{{ message.blueprint.revision === 1 ? "方案要点" : "本次更新" }}</h4>
              <ul v-if="message.blueprint.revisionNotes.added.length > 0">
                <li v-for="item in message.blueprint.revisionNotes.added" :key="`added-${item}`">
                  <strong>新增</strong>{{ item }}
                </li>
              </ul>
              <ul v-if="message.blueprint.revisionNotes.changed.length > 0">
                <li v-for="item in message.blueprint.revisionNotes.changed" :key="`changed-${item}`">
                  <strong>调整</strong>{{ item }}
                </li>
              </ul>
              <ul v-if="message.blueprint.revisionNotes.retained.length > 0">
                <li v-for="item in message.blueprint.revisionNotes.retained" :key="`retained-${item}`">
                  <strong>保留</strong>{{ item }}
                </li>
              </ul>
            </section>

            <section class="blueprint-section">
              <h4>方案目标</h4>
              <p>{{ message.blueprint.overview.objective }}</p>
              <dl class="blueprint-facts">
                <div><dt>目标受众</dt><dd>{{ message.blueprint.overview.audiences.join("、") }}</dd></div>
                <div><dt>使用场景</dt><dd>{{ message.blueprint.overview.scenarios.join("、") }}</dd></div>
                <div><dt>核心价值</dt><dd>{{ message.blueprint.overview.valueProposition }}</dd></div>
              </dl>
            </section>

            <section class="blueprint-section">
              <h4>整体结构</h4>
              <p>{{ message.blueprint.informationArchitecture.narrative }}</p>
              <pre class="blueprint-wireframe">{{ message.blueprint.informationArchitecture.wireframe }}</pre>
            </section>

            <section class="blueprint-section">
              <h4>页面模块</h4>
              <div class="blueprint-modules">
                <article v-for="module in message.blueprint.modules" :key="module.id" class="blueprint-module">
                  <h5>{{ module.name }}</h5>
                  <p>{{ module.purpose }}</p>
                  <div class="module-detail"><strong>展示内容</strong>{{ module.content.join("、") }}</div>
                  <dl v-if="module.sampleData.length > 0" class="sample-data">
                    <div v-for="sample in module.sampleData" :key="`${module.id}-${sample.label}`">
                      <dt>{{ sample.label }}</dt><dd>{{ sample.value }}</dd>
                    </div>
                  </dl>
                  <div v-if="module.interactions.length > 0" class="module-detail">
                    <strong>关键交互</strong>{{ module.interactions.join("；") }}
                  </div>
                  <div class="module-detail"><strong>表现方式</strong>{{ module.presentation }}</div>
                </article>
              </div>
            </section>

            <section class="blueprint-section">
              <h4>视觉方向</h4>
              <dl class="blueprint-facts">
                <div><dt>整体基调</dt><dd>{{ message.blueprint.visualDirection.tone }}</dd></div>
                <div><dt>配色</dt><dd>{{ message.blueprint.visualDirection.colors.join("、") }}</dd></div>
                <div><dt>文字层级</dt><dd>{{ message.blueprint.visualDirection.typography }}</dd></div>
                <div><dt>留白与表面</dt><dd>{{ message.blueprint.visualDirection.spacingAndSurfaces }}</dd></div>
              </dl>
            </section>

            <section class="blueprint-section">
              <h4>方案亮点</h4>
              <ul><li v-for="item in message.blueprint.highlights" :key="item">{{ item }}</li></ul>
            </section>

            <section class="blueprint-section acceptance">
              <h4>最终验收效果</h4>
              <ul><li v-for="item in message.blueprint.acceptanceCriteria" :key="item">{{ item }}</li></ul>
            </section>

            <section v-if="message.blueprint.openQuestions.length > 0" class="blueprint-section">
              <h4>待您确认</h4>
              <ul><li v-for="item in message.blueprint.openQuestions" :key="item">{{ item }}</li></ul>
            </section>
            </template>

            <template v-else>
              <section class="blueprint-section">
                <h4>客户任务</h4>
                <p>{{ message.blueprint.objective }}</p>
                <dl class="blueprint-facts">
                  <div><dt>目标受众</dt><dd>{{ message.blueprint.audiences.join("、") }}</dd></div>
                  <div><dt>使用场景</dt><dd>{{ message.blueprint.scenarios.join("、") }}</dd></div>
                </dl>
              </section>

              <section class="blueprint-section">
                <h4>页面与信息架构</h4>
                <div class="blueprint-modules solution-pages">
                  <article v-for="page in message.blueprint.pages" :key="page.id" class="blueprint-module solution-page">
                    <h5>{{ page.title }}</h5>
                    <p>{{ page.purpose }}</p>
                    <div class="module-detail"><strong>阅读顺序</strong>{{ page.readingOrder.join(" → ") }}</div>
                    <div class="solution-regions">
                      <section v-for="region in page.regions" :key="region.id" class="solution-region">
                        <h6>{{ region.purpose }}</h6>
                        <div class="module-detail"><strong>内容</strong>{{ region.content.join("、") }}</div>
                        <div class="module-detail"><strong>状态</strong>{{ region.states.join("、") }}</div>
                        <div v-if="region.interactions.length > 0" class="module-detail">
                          <strong>关键交互</strong>{{ region.interactions.join("；") }}
                        </div>
                        <div class="module-detail"><strong>视觉意图</strong>{{ region.visualIntent }}</div>
                        <dl v-for="(record, recordIndex) in region.sampleData" :key="`${region.id}-sample-${recordIndex}`" class="sample-data">
                          <div v-for="field in record" :key="`${region.id}-${recordIndex}-${field.label}`">
                            <dt>{{ field.label }}</dt><dd>{{ field.value }}</dd>
                          </div>
                        </dl>
                      </section>
                    </div>
                  </article>
                </div>
              </section>

              <section class="blueprint-section">
                <h4>交互旅程</h4>
                <article v-for="journey in message.blueprint.journeys" :key="journey.id" class="solution-journey">
                  <h5>{{ journey.actor }} · {{ journey.goal }}</h5>
                  <ol>
                    <li v-for="(step, stepIndex) in journey.steps" :key="`${journey.id}-${stepIndex}`">
                      {{ step.action }} → {{ step.result }}
                    </li>
                  </ol>
                  <p>完成效果：{{ journey.completion }}</p>
                </article>
              </section>

              <section class="blueprint-section">
                <h4>视觉方向</h4>
                <dl class="blueprint-facts">
                  <div><dt>整体基调</dt><dd>{{ message.blueprint.visualDirection.tone }}</dd></div>
                  <div><dt>配色</dt><dd>{{ message.blueprint.visualDirection.colors.join("、") }}</dd></div>
                  <div><dt>文字层级</dt><dd>{{ message.blueprint.visualDirection.typography }}</dd></div>
                  <div><dt>留白与表面</dt><dd>{{ message.blueprint.visualDirection.spacingAndSurfaces }}</dd></div>
                </dl>
              </section>

              <section class="blueprint-section acceptance">
                <h4>最终验收效果</h4>
                <ul><li v-for="item in message.blueprint.acceptanceScenarios" :key="item">{{ item }}</li></ul>
              </section>

              <section v-if="message.blueprint.openQuestions.length > 0" class="blueprint-section">
                <h4>待您确认</h4>
                <ul><li v-for="item in message.blueprint.openQuestions" :key="item">{{ item }}</li></ul>
              </section>
            </template>

            <p class="blueprint-guidance">可以继续告诉我需要修改的细节；确认这份效果蓝图后，我再生成工程实施计划。</p>
            <button v-if="isBlueprintActionable(index)" type="button" class="plan-confirm" data-testid="blueprint-confirm" @click="submitBlueprint(index)">
              {{ blueprintActionLabel(index) }}
            </button>
            <span v-else class="blueprint-status" data-testid="blueprint-status">
              {{ isBlueprintConfirmed(index) ? "已确认" : "历史版本" }}
            </span>
          </article>
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
        <img v-if="message.role === 'user'" class="avatar user" src="/leftIcon.png" alt="我" data-testid="user-avatar" />
      </div>
      <!-- 节点级流式阶段提示：LLM 回合进行中显示当前阶段 -->
      <div v-if="streaming && phaseHint !== null" class="message phase-row" data-testid="phase-hint">
        <img class="avatar" src="/leftIcon.png" alt="智绘" />
        <span class="content phase-hint">
          <span class="dot" /><span class="phase-text">{{ phaseHint }}</span>
        </span>
      </div>
    </div>
    <div class="composer">
      <input
        ref="inputEl"
        v-model="draft"
        data-testid="message-input"
        type="text"
        placeholder="描述需求…"
        :disabled="streaming || busy"
        @keyup.enter="submit"
      />
      <button type="button" data-testid="send-message" :disabled="streaming || busy" @click="submit">
        {{ streaming ? "生成中…" : busy ? "处理中…" : "发送" }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.panel { display: flex; flex-direction: column; background: transparent; flex: 1; min-height: 0; }
.messages { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.9rem; padding: 0.4rem 0.2rem 0.4rem 0; }
.message { display: flex; align-items: flex-start; gap: 0.6rem; font-size: 0.95rem; line-height: 1.65; }
.message[data-role="user"] { justify-content: flex-end; }
.avatar {
  flex: 0 0 auto;
  width: 2.2rem; height: 2.2rem;
  border-radius: 50%;
  object-fit: cover;
  box-shadow: var(--shadow-card);
  margin-top: 0.15rem;
}
.avatar.user { transform: scaleX(-1); }
.message[data-role="user"] .content {
  background: var(--color-accent); color: #fff; border-radius: 18px 18px 4px 18px; padding: 0.6rem 1rem; max-width: 85%;
}
.message[data-role="assistant"] .content {
  background: var(--color-surface); color: var(--color-text); border-radius: 18px 18px 18px 4px;
  box-shadow: var(--shadow-card); padding: 0.6rem 1rem; max-width: 85%; white-space: pre-wrap; word-break: break-word;
}
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
/* 节点级流式阶段提示：呼吸点 + 次要文案 */
.phase-row { opacity: 0.9; }
.phase-hint { display: inline-flex; align-items: center; gap: 0.45rem; color: var(--color-text-secondary); }
.phase-hint .dot {
  width: 0.5rem; height: 0.5rem; border-radius: 50%;
  background: var(--color-accent);
  animation: phasePulse 1.2s ease-in-out infinite;
}
@keyframes phasePulse {
  0%, 100% { opacity: 0.25; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.15); }
}
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
.effect-blueprint { display: flex; flex-direction: column; gap: 0.75rem; min-width: 0; }
.blueprint-header { display: flex; flex-direction: column; gap: 0.4rem; }
.blueprint-header > div { display: flex; align-items: center; gap: 0.45rem; }
.blueprint-section { border-top: 1px solid var(--color-border); padding-top: 0.65rem; }
.blueprint-section h4 { margin: 0 0 0.35rem; font-size: 0.88rem; color: var(--color-text); }
.blueprint-section p { margin: 0; font-size: 0.84rem; color: var(--color-text-secondary); }
.blueprint-section ul { margin: 0; padding-left: 1.15rem; font-size: 0.82rem; }
.revision-summary { border-top: none; padding: 0.6rem 0.7rem; border-radius: 10px; background: rgba(59, 130, 246, 0.07); }
.revision-summary strong { display: inline-block; min-width: 2.4rem; margin-right: 0.35rem; color: var(--color-accent); }
.blueprint-facts { margin: 0.35rem 0 0; display: grid; gap: 0.25rem; font-size: 0.82rem; }
.blueprint-facts > div { display: grid; grid-template-columns: 4.5rem 1fr; gap: 0.45rem; }
.blueprint-facts dt { color: var(--color-text-secondary); }
.blueprint-facts dd { margin: 0; }
.blueprint-wireframe { margin: 0.4rem 0 0; padding: 0.55rem; overflow-x: auto; border-radius: 8px; background: rgba(15, 23, 42, 0.05); font: 0.78rem/1.5 ui-monospace, monospace; white-space: pre-wrap; }
.blueprint-modules { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.5rem; }
.blueprint-module { padding: 0.6rem; border: 1px solid var(--color-border); border-radius: 10px; min-width: 0; }
.blueprint-module h5 { margin: 0 0 0.2rem; color: var(--color-accent); font-size: 0.86rem; }
.solution-pages { grid-template-columns: 1fr; }
.solution-regions { display: grid; gap: 0.45rem; margin-top: 0.5rem; }
.solution-region { padding: 0.5rem; border-radius: 8px; background: rgba(15, 23, 42, 0.035); }
.solution-region h6, .solution-journey h5 { margin: 0; font-size: 0.82rem; color: var(--color-accent); }
.solution-journey + .solution-journey { margin-top: 0.55rem; }
.solution-journey ol { margin: 0.35rem 0; padding-left: 1.2rem; font-size: 0.8rem; }
.module-detail { margin-top: 0.35rem; font-size: 0.8rem; }
.module-detail strong { display: block; color: var(--color-text-secondary); font-size: 0.74rem; }
.sample-data { margin: 0.4rem 0 0; padding: 0.4rem; border-radius: 7px; background: rgba(15, 23, 42, 0.04); font-size: 0.78rem; }
.sample-data > div { display: grid; grid-template-columns: minmax(4rem, auto) 1fr; gap: 0.4rem; }
.sample-data dt { color: var(--color-text-secondary); }
.sample-data dd { margin: 0; }
.acceptance { border-left: 3px solid var(--color-accent); padding-left: 0.65rem; }
.blueprint-guidance { margin: 0; font-size: 0.82rem; color: var(--color-text-secondary); }
@media (max-width: 720px) {
  .blueprint-modules { grid-template-columns: 1fr; }
  .blueprint-facts > div { grid-template-columns: 1fr; gap: 0; }
}
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
