<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
# 可寻址失败草稿、联合诊断与局部结构修复：2026-10-26

当前源码 **visual-blueprint@8 / blueprint-repair@2 / visual-semantic@19 / semantic-repair@8**。本切片把“空布局但ID明确”的失败提案与“可以成功装配的图”分开：只放开失败草稿读取中的layout.childNodeIds空数组，成功schema仍要求1..24个孩子；一次delta合并后仍必须全部严格通过。空布局不再遮住分组及批准能力错误，也不必因此整图重写。

真实工程初稿本轮已无空布局、分组循环或无用模拟数据；一次delta接回了下半页24个不可达节点，合并后只剩devices布局能力不符。**仍没有合格能源工程包、BuildJob、KF导入/运行或1:1结论，T22/总体IN_PROGRESS。** 预算和业务源继续暂缓、production vision关闭，实际.env、受保护18迁移试用库、旧服务与KF未改，无迁移/依赖。先读本报告与唯一design最新补充，前一阶段为visual-static-data-20261026.md。

## 1. 失败草稿与成功图的边界

contracts的visual-semantic-graph.ts新增VisualSemanticGraphDraftSchema、readAddressableVisualSemanticGraph与kf-visual-addressable-graph/v1。仅layout.childNodeIds的min1在失败读取时允许0；保留原字段名、必需字段、类型、节点/引用/页面数量等上限，节点ID须唯一，compact≤65536 UTF-8 bytes、负载深度≤48。没有省略字段补默认、未知字段删除、节点归属推断或图装配。模块slot空孩子等未列明缺陷不扩大准入。

原VisualSemanticGraphSchema、assembleVisualSemanticGraph和全部成功语义/native规则保持。readVisualSemanticDeltaBase改用该失败读取后，还要继续验证≤64项、合法且唯一的role身份；其他原scope不变。错误身份、未知字段、缺失/错误类型/超24孩子、模型填写受保护hash等仍不获得delta资格。合法可寻址只表示可显式修改，不批准拓扑/来源/布局/样式。

applyVisualSemanticDelta仍在副本按模型显式操作修改，不自动补边/清groupWith/删节点；所有空布局都必须被显式修正，或删除并更新全部受影响引用。部分修复仍无法通过原严格graph schema；悬空/共享/跨根/循环等还由原严格装配及后续native路径拒绝。未知字段/错误base/越权样式/重复冲突/noop等原拒绝保持。原7操作、16项/128变更、delta64KiB/合并128KiB及一次额度不增加；多个相关节点可以用已有upsert-nodes数组显式提交。

失败草稿schema本身也加入visualSemanticDeltaContract的冻结指纹，不作为巨大JSON schema重复发送给模型。初稿仍graph/v1，修复仍由服务器选择delta/v1或full-graph，内部成功结果/缓存/签名/原生构建仍标准树。delta失败不再回退整图或追加一次修复。

## 2. 联合诊断与提示

完整性及能力/样式诊断共用同一失败草稿读取范围。空布局存在时，反馈SEMANTIC_GRAPH_EMPTY_LAYOUTS的真实count及最多20个nodeIds；同一原稿继续通过共享validateVisualSiblingGrouping诊断实际分组，通过共享真实绑定能力函数和原生样式compiler诊断能力/样式。保留严格首错、最多12项反馈，不构造“修好的树”或签名结果。独立样式规范化前先读有界草稿，避免在深/超大/歧义输入上先递归规范化。

上轮59节点初稿现在联合反馈三个空布局、KPI/设备/摘要分组循环、devices批准能力不符；节点未改、原SHA不变。该组KPI诊断首先报告node-kpi-today-col，初次测试错误地预期node-kpi-today，已按真实共享遍历结果修正测试，不更换/放宽分组规则。

视觉system明确每布局1..24个孩子、装饰色块不能作空布局；修复必须显式处理全部受影响引用，同时解决全部issues，可合并upsert-nodes以符合16操作上限。合法非空有向分组仍支持，不把模型全部groupWith强制清空。文本生成路径、静态依赖策略、拒绝值hash反馈及原生语义合同不改。

## 3. 冻结身份、部署与验证

semantic升@19、repair升@8；合同literal、请求/PG断言同步。delta资格策略kf-visual-scoped-delta/v2、完整性kf-visual-completeness/v2、独立样式读取kf-visual-style-preflight/v2及addressableDraft版本进入冻结hash。蓝图@8/repair@2不变。须排空旧视觉任务/worker、整体升级、新审核/独立确认，不能给旧Run/缓存补配置重签，相同run-plan@7不构成混部兼容。

| 验证 | 结果 | 日志 |
| --- | --- | --- |
| 合同功能红灯 | 26项中2fail/24pass；失败为读不出真实空布局基稿、无法显式修复 | /tmp/kf-addressable-red-20261026.log，19:51:38 /0.501s |
| 合同/图定向绿灯 | 2文件43/43（delta26、graph17） | /tmp/kf-addressable-contracts-20261026.log，19:52:06 /0.852s |
| 相关API | 7文件164/164（新4项） | /tmp/kf-addressable-focused-20261026.log，19:54:03 /9.46s |
| 最新原稿修复输入预算 | 新4项通过，包含同system前缀、原稿保留及128000bytes上限 | /tmp/kf-addressable-budget-20261026.log，20:57:16 /2.25s |
| PG定向首轮 | 新空布局用例及2负例通过；1个既有unrelated-style负例超时 | /tmp/kf-addressable-pg-20261026.log，19:55:15 /599.19s |
| PG定向复验 | 4pass、339项名称过滤，原5秒预期未变 | /tmp/kf-addressable-pg-recheck-20261026.log，20:56:16 /8.19s |
| 合同/领域全量 | 95文件2118pass/5项既有skip（2123） | /tmp/kf-addressable-domain-full-20261026.log，20:56:17 /42.66s |
| API全量首轮 | 75文件通过、1文件失败；1143pass/1fail，零skip；视觉除1项HTTP中断外均通过，五种Chrome通过 | /tmp/kf-addressable-api-full-20261026.log，20:57:33 /328.75s |
| 审核HTTP/局部协议定向复验 | 5pass、338项名称过滤 | /tmp/kf-addressable-http-recheck-20261026.log，21:07:48 /9.12s |
| 最终相关API（加入本轮真实稿） | 7文件165/165，新文件5/5 | /tmp/kf-addressable-focused-close-20261026.log，21:07:49 /9.35s |
| 最终API全量与Chrome | **76文件1145/1145，零skip**，含视觉343/343与五种Chrome；首轮后仅测试监听/新增原稿测试及类型标注变化，无生产逻辑变化 | /tmp/kf-addressable-api-full-recheck-20261026.log，21:08:59 /330.21s |
| 类型/lint | API/合同/根类型通过；13个TS lint通过，最新测试类型标注后该文件lint再次通过 | /tmp/kf-addressable-tsc-close-final2-20261026.log、contract-tsc、root-tsc、lint-close、unit-lint-final同前缀 |

新合同负例涵盖缺字段/null/过多孩子、未知节点/plan字段、重复身份、未知kind；原错误hash、样式越权、冲突、aggregate128及UTF-8限额仍保持。真实59节点草稿在测试中被显式的remove-nodes与upsert-nodes两项提案修好空节点/引用/分组及设备容器组合，原完整native预检通过；plan、bindings及未触及节点逐值保持，原hash不变。部分修复、删除留悬空、整图代替delta、错误hash都失败且无回退。

PG新增真实服务用例：初稿根布局childNodeIds=[]，模型显式恢复原孩子列表，一次修复后缓存标准可编译结果，重放不再次调用；2条invocation、1 repair、无BuildJob。测试gateway显式responseTexts优先跳过目标编码器，防止有意坏wire在返回前被辅助转换；生产gateway不适配模型回整图。

首轮PG的unrelated-style用例报告5秒超时，实际计时590233ms，整套599.19s；不能把显著异常耗时直接归因为代码或宿主休眠。未延长门槛，复验同4项仅8.19s全部通过；根因未证明，历史下载404/stale retry403/租约等待与401也未声称解决。真实调用两次是预期负例，不纳入普通全量绿灯或用本地夹具替换成功。

完整API首轮的唯一失败为审核revision HTTP测试socket hang up，无可用错误栈，不应标成全绿。读本地Supertest实现并做12次无DB/无鉴权的loopback观察：app未监听时自动启停12/12次；场景预先监听则全程1次、清理时关闭1次。未复现原socket中断，不能证明二者同源。withReviewHttp改为每场景listen(0,127.0.0.1)，原finally app.close保持，不改生产HTTP、鉴权、状态断言或超时；5条目标用例均过，完整复验另记。末尾新增真实稿测试曾因图payload的静态类型不暴露styleRole/styleOverride/layout而类型失败，已用现有图节点与Record的交集标注测试副本，不改生产schema。

21:08:59完整复验76文件1145/1145、零skip/零unhandled，视觉343/343及五种Chrome全部通过；比首轮多1项仅为新增本轮真实负例。复验通过不抹去原故障。最终浏览器证据位于临时根kf-visual-browser-6hgDl7（static）、FeVv5X（click-feedback）、5hXW4m（workspace-data）、t6rJKl（observe）、8QbvWi（observe-repeater），完整路径以最终日志五行evidence为准，不以首轮路径替代。

## 4. 本轮真实工程：局部修复生效，设备绑定仍错

20:57:32 /35.56s，使用既有energy-semantic-saved-20261026模式。两个公开规划本地提案明确标记actualModel=saved-public-vision-fixture/blueprint-fixture（0token、11ms/1ms），新审核接受43项、omit=0，无静态行revision，新独立蓝图确认/工程签名；不是本轮真实识图或完整端到端验收。真实初稿和一次修复2请求后停止，未恢复旧receipt或加第二轮。

初稿55节点/43绑定，28060compact bytes，四类依赖数组全空、无空布局、所有intent.groupWith空；首错node-lower-row孤儿，24个节点不可达，另有devices能力不符。原稿满足失败读取合同，mode=delta、baseHash=9c04b0f13f2126c20c5b2158285584b5c7627265479fc70a064b5e5ece25bfe2、scope.roleIds=[]。真实初稿本次无空布局，因此实际提供方调用验证的是局部拓扑修复，空布局路径由原真实负例及PG服务测试验证，不能混称本轮模型真实修过空布局。

修复是一个upsert-nodes、14节点、5634compact bytes的delta，接回了下半页，孤儿/不可达错误消失；plan/roleStyles未重写。但node-devices-column仍为column且直接包含标题/三行，无法成为已批准layout.2的row绑定外壳。合并后严格检查只剩VISUAL_BLUEPRINT_LAYOUT_CAPABILITY_MISMATCH: devices，最终FAILED/INVALID_MODEL_OUTPUT，无成功缓存、BuildJob或包。

| 真实task | input/output | cache hit/miss | latencyMs |
| --- | --- | --- | ---: |
| implementation | 26523/7651 | 3840/22683 | 23531 |
| repair | 30800/1531 | 4352/26448 | 5596 |

1531输出token是本轮局部修复观测，前轮完整重写7847是不同请求，不能承诺固定省费；本轮输入30800、cache hit4352，也不证明缓存问题已经解决。固定offline上下文初次109211bytes、修复127058bytes，上限128000保持。原JSON/SHA和指标见tests/fixtures/energy-overview-20261023/live-delta-layout-binding/README.md。

未写回的内存反事实只修设备容器组合：原节点保持绑定ID和样式、外层row唯一引用新内层column，原内容进入内层且不重复外壳样式，原完整严格native预检ok:true。没有签名/发布/构建/导出，不能当模型真实成功稿、工程包或KF/1:1证明。

## 5. 下一步与验收条件

1. 先复放本轮原稿及delta：初稿孤儿与24不可达；合并稿只有devices能力错误。保留SHA。不要重新做模拟数据、分组或整页重写，也不能把离线副本直接作为真实结果。
2. 优先补精确绑定反馈：现在首错仅code/regionId，模型虽收到完整requiredVisualBindings/directLayoutKinds，仍保留名为node-devices-column的column，可能混淆该节点与其父row。反馈应指出真实binding.nodeId、当前kind/layout、批准requiredCapabilityId/directLayoutKinds、来自同一候选的合法内层组合；不要只重复泛化“布局能力不符”。布局原值须先过原schema，解释只来自可信批准事实，不回显任意异常消息或扩大候选。
3. 若给出row外壳+column内容的局部建议，必须验证该区域允许内层column、保留实际来源/样式/全部区域，不能在服务器自动包节点或换审核能力。模型须明确给出节点/引用修改；布局、样式、尺寸和provenance继续全量预检。新反馈/提示须新semantic/repair冻结身份、更新design/合同/测试，新Run/审核；不能重签本轮旧continuation。
4. 以本轮公开原稿新增精确反馈负例：原样upsert同一个column必须失败；模型显式的正确容器组合才通过，未触及值保持。测量现有127058bytes修复消息的余量，反馈必须有界，不能扩大128000或删批准事实。保留一次账本、取消/actor/许可/base/fence/缓存与协议违规覆盖。
5. 完成离线/PG验证后，再新审核的单阶段最多2次真实工程调用，不能重复跑无新改动的同一失败；合格能源包后才做新签完整真实识图流程和KF443隔离新工程导入/运行/截图。没有导入证据前不称KF成功或1:1，预算与业务源继续暂缓。

## 6. 文件清单与环境隔离

相对仓库根，共27文件：13个TS、6个设计/报告/索引Markdown、8个原始证据/README。数百项历史脏文件保持，不自动提交/reset/stash，不出整库包。如需补丁，保留目录并覆盖清单每个最终完整文件；原JSON证据不加非法注释。

```text
agent-app/packages/contracts/src/visual-semantic-graph.ts
agent-app/packages/contracts/src/visual-semantic-delta.ts
agent-app/packages/contracts/src/visual-semantic-delta.test.ts
agent-app/packages/contracts/src/visual-blueprint-authority.ts
agent-app/apps/api/src/vision/visual-semantic-completeness.ts
agent-app/apps/api/src/vision/visual-semantic-diagnostics.ts
agent-app/apps/api/src/vision/visual-semantic-request.ts
agent-app/apps/api/src/vision/visual-semantic-output.test.ts
agent-app/apps/api/src/vision/visual-layout-obligations.test.ts
agent-app/apps/api/src/vision/visual-semantic-mock-data.test.ts
agent-app/apps/api/src/conversations/deepseek-model.ts
agent-app/apps/api/src/runs/visual-run-flow.integration.test.ts
agent-app/apps/api/src/vision/visual-addressable-graph.test.ts
docs/superpowers/specs/2026-10-20-agent-app-next-design.md
agent-app/docs/visual-addressable-graph-20261026.md
agent-app/docs/agent-runs-operations.md
docs/superpowers/plans/2026-10-20-agent-app-handoff.md
docs/superpowers/plans/2026-10-20-agent-app-next-master.md
docs/superpowers/plans/2026-10-20-agent-app-p4-vision.md
agent-app/tests/fixtures/energy-overview-20261023/live-delta-layout-binding/reference-review-before-edit.json
agent-app/tests/fixtures/energy-overview-20261023/live-delta-layout-binding/reference-review.json
agent-app/tests/fixtures/energy-overview-20261023/live-delta-layout-binding/accepted-differences.json
agent-app/tests/fixtures/energy-overview-20261023/live-delta-layout-binding/blueprint.json
agent-app/tests/fixtures/energy-overview-20261023/live-delta-layout-binding/initial-provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-delta-layout-binding/repair-delta-provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-delta-layout-binding/result.json
agent-app/tests/fixtures/energy-overview-20261023/live-delta-layout-binding/README.md
```

普通隔离库kf_agent_test_visual_binding_20261026_1015、真实联调账本kf_agent_test_review_flow_20261023_1245；开始均21迁移、无其他连接、pendingBuildJobs=0，同库串行，两个不同库分别承载全量/真实调用。禁止对生产/受保护trial reset/seed/migrate，不改原Asia/Shanghai时区、实际.env或旧服务。使用仓库绝对Node，普通回归显式TEST_DATABASE_URL、DATABASE_URL、KF_TEST_ALLOW_DESTRUCTIVE_RESET=1、COOKIE_SECURE=true并关闭LANGCHAIN_TRACING_V2/LANGSMITH_TRACING；五种Chrome设KF_VISUAL_BROWSER_TEST=1。真实单阶段沿用KF_LIVE_STATIC_ROW_REVIEW=energy-overview-20261026、KF_LIVE_BLUEPRINT_REPAIR=none、KF_LIVE_SEMANTIC_REPAIR=once，--env-file=.env取已授权密钥不打印。收尾状态另附。

最终收尾：27文件存在且无重复，13个TS有当日修改标记；17个入口文件与切片前hash不同，新增项逐一列出。限定清单git diff --check通过，七轮51份JSON的README SHA、JSON解析及私有字段检查通过；四处当前索引均@19/repair@8，旧阶段保留。最终完整API、类型和lint进程退出0，两隔离库再次只读核实均21迁移、other_connections=0、pendingBuildJobs=0，真实账本保留。没有新补丁ZIP、Git提交/reset/stash、受保护trial迁移或KF操作。
<!-- end -->
