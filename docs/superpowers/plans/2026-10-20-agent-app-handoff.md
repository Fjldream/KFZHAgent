<!-- modified by jinlong.feng at 2026-10-20 Agent工作台迭代 -->
# Agent App Next Handoff Implementation Plan

<!-- modified by jinlong.feng at 2026-10-27 Agent工作台迭代 -->
**本轮可用版已验收交付（VERIFIED_V1）。** 真实DeepSeek文字生成、原需求继续修改、单图识别/审核/独立蓝图/构建下载、最终历史分叉均通过；三份最终包在独立KF工程导入/逐页读回相等、开发态打开无名称警告/JS错误，测试席位已释放，未发布运行态。最终源码为visual-blueprint@14 / blueprint-repair@8 / visual-semantic@24 / semantic-repair@13，生成名称最长32；结构投影v2及混合坐标/稳定记录key修复已回归。最终包与截图见agent-app/outputs/usable-v1-20261027/native-name-fixed/，父目录旧包为历史负例。入口43301、独立库UTC22迁移；完整验收见agent-app/docs/agent-next-acceptance.md，补丁见同outputs目录patch/。

**接手边界：** 优先级仍为可用流程，UI还原后置；已有图片普通文字续改明确模型前拒绝，T23新同意/局部编辑、完整运行态/交互验收、成本缓存A/B、预算和真实业务源尚未完成。已有repeater记录key集合增删暂不支持，显示值/排序可改；旧长名基线只读/历史下载，新建短名工程继续。下文旧版本号、未启用结论、“下一优先UI”等全部是对应阶段历史，不覆盖本条或最终验收表。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-27 Agent工作台迭代 -->
**接手先读可用版收口记录。** 用户最新要求为“先完成整个产品流程，正常可用一版，UI 图还原后续优化”。本轮入口：`2026-10-27-agent-app-usable-v1.md`、`agent-app/docs/agent-usable-v1-20261027.md`、`agent-next-release-runbook.md` 和最终 `agent-next-acceptance.md`。旧库/旧服务不覆盖；新试用为独立 `kf_agent_trial_v1_20261027`、43300/43301、22 条迁移、私有所有权标记。不要继续按下方历史段落优先优化像素，也不要把历史失败包、fake E2E、旧 KF 往返当成本轮真实验收。
<!-- end -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让下一模型无需前文对话即可安全接手实施、验证与交付。

**Architecture:** master是任务索引，design是唯一设计基线，阶段计划是执行步骤，本文件是动态状态与移交记录。冲突先更新设计与任务，不能只在聊天里改变实现。

**Tech Stack:** 使用仓库现有技术栈与Superpowers实施流程。

**Spec:** `docs/superpowers/specs/2026-10-20-agent-app-next-design.md`

## Global Constraints

- 不覆盖、不重置、不自动提交已有未提交修改；补丁保留原目录，只包含本任务所有新增和修改文件。
- 保留租户鉴权、审批、签名计划、制品绑定、workspace 构建串行与 stale-base 拒绝。
- 新功能默认 feature flag 关闭；先 expand 数据迁移，后灰度启用；本期不做破坏性 contract 迁移。
- 其他约束完整见design §3；每次接手必须阅读，不以本表替代。

---

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
<!-- modified by jinlong.feng at 2026-10-27 Agent工作台迭代 -->
## 当前交接状态（2026-10-27）
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
<!-- modified by jinlong.feng at 2026-10-27 Agent工作台迭代 -->
**当前源码：visual-blueprint@10 / blueprint-repair@4 / visual-semantic@21 / semantic-repair@10。** 先读 `agent-app/docs/visual-blueprint-observations-20261027.md` 和 `docs/superpowers/specs/2026-10-27-agent-native-visual-fidelity.md`。观察文字只取同一明确视觉区域的已审核原文/冻结字段值；模型成功、缓存、准备及复读审批统一检查，原一次修复与输入/反馈上限保持。

**完整真实模型链路已通过，UI还原尚未通过。** 本轮4次真实调用、0规划夹具，新识图/审核38项、omit=0，41节点/38绑定，真实Run/BuildJob成功，原包位于outputs/energy-ui-full-20261027；KF443独立导入/读回/导出/再导入相等。用户随后报告开发态名称错误及严重显示偏差，原包保留历史证据，不能再当作UI修复版。

本轮已修原生安全页名、布局baseProperty.styleDataNew、ElementUI根styleData、背景CSS及横/纵布局子项顺序；直编/补丁/校验一致，EasyUI保持原字段。真实Chrome控件探针已证明Tag/Button CSS可生效、旧RichText仍是默认输入框；完整开发/运行入口尚未验收。**下一优先只读展示文字、字体族、原生尺寸/间距/画布、图标与图表，随后新审核生成独立修复包并对照实机截图。**

合同/领域97文件2132pass/5既有skip；API主批1161pass/1旧字段断言失败后，金标准定向1/1，独立run-flow15/15，合计1177独立用例均执行通过，非单次全绿。类型/lint及详细日志/文件清单见新报告。production vision关闭，T22/总体IN_PROGRESS，预算/业务源暂缓；旧Run不重签，须排空整体升级并新审核/独立确认，原生服务只读、受保护18迁移库及旧服务保持，无新迁移/依赖。

**以下为blueprint@9/repair@3阶段历史：** 先读 `agent-app/docs/visual-binding-feedback-20261027.md`。已实现精确绑定nodeId/批准外层/本区域内层候选、复用原schema的节点必填字段聚合诊断，以及蓝图schema失败时独立检查合法pages的视觉来源；不补默认角色、包节点、猜来源或放宽成功合同，原各阶段一次修复、模型输入和反馈上限保持。旧Run不重签，须排空整体升级并重新审核、独立确认。

**已有真实能源工程包及KF原生往返证据。** `agent-app/outputs/energy-ui-20261027/energy-client.gz` 是@8/2蓝图公开提案、新审核43项后，真实@21/10工程两次调用生成的原始制品，SHA256 ebd0d47c13f568a50afcc9c29113f39a2356100de10f17992baeb5df9f9e59c7。KF443新建EnergyUi20261027及EnergyUiRoundtrip20261027，读回/导出/再导入页面逐值一致；原工程未覆盖，均未发布。该包来源模式明确为semantic-only-with-new-approvals，不能冒充完整真实识图/运行或1:1验收。

完整真实流程首轮识图48区域，蓝图同时有重复expectedTexts和遗漏根app，原一次修复后仍缺来源而停止；8份原JSON保留。@9/3完整新验收识图50区域，蓝图一次修复后成功并独立确认，但工程观察步骤把容器排列说明当作应显示文字；实际delta将content改绑richtext，违反批准layout.4而严格拒绝。新增10份原件与真实负例；本次共12次付费、另4次本地规划提案。下一优先视觉observe与可见原文/页面/区域约束，不能自动删步骤、添加无意义文字或换能力；详见新报告。生成页1440×1628，KF显示/缩放/像素与交互仍未验证。production vision关闭、预算和业务源暂缓、T22/总体IN_PROGRESS；实际.env、受保护18迁移试用库、旧服务未改，无依赖/迁移。
<!-- end -->

**以下为 semantic@19 / repair@8 阶段历史：** 先读 `agent-app/docs/visual-addressable-graph-20261026.md`（27文件清单）。新增可寻址失败草稿合同，仅允许已声明layout.childNodeIds为空；未知字段、缺字段/错类型、身份歧义、数量/64KiB/深度48上限保持。成功graph与装配/native合同仍要求合法结构，delta合并后全量严格校验，不自动补边/删空节点/清分组/换批准能力。

空布局不再遮住独立分组和批准能力诊断；两项显式测试提案已让上轮59节点真实稿通过原完整native预检，未触及节点/plan/样式原值保持。新增PG服务用例证明空布局可在一次delta后缓存标准结果，2次调用/1 repair/重放不再调用。16操作/128变更等原限额不增，新失败合同/资格/诊断进入冻结hash；须排空旧视觉任务/worker、整体升级、新审核/独立确认，旧Run不重签。

最终完整API **76文件1145/1145、零skip**，含视觉343/343与五种Chrome；合同/图43/43，合同/领域2118pass/5既有skip，相关API7文件165/165，PG4项及审核HTTP5项复验通过。API/合同/根类型与13个TS lint通过。首轮1143pass/1fail（socket hang up）保留；审核HTTP场景改为一次监听、finally关闭，减少逐请求启停，未证明中断同源。早前5秒PG超时实际590秒、历史401/404/403及租约故障也未声称根因解决，不放宽门槛掩盖。

20:57单阶段真实验收2次付费，另2次明确本地规划提案，新审核43项/omit=0。初稿55节点/43绑定、无空布局/分组/无用数据，但下半页24节点不可达；一个upsert-nodes的delta接回下半页，未重写plan/样式，repair1531输出token。合并后仅剩devices绑定column与批准row不符。**没有合格能源包、BuildJob、KF运行或1:1结论。** 七份原稿/SHA保留；仅修设备容器组合的内存反事实native预检通过，不当真实结果。

下一步优先在错误反馈指出精确binding.nodeId、实际布局与批准能力/可用内层组合，避免只给code/regionId；模型仍须显式给出合法容器组合，服务器不自动包节点。先离线/PG与128000bytes余量验证、新冻结身份/新审核后再最多2次真实工程调用，合格包后完整真实流程与KF443隔离导入/截图。production vision关闭、预算/业务源暂缓、T22/总体IN_PROGRESS；实际.env、受保护18迁移试用库、旧服务和KF未动，无迁移/依赖。
<!-- end -->

**以下为 semantic@18 / repair@7 阶段历史：** 先读 `agent-app/docs/visual-static-data-20261026.md`（23文件清单）。视觉专用提示按批准观察/交互生成，静态值直接显示，无引用需求的mockData/localState/actions/scripts用[]，必需交互/数据及依赖保留；文本提示与原数据/record-key schema不变，不自动删数据或猜值。

新增失败诊断复用原MockDataSetSchema，最多4项技术占位错误，精确path/rule/rejectedValueHash定位failedDraft内的原值，不在issues重复回显字符串/秘密/注入内容。与原首错/完整性/能力/样式反馈合并仍≤12，草稿64KiB、请求128000bytes及delta/一次额度不增加。新规则/反馈版本进入冻结hash，旧Run不重签，须排空整体升级、新审核/独立确认。

完整API **75文件1138/1138、零skip**，含视觉342/342及五种Chrome；合同/领域2109pass/5既有skip。全量后仅补一项真实负例，最终相关API5文件153/153（新6项）；API/合同/根类型与9个TS lint通过，不能把重叠用例重复累加。历史下载404/stale403/租约故障及401未证明根因，不放宽认证/租约掩盖。

19:36单阶段真实验收2次付费，另2次明确本地规划响应，新审核43项/omit=0。两稿四类依赖数组均[]，上轮模拟数据问题未再现；初稿59节点/43绑定、3个KPI空布局，且已有14个非空groupWith节点含循环。空布局导致按既有合同full-graph修复，修复稿56节点、11个分组节点仍有循环，另有devices能力错误。**没有合格能源包、BuildJob、KF运行或1:1结论。** 七份原文/SHA保留，未加第二轮修复。离线副本修正分组与设备容器组合后native预检通过，不作真实结果/交付。

下一步优先审查“可寻址失败草稿”与严格成功schema的职责：有限结构错误不应遮住其他独立诊断或必然导致整图重写。需先设计合同/冻结版本/边界测试，不放宽成功schema、不自动丢空节点/清groupWith/换批准能力；再新Run最多2次工程验收，合格包后完整真实流程与KF443隔离导入/截图。production vision关闭、预算/业务源暂缓、T22/总体IN_PROGRESS；实际.env、受保护18迁移试用库、旧服务和KF未动，无迁移/依赖。
<!-- end -->

**以下为 semantic@17 / repair@6 阶段历史：** 先读 `agent-app/docs/visual-semantic-delta-20261026.md`（33文件清单）。可寻址草稿的一次修复改为绑定baseDraftHash的delta/v1，保留原初稿graph/v1及内部标准树；16操作/128变更、delta64KiB、合并128KiB，节点/负载/模型输入等原上限保持。七种显式操作，不猜边/业务值；合法既有样式锁定，只有服务端诊断role可改，新role可显式添加；字段/权限/冲突/重复/无变化等严格拒绝。坏外壳/身份歧义仍一次完整graph，delta失败不再回退或第二次修复。

新增独立诊断复用同一真实绑定能力与原生样式compiler，孤儿存在时也能反馈devices与selected态问题；不装配/签名/发布。合并后仍过原全量schema、来源/候选/观察/交互/native/provenance，一次账本、取消/actor/许可/base/lease/fence保持。delta合同/scope/诊断版本进入冻结hash，须排空旧视觉任务/worker、整体升级并新建审核，不能旧Run重签；文本路径保持。

最终完整API **74文件1133/1133、零skip**，含视觉342/342、五种Chrome与run-flow15/15；合同/领域2109pass/5既有skip，编排216/216，相关API163/163、PG定向44项通过。API/合同/领域/根类型及最终18个TS lint通过。首轮下载404、单文件stale retry403与租约等待/FENCE_REJECTED记录保留；独立复验及最终完整回归通过，间歇失败根因和历史401仍未证明，不放宽鉴权/租约或加延时掩盖。

18:10单阶段真实工程验收实际2次付费，另2次明确标记本地规划响应，重新审核43项/omit=0并独立确认/新签名。初稿53节点/43绑定；模型正确返回3项delta、修好devices布局、合法样式未重写，repair仅445输出token，但mockData仍原样含kpi-device-online技术占位值而失败。离线副本仅将该值换对应业务label后通过全量native预检，不能当真实模型成功稿。**没有合格能源包、BuildJob、KF运行或1:1结论。** 七份原JSON/SHA保留。

下一步优先精确反馈被拒绝值/path，并审视静态模式未使用mockData的生成要求；不服务器猜值或放宽placeholder校验。新冻结身份/新审批后才再做最多2次工程验收，合格包后再完整真实流程与KF443隔离导入/截图。production vision关闭、预算/业务源暂缓、T22/总体IN_PROGRESS；实际.env、受保护18迁移试用库、旧服务和KF未改，无迁移/依赖。
<!-- end -->

**以下为 semantic@16 / repair@5 阶段历史：** 先读 `agent-app/docs/visual-semantic-completeness-20261026.md`（26文件清单）。初次/一次修复均有服务端coverageTarget与全requiredVisualBindings；完整性规则进入视觉system和冻结hash。失败后联合反馈缺失区域、无效/缺失绑定节点、根不可达及独立分组错误，保留首个严格错误、去重最多12条；已知缺失regionIds≤100，其他列表≤20并保留count。平铺与标准树共用兄弟分组校验，不接边/删孤儿/补null groupWith；成功仍只能经过严格schema/来源/候选/观察/交互/native/provenance。

旧5节点初稿现可同时反馈39个缺失区域与journey错误；旧53节点修复稿同时反馈header不可达与KPI循环，原文hash不变。新增单阶段真实验收：保存的公开spec/blueprint作为本地提案，重新创建审核/独立确认/新工程签名，只有工程阶段最多2次真实调用。result标明两次本地规划夹具、0 token及真实调用数，不复用旧receipt，也不冒充本轮新完整识图验收；原完整验收模式保持。

最终API **73文件1127/1127、零skip**，含视觉339/339与五种Chrome；合同/领域2092pass/5既有skip，编排216/216，PG定向5项通过，API/领域/合同/根类型及11个TS lint通过。根tsconfig仅显式纳入新测试helper；初始类型/lint红灯及修正详见报告，没有放宽门槛/认证。历史偶发401根因仍未证明。

17:29单阶段真实验收实际2次工程请求，另有2个明确标记的本地规划响应；43项重新接受、omit=0，无静态行revision。两份真实稿均53节点/43绑定、groupWith空：初稿漏接subtitle，一次修复已接入却新增roleStyles.7.disabled非法字段。初稿补边的离线反事实还揭示devices能力不符及button.root.selected不支持。**没有合格能源包、BuildJob、KF运行或1:1结论**，不删disabled或改旧审核来制造成功。

下一优先修复全图重写造成的合法字段回归，并复用真实能力/样式校验给出有界联合反馈；可先设计按稳定id的受限局部替换/patch合同，完整验证后才采用，不服务器猜边或增第二轮修复。用新单阶段入口新建Run/审批，合格包后再新签完整流程与KF443隔离导入/截图。production vision关闭、预算/业务源暂缓、T22/总体IN_PROGRESS；实际.env、受保护18迁移试用库、旧服务及KF未动，无迁移/依赖，两个隔离库均21迁移、零其他连接、pendingBuildJobs=0。
<!-- end -->

**以下为 semantic@15 / repair@4 阶段历史：** 先读 `agent-app/docs/visual-layout-obligations-20261026.md`（26文件清单）。视觉候选保留本region自己的score/admission，不借用别的region最高分；明确单轴子框在新审核提案中建议row/column，并显示待审核理由。模糊网格/重叠/单子节点/越界不猜方向，旧review/accepted mappings不重算。

工程及修复请求逐项区分已批准directLayoutKinds、内部排列建议及本区域实际允许的inner类型；修复还保留parentRegionId/referenceBox与有界草稿绑定节点观察。保留外层能力、候选和来源，纵向内容可在已批准row外壳内组合column，styleRole只放外壳。服务器不自动包节点/接孤儿/删groupWith。规则/obligation版本进入冻结hash，仍为graph/v1传输、标准树缓存/签名/编译；128000bytes输入、64KiB草稿及一次修复不增加，旧Run不得补配置重签、须排空整体升级新建确认。

最终API **72文件1118/1118、零skip**，含视觉337/337与五种Chrome；相关API153/153，合同/领域2092pass/5既有skip，编排216/216，PG定向8项通过，API/领域/合同类型及12文件lint通过。首次输入超限及编排安全变量漏设的失败记录见新报告；未改认证或放宽防护，历史偶发401根因仍未证明。26文件清单及新旧23份JSON/SHA检查通过，两隔离库均21迁移、零其他连接、pendingBuildJobs=0。

16:59真实验收上限5、实际4请求：识图和蓝图直接通过并独立确认，43项接受、omit=0，无静态行revision。main/三张KPI/summary已为纵向建议；devices双轴模糊仍接受layout.2。工程初稿仅5节点/4绑定，缺观察文字；一次修复53节点/43绑定，但页头node-header-band未接入根，报SEMANTIC_GRAPH_ORPHAN。内存反事实补边后还有KPI groupWith循环，不能宣称接边就合格。**无能源工程包、BuildJob或KF运行/1:1结论**；新证据7份JSON/SHA原字节保留，未加第二轮付费。

下一优先模型区域覆盖完整性及根可达/groupWith一致性：先复放新原稿、补充有界覆盖诊断/约束及PG用例，不能服务器猜边删关系或漏区域。模糊devices保留审核能力，再选择合法容器组合；建议实现基于公开事实的新测试Run/新审批的单阶段工程验收，减少重复识图/蓝图费用，不能伪造旧receipt。合格包后才KF443隔离导入/截图。production vision关闭、预算/业务源暂缓、T22/总体IN_PROGRESS；实际.env、受保护18迁移试用库、旧服务与KF未动，无迁移/依赖。
<!-- end -->

**以下为 semantic@14 / repair@3 阶段历史：** 先读 `agent-app/docs/visual-semantic-graph-20261026.md`（29文件清单）。工程模型传输为graph/v1：平铺nodes与显式引用，服务器验证重复/缺失/多父/跨根共享/循环/孤儿及1000节点、12层、负载深度48上限后装配；内部缓存/签名/原生编译仍为标准semantic-plan/v1树。旧树模型响应不回退、graph格式COMPLETED缓存拒绝；严格原生schema/来源/候选/观察/交互/provenance保持。

语义冻结加入wire与有界UTF-16语法位置指纹，scope使用graph/v1，文本路径保持；64KiB草稿、12条issue、128000bytes输入及一次修复不扩大，所有历史repair版本共同限次。旧25545/23731语法负例保留原文并加入复放用例。须排空旧视觉任务/worker整体升级、新建审核，不改旧Run/缓存重签，同run-plan@7不能混部。

最终API **71文件1112/1112、零skip**，含视觉336/336与五种Chrome；合同/领域2084pass/5既有skip，编排216/216，API/合同类型及13文件lint通过。首轮API1111/1因一处模型测试夹具仍发旧树，改夹具后定向12/12再完整复验；未改认证或放松门槛，历史偶发401根因仍未证明。

16:24真实验收实际5请求：识图通过，蓝图初稿缺content/footer-note来源，一次blueprint repair补全后独立确认；工程初稿和一次semantic repair均为合法54节点图且可装配。初稿原生最小宽度2214超出1360，修复稿改为column后违反content已接受layout.2。额度耗尽即停，**没有能源工程包、BuildJob或KF运行/1:1结论**。新live-semantic-graph-layout-constraints九份JSON/SHA保持原文，44项接受、omit=0，无静态行revision。

下一优先按报告离线复现并审查视觉候选评分/区域子框方向及repair绑定约束：当前评分未显式建模横纵方向，不能静默改已接受能力、删区域或全部强制row。先证明正确容器组合/布局与来源，再新签有界工程调用；合格包后才做KF443隔离导入/运行/截图。production vision关闭，预算与业务源暂缓，T22/总体IN_PROGRESS；实际.env、受保护18迁移试用库、旧服务与KF未动，无迁移/依赖。两隔离测试库均21迁移、零其他连接、pendingBuildJobs=0。
<!-- end -->

**以下为 semantic@13 / repair@2 阶段历史：** 先读 `agent-app/docs/visual-blueprint-syntax-20261026.md`。蓝图只允许stop、完整对象外壳、原32KiB草稿进入一次JSON语法修复；未知结束原因/数组/超限/坏审核事实/坏缓存拒绝。共享限额、冻结hash、合同literal已同步，修复账本统计所有历史blueprint repair版本，取消/actor/许可/lease/fence保护保持。

最终API **71文件1108/1108、零skip**，含视觉334/334与五种Chrome；合同/领域2067pass/5既有skip，编排216/216，API/合同类型与8文件lint通过。没有修改鉴权、超时或放宽断言；前一切片偶发401根因仍未证明，不因本轮全绿抹去历史。

15:36真实新验收实际4请求：识图、蓝图与独立确认通过；本次蓝图直接合法，没有触发blueprint repair。工程初稿及一次semantic repair都在深层节点树闭合处返回坏JSON（offset25545/23731），即停止，未进入native preflight/BuildJob。新证据live-semantic-unbalanced-tree七份JSON/SHA保持原文；没有能源包、KF运行或1:1结论，不能把fixture成功冒充真实交付。

下一优先工程大JSON结构稳定性：离线复放两份新坏稿，设计有界位置反馈/缩小生成单元或扁平引用结构及严格服务端组装；不得猜括号、删节点、接受JSON5或增加第二次repair。变更协议须新冻结版本/新审批，不改旧Run/缓存重签；单阶段真实验收可使用保存的公开reference/blueprint建立新测试Run和新测试审批以降低重复费用，不能伪造旧receipt。JSON合法后再处理content布局绑定，合格包后才做KF443隔离导入/运行/截图。

production vision仍关闭，旧任务/worker须排空整体升级，同run-plan@7不支持混部。实际.env、受保护试用库、旧服务和KF未改动，无迁移/依赖；预算与业务源暂缓，T22/总体仍IN_PROGRESS。下方@7/@12说明均为历史，详细证据与本切片文件清单以新报告为准。
<!-- end -->

**以下为 blueprint@7 / semantic@13 阶段历史：** 先读 `agent-app/docs/visual-layout-surface-20261026.md`。可选 layout.styleRole 已贯通合同、角色引用、padding/四边 border 测量、布局内容空间、原生样式及 signed package/import；contentInsets 是编译器元数据，并有来源和滚动范围再校验。未声明角色时保持旧行为；容器实例覆盖、状态尺寸改变及背景图资产不开放。

受控夹具已通过真实签名、patch、validate、package、import；合同/领域完整2067 passed / 5既有skip，编排216/216，视觉PG/五种Chrome两轮各311/311。四个包类型检查与18文件lint通过。全API仍有1068pass/1会话初始化401，随后认证+Run定向26/26，根因未证明，不能宣称全量全绿。详见新报告及29文件清单。

原能源响应五个卡片角色全部保留，仍有content布局能力不符。15:09又做一次明确有界的真实验收，实际2请求；识图成功，蓝图finishReason=stop但JSON语法错误，当前parse直接失败未进入once修复，工程阶段未到达。新证据live-blueprint-json-syntax五份JSON/SHA已保留；没有能源图合格包、KF运行或1:1结论。

下一优先按报告修复蓝图有界JSON语法通道（拟blueprint@8/repair@2，当前尚未实现；严格stop/完整外壳/64KiB、跨版本账本限次、缓存不修复），再修正新工程提案的区域容器/精确绑定。不手工补JSON、不删样式、不改旧Run/缓存重签，不追加随机付费循环。合法能源包出现后才做KF443隔离新工程导入/截图，核对原生panel、边框原点和缩放。排空旧视觉任务/worker后整体升级重新确认；production vision继续关闭，同run-plan@7不支持混部。实际.env、受保护试用库、旧服务未动，无迁移/依赖；预算和业务源暂缓，T22/总体仍IN_PROGRESS。
<!-- end -->

**以下为 @12 阶段历史（新状态及测试以以上报告为准）：** 先读 `agent-app/docs/visual-semantic-repair-20261026.md`。蓝图/语义各有一次独立修复额度；默认none，服务器对应开关及签名continuation都为once才可调用。语义支持有界、非截断完整外壳的JSON语法修复及schema/来源/真实编译反馈；缓存不修复，额度+所有版本repair账本限次，actor/许可/lease/fence保护保持。候选详情只含最终实际公布能力；真实provenance检查componentId独占归属，独立视觉行使用独立静态节点，不猜来源或自动补业务元数据。

当前完整视觉PG/五种Chrome311/311、相关四文件162/162及API类型通过；完整API1057/1057是@10阶段结果，后续@12视觉及定向结果分开记录，不能宣称已跑最终全API。领域1481 passed/5既有skip；完整历史、首次两项连接/登录态失败及后续全量绿灯、hash与文件清单均见新报告，不合并或擦除旧事实。

本轮五个真实新验收共14物理请求，最新两轮一次修复均把坏JSON变为可解析对象；仍无能源工程包/KF运行/1:1结论。最新repeater=0，剩余5个布局容器styleRole=card-surface不被当前合同/测量编译支持，内存删字段后还有content布局能力不符。已停止追加随机请求；下一优先设计并贯通容器角色样式、padding/border布局及原生handoff，再修正新提案布局能力，不删样式或改旧Run/缓存重签。合法包出现后才做KF443隔离新工程导入与截图验收。

production vision关闭，须排空旧视觉任务/worker、整体升级并新建确认，同run-plan@7不支持混部。预算与业务源暂缓，T22/总体IN_PROGRESS。实际.env、受保护试用库18对源码21迁移及旧服务保持；禁止reset/seed或直接新源码重启，无新迁移/依赖。本轮仅清理两个隔离测试库的夹具数据；未连接KF环境。下方旧版本及“语义修复尚缺”均为历史。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
**最新复验/真实模型注意：** 最新协议 visual-blueprint@4 / visual-semantic@4；两个新正式验收共5调用，第二轮已过识图与独立蓝图，工程仍因 recipeId 混用布局能力失败，离线反事实还证实三个静态侧栏按钮不符合区域候选。保存两组新真实负例，未放宽门槛，没有真实能源包/KF结论。重复观察与双实例 Chrome 包核对已通过。最新@4/@4全量为1008通过/2超时/1异步FENCE错误，不是全绿：电源日志确认期间18:17合盖和后续长时间维护睡眠；需机器连续唤醒约6分钟后，先复跑 click-feedback、submitted engineering proof/result，再全量复验。未改用户电源/试用服务或删测试，细节和证据见最新报告。之后再审查视觉映射/候选一致性与有界语义修复，不继续盲目付费重跑。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
### 当前续做：有界 mock 重复实例已可证明

先读 `agent-app/docs/visual-repeater-observation-20261023.md`。原 solution-provenance 的实例展开/key/父链/别名作用域已提取为共享 contracts 投影，旧路径 re-export 保持，模块 registry 回放不放开。观察只取真实模板所用字符串，native 再核对具体实例/最近 repeater/内容/父链/样式/屏内几何，artifact/签名/快照保持。真实领域编译及8项实例负例通过，新 Chrome 确认两项期望原文、真实下载/解包核对两个独立控件（fixture），完整回归与真实模型结果见报告。

旧能源响应在新的明确 observe 单元蓝图下，全部 KPI/设备/摘要观察通过；原始五份负例没改，侧栏 button 候选不符仍正确阻断，不能扩大候选或手改历史签名数据。下一优先当前冻结协议/实际候选的真实新规划与包验收，再 KF443 隔离新工程运行/截图。最新 visual-semantic@4 / visual-blueprint@4，须排空整体升级，production vision关闭；业务源暂缓，T22/整体仍未完成。下方重复观察尚缺与旧协议号均历史。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
### 当前续做：受限静态观察旅程，不伪造交互

先读 `agent-app/docs/visual-observation-journeys-20261023.md`。明确 observe + 去重非空 expectedTexts 已接通合同、提示词、API 共用覆盖、领域原生证明、制品再证明与审批展示。interact/旧缺字段保持原动作所属/闭包门槛；观察不允许 action 冒充。新增 Chrome observe 实际通过独立蓝图确认、原图/工程图、原生编译/签名/快照/BuildExecutor、一次性下载与解包精确文字核对，模型本地 fixture，非能源图真实模型/KF质量验收。

下一切片不要重复静态标题支持：重点是已确认有界 mock 重复模板的实际物化实例证明，保留动态/隐藏/错误页面区域拒绝；同时真实旧响应侧栏 button 不在该区域候选中，须按真实候选重新生成，不能扩大候选或自动删区域。原 live-negative 不改写，旧无 kind 不自动重解释。新协议 visual-blueprint@3 / visual-semantic@2，需排空旧任务/worker整体升级；生产 vision 关闭，T22/总体计划仍未完，业务源继续暂缓。

测试命令、最终回归、所有中间失败、20份源文件和下一执行顺序以新报告为准；不复制聊天凭据、不触碰受保护试用库/环境，不将 fixture 下载包冒充真实能源交付。下方真实调用历史仍保留。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
### 最新续做：真实能源 UI 模型联调，业务数据源暂缓

优先读 `agent-app/docs/visual-real-model-20261023.md` 和 `agent-app/tests/fixtures/energy-overview-20261023/README.md`。用户已明确优先客户端工程生成、业务源暂不做，并授权真实 DeepSeek/提供 KF 测试环境；凭据不在仓库，勿从聊天抄进代码。已用内置 imagegen 生成验收图并验证真实官方模型列表/图片输入，KF443 HEAD=200，但浏览器证书不受信任，未登录或远程写入。

真实识图→差异接受→修复后的独立蓝图→工程模型调用已执行。修复识图输出协议、识图凭据route绑定、蓝图完整JSON Schema提示词、视觉语义别名规范化顺序；保留原受限提议/人工确认，不把提议当执行授权。**没有本轮可交付包，未验KF运行/像素一致。** 最新真实负例可完全离线重放，当前卡在静态浏览旅程也被强制要求可执行动作覆盖；下一步先设计观察/交互的明确合同并红测，不能伪造动作、删除旅程或放宽全部旅程门槛。再真实工程打包和KF独立测试工程验收，不继续扩展业务源目录。

`vision@v2`、`visual-blueprint@2` 及新冻结合同/hash与旧任务/worker不混部，仍需排空整体升级；production vision关闭，T22/总体计划IN_PROGRESS。付费实验与普通回归结果、所有中间失败、12份TS改动及验收图/负例清单见报告，不将provider SUCCEEDED当工程成功。无实际.env/试用进程/迁移/依赖/提交/子代理；预算暂缓、21对18试用保护与旧接口退役不变。下方优先业务源的“下一步”及未做任何真实模型调用均是历史状态。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
### 最新续做：T22 当前工作区名称的服务端只读快照

- 先读 `agent-app/docs/visual-workspace-data-20261023.md`。dataRequirement 只允许当前工作区 name 的字段选择、role=text，缺字段保持/null 清除，新区先保存；不允许 client value、工作区/租户 ID、URL、凭据/native。服务端从 Run 精确 tenant/workspace 查询真实记录，冻结 dataSnapshots 到签名 review，不写进可跨工作区复用的图像分析缓存。
- 原 actor/gates/base/TTL/原子 child/history/current CAS/幂等/事件/审计与独立批准保持。UI 原生折叠表单，保存后展示实际确认值并清旧风险选择；非实时、会传入后续规划。已发布版本/重放/确认后重命名不刷新；新有效修订重新读当前名称并要求重新确认，no-op 不刷新。dataChangedCount 统计选择变化，不复制名称正文。
- 仅真实 text 候选，不自动用 richtext/布局替代，不把静态证据标已验证绑定或消除原 hint。快照与 spec 一对一覆盖；模型语义/编译 provenance 校验精确单节点/同值/空属性事件/tabIds/无 mock；native/sourceMap/快照再核对精确 owner/text，无交互。普通字段说明始终未验证，不授予连接权限。
- 原 static/feedback Chrome 保留，新 workspace-data Chrome 手机选择→服务端取值展示→差异接受→数据库重命名→独立蓝图/语义/native/sign/snapshot/BuildExecutor/一次性下载，实际两类 provider user JSON 和解包后精确 native owner 的 text 都仍为原确认值。不以计划内同值或模拟数据充当真实来源；模型仍本地 fixture、非 KF 原生运行/1:1。
- 最终 API **64 文件 988/988、零 skip**（15:40:31 / 285.03s，275 视觉流程/三项 Chrome）；随后串行 domain **68 文件 1431 passed / 5 原有 skipped**（15:52:09 / 45.03s）；Web **175/175**、contracts **525/525**、root/API tsc、最终 vue-tsc、14 TS lint/build 通过。中间 fixture strict/context、UUID 名称被安全规则拒绝、唯一名称竞争和 Vue 类型问题均保留报告，不放宽产品/timeout/retry/skip/原断言。既有 lease cleanup WARN 未治。
- **T22/整体 IN_PROGRESS，production vision 关闭。** 本批只读工作区元数据快照，不代表真实业务源、通用 SQL/HTTP/KF 变量或实时更新。下一步业务源目录/字段类型/读权限/凭据边界/撤权与原生适配，再原未知 hint/其他交互/替代/可信 retry、T17/T23、T24–T27。不要重复基础上传/下载/区域编辑/反馈/名称快照。
- 15 份代码/测试与配套文档见报告，无新 schema/迁移/依赖/真实 env/key/试用服务操作、收费/真实 KF 调用或提交。原隔离库测试后 21 迁移/零其他连接，证据保留；保护旧试用 18 对源码 21，预算暂缓、旧接口退役保持。新视觉 prompt/hash 与 reference 字段仍须排空整体升级，同 @7 不等于可混部；系统/真实质量与发布专项未验。下方尚无数据绑定和旧计数均历史。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
### 最新续做：T22 有结构化要求的本地点击反馈闭环

- 先完整读 `agent-app/docs/visual-click-feedback-20261023.md`。本批不是再次加备注：action 区域可选 interactionRequirement={kind:click-feedback,message,level}，1–400 字且复用语义文本安全校验；只有已保存区域配置，缺字段保持/显式 null 清除，原 hint/未知问题不自动解决，不接 native/脚本/网络权限。
- 原 revision 原子 child/TTL/specHash/HMAC/history/current CAS/新回执/幂等/审计复用，新增 interactionChangedCount，不记录正文；并发三项和回滚随完整 API 验证。原 UI details 选项与只读执行要求、忙碌/长度/role/保存后重新选择保持，沿用 frontend-skill 克制布局，不新建生成旁路。
- 仅真实 eligible button，证据要求 click，不把静态报告视为行为验证；模型/编译 provenance 验证要求精确直接 button→唯一 click→唯一无条件/无依赖/无后继 show-feedback，文字/级别一致，不允许脚本/其他节点/多动作替代。sourceMap/快照再校验精确 native owner 的唯一 onClick/event、无脚本、唯一对应 native feedback。普通文字 prompt/其他组件行为不改。
- 原 static Chrome 继续保留，新增 feedback 版本实际手机配置→新回执→差异接受→独立蓝图/真实旅程步骤→语义/native/sign/snapshot/真实 BuildExecutor→一次性下载；按 sourceMap 精确解包找到绑定按钮 onClick/ShowMessage 的实际字节，不只看计划。fixture/provider payload 转义检查、嵌套控件查找等中间失败均保留报告，不改产品或放宽断言。
- 最终完整 API **64 文件 975/975、零 skip**（14:55:20 / 288.82s，262 视觉流程、static/feedback 两项 Chrome）；API 完成后串行 domain **68 文件 1419 passed / 5 原有 skipped**（15:00:29 / 44.04s）。Web **26 文件 172/172**、contracts **21 文件 523/523**，root/API tsc、Web vue-tsc、13 TS lint 和 build 通过。命令/证据/中间失败见报告 §6；既有 lease cleanup WARN 仍在，不宣称系统级根因已治。浏览器模型本地 fixture、组合根 staged policy，不是生产灰度/KF Windows 或 1:1 质量。
- **T22/计划 IN_PROGRESS，production vision 关闭。** 后续优先真实数据源目录/有类型与作用域的只读绑定合同及编译验证、原未知 hint 的明确解决，再其他受限交互/替代/可信 visual retry、T17/T23、T24–T27。没有已授权源与凭据边界时不能编造“已连接”。不重复基础上传/下载/区域编辑或本地反馈。
- 14 份代码/测试和配套文档见报告。只用原安全隔离库，未动真实 .env/key/试用服务/18 迁移业务库，无迁移/依赖/收费/KF 请求或提交。预算暂缓、旧 POST/analysis PATCH 退役、源码 21 对试用 18 保护保持；新视觉 prompt/hash 和严格 spec 不能据同 @7 混部，需排空整体升级。OS kill/资源/代理/多副本/发布回退/真实质量仍未验。下方尚无结构化交互及旧计数均历史。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
### 最新续做：T22 交互/数据来源补充说明（不是可执行绑定）

- 先读 `agent-app/docs/visual-clarification-notes-20261023.md`。VisualRegion 可选 clarifications 的 interaction/dataSource 均为有界未验证文本；已保存区域沿原 revision 更新，缺字段保持、双 null 清除本轮说明。原 interactionHint/uncertainties/来源/置信度/TTL 不可被说明解决或覆盖，不接 native/凭据/endpoint/执行权限字段。
- 原子 child/specHash/HMAC/history/current CAS/新回执/事件/审计/幂等复用，审计只记 clarifiedCount 不复制备注；添加、清空、旧接受竞争与后置审计回滚已测。原未知 hint 仍 unsupported；仅静态 verified 的区域带非空说明时降为 supported_unverified，不能提升证据或自动连接外部服务。
- 按 frontend-skill 延续现有原图/区域表单，原生 details 显示“未验证/未绑定”，新区先保存。完整 browser-safe schema/大小限制和迟到响应隔离保持；保存后重新选差异并独立批准蓝图。扩展原 Chrome 实际断言蓝图与语义两类 provider JSON 收到说明，再经原 native/签名/快照/BuildExecutor/一次性下载；本地模型与测试 staged policy 不等于 rollout/真实行为验收。
- **最终 API 64 文件 963/963、零 skip**（14:27:56 / 333.55s，250 视觉流程/Chrome），Web 169、contracts 521；API 完成后串行 domain **68 文件 1404 passed / 5 原有 skipped**（14:34:30 / 42.18s）。root/API tsc、vue-tsc、10 TS lint、Web build 通过。首轮默认并行 domain 的一项原 5000ms 超时、单文件复验及最终全量均保留报告；没有修改超时/retry/skip/原断言，也没有根因定论。既有 lease cleanup WARN 仍出现。
- **T22/计划 IN_PROGRESS，production vision 关闭。** 下一模型先设计有能力证据的结构化交互要求与数据绑定/闭环验证，不能把备注框当完成；再 substitute/可信 visual retry、T17/T23、T24–T27。真实 provider/KF/Windows/1:1 与 OS kill/资源/代理/多副本/整体升级回退仍待验，预算限制暂缓。
- 本批 11 份代码/测试与报告/master/handoff/P4/design §10/operations，清单见报告。未改 schema/迁移/依赖/实际环境/试用进程，无收费/真实 KF 请求或提交。隔离测试库 21 迁移、无其他连接且保留；旧试用 18 对源码 21 不动，新可选字段对旧严格 worker 不兼容，即使同 @7 也须排空整体升级；旧 POST/analysis PATCH 退役保持。下方备注未接与旧计数均历史，不重复基础下载/层级/备注接线。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
### 最新续做：T22 识别区域父子层级调整

- 先读 `agent-app/docs/visual-region-hierarchy-20261023.md`。revision.regions 可选 parentId（同分析区域或 null）；缺字段保持旧关系/hash，additions 仍 root、临时 ID 不作父，新区保存后再调整。坐标全局归一化，不自动改变 box/内容/native；分析版本 parentId 仍是上一分析 ID，不能与区域父节点混用。
- 对更新后的完整 spec 检查未知/已删父、自/直接和间接循环。保留子节点须显式移出原父节点才能删除父节点；原删除/恢复与问题保留规则不变。原 actor/gates/base/TTL/签名、immutable child/history/current CAS/回执/事件/审计原子性继续复用，新增 reparentedCount；幂等、竞争、后置审计失败回滚已测。
- 现有 UI 父选择与 details 缩进预览，排除自身/后代/待删/临时父候选；浏览器安全 subpath 复用完整 spec 校验，不引入 Node barrel/新库或动画。保存重新匹配并清空旧差异选择，独立蓝图批准不变。
- **最终完整 API 64 文件 952/952、无 skip**（14:05:17 / 274.58s，完整 239 视觉流程/Chrome 手机层级→工程下载），Web 165、contracts 517；root/API tsc、Web vue-tsc、6 TS lint、Web build 通过。红测/所有命令与证据见报告。测试进程已退出，隔离库与证据保留；其他包独立全量本批未重跑。
- **T22/计划仍 IN_PROGRESS、production vision 关闭。** 下一步交互/数据源编辑、substitute/可信 visual retry；随后 T17/T23、T24–T27。真实 provider/KF/Windows/1:1、OS kill/全局调度/资源/代理/多副本/升级回退未验，短 lease/偶发 404/cleanup WARN 不冒充根治。
- 仅报告列明 7 份代码/测试与配套文档，无 schema/迁移/manifest/依赖、实际 env/key/试用进程/收费请求/commit/push/worktree/子代理操作；预算暂缓、旧试用 18 对源码 21 与整体排空升级、旧 POST 退役保持。下方层级缺口/旧数字均历史，不重复建设本批功能。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
### 最新续做：T22 识别区域增删与浏览器安全输入合同

- 优先读 `agent-app/docs/visual-region-structure-20261023.md`。现有 revision POST 支持 additions/removals，兼容旧 updates hash/幂等；仅 role/text/box，服务端分配 ID/root/confidence=0/未知问题，不允许 native/层级/置信度权限注入。总操作 1–100、最终区域 1–100、UTF-8 64 KiB/问题上限；父节点删除需显式全部后代，删除相关未知问题保留为 global。
- 同原锁序、原 TTL/actor/gates 和 immutable child→remap→history/CAS/签名 receipt/event/audit 事务；相同请求无重复区域/审计，编辑与接受竞争/审计失败回滚已测。原 UI 新增预览、待删/恢复、放弃、父子依赖/边界限制，保存后仍重新选择差异、独立确认蓝图。
- 初版前端值导入完整 contracts barrel 导致 Node crypto build/页面失败，已抽纯 `visual-review-revision.ts`，保留服务器 re-export，加明确 browser subpath；不引入 polyfill/新依赖或放宽检查。manifest JSON 注释例外定位见报告。
- **最终完整 API 64 文件 942/942、无 skip**（13:43:38 / 260.78s；完整 229 视觉流程/扩展 Chrome 手机增删→实际工程下载），Web 26 文件 161、contracts 21 文件 515；root/API tsc、Web vue-tsc、8 TS lint、Web build 通过。全部中间失败与证据见报告，不沿用旧数字冒充本轮；临时测试进程退出，隔离库与证据保留。
- **T22/计划仍 IN_PROGRESS、production vision 关闭。** 下一步层级/交互与数据源编辑、substitute/可信视觉 retry，再 T17/T23 历史/局部修改与 T24–T27。真实 provider/KF/Windows/1:1、OS kill/全局调度/资源/代理/多副本/升级回退仍缺，历史短 lease/404/cleanup WARN 不声称根治。
- 未迁移 schema/改实际 env/key/试用进程、未收费请求/commit/push/worktree/子代理，保留 mixed dirty。预算暂缓、旧接口退役、旧试用 18 对源码 21 和排空整体升级保护不变。下方均历史，“区域增删未实现”不再代表当前。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
### 最新续做：I1 审批并发确定性验收收口

- 先读 `agent-app/docs/approval-concurrency-20261023.md`。原旧领域驱动器并发用例把 Promise.all 当作锁内重叠，晚请求可在胜出者释放后合法取得锁并看到已消费审批；当前用真实审计提交 gate 确认 ADMITTED fence/已清 interrupt，再严格断言两个 BUSY，释放后唯一审计/构建。新增独立释放后重放精确 NO_PENDING_APPROVAL，绝不把两个码任选其一。
- 代码只改 `apps/api/src/api.integration.test.ts`；不改生产/测试驱动器审批实现、lease、Run/视觉合同、schema 或测试 timeout/retry/skip。红测/命令/环境边界完整保留报告；无逐请求日志的旧失败不能倒填其确切时序。
- **最终 API 64 文件 927/927、0 failed/0 skipped**（13:20:50 / 252.22s，含全部 214 视觉流程与真实 Chrome 编辑→工程下载）；API/root tsc、修改文件 ESLint 通过。其他包/Web独立全量本批未重跑，不沿用旧数字冒充。临时测试进程已退出，隔离库与浏览器证据保留。
- **本项收口，T22/整体计划仍 IN_PROGRESS、production vision 仍关闭。** 下一步回到区域增删/层级/交互与数据源、substitute/visual retry；随后 T17/T23 和 T24–T27。API/worker OS kill、全局调度、资源/代理/多副本、升级/回退、真实 provider/KF/Windows/1:1 仍缺。短 lease/偶发 404/cleanup WARN 不声称根治。
- 旧试用 18 对源码 21 保护、排空整体升级、预算暂缓、旧 POST 永不恢复保持；无实际 env/key/试用迁移或服务操作、无收费请求/commit/push/worktree/子代理。下方所有失败数字与“下一步先定位 I1”为历史记录。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
### 最新续做：T22 已有识别区域编辑与原子新回执

- 先读 `agent-app/docs/visual-review-editing-20261023.md`。新 POST runs/:id/visual-review/revisions 严格 region patches/UUID/receipt/hash，Cookie/Origin、当前独立 gates/tenant/原 actor/WAITING/base/TTL 校验；相同请求幂等，不同输入/陈旧版本 409。旧 analysis-only PATCH 404，GET 保留。
- 同事务 immutable analysis child（继承 TTL/原图/模型事实）→重算能力→旧签名 history→当前 review CAS/新 revision 元数据 HMAC→新事件/seq/审计；失败回滚，无模型/新 Run/新工程。读取验证直接前版 HMAC/scope/config/base/actor/child.parentId。编辑后旧 receipt 不能接受；不能倒签旧确认。
- 原确认卡编辑文字/类型/位置、未保存预览/放弃/边界/UTF-8 64 KiB 校验。保存后 SSE/GET 新回执清空旧风险选择，网络失败保留草稿+requestId；409/多标签页/手工重读一起刷新事件，迟到响应不串会话。手机 Chrome 编辑→新接受→正式蓝图/工程/native/下载 hash 已扩展验证，仍本地模型/测试策略，不冒充 rollout/真实质量/全局调度。
- API 新 25 项、更新两条退役检查并扩展原 Chrome；Store 只读收尾额外支持 worker 精确原 hash 的已发布归档，避免立即编辑使原 worker 误报 fence，不放松 owner/fence 或授权新生成。Web 新 10，156/156；contracts 506；最终完整 API/所有中间红测/检查/截图见报告 §7。不沿用前批 901；旧 WARN/偶发根因仍保留。
- **最终验收未全绿：API 925 passed / 1 failed（64 文件，12:43:12 / 220.12s）**，214 项视觉流程/Chrome 均通过；唯一失败为原 api.integration.test.ts:1648 的 I1 并发批准错误码（NO_PENDING_APPROVAL vs CONVERSATION_TURN_IN_PROGRESS）。先判断在途重叠/lease 与审批消费时序，不简单放宽断言。前两轮 924/1、919/6、短租约单文件 7/7、空库 run-flow 15/15 及新隔离库 schema-only 准备完整保留报告；未删除旧队列/动试用库。下一步优先此并发验收，不直接开放功能或称计划全完。
- **T22 IN_PROGRESS，production vision 关闭。** 剩区域增删/层级/交互/数据源、substitute/visual retry、恢复/资源/升级/回退/全局调度专项及真实 provider/KF/Windows/1:1。@7 旧 worker 不代表支持新 revision 元数据，要排空整体升级；原 18 对 21 试用/迁移、预算暂缓/旧 POST 退役保护不变。无实际 env/key/试用/真实模型/迁移/自动提交。下方均历史。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
### 最新续做：T22 现有 UI 与真实 Chrome 图生下载闭环

- 先读 `agent-app/docs/visual-workbench-browser-20261023.md`。上传/显式外发同意/识别差异接受/独立蓝图/下载已接原工作台，新增 Cookie/tenant/原 actor 隔离的 GET runs/:id/visual-review，仅展示白名单，不返回内部 proof/config/路由/worker 事实。vref1 等待不能走普通蓝图确认。
- Chrome 真实 UI/API/SSE/PG/原编译/签名/快照/BuildExecutor/下载已通，刷新恢复与手机宽度实际确认、下载 SHA-256/一次性链接验证；仅模型本地响应，组合根 staged 策略，不是生产 resolver/全局调度/OS kill/真实 provider/KF/像素验收。
- 新 Web 17 项，26 文件 146/146；contracts 506；API 新展示 4+Chrome 1，最终全量和所有中间失败见报告。根/API tsc、vue-tsc、14 TS lint、Web build 已通过。Chrome 测试显式 KF_VISUAL_BROWSER_TEST=1，默认仅此新增用例可条件跳过；不得跳过历史失败来报绿。
- 单图/build/原同意人限制不变，失败/过期/错 receipt 不丢图转文字；模糊网络失败复用请求身份，自动创建会话不丢首条草稿，导航清理同意/迟到响应。新增文件/命令/证据见报告。
- 最终 API 含 Chrome **64 文件 901/901**（11:36:11 / 240.89s，无 skip），其中完整 visual-run-flow 189 项；Web 146、contracts 506，共 1553 passed。其他包不冒充全量复验；既有 lease cleanup WARN 仍在，历史短 lease/404 根因不宣称根治。最终证据目录和 scoped 检查见报告 §7。
- **T22 IN_PROGRESS，production vision 仍关闭。** 下一步识别编辑/区域修订/substitute/visual retry、撤权/过期提示与恢复/资源/升级/回退/真实 worker 调度专项；真实 provider/KF/Windows/1:1 需授权。不要再重做基础上传到下载，也不要只改 flag。无实际 env/key/试用/迁移/真实模型操作，预算暂缓、旧 POST 退役、21 对 18 保护保持。下方均历史。
<!-- end -->

### 最新续做：T22 公共蓝图确认与 HTTP 工程包下载

- 先读 `agent-app/docs/visual-public-engineering-20261023.md`。公共 confirm 已接 Store 原子消息/候选/proof/source CAS/双审计/budget/queued；复用现有 engineering signer，固定原 actor/config/base，独立工程 consumer/专用模型/原 native 构建不重做。
- 幂等先于当前 gate/runtime；当前 runtime 必须 reviews/blueprints/semantics 齐全。取锁原 image ancestry → blueprint → outstanding，不倒序锁新 Run；缺 semanticModel 或 freeze 后错误整笔回滚。损坏/降级的视觉 config 不能成为文字确认，图片识别等待仍须先 accept 差异。坏/过期签名/Message/receipt/基线等安全拒绝，source 不被半消费。
- 新增 22 流程测试（184 项视觉流程），真实 Cookie/Origin confirm→正式 PG 图→native compile/sign/snapshot→BuildExecutor→Delivery→一次性 token/download 校验实际字节 SHA-256；401/403、跨租户、token 盗用/重放、同/不同请求与停止竞争、回滚、缺 runtime/无效模型/配置降级均覆盖。staged 测试通过注入真实 Store 策略，不等于生产 resolver/真实 provider/KF/像素验收。
- **T22 仍 IN_PROGRESS，production vision 关闭。下一模型直接接当前前端上传/外发同意/单图/差异接受/独立蓝图/下载和 browser 全链路，不再重做后端公共确认或生成基础设施。** 视觉 retry/区域修订等未完成合同保留；不清图片走文字绕过许可。
- root/API tsc 和 5 文件 ESLint 已复验；最终 API 完整结果和所有中间失败在新报告追加，不引用前批 874/214 冒充本轮。中间 202/1 是原识别等待错误码顺序回归，已修复且保留断言；另两条红测证实配置降级与无效模型问题。所有命令禁用 tracing，不改既有 timeout/retry/skip。
- 最终 API **64 文件、896/896**（10:07:06 / 226.00s），包含全部 184 项视觉流程；其他包/Web/browser 未重跑，不沿用前批计数。既有 cleanup WARN 与前批偶发问题的未定根因仍保留，不能称为根治。
- 无实际 `.env`/key/试用/迁移/真实模型/KF 操作，dirty 不 commit/push/worktree/多代理；预算暂缓、旧 POST 退役、21 对 18 迁移保护和旧 worker 排空整体升级要求不变。

### 前批记录：T22 视觉工程 Run 与已提交构建恢复

- 先读 `agent-app/docs/visual-engineering-run-20261023.md`。@7 内部 confirm 已通过正式 executor/registry/worker handler 进入真实 PG 图，独立 step/hash、cache 前 engineering proof 与当前 lease 校验，清旧授权 channels 后恢复已签 blueprint/accepted/stamp，确定性进入 capability/专用 semantic/原生 compile/sign/snapshot/build/delivery。
- 已提交 job 不再走原 TTL/base/外发授权 reader：只读 receipt 方法不能用于生成，消费者须额外验证本 Run 唯一真实 job、signed plan、不可变快照/sourceMap/视觉与蓝图一致、结果 revision/package hash/storage 绑定；仅允许自身成功结果移动基线。绑定后恢复不加载图、不重发模型或重复 enqueue，撤权不影响只读跟踪，但编译前撤权仍拒绝。
- 新增 17 流程测试，visual-run-flow 162 项；真实完整客户端包字节及 SHA-256、提交前后与 precompile checkpoint 的关闭/重建 Nest context/换 fence 恢复、不匹配控件失败和伪造缓存/签名/job/result 均覆盖。模型为本地 fetch，构建使用精确测试 job 的真实 BuildExecutor，不把它说成全局 JobRunner 调度/OS kill/真实 KF/1:1 验收。
- **公共视觉 confirm 仍被 Store 拒绝，production vision 仍关闭，T22 未完成**。下一模型直接同步公共 Store 原子 gate/幂等/候选 SQL NULL→freeze 唯一消费/Message/budget/queued/audit，再 Cookie/Origin HTTP 确认→原生包下载，最后现有 UI 上传/授权/差异/蓝图/交付。不再重做 semantic 服务或本批工程 consumer。
- 中间失败及回归完整记录见新报告，包括误拼测试库、fixture 初始 IR/存储读取问题、新条件探测默认 1 秒不足、一次遗留全局队列 fixture，以及继承 LangSmith tracing 报 429。后续命令只在测试进程禁用 tracing，不改实际环境或 key；不能声称本轮无任何外部追踪访问。
- 最终 API 64 文件 **874/874**（09:40:44 / 216.20s）、图编排 19 文件 **214/214**（09:33:55 / 11.21s）；root/API tsc、11 文件 ESLint 通过。第一次完整 872/2（60ms lease FENCE、公共 accept replay 404）、单独 2/2 复验、既有 cleanup WARN 均保留，未改既有 timeout/retry/skip，未证明偶发根因已清。其他包/Web/浏览器/真实模型/KF 本批未全量复验。
- 保留 mixed dirty，不 commit/push/worktree/多代理；无迁移/实际 `.env`/真实模型/KF/试用进程操作。旧试用 18 对源码 21、排空整体升级旧 worker（同 @7 不代表支持 confirm）、预算暂缓、旧 POST 退役保护不变。
<!-- end -->
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
### 最新续做：T22 专用视觉语义模型、网关缓存与runtime

- 先读 `agent-app/docs/visual-semantic-runtime-20261022.md`。ReviewService服务器planningRoutes可给implementation，authority在新engineering proof里签名冻结semanticModel（visual-semantic@1/HTTPS JSON route/prompt规则/输入输出限制/repairPolicy:none）；旧内部proof可读，缺配置不能执行，也不从当前环境补模型。
- 新VisualSemanticService复用原DeepSeek纯messages/语义校验，经engineering reader→活跃DB lease复核当前来源/同意/TTL/目录/许可。核对graph blueprint/reference/候选/资产与服务器可信事实，不发任意history/repair草稿；gateway/真实账本/结果step按owner-fence/inputHash缓存，发送前与发布前重检且不持事务跨网络。
- 同fence在途不双发、已完成新lease恢复不重发；未知在途接管可双费如实记录、旧fence不覆盖；取消/撤权/坏输出/截断不发布，无隐藏repair或文字fallback。坏缓存hash不能被原模型归一化悄悄重绑，读取要求canonical完全一致。runtime新增semantics及精确route凭据guard，Conversations接专用端口；显式缺服务时隐藏base旧视觉方法，保留文字/private receiver。
- 本轮新增22流程+2runtime；流程145、runtime5、原DeepSeek127，完整结果/中间超时与红测见报告。真实上游PG蓝图、签名engineering候选/真实lease/本地fetch/gateway/usage/cache，以及原semantic图节点已测；**新候选仍内部事务，不是@7 confirm正式worker/公共HTTP继续/原生下载E2E，T22仍IN_PROGRESS，production vision关闭。**
- 下一步直接接consumer：cache前proof preflight→独立@7 confirm step/hash/handler→签名blueprint/accepted初始化并清旧批准channels→原capability/semantic/compile/sign/snapshot/build/delivery。必须区分RUNNING规划授权与已提交job跟踪；旧reader/base/TTL不能无条件用于build后revision合法变化的只读收尾，须先认证本Run真实job/artifact/result绑定，不全局忽略stale-base。consumer可执行后才同步公共Store原子Message/budget/queued/幂等/gates/唯一消费和HTTP下载/UI。
- 无迁移/真实provider/KF/.env/key/试用或worker进程操作，当前dirty不commit/push/worktree/多代理；预算暂缓、旧POST退役、旧试用18对源码21和排空整体升级worker保护不变。真实provider支持限额/缓存降本/视觉native sourceMap和1:1质量未验收。
- 本轮最终API **64文件857/857**（19:01:45 / 168.36s）、编排器214、contracts506、domain1403 passed/5既有条件skip，共2980 passed；root/API tsc、10文件ESLint exit0。新22流程+2runtime计入API。中间定向275/2超时、完整856/1既有run-flow创建会话404、单独复验与最后完整复验、既有cleanup WARN均见报告，不放宽timeout/retry/skip或声称偶发根因全清。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
### 前批记录：T22 签名蓝图展示与确认后继继承

- 先读 `agent-app/docs/visual-blueprint-confirmation-20261022.md`。公共accept/真实PG独立蓝图链已是前批完成，不再重做。新增VisualBlueprintAuthority经VisualReviewService门面，在正式handler发布receipt前写vbpr1签名review：scope/base/config、原continuation/visual stamp、实际模型结果和唯一assistant蓝图Message/revision/hash/receipt、owner/fence。只读复用兼容租约恢复，不覆盖旧展示。
- 新内部freezeEngineeringInTransaction/readEngineeringInTransaction：veng1/semantic-planning purpose，绑定confirm_blueprint新action/request/run/actor、同源base/config、完整accepted与签名blueprintReview；SQL NULL候选→proof/step/安全审计/CAS唯一消费蓝图等待/终态事件，同调用方事务回滚。原签名/图/Message/当前来源/TTL/目录/许可仍校验，不复制accept-only proof、不清图变文字。锁序原图片→蓝图→候选，不能先持候选/蓝图锁倒序读原链。
- 本轮流程新增31项，总123；真实上游Run/网关/账本/正式handler/PG图，engineering候选仍手工内部事务。方法本身不创建Message/预算/queued、不执行语义模型/compile/build、不检查新Run执行lease或授予外发/构建。scope/actor/action/base/config/source-link/attachments/step/TTL/policy、签名篡改、回执变化、第二条蓝图歧义/模型缓存/lease与回滚并发均有测。
- **公共视觉confirm仍被Store等待屏障拒绝，执行器@7仍只允许message/accept，production vision关闭，T22仍IN_PROGRESS。** 下一步直接冻结semantic/repair任务配置、专用gateway/cache与派生OCR授权，engineering reader之后验证活跃DB lease，装配独立confirm step/handler并清旧批准channels；再同步公共Store完整事务/HTTP确认→原compile/sign/snapshot/build/delivery/download和现有UI。不能把新data proof直接当模型发送/原生批准。
- 本轮无迁移/真实provider/KF/.env/key/试用或worker进程操作。旧试用18对源码21保护、预算暂缓/旧POST退役/不commit-worktree-多代理保持。旧不生成签名蓝图review的@7等待不能在HTTP时倒签或手工补假数据；升级需排空整体切换，不按同@7版本号认定可混部。最终回归和中间超时/P2025/既有cleanup WARN见新报告。
- 本轮最终完整API **64文件833/833**（17:54:20 / 161.98s）、编排器214、contracts506、domain1403 passed/5既有条件skip，共2956 passed；root/API tsc、7文件ESLint exit0。第一轮完整831/2为两个历史API用例5000ms超时，同轮User update P2025，2项单独复验通过后完整单独复验833；不改认证/timeout/retry/skip，不把相关负载敏感现象当已证根因。旧cleanup WARN仍保留，非monorepo/浏览器或完整图生工程验收。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
### 前批记录：T22 公共确认受理与真实HTTP蓝图等待

- 先读 `agent-app/docs/visual-public-acceptance-20261022.md`，不是再从内部原语/worker装配开始。公共RunService/Store已接accept receipt+acceptedDifferences；新 leaf schema 复用有界差异定义，避免循环。持久RunAction两字段optional只为旧内部history，新准入两层都要求完整严格确认；未知server/native/route字段拒绝。
- 受理事务幂等优先→当前准入/vision/外发/runtime gate→conversation/tenant/workspace/source-control/source-row锁序→唯一真实等待→Message/候选SQL NULL input→freeze/CAS一次消费/proof/审计→budget/queued/activity原子提交。候选固定原config/base/predecessor，不继承当前@6，不让通用active分支再次取消。没有冻结blueprintModel整笔回滚，review-only依赖不留无法执行后继。
- freeze/read新增完整action与receipt/choices一致性校验；旧最小动作仍可读。真实Cookie/Origin HTTP确认后正式executor/registry/完整PG图产独立蓝图WAITING_INPUT，当前不是再手工建确认候选。92项流程（新增22）+contracts新增1；同请求/不同请求并发、取消竞争、scope/actor/receipt/TTL/base/choice/policy/配置/完整回滚都已覆盖。完整最终结果及fixture错误/红测/lint记录见报告，不隐去中间失败。
- **生产resolver的vision仍关闭，AGENT_VISION_V1=true不能开放，T22仍IN_PROGRESS**。只限单图/原同意人/build source+successor；下一动作confirm_blueprint仍被@7等待屏障拒绝。下一模型直接做当前展示蓝图receipt/hash/stamp+原accepted链的下一段可信继承，然后visual semantic/repair冻结/派生OCR外发、既有compile/sign/build/delivery和现有UI上传/确认/download E2E。不能复制accept-only proof或清图片变文字来继续。
- 保留当前dirty，不commit/push/worktree/多代理。无迁移/真实provider/KF/.env/key/旧试用操作，旧试用18对源码21保护不变；开放前旧@6和不支持对应动作的旧@7均排空整体升级，同版号不等于可混部。预算暂缓、旧POST不恢复。
- 本轮最终API64文件 **802/802**（17:33:53 / 161.81s）、编排器214、contracts506、domain1403 passed/5既有条件skip，共2925 passed，非monorepo/浏览器全量；root/API tsc、10文件ESLint exit0。中间完整API789 passed/13 failed为新增测试错误使用不存在的RunBudget relation，已修正后完整重跑；既有lease cleanup WARN保留，不隐去失败或称连接问题已根治。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
### 前批记录：T22 确认后继的正式执行、PG图与蓝图暂停恢复

- 先读 `agent-app/docs/visual-blueprint-run-20261022.md`。@7已支持签名continuation的build accept：cache前proof/source/config/DB lease preflight→独立visual-blueprint step/hash/mustPause→正式registry/handler→ConversationService真实Postgres完整LangGraph→独立蓝图Message/receipt→WAITING_INPUT。新步骤不复用@6整步hash，不改变文字入口。
- 新图输入先清全部旧channels再写新scope/base/accepted，避免load-context跟踪旧building/已批准计划；图入口确定性到design-plan，不让文字intent猜视觉确认。已有native interrupt拒绝覆盖；自称当前Run的checkpoint须精确scope/@7/base/accepted/合法阶段，否则失败。completed own checkpoint仅投影，精确receipt去重。
- ReferenceAssetsModule提供统一VISUAL_PLANNING_RUNTIME，Conversations组合专用蓝图方法、保留原class私有receiver和文字方法；worker将同一review交给registry/executor。deepseek+合法review key/route/key才提供模型端口，fake/stub不外发。凭据gateway绑定精确服务器route，换host/model的历史Run在记账/请求前拒绝，不偷发当前key；不是完整历史凭据注册表。
- 新8流程+3runtime，定向70+3通过；真实Nest worker模块/PG checkpoint/turn lease/graph ports/ledger均保留，provider是本地fetch。暂停故障注入在input.required之后，关闭旧Nest上下文再新owner/新上下文恢复，仅1次provider/Message/事件。旧批准、坏proof+完成cache、假完成cache、shutdown/在途cancel都已测，不冒充OS kill或独立worker进程生产验收。
- **公共accept仍未接RunService/Store，生产vision仍关闭**。候选确认仍是内部事务；不是公开HTTP确认E2E，更不是图生工程下载完成。下一步直接strict公共payload与Store原子受理，freeze已消费旧等待，别再走通用active二次消费；确认蓝图/后续审批/重试也须新继承合同，再semantic模型冻结/派生OCR外发/原compile/build/delivery和当前UI。
- 第一轮API64文件780/780通过，assertion/lint补强后最终完整复验及所有中间记录见最新报告；图214、contracts505、domain1403（另5既有条件跳过）本轮完整已通过。tsc泛型GraphLike桥接/多余断言/test unbound method均修正，不关规则/新增skip。既有cleanup WARN保留，不宣称历史偶发连接全根治。
- 没有迁移/真实provider/KF/实际.env/key/试用操作，旧试用18对源码21、排空旧worker整体升级保护不变。预算暂缓/旧POST不恢复，保留dirty，不自动提交/开worktree/多代理。
- 最终API **64文件780/780**（17:02:00再完整跑，135.21s，包含坏proof+completed缓存补强）、编排器214、contracts505、domain1403 passed/5既有条件跳过，合计2902 passed，非monorepo/浏览器全量。root/API/图tsc和14文件ESLint exit0；完整中间记录/既有cleanup WARN见报告。旧@6及前批仅message的@7 worker都不能混领accept，公开受理前须排空/整体升级，不能只看@7版本号假定兼容。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
### 前批记录：T22 视觉蓝图冻结、网关与独立设计节点

- 先读 `agent-app/docs/visual-blueprint-20261022.md`，再读 continuation/flow。proof新增optional blueprintModel兼容旧内部签名，但模型调用必须有；ReviewService第三服务器参数私有复制route，freeze新后继时HMAC绑定route/prompt/limits，旧proof不从当前环境补模型。
- VisualBlueprintService已实现实际scope/fence/DB lease/current来源/许可复核，按reader锁序先认证原链再锁活跃后继；gateway/真实usage、严格v3输出、RunStep持久缓存。同fence并发不双发，完成结果过期租约恢复不重发；在途未知请求接管可双费且如实记账，旧fence不覆盖新结果。无事务跨网络，无隐式repair。
- ModelPort/createDesignPlanNode新视觉分支只用专用方法，不携带旧蓝图/旧assistant批准。成功写原格式独立蓝图/停design-review并清旧工程权限；失败不保留旧批准作回退。新增visualBlueprintConfirmationHash是来源stamp，不是批准；普通Run显式清空，视觉memo包含完整accepted，文字key和修复行为不改。
- **没有公开受理或真实后继executor/完整LangGraph接线**。新增真实DB测试从图片Run到review后手工候选/确认/claim，调用服务和真实节点写Message；不是HTTP确认→worker→蓝图等待E2E，未产生新Run input.required/WAITING_INPUT收尾或完整可继续checkpoint。生产vision/公共accept仍关闭，当前@7只执行图片message到review。
- 流程62项、本轮新增16；节点新增9项。完整编排器214/214、contracts505/505、domain1403 passed/5既有条件跳过，API最终结果/命令与静态检查见新报告。中间完整图213/1是memo fixture错误地返回undefined（生产合同用null）；修正fixture后完整214通过，不改生产memo。未知cache状态重复调用和停止错误码误报均有红测修复，既有cleanup WARN保留。
- 下一步不重做节点：安全装配blueprint route/匹配host的凭据gateway/review/service，@7 accept可执行handler与cache前proof preflight，同锁序、清旧checkpoint、确定性路由真实graph设计节点、memo/暂停/恢复；再同步strict公共action/Store Message/queued/幂等/错误映射/唯一后继。之后为confirm_blueprint/审批独立可信继承、绑定新蓝图hash/stamp，并冻结visual semantic路由/外发，再原编译/构建/交付与现有UI下载E2E。公共schema复用注意agent-run→visual-review→visual-execution→agent-run循环。
- 未改实际.env/key/服务/迁移或调用收费模型/KF；旧试用18对源码21、旧worker排空整体升级要求不变，不reset/seed/直接重启旧库。预算暂缓/旧POST不恢复，保留dirty，不自动提交/开worktree/多代理。
- 最终完整API **63文件769/769**（覆盖最后新增两项租约测试，不用中间767替代）、编排器 **214/214**、contracts **505/505**、domain **1403 passed / 0 failed / 5既有条件跳过**；共2891 passed，非monorepo/浏览器全量。root/API/contracts/图tsc与11文件ESLint exit0，API既有lease cleanup WARN仍保留。时间/耗时和全部中间失败见最新报告。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
### 前批记录：T22 确认后继可信继承与原子消费原语

- 先读 `agent-app/docs/visual-continuation-20261022.md`。freezeContinuationInTransaction已实现内部同事务accepted/版本化继承proof/step/审计、CAS唯一后继/消费原等待/终态事件；readContinuationInTransaction在原Run已CANCELLED且精确supersededBy指向后继时，仍认证签名与当前source/leaf/TTL/catalog/base/admission，不再要求原等待未消费。
- 独立vcont1域HMAC绑定新Run/actor/action/config/request/base、原admission/review和精确选择；不能靠重算所有普通hash篡改选择，不能复制原message输入给新action。暂限原同意人、单图、build accept动作，不支持多人确认/不同动作/重试。方法不授予外发/蓝图/执行权限。
- **还没接公共RunService/Store/worker/graph**；公共accept仍关闭，@7仍只支持message→review。新测试在真实上传/Run/executor/review后，手工候选与真实DB事务调用原语，不是公开确认→蓝图E2E。不可先删除准入守卫，不能接收worker无法执行的队列任务。
- 新30项（流程文件合计46），含并发/回滚/幂等/签名篡改/身份错配/源变化/撤销/取消/跨scope。API完整63文件753/753、编排器19文件205/205、contracts20文件505/505通过，root/API/contracts tsc与3文件ESLint通过；其他本轮完整结果见报告。中间41项39/2中一项是必填actor fixture错误，改为真实另一成员后40/1仍复现action analysis与确认不匹配，补校验后通过。既有lease cleanup WARN继续保留，不宣布历史偶发故障全根治。
- 下一步：其他规划route/prompt冻结及派生OCR发送/发布授权→@7 accept可执行handler/step/memo/preflight/恢复，显式视觉初始状态、独立蓝图等待→同步strict公共action带receipt/选择+Store受理完整事务/幂等/错误映射。之后confirm_blueprint/审批也要新继承合同，不能把本轮只限accept的v1复制过去。reader采用conversation→tenant→workspace→source→后继锁序，executor不可先持后继锁倒序调用。
- 生产vision仍关闭、无迁移/收费/KF/试用操作；旧试用18对源码21、排空旧worker后整体升级警告不变。预算暂缓/旧POST不恢复，保留dirty，不自动提交/开worktree/多代理。
- 补齐本轮domain-client完整回归：68文件1403 passed / 0 failed / 5既有条件skipped；四包合计2866 passed，不是monorepo/浏览器全量，未新增skip。具体开始时间/耗时在最新报告。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
### 前批记录：T22 真实图片Run到review等待

- 先读 `agent-app/docs/visual-run-flow-20261022.md`。freeze已接真正RunService/Store/Run模块，完整Message→@7 Run→input/step/audit→queued同事务；registry/worker模块/启动装配真实分析与review。默认文本@6不变，新增有限@7：只支持冻结有效/服务器flag=true的单图message，到WAITING_INPUT，不执行confirm/工程生成。
- 生产resolveWorkbenchConfig仍将vision关闭，AGENT_VISION_V1=true仍无效配置；不能只改flag打开。HTTP集成仅给隔离测试租户注入staging policy，真实cookie/Origin/Store/executor与像素/ledger均保留，不是绕过准入的直接服务调用。缺review密钥/依赖时图片handler明确失败，不影响文字运行。
- Step输入包含admissionHash/@7/action/base，preflight早于cache；mustPause防COMPLETED缓存或handler普通return跳过review。review签名content新增可选execution owner/fence（新prepare必填），RunPersistedPause经Store只读核对持久review/租约来源后返回实际等待/取消，不再尝试写已释放租约。
- 真实取消在途/刚提交review后均不构建/不复活；shutdown发生在preflight之前保持RUNNING供恢复；分析后租约过期新owner复用分析缓存，一次provider、一份input.required。视觉等待不能被普通message/confirm_blueprint消费，accept_visual_reference仍关闭；停止继续可用。
- 当前真正图片Run只允许1张且会话空闲，不静默忽略补图；freeze合同仍支持1–3供后续多图review。HTTP与内部Store的视觉retry都VISUAL_RETRY_NOT_ENABLED，不能丢图回退文字；待可信确认/重试输入继承合同一起完成。
- 最终API **63文件723/723**，图 **19文件205/205**，domain **68文件1403 passed / 0 failed / 5既有条件跳过**，contracts **20文件505/505**；root/API/contracts/图/domain tsc和17文件ESLint通过。新流程16项/HTTP/暂停来源/缓存/恢复/shutdown/内部retry都计入API。中间全量722/1是Store丢图重试红测，修复后完整重跑723；结构化403测试预期、Prisma类型与多余断言修复/既有lease cleanup WARN见报告。
- 无新migration/依赖/真实provider或KF/试用操作；保留混合dirty，不开worktree/自动提交/多代理。源码21条对旧试用18条，继续禁止reset/seed或直接重启新源码；灰度还须排空旧@6 worker并整体升级，不能让旧worker领取@7。
- 下一段直接接同事务review确认→accepted持久化/审计/CAS唯一后继，设计不同action的新可信输入继承，扩@7 handler；review等待在Run/RunStep，不是LangGraph vision interrupt，不能借旧design-review批准新图。再补其他规划模型配置冻结/派生OCR发送许可、独立蓝图确认→既有visual semantic/compile/build，最后现有UI/upload/review/download E2E。预算暂缓，旧POST不恢复，当前不宣称图生工程可试用或1:1质量。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
### 前批记录：T22 图片输入冻结与 review 来源/过期校验

- 先读 `agent-app/docs/visual-admission-20261022.md`，再读 visual-graph/egress/review 历史。新 `VisualRunAdmissionService.freezeInTransaction` 要求调用方Run创建事务、@7未开始QUEUED message、真实actor/creative-v2/current fixed base；同事务保存inputSnapshot、completed step、VISUAL_INPUT_FROZEN审计，幂等不重写同意时间，不接受浏览器route/sourceHash/native字段。
- 新合同冻结1–3图及明确主补关系、源/派生metadata/transform、完整**像素分析**路由及prompt身份、notice版本/hash/actor/time/图集合与Run mode/action/config/base身份。无API key/像素/storageKey，私有路由不向工作台暴露。其他蓝图/视觉语义任务配置尚未完整冻结，不泛称所有模型/gateway已接完。
- 分析从已冻结route恢复而不是换用当前环境；缺@7输入或视觉残留损坏不回落。入口/cache/send/publish复核受理数据和实际源/派生身份，policy撤销仍拒绝；在途输入被删不发布结果，真实provider usage保留。
- review/read/acceptance校验现在匹配受理图/source/derivative/viewport/instruction/modelConfig/analysisVersion，不能用同工作区另一需求的分析。新增真实PG时钟TTL检查，准备前过期/等待中到期均拒绝，不消费WAITING_INPUT。
- 本地fixture串联freeze→真实上传/安全派生图片→gateway+ledger→signed review/等待→严格acceptance校验已通过；**没有**accepted持久化/CAS后继/build/download完整视觉E2E。freeze服务未装配生产module/RunStore/HTTP，现行Run/executor仍@6、@7cache前拒绝、附件/视觉action/flag关闭。下一步必须真接准入与可执行新协议，不能只开flag/改常量。
- 最终API **62文件707/707**，图 **19文件205/205**，domain **68文件1403 passed / 0 failed / 5既有条件跳过**，contracts **20文件505/505**；root/API/contracts/图/domain tsc和本批8文件ESLint通过。针对性55项包含在API总数，新增14项admission/2项analysis/2项TTL。完整红测、模块初次加载失败/URL解析和mode遗漏修复、类型/lint问题和既有lease cleanup WARN均见报告。
- 无新migration/依赖/收费调用/试用升级，旧试用18条对源码21条需协调expand+旧Run排空；不reset/seed/直接重启旧试用库，不自动提交/开worktree/多代理，保留dirty。
- 下一步：在RunService/Store实际受理事务接freeze（与Message/queued原子）→@7 config/plan/executor/handler/graph暂停停止恢复→同事务确认审计/可信输入继承/CAS唯一后继→其他模型发送复核→现有工作台上传/发送同意/主补选择/review/下载E2E。当前strict admission容器只支持message/fixed，不可原样复制给不同action的后继或重试；需明确新版本化继承。预算暂缓、旧POST不恢复。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
### 前批记录：T22 视觉语义图节点与 KF 编译链

- 先读 `agent-app/docs/visual-graph-20261022.md`，然后前批 egress/review 报告。新 accepted envelope 只检结构与hash；确认服务返回它，但未保存确认/消费等待/CAS创建后继，不能把自行算hash当外发许可或蓝图批准。
- semantic节点已接独立visual ModelPort，严格候选/绑定校验，缺方法/旧协议/坏确认/孤立旧wrapper均fail closed，不降级文字或隐藏repair。compile节点复核wrapper与semantic plan/hash及confirmation stamp，坏输入不调用compiler/不追加消息；正确输入向原compiler传visual reference+bindings。
- 两节点memo键分别包含完整accepted envelope及编译wrapper/stamp，确认/绑定变化不复用；文字键不增加null视觉字段。普通Run输入显式清除三个视觉状态字段，保留@6行为。
- **只预留节点@7，未升级现行@6执行协议**。API RUN_PLAN_VERSION、config/admission、executor/handler/flags不变；@7仍在cache前拒绝，附件/视觉action仍不可受理。后续必须整套协议/准入/恢复一起开发，不能仅改常量或开flag。
- 本地fetch fixture驱动真实DeepSeek适配器→semantic节点→compile节点→生产编译器→真实Prisma/签名/GenerationSnapshot/sourceMap已测；不是完整Run/browser/下载、provider看图或原生1:1质量验收。既有native provenance、签名与蓝图确认边界未放宽。
- 最终API **61文件689/689**、domain **68文件1403 passed / 0 failed / 5既有条件跳过**、contracts **20文件505/505**、图 **19文件205/205**；root/API/图/domain tsc和14文件ESLint通过。红测、测试路径/unknown类型修复、ESLint多余断言与既有cleanup WARN见报告，没有新增skip或抬超时。
- 无新migration/依赖、实际provider/KF或环境升级；源码21迁移对旧试用18条的协调升级警告不变，不reset/seed/重启旧库。当前目录混合dirty保留，不自动提交/开worktree/多代理。
- 下一步完整准入/主补图/真实模型配置版本与发送说明同意→新协议可执行/prepare暂停结束适配→同事务确认审计/唯一后继→分析/review图与现有工作台上传/确认/下载E2E。OCR/派生结构发送仍要检查策略+用户同意，当前graph分支不代表已有该生产外发授权。预算暂缓，旧POST不恢复。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
### 前批记录：T22 管理员外发策略与视觉分析执行约束

- 优先读 `agent-app/docs/visual-egress-20261022.md`。本批原准备确认后继，核对发现分析缺scope/fence/配置固定前置，故先补安全执行边界；**未创建/启用视觉后继Run**，T22仍IN_PROGRESS，@6与vision关闭不变。
- 新GET/PATCH `/api/v2/tenant/visual-egress-policy`已注册：本租户成员私有读，tenant_admin+Origin严格boolean写，服务复核DB角色/归属，Tenant锁下更新与审计同事务。许可覆盖图片/派生结构的策略，不能作为用户发送同意或功能开关；语义模型发送接图时仍须复核，UI尚未做。
- 内部分析入口/缓存事务/发送前/发布事务都检查真实服务器scope、owner/fence、墙钟lease、RUNNING无取消/后继/build。withAgentRunNode阻止闭合scope脱离调用并跟踪pending；旧fence迟到响应不写分析/缓存，但保留真实调用账本usage。
- 新严格config/image合同与RunStep首次分析前hash pinning，包含Run/config和模型prompt身份、来源/派生/指令hash；同输入复用，损坏/漂移明确失败，无密钥/URL/完整指令/像素持久化。不是完整准入附件主补图/配置实体存档，不是新DB不可变trigger；不同指令须新Run，不在同Run偷改。
- 最终完整API **61文件688/688**、domain **68文件1401 passed / 0 failed / 5既有条件跳过**、contracts **20文件505/505**、图 **19文件195/195**；root/API tsc和相关8文件ESLint/whitespace通过。原13项分析测试改为真实leased Run装配，最终25项；缺scope/旧fence/晚回复/config中途漂移/闭合scope均有红测，service角色条件做变异红测后已恢复，详见报告。最终API688不是用改scope前687项替代。
- 无新migration/依赖、真实provider/KF/浏览器或build全套验收，不改试用库/.env/服务/密钥。源码21迁移对试用18条的协调升级警告继续有效，禁止reset/seed或直接重启新源码指向旧库。当前普通Run仍visual:null；review确认原语仍未接生产图/HTTP。
- 下一步完整准入/主补图与真实模型配置版本、用户发送说明/同意、新协议→同事务确认审计/唯一后继→图checkpoint/prepare已暂停的执行器适配→视觉semantic/compile memo→现有工作台上传/review/下载。预算暂缓、旧POST不恢复，不自动提交/开worktree/多代理或真实外发。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
### 前批记录：T22 冻结review、签名回执与确认校验原语

- 优先读 `agent-app/docs/visual-review-20261022.md`。服务端重算候选/映射，冻结Run/config/catalog/analysis/source事实，HMAC域隔离短回执；原AgentRunStep只创建一次并签名复核，不新增DB不可变trigger或迁移。
- 内部prepare同事务存review、写小input.required和暂停WAITING_INPUT/释放lease；真实DB并发、旧fence/取消/墙钟租约、跨scope、过期child、篡改hash/config、事件失败回滚已测。新review文件12项。
- validateAcceptanceInTransaction只校验不消费，不保存确认结果或创建后继，更不授予外发/构建权限；服务仍未注册生产module/图/HTTP。T22改IN_PROGRESS，普通Run仍visual:null。后续必须在新协议Run受理的同一事务保存确认数据/审计并CAS唯一后继，再独立蓝图审批。
- 修复省略未验证区域仍被要求accept的逻辑；不省略仍需明确ack。替代控件尚无重review展示，明确VISUAL_SUBSTITUTION_REQUIRES_REVIEW，不隐藏降级。修复Store内部可受理未开放视觉动作/附件并消耗等待，当前@6也拒绝，幂等重放不受影响。
- 本批完整API **61文件676/676**、domain **68文件1401 passed / 0 failed / 5既有条件跳过**、contracts **20文件505/505**、图 **19文件195/195**；root/API/domain tsc、相关7文件ESLint与whitespace检查通过。首轮8项stub红测、text/richtext样例误差、省略/Store红测和RunBudget错误测试relation均记录，未放宽生产schema/排序。
- 无新migration、真实provider/KF/浏览器或build全套验收，未改试用库/.env/服务/密钥，保持@6和vision关闭；源码21迁移对旧试用18条的协调升级警告继续有效。当前服务只记录已有config hash/分析modelConfigHash，不冒充已冻结全量模型/提示词/价格。
- 下一步附件/配置冻结与图片及派生数据外发许可/说明→新协议/graph checkpoint和prepare已暂停的结束适配→同事务确认与唯一后继→视觉model/compile memo键→现有工作台上传/review/下载。低置信/未知交互、替代新review仍待补。预算暂缓、旧POST不恢复、不自动提交/开worktree或多代理。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
### 前批记录：T21 视觉语义与编译来源内部接线

- 优先读 `agent-app/docs/visual-semantics-20261022.md`，再读前批snapshot报告。独立严格视觉语义端口只返回原plan和region/node绑定；编译包装器复用原权威语义投影提供不可伪造、绑定plan hash的来源，支持repeater/嵌套module。服务器内部compiler可选visual已接真实物化/sourceMap/原签名及快照事务。
- 普通Run图尚未调用新端口，不传visual，snapshot.visual仍null。T21仍IN_PROGRESS，T22仍NOT_STARTED；没有公开上传图→确认→下载闭环。结构校验不代表用户确认/授权，必须服务端重算映射、冻结analysis和确认receipt后接线。
- 真实适配器+golden集成发现132711字节视觉prompt超128000；仅视觉端口采用无损候选文本字典，不丢理由/限制、不提高阈值，不改文字默认prompt/hash。未证明真实缓存/费用下降，文字大prompt风险仍需治理。
- 最终完整API **60文件664/664**、domain **68文件1400 passed / 0 failed / 5既有条件跳过**、contracts **20文件505/505**、图 **19文件195/195**；root/API/domain tsc、相关ESLint和whitespace检查通过。一次未带显式DB参数的图套件被连接/reset前守卫拒绝，后用指定隔离库完整通过；详见报告，不隐去首次失败。
- 新集成使用真实模型适配器/生产compiler/Prisma，只有模型响应为本地fixture，未发真实像素/收费调用/原生KF。未跑本批Web/浏览器/build全套或进程故障验收。无新迁移，仍run-plan@6、vision/外发关闭，不改试用.env/服务/库；源码21迁移对旧试用18条的协调升级警告不变。
- 下一步按报告T22清单做确认receipt/过期版本与跨租户负例、附件和模型配置冻结、管理员外发许可及派生OCR/结构发送说明、WAITING_INPUT，再接图端口和UI。语义/编译memo必须包含review/spec/mapping/binding hash；checkpoint不序列化provenance handle，新action不得偷偷注入旧@6执行计划。预算暂缓，旧POST不恢复，保留dirty，不自动提交/新worktree。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
### 前批记录：T21 不可变来源快照与真实Run交付绑定

- 优先读 `agent-app/docs/generation-snapshot-20261022.md`。新creative-v2真实文本Run已在完整签名计划持久化事务里创建snapshot，再入队；成功构建同事务绑定revision/job/artifact，错误编译hash回滚。严格视觉context/sourceMap/差异/精确编译身份和持久化分析校验已有测试，但生产路径visual:null，T21仍IN_PROGRESS，不是图生工程完成。
- 新迁移 `202610220001_generation_snapshots`，复合租户/工作区FK、唯一键与不可变trigger。只在新generation两个测试库deploy累计21条，不动试用库/.env/服务。**原试用库仍按旧18条对待，必须先协调expand升级，不能直接重启新worker/API或seed重建。**
- 同步保留原SolutionImplementationPlan/candidate/catalog/hash，snapshot复用完整typed creative artifact，不是原生写入或执行授权旁路。旧无snapshot历史/step cache不自动回填；Run仍@6，vision flag关闭，无收费调用。
- 已有snapshot/真实Run流程针对性27/27；完整回归结果见新报告末尾。新增schema/profile、删除顺序与scope测试修复均有原失败证据，测试夹具队列清理仅限本套件UUID工程。未跑真实provider/KF/跨平台/Web浏览器。
- 本批最终完整 API **60文件661/661**、domain **68文件1396 passed / 0 failed / 5既有条件跳过**、contracts **505/505**、build-jobs **68/68**；root/API/domain tsc、相关ESLint、Prisma validate与diff检查通过。不同测试库运行API/build，未并发重置同库；具体命令、时间和中间失败见报告。
- 下一步补T21→T22视觉语义接线红测，尤其model语义节点到repeater/module展开后组件的显式绑定；服务端重算映射和确认receipt再传独立视觉prompt上下文，不将browser/model的visual对象直接写snapshot。之后附件/配置冻结、租户管理员外发许可/发送说明、review/确认和工程下载同链路。预算暂缓，不恢复旧POST，不新建worktree或自动提交。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
### 最新续做：T20 现有控件映射与证据范围

- 先读 `agent-app/docs/visual-mapping-20261021.md`。纯函数区域匹配、复用原打分/候选上限、权威属性/角色校验及 scope-aware runtime evidence 已实现；复杂控件空壳不当生成支持，未知脚本/缺字体/低置信度和需确认交互明确说明。原 catalog snapshot、签名和文本检索语义不变。
- T20仍 **IN_PROGRESS**：服务端真实报告接入、用户未验证能力 acknowledgement 与交付持续显示随 T21/T22 接；没有图生Run，不改变 API/flag/模型权限。
- 当前检索返回空 evidence，不将产品源码/编译测试当原生运行证明。evidence 函数仅验证范围，未来必须从受控服务端存储取报告，不能信任模型/browser 提交的 hash/reportId。替代方案不自动执行。
- 无新迁移/DB访问/收费调用/常驻服务重启。上一批试用库18条与源代码20条的升级警告继续有效。回归中默认并发超时及后续单worker验证保留在报告，不改断言、不扩大超时掩盖失败。
- 最终完整 domain-client **67文件1385 passed / 0 failed / 5既有条件跳过**；contracts **20文件505/505**；root/API tsc、相关ESLint与diff检查通过。5项缺本地参考工程的golden/inspect条件跳过不视为通过。新增纯映射/证据33项包含在domain全量内，不重复累加；本批未跑API/worker/Web/浏览器或真实provider/KF。
- 下一步：T21 visual-plan-constraints 红测 → 同一 SolutionImplementationPlan/确定性 sourceMap/不可变 GenerationSnapshot；然后 T22 附件与模型配置冻结、外发权限说明、前端review确认、acknowledgement和工程下载。预算暂缓，不恢复旧POST。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
### 最新续做：T19内部像素分析与缓存

- 优先读 `agent-app/docs/visual-analysis-20261021.md`。已有严格VisualReferenceSpec、真实WebP data-url请求、shared gateway/账本、源事实覆盖、PG租约与缓存/TTL/完整性、私有GET/严格PATCH与不可变child修正；没有公开分析POST，没有图生Run/前端或真实provider验收，T19仍IN_PROGRESS。
- 迁移 `202610210002_visual_analysis` 只在新 `kf_agent_test_analysis_20261021_1812` deploy累计20条；Tenant.imageEgressAllowed默认false。当前试用库仍18条，未迁移/重启/改实际.env。**新代码含Tenant新列，升级必须先expand，不可直接重启旧试用进程或跑seed重建。**
- 上一批API闭环诊断失败根因为API误降级所有INTERACTION_CLOSURE_MISSING；现复用权威编译器Image-click判定，仅精确可兼容请求作为warning，原失败断言不改并已通过。contracts导航fixture补齐既有targetPageName，未放宽生产合同。
- 最终完整API **59文件649 passed / 0 failed / 0 skipped**，contracts完整20文件505/505、domain相关22项通过。root/API tsc、相关ESLint、Prisma validate已通过。补了大结果PATCH及含Run/child/cache的删除清理：活跃Run/正在执行build明确409，终态Run先清再删Conversation，账本保留；legacy未领取QUEUED build保留原确认删除行为。主HTTP测试改为套件listen一次，消除每请求启停风险；旧偶发Parse Error/403保留，不能仅凭一轮通过声称所有历史根因已解决。中间失败和修复过程见新报告。
- 下一步T20现有控件/证据匹配 → T21共用语义编译/snapshot → T22附件/Run冻结、外发授权说明/租户管理、前端review/确认与真实工程下载。预算暂缓，vision/outbound UI flag仍false，run-plan@6不变，不恢复旧POST，不擅自收费调用或升级试用环境。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
### 本批续做：T18私有参考图接入（优先读）

- 新交付 `agent-app/docs/reference-ingestion-20261021.md`：新增私有参考原图/派生图、真实解码重编码、租户归属/配额/去重/完整性/取消/删除回收。参考图独立于WorkspaceAsset，不会混入客户端素材。T18仍IN_PROGRESS，不代表图片生成完成。
- 新迁移 `202610210001_reference_assets` 只在新的 `kf_agent_test_vision_20261021_1735` deploy（累计19条）；原计划0007撞号，不修改历史迁移。实际试用库仍18条、不可reset/seed，本批未切换运行服务或实际.env。
- 单独默认关闭 `AGENT_REFERENCE_UPLOADS_V1` 只允许本地保存，同时要求既有Run/工作台精确租户准入；`AGENT_VISION_V1`和outboundImagesAllowed仍false，Run仍拒绝图片附件，协议不变@6。MessageAttachment/冻结附件须随真实分析/确认流程接通，不提前接受并忽略图片。
- 针对性5文件82/82；API扩大初轮626/628，失败为Secure-cookie环境与交互诊断合同。显式COOKIE_SECURE=true后最终完整API为**629 passed / 1 failed / 0 skipped（630项）**；认证11/11，交互第二例单独也失败，未通过改断言掩盖。API tsc/相关ESLint/Prisma validate通过；macOS真解码已验，Linux/Windows、收费模型、浏览器上传未验。
- 下一步推进T19合同、真实像素请求及缓存的本地验证，再T20/T21/T22共用工程链路；同时保留所有下列P2发布/偶发失败门槛，不把本轮通过当根因已解决。预算仍暂缓。完整命令、边界和本批文件清单见新报告。

### 前一批试用环境与Run回归记录
<!-- end -->

- 后续本地试用已按维护者要求启动：`http://localhost:43281/login`，新的 `kf_agent_e2e_trial_20261021_01` 独立库；完整 API/build/双租户 agent/Web，固定样例模型无收费调用，当前环境实测生成/下载通过。运行/停止与账号见 operations 顶部，**禁止将该库用于回归 reset/seed**。保持用户试用数据；实际业务库/.env/原5174服务未动。此项是运行环境启动，不代表下方 API 偶发失败或发布门槛已解决。
- 最新交付：`agent-app/docs/run-browser-20261021.md` 及 operations。全部现存 Playwright 已迁移 Run/UI，五个独立服务进程（两租户各 agent-worker），三类工程/原生审批取消/失败重试/浏览器 SSE 故障恢复/切换隔离/实际下载已验；补回新版遗漏的源工程上传入口。修复原生重规划把尚未执行的提案当成已应用基线，导致空补丁/漏操作的问题；模型上下文和部分修改的组件保留仍在。
- 当前协议 **run-plan@6**；先旧 worker 排空旧协议任务/审批，再整体切换 Web/API/两个 worker 类型。不得清空 snapshot/checkpoint 或改历史版本强制继续。旧 POST 不恢复。A 的浏览器测试装配只替换 ModelPort 固定语义响应，其他编译/签名/构建都真实；B 使用生产 agent-worker 入口/fake。不是收费模型/原生 KF 证据。
- 最新验证：浏览器完整两轮各 **9 passed / 0 failed / 0 skipped**；扩大选定回归共 **754 passed / 1 failed / 0 skipped（755 项）**：API 424/425、Web129、图69、build68、worker41、E2E守卫/环境14、浏览器9。API 首批一次 run-flow 403，单独15/15和次批该文件15/15；次批历史 api.integration“最近20条消息”HTTP Parse Error，根因未确认，**不报告全绿**，不靠 skip/exclude/retry 隐藏。根/API/worker/图 tsc、Web vue-tsc/build、相关 TS ESLint 已通过；前批异常记录继续保留。
- 下一优先：定位上述 API 偶发失败，随后真实 API/worker kill/restart、不重复 job、代理/多副本长期连接、410/保留与升级回退；当前正常独立进程启动/清理不等于故障演练。预算继续暂缓，图片未启用。流内复核不刷新 lastUsedAt，普通 HTTP/重连仍沿用滑动规则。PLAN_*仅决定消费；自动取消缺 actor 不猜身份。provider/prompt/pricing 冻结与无 runId 旧 checkpoint 处置仍缺。
- 本批无新 migration；全新 `kf_agent_e2e_browser_20261021` 正常 deploy 既有18条，0007 checksum一致；API/worker 仍分用之前独立测试库。不改业务库、实际 `.env`/真实模型配置或常驻服务。新入口默认关闭，启用需 RUNS/WORKBENCH=true +精确租户UUID；隔离浏览器仅启用固定 A/B，C readonly。详见新报告命令和环境边界，同测试库禁止并发重置。
- 删除了过时 `tests/e2e/global-teardown.ts` 持久 PID 清理脚本，由当次 globalSetup 返回清理函数替代；可从 Git 恢复，无用户工程数据删除。旧 Web 备份仍见前批报告。本批无 commit/push/正式补丁，保留混合 dirty；新报告列本批文件清单，不能当整次迭代的完整 Windows 补丁。
- 下面 2026-10-20 状态与实施记录保留供追溯；如“排队未实现”等与上方矛盾，以上方和最新报告为准。
<!-- end -->

- 已完成：初始设计与计划；随后实现了文本需求→蓝图确认→签名编译→实际构建→工程包下载，并继续接入安全停止与新运行重试。具体证据见 `agent-app/docs/run-flow-repair-20261020.md` 和 `agent-app/docs/run-control-20261020.md`。
- **2026-10-20 10:40 起进入实施**：维护者确认「沿用当前工作目录、允许本地提交、禁止推送远程」。T00 已完成并本地提交（详见 `agent-app/docs/agent-next-change-manifest.md`）。
- 未完成：视觉生成、区域修改、会话管理收口、完整排队与灰度等；没有真实模型费用/缓存基线或原生环境验收。**不能把“核心类有单测”当作生产端到端接线已完成**。
- 工作区：`/Users/fengjinlong/YK/KingFusion3.6`，包含大量用户/其他任务既有未提交修改，特别是agent-app。不能直接reset、整体format或git add全部文件。
- 当前执行优先级：维护者明确暂缓预算限制、优先打通流程，允许删去废弃旧 API。T00/T11 核心与旧入口退役已执行，不要重复初始化或重置当前工作区；阅读最新报告后继续 T12 启用与发布门槛，再推进会话管理/视觉链路。
- 历史控制批次：507 项相关测试通过（非最新总数）。migration `202610200007_build_run_control` 仅在隔离测试库验证，业务数据库尚未升级。

## 必读资料

1. 根 `AGENTS.md`（含先格式化、改动标注、Windows补丁结构）。
2. `docs/superpowers/plans/2026-10-20-agent-app-next-master.md`。
3. `docs/superpowers/specs/2026-10-20-agent-app-next-design.md`。
4. 当前阶段p1/p2/p3/p4/p5计划，及其引用的接口前置任务。
5. P3 视觉基线：`outputs/agent-app-ui-macos-20261020/index.html`（macOS 风格工作台高保真原型；outputs 目录不进 git，缺失时向维护者索取，不得凭记忆重画）。
6. `agent-app/docs/run-browser-20261021.md`、`run-stream-20261021.md`、`run-audit-20261021.md`、`agent-runs-operations.md`；首建签名链仍遵循 `docs/superpowers/plans/2026-08-17-kf-creative-build-integration.md`。
7. `docs/superpowers/specs/2026-08-17-kf-creative-solution-generation-design.md`及同日design-knowledge/planning-retrieval/interaction计划中当前任务相关部分。

Superpowers安装路径因机器不同会变化。本机writing-plans读取路径为 `/Users/fengjinlong/.codex/plugins/cache/openai-curated/superpowers/0722921d/skills/writing-plans/SKILL.md`。执行时查找可用的executing-plans或subagent-driven-development技能并完整阅读，不能假设该本机绝对路径在其他环境存在。没有技能时报告不可用并遵循本计划TDD/复核步骤，不能声称使用了未读技能。

## 状态台账

状态枚举：NOT_STARTED / IN_PROGRESS / VERIFIED / BLOCKED_ENV / NEEDS_REVIEW。只有有测试与验收证据才是VERIFIED。

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
<!-- modified by jinlong.feng at 2026-10-27 Agent工作台迭代 -->
| Task | 内容 | 当前状态 | 依赖 |
|---|---|---|---|
| T00 | 基线与数据库安全 | VERIFIED（2026-10-20） | 无 |
| T01 | 模型能力/usage合同 | VERIFIED（2026-10-20） | T00 |
| T02 | 调用账本与费用 | NEEDS_REVIEW（核心服务已测；真实模型入口未接账本） | T01 |
| T03 | 网关/超时/取消 | IN_PROGRESS（transport 与真实适配器取消已接；统一 gateway 未接） | T02 |
| T04 | prompt拆分与前缀 | IN_PROGRESS（只做字节等价迁移；无缓存收益实测） | T03 |
| T05 | 上下文与摘要 | IN_PROGRESS（2026-10-20，剩余依赖 T06） | T04 |
| T06 | 预算与修复 | IN_PROGRESS（核心类已有；预算限制按用户要求暂缓，接线未完成） | T05 |
| T07 | Run/Event迁移 | VERIFIED（2026-10-20，RunBudget 外键留 T08） | T01/T02 |
| T08 | 幂等队列与fence | IN_PROGRESS（2026-10-21，幂等/FIFO/fence/恢复/消息隔离已测；整体验收待T12） | T06/T07 |
| T09 | 独立执行器 | IN_PROGRESS（双租户独立 worker 浏览器核心流程已验；真实 kill/restart 待补） | T08 |
| T10 | SSE/API恢复 | IN_PROGRESS（背压/会话复核/限时/资源/seq补齐/退避已验；事件过期410、浏览器/代理等仍待验收） | T09 |
| T11 | 取消/重试/构建协调 | IN_PROGRESS（2026-10-21，停止/重试/FIFO/基线归属/原生审批恢复已测；预算相关暂缓，系统级故障验收待收尾） | T10 |
| T12 | 旧入口退役与灰度 | IN_PROGRESS（2026-10-27可用版独立真模型/重启恢复和Chrome10项通过；旧入口保持退役；OS kill/代理/多副本/跨平台矩阵继续后置） | T11 |
| T13 | 会话管理API | VERIFIED_V1（v2游标分页/稳定消息/标题/归档恢复/活动时间已接并通过HTTP、竞争与浏览器；parts先提供清洗文字） | T12 |
| T14 | 多会话导航 | IN_PROGRESS（可用版导航/分页/改名/归档/URL/草稿隔离均通过真实浏览器；完整未读统计后续） | T13 |
| T15 | 时间线与重连 | IN_PROGRESS（真实事件摘要/SSE补齐/断线重连/历史分页已用Chrome验证；统一usage与完整时间线细节未完成） | T14 |
| T16 | 模式/附件输入 | VERIFIED_V1（三模式/确认/停止/受限重试、单图上传/管理员许可/逐次同意均接通；附件刷新要求重选，不静默降级） | T15 |
| T17 | 历史交付/分叉 | VERIFIED_V1（精确历史详情/原包下载/幂等分叉已实现；逻辑祖先截取，不继承审批，不回退工作区基线；22nd additive迁移） | T16 |
| T18 | 安全图像上传 | IN_PROGRESS（单图私有上传/元数据剥离/Run冻结/前端及真实DeepSeek已验；跨平台/完整资源矩阵后续） | T06/T12/T16 |
| T19 | 像素分析与缓存 | IN_PROGRESS（真实派生像素分析与结构审核、gateway/cache已接且实测成功；成本A/B/完整真实命中率后续） | T18 |
| T20 | 控件与证据匹配 | IN_PROGRESS（现有控件映射/证据/明确差异审核已接真实图生；替代控件/视觉质量仍待优化） | T19 |
| T21 | 语义编译/snapshot | IN_PROGRESS（初次图生已通过最终真实semantic@24、确定性编译/snapshot/实际worker/原生包；视觉内容续改协议T23后置） | T20 |
| T22 | 图生确认流程 | IN_PROGRESS（可用版初次单图完整真模型至下载通过；显式限租户支持开启，默认仍关；高级交互/替代/可信视觉retry、业务源/实时绑定不在本版） | T21 |
| T23 | 局部修改 | IN_PROGRESS（生成文本工程的静态控件/页面/本地状态可凭精确旧签名证据续改；视觉旧内容普通文字续改模型前明确阻断，新同意/局部视觉修改后续） | T22/T17 |
| T24 | 静态验证/证据分级 | IN_PROGRESS（交付/历史详情区分compiled/runtime/visual，制品SHA与签名校验接通；完整原生与像素评分未完成） | T21；验收依赖T23 |
| T25 | 原生验证 | IN_PROGRESS（已授权KF443，最终短名三包独立导入/读回一致，开发态打开0JS/0dialog且测试席位释放；未发布，运行/交互/像素验收另列） | T24；需授权环境 |
| T26 | 评测/成本对比 | NOT_STARTED | T23/T24；runtime部分依赖T25 |
| T27 | 发布/补丁/交接 | IN_PROGRESS（可用版启动/隔离环境/迁移回退/精确补丁已交付VERIFIED_V1；完整长期生产发布矩阵后续） | T26；可明确不发布T25 |
<!-- end -->
<!-- end -->
<!-- end -->
<!-- end -->

## 每任务的记录格式

复制下方字段填写实际结果，不能预先勾选计划步骤：

```text
任务：Txx
状态：IN_PROGRESS / VERIFIED / BLOCKED_ENV / NEEDS_REVIEW
执行日期与功能标注：实际日期 / Agent工作台迭代
基线：commit SHA、branch、相关dirty文件摘要
实现：新增/修改的确切仓库相对路径
红测：命令、失败原因、测试数量
绿测：命令、测试数量、通过/失败/跳过
回归：影响模块及结果
数据库：隔离DB名称（不含密码）、migration checksum、升级结果
证据：脱敏日志/截图/制品hash/报告路径
提交：自己的commit或未提交原因（混有用户改动时明确记录）
偏差：与design或计划不同之处、原因、已同步的文档
风险：仍未验证的项，是否阻断发布
下一步：下一个依赖满足的任务及具体第一条操作
```

## 接手时的只读检查

仓库根执行：

```bash
git status --short
git rev-parse HEAD
git branch --show-current
rg --files -g AGENTS.md -g package.json -g pnpm-lock.yaml -g '*agent-app*2026-10-20*'
```

agent-app内执行：

```bash
node --version
pnpm --version
rg -n 'TRUNCATE|TEST_DATABASE_URL|E2E_DATABASE_URL' apps packages tests
rg -n 'chatJson|generateSolutionImplementationPlan|buildCreativeBlueprintPrompt' apps/api/src/conversations/deepseek-model.ts
rg -n 'createClassifyIntentNode|createSolutionGraph|generationWorkflow' packages/agent-orchestrator/src apps/api/src/workspaces
```

只输出变量名/脱敏数据库名，不把.env、API key、session cookie或连接密码发进聊天。测试前按T00使用明确隔离库。

## 不得误读的历史结论

- creative-v2已经是新建workspace主线，不要实现第二套相同功能。
- module-v1“5个稳定模块”不是全部creative控件上限；以registry/adapter/实际证据为准。
- confirmation 有确定性快路，审批原生 Command/哈希语义保留在 Run action；旧 POST messages/resume 已按维护者要求删除，不再恢复兼容入口。
- creative关闭旧preview是明确历史设计；新原生验证不等于复活旧HTML预览。
- build-jobs已经有workspace互斥与stale-base判断；新run锁必须与之协调。
- 上传assets已实现基础安全检查；扩展参考用途与像素传输，不另建裸上传。
- 现有用户日志没有提供真实cache hit基线；计划中的-20%是实验目标，不是已验证收益。
- 暂未运行的测试和缺失的原生截图不能写“通过”。

## 需要维护者参与的决策点

这些不阻止先做离线开发，但到对应阶段必须落实：

1. T00：专用可清空测试数据库、如何保留当前dirty基线；若需新worktree，必须携带经过维护者保存的正确状态。
2. T01/T19：生产模型endpoint/model/视觉能力白名单、价格版本、租户图片外发策略；不自动换模型。
3. T25：KF原生隔离环境、运行版本、字体/viewport、测试工程和账号；未提供时native验证保持关闭。
4. T26：允许真实模型评测的样本、预算和key；离线fake不能替代实测。
5. T27：生产部署窗口、备份、迁移执行权、各flag灰度租户和保留策略；本计划不是生产操作授权。

## 停止与升级条件

遇跨租户泄露/审批绕过/制品错绑立即停相关实现并报告；不要用更宽权限解决。遇同文件用户改动无法隔离时停提交并请求基线；不要reset。遇原生能力缺失时提供受支持替代并说明，不让模型编造。遇预算不足、真实环境缺失、迁移不可兼容时停止受影响步骤，保留已验证成果，不把问题隐藏为skip。

## 可直接复制给其他模型的完整提示

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
> 接手 KingFusion3.6/agent-app，先完整读根 AGENTS.md、master/design/handoff、agent-app/docs/run-browser-20261021.md、operations，再按需读 SSE/审计历史报告。预算暂缓、先完整流程；旧 POST messages/resume 永不恢复。当前 run-plan@6：已修复原生重规划以待审批提案作已应用 diff 基线的问题，完整规格针对真实 currentRevisionId 编译；保留模型上下文/部分修改的组件。所有现存 Playwright 已迁移 Run/UI，隔离五进程和双租户 agent-worker，两轮各9项通过，三类工程和实际包已验。A 只替换模型固定输出，B使用生产agent-worker/fake；不得声称收费模型/KF原生验收。最新扩大回归754 passed/1 failed/0 skipped，共755：API424/425、Web129、图69、build68、worker41、守卫环境14、浏览器9。先定位API偶发403与HTTP Parse Error；run-flow单独和次批15/15，但次批历史api.integration首例仍Parse Error，根因未确认，不能靠skip/exclude/retry或只拿重跑通过宣称全绿。之后做真实API/worker SIGKILL/restart与无重复job、代理/多副本/长期soak、事件保留410、旧协议排空与整体升级回退，再推进会话收口/图片。新客户端after必须用本地已收到seq，新订阅0，不直接跳到snapshot.lastSeq。PLAN_*只表示决定消费，自动取消actor缺失不猜。实际.env/业务库/常驻服务未动，新入口默认关闭、精确租户UUID准入；E2E新独立库只deploy既有18迁移，业务库未升级。@5或更旧任务须旧worker排空后整体切换，不能清空snapshot/checkpoint/改历史版本强行继续，无runId旧checkpoint需维护者处置。保留签名/编译/审批/制品绑定和混合dirty，不reset/整体提交/推送，不改其他服务。只用隔离库，不同套件不得并发清同一库，按实际日期+Agent工作台迭代标注，TDD与如实验证并更新交接；不自动开多代理或收费模型/生产操作。
<!-- end -->

## 执行方式

当前使用 executing-plans + TDD 在同一会话逐批实施；用户已授权继续修改产品。不要自动开启多代理、创建新任务或提交混合 dirty 修改。以下早期实施记录保留为历史证据；与上方最新台账冲突时，以最新台账及对应验证报告为准。

## 实施记录

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
```text
任务：T09/T12 现行浏览器与独立 worker 核心验收（整体仍 IN_PROGRESS）
实现：全部现存 Playwright 改 Run/UI；API/build/两个租户 agent-worker/Web 独立进程；环境钥/开关隔离、真 Origin、迁移/种子/当前进程清理
修复：新版源工程上传入口、拒绝/readonly/迟到结果保护；原生未执行提案不能当编译diff基线，避免空补丁/漏操作，协议@6
红测：视图缺上传入口；真实编译器两项复现同方案空操作/部分修订漏操作；浏览器原生重规划 UI_IMPLEMENTATION_INVALID
浏览器：两轮完整9/9，源包仅按钮颜色变化，其他文件字节和未知字段不变，三类工程实际构建/交付/下载
回归：最新754 passed/1 failed/0 skipped，755选定项；API424/425，Web129，图69，build68，worker41，守卫环境14，浏览器9
异常：API首批run-flow一次403，单独与次批15/15；次批api.integration首例HTTP Parse Error，根因未确认；不报告全绿
静态：根/API/worker/图tsc、Web vue-tsc/build、相关TS ESLint/diff通过
环境：新kf_agent_e2e_browser_20261021 deploy既有18迁移，0007 checksum一致；业务库/.env/常驻服务未动，无commit/push/正式补丁
删除：旧global-teardown持久PID清理脚本，Git可恢复；由当次setup清理函数替代，无工程数据删除
清单/证据/命令：agent-app/docs/run-browser-20261021.md
下一步：先定位API偶发失败，然后真实进程kill/restart/无重复job、代理/多副本/410/旧协议升级回退
```
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
```text
任务：T10/T12 SSE生命周期与前端订阅可靠性（整体仍IN_PROGRESS）
状态：只读RunEventStreamService；背压/drain/64KiB/30秒窗口/心跳/poll；权限复核；监听器/计时器/迟到DB结果清理
前端：reader释放/单帧上限；start单飞/stop/迟到事件与快照；快照鉴权不重试；1/2/4/8/15秒±20%抖动、上限15秒、恢复重置
红测：权限丢失仍发后续事件六场景，Writable初始四项，正常缓冲误destroy/空页忙循环，Web初始五项与退避两项
回归：API35文件425、Web23文件125、图4文件60、build4文件68、worker4文件41，共719 passed，0 failed/0 skipped；API/worker tsc、vue-tsc/build、TS ESLint/diff检查通过
实测：100真实短连接后DB可用且Run未变；断线后完成/seq补齐；不等于浏览器/proxy/OS kill/堆内存压测
边界：流内不刷新lastUsedAt，普通HTTP滑动保持；Prisma单次查询不物理取消；事件保留410未实现
协议/环境：仍run-plan@5，无migration、业务库/.env/常驻进程未动，无commit/push/正式补丁
清单：agent-app/docs/run-stream-20261021.md
下一步：迁移旧Playwright并启动独立agent-worker，真实进程故障/代理/多副本长期连接、升级回退验收
```
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
```text
任务：T12 真实Run审批/构建审计子项（整体仍IN_PROGRESS）
状态：受理、审批消费、构建入队/实际终态审计；节点memo/业务/job同事务；稳定幂等id
修复：RunStepStore等行锁前时间失效；memo提交/checkpoint未完成恢复；同hash改稿不得自动复用审批；自动native cancel沿用真实停止发起人而非原请求人，缺源审计不猜身份
协议：run-plan@5，先旧worker排空旧协议任务再整体切换，不混worker、不清空snapshot
红测：最初19项中15项缺日志/回滚失败，另补真实锁等待过期、蓝图hash版本、真实图checkpoint gap和同hash改稿红测
回归：API33文件404、Web23文件110、图4文件60、build4文件68、worker4文件41，共683 passed，最终0 failed/0 skipped；tsc/vue-tsc/build/TS ESLint/diff检查通过
观察：扩大API首轮400过2失败（旧fixture HTTP Parse Error/creative交付404），单独和完整范围复跑均通过；根因未确认不删记录
数据库：复用原隔离库，无新migration，未动业务库/.env/常驻服务；无commit/push/正式补丁
清单/证据：agent-app/docs/run-audit-20261021.md
下一步：SSE生命周期、旧Playwright与独立agent-worker、OS进程故障/升级回退与旧checkpoint处置
```
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
```text
任务：T12 服务端准入/配置冻结 + T16 能力显示（整体仍 IN_PROGRESS）
状态：RunStore事务准入/精确名单、config API、flags/协议快照、cache前版本校验、停新受理可drain与取消、前端只读/异步隔离已验
基线：94364cd9add74915c6f85af96357ee5b286faede，main，混合dirty；无reset/commit/push
红测：config404、关闭后retry202、快照null；store省略配置绕过；无缓存保护；未知协议/完成cache仍成功；前端仍可写/误称图片外发；跨租户旧提交迟到挂回新视图
回归：API32文件378、Web23文件110、图4文件60、build4文件68、worker4文件41，共657 passed，无失败/跳过；相关tsc、vue-tsc/Vite build、TS ESLint、diff检查通过
配置：仅改.env.example；未改实际.env/启用租户/重启服务；默认关闭，启用需精确租户UUID名单；预算和视觉继续关闭
数据库：复用kf_agent_test_retirement_20261021_1015（18迁移），无新migration，未动业务库
边界：仅冻结flags/协议，不等于provider/prompt/pricing已冻结；审计/Playwright/OS进程kill/生产发布仍待补
证据/完整清单：agent-app/docs/run-feature-policy-20261021.md
下一步：真实Run审批/构建幂等审计，随后SSE/浏览器/进程恢复与发布验收
```
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
```text
任务：T12 旧执行入口退役（整体仍 IN_PROGRESS）
状态：旧公开写 API/生产旧执行代码/旧前端调用删除并回归；服务端 flags/Run 审计/Playwright/进程与发布门槛尚未完成
基线：94364cd9add74915c6f85af96357ee5b286faede，main，混合 dirty；未 reset/commit/push
实现：messages/resume POST 404；生产 ConversationService 不再执行旧回合；旧 store/SSE sender 删除；历史领域场景移至 test-support；GET 查询/交付/下载与三类工程 workflow 保留
红测：退休接口实际200/409（预期404）；绿测3项包含无副作用/新Run入队/消息读取
回归：API31文件364、Web23文件102、图4文件60、build4文件68、worker4文件41，共635 passed，无失败/跳过；相关类型、Vite build、TS ESLint、diff --check通过
数据库：新建 kf_agent_test_retirement_20261021_1015，已有18迁移 deploy成功，无新migration，未动业务库
偏差：维护者明确允许删除旧接口，取消初稿兼容桥，已同步design/master/p2
证据/全部文件/恢复备份：agent-app/docs/legacy-retirement-20261021.md
运行/升级/未验证边界：agent-app/docs/agent-runs-operations.md
下一步：T12 admission/configSnapshot、Run审计、现行Playwright、SSE/真实进程故障与升级演练；预算暂缓
```
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
```text
任务：T11 排队/基线/原生取消恢复（并补 T08/T09/T16）
状态：核心链路通过相关验收；整体 IN_PROGRESS，预算相关暂缓，T12 发布级门槛未完成
执行日期与功能标注：2026-10-21 / Agent工作台迭代
基线：94364cd9add74915c6f85af96357ee5b286faede，main，混合 dirty；未 reset/commit/push
实现：同会话 FIFO/20条上限/审批优先、run 消息隔离、逐修订归属校验、冻结基线、原生中断取消恢复、前端排队/跟进/重新规划
红测：排队拒绝、未来消息、基线暗换/外部修订“洗白”、中断假取消/恢复遗弃、审批事件重复、前端队列/停止目标、竞争错误500
绿测：API24文件275；Web24文件127；图4文件60；构建核心4文件68；worker4文件41，共571 passed
回归：API/agent-orchestrator/build-jobs/worker tsc、Web vue-tsc/Vite build、相关TS ESLint、diff --check 通过
数据库：新建 kf_agent_test_queue_20261021_0101；已有18迁移全部 deploy 成功；本批无新migration，未动业务库
证据/文件清单/重现命令：agent-app/docs/run-queue-20261021.md
偏差：最新运行查询按屏障/队头/链尾；原生取消可在旧基线上执行，但不能批准；run-plan@4；设计已同步
风险：旧SSE桥接、flags、OS kill、SSE背压/鉴权过期、真实模型/视觉/KF原生/发布未验收
下一步：T12 先写新旧入口共享业务屏障与flag off/on红测；保留签名/制品绑定/TurnFence保护
```
<!-- end -->

```text
任务：T00
状态：VERIFIED（守卫与基线记录完成；5 条既有失败单列，不代表本轮通过）
执行日期与功能标注：2026-10-20 / Agent工作台迭代
基线：HEAD d8fdcb4（branch main）；agent-app 开工前 194 个已修改文件；本任务触碰的 10 个文件中 7 个带既有改动
实现：新增 tests/helpers/{database-safety.ts,database-safety.test.ts,vitest.config.ts}、docs/{agent-next-baseline.md,agent-next-change-manifest.md}；
      修改 tests/e2e/helpers/destructive-reset.ts 与 9 个破坏性集成测试（统一守卫 + 兜底库名改 kf_agent_test_agent_next）
红测：vitest run --config tests/helpers/vitest.config.ts → Cannot find module './database-safety.js'（1 文件加载失败）
绿测：同上 6 passed；e2e 守卫 13 passed；负向验证缺 KF_TEST_ALLOW_DESTRUCTIVE_RESET → TEST_DATABASE_NOT_AUTHORIZED 且未连库
回归：tsc -p apps/api|apps/worker|packages/build-jobs|packages/agent-orchestrator --noEmit 4/4 通过
      集成基线（隔离库）：157 通过 / 5 失败；失败项均与本轮改动无关（详见 change-manifest §4）
数据库：kf_agent_test_agent_next（新建，owner postgres）；prisma migrate deploy 全部迁移成功；本机 Postgres 16 以 pg_ctl 启动
证据：agent-app/docs/agent-next-change-manifest.md（红绿命令、逐套件结果、既有隐患 3 项）
提交：本地提交 test(agent): guard isolated integration databases；未推送远程
偏差：pnpm 不在 PATH，改用 ./node_modules/.bin/{vitest,tsc,prisma}；e2e 守卫用例不在 workspace 项目根内，用临时配置单独验证
风险：①空库先跑 api.integration 必挂（checkpoint 表顺序依赖）②job-runner 的 EEXIST 疑为本机沙箱 FS broker 包装错误，需非沙箱终端复核
下一步：T01 模型合同与 usage 规范化（packages/contracts/src/model-usage.ts 起）
```

```text
任务：T01
状态：VERIFIED
执行日期与功能标注：2026-10-20 / Agent工作台迭代
基线：T00 之后（本地提交 469a3a3）
实现：新增 packages/contracts/src/model-usage.ts（ModelTask/NormalizedUsage/ProviderUsage/ModelRoute）+ index 导出；
      apps/api/src/models/{model-types,normalize-usage,model-config}.ts；两份测试；.env.example 补模型变量说明
红测：normalize-usage.test.ts → Cannot find module './normalize-usage.js'；model-config.test.ts → Cannot find module './model-config.js'
绿测：10 passed (10)（normalize 5 + config 5）
回归：tsc -p packages/contracts / apps/api --noEmit 均 exit 0
数据库：未涉及
证据：agent-app/docs/agent-next-change-manifest.md §T01
提交：本地提交，未推送
偏差：计划只要求 normalize 红线；额外先写了 model-config 红线以保证先测后码
风险：DeepSeek 真实 vision 模型名与能力仍未实测，T19 前需维护者给出白名单；价格表版本待 T02 提供
下一步：T02 调用账本与费用（prisma ModelInvocation + pricing.ts）
```

```text
任务：T02
状态：VERIFIED
执行日期与功能标注：2026-10-20 / Agent工作台迭代
基线：T01 之后（本地提交 4370d27）
实现：prisma ModelInvocation + migrations/202610200001_model_invocations；
      apps/api/src/models/{pricing.ts,model-invocation.service.ts} + 两份测试
红测：pricing.test.ts → Cannot find module './pricing.js'
绿测：pricing 4 passed；账本集成 6 passed（隔离库 + KF_TEST_ALLOW_DESTRUCTIVE_RESET=1），合计 10
回归：tsc -p apps/api exit 0；conversation-turn-lease + preview.service 19 passed
数据库：kf_agent_test_agent_next 新增 ModelInvocation；migrate deploy 成功；
      checksum 6fb3e0d53c42ea9e651c992f6d8a1fee2598a9bf049bb20200c3a13b5fa3b0bd（与 _prisma_migrations 一致）
证据：agent-app/docs/agent-next-change-manifest.md §T02
提交：本地提交，未推送
偏差：①migrate dev 因 checkpoint_* 运行期表被判漂移，改用 migrate diff + 影子库生成 SQL；
      ②diff 报出 BuildSchedulerCursor.updatedAt 删默认值与 3 条索引重命名属既有漂移，未纳入本迁移
风险：①既有 schema 漂移未处理，后续迁移会反复报同一批 diff；②价格表尚未接 env（T06 处理），当前通过构造参数注入
下一步：T03 统一 provider transport、全程 deadline 与取消（deepseek-transport.ts + model-gateway.ts）
```

```text
任务：T03
状态：VERIFIED
执行日期与功能标注：2026-10-20 / Agent工作台迭代
实现：新增 apps/api/src/models/{deepseek-transport.ts,model-gateway.ts} + 两份测试；
      deepseek-model.ts 的 chatJson 委托 transport；orchestrator ModelPortContext 增加可选 execution
绿测：transport 8、gateway 5、老模型套件 124（合计 137 passed，零回归）
回归：tsc -p apps/api / packages/agent-orchestrator 均 exit 0
数据库：未涉及
证据：agent-app/docs/agent-next-change-manifest.md §T03
提交：本地提交，未推送
偏差：transport 先写实现后补测（未走红测）；截断原因由 transport 返回给 chatJson 再转 JSON_TRUNCATED，
      以保留既有「关 thinking 重试」路径
风险：gateway 尚未接进 Nest 模块与老入口（T06/T12 才接），当前仅单测覆盖
下一步：T04 按任务拆 prompt、稳定前缀与确定性动作
```

```text
任务：T04
状态：VERIFIED（等价口径，冯工 2026-10-20 确认「按等价做」）
实现：新增 apps/api/src/models/{canonical-json.ts,task-prompts.ts} + task-prompts.test.ts；
      deepseek-model.chatJson 消息构造改走 buildTaskPrompt（system 原文仍由调用方传入）
绿测：prompt 7 passed；老模型套件 124 passed（body 断言不变 = 字节等价）；transport 8 passed
回归：tsc -p apps/api exit 0
数据库：未涉及（同批完成 schema 与 migrations 对齐收口，diff 现为空迁移）
证据：agent-app/docs/agent-next-change-manifest.md §T04
提交：本地提交，未推送
偏差：①六类提示词文案未拆分，仍共用 SYSTEM_PROMPT 原文；②classify-intent 未改（确定性路由留 T09）；
      ③promptVersion/prefixHash 已产出但未落库（T06 接）
风险：文案精简一旦启动会改变模型输出质量，需单独评审与样本对比
下一步：T05 上下文装配、摘要有效性与窗口预算
```

```text
任务：T05
状态：IN_PROGRESS（装配与记忆接入完成；摘要节流/持久化/graph-ports 接线依赖 T06）
实现：新增 apps/api/src/models/context-builder.ts + 测试；
      Conversation 增 memory/memoryThroughMessageId + 迁移 202610200002（checksum af23f624…）；
      deepseek-model 蓝图上下文条件注入 conversationMemory（≤1200 字符）
绿测：context-builder 7 passed；老模型套件 124 passed；tsc -p apps/api exit 0
数据库：kf_agent_test_agent_next 已应用；migrate diff 回到 empty
证据：agent-app/docs/agent-next-change-manifest.md §T05
提交：本地提交，未推送
偏差：摘要生成与记忆持久化未做，留给 T06（需要预算/网关的 summary 调用通道）
风险：memory 字段目前无人写入，读取路径仍是旧 summary 字符串
下一步：T06 统一预算、重试协调器与统计接口（含 summary 计费与 T05 剩余项）
```

```text
任务：T06
状态：IN_PROGRESS（预算/重试/统计核心完成；adapter 嵌套修复与编排层接线待 T07-T12）
实现：新增 retry-policy.ts、usage-summary.ts、run-budget.service.ts 及三份测试；
      model-gateway 增加可选 BudgetPort（预占先于账本与外发）；
      RunBudget + BudgetReservation 表与迁移 202610200003（checksum 287c9e63…）
绿测：retry 3 + usage-summary 2 + gateway 7 = 12；预算集成 8（20 并发恰好 8 成功）
回归：tsc -p apps/api exit 0；migrate diff → empty
数据库：kf_agent_test_agent_next 已应用两表
证据：agent-app/docs/agent-next-change-manifest.md §T06
提交：本地提交，未推送
偏差：①adapter 内嵌套修复未移除 ②solution-implementation-plan 未接 decideRetry
      ③T05 遗留（摘要节流/记忆持久化/graph-ports）未做 ④价格表仍靠构造注入
风险：预算已可强制，但旧入口 runId 为 null 时不走预算，需 T12 桥接后统一
下一步：T07 Run/Event 数据迁移与持久化
```

```text
任务：T07
状态：VERIFIED（RunBudget 外键按计划留到 T08）
实现：contracts/agent-run.ts（状态/模式/动作/事件 + Zod 白名单）+ 测试；
      apps/api/src/runs/run-state.ts（显式邻接表）+ 测试；
      AgentRun/AgentRunEvent/AgentRunStep 表，Conversation/Message 扩展，ModelInvocation.runId FK；
      迁移 0004（结构，e0289628…）+ 0005（lastActivityAt 回填，c74490e5…）
绿测：contracts 5、run-state 4、schema 集成 4；tsc 无错误
数据库：kf_agent_test_agent_next 已应用 0004/0005
证据：agent-app/docs/agent-next-change-manifest.md §T07
提交：本地提交，未推送
偏差：①RunBudget.runId 未加 FK（会让 T06 独立预算测试失效）②Message.runId 未加 FK
风险：AgentRun 表已可写，但尚无创建/领取/事件写入服务（T08 起）
下一步：T08 幂等创建、队列领取、租约与 fencing
```

```text
任务：T08
状态：IN_PROGRESS（创建/领取/续期/追加/收尾完成；过期租约恢复与 advisory 协调待 T09/T11）
实现：新增 apps/api/src/runs/{run-store.ts,run-test-fixture.ts,run-store.integration.test.ts}
绿测：run-store 集成 10 passed（并发幂等、每会话单活跃、旧 fence 拒绝、过期租约拒绝、终态不复活）
回归：tsc -p apps/api 无错误
数据库：未新增迁移（复用 T07 表）
证据：agent-app/docs/agent-next-change-manifest.md §T08
提交：本地提交，未推送
偏差：①过期租约恢复未做 ②未与 conversation-turn-lease advisory lock 协调 ③run.service/run.module 留 T10 ④RunBudget.runId 外键仍未加
风险：租约过期的 RUNNING run 目前会卡住，必须由 T09/T11 的恢复逻辑兜住，不能上线裸跑
下一步：T09 独立执行器、确定性操作与可恢复节点
```

```text
任务：T09
状态：IN_PROGRESS（动作路由/步骤幂等/执行器完成；worker 进程与 Nest 装配未做）
实现：新增 apps/api/src/runs/{action-router.ts,run-step-store.ts,run-executor.ts} 及两份测试
绿测：action-router 2、run-executor 集成 5；tsc -p apps/api 无错误
数据库：未新增迁移
证据：agent-app/docs/agent-next-change-manifest.md §T09
提交：本地提交，未推送
偏差：①无独立 worker 进程与 start:agent-worker ②图未接 runId/stepHash ③E2E 第四进程未加 ④过期租约恢复仍缺
进度更新：已补 recoverExpired + RunWorker（16 passed）；仍缺进程入口与图接线
风险：执行器只能被测试直接驱动，生产链路尚未使用；与 LangGraph 的一致性校验缺失
下一步：T10 事件重放、快照与新 API
```

```text
任务：T10
状态：IN_PROGRESS（查询层与 Origin 守卫完成；controller/SSE 未做）
实现：新增 runs/run-query.service.ts（snapshot/eventsAfter/serializeRunEvent）
      + auth/mutation-origin.guard.ts；两份测试
绿测：run-events 集成 5、origin 守卫 3；tsc -p apps/api 无错误
证据：agent-app/docs/agent-next-change-manifest.md §T10
偏差：未建 controller/module，未做 SSE 长连接与 heartbeat
下一步：T09 图接线（solution-graph 带 runId/stepHash）+ worker 进程入口，再做 T10 端点
```


## 计划文档自检记录（2026-10-20）

- 需求覆盖：master矩阵已将成本、多会话、图片组件生成、局部修改、质量和安全分别映射到任务。
- 结构检查：8份文档、T00–T27共28个唯一任务、176个未勾选步骤；没有遗漏/重复任务编号、未闭合代码围栏或失效的仓库内Markdown文档引用。
- 占位检查：未发现未定占位词；测试fixture、接口、错误码和关键算法已写入各阶段。
- 一致性修正：统一视觉确认action；修正AppModule注册路径；明确旧请求预算与持久run外键的过渡；增加失效lease恢复、等待审批屏障和不可变snapshot顺序。
- 验证边界：以上只是计划文档检查，不是业务测试通过；本轮没有运行数据库迁移、应用测试、真实模型评测或KF原生验证。

---

## 最新实施记录：停止/重试与构建协调（2026-10-20）

```text
任务：T11（并补 T03/T08/T09/T10/T16 接线与竞态）
状态：IN_PROGRESS；不等于全部计划完成
执行日期与功能标注：2026-10-20 / Agent工作台迭代
基线：94364cd9add74915c6f85af96357ee5b286faede，main；沿用混合 dirty 工作区
实现：停止/重试 HTTP API、真实模型 AbortSignal、图节点执行屏障、构建绑定/提交取消、前端真实操作
红测：模型迟到返回、过期租约、等待行锁期间过期、取消与 pause 竞争、忙碌与重试竞争发送等
绿测：API 21 文件 221；Web 24 文件 124；图 3 文件 53；构建核心 4 文件 68；worker 4 文件 41，共 507 passed
回归：API / build-jobs / worker tsc、Web vue-tsc、Vite build、选定修改 TS 的 ESLint、diff --check 均通过
数据库：新隔离库 kf_agent_test_runcontrol_20261020_2130 全部18迁移成功；业务库未改
迁移：202610200007_build_run_control；SHA256 b905fb94542f7455c67afcc173e06a20b9c8767fd6ae31e30c7a793c0e7b6920
证据及完整文件清单：agent-app/docs/run-control-20261020.md
提交：未提交/推送；当前文件混有前序和用户修改，不整体提交
偏差：对账复用 RunWorker 恢复+waitForRunBuild；取消构建后重试重新规划确认，不盲目复用旧审批
风险：完整运行中排队/基线变更、flags、真实审批取消专项E2E、OS kill演练未完成；无真实模型/原生验收
下一步：补 T11 队列消息视图隔离与审批优先级，再 T12 灰度；预算限制继续暂缓
```

## 当前剩余任务与建议顺序

### 第一批：把 P2 真正跑通（约 3 个任务量）

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
1. **T11 核心已落地**：不要重复实现 FIFO/基线/消息隔离；预算相关继续暂缓。当前重点转到 T12 旧入口桥接与统一业务屏障，不把当前入口并存当作已经可发布。
<!-- end -->
2. **T09/T10 故障与资源验收**：已接真实图和 controller，不要重建；补 OS kill 演练、SSE 背压、session 过期与 100 短连接资源测试。
3. **T12 灰度开关**：runs/workbench 配置接口、旧 SSE 桥接与回退；默认关闭新功能，未经灰度验收不直接发布。

### 第二批：前端工作台（T13–T17）

已完成主视图和真实创建/列表/切换、事件续传、模式/确认/停止/重试。剩余 T13（分页/归档等 API）→ T14（未读/导航收口）→ T15（完整历史）→ T16（真实附件）→ T17（历史交付/分叉），不是从零重做 UI。

### 第三批：图生工程（T18–T23）

T18 安全上传 → T19 像素分析与缓存 → T20 控件证据匹配 → T21 语义编译 → T22 确认流程 → T23 局部修改。**T18/T19 需要真实视觉模型白名单与单价**，目前只有 `supportsVision=false` 的占位。

### 第四批：验证与发布（T24–T27）

T24 静态验证 → T25 原生验证（需授权环境）→ T26 评测与成本对比（需真实用量数据）→ T27 发布/交接。

### 明确的外部依赖（没有这些，对应任务只能做到"框架+单测"）

<!-- modified by jinlong.feng at 2026-10-27 Agent工作台迭代 -->
| 依赖 | 影响任务 | 现状 |
|---|---|---|
| DeepSeek 真实单价与缓存计价 | T02 费用、T26 成本对比 | 未提供，费用记 null |
| 视觉模型名与能力 | T18/T19/T20 | 用户授权DeepSeek；本机试用deepseek-flash文本/视觉路由，显式思考/租户许可及逐次同意 |
| 允许的真实模型验收范围与密钥配置 | T05/T06 尾巴、T26 质量对比 | 用户已授权合成能源UI真实调用；密钥仅既有私有.env，成本全账本和A/B尚未完成 |
| 授权环境（原生验证） | T25 | 用户已授权KF443测试环境；账号凭据不写文档，当前包独立导入/页面读回证据在usable-v1公开摘要 |
<!-- end -->

---

## 前端对接契约（2026-10-20，供前端那条线直接使用）

### 已实现端点

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/conversations/:conversationId/runs` | 创建 run，返回 202 + RunSnapshot |
| GET | `/api/runs/:runId` | 快照（含 `lastSeq`、`status`、`failureCode`） |
| GET | `/api/runs/:runId/events?after=N&limit=100` | SSE 事件流，`id:` 即 seq |
| GET | `/api/conversations/:conversationId/runs/latest` | 恢复最新运行 |
| POST | `/api/runs/:runId/cancel` | 停止意图，200 实际快照；不保证立即终态 |
| POST | `/api/runs/:runId/retry` | 新运行重试，202；body 为 clientRequestId |

### 请求体（POST）

```json
{
  "clientRequestId": "uuid-每次点击唯一",
  "clientMessageId": "uuid-消息唯一",
  "mode": "build",
  "action": { "type": "message", "text": "生成一个生产大屏" },
  "attachmentIds": [],
  "expectedBaseRevisionId": "可选"
}
```

- `action` 是严格判别联合，未知 type / 多余字段 / 超过 20000 字 → 400
- 同 `clientRequestId` 重复提交：内容相同返回**同一个 run**；内容不同返回 `IDEMPOTENCY_CONFLICT`
- POST 需要 cookie 会话 + **`Origin` 头命中服务端白名单**（`AGENT_ALLOWED_ORIGINS`），否则 403

### 事件流语义

- 每条帧：`id: <seq>` / `event: <type>` / `data: <JSON>`，浏览器 EventSource 可用
- 断线重连带 `?after=最后收到的 seq` 即可补齐；服务端每 30 秒主动结束，让客户端重连
- 游标非法（负数/非整数/超过 lastSeq）→ 400；跨租户或不存在 → 404
- 事件类型以 contracts/agent-run.ts 为准；`decision.summary` 的 payload 是公开摘要（≤600 字）及受限引用，**不含模型原始思维链**

### 前端可依赖 / 不可依赖

**可依赖**：创建幂等、快照含 lastSeq、事件按 seq 严格递增且可重放、`WAITING_APPROVAL` 表示等用户确认。

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
**当前能力边界与未完成项**：
<!-- end -->
- run 入口开关（T12）：目前没有 flag，前端不要假设能灰度关闭
<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
- 同会话 FIFO 已实现；20 条 QUEUED 上限，超出 409 RUN_QUEUE_FULL。WAITING_APPROVAL 拒绝普通消息；retry 在有活跃轮次时仍为 RUN_IN_PROGRESS。前端已接排队/自动跟进。
<!-- end -->
- 完整会话分页/归档/分叉/历史交付管理（T13/T17）；基础创建/列表已存在
- 附件上传与视觉相关 action（T18+）：`revise_regions`/`accept_visual_reference` 会返回 `FEATURE_NOT_ENABLED`

### 前端待建（T13–T17）

1. **T13 会话管理 API 收口**：分页、重命名、归档
2. **T14 多会话导航收口**：真实未读/活跃态与归档
3. **T15 时间线与历史验收**：主链事件与 `?after=` 续传已接，继续补历史/资源边界
4. **T16 真实附件输入**：discuss/plan/build 已接，附件暂不启用
5. **T17 历史交付与分叉**：按 revision 展示产物，从任意点分叉
<!-- end -->
