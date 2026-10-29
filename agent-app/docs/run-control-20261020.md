<!-- modified by jinlong.feng at 2026-10-20 Agent工作台迭代 -->
# Agent 工作台：停止、重试与构建协调交接

日期：2026-10-20。继续维护者“暂缓预算，先打通流程并修复问题”的要求。本文接续 `run-flow-repair-20261020.md`，不是全部 T00–T27 完成报告。

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
> 后续已实现同会话排队、前序消息隔离、基线衔接与原生审批取消恢复，最新状态以 `run-queue-20261021.md` 为准。本文“排队未做”和“原生审批取消专项 E2E 待补”仅为前一批的历史状态。
<!-- end -->

## 1. 本批实现与使用方式

### 停止

- `POST /api/runs/:runId/cancel`：cookie 会话 + TenantGuard + MutationOriginGuard，返回 200 快照。
- `QUEUED` / `WAITING_INPUT`：原子写 `CANCELLED`、终态事件与审计；重复请求不重复事件。
- `RUNNING`：先写 `CANCEL_REQUESTED`，执行器轮询停止意图（250ms），真实 DeepSeek 适配器向 HTTP fetch 传递 AbortSignal；不得只断开 SSE。
- 每个图节点执行前后校验当前租约与停止意图；没有完成的模型/编译节点仍在执行时，不先释放共享会话锁。
- 停止与“进入等待确认”的竞争由 pause 的 SQL CAS 收口；停止先落库时直接终止，不遗留假的等待确认。
- `BUILDING`：绑定 BuildJob，停止请求传给 build-worker。排队作业标记取消；已领取的作业在编译后、打包后与数据库提交边界检查取消。取消先提交时，不发布新修订或可下载制品。
- `WAITING_APPROVAL`：创建确定性的 `resume_approval/cancel` 后继，仍用 LangGraph 原生 Command 消费审批中断，不直接篡改 checkpoint。
- 已完成的作业/运行不倒退为取消；原生工程或未知进程不会被强行终止。

工作台停止按钮接真实 API。`CANCEL_REQUESTED` 显示“正在停止”，禁用重复停止和发送，直到收到执行者终态。普通运行中可编辑草稿，但暂不能提交第二轮消息；不再显示未实现的“运行中将排队”。

### 重试

- `POST /api/runs/:runId/retry`：同样的鉴权与 Origin 守卫，JSON `{ "clientRequestId": "新 UUID" }`，返回 202 新快照。
- 仅允许未被后继消费的 FAILED / CANCELLED；拒绝已知权限、签名/回执错误与未启用功能，不改变旧 run。
- 新 run 记录 `retryOfRunId`，有独立请求幂等键和预算记录；相同请求返回同一个新 run。预算记录不意味着预算限制已启用。
- 运行中拒绝重试；旧输入基线已变化时返回 409 `BASE_REVISION_CONFLICT`。
- 普通消息重用原消息动作。无构建的审批重试仍校验原动作/哈希，执行时再次校验真实待审批 checkpoint。
- 已经确认并开始过构建的重试重新进入规划/确认，不自动重放旧审批或发布旧构建。安全优先于“一键恢复到原提交边界”。
- 当前不支持视觉附件，因此未实现视觉输入克隆；接 T18–T23 时必须将附件/snapshot 绑定纳入重试合同，不能沿用空 attachmentIds。

工作台失败/停止卡提供真实重试按钮；网络失败后保持相同重试 nonce，防止响应丢失引发重复创建。重试请求未返回时阻止竞争发送，并保留草稿。

## 2. 构建绑定、锁与恢复

新增可空字段：`BuildJob.agentRunId`（唯一）、`cancelRequestedAt`、`terminalReason`。legacy 作业保持 `agentRunId = null`，沿用原路径。

`agentRunId` 来自服务器 AsyncLocalStorage 执行作用域，不信任模型、浏览器或公开输入。入队在一个事务中同时创建/找回作业并将 Run 标为 BUILDING，避免作业已入队、Run 尚未绑定时的停止空隙。

入队、停止和绑定作业的 completeBuild 共用 `kf-run-control:<runId>` 外层事务锁。completeBuild 内部保留原有 **BuildJob → SolutionWorkspace** 行锁顺序，以及 worker 租约、签名、workspace stale-base 和制品绑定校验。

特别修复两种过期租约错误：

1. 既有 AgentRun raw-SQL Date 与 BuildJob ORM UTC timestamp 口径不同；不能将 BuildJob 的 UTC 比较直接用于 AgentRun。本机 DB timezone 为 Asia/Shanghai，错误实现会多接受约 8 小时。
2. 必须在取得权威 AgentRun 行锁**之后**用数据库墙钟重新判断租约；事务开始时间或等待锁之前的 JS Date 都可能过期。本批增加了等待行锁期间过期的红绿测试。

这不是对全仓历史时间字段的 UTC 迁移；不要未经迁移审查修改数据库 timezone 或批量重写既有租约列。

图停止不直接把 AbortSignal 交给 LangGraph 来抢先结束流：测试发现这会让尚未结束的节点在会话锁释放后继续运行。改为实际模型 transport 取消 + 节点守卫 + pending node drain；进程关闭仍保留可恢复租约。

构建对账复用现有 RunWorker 的过期租约恢复及 `waitForRunBuild`，没有新增第二个可竞争写终态的后台 reconciler：已绑定作业直接读取原作业，不再调用模型。验证了 agent-worker 退出、build-worker 完成、接替者恢复后仅一份作业和一次终态事件。

历史硬崩溃的 PENDING / ADMITTED / QUARANTINED 会话屏障仍保持故障关闭。没有自动清除屏障或强行认定未知副作用已停止。

## 3. 数据库升级与运行

新增迁移：`prisma/migrations/202610200007_build_run_control/migration.sql`。

SHA-256：`b905fb94542f7455c67afcc173e06a20b9c8767fd6ae31e30c7a793c0e7b6920`。

在新隔离库 `kf_agent_test_runcontrol_20261020_2130` 上成功执行全部 18 个 `prisma migrate deploy` 迁移，随后生成 Prisma Client 并跑实际数据库集成测试。旧隔离库 `kf_agent_test_runflow_20261020_462937` 用于构建/worker 回归；该库曾手工应用 0007 SQL，没有补写迁移记录，不作为部署迁移基线。

**未修改业务/生产数据库。部署本批代码前，维护者必须按目标环境的备份/升级流程应用 additive migration 并生成 Prisma Client，然后启动 API、agent-worker、build-worker。仅替换 JS 不升级表会报缺列。**

示意命令（agent-app 根目录，先确认 DATABASE_URL；不要复制测试库作为业务部署地址）：

```sh
node node_modules/prisma/build/index.js migrate deploy
node node_modules/prisma/build/index.js generate
```

API 与两个 worker 仍须共用数据库、签名密钥、制品存储；`AGENT_TENANT_ID` 和 `AGENT_ALLOWED_ORIGINS` 按实际环境配置。预算、模型配置和真实密钥未被本批改变。

没有执行生产部署或灰度；T12 flags/legacy 桥接还没有收口，不应直接据此对外发布。

## 4. 验证与重现

本机实际 Node：仓库 `.toolchain/node-v24.19.0-darwin-arm64/bin/node`。系统 Node 的 ICU 依赖有既有问题；本批未改系统环境或增加依赖。

集成测试必须同时设置专用 `TEST_DATABASE_URL` 和 `KF_TEST_ALLOW_DESTRUCTIVE_RESET=1`，通过已有数据库安全守卫；禁止换成业务库。

API（cwd `agent-app/apps/api`）：

```sh
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_runcontrol_20261020_2130 \
KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 \
node ../../node_modules/vitest/vitest.mjs run src/runs \
  src/models/model-cancellation.test.ts src/models/deepseek-transport.test.ts \
  src/conversations/deepseek-model.test.ts src/auth/mutation-origin.guard.test.ts
```

`run-flow.integration` 使用真实 Nest HTTP、租户会话、Prisma、PostgreSQL checkpoint、生成图、签名编译、独立 JobRunner 和制品下载；仅模型输出换为仓库已有工业控制台 golden，不发收费请求。全局构建调度器会领取任意租户，因此此套件要求没有其他测试留下的 QUEUED / RUNNING / VALIDATING 假作业；污染时明确报 `RUN_FLOW_REQUIRES_CLEAN_BUILD_QUEUE`，应使用新隔离库，不能去清业务队列。

构建核心（cwd `agent-app/packages/build-jobs`）：

```sh
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_runflow_20261020_462937 \
KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 \
node ../../node_modules/vitest/vitest.mjs run src/build-job.service.integration.test.ts \
  src/job-executor.test.ts src/revision-state.test.ts src/server-plan-authority.test.ts
```

Worker（cwd `agent-app/apps/worker`）同一旧隔离库运行 `src/job-runner.integration.test.ts src/worker-instance-id.test.ts src/domain-packs.test.ts src/server-plan-authority.test.ts`。该套件会 TRUNCATE 隔离库；不得与使用同一库的其他套件并行。

Web（cwd `agent-app/apps/web`）：`node ../../node_modules/vitest/vitest.mjs run`；类型检查用本包 `node_modules/vue-tsc/bin/vue-tsc.js --noEmit`，生产构建用 `../../node_modules/vite/bin/vite.js build`。

关键红测确实观测到的错误：停止未接线时模型继续返回；queued cancel/retry 端点缺失；提交前取消仍发布；过期租约误走输入查询；等锁后过期仍可入队；停止与 pause 竞争抛 FENCE_REJECTED；忙碌/重试时发送仍可触发。分别修复后重跑，不以新增但未运行的测试充数。

最终结果：

| 范围 | 结果 |
| --- | --- |
| API Run / Origin / transport / 真实模型适配器单测 | 21 文件，221 通过 |
| Web 全量 Vitest | 24 文件，124 通过 |
| 生成图 / 分类 / 节点 memo | 3 文件，53 通过 |
| 构建服务 / 签名 / 执行器 / 修订状态 | 4 文件，68 通过 |
| 实际 worker / 构建 / 崩溃恢复等 | 4 文件，41 通过 |
| API、build-jobs、worker TypeScript；Web vue-tsc | 全部通过 |
| Web Vite 生产构建；选定修改 TS 的 ESLint；diff --check | 全部通过 |

合计 **507 项通过，0 失败**。这是相关模块回归，不是 monorepo 全量验收。没有真实 DeepSeek 缓存/费用实验、视觉模型调用或 KF 原生导入运行态验收。

## 5. 当前交付文件清单

以下路径相对 `agent-app/`，只列本批实际触碰的产品、测试和迁移文件；很多文件已有前序未提交修改，不得把整份 diff 当成本批独有修改。

```text
apps/api/src/conversations/deepseek-model.ts
apps/api/src/models/model-cancellation.test.ts                         新增
apps/api/src/runs/run-control.service.ts                               新增
apps/api/src/runs/run.controller.ts
apps/api/src/runs/run.module.ts
apps/api/src/runs/run-store.ts
apps/api/src/runs/run-store.integration.test.ts
apps/api/src/runs/run-executor.ts
apps/api/src/runs/run-graph-runner.ts
apps/api/src/runs/run-handler-registry.ts
apps/api/src/runs/run-build.ts                                         前序新增，本批继续修改
apps/api/src/runs/run-flow.integration.test.ts                          前序新增，本批继续修改
apps/web/src/runs-api.ts
apps/web/src/composables/useRunStream.ts
apps/web/src/composables/useRunStream.test.ts
apps/web/src/components/runs/RunPill.vue
apps/web/src/components/runs/RunPill.test.ts
apps/web/src/components/runs/ComposerBar.vue
apps/web/src/components/runs/ComposerBar.test.ts
apps/web/src/views/RunWorkbenchView.vue
apps/web/src/views/RunWorkbenchView.test.ts
packages/agent-orchestrator/src/solution-graph.ts
packages/build-jobs/src/agent-run-scope.ts                              新增
packages/build-jobs/src/index.ts
packages/build-jobs/src/build-job.service.ts
packages/build-jobs/src/job-executor.ts
prisma/schema.prisma
prisma/migrations/202610200007_build_run_control/migration.sql          新增
docs/run-control-20261020.md                                           新增
docs/run-flow-repair-20261020.md                                       更新接续说明
```

根目录配套文档：`docs/superpowers/plans/2026-10-20-agent-app-{next-master,p2-runs,handoff}.md`。

基线 HEAD `94364cd9add74915c6f85af96357ee5b286faede`，branch `main`；沿用用户允许的混合 dirty 工作区。本批未 commit、push、reset，未改其他 KingFusion 服务；未生成 Windows 补丁包。将来出补丁必须保留目录并包含本批全部产品文件，不能遗漏新增迁移、作用域模块和导出文件。

## 6. 明确剩余事项与下一步

1. **T11 仍为 IN_PROGRESS**：同会话运行中消息排队、predecessor 链和 baseline.changed 尚未做；目前明确拒绝并保留前端草稿。不能简单放开 RUN_IN_PROGRESS：否则旧 run 可能读到未来排队消息，或绕过待审批中断。需先写消息视图隔离、审批优先级、前序成功/其他会话改基线的集成测试。
2. T12：feature flags、配置接口、旧入口桥接/回退、SSE 背压与会话过期、真正 kill 进程演练。当前“退出”测试是受控 AbortSignal，不冒充 OS kill 演练。
3. WAITING_APPROVAL 的取消已复用原生 Command 且有 handler 单测；尚缺真实 pending checkpoint 上完整 HTTP stop 的专项端到端测试，不声称所有审批阶段已完成验收。
4. T13–T17：分页/归档/未读/历史交付与分叉仍缺；工作台主视图已接真实数据，不要从零重做。
5. T18–T23：安全参考图输入→像素分析→现有组件证据匹配→语义编译→确认→局部编辑仍未完成。需要视觉模型能力白名单和租户图片外发策略；不能把当前文本 DeepSeek 路由当成支持图片。
6. 模型调用账本与缓存优化尚未接真实生产路径；预算限制继续暂缓。现有 0 条账本不代表真实 0 消耗。
7. T24–T27：原生环境、真实样本/模型评测、灰度与补丁发布尚未完成。不得把静态编译成功当成 KF 运行态通过。
<!-- end -->
