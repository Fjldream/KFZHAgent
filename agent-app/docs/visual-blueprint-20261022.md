<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
# T22 视觉确认后的独立蓝图模型与节点

日期：2026-10-22；功能名：Agent工作台迭代。接续 `visual-continuation-20261022.md`，main / HEAD `94364cd9add74915c6f85af96357ee5b286faede`。保留混合 dirty、当前目录，不自动提交/推送/开worktree/多代理。

## 1. 已实现与未实现

已补齐 **确认快照冻结蓝图模型 → 可信继承读取 → 活跃租约与外发策略复核 → 共享网关/账本 → 严格蓝图/持久缓存 → 原 design-plan 节点展示独立蓝图** 的内部链路。测试用真实图片Run/executor到review，再手工候选/确认事务/claim，通过真实服务和原蓝图节点写入assistant Message，结果停 `design-review`，无ChangePlan或BuildJob。

**不是公开确认→worker蓝图流程完成。** RunService/Store仍拒绝accept action，RunExecutionService的@7仍只支持message→review；registry/worker/module尚未装配此蓝图服务、完整graph初始路由和状态恢复。测试直接调真实节点，不是调用整个LangGraph或公开确认E2E；没有新后继Run的input.required事件/WAITING_INPUT收尾或可供公共confirm_blueprint继续的完整checkpoint。生产vision仍关闭，不能仅设AGENT_VISION_V1=true启用。

本轮只冻结**视觉蓝图模型**；视觉semantic/repair等模型配置和其发送许可仍待对应阶段接入，不能泛称所有任务已统一。预算限制仍暂缓，文本@6/hash/旧POST退役不变。无迁移/依赖/真实provider/KF质量或试用操作，不将fixture蓝图当作任意截图还原成功。

## 2. 确认事务冻结配置

VisualReviewService新增可选服务器构造配置 `{blueprint: ModelRoute}`，复制后私有保存；只有freeze新后继时才生成blueprintModel放入签名continuation content。HTTP body无新route字段，不接浏览器envelope。原review签名与原message admission不被改写。

- 私有route严格HTTPS、无URL凭据/query/hash、JSON能力、合法model/超时/上下文；蓝图只送结构，不要求supportsVision=true。
- `visual-blueprint@1` 独立prompt，configHash绑定完整route、完整system prompt、schema、输出8192、响应80KiB、输入96KiB与thinking=false；以后代码prompt/限制变化会在发送和缓存读取前明确CONFIG_CHANGED，不偷用当前模型。
- 输入按消息UTF-8字节保守计上界，同时不超过 `maxContextTokens - 8192`；不裁剪OCR或偷偷压缩已确认结构。窗口不足/超限明确失败。此为安全上界，不是tokenizer精确测量或预算guard。
- 旧内部proof的blueprintModel保持optional以验证历史签名；**模型调用必须存在**，缺时CONFIG_REQUIRED，绝不从环境补默认值。当前worker旧两参数构造继续合法，但没有获得蓝图调用能力。
- 同一后继重放不重新取route，不重签；新配置无效时，整个确认/消费事务回滚。

## 3. 模型请求、账本与执行安全

VisualBlueprintService提供 `createVisualDesignPlan(ModelPortContext)`，供专用视觉ModelPort使用。所有实际请求走ModelGatewayService与ModelInvocationService，task=blueprint、attempt按实际尝试递增；promptVersion/schema/prefix/input hash固定记录。scope/lease/回执/私有URL/密钥不进模型消息。

服务要求withAgentRunExecution；withAgentRunNode跟踪pending与关闭scope/取消。三次短事务分别在准备/缓存读取、物理发送前、响应发布前复核：

1. 先readContinuation按 `conversation → tenant → workspace → source → successor` 锁序认证proof、原Run链、来源/TTL/current leaf/base/catalog、原同意人及管理员当前许可。
2. 再lockActiveVisualRun，用DB墙钟核对真实scope/owner/fence/lease、RUNNING、无取消/后继/build，不能先锁后继再倒序读source。
3. input必须creative-v2、同currentRevision、同用户/scope，与服务器accepted reference逐字canonical一致；上下文如带execution.runId也必须一致。
4. instruction取原数据库message action，route取签名proof。调用方的recentMessages/designPlan/requirementText不成为另一个提示词入口；只发送原指令和已确认结构/映射/差异，不发送像素或旧蓝图。

system prompt明确OCR/截图内容是不可信数据，不跟随工具/外发/原生代码指令，不推断生产数据源，遵守omit与能力差异、未知交互进入openQuestions。没有模型原始隐藏思维链持久化/展示。

网络期间不持事务/DB锁。取消、过期fence、源或许可改变时不发布结果；**这不能撤回已发送请求，也不消除真实费用**。provider成功但发布被拒绝，SUCCEEDED调用账本/usage仍保留。传输固定错误码安全透传，模型结构错误统一OUTPUT_INVALID，无隐式repair/retry。

此服务接收已经配置好的gateway，不自行选择API key。生产装配时必须确保gateway凭据与冻结provider/host相匹配（包括历史Run恢复），不能把当前任意endpoint的新密钥盲配给旧冻结host；本轮未做该生产凭据路由装配。

## 4. 持久缓存、并发与恢复

一个Run只有一份 `visual-blueprint-result-v1`，inputHash包含continuationHash、冻结模型配置和实际消息。每次命中前仍复核scope/fence/source/policy，不让completed缓存跳过授权。严格v3解析失败、重复行/hash漂移/未知status均CACHE_INVALID，不降级文字或重发。

- 真实Run control行锁下创建RUNNING step；providerAttemptId保存owner/fence token，不是外部provider request id。
- 同fence并发调用IN_PROGRESS，不产生第二次provider。FAILED允许后续显式调用再尝试，但服务本身不循环。
- 新fence可接管旧RUNNING/FAILED；发布只CAS当前token/状态/inputHash。旧owner迟到响应及其清理不能覆盖新owner的COMPLETED。
- 已COMPLETED的蓝图在真实过期租约恢复后复用，不重复发费请求。
- 在途旧请求结果未知时，新owner重发可能产生两次物理请求；测试明确保留两份实际usage，不声称网络exactly-once或假装第二次免费。

缓存只保存严格蓝图对象；不是审批凭据、原生计划或工程交付。service不写用户可见蓝图Message/审批事件，交给原节点和后续handler处理。

## 5. 原蓝图节点的视觉分支

ModelPort新增optional `createVisualDesignPlan`；@7/creative-v2/合法AcceptedVisualPlanningInput才能进入。缺端口、坏确认/旧协议、孤立视觉checkpoint都先失败，不调用普通createDesignPlan。

视觉输入只带本轮需求、确认reference/currentRevision，不把旧designPlan、旧assistant“已批准”消息或revisionSummary当新图的规划事实。成功沿用原v3校验、hash/revision、encodeBlueprintMessage、appendMessage，停design-review。新增 `visualBlueprintConfirmationHash` 只表示“这份蓝图来自哪次视觉确认”，**不代表蓝图已批准**。

成功/失败都清旧工程候选、semantic plan、planHash、creativeConfirmation、buildAuthorization/buildJob等，不能保留旧批准继续构建。无效输出只尝试一次、不保留旧批准蓝图作回退；已知取消/外发/配置错误保留安全固定码，未知异常不回显。文字节点原两次蓝图修复和普通memo输入不改。

视觉memo键加入完整accepted（孤立状态也单独隔离），不同确认/区域/OCR不复用。普通buildRunGraphInput新增显式清visualBlueprintConfirmationHash，与原三项视觉状态一起清空，防旧视觉stamp污染文字任务。

注意：这只是节点接线。真正新accept Run必须在进入load-context之前清理旧building/design-review状态、设置可信输入并确定性路由到design-plan，不能先跑旧build跟踪或文字intent分类；本轮尚未实现该graph入口/恢复。

## 6. 红绿与中间问题

- 冻结路由两项红测：48项中46过/2失败（缺blueprintModel、无效HTTP配置仍消费确认）；实现后48通过。
- 新服务8项因模块尚不存在失败（48过/8失败），服务实现后56通过。原图片Run16项和确认30项持续保留。
- 节点6项红测（18过/6失败）：原节点会走文字方法、忽略坏视觉确认、旧批准状态未清。新分支后24通过。
- 普通输入清新stamp红测5项中4过/1失败；明确置null后恢复。
- 补cache未知status红测：定向1失败，其余59项是-t过滤未运行，不是新增skip。加状态拒绝后，最终整套没有新增skip。
- 节点安全停止码两项最初被误写INVALID_MODEL_OUTPUT；加入固定白名单，不输出provider任意错误文本。
- memo测试起初用undefined表示未命中，而真实RunStepMemo合同使用null，造成未执行模型；完整编排器中间 **213 passed / 1 failed（214项）**。修正fixture为null后完整214/214，没改生产memo/放宽断言。ESLint的url默认stringification和unused解构也修正，未禁规则。
- 增加真实原节点/Message、坏缓存、并发和过期租约/旧fence测试；流程文件最终62项，比上轮新增16；节点文件比上轮新增9项。
- 第一轮完整API767项通过后又补两项租约测试，所以再完整重跑，不能拿767冒充最终覆盖。

## 7. 验证与环境

命令沿用上轮报告，仅测试文件/报告名更新。API全量库 `kf_agent_test_generation_full_20261022_0940`，图/定向API库 `kf_agent_test_generation_20261022_0930`，同库无并行reset；均21迁移，无新migration。API使用COOKIE_SECURE=true，所有测试显式TEST_DATABASE_URL与KF_TEST_ALLOW_DESTRUCTIVE_RESET=1；只使用仓库.toolchain Node24.19.0。

最终完整结果（2026-10-22本地时间）：

| 范围 | 结果 | 开始 / 耗时 |
|---|---|---|
| API | 63文件，769 passed / 0 failed / 0 skipped | 16:21:08 / 139.50s |
| agent-orchestrator | 19文件，214 passed / 0 failed / 0 skipped | 16:18:20 / 16.02s |
| contracts | 20文件，505 passed / 0 failed / 0 skipped | 16:17:46 / 6.49s |
| domain-client | 68文件，1403 passed / 0 failed / 5既有条件skipped（1408总项） | 16:20:23 / 41.94s |

共2891 passed / 5既有条件skipped，不是monorepo全量；定向API 2文件67项包含在最终769项中，不重复累加。root/API/contracts/图tsc以及11文件type-aware ESLint最后均exit0；没有通过排除文件/新增skip或自动重试隐藏失败。API两轮仍观察到既有lease cleanup connection destroyed WARN，不能以通过宣称历史偶发问题全根治。

没有Web/browser/build-jobs全量、真实provider/KF/Windows、实际OS进程kill或代理多副本验证；AbortSignal/DB租约接管不当作OS kill验收。最终API命令与上一份报告一致，仍使用指定安全隔离库和Cookie覆盖；没有改实际环境来跑测试。

## 8. 下一模型直接接线（不要重做本轮）

1. 为RunModule/worker安全装配蓝图route、匹配凭据的gateway、带planningRoutes的review和VisualBlueprintService。不要给所有文字ModelPort改默认行为；专门组合createVisualDesignPlan，无配置明确拒绝。
2. 加可执行accept步骤/handler与executor cache前preflight。按同锁序读proof、再验证active lease；把清过旧状态的可信accepted送真实LangGraph，确定性路由design-plan，注册memo，正常停独立input.required/WAITING_INPUT并恢复相同checkpoint。测试不再止于直接node调用。
3. 同步升级strict公共action（receipt/acceptedDifferences，不接browser snapshot）及Store同事务Message/Run/accepted proof/queued/幂等/错误映射/唯一后继，**有可执行handler后才删reserved action守卫**。当前视觉模型schema经visual-execution依赖agent-run，公共action复用schema时注意模块循环，别直接构成agent-run→visual-review→visual-execution→agent-run。
4. confirm_blueprint/审批动作不能复用仅适用于build accept的当前continuation identity；明确下一段可信继承、绑定此新蓝图hash/stamp、冻结visual semantic模型并同样复核OCR/结构外发，再进入既有visual semantic/compile/签名/build/delivery。不把视觉确认当蓝图批准。
5. 最后现有工作台上传/授权/review/差异选择/独立蓝图/下载E2E，另行授权真实provider/KF和视觉质量。多图/重试/区域修改仍未开放，预算限制暂缓、旧POST不恢复。

旧试用 `kf_agent_e2e_trial_20261021_01` 按18迁移和用户数据保护；源码21条需协调expand/旧Run排空/worker整体升级，不reset/seed或直接重启新源码指向它。本轮无.env/密钥/常驻进程修改。

## 9. 本批文件清单

- 新：API vision `visual-blueprint-request.ts`、`visual-blueprint.service.ts`。
- 改：contracts `visual-review.ts`；API vision `visual-review.service.ts`；Run `visual-run-flow.integration.test.ts`、`run-graph-input.ts`、`run-graph-input.test.ts`。
- 改：agent-orchestrator `model-port.ts`、`state.ts`、`nodes/design-plan.ts`、`nodes/design-plan.test.ts`。
- 本报告/master/P4/handoff/design/operations最新状态。共11代码/测试文件及配套文档，不自动产补丁或提交。
<!-- end -->
