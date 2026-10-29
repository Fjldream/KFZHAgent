<!-- modified by jinlong.feng at 2026-10-20 Agent工作台迭代 -->
<script setup lang="ts">
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { computed, ref } from "vue";

import type { SidebarConversation, ConversationState } from "./types.js";

const props = withDefaults(defineProps<{
  workspaceName: string;
  conversations: SidebarConversation[];
  activeId?: string;
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  archivedCount?: number;
  more?: boolean;
  paging?: boolean;
  showingArchive?: boolean;
// end
}>(), { archivedCount: 0 });

const emit = defineEmits<{
  select: [id: string];
  create: [];
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  manageArchive: [];
  loadMore: [];
// end
}>();

const query = ref("");
const visible = computed(() => {
  const keyword = query.value.trim();
  if (keyword === "") return props.conversations;
  return props.conversations.filter((item) => item.title.includes(keyword));
});

// 讨论中的会话仍在活跃列表（设计稿里就是「💬 讨论 · 不构建」），只有归档才分组到下面。
const LIVE_STATES: ReadonlyArray<ConversationState> = ["running", "queued", "done", "discuss"];
const live = computed(() => visible.value.filter((item) => LIVE_STATES.includes(item.state)));
const archived = computed(() => visible.value.filter((item) => item.state === "archived"));

const stateText = (item: SidebarConversation): string => {
  if (item.meta !== undefined) return item.meta;
  switch (item.state) {
    case "running": return "生成中";
    case "queued": return "排队中（本会话完成后执行）";
    case "done": return "已完成";
    case "discuss": return "讨论 · 不构建";
    case "archived": return "归档";
  }
};
// end
</script>

<template>
<!-- modified by jinlong.feng at 2026-10-27 Agent工作台迭代 -->
  <div class="side">
    <div class="ws-switch">💧 {{ workspaceName }}<span class="chev" aria-hidden="true">▾</span></div>

    <button class="new-conv" type="button" @click="emit('create')">✦ 新会话</button>

    <label class="search">
      <span aria-hidden="true">🔍</span>
      <input v-model="query" type="search" placeholder="搜索已加载对话" aria-label="搜索对话" />
    </label>

    <div class="conv-scroll">
      <div class="side-label">对话</div>
      <button
        v-for="item in live"
        :key="item.id"
        type="button"
        class="conv"
        :class="{ active: item.id === activeId }"
        :data-state="item.state"
        @click="emit('select', item.id)"
      >
        <span class="conv-top">
          <span class="conv-title">{{ item.title }}</span>
          <span v-if="item.unread" class="unread">{{ item.unread }}</span>
        </span>
        <span class="conv-sub">
          <span v-if="item.state === 'running'" class="spinner" aria-hidden="true" />
          <span v-else class="badge-dot" :class="{ green: item.state === 'done' }" aria-hidden="true" />
          {{ stateText(item) }}
        </span>
      </button>

      <template v-if="archived.length > 0">
        <div class="side-label">已归档 ({{ archivedCount || archived.length }})</div>
        <button
          v-for="item in archived"
          :key="item.id"
          type="button"
          class="conv archived"
          :data-state="item.state"
          @click="emit('select', item.id)"
        >
          <span class="conv-top"><span class="conv-title">{{ item.title }}</span></span>
          <span class="conv-sub">{{ stateText(item) }}</span>
        </button>
      </template>

      <!-- modified by jinlong.feng at 2026-10-27 Agent工作台迭代 -->
      <button v-if="more" type="button" class="link" :disabled="paging" @click="emit('loadMore')">{{ paging ? '正在加载…' : '加载更多会话' }}</button>
      <!-- end -->
      <p v-if="visible.length === 0" class="empty">没有匹配的对话</p>
    </div>

    <div class="side-foot">
      <button type="button" class="link" @click="emit('manageArchive')">{{ showingArchive ? '返回活跃会话' : '📥 归档管理' }}</button>
      <span>{{ conversations.length }} 个会话</span>
    </div>
  </div>
<!-- end -->
</template>


<!-- end -->
