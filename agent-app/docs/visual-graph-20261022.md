<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
# T22 视觉语义图节点与既有 KF 编译链接线

日期：2026-10-22；功能名：Agent工作台迭代。接续 `visual-egress-20261022.md`。

## 1. 结论与边界

T22 仍 **IN_PROGRESS**。本批完成已有视觉语义端口和 `.visual` 编译输入之间的图节点接线，不是公开图片 Run 交付。已通过本地 provider 响应 fixture + 真实 DeepSeek 适配器、语义图节点、编译图节点、生产编译器、Prisma、签名计划和不可变快照的串联验证。区域绑定只提供 semantic nodeId；最终组件/native GUID 来源仍由既有可信编译器生成，不让模型直接写原生工程或签名制品。

现行 API `RUN_PLAN_VERSION` **仍是 `run-plan@6`**；视觉节点只预留 `VISUAL_RUN_PLAN_VERSION = run-plan@7`。这不是发布协议升级：RunService/Store 仍拒绝视觉动作及附件，执行器在 step cache 前拒绝非现行协议；尚不能通过公共入口执行 @7 Run。普通文字 Run 显式清除三个视觉 checkpoint 字段。所有 vision/外发 UI 开关保持关闭，旧 POST 执行接口不恢复。

`AcceptedVisualPlanningInput` 仅为服务端内部结构及内容完整性合同，不能作为浏览器输入、用户许可或蓝图批准。确认服务返回此结构，但本批仍未保存用户确认/创建唯一后继/消费 WAITING_INPUT；正式启用前必须在受理事务中校验签名 review 并冻结服务器事实、存确认审计并 CAS 后继。不能自行计算 hash 后就当作可信确认或外发授权。

## 2. 数据与节点

### 内部严格输入

```ts
type AcceptedVisualPlanningInput = {
  schema: "kf-accepted-visual-planning/v1";
  reviewHash: string;
  confirmationHash: string; // canonicalServerHash({ reviewHash, reference })
  reference: VisualPlanningContext;
};
```

新 `validateAcceptedVisualPlanningInput` 先严格 schema，再沿用 `validateVisualPlanningContext` 校验 analysis specHash、完整映射、未知区域、未验证差异 acknowledgement/明确 omit，最后校验 confirmationHash。重算外层 hash 不能绕过内层 spec 或 acknowledgement。没有新分析、模型输出或权限来源。

图状态新增可选且可为 null 的 `acceptedVisualPlanningInput`、`visualSemanticPlan`、`visualPlanConfirmationHash`；null 用于明确清除旧 checkpoint。普通 `buildRunGraphInput` 不接收这些来源字段，始终传三个 null；同会话开始文字 Run 不继承旧图确认。

### 语义规划节点

- 发现任何视觉状态，要求 @7 且 accepted envelope 有效；缺确认但残留旧 wrapper/stamp 也失败，不暗中走文字路径。
- 在读取 asset catalog/调用模型之前校验视觉输入与 visual ModelPort 配置；只有 visual 方法也可执行，不要求文字 primary/repair 方法。
- 继续复用当前蓝图 revision/hash、candidate bundle/hash、受限资产目录等既有校验；视觉 review 不替代蓝图确认。
- 调独立 `createVisualSolutionImplementationPlan` 一次，严格 parse wrapper，复核原候选与区域→语义节点覆盖/存在/重复/omit；保存 wrapper 与对应 confirmationHash。
- 视觉输出错误返回 INVALID_MODEL_OUTPUT；不隐藏修复、重试或降级为文字生成。文字路径原有一次局部修复行为不变。
- 失败清除视觉 wrapper/stamp，防止遗留结果被误用。错误不写 step memo。

### 编译节点

- 在 compiler 或客户消息持久化前复核 @7、accepted envelope、strict wrapper、stamp、一致的 semantic plan/hash、区域绑定；状态撕裂返回 VISUAL_PLANNING_INPUT_INVALID，清除构建授权，不追加消息。
- 合法输入仅在原 compiler 参数上追加 `{visual:{reference,bindings}}`，不改变旧语义计划/候选/蓝图确认及签名编译校验。
- 真实 compiler 仍复核当前 Run scope/fence/base/lease，并按既有可信来源解析 materialization，签名计划与 GenerationSnapshot 同事务写入。无图时不追加 visual 参数。

## 3. 缓存与兼容性

- semantic memo 的视觉键加入完整 accepted envelope；同一 Run、同一确认复用，图 spec/acknowledgement/review/confirmation 变化不共用模型输出。
- compile memo 的视觉键加入完整 accepted envelope、完整 wrapper 和 stamp；即使语义计划 hash 未变，只改区域绑定也不能沿用旧编译结果。
- 协议继续参与 step hash。文字输入不增加 null 或空视觉键，保持原文字 memo 输入形状。现有 @6 缓存不被当成 @7 输出。
- orphan wrapper/stamp 在无 accepted envelope 时也进入隔离键并失败，不能命中文字成功缓存。
- 此处只证明节点级恢复/幂等隔离，不证明 DeepSeek 实际前缀缓存命中率、节省 token/费用或完整 gateway 迁移；视觉语义适配器仍沿用既有 chatJson。后续接正式 Run 时，派生 OCR/结构发送也必须复核管理员策略与用户发送同意，不能因没有像素就绕过外发边界。

## 4. 红绿测试及中间问题

1. 首轮 semantic 节点18项：旧13项通过、新5项失败，复现 visual-only 被要求文字端口、缺视觉方法降级、协议/确认忽略、wrapper 无校验、缓存未隔离。
2. compile 节点14项：旧11项通过、新3项失败，复现未传 visual、状态撕裂仍授权、确认变化复用旧计划。普通 Run 输入5项中新增清除用例失败。
3. 接线后上述测试及原 state 测试全部通过。补 orphan checkpoint 红测：19项中18通过/1失败，确实误走文字路径；加显式拒绝与隔离键后通过。另验证只改 wrapper binding 不会命中之前成功编译 memo。
4. 真实串联测试初次因测试相对 import 多一层而加载失败，review12项通过；修正测试路径并保留类型检查后，snapshot12 + review12 全部通过。没有削弱生产断言或跳过测试。
5. TypeScript 最初发现测试读取 unknown update、缺必需状态字段断言和错误路径；用合同 parse 读取 wrapper/plan、明确测试 fixture 的 unknown 转换修正。ESLint 首轮两处文字分支不必要的 non-null assertion，去除后再检查。视觉分支仍在运行时 preflight 后调用独立方法。
6. 新 domain 完整性测试2项验证 strict 外层、review/confirmation 篡改、重算外层 hash 后缺 ack/旧 specHash 仍拒绝；state 测试验证 null 清除可透过实际 StateSchema，伪 accepted 输入拒绝。

原有断言保留，没有新增 skip、放宽 schema、抬高超时或收费外发。测试响应为本地 fetch fixture，不是模型真的看图；串联用例只覆盖一个标题区域，不是多区域/像素级质量验收。原 snapshot 后续的篡改分析、非法绑定无第二份快照断言继续保留。

## 5. 复验命令与数据库

使用 `.toolchain/node-v24.19.0-darwin-arm64/bin/node`，不使用系统 ICU 损坏的 Node。

```sh
# cwd: agent-app/apps/api
COOKIE_SECURE=true TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_generation_full_20261022_0940 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run
# cwd: agent-app/packages/agent-orchestrator；不同隔离库
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_generation_20261022_0930 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --maxWorkers=1
# cwd: agent-app/packages/domain-client 或 packages/contracts
../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --maxWorkers=1
# cwd: agent-app；分别对 .、apps/api、packages/agent-orchestrator、packages/domain-client
../.toolchain/node-v24.19.0-darwin-arm64/bin/node node_modules/typescript/bin/tsc -p . --noEmit
```

针对性用例已计入各包全量，不重复累加。只在两个既有测试库运行，21条 migration 不变；无新数据库迁移/依赖/实际 key/.env/常驻进程操作。保留当前 main/混合 dirty，不自动提交/推送或生成补丁。

旧试用库 `kf_agent_e2e_trial_20261021_01` 按18条旧状态继续保护，不 reset/seed，不直接将新21迁移源码重启指向它。升级需单独协调 expand 和旧 Run 排空。本批未重新核实试用进程可达性，不将历史 URL 当作本批已启动服务。

### 最终完整结果

| 范围 | 结果 | 开始时间（本地）/耗时 |
|---|---|---|
| API | 61文件，689 passed / 0 failed / 0 skipped | 14:38:42 / 131.49s |
| agent-orchestrator | 19文件，205 passed / 0 failed / 0 skipped | 14:39:54 / 10.36s |
| domain-client | 68文件，1403 passed / 0 failed / 5既有条件 skipped（共1408） | 14:38:44 / 54.09s |
| contracts | 20文件，505 passed / 0 failed / 0 skipped | 14:38:45 / 7.05s |

root/API/orchestrator/domain TypeScript --noEmit 与本批14个代码/测试文件的 type-aware ESLint 通过。首轮静态问题见上文，最终去除两处多余断言后 ESLint exit0，并重新完成图全量205项。API仍有既有 lease cleanup connection destroyed WARN；本次全量通过不证明历史偶发连接问题全部解决。领域层5项跳过仍因既有本地参考工程条件，不能当通过。

没有跑新的 Web/浏览器、build-jobs 全套、真实 provider/KF、Windows 或进程 kill 演练。本批真实编译器与数据库串联包含在 snapshot12项/API689项内，不另加成2802之外的结果。

## 6. 后续接手顺序

1. 完整 Run 准入：附件服务端归属/数量与主补图关系、来源/派生 hash、模型路由配置实体/提示词版本及用户发送同意冻结。保留跨租户、过期、基线和角色控制，OCR/结构同受外发策略约束。
2. 将 @7 从“节点预留”升级为完整可执行协议：配置合同、RunService/Store、executor/handler、graph checkpoint/stop 及 prepare 已暂停时的结束适配一起完成并测试；不要只改 RUN_PLAN_VERSION 或打开 flag。
3. 在受理事务中调用 review 验证，持久化 accepted envelope+审计并 CAS 唯一后继/消费旧等待；错误回滚不消耗等待，并发/幂等/旧 receipt/过期 child/漂移/fence/取消必须测。后继从可信持久输入恢复，不能信任浏览器传来的 envelope。
4. 接 load→分析→映射→review等待→确认后继→蓝图独立确认→本批 semantic/compile 节点→原 build/delivery；文字路径不经过视觉分析，discuss/plan 不误构建。
5. 复用现有 `components/runs` 与 `RunWorkbenchView`，接上传、发送说明、区域/低置信 review、版本化修正、差异接受、来源卡/下载；替代控件须新的可见 review，不能自动 substitute。
6. 完整 fake provider E2E 走真实图片上传/派生→review→确认→原生工程下载，检查原参考图不打包、受批准素材正确打包；真实 provider/KF/1:1质量需单独授权与实际测量，不能用本批 fixture 替代。

预算限制按维护者要求暂缓；缓存/用量观测仍需完成。P2真实进程故障、代理/多副本长期连接与发布升级门槛、T23受限局部编辑、T26实际质量验收尚未借本批结案。

## 7. 本批代码文件清单

- `packages/contracts/src/visual-review.ts`
- `packages/domain-client/src/visual/visual-plan-constraints.ts`、对应 `.test.ts`
- `packages/agent-orchestrator/src/state.ts`、对应 `.test.ts`
- `packages/agent-orchestrator/src/nodes/solution-implementation-plan.ts`、对应 `.test.ts`
- `packages/agent-orchestrator/src/nodes/compile-creative-solution.ts`、对应 `.test.ts`
- `apps/api/src/runs/run-graph-input.ts`、对应 `.test.ts`
- `apps/api/src/vision/visual-review.service.ts`、`visual-review.integration.test.ts`
- `apps/api/src/generation/generation-snapshot.integration.test.ts`

文档：本报告、master、P4、handoff 与 design 的最新状态补充；前批报告保留为历史，不回写旧测试数字。
<!-- end -->
