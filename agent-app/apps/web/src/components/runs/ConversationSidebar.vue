<!-- modified by jinlong.feng at 2026-10-20 Agent工作台迭代 -->
<script setup lang="ts">
import { computed, ref } from "vue";

export type ConversationState = "running" | "queued" | "done" | "discuss" | "archived";

export type SidebarConversation = {
  id: string;
  title: string;
  state: ConversationState;
  unread?: number;
  /** 状态行的补充说明，例如「生成组件方案中 · 12 秒」「归档 · 10-14」。 */
  meta?: string;
};

const props = withDefaults(defineProps<{
  workspaceName: string;
  conversations: SidebarConversation[];
  activeId?: string;
  archivedCount?: number;
}>(), { archivedCount: 0 });

const emit = defineEmits<{
  select: [id: string];
  create: [];
  manageArchive: [];
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
</script>

<template>
  <div class="side">
    <div class="ws-switch">{{ workspaceName }}<span class="chev" aria-hidden="true">▾</span></div>

    <button class="new-conv" type="button" @click="emit('create')">✦ 新会话</button>

    <label class="search">
      <span aria-hidden="true">🔍</span>
      <input v-model="query" type="search" placeholder="搜索对话" aria-label="搜索对话" />
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
          <span v-else class="badge-dot" :class="item.state" aria-hidden="true" />
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

      <p v-if="visible.length === 0" class="empty">没有匹配的对话</p>
    </div>

    <div class="side-foot">
      <button type="button" class="link" @click="emit('manageArchive')">📥 归档管理</button>
      <span>{{ conversations.length }} 个会话</span>
    </div>
  </div>
</template>

<style scoped>
.side { display: flex; flex-direction: column; height: 100%; padding: 10px 10px 0; gap: 8px; }

.ws-switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  font-size: 13px;
  font-weight: 600;
  border-radius: var(--radius-button);
  color: var(--color-text);
}

.chev { color: var(--color-text-secondary); font-size: 11px; }

.new-conv {
  padding: 8px 10px;
  border-radius: var(--radius-button);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--shadow-card);
}

.new-conv:active { transform: scale(0.97); }

.search {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: var(--radius-button);
  background: var(--fill-quaternary);
  color: var(--color-text-secondary);
  font-size: 12px;
}

.search input {
  border: 0;
  background: none;
  outline: none;
  font: inherit;
  color: var(--color-text);
  width: 100%;
}

.conv-scroll { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }

.side-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-text-secondary);
  padding: 8px 8px 4px;
  letter-spacing: 0.02em;
}

.conv {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  border: 0;
  border-radius: var(--radius-button);
  background: none;
  text-align: left;
  cursor: pointer;
  color: inherit;
}

.conv:hover { background: var(--fill-quaternary); }
.conv.active { background: var(--fill-tertiary); }
.conv.archived { opacity: 0.72; }

.conv-top { display: flex; align-items: center; gap: 6px; }
.conv-title { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.unread {
  margin-left: auto;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--color-accent);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.conv-sub {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.badge-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--fill-tertiary); flex: none; }
.badge-dot.queued { background: var(--color-text-secondary); }
.badge-dot.done { background: var(--color-success); }

.spinner {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 1.5px solid var(--fill-tertiary);
  border-top-color: var(--color-accent);
  animation: spin 900ms linear infinite;
  flex: none;
}

.empty { padding: 12px 8px; font-size: 12px; color: var(--color-text-secondary); }

.side-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px;
  border-top: 1px solid var(--color-border);
  font-size: 11px;
  color: var(--color-text-secondary);
}

.link { border: 0; background: none; color: var(--color-accent); font-size: 11px; cursor: pointer; padding: 0; }

@keyframes spin { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .spinner { animation: none; }
}
</style>
<!-- end -->
