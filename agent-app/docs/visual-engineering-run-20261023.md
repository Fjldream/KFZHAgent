<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
# T22 视觉工程 Run 执行与提交后恢复（2026-10-23）

## 1. 本批结果与边界

T22 仍为 **IN_PROGRESS**。本批接通内部签名 `confirm_blueprint` 工程 Run 的实际执行消费者：

`engineering proof → cache 前校验 → visual-engineering step → 真实 PostgreSQL 图 → capability retrieval → 专用视觉 semantic gateway → 原生编译/签名/GenerationSnapshot → BuildJob → BuildExecutor → revision/工程包/Run 成功`。

真实数据库、Nest worker 模块、图检查点、能力检索、语义校验、原生编译、签名验证、私有存储及打包执行器均保留；模型响应为本地 fixture fetch，单图一个区域，接受未验证 richtext 差异。检查了实际包文件字节及 SHA-256，不是仅把入队当交付。**这不是公共 HTTP 确认到下载或 UI 图 1:1 还原验收。**

公共 Store 的视觉 `confirm_blueprint` 仍保持 `VISUAL_REVIEW_ACTION_REQUIRED`；生成候选来自既有隔离测试内部事务。生产 vision resolver 仍关闭，不能通过开 flag、手工造候选、补签历史 proof 在试用环境使用。预算限制暂缓，旧 POST 不恢复。

## 2. 执行与授权

- `RunExecutionService` 接受 @7 的严格 confirm action；独立 `visual-engineering` step/hash 绑定 engineering inputHash、action、base、版本，不使用 @6 整步缓存。
- 未提交 job 时，按祖先 reader → 当前 Run control/row → 当前数据库 lease 顺序检查。原来源签名/同意、TTL、当前基线、目录、租户外发许可、actor、scope、owner/fence 均沿用。缺 semantic 配置或配置身份改变明确失败。
- 未绑定真实作业却出现已完成工程 step，不允许复用成成功；已提交但未完成的作业也不能凭伪造 step cache 提前成功。
- 新图输入清全部前轮 channels，再仅恢复签名 blueprint/revision/hash、原 accepted 及 stamp。load-context 后确定性进入 capability retrieval，不依赖历史文本或 LLM 将“确认”猜成 intent；不复用旧 native approval/module/build 授权。
- own checkpoint 要求 scope/base/@7/creative-v2、完整 blueprint/hash/revision/accepted/stamp、合法阶段；有 native interrupt 则拒绝覆盖。各图节点的执行屏障再次检查当前规划许可，撤权后不能从已完成 semantic 检查点继续编译。
- 原 semantic/compile/sign/snapshot/enqueue 流程复用，不增加模型直接写 native 的旁路；semantic/control 映射不匹配时失败，不产生快照或作业。
- handler 必须拿到真实绑定 BuildJob 才能交付，不能把图正常退出、停在 idle 或模型生成成功称作工程成功。公开事件仅有安全节点摘要。

## 3. 已提交构建的独立恢复边界

原 `BuildJobService.enqueue` 已在同一事务写入 `BuildJob.agentRunId` 与 `AgentRun.buildJobId`，因此恢复以持久绑定为准，不以 checkpoint 单方面自称的 job 为准；正式入队提交后不再加载图或重调模型/编译/enqueue。

新增 `readEngineeringReceiptInTransaction` 只认证不可变签名回执，**不授权模型外发、编译或新入队**。它验证 engineering HMAC/唯一 durable step/Run identity/action/request、精确已消费 source、独立 signed blueprint review/实际 Message/已发布 receipt。取锁仍是 conversation → source blueprint → engineering Run，不先锁新 Run 再倒序读祖先。

唯一可使用这个只读分支的消费者还必须验证：

1. 当前真实 ALS、owner/fence、数据库 lease、BUILDING/CANCEL_REQUESTED、未 supersede。
2. 本租户本 Run 唯一 job、workspace/base/project/domain、精确 Run.buildJobId。
3. 本 Run compile-creative-solution 唯一不可变 GenerationSnapshot、contentHash、完整重新构造的 sourceMap/assetManifest/materialization、与签名 blueprint 和原 accepted 视觉输入一致。
4. ChangePlan HMAC 验证及 planHash/base/artifactHash/materializationHash、快照 artifact/native 内容完全一致。
5. job 成功时，唯一结果 revision、父 base、project/package hash/storage、快照 job/revision 绑定，工作区当前 revision 只能是这个作业的已提交结果；非成功作业仍要求原 base 且无假结果绑定。

因此提交后的 TTL 到期/租户外发撤权只阻止新的生成，不阻止跟踪这个真实已提交作业；只有它自己的成功结果允许当前基线合法移动。没有全局忽略 stale-base/TTL/policy，也不能拿任意 buildJobId 绕过授权。实际结果收尾仍复用 `waitForRunBuild`，取消沿用 build-worker 提交边界，不提前宣称已停止。

## 4. 测试、失败记录与复验

新增 17 项流程测试，visual-run-flow 从 145 到 162 项。包括完整工程包、提交前后恢复、TTL/撤权后只读跟踪且禁止重载图、semantic 后编译前的真实 PG 检查点恢复/撤权拒绝、坏 proof/签名/foreign job/假 result/cache、取消/缺配置、错误 native 控件匹配。恢复关闭旧 Nest context、换 owner/fence、新 context，不冒充独立 OS kill。

测试构建只领取测试自身的精确 job，并调用真实 BuildExecutor。这里没有验收 JobRunner 的全局队列调度；它在已有其他套件覆盖。本批首次用全局 runOnce 时领到隔离库遗留 fixture 而失败，已换精确范围，未修改生产调度器或清空其他任务。所有测试库均为安全前缀独立库。

中间记录（不抹除）：

- 首个红测明确 `RUN_CONFIG_VERSION_MISMATCH`；接线后因历史消息不是确认文本而触发 `VISUAL_ENGINEERING_BUILD_REQUIRED`，改为可信状态确定性路由。
- 初始测试基线是 SQL NULL 而非真实初始 ClientProjectIR，真实构建报 schema/id/name/pages 缺失；将 fixture 对齐 WorkspaceService 的 DEFAULT_INITIAL_IR，不放宽生产校验。
- 工程包初次读取把 storageKey 当文件路径而 ENOENT；改走租户私有 storage.open 并校验字节 hash。
- 新 precompile 测试初版用了 vi.waitFor 默认 1 秒探测，尚在 RUNNING 且未 settled 时退出；改为与新完整构建测试相同的 5 秒条件探测。未提高套件/既有测试 timeout，不加 retry/skip。
- 第一次 orchestrator 命令误写不存在的测试库名（少了 full），18 文件/207 项通过、1 suite/7 项未运行；修正连接后完整 19 文件/214 项通过（09:33:55 / 11.21s）。未创建或 reset 该错误库。
- 第一次四文件定向 177/177 通过（09:33:09 / 90.13s），但继承的 LangSmith tracing 尝试外发并报 429；不是模型请求。后续命令显式 `LANGCHAIN_TRACING_V2=false LANGSMITH_TRACING=false`，未读取/修改实际 `.env` 或追踪 key。此前告警保留，不能声称本轮所有测试从未访问外部追踪服务。
- root/API tsc 与 11 文件 type-aware ESLint 已完成过一轮；初次 lint 的一个不必要断言已移除，不关规则。
- 第一次完整 API 为 64 文件、872 passed / 2 failed（09:34:51 / 224.65s）：既有 run-executor 的 60ms lease / 15ms renew / 150ms step 用例 FENCE_REJECTED，及既有公共 accept HTTP 幂等重放偶发 404。两项定向复验 2/2 通过（09:40:02 / 5.40s）；给 HTTP replay 断言补充了失败响应体可诊断信息，仍严格要求 202，未改业务认证或放宽租约/测试 timeout。这不足以确定根因，不能宣称偶发问题根治。既有 lease cleanup connection destroyed WARN 同样保留。

最终复验结果在本报告末尾追加，不能把前批 857/857 冒充本批结果。

安全命令（API cwd）：

```sh
LANGCHAIN_TRACING_V2=false LANGSMITH_TRACING=false COOKIE_SECURE=true TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_generation_full_20261022_0940 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --reporter=dot
```

API 全量单独执行；targeted 使用 `kf_agent_test_generation_20261022_0930`。orchestrator 使用另一个空闲测试库，不能与 full API 同库并发。实际试用 `kf_agent_e2e_trial_20261021_01` 不触碰。

## 5. 下一模型直接接什么

1. 不重做视觉分析、review/blueprint/engineering proof、semantic service 或本批工程 handler。
2. **公共视觉 confirm Store 事务**：当前 gate 必须确认 review/blueprint/semantic 消费者都可执行；固定原 actor/base/config，幂等优先 gate，候选 SQL NULL → freeze 唯一消费 source，Message/budget/queued/audit 同事务。不要绕过通用 active 屏障后又二次消费。
3. 真实 Cookie/Origin `confirm_blueprint` → 当前正式 executor/PG graph → native snapshot/build → 下载 API 端到端，覆盖幂等、并发、取消、scope、失效回执/基线及失败回滚。
4. 再接现有 UI 的参考图上传/明确外发授权、差异选择、独立蓝图确认、失败重试/最终下载；不是重建前端。
5. 生产视觉 flag 仅在完整当前部署/迁移/worker 排空升级/回退验证后考虑开放。旧 @7 同版本字符串不代表支持 confirm，不允许混领；旧无 semanticModel 配置 proof 不补签救场。
6. 多图/编辑区域、真实模型质量/缓存降本、KF/Windows/像素级还原、生产代理/多副本/OS kill 等仍未验收。需要授权环境/配置的部分明确保留，预算仍暂缓。

本批未执行迁移/seed/reset 实际试用，未读取真实 key/`.env`，未重启试用进程，未调用真实模型或 KF；源码 21 迁移对旧试用 18 迁移保护不变。未 commit/push/开 worktree/多代理，也未出未要求的补丁。

## 6. 文件清单

新增：

- `apps/api/src/runs/visual-engineering-run-input.ts`
- `apps/api/src/runs/visual-engineering-run-handler.ts`
- 本报告。

修改：

- API runs：run-execution-plan.ts、run-execution.service.ts、run-graph-input.ts、run-handler-registry.ts、agent-worker-bootstrap.ts、visual-run-flow.integration.test.ts。
- API vision：visual-blueprint-authority.ts、visual-review.service.ts。
- agent-orchestrator：solution-graph.ts。
- 文档：master、handoff、P4、design §10、operations。

共 11 份代码/测试、6 份文档；本批不改 contracts、数据库 schema/migration、Web 或其他服务。

## 7. 最终复验

2026-10-23，Asia/Shanghai：

| 范围 | 最终结果 | 开始 / 耗时 |
|---|---|---|
| API 完整复验 | 64 文件，874 passed / 0 failed / 0 skipped | 09:40:44 / 216.20s |
| agent-orchestrator 完整复验 | 19 文件，214 passed / 0 failed / 0 skipped | 09:33:55 / 11.21s |

本批这两个完整范围合计 1088 passed，非 monorepo 全量。177 项四文件定向、2 项失败用例单独复验均已包含在完整范围内，不重复计数。root/API tsc exit 0，最终 11 文件 type-aware ESLint exit 0；涉及 tracked 文件 diff --check 及新增源/报告末尾空白检查通过。

最终 API 命令明确关闭 tracing，未再出现 429，既有 lease cleanup WARN 仍有。完整绿测不抹去第一次 872/2、HTTP replay 404 与 60ms lease 问题；根因仍未全部确认，不新增 retry/skip 或放宽既有时间约束，不声称这些偶发问题已根治。

本批没有重跑 Web/browser/contracts/domain-client/build-jobs 全量、公共视觉 confirm 下载 HTTP E2E 或真实 provider/KF/Windows/生产代理/多副本/OS kill/像素质量验收；不沿用前批测试数充当本批通过数。后台测试已结束，未留下本轮运行测试或启动业务服务。
<!-- end -->
