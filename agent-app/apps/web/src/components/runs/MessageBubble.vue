<!-- modified by jinlong.feng at 2026-10-20 Agent工作台迭代 -->
<script setup lang="ts">
/** 消息气泡：用户右对齐强调色，助手浅色卡片；助手可选「决策摘要」label（≤600 字，来自受限业务结果）。 */
withDefaults(defineProps<{
  role: "user" | "assistant";
  text: string;
  label?: string;
  attachments?: Array<{ name: string; kind: "reference" | "material" }>;
}>(), { attachments: () => [] });
</script>

<template>
  <div class="msg" :class="role === 'user' ? 'msg-user' : 'msg-assistant'">
    <div v-if="role === 'user' && (attachments?.length ?? 0) > 0" class="tray">
      <span v-for="file in attachments" :key="file.name" class="attach">
        <span class="kind" :class="file.kind">{{ file.kind === "reference" ? "参考图" : "业务素材" }}</span>
        <span class="name">{{ file.name }}</span>
      </span>
    </div>

    <div :class="role === 'user' ? 'bubble-user' : 'bubble-ai'">
      <div v-if="label" class="ds-label">{{ label }}</div>
      {{ text }}
    </div>

    <div v-if="role === 'user' && (attachments?.length ?? 0) > 0" class="note">
      参考图默认不打包进交付工程 · 仅业务素材进入资源目录
    </div>
  </div>
</template>

<style scoped>
.msg { display: flex; flex-direction: column; gap: 6px; }
.msg-user { align-items: flex-end; }
.msg-assistant { align-items: flex-start; }

.bubble-user {
  max-width: 78%;
  padding: 10px 14px;
  border-radius: 16px 16px 4px 16px;
  background: var(--color-accent);
  color: #fff;
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.bubble-ai {
  max-width: 82%;
  padding: 12px 16px;
  border-radius: 16px 16px 16px 4px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-card);
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.ds-label {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 700;
  color: var(--color-text-secondary);
}

.tray { display: flex; gap: 8px; flex-wrap: wrap; }

.attach {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border-radius: 8px;
  background: var(--fill-quaternary);
  font-size: 11px;
}

.kind { padding: 1px 5px; border-radius: 5px; font-weight: 700; background: rgba(10, 132, 255, 0.12); color: var(--color-accent); }
.kind.material { background: rgba(52, 199, 89, 0.12); color: #1e9e43; }
.name { color: var(--color-text); }

.note { font-size: 11px; color: var(--color-text-secondary); }
</style>
<!-- end -->
