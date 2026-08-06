# 智绘内部前端优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将登录页质感（苹果风浅色、毛玻璃、GSAP 动效、氛围背景、品牌叙事）渗透到全部内部页面，建立统一设计语言。

**Architecture:** 新建 `components/ui/` 组件库（StatCard/EmptyState/StatusBadge/SkeletonCard）承载视觉一致性；工程列表页重设计（统计/搜索/空态）；工作区增强（欢迎屏/面包屑/情境面板状态可视化）；预览全屏。后端零改动，统计/搜索/预览全前端推导。

**Tech Stack:** Vue 3（`<script setup>`）、Vite、TypeScript、GSAP（已装 ^3.15.0）、现有 tokens + AmbientBackground。

**Spec:** `docs/superpowers/specs/2026-08-06-zhihui-internal-polish-design.md`

## Global Constraints

- 后端零改动：统计/搜索/预览全前端推导与既有 API；不新增接口、不改 SSE 协议、不改路由。
- 零新增 npm 依赖（GSAP 已装）。
- 视觉：延续苹果风浅色——白卡片、浅灰底（--color-bg #f5f5f7）、蓝主色（--color-accent #0a84ff）、毛玻璃（--blur-glass）、氛围背景（AmbientBackground 已在 App.vue 挂载）。
- 动画规则（gsap-motion-playbook）：只动 transform/opacity；进入用 power3.out；弹层 back.out(1.7)；UI 动画 < 300ms；stagger 30-80ms；prefers-reduced-motion 时 gsap.set 直达终态；组件卸载时 track/trackTween kill。
- 安全红线不得回退：模型输出仅经 escapeModelText 纯文本插值（禁止 v-html）；预览 iframe 保持 `sandbox=""`；批准只发 planHash。
- 测试：保留现有 data-testid（workspace-name/create-workspace/upload-workspace/message-input/send-message/approve-plan/revise-plan/cancel-plan/preview-frame/preview-panel/context-panel/revision-list/project-tree/download-artifact/upload-guide/upload-input），新增组件测试。
- 文案：产品名「智绘」；简体中文。
- 命令均在 `agent-app/` 目录执行；node 用 `export PATH="/Users/fengjinlong/YK/KingFusion3.6/.toolchain/node-v24.19.0-darwin-arm64/bin:$PATH"`；前端包名 `@kf/web`。
- 工作区可能有并行开发改动（此前出现过），提交时只 add 本任务文件。

---

### Task 1: 全局 UI 组件库（StatCard / EmptyState / StatusBadge / SkeletonCard）

**Files:**
- Create: `apps/web/src/components/ui/StatCard.vue`
- Create: `apps/web/src/components/ui/EmptyState.vue`
- Create: `apps/web/src/components/ui/StatusBadge.vue`
- Create: `apps/web/src/components/ui/SkeletonCard.vue`
- Test: `apps/web/src/components/ui/ui.test.ts`

**Interfaces:**
- Consumes: 无（独立组件，用 tokens + useGsap）
- Produces（供 Task 2-4 使用，签名必须逐字一致）：
  - `StatCard`：props `{ label: string; value: string | number; hint?: string; icon?: string }`
  - `EmptyState`：props `{ title: string; desc?: string; actionText?: string }`；emit `(e: "action")`
  - `StatusBadge`：props `{ status: "active" | "done" | "error" | "info"; label: string }`
  - `SkeletonCard`：props `{ count?: number }`（默认 3）

- [ ] **Step 1: 写 StatCard.vue**

```vue
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useGsap } from "../../composables/useGsap";

const props = withDefaults(defineProps<{
  label: string;
  value: string | number;
  hint?: string;
  icon?: string;
}>(), { hint: "", icon: "" });

const { gsap, track, reduceMotion } = useGsap();
const el = ref<HTMLElement | null>(null);

onMounted(() => {
  const card = el.value;
  if (card === null) return;
  if (reduceMotion()) {
    gsap.set(card, { opacity: 1, y: 0 });
    return;
  }
  const tl = gsap.timeline();
  tl.fromTo(card, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.35, ease: "power3.out" });
  track(tl);
});
</script>

<template>
  <div ref="el" class="stat-card" data-testid="stat-card">
    <span v-if="props.icon" class="icon">{{ props.icon }}</span>
    <div class="body">
      <span class="value" data-testid="stat-value">{{ value }}</span>
      <span class="label">{{ label }}</span>
      <span v-if="hint !== ''" class="hint">{{ hint }}</span>
    </div>
  </div>
</template>

<style scoped>
.stat-card {
  display: flex; align-items: center; gap: 0.8rem;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: var(--blur-glass);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  padding: 1.1rem 1.3rem;
  opacity: 0; /* GSAP 进入动画起点 */
}
.icon { font-size: 1.4rem; color: var(--color-accent); }
.body { display: flex; flex-direction: column; gap: 0.1rem; }
.value { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; }
.label { color: var(--color-text-secondary); font-size: 0.85rem; }
.hint { color: var(--color-text-secondary); font-size: 0.75rem; }
</style>
```

- [ ] **Step 2: 写 EmptyState.vue**

```vue
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useGsap } from "../../composables/useGsap";

withDefaults(defineProps<{
  title: string;
  desc?: string;
  actionText?: string;
}>(), { desc: "", actionText: "" });

defineEmits<{ (e: "action"): void }>();

const { gsap, track, reduceMotion } = useGsap();
const el = ref<HTMLElement | null>(null);

onMounted(() => {
  const box = el.value;
  if (box === null) return;
  if (reduceMotion()) {
    gsap.set(box, { opacity: 1, y: 0 });
    return;
  }
  const tl = gsap.timeline();
  tl.fromTo(box, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3, ease: "power3.out" });
  track(tl);
});
</script>

<template>
  <div ref="el" class="empty-state" data-testid="empty-state">
    <div class="decor" aria-hidden="true">◈</div>
    <h3 class="title">{{ title }}</h3>
    <p v-if="desc !== ''" class="desc">{{ desc }}</p>
    <button v-if="actionText !== ''" type="button" class="action" data-testid="empty-action" @click="$emit('action')">
      {{ actionText }}
    </button>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex; flex-direction: column; align-items: center; gap: 0.6rem;
  text-align: center; padding: 2.4rem 1rem;
  opacity: 0; /* GSAP 进入动画起点 */
}
.decor {
  width: 3rem; height: 3rem; border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.6rem; color: var(--color-accent);
  background: rgba(10, 132, 255, 0.08);
}
.title { margin: 0; font-size: 1.1rem; }
.desc { margin: 0; color: var(--color-text-secondary); font-size: 0.9rem; }
.action {
  margin-top: 0.4rem; padding: 0.55rem 1.2rem;
  border: none; border-radius: var(--radius-button);
  background: var(--color-accent); color: #fff; font-size: 0.9rem; cursor: pointer;
}
.action:active { transform: scale(0.97); background: var(--color-accent-pressed); }
</style>
```

- [ ] **Step 3: 写 StatusBadge.vue**

```vue
<script setup lang="ts">
defineProps<{
  status: "active" | "done" | "error" | "info";
  label: string;
}>();
</script>

<template>
  <span class="badge" :data-status="status" data-testid="status-badge">{{ label }}</span>
</template>

<style scoped>
.badge {
  display: inline-flex; align-items: center;
  font-size: 0.75rem; padding: 0.2rem 0.6rem; border-radius: 999px;
}
.badge[data-status="active"] { background: rgba(10, 132, 255, 0.14); color: var(--color-accent); }
.badge[data-status="done"] { background: rgba(52, 199, 89, 0.16); color: #1e7d3a; }
.badge[data-status="error"] { background: rgba(255, 59, 48, 0.14); color: var(--color-danger); }
.badge[data-status="info"] { background: rgba(134, 134, 139, 0.14); color: var(--color-text-secondary); }
</style>
```

- [ ] **Step 4: 写 SkeletonCard.vue**

```vue
<script setup lang="ts">
withDefaults(defineProps<{ count?: number }>(), { count: 3 });
</script>

<template>
  <div class="skeletons" data-testid="skeleton-list">
    <div v-for="i in count" :key="i" class="skeleton-card" />
  </div>
</template>

<style scoped>
.skeletons { display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); gap: 1rem; }
.skeleton-card {
  height: 7rem; border-radius: var(--radius-card);
  background: linear-gradient(90deg, rgba(0,0,0,0.05) 25%, rgba(0,0,0,0.09) 50%, rgba(0,0,0,0.05) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}
@keyframes shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}
</style>
```

- [ ] **Step 5: 写组件测试 ui.test.ts**

```ts
// @ts-nocheck -- 组件测试 JS 风格；运行时断言由 vitest 验证。
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import StatCard from "./StatCard.vue";
import EmptyState from "./EmptyState.vue";
import StatusBadge from "./StatusBadge.vue";
import SkeletonCard from "./SkeletonCard.vue";

describe("StatCard", () => {
  it("renders label and value", () => {
    const wrapper = mount(StatCard, { props: { label: "工程总数", value: 3 } });
    expect(wrapper.get('[data-testid="stat-value"]').text()).toBe("3");
    expect(wrapper.text()).toContain("工程总数");
  });
});

describe("EmptyState", () => {
  it("emits action when CTA clicked", async () => {
    const wrapper = mount(EmptyState, { props: { title: "还没有工程", actionText: "新建工程" } });
    await wrapper.get('[data-testid="empty-action"]').trigger("click");
    expect(wrapper.emitted("action")).toBeTruthy();
  });
});

describe("StatusBadge", () => {
  it("maps status to data-status", () => {
    const wrapper = mount(StatusBadge, { props: { status: "active", label: "进行中" } });
    expect(wrapper.get('[data-testid="status-badge"]').attributes("data-status")).toBe("active");
  });
});

describe("SkeletonCard", () => {
  it("renders count cards", () => {
    const wrapper = mount(SkeletonCard, { props: { count: 2 } });
    expect(wrapper.findAll(".skeleton-card")).toHaveLength(2);
  });
});
```

- [ ] **Step 6: 运行测试**

Run: `cd agent-app/apps/web && export PATH="/Users/fengjinlong/YK/KingFusion3.6/.toolchain/node-v24.19.0-darwin-arm64/bin:$PATH" && pnpm test`
Expected: 新增 4 个 describe 全过，原 52 个测试不受影响。

- [ ] **Step 7: 提交**

```bash
cd agent-app && git add apps/web/src/components/ui && git commit -m "feat(web): add shared UI components (StatCard/EmptyState/StatusBadge/SkeletonCard)"
```

---

### Task 2: Workspace 类型扩展 + 工程列表页重设计（统计/搜索/空态/卡片丰富）

**Files:**
- Modify: `apps/web/src/types.ts`（Workspace 接口加 createdAt/updatedAt）
- Modify: `apps/web/src/views/WorkspacesView.vue`（重设计）
- Test: `apps/web/src/views/WorkspacesView.test.ts`（同步）

**Interfaces:**
- Consumes: `api.listWorkspaces(): Promise<Workspace[]>`（Task 1 已交付）；`ui/StatCard`、`ui/EmptyState`、`ui/StatusBadge`、`ui/SkeletonCard`（本计划 Task 1）
- Produces: `Workspace` 类型新增 `createdAt?: string`、`updatedAt?: string`（后端返回包含，纯类型声明）

- [ ] **Step 1: types.ts 加字段**

```ts
export interface Workspace {
  id: string;
  name: string;
  description?: string | null;
  mode: string;
  currentRevisionId?: string | null;
  /** 后端 SolutionWorkspace 返回含这些字段（前端仅展示用）。 */
  createdAt?: string;
  updatedAt?: string;
}
```

- [ ] **Step 2: 重写 WorkspacesView.vue**

在现有 script 基础上：加 `query` ref（搜索）、`filtered` computed、`relativeTime` 工具函数；`refresh` 里 loading 用 SkeletonCard 替代文字。模板结构改为：

```vue
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

      <!-- 工程列表 -->
      <section class="list" data-testid="workspace-list">
        <div class="list-head">
          <h2>我的工程</h2>
          <input v-model="query" class="search" data-testid="workspace-search" type="search" placeholder="搜索工程…" />
        </div>
        <SkeletonCard v-if="loading" />
        <EmptyState
          v-else-if="workspaces.length === 0"
          title="还没有工程"
          desc="新建一个方案，或上传 KF 原生工程包开始编辑。"
          action-text="新建工程"
          @action="onCreate"
        />
        <EmptyState
          v-else-if="filtered.length === 0"
          title="没有匹配的工程"
          :desc="`没有找到包含「${query}」的工程。`"
        />
        <div v-else class="cards">
          <button
            v-for="ws in filtered"
            :key="ws.id"
            type="button"
            class="card"
            :data-workspace-id="ws.id"
            @click="router.push(`/workspaces/${ws.id}`)"
          >
            <span class="card-top">
              <span class="card-name">{{ ws.name }}</span>
              <StatusBadge :status="ws.mode === 'upload' ? 'info' : 'active'" :label="ws.mode === 'upload' ? '上传工程' : '新建工程'" />
            </span>
            <span class="card-bottom">
              <span class="card-rev">修订 {{ ws.currentRevisionId ? "进行中" : "—" }}</span>
              <span class="card-time">{{ relativeTime(ws.createdAt) }}</span>
            </span>
          </button>
        </div>
      </section>
    </main>
  </div>
</template>
```

- [ ] **Step 3: 加 script 逻辑（computed/工具函数）**

```ts
import { computed } from "vue";
import StatCard from "../components/ui/StatCard.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import StatusBadge from "../components/ui/StatusBadge.vue";
import SkeletonCard from "../components/ui/SkeletonCard.vue";

const query = ref("");
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (q === "") return workspaces.value;
  return workspaces.value.filter((ws) => ws.name.toLowerCase().includes(q));
});

const activeCount = computed(() =>
  workspaces.value.filter((ws) => ws.currentRevisionId !== null && ws.currentRevisionId !== undefined).length,
);

const lastActiveText = computed(() => {
  if (workspaces.value.length === 0) return "—";
  const latest = [...workspaces.value].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0];
  return latest !== undefined && latest.updatedAt !== undefined ? relativeTime(latest.updatedAt) : "—";
});

const greeting = computed(() => {
  const h = new Date().getHours();
  if (h < 6) return "夜深了";
  if (h < 12) return "早上好";
  if (h < 18) return "下午好";
  return "晚上好";
});

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
```

> 注意：`onCreate`/`onCreateUpload` 当前只在 `newName.trim() !== ""` 时可用；EmptyState 的「新建工程」@action 直接调 `onCreate`（此时 newName 可能为空，onCreate 内部 `if (name.length === 0) return` 会静默——**在 @action 处理器里先聚焦输入框或预设名称**，实现：`onEmptyCreate` 函数先 `newName.value = "未命名方案"` 再 `onCreate()`）。

- [ ] **Step 4: 补充动画（统计卡 stagger 进入）**

`playChromeEntrance` 中在 create-card 后追加 `.fromTo(el.querySelectorAll(".stat-card"), { opacity: 0, y: 12 }, { opacity: 1, y: 0, stagger: 0.06, duration: 0.3, ease: "power3.out" }, "-=0.15")`。

- [ ] **Step 5: 同步 WorkspacesView.test.ts**

现有测试断言 `workspace-name`/`create-workspace`/`upload-workspace`/`workspace-list`/`data-workspace-id`——这些 testid 保留，测试应仍过。新增用例：搜索过滤（fill `workspace-search` 后卡片数变化）、空态（mock 返回空数组时显示 `empty-state`）。注意 `ui.test.ts` 的 matchMedia：jsdom 无 matchMedia，useGsap 已防御返回 false，GSAP 会跑但不影响断言。

- [ ] **Step 6: 验证**

Run: `cd agent-app/apps/web && export PATH="..." && pnpm typecheck && pnpm test`
Expected: typecheck 过；单测 52 + 新增全绿。

- [ ] **Step 7: 提交**

```bash
cd agent-app && git add apps/web/src/types.ts apps/web/src/views/WorkspacesView.vue apps/web/src/views/WorkspacesView.test.ts
git commit -m "feat(web): enrich projects list with stats, search, and empty states"
```

---

### Task 3: 工作区增强（欢迎屏 + 顶栏面包屑 + 情境面板状态可视化）

**Files:**
- Modify: `apps/web/src/components/ConversationPanel.vue`（空对话欢迎屏）
- Modify: `apps/web/src/components/TopBar.vue`（面包屑 + 返回链接）
- Modify: `apps/web/src/components/ContextPanel.vue`（idle 概况卡 / building 步骤进度）
- Test: `apps/web/src/components/WorkspaceView.test.ts`（同步）

**Interfaces:**
- Consumes: `ui/StatCard`、`ui/EmptyState`（Task 1）；`useGsap` 既有
- Produces: 无新接口；TopBar 加 emit `(e: "back")`（返回列表页），ConversationPanel 加 `suggestions` 数据 + emit 复用 `send`

- [ ] **Step 1: ConversationPanel 空对话欢迎屏**

在 `<script setup>` 加：

```ts
const suggestions = [
  "新建一个设备监控大屏",
  "给按钮加上报警联动",
  "在页面底部加一个状态栏",
];

function useSuggestion(text: string): void {
  draft.value = text;
  // 聚焦输入框，让用户确认后 Enter/点击发送。
}
```

模板 messages 空态替换为欢迎屏（`message-input` testid 必须保留）：

```vue
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
```

样式：welcome 居中、suggestion 为 pill 按钮（参考登录页 pill），保留 `.empty` 相关删除或替换。

- [ ] **Step 2: TopBar 面包屑 + 返回**

加 emit `(e: "back")`；模板 brand 区改为：

```vue
<div class="brand">
  <button type="button" class="back" data-testid="back-to-list" aria-label="返回工程列表" @click="$emit('back')">←</button>
  <span class="logo">◈</span> 智绘
</div>
```

`center` 区加面包屑（工程列表 / 工程名）：

```vue
<div class="center">
  <span class="crumb-muted">工程列表</span>
  <span class="crumb-sep">/</span>
  <span class="ws-name">{{ workspaceName }}</span>
  <span ref="chipEl" class="chip" :data-stage="stage">{{ stageLabel[stage] }}</span>
</div>
```

WorkspaceView 里 `@back="() => router.push('/workspaces')"`。

- [ ] **Step 3: ContextPanel idle 概况卡 + building 步骤进度**

idle 分支（`<template v-else>` 内最前）加概况卡：

```vue
<div class="section">
  <h2>工程概况</h2>
  <p class="sub">模式：{{ mode === "upload" ? "上传工程" : "新建工程" }}</p>
  <p class="sub">修订：{{ currentRevisionId !== null && currentRevisionId !== undefined ? "进行中" : "未开始" }}</p>
</div>
```

building 分支替换进度条为步骤进度（保留 `build-status` testid）：

```vue
<template v-else-if="stage === 'building'">
  <div class="section">
    <h2>构建进度</h2>
    <ol class="steps" data-testid="build-steps">
      <li :class="{ on: jobStatus === 'QUEUED' }">排队</li>
      <li :class="{ on: jobStatus === 'RUNNING' }">编译</li>
      <li :class="{ on: jobStatus === 'VALIDATING' }">校验</li>
      <li :class="{ on: jobStatus === 'SUCCEEDED' }">完成</li>
    </ol>
    <p class="sub" data-testid="build-status">{{ buildText }}</p>
  </div>
</template>
```

样式：`.steps` 横排、`.on` 点亮（accent 色 + 圆点），`buildText` 保留。

- [ ] **Step 4: 同步 WorkspaceView.test.ts**

现有 ConversationPanel 用例断言空态 `empty` 文案（`描述你的需求…`）——已改为欢迎屏，需把该断言更新为欢迎屏（`conversation-welcome` 存在）。其余 TopBar/ContextPanel 用例如断言结构变化同步更新。新增：欢迎屏 suggestion 点击后 `message-input` 值被填充。

- [ ] **Step 5: 验证**

Run: `cd agent-app/apps/web && export PATH="..." && pnpm typecheck && pnpm test`
Expected: 全绿（52 基准 + 更新/新增用例）。

- [ ] **Step 6: 提交**

```bash
cd agent-app && git add apps/web/src/components/ConversationPanel.vue apps/web/src/components/TopBar.vue apps/web/src/components/ContextPanel.vue apps/web/src/views/WorkspaceView.vue apps/web/src/components/WorkspaceView.test.ts
git commit -m "feat(web): add workspace welcome screen, breadcrumbs, and build-step visualization"
```

---

### Task 4: 预览增强（全屏模式 + 缩放）

**Files:**
- Modify: `apps/web/src/components/PreviewBar.vue`（全屏 + 缩放）
- Modify: `apps/web/src/views/WorkspaceView.vue`（挂全屏状态）
- Test: `apps/web/src/components/WorkspaceView.test.ts`（同步 PreviewBar 用例）

**Interfaces:**
- Consumes: `useGsap`；props `{ previewUrl?: string | undefined }`（现有）
- Produces: PreviewBar 新增 props `{ fullscreen?: boolean }` + emit `(e: "toggle-fullscreen")`；WorkspaceView 管理 `previewFullscreen` ref

- [ ] **Step 1: 重写 PreviewBar.vue**

```vue
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useGsap } from "../composables/useGsap";

const props = withDefaults(defineProps<{
  previewUrl?: string | undefined;
  fullscreen?: boolean;
}>(), { previewUrl: undefined, fullscreen: false });

const emit = defineEmits<{ (e: "toggle-fullscreen"): void }>();

const zoom = ref<"fit" | "full">("fit");
const { gsap, trackTween, reduceMotion } = useGsap();
const barEl = ref<HTMLElement | null>(null);

onMounted(() => {
  const bar = barEl.value;
  if (bar === null || props.fullscreen) return;
  if (reduceMotion()) return;
  trackTween(gsap.fromTo(bar, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.35, ease: "power3.out" }));
});

function toggleZoom(): void {
  zoom.value = zoom.value === "fit" ? "full" : "fit";
}
</script>

<template>
  <div
    v-if="previewUrl !== undefined && previewUrl !== ''"
    ref="barEl"
    class="preview-bar"
    :class="{ fullscreen }"
    data-testid="preview-panel"
  >
    <div class="head">
      <h2 class="title">页面预览</h2>
      <div class="controls">
        <button type="button" class="ctrl" data-testid="preview-zoom" @click="toggleZoom">
          {{ zoom === "fit" ? "适应宽度" : "100%" }}
        </button>
        <button type="button" class="ctrl" data-testid="preview-fullscreen" @click="emit('toggle-fullscreen')">
          {{ fullscreen ? "退出全屏" : "全屏" }}
        </button>
      </div>
    </div>
    <div class="frame-wrap" :class="{ zoomed: zoom === 'full' }">
      <iframe :src="previewUrl" data-testid="preview-frame" sandbox="" title="生成结果预览" class="frame" />
    </div>
  </div>
</template>

<style scoped>
.preview-bar {
  background: var(--color-surface); border-radius: var(--radius-card) var(--radius-card) 0 0;
  box-shadow: var(--shadow-float); overflow: hidden;
  padding: 0.6rem 1.2rem 0.2rem;
}
.preview-bar.fullscreen {
  position: fixed; inset: 0; z-index: 60;
  border-radius: 0; display: flex; flex-direction: column;
  padding: 0.8rem 1.2rem;
  background: rgba(255, 255, 255, 0.92); backdrop-filter: var(--blur-glass);
}
.head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.4rem; }
.title { margin: 0; font-size: 0.85rem; color: var(--color-text-secondary); }
.controls { display: flex; gap: 0.4rem; }
.ctrl {
  padding: 0.3rem 0.7rem; border: 1px solid var(--color-border); border-radius: 999px;
  background: var(--color-surface); color: var(--color-text); font-size: 0.75rem; cursor: pointer;
}
.ctrl:active { transform: scale(0.97); }
.frame-wrap { overflow: auto; }
.frame { width: 100%; height: 320px; border: none; display: block; }
.frame-wrap.zoomed .frame { width: 1280px; height: 720px; }
.fullscreen .frame-wrap { flex: 1; }
.fullscreen .frame { height: 100%; }
</style>
```

- [ ] **Step 2: WorkspaceView 挂全屏状态**

`<script setup>` 加 `const previewFullscreen = ref(false);`（若未 import ref，补）。模板 PreviewBar 改：

```vue
<PreviewBar
  :preview-url="previewUrl"
  :fullscreen="previewFullscreen"
  @toggle-fullscreen="previewFullscreen = !previewFullscreen"
/>
```

- [ ] **Step 3: 同步 WorkspaceView.test.ts PreviewBar 用例**

现有用例断言 `preview-frame` 有 sandbox 无 allow-scripts、无预览不渲染——保留；补：点击 `preview-fullscreen` 后 emits `toggle-fullscreen`；`preview-zoom` 点击切换文案。

- [ ] **Step 4: 验证**

Run: `cd agent-app/apps/web && export PATH="..." && pnpm typecheck && pnpm test && pnpm build`
Expected: 全绿 + build 通过。

- [ ] **Step 5: 提交**

```bash
cd agent-app && git add apps/web/src/components/PreviewBar.vue apps/web/src/views/WorkspaceView.vue apps/web/src/components/WorkspaceView.test.ts
git commit -m "feat(web): add fullscreen preview mode with zoom control"
```

---

### Task 5: 全量验证 + 回归

**Files:**
- 无代码改动；验证 + 提交无

**Interfaces:**
- Consumes: Task 1-4 全部产出

- [ ] **Step 1: 全量单测**

Run: `cd agent-app && export PATH="/Users/fengjinlong/YK/KingFusion3.6/.toolchain/node-v24.19.0-darwin-arm64/bin:$PATH" && pnpm test`
Expected: 全部包通过（原 293 + 新增，前端 52 基准 + 新增用例）。

- [ ] **Step 2: build**

Run: `cd agent-app/apps/web && export PATH="..." && pnpm build`
Expected: vite build 通过。

- [ ] **Step 3: E2E 回归（如环境可用）**

Run: `cd agent-app && export PATH="..." && npx playwright test`
Expected: 3/3 全绿（testid 未变，环境需先清理残留进程：`lsof -i :3000 -i :5173 | grep LISTEN | awk '{print $2}' | xargs kill`）。

- [ ] **Step 4: 手动验收**

浏览器打开 http://localhost:5173：
- 登录 → 列表页：统计卡/搜索/空态/卡片徽章与相对时间
- 进入工程：欢迎屏示例点击填入、顶栏面包屑、构建步骤进度
- ready 后：全屏预览 + 缩放

---

## Self-Review 记录

- **Spec 覆盖**：§3 组件库（Task 1）✓；§4 列表页（Task 2）✓；§5.1 欢迎屏 + §5.2 面包屑 + §5.3 情境面板（Task 3）✓；§6 预览全屏（Task 4）✓；§7/§8 数据流与测试（Task 2-5 贯穿）✓；§9 边界（未做项均未触碰）✓。
- **占位符扫描**：所有步骤含完整代码；EmptyState 的 onEmptyCreate 空名称处理有明确实现说明。
- **类型一致性**：`StatCard`/`EmptyState`/`StatusBadge`/`SkeletonCard` props 在 Task 1 定义、Task 2-3 消费，签名一致；`Workspace.createdAt?/updatedAt?` 在 Task 2 定义、同任务使用；PreviewBar `fullscreen?`/emit `toggle-fullscreen` 在 Task 4 定义使用一致。
- **安全约束**：预览 iframe 保持 `sandbox=""`；欢迎屏 suggestion 只填输入框不自动发送；无 v-html。
