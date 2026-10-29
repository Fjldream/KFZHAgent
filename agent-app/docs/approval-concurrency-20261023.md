<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
# I1 审批并发验收的确定性时序（2026-10-23）

## 1. 范围与结论

接续 `visual-review-editing-20261023.md` §7 的全量 API 925 passed / 1 failed。失败来自 `api.integration.test.ts` 的旧领域测试驱动器 `LegacyConversationDriver`，不是恢复已退役的 HTTP resume，也不是公共 Run/视觉接口新增故障。

该测试把三个 `Promise.all` 调用等同于三个请求一定在同一 turn lease 持有期重叠。实际每个调用还需真实会话验证、会话查询、图获取、数据库连接及锁申请；Promise 同时启动不能保证它们到达锁的时序。

现有服务中：持有者未释放时，真实 `pg_try_advisory_lock`/durable fence 拒绝竞争者，返回 `CONVERSATION_TURN_IN_PROGRESS`；持有者完成并释放后，后续请求可以获得锁，再读取真实 checkpoint，发现审批已经消费，返回 `NO_PENDING_APPROVAL`。这两个不同状态不能用同一个错误码断言。

本批只修复测试的时序前提，不改生产/测试驱动器业务实现，不允许两个错误码任选其一，不增加 retry/timeout/skip。原历史失败没有逐请求锁时序日志，不能反向宣称已经记录了该次请求的确切执行顺序；本批确定性验证了两个状态及它们的精确响应。

## 2. 确定性验收

原 I1 concurrency 保留 `[200,409,409]`、两个 `CONVERSATION_TURN_IN_PROGRESS`、唯一 building/buildJob、PLAN_CONFIRMED/BUILD_START 各一条及 BuildJob 一条断言，并增强：

1. 让第一请求使用真实图、PostgresSaver、事务和数据库租约执行；测试仅在 `AuditService.record` 完成真实 PLAN_CONFIRMED INSERT 后、外层事务尚未提交时设置 Promise gate。
2. 直接读取真实 checkpoint，确认 graph 已进入 building 且 interrupt 已清除；同时确认 durable fence 为 ADMITTED、另一连接尚看不到未提交审计。
3. 在 gate 不释放的期间发出两个竞争请求，要求它们已经返回精确 409/BUSY，而不是先释放后等待它们结束。确认没有额外审计调用，原 fence 完全不变。
4. 释放 gate，等待真实提交/lease.dispose；检查原所有成功/唯一副作用断言及 fence 已删除。
5. finally 总是释放 gate、等待胜出请求完成并还原 spy，避免测试失败把未提交事务/spy 留给后续用例。

新增独立 I1 ordering 用例：真实首次审批完成后先确认 fence 为 0，再重放同 planHash，必须精确 `NO_PENDING_APPROVAL`，审计各一条和 BuildJob 一条不增加。该场景不冒充锁内竞争。

## 3. 实际执行与中间结果

- 原未修改的 I1 并发单例 1/1 通过（13:18:45，4.27s）；不能用一次通过否定先前全量的失败。
- 为验证旧错误码前提，新增“已释放 fence 后重放”用例先沿用旧 BUSY 预期，确定性红测：实际 NO_PENDING_APPROVAL（13:19:31，4.04s）。该红测刻意检验原测试的错误前提，不声称是新生产功能缺失。
- 将上述独立场景精确断言为 NO_PENDING_APPROVAL，并为原锁内竞争添加真实审计提交 gate，两个 I1 用例 2/2 通过（13:20:12，4.75s）。过滤执行中其他 58 项未选，不当作全文件通过。
- API tsc 与修改文件 type-aware ESLint 均 exit 0。root tsc、完整 API（含显式 opt-in Chrome）最终结果见 §5。

## 4. 环境、文件与后续

使用已保留的隔离测试库 `kf_agent_test_review_flow_20261023_1245`。执行前只读验证库名、21 条迁移及无其他连接；仅此库运行有既有安全守卫的测试清理。未访问/重置旧试用库、未操作试用进程、未读改实际 .env/key、未发送收费模型/KF请求、未迁移 schema。模型采用既有本地 fixture。

代码仅修改 `agent-app/apps/api/src/api.integration.test.ts`，保留原文件已有 dirty 改动；新报告及 master/handoff/P2/operations 更新当前状态。没有修改 lease 管理器、executor、公开 Run/视觉合同、生产审批代码、测试驱动器或生成核心。未开 worktree/子代理、未提交推送、未生成未要求的补丁。

复验命令（API cwd；固定本地工具链，禁用 tracing）：

```sh
LANGCHAIN_TRACING_V2=false LANGSMITH_TRACING=false KF_VISUAL_BROWSER_TEST=1 COOKIE_SECURE=true TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_review_flow_20261023_1245 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --reporter=dot
```

不得同库并发 reset。单独诊断使用同一文件和 `-t 'I1 ordering|I1 concurrency'`，过滤结果不能替代全量证据。只覆盖此处明确测试的语义；不声称历史短 lease/偶发 404/cleanup WARN 根治，API/worker OS kill、代理/多副本、事件保留与升级回退仍待专门验收。

下一步回到 T22 剩余：区域增删/层级/交互与数据源合同、替代组件、视觉重试；之后 T17/T23 历史与局部修改、T24–T27 质量/真实模型与 KF/Windows/1:1/发布。production vision 仍关闭，不能只改 flag 试用；旧试用 18 对源码 21 迁移和排空整体升级要求不变，预算拦截仍暂缓。基础 UI→工程下载及已有区域原子编辑已实现，不重复建设。

## 5. 最终复验

2026-10-23 Asia/Shanghai：完整 API **64 文件、927/927 passed、0 failed、0 skipped**（13:20:50 开始，252.22s），包含完整 214 项 visual-run-flow 及真实 Chrome 上传→识别编辑→重新确认→蓝图→native 工程包下载。新增一个 ordering 用例，原 concurrency 用例增强但不重复计数；此前 926 项变为 927 项。

API tsc、root tsc、修改文件 type-aware ESLint 均 exit 0；scoped diff whitespace 检查通过。Web/contracts/domain/build-jobs/orchestrator 独立全量没有在本批重跑，不把上一批数字算成本批结果。生产业务代码没有改动，不需要为此改变视觉准入。

Chrome 证据保留 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-visual-browser-wqOiFG`（fixture 图片、截图与实际工程包；模型响应本地），测试创建的浏览器/API/Web 进程已随完整套件退出。既有 `Conversation turn lease connection was destroyed during cleanup` WARN 仍出现；单次全绿不证明历史短 lease/偶发 404/资源或故障恢复专项根治。

**本批 I1 时序验收已收口，当前完整 API 全绿；T22 和计划整体仍 IN_PROGRESS，生产视觉仍关闭。** 后续直接继续 §4 功能/系统验收，不重复放宽或修正同一错误码断言。
<!-- end -->
