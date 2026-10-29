<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
# T22 确认后继：可信继承与原子消费原语

日期：2026-10-22；功能名：Agent工作台迭代。接续 `visual-run-flow-20261022.md`。main / HEAD `94364cd9add74915c6f85af96357ee5b286faede`；沿用当前目录，保留混合 dirty，不自动提交、推送、开 worktree 或多代理。

## 1. 本轮结果与严格边界

已实现内部 `VisualReviewService.freezeContinuationInTransaction`：对调用方事务中已经创建的候选后继，验证实际等待与签名回执，存可信 accepted 输入、域隔离签名、completed step、审计，并 CAS 消费旧等待、关联唯一后继、写旧 Run 终态事件。新增 `readContinuationInTransaction` 能在旧等待已消费后恢复并验证输入，不再错误要求原 Run 仍为 WAITING_INPUT。

**不是公开确认流程完成。** 方法尚未接入 RunService/Store 的受理分支，公共 `accept_visual_reference` 仍拒绝；@7 executor/registry 仍只执行单图 message 到 review，不能执行此新后继。测试在真实图片 Run 到 review 后，于真实 Prisma 事务中手工创建候选再调用内部方法，**不是 HTTP 受理确认 → worker 规划蓝图的 E2E**。刻意不开放一个 worker 不能执行的公共 QUEUED 入口。T22 仍 IN_PROGRESS。

没有外发 OCR、调用蓝图/语义模型、创建 ChangePlan/BuildJob、生成工程或下载；不等于独立蓝图审批。生产 vision resolver 和真实环境未变。预算限制继续暂缓，既有文本协议 @6/hash、旧接口退役和原生编译/签名/制品绑定不变。

## 2. 为什么不能复制原 admission

原 `kf-visual-run-admission/v1` 绑定原 message Run 的 runId、actor、action、config、mode 和 base。复制到另一 Run 或 accept action 会破坏身份校验，不能删除这些校验来“接通”。新容器使用独立 `kf-visual-continuation/v1`，保留来源引用而非伪造一份新的原图发送同意：

- 绑定 tenant/workspace/conversation、新 runId、sourceRunId、requestedByUserId、固定 baseRevisionId、build mode、configHash、actionHash、requestHash。
- 保存 sourceAdmissionHash、sourceReviewHash、acceptedAt、完整 AcceptedVisualPlanningInput（含精确选择和 confirmationHash）。
- 快照 inputHash = canonical hash(content)，再以服务器 key 和独立域 `kf-visual-continuation/v1` 签发 `vcont1:<hash>:<HMAC>`。review 仍为 vref1；它们都不是蓝图回执。
- Run.inputSnapshot 严格仅含 attachmentIds、fixed policy 和 visualContinuation；不能混入 visualAdmission 或浏览器提供的 route/snapshot/native 字段。
- 读取恢复真实原 admission，原图、派生、服务器像素分析 route/prompt 和原用户同意仍从可信来源获得。其他规划任务的模型配置仍未冻结，本轮没有扩大原像素分析合同的含义。

即使同时篡改 content、内层 confirmationHash、外层 inputHash、Run.inputSnapshot 和 step.outputRef，缺服务器 key 仍不能制造合法选择。签名 key 复制为私有 Buffer，不保存密钥或把内部 proof/route 发给前端；不存在数据库超级用户防护承诺或新不可变 trigger。

## 3. 同事务约定

调用方未来必须在同一事务创建候选 Run、用户 Message、预算/受理审计和 queued 事件，再调用 freeze；任何后续错误均须向外抛出，回滚整个受理事务。当前方法不会单独创建/启动 Run、Message、queued 事件，也没有事务外先验证再消费。

锁顺序是 `conversation advisory(kf-run) → Tenant FOR UPDATE → Workspace FOR SHARE → 原 Run control/row → 后继 control/row → analysis row`，与原 Store 图片准入外层顺序一致。恢复先无锁定位 source，再按相同顺序加锁。**未来 executor 不可先持后继 Run control 锁再调用该 reader；必须统一外层顺序，避免 source/后继倒序死锁。** 当前未接 executor，不能宣称已完成该接线验证。

freeze 要求：

1. strict acceptance body；真实 scope/user，原 Run 必须由该用户发起，新 Run 也是该用户。暂只继承原同意人，不把别的成员的确认伪装成其发送同意；多人确认须后续明确新同意合同。
2. 新 Run 为未执行 QUEUED、fence=0、无 startedAt/lease/cancel/superseded/build/retry、初始 inputSnapshot=null；协议 @7、冻结 flag=true、build mode、固定同基线、predecessor=原 Run，配置精确继承，不暗中升级模型。
3. stored action 是 accept_visual_reference，expectedRunId、analysisId、analysisHash 与实际 acceptance 一致；不能只检查 receipt 而漏掉 action 的另一份 analysis 身份。
4. 原 review HMAC/config/catalog/analysis/source/admission/TTL/current leaf、独立差异/未验证 acknowledgement 全部沿用既有真实校验；只有单图且同意人匹配才继承。替代控件仍需重新展示 review，不能隐藏替换。
5. 当前 Tenant 外发许可为 true，并持锁到提交；Workspace 同基线并持 SHARE 锁。此方法不是 rollout 准入开关或模型发送授权，未来 Store 仍须复核当前有效 config/admission policy。
6. 原 Run WAITING_INPUT 且无 cancel/build/后继时才 CAS 为 CANCELLED + supersededByRunId，新输入/step、VISUAL_REFERENCE_ACCEPTED 审计、原 run.cancelled 同事务。审计只记 hash/来源/count，不记 OCR、选择理由、回执或私有 route。

相同后继、相同 body 重放返回原 proof/acceptedAt，不重新签发、不重复事件/审计。不同选择拒绝 VISUAL_CONTINUATION_CONFLICT。该内部重放仍校验当前事实/许可，不等于未来 HTTP 幂等入口；Store 的请求级幂等应继续先于新准入 policy。

## 4. 消费后的恢复

reader 校验 Run/input/唯一 completed step/所有身份 hash/HMAC/inner confirmation、原状态 CANCELLED 且精确 supersededByRunId，再验证原 signed review 和当前源事实。只移除“必须仍等待”的条件，**没有**放松 catalog/config/source/analysis TTL/leaf/base 的检查，也不把普通 CANCELLED 当合法确认。

它不负责 assertActive/lease/fence/signal 或当前后继可执行状态；只是可信数据读取。未来 handler 必须在真实执行 scope 下独立验证租约/取消，并在模型发送/发布前再次检查策略和输入。不得把返回 accepted/admission 当模型外发或编译授权，也不能从旧会话 design-review checkpoint 推断蓝图已经批准。

## 5. 测试与红绿过程

- 新首批8项：原文件16项通过，新8项因缺 freezeContinuation 方法失败；实现后24项通过。没有将缺方法红测当作已存在的业务行为缺陷。
- 补17项：41项中39过/2失败。一项真实缺口是候选 action 的 analysisId/hash 未与确认内容比较；另一项是测试错误用 null 修改必填 actor，Prisma 在到达 reader 前拒绝。
- 将 actor fixture 改成另一真实同租户用户后，41项中40过/1失败，确认实际缺口仍可复现。补精确 action/reference 比较后，流程/review/admission 3文件69项通过。
- 最后再补内部 event 冲突回滚和四种跨 scope 读取；最终流程文件46项，其中30项是本轮新项，16项是此前真实图片 Run 流程。包括并发唯一后继、外层显式回滚/数据库约束回滚、内部事件失败回滚、伪回执、签名选择篡改、动作/actor/base/config/request/predecessor/附件/step/原链变更、TTL/child/源/当前base/许可复核、已取消等待。
- 并发/回滚/恢复使用真实 PostgreSQL、上传存储、安全派生图、ModelGateway/ledger、Run Store/executor 和 ReviewService；仅 provider fetch 使用本地 fixture，一次初始分析，无收费调用。

## 6. 复验

API 使用隔离库 `kf_agent_test_generation_full_20261022_0940`，图使用 `kf_agent_test_generation_20261022_0930`；同库没有并发 reset。累计21迁移，无新依赖或迁移。

```sh
# cwd agent-app/apps/api
COOKIE_SECURE=true TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_generation_full_20261022_0940 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --reporter=dot
# cwd agent-app/packages/agent-orchestrator；与 API 分库
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_generation_20261022_0930 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --maxWorkers=1 --reporter=dot
# cwd agent-app/packages/contracts 或 domain-client
../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --maxWorkers=1 --reporter=dot
# cwd agent-app；根、apps/api、packages/contracts 分别执行
../.toolchain/node-v24.19.0-darwin-arm64/bin/node node_modules/typescript/bin/tsc -p . --noEmit
```

最终完整结果（2026-10-22本地时间）：

| 范围 | 结果 | 开始 / 耗时 |
|---|---|---|
| API | 63文件，753 passed / 0 failed / 0 skipped | 15:56:07 / 145.81s |
| agent-orchestrator | 19文件，205 passed / 0 failed / 0 skipped | 15:56:10 / 17.50s |
| contracts | 20文件，505 passed / 0 failed / 0 skipped | 15:56:08 / 8.55s |
| domain-client | 68文件，1403 passed / 0 failed / 5既有条件skipped（1408总项） | 15:59:38 / 39.61s |

共2866 passed / 5既有条件skipped，不是monorepo全量，定向69项已包含在最终API中、不重复累加。API仍出现既有 `Conversation turn lease connection was destroyed during cleanup` WARN，不以本轮通过宣称历史偶发连接问题均根治。root/API/contracts tsc 与本批3代码文件 type-aware ESLint已通过。未重跑 Web/browser/build-jobs/真实provider/KF/Windows/实际OS kill或生产多副本/代理。

## 7. 下一步（不再重复本轮原语）

1. 先实现服务器冻结的 blueprint/visual semantic route、prompt 和对应发送前/发布前复核。派生 OCR/结构仍属于外发数据，不能因为没有图片就跳过用户同意/管理员策略。
2. 实现 @7 accept handler/step memo/preflight/recovery，在同一锁序和真实执行 scope 下读此 proof，显式初始化视觉上下文并清理旧会话蓝图状态；视觉 review 等待不是 LangGraph interrupt。输出独立蓝图等待，不能直接原生编译/构建。
3. 同步升级公共 strict RunAction 的 receipt/acceptedDifferences（仍不接浏览器 envelope）与 Store 事务接线、错误映射、请求幂等、候选创建/Message/queued 原子性，保证公开受理的新 Run 真可执行。当前公共/内部 Store reserved action 拒绝守卫不可提前删除。
4. 为 confirm_blueprint/后续审批动作设计下一段可信继承；本轮 v1 只接受 build 的 accept_visual_reference，不可复制到这些新动作、普通 message、不同用户或 retry。独立蓝图确认后才进入既有 visual semantic → compile → 签名 → build → delivery。
5. 接当前工作台上传、发送说明、review/差异选择与独立确认，跑完整 fake-provider upload→review→accept→blueprint→approve→download E2E，再另行授权收费模型/KF与1:1质量验证。多图/区域修订/重试仍未开放。

旧试用 `kf_agent_e2e_trial_20261021_01` 仍按18迁移保护，不reset/seed，不直接用新源码重启；需协调expand至21及旧协议排空/worker整体升级。无实际环境、密钥或常驻服务变动。

## 8. 本批文件

- `packages/contracts/src/visual-review.ts`：新 server-only continuation content/snapshot/input schema，现有 index wildcard 已导出，无需新改导出文件。
- `apps/api/src/vision/visual-review.service.ts`：内部 freeze/read、域隔离proof、共享 review 事实校验；原 waiting getter/validate 仍要求等待，不放开原接口。
- `apps/api/src/runs/visual-run-flow.integration.test.ts`：原16项保留，新增30项真实事务集成测试。
- 本报告及 master/P4/handoff/design/operations 最新说明；历史报告不改写。不产出未要求的补丁。
<!-- end -->
