<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
# T21 视觉语义计划、编译来源与快照接线

日期：2026-10-22；功能名：Agent工作台迭代。

## 当前结论与边界

本批补齐内部链路：已审核的视觉结构 → 独立视觉语义模型端口 → 现有语义编译器 → 精确 KF 组件/原生来源 → 原有签名计划与 GenerationSnapshot 同事务保存。T21 仍为 **IN_PROGRESS**；普通 Run 图尚未调用新视觉端口，也不传入视觉上下文，其 snapshot.visual 仍为 null。**这不是用户上传图片后即可生成工程的公开闭环验收。** T22 的附件/配置冻结、确认凭据、外发授权、图节点和前端尚待完成。

沿用当前 main / HEAD `94364cd9add74915c6f85af96357ee5b286faede`，保留混合 dirty；不新建 worktree、不自动提交/推送、不出补丁。涉及代码原已可读。没有改其他 KingFusion 服务，没有迁移或重启试用环境，没有收费模型或真实 KF 调用。

## 1. 模型只输出语义，不输出原生工程身份

新增严格外层合同 `kf-visual-semantic-plan/v1`：

```ts
{
  schema: "kf-visual-semantic-plan/v1",
  plan: SolutionImplementationPlan,
  bindings: Array<{ regionId: string; nodeId: string }>
}
```

内部 plan 继续使用原 SolutionImplementationPlan 合同，没有修改其 v1 含义、catalog/candidate/hash 或签名计划。模型只能把区域绑定到语义 nodeId，不能提交 nativeIds、组件文件路径或任意扩展字段。绑定必须引用真实区域/节点；省略区域不能绑定，未省略区域必须覆盖，重复 region/node 对拒绝。

`ModelPort.createVisualSolutionImplementationPlan` 是可选、显式的独立端口；缺失视觉能力不得退回文字生成伪装成功。上下文通过 `ModelPortContext.visualReference` 传入，包含 spec/hash、映射和已接受差异，不含像素/base64。视觉模型适配器严格验证上下文，再发送结构/OCR/相对框与原有语义能力知识；复用原 normalize、journey coverage、candidate 白名单校验。只发一次请求，失败不隐藏修复、不走文字 fallback。

注意：该视觉语义适配器仍使用既有 chatJson 传输，不等于完成全量共享 gateway/调用账本迁移。此前 T19 像素分析的 gateway 不被本批替换。结构与 OCR 也可能包含私密信息，不能因“不发图片”就跳过外发授权。

`validateVisualPlanningContext` 校验 specHash、映射完整性、差异目标及 capability 合法性。supported_unverified 必须有 accept-unverified，unsupported 必须有明确 omit/substitute，替代必须确为可新生成能力。**这些只是结构校验，不证明用户已经同意或拥有授权。** T22 必须从服务端冻结记录/确认凭据重建，不能接受浏览器或模型自报 verified、acknowledgement 或权限。

## 2. 编译器提供可信来源，不能猜展开 ID

新增 `compileSolutionImplementationWithProvenance` 包装现有编译入口；原 `compileSolutionImplementation` 保留。包装器复用权威 `validateSolutionControlSemanticProjection`，按实际 parent/overlay surface 对原语义节点、嵌套 repeater 和注册模块进行来源复核，不另写展开或 native 算法，不用字符串前缀推断归属。

返回冻结的 implementation 和进程内不透明 provenance handle。WeakMap 把 handle 绑定到确切 plan hash 与冻结来源记录：原 nodeId、展开 nodeId、componentId、capabilityId。伪造/序列化 handle 拒绝，跨计划重用也拒绝；checkpoint 只能保存语义计划和 bindings，不能保存 handle，恢复时必须重新可信编译。

`resolveVisualSemanticBindings` 读取该来源，按原 nodeId 和已选 capability 解析真实组件，再核对权威 materialization 的精确身份，最后复用原 sourceMap 校验生成 native GUID。一个模板/模块节点可对应多个同能力展开组件；不能把混合模块全部控件无条件绑定到同一区域。跨区域组件/native 争用仍拒绝。

`CreativeSolutionCompilerInput.visual` 是服务器内部可选输入 `{reference, bindings}`。生产 compiler factory 已支持该分支，仍走同一交互、权威物化、签名与快照事务；文字分支仍用旧编译入口。本批没有公开接受 .visual 的 API，也没有把结构校验当作执行授权。

sourceMap 仅覆盖明确绑定的视觉区域组件；完整 artifact 仍保存其他组件和语义来源，后续 T23 不得只看区域映射就删除依赖。历史无 snapshot 的工程不补造可编辑来源。

## 3. 修复视觉请求提示词超限

把真实适配器接到管理界面 golden 后，原 system+user 为 **132711 UTF-8 字节**，超过现有 128000 限制；候选 bundle JSON 为 65780 字节，blueprint 为 10206 字节，样例含 16 区域/21 项能力详情。现有详情投影已经剥离证据路径，根因主要是各候选重复的理由和限制，而不是路径未去除。

新增仅视觉端口使用的 `kf-visual-candidate-projection/v1`：重复 reasons/limitations 放入排序、唯一的 textDictionary；候选保留 id/score/knowledgeVersion 和字典引用，完整原文可无损重建，原 bundleHash、catalog/blueprint/policy 继续保留。完整原 candidate 先校验，投影不能减少授权边界。测试从实际发出的 prompt 解码字典，逐项断言与原候选完全相等。

未提高文本/HTTP 字节限制、未丢弃限制说明或减少候选来通过测试。曾测量的“只留 ID/版本”方案不是最终实现，不能拿其字节数当交付效果。最终无损投影使实际序列化请求通过原有限额。本批不宣称真实 token、缓存命中率或费用下降；文字端口默认 prompt 不变，类似大样例的文字提示词超限风险仍需后续单独测试和版本化治理。

## 4. 红绿测试与故障记录

- 编译来源新增 3 项红测：旧入口尚无可信来源时失败；最终覆盖普通 repeater、嵌套 repeater/注册模块、输出与旧编译一致、冻结数据、伪造及跨计划 handle 拒绝。初始测试误用了不存在的 fixture 名/大小写和模块单复数，按既有真实 fixture 修正，没有降低预期。
- visual constraints 新增 1 项真实 golden 来源解析测试，stub 阶段失败，验证假 handle、缺失节点与重复绑定拒绝；最终该文件 12/12。
- 视觉模型新增 3 项：真实 outgoing body 结构及候选无损投影、缺失/过期/未确认上下文请求前拒绝、原生 ID/未知区域/缺失节点严格拒绝且无文字 fallback；最终模型文件 127/127。
- 既有快照集成正例扩展为真实 DeepSeekModelPort 适配器 → 生产 compiler factory → Prisma/签名快照；只替换网络模型响应，使用真实管理界面语义 golden 和测试分析记录。接线前 snapshot.visual 为 null，红测复现；随后接入模型又暴露真实 132711 字节超限，再以无损字典修复。
- 无效绑定最初被包装为通用 CREATIVE_COMPILATION_FAILED，增加安全固定错误码白名单后返回精确诊断，不泄漏原始模型/分析内容。负例不留下第二份快照；过期分析仍拒绝。
- 一次编排器全套命令漏带显式测试库参数，入口守卫报 TEST_DATABASE_NOT_AUTHORIZED：18 文件188项通过、1套件初始化失败。该数据库套件在连接/reset 前被拦下。立即改用明确隔离库重跑，最终19文件195项通过。保留失败记录，不用首次结果报告全绿。

没有真实上传像素/真实模型质量/真实 KF runtime 的新验收；快照集成是本地模型响应 fixture，不能当作 UI 还原质量证明。

## 5. 最终验证（2026-10-22）

| 范围 | 最终结果 | 开始时间/耗时 |
|---|---|---|
| API 全套 | 60 文件，664 passed / 0 failed / 0 skipped | 10:44:02，128.98秒 |
| domain-client 全套 | 68 文件，1400 passed / 0 failed / 5 skipped（1405项） | 10:44:03，48.71秒 |
| contracts 全套 | 20 文件，505 passed / 0 failed / 0 skipped | 10:44:04，7.65秒 |
| agent-orchestrator 全套（显式隔离库） | 19 文件，195 passed / 0 failed / 0 skipped | 10:45:13，10.47秒 |

domain 的 5 项为既有缺 `/tmp/kf_ref` golden/参考页面条件跳过，未新增 skip，不视为通过。上述新增/针对性测试已包含在相应全套内，不重复累加。API 包含真实 Run 确认/构建/下载、三类 golden、12项 snapshot 与127项模型测试；既有租约连接清理 WARN 仍存在，不据此宣布历史偶发连接问题已解决。

root/API/domain tsc、相关 TS ESLint 和任务路径 whitespace 检查通过；最终代码改完后重跑 API/domain tsc 与相关 ESLint 均 exit 0。本批没有改 schema/迁移，未再次运行迁移升级；没有重跑 Web/浏览器/build-jobs 全套或真实进程故障演练，不能把上批 build68 当本批 fresh 结果。

命令使用仓库 Node24，不依赖系统 Node：

```sh
# cwd: agent-app/apps/api
COOKIE_SECURE=true TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_generation_full_20261022_0940 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run
# cwd: agent-app/packages/domain-client；contracts 在自己的包目录使用相同命令
../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --maxWorkers=1
# cwd: agent-app/packages/agent-orchestrator
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_generation_20261022_0930 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --maxWorkers=1
# cwd: agent-app
../.toolchain/node-v24.19.0-darwin-arm64/bin/node node_modules/typescript/bin/tsc --noEmit
../.toolchain/node-v24.19.0-darwin-arm64/bin/node node_modules/typescript/bin/tsc -p apps/api --noEmit
../.toolchain/node-v24.19.0-darwin-arm64/bin/node node_modules/typescript/bin/tsc -p packages/domain-client --noEmit
```

两个测试库已部署21迁移，不同库并行，同库串行；API 的 COOKIE_SECURE=true 避免本地 .env 影响安全 cookie 断言。未修改真实 .env/keys/旧5174或试用服务。源码要求21迁移；原试用库 `kf_agent_e2e_trial_20261021_01` 仍按18条旧状态对待，**不得 reset/seed，亦不得直接重启新源代码指向该库**。先协调 expand 迁移、旧 Run 排空和整体升级。LangGraph 自管理 checkpoint 表不为了 Prisma drift 而删除。

## 6. 本批文件清单

修改以下11个代码文件；部分在 Git 中仍属前批新增/未跟踪文件，不代表本批重新创建：

- `agent-app/packages/contracts/src/generation-snapshot.ts`
- `agent-app/packages/domain-client/src/solution-compile/solution-compiler.ts`
- `agent-app/packages/domain-client/src/solution-compile/solution-compiler.test.ts`
- `agent-app/packages/domain-client/src/visual/visual-plan-constraints.ts`
- `agent-app/packages/domain-client/src/visual/visual-plan-constraints.test.ts`
- `agent-app/packages/agent-orchestrator/src/model-port.ts`
- `agent-app/packages/agent-orchestrator/src/ports.ts`
- `agent-app/apps/api/src/conversations/deepseek-model.ts`
- `agent-app/apps/api/src/conversations/deepseek-model.test.ts`
- `agent-app/apps/api/src/conversations/graph-ports.ts`
- `agent-app/apps/api/src/generation/generation-snapshot.integration.test.ts`

新增本报告；同步更新3份计划：

- `docs/superpowers/plans/2026-10-20-agent-app-next-master.md`
- `docs/superpowers/plans/2026-10-20-agent-app-p4-vision.md`
- `docs/superpowers/plans/2026-10-20-agent-app-handoff.md`

## 7. 下一模型实施顺序（T22）

1. 先完整读 AGENTS、master/design、P4、handoff、本报告与 snapshot 报告；沿用当前 dirty 基线，不自动提交/推送或新建 worktree。预算继续暂缓，旧 POST messages/resume 不恢复。
2. 为 Run 附件、视觉模型路由/配置、分析来源和冻结版本写红测。多图主/补图与冲突选择必须显式，先明确现有单分析编译接口如何逐步接入，不能把多个 spec 静默覆盖。
3. 用服务端 scoped analysis 和受控 evidence 重算映射；保存不可变、精确 specHash/mapping/差异/版本的确认凭据，补 stale hash、跨租户/工程、篡改 capability/ack、重复确认与重放测试。禁止直接把浏览器/model 的 visualReference 当确认事实。
4. 加租户管理员外发许可、实际发送内容说明与用户确认；图片和派生 OCR/结构均纳入授权。等待确认时进入 WAITING_INPUT，恢复时复核当前授权与冻结配置。视觉理解确认后仍走既有 blueprint 审批，不混成一张可越权的“继续”收据。
5. 图中调用可选视觉 ModelPort，完成步持久化严格语义 wrapper/bindings；编译时从服务端确认记录构造 .visual。更新 semantic/compile memo key，包含 review/spec/mapping/binding hash，避免复用旧文字/另一视觉确认的结果。checkpoint 保存语义数据，不序列化 provenance handle。
6. 当前协议仍 run-plan@6，不能往旧执行计划/旧快照悄悄注入视觉 action。新配置/步骤/审批合同须先设计协议升级与旧任务排空/恢复兼容，再接开放入口；不以提高 feature flag 绕过未实现的配置检查。
7. 前端接上传→识别review/修正→映射差异/未验证提示→确认→Run进度→真实工程下载，增加浏览器与隔离双租户测试。交付卡持续展示未验证/替代/省略，不宣称原生运行验证。
8. 完成上述安全链路和全套回归后才考虑内部灰度 vision；后续 T23 局部修改、T24证据、真实模型/KF评测与P2发布门槛仍需单独验收。本批所有 vision/外发开关仍关闭。
<!-- end -->
