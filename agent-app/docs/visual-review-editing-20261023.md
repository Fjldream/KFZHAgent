<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
# T22 已有识别区域编辑与原子重新确认（2026-10-23）

## 1. 本批范围

现有参考图确认卡可修改已有区域的文字、类型及归一化位置/尺寸，预览后保存并重新匹配组件。保存不调用模型、不创建新 Run 或工程；发布新签名展示/回执后必须重新选择差异，再独立确认蓝图。

**T22 仍 IN_PROGRESS，production vision resolver 仍关闭。** 不支持增删区域/改变层级/置信度/图片身份、替代组件、图生 retry 或拖拽缩放框；不是运行完成后的区域重生成。真实模型、缓存降本和 KF/Windows/1:1 质量未验收。

上一批基础 UI→下载见 `visual-workbench-browser-20261023.md`。本批沿用原工作台布局/确认卡，就地编辑和框/行联动，没有新 UI 库、预算拦截、迁移或生成核心改写。

## 2. 新公共写合同

`POST /api/runs/:runId/visual-review/revisions`，200，Cookie + Origin，`Cache-Control: private, no-store`、`Vary: Cookie`。

严格 body 为 `clientRequestId(UUID)/receipt/analysisId/analysisHash/regions[]`。每个 patch 只含 `regionId/role/text/box`，1–100 项、ID 不重复，文字最多 20 段/每段 2000 字，坐标 0–1、宽高正数、不越界。schema 解析后重新 JSON 序列化的 UTF-8 大小不超过 65536 bytes；浏览器同样计算，过大要求分批修改，不解除原 HTTP parser 的独立限制。

不接收全 spec、sourceAssetId/sourceHash、viewport、parent/id/置信度/模型配置/原生控件字段或执行权限。只能修改真实存在的区域，no-op 拒绝。

RunService 先 tenant-scoped snapshot 再校验 body/config，跨租户和不存在均 404；current runs/workbench/vision、explicit-consent、outbound 每个独立 gate 必须开放，缺 runtime 403。实际 resolver 不变；正向 HTTP/Chrome 用测试组合根注入当前策略，不能据此开生产 flag。

## 3. 同一事务的版本切换

1. 依照原确认锁序：conversation advisory → tenant FOR UPDATE → workspace FOR SHARE → source control lock/row。当前租户外发许可必须仍有效。
2. source 必须是未消费/未取消/无 job 的 WAITING_INPUT 单图 build，原同意者操作；验证 frozen admission、当前 base/TTL、独立签名 review、真实待确认事件和分析内容完整性。
3. 同 requestId 使用 `visual-review-edit-v1:<UUID>` 持久 step 做幂等。不同 body 409；完全相同且仍是当前展示则重放，不重复分析/事件/审计。若后续又改版或来源已被接受，则旧编辑重放 409，返回最新 GET/事件后重新核对，不返回可误用的旧展示。
4. 检查旧 receipt/analysisId/hash，只 patch 白名单字段。创建不可变分析 child，继承原图片/source/derivative/model/instruction/version，**继承原 expiresAt，不能通过反复编辑延长同意或分析 TTL**。旧行不改。
5. 服务器重新 retrieve/map capabilities，不相信前端自报组件。新 review HMAC 冻结新 spec/mappings，新增可选 revision 元数据（requestId/previousReviewHash/actor）；原 execution 是最初分析的执行来源，不冒充用户编辑的新 worker lease。
6. 把旧完整签名展示存入 `visual-review-history-v1:<oldReviewHash>`；CAS 更新当前 `visual-review-v1` 指针/输出及 inputHash。新 edit step 持久化完整新签名展示。
7. 同事务追加新的 input.required/receipt、lastSeq、activity、VISUAL_REVIEW_REVISED 审计（只含 hash/request/count，不复制 OCR）。Run 仍 WAITING_INPUT；无新 Message/Run/模型/预算/BuildJob。
8. 任一步失败全回滚。之后旧 receipt 被拒绝；现有 accept/blueprint/semantic/native/download 继续消费新展示，不重签旧确认或丢图转文字。

所有新 revision 的读取会校验直接前版 archive 的 HMAC/内容 hash/scope/config/base、原 actor 与 child.parentId；坏/缺 archive、父关系漂移拒绝，不只检查新内容 hash。旧无 revision review 兼容。

发布到原 worker 收尾之间若用户立即编辑，当前指针可先前进。Store 的只读 observeCommittedReviewPause 允许从当前行或该 worker **精确原 hash** 的不可变 history 认证已提交回执，并验证确实发布过对应事件。原 releasing owner/fence、scope/config/base、已释放 lease/无 job/等待或取消状态全部保留；当前行仍要求最新 receipt，归档行只核对其原发布事件。这只是原 worker 收尾，不授予执行新编辑内容的权限，不从归档 resume 模型或生成。

当前默认 @6 不变，视觉仍 @7；**同 @7 不代表旧 worker 支持新 revision 元数据/历史校验**。生产开放前继续排空并整体升级，不混领新数据、不手工造 proof。

## 4. 旧接口退役与界面

移除公开 `PATCH /api/v2/visual-analyses/:id`：它可独立生成 child，却不能原子更新等待展示，容易使签名确认永久过期，也缺本 Run/原同意者检查。旧路径现在 404；保留私有鉴权 GET。原 analysis.revise 仅为内部 primitive/既有测试使用，不再从 HTTP 暴露，不能当作新 UI 的授权入口。

确认卡提供“编辑识别结果/重新读取当前结果”。编辑时显示未保存预览、中文类型和四个位置数值；禁止确认旧映射，保存按钮只在实际变化且边界/文字/UTF-8 大小有效时启用。源段内原有换行不自动变成一次修改；放弃恢复原内容。保留不确定项，不伪造已解决的数据源。

保存成功重新订阅真实事件与 GET，并按新 receipt remount 卡片，清空旧差异选择。失败保留草稿，相同输入重试复用 requestId；409 自动重放最新事件/展示，不自动接受。导航/卸载 abort 并丢弃迟到响应。另一标签页修改导致旧接受 409，也刷新事件回执，不仅 GET 取新内容配旧事件。手工“重新读取”同样刷新事件，不能卡在永久 mismatch。

## 5. 测试与中间失败

新增 API 25 项：原子新版本/旧行不变/TTL 不延长/历史/幂等/旧回执拒绝/新接受；12 个拒绝分支（过期、base、取消、撤权、坏 receipt、未知/重复区域、越界、源字段、no-op、大小等）；独立五个 feature/policy gate；同/不同编辑与接受竞争、scope/actor、audit 后置故障真实回滚、history/parent 损坏，以及立即编辑早于原 worker 收尾的精确归档确认。两个旧 PATCH 用例改为验证 404 且没有 child，不删测试或放宽断言。

新增 Web 10 项（review 4、transport 1、view 5）：编辑/校验/放弃/换行/UTF-8、真实 body、保存后重新选择、新 receipt/analysis、网络失败幂等、409 刷新、跨会话迟到、另一标签页陈旧接受。

原 opt-in Chrome 用例扩展：真实私有上传→识别→手机布局编辑文字/位置→POST 保存→旧 receipt HTTP 409→新差异接受→PG 蓝图→独立确认→semantic/native/sign/snapshot/真实 BuildExecutor→下载 gzip SHA-256/一次性 URL。编辑后模型分析仍仅一次。不是另一个重复计数的新浏览器用例；实际 API/SSE/DB/编译/下载，不 mock 浏览器 API，模型三阶段为本地 fixture。精确 claim 当前 Run/job，不冒充全局调度/OS kill 或真实质量验收。

中间记录：

- 首批 12 个编辑红测因路由不存在返回 404；实现后定向 12/12。
- 旧 PATCH 两条红测仍返回 403/200；退役后 404/无 child。
- 新编辑组件/transport/view 红测分别缺编辑入口、缺 helper、没有保存 POST；接入后通过。
- history/parent 损坏两条红测原本仍返回可确认展示，补链式读取校验。
- OCR 段内换行红测暴露只打开编辑就产生假差异；保留未变原段数组。
- 64 KiB 红测原本服务端 200、前端可点；增加双方序列化 UTF-8 bound。
- 另一标签页红测暴露旧接受 409 后仍停旧版本；一起刷新事件/展示。
- 初次 API tsc 是测试事务 double 的 Prisma generic cast 不匹配；lint 是测试 tuple 非空断言和多余外层断言；均修复，不关规则。
- 第一次完整 API 为 924 passed / 1 failed（12:01:59 开始，831.52s），失败是既有 run-executor 的 60ms lease / 15ms 续租 / 150ms step 用例 FENCE_REJECTED，与前批记录同类；本批未修改 executor/store/该断言。单独完整该文件 7/7（12:16:06，2.69s）。wall duration 明显大于测试执行汇总，不据此猜定 OS/数据库/调度根因；继续完整复验，不能以单独复验替代全量。
- 第二次完整 API 为 919 passed / 6 failed（12:33:15，222.26s）：run-flow 首次 native approval stop 重放 404，随后同租户遗留队列被后续 claim 领取导致 4 项连带失败，最后一次 workspace POST 404；本批没有修改该文件。单独 targeted 库复验被原 CLEAN_BUILD_QUEUE 守卫拒绝（其他 fixture 的排队 job），没有删除队列绕过。新建空的 `kf_agent_test_review_flow_20261023_1245` 做专用验证，记录后续结果；404/短 lease 根因不因此声称解决。
- 补充发现立即编辑早于原 worker 收尾的竞争；新红测原 FENCE_REJECTED，补只读归档确认后新旧精确 owner/fence 用例 2/2，不修改通用续租/timeout。API 新增因此合计 25 项，旧未编辑流程仍要求原最新回执。
- 空专用库中的原完整 run-flow 文件 15/15（12:41:38，9.44s）；不能据此宣称随机 404 根因修好。队列只读检查 0 后才启动新一轮完整 API；一次 shell 引号错误的只读查询未执行，修正后查询成功，无数据操作。

本批定向 Web 26 文件 156/156；contracts 20 文件 506/506；root/API tsc、Web vue-tsc、12 TS 文件 type-aware ESLint 和 Web build 已通过。最终 API 全量含 Chrome 结果在 §7 追加，不复用上批 901；历史 lease cleanup WARN/短 lease/偶发 404 根因不宣称根治。

## 6. 重跑、文件与下一步

API cwd：

```sh
LANGCHAIN_TRACING_V2=false LANGSMITH_TRACING=false KF_VISUAL_BROWSER_TEST=1 COOKIE_SECURE=true TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_generation_full_20261022_0940 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --reporter=dot
```

定向用 `kf_agent_test_generation_20261022_0930`；禁止同库并发 reset，全量单独跑。新浏览器仍需显式 KF_VISUAL_BROWSER_TEST=1 和已装 Chrome；普通无 Chrome 运行仅此新增条件用例 skip，没有改历史 timeout/retry/skip。

14 份代码/测试：contracts/src/visual-review.ts；API runs/run.service.ts、run.controller.ts、run-store.ts、visual-run-flow.integration.test.ts；vision/visual-review.service.ts、visual-analysis.controller.ts、visual-analysis.integration.test.ts；Web visual-api.ts/test、VisualReferenceReview.vue/test、RunWorkbenchView.vue、RunWorkbenchVisual.test.ts。文档：本报告、master、handoff、P4、design §10、operations。

未修改业务 schema/migration 文件或新依赖，未读改实际 .env/key、操作试用进程/试用迁移或真实 provider/KF。为避免污染队列，新建上述隔离库，仅读取既有 full 测试库的 schema 和 21 条 Prisma migration 元数据（不复制业务数据，验证 BuildJob/User 均 0）；排除 checkpoint 表，由 LangGraph 自己 setup。没有 reset/删除旧队列或试用数据。旧试用 18 对源码 21 的 expand/排空/整体升级保护不变；未 commit/push/worktree/多代理/生成未要求补丁。原混合 dirty 保留。

下一模型直接做剩余范围：优先核对 §7 最终回归与原 Run-flow 404/短 lease 的未定根因，不能以跳过测试获得上线结论；之后区域增删/层级/交互与数据源合同、替代组件及视觉 retry、恢复/资源/升级/回退/全局调度专项，再受控 rollout。真实 provider/KF/Windows/1:1 必须授权实测。不要再重做基础 UI→下载或本批原子已有区域编辑，不直接开 production flag，预算拦截仍暂缓。

## 7. 最终复验

最后一轮：2026-10-23 Asia/Shanghai，API **64 文件、925 passed / 1 failed / 0 skipped**（12:43:12，220.12s），使用新专用库，包含完整 **214 项 visual-run-flow**（本批 25 项新增）和扩展的 Chrome 编辑→下载用例。其他 63 文件通过，唯一失败为 `api.integration.test.ts:1648` 的原 I1 并发批准用例，预期 CONVERSATION_TURN_IN_PROGRESS，实际 NO_PENDING_APPROVAL。

该用例在失败前的 `[200,409,409]`、唯一成功返回 building/buildJob 已通过，但之后的 audit 断言因错误码断言先失败而未执行，**不能据此声称本用例审计检查通过**。尚未确认是服务并发语义还是测试未保证在途重叠；下一步应记录/控制 turn lease 与审批提交时序，不能只允许两种错误码、延长超时或添加 retry 来报绿。原文件没有被本批修改。全量尚未全绿，不能标记验收完成或上线；前两轮失败与单独复验保留 §5。

Web **26 文件 156/156**（11:59:28，4.98s），contracts **20 文件 506/506**（11:58:17，2.14s）；root/API tsc、Web vue-tsc、12 TS type-aware ESLint 均 exit 0；Web build 98 modules、279.02 kB JS（101.87 kB gzip）通过。新增观察归档收尾后又复验 API tsc/lint 与 root tsc。没有将 API/原生流程覆盖说成未重跑的 domain/build-jobs/orchestrator 全量。

最后 Chrome 证据：`/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-visual-browser-8oMZO7`，含 reference-mobile-edit.png、reference-mobile-actions.png、桌面/交付截图和实际 client-project.gz；已直接查看手机编辑/操作截图，下载 hash/一次性 URL 断言通过。均为 fixture 验证，不是正式客户端交付。测试与本批临时 Vite/Nest/Chrome 已退出；隔离测试库与证据保留，试用服务未动。

scoped diff 与新增文件末尾空白检查通过。最终仍出现旧 Conversation turn lease connection destroyed during cleanup WARN，短 lease/随机 404/并发错误码根因没有冒充修好。T22 仍 IN_PROGRESS、production vision 关闭；下一模型优先修复/隔离最终并发验收问题再续做功能，保留当前 dirty、不自动提交。
<!-- end -->
