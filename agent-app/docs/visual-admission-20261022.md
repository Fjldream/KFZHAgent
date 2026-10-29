<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
# T22 图片输入冻结、分析配置恢复与 review 来源绑定

日期：2026-10-22；功能名：Agent工作台迭代。接续 `visual-graph-20261022.md`。当前 main / HEAD `94364cd9add74915c6f85af96357ee5b286faede`，沿用混合 dirty 目录，不自动提交、推送或新建 worktree。

## 1. 本批完成了什么

新增内部 `VisualRunAdmissionService.freezeInTransaction`：在调用方的 Run 创建事务里，将经过服务器归属检查的1–3张图片、明确的主图/补充图关系、完整分析模型路由及配置身份、用户发送同意写入 `AgentRun.inputSnapshot`，同时保存一次性 RunStep 和精简审计。真实 Prisma 测试验证并发幂等、不能覆盖和调用方回滚时 Run/输入/step/audit 全部回滚。

分析服务接入该输入：@7 缺冻结输入时不发送；存在损坏视觉数据时不回落旧路径；恢复从快照拿分析路由，不改用进程当前环境里的新 endpoint/model。入口、缓存命中、发送前、结果发布继续检查当前 Run scope/fence/lease，并复核冻结输入与当前源图/派生元数据和实际读取的派生像素身份。

review 已接同一冻结输入：不是只要“同一工作区有这个分析”就接受，必须匹配受理的图片、派生 hash、尺寸、指令、分析版本与模型配置。还修复既有 bug：分析 TTL 过期后仍可生成或确认 review；现在准备、读取、确认校验均用拿锁后的 PostgreSQL 时钟拒绝过期分析，不消费等待。

**T22 仍 IN_PROGRESS，公开图生入口未开放。** 冻结服务没有装配进 RunStore/HTTP/生产 module；只提供同事务原语，不自行创建或领取 Run。现行 RunService/Store 仍拒绝图片附件与视觉 action，执行器仍只支持 @6、在 cache 前拒绝 @7，vision/outbound UI 保持关闭。本批没有创建确认后继或开放一条不可执行的公共 Run 路径。

## 2. 严格合同

`packages/contracts/src/visual-execution.ts` 增加：

- `VisualRunAdmissionRequestSchema`：仅 attachmentIds、primaryAssetId、`sendingConsent:{noticeVersion:"visual-egress@1",accepted:true}`。图片必须1–3个不同 UUID，主图必须选自其中；拒绝旧说明版本、false/缺同意、URL/model/native/sourceHash 等多余字段。
- `VISUAL_EGRESS_NOTICE`：说明会发送安全派生图片、后续使用识别文字/结构、原参考图默认不打包；版本与原文 hash 一起冻结。尚无前端展示/勾选，不宣称用户真实完成了 UI 发送同意。
- `FrozenVisualModelRouteSchema`：服务器私有路由；HTTPS、无用户名/密码/query/fragment，明确视觉和JSON能力，超时不超过120秒。完整保存 provider/baseUrl/model/能力/timeout/context/pricingVersion，不存 API key。仅受可信服务端 constructor 配置，不接受浏览器路由。
- `FrozenVisualReferenceSchema`：原图 MIME/hash/尺寸/大小与派生 WebP hash/尺寸/大小、完整 transform/scale。检查源与朝向维度、X/Y缩放、一致的2048上限缩放、10MiB/32MP/8192边长限制；不保存 storageKey、私有路径或像素。
- `VisualRunAdmissionContent/SnapshotSchema`：绑定 tenant/workspace/conversation/run/requesting actor、baseRevision/mode、Run配置与action/instruction hash、上述图和分析路由、发送同意 actor/time/版本/说明hash/图片集合hash，再对完整内容计算 inputHash。
- `VisualRunInputSnapshotSchema`：严格的图片Run容器，`baseRevisionPolicy:"fixed"`，不允许冻结后跟随队列前序暗换基线。后续新的确认/重试输入须显式版本化，不能随意往该严格容器塞未知字段。

这里完整冻结的是**像素分析模型**。蓝图/视觉语义实现/修复等其他任务的路由/提示词配置实体与外发授权边界仍需后续接通；不得把本批描述为所有模型已迁移共享 gateway。实际静态提示词不重复存整段正文，保存 promptVersion 与覆盖真实 prompt/输出限额/thinking等的 `visualModelConfigHash`；代码提示词升级导致身份变化时明确拒绝，不默默换 prompt。

## 3. 事务与完整性

冻结原语必须在 Run 创建事务中调用。它要求服务器作用域、真实 requesting user 属于本租户且等于 Run actor，Run 为未开始、fence0、无 lease/cancel/后继/build 的 @7 QUEUED message，工作区为 creative-v2、当前 base 未移动且输入为 fixed。

锁顺序是 Tenant（策略/上传共用）→Workspace共享锁→Run control advisory/行锁；共享锁保护基线不被修改，同时与 claim 的 Workspace FOR SHARE 兼容。无文件读取、provider网络或长等待发生在冻结事务内；实际像素读取/rehash仍在既有 ReferenceAssetService.resolve。主图/补图这里只固定关系，不是已经实现多图合并识别或冲突布局 UI。

快照写入 AgentRun.inputSnapshot + `visual-run-admission-v1` completed RunStep + `VISUAL_INPUT_FROZEN` audit，依赖现有事务，不新增表/migration。相同并发输入返回相同 snapshot/acceptedAt，仅一条 step/audit；改主图/配置等拒绝覆盖。审计仅记录输入hash、图片数量/主图ID、说明版本和分析modelConfigHash，不含完整路由、需求或像素。

`readVisualRunAdmission` 在执行/控制锁内复核：strict parse、step唯一/COMPLETED/outputRef与inputHash一致、Run作用域/base/mode/action/config、说明hash、图片集合、当前元数据和静态prompt身份。已存视觉对象或step损坏/丢失，不会被当成旧无视觉输入继续。**这是应用层只写一次+双份一致性校验，不是新DB不可变trigger或抗DB管理员篡改的签名凭证。**

历史 @6 内部分析 fixture 无 visualAdmission 时保留原先的调用前hash pinning；这不开放公共 @6 图片 Run。管理员许可仍须在发送前复核，缓存命中也先过许可检查；持久发送同意不替代管理员许可、活跃执行租约或独立蓝图审批。

## 4. 分析与 review 的串联

1. 新分析从可信冻结输入恢复旧路由，即使新实例环境配置改为其他模型/URL/不支持vision，也不会切换已经受理的任务。
2. 资产ID和完整指令hash必须属于受理输入，后续 `pinVisualAnalysisInput` 在原配置/图step固定前再复核 admission。源图/派生metadata被改、Run action/mode/config漂移、输入/step损坏都会失败。
3. 读取的派生像素仍按已有存储验证 rehash，且实际bytes大小/scale/尺寸必须与受理数据一致。只读取 ReferenceAsset，不把素材资产或任意 URL 当图片来源。
4. provider 在途期间冻结输入被移除：不发布 VALID 分析/缓存指针，正确释放自身cache lease，实际已成功返回的 ModelInvocation/usage仍保留 SUCCEEDED；不是“丢弃结果就没有费用”。
5. review preparation、waiting读取及 acceptance校验共用loadCurrentAnalysis：锁住analysis防并发child，检查真实时钟TTL/当前leaf/hash，再匹配当前Run受理的asset/source/derivative/viewport/instruction/modelConfig/analysisVersion。
6. 本地fixture已串联冻结→真实安全派生图片→真实shared gateway与账本→分析→signed review/WAITING_INPUT→严格acceptance校验；此校验仍不消费等待、不持久化 accepted envelope、不CAS后继，也不会构建。

## 5. 测试证据及中间问题

- 先加两个分析红测：无受理快照的 @7 和损坏 visualAdmission 都仍发送成功；原25项通过、新2项失败，确认缺口后接检查。
- 新 admission 测试文件首轮因模块尚不存在加载失败（没有执行用例，不当成功或功能断言统计）。模块实现后9项真实DB用例通过，包括图来源/actor/主补图、strict body、幂等、不可覆盖、回滚、配置与source变更。
- 串联扩为13项时，12通过/1失败：同工作区、另一指令生成的analysis确实进入review。随后将review绑受理输入。
- 另加两项review TTL红测，14项中原12通过/新2失败；现在准备前过期和等待中到期均拒绝，等待状态不被消费。
- 不合法服务器URL出现原生 `Invalid URL` 而非固定错误：新增红测复现，route schema改为安全返回validation失败；HTTP/凭据URL/query/nonvision/超时配置一起验证。
- mode未纳入第一次快照时，改Run mode仍通过读取。红测复现后将mode纳入content和读校验，避免使用新模式解释旧同意。
- TypeScript初次发现测试数组下标可能undefined，改为已准备fixture的明确非空索引；ESLint初次发现fetch union/body使用默认String转换，改为类型分支与严格string body，不禁用规则。
- 最终针对性3文件 **55/55**（admission14、analysis27、review14）；这些包含在API完整结果中，不能重复累计。新增fixture只提供本地provider响应，使用真实Prisma/ReferenceAssetService/sharp/storage/gateway/review；未进行收费请求。每个新测试workspace的非终态Run会标CANCELLED，避免残留scheduler-visible fixture。

## 6. 复验与环境

```sh
# cwd: agent-app/apps/api
COOKIE_SECURE=true TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_generation_full_20261022_0940 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run
# cwd: agent-app/packages/agent-orchestrator；与API分库
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_generation_20261022_0930 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --maxWorkers=1
# cwd: agent-app/packages/contracts 或 domain-client
../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --maxWorkers=1
# cwd: agent-app；同样对apps/api、packages/contracts、packages/agent-orchestrator、packages/domain-client
../.toolchain/node-v24.19.0-darwin-arm64/bin/node node_modules/typescript/bin/tsc -p . --noEmit
../.toolchain/node-v24.19.0-darwin-arm64/bin/node node_modules/eslint/bin/eslint.js packages/contracts/src/visual-execution.ts apps/api/src/vision/visual-run-admission.ts apps/api/src/vision/visual-run-admission.integration.test.ts apps/api/src/vision/visual-analysis-input.ts apps/api/src/vision/visual-analysis.service.ts apps/api/src/vision/visual-analysis.integration.test.ts apps/api/src/vision/visual-review.service.ts apps/api/src/vision/visual-review.integration.test.ts
```

只用既有两个隔离测试库，沿用21条migration；无新migration/依赖/.env/key/进程操作。旧试用库 `kf_agent_e2e_trial_20261021_01` 继续按18条旧状态保护：不reset/seed、不直接重启新源码指向它，需协调expand及旧Run排空。没有重新检查或启动历史试用URL。

本批未跑新的Web/浏览器/build-jobs全套、真实provider/KF/Windows/代理多副本或进程kill验收。没有新增skip/抬超时/放宽旧断言；领域层既有5项条件skip不可当通过。

### 最终完整结果（本地2026-10-22）

| 范围 | 结果 | 开始时间 / 耗时 |
|---|---|---|
| API | 62文件，707 passed / 0 failed / 0 skipped | 14:58:29 / 132.72s |
| agent-orchestrator | 19文件，205 passed / 0 failed / 0 skipped | 14:58:31 / 11.31s |
| domain-client | 68文件，1403 passed / 0 failed / 5既有条件skipped（1408总项） | 14:58:49 / 50.00s |
| contracts | 20文件，505 passed / 0 failed / 0 skipped | 14:58:30 / 5.61s |

root、API、contracts、agent-orchestrator、domain-client 的 TypeScript --noEmit 及本批8文件 type-aware ESLint通过。领域层5项既有本地参考工程条件跳过仍不当通过。API还有既有 `Conversation turn lease connection was destroyed during cleanup` WARN；一次全量通过不意味着历史所有偶发连接问题已经解决。各包共2820 passed，针对性55项已包含其中，不重复加总。

## 7. 下一步接线，不要重复开发本批原语

1. 在 RunService/Store 的真正图片准入中调用本冻结原语，和Message/Run/queued事件同事务提交；新严格body须版本化接收同意/主图，不允许浏览器传snapshot/路由。保留幂等重放优先、租户flags/队列容量、取消/旧等待及stale-base控制。
2. 将@7从节点预留变为整体可执行协议：config、plan、executor/handler、graph load/analyze/review等待与stop恢复一起完成；freeze服务目前也未注册生产module，不能只开flag或改常量。
3. 为确认/重试设计继承输入，不将当前仅message/fixed的admission容器直接复制给不同action；同受理事务验证review、存accepted envelope及审计，CAS唯一后继，失败不消费旧WAITING_INPUT。
4. 蓝图与视觉语义任务冻结及实际派生OCR/结构发送复核仍需接；当前仅像素分析模型完整路由冻结。新的用户需求/改图/新说明版本须新确认，不允许在旧Run偷改输入。
5. 复用现有RunWorkbenchView/components/runs接图片上传、说明/同意、主补图选择、识别修正/区域和差异review、独立蓝图确认、来源卡与下载。多图布局冲突要澄清，不按顺序覆盖。
6. fake provider完整upload→review→confirm→KF build→download E2E，再经单独授权做真实provider/KF/像素质量。预算限制暂缓，缓存和用量观测不结案，旧POST不恢复。

## 8. 本批文件

- 新增 `apps/api/src/vision/visual-run-admission.ts`、`visual-run-admission.integration.test.ts`。
- 修改 `packages/contracts/src/visual-execution.ts`。
- 修改 `apps/api/src/vision/visual-analysis-input.ts`、`visual-analysis.service.ts`、`visual-analysis.integration.test.ts`。
- 修改 `apps/api/src/vision/visual-review.service.ts`、`visual-review.integration.test.ts`。
- 配套本报告、master/P4/handoff/design状态补充；此前报告保留为历史，不回写旧数字。未要求补丁，未出补丁。
<!-- end -->
