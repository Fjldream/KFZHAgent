<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
# T22 蓝图展示签名与确认后继继承

日期2026-10-22；功能名Agent工作台迭代。接续 `visual-public-acceptance-20261022.md`。保留当前mixed dirty checkout，不自动提交/推送/worktree或多代理，不改其他KingFusion服务。

## 1. 本轮实际边界

正式蓝图handler现在在发布蓝图回执前，将**实际服务端模型结果、实际显示的蓝图Message、revision/hash/receipt与原视觉确认**绑定为独立HMAC签名的持久review。增加内部 `confirm_blueprint` 后继的冻结/原子消费/审计/恢复读取：不再误用只允许accept动作的 `vcont1` proof。

**仍不是公共蓝图确认到客户端工程下载完成。** 新后继目前由隔离测试在真实Prisma事务手工创建；内部原语不创建Message、预算行或queued事件，不启动worker/语义模型/编译/build。公共Store仍拒绝视觉等待上的confirm_blueprint，执行器也仍拒绝@7 confirm动作；生产vision继续关闭，不能开flag或手工往试用队列造新动作。T22仍IN_PROGRESS。

本轮完成的是下一段的可信输入合同，不是已冻结semantic/repair模型配置，不是外发许可或原生构建批准。必须接好模型任务冻结、可执行handler/graph/preflight后，才能同步开放对应公共事务，不能先接收worker无法执行的任务。

无迁移/实际.env/key/服务/旧试用变更，无真实收费provider/KF调用。默认文字@6及原步骤hash/审批/确定性编译/签名/构建/交付不变，预算限制暂缓，旧POST messages/resume不恢复。

## 2. 蓝图展示凭据

新contracts `VisualBlueprintReviewSchema`：

- schema `kf-visual-blueprint-review/v1`，签名域同schema，receipt前缀 `vbpr1`；与像素review的vref1、accept继承的vcont1严格分离。
- tenant/workspace/conversation/run/requestedBy/base/configHash、原accept continuationHash和visualConfirmationHash。
- 严格v3 blueprint、revision、designPlanHash、原格式blueprintReceipt、真实assistant Message ID、生成review时实际owner/fence。
- 整个content canonical hash → 域隔离HMAC；唯一COMPLETED `visual-blueprint-review-v1` RunStep持久化。

`VisualReviewService.prepareBlueprintReview`委托新的 `VisualBlueprintAuthority`。authority私有复制同一服务端key，只访问数据库，不调用模型或启动任务。

准备顺序：

1. 必须有实际ALS execution，runId/tenant一致；原 `readContinuationInTransaction` 先按conversation→tenant→workspace→原图片Run→蓝图Run验证签名/同意/来源/leaf/TTL/catalog/base/当前许可。
2. 再以实际DB墙钟验证RUNNING/owner/fence/lease、无取消/后继/build。
3. blueprint严格解析并匹配revision/hash/原visualConfirmationHash。重建原冻结蓝图请求inputHash，检查唯一COMPLETED `visual-blueprint-result-v1` 服务端结果与要展示的蓝图完全一致。
4. 当前Run必须恰好一条可解码蓝图assistant Message，其完整content必须等于同一blueprint/revision/hash编码。不能凭浏览器提交的蓝图或任意assistant文本签名。
5. 已有review只校验并复用；接管新lease可以完成旧pause，但不能改写原review的owner/fence、Message或展示内容。冲突明确失败，不覆盖旧签名。
6. 正式handler在上述步骤成功后才发原格式 `input.required`，再沿用executor/Store.pause进入WAITING_INPUT。

**不是把graph checkpoint、Message、review、事件和pause改成一个原子事务。** 仍是先graph/Message持久化，再review，再事件，再pause；既有租约恢复覆盖中间窗口。原“事件后pause故障→关闭/新Nest上下文恢复”测试在新增review步骤后继续通过，review复用不重复模型/Message/事件。不冒充OS kill/生产多副本验收。

## 3. 蓝图确认后继

新 `VisualEngineeringContinuationSchema`：schema `kf-visual-engineering-continuation/v1`、purpose仅 `semantic-planning`、HMAC前缀 `veng1`。它绑定新Run/原蓝图Run/actor/base/config/actionHash/requestHash/acceptedAt、原continuationHash、完整accepted视觉选择及完整签名blueprintReview。

输入严格为 `{attachmentIds:[原图UUID],baseRevisionPolicy:"fixed",visualEngineering:proof}`。不复制原message admission或accept-only snapshot，不能把已确认视觉上下文清空变成文字。

`freezeEngineeringInTransaction(tx,scope,successorId,sourceRunId)`的调用方**已在同一事务创建候选**，且必须满足：

- 原蓝图source真实WAITING_INPUT、无取消/后继/build；实际pending input.required receipt与已签名展示一致。
- 同scope/原同意人，source与新Run都是build，predecessor精确指向source，base和完整config相同（@7、vision=true），不能retry。
- 新候选QUEUED/未启动/fence0/无lease/取消/build/后继，initial inputSnapshot为SQL NULL。
- action只能strict confirm_blueprint、expectedRunId精确source、receipt精确签名蓝图回执；vref1/vcont1/伪蓝图/变体回执不当作批准。

锁序仍为conversation→tenant→workspace→原图片Run→蓝图Run→新候选；不能先锁新候选/蓝图再倒序读原图片。冻结原语在调用方事务内写new proof/step，CAS原蓝图等待为CANCELLED/supersededBy新Run、唯一run.cancelled、精简VISUAL_BLUEPRINT_CONFIRMED审计和activity。后续任意错误整个事务回滚，包含原等待消费。

同候选重放校验返回原proof/time，不多写事件/审计；不同候选并发至多一个成功。它不是HTTP clientRequestId幂等：未来公共Store仍须把Message/Run/预算/queued/请求幂等/错误映射放同一事务，且不要再次走通用active消费分支。

`readEngineeringInTransaction`在蓝图source已被精确新Run消费后仍可恢复，但认证新proof/唯一step/HMAC、scope/actor/action/request/config/base/predecessor/source链、原accepted、当前图片/分析/TTL/目录/管理员许可、原图列表、原蓝图签名/Message/pending receipt。**只认证可信数据，不检查新Run当前执行lease、不授予模型发送/编译/构建权限**；未来consumer还要同锁序之后验证活跃租约。

后续出现第二条蓝图Message时拒绝歧义；改动Message、review、receipt、action/actor/config/base、source-link、图片列表、step、源过期/政策撤销都不能继续。即使重算content hash和step hash，缺合法HMAC仍拒绝；不能拿已有accept proof冒充新的engineering proof。

## 4. 测试与中间记录

原流程92项，本轮新增31项，最终123项（最终完整结果见下一节）。新测试上游使用真实图片上传/Run/analysis gateway+usage/签名review/accept→正式Nest worker模块/真实PG LangGraph独立蓝图等待；engineering候选仍是内部手工事务，provider为本地fetch fixture。测试不发送真实key或网络请求，不把golden蓝图当任意截图的还原质量。

- 初批筛选红测103总项中4失败/6通过/93未选中：缺签名review、缺freeze方法、两个候选都失败、tamper前置缺方法；部分负例最初仅reject，随后收紧为具体错误码，不能把方法不存在误当安全校验通过。
- 实现后完整103通过。补强到116项，第二条蓝图Message用例先复现“仍resolve出proof”，修复读取时唯一展示校验后116/116通过。
- 增补模型inputHash/结果/Message/stamp/revision/fence六种签名前拒绝，以及签名review被重写一项；7项定向通过，其余116是筛选未运行，不是新增永久skip。
- lint移除handler一个多余string断言；root/API tsc和7文件type-aware ESLint单独验证，不关规则/不加永久skip/不放宽timeout。
- 第一轮完整API（17:47:49 / 299.89s）为831 passed / 2 failed（833项）：历史 `approves the plan and enqueues a durable build job` 与 `returns the latest tenant-scoped build job for workspace restoration` 各触发默认5000ms超时。同轮changePassword日志出现User update P2025；结合测试beforeEach清表，可能有超时请求继续执行的时间窗，但这不是已证完整根因。两个失败用例单独复验2/2通过（17:53:02 / 4.62s，其余57筛选未运行）；随后停止其他重检查，完整API单独复验。不改生产认证、放宽timeout或添加retry/skip，不假定它由新签名代码造成，也不将复验通过当根因根治。

## 5. 验证与环境保护

API使用隔离21迁移库 `kf_agent_test_generation_full_20261022_0940`，定向API/编排器顺序使用 `kf_agent_test_generation_20261022_0930`，同库不并发reset。Node使用仓库24.19.0，API显式COOKIE_SECURE=true/TEST_DATABASE_URL/KF_TEST_ALLOW_DESTRUCTIVE_RESET=1；命令同上批报告。

最终结果（2026-10-22本地时间）：

| 范围 | 结果 | 开始 / 耗时 |
|---|---|---|
| API 最终完整单独复验 | 64文件，833 passed / 0 failed / 0 skipped | 17:54:20 / 161.98s |
| agent-orchestrator | 19文件，214 passed / 0 failed / 0 skipped | 17:47:50 / 23.64s |
| contracts | 20文件，506 passed / 0 failed / 0 skipped | 17:47:05 / 1.48s |
| domain-client | 68文件，1403 passed / 0 failed / 5既有条件skipped（1408总项） | 17:47:51 / 22.84s |

共2956 passed / 5既有条件跳过，非monorepo/浏览器全量；123项视觉流程已包含在API，不重复计数。最后root/API tsc和相关7文件type-aware ESLint exit0，tracked diff --check及涉及新增文件末尾空白检查无问题。

完整API复验通过不抹去上一轮831/2与P2025：测试在与其他重检查重叠时变慢、单独复验恢复只是相关性，认证/异步请求与测试清理的完整根因仍待另案定位。两轮均保留既有lease cleanup connection destroyed WARN，不称历史偶发问题全根治。没有放宽timeout、加retry/永久skip或修改认证代码。

本轮未跑Web/browser/build-jobs全量、视觉upload→download、真实provider/KF/Windows/OS kill/生产代理/多副本验收；不以数据继承单测替代完整工程交付。

旧试用 `kf_agent_e2e_trial_20261021_01` 按18迁移与用户数据保护，源码21条。无reset/seed/直接新代码重启指向旧库；checkpoint schema不作为Prisma drift删除。旧@6/仅message的@7/不生成新蓝图review的前批@7都不能假定可混部。没有签名蓝图review的历史等待不能在HTTP确认时倒签，应明确拒绝并协调重新发起；不修改旧输入或注入假review救场。

## 6. 下一模型直接接线

1. **不要重做蓝图展示/确认继承。** 读新authority与上述边界；`VisualReviewService`已提供prepare/freeze/read接口，正式handler已调用prepare。
2. 在engineering proof中冻结专用semantic任务route/prompt/limits（旧内部proof仅可读，执行时缺配置必须拒绝），为repair明确最多次数/独立账本，不隐式文字repair。当前proof尚无这些配置，不可直接拿去发送。
3. 抽取/复用现有DeepSeek视觉语义prompt与candidate投影构造，增加专用服务/gateway/持久结果cache；实际发送和发布前复核engineering reader→活跃DB lease/scope/fence、当前许可和派生OCR授权，凭据绑定原route，不从环境给历史host盲补新key。无事务跨网络，保留usage、取消/旧fence拒绝。
4. 新@7 confirm handler/preflight/独立step hash，清旧工程批准channels；从签名blueprintReview+accepted初始化，而非信任旧checkpoint/文字分类。consumer在任何整步缓存前认证来源；原compile/sign/GenerationSnapshot/BuildJob/delivery保留，相关审批/取消/retry逐动作明确，不能复制proof到不支持的动作。
5. consumer与模型runtime完整后，才接公共Store confirm事务（当前vision/runtime gate、幂等、来源锁序、Message/预算/queued、source只消费一次）和实际HTTP继续→工程下载E2E。然后接现有UI上传/授权/差异/独立蓝图/交付。生产resolver仍关闭，真实provider/KF/Windows与像素质量另行授权验证。

## 7. 本轮文件

新：contracts `visual-blueprint-authority.ts`，API vision `visual-blueprint-authority.ts`。改：contracts index、VisualReviewService、run-handler-registry、visual-blueprint-run-handler、visual-run-flow.integration.test，共7代码/测试文件；新本报告及master/handoff/P4/design/operations共6文档。不自动生成未要求的补丁。
<!-- end -->
