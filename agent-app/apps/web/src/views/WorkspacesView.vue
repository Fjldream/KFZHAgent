<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api";
import { useSession } from "../stores/session";
import { useGsap } from "../composables/useGsap";
import StatCard from "../components/ui/StatCard.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import SkeletonCard from "../components/ui/SkeletonCard.vue";
import BrandLogo from "../components/BrandLogo.vue";
import WorkspaceTable from "../components/WorkspaceTable.vue";
import type { Workspace } from "../types";

const router = useRouter();
const session = useSession();
const { gsap, track, reduceMotion } = useGsap();
const workspaces = ref<Workspace[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const busy = ref(false);
const newName = ref("");
const nameInput = ref<HTMLInputElement | null>(null);
const createError = ref<string | null>(null);
const pageEl = ref<HTMLElement | null>(null);
const query = ref("");

/** 搜索过滤：空查询返回全部，否则按名称模糊匹配。 */
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (q === "") return workspaces.value;
  return workspaces.value.filter((ws) => ws.name.toLowerCase().includes(q));
});

/** 进行中 = 已生成首版修订的工程。 */
const activeCount = computed(() =>
  workspaces.value.filter((ws) => ws.currentRevisionId !== null && ws.currentRevisionId !== undefined).length,
);

/** 最近活跃 = updatedAt 最新的工程时间（没有则占位）。 */
const lastActiveText = computed(() => {
  if (workspaces.value.length === 0) return "—";
  const latest = [...workspaces.value].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0];
  return latest !== undefined && latest.updatedAt !== undefined ? relativeTime(latest.updatedAt) : "—";
});

/** 分时段问候语。 */
const greeting = computed(() => {
  const h = new Date().getHours();
  if (h < 6) return "夜深了";
  if (h < 12) return "早上好";
  if (h < 18) return "下午好";
  return "晚上好";
});

/** 把 ISO 时间转成「x 分钟/小时/天前」的友好文案。 */
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

/** 挂载即播：顶栏/创建卡片/统计卡不等 API 返回（避免慢网络下整页空白）。 */
function playChromeEntrance(): void {
  const el = pageEl.value;
  if (el === null) return;
  if (reduceMotion()) {
    gsap.set(el.querySelectorAll(".topbar, .create-card, .stat-card"), { opacity: 1, y: 0 });
    return;
  }
  const tl = gsap.timeline();
  tl.fromTo(el.querySelector(".topbar"), { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" })
    .fromTo(el.querySelector(".create-card"), { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.35, ease: "power3.out" }, "-=0.12")
    .fromTo(el.querySelectorAll(".stat-card"), { opacity: 0, y: 12 }, { opacity: 1, y: 0, stagger: 0.06, duration: 0.3, ease: "power3.out" }, "-=0.15");
  track(tl);
}

/** 卡片列表加载后 stagger 级联入场（refresh 唯一入口，无重复播放）。
 * 表格行入场：逐行淡入（用 tbody tr 选择器）。 */
function playCardsEntrance(): void {
  const el = pageEl.value;
  if (el === null) return;
  const rows = el.querySelectorAll(".table tbody tr");
  if (rows.length === 0) return;
  if (reduceMotion()) {
    gsap.set(rows, { opacity: 1, y: 0 });
    return;
  }
  const tl = gsap.timeline();
  tl.fromTo(
    rows,
    { opacity: 0, y: 8 },
    { opacity: 1, y: 0, stagger: 0.05, duration: 0.3, ease: "power3.out" },
  );
  track(tl);
}

// 搜索过滤后新渲染的行无 inline opacity，CSS 无初始隐藏（表格行不设 opacity:0），
// 但排序变化时重播入场动画增强反馈。watch filtered 引用变化时重播。
let firstFilteredRender = true;
watch(
  filtered,
  () => {
    if (firstFilteredRender) {
      firstFilteredRender = false;
      return;
    }
    void nextTick(() => playCardsEntrance());
  },
);

async function refresh(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    workspaces.value = await api.listWorkspaces();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
    await nextTick();
    playCardsEntrance();
  }
}

async function onCreate(): Promise<void> {
  const name = newName.value.trim();
  if (busy.value) return;
  if (name.length === 0) {
    createError.value = "请先输入方案名称";
    nameInput.value?.focus();
    return;
  }
  createError.value = null;
  busy.value = true;
  try {
    const created = await api.createWorkspace({ name, mode: "new" });
    await router.push(`/workspaces/${created.id}`);
  } finally {
    busy.value = false;
  }
}

/** 空态「新建工程」按钮：输入框无内容时先预设名称，避免静默无响应。 */
function onEmptyCreate(): void {
  newName.value = "未命名方案";
  void onCreate();
}

async function onCreateUpload(): Promise<void> {
  const name = newName.value.trim();
  if (busy.value) return;
  if (name.length === 0) {
    createError.value = "请先输入方案名称";
    nameInput.value?.focus();
    return;
  }
  createError.value = null;
  busy.value = true;
  try {
    const created = await api.createWorkspace({ name, mode: "upload" });
    await router.push(`/workspaces/${created.id}`);
  } finally {
    busy.value = false;
  }
}

async function onLogout(): Promise<void> {
  await session.logout();
  await router.push("/login");
}

/** 列表页删除：点击卡片上的删除按钮打开确认弹层（卡片本体点击仍进入详情）。 */
const deletingWs = ref<Workspace | null>(null);
const deleteBusy = ref(false);
const listError = ref<string | null>(null);

function onDeleteCard(ws: Workspace): void {
  deletingWs.value = ws;
}

async function onConfirmDelete(): Promise<void> {
  if (deleteBusy.value || deletingWs.value === null) return;
  deleteBusy.value = true;
  listError.value = null;
  try {
    await api.deleteWorkspace(deletingWs.value.id);
    deletingWs.value = null;
    await refresh();
  } catch (e) {
    listError.value = e instanceof Error ? e.message : String(e);
  } finally {
    deleteBusy.value = false;
  }
}

function onCancelDelete(): void {
  if (deleteBusy.value) return;
  deletingWs.value = null;
}

onMounted(() => {
  playChromeEntrance();
  void refresh();
});
</script>

<template>
  <div ref="pageEl" class="page">
    <header class="topbar glass">
      <div class="brand"><BrandLogo :size="26" /></div>
      <div class="user">
        <span>{{ session.state.tenantName }}</span>
        <span>{{ session.state.user?.username ?? "" }}</span>
        <button type="button" data-testid="logout" @click="onLogout">退出</button>
      </div>
    </header>
    <main class="content">
      <!-- 欢迎区 -->
      <section class="welcome">
        <h1 class="welcome-title">{{ greeting }}，{{ session.state.user?.username ?? "朋友" }}</h1>
        <p class="welcome-sub">用一句话描述需求，智绘帮你生成并构建 KingFusion 工程。</p>
      </section>

      <!-- 统计概览 -->
      <section class="stats" data-testid="workspace-stats">
        <StatCard label="工程总数" :value="workspaces.length" icon="◈" />
        <StatCard label="进行中" :value="activeCount" icon="◎" />
        <StatCard label="最近活跃" :value="lastActiveText" icon="⏱" />
      </section>

      <!-- 创建区 -->
      <section class="create-card">
        <h2>开始一个新方案</h2>
        <input
          ref="nameInput"
          v-model="newName"
          data-testid="workspace-name"
          type="text"
          placeholder="方案名称，例如 客户展示大屏"
          :aria-invalid="createError !== null"
          aria-describedby="create-workspace-error"
          @input="createError = null"
        />
        <div class="entry-actions">
          <button type="button" data-testid="create-workspace" :disabled="busy" @click="onCreate">
            新建工程
          </button>
          <button type="button" data-testid="upload-workspace" :disabled="busy" @click="onCreateUpload">
            上传工程
          </button>
        </div>
        <p class="hint">新建工程从确定性初始设计开始；上传工程导入 KF 原生 .gz 客户端包（无损保留未知字段）。</p>
        <p
          v-if="createError"
          id="create-workspace-error"
          class="error"
          data-testid="create-workspace-error"
          role="alert"
        >{{ createError }}</p>
        <p v-if="error" class="error" data-testid="workspace-error">{{ error }}</p>
      </section>

      <!-- 工程列表 -->
      <section class="list" data-testid="workspace-list">
        <div class="list-head">
          <h2>我的工程</h2>
          <input v-model="query" class="search" data-testid="workspace-search" type="search" placeholder="搜索工程…" />
        </div>
        <SkeletonCard v-if="loading" />
        <EmptyState
          v-else-if="error !== null"
          title="加载失败"
          :desc="error"
          action-text="重试"
          @action="refresh"
        />
        <EmptyState
          v-else-if="workspaces.length === 0"
          title="还没有工程"
          desc="新建一个方案，或上传 KF 原生工程包开始编辑。"
          action-text="新建工程"
          @action="onEmptyCreate"
        />
        <EmptyState
          v-else-if="filtered.length === 0"
          title="没有匹配的工程"
          :desc="`没有找到包含「${query}」的工程。`"
        />
        <WorkspaceTable v-else :workspaces="filtered" @delete="onDeleteCard" />
      </section>
    </main>

    <!-- 列表页删除确认弹层（Task：列表页删除入口，与详情页交互一致）。 -->
    <div v-if="deletingWs !== null" class="delete-scrim" data-testid="delete-confirm-list" @click.self="onCancelDelete">
      <section class="delete-sheet" role="alertdialog" aria-modal="true" aria-labelledby="delete-confirm-list-title">
        <h2 id="delete-confirm-list-title">删除工程</h2>
        <p class="delete-warning">删除后不可恢复，确定要删除「{{ deletingWs.name }}」吗？</p>
        <p v-if="listError" class="error" data-testid="delete-list-error">{{ listError }}</p>
        <footer class="delete-actions">
          <button type="button" class="delete-cancel" :disabled="deleteBusy" @click="onCancelDelete">取消</button>
          <button type="button" class="delete-confirm" data-testid="delete-confirm-list-action" :disabled="deleteBusy" @click="onConfirmDelete">
            {{ deleteBusy ? "删除中…" : "确认删除" }}
          </button>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
.page { position: relative; z-index: 1; min-height: 100vh; display: flex; flex-direction: column; }
.glass {
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: var(--blur-glass);
  border-bottom: 1px solid var(--color-border);
}
.topbar { display: flex; align-items: center; justify-content: space-between; padding: 0.8rem 1.4rem; opacity: 0; }
.brand { display: flex; align-items: center; gap: 0.5rem; font-weight: 600; font-size: 1.05rem; }
.user { display: flex; align-items: center; gap: 0.8rem; font-size: 0.85rem; color: var(--color-text-secondary); }
.user button {
  padding: 0.4rem 0.9rem; border: none; border-radius: var(--radius-button);
  background: var(--color-surface); color: var(--color-text); cursor: pointer;
  box-shadow: var(--shadow-card);
}
.user button:active { transform: scale(0.97); }
.content { flex: 1; max-width: 56rem; width: 100%; margin: 2rem auto; padding: 0 1.4rem; display: flex; flex-direction: column; gap: 1.6rem; }
.welcome { display: flex; flex-direction: column; gap: 0.3rem; }
.welcome-title { margin: 0; font-size: 1.7rem; letter-spacing: -0.01em; }
.welcome-sub { margin: 0; color: var(--color-text-secondary); }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: 1rem; }
.create-card {
  background: var(--color-surface); border-radius: var(--radius-card); box-shadow: var(--shadow-card);
  padding: 2rem; display: flex; flex-direction: column; gap: 0.9rem;
  opacity: 0; /* GSAP 进入动画起点 */
}
.create-card h2 { margin: 0; font-size: 1.25rem; }
.create-card input {
  padding: 0.7rem 0.9rem; border: 1px solid var(--color-border); border-radius: var(--radius-button); font-size: 1rem;
  background: var(--color-bg);
}
.entry-actions { display: flex; gap: 0.8rem; }
.entry-actions button {
  padding: 0.6rem 1.2rem; border: none; border-radius: var(--radius-button);
  background: var(--color-accent); color: #fff; font-size: 0.95rem; cursor: pointer;
}
.entry-actions button:active { transform: scale(0.97); background: var(--color-accent-pressed); }
.entry-actions button:disabled { opacity: 0.5; cursor: not-allowed; }
.entry-actions button + button { background: var(--color-surface); color: var(--color-accent); border: 1px solid var(--color-border); }
.hint { color: var(--color-text-secondary); font-size: 0.85rem; margin: 0; }
.error { color: var(--color-danger); margin: 0; font-size: 0.85rem; }
.list { display: flex; flex-direction: column; gap: 0.8rem; }
.list-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
.list-head h2 { margin: 0; font-size: 1.1rem; }
.search {
  padding: 0.45rem 0.8rem; border: 1px solid var(--color-border); border-radius: var(--radius-button);
  font-size: 0.9rem; background: var(--color-bg); min-width: 12rem;
}
/* 列表页删除确认弹层：复用详情页 delete-scrim/sheet 模式。 */
.delete-scrim {
  position: fixed; inset: 0; z-index: 50;
  background: rgba(0, 0, 0, 0.35); backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center; padding: 1.5rem;
}
.delete-sheet {
  width: min(24rem, 92vw);
  background: rgba(255, 255, 255, 0.92); backdrop-filter: var(--blur-glass);
  border-radius: var(--radius-sheet); box-shadow: var(--shadow-float);
  padding: 1.4rem 1.5rem 1.3rem;
}
.delete-sheet h2 { margin: 0 0 0.4rem; font-size: 1.15rem; }
.delete-warning { margin: 0; color: var(--color-text-secondary); font-size: 0.9rem; line-height: 1.5; }
.delete-actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 1.1rem; }
.delete-actions button { padding: 0.55rem 1.1rem; border-radius: 999px; font-size: 0.9rem; cursor: pointer; }
.delete-confirm { border: none; background: var(--color-danger); color: #fff; }
.delete-cancel { border: 1px solid var(--color-border); background: transparent; color: var(--color-text); }
.delete-actions button:active { transform: scale(0.97); }
.delete-actions button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
