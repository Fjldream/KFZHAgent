<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
# T22 管理员外发策略、视觉分析身份固定与执行租约

日期：2026-10-22；功能名：Agent工作台迭代。接续 `visual-review-20261022.md`。

## 本批结论与范围调整

T22 仍 **IN_PROGRESS**。原拟接“确认→后继Run”；核对后发现分析入口尚未严格绑定执行scope/fence，且模型配置只在实例内复制。此时提前允许后继会造成旧执行者外发/发布、恢复时模型设置漂移。因此先实现既有T22清单中的管理员策略和分析执行前置约束，**本批未创建或启用视觉后继Run**。

实际完成：

- 新GET/PATCH管理员外发策略接口，持久化原Tenant.imageEgressAllowed，真实会话/角色/Origin/隔离与审计已测。
- 内部VisualAnalysisService强制服务器执行scope、当前owner/fence、真实时钟有效租约、RUNNING/无取消/无后继/无build；闭合执行上下文不能被异步脱离调用复用。
- 首次分析前将模型/提示词/来源/指令身份hash固定在已有RunStep中，重试/缓存命中/发送/结果发布复核，不覆盖旧记录；配置漂移拒绝，迟到结果不缓存。

没有开放公开分析POST、附件Run、accept_visual_reference、review确认入口或前端图片链路。普通Run仍visual:null，run-plan@6与vision默认拒绝不变。没有改业务库、试用库、.env或常驻服务；没有收费模型/真实KF调用，不宣称图生工程或1:1还原完成。

当前main / HEAD `94364cd9add74915c6f85af96357ee5b286faede`，保留混合dirty；不新建worktree、不自动提交/推送、不出补丁，不改其他KingFusion服务。修改代码原已可读，新增均有日期/功能标注。

## 1. 管理员外发策略

路径：`/api/v2/tenant/visual-egress-policy`，已注册ReferenceAssetsModule，不是仅测试装配。

- GET：TenantGuard后的本租户用户可读，返回严格 `{schemaVersion:1,imageEgressAllowed,coverage:"reference-images-and-derived-structure"}`；private/no-store，Vary Cookie/Origin。不提供tenant选择参数、provider/endpoint/model/key或其他租户资料。
- PATCH：仅本租户tenant_admin，精确MutationOriginGuard；请求严格 `{imageEgressAllowed:boolean}`，拒绝字符串/数字、tenantId、flags、未知字段。平台管理员不获得任意跨租户修改入口。
- 服务自身再次读取当前DB角色/租户，内部调用不能跳过HTTP角色守卫；锁住Tenant行串行处理，策略更新与VISUAL_EGRESS_POLICY_CHANGED审计同事务。日志只存前后布尔值、覆盖范围与真实actor，不放图片/需求/provider凭据；重复提交同一值不重复记“变更”。并发配置按租户锁、最后实际写入为准，不声称实现版本化ETag或ABA检测。
- 原列默认false不改。管理许可与功能flag、每次用户发送同意、执行租约、蓝图审批是不同边界。PATCH=true不会开放vision或向provider发送任何数据；workbench-config仍imagePolicy=disabled/outboundImagesAllowed=false，分析POST仍404。

coverage表达策略覆盖图片及派生OCR/结构的产品约束；**当前直接执行检查仍在内部像素分析链**。后续视觉语义适配器真正接Run时，也必须在发送边界复核该策略与用户同意；不能因只发送文字结构就绕过。管理员UI与用户发送说明/同意尚未接通，不将这个API冒充它们已完成。

## 2. 执行身份与迟到写入

`lockActiveVisualRun`复用原 `kf-run-control:<runId>` advisory lock及AgentRun行锁，拿锁后读取clock_timestamp（UTC）再判租约。必须匹配当前AsyncLocalStorage的tenant/run/owner/fence，且RUNNING、无取消、无supersededByRunId、无buildJobId。不是仅凭一个状态为RUNNING的runId就能调用。

VisualAnalysisService在以下位置复核：最初入口（早于资产读取）、缓存/输入固定事务、provider发送前、分析与缓存指针发布事务。网络请求期间不持有数据库事务；管理员许可仍在发送前再读，取消信号沿用gateway transport。

analyze用现有withAgentRunNode跟踪pending任务及封闭上下文，防止父执行结束后由AsyncResource/定时回调借用已关闭scope再次外发。外层已开始的合法异步任务仍由原pending机制收尾，不提前释放turn锁。

旧fence/过期租约不能发起新分析，模型在途期间被替代的执行者也不能创建VALID分析或更新缓存指针。cache lease的CAS和finally按自身owner释放保留，不清理替代owner的lease。provider若实际已成功返回，ModelInvocation仍保留真实SUCCEEDED/usage，而发布可失败；**丢弃结果不等于免费或未发生调用**。

授权撤销不会撤回已在途网络请求；现有取消/usage事实继续如实保留。本批不宣称完成真实多进程故障或所有网络边界的exactly-once。

## 3. 分析前的hash固定（不是完整准入快照）

新增严格合同，复用原canonicalServerHash和已有AgentRunStep：

- `visual-analysis-config-v1`：schema=`kf-visual-analysis-config/v1`、tenant/workspace/conversation/run/base身份、原run.configSnapshot hash、analysisVersion、modelConfigHash。
- 每张实际分析图的`visual-analysis-image-<assetId的完整hash>`：schema=`kf-visual-analysis-image/v1`，上述scope/config身份、asset/source/derivative hash、instructionHash、MIME/尺寸/scale。

modelConfigHash复用既有visualModelConfigHash，覆盖完整服务端route（含模型/endpoint/能力/超时/context/pricingVersion）、视觉系统prompt及版本、schema、输出/响应限额/thinking。这里只存hash，不存API key、URL、原始指令、像素/base64、storage路径或完整prompt。

同Run/同step只创建一次，读取先严格parse并复核row.inputHash与内容，再比较实际受控输入；损坏报VISUAL_ANALYSIS_INPUT_CORRUPT，配置漂移报VISUAL_MODEL_CONFIG_CHANGED，图/指令漂移报VISUAL_REFERENCE_INPUT_CHANGED。缓存命中也不能绕过。发送前与发布时再次复核，Run config在provider在途期间被改也拒绝发布。

这是**首次实际分析前的hash pinning**，不是Run受理时已经冻结全部附件/主补图/用户同意，也不是能重建旧endpoint/key的完整配置存档。恢复时新实例配置hash不同就明确失败，不偷偷切provider，也不拿当前key去猜旧endpoint。本批没有统一冻结其他文字任务或价格表实际费率，没有新增DB不可变trigger；不能把step hash当独立执行授权或防DB管理员篡改的签名。

以后须把这些事实前移/绑定到新协议准入快照，固定附件列表/顺序/主补图与发送对象，保存可安全恢复的模型配置版本和key引用（不存密钥），再接后继Run。当前helper不构造完整三图准入manifest，也不代替上传配额/新Run附件上限。

## 4. 红绿测试与中间问题

- 调整测试装配：每个分析用例创建真实owner/fence/lease Run，wrapper只提供生产worker一样的withAgentRunExecution，不替换服务、DB、检索或gateway。不同指令/配置的缓存隔离样本使用新的Run；同Run改变指令另有拒绝断言。原13项断言先全部通过，证明装配调整不靠放宽生产合同。
- 新测试首轮22项：13通过/9失败。无scope和旧fence确实调用成功，丢失fence的迟到结果仍发布，固定step不存在；管理员路由404。新增功能实现后22/22。
- 再加“provider在途期间Run config改变”红测，23项中22通过/1失败（仍然发布）；补发送前与发布事务的pin复核后通过。
- 内部管理员角色检查做变异验证：暂时旁路新增service角色条件，定向测试确实失败（非法调用返回成功）；随后立即恢复该条件，完整回归验证。定向运行显示其他项被测试名称过滤，不是新增.skip，不能作为已通过项累计。
- 闭合scope的AsyncResource脱离调用也先复现仍成功，再用withAgentRunNode阻止；定向红测1失败/24被过滤，最终25项完整运行，无新增skip。
- API tsc发现API包没有直接zod依赖；移除仅为类型用途的import，使用合同schema提供的parse接口，不安装依赖、不绕过类型检查。
- provider响应始终为本地fetch fixture；真实sharp派生像素、HTTP/Origin/会话/DB/ledger服务保持原样。没有真实provider/KF质量或收费证据。

## 5. 验证与数据库边界

使用仓库Node24及现有依赖。命令：

```sh
# cwd: agent-app/apps/api
COOKIE_SECURE=true TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_generation_full_20261022_0940 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run
# cwd: agent-app/packages/contracts；domain-client同命令在自己的目录
../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --maxWorkers=1
# cwd: agent-app/packages/agent-orchestrator；与API不同库
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_generation_20261022_0930 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --maxWorkers=1
# cwd: agent-app
../.toolchain/node-v24.19.0-darwin-arm64/bin/node node_modules/typescript/bin/tsc --noEmit
../.toolchain/node-v24.19.0-darwin-arm64/bin/node node_modules/typescript/bin/tsc -p apps/api --noEmit
../.toolchain/node-v24.19.0-darwin-arm64/bin/node node_modules/eslint/bin/eslint.js apps/api/src/vision/visual-analysis-input.ts apps/api/src/vision/visual-analysis.service.ts apps/api/src/vision/visual-analysis.integration.test.ts apps/api/src/vision/visual-egress-policy.controller.ts apps/api/src/vision/visual-egress-policy.service.ts apps/api/src/vision/reference-assets.module.ts packages/contracts/src/visual-execution.ts packages/contracts/src/index.ts
```

最终完整结果另记于下方。针对性41项及新测试都包含在API完整套件中，不重复累加；改闭合scope处理前的完整API687/687是中间基线，不当作最终688项证据。未运行Web/浏览器/build-jobs全套、真实provider/KF或跨平台/真实进程kill验收。

没有新schema/migration/包依赖。两个隔离测试库均沿用已deploy21迁移，同库串行，不重置业务/试用库。原试用库`kf_agent_e2e_trial_20261021_01`仍按18条旧状态对待，保留数据，**不得直接重启新源码指向该库，也不得reset/seed升级**；需维护者协调expand和旧任务排空。未更改真实.env/key/原5174或试用进程。

### 最终完整结果（2026-10-22）

| 范围 | 结果 | 开始时间/耗时 |
|---|---|---|
| API | 61文件，688 passed / 0 failed / 0 skipped | 14:06:37，123.85秒 |
| domain-client | 68文件，1401 passed / 0 failed / 5 skipped（1406项） | 14:04:07，48.06秒 |
| contracts | 20文件，505 passed / 0 failed / 0 skipped | 14:04:06，5.31秒 |
| agent-orchestrator | 19文件，195 passed / 0 failed / 0 skipped | 14:04:39，15.67秒 |

API含最终25项analysis集成（原13+本批12）、12项review、12项snapshot、127项模型、15项真实Run流程及三类golden双构建/下载；新scope关闭负例已包含。会话租约清理的既有WARN仍出现，不据此声称历史连接问题根因已解决。domain的5项仍为缺本地参考工程的既有条件跳过，不视为通过；不是全monorepo验收。

本批root/API tsc和相关8文件ESLint通过；最终分析scope wrapper修改后API tsc/ESLint重跑exit 0，任务路径whitespace检查通过。没有用首次687项回归替代最终688项，也没有重复累加针对性/变异测试。

## 6. 文件清单

新增4个代码文件：

- `agent-app/packages/contracts/src/visual-execution.ts`
- `agent-app/apps/api/src/vision/visual-analysis-input.ts`
- `agent-app/apps/api/src/vision/visual-egress-policy.controller.ts`
- `agent-app/apps/api/src/vision/visual-egress-policy.service.ts`

修改4个代码文件（保留原dirty修改）：

- `agent-app/packages/contracts/src/index.ts`
- `agent-app/apps/api/src/vision/reference-assets.module.ts`
- `agent-app/apps/api/src/vision/visual-analysis.service.ts`
- `agent-app/apps/api/src/vision/visual-analysis.integration.test.ts`

新增本报告；同步master/P4/handoff、design spec的实际API说明及operations。没有修改图、RunAction、执行协议、生成器、工程签名、前端或数据库迁移。

## 7. 下一步

1. 读AGENTS、master/design/P4/handoff与本报告，继续保留dirty/预算暂缓/旧POST不恢复，不自动开worktree/多代理、提交/推送或操作试用库。
2. 新Run协议/config、完整附件主补图与模型配置版本准入快照、用户实际发送说明/同意先写红测。管理员策略API已就绪，但UI/每次同意未做，不能把imageEgressAllowed=true当用户同意。
3. 单一受理事务用VisualReviewService.validateAcceptanceInTransaction校验后，保存reference/reviewHash/confirmationHash/确认审计并CAS创建唯一可执行后继；同Run不得改变冻结图/指令来重规划，需创建新Run。现在仍禁止在@6上受理视觉action。
4. 图接analyze/review时处理prepare已经原子暂停的事实，避免旧lease再次append/pause/finish；把已完成视觉确认传既有blueprint，保留独立蓝图批准。
5. 视觉语义模型发送结构前也复核管理员许可/用户同意，使用前批严格semantic wrapper与可信编译来源；memo含确认/spec/mapping/binding hash，checkpoint不序列化provenance handle。
6. 再接现有工作台的管理员策略UI、附件/识别review/低置信与未知交互澄清、替代重review、确认和真实工程下载，完成双租户浏览器验收后才灰度vision。
7. T23局部修改、T24证据、T25/26真实KF/模型质量及P2发布故障门槛仍独立未完成。本文不替代用户授权真实外发、部署或生产升级。
<!-- end -->
