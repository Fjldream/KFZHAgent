# Agent App Conversation Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现左侧多会话、中央消息与执行过程、右侧方案/修订/制品的工作台。

**Architecture:** 以 workspaceId/conversationId/runId 分层管理状态；URL保存当前会话，后端是运行和交付事实源。保留旧WorkspaceView作为flag关闭路径，渐进拆分组件而非全站重写。

**Tech Stack:** Vue 3 / Vue Router / TypeScript / Vitest / Vue Test Utils / Playwright。

**Spec:** `docs/superpowers/specs/2026-10-20-agent-app-next-design.md`，重点 §4、§7、§8。

## Global Constraints

- 保留租户鉴权、审批、签名计划、制品绑定、workspace 构建串行与 stale-base 拒绝。
- UI 展示执行事件与可公开决策摘要，不持久化或展示模型原始隐藏思维链。
- 新功能默认 feature flag 关闭；先 expand 数据迁移，后灰度启用；本期不做破坏性 contract 迁移。
- 不覆盖、不重置、不自动提交已有未提交修改；补丁保留原目录，只包含本任务所有新增和修改文件。
- 其余约束继承 design §3；UI不引入新框架，不因仿照Codex复制与本产品无关的菜单。

---

## 布局与交互基线

视觉基线：`outputs/agent-app-ui-macos-20261020/index.html`（macOS 风格高保真原型，沿用 web 现有 tokens.css 色板；该目录不进 git，实施前确认其存在于本机）。原型右上角「任务标注」开关标注了各区域对应的 T 编号；7 张状态卡是同屏全家福，实际按 run 状态机条件渲染。组件承接基线：审批卡→ApprovalSheet.vue、版本面板→RevisionList.vue、验证徽章→ValidationReport.vue，设计 token 与 `apps/web/src/styles/tokens.css` 现有变量一致。

宽屏三栏：会话导航240px（可收起）/主对话minmax(0,1fr)/检查器320px（可收起）。小于1100px检查器用抽屉，小于768px导航用抽屉，主对话始终可操作。左侧显示当前工作区名称、新会话、最近/归档、运行/未读；中央顶部会话名称/模式，底部输入；右侧标签“方案 / 工程 / 版本 / 用量”。不是每个事件一张大卡片。

过程默认折叠成一条“正在生成组件方案 · 已用时12秒”；展开后有真实started/completed/error、时长和简短依据；停止等待显示真实状态。完成卡片显示版本、验证等级、下载、继续修改。色彩沿用现有token，错误/运行状态不能只靠颜色。输入支持IME、Enter发送/Shift+Enter换行，弹窗Esc关闭、Tab焦点可达，reduced-motion时不做连续动画。

## T13：会话管理、游标分页与活动时间

依赖 T07/T10/T12。

**Files**

- Create: `agent-app/apps/api/src/conversations/conversation-v2.controller.ts`、`conversation-query.service.ts`
- Modify: `agent-app/apps/api/src/conversations/conversation.service.ts`、`graph-ports.ts`
- Modify: `agent-app/apps/api/src/runs/run.module.ts`
- Create: `agent-app/packages/contracts/src/conversation-page.ts`，Modify: `index.ts`
- Test: `agent-app/apps/api/src/conversations/conversation-v2.integration.test.ts`

**Interfaces**

```ts
export type ConversationListItem = { id: string; workspaceId: string; title: string;
  archivedAt: string | null; lastActivityAt: string; activeRunId: string | null; activeRunStatus: RunStatus | null };
export type Page<T> = { items: T[]; nextCursor: string | null };
export type MessageView = { id: string; conversationId: string; role: "user" | "assistant";
  content: string; createdAt: string; runId: string | null; parts: unknown[] };
export interface ConversationQueries {
  list(tenantId: string, workspaceId: string, cursor: string | null, limit: number, archived: boolean): Promise<Page<ConversationListItem>>;
  messages(tenantId: string, conversationId: string, before: string | null, limit: number): Promise<Page<MessageView>>;
  rename(tenantId: string, conversationId: string, title: string): Promise<ConversationListItem>;
  archive(tenantId: string, conversationId: string, archived: boolean): Promise<ConversationListItem>;
}
```

- [ ] 红测：fixture沿用T08的数据库初始化，test文件定义 createConversationQueryFixture 包装实际服务；创建101条相同毫秒消息，循环分页无重无漏；改名trim空白报400；活跃会话归档409。

```ts
const first = await queries.messages(tenantA.id, conversationA.id, null, 50);
const second = await queries.messages(tenantA.id, conversationA.id, first.nextCursor, 50);
const ids = [...first.items, ...second.items].map(message => message.id);
expect(new Set(ids).size).toBe(100);
await expect(queries.messages(tenantB.id, conversationA.id, null, 50)).rejects.toMatchObject({ status: 404 });
```

- [ ] Run: `pnpm --filter @kf/api exec vitest run src/conversations/conversation-v2.integration.test.ts`；预期 FAIL。
- [ ] 实现游标decode严格验证（opaque base64url JSON含createdAt/id，不含权限）；SQL带tenant/conversation约束，按createdAt DESC,id DESC分页，再按UI需要反转items；不因游标来自其他会话泄露数据。

```ts
const where = { tenantId, conversationId,
  ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } },
    { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}) };
// Prisma findMany take=limit+1，orderBy=[{createdAt:'desc'},{id:'desc'}]；多一条决定nextCursor。
```

- [ ] 在appendMessage/run completion同事务更新lastActivityAt；标题首条自然语言取24字、空则“新对话”，不额外调模型；用户改过标题后不覆盖。API v1仍返回旧数组，v2返回Page。history content仍使用原技术JSON清洗规则。
- [ ] 绿测覆盖分页边界、非法limit、归档恢复、共享租户权限、更新顺序、老会话migration；Run conversation-v2 + 旧conversation tests。
- [ ] 提交点 `feat(agent): add paginated conversation management`。

## T14：多会话状态、URL和左侧导航

**Files**

- Create: `agent-app/apps/web/src/stores/conversations.ts`、`conversation-selection.ts`
- Create: `agent-app/apps/web/src/components/workbench/ConversationSidebar.vue`
- Modify: `agent-app/apps/web/src/stores/workspace.ts`、`router.ts`、`api.ts`、`types.ts`
- Modify: `agent-app/apps/web/src/views/WorkspaceView.vue`
- Test: `agent-app/apps/web/src/stores/conversations.test.ts`、`components/workbench/ConversationSidebar.test.ts`
- Create: `agent-app/tests/e2e/conversation-navigation.spec.ts`

**Interfaces**

```ts
export type ConversationSession = { id: string; messages: MessageView[]; nextCursor: string | null;
  draft: string; loaded: boolean; error: string | null; requestGeneration: number };
export function shouldApplyResponse(input: { requestedConversationId: string; responseConversationId: string;
  requestedGeneration: number; currentGeneration: number }): boolean;
export function createConversationStore(api: {
  list: (workspaceId: string) => Promise<Page<ConversationListItem>>;
  messages: (conversationId: string, before: string | null) => Promise<Page<MessageView>>;
}): { sessions: Map<string, ConversationSession>; load: (conversationId: string) => Promise<void> };
```

实现store返回类型可扩展，但这里声明的方法保持稳定；draft只在内存，刷新后可不保留，若持久化必须tenant/user/workspace隔离且退出登录清除，不把需求写公共localStorage键。

- [ ] 红测：

```ts
expect(shouldApplyResponse({ requestedConversationId: "A", responseConversationId: "A",
  requestedGeneration: 1, currentGeneration: 2 })).toBe(false);
expect(shouldApplyResponse({ requestedConversationId: "A", responseConversationId: "B",
  requestedGeneration: 2, currentGeneration: 2 })).toBe(false);
```

- [ ] Run: `pnpm --filter @kf/web exec vitest run src/stores/conversations.test.ts`；预期 FAIL。
- [ ] 实现by-conversation state，旧workspace store仅保留工作区/修订，不再拥有唯一消息数组。异步回包必须按请求conversationId写回对应session；当前选中项只决定渲染，不决定回包归属。

```ts
export const shouldApplyResponse = (input: {
  requestedConversationId: string; responseConversationId: string;
  requestedGeneration: number; currentGeneration: number;
}) => input.requestedConversationId === input.responseConversationId
  && input.requestedGeneration === input.currentGeneration;
```

- [ ] route加 `/workspaces/:id/conversations/:conversationId`，原`/workspaces/:id`选择最近未归档或空态“开始新对话”；不要每次刷新都创建会话。导航支持新建/改名/归档/恢复/加载更多，工作区切换取消列表读取但不cancel run。视图遵守布局基线，小屏焦点恢复到打开抽屉按钮。
- [ ] 测试A请求慢→切B→A返回不污染B；A/B草稿独立；直链不存在或跨workspace404；双击新建幂等防重；back/forward正确；archive selected后安全选择下一项。Run Vue tests + `pnpm exec playwright test tests/e2e/conversation-navigation.spec.ts`（已配置隔离DB）。
- [ ] 提交点 `feat(web): add workspace conversation navigation`。

## T15：Run 时间线、重连和真实操作状态

**Files**

- Create: `agent-app/apps/web/src/stores/runs.ts`、`run-event-reducer.ts`
- Create: `agent-app/apps/web/src/components/workbench/RunTimeline.vue`、`RunStatusBar.vue`、`UsageSummary.vue`
- Modify: `agent-app/apps/web/src/api.ts`、`stores/stage.ts`、`components/ConversationPanel.vue`
- Test: `agent-app/apps/web/src/stores/run-event-reducer.test.ts`、`components/workbench/RunTimeline.test.ts`
- Create: `agent-app/tests/e2e/run-reconnect.spec.ts`

**Interfaces**

```ts
export type RunViewState = { runId: string; lastSeq: number; events: RunEvent[];
  status: RunStatus; connection: "connecting" | "live" | "reconnecting" | "closed" };
export function reduceRunEvent(state: RunViewState, event: RunEvent): RunViewState;
export function subscribeRunEvents(runId: string, after: number, signal: AbortSignal,
  onEvent: (event: RunEvent) => void): Promise<void>;
```

- [ ] 红测：

```ts
const state: RunViewState = { runId: "rA", lastSeq: 4, events: [], status: "RUNNING", connection: "live" };
const duplicate: RunEvent = { schemaVersion: 1, runId: "rA", seq: 4, type: "run.started",
  createdAt: "2026-10-20T00:00:00Z", payload: {} };
expect(reduceRunEvent(state, duplicate)).toBe(state);
expect(reduceRunEvent(state, { ...duplicate, runId: "rB", seq: 5 })).toBe(state);
```

- [ ] Run: `pnpm --filter @kf/web exec vitest run src/stores/run-event-reducer.test.ts`；预期 FAIL。
- [ ] reducer先校验runId/seq，再按事件合同更新状态；seq跳号触发snapshot恢复而非忽略缺失数据。初始化snapshot后after=lastSeq订阅，fetch SSE parser支持跨chunk UTF8、CRLF、多行data，解析失败关闭并重连，不eval。实现在api.ts已有SSE能力上抽取，不维护两份不一致parser。

```ts
if (event.runId !== state.runId || event.seq <= state.lastSeq) return state;
if (event.seq !== state.lastSeq + 1) throw new Error("EVENT_GAP");
return { ...state, lastSeq: event.seq, events: [...state.events, event] };
// status 的事件映射由同文件定义的完整switch处理；terminal以server snapshot再次校准。
```

- [ ] 加开始/完成/失败过程、600字以内decision summary、已知/未知用量、停止按钮、retry/冲突重新规划；旧phaseHint仅旧flag使用。长事件列表折叠并限制DOM，不把所有payload渲染为JSON。切换会话可以停当前订阅并随后snapshot恢复，不停止后台任务。停止按钮请求后显示“正在停止”，直到真实CANCELLED。
- [ ] 测试重连1/2/4/8/15秒上限、401终止、410快照恢复、重复事件、进度label覆盖creative所有节点、无reasoning_content、屏幕阅读器aria-live节流；E2E刷新过程中完成一次构建且只出现一份结果。
- [ ] 提交点 `feat(web): show resumable run timelines and controls`。

## T16：模式输入、排队及参考图附件入口

**Files**

- Create: `agent-app/apps/web/src/components/workbench/MessageComposer.vue`、`AttachmentTray.vue`
- Create: `agent-app/apps/web/src/stores/composer.ts`
- Modify: `agent-app/apps/web/src/api.ts`、`components/ConversationPanel.vue`
- Test: `agent-app/apps/web/src/components/workbench/MessageComposer.test.ts`、`AttachmentTray.test.ts`
- Modify: `agent-app/packages/contracts/src/conversation-page.ts`（parts白名单：text、asset-ref；拒绝未知类型）

**Interfaces**

```ts
export type ComposerAttachment = { clientId: string; assetId: string | null; name: string;
  purpose: "reference" | "material"; status: "uploading" | "ready" | "failed"; error: string | null };
export type ComposerDraft = { text: string; mode: RunMode; attachments: ComposerAttachment[] };
export function canSubmitDraft(draft: ComposerDraft): boolean;
export function uploadReferenceAsset(workspaceId: string, file: File, signal: AbortSignal): Promise<{
  id: string; sha256: string; width: number; height: number }>;
```

- [ ] 红测：上传未完不发送；只有图片无文字可以生成带默认说明的请求；IME composition期间Enter不发送。

```ts
expect(canSubmitDraft({ text: "参照这张图", mode: "plan", attachments: [
  { clientId: "a", assetId: null, name: "screen.png", purpose: "reference", status: "uploading", error: null },
] })).toBe(false);
expect(canSubmitDraft({ text: "讨论布局", mode: "discuss", attachments: [] })).toBe(true);
```

- [ ] Run: `pnpm --filter @kf/web exec vitest run src/components/workbench/MessageComposer.test.ts src/components/workbench/AttachmentTray.test.ts`；预期 FAIL。
- [ ] 实现纯校验与前端队列（最终安全限制在T18）：

```ts
export function canSubmitDraft(draft: ComposerDraft): boolean {
  return draft.attachments.every(file => file.status === "ready" && file.assetId !== null)
    && (draft.text.trim().length > 0 || draft.attachments.length > 0);
}
```

- [ ] composer明确“讨论/规划/生成修改”，运行中可输入下一轮并标注排队；clientMessageId/clientRequestId用crypto.randomUUID，网络重试复用相同ID，成功后才清草稿。附件支持选择/拖放/粘贴、缩略图、取消上传、删除引用、失败重试，释放ObjectURL。reference默认、material显式；切会话不误发文件到其他workspace。发送前展示外部模型图片处理说明并读取租户外发策略。
- [ ] 视觉flag关闭或T18未完成时隐藏图生提交入口，组件在fake API测试，不将现有元数据上传接口冒充已完成视觉链路。接口返回不支持视觉时保留草稿并提示配置，不静默只发送文件名。测试文件名XSS、超过3图/10MiB提示、失败附件阻止发送、停止/确认按钮与文本模式清晰分离。
- [ ] web tests/typecheck/build全绿；提交点 `feat(web): add task modes queued input and reference attachments`。

## T17：历史交付、版本查看和安全分叉

**Files**

- Create: `agent-app/apps/api/src/conversations/conversation-fork.service.ts`
- Modify: `agent-app/apps/api/src/conversations/conversation-v2.controller.ts`
- Modify: `agent-app/apps/api/src/delivery/delivery-snapshot.service.ts`、`agent-app/apps/api/src/revisions/revision.service.ts`
- Modify: `agent-app/apps/web/src/components/RevisionList.vue`、`views/WorkspaceView.vue`、`api.ts`
- Create: `agent-app/apps/web/src/components/workbench/RevisionInspector.vue`
- Test: `agent-app/apps/api/src/conversations/conversation-fork.integration.test.ts`
- Test: `agent-app/apps/web/src/components/workbench/RevisionInspector.test.ts`

**Interfaces**

```ts
export interface ConversationForkService {
  fork(input: { tenantId: string; userId: string; conversationId: string;
    messageId: string; revisionId: string; clientRequestId: string; title?: string }): Promise<ConversationListItem>;
}
// fork输入hash幂等：新增ConversationForkRequest(tenantId,conversationId,clientRequestId,resultConversationId,requestHash)。
// migration: agent-app/prisma/migrations/202610200006_conversation_forks/migration.sql
```

- [ ] 红测：fixture使用T08隔离DB并创建message→run→revision→artifact关系；从A消息选择B的revision必须拒绝；重复fork返回同会话：

```ts
const first = await forkService.fork(input);
const second = await forkService.fork(input);
expect(first.id).toBe(second.id);
expect(first.id).not.toBe(input.conversationId);
expect(await prisma.solutionWorkspace.findUniqueOrThrow({ where: { id: workspace.id } }))
  .toMatchObject({ currentRevisionId: currentRevision.id });
```

- [ ] Run: `pnpm --filter @kf/api exec vitest run src/conversations/conversation-fork.integration.test.ts`；预期 FAIL。
- [ ] fork创建独立conversation与可审计来源，复制截至message的安全消息快照并标记来源；不复制运行租约/审批receipt/未完成任务、不把旧checkpoint thread_id直接复用。旧历史message无可靠revision关联时允许只读，不开放绑定猜测。历史delivery通过已验证run/artifact关系查询，仍使用既有一次性下载token服务。

```ts
const provenance = { forkedFromConversationId: input.conversationId,
  forkedFromMessageId: input.messageId, forkedFromRevisionId: input.revisionId };
// 同一事务插入新conversation + ForkRequest；currentRevisionId不更新。
// 新对话首轮将历史baseline作为研究上下文，真正build前进行当前revision冲突检查。
```

- [ ] 修复onSelectRevision无操作：打开只读检查器，显示父版本、生成run、验证等级、下载和“从这里开始对话”；不提供未实现的“回滚”按钮。用户希望应用旧版本时要求新一轮规划并保留当前版本，不能直接改数据库指针。
- [ ] 测试旧下载/当前下载互不污染、跨tenant、过期下载token、分叉后修改A不改B历史、selectedRevision与currentRevision区别、旧数据无证据时提示。运行revision/delivery/auth回归。
- [ ] 提交点 `feat(agent): inspect historical deliveries and fork conversations`。P3 gate：S04/S05/S07/S09通过、窄屏可用、输入不丢、制品不串；视觉入口仍可保持关闭。
