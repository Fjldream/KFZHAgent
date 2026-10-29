<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
# 有界工程增量修复与独立能力/样式诊断：2026-10-26

当前源码 **visual-blueprint@8 / blueprint-repair@2 / visual-semantic@17 / semantic-repair@6**。本切片解决“一次修复重写整图，修好拓扑却改坏原合法样式”与“孤儿错误遮住独立能力/原生样式错误”。结构可识别的草稿采用严格delta，合并后仍走原完整校验；坏JSON/外壳/身份不明确才使用一次完整graph重写，模型不能自行切换协议。

真实能源图工程阶段已正确输出三项delta，修复输出445token、既有样式未重写，设备布局已修复；但mockData中的技术占位键原样保留，最终仍被拒绝。**无本轮合格能源包、BuildJob、KF运行或1:1结论；T22/总体IN_PROGRESS。** 预算与业务源继续暂缓，production vision关闭，实际.env、受保护18迁移试用库、旧服务和KF未改，无迁移/依赖。接手先读本报告与唯一design最新补充，再读visual-semantic-completeness-20261026.md及前序历史。

## 1. 严格delta合同与作用域

新增packages/contracts/src/visual-semantic-delta.ts。初次模型输出仍为kf-visual-semantic-graph/v1，内部标准结果仍为kf-visual-semantic-plan/v1。服务器仅在compact草稿≤65536 UTF-8 bytes、原graph外壳可解析、节点ID唯一、roleStyles是≤64项合法且唯一role身份列表时选择kf-visual-semantic-graph-delta/v1；这只证明可寻址，不批准语义、拓扑或样式。

delta必须绑定服务端canonicalServerHash(originalDraft)；最多16个操作、合计128个实体/字段修改、delta≤65536bytes、合并图≤131072bytes。原1000节点、12层树、负载深度48及模型请求128000bytes/响应等上限保持。严格操作表：

| op | 显式载荷 | 限制 |
| --- | --- | --- |
| upsert-nodes | 完整nodes数组 | 按稳定id替换或追加，保留未触及节点顺序 |
| remove-nodes | nodeIds | 必须存在；不自动删除引用或猜替代节点 |
| set-node-field | nodeId / field / value | field来自真实扁平节点schema，禁止id/kind/未知字段；value必须显式给出 |
| upsert-role-styles | role / declarations? / states?列表 | 既有role必须在服务端scope；顶层disabled等未知字段拒绝，新role可显式添加 |
| set-role-field | role / declarations或states / value | 只改允许role的一个字段，保留其他字段 |
| set-plan-field | field / value | 仅服务端scope中的plan字段 |
| replace-bindings | 完整bindings列表 | 显式替换；随后所有来源、归属与覆盖校验仍必需 |

默认允许plan字段pages、overlays、actions、scripts、mockData、localState；projectKey/theme仅当原别名规范化后的对应schema失败时才放入scope。schema、blueprintHash、candidateBundleHash、roleStyles不可用set-plan-field修改。既有样式仅独立诊断标出的role或自身schema非法role可修改；其他合法role锁定。没有文件路径、任意JSON路径或代码执行接口，声明式scripts仍受原合同/编译器限制。

全部修改在副本执行，不覆写原稿。重复字段/操作、整节点与字段操作冲突、整样式与字段冲突、无效删除、错误base、未知字段、超限、无实际变化均拒绝。delta模式下回整图、坏JSON、length/null/其他非stop结束或不合法delta直接失败，不能再降级完整重写或第二轮付费；原一次额度和所有历史repair账本共同限次。合并稿要重新经过严格图装配、标准schema/别名、完整来源/候选/观察/交互、原生尺寸/样式/provenance及现有签名/发布关卡；服务器不补边、不删未知字段、不猜业务值。

## 2. 独立诊断与生产接线

新增visual-semantic-diagnostics.ts，仅在原严格检查失败后提供反馈。提取领域层原validateVisualNodeCapability供标准树与平铺诊断共用，因此已有孤儿时也能报告devices的layout能力错误。样式诊断复用同一个compileResolvedStyle、真实capability及KF36_RUNTIME_PROFILE，并使用批准素材；主题/role先过原schema，等价style/capability/override组合去重，最多12条。roleIds供服务器确定样式修复scope，不能被模型反馈反向授权。

诊断使用固定仅内部componentId，不生成可签名native来源，不装配“修好”的树，不写缓存/构建/制品；空诊断不代表成功。严格首错与原完整性/其他诊断保留、去重、有界合并。新增visual-semantic-repair.ts统一选择协议与检查修复，service在await前固定failedDraft/feedback，沿用原tx/ledger、取消检查与lease/fence等保护。成功缓存、签名与BuildJob仍使用原标准树和resultHash，图或delta不能冒充缓存结果。

DeepSeek视觉system给出graph初稿与服务器指定delta/full修复的精确区别、七种语法、静态选中外观与合法role字段约束。没有把巨大delta JSON schema重复塞进模型请求：完整合同/限额进入冻结指纹，模型只收短语法及scope。旧大型样本外层messages从@16的127917变为127782bytes，旧54节点上下文112263bytes，上限128000不变；不能由此承诺通用缓存或降本比例。文本生成system保持。

合同literal、请求/repair身份及快照断言同步@17/@6，delta合同、scope规则、独立样式诊断版本进入冻结hash。**必须排空旧视觉任务与worker、整体升级、创建新审核/确认，不能给旧Run补配置重签；相同run-plan@7不表示支持新旧视觉worker混部。** 生产开关保持关闭。

## 3. 验证与真实失败记录

| 验证 | 结果 | 日志 |
| --- | --- | --- |
| delta/graph最终定向 | 2文件34/34（delta17） | /tmp/kf-semantic-delta-contracts-final-20261026.log，18:06:01 /0.893s |
| 相关API | 6文件163/163 | /tmp/kf-semantic-delta-focused-20261026.log，18:02:37 /8.41s |
| 合同/领域全量 | 95文件2109pass、5项既有skip（2114） | /tmp/kf-semantic-delta-domain-full-20261026.log，18:06:45 /49.82s |
| PG工程/安全定向 | 44pass、298项按名称过滤（342） | /tmp/kf-semantic-delta-pg-20261026.log，18:06:48 /49.28s |
| 编排全量 | 19文件216/216 | /tmp/kf-semantic-delta-orchestrator-20261026.log，18:10:30 /15.90s |
| API全量首轮 | 73文件通过、1文件失败；1132pass/1fail，零skip；视觉342/342及五种Chrome通过 | /tmp/kf-semantic-delta-api-full-20261026.log，18:11:41 /396.89s |
| 下载/控制独立复验 | 2pass、13项名称过滤 | /tmp/kf-semantic-delta-download-isolated-20261026.log，18:27:17 /5.00s |
| 最终API全量复验 | **74文件1133/1133，零skip**；视觉342/342、五种Chrome及run-flow15/15通过 | /tmp/kf-semantic-delta-api-full-recheck-20261026.log，18:50:40 /333.79s |
| 类型 | API/合同/领域/根均通过；最终测试诊断改动后的API与根再次通过 | /tmp/kf-semantic-delta-api-tsc-close-20261026.log、root-tsc-close同前缀；合同/领域为contract-tsc、domain-tsc同前缀 |
| lint | 最终18个TS通过 | /tmp/kf-semantic-delta-lint-close-20261026.log |

负例覆盖错误base、受保护字段/元数据、无关样式、重复/冲突/无效删除、身份歧义、未知节点字段、跨节点kind字段错误、无变化、128变更总量及UTF-8字节限额；无静默截断。旧53节点初稿在未接subtitle时，同时报告孤儿、devices能力和button.root.selected不支持。测试中模型显式连接subtitle、添加设备内层column并保持row外壳、只删非法selected状态后，通过原全量native预检；未改样式declarations/其他role/原稿SHA。PG三个新增协议违规用例证明回整图/错hash/越权样式均2调用、一次repair、无BuildJob。

首轮完整API的唯一失败为run-flow下载期望200却404；不能宣称首轮全绿。18:23:42单文件复验下载通过，但另一个stale retry期望409却403（14pass/1fail）；18:24:28再跑该文件出现BUILDING等待未达、FENCE_REJECTED及后续recoverExpired拾取前一失败Run（13pass/2fail、1 unhandled），该次未到下载。18:27:17只选下载与stale路径，两项均通过。新增两处只打印message/error的失败断言，保留原状态预期，不输出token/headers、不放宽鉴权/租约或加延时掩盖。**这些间歇失败的共同根因尚未证明，也不能宣称历史偶发401已修复。** 数据库保持Asia/Shanghai原口径，不改timezone或批量重写租约。18:50:40最终全量复验74文件1133/1133、零skip及零unhandled，run-flow15/15；完整通过并不抹去初始故障。五种Chrome证据保留在临时根kf-visual-browser-Yk9awn（static）、CGasYJ（click-feedback）、EIfdSr（workspace-data）、ZxtQgS（observe）、3VtT35（observe-repeater）。

最初contract定向未执行用例是测试误引不存在模块；修正为现有server-plan-envelope.js后运行。初期类型错误涉及never控制流、Zod判别缩窄及动态字段写入，已修正；不能将导入失败描述为功能性红灯，也没有降低类型/认证/原生约束来通过测试。

## 4. 真实能源图：delta有效，模拟数据仍失败

18:10:34运行现有显式入口KF_LIVE_VISUAL_ACCEPTANCE=energy-semantic-saved-20261026，仅新Run的工程初稿与一次修复真实调用，共2次；前置识图/蓝图是两次本地已标记公开提案，重新审核接受43项、omit=0、独立蓝图确认与新签名。沿用完整的权限与来源链，未恢复旧receipt。测试结果physicalRequests=2、planningFixtureRequests=2，不代表本轮真实识图或完整端到端成功。

初稿53节点/43绑定、groupWith空、28681compact bytes。严格首错mockData.0.records.2.values.0.value为technical placeholder mock content is not allowed；值kpi-device-online，是数据集data-kpi中的kpiKey。独立诊断同时发现devices能力错误。本轮三项delta（1553compact bytes）为：重设mockData、设置node-devices.layout=row、重设pages。baseHash正确、roleIds为空且无样式操作；**mockData却原样复制**，所以布局修好后仍被同一值拒绝，最终INVALID_MODEL_OUTPUT，无成功缓存或BuildJob。

| 真实调用 | input/output | cache hit/miss | latencyMs |
| --- | --- | --- | ---: |
| implementation | 26487/7884 | 3712/22775 | 23398 |
| repair | 30787/445 | 4224/26563 | 2547 |

本地vision/blueprint分别0token、23ms/2ms、actualModel明确saved-public-*-fixture。repair输出从前轮整图的7567降到本轮445，是不同样本/请求的观测；本轮输入仍30787、cache hit4224，不宣称固定省费或缓存命中改善。两次付费后停止，没有增第二轮修复。

离线内存反事实：正确合并本轮delta，只把上述单个值换成对应业务label设备在线率，其余保持，可通过原完整严格native预检。没有将该副本写回、签名、入队、导出或冒充真实模型结果。这证明当前失败范围已经收窄，不能视为工程交付成功。原始七份JSON、SHA、时间与费用指标保存在tests/fixtures/energy-overview-20261023/live-semantic-delta-mock-data/README.md，原件不改。

## 5. 接手下一步与验收条件

1. 先离线复放新初稿/原delta，确认同一mockData值、baseHash与完整native结果，保留全部原SHA。改进给模型的有界schema反馈，使其看到确切path、被拒绝值和规则；不得回显秘密、无限输出数据、将不可信值当指令或由服务器猜业务替代。新增负例证明重写同一个非法值继续失败、显式合法值才通过。
2. 审视视觉静态场景的默认mockData/localState/actions/scripts要求。本例无repeater也无节点使用data-kpi；合法空模拟数据与静态属性可能更符合已批准语义。必须先依据实际schema和来源/交互约束设计，不机械删除数据集或误删交互必需依赖，不放宽technical-placeholder守卫来制造成功。任何prompt/合同变化须提升新的semantic/repair冻结身份、更新设计/测试并新Run/新审批。
3. 保留已有效的delta修复与独立诊断。覆盖取消/actor/policy/base/fence、一次额度、缓存、输入上限、样式scope、合法布局组合及真实旧负例；不重写合法样式，不让服务器自动改边/删状态/换已接受能力。
4. 用现有单阶段入口再做有界真实工程验收时仍新上传/审核/独立确认/签名，最多1+once=2真实请求，明确两次本地规划响应。得到合格能源包后，才进行一次新签完整真实流程和KF443隔离新工程导入/运行/截图，核对文字、边框/内边距、缩放与交互；没有导入证据前不称KF成功或1:1。
5. 下载404、stale retry403、租约等待及历史偶发401分别保留故障记录，优先捕获稳定复现与有限错误信息，不假设同源。必要时单独修复测试生命周期/调度问题，不能降低认证、替换真实下载或放宽fence。不得重置受保护试用库、恢复旧receipt或修改旧Run来复用本轮授权。

## 6. 本切片文件清单与隔离

相对仓库根，共33文件：18个TS、1个JSONC、6个设计/报告/索引Markdown及8个原始证据/README。当前工作区有数百项历史脏文件，不自动提交/reset/stash，不出整库包；如用户要求补丁，须保留目录并包含清单每项最终完整文件。JSON原始证据不加非法注释，根tsconfig沿用JSONC注释。

```text
agent-app/packages/contracts/src/visual-semantic-delta.ts
agent-app/packages/contracts/src/visual-semantic-delta.test.ts
agent-app/packages/contracts/src/visual-semantic-graph.ts
agent-app/packages/contracts/src/index.ts
agent-app/packages/contracts/src/visual-blueprint-authority.ts
agent-app/packages/domain-client/src/visual/visual-plan-constraints.ts
agent-app/apps/api/src/conversations/deepseek-model.ts
agent-app/apps/api/src/vision/visual-semantic-diagnostics.ts
agent-app/apps/api/src/vision/visual-semantic-repair.ts
agent-app/apps/api/src/vision/visual-semantic-repair.test.ts
agent-app/apps/api/src/vision/visual-semantic-output.ts
agent-app/apps/api/src/vision/visual-semantic-request.ts
agent-app/apps/api/src/vision/visual-semantic.service.ts
agent-app/apps/api/src/vision/visual-layout-obligations.test.ts
agent-app/apps/api/src/vision/visual-semantic-output.test.ts
agent-app/apps/api/src/runs/visual-run-flow.integration.test.ts
agent-app/apps/api/src/runs/run-flow.integration.test.ts
agent-app/tests/helpers/visual-semantic-delta.ts
agent-app/tsconfig.json
docs/superpowers/specs/2026-10-20-agent-app-next-design.md
agent-app/docs/visual-semantic-delta-20261026.md
agent-app/docs/agent-runs-operations.md
docs/superpowers/plans/2026-10-20-agent-app-handoff.md
docs/superpowers/plans/2026-10-20-agent-app-next-master.md
docs/superpowers/plans/2026-10-20-agent-app-p4-vision.md
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-delta-mock-data/reference-review-before-edit.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-delta-mock-data/reference-review.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-delta-mock-data/accepted-differences.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-delta-mock-data/blueprint.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-delta-mock-data/initial-provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-delta-mock-data/repair-delta-provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-delta-mock-data/result.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-delta-mock-data/README.md
```

普通隔离库kf_agent_test_visual_binding_20261026_1015，真实联调账本kf_agent_test_review_flow_20261023_1245；同库套件串行，禁止任何生产/受保护trial reset/seed/migrate。两库本轮开始均21迁移、无其他连接、pendingBuildJobs=0；收尾状态另附。普通命令显式设置TEST_DATABASE_URL、DATABASE_URL、KF_TEST_ALLOW_DESTRUCTIVE_RESET=1、COOKIE_SECURE=true并关闭LANGCHAIN_TRACING_V2/LANGSMITH_TRACING；Chrome全量设KF_VISUAL_BROWSER_TEST=1。使用仓库绝对Node，不依赖系统PATH。真实调用只从实际.env通过--env-file读取已授权密钥，不打印/改写它；不得把原文命令或密钥放交接文档。

最终收尾：上述33文件均存在且无重复，18个TS有本日修改标记，限定清单git diff --check通过；五轮共37份新旧JSON的README SHA、JSON解析及私有字段检查通过。四处当前索引为@17/repair@6，旧阶段记录保留。完整回归退出码0；两隔离库再次只读核实均21迁移、other_connections=0、pendingBuildJobs=0，真实联调账本保留。没有新补丁ZIP、Git提交或重置，生产vision和受保护试用环境保持。
<!-- end -->
