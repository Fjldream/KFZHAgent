<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
# 静态观察旅程（2026-10-23）

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
后续有界 mock 重复实例支持已接通，优先看 `visual-repeater-observation-20261023.md`。共享投影复用原编译 provenance 规则，真实字段实例/原生父链及文字再证明，新增两个实例的实际 Chrome 包内核对；最新冻结 semantic@4、blueprint@4，仍需排空整体升级。下文“不支持重复模板”与 semantic@2 是上轮静态切片的历史边界，原负例与测试结果保留。
<!-- end -->

## 实施合同

真实能源 UI 的工程响应已保存为负例：蓝图的阅读步骤被旧规则强制要求 action，不能通过伪造点击、删掉旅程或放开交互覆盖来解决。

- 蓝图步骤可显式声明 `kind: observe | interact`。缺字段保持旧 JSON/哈希形状与旧 interact 语义，不按动词猜测。
- observe 必须声明 1–12 项去重的 `expectedTexts`（每项原有业务文字上限 600 字）；interact/旧步骤禁止该字段。审批界面必须展示类型和期望文字，新内容仍需独立审批。
- observe 不允许任何 action.journeyStepRefs 冒充覆盖。规划阶段只接受相同页面、区域下普通布局中 text/richtext/button 的精确静态文字；不接受模块、重复模板、tab 内容、浮层、动态数据、富文本标记或样式隐藏。
- 原生交互编译阶段再核对语义来源、页面/区域、真实 content/nativeProperties.text、非零且页面内几何、父链样式与布局。无法证明的隐藏、动态/模板路径保持拒绝。现有 materialization/快照精确投影继续封口，不新增模型提供的“验证通过”字段。
- 该证明是受限静态内容/结构证明，不是浏览器像素、遮挡、文本排版完整性或 KF 运行验收；本期不自动放宽至滚动屏外内容、表格、输入值或业务数据。
- interact 保持原真实 trigger 所属、唯一闭包与可观察结果验证。自动目标页动作映射不得覆盖 observe。
- 更改冻结蓝图/语义 prompt 版本，必须排空后整体升级，不与旧 worker 混部。生产视觉入口继续关闭。

## 验证顺序

1. 合同负例（空/重复/多余 expectedTexts、非法 kind、旧步骤不改变哈希）。
2. 共享语义覆盖与原生覆盖测试（错文字、错页面/区域、隐藏/动态/模板、冒充动作；旧交互仍拒绝无动作）。
3. 以独立的新审批蓝图离线回放真实响应，原始 live-negative 证据不变。
4. 分层回归通过后才进行有上限的真实模型调用；有效包出现后再安排隔离 KF 导入，不覆盖现有工程。

## 已实施的边界

1. `BlueprintJourneyStepSchema` 为严格联合；旧缺字段步骤原样保留，observe 要求去重非空的 expectedTexts，其他类型禁止该字段。两种类型都保持原 page/region 引用与实现数据禁入。
2. `validateObservationJourneys` 是共享、无 IO 的受限静态证明。仅从普通语义布局下精确对应的 text/richtext/button 字面内容取证；不把区域标题、任意 mockData 值或模板字段当成已经显示。样式透明度低于 0.1、truncate、advanced 声明、透明文字或尚未审核的函数式颜色均不能作证（即使其中某种函数式颜色实际不透明，也先拒绝，不声称完整颜色可读性算法）。
3. 原生第二门槛要求真实 id/sourceSolutionNodeId、page/region、capability、content 和 nativeProperties.text 一致；geometry 在页面内且父链包含子节点；父链必须与语义普通布局路径一致，无动态绑定、重复实例、浮层或 tab。样式检查覆盖默认文字色、role、控件声明和 normal 编译片段，native visible/runVisible=false 同样拒绝。
4. API 的 text/visual 语义输出共用覆盖校验；自动目标页交互补全跳过 observe。领域编译仍执行旧交互闭包验证；新增失败码 `JOURNEY_OBSERVATION_UNPROVEN` / `JOURNEY_OBSERVATION_ACTION_REFERENCE`，均不可作为“可恢复缺失交互”忽略。
5. `CreativeBuildArtifactSchema` 再核对观察证明并拒绝 action 冒充；原有签名、源映射、exact materialization projection、snapshot 校验保持，不增加模型自行填写的成功证据。
6. 审批卡展示每项旅程类型和 expectedTexts；前端解析拒绝隐式观察、非法类型、空/重复期望文字。文本蓝图 prompt 同样支持明确类型，视觉冻结协议升为 `visual-blueprint@3` / `visual-semantic@2`。不是同一 run-plan@7 就能混部，必须排空旧视觉任务/worker，重新创建和独立确认。

## 已证实仍缺的内容

- 原始 `live-negative/` 五份证据没有改写。旧蓝图仍按旧规则被拒绝；针对标题的聚焦单元蓝图通过，不冒充整张能源图通过。
- 真实响应的 KPI、设备、摘要值位于 `repeater-field` 模板。当前显式保守拒绝，不自动改成字面量、不把模板说明当显示证明。下一切片应针对**已确认的有界 mock 数据**，复用现有确定性重复展开与真实 provenance，证明每个期望值确实物化为正确页/区域/实例的可读文本；不能扩大到业务源、任意对象字符串化或模型自报 native ID。
- 聚焦标题的额外离线 native-compile 检查还发现原响应 `node-nav-selected` 的 button 不在 `energy-overview/app-sidebar` 候选中，精确错误 `SOLUTION_PLAN_CANDIDATE_MISMATCH`。保留拦截；应重新按真实候选生成/明确修复计划，不扩大候选或暗中把业务控件省略。
- 没有本轮真实能源工程包、KF 导入运行或像素一致结论。生产 vision 关闭，真实业务数据源继续暂缓。完成受限静态观察合同不等于 T22 或总计划完成。

## 验证记录

- 初始合同红测：新 kind/expectedTexts 被旧严格 schema 拒绝；领域红测显示静态步骤仍触发 JOURNEY_STEP_UNCOVERED，之后修复。页面越界已有结构门槛提前拒绝，测试保留该拒绝而非要求进入更晚的观察错误。
- API 冒充动作负例最初先被“孤立动作不可达”拒绝；将测试动作绑定真实按钮后精确证明观察引用门槛。未放宽产品 schema。
- 新 Chrome observe 场景第一轮已经生成并下载包，但测试错误读取 snapshot.creativeArtifact 导致失败；修正为真实 snapshot.artifact。产品合同未为测试放宽，最终完整回归结果在下面追加。
- 全部付费模型调用在本轮回归显式禁用；无远端 KF 请求/变更，无实际 .env、试用库、迁移、依赖或 Git 提交操作。只使用原独立测试库 `kf_agent_test_review_flow_20261023_1245`；运行前后均核实21完成迁移、0其他连接。

最终验证（不是整个 monorepo 全部包，也不是一次真实模型成功）：

| 套件 | 结果 | 本地时间/时长 |
| --- | --- | --- |
| 完整 API（含4种 Chrome） | 67文件，1003/1003，零 skip | 17:34:16 / 301.85s |
| domain-client 串行全量 | 68文件，1446 passed / 5原有 skipped | 17:37:51 / 48.05s |
| contracts 全量 | 21文件，536/536 | 17:37:52 / 1.95s |
| Web 全量 | 26文件，183/183 | 17:25:39 / 4.99s |

四包合计3168 passed、5原有 skipped，不重复加上定向重跑。最后补充 native visible/runVisible/default文字色保守校验后，domain/contracts已全量验证，observe Chrome 又独立补跑通过：17:39:42 / 16.32s，1 passed / 275名称筛选未执行；不把这些未执行当成功。root/API tsc、Web vue-tsc、19份 TS 类型感知 ESLint 均通过；Web Vite build 180模块，JS385.33kB/gzip131.85kB、CSS60.53kB。原 lease cleanup WARN 仍出现，不声称系统级根因已消除。

完整回归的4种 Chrome 证据目录（统一前缀 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-visual-browser-`）：static=`8nIKMT`、click-feedback=`FYhMWc`、workspace-data=`p34YQN`、observe=`tzNLWM`。最终补跑 observe=`tb3jzO`，包含实际 `client-project.gz`、解包目录与 `delivery-desktop.png`。测试先在页面确认“应看到的文字：知序组织”，独立确认蓝图后经过真实编译/签名/快照/BuildExecutor，再核对下载文件 SHA、sourceMap 精确 owner、快照内 kind/expectedTexts 与解包后对应原生 richtext.text=`知序组织`；下载 URL 二次访问401，页面无 JS error。模型响应是本地 fixture，未向 KF 部署，不能泛化为能源图真实模型或像素一致验收。

## 修改清单（本切片）

代码/测试（19 TS + 1 Vue）：

- contracts：`solution-blueprint.ts` / `.test.ts`、`observation-journeys.ts`（新增）、`index.ts`、`creative-build-artifact.ts` / `.test.ts`、`visual-review.ts`、`visual-blueprint-authority.ts`。
- domain-client：`interaction/interaction-compiler.ts` / `.test.ts`。
- API：`conversations/deepseek-model.ts` / `.test.ts`、`conversations/observation-journeys.test.ts`（新增）、`vision/visual-blueprint-request.ts` / `.test.ts`、`vision/visual-semantic-request.ts`、`runs/visual-run-flow.integration.test.ts`。
- Web：`types.ts`、`components/runs/MessageBubble.vue` / `.test.ts`。
- 配套文档：本报告、前轮真实模型报告的当前状态链接、operations、master、P4、handoff、design §10。仅涉及 Agent 及文档，未修改其他服务。

## 复现命令

Node 使用仓库 `.toolchain/node-v24.19.0-darwin-arm64/bin/node`；不要使用当前系统损坏的 Node。普通回归不加载含真实密钥的 .env。

从 `agent-app/apps/api` 运行（仅已核实的隔离测试库）：

```sh
LANGCHAIN_TRACING_V2=false LANGSMITH_TRACING=false KF_LIVE_VISUAL_ACCEPTANCE=disabled KF_VISUAL_BROWSER_TEST=1 COOKIE_SECURE=true TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_review_flow_20261023_1245 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --reporter=dot
```

API 或任何会 reset 此库的套件不可并发。需要只重跑 observe Chrome 时追加 `src/runs/visual-run-flow.integration.test.ts -t 'native package download \(observe\)'`；名称筛选导致的未执行不计作通过。领域包用同相对 Node 路径执行 `../../node_modules/vitest/vitest.mjs run --fileParallelism=false --reporter=dot`；contracts/Web 用各自包 cwd 执行 Vitest。

## 下一模型的执行顺序

1. 先按根 AGENTS/设计 §3 保留脏工作区，不重置、提交或替换现有试用环境。本文的旧负例和合同测试先跑，不能把无 kind 的历史已签名步骤补成 observe。
2. 有界 mock 重复观察先设计/红测。优先复用现有重复展开、语义投影与不透明 provenance handle；不要另写一份 node/native ID 猜测算法。对 key 重复/越界、错误字段/记录、嵌套别名、假数据字符串化、错误实例/页/区域、隐藏/屏外、原生文字被篡改、表格/模块冒充都保留负例。初版可明确拒绝尚不能证明的嵌套情况，而非偷偷扩大业务源能力。
3. 再验证真实候选包（包括 sourceBlueprintPageId/regionIds 与候选本身）。原响应静态 sidebar button 被拒绝是正确安全门槛；修复策略只能在当前冻结模型策略/明确可执行的语义修复流程内重新生成，不能自己修改已签名 Run 或暗增按钮候选。
4. 离线严格编译/交互/源映射/签名/物化回归通过后，才执行已授权的真实能源图测试：固定原图 SHA 与官方 endpoint、最多3物理调用、无自动重试，密钥只读原已忽略配置，不输出 reasoning/headers/base64/秘密。新协议重新走识图确认/独立蓝图，不借旧回执复用修改后的蓝图。
5. 真正有新包后再用 KF 443 做隔离新测试工程导入/运行，不覆盖当前业务工程、不重启服务。浏览器证书问题使用合适的隔离测试访问方式；不关全局 TLS 校验或修改系统信任。若缺少真实权限/接口选择及时与用户沟通。
6. 对照原能源 UI 图做实际截图/可读性/交互/还原差异检查，分清生成、包内校验、KF 导入、运行、视觉一致各等级。未满足时不打开生产 vision、不把 T22/T17/T23/T24–T27 标完成。
<!-- end -->
