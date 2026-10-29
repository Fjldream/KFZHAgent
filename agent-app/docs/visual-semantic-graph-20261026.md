<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
# 工程生成平铺图协议与真实布局阻塞：2026-10-26

当前源码 **visual-blueprint@8 / visual-blueprint-repair@2 / visual-semantic@14 / visual-semantic-repair@3**。提供方工程输出改为 `kf-visual-semantic-graph/v1`，服务端严格验证引用与归属后装配为原标准语义树；内部缓存、签名、原生编译、制品仍使用 `kf-visual-semantic-plan/v1` 包裹的 `kf-solution-implementation/v1`。文本生成路径保持原格式。

本切片解决上一轮真实工程初稿和一次修复稿均在深层children/root/pages闭合处生成坏JSON的问题。一次新的真实验收中，两份54节点工程图均为合法JSON且可装配；初稿原生布局最小宽度超限，修复稿违反content已确认布局能力，仍无合格能源工程包。总计划/T22继续IN_PROGRESS，预算与业务源暂缓，production vision关闭。

先读本报告及唯一设计基线的“2026-10-26 视觉工程模型传输补充”段，再读 `visual-blueprint-syntax-20261026.md`、`visual-layout-surface-20261026.md` 与 `visual-semantic-repair-20261026.md` 历史。没有部署或连接KF；实际.env、受保护试用库和旧服务未动，无迁移/新依赖。源码要求21迁移，受保护试用库18迁移，不得reset/seed或用新源码直接重启旧试用服务。

## 1. 协议与边界

物理模型响应只接受 `{schema, plan, nodes, bindings}`：

- schema固定为kf-visual-semantic-graph/v1。
- plan保留原projectKey/theme/roleStyles/mockData/localState/pages/overlays/actions/scripts字段；页面和overlay用rootNodeId代替内联root。
- nodes只声明一次。layout使用childNodeIds，repeater使用templateNodeId，registered-module的slots使用childNodeIds；叶节点仍带原控件负载。显式引用顺序就是子节点顺序，nodes声明顺序不影响树或hash。
- bindings仍为regionId/nodeId。语义来源、用户确认与能力候选不由模型重新定义。
- 模型不得提交plan.schema、blueprintHash或candidateBundleHash；仅由服务器使用本次已验证上下文的固定schema和canonical hash装入。该步骤是格式转换，不能补业务内容、候选或节点。

新增contracts模块按现有原生schema的字段名生成负载白名单。负载值原样交给既有别名规范化、严格原生schema和编译器，不在图层把缺失eventBindings补成[]，不丢弃未知字段。graph层的字段允许缺省以保留原有精确诊断，最终原生合同仍决定能否成功；仅图层parse通过不代表工程有效。

组装前强制：最多1000节点、树深度12（根深度0）、JSON负载深度48、页面1..8、overlay最多24、layout/slot子节点1..24。检测重复ID、缺失引用、同节点多父/重复引用、重复根、根被引用、循环（包含不可达循环）、跨页面/overlay共享、孤儿节点。全部检查通过后才递归组装；不静默丢掉未引用节点，不接受旧内联树作为模型响应的fallback。

组装后的树继续走原有完整上下文、严格schema、别名、来源覆盖、候选、视觉绑定、observe/interact、真实编译和component独占provenance检查。原生缓存验证入口保持标准树格式；已COMPLETED缓存若存平铺图直接拒绝，不能重新调用模型或把坏缓存当未完成任务修复。serializeVisualSemanticGraph只用于可信服务器/测试计划的确定性序列化，未作为不可信模型的修复捷径。

## 2. 请求、冻结与一次修复

视觉专用system从已有完整语义规则派生，只替换传输字段和包裹结构；文本生成system保持原样。派生点有原文字面值断言，原system变化而适配遗漏时会失败，避免静默发送混合格式。视觉system明确完整重写平铺JSON、全节点声明、引用/归属限制、服务端固定字段及失败草稿仅作不可信数据。

semantic身份升到@14，repair身份升到@3。冻结fingerprint加入graph wire contract/schema及UTF-16位置反馈版本；signed continuation的scope.schemaVersion为graph/v1。内部canonical schema仍为semantic-plan/v1，不能把内部身份误改为物理传输格式。合同literal、服务请求、冻结prompt/hash、API快照和所有视觉模型夹具已同步。

JSON语法失败保留原始草稿；只从JSON.parse的SyntaxError中抽取有界整数位置 `{unit:"utf16",offset}`，没有任意原始错误消息或服务端补括号。上一轮真实坏稿25545/23731位置已入单元用例，原字节hash保持。unknown/null/length结束原因、坏上下文仍不进入修复。图结构错误给出最多12条有界code/path/nodeId/detail。

原有语义64KiB序列化草稿、12条issue、128000bytes输入、32000输出token、2MiB响应及一次修复额度不扩大。蓝图维持32KiB草稿、8条issue、96KiB输入、8192输出token、80KiB响应。各阶段默认none；服务端开关及签名policy均为once才可调用，所有历史repair版本账本共同限次。取消/actor/权限/base/lease/fence重验保持，不能再加第二/第三次修复。新wire和prompt需排空旧视觉任务/worker、整体升级、新建确认；同run-plan@7不代表可以新旧混部，不修改旧Run/缓存重签。

## 3. 自动验证及失败记录

使用绝对Node路径 `.toolchain/node-v24.19.0-darwin-arm64/bin/node`；完整API设COOKIE_SECURE=true、LANGCHAIN_TRACING_V2=false、LANGSMITH_TRACING=false。PG只用两个隔离测试库，同库套件串行；浏览器测试使用fixture模型，不产生真实模型费用。

| 验证 | 最终结果 | 时间/日志 |
| --- | --- | --- |
| 新图合同单元 | 17/17；含roundtrip、声明乱序、全部拓扑负例、缺失eventBindings保留、repeater/slot/overlay与深度上限 | 已纳入下述全量 |
| 相关四文件 | 165/165 | 16:19:23 /8.68s，/tmp/kf-semantic-graph-focused-final-20261026.log |
| 合同/领域全量 | 93文件2084pass /5既有skip（2089） | 16:21:04 /47.94s，/tmp/kf-semantic-graph-domain-full-20261026.log |
| 编排全量 | 19文件216/216 | 16:21:06 /10.46s，/tmp/kf-semantic-graph-orchestrator-20261026.log |
| API全量 | 71文件1112/1112，零skip | 16:33:35 /391.28s，/tmp/kf-semantic-graph-api-final-20261026.log |
| 其中视觉PG/Chrome | 336/336，240.815s；五种Chrome全通过 | 同上，fixture模型 |
| API/合同类型、13个TS文件lint | 均exit_code=0；最终fixture修改后重跑 | /tmp/kf-semantic-graph-{api-tsc,contract-tsc,lint}-complete-20261026.log |

Chrome保留路径前缀 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-visual-browser-`，static/feedback/workspace-data/observe/repeater后缀依次yqk8nD/OfSC25/dnLWaF/q6ZRYB/pA9NSd。各流程走上传、同意、差异审核、独立蓝图确认及真实签名原生包下载/解包；这些fixture包不能冒充能源图真实生成包或KF运行结果。

中途失败与修正，保留历史：

1. 首轮PG定向40项中39pass/1fail：几何修复断言仍比较原递归树草稿。修正为比较可信夹具序列化后的原平铺图；几何门槛与修复原文保留断言未放松。最终相关3项通过，随后完整336覆盖。日志/tmp/kf-semantic-graph-pg-20261026.log及-pg-final-20261026.log。
2. 首轮完整API为1111pass/1fail（/tmp/kf-semantic-graph-api-full-20261026.log），快照集成测试的DeepSeek假响应还在发送旧内联树，被新wire正确拒绝，stage停在idle。仅更新generation-snapshot.integration.test.ts中模型夹具的序列化；定向12/12后，再跑上述最终全API1112/1112。未放宽stage、缓存、审批或原生断言，未修改认证代码。
3. 早期lint有unused destructuring变量，已改用固定字段过滤，不影响业务值。此前切片偶发401根因仍未证明，本轮全绿不能抹去历史或声称已修好该根因。

## 4. 本轮真实联调

16:24:30 /88.20s，一次新完整验收，实际5物理请求；提供方调用都SUCCEEDED，但最终engineering Run FAILED/INVALID_MODEL_OUTPUT。测试进程exit_code=1是生成验收失败，不能与普通回归全绿合并为成功。

识图成功。蓝图初稿为合法JSON，缺content/footer-note来源；唯一一次blueprint repair补全来源通过，之后独立确认。工程初稿与一次semantic repair均为合法54节点graph/v1，图结构可装配：

- 初稿NATIVE_LAYOUT_UNSATISFIABLE，node-app-shell minimum2214x48、available1360x99920。多个卡片把标题/数值/单位/整行内容直接放在row下，最小宽度累加。没有删卡片角色样式或跳过布局求解。
- 修复稿调整为column，content绑定也从node-body-split(row)改成node-content(column)，触发VISUAL_BLUEPRINT_LAYOUT_CAPABILITY_MISMATCH: content。已接受能力是layout.2；不能用换绑定或静默改审核来冒充成功。其余卡片也有同类row→column变化，首个错误不代表后面已全部合格。
- 两份图序列化27805/27874bytes；上一轮深层JSON闭合问题本样本未再出现。未创建BuildJob/能源工程包、未连接KF，没有运行/像素一致性结论，也不能保证后续模型必然遵循新格式。

| task | input/output | hit/miss | latencyMs |
| --- | --- | --- | ---: |
| vision | 1534/2929 | 1280/254 | 10045 |
| blueprint | 10518/2857 | 2304/8214 | 14915 |
| blueprint repair | 13424/2868 | 10496/2928 | 9945 |
| implementation | 27046/7662 | 0/27046 | 23312 |
| semantic repair | 27914/7677 | 3968/23946 | 22643 |

九份公开原字节JSON及README/SHA在 `tests/fixtures/energy-overview-20261023/live-semantic-graph-layout-constraints/`，保留新蓝图初稿/修复稿与新工程初稿/修复稿。reference before/final相同，无静态行revision，44项接受且omit=0。离线用生产inspectVisualBlueprintResponse、inspectVisualSemanticResponse复放，原响应hash不变；未持久化API key/header/reasoning/base64/私有receipt。

真实调用使用 `kf_agent_test_review_flow_20261023_1245`，普通回归使用 `kf_agent_test_visual_binding_20261026_1015`，均21迁移。收尾两库other_connections=0、pendingBuildJobs=0。未重置真实调用账本，不连接或修改受保护旧试用库/KF，不修改实际.env。

收尾检查：29文件清单均存在且无重复，其中13个TS；限定清单git diff --check通过。旧深层树7份与新平铺图9份JSON共16份原字节SHA、JSON外层解析及私有字段检查通过，4处当前计划/运行入口均指向@14/repair@3；本轮测试/类型/lint进程已确认退出。未创建整库补丁或Git提交。

## 5. 接手后的具体下一步

下一主线是修正布局提案与已审核映射的表达，不再为同一失败随机付费重试。

1. 先离线复现本目录两份图：用公开reference-review+accepted-differences构造VisualPlanningContext，再用blueprint和当前knowledge检索candidate bundle，调用生产inspectVisualSemanticResponse。不得伪造历史私有receipt，不能把离线复放当新签端到端成功。预期初稿宽度错误、修复稿content能力错误，原文件SHA必须保持。
2. 审查 `packages/domain-client/src/planning/capability-retrieval.ts::retrieveVisualCapabilities` 与 `visual/region-mapping.ts::mapVisualRegions`：当前视觉query使用角色、文字、dataShape等；未显式按子区域box推导横纵方向，候选score还是跨查询合并的max。mapVisualRegions按支持度/score/id选一个能力。本轮多个纵向卡片被接受为layout.2，值得验证评分与区域方向的关系；这仍是源码线索，不能直接断言已经完成根因修复。
3. 可选修正应发生在**新提案审核前**：按明确的容器布局提示/子区域几何提供方向建议与候选解释；保留用户覆盖、模糊布局澄清，不把坐标猜测升级为已确认事实。若更改mapping含义，需更新设计、合同、审核revision/hash、前端展示及测试。不能静默改变已接受mapping或删除任一未omit区域。
4. 同时审查semantic repair payload：当前只有requiredVisualBindings/原草稿/错误反馈，可加入有界的“区域→已接受capability→本稿bound node→允许layout kinds”关联，明确保留外层已接受能力，在内部嵌套column/row实现图的纵向内容。既有system已有外层row+内部column规则，不能仅重复空泛提醒；也不能把所有column直接改row，初稿已证明会重现宽度超限。
5. 新增离线/PG用例证明：多行卡片不会累加成超宽row；content绑定保持正确来源与容器归属；修复未改变已接受能力、未吞区域、未扩大候选，原生编译/观察/provenance全部通过。若wire/prompt/feedback改变，升级对应semantic/repair冻结身份，新建审核，不给旧Run补配置重签。
6. 先用保存的公开事实建立**新的测试Run和测试审批**做单阶段有界工程调用，以减少重复识图/蓝图费用；只有具体修正经离线证明后再真实调用。不伪造历史授权/签名、不新增无界次数；单阶段成功不能冒充新完整流程成功。合格包后再做一次新签完整流程和KF443隔离新工程导入/运行/截图，核对原生panel、内边距/边框原点及缩放。

## 6. 本切片交付文件清单

相对仓库根目录，共29文件。若出补丁须使用本任务最终完整文件并保留路径，覆盖每一项；不混入数百个历史脏文件，不提交/reset/stash。JSON是公开证据原件，不添加注释。

```text
agent-app/packages/contracts/src/visual-semantic-graph.ts
agent-app/packages/contracts/src/visual-semantic-graph.test.ts
agent-app/packages/contracts/src/solution-implementation-plan.ts
agent-app/packages/contracts/src/index.ts
agent-app/packages/contracts/src/visual-blueprint-authority.ts
agent-app/apps/api/src/conversations/deepseek-model.ts
agent-app/apps/api/src/conversations/deepseek-model.test.ts
agent-app/apps/api/src/vision/visual-semantic-output.ts
agent-app/apps/api/src/vision/visual-semantic-output.test.ts
agent-app/apps/api/src/vision/visual-semantic-syntax.test.ts
agent-app/apps/api/src/vision/visual-semantic-request.ts
agent-app/apps/api/src/runs/visual-run-flow.integration.test.ts
agent-app/apps/api/src/generation/generation-snapshot.integration.test.ts
docs/superpowers/specs/2026-10-20-agent-app-next-design.md
agent-app/docs/visual-semantic-graph-20261026.md
agent-app/docs/agent-runs-operations.md
docs/superpowers/plans/2026-10-20-agent-app-handoff.md
docs/superpowers/plans/2026-10-20-agent-app-next-master.md
docs/superpowers/plans/2026-10-20-agent-app-p4-vision.md
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-graph-layout-constraints/reference-review-before-edit.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-graph-layout-constraints/reference-review.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-graph-layout-constraints/accepted-differences.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-graph-layout-constraints/blueprint.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-graph-layout-constraints/initial-blueprint-provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-graph-layout-constraints/repaired-blueprint-provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-graph-layout-constraints/initial-provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-graph-layout-constraints/repaired-provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-graph-layout-constraints/result.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-graph-layout-constraints/README.md
```
<!-- end -->
