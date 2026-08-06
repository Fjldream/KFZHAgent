<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api";
import { useSession } from "../stores/session";
import { useGsap } from "../composables/useGsap";
import type { Workspace } from "../types";

const router = useRouter();
const session = useSession();
const { gsap, track, reduceMotion } = useGsap();
const workspaces = ref<Workspace[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const busy = ref(false);
const newName = ref("");
const pageEl = ref<HTMLElement | null>(null);

/** 挂载即播：顶栏/创建卡片不等 API 返回（避免慢网络下整页空白）。 */
function playChromeEntrance(): void {
  const el = pageEl.value;
  if (el === null) return;
  if (reduceMotion()) {
    gsap.set(el.querySelectorAll(".topbar, .create-card"), { opacity: 1, y: 0 });
    return;
  }
  const tl = gsap.timeline();
  tl.fromTo(el.querySelector(".topbar"), { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" })
    .fromTo(el.querySelector(".create-card"), { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.35, ease: "power3.out" }, "-=0.12");
  track(tl);
}

/** 卡片列表加载后 stagger 级联入场（refresh 唯一入口，无重复播放）。 */
function playCardsEntrance(): void {
  const el = pageEl.value;
  if (el === null) return;
  const cards = el.querySelectorAll(".card");
  if (cards.length === 0) return;
  if (reduceMotion()) {
    gsap.set(cards, { opacity: 1, y: 0, scale: 1 });
    return;
  }
  const tl = gsap.timeline();
  tl.fromTo(
    cards,
    { opacity: 0, y: 14, scale: 0.97 },
    { opacity: 1, y: 0, scale: 1, stagger: 0.06, duration: 0.35, ease: "power3.out" },
  );
  track(tl);
}

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
  if (name.length === 0 || busy.value) return;
  busy.value = true;
  try {
    const created = await api.createWorkspace({ name, mode: "new" });
    await router.push(`/workspaces/${created.id}`);
  } finally {
    busy.value = false;
  }
}

async function onCreateUpload(): Promise<void> {
  const name = newName.value.trim();
  if (name.length === 0 || busy.value) return;
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

onMounted(() => {
  playChromeEntrance();
  void refresh();
});
</script>

<template>
  <div ref="pageEl" class="page">
    <header class="topbar glass">
      <div class="brand"><span class="logo">◈</span> 智绘</div>
      <div class="user">
        <span>{{ session.state.tenantName }}</span>
        <span>{{ session.state.user?.username ?? "" }}</span>
        <button type="button" data-testid="logout" @click="onLogout">退出</button>
      </div>
    </header>
    <main class="content">
      <section class="create-card">
        <h1>开始一个新方案</h1>
        <p class="sub">用自然语言描述需求，智绘帮你设计并构建 KingFusion 工程。</p>
        <input
          v-model="newName"
          data-testid="workspace-name"
          type="text"
          placeholder="方案名称，例如 客户展示大屏"
        />
        <div class="entry-actions">
          <button type="button" data-testid="create-workspace" :disabled="busy || newName.trim() === ''" @click="onCreate">
            新建工程
          </button>
          <button type="button" data-testid="upload-workspace" :disabled="busy || newName.trim() === ''" @click="onCreateUpload">
            上传工程
          </button>
        </div>
        <p class="hint">新建工程从确定性初始设计开始；上传工程导入 KF 原生 .gz 客户端包（无损保留未知字段）。</p>
        <p v-if="error" class="error" data-testid="workspace-error">{{ error }}</p>
      </section>

      <section class="list" data-testid="workspace-list">
        <h2>我的工程</h2>
        <p v-if="loading" class="empty">加载中…</p>
        <p v-else-if="workspaces.length === 0" class="empty">还没有工程，先新建一个吧。</p>
        <div v-else class="cards">
          <button
            v-for="ws in workspaces"
            :key="ws.id"
            type="button"
            class="card"
            :data-workspace-id="ws.id"
            @click="router.push(`/workspaces/${ws.id}`)"
          >
            <span class="card-name">{{ ws.name }}</span>
            <span class="card-mode">{{ ws.mode === "upload" ? "上传工程" : "新建工程" }}</span>
            <span class="card-time">修订 R{{ ws.currentRevisionId ? "· 进行中" : "—" }}</span>
          </button>
        </div>
      </section>
    </main>
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
.logo { color: var(--color-accent); }
.user { display: flex; align-items: center; gap: 0.8rem; font-size: 0.85rem; color: var(--color-text-secondary); }
.user button {
  padding: 0.4rem 0.9rem; border: none; border-radius: var(--radius-button);
  background: var(--color-surface); color: var(--color-text); cursor: pointer;
  box-shadow: var(--shadow-card);
}
.user button:active { transform: scale(0.97); }
.content { flex: 1; max-width: 56rem; width: 100%; margin: 2rem auto; padding: 0 1.4rem; display: flex; flex-direction: column; gap: 1.6rem; }
.create-card {
  background: var(--color-surface); border-radius: var(--radius-card); box-shadow: var(--shadow-card);
  padding: 2rem; display: flex; flex-direction: column; gap: 0.9rem;
  opacity: 0; /* GSAP 进入动画起点 */
}
.create-card h1 { margin: 0; font-size: 1.6rem; }
.sub { margin: 0; color: var(--color-text-secondary); }
.create-card input {
  padding: 0.7rem 0.9rem; border: 1px solid var(--color-border); border-radius: var(--radius-button); font-size: 1rem;
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
.list h2 { margin: 0 0 0.8rem; font-size: 1.1rem; }
.empty { color: var(--color-text-secondary); }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); gap: 1rem; }
.card {
  display: flex; flex-direction: column; gap: 0.3rem; text-align: left;
  background: var(--color-surface); border: none; border-radius: var(--radius-card);
  box-shadow: var(--shadow-card); padding: 1.2rem; cursor: pointer; color: inherit;
  opacity: 0; /* GSAP stagger 进入动画起点 */
  transition: transform 160ms var(--ease-out), box-shadow 160ms var(--ease-out);
}
@media (hover: hover) and (pointer: fine) {
  .card:hover { transform: translateY(-3px); box-shadow: var(--shadow-float); }
}
.card:active { transform: scale(0.98); }
.card-name { font-weight: 600; font-size: 1rem; }
.card-mode { color: var(--color-text-secondary); font-size: 0.8rem; }
.card-time { color: var(--color-text-secondary); font-size: 0.75rem; }
</style>
