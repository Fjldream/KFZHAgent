<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
# T22 真实图片 Run 受理、执行与 review 等待

日期：2026-10-22；功能名：Agent工作台迭代。接续 `visual-admission-20261022.md`。当前 main / HEAD `94364cd9add74915c6f85af96357ee5b286faede`，保留混合 dirty、不自动提交/推送/创建worktree。

## 1. 实际完成边界

已将上一批冻结原语接入真正的 `RunService → PrismaRunStore.create` 事务，并将图片消息接入 `claim → RunExecutionService → visual-reference handler → VisualAnalysisService → VisualReviewService.prepare → WAITING_INPUT`。不是再单独调用内部服务来模拟 Run：新增集成实际创建 Message/Run/queued事件、claim租约、跑正式executor/registry，验证数据库状态/连续事件/usage/audit和回滚。另有真实cookie/Origin保护的Run HTTP入口→同一执行器测试。

**T22仍 IN_PROGRESS。** 测试通过服务器注入的隔离租户 staging policy 打开这段能力，生产环境解析器 `resolveWorkbenchConfig` 仍将 vision 关掉；请求 `AGENT_VISION_V1=true` 仍属于未开放配置，不能当启用方法。当前默认文本协议@6不变，worker新增有限@7支持：只执行经过冻结且flag为true的单图message，到review等待为止。确认action/唯一后继/派生OCR规划模型/现有工作台UI与视觉工程下载E2E尚未接通，不能宣称已可在产品里直接图生工程。

本批**没有**收费provider请求、真实KF质量验收、实际环境开关变更、迁移或试用重启。没有把参考图整张打包成背景，也没有新增原生工程生成旁路。

## 2. Run 准入与事务

沿用 `POST /api/conversations/:conversationId/runs`，预留严格字段：

```json
{
  "clientRequestId": "a-client-request-id",
  "clientMessageId": "a-client-message-id",
  "mode": "build",
  "action": {"type": "message", "text": "根据参考图生成客户端工程"},
  "attachmentIds": ["server-issued-reference-uuid"],
  "visualReference": {
    "primaryAssetId": "server-issued-reference-uuid",
    "sendingConsent": {"noticeVersion": "visual-egress@1", "accepted": true}
  }
}
```

这是字段形状说明，示例UUID占位不作为可发送样本。浏览器不能传route/snapshot/原生ID/hash来指定服务器事实。无图时原字段、requestHash与文字路径保持；有图时将完整visualReference加入请求hash，避免幂等重放接受不同的同意/主图。严格校验失败不会创建Message。

Store在幂等命中之后才判断新准入政策，旧请求在rollout/管理员许可关闭后仍可查询式重放，不重复Run/Message/冻结审计。新的图片准入要求服务器flag=true、explicit-consent策略、outbound允许、可用freeze依赖；@7配置由服务器设置，不由body传入。ReferenceAsset归属/actor/固定基线/模型能力/发送同意等仍由真实freeze事务复核。

同一事务创建Message、@7 Run（fixed基线）、冻结input/step/审计、Message→Run链接、原Run受理审计、预算行和queued事件；foreign image/配置/冻结错误导致全部回滚。当前仅空闲会话、单张参考图：队列/活跃/等待不被新图片需求暗中消费；多图明确VISUAL_MULTIPLE_REFERENCES_NOT_ENABLED，不分析主图后默默忽略补图。上一批freeze合同仍支持1–3图，关系数据未删除，但实际合并review尚未实现。

已注册冻结provider并接RunsModule；ReferenceAssetsModule导出分析/冻结服务，worker模块加载相同分析依赖。预算限制仍按维护者要求暂缓，不把既有预算行当作已启用budget guard。

## 3. 执行协议与缓存

- 默认 `RUN_PLAN_VERSION=run-plan@6` 不变，原文字step/inputHash不改。
- @7必须是message、冻结config里的agentVisionV1=true、严格有效的单图admission。持有真实scope/owner/fence/租约的事务在任何step cache读取前检查可信冻结输入、当前source/derivative和配置身份；未知版本/未支持action明确失败。
- 规划单个 `visual-reference` step；inputHash包含@7、action、baseRevision和完整admissionHash，不复用@6文字步骤。
- `mustPause`步骤不接受普通返回或COMPLETED缓存代替review。若发现这种完成缓存，记RUN_STEP_CACHE_INVALID并失败，保留原缓存供检查；处理器普通返回记RUN_STEP_REQUIRES_PAUSE，不能将其写成完成输出或Run成功。
- 正式handler拿同一conversation turn lease，恢复冻结分析路由和图片/指令，复用既有gateway/账本与缓存；只发布精简说明，随后由review事务创建签名review、input.required、WAITING_INPUT并释放租约。绝不调用文字生成图或入队build。
- provider响应是本地fixture，但图片上传存储/安全派生/读取、HTTP Run、Store/executor、gateway/账本、review和数据库都是真实实现；不是浏览器upload→download全链，更不证明provider看图质量。

`agent-worker-bootstrap`将真实analysis/review依赖交给registry。review沿用服务器HMAC key的域隔离签名；缺失/不合法review key或缺服务时不改变文本worker行为，图片步骤明确VISUAL_FLOW_NOT_CONFIGURED，不偷走文字路径生成。当前仍禁止开放vision；完整灰度配置以后须同时验证所有依赖和后续确认链。

## 4. 已提交暂停的安全收尾

review的prepare事务已经释放租约，若executor再调用普通Store.pause会FENCE_REJECTED。现在新增 `RunPersistedPause(reviewHash)` 和只读 `observeCommittedReviewPause`：

1. 新签名review content绑定实际释放租约的ownerId/fence；execution字段仅为旧内部review兼容而可选，新prepare总是填写。
2. 收尾拿Run control/行锁，核对当前tenant/run/fence、租约已清空、无build，以及WAITING_INPUT或已CANCELLED；再核对唯一completed review step、内容hash、exact reviewHash、config/base/scope/owner、input.required回执。
3. 只读取当前RunSnapshot，不再次pause/finish/追加事件，不因为renew失败就把自己刚释放租约的Run改失败；旧owner/fence/错误reviewHash不能借它越权收尾。
4. 用户在review提交后立即停止，收尾返回实际CANCELLED，不复活WAITING_INPUT、重复run.cancelled或写run.failed。

Store只读收尾复核持久内容一致性与租约来源，不在此重新做HMAC签发/外发授权；完整review校验与签名仍归原ReviewService。普通审批暂停规则没有放宽，旧pause仍严格校验有效租约。

## 5. 取消、恢复与禁止丢图重试

- 在途用户取消：既有scope/租约/取消信号阻止分析与review发布，executor收尾CANCELLED，无input.required或build。
- worker shutdown先于视觉preflight：向外抛中断，保持RUNNING/原租约，等待恢复，不把进程停止当MODEL_CANCELLED输入失败落终态。网络在途的shutdown继续沿用既有不终结Run的语义。
- 分析成功但尚未review时worker租约过期：新owner/fence从冻结输入恢复，命中同一分析结果，只有一次provider调用，发布一份review等待。
- 视觉等待不能被普通message或confirm_blueprint消费；accept_visual_reference仍未开放。用户可以通过原cancel端点关闭等待。
- 视觉重试的可信输入/同意继承尚未实现，HTTP控制服务和Store内部retryOf分支都明确VISUAL_RETRY_NOT_ENABLED；不能把失败/取消的图片任务变成附件为空的文字生成。未来实现必须升级继承合同，不能只删除守卫。

## 6. 红绿测试和中间失败

- 首轮新11项，1通过/10失败：RunService硬拒绝所有attachment，真实流程尚未接入。接线后10通过/1失败，剩余是测试错误地把Nest的结构化ForbiddenException当字符串error；改为断言403与response.error.code，不改变生产错误语义。
- 增加真实HTTP入口后12项通过；加完成缓存/普通返回绕过review两项红测，15项中13通过/2失败，确实被标SUCCEEDED。加mustPause约束后通过。
- 增加shutdown早于preflight红测，16项中15通过/1失败，确实记录MODEL_CANCELLED/FAILED。catch在外部signal已中断时重抛后保留可恢复租约。
- 后续补内部Store重试断言，发现只有控制服务挡住重试、仓库仍创建不带图的@6 Run；定向红测及中间API全量均复现。中间全量为**722 passed / 1 failed（723项）**，不是全绿。仓库补相同边界后再重跑完整API。
- TypeScript发现worker使用PrismaClient而ReviewService错误要求完整PrismaService生命周期；将服务依赖收窄为实际需要的PrismaClient，不cast成假生命周期对象。ESLint发现测试在接口接通后多余的as断言，移除后再检查，不禁用规则。
- 旧Run/审批/队列/feature-policy/冻结/review相关7文件86项曾通过；新增shutdown和内部retry后最终定向16项完整运行。所有针对性项都计入最终API总数，不重复相加。

## 7. 复验和环境

```sh
# cwd: agent-app/apps/api
COOKIE_SECURE=true TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_generation_full_20261022_0940 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run
# cwd: agent-app/packages/agent-orchestrator；API运行时与其分库
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_generation_20261022_0930 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --maxWorkers=1
# cwd: agent-app/packages/contracts 或 domain-client
../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --maxWorkers=1
# cwd: agent-app；分别对 .、apps/api、packages/contracts、packages/agent-orchestrator、packages/domain-client
../.toolchain/node-v24.19.0-darwin-arm64/bin/node node_modules/typescript/bin/tsc -p . --noEmit
```

相关17个代码/测试文件运行type-aware ESLint。没有新增skip、抬超时或放宽生产schema；领域层5项既有条件跳过不当通过。没有新增Web/浏览器/build-jobs全套或真实provider/KF/Windows/代理多副本/进程kill验收。shutdown用真实AbortSignal、恢复用真实过期租约，不冒充OS kill测试。

两个测试库均为已deploy21迁移的隔离库，同库无并行reset。没有新migration/依赖，没有改实际.env/key/常驻服务或启动试用。旧试用库 `kf_agent_e2e_trial_20261021_01` 继续按18条旧状态保护，不reset/seed，不直接把新源码重启指向它；需协调expand与旧协议Run排空。旧worker@6不支持新图片Run，后续灰度要先整体升级worker，不能混部后开放@7。

### 最终完整结果（2026-10-22本地时间）

| 范围 | 结果 | 开始 / 耗时 |
|---|---|---|
| API | 63文件，723 passed / 0 failed / 0 skipped | 15:28:48 / 133.56s |
| agent-orchestrator | 19文件，205 passed / 0 failed / 0 skipped | 15:26:02 / 13.41s |
| domain-client | 68文件，1403 passed / 0 failed / 5既有条件skipped（1408总项） | 15:26:04 / 57.93s |
| contracts | 20文件，505 passed / 0 failed / 0 skipped | 15:26:03 / 6.50s |

root、API、contracts、agent-orchestrator、domain-client TypeScript --noEmit，以及本批17文件type-aware ESLint均通过；内部retry守卫补齐后再次跑API tsc/相关完整lint和723项API，不用中间722/1的结果冒充通过。以上四包共2836 passed，非monorepo全量；定向16项已包含在API总数中。扩大回归仍观察到既有lease cleanup connection destroyed WARN，不以本次全量通过宣称历史所有偶发连接问题已根治。

## 8. 后续直接推进确认后继

1. 先做可信的确认/重试输入继承合同：当前message/fixed admission包含原run/actor/action/config身份，不得原样复制给另一action的新Run。沿用服务器原图/分析/route，不接浏览器snapshot。
2. 在同一受理事务中调用review acceptance校验，存accepted envelope/审计并CAS唯一后继、消费旧等待；旧receipt/过期child/跨scope/并发/取消/rollback/幂等都要测。不得先事务外校验再直接启动。
3. 为确认后继接@7 planner/executor/registry，向原图输入传可信visualReference和清晰的初始状态。**本批review等待不在LangGraph checkpoint里，而在Run/RunStep中**；不能假定graph有vision interrupt，也不能复用旧会话design-review来批准新图。
4. 冻结蓝图/视觉语义等其余任务的路由/提示词身份，发送派生OCR/结构也要复核管理员许可与用户同意；原图review不等于批准原生工程修改。独立蓝图确认后才调用已接好的visual semantic/compile节点和原build/delivery。
5. 再接当前RunWorkbenchView/components/runs的上传、说明同意、review读/修正/区域差异、来源卡与下载。要识别visual receipt，不能拿它发送confirm_blueprint。多图合并/冲突布局未做前继续明确拒绝多图Run。
6. 完整fake provider图片upload→review→确认→KF工程download E2E；之后另行授权真实provider/KF和还原质量。默认vision/outbound UI继续关闭、预算限制暂缓，不恢复旧POST，不把本批单图Run到等待当作整个图生工程交付。

## 9. 本批代码清单

- 新增 `apps/api/src/runs/visual-run-handler.ts`、`visual-run-flow.integration.test.ts`。
- 修改 `packages/contracts/src/visual-execution.ts`、`visual-review.ts`。
- 修改 `apps/api/src/runs/run.service.ts`、`run-store.ts`、`run-control.service.ts`、`run-execution.service.ts`、`run-execution-plan.ts`、`run-executor.ts`、`run-handler-registry.ts`、`feature-policy.ts`、`agent-worker-bootstrap.ts`、`run.module.ts`、`run-worker.module.ts`。
- 修改 `apps/api/src/vision/reference-assets.module.ts`、`visual-review.service.ts`。
- 配套本报告、master/P4/handoff/design与operations最新状态；旧报告作为历史保留。不生成用户未要求的补丁。
<!-- end -->
