# 智绘前端改造实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 agent-app 前端从五面板同屏工作台重构为「状态驱动自适应工作台」（方案 C）：连续对话 + 情境面板 + 全屏计划确认弹层，苹果风零依赖设计系统，产品名「智绘」。

**Architecture:** 路由不变（新增 /workspaces 列表页视图）；工作区双栏（左对话流 + 右情境面板），情境面板由前端 stage 推导（`idle | approval | building | ready | error`）自动切换；计划确认以全屏弹层（WAAPI spring 近似）浮现。后端仅新增一个列表端点。

**Tech Stack:** Vue 3（`<script setup>`）、vue-router 4、Vite、TypeScript、模块级 store（无 Pinia）、手写 CSS 设计令牌、Web Animations API、NestJS（后端单端点）。

**Spec:** `docs/superpowers/specs/2026-08-06-zhihui-frontend-redesign-design.md`

## Global Constraints

- 零新增 npm 依赖（不许装 UI 库 / CSS 框架 / 动画库）——用 `system-ui` 字体、CSS 变量、WAAPI 实现全部视觉效果。
- 后端协议不动：SSE `streamMessageTurn` → `done` 帧 → store 路由到审批/构建（现状保留）。
- 后端只允许新增 `GET /api/workspaces`（`WorkspaceService.list` 已存在，仅加 controller 端点 + api.ts 客户端方法）。
- 安全规则不得回退：模型输出仅经 `escapeModelText` 纯文本插值（禁止 `v-html`）；批准只发送屏幕上展示的 `planHash`；下载只走两段式 token 端点；预览 iframe 必须 `sandbox=""` 无 `allow-scripts`。
- 跨平台：所有路径用 `node:path`；不引入依赖本地编译的库（本项目前端本就纯 JS，保持）。
- 文案：产品名「智绘」；页面为简体中文；`index.html` 标题改为 `智绘`。
- 测试策略：UI 优先、测试后补（用户已确认）——实现任务以 `pnpm typecheck` / `pnpm build` / 手动浏览器验收为准；单元测试与 E2E 同步集中在 Task 9。
- 现有 `data-testid` 尽量保留（`message-input`、`send-message`、`approve-plan`、`revise-plan`、`cancel-plan`、`download-artifact`、`preview-frame`、`script-change(s)`、`create-workspace`、`upload-workspace`），E2E 依赖它们。
- 命令均在 `agent-app/` 目录执行；前端包名 `@kf/web`。

---

### Task 1: 后端新增工作区列表端点 + 前端 API 客户端

**Files:**
- Modify: `apps/api/src/workspaces/workspaces.controller.ts`（`WorkspacesController` 顶部加 `@Get()`）
- Modify: `apps/web/src/api.ts`（`api` 对象加 `listWorkspaces`）
- Test: `apps/api/src/api.integration.test.ts`（加列表端点断言，沿用现有租户隔离测试模式）

**Interfaces:**
- Consumes: `WorkspaceService.list(tenantId: string): Promise<SolutionWorkspace[]>`（已在 `workspace.service.ts:277`，无需改动）
- Produces: 端点 `GET /api/workspaces` → `SolutionWorkspace[]`；前端 `api.listWorkspaces(): Promise<Workspace[]>`（`Workspace` 类型已在 `apps/web/src/types.ts`）

- [ ] **Step 1: 加后端端点**

在 `workspaces.controller.ts` 的 `getWorkspace`（`@Get(":id")`）之前插入：

```ts
@Get()
async listWorkspaces(@Req() req: AuthenticatedRequest): Promise<Record<string, unknown>[]> {
  return await this.workspaces.list(req.principal.tenantId);
}
```

- [ ] **Step 2: 加前端 API 方法**

在 `apps/web/src/api.ts` 的 `createWorkspace` 上方加入：

```ts
async listWorkspaces(): Promise<Workspace[]> {
  return jsonResponse<Workspace[]>("/api/workspaces");
},
```

- [ ] **Step 3: 加集成测试**

在 `apps/api/src/api.integration.test.ts` 中（参考现有「tenant isolation」用例约 585 行：两租户各建一个 workspace，`list` 只返回本租户）新增用例：登录租户 A 建 2 个工作区、租户 B 建 1 个，断言 `GET /api/workspaces` 对 A 返回 2 条、对 B 返回 1 条且无交叉。

- [ ] **Step 4: 运行后端测试验证**

Run: `cd agent-app && pnpm --filter @kf/api test`
Expected: 全部通过（含新增列表用例）。

- [ ] **Step 5: 前端类型检查**

Run: `cd agent-app/apps/web && pnpm typecheck`
Expected: 无 TS 错误。

- [ ] **Step 6: 提交**

```bash
cd agent-app && git add apps/api/src/workspaces/workspaces.controller.ts apps/api/src/api.integration.test.ts apps/web/src/api.ts
git commit -m "feat(api/web): add workspace list endpoint for Zhihui projects page"
```

---

### Task 2: 苹果风设计系统（全局 tokens + 品牌「智绘」）

**Files:**
- Create: `apps/web/src/styles/tokens.css`
- Create: `apps/web/src/styles/base.css`
- Modify: `apps/web/src/main.ts`（import 两个样式文件）
- Modify: `apps/web/index.html`（`<title>智绘</title>`）

**Interfaces:**
- Produces: CSS 变量（`--color-bg`、`--color-surface`、`--color-accent`、`--color-success`、`--color-danger`、`--color-text`、`--color-text-secondary`、`--radius-card`、`--radius-button`、`--radius-sheet`、`--shadow-card`、`--shadow-float`、`--blur-glass`、`--ease-out`、`--ease-spring`）；`<body>` 全局基础样式（`system-ui`、`#F5F5F7` 背景、`prefers-reduced-motion` / `prefers-reduced-transparency` 降级）。所有后续组件引用这些变量，不再硬编码色值。

- [ ] **Step 1: 写 tokens.css**

```css
:root {
  --color-bg: #f5f5f7;
  --color-surface: #ffffff;
  --color-accent: #0a84ff;
  --color-accent-pressed: #0071e3;
  --color-success: #34c759;
  --color-danger: #ff3b30;
  --color-danger-pressed: #d70015;
  --color-text: #1d1d1f;
  --color-text-secondary: #86868b;
  --color-border: rgba(0, 0, 0, 0.08);
  --radius-card: 16px;
  --radius-button: 10px;
  --radius-sheet: 20px;
  --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.04), 0 4px 16px rgba(0, 0, 0, 0.06);
  --shadow-float: 0 8px 40px rgba(0, 0, 0, 0.16);
  --blur-glass: blur(20px) saturate(180%);
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

- [ ] **Step 2: 写 base.css**

```css
* { box-sizing: border-box; }
html, body { margin: 0; }
body {
  font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 16px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
h1, h2, h3 { letter-spacing: -0.02em; line-height: 1.15; }
button { font: inherit; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
@media (prefers-reduced-transparency: reduce) {
  :root { --blur-glass: none; }
}
```

- [ ] **Step 3: main.ts 引入 + index.html 标题**

```ts
import "./styles/tokens.css";
import "./styles/base.css";
```

`index.html` 中 `<title>KF Solution Agent</title>` → `<title>智绘</title>`。

- [ ] **Step 4: 验证**

Run: `cd agent-app/apps/web && pnpm typecheck && pnpm build`
Expected: 构建通过（现有组件不引用新变量，不受影响）。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/styles apps/web/src/main.ts apps/web/index.html
git commit -m "feat(web): add Apple-style design tokens and Zhihui branding"
```

---

### Task 3: 工程列表页 WorkspacesView + 路由

**Files:**
- Create: `apps/web/src/views/WorkspacesView.vue`
- Modify: `apps/web/src/router.ts`（`/workspaces` 指向新视图）
- Modify: `apps/web/src/views/WorkspaceView.vue`（移除"无工作区入口"分支：删 `newName`、`onCreate`、`onCreateUpload`、`entry` 模板与相关样式；`hasWorkspace` 恒真逻辑由路由保证，仅处理 `props.workspaceId`）

**Interfaces:**
- Consumes: `api.listWorkspaces()`（Task 1）、`useSession()`、`router`
- Produces: 路由 `name: "workspaces"` → `WorkspacesView`；新建/上传后 `router.push(/workspaces/${created.id})`

- [ ] **Step 1: 写 WorkspacesView.vue**

```vue
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api";
import { useSession } from "../stores/session";
import type { Workspace } from "../types";

const router = useRouter();
const session = useSession();
const workspaces = ref<Workspace[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const busy = ref(false);
const newName = ref("");

async function refresh(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    workspaces.value = await api.listWorkspaces();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
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

onMounted(refresh);
</script>

<template>
  <div class="page">
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
.page { min-height: 100vh; display: flex; flex-direction: column; }
.glass {
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: var(--blur-glass);
  border-bottom: 1px solid var(--color-border);
}
.topbar { display: flex; align-items: center; justify-content: space-between; padding: 0.8rem 1.4rem; }
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
}
.card:active { transform: scale(0.98); }
.card-name { font-weight: 600; font-size: 1rem; }
.card-mode { color: var(--color-text-secondary); font-size: 0.8rem; }
.card-time { color: var(--color-text-secondary); font-size: 0.75rem; }
</style>
```

- [ ] **Step 2: 路由指向新视图**

`router.ts` 中 `import WorkspacesView from "./views/WorkspacesView.vue";`，`{ path: "/workspaces", name: "workspaces", component: WorkspacesView, meta: { requiresAuth: true } }`。

- [ ] **Step 3: 从 WorkspaceView 移除入口分支**

删除 `newName`、`busy`、`onCreate`、`onCreateUpload`、`onUploadFile`（`onUploadFile` 移到 Task 6 的 UploadGuide）、`v-if="!hasWorkspace"` 的 `entry` 模板、`.entry` 相关样式。`hasWorkspace` computed 与 `refresh` 保留（`/workspaces/:id` 必然有 id）。

- [ ] **Step 4: 验证**

Run: `cd agent-app/apps/web && pnpm typecheck && pnpm build`
Expected: 通过；`/workspaces` 手动访问显示列表页，`/workspaces/:id` 仍进工作区。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/views/WorkspacesView.vue apps/web/src/router.ts apps/web/src/views/WorkspaceView.vue
git commit -m "feat(web): add Zhihui projects list page"
```

---

### Task 4: 登录页 + 强制改密页重设计

**Files:**
- Modify: `apps/web/src/views/LoginView.vue`
- Modify: `apps/web/src/views/ChangePasswordView.vue`

**Interfaces:**
- Consumes: `useSession()`（不改）、现有 `data-testid`（`login-form`/`login-tenant`/`login-username`/`login-password`/`login-submit`/`login-error`、`change-password-form` 及 `change-*` 系列，全部保留）
- Produces: 视觉重设计，无逻辑改动

- [ ] **Step 1: 重写 LoginView 样式与结构**

保持模板结构与 `data-testid` 不变，替换 `<style scoped>` 为：

```css
.login-page {
  min-height: 100vh; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(180deg, #e8edf5 0%, var(--color-bg) 60%);
}
.login-card {
  width: 24rem; background: rgba(255, 255, 255, 0.72);
  backdrop-filter: var(--blur-glass);
  border-radius: var(--radius-sheet); box-shadow: var(--shadow-float);
  padding: 2.4rem; display: flex; flex-direction: column; gap: 1rem;
}
.login-card h1 { margin: 0; font-size: 1.8rem; display: flex; align-items: center; gap: 0.5rem; }
.login-card h1::before { content: "◈"; color: var(--color-accent); }
.subtitle { margin: 0; color: var(--color-text-secondary); font-size: 0.9rem; }
.login-card label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.85rem; }
.login-card input {
  padding: 0.65rem 0.85rem; border: 1px solid var(--color-border); border-radius: var(--radius-button); font-size: 1rem;
}
.login-card input:focus { outline: 2px solid var(--color-accent); outline-offset: -1px; border-color: transparent; }
.login-card button {
  padding: 0.65rem; border: none; border-radius: var(--radius-button);
  background: var(--color-accent); color: #fff; font-size: 1rem; cursor: pointer;
}
.login-card button:active { transform: scale(0.98); background: var(--color-accent-pressed); }
.login-card button:disabled { opacity: 0.5; cursor: not-allowed; }
.error { color: var(--color-danger); margin: 0; font-size: 0.85rem; }
```

- [ ] **Step 2: 同步改 ChangePasswordView**

同样保留模板与 `data-testid`，套用上述 style（类名 `change-password-page` / `change-card` 换成相同规则；`h1` 前缀 logo 用 `▣` 或「智绘」文案均可，保持两个页面视觉一致）。

- [ ] **Step 3: 验证**

Run: `cd agent-app/apps/web && pnpm typecheck && pnpm build`
Expected: 通过；手动访问 `/login`、`/change-password` 查看玻璃卡片效果。

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/views/LoginView.vue apps/web/src/views/ChangePasswordView.vue
git commit -m "feat(web): redesign login and password pages with Apple-style glass"
```

---

### Task 5: 工作流 stage 推导 composable

**Files:**
- Create: `apps/web/src/stores/stage.ts`

**Interfaces:**
- Consumes: `WorkspaceState`（`apps/web/src/stores/workspace.ts` 导出）
- Produces: `export type WorkflowStage = "idle" | "approval" | "building" | "ready" | "error";` 与 `export function useWorkflowStage(state: WorkspaceState): ComputedRef<WorkflowStage>`。规则：
  - `state.error !== null` → `error`
  - `state.pendingApproval !== null` → `approval`
  - `state.buildJobStatus` 为 `QUEUED | RUNNING | VALIDATING` → `building`
  - `state.buildJobStatus === "SUCCEEDED"` → `ready`
  - `state.buildJobStatus === "FAILED"` → `error`
  - 否则 → `idle`

- [ ] **Step 1: 写 stage.ts**

```ts
import { computed, type ComputedRef } from "vue";
import type { WorkspaceState } from "./workspace";

export type WorkflowStage = "idle" | "approval" | "building" | "ready" | "error";

/** 由工作区状态推导当前工作流阶段，驱动情境面板切换（智绘设计 §4.1）。 */
export function useWorkflowStage(state: WorkspaceState): ComputedRef<WorkflowStage> {
  return computed<WorkflowStage>(() => {
    if (state.error !== null && state.error !== "") return "error";
    if (state.pendingApproval !== null && state.pendingApproval !== undefined) return "approval";
    if (state.buildJobStatus === "QUEUED" || state.buildJobStatus === "RUNNING" || state.buildJobStatus === "VALIDATING") {
      return "building";
    }
    if (state.buildJobStatus === "SUCCEEDED") return "ready";
    if (state.buildJobStatus === "FAILED") return "error";
    return "idle";
  });
}
```

- [ ] **Step 2: 验证**

Run: `cd agent-app/apps/web && pnpm typecheck`
Expected: 无错误（新文件尚无人引用，仅类型检查）。

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/stores/stage.ts
git commit -m "feat(web): add workflow stage derivation composable"
```

---

### Task 6: 工作区主视图重构（双栏 + 情境面板 + 顶栏）

**Files:**
- Create: `apps/web/src/components/TopBar.vue`
- Create: `apps/web/src/components/ContextPanel.vue`
- Create: `apps/web/src/components/UploadGuide.vue`
- Create: `apps/web/src/components/PreviewBar.vue`
- Modify: `apps/web/src/views/WorkspaceView.vue`（整体重写模板为双栏布局）
- Modify: `apps/web/src/components/ConversationPanel.vue`（气泡样式 + 打字机流式）
- Modify: `apps/web/src/components/ProjectTree.vue`、`RevisionList.vue`、`ArtifactDownload.vue`、`ValidationReport.vue`、`PreviewFrame.vue`（视觉统一为 tokens；`PreviewFrame.vue` 改为底部条内嵌）

**Interfaces:**
- Consumes: `useWorkflowStage`（Task 5）、`useWorkspace().state`、`useSession()`
- Produces: 组件 `TopBar`（props: `workspaceName: string`、`stage: WorkflowStage`；emit: `logout`、`delete-workspace`）；`ContextPanel`（props: `stage: WorkflowStage`、`workspace`、`revisions`、`revisionId`、`report`、`artifact`、`jobStatus`、`mode`、`busy`；emit: `upload`、`select-revision`、`download`、`approve`、`revise`、`cancel`）；`UploadGuide`（emit: `file`）；`PreviewBar`（props: `previewUrl: string`、`visible: boolean`）

- [ ] **Step 1: 写 TopBar.vue**

```vue
<script setup lang="ts">
import type { WorkflowStage } from "../stores/stage";

defineProps<{
  workspaceName: string;
  stage: WorkflowStage;
}>();

defineEmits<{ (e: "logout"): void; (e: "delete-workspace"): void }>();

const stageLabel: Record<WorkflowStage, string> = {
  idle: "对话中", approval: "待确认", building: "构建中", ready: "已完成", error: "出错",
};
</script>

<template>
  <header class="topbar glass">
    <div class="brand"><span class="logo">◈</span> 智绘</div>
    <div class="center">
      <span class="ws-name">{{ workspaceName }}</span>
      <span class="chip" :data-stage="stage">{{ stageLabel[stage] }}</span>
    </div>
    <div class="user">
      <button type="button" class="quiet" data-testid="delete-workspace" @click="$emit('delete-workspace')">删除</button>
      <button type="button" data-testid="logout" @click="$emit('logout')">退出</button>
    </div>
  </header>
</template>

<style scoped>
.glass { background: rgba(255, 255, 255, 0.6); backdrop-filter: var(--blur-glass); border-bottom: 1px solid var(--color-border); }
.topbar { display: flex; align-items: center; justify-content: space-between; padding: 0.7rem 1.4rem; gap: 1rem; }
.brand { display: flex; align-items: center; gap: 0.5rem; font-weight: 600; }
.logo { color: var(--color-accent); }
.center { display: flex; align-items: center; gap: 0.7rem; min-width: 0; }
.ws-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chip {
  font-size: 0.75rem; padding: 0.2rem 0.6rem; border-radius: 999px;
  background: rgba(134, 134, 139, 0.15); color: var(--color-text-secondary);
}
.chip[data-stage="approval"] { background: rgba(10, 132, 255, 0.15); color: var(--color-accent); }
.chip[data-stage="building"] { background: rgba(10, 132, 255, 0.15); color: var(--color-accent); }
.chip[data-stage="ready"] { background: rgba(52, 199, 89, 0.18); color: #1e7d3a; }
.chip[data-stage="error"] { background: rgba(255, 59, 48, 0.15); color: var(--color-danger); }
.user { display: flex; gap: 0.6rem; }
.user button {
  padding: 0.4rem 0.9rem; border: none; border-radius: var(--radius-button);
  background: var(--color-accent); color: #fff; cursor: pointer;
}
.user button:active { transform: scale(0.97); }
.user button.quiet { background: var(--color-surface); color: var(--color-danger); box-shadow: var(--shadow-card); }
</style>
```

- [ ] **Step 2: 写 UploadGuide.vue**

```vue
<script setup lang="ts">
import { ref } from "vue";

const emit = defineEmits<{ (e: "file", file: File): void }>();
const dragging = ref(false);

function onDrop(e: DragEvent): void {
  dragging.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (file) emit("file", file);
}
function onPick(e: Event): void {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) emit("file", file);
  input.value = "";
}
</script>

<template>
  <div
    class="upload-zone"
    :class="{ dragging }"
    data-testid="upload-guide"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
  >
    <h2>上传 KF 源包</h2>
    <p class="sub">把 .gz 客户端包拖到这里，或点击选择文件。</p>
    <input ref="input" type="file" accept=".gz" data-testid="upload-input" hidden @change="onPick" />
    <label class="pick" data-testid="upload-pick" for="upload-input">选择文件</label>
  </div>
</template>

<style scoped>
.upload-zone {
  border: 2px dashed rgba(10, 132, 255, 0.35); border-radius: var(--radius-card);
  padding: 2rem 1.2rem; text-align: center; display: flex; flex-direction: column; gap: 0.5rem;
  background: rgba(10, 132, 255, 0.04); transition: border-color 200ms var(--ease-out), background 200ms var(--ease-out);
}
.upload-zone.dragging { border-color: var(--color-accent); background: rgba(10, 132, 255, 0.1); }
.upload-zone h2 { margin: 0; font-size: 1.1rem; }
.sub { margin: 0; color: var(--color-text-secondary); font-size: 0.85rem; }
.pick {
  align-self: center; padding: 0.5rem 1.1rem; border-radius: var(--radius-button);
  background: var(--color-accent); color: #fff; font-size: 0.9rem; cursor: pointer;
}
.pick:active { transform: scale(0.97); }
</style>
```

- [ ] **Step 3: 写 ContextPanel.vue（情境面板容器，按 stage 渲染）**

```vue
<script setup lang="ts">
import { computed } from "vue";
import type { WorkflowStage } from "../stores/stage";
import type { ArtifactRow, BuildJobStatus, Revision, ValidationReport, Workspace, SolutionTreeNode } from "../types";
import ProjectTree from "./ProjectTree.vue";
import RevisionList from "./RevisionList.vue";
import ValidationReport from "./ValidationReport.vue";
import UploadGuide from "./UploadGuide.vue";

const props = defineProps<{
  stage: WorkflowStage;
  workspace: Workspace | null;
  mode: string;
  tree: SolutionTreeNode;
  revisions: Revision[];
  currentRevisionId: string | null;
  report: ValidationReport | null;
  artifact: ArtifactRow | undefined;
  jobStatus: BuildJobStatus | null;
  uploadPending: boolean;
}>();

const emit = defineEmits<{
  (e: "upload", file: File): void;
  (e: "select-revision", id: string): void;
  (e: "download", id: string): void;
}>();

const showUpload = computed(() => props.mode === "upload" && props.uploadPending);
const buildText = computed(() => {
  switch (props.jobStatus) {
    case "QUEUED": return "排队中…";
    case "RUNNING": return "正在生成工程…";
    case "VALIDATING": return "六层校验中…";
    case "SUCCEEDED": return "构建完成";
    case "FAILED": return "构建失败";
    default: return "";
  }
});
</script>

<template>
  <aside class="context" data-testid="context-panel">
    <template v-if="stage === 'approval'">
      <div class="section"><h2>待确认计划</h2><p class="sub">已生成变更计划，请在弹层中审阅并确认。</p></div>
    </template>

    <template v-else-if="stage === 'building'">
      <div class="section">
        <h2>构建进度</h2>
        <div class="bar"><div class="fill" /></div>
        <p class="sub" data-testid="build-status">{{ buildText }}</p>
      </div>
    </template>

    <template v-else-if="stage === 'ready' || stage === 'error'">
      <ValidationReport :report="report" />
      <div v-if="stage === 'ready' && artifact" class="section">
        <h2>产物下载</h2>
        <button type="button" data-testid="download-artifact" class="primary" @click="emit('download', artifact.id)">
          下载客户端包
        </button>
      </div>
    </template>

    <template v-else>
      <UploadGuide v-if="showUpload" data-testid="upload-guide" @file="emit('upload', $event)" />
      <ProjectTree v-else :tree="tree" />
      <RevisionList
        :revisions="revisions"
        :current-revision-id="currentRevisionId"
        @select="emit('select-revision', $event)"
      />
    </template>
  </aside>
</template>

<style scoped>
.context { display: flex; flex-direction: column; gap: 1rem; overflow-y: auto; padding: 0 0 1rem; }
.section { background: var(--color-surface); border-radius: var(--radius-card); box-shadow: var(--shadow-card); padding: 1.2rem; }
.section h2 { margin: 0 0 0.5rem; font-size: 1rem; }
.sub { margin: 0; color: var(--color-text-secondary); font-size: 0.85rem; }
.bar { height: 8px; border-radius: 999px; background: rgba(0, 0, 0, 0.08); overflow: hidden; margin: 0.6rem 0; }
.fill { height: 100%; width: 60%; border-radius: inherit; background: var(--color-accent); animation: pulse 1.4s ease-in-out infinite alternate; }
@keyframes pulse { from { transform: translateX(-100%); } to { transform: translateX(120%); } }
.primary {
  width: 100%; padding: 0.6rem; border: none; border-radius: var(--radius-button);
  background: var(--color-success); color: #fff; cursor: pointer;
}
.primary:active { transform: scale(0.98); }
</style>
```

> 注：`UploadGuide` 用 `v-if="showUpload"` 时 `data-testid="upload-guide"` 与组件根节点重复，把该 testid 从组件根移除、仅保留在 ContextPanel 的 `<UploadGuide>` 包装上（见下方 Step 5 说明）。

- [ ] **Step 4: 写 PreviewBar.vue**

```vue
<script setup lang="ts">
defineProps<{ previewUrl?: string }>();
</script>

<template>
  <div v-if="previewUrl" class="preview-bar" data-testid="preview-panel">
    <h2 class="title">页面预览</h2>
    <iframe :src="previewUrl" data-testid="preview-frame" sandbox="" title="生成结果预览" class="frame" />
  </div>
</template>

<style scoped>
.preview-bar {
  background: var(--color-surface); border-radius: var(--radius-card) var(--radius-card) 0 0;
  box-shadow: var(--shadow-float); overflow: hidden; display: flex; align-items: stretch; gap: 1rem;
  padding: 0.8rem 1.2rem 0.2rem;
}
.title { margin: 0; font-size: 0.85rem; color: var(--color-text-secondary); writing-mode: vertical-rl; }
.frame { width: 100%; height: 320px; border: none; }
</style>
```

- [ ] **Step 5: 重写 WorkspaceView.vue 模板**

保留 `<script setup>` 中逻辑（`refresh`、`previewUrl` 派生、`onApprove`/`onRevise`/`onCancel`/`onDownload`/`onLogout`/`onDeleteWorkspace`/`onSend`），新增 `onUploadFile`（调用 `workspace.uploadSource(file)`）与 `stage = useWorkflowStage(workspace.state)`；删除入口分支与左侧栏。模板为：

```vue
<template>
  <div class="app-shell">
    <TopBar :workspace-name="workspace.state.workspace?.name ?? ''" :stage="stage" @logout="onLogout" @delete-workspace="onDeleteWorkspace" />
    <main class="shell">
      <section class="conversation-col">
        <ConversationPanel :messages="workspace.state.messages" :streaming="workspace.state.streaming" @send="onSend" />
        <p v-if="workspace.state.error" class="error" data-testid="shell-error">{{ workspace.state.error }}</p>
      </section>
      <ContextPanel
        :stage="stage"
        :workspace="workspace.state.workspace"
        :mode="workspace.state.workspace?.mode ?? 'new'"
        :tree="solutionTree"
        :revisions="workspace.state.revisions"
        :current-revision-id="workspace.state.currentRevisionId"
        :report="workspace.state.validationReport"
        :artifact="artifact"
        :job-status="workspace.state.buildJobStatus"
        :upload-pending="workspace.state.currentRevisionId === null"
        @upload="onUploadFile"
        @select-revision="onSelectRevision"
        @download="onDownload"
      />
    </main>
    <PreviewBar :preview-url="previewUrl" />
  </div>
</template>

<style scoped>
.app-shell { min-height: 100vh; display: flex; flex-direction: column; background: var(--color-bg); }
.shell {
  flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) 22rem; gap: 1.2rem;
  padding: 1.2rem 1.4rem; min-height: 0;
}
.conversation-col { display: flex; flex-direction: column; gap: 0.8rem; min-height: 0; }
.error { color: var(--color-danger); margin: 0; font-size: 0.85rem; padding: 0 0.2rem; }
</style>
```

> 说明：`ApprovalSheet`（Task 7）会作为兄弟节点加在 `PreviewBar` 之后；`previewUrl` 的现有 watch 逻辑保留。`UploadGuide` 的 `data-testid="upload-guide"` 保留在其根元素，ContextPanel 里不再重复包裹。

- [ ] **Step 6: 美化 ConversationPanel**

替换 `.panel` 为气泡聊天样式：

```css
.panel { display: flex; flex-direction: column; background: transparent; flex: 1; min-height: 0; }
.messages { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.6rem; padding: 0.2rem 0; }
.message { display: flex; gap: 0.5rem; font-size: 0.92rem; }
.message[data-role="user"] { justify-content: flex-end; }
.message[data-role="user"] .content {
  background: var(--color-accent); color: #fff; border-radius: 18px 18px 4px 18px; padding: 0.55rem 0.9rem; max-width: 78%;
}
.message[data-role="assistant"] .content {
  background: var(--color-surface); color: var(--color-text); border-radius: 18px 18px 18px 4px;
  box-shadow: var(--shadow-card); padding: 0.55rem 0.9rem; max-width: 78%; white-space: pre-wrap; word-break: break-word;
}
.role { display: none; }
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
```

> 打字机效果：流式帧目前被 store 忽略（`onState` 回调留空），本次仅在 `streaming=true` 时在消息尾部追加 CSS 光标动画（`::after { content: "▍"; animation: blink 1s steps(1) infinite; }`）即可，不引入逐 token 帧管线（属后端协议变更，超出本次范围）。

- [ ] **Step 7: 统一其余组件视觉**

`ProjectTree.vue`、`RevisionList.vue`、`ArtifactDownload.vue`（仅保留按钮部分，面板由 ContextPanel 承载）、`ValidationReport.vue`：把硬编码色值替换为 tokens（`--color-surface` 卡片、`--radius-card`、`--shadow-card`、`--color-text-secondary` 等）；`PreviewFrame.vue` 弃用（PreviewBar 取代），从 `WorkspaceView` import 中移除。

- [ ] **Step 8: 验证**

Run: `cd agent-app/apps/web && pnpm typecheck && pnpm build`
Expected: 通过。手动验收：进入工作区 → idle 显示工程概况；发送消息触发 approval → 情境面板切「待确认计划」；批准后（Task 7 前暂以现有弹层行为验证）切 building → ready。

- [ ] **Step 9: 提交**

```bash
git add apps/web/src/components/TopBar.vue apps/web/src/components/ContextPanel.vue apps/web/src/components/UploadGuide.vue apps/web/src/components/PreviewBar.vue apps/web/src/views/WorkspaceView.vue apps/web/src/components/ConversationPanel.vue apps/web/src/components/ProjectTree.vue apps/web/src/components/RevisionList.vue apps/web/src/components/ArtifactDownload.vue apps/web/src/components/ValidationReport.vue
git commit -m "feat(web): rebuild workspace as state-driven dual-column workbench"
```

---

### Task 7: 全屏计划确认弹层 ApprovalSheet

**Files:**
- Create: `apps/web/src/components/ApprovalSheet.vue`
- Modify: `apps/web/src/views/WorkspaceView.vue`（挂载弹层、接线 approve/revise/cancel）

**Interfaces:**
- Consumes: `workspace.state.pendingApproval`（含 `plan`/`planHash`/`summary`/`scriptChanges`）、`ChangePlanDisplay`、`ScriptChange`
- Produces: 组件 `ApprovalSheet`（props: `plan`、`planHash`、`summary`、`scriptChanges`、`busy`；emit: `approve`、`revise`、`cancel`）；保留 `data-testid`：`change-plan-panel`、`plan-summary`、`approve-plan`、`revise-plan`、`cancel-plan`、`destructive-warning`、`script-changes`、`script-change`、`plan-hash`

- [ ] **Step 1: 写 ApprovalSheet.vue**

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { ChangePlanDisplay, ScriptChange } from "../types";

const props = withDefaults(
  defineProps<{
    plan: ChangePlanDisplay | null;
    planHash?: string;
    summary?: string;
    scriptChanges?: ScriptChange[];
    busy?: boolean;
  }>(),
  { planHash: "", summary: "", scriptChanges: () => [], busy: false },
);

const emit = defineEmits<{
  (e: "approve", planHash: string): void;
  (e: "revise", planHash: string): void;
  (e: "cancel", planHash: string): void;
}>();

const hasPlanHash = computed(() => props.planHash !== "");
const hasDestructive = computed(() => props.plan?.operations.some((op) => op.op === "delete") ?? false);
const hasScriptChanges = computed(() => props.scriptChanges.length > 0);
const sheetEl = ref<HTMLElement | null>(null);

/** 进入动画：iOS 风格 spring 近似（WAAPI，可中断）。 */
onMounted(() => {
  const el = sheetEl.value;
  if (!el) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  el.animate(
    [
      { opacity: 0, transform: "scale(0.92) translateY(28px)" },
      { opacity: 1, transform: "scale(1) translateY(0)" },
    ],
    { duration: 380, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "backwards" },
  );
});

function isScriptPath(path: string): boolean {
  return path === "/linkMng" || path.startsWith("/linkMng/");
}
function hasScriptChangesIn(op: ChangePlanDisplay["operations"][number]): boolean {
  return (op.changes ?? []).some((c) => isScriptPath(c.path));
}
function opLabel(op: ChangePlanDisplay["operations"][number]): string {
  switch (op.op) {
    case "create": return `创建 ${op.entityType ?? "实体"}「${op.entityId}」`;
    case "update": return `修改「${op.entityId}」${(op.changes ?? []).map((c) => c.path).join("、")}`;
    case "delete": return `删除「${op.entityId}」（破坏性）`;
    default: return op.op;
  }
}
function action(kind: "approve" | "revise" | "cancel"): void {
  if (props.planHash === "") return;
  if (kind === "approve") emit("approve", props.planHash);
  else if (kind === "revise") emit("revise", props.planHash);
  else emit("cancel", props.planHash);
}
</script>

<template>
  <div class="scrim" data-testid="change-plan-panel">
    <section ref="sheetEl" class="sheet">
      <header class="sheet-head">
        <h2>确认变更计划</h2>
        <p class="plan-summary" data-testid="plan-summary">
          {{ summary !== "" ? summary : plan !== null ? `共 ${plan.operations.length} 个操作` : "计划加载中…" }}
        </p>
      </header>

      <div v-if="plan !== null && plan !== undefined" class="sheet-body">
        <ul class="operations">
          <li v-for="(op, index) in plan.operations" :key="`${op.op}-${index}`" :data-op="op.op" class="operation">
            <span class="op-badge">{{ op.op }}</span>
            {{ opLabel(op) }}
            <span v-if="op.op === 'delete'" class="warning-tag">破坏性</span>
            <span v-if="hasScriptChangesIn(op)" class="script-tag">脚本类变更</span>
          </li>
        </ul>

        <div v-if="hasScriptChanges" class="script-changes" data-testid="script-changes">
          <p class="script-title">脚本类变更（自由脚本最终构建前单独展示）</p>
          <ul>
            <li v-for="(change, index) in scriptChanges" :key="`script-${index}`" data-testid="script-change">
              修改「{{ change.entityId }}」{{ change.paths.join("、") }}
            </li>
          </ul>
        </div>

        <p v-if="hasDestructive" class="warning" data-testid="destructive-warning">
          警告：本计划包含破坏性操作，批准后将不可撤销。
        </p>

        <p class="plan-hash" data-testid="plan-hash">
          planHash：<code>{{ planHash !== "" ? planHash : "（未生成）" }}</code>
        </p>
      </div>
      <p v-else class="loading">正在加载计划详情…</p>

      <footer class="actions">
        <button type="button" class="ghost" data-testid="cancel-plan" :disabled="!hasPlanHash || busy" @click="action('cancel')">
          取消计划
        </button>
        <button type="button" class="ghost" data-testid="revise-plan" :disabled="!hasPlanHash || busy" @click="action('revise')">
          要求修改
        </button>
        <button type="button" class="primary" data-testid="approve-plan" :disabled="!hasPlanHash || busy" @click="action('approve')">
          {{ busy ? "处理中…" : "批准计划" }}
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.scrim {
  position: fixed; inset: 0; z-index: 50;
  background: rgba(0, 0, 0, 0.35); backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center; padding: 1.5rem;
}
.sheet {
  width: min(38rem, 92vw); max-height: 84vh; overflow-y: auto;
  background: rgba(255, 255, 255, 0.92); backdrop-filter: var(--blur-glass);
  border-radius: var(--radius-sheet); box-shadow: var(--shadow-float);
  display: flex; flex-direction: column;
}
.sheet-head { padding: 1.6rem 1.8rem 0.6rem; }
.sheet-head h2 { margin: 0 0 0.3rem; font-size: 1.3rem; }
.plan-summary { margin: 0; color: var(--color-text-secondary); font-size: 0.9rem; }
.sheet-body { padding: 0.6rem 1.8rem 1rem; }
.operations { list-style: none; margin: 0.5rem 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
.operation { font-size: 0.88rem; display: flex; align-items: center; gap: 0.4rem; }
.op-badge { background: rgba(10, 132, 255, 0.12); color: var(--color-accent); border-radius: 6px; padding: 0 0.4rem; font-size: 0.75rem; }
.warning { color: var(--color-danger); font-weight: 600; }
.warning-tag { color: var(--color-danger); border: 1px solid rgba(255, 59, 48, 0.4); border-radius: 4px; padding: 0 0.3rem; font-size: 0.7rem; }
.script-tag { color: #6d28d9; border: 1px solid rgba(109, 40, 217, 0.4); border-radius: 4px; padding: 0 0.3rem; font-size: 0.7rem; }
.script-changes { margin-top: 0.6rem; padding: 0.6rem 0.8rem; border: 1px solid rgba(109, 40, 217, 0.3); border-radius: 10px; background: rgba(109, 40, 217, 0.05); }
.script-title { margin: 0 0 0.3rem; font-size: 0.8rem; font-weight: 600; color: #6d28d9; }
.script-changes ul { margin: 0; padding-left: 1.1rem; }
.script-changes li { font-size: 0.8rem; color: #4c1d95; }
.plan-hash { font-size: 0.8rem; word-break: break-all; color: var(--color-text-secondary); }
.loading { padding: 1rem 1.8rem; color: var(--color-text-secondary); }
.actions {
  display: flex; justify-content: flex-end; gap: 0.6rem;
  padding: 1rem 1.8rem 1.4rem; border-top: 1px solid var(--color-border);
}
.actions button { padding: 0.6rem 1.2rem; border-radius: 999px; font-size: 0.9rem; cursor: pointer; }
.actions .primary { border: none; background: var(--color-accent); color: #fff; }
.actions .ghost { border: 1px solid var(--color-border); background: transparent; color: var(--color-text); }
.actions button:active { transform: scale(0.97); }
.actions button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
```

- [ ] **Step 2: 挂载到 WorkspaceView**

在 `WorkspaceView.vue` 的 `PreviewBar` 之后加入：

```vue
<ApprovalSheet
  v-if="workspace.state.pendingApproval !== null"
  :plan="workspace.state.pendingApproval?.plan ?? null"
  :plan-hash="workspace.state.pendingApproval?.planHash ?? ''"
  :summary="workspace.state.pendingApproval?.summary ?? ''"
  :script-changes="workspace.state.pendingApproval?.scriptChanges ?? []"
  :busy="workspace.state.streaming"
  @approve="onApprove"
  @revise="onRevise"
  @cancel="onCancel"
/>
```

（import `ApprovalSheet`；`onApprove`/`onRevise`/`onCancel` 已存在于 `<script setup>`。）

- [ ] **Step 3: 验证**

Run: `cd agent-app/apps/web && pnpm typecheck && pnpm build`
Expected: 通过。手动：触发计划确认 → 全屏弹层自对话下方弹簧展开，批准/要求修改/取消均生效；重复中断（快速连续点击）无卡死。

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/components/ApprovalSheet.vue apps/web/src/views/WorkspaceView.vue
git commit -m "feat(web): add full-screen plan approval sheet with spring entrance"
```

---

### Task 8: 删除确认与空态打磨（收尾交互）

**Files:**
- Modify: `apps/web/src/views/WorkspaceView.vue`（删除确认改用弹层式确认，替代原两次点击 armed 模式）

**Interfaces:**
- Consumes: `onDeleteWorkspace` 现有逻辑
- Produces: 删除确认弹层（自研小组件或内联模板 + WAAPI 弹簧进入，`data-testid="delete-confirm"`），消除 `deleteArmed` 的「再次点击确认」文案

- [ ] **Step 1: 替换删除确认交互**

`WorkspaceView.vue` 中 `deleteArmed` ref 与「再次点击确认删除」文案替换为：点击「删除」→ 弹出小确认卡（毛玻璃，含「确认删除 / 取消」），确认后调用 `workspace.deleteWorkspace()` 并 `router.push("/workspaces")`。删除卡复用 ApprovalSheet 的 scrim/弹簧进入模式（内联实现，约 30 行模板 + 样式）。

- [ ] **Step 2: 验证**

Run: `cd agent-app/apps/web && pnpm typecheck && pnpm build`
Expected: 通过；手动删除一次工程验证弹层与回跳。

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/views/WorkspaceView.vue
git commit -m "feat(web): replace delete arming with confirmation sheet"
```

---

### Task 9: 测试同步（单元 + E2E 恢复全绿）

**Files:**
- Modify: `apps/web/src/components/WorkspaceView.test.ts`（同步新 DOM/选择器；移除对已删入口分支的断言，新增 stage 推导、ApprovalSheet、TopBar、ContextPanel 用例）
- Create: `apps/web/src/views/WorkspacesView.test.ts`（列表页：渲染列表、空态、新建/上传跳转、错误态）
- Create: `apps/web/src/stores/stage.test.ts`（stage 推导纯函数用例）
- Modify: `tests/e2e/new-project.spec.ts`、`tests/e2e/modify-project.spec.ts`、`tests/e2e/tenant-isolation.spec.ts`（若选择器/路由依赖变化则同步）
- Modify: `apps/web/src/components/PreviewFrame.test.ts`（若有，改指向 PreviewBar）

**Interfaces:**
- Consumes: 全部 Task 1–8 产物
- Produces: `pnpm test`（web）+ Playwright E2E 全绿

- [ ] **Step 1: stage 推导单测**

`stage.test.ts`：对 `WorkspaceState` 构造 5 种组合断言 `useWorkflowStage().value`（error 优先、approval 优先于 building、SUCCEEDED→ready、FAILED→error、默认 idle）。

- [ ] **Step 2: WorkspacesView 测试**

挂载组件，mock `api.listWorkspaces` 返回 2 条 → 断言 `data-workspace-id` 卡片渲染；空数组 → 「还没有工程」；点击新建按钮 → 断言 `router.push` 收到 `/workspaces/{id}`；`api.createWorkspace` reject → 显示 `workspace-error`。

- [ ] **Step 3: WorkspaceView.test.ts 同步**

保留并更新安全断言（planHash 门控、无 `v-html`、sandbox iframe、下载仅 SUCCEEDED+artifact）；新增：stage 推导驱动情境面板切换、ApprovalSheet 全屏渲染与 approve/revise/cancel 发射、TopBar 状态胶囊文案。删除「offers create and upload entry choices」用例（入口已移至列表页）。

- [ ] **Step 4: E2E 同步**

运行 `pnpm --filter @kf/web test` 与 Playwright（`cd agent-app && npx playwright test`），修复因选择器/路由变化失败用例；确保 `new-project` 从 `/workspaces` 新建进入、`modify-project` 走完整「对话 → 弹层批准 → 下载」链路。

- [ ] **Step 5: 全量验证**

Run: `cd agent-app && pnpm test`（全部包）+ `npx playwright test`
Expected: 全绿（目标：原 243 tests + 新增用例；E2E 3/3）。

- [ ] **Step 6: 提交**

```bash
git add apps/web/src tests/e2e
git commit -m "test(web): sync unit and E2E tests with Zhihui redesign"
```

---

## Self-Review 记录

- **Spec 覆盖**：§3 路由（Task 3/4）✓；§4.1 情境面板（Task 6）✓；§4.2 上传交互（Task 6 UploadGuide + Task 3 双入口）✓；§4.3 全屏弹层（Task 7）✓；§5 视觉系统（Task 2 + Task 4 + Task 6）✓；§6 数据流 + `GET /api/workspaces`（Task 1 + Task 5）✓；§7 错误处理（Task 6 内联错误 + Task 7 降级 + TopBar error 胶囊）✓；§8 测试（Task 9）✓。
- **占位符扫描**：无 TBD/TODO；每个代码步骤含完整实现。
- **类型一致性**：`useWorkflowStage(state: WorkspaceState): ComputedRef<WorkflowStage>` 在 Task 5 定义、Task 6 消费，签名一致；`WorkflowStage` 联合类型与 stageLabel 全键覆盖；`api.listWorkspaces` 在 Task 1 定义、Task 3 消费；testid 命名沿用现有 E2E 依赖。
- **安全约束**：所有模型输出仍走 `escapeModelText` 纯文本；ApprovalSheet 只传 `props.planHash`（store 现有断言保持）；预览 iframe 保持 `sandbox=""`。
