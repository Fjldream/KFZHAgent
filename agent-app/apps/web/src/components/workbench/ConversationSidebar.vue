<script setup lang="ts">
// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
// 左侧会话导航（T14 UI 层）：搜索、运行/未读状态、归档分组；数据由父层注入。
// end
import { computed, ref } from "vue";
import type { ConversationSummary } from "./workbench-types";

const props = defineProps<{
  workspaceName: string;
  conversations: ConversationSummary[];
  activeId: string | null;
  open?: boolean;
}>();

const emit = defineEmits<{
  (e: "select", id: string): void;
  (e: "create"): void;
}>();

const query = ref("");
const showArchived = ref(false);

const visible = computed(() => {
  const q = query.value.trim().toLowerCase();
  return props.conversations.filter((item) => {
    if (item.archived !== showArchived.value) return false;
    if (q === "") return true;
    return item.title.toLowerCase().includes(q) || item.statusText.toLowerCase().includes(q);
  });
});

const archivedCount = computed(() => props.conversations.filter((item) => item.archived).length);

function statusClass(item: ConversationSummary): string {
  switch (item.status) {
    case "RUNNING":
    case "WAITING_INPUT":
    case "WAITING_APPROVAL":
      return "is-running";
    case "QUEUED":
      return "is-orange";
    case "SUCCEEDED":
      return "is-green";
    case "FAILED":
      return "is-error";
    default:
      return "";
  }
}

function isSpinning(item: ConversationSummary): boolean {
  return item.status === "RUNNING" || item.status === "WAITING_INPUT" || item.status === "WAITING_APPROVAL";
}
</script>

<template>
  <aside class="wb-sidebar" :class="{ 'is-open': open === true }" data-testid="conversation-sidebar" aria-label="会话导航">
    <div class="wb-ws-switch">
      <span>💧 {{ workspaceName }}</span>
      <span aria-hidden="true">▾</span>
    </div>
    <button type="button" class="wb-new-conv" data-testid="new-conversation" @click="emit('create')">
      ✦ 新会话
    </button>
    <label class="wb-search">
      <span aria-hidden="true">🔍</span>
      <input v-model="query" type="search" data-testid="conversation-search" placeholder="搜索对话" aria-label="搜索对话" />
    </label>

    <div class="wb-conv-scroll">
      <div class="wb-side-label">{{ showArchived ? `已归档 (${archivedCount})` : "对话" }}</div>
      <button
        v-for="item in visible"
        :key="item.id"
        type="button"
        class="wb-conv"
        :class="{ 'is-active': item.id === activeId }"
        :data-testid="`conversation-${item.id}`"
        :aria-current="item.id === activeId ? 'true' : undefined"
        @click="emit('select', item.id)"
      >
        <span class="wb-conv-top">
          <span class="wb-conv-title">{{ item.title }}</span>
          <span v-if="item.unread > 0" class="wb-unread" :aria-label="`${item.unread} 条未读`">{{ item.unread }}</span>
        </span>
        <span class="wb-conv-sub">
          <span v-if="isSpinning(item)" class="wb-spinner" aria-hidden="true" />
          <span v-else class="wb-status-dot" :class="statusClass(item)" aria-hidden="true" />
          {{ item.statusText }}
        </span>
      </button>
      <p v-if="visible.length === 0" class="wb-side-empty">
        {{ query.trim() === "" ? (showArchived ? "暂无归档会话" : "还没有会话") : "没有匹配的对话" }}
      </p>
    </div>

    <div class="wb-side-foot">
      <button type="button" data-testid="toggle-archive" @click="showArchived = !showArchived">
        📥 {{ showArchived ? "返回对话" : "归档管理" }}
      </button>
      <span>{{ conversations.length }} 个会话</span>
    </div>
  </aside>
</template>
