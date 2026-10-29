<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
# T21 生成来源、不可变快照与成功交付绑定

日期：2026-10-22；功能名：Agent工作台迭代。

## 本批实际实现

T21 **IN_PROGRESS**。本批不再只是独立纯函数：新的 creative-v2 **真实 Run 文本主链**在签名编译计划持久化事务里创建 GenerationSnapshot，随后才允许既有节点入队；成功构建的原事务一次性绑定 snapshot / revision / job / artifact。已有真实 Run 确认→Worker 构建→下载测试增加快照断言，已做红绿验证。

视觉部分已有严格的分析/映射/差异/组件绑定合同、确定性 sourceMap 构建与持久化入口；仍缺视觉提示词、语义模板到展开组件的绑定接线、Run 图片确认及授权/UI，因此**不能说图生工程端到端完成**，也不能启用 vision flag。当前生产主链创建的 snapshot.visual 为 null；有视觉数据的持久化测试使用独立、明确的测试分析记录，不是公开图生入口。

保留原生编译器、签名和构建授权：不直接写 native，不改 SolutionImplementationPlan v1、原 catalog snapshot 或原计划 hash，不把 snapshot 当作执行授权。以独立 `kf-generation-snapshot/v1` 封装现有 `CreativeBuildArtifact`（其中已包含严格的 blueprint、candidateBundle、semanticPlan、implementation 和版本证据），避免重复创造宽松的 unknown 字段合同。

沿用用户已选的当前目录/main，HEAD `94364cd9add74915c6f85af96357ee5b286faede`；保留混合 dirty，不新建 worktree，不自动提交/推送。修改前检查涉及代码均已可读，无压缩文件修改。

## 来源映射与差异约束

- `SourceMapEntry = {regionId, componentId, nativeIds}`。这里 componentId 是**编译后精确 semanticControlId**，不是任意路径、DOM selector 或直接 native ID。
- 新控件 native ID 复用现有物化器相同的 `deriveGuid({seed:workspaceId}, instanceName)`；上传控件保留经过权威物化证明的 nativeGuid。没有从模型字段或字符串前缀猜原生身份。
- `buildVisualSourceMap` 读取完整 TrustedNativeMaterialization，核对控件存在、实际 capability、分析内容 hash、区域引用和映射完整性。
- 不同区域/组件不得争用同一 native ID；同一组件不得被重复绑定。父子视觉区域可分别绑定不同的真实父/子组件；本批不允许隐式共享组件，也不猜 repeater/module 展开前缀。
- supported_unverified 需要明确 `accept-unverified` 差异记录；unsupported 必须明确 omit 或 substitute。省略的区域不能还有编译组件；替代必须对应真实且可新生成的能力，不能偷偷执行 fallback。
- Snapshot 保存完整视觉 spec/hash、mappings、bindings 和差异原因，不覆盖已确认分析。所有这些数据必须由 T22 的服务端确认流程产生；本批**没有公开接受这些 payload 的新 API**。尤其不允许模型/浏览器自报 runtime verified 或伪造 acknowledgement。
- `assetManifest` 只接受现有 ApprovedAssetFacts，并与签名编译 artifact 的 verifiedAssets 精确一致；参考图记录不能变成 res/images 资产。最终属性值、脚本和交互闭环仍走既有合同及编译器。
- sourceMap 只覆盖显式绑定的视觉区域组件；非视觉文字 Run 的 sourceMap 为空，但完整原有 blueprint/语义/物化来源保存在 artifact 中。不能把本批称为已经建立所有历史工程的可编辑区域来源。

## 持久化、一致性与生命周期

`GenerationSnapshotService.create/createInTransaction`：

1. 仅允许服务器 AsyncLocalStorage 中的当前 Run 身份；核对 tenant/run、owner、fence、base revision、RUNNING、未取消和数据库真实时钟下有效 lease。
2. 同既有 run-control 锁协议串行化发布；快照与完整已验证签名计划在同一事务落库，没有可变草稿或先入队后补来源的窗口。
3. 所有语义 JSON 先通过现有严格合同与 artifact/materialization 投影校验，并核对 workspace/base 和已存签名 envelope 的编译 hash。该服务不是替代 HMAC 权威；真正构建继续验证原签名。
4. 视觉 analysis 必须是同租户/工作区的 VALID 持久化版本，真实 spec hash 与冻结 spec 一致；不能只相信传入的 analysisId。
5. `(runId, stepKey)` 唯一。相同已完成输入复用 ID/hash，并发经 DB 锁确定同一结果；不同内容或不同 changePlanId 报冲突，不覆盖旧快照。最多 16MiB JSON 内容，哈希不包含随机 snapshot ID/创建时间。
6. PostgreSQL trigger 阻止更新内容、hash、来源身份和创建事实。仅 revisionId/buildJobId 可由双 null 同时变为真实成功绑定，之后不能改写；不存在普通 PATCH。

`BuildJobService.completeBuild` 在原成功事务内查当前 Run 的 compile snapshot，核对租户/工程/base/changePlan 和确切 creative/native hash，再关联新 revision/job。错配抛错，整个 publication 事务回滚，不留下成功 revision/artifact 或改变 workspace 当前版本。失败、取消、stale-base、失效租约沿用原拒绝路径，不绑定成功记录。

`bindRevision` 对正常成功事务已经写入的绑定做幂等复核，不提供“先发布成功、后异步补快照”的旁路。历史无 snapshot 的 Run/job 不补造记录、不重算旧签名，仍可走旧的合法读取/构建行为；历史版本仍不能据此进行区域编辑。

工作区删除继续先阻止活跃 Run/正在执行 build；只有现有明确授权的整工作区删除才会先删该工程 snapshots，再删终态 Run/分析/修订。没有新增 TTL 自动删历史或清理现有用户工程。测试中的删除仅针对本批生成的独立测试工作区，临时存储目录也仅为该测试创建。

## 数据库与试用环境边界

新增 additive migration：`202610220001_generation_snapshots`，**不是原计划 202610200009**。schema 新增 GenerationSnapshot、复合归属 FK、所需唯一索引和不可变 trigger；不改历史迁移。

SQL SHA-256：`65e3112eb5903cb5b575fd8f23446bea47047c0d7ee3a768cd30601d56524bd9`。

只新建并部署两个安全测试库：

- `kf_agent_test_generation_20261022_0930`：初轮红绿测，随后 build-jobs 回归使用。
- `kf_agent_test_generation_full_20261022_0940`：干净队列的真实 Run/完整 API 回归使用。

两库均从零 deploy **21 条迁移**，有显式 TEST_DATABASE_URL + `KF_TEST_ALLOW_DESTRUCTIVE_RESET=1` 和原安全前缀守卫。不同进程只在不同测试库并行，同库按顺序运行。未访问业务数据、未运行 trial seed/reset、未变更 `.env` 或模型 key，未升级或重启试用进程，未调用收费模型/真实 KF。

源码/Prisma Client 现要求最新 21 迁移；原试用库历史记录为 18 条，且前两批另有 Tenant 新列依赖。**不得直接将新代码/worker 重启指向旧试用库**。需维护者协调 expand 升级和排空旧 Run；不能用重建试用库解决。协议仍 `run-plan@6`，本批不改变原执行收据或旧 signed plan；旧 completed step 不自动补造来源。

LangGraph 自行管理的 4 个 checkpoint 表不属于 Prisma schema；不删除它们来让 drift 检查“变绿”。本批没有声称对已有图测试库执行 migrate diff 后无差异。

## 红绿测与中间失败记录

- 上一批视觉映射基线 33/33。
- 新 constraints 首次缺模块失败后，最小 stub 实际执行 **11 项、10 failed / 1 passed**，可见区域/归属/ack/sourceMap 断言失败；不是只看 import 错误。实现后 11/11。
- 新 builder 的 scope 测试发现 artifact 投影本身不携带独立可信 workspace 身份；补入服务端 workspace/base 参数精确复核，不修改原 compiler 合同，也不放宽失败断言。
- 初轮 snapshot 集成 9 项中 7 passed / 2 failed，确实复现尚未原子绑定与错 hash 仍发布；接入成功事务后 9/9。
- 真实 Run 下载用例加 snapshot 前后断言，红测失败于快照为 null；接入 persistCreativePlan 同事务后通过，原构建/下载断言不改。
- 新工作区删除红测确实触发 GenerationSnapshot_run_fkey；补工程内快照的安全清理顺序，不扩大删除目标/自动取消权限。
- 初轮将假构建失败回滚测试与 Run-flow 混跑同库，因遗留假 RUNNING job 被既有 `RUN_FLOW_REQUIRES_CLEAN_BUILD_QUEUE` 保护拒绝；不是生产队列故障。测试 teardown 只将自身 UUID 工作区的假作业终态化，另用全新测试库验证，未移除队列守卫、skip 或断言。
- 初轮 tsc/ESLint 发现共享 helper 位于包外不能解析 workspace alias/未纳入 project service；改为精确源码相对 import，并在 root tsconfig 显式纳入该 helper，不关闭 lint/typecheck。

root `tsconfig.json` 为 JSONC 既有格式，本批仅增加 `tests/helpers/generation-fixture.ts` include；功能名/日期/变更位置在本清单记录，不新增非法 JSON 注释。

## 验证命令与范围

使用仓库 `.toolchain/node-v24.19.0-darwin-arm64/bin/node` 和既有依赖，不升级 Prisma/框架或安装新包。

```sh
# cwd: agent-app/apps/api；运行完整 API，数据库明确指定隔离库
COOKIE_SECURE=true TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_generation_full_20261022_0940 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run
# cwd: agent-app/packages/domain-client；contracts 同命令在自己的包目录运行
../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --maxWorkers=1
# cwd: agent-app/packages/build-jobs；不同安全隔离库
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_generation_20261022_0930 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --maxWorkers=1
```

针对性 snapshot/Run-flow **27/27** 已通过。完整回归最终结果记录于文末；这些包含关系不能重复累加。未重跑浏览器/Web/独立 worker 全套，未做跨平台、真实 provider 费用/像素质量、KF native runtime/visual 验收，不将 fixture 模型产生的真工程包当作真实模型质量证明。

### 最终完整回归（2026-10-22）

- API：**60文件661 passed / 0 failed / 0 skipped**；09:35:45 开始，127.49秒。包含12项新snapshot测试、真实Run确认/构建/下载、取消/恢复、三种golden工程、已有视觉分析与鉴权/隔离等；不是全monorepo验收。会话租约故障测试有一条连接清理 WARN，测试通过；不据此声称生产连接问题全部解决。
- domain-client：**68文件1396 passed / 0 failed / 5 skipped（1401项）**；09:35:46开始，48.62秒。5项为既有缺 `/tmp/kf_ref` golden/参考页面的条件跳过，未新增skip，不视作已通过。
- contracts：**20文件505 passed / 0 failed / 0 skipped**；09:35:47开始，5.92秒。新增合同还由domain/API真实语义数据和负例覆盖，不改变旧合同测试断言。
- build-jobs：**4文件68 passed / 0 failed / 0 skipped**；09:36:29开始，4.96秒。与API使用不同安全测试库。
- root/API/domain-client tsc、相关TS ESLint、Prisma validate与任务范围diff whitespace检查通过。迁移表实际checksum与本报告SHA一致、累计21条完成。

上述针对性27项和新constraints11项已分别包含在API/domain完整结果，不另外累加为“总测试数”。

## 本批文件清单

新增：

- `agent-app/packages/contracts/src/generation-snapshot.ts`
- `agent-app/packages/domain-client/src/visual/visual-plan-constraints.ts`
- `agent-app/packages/domain-client/src/visual/visual-plan-constraints.test.ts`
- `agent-app/apps/api/src/generation/generation-snapshot.service.ts`
- `agent-app/apps/api/src/generation/generation-snapshot.integration.test.ts`
- `agent-app/tests/helpers/generation-fixture.ts`（仅测试装配，不进入生产 exports）
- `agent-app/prisma/migrations/202610220001_generation_snapshots/migration.sql`
- `agent-app/docs/generation-snapshot-20261022.md`

修改（保留原 dirty hunks）：

- `agent-app/packages/contracts/src/index.ts`
- `agent-app/packages/domain-client/src/index.ts`
- `agent-app/apps/api/src/conversations/graph-ports.ts`
- `agent-app/apps/api/src/workspaces/workspace.service.ts`
- `agent-app/apps/api/src/runs/run-flow.integration.test.ts`
- `agent-app/packages/build-jobs/src/build-job.service.ts`
- `agent-app/prisma/schema.prisma`
- `agent-app/tsconfig.json`
- `docs/superpowers/plans/2026-10-20-agent-app-p4-vision.md`
- `docs/superpowers/plans/2026-10-20-agent-app-next-master.md`
- `docs/superpowers/plans/2026-10-20-agent-app-handoff.md`

这不是整轮迭代的 Windows 完整补丁清单；没有 commit/push 或正式补丁。

## 下一模型第一步

先核对当前代码/计划与本报告，再补 T21→T22 的**视觉语义接线红测**：已确认 analysis/hash + 服务端重算映射/差异/receipt → implementation prompt 的独立视觉上下文 → 语义节点到编译组件（尤其 repeater/registered-module）的显式绑定 → 当前 snapshot 创建事务。当前生产 visual:null 不得偷偷换成模型上报的 visual 对象。

不为了快照另写 native、不覆盖旧合同/签名、不从压缩 native JSON 猜历史来源。先保持 Run/附件和模型配置冻结、租户管理员外发许可及发送说明、WAITING_INPUT review/确认和实际工程交付同一链路，再开放图片入口。确认来源和 acknowledgement 的用户授权仍需 T22，不因本批有差异合同就视作已完成。
<!-- end -->
