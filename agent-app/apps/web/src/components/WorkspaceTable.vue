<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import StatusBadge from "./ui/StatusBadge.vue";
import type { Workspace } from "../types";

/**
 * 工程表格（门户式）：列排序 + 行操作菜单。
 * 纯前端：排序/状态/相对时间全 computed 推导，后端零改动。
 */
const props = defineProps<{
  workspaces: Workspace[];
}>();

const emit = defineEmits<{
  (e: "delete", ws: Workspace): void;
}>();

const router = useRouter();

type SortKey = "name" | "updatedAt";
type SortDir = "asc" | "desc";

const sortKey = ref<SortKey>("updatedAt");
const sortDir = ref<SortDir>("desc");
/** 打开操作菜单的行 id（null = 无）。 */
const menuOpenId = ref<string | null>(null);

const sorted = computed(() => {
  const rows = [...props.workspaces];
  const dir = sortDir.value === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    if (sortKey.value === "name") {
      return a.name.localeCompare(b.name, "zh-CN") * dir;
    }
    return ((a.updatedAt ?? "").localeCompare(b.updatedAt ?? "") || (a.createdAt ?? "").localeCompare(b.createdAt ?? "")) * dir;
  });
  return rows;
});

function toggleSort(key: SortKey): void {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortKey.value = key;
    sortDir.value = key === "name" ? "asc" : "desc";
  }
}

function sortArrow(key: SortKey): string {
  if (sortKey.value !== key) return "↕";
  return sortDir.value === "asc" ? "↑" : "↓";
}

function toggleMenu(ws: Workspace): void {
  menuOpenId.value = menuOpenId.value === ws.id ? null : ws.id;
}

function openWorkspace(ws: Workspace): void {
  menuOpenId.value = null;
  void router.push(`/workspaces/${ws.id}`);
}

function onDelete(ws: Workspace): void {
  menuOpenId.value = null;
  emit("delete", ws);
}

function relativeTime(iso?: string): string {
  if (iso === undefined || iso === "") return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMin = Math.round((Date.now() - then) / 60_000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} 小时前`;
  const diffD = Math.round(diffH / 24);
  return `${diffD} 天前`;
}

function statusOf(ws: Workspace): { status: "active" | "done" | "error" | "info"; label: string } {
  return ws.currentRevisionId !== null && ws.currentRevisionId !== undefined
    ? { status: "active", label: "进行中" }
    : { status: "info", label: "未开始" };
}
</script>

<template>
  <div class="table-wrap" data-testid="workspace-table">
    <table class="table">
      <thead>
        <tr>
          <th class="col-name" data-testid="sort-name">
            <button type="button" class="th-btn" @click="toggleSort('name')">名称 {{ sortArrow("name") }}</button>
          </th>
          <th class="col-mode">模式</th>
          <th class="col-status">状态</th>
          <th class="col-time">
            <button type="button" class="th-btn" @click="toggleSort('updatedAt')">最近活跃 {{ sortArrow("updatedAt") }}</button>
          </th>
          <th class="col-actions">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="ws in sorted"
          :key="ws.id"
          class="row"
          :data-workspace-id="ws.id"
          tabindex="0"
          role="button"
          :aria-label="`打开工程 ${ws.name}`"
          @click="openWorkspace(ws)"
          @keydown.enter="openWorkspace(ws)"
        >
          <td class="cell-name">{{ ws.name }}</td>
          <td class="cell-mode">
            <StatusBadge
              :status="ws.mode === 'upload' ? 'info' : 'active'"
              :label="ws.mode === 'upload' ? '上传工程' : '新建工程'"
            />
          </td>
          <td class="cell-status">
            <StatusBadge :status="statusOf(ws).status" :label="statusOf(ws).label" />
          </td>
          <td class="cell-time">{{ relativeTime(ws.updatedAt) }}</td>
          <td class="cell-actions">
            <div class="menu-wrap">
              <button
                type="button"
                class="menu-btn"
                :data-testid="`workspace-menu-${ws.id}`"
                aria-label="工程操作"
                @click.stop="toggleMenu(ws)"
              >
                ⋯
              </button>
              <div
                v-if="menuOpenId === ws.id"
                class="menu"
                data-testid="workspace-menu"
                @click.stop
              >
                <button type="button" class="menu-item" data-testid="menu-open" @click="openWorkspace(ws)">进入</button>
                <button type="button" class="menu-item disabled" data-testid="menu-rename" disabled>重命名（即将推出）</button>
                <button type="button" class="menu-item disabled" data-testid="menu-copy" disabled>复制（即将推出）</button>
                <button type="button" class="menu-item danger" data-testid="menu-delete" @click="onDelete(ws)">删除</button>
              </div>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.table-wrap {
  background: var(--color-surface);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  overflow: hidden;
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.92rem;
}
.thead th {
  text-align: left;
  padding: 0.8rem 1.1rem;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  font-weight: 600;
  font-size: 0.8rem;
  letter-spacing: 0.02em;
}
.th-btn {
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
.th-btn:active { transform: scale(0.97); }
.row {
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
  transition: background 140ms var(--ease-out);
}
.row:last-child { border-bottom: none; }
.row:hover { background: rgba(10, 132, 255, 0.04); }
.row:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }
.row td { padding: 0.75rem 1.1rem; }
.cell-name { font-weight: 600; }
.cell-time { color: var(--color-text-secondary); font-size: 0.85rem; }
.cell-actions { text-align: right; }
.menu-wrap { position: relative; display: inline-block; }
.menu-btn {
  width: 2rem; height: 2rem; border: none; border-radius: 8px;
  background: transparent; color: var(--color-text-secondary);
  font-size: 1.1rem; cursor: pointer; line-height: 1;
  transition: background 140ms var(--ease-out), color 140ms var(--ease-out);
}
.menu-btn:hover { background: rgba(0, 0, 0, 0.05); color: var(--color-text); }
.menu-btn:active { transform: scale(0.94); }
.menu {
  position: absolute; right: 0; top: 110%;
  z-index: 20;
  min-width: 9.5rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  box-shadow: var(--shadow-float);
  padding: 0.3rem;
  display: flex;
  flex-direction: column;
}
.menu-item {
  border: none; background: none; text-align: left;
  padding: 0.5rem 0.7rem; border-radius: 7px;
  font-size: 0.88rem; color: var(--color-text); cursor: pointer;
}
.menu-item:hover:not(.disabled) { background: rgba(10, 132, 255, 0.08); }
.menu-item:active:not(.disabled) { transform: scale(0.98); }
.menu-item.danger { color: var(--color-danger); }
.menu-item.danger:hover { background: rgba(255, 59, 48, 0.1); }
.menu-item.disabled { color: var(--color-text-secondary); opacity: 0.6; cursor: default; }
</style>
