<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
# T22 服务端视觉 review 冻结与确认校验

日期：2026-10-22；功能名：Agent工作台迭代。前置记录：`visual-semantics-20261022.md`、`generation-snapshot-20261022.md`。

## 实际进度与未完成边界

T22 由 NOT_STARTED 转为 **IN_PROGRESS**。本批完成内部服务原语：可信 scoped analysis → 服务端重算能力映射 → 带签名的冻结 review → 原子发布 input.required / WAITING_INPUT → 同事务确认校验。

**不是公开图生闭环完成。** VisualReviewService 暂未注册到生产 module/图节点/HTTP；测试直接装配服务。普通 Run 仍不经过视觉节点、snapshot.visual 仍为 null，当前 public RunAction/协议/flags 没有启用视觉。没有提前把新步骤注入 run-plan@6。

尤其必须区分三个事实：

- 签名回执证明“这是服务端冻结的这份 review”，不证明用户已确认。
- validateAcceptanceInTransaction 校验用户选项、回执和等待状态，但**不创建后继 Run，不持久化确认结果，不消耗等待、不授予模型外发或工程执行权限**。
- 后续必须在 RunStore 的同一受理事务内调用该校验器，再保存完整确认上下文/hash、确认人审计并 CAS 消费等待；随后仍单独确认蓝图。不得在事务外先校验，稍后无条件创建 Run。

沿用当前 main / HEAD `94364cd9add74915c6f85af96357ee5b286faede` 和混合 dirty；不新建 worktree、不自动提交/推送、不出补丁。既有代码已可读；未修改其他 KingFusion 服务。

## 1. 冻结 review 与签名

新增严格合同：

- `kf-visual-review/v1` content：tenant/workspace/conversation/run/base 身份、Run config hash、完整知识目录 hash、分析的 modelConfigHash/derivativeHash、目标运行时 3.6、真实分析 spec/hash 与服务端 mappings。
- `VisualReviewSchema`：content、reviewHash、receipt。
- `VisualReviewAcceptanceSchema`：expectedRunId、analysisId、analysisHash、receipt、acceptedDifferences；不接受模型/browser 自报 mappings、support、evidence、native 身份或 provider 配置。这是独立新合同，**没有放宽或激活旧 RunAction**。

候选与映射复用原 retrieveVisualCapabilities / mapVisualRegions，不额外请求模型、改排序或创造控件。当前服务端检索没有真实 runtime evidence，因此保持 supported_unverified/unsupported，不能凭源码或编译成功升为 verified。

receipt 为短的 `vref1:<contentHash>:<HMAC-SHA256>`；签名有 `kf-visual-review/v1` 域分隔。构造函数至少32字节 key，并复制 key，避免调用方后续修改影响签名；未来装配须使用受控服务器密钥，不允许请求体选择 key。原工程签名权威不改，不使用该回执替代签名工程/蓝图回执。密钥轮换会使旧待确认 review 验证失败，应显式重新 review，不删历史或伪造旧签名。

冻结内容保存在原 AgentRunStep：stepKey=`visual-review-v1`、inputHash=reviewHash、COMPLETED、outputRef 为严格带签名对象。服务只创建一次，不 upsert 覆盖；内容读取时同时复核严格 schema、canonical hash、HMAC、row inputHash、Run/config/catalog 身份及最新 input.required receipt。直接改库并重算普通 hash 仍会被拒绝。

这是**服务级只写一次加签名校验**，不是新增数据库不可变 trigger/table；删除/篡改记录会 fail closed，不宣称该 step 行获得了 GenerationSnapshot 同等级的数据库不可变约束。

## 2. 原子等待与确认事务边界

prepare 仅允许当前服务器 AsyncLocalStorage Run scope，核对 tenant/run、owner/fence、RUNNING、墙钟有效租约、无取消/后继/build 和当前 creative-v2 基线。使用原 run-control advisory lock 与真实行锁，拿锁后再核对租约。

同一事务完成：

1. 校验同租户/工程的 VALID 分析，真实 specHash/source facts，且该分析没有修正 child。
2. 服务端重算映射，冻结配置/目录/来源事实并签名。
3. 存一次 completed review step；写小的 input.required（固定说明+回执，不放 OCR/完整 spec/私有路径）；Run 转 WAITING_INPUT、释放 lease、更新会话活动。

并发相同 prepare 复用确切记录，不多写等待事件；回执事件失败时，review 存储与暂停一起回滚。没有创建 ChangePlan、BuildJob、制品或模型调用。等待后的幂等重读仍要求同 fence、准确分析版本且未取消/未消费。

getWaitingReview / validateAcceptanceInTransaction 从服务器传入的已认证 principal scope 重新核对租户成员与 workspace/conversation/run；沿用现有租户内共享工作区语义，不擅自改成仅原发起人可访问。未来 HTTP 仍必须经 TenantGuard、修改请求 Origin 防护和权限/会话复核；本服务不替代它们。

确认校验还检查最新 pending receipt、工作区基线未变化、config/catalog 未变、分析精确版本和 source/derivative/model 配置一致。会话被消费、取消或进入构建均不能继续确认；过期/篡改回执不能充当蓝图确认。

分析修正生成 child，旧 parent 的 specHash 本来不会变化。因此只比较 analysisHash 不够：本服务也检查 child 存在。分析 parent 行的 FOR UPDATE 持有到受理事务提交，新 child 的 parent FK 检查在该锁之后串行化；已存在修正时旧确认拒绝，不默默跳到新版本。对“先确认提交、后产生修正”的情况，后继 Run 应继续使用受理时冻结的旧版本，而不是运行中偷换来源。

TTL 继续只是分析缓存复用期限，不据 expiresAt 擅自删除/拒绝保留的已审核历史。真正来源资产和外发许可须在后续步骤另行复核。

## 3. 本批修复的两个实际问题

### 明确省略区域却被要求接受控件

既有 validateVisualPlanningContext / buildVisualSourceMap 先对 supported_unverified 强制 accept-unverified，导致用户明确 omit 仍被拦。新增 domain/API 红测均复现 VISUAL_ACKNOWLEDGEMENT_REQUIRED。修复为：明确 omit 且 capabilityId=null、无组件时不要求接受该控件；未省略的未验证能力仍须明确接受。omit 却保留组件依然失败。

当前确认原语允许 accept-unverified / omit。**替代控件尚无对应的新 review 展示/确认流程**，因此 substitute 明确返回 VISUAL_SUBSTITUTION_REQUIRES_REVIEW；不让用户一次提交未展示的 capabilityId 就绕过替代控件的未验证风险。后续须先服务端选择并展示新映射/支持等级，再签新 review，不能简单移除该拦截。

### RunStore 内部调用能绕过 HTTP 未开放动作限制

RunService 虽已拒绝视觉动作/附件，PrismaRunStore.create 原先仍能直接创建 accept_visual_reference，并把 WAITING_INPUT 标记已继续。新增真实 DB 红测复现 promise resolve、产生 QUEUED 后继，而非 FEATURE_NOT_ENABLED。

在 Store 受理事务内、既有幂等重放之后补闭锁：当前协议拒绝 accept_visual_reference / revise_regions / 非空 attachmentIds。拒绝发生在新 Message/Run/Budget、审计和等待消费前；新测试断言等待仍在、无新消息/Run。原幂等重放优先级不改。T22/T23真正启用时须用完整新版本准入/回执校验替换，不把删 guard 当成功接线。

## 4. 测试过程与偏差

- 初始最小 stub 实际执行8项，8项因未实现失败；不是只看 import 错误。
- 首次实现后6通过/2失败：样例错误假定“标题”首选 text，真实既有检索为 richtext；读取实际返回和原检索代码后，只修测试期望/用户选择，没有改生产排序。
- 扩展的省略用例在 domain/API 各复现一次预期红测，修复两处前置 acknowledgement 判断后通过；相关 domain 文件最终13/13。
- Store 越过未开放动作的红测复现后修复。后续测试误用了不存在的 RunBudget.run Prisma relation，运行及 tsc 均报错；按现有 schema 改为确切 runId 查询，不改 schema 或减少拒绝/无副作用断言。
- 最终新 review 文件12项，覆盖冻结/暂停、并发幂等、lease/fence/取消、scope、HMAC防篡改、精确receipt/hash、明确差异/替代拒绝、修正child、config/base/等待状态、analysis完整性、未开放Store动作及事件失败原子回滚。
- 正例使用真实 Prisma/服务端检索/映射/HMAC/Run表，不替换它们。分析/资产是明确的本地 metadata fixture，不伪称真实上传图或 provider 输出；本批无任何真实模型/KF调用。

## 5. 验证命令与环境

使用仓库 `.toolchain/node-v24.19.0-darwin-arm64/bin/node` 和现有依赖，不升级/安装包。

```sh
# cwd: agent-app/apps/api；完整 API
COOKIE_SECURE=true TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_generation_full_20261022_0940 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run
# cwd: agent-app/packages/domain-client；contracts 同命令在自己的目录
../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --maxWorkers=1
# cwd: agent-app/packages/agent-orchestrator；与API不同库
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_generation_20261022_0930 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --maxWorkers=1
# cwd: agent-app
../.toolchain/node-v24.19.0-darwin-arm64/bin/node node_modules/typescript/bin/tsc --noEmit
../.toolchain/node-v24.19.0-darwin-arm64/bin/node node_modules/typescript/bin/tsc -p apps/api --noEmit
../.toolchain/node-v24.19.0-darwin-arm64/bin/node node_modules/typescript/bin/tsc -p packages/domain-client --noEmit
../.toolchain/node-v24.19.0-darwin-arm64/bin/node node_modules/eslint/bin/eslint.js apps/api/src/vision/visual-review.service.ts apps/api/src/vision/visual-review.integration.test.ts apps/api/src/runs/run-store.ts packages/contracts/src/visual-review.ts packages/contracts/src/index.ts packages/domain-client/src/visual/visual-plan-constraints.ts packages/domain-client/src/visual/visual-plan-constraints.test.ts
```

最终完整结果在下节记录。针对性35项 snapshot/analysis/review（当时review10项）及后续扩展用例包含在最终完整套件中，不重复累加。API与图用不同隔离库，同库串行；安全守卫开启，未访问试用库或实际业务库。

本批没有新 migration/schema 变更；两个测试库沿用已 deploy 的21迁移，不重新 seed/reset 试用库。原试用库 `kf_agent_e2e_trial_20261021_01` 继续按旧18迁移状态对待，保留用户数据；源码21与试用18的协调 expand 升级/旧任务排空警告不变。没有改变真实 .env、密钥、旧5174、试用服务或当前 run-plan@6 / vision关闭策略。

### 最终完整结果（2026-10-22）

| 范围 | 最终结果 | 开始时间/耗时 |
|---|---|---|
| API | 61文件，676 passed / 0 failed / 0 skipped | 11:47:25，131.29秒 |
| domain-client | 68文件，1401 passed / 0 failed / 5 skipped（1406项） | 11:47:26，49.86秒 |
| contracts | 20文件，505 passed / 0 failed / 0 skipped | 11:47:27，6.62秒 |
| agent-orchestrator | 19文件，195 passed / 0 failed / 0 skipped | 11:48:00，14.57秒 |

domain 的5项仍为缺本地 `/tmp/kf_ref` golden/参考页面的既有条件跳过，没有新增skip，不能算已通过。API覆盖新review12项、snapshot12项、模型127项、真实Run流程15项、三类golden双构建、鉴权/隔离/取消/恢复；既有会话租约连接清理WARN仍出现，不宣称历史偶发连接故障已解决。不是全monorepo验收。

本批最终root/API/domain tsc、相关7个TS文件ESLint exit 0；任务范围whitespace检查通过。没有重跑Web/浏览器/build-jobs全套、真实provider/KF或进程故障矩阵，不借用历史结果冒充本批证据。

## 6. 本批文件清单

新增3个代码文件：

- `agent-app/packages/contracts/src/visual-review.ts`
- `agent-app/apps/api/src/vision/visual-review.service.ts`
- `agent-app/apps/api/src/vision/visual-review.integration.test.ts`

修改4个代码文件（保留所有前序dirty修改）：

- `agent-app/packages/contracts/src/index.ts`
- `agent-app/packages/domain-client/src/visual/visual-plan-constraints.ts`
- `agent-app/packages/domain-client/src/visual/visual-plan-constraints.test.ts`
- `agent-app/apps/api/src/runs/run-store.ts`

新增本报告，更新master/P4/handoff。没有前端、生成器、编译签名合同或数据库迁移修改。

## 7. 下一步交接清单

1. 完整读 AGENTS、master/design/P4/handoff 与本报告；保留dirty、预算暂缓、旧POST不恢复，不自动提交/推送/新worktree或升级试用环境。
2. 冻结 Run 附件/主补图关系、分析来源、真实模型路由/提示词/配置与外发说明。当前review只记录已有Run config hash和分析modelConfigHash，**不是**已实现全量provider/prompt/pricing冻结。
3. 管理员外发禁用与用户实际发送内容确认先接，覆盖图片以及派生OCR/结构；准入/发送边界复核。review receipt不是外发同意，不能用于静默发送。低置信度、未知交互/数据源的显式澄清与替代映射重review仍需完成。
4. 明确新Run协议/config升级和旧@6排空/恢复策略，再将review prepare接图。prepare本身已经原子暂停，外层executor不能再凭旧lease二次append/pause/finish。配合 graph interrupt/checkpoint、worker结果投影写真实流程测试，不能仅接调用后忽略旧执行器的结束处理。
5. 将确认严格合同接新Run入口：同一会话锁、同一受理事务调用 validateAcceptanceInTransaction，原子保存reference/reviewHash/confirmationHash/确认人审计、创建唯一后继并消费等待。缺receipt/过期/跨scope/并发确认/事务回滚必须有HTTP与DB测试，不重新开放旧messages/resume。旧 RunAction 不够携带新确认字段，须版本化升级而非直接放宽历史@6。
6. 普通 Run 图调用视觉模型端口；语义/编译memo包含精确review/spec/mapping/binding hash，checkpoint只存语义数据，不序列化编译器provenance handle。编译 .visual仅来自受理时冻结的服务器记录，蓝图确认继续独立保留。
7. 前端接上传、review读取/区域叠层/修正、未验证/省略/替代、确认、进度和真工程下载；替代必须展示新风险再确认。覆盖隔离双租户完整浏览器流程、原图不打包及文字不退化，再考虑内部灰度vision。
8. T23局部修改、T24证据及T25/T26真实KF/模型质量，P2进程故障/代理/发布门槛继续独立验收。当前内部review测试不代表真实1:1还原、降本、原生运行或公开流程已完成。
<!-- end -->
