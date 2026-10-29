<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
# 视觉布局建议与已批准组合约束：2026-10-26

当前源码 **visual-blueprint@8 / blueprint-repair@2 / visual-semantic@15 / semantic-repair@4**。本切片修复“把不同区域分数混用、纵向卡片易被推荐为横向、修复请求无法直接核对绑定外壳”的问题。提供方仍输出graph/v1，内部标准树、签名、缓存、原生编译和交付不变。

旧真实负例已离线复现；明确row外壳+column内容的测试提案可以保留旧layout.2审核并通过完整原生编译。新的真实验收中，主内容/多数纵向卡片的映射已改变，但工程仍因缺节点、漏接页头子树失败。**没有本轮能源包、KF导入/运行或1:1结论，总计划/T22仍IN_PROGRESS。** 预算与业务源继续暂缓，production vision关闭；实际.env、受保护18迁移试用库、旧服务与KF未动，无迁移/新依赖。

先读本报告，再读visual-semantic-graph-20261026.md及唯一design最新补充。旧@14真实响应和原审核不改字节、不改hash；新映射只用于新提案或明确审核revision，不对历史accepted context重新选能力。

## 1. 方向建议与区域评分

- retrieveVisualCapabilities仍沿用原目录、共享25项预算、每区域5控件/3布局与稳定排序。新增内部regionScores记录每个region实际被选候选的量化分数；跨区域max score保留为共享元数据，但不再替代本区域分数。
- mapVisualRegions对带regionScores的候选检查当前region自己的准入；无此字段的旧内部调用保持原score行为。真实surface/role/属性/交互/evidence先过滤；排序保持verified证据优先，再按明确方向建议、本区域score、稳定id。没有制造新候选、改变证据等级或把OCR变成交互/数据权限。
- suggestVisualContainerArrangement仅对header/sidebar/content/card/form，至少两个直接子框且均在父框内才分析。x/y区间按起点稳定排序，合并相交/间隙不超过父轴0.5%的区间；仅一轴多带、另一轴单带时建议row/column。单子节点、完全重叠、双轴网格和越界均返回null，保留既有排序。
- 建议影响新审核提案，reason明确“仅为待审核布局建议、不代表还原或原生运行已验证”。没有新增前端字段；沿用已有映射及reason展示、receipt/hash和显式确认。原签名review读取/重放不重算，PG用例确认新提案只发布一次且没有BuildJob。

旧44区域样本的新建议：content、三张KPI、devices-card、summary-card为layout.4；header与kpi-row仍layout.2。原review中的上述layout.2均保持原样。新的43区域真实识图在devices上呈双轴分带，仍按旧排序选layout.2，不能宣称已自动解决所有设备卡片。

## 2. 外层能力与内部组合

visual-layout-obligations.ts共用resolveVisualBlueprintSources，逐项提供region/page/blueprint归属、requiredCapabilityId和真实directLayoutKinds。明确子框建议与已批准外层方向不同时，再附contentArrangementHint和本蓝图区域候选实际允许的该inner类型；这些只是布局建议/能力投影，不改批准能力。

修复请求增加原parentRegionId/referenceBox，以及从符合图外壳schema的未批准草稿提取的proposalBindingCount/proposalBoundNodes；每区域最多列4个节点观察，缺引用明确missing。观察只取id/kind/合法layout枚举，不复制任意节点内容作为新指令。坏JSON/不合格外壳不生成这份草稿观察；完整failedDraft仍逐字保留，由原一次修复机制处理。

system明确：directLayoutKinds限制被绑定的外壳，不要求所有后代都沿同轴排列；已批准layout.2但内容纵向时，可保留row外壳包单个column内容，两层保留正确来源，styleRole只放外壳避免双padding。卡片先各自成列再上层并排，不能把标题/数值/所有设备行都直接放在同一row累加宽度。模型自行生成完整提案，服务器不自动包节点、猜业务、接孤儿或删groupWith。

组合规则及kf-visual-layout-obligations/v1进入冻结prompt/hash，semantic@15、repair@4及contracts literal/快照/账本用例同步。图wire、内部标准树、64KiB草稿、12条issue、128000bytes输入、32000输出token、2MiB响应和一次修复不扩大。排空旧视觉任务/worker、整体升级、新建审核；不因同run-plan@7混部，不给旧Run补配置重签。蓝图限额与repair身份保持。

## 3. 验证与中途失败

| 验证 | 最终结果 | 日志 |
| --- | --- | --- |
| 相关领域3文件 | 65/65（新增布局提案8项） | /tmp/kf-layout-proposals-unit-final-20261026.log，16:53:46 /2.88s |
| 合同/领域全量 | 94文件2092pass /5既有skip（2097） | /tmp/kf-layout-obligations-domain-full-20261026.log，16:57:31 /48.97s |
| API相关4文件 | 153/153（新增obligations 5项） | /tmp/kf-layout-obligations-focused-final-20261026.log，16:58:45 /6.44s |
| PG定向 | 8pass/329未选（337） | /tmp/kf-layout-obligations-pg-20261026.log，16:58:47 /10.82s |
| 编排全量 | 19文件216/216 | /tmp/kf-layout-obligations-orchestrator-final-20261026.log，17:00:17 /10.33s |
| API/领域/合同类型、12个TS lint | exit_code=0 | /tmp/kf-layout-obligations-{api-tsc,domain-tsc,lint}-complete-20261026.log、-contract-tsc-20261026.log |
| 完整API | 72文件1118/1118，零skip | /tmp/kf-layout-obligations-api-full-20261026.log，17:00:59 /386.67s，exit_code=0 |
| 其中完整视觉/五种Chrome | 337/337、238.671s；五种浏览器场景全部通过 | 同上，模型为fixture |

Chrome证据前缀 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-visual-browser-`，static/feedback/workspace-data/observe/repeater后缀依次FMxpoU/rkAQhc/CwZf14/FrzSv2/NI9xyH。各流程包含独立审核/确认、真实签名、原生构建与包下载/解包；这些fixture包不是能源图真实生成包或KF运行证明。没有修改鉴权代码，此前偶发401根因仍未证明，不能因本轮全绿抹去历史。

新增obligations用例保留两份旧真实错误稿：初稿仍NATIVE_LAYOUT_UNSATISFIABLE，修复稿仍content能力不符；原hash不变。可信测试副本仅把绑定column改为row外壳+单个column内容，保留所有角色、候选、来源与已批准能力后通过真实编译；该反事实夹具不是模型新结果或交付包。

中途失败保留：

1. 首轮新方向8测试中4pass/4fail，包含三个旧实现功能失败及一个越界测试夹具本身违反全局坐标schema。夹具改为“全局合法但在较小父框外”，没有放松schema；新实现后3文件65/65。
2. 首轮新增规则和表字段使旧大型样本超过128000bytes，相关API为152pass/1fail。压缩重复规则，并只对内外方向冲突发送有用的inner建议，未删蓝图/候选/区域/原始草稿或扩大限额。最终旧大型样本127959bytes，本次旧54节点图样本112440bytes，最终153/153。今后增加提示必须继续测外层JSON.stringify(messages)字节，不能只测未转义正文。
3. 图schema的动态payload类型没有直接暴露layout/styleRole静态属性，初次tsc报错；改用Record读取+枚举safeParse，测试副本显式unknown类型，未用any绕过。最终类型和lint通过。
4. 编排初次命令漏设隔离库安全变量，TEST_DATABASE_NOT_AUTHORIZED在连接前拦截，18文件209项通过而一个suite失败；未连接默认库。补齐明确普通隔离库与允许标记后重跑216/216，没有修改数据库防护。首次日志/tmp/kf-layout-obligations-orchestrator-20261026.log。

## 4. 一次真实验收

16:59:48 /61.43s，上限5请求、实际4；识图和蓝图直接通过，独立差异接受与独立蓝图确认完成。新review为43项接受、omit=0，reference before/final相同，无静态行revision。蓝图没有调用repair，不能冒称本轮验证了蓝图修复。

工程初稿graph/v1 JSON合法，但只有5节点/4绑定，SEMANTIC_PLAN_INVALID：overview-read第1步缺能源总览/设备监测/告警中心文字。一次semantic repair后补到53节点/43绑定，但node-header-band没有接入node-page-root，报SEMANTIC_GRAPH_ORPHAN；立即失败，不发布标准成功缓存、不创建BuildJob、不追加费用循环。

离线内存副本只补header→root边后，还出现node-kpi-today的intent.groupWith循环与NATIVE_LAYOUT_INPUT_INVALID；因此“接上header即可成功”不成立。没有写回原响应、删groupWith或把人工副本放进真实流程。这轮只能证明映射建议变化及门槛仍有效，尚不能证明真实工程整体通过布局/native验收。

| task | input/output | hit/miss | latencyMs |
| --- | --- | --- | ---: |
| vision | 1534/2846 | 1280/254 | 9743 |
| blueprint | 10482/2638 | 2304/8178 | 14189 |
| implementation | 26469/1549 | 3456/23013 | 6782 |
| semantic repair | 23636/7457 | 4096/19540 | 23270 |

新证据live-layout-proposal-incomplete-graph共7份公开原字节JSON及README/SHA，initial/repaired对应model-reply-3/4。未包含key/header/reasoning/base64/私有receipt。真实验收使用kf_agent_test_review_flow_20261023_1245，普通回归使用kf_agent_test_visual_binding_20261026_1015；启动前和收尾均21迁移、零其他连接、pendingBuildJobs=0。实际.env、受保护旧库/服务与KF未改动。

收尾26文件清单存在且无重复，其中12个TS；限定清单git diff --check通过。旧深层树7份、上轮平铺图9份和新原稿7份共23份JSON/SHA与私有字段检查通过，四处当前索引已更新@15/repair@4。没有创建整库补丁、提交或重置，也未清理真实调用账本。

## 5. 下一任务与验收条件

下一主线是模型一次输出的完整性与拓扑/分组一致性。先复放新原稿，不能继续追加随机收费尝试：

1. 使用本目录公开review、acceptedDifferences、blueprint与当前knowledge检索候选，调用inspectVisualSemanticResponse。预期初稿观察文字不足、修复稿header孤儿，原字节SHA不变。需诊断更深错误时只用独立内存副本，并明确不是成功工程或新批准结果。
2. 检查初稿为何只输出5节点/4绑定，尽管requiredVisualBindings有43项。为完整区域→节点覆盖增加有界清单/输出前自检，先做离线和PG测试；不删未omit区域、不伪造动作/文本/来源，不把顶层容器代替所有叶节点。反馈不能只剩首个journey错误而隐藏大量未绑定区域，可设计有界结构覆盖诊断，但不能把诊断副本变为成功输出。
3. 将页面根可达性和intent.groupWith图一起纳入模型可理解的有界约束；本稿header根漏引用，KPI groupWith又互引成环。服务器已有硬拒绝仍保持，不能默认接上孤儿、删除groupWith或给第二轮修复。若决定视觉wire不再允许某种自报关系，先改design/合同/装配/规范化/冻结版本与负例，再执行，不能临时服务器猜边。
4. 设备卡片双轴分带属于模糊方向，当前不建议column。需要在新审核提案中展示/选择合适容器组合，或让模型保持已批准row外壳、候选允许的内部column；不能默默把accepted layout.2改成layout.4。当前availableInnerLayoutKinds只投影明确内外方向冲突，不代表完整布局权限表；若扩展其语义，重新冻结并继续测128000bytes上限。
5. 优先建立使用保存公开事实的**新测试Run及新测试审批**，单阶段验证工程，减少重复识图/蓝图费用；本轮仍使用现有完整真实验收，单阶段入口尚未实现。不得恢复/伪造历史私有receipt或把单阶段成功冒充完整流程。离线与PG通过后，再做一次有界真实验收；合格包出现后才进入KF443隔离新工程导入、运行、截图与缩放核对。

## 6. 本切片文件清单

共26文件，相对仓库根目录。补丁如需交付必须保留路径、包含全部本任务最终完整文件；不混入数百项历史脏文件，不提交/reset/stash。JSON为原始公开证据，不加非法注释。

```text
agent-app/packages/domain-client/src/visual/visual-layout-proposal.ts
agent-app/packages/domain-client/src/visual/visual-layout-proposal.test.ts
agent-app/packages/domain-client/src/visual/region-mapping.ts
agent-app/packages/domain-client/src/planning/capability-retrieval.ts
agent-app/packages/domain-client/src/index.ts
agent-app/packages/contracts/src/visual-blueprint-authority.ts
agent-app/apps/api/src/vision/visual-layout-obligations.ts
agent-app/apps/api/src/vision/visual-layout-obligations.test.ts
agent-app/apps/api/src/conversations/deepseek-model.ts
agent-app/apps/api/src/vision/visual-semantic-request.ts
agent-app/apps/api/src/vision/visual-semantic-output.test.ts
agent-app/apps/api/src/runs/visual-run-flow.integration.test.ts
docs/superpowers/specs/2026-10-20-agent-app-next-design.md
agent-app/docs/visual-layout-obligations-20261026.md
agent-app/docs/agent-runs-operations.md
docs/superpowers/plans/2026-10-20-agent-app-handoff.md
docs/superpowers/plans/2026-10-20-agent-app-next-master.md
docs/superpowers/plans/2026-10-20-agent-app-p4-vision.md
agent-app/tests/fixtures/energy-overview-20261023/live-layout-proposal-incomplete-graph/reference-review-before-edit.json
agent-app/tests/fixtures/energy-overview-20261023/live-layout-proposal-incomplete-graph/reference-review.json
agent-app/tests/fixtures/energy-overview-20261023/live-layout-proposal-incomplete-graph/accepted-differences.json
agent-app/tests/fixtures/energy-overview-20261023/live-layout-proposal-incomplete-graph/blueprint.json
agent-app/tests/fixtures/energy-overview-20261023/live-layout-proposal-incomplete-graph/initial-provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-layout-proposal-incomplete-graph/repaired-provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-layout-proposal-incomplete-graph/result.json
agent-app/tests/fixtures/energy-overview-20261023/live-layout-proposal-incomplete-graph/README.md
```
<!-- end -->
