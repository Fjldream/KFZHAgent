<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
# T22 确认后继的正式执行器、完整图与蓝图暂停

日期：2026-10-22；功能名：Agent工作台迭代。接续 `visual-blueprint-20261022.md`。main / HEAD `94364cd9add74915c6f85af96357ee5b286faede`，保留混合 dirty/当前目录，不自动提交、推送、worktree或多代理。

## 1. 本轮实际完成

确认后的内部后继Run现在能走 **claim → RunExecutionService preflight → visual-blueprint步骤 → 正式registry/handler → ConversationService真实PostgreSQL LangGraph → 独立蓝图Message → input.required → WAITING_INPUT**。不是上一批直接调用单个design-plan节点。还实际关闭/重新创建Nest worker上下文，从同一PG checkpoint恢复已生成蓝图，不重复provider/Message/等待事件。

服务器runtime/worker/ModelPort已装配ReviewService和VisualBlueprintService，凭据gateway绑定精确服务器route。默认文字@6及其step hash不改；有限@7现在支持已冻结单图message到review，以及带合法签名continuation的build accept到独立蓝图等待。

**T22仍IN_PROGRESS，公共确认尚未开放。** RunService/Store仍拒绝accept action；当前测试的图片message是真实Run准入/执行，但确认候选仍在真实Prisma事务中手工创建再freeze。不是公开HTTP确认受理E2E，也没有上传到最终工程下载的视觉E2E。`confirm_blueprint`/审批/重试的下一段可信继承与visual semantic模型外发仍待接，不能拿当前accept-only proof批准构建；现有@7等待屏障继续拒绝普通消息和未支持的蓝图继续。生产vision resolver继续关闭，AGENT_VISION_V1=true仍不是启用方法。

本轮没有收费provider/KF质量、实际环境/key/服务变更、迁移或试用升级。预算限制仍暂缓，旧POST不恢复，不绕开原编译/签名/制品绑定。

## 2. preflight与步骤

新增readActiveVisualBlueprintInput：

1. 在原 `conversation → tenant → workspace → source → successor` 锁序下认证原链、签名proof、当前来源/leaf/TTL/catalog/base和同意/许可。
2. 再验证真实执行scope/owner/fence、DB墙钟lease、RUNNING/无取消/后继/build；不能先锁后继再倒序取source。
3. 从原Run message取instruction，用签名冻结配置构造请求以验证完整prompt/限制身份与上下文上界。缺模型配置不从环境补默认值。

RunExecutionService的@7受控分支在任何执行step cache之前做上述检查；缺Reader依赖为VISUAL_FLOW_NOT_CONFIGURED。planVisualBlueprintSteps使用@7、accept action、base和continuationHash独立hash，不复用@6 graph或像素分析step。

visual-blueprint也使用mustPause：已有COMPLETED执行step不能冒充蓝图等待，handler普通返回同样不能成功。真正可复用的是模型/图节点内部完成步骤与真实checkpoint，而不是跳过用户等待的整步完成缓存。坏proof和完成缓存同时存在时，先报proof损坏；不会先因缓存“完成”放行。

外部shutdown在preflight前发生，继续保留RUNNING/租约供恢复，不写失败终态。真实用户cancel沿用取消优先，不能由迟到模型响应/蓝图pause复活。

## 3. 清旧状态与确定性图入口

buildVisualBlueprintGraphInput从真实checkpoint枚举旧channels置undefined，再覆盖新scope/run/base、build mode、@7、design-planning和可信accepted。旧buildJobId/已批准蓝图/工程权限、旧摘要/模块/semantic字段不会在load-context前残留；不是只在设计节点结束时清理旧状态。

完整solution-graph在load-context后，对于design-planning的视觉确认确定性进入design-plan，不再先让文字intent分类猜“确认”含义。原text入口仍走原classify，原设计/语义/审批/build边保持。design-plan只展示独立v3蓝图，无构建权限。

handler持有真实会话turn lease、注册实际RunStepMemo，并在withAgentRunExecution里设置assertActive，供guarded节点和实际graph ports使用。模型、appendMessage和checkpoint均走原实现，没有另一套编译器或LangGraph旁路。

首次新Run可清旧已完成/旧building checkpoint；已有native approval interrupt则明确APPROVAL_RESUME_REQUIRED，不用新视觉输入覆盖审批。若checkpoint自称当前run，必须匹配scope/base/@7/完整accepted且阶段为design-planning/design-review/idle，否则CHECKPOINT_INVALID；不能将冲突checkpoint解释成新的文字需求。

## 4. 暂停、恢复与回执

完整图结束后handler重新严格校验v3蓝图/hash/revision、当前run、visualBlueprintConfirmationHash，且不得带buildJob/buildAuthorization/creativeConfirmationId。只生成原encodeBlueprintConfirmation回执，**不是vref1或vcont1**。

- 当前Run没有input.required时发布一条小等待事件，然后抛RunPaused(WAITING_INPUT)，由正式executor/Store按有效租约暂停。
- 已有同一receipt则不再发布；已有不同receipt明确拒绝，不覆盖旧展示。
- 图checkpoint已完成而事件/pause尚未结束时，重启使用completedSnapshot，只投影同一蓝图，不再跑节点/模型；已完成节点仍可通过memo恢复。
- 测试故障点是在事件已经提交后，替换Store.pause为一次抛错（模拟写暂停前中断）；Run保持可恢复租约。释放旧Nest上下文、真实过期接管、新上下文从Postgres恢复，最终只有一份模型响应/assistant Message/input.required。

这里沿用既有文字Run的“事件后暂停”语义，**不是**把事件与暂停写成一个新原子事务。中间故障靠租约恢复收尾；公共新继续动作仍必须等真实WAITING_INPUT。故障注入和DB租约过期不是实际OS SIGKILL验收，也不能据此宣布所有进程故障矩阵完成。

## 5. 安全runtime与凭据路由装配

ReferenceAssetsModule提供VISUAL_PLANNING_RUNTIME；ConversationRuntimeModule导入同一模块，MODEL_PORT工厂只组合专用createVisualDesignPlan，原文字适配器/默认模型不换。Proxy对原class方法bind原对象，保留private receiver；不修改base对象，null视觉端口返回原base。

- key缺失/非法时review/blueprints为null；fake/stub/未配置模式或无DeepSeek key时不提供视觉蓝图外发服务。纯工厂装配不产生网络请求。
- deepseek模式、合法HMAC/服务器HTTPS JSON route和非空key才创建带planning route的ReviewService与VisualBlueprintService。配置不合法不使现有文字worker的历史查询/停止整体失效；视觉调用缺依赖明确拒绝。
- bindVisualBlueprintGateway将凭据绑定完整服务器route hash。旧签名proof若冻结了另一个endpoint/model，网络调用会在gateway账本/物理请求前以VISUAL_BLUEPRINT_CREDENTIAL_ROUTE_MISMATCH拒绝，不把当前新endpoint的key盲发给历史host，不偷换旧Run模型。
- 当前仅单份配置身份，不是完整历史secret版本注册表。route已改变的旧未完成Run须协调配置/密钥路由或明确重新发起，不能修改历史快照/强行继续；已完成结果的本地恢复不会产生新外发。
- agent-worker-bootstrap从同一runtime取review，交给registry和execution preflight；Conversations中的专用视觉ModelPort来自同一服务。缺配置保持文字行为，不偷偷给fake环境启用真实模型。

测试对gateway路由拒绝/配置工厂/私有receiver使用受控单元依赖；完整Run/PG图测试仅覆盖MODEL_PORT为本地fetch驱动的实际服务。没有在本轮用真实key启动worker进程或发送真实请求，也没有实际环境变量修改。

## 6. 测试与中间记录

- 首批真实后继/PG图/暂停恢复三项红测：原62过/新3失败，实际均被@7旧执行器以RUN_CONFIG_VERSION_MISMATCH拒绝。接线后65通过，证明不止新内部节点。
- runtime三项最初因模块缺失失败，实现后两文件68通过；再补旧building批准状态、冲突own checkpoint、completed缓存冒充成功、shutdown和实际在途取消，最终70个流程+3个runtime项，共73项定向通过。
- 损坏proof用例进一步种入合法inputHash的COMPLETED执行step，保证真正验证“先proof、后cache”。补强及lint收尾后再次完整API，不把补强前结果当最终覆盖。
- API tsc发现LangGraph泛型stream与最小GraphLike签名不直接可赋值；测试采用worker已用的显式unknown桥接，不改图API或伪造实现。lint发现三个多余类型断言和两个测试unbound-method，分别移除/绑定；未关规则。不存在新增skip、超时放宽、重试或生产schema放宽。
- 第一轮完整API64文件780/780通过后做上述断言/lint收尾，再跑最终完整API。原scope/fence/模型缓存/签名/同意继承等62项保留；本轮新增8流程+3runtime=11项。

## 7. 最终验证

API仅用 `kf_agent_test_generation_full_20261022_0940`，图/定向API用 `kf_agent_test_generation_20261022_0930`，均为21迁移隔离库；同库无并行reset。Node使用仓库24.19.0，API仍显式COOKIE_SECURE=true与TEST_DATABASE_URL/KF_TEST_ALLOW_DESTRUCTIVE_RESET=1；命令沿用上轮报告。

最终完整结果（2026-10-22本地时间）：

| 范围 | 结果 | 开始 / 耗时 |
|---|---|---|
| API | 64文件，780 passed / 0 failed / 0 skipped | 17:02:00 / 135.21s |
| agent-orchestrator | 19文件，214 passed / 0 failed / 0 skipped | 16:58:23 / 12.96s |
| contracts | 20文件，505 passed / 0 failed / 0 skipped | 17:00:44 / 5.44s |
| domain-client | 68文件，1403 passed / 0 failed / 5既有条件skipped（1408总项） | 17:00:45 / 39.42s |

共2902 passed / 5既有条件skipped，不是monorepo全量；73项定向已包含在API总数中，不重复累加。root/API/图tsc与14文件type-aware ESLint最后exit0，tracked diff whitespace检查及新增文件末尾空白检查无问题。API两轮都保留已有lease cleanup connection destroyed WARN，不以通过宣称历史偶发连接问题全根治。

没有Web/browser/build-jobs全量、真实provider/KF/Windows/实际OS kill/生产代理与多副本验收。本轮未修改contracts/domain源码，其完整回归仍重新执行，不拿前一轮结果替代。

## 8. 下一步直接做公开受理与下一审批继承

1. **不要再重做执行handler/图节点**：先设计strict公共accept payload，receipt/acceptedDifferences与action身份一一对应，禁止浏览器snapshot/native/route。注意schema依赖循环，不直接引入agent-run→visual-review→visual-execution→agent-run。
2. 将ReviewService.freezeContinuationInTransaction接实际RunStore受理事务：幂等先于当前准入，当前服务器vision/egress/dependency gate；固定同scope/原同意人/base/config/action、Message/Run/proof/审计/原等待CAS/queued/预算行一次提交。已有freeze会消费原等待，不能再让Store通用active分支二次消费/重复终态事件；candidate initial inputSnapshot必须满足当前freeze合同。
3. 覆盖真正HTTP cookie/Origin确认→Store→同一执行器→Postgres蓝图等待。receipt/choice变化的request hash、跨scope、并发唯一后继、用户取消、源过期、失败回滚、幂等停新准入后重放均要测。用完整可执行staging流程验证后再删除reserved-action guard，生产vision仍暂不开放。
4. 当前continuation v1仍只支持build accept；确认蓝图/后续审批/重试需要新的可信继承，绑定本Run实际blueprint receipt/hash/stamp、原accepted和固定来源，不能复制v1或清视觉上下文变文字。再冻结visual semantic/repair任务route/prompt并同样复核派生OCR外发，进入既有semantic/compile/签名/build/delivery。
5. 接现有工作台上传/授权/识别差异/独立蓝图确认与下载，跑完整fake-provider upload→download，再另行授权真实provider/KF与1:1质量。预算限制暂缓、旧POST退役、多图/区域修改仍未开放。

旧试用 `kf_agent_e2e_trial_20261021_01` 按18条及用户数据保护；源码21条需协调expand/旧Run排空/worker整体升级，不reset/seed或直接把新源码重启指向它。没有实际.env/key/进程操作。

灰度还需注意：不只是旧@6，**仅支持message的前批@7 worker也不支持accept后继**。本轮保留实验@7而增加有限动作，不能仅凭同样版本号认定可混部；在公开新受理前必须排空并整体升级兼容worker，不能用旧worker失败后再清快照/降级文字来补救。

## 9. 文件清单

- 新：`runs/visual-blueprint-run-input.ts`、`runs/visual-blueprint-run-handler.ts`、`vision/visual-blueprint-runtime.ts`、`vision/visual-blueprint-runtime.test.ts`。
- 改：`runs/run-graph-input.ts`、`run-handler-registry.ts`、`run-execution-plan.ts`、`run-execution.service.ts`、`agent-worker-bootstrap.ts`、`visual-run-flow.integration.test.ts`。
- 改：`vision/reference-assets.module.ts`、`conversations/conversation-runtime.module.ts`、agent-orchestrator `solution-graph.ts`、`nodes/design-plan.ts`。
- 本报告/master/P4/handoff/design/operations最新状态，原报告保留历史。共14代码/测试文件；不自动生成未要求的补丁。
<!-- end -->
