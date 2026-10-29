<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
# T22 结构化本地点击反馈闭环（2026-10-23）

## 1. 交付边界

从上批“未验证补充说明”继续，本批增加一个真正可校验、可编译的交互要求：已保存的操作按钮区域可以明确选择“点击 → 本地消息反馈”，填写反馈文字和级别。要求进入原签名修订/重新确认/独立蓝图流程；模型必须返回对应按钮的实际语义事件与动作，原生编译后再次核验实际 onClick/show-feedback，原客户端工程包包含编译器生成的 ShowMessage。

**只实现本地消息反馈，不代表真实数据源绑定、任意交互或 KF 运行验收完成。** 当前仅支持 button，不自动替代其他组件；不新增 HTTP、数据库、生产 KF 变量连接、密钥、任意脚本或外部工具权限。production vision 仍关闭，T22 和整体计划仍 IN_PROGRESS，预算限制暂缓。缺真实数据源目录/绑定合同、替代/可信 visual retry、T17/T23、T24–T27 与系统发布/真实质量验收。

视觉/内容/交互选择：延续现有工作台的克制表单与原图区域列表；展示原未知线索、说明、执行要求和风险；主操作仍保存后重新确认。使用 frontend-skill，增加原生 details 折叠选项，无新卡片/库/装饰动画，不改变现有导航和生成入口。

## 2. 合同与修订

VisualRegion 可选 `interactionRequirement={kind:"click-feedback",message:string,level:"info"|"success"|"warning"|"error"}`。message trim 后 1–400 字，复用 action-graph 的 semantic-text 安全规则，拒绝代码/网络文本和未知额外字段。完整 VisualReferenceSpec 仅允许 role=action 持有该字段；角色变化不能悄悄丢失要求，必须主动清除或保留 action。字段不是 runtime verified 或模型权限声明，仍需差异接受和独立蓝图批准。

原 revision.regions 可编辑；缺字段保持旧要求/旧请求形状，显式 null 删除可选字段。新区先保存取得服务端 ID，再配置交互；additions 不接交互要求、身份/native/置信度等字段。无新 HTTP 入口、schema 迁移或依赖。

沿用 immutable analysis child、原 expiresAt、specHash、签名 history/当前 CAS/新 receipt、原 actor/tenant/gates/base/外发同意、幂等和审计事务。审计增加 interactionChangedCount，不复制反馈文字。旧版本/旧回执不能接受；相同请求重放、不同正文冲突、并发修订/旧接受竞争和后置审计失败回滚复用原闭环。

说明字段 clarifications 始终只是未验证参考，不会自动转为该结构化要求；清除执行要求也不清原 interactionHint、uncertainties、来源或置信度。原 interactionHint 缺结构化旧 requirements 时仍 fail-closed；本批字段不自动解决截图中的未知交互，带原未知 hint 的区域仍可能 unsupported，需后续明确解决合同，不准清空原始证据绕过。

## 3. 匹配、模型输出与原生闭环

1. 映射仅允许真实 eligible button 候选，要求 click 能力并在证据匹配中包含 click；纯静态报告不作为交互证据。有要求时即使已有静态 verified 也不标原生行为 verified，必须重新接受未验证风险。原说明降级与未知 hint 守卫保留。
2. 专用视觉语义规则明确该字段的精确约束，原普通文本 prompt 不改。要求作为已确认参考 JSON 进入独立蓝图和语义任务；只是受限语义约束，不赋予截图/说明执行权限。
3. `validateVisualSemanticBindings` 在既有模型输出验证与编译器 provenance 解析两处复用：未省略区域必须只绑定一个 direct button control；唯一 eventBinding 必须为 click，唯一直接 action 必须为 show-feedback，message/level 精确相等；禁止条件、前置依赖、依赖该动作的后继、额外动作、其他事件、脚本、其他节点/模块替代。显式 omit 才允许本轮不生成此按钮和交互。
4. `buildVisualSourceMap`（包括快照写入/读取重建）复核绑定 native component 恰好一个 button，其精确 owner 的唯一事件为 onClick/event，无脚本模块、唯一 native action 为同 owner 的 show-feedback，文字/级别一致。不能靠语义计划中存在一个无关反馈动作通过。原 native/projection/hash/签名链不放宽。
5. 工程输出仍由原受限交互编译器生成，禁止模型写原生字段/脚本。现有 Cookie/Origin/PG 图/冻结配置/工程 Run/快照/BuildExecutor/租户和 actor 绑定一次性下载均不另建旁路。

新视觉 prompt 规则会改变其冻结合同 hash；旧严格 spec worker 也不能读取新字段。即使都叫 run-plan@7，也不能据此混部或只开 flag，仍需排空整体升级。已有历史只读/已提交 job 跟踪边界不因此全局放宽。

## 4. 测试与中间错误

- 先加 spec、mapper、semantic validator、UI 测试，首次有效定向运行 **16 failed / 62 passed**（14:45:32 / 4.14s），未知 interactionRequirement 与缺 UI 选项如预期暴露。更早一次从仓库父目录指定 workspace 启动失败“No projects were found”，未运行任何测试；改在 agent-app cwd 执行，不改配置。
- 接线后原生动作要求 journeyStepRefs，测试 fixture 缺字段先红；补合法旅程引用后又被正确拒绝“标题区域的 button 不是候选”。改用 fixture 原有真实 button 候选/所属区域，不改候选校验或将文本控件硬改成按钮。另有一次测试误读 implementation.controls，修为既有 pages/native/controls 结构；不改编译器。
- spec/revision 合同新增 2 项；mapper 新增 1 项；semantic/source-map 新增 14 项，覆盖精确正例、缺动作/改文案/改级别/错事件/条件/依赖/后继/额外动作/脚本/错控件/多节点、显式省略和原生事件/文字/phase/脚本拒绝。定向 5 文件 **94/94**（14:51:24 / 5.56s，含该时点原测试）；后续工作台再新增 1 项。
- API 新增 11 项非浏览器：保存/重放/冲突/清空/旧回执/原数据/TTL/审计去正文一项；role/blank/oversized/script/native/network 六项；同/不同请求/旧接受竞争三项；审计故障回滚一项。第一次过滤运行 **8/8，253 未选**（14:48:35 / 7.71s），过滤未选不当全量，三项竞争由最终完整执行验证。
- 保留原 static Chrome 用例，参数化新增 click-feedback 版本，不降低旧静态断言：手机上传/授权/刷新恢复/说明编辑/增删/层级/删除→明确 action/反馈文字→新签名回执/重新选择→独立蓝图/新增真实旅程步骤→语义按钮事件→native/sign/snapshot/BuildExecutor/下载字节 hash/一次性拒绝；同时核对蓝图与语义实际 provider user 内容带结构化要求。
- 浏览器首次 static 通过、feedback 失败：provider mock 错把二次 JSON.stringify 后的转义字段当原 user JSON 检查，测试断言异常被 transport 归为 MODEL_TRANSIENT。修正检查实际 messages[].content，不改服务错误处理或放宽约束。随后已走到下载但测试只搜原生页面顶层 objects，未遍历布局 insiderObjects；实查包内已有准确 ShowMessage，修正测试按原 native 嵌套结构递归查精确 owner，不改产品序列化。
- 最终定向 feedback Chrome **1/1，261 未选**（14:54:29 / 17.47s），证据 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-visual-browser-YmwoQm`。直接查看 reference-mobile-interaction-edit.png；实际下载包安全解包后按 sourceMap/materialization 精确 owner 找到唯一按钮 onClick，脚本字节包含 `ShowMessage({"message":"已收到本地操作","type":"info"});`。`.gz` 是现有 KF ZIP 容器，不称为 gzip；不是 KF Windows 打开或执行验收。
- API tsc 曾发现测试误读 getWaitingReview 的 reference 路径，改为 content.reference；Web vue-tsc 首次命令误指根 node_modules（MODULE_NOT_FOUND，未执行类型检查），改用 apps/web 自身依赖。修复后 root/API tsc、Web vue-tsc、13 TS type-aware ESLint exit 0；不关检查。
- Web 全量 **26 文件 172/172**（14:53:51 / 12.96s），contracts **21 文件 523/523**（14:54:30 / 6.13s）。Web build **180 modules**，382.35 kB JS / gzip 130.94 kB，60.53 kB CSS，通过；因浏览器侧复用 action-graph 文本安全校验比前批 JS 356.91 kB 增加约 25.44 kB，无 Node polyfill/新依赖。最终 API 与顺序 domain 另记 §6。

## 5. 文件与环境

14 份代码/测试：contracts 的 visual-reference.ts/test、visual-review-revision.ts/test；domain-client/visual 的 region-mapping.ts/test、visual-plan-constraints.ts/test；API vision/visual-review.service.ts、conversations/deepseek-model.ts、runs/visual-run-flow.integration.test.ts；Web components/runs/VisualReferenceReview.vue/test、views/RunWorkbenchVisual.test.ts。配套本报告与 master/handoff/P4/design §10/operations。无压缩源码修改，均沿既有可读代码与统一日期注释；保留 mixed dirty，不 commit/push/worktree/子代理或生成未要求的补丁。

仅使用保留的 `kf_agent_test_review_flow_20261023_1245`，测试前只读确认精确库名、21 条完成迁移、零其他连接，沿既有安全守卫 reset；禁止同库并发 reset。受保护旧试用 `kf_agent_e2e_trial_20261021_01` 的 18 迁移/业务数据、真实 .env/key/常驻服务均未动。未安装依赖、执行迁移、收费/真实 provider/KF 请求。测试均禁用 tracing，Chrome 仅本地 provider fixture、staged 测试组合根策略，不据此打开 production resolver。

API cwd 完整命令：

```sh
LANGCHAIN_TRACING_V2=false LANGSMITH_TRACING=false KF_VISUAL_BROWSER_TEST=1 COOKIE_SECURE=true TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_review_flow_20261023_1245 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --reporter=dot
```

domain-client cwd 串行命令：

```sh
LANGCHAIN_TRACING_V2=false LANGSMITH_TRACING=false ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --maxWorkers=1 --no-file-parallelism --reporter=dot
```

## 6. 最终完整验收

- API **64 文件 975/975、零 skip**（14:55:20 / 288.82s），含完整 **262 项 visual-run-flow**（原 250 + 本批 12）和两项真实 Chrome。static 证据 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-visual-browser-uQtP91`；feedback 证据 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-visual-browser-NJQtnD`，保留手机截图/实际 client-project.gz 和安全解包目录。真实 provider/KF 未调用。
- 完整 API 仍出现既有 lease cleanup WARN，不宣称本批修复其根因或系统恢复/资源专项已验。11 项非浏览器新增（含三种竞争）及新 feedback 浏览器均实际执行，无 skip/retry/timeout 放宽。
- API 完成后按原串行配置复验 domain：**68 文件全通过，1419 passed / 5 原有 skipped**（15:00:29 / 44.04s），没有调高 timeout、加 retry、改 skip 或放宽旧断言。此轮没有上批默认并行资源超时；不宣称上批超时根因已修复。
- 本批四包总计 **3089 passed / 5 原有 skipped**：API 975、domain 1419、Web 172、contracts 523。其他包未独立全量复验，不把该计数称为全仓通过。root/API tsc、Web vue-tsc、13 TS type-aware ESLint、Web build 均通过。
- 测试后只读确认原隔离库仍 21 条完成迁移、零其他连接；库/证据保留，未操作受保护试用环境。scoped tracked `git diff --check` exit 0，本批新增/未跟踪代码及报告的末尾空白扫描无匹配；原 mixed dirty 保留，不纳入其他任务交付。

## 7. 下一模型接手

先完整读本报告与 design §3/§10，再按 handoff 当前状态。不要重复上传到下载、区域增删/层级/说明/本地反馈基础接线。下一个交互要以组件目录和确定性编译器证据为限，明确处理原未知 hint；不能泛化 click-feedback 为任意脚本或网络事件。真实数据绑定先设计服务器批准的数据源/可读字段/类型/作用域/只读执行/凭据驻留/撤权/快照与 mock/真实明确分级，没有源和权限时不得编造已连接。然后替代/可信 visual retry、T17/T23，最后 T24–T27 的静态/原生质量/成本和发布。

预算限制仍按用户要求暂缓；短 lease/偶发 404/cleanup WARN、OS kill/restart、资源、全局调度、代理、多副本、升级回退与真实 provider/KF/Windows/1:1 均不因本轮绿测宣称验过。生产视觉仍关闭，整体计划未完成。
<!-- end -->
