<!-- modified by jinlong.feng at 2026-10-20 Agent工作台迭代 -->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import WorkbenchShell from "../components/runs/WorkbenchShell.vue";
import ConversationSidebar, { type SidebarConversation } from "../components/runs/ConversationSidebar.vue";
import MessageBubble from "../components/runs/MessageBubble.vue";
import RunTimeline from "../components/runs/RunTimeline.vue";
import RunStatusCapsule from "../components/runs/RunStatusCapsule.vue";
import ContextPanel from "../components/runs/ContextPanel.vue";
import ComposerBar, { type ComposerMode } from "../components/runs/ComposerBar.vue";
import { startRun } from "../runs-api.js";
import { useRunStream } from "../composables/useRunStream.js";

const props = defineProps<{ workspaceId: string; conversationId?: string }>();

/** 会话列表由 T13 的接口提供，接入前先展示占位，避免伪造数据。 */
const conversations = ref<SidebarConversation[]>([]);
const activeConversationId = ref(props.conversationId ?? "");
const mode = ref<ComposerMode>("build");
const sending = ref(false);
const sendError = ref<string | null>(null);

const steps = ref<ReturnType<typeof useRunStream> | null>(null);

/**
 * 启动订阅必须放在事件回调里，不能放进 computed——computed 可能被重复求值，
 * 会把同一个 run 订阅两次、并触发两条 SSE 连接。
 */
function subscribe(runId: string): void {
  steps.value?.stop();
  const created = useRunStream(runId);
  steps.value = created;
  void created.start();
}

const status = computed(() => steps.value?.status.value ?? "QUEUED");
const busy = computed(() => ["QUEUED", "RUNNING", "BUILDING"].includes(status.value));

const send = async (text: string): Promise<void> => {
  if (props.conversationId === undefined) {
    sendError.value = "尚未选择会话";
    return;
  }
  sending.value = true;
  sendError.value = null;
  try {
    const snapshot = await startRun(props.conversationId, {
      clientRequestId: crypto.randomUUID(),
      clientMessageId: crypto.randomUUID(),
      mode: mode.value,
      action: { type: "message", text },
    });
    subscribe(snapshot.id);
  } catch (error) {
    sendError.value = error instanceof Error ? error.message : "提交失败";
  } finally {
    sending.value = false;
  }
};

onBeforeUnmount(() => steps.value?.stop());

const panes = [
  { id: "plan", label: "方案" },
  { id: "project", label: "工程" },
  { id: "revision", label: "版本" },
  { id: "usage", label: "用量" },
];
const activePane = ref("plan");
</script>

<template>
  <WorkbenchShell title="运行工作台">
    <template #sidebar>
      <ConversationSidebar
        workspace-name="当前工程"
        :conversations="conversations"
        :active-id="activeConversationId"
      />
    </template>

    <template #titlebar>
      <RunStatusCapsule :status="status" />
    </template>

    <template #main>
      <div class="stream">
        <p v-if="steps === null" class="hint">发送一条需求即可开始一次运行。</p>
        <RunTimeline v-if="steps !== null && steps.steps().length > 0" :steps="steps.steps()" />
        <MessageBubble v-if="sendError" role="assistant" :text="`提交失败：${sendError}`" />
      </div>
      <ComposerBar
        :mode="mode"
        :busy="busy || sending"
        @update:mode="mode = $event"
        @send="send"
      />
    </template>

    <template #inspector>
      <ContextPanel :panes="panes" :active="activePane" @update:active="activePane = $event" />
    </template>
  </WorkbenchShell>
</template>

<style scoped>
.stream {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hint { margin: 0; font-size: 13px; color: var(--color-text-secondary); }
</style>
<!-- end -->
