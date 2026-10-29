<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
# 旧执行接口退役与验证交接

> 后续已完成默认关闭/精确名单、Run 准入与 flags/协议快照、前端只读等接线。最新 657 项验证、启用方式及剩余门槛见 `run-feature-policy-20261021.md`；本报告保留旧入口退役批次的 635 项历史证据。

日期：2026-10-21。任务：T12 的旧入口收口；**T12 整体仍 IN_PROGRESS**，不代表所有迭代任务或发布门槛完成。

## 1. 需求与实施决策

维护者最新要求：“继续，旧接口不要的其实都可以去掉了”。据此取消初稿的旧 POST SSE/resume 兼容桥：所有公开生成入口只走持久化 Run。

- 删除 `POST /api/conversations/:id/messages` 和 `POST /api/conversations/:id/resume`，登录/未登录均 404。没有 200 空响应、重定向或 flag-off 回落到旧执行器。
- 生产 ConversationService 不再提供 startTurn/resume、socket 驱动的图执行、旧 SSE disposer 和 finalStateData。保留会话创建/列表/详情、消息脱敏、交付查询，以及 worker 共用的图依赖装配、turn lease、run memo；改名/归档等会话管理仍是后续任务。
- 删除已无 UI 入口引用的 Web workspace store 及其 25 项旧界面测试；移除 api.resume、streamMessageTurn 和旧 SSE done/interrupt 类型。SSE 只保留 Run GET events 正在使用的通用帧解析器。stage 推导改依赖最小输入类型，不再引用已删除 store。
- legacy/module-v1/creative-v2 **工程工作流仍保留**；未变更 generationWorkflow、数据库业务记录或历史制品。审批回执、签名、租户隔离、基线保护、交付绑定与 token 下载没有绕过。
- 没有升级模型、调用收费 API、修改其他 KingFusion 服务或部署到运行环境。已启动的本地/生产常驻服务不会因此自动重启。

## 2. 历史场景如何保留

旧测试大量混合 HTTP 查询/安全与图领域断言，不能整套删除。测试专属驱动器放在 `apps/api/test-support/`：继承当前 ConversationService 复用真实图定义/编译器，仅在测试里提供旧回合驱动；内存 response 保留旧领域断言，不向已退役 URL 发 HTTP。

- `api.integration.test.ts` 的认证、租户隔离、上传、历史消息、交付、报告和下载仍请求真实 HTTP；历史生成场景显式使用 legacyGraphRequest。跨租户写检查已改为现行 Run 接口与合法 Origin/payload。
- conversation 的 SSE/turn-lease 历史特性使用测试夹具，不代表生产仍有 SSE 执行接口。实际图依赖 wiring 的第一项单测仍测试当前生产类。
- Run 集成套件使用当前 AppModule/ConversationService，没有覆盖成 legacy driver，继续验证真实队列、图、确认、审批取消、构建与下载。
- 新建隔离库暴露了历史套件在 reset 前假定 checkpoint 表已存在的问题，现先运行真实 saver 初始化再 reset。
- Nest 继承类会继承显式注入索引；测试 driver 所有构造参数明确注入，避免生产类移除 AuditService 参数后把 audit/delivery 注错。
- 消息脱敏用例给历史输入显式时间，避免毫秒相同造成 PostgreSQL 任意排列；没有改变生产排序合同。
- Golden 的旧断言仅识别 v3 单动作标记/旧声明式 navigatePage。当前已有编译器将多目标、多效果与导航输出到单个有序脚本槽：测试现独立验证包内片段身份、实际目标/顺序、ShowPage/setVisible 脚本、字节数和 SHA-256。未修改 domain-client 的用户既有编译实现，也未删掉失败断言降低质量门槛。

注意：test-support 没有被生产 exports、AppModule 或 worker 引用。历史夹具的成功不能冒充新 Run 的浏览器验收、费用账本或审批/构建审计已经完成。

## 3. TDD 与最终验证

新增 `legacy-routes.integration.test.ts`：红测两个旧入口分别得到 200/409（预期 404）；移除后 3 项绿测验证旧入口无消息/Run/build 副作用、新 Run 202 入队且 GET messages 可读。

最终相关回归 **635 passed，0 failed，0 skipped**：

| 范围 | 文件数 | 测试数 |
|---|---:|---:|
| API：Run + 历史领域/HTTP/安全 + 模型适配器 | 31 | 364 |
| Web 当前全部组件/视图测试 | 23 | 102 |
| agent-orchestrator 相关流程 | 4 | 60 |
| build-jobs 全部 | 4 | 68 |
| worker 相关构建与恢复 | 4 | 41 |

此数量包含扩大的历史回归，不可与前一批 571 简单当成新增测试数；Web 数量下降是退役 25 项旧 store 测试。金标准 1 个集成用例实际执行三类项目各两遍生成、Worker 构建、token 下载、原生包重新导入与确定性比较。

API/agent-orchestrator/build-jobs/worker TypeScript、Web vue-tsc/Vite build、相关 TS ESLint 与 diff --check 通过。turn-lease 的故障测试会出现一次连接销毁告警，断言通过。未运行 monorepo 全量、Playwright、收费模型、真实操作系统进程 kill 或 KF 原生运行态验收。

### 可复现命令

本机系统 Node 依赖 ICU 不可用，使用仓库 `.toolchain/node-v24.19.0-darwin-arm64/bin/node`。各命令在其指明目录运行；不得替换为业务 DATABASE_URL。

API cwd：`agent-app/apps/api`，单进程顺序执行：

```sh
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_retirement_20261021_1015 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run src/runs src/conversations/graph-ports.test.ts src/models/model-cancellation.test.ts src/models/deepseek-transport.test.ts src/conversations/deepseek-model.test.ts src/auth/mutation-origin.guard.test.ts src/api.integration.test.ts src/conversations/conversation.service.test.ts src/conversations/conversation.controller.test.ts src/conversations/conversation-state-projection.test.ts src/conversations/conversation-turn-lease.integration.test.ts src/creative-goldens.integration.test.ts
```

其余验证：

```sh
# cwd: agent-app/apps/web
../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run
../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node node_modules/vue-tsc/bin/vue-tsc.js --noEmit
../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vite/bin/vite.js build

# cwd: agent-app/packages/agent-orchestrator
../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run src/nodes/load-context.test.ts src/nodes/classify-intent.test.ts src/solution-graph.test.ts src/run-step-memo.test.ts

# cwd: agent-app/packages/build-jobs
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_runflow_20261020_462937 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run

# cwd: agent-app/apps/worker；必须在 build-jobs 完成后串行跑（同一专用库）
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_runflow_20261020_462937 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run src/job-runner.integration.test.ts src/worker-instance-id.test.ts src/domain-packs.test.ts src/server-plan-authority.test.ts

# cwd: agent-app；四个 project 分别执行
../.toolchain/node-v24.19.0-darwin-arm64/bin/node node_modules/typescript/bin/tsc -p apps/api --noEmit
../.toolchain/node-v24.19.0-darwin-arm64/bin/node node_modules/typescript/bin/tsc -p packages/agent-orchestrator --noEmit
../.toolchain/node-v24.19.0-darwin-arm64/bin/node node_modules/typescript/bin/tsc -p packages/build-jobs --noEmit
../.toolchain/node-v24.19.0-darwin-arm64/bin/node node_modules/typescript/bin/tsc -p apps/worker --noEmit
```

API 本批新建 `kf_agent_test_retirement_20261021_1015`，已有 18 个 Prisma migrations 全部 deploy 成功；本批无新 migration。构建/worker 使用前序专用测试库，其 TRUNCATE 与 API 验证不共库并发。不要将该旧构建测试库的历史手工迁移状态当成生产 deploy 基线。

## 4. 当前批次文件清单（相对仓库根）

修改：

- `agent-app/apps/api/src/conversations/conversation.controller.ts`
- `agent-app/apps/api/src/conversations/conversation.service.ts`
- `agent-app/apps/api/src/conversations/conversation.controller.test.ts`
- `agent-app/apps/api/src/conversations/conversation.service.test.ts`
- `agent-app/apps/api/src/conversations/conversation-turn-lease.integration.test.ts`
- `agent-app/apps/api/src/conversations/conversation-state-projection.test.ts`
- `agent-app/apps/api/src/api.integration.test.ts`
- `agent-app/apps/api/src/creative-goldens.integration.test.ts`
- `agent-app/apps/web/src/api.ts`
- `agent-app/apps/web/src/sse.ts`
- `agent-app/apps/web/src/types.ts`
- `agent-app/apps/web/src/stores/stage.ts`
- `agent-app/apps/web/src/stores/stage.test.ts`
- `agent-app/docs/run-queue-20261021.md`
- `docs/superpowers/specs/2026-10-20-agent-app-next-design.md`
- `docs/superpowers/plans/2026-10-20-agent-app-next-master.md`
- `docs/superpowers/plans/2026-10-20-agent-app-p2-runs.md`
- `docs/superpowers/plans/2026-10-20-agent-app-handoff.md`

新增：

- `agent-app/apps/api/src/runs/legacy-routes.integration.test.ts`
- `agent-app/apps/api/test-support/legacy-conversation-driver.ts`
- `agent-app/apps/api/test-support/legacy-conversation-controller.ts`
- `agent-app/apps/api/test-support/legacy-graph-request.ts`
- `agent-app/docs/agent-runs-operations.md`
- `agent-app/docs/legacy-retirement-20261021.md`

删除：

- `agent-app/apps/web/src/stores/workspace.ts`
- `agent-app/apps/web/src/stores/workspace.test.ts`

删除前已将这两个文件及 api.ts/sse.ts/types.ts 原始版本（含用户既有未提交内容）完整备份到：

`/tmp/kf-agent-legacy-client.SnIVY5/legacy-web-before-retirement.tar.gz`

SHA-256：`f7321a31a7ec5da2faf08b835ad67001801f900c7a4d627511c49ad4cd9ce430`。归档条目保留仓库相对路径。可先解到另一个临时目录检查，不要直接覆盖当前新实现。`/tmp` 是本机临时恢复点，不是跨机器永久备份；移交前如需保留，应由维护者保存。历史后端驱动逻辑已保存在 test-support 中。没有删除业务数据。

当前基线仍为 main / `94364cd9add74915c6f85af96357ee5b286faede`，大量混合 dirty；未 reset、commit、push 或生成正式 Windows 补丁。后续打包必须按此清单及后续任务的清单保留层级，包含新增/修改文件并单列删除项，不能只打 Git tracked diff 或覆盖其他用户改动。

## 5. 下一模型第一步

先读根 AGENTS.md、最新 design/master/handoff、本报告和 `agent-runs-operations.md`，不要恢复旧 POST 或再做兼容桥。继续 T12：服务端 admission flags/allowlist/configSnapshot（预算暂缓）、新 Run 审批/构建幂等审计、SSE 生命周期、迁移当前 Playwright 到新工作台/独立 agent-worker，随后实际进程故障与发布演练。旧无 runId 待审批 checkpoint 无自动迁移，部署前须维护者处理，不能直接删锁或猜批准。

图片理解、控件映射、局部修改和 KF 原生视觉验收仍是后续任务；本轮不宣称图生工程或缓存降本已经实现。
<!-- end -->
