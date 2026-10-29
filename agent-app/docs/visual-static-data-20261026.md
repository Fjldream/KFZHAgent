<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
# 视觉静态数据与拒绝值反馈：2026-10-26

当前源码 **visual-blueprint@8 / blueprint-repair@2 / visual-semantic@18 / semantic-repair@7**。本切片解决上一轮静态能源图创建无用模拟数据、一次修复原样保留非法值的问题：视觉提示不再强制创建模拟数据/状态/动作/脚本，错误反馈补充精确路径、校验规则与原值指纹；保留原schema、delta合同及完整原生关卡。

真实联调两份工程稿的mockData/localState/actions/scripts均为[]，上轮kpi-device-online错误没有再次出现；但初稿有三个空布局，唯一一次完整重写保留了原有分组循环及devices布局能力错误。**仍没有合格能源工程包、BuildJob、KF导入/运行或1:1结论，T22/总体IN_PROGRESS。** 预算和业务源暂缓、production vision关闭；实际.env、受保护18迁移试用库、旧服务和KF未改，无迁移/依赖。接手先读本报告和唯一design最新补充，上一切片为visual-semantic-delta-20261026.md。

## 1. 静态提示与错误反馈

原文本生成system及通用提示要求完整交互式前端、行业模拟数据/本地状态/动作/脚本，视觉路径以前同样收到该要求。现在仅visualProjection分支改用视觉客户端介绍，省去强制模拟数据的通用coverage句；视觉system中的对应段替换为按批准观察/交互覆盖区域，静态值直接显示，无引用需求的四类数组用[]，必需交互、数据及依赖保留。原文本生成路径不改，原数组上限、值类型、technical-placeholder和record-key规则均保留。服务器不自动删数据或猜业务值。

新增visual-semantic-data-diagnostics.ts，复用原MockDataSetSchema而不是再写一份宽松校验。原稿compact≤64KiB、负载深度≤48、数据集≤32时，仅针对该schema实际返回的technical placeholder自定义错误，最多4项。精确path为plan.mockData.i.records.j.values.k.value，rule=technical-placeholder，rejectedValueHash是该原值的canonicalServerHash。detail解释行键也受校验，必须显式给业务值或仅移除无引用数据，禁止重发原值。

不在issues重复回显任意原值/秘密/注入内容：完整原值仍逐字保留在failedDraft，path与hash足以唯一定位；hash不作为批准/授权证明。错误列表在严格路径失败后与原首错、完整性、能力/样式反馈合并，仍最多12项，成功仅由原严格schema、拓扑、来源/候选/观察/交互/native/provenance产生。坏数据无诊断不代表合法，oversize/deep草稿也不借新诊断获得修复资格。

旧真实初稿现在同时反馈原mockData拒绝、精确值错误和devices能力错误；原始delta仍失败，测试中显式改合法值才可完整通过。显式删除未引用数据可以通过；对同一草稿增加合法record-key依赖后，保留合法数据可通过，删除该数据仍因unknown mock-data id失败，服务器不帮删状态。测试曾将中文显示label误作稳定记录键，原校验正确拒绝，已改为测试模型明确给出的合法业务键；未放宽record-key规则。

## 2. 冻结身份、限额与部署

semantic从@17升@18、repair从@6升@7；合同literal、请求及PG快照断言同步。视觉静态依赖策略kf-visual-needed-dependencies/v1、拒绝值反馈kf-visual-mock-feedback/v1及实际视觉system/介绍进入冻结hash。原蓝图@8/repair@2、graph/v1初稿、delta/v1、内部标准树和签名/缓存/构建保持。

一次额度与全部历史repair账本共同限次，取消/actor/许可/base/lease/fence保护保持。模型输入128000bytes、草稿64KiB、issues12、输出32000token/2MiB响应、delta16操作/128变更及原节点/深度上限不增加。当前离线测量（固定offline上下文）live-detail-reservation初次112596bytes；上轮mockData真实稿上下文初次109015、一次修复127453bytes；本轮新真实稿上下文初次109015、修复123052bytes。不同fixture/范围不可与历史大型样本直接算降本比例，实际API输入token见下表。

必须排空旧视觉任务/worker、整体升级、新建审核与独立确认；不能给旧Run/缓存补配置重签，也不能用相同run-plan@7解释混部兼容。当前仅隔离库验收，生产vision未启用。

## 3. 测试与保留的失败

| 验证 | 结果 | 日志 |
| --- | --- | --- |
| 新拒绝值/静态规则红灯 | 4/4功能性失败（空诊断和旧提示），不是导入失败 | /tmp/kf-semantic-mock-red-20261026.log，19:33:20 /2.56s |
| 相关API首次绿灯 | 5文件152/152；包含新5项和文本模型129项 | /tmp/kf-semantic-mock-focused-green-20261026.log，19:36:10 /8.97s |
| 合同/领域全量 | 95文件2109pass /5项既有skip（2114） | /tmp/kf-semantic-mock-domain-full-20261026.log，19:36:50 /54.54s |
| 完整API与五种Chrome | **75文件1138/1138，零skip**，含视觉342/342与五种Chrome | /tmp/kf-semantic-mock-api-full-20261026.log，19:36:52 /398.53s |
| 原始失败稿新增回归 | 全量后仅新增一项测试；最终相关5文件153/153（新文件6/6），不与1138重复累加 | /tmp/kf-semantic-mock-focused-close-20261026.log，19:44:00 /8.88s |
| 类型 | API/合同/根通过，新增原稿回归后API再次通过 | /tmp/kf-semantic-mock-tsc-close-20261026.log、contract-tsc、root-tsc同前缀 |
| lint | 最终9个TS通过 | /tmp/kf-semantic-mock-lint-close-20261026.log |
| 原稿复放/请求字节/反事实 | 原SHA不变；只在内存诊断 | /tmp/kf-semantic-mock-live-inspect-20261026.log、live-counterfactual、measure同前缀 |

新增测试覆盖真实非法值指纹、不重复回显注入字符串、原稿不变、重发原delta仍拒绝、显式业务值通过、最多4项、UTF-8 64KiB与深度48、坏数据不造诊断、未引用数据显式删除、保留必需状态依赖、静态提示仍保留click-feedback规则。新helper仅诊断，没有材料化或授权。最初类型检查发现测试对passthrough plan的静态类型使用不正确，已用现有VisualSemanticDeltaGraph类型，不放宽生产类型。重复定位修改的一次apply_patch因源码已正确而未匹配，无文件更改。

历史下载404、stale retry403、租约等待/FENCE_REJECTED及偶发401记录保留于前报告；本轮不因某次绿灯就宣称根因解决，不放宽鉴权/租约、不改数据库时区、不加延时掩盖。

## 4. 真实能源图：无用数据已消失，拓扑仍失败

19:36:54 /55.05s，以现有energy-semantic-saved-20261026入口新建审核/43项接受（omit=0）/独立蓝图确认/新工程continuation。识图、蓝图各一个本地公开提案响应，actualModel为saved-public-vision-fixture和saved-public-blueprint-fixture（0token、9ms/3ms），不是本轮真实识图。只有工程初稿和一次修复真实付费，physicalRequests=2、planningFixtureRequests=2；未载入旧receipt，没有第二轮修复。

初稿graph/v1，59节点/43绑定，29710compact bytes，四类依赖数组全空。nodes[19/24/29]为三个KPI色块空布局（node-kpi-today-col、node-kpi-power-col、node-kpi-online-col），childNodeIds=[]违反原min1合同，报3项SEMANTIC_GRAPH_SCHEMA_INVALID。**原稿已有14个节点非空intent.groupWith，包含循环**，只是独立完整性/能力诊断当前依赖严格图schema，因此空布局先遮住这些错误。

原readVisualSemanticDeltaBase要求严格graph schema，所以本例按既有规则选择full-graph。不能说模型违规用全图替换delta，也不能说group循环由修复新增。一次重写56节点/43绑定，28590compact bytes，空布局消失，11个节点非空groupWith仍有循环。严格首错VISUAL_LAYOUT_GROUP_INVALID: node-kpi-today；联合反馈node-devices、node-device-row-1、node-summary-row-alert分组循环、devices能力不符和NATIVE_LAYOUT_INPUT_INVALID。最终FAILED/INVALID_MODEL_OUTPUT，无成功缓存/BuildJob/能源包。

| 真实task | input/output | cache hit/miss | latencyMs |
| --- | --- | --- | ---: |
| implementation | 26482/8162 | 0/26482 | 25062 |
| repair | 29840/7847 | 4224/25616 | 23036 |

本轮没有调用时的mockData错误，静态要求有效；full-graph修复仍7847输出token，不能沿用上一轮delta445token宣称本次降本。调用账本SUCCEEDED只说明响应成功，不代表工程成功。七份JSON原字节、SHA、时间、指标见tests/fixtures/energy-overview-20261023/live-static-data-empty-layout/README.md；前后review一致，无静态行revision，publicFactsHash与前轮相同但私有审核和签名新建。

离线反事实仅在内存：清空修复稿的intent.groupWith后，仅剩devices布局能力不符；再把原devices的column内容作为无重复样式的内层column，外层保持批准row/唯一child，完整严格native预检ok:true。没有将副本写回、签名、发布、入队或导出，不能称模型成功、工程交付或KF通过；原件SHA不变。

## 5. 下一步实施与验收条件

1. 先复放本轮两个原稿：59节点初稿必须有3项空child列表错误，56节点修复稿必须保留分组循环与devices能力失败，均无模拟数据。保留原SHA；独立诊断不能因没列出分组就误称只有空布局。
2. 当前delta基稿资格与严格图有效性耦合过紧：稳定ID唯一但childNodeIds为空，就被迫整图重写。审查单独“可寻址失败草稿”合同是否能只容纳明确、有限的局部结构缺陷，让模型显式修正/删除节点及引用，且最终仍必须经过原严格graph+全部native关卡。不能直接放宽原成功schema、丢字段/空布局、自动猜边或用诊断副本作为结果；身份歧义/未知字段/超限仍拒绝。若采纳，先更新design、冻结版本、base hash规则与冲突/越权/最终拒绝测试。
3. 将分组与能力诊断和上述“可寻址”读取范围一致；初稿尚有空布局时，也应能用共享真实分组规则给出有界循环反馈。不能装配一个假树、自动清空groupWith或换批准能力。视觉提示还应明确每个layout至少1个孩子，装饰色块不能伪装为空容器；优先在批准能力与样式内表达，不能凭空扩大控件。
4. 优先用本轮原稿测试模型明确的局部提案，验证未触及节点/样式逐值保留，循环、空节点、跨根/多父、无关样式、错误base、取消/fence/一次额度/缓存都严格拒绝。不能继续堆提示后无限付费重试；本轮2次已结束。
5. 新冻结身份、新Run/审核后，再用同一单阶段入口最多2次真实工程验收；合格包后才能新签完整真实流程和KF443隔离新工程导入/运行/截图。预算、业务源继续暂缓；没有真实导入/运行证据不称KF成功或1:1，不改变受保护试用库或旧服务。

## 6. 本切片文件清单与隔离

相对仓库根，共23文件：9个TS、6个设计/报告/索引Markdown及8个原始证据/README。保留数百项既有脏文件；不自动提交/reset/stash，不出整库包。如要求补丁，保留目录并包含每项最终完整文件；JSON证据不加非法注释。

```text
agent-app/apps/api/src/conversations/deepseek-model.ts
agent-app/apps/api/src/vision/visual-semantic-data-diagnostics.ts
agent-app/apps/api/src/vision/visual-semantic-mock-data.test.ts
agent-app/apps/api/src/vision/visual-semantic-output.ts
agent-app/apps/api/src/vision/visual-semantic-request.ts
agent-app/apps/api/src/vision/visual-semantic-output.test.ts
agent-app/apps/api/src/vision/visual-layout-obligations.test.ts
agent-app/apps/api/src/runs/visual-run-flow.integration.test.ts
agent-app/packages/contracts/src/visual-blueprint-authority.ts
docs/superpowers/specs/2026-10-20-agent-app-next-design.md
agent-app/docs/visual-static-data-20261026.md
agent-app/docs/agent-runs-operations.md
docs/superpowers/plans/2026-10-20-agent-app-handoff.md
docs/superpowers/plans/2026-10-20-agent-app-next-master.md
docs/superpowers/plans/2026-10-20-agent-app-p4-vision.md
agent-app/tests/fixtures/energy-overview-20261023/live-static-data-empty-layout/reference-review-before-edit.json
agent-app/tests/fixtures/energy-overview-20261023/live-static-data-empty-layout/reference-review.json
agent-app/tests/fixtures/energy-overview-20261023/live-static-data-empty-layout/accepted-differences.json
agent-app/tests/fixtures/energy-overview-20261023/live-static-data-empty-layout/blueprint.json
agent-app/tests/fixtures/energy-overview-20261023/live-static-data-empty-layout/initial-provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-static-data-empty-layout/repaired-provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-static-data-empty-layout/result.json
agent-app/tests/fixtures/energy-overview-20261023/live-static-data-empty-layout/README.md
```

普通库kf_agent_test_visual_binding_20261026_1015、真实联调账本kf_agent_test_review_flow_20261023_1245；本轮开始均21迁移、无其他连接、pendingBuildJobs=0。同库串行、两库分别承载回归/真实调用；不得reset/seed/migrate生产或受保护trial，不改原Asia/Shanghai时区。普通回归显式TEST_DATABASE_URL、DATABASE_URL、KF_TEST_ALLOW_DESTRUCTIVE_RESET=1、COOKIE_SECURE=true、关闭LANGCHAIN_TRACING_V2/LANGSMITH_TRACING；全量浏览器设KF_VISUAL_BROWSER_TEST=1。真实模式仍KF_LIVE_STATIC_ROW_REVIEW=energy-overview-20261026、KF_LIVE_BLUEPRINT_REPAIR=none、KF_LIVE_SEMANTIC_REPAIR=once，仅选择现有真实DeepSeek测试；绝对Node从--env-file=.env取已授权密钥，不打印/写回密钥。收尾核对另附。

最终收尾：23文件存在且无重复，9个TS有当日修改标记；12个入口文件的切片前hash均与最终不同，新增文件逐项列出。限定清单git diff --check通过，六轮44份新旧JSON的README SHA、JSON解析和私有字段检查通过，四处当前索引均@18/repair@7。完整API后仅新增原始失败稿测试与注释/文档，没有生产逻辑变更；最终相关153/153、API类型和9文件lint退出0。两隔离库再次只读核实均21迁移、other_connections=0、pendingBuildJobs=0；真实账本保留。没有新补丁ZIP、Git提交/reset/stash、试用库迁移或KF操作。
<!-- end -->
