<!-- modified by jinlong.feng at 2026-10-20 Agent工作台迭代 -->
# Agent App Durable Runs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对话任务脱离浏览器连接独立运行，同时保证重放、幂等、审批和安全取消。

**Architecture:** PostgreSQL 保存 run/event/step，独立 agent-worker 消费；沿用 LangGraph checkpoint 与 conversation 锁域。BuildJob 仍由原 worker 处理，run 只追踪绑定结果。

**Tech Stack:** NestJS / Prisma / PostgreSQL / LangGraph / SSE / Vitest。

**Spec:** `docs/superpowers/specs/2026-10-20-agent-app-next-design.md`，重点 §6–8。

## Global Constraints

- 保留租户鉴权、审批、签名计划、制品绑定、workspace 构建串行与 stale-base 拒绝。
- UI 展示执行事件与可公开决策摘要，不持久化或展示模型原始隐藏思维链。
- 新功能默认 feature flag 关闭；先 expand 数据迁移，后灰度启用；本期不做破坏性 contract 迁移。
- 不覆盖、不重置、不自动提交已有未提交修改；补丁保留原目录，只包含本任务所有新增和修改文件。
- 其余约束继承 design §3；T00 数据库守卫是运行集成测试前置条件。

---

## 文件职责

contracts/agent-run 定义 wire schema；run-store 负责数据库状态机及租约；run-executor 适配 graph；run-events 负责订阅，不执行业务；run.controller 只鉴权/验证/调用 service。不能把这些全部堆进现有 conversation.service。

## T07：Run/Event/Step 合同与 additive migration

依赖 T01/T02；T08 开始执行前必须 T06 完成。

**Files**

- Create: `agent-app/packages/contracts/src/agent-run.ts`
- Modify: `agent-app/packages/contracts/src/index.ts`、`agent-app/prisma/schema.prisma`
- Create: `agent-app/prisma/migrations/202610200004_agent_runs/migration.sql`
- Create: `agent-app/apps/api/src/runs/run-state.ts`
- Test: `agent-app/apps/api/src/runs/run-state.test.ts`、`run-schema.integration.test.ts`

**Interfaces**

```ts
// contracts 中导出 design §7/8 的 RunStatus、RunMode、RunAction、RunEvent 及对应 Zod schema。
export type RunStatus = "QUEUED" | "RUNNING" | "WAITING_INPUT" | "WAITING_APPROVAL"
  | "BUILDING" | "SUCCEEDED" | "FAILED" | "CANCEL_REQUESTED" | "CANCELLED";
export function canTransition(from: RunStatus, to: RunStatus): boolean;
export type RunSnapshot = { id: string; tenantId: string; workspaceId: string; conversationId: string;
  status: RunStatus; lastSeq: number; baseRevisionId: string; buildJobId: string | null;
  resultRevisionId: string | null; failureCode: string | null; supersededByRunId: string | null };
export type RunLease = { runId: string; ownerId: string; fence: number; expiresAt: string };
```

- [ ] 红测：终态不能复活；等待状态由新 run 继续而非原 run 无条件 RUNNING；Zod 拒绝未知 action/type、超长 text、负 seq。

```ts
import { expect, it } from "vitest";
import { canTransition } from "./run-state.js";
it("protects terminal and approval state", () => {
  expect(canTransition("SUCCEEDED", "RUNNING")).toBe(false);
  expect(canTransition("WAITING_APPROVAL", "RUNNING")).toBe(false);
  expect(canTransition("RUNNING", "WAITING_APPROVAL")).toBe(true);
  expect(canTransition("CANCEL_REQUESTED", "CANCELLED")).toBe(true);
});
```

- [ ] Run: `pnpm --filter @kf/api exec vitest run src/runs/run-state.test.ts`，预期 FAIL。
- [ ] 用显式邻接表实现状态机，不能 `from !== to` 草率放行：

```ts
const transitions: Record<RunStatus, RunStatus[]> = {
  QUEUED: ["RUNNING", "CANCELLED", "FAILED"],
  RUNNING: ["WAITING_INPUT", "WAITING_APPROVAL", "BUILDING", "SUCCEEDED", "FAILED", "CANCEL_REQUESTED"],
  WAITING_INPUT: ["CANCELLED"], WAITING_APPROVAL: ["CANCELLED"],
  BUILDING: ["SUCCEEDED", "FAILED", "CANCEL_REQUESTED"],
  CANCEL_REQUESTED: ["CANCELLED", "FAILED", "SUCCEEDED"],
  SUCCEEDED: [], FAILED: [], CANCELLED: [],
};
export const canTransition = (from: RunStatus, to: RunStatus) => transitions[from].includes(to);
```

- [ ] 按 design 建表与 nullable message字段、Conversation lastActivityAt，补 lastActivityAt=最后消息时间或createdAt。加入 predecessorRunId、retryOfRunId、supersededByRunId、lastSeq。ModelInvocation.runId nullable 外键，Budget run FK只针对持久 run；旧 usage 不伪造关联。为被复合外键引用的Conversation/Message/SolutionWorkspace等补齐 `(tenantId,id)` 唯一键；新表的unique/foreign keys覆盖tenant一致性，不能仅靠应用where条件。数据库隔离测试验证跨tenant关联被拒。
- [ ] Run schema migration tests、prisma validate/generate、contracts/API typecheck；用升级前数据验证 message content/旧查询仍可用。迁移不改 generationWorkflow，不回填虚构历史进度。
- [ ] 提交点 `feat(agent): persist run and event contracts`。

## T08：幂等创建、队列领取、租约与 fencing

**Files**

- Create: `agent-app/apps/api/src/runs/run-store.ts`、`run.service.ts`、`run.module.ts`
- Modify: `agent-app/apps/api/src/conversations/conversation-turn-lease.ts`
- Test: `agent-app/apps/api/src/runs/run-store.integration.test.ts`

**Interfaces**

```ts
export type StartRunInput = { tenantId: string; userId: string; conversationId: string;
  clientRequestId: string; clientMessageId: string; mode: RunMode; action: RunAction;
  attachmentIds: string[]; expectedBaseRevisionId?: string };
export interface RunStore {
  create(input: StartRunInput): Promise<RunSnapshot>;
  claim(ownerId: string, now: Date): Promise<RunLease | null>;
  renew(lease: RunLease, now: Date): Promise<RunLease>;
  append(lease: RunLease, tenantId: string, event: Omit<RunEvent, "seq" | "createdAt" | "schemaVersion" | "runId">): Promise<RunEvent>;
  finish(lease: RunLease, tenantId: string, status: RunStatus, failureCode?: string): Promise<RunSnapshot>;
}
```

- [ ] 在 integration test 建 `createRunTestFixture()`：使用 T00 守卫后的 Prisma 测试 DB，创建两个 tenant/用户/工作区/会话，返回 store、tenantA、tenantB、conversationA、baseRevisionA、cleanup。fixture 文件 `agent-app/apps/api/src/runs/run-test-fixture.ts`，仅测试 import，不被生产导出。`messageInput(fixture,clientRequestId,text)` 在同文件返回合法 StartRunInput。红测：

```ts
const input = messageInput(fixture, "same-request", "生成一个表格页面");
const [a, b] = await Promise.all([fixture.store.create(input), fixture.store.create(input)]);
expect(a.id).toBe(b.id);
expect(await fixture.prisma.message.count({ where: { conversationId: input.conversationId } })).toBe(1);
await expect(fixture.store.create({ ...input, action: { type: "message", text: "不同需求" } }))
  .rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
```

- [ ] Run: `pnpm --filter @kf/api exec vitest run src/runs/run-store.integration.test.ts`；预期缺服务 FAIL。
- [ ] create 用同一短事务检查权限/审批/attachment归属、插入 user Message 和 Run、预算、run.queued事件及更新会话活动时间；确定性 action 不伪装为用户自然语言。遇唯一冲突加载已存在记录并比较 requestHash。
- [ ] claim 使用 SELECT FOR UPDATE SKIP LOCKED、tenant 并发配额和同 conversation 唯一活跃约束；同时协调既有 advisory lock，而非用新 key 绕过旧 SSE。领取/续期核心：

```sql
UPDATE "AgentRun" SET "leaseOwner" = $1, "leaseExpiresAt" = $2,
  "fence" = "fence" + 1, "status" = 'RUNNING'
WHERE "id" = $3 AND "status" = 'QUEUED'
RETURNING "id", "fence";
-- 选中 id 的查询与更新在同一事务内；参数化 SQL，表名用实际 migration 名。
```

- [ ] append/finish同时校验owner/fence/有效期，每次lastSeq+1和event插入原子完成。测试两worker竞争、租约过期、旧worker迟到写入、跨tenant猜run、队列fairness、20并发同clientRequestId、不自动覆盖base。预期单conversation≤1活跃、旧fence写入0行。
- [ ] claim补恢复分支：对lease过期的RUNNING/CANCEL_REQUESTED，先获得同conversation原advisory锁并检查原turn fence/quarantine已安全释放，再用旧fence CAS增加fence重新领取；不把状态无条件改QUEUED，也不在旧执行者仍持锁时抢占。CANCEL_REQUESTED只能进入取消收尾。BUILDING由T11reconciler恢复，不重新调用生成图；等待用户状态不参与worker领取。
- [ ] 全部绿测与 typecheck；提交点 `feat(agent): add idempotent fenced run queue`。

## T09：独立执行器、确定性操作与可恢复节点

**Files**

- Create: `agent-app/apps/api/src/runs/run-executor.ts`、`run-worker.ts`、`run-step-store.ts`、`action-router.ts`
- Create: `agent-app/apps/api/src/conversations/conversation-runtime.module.ts`
- Modify: `agent-app/apps/api/src/conversations/conversations.module.ts`（分离可复用graph providers与HTTP controller装配）
- Create: `agent-app/apps/api/src/run-agent-worker.ts`
- Modify: `agent-app/apps/api/src/conversations/conversation.service.ts`、`graph-ports.ts`、`checkpointer.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/solution-graph.ts`、`state.ts`、`nodes/enqueue-build.ts`
- Modify: `agent-app/package.json`、`agent-app/tests/e2e/global-setup.ts`、`global-teardown.ts`
- Test: `agent-app/apps/api/src/runs/action-router.test.ts`、`run-executor.integration.test.ts`

**Interfaces**

```ts
export type ActionRoute = "classify" | "confirm_blueprint" | "resume_approval" | "revise_regions" | "accept_visual_reference";
export function routeRunAction(action: RunAction): ActionRoute;
export interface RunExecutor { execute(lease: RunLease, signal: AbortSignal): Promise<void> }
export interface RunStepStore {
  findCompleted(input: { tenantId: string; runId: string; stepKey: string; inputHash: string }): Promise<unknown | null>;
  complete(input: { lease: RunLease; tenantId: string; stepKey: string; inputHash: string; output: unknown }): Promise<void>;
}
```

- [ ] 红测先验证按钮不调用分类：

```ts
expect(routeRunAction({ type: "confirm_blueprint", expectedRunId: "r1", receipt: "signed-receipt" }))
  .toBe("confirm_blueprint");
expect(routeRunAction({ type: "message", text: "我想要一个生产大屏" })).toBe("classify");
```

- [ ] Run: `pnpm --filter @kf/api exec vitest run src/runs/action-router.test.ts src/runs/run-executor.integration.test.ts`；预期 FAIL。
- [ ] 实现 action exhaustive switch；mode=discuss绝不enqueue，mode=plan停在确认，mode=build仍校验有效receipt/审批而非绕过。每一步先发 step.started，再执行，再提交 checkpoint/输出/step.completed。public summary来自受限业务结果，不读 reasoning_content。

```ts
export function routeRunAction(action: RunAction): ActionRoute {
  switch (action.type) {
    case "message": return "classify";
    case "confirm_blueprint": return "confirm_blueprint";
    case "resume_approval": return "resume_approval";
    case "revise_regions": return "revise_regions";
    case "accept_visual_reference": return "accept_visual_reference";
  }
}
```

- [ ] 两种checkpoint事实不能分裂：graph state带runId、step inputHash和已落库输出引用；每个业务副作用用runId/stepKey幂等键，恢复时先校验checkpoint对应run/base/schema。模型响应已写step但图checkpoint未写时重用step；响应未写时只允许budget下的有限重试。enqueue前后崩溃必须通过build idempotencyKey找回同一个job。
- [ ] accept_visual_reference和revise_regions先预留合同和路由，但直到T22/T23实现且相应flag启用才允许执行；提前调用返回FEATURE_NOT_ENABLED，不把它们降级成普通文本或默默接受。
- [ ] 新agent-worker只加载所需Nest providers，启动循环claim→execute→释放锁；独立健康记录worker heartbeat。追加 `start:agent-worker` 与现有start:api一致的vite-node运行方式指向run-agent-worker.ts。E2E开启runs flag时启动并清理第四进程。测试进程被kill后从completed step恢复、LLM未知结果记录UNKNOWN、同图审批仍有效、无重复message/build；lease丢失立即停止后续写。
- [ ] Nest依赖方向固定：ConversationRuntimeModule导出graph/checkpointer/model/ports；RunsModule导入RuntimeModule；ConversationsModule导入RuntimeModule和RunsModule以兼容旧controller，RuntimeModule不反向import前两者。agent-worker加载RunsModule的worker专用装配，不导入HTTP controller module，也不启动build-job轮询器；测试Nest编译可以检测循环依赖和双worker启动。
- [ ] Run executor/旧conversation/creative goldens测试；独立进程启动退出smoke；提交点 `feat(agent): execute graph runs outside SSE requests`。

## T10：事件重放、快照和新 API

**Files**

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
- Create: `agent-app/apps/api/src/runs/run.controller.ts`、`run-event-stream.service.ts`、`run-query.service.ts`
<!-- end -->
- Create: `agent-app/apps/api/src/auth/mutation-origin.guard.ts`、`mutation-origin.guard.test.ts`
- Modify: `agent-app/tests/e2e/helpers/api.ts`（cookie写请求附带测试Origin）
- Modify: `agent-app/apps/api/src/runs/run.module.ts`、`agent-app/apps/api/src/app.module.ts`（注册RunsModule；现有main.ts继续启动AppModule）
- Test: `agent-app/apps/api/src/runs/run-events.integration.test.ts`、`run-api.integration.test.ts`

**Interfaces**

```ts
export interface RunQueries {
  snapshot(tenantId: string, runId: string): Promise<RunSnapshot>;
  eventsAfter(tenantId: string, runId: string, after: number, limit: number): Promise<RunEvent[]>;
}
export function serializeRunEvent(event: RunEvent): string;
```

- [ ] 红测序列化：

```ts
const event: RunEvent = { schemaVersion: 1, runId: "r1", seq: 2,
  type: "step.started", createdAt: "2026-10-20T00:00:00.000Z",
  payload: { stepKey: "implementation", label: "生成组件方案", attempt: 1 } };
expect(serializeRunEvent(event)).toBe(`id: 2\nevent: step.started\ndata: ${JSON.stringify(event)}\n\n`);
```

- [ ] Run: `pnpm --filter @kf/api exec vitest run src/runs/run-events.integration.test.ts src/runs/run-api.integration.test.ts`；预期 FAIL。
- [ ] 实现design endpoint表中的run POST/GET/events；每次订阅先鉴权，游标非整数/负数400，超过最后seq400，不存在/跨tenant404。按数据库seq循环查询，不因通知丢失漏事件；LISTEN/NOTIFY可作唤醒但非唯一事实源；长轮询/短等待不持有数据库连接。heartbeat每15秒，事件限1k条一页，连接背压超过缓冲关闭并允许重连。

```ts
export function serializeRunEvent(event: RunEvent): string {
  return `id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
```

- [ ] GET disconnect仅释放订阅资源，绝不dispose executor；terminal最后事件发送后结束。快照包含lastSeq+真实绑定delivery，不返回raw checkpoint。查历史分页过程中产生新事件仍可在后续循环读到；过期事件410+snapshotUrl。
- [ ] mutation-origin.guard导出 `isAllowedMutationOrigin(origin: string | undefined, allowedOrigins: string[]): boolean`，用new URL规范化且精确匹配允许origin；cookie鉴权的v2 POST/PATCH缺Origin或不匹配返回403，不靠CORS替代服务端CSRF防护。只信服务器配置的origin，不信可伪造X-Forwarded-Host。测试 `expect(isAllowedMutationOrigin("https://evil.example", ["https://agent.example"])).toBe(false)` 和缺origin；E2E合法API客户端显式发送允许Origin。T13/T17/T18/T19新写端点都复用该guard。
- [ ] 测试断线期间完成后重连、重复游标、创建与订阅间竞态、session过期、跨tenant、数据脱敏、100个短连接不耗尽连接池。真实HTTP测试验证连接断开任务仍执行且无资源泄漏。
- [ ] 全绿后提交点 `feat(agent): expose resumable run events and snapshots`。

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
### T10/T12 订阅子项实际进展

- [x] RunEventStreamService 为只读服务，Controller 不再内嵌循环；生产固定 30 秒窗口、15 秒心跳、1 秒 poll、5 秒 drain 等待与 64 KiB 应用层写缓冲/单帧保护。终态分页补齐、正常 end 排空、空页不忙循环、安全错误与 private/no-store 已接通。
- [x] 初始及持续只读会话复核，覆盖撤销/绝对过期/空闲/改密限制/租户和角色变化；内部心跳不刷新 lastUsedAt，普通 HTTP 滑动策略不变。断线解除在途查询等待并丢弃迟到结果，不宣称物理取消 SQL。
- [x] Writable 背压/定时器/监听器与真实 HTTP 权限矩阵、100 短连接、断线后 Run 继续/按 seq 恢复已验。前端 reader、单帧上限、单消费循环、stop、快照鉴权停止重连、指数退避/抖动/恢复重置与等待取消已验。完整记录见 `agent-app/docs/run-stream-20261021.md`（719 项相关测试通过）。
- [x] 后续 Playwright 首次 SSE 连接故障、worker 继续、after=0 补未读事件/完整 seq、刷新和消息去重已验；这不是代理/整机网络/长期 soak。见 `agent-app/docs/run-browser-20261021.md`，最新协议 @6，扩大 API 回归仍有偶发失败，不用历史总数宣称全绿。
- [ ] 事件保留/过期 410 + snapshotUrl、浏览器/代理/多副本长期 soak、真实独立进程 kill 与发布矩阵。上方旧总项包含这些未完成边界，不提前全勾；T12 整体仍 IN_PROGRESS。
<!-- end -->

## T11：取消、重试、排队和构建终态协调

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
2026-10-21 更新：同会话 FIFO、模型消息视图隔离、逐修订归属验证的基线衔接、队列上限、取消队列项、真实审批等待/进入/恢复三个阶段的停止，以及前端排队/自动跟进/冲突重新规划均已实施。使用 run-plan@4；无新增迁移。完整记录见 `agent-app/docs/run-queue-20261021.md`。核心链路已接通，预算相关验收继续暂缓；T12 灰度、旧入口兼容和系统级故障矩阵仍需完成，不能把本条当成 P2 发布门槛已全部通过。下面 2026-10-20 记录保留为历史状态。
<!-- end -->

2026-10-20 实施更新：安全停止、幂等新运行重试、真实模型 AbortSignal、构建提交竞争与孤儿 BUILDING 恢复已经落地并通过相关测试，详见 `agent-app/docs/run-control-20261020.md`。完整运行中消息排队与 `baseline.changed` 尚未实现，**本任务仍为 IN_PROGRESS**。构建对账复用既有 RunWorker 过期租约恢复与 `waitForRunBuild`，未新增第二个后台 reconciler；新增迁移实际编号为 `202610200007_build_run_control`（0005 已由活动时间回填占用）。取消已确认构建后重试会重新规划/确认，不自动重发旧审批或发布旧作业。

**Files**

- Create: `agent-app/apps/api/src/runs/run-control.service.ts`、`build-run-reconciler.ts`
- Modify: `agent-app/packages/build-jobs/src/build-job.service.ts`、`agent-app/apps/worker/src/job-runner.ts`
- Modify: `agent-app/apps/api/src/runs/run.controller.ts`、`run-store.ts`、`run-executor.ts`
- Modify: schema；Create: `agent-app/prisma/migrations/202610200005_build_cancellation/migration.sql`
- Test: `agent-app/apps/api/src/runs/run-control.integration.test.ts`、`build-run-reconciler.integration.test.ts`
- Test/Modify: `agent-app/apps/worker/src/job-runner.integration.test.ts`

**Interfaces**

```ts
export interface RunControl {
  cancel(tenantId: string, runId: string, userId: string): Promise<RunSnapshot>;
  retry(tenantId: string, runId: string, userId: string, clientRequestId: string): Promise<RunSnapshot>;
}
export function mapBuildTerminal(input: { status: "SUCCEEDED" | "FAILED";
  terminalReason: string | null }): "SUCCEEDED" | "FAILED" | "CANCELLED";
```

- [ ] 红测取消映射及实际竞争：

```ts
expect(mapBuildTerminal({ status: "FAILED", terminalReason: "CANCELLED" })).toBe("CANCELLED");
expect(mapBuildTerminal({ status: "SUCCEEDED", terminalReason: null })).toBe("SUCCEEDED");
// integration：cancel RUNNING 后 fake model resolve；断言 enqueueBuild 未调用，run=CANCELLED。
```

- [ ] Run: `pnpm --filter @kf/api exec vitest run src/runs/run-control.integration.test.ts src/runs/build-run-reconciler.integration.test.ts`；预期 FAIL。
- [ ] 取消状态CAS+event持久化，worker轮询/通知触发AbortSignal；enqueue构建事务与cancel检查用同一个run锁序，避免检查后取消仍入队。build已领取时增加安全边界检查，不在文件写一半后发布制品；清理临时产物限当前job私有目录，保留审计。原native操作不能撤销时明确返回实际状态，不杀不明进程。

```ts
export function mapBuildTerminal(input: { status: "SUCCEEDED" | "FAILED"; terminalReason: string | null }) {
  return input.status === "SUCCEEDED" ? "SUCCEEDED"
    : input.terminalReason === "CANCELLED" ? "CANCELLED" : "FAILED";
}
```

- [ ] retry只允许失败/取消且非权限/审批绕过，创建新run/新budget，引用原输入和retryOfRunId；base过期返回BASE_REVISION_CONFLICT。运行中message排队绑定predecessor；后续基线变更只有同conversation已确认前序成功才允许并记录baseline.changed，否则让用户确认replan。build reconciler按真实job绑定回填，崩溃重复回填不重复message/event。
- [ ] 测试queued取消、模型取消、enqueue竞争、build正在finalize时cancel、完成后cancel、预算用尽retry、两个对话同base冲突、孤儿BUILDING修复；保持build-jobs原workspace锁与stale-base回归全绿。
- [ ] 提交点 `feat(agent): coordinate cancellation retries and build results`。

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
## T12：旧执行入口退役、恢复演练与启用门槛

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
最新验收补充见 `agent-app/docs/approval-concurrency-20261023.md`：原历史领域 I1 并发测试已用真实 audit 提交 gate 保证锁内重叠并保留两个精确 BUSY/唯一副作用；新增锁释放后重放精确 NO_PENDING_APPROVAL。没有改生产执行器/租约或测试 timeout/retry/skip。完整 API 64 文件 927/927、无 skip（含视觉 Chrome），API/root tsc/lint 通过。本项收口不等于 T12 发布门槛完成：旧失败历史保留，短 lease/偶发 404/cleanup WARN 未宣称根治，OS kill/restart、代理/多副本/事件保留/整体升级回退和完整矩阵继续待验，生产 vision 关闭、预算暂缓。
<!-- end -->

维护者最新要求：不需要的旧接口可以删除。此要求替代初稿中的旧 SSE/POST resume 桥接，禁止后续模型为兼容重新注册旧执行路由。工程域的 legacy/module-v1/creative-v2 和历史数据仍保留。

**Files**

- Modify: `agent-app/apps/api/src/conversations/conversation.controller.ts`、`conversation.service.ts`
- Retire: `agent-app/apps/web/src/stores/workspace.ts`、`workspace.test.ts`；删除旧 `api.resume` 与 `streamMessageTurn`，保留 Run 订阅所需 SSE 帧解析
- Preserve: `agent-app/apps/api/src/delivery/delivery-snapshot.service.ts` 及仍在用的查询、下载和签名保护
- Create: `agent-app/apps/api/src/runs/feature-policy.ts`
- Create: `agent-app/apps/api/src/runs/workbench-config.controller.ts`
- Test: `agent-app/apps/api/src/runs/legacy-routes.integration.test.ts`
- Test support: `agent-app/apps/api/test-support/legacy-conversation-driver.ts`、`legacy-conversation-controller.ts`、`legacy-graph-request.ts`（仅历史领域测试，禁止生产 imports）
- Create: `agent-app/docs/agent-runs-operations.md`

**Interfaces**

```ts
export function resolveRunFeature(input: { enabled: boolean; allowedTenantIds: string[]; tenantId: string }): boolean;
// 旧 POST messages/resume 无论 flag 状态均 404，无执行副作用。
// 新 POST /api/conversations/:id/runs 仅受理，GET events 始终仅订阅。
// 停用新入口也不得回落到旧执行器；已有任务只允许 drain/真实取消。
```

- [x] 红测 flag allowlist（已用真实 HTTP/数据库覆盖精确匹配、默认关闭、伪造请求、错误依赖、跨租户与事务存储层绕过，不只测纯函数）：

```ts
expect(resolveRunFeature({ enabled: true, allowedTenantIds: ["t1"], tenantId: "t2" })).toBe(false);
expect(resolveRunFeature({ enabled: false, allowedTenantIds: ["t1"], tenantId: "t1" })).toBe(false);
```

- [x] 下线旧 messages/resume 及生产 service 内旧执行代码。Run retirement 红测分别得到 200/409（预期 404），绿测验证登录/未登录均 404、无消息/任务副作用、新 Run 正常受理，GET messages 保留。
- [x] 历史编译/签名/交付场景使用 test-support 内存夹具保留，不注册旧 HTTP；真正 Run 验收仍使用未覆盖 provider 的生产服务。
- [x] 实现服务端开关与精确 allowlist；请求不能自行提供 flag，Web 不读取 localStorage 权限；关闭新受理不重新启用旧执行器。真实 Run drain、幂等重放和原生审批取消已在关闭准入时验证；生产多副本配置加载与停机演练仍待实测。

```ts
export const resolveRunFeature = (input: { enabled: boolean; allowedTenantIds: string[]; tenantId: string }) =>
  input.enabled && input.allowedTenantIds.includes(input.tenantId);
```

- [x] operations 已记录实际 flags、关闭准入/排空、恢复和升级前置；尚未做生产部署/多副本回退演练，不把手册当作验收。
- [x] 现行文本 Run 绑定 delivery 与功能/协议配置冻结已验；不从工作区最新 job 猜制品。统一 gateway 的模型/提示词/价格冻结仍随 T02/T03 收尾，不能提前勾选。
- [x] GET /api/v2/workbench-config 经 TenantGuard 返回有效 flags、imagePolicy 和 outboundImagesAllowed；默认关闭、精确 allowlist、依赖/未实现配置失败关闭、private/no-store/Vary 校验、Run 快照冻结、step cache 前协议校验与前端只读/跨租户异步隔离已实现。vision/usage 等未接通能力继续关闭。
- [x] 已迁移全部现存 Playwright helpers/specs/global-setup 到 Run/当前 UI；API/build-worker/双租户 agent-worker/Web 独立进程正常运行和清理，两轮各 9 项通过。覆盖三类工程核心正常路径、原生审批/取消、失败重试、断线恢复、讨论/切换、精确 allowlist readonly、安全和真实包。源上传缺口和原生重规划漏操作已修复；当前 run-plan@6。A 只替换模型固定输出，B 使用生产入口/fake，编译/签名/构建/下载不替换；不能当 KF 原生/真实模型或完整组合矩阵证据。
- [ ] 完整 legacy/module-v1/creative-v2 × flag off/on ×正常/审批/断线/故障矩阵、API/worker kill/restart、无重复 job、代理/多副本与发布。扩大回归 API 偶发 403/HTTP Parse Error 仍待定位，最新整批仍有失败；T12 整体不全勾。见 run-browser 报告。
- [x] 新 Run 的受理、原生审批消费、构建入队/实际结果审计补齐；决定 memo 和审计同事务，job 状态与审计同事务，幂等重放、审计故障回滚、过期 fence/锁等待过期、真实图 checkpoint gap 与同 hash 重新审批已验证。详见 `agent-app/docs/run-audit-20261021.md`；协议 run-plan@5，升级先排空旧协议。历史夹具不替代真实 Run 证据；OS 进程 kill/发布与保留策略仍未验收。
- [ ] 提交点 `refactor(agent): retire legacy execution endpoints`。P2 gate：断线继续、事件恢复、并发隔离、取消真实状态四项均有实测记录，才允许用户灰度。
<!-- end -->
<!-- end -->
