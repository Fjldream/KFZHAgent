<!-- modified by jinlong.feng at 2026-10-20 Agent工作台迭代 -->
# Agent App Next Master Implementation Plan

<!-- modified by jinlong.feng at 2026-10-27 Agent工作台迭代 -->
**本轮可用版已验收交付（VERIFIED_V1）。** 真实DeepSeek文字生成、原需求继续修改、单图识别/审核/独立蓝图/构建下载、最终历史分叉均通过；三份最终包在独立KF工程导入/逐页读回相等、开发态打开无名称警告/JS错误，测试席位已释放，未发布运行态。最终源码为visual-blueprint@14 / blueprint-repair@8 / visual-semantic@24 / semantic-repair@13，生成名称最长32；结构投影v2及混合坐标/稳定记录key修复已回归。最终包与截图见agent-app/outputs/usable-v1-20261027/native-name-fixed/，父目录旧包为历史负例。入口43301、独立库UTC22迁移；完整验收见agent-app/docs/agent-next-acceptance.md，补丁见同outputs目录patch/。

**接手边界：** 优先级仍为可用流程，UI还原后置；已有图片普通文字续改明确模型前拒绝，T23新同意/局部编辑、完整运行态/交互验收、成本缓存A/B、预算和真实业务源尚未完成。已有repeater记录key集合增删暂不支持，显示值/排序可改；旧长名基线只读/历史下载，新建短名工程继续。下文旧版本号、未启用结论、“下一优先UI”等全部是对应阶段历史，不覆盖本条或最终验收表。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-27 Agent工作台迭代 -->
**最新执行优先级：先交付可用流程，UI 图精细还原后置。** 本次收口清单为 `2026-10-27-agent-app-usable-v1.md`，产品使用/实现/边界见 `agent-app/docs/agent-usable-v1-20261027.md`，启动和验收分别见 `agent-next-release-runbook.md`、`agent-next-acceptance.md`。会话管理、历史交付/分叉、显式视觉灰度和独立试用启动已实现；真实继续修改/图生和最终包验证以最新验收表为准。下文历次“下一优先 UI 还原”“生产 resolver 恒关闭”“21 对 18 迁移”等属于对应历史阶段，不覆盖当前用户优先级和新独立 22 迁移环境。
<!-- end -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 agent-app 上分阶段交付成本治理、多会话工作台、持久任务、图片驱动组件生成与验证闭环，并能交接给不了解历史的模型。

**Architecture:** 保留 creative-v2 和现有确定性编译/构建。先建立观测和预算，再把执行与 SSE 解耦；最后加入视觉结构和受限局部修改，所有交付绑定版本与证据。

**Tech Stack:** NestJS / Vue 3 / TypeScript / Zod / Prisma + PostgreSQL / LangGraph / Vitest / Playwright。

**Spec:** `docs/superpowers/specs/2026-10-20-agent-app-next-design.md`

## Global Constraints

- 只规划并修改 `agent-app` 及本次配套文档；不修改其他 KingFusion 服务。
- 保留 legacy、module-v1、creative-v2；不自动迁移已有工作区的 generationWorkflow。
- 保留租户鉴权、审批、签名计划、制品绑定、workspace 构建串行与 stale-base 拒绝。
- 参考图、OCR、用户文本和模型输出均为不可信数据，不拥有执行权限。
- UI 展示执行事件与可公开决策摘要，不持久化或展示模型原始隐藏思维链。
- 不承诺固定缓存命中率、降本比例或像素级还原率；必须附测试样本和实际测量。
- 新功能默认 feature flag 关闭；先 expand 数据迁移，后灰度启用；本期不做破坏性 contract 迁移。
- 沿用 NestJS、Vue 3、TypeScript、Zod、Prisma/PostgreSQL、LangGraph、Vitest、Playwright；本期不引入 Redis、向量数据库或新前端框架。
- 遵守根 AGENTS.md：压缩代码先格式化；代码改动按实际执行日期加统一功能名“Agent工作台迭代”的前后标注；保留原有压缩标识符。
- 不覆盖、不重置、不自动提交已有未提交修改；补丁保留原目录，只包含本任务所有新增和修改文件。

---

## 1. 阅读入口与使用方法

<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
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
**最新阻塞与验证边界：** 优先读 `agent-app/docs/visual-repeater-observation-20261023.md`。重复观察已实现，但真实能源工程仍无交付；两次新正式验收共5调用，蓝图空单位与工程 recipeId 负例已留存，三个静态侧栏按钮仍不符合精确候选。当前 blueprint@4/semantic@4，生产vision关闭。最终全量1008通过/2超时/1异步FENCE错误，期间系统合盖/维护休眠已核实，需连续唤醒约6分钟后补回归，不能据之前1007全绿声明当前全绿。业务源暂缓，T22/总体未完；下一先复验，再候选/视觉约束一致性与有界语义修复。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
**最新重复观察切片：** `agent-app/docs/visual-repeater-observation-20261023.md`。有界 mock 重复实例已复用原 provenance 展开规则，按实际字符串字段/实例/父链/原生文字再证明；新增 Chrome 实际核对两实例下载字节（fixture）。离线旧能源响应的全部观察通过，但侧栏 button 仍不符合区域候选，保持拒绝；不代表能源图真实交付或 KF运行/像素验收。最新冻结 visual-semantic@4 / visual-blueprint@4、整体排空升级、production vision关闭。下一真实模型按严格候选重新生成，再有效包/KF隔离验收；业务源继续暂缓，T22/总计划未完。下方“重复观察下一步”是上轮记录。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
**当前续做入口：** `agent-app/docs/visual-observation-journeys-20261023.md`。受限静态观察合同已实施：显式 kind/expectedTexts、共享语义与原生/制品二次证明、审批展示，旧无类型步骤仍按真实交互验证。新增 Chrome observe 已实际确认和下载包并核对原生文字（模型为 fixture）；这不是能源图真实模型或 KF 验收。下一优先有界 mock 重复实例的观察证明、真实响应侧栏控件候选不符，再真实模型工程与 KF 独立导入；业务源暂缓。冻结协议为 visual-blueprint@3 / visual-semantic@2，须排空整体升级，生产 vision 仍关闭，T22/总计划 IN_PROGRESS。完整验证/负例/文件清单见新报告，下方“先实施观察合同”为历史。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
**最新优先级与真实联调：** 用户明确业务数据源暂缓，先完成客户端工程生成。见 `agent-app/docs/visual-real-model-20261023.md`。能源UI参考图由内置imagegen生成，真实DeepSeek图片识别、差异接受、独立蓝图及工程模型调用已实测；已修复协议/schema指导与规范化顺序等问题，但**真实工程仍失败、没有本轮交付包，KF运行/1:1未验**。离线真实负例证明静态浏览旅程被误当可执行交互要求覆盖；下一切片先解决观察/交互合同，不伪造动作或跳过旅程门槛。之后真实工程打包、KF独立工程导入/运行/截图比较；业务源/T17/T23/T24–T27不冒充完成。`vision@v2`/`visual-blueprint@2`及冻结hash需要排空整体升级，production vision仍关闭，T22/计划IN_PROGRESS。当前回归与付费失败实验分开看报告；下方业务源优先顺序为历史，不继续据它扩源。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
**最新 T22 只读数据快照：** `agent-app/docs/visual-workspace-data-20261023.md`。文字区域可选当前工作区名称，服务端按 Run 的 tenant/workspace 从真实记录读取，冻结 dataSnapshots 到签名 review 并显示实际值后重新确认；不接 caller value/其他记录/URL/凭据。模型/编译 provenance 与 native/sourceMap/快照都要求精确同值、单一 text 控件，不能猜测或替代。新修订重新读取，旧版本/幂等重放/后继生成不因重命名刷新；真实 Chrome 重命名后仍在下载包找到原确认值。完整 API **988/988、零 skip**（275 视觉流程/三项 Chrome）、串行 domain **1431 passed / 5 原有 skipped**、Web 175、contracts 525、类型/14 TS lint/build 通过。**仅工作区元数据的非实时快照，不等于外部业务源/实时绑定或 KF 运行验收；T22/计划仍 IN_PROGRESS，production vision 关闭。** 下一步业务源目录/权限/类型/适配、原未知 hint 明确解决、其他交互/替代/可信 retry、T17/T23/T24–T27；预算暂缓、试用保护、旧接口退役与整体排空升级保持。下方“无数据绑定”与旧计数为历史，不能泛化本批能力。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
**最新 T22 本地交互闭环：** `agent-app/docs/visual-click-feedback-20261023.md`。已保存 action 区域可明确配置有界点击反馈要求，原 revision/签名/TTL/幂等/审计/新回执与独立批准保持；真实 button 候选、精确 click→show-feedback 语义事件/文字/级别及 native owner/onClick 二次校验均已接，原生脚本仍由编译器生成。原 static Chrome 保留，新增 feedback Chrome 实际下载并解包按 sourceMap 精确找到唯一按钮 onClick/ShowMessage 字节；模型本地 fixture，非 KF 运行验收。完整 API **64 文件 975/975、零 skip**（262 视觉流程，含两项 Chrome），串行 domain **68 文件 1419 passed / 5 原有 skipped**，Web 172、contracts 523、tsc/vue-tsc/13 TS lint/build 通过，证据与中间失败见报告 §6。**T22 IN_PROGRESS、production vision 关闭；真实数据绑定、原未知 hint 的明确解决、其他交互、替代/可信 retry、T17/T23 与 T24–T27 仍缺。** 不把本地反馈或说明当作任意数据/脚本接入；预算暂缓、试用保护/排空整体升级、旧入口退役保持。新视觉 prompt/hash 与 spec 字段不支持旧 @7 worker 混部；下方计数和尚无结构化交互均历史。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
**最新 T22 补充说明记录：** `agent-app/docs/visual-clarification-notes-20261023.md`。已保存区域可编辑交互/数据来源的有界未验证文本，原 Run revision 原子保存、签名/TTL/幂等/CAS/审计/新回执与重新选择保持；只作蓝图和语义 JSON 参考，不执行网络或授予绑定权限。原未知 interactionHint 仍拦截；有说明的静态 verified 映射降为 supported_unverified，清空不能删除原未知问题。现有 UI 原生折叠表单显示“未验证/未绑定”，实际 Chrome 修改→两类规划请求→工程下载通过。完整 API **64 文件 963/963、零 skip**（250 视觉流程/Chrome），Web 169、contracts 521，串行 domain **68 文件 1404 passed / 5 原有 skipped**；静态检查/build 通过。首轮并行 domain 1 项超时、单文件及串行全量复验均如实保留报告，不改断言/超时。**T22 IN_PROGRESS；下一步有能力证据的结构化交互需求/真实数据绑定，再替代/可信视觉 retry、T17/T23 与 T24–T27。** 说明编辑不等于绑定功能；production vision 仍关闭，预算暂缓、试用保护/整体排空升级、旧接口退役保持。下方缺口/计数均历史。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
**最新区域层级完成记录：** `agent-app/docs/visual-region-hierarchy-20261023.md`。T22 更新项支持可选 parentId/null，缺字段保留原关系/旧 hash；完整候选图拒绝未知/已删父、自/间接循环，明确移出子区域后可删原父，不静默重挂或改变全局 box。原 UI 父选择/折叠预览、临时 ID 排除、完整 browser-safe schema 校验已接；原 TTL/actor/gates/immutable child/history/CAS/签名/重新确认不变。最终完整 API **64 文件 952/952、无 skip**（14:05:17 / 274.58s，239 视觉流程/Chrome），Web 165、contracts 517、tsc/vue-tsc/lint/build 通过。**下一步 T22 交互/数据源编辑、替代和可信视觉 retry；T17/T23、T24–T27 与真实质量/系统发布专项仍缺，production vision 关闭。** 下方“层级未完成”及旧数字为历史；预算暂缓/试用保护/旧接口退役保持。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
**最新区域增删完成记录：** `agent-app/docs/visual-region-structure-20261023.md`。T22 原 revision POST 新增严格 additions/removals，总操作/最终区域/UTF-8 上限、服务端 ID/人工未知置信度、显式后代删除、保留未知问题及原 TTL/签名/幂等/原子提交不变；原 UI 新增/待删/恢复/放弃已接。共享校验已拆浏览器安全 subpath，修复完整 barrel 引入 Node 的 build/页面故障。最终完整 API **64 文件 942/942、无 skip**（13:43:38 / 260.78s，229 视觉流程/真实 Chrome 增删到工程下载），Web 161、contracts 515、tsc/vue-tsc/lint/build 通过。**下一步 T22 层级/交互/数据源、替代和可信 visual retry；T17/T23 与 T24–T27、生产专项/真实质量仍待完成，production vision 关闭。** 下方“区域增删未完成”和旧回归数字均历史；短 lease/偶发 404/WARN 不声称根治，预算暂缓/旧试用保护不变。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
最新验证收口见 `agent-app/docs/approval-concurrency-20261023.md`：原 I1 Promise.all 未保证锁内重叠，现用真实审计事务提交前 gate 保持 ADMITTED fence/已清 interrupt，两个竞争者必须精确 BUSY；独立新增释放后重放必须 NO_PENDING_APPROVAL，审计/构建仍唯一。没有修改生产审批/租约逻辑或放宽断言/timeout/retry/skip。最终完整 API **64 文件 927/927、无 skip**（13:20:50 / 252.22s，含 214 视觉流程/Chrome），API/root tsc 与改动文件 lint 通过；替代前批 925/1 的当前验收状态，但保留历史失败。**接下来继续 T22 增删/层级/交互与数据源、替代和视觉 retry；T17/T23 与 T24–T27 仍待实施/验收，production vision 仍关闭。** 历史短 lease/404/WARN 和 OS kill/资源/升级回退等专项不因单次全绿宣称根治。
<!-- end -->

这是任务设计与执行索引，不是全量实施完成报告。2026-10-20 已进入实施：文本生成闭环、工作台主视图和取消/重试已有实现与针对性回归；准确状态以 handoff 台账和 `agent-app/docs/run-control-20261020.md` 为准。尚无真实模型缓存降本、图片生成或 KF 原生运行态验收结论。

维护者后续调整优先级：**预算限制暂缓，优先跑通完整流程并修复问题**。这不等于已完成预算任务，也不等于缓存/调用观测不再需要。沿用当前目录并保留混合 dirty 状态，不自动提交或推送。

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
**最新 T22 已有区域编辑记录：** `agent-app/docs/visual-review-editing-20261023.md`。现有确认卡可编辑文字/类型/归一化位置，原子创建分析 child、继承 TTL、重算组件映射、归档旧签名展示并发布新回执/事件/审计；旧回执不能接受，必须重新选择差异且独立确认蓝图。公开 Run-scoped POST 带 Cookie/Origin/current gates/原 actor，旧 analysis-only PATCH 退役 404。真实 Chrome 已扩展为手机编辑→新确认→原 native 构建/包下载（本地模型 fixture）；完整结果与边界见报告。**T22 IN_PROGRESS，production vision 关闭；剩增删/层级/交互与数据源、替代/visual retry、升级/恢复/资源/调度专项和真实 provider/KF/Windows/1:1。** 下方“编辑未接”为历史，预算暂缓和试用保护不变。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
**最新 T22 前端/真实浏览器记录：** `agent-app/docs/visual-workbench-browser-20261023.md`。现有 UI 已接私有单图上传、显式外发同意、tenant/原 actor 隔离的只读 review 白名单、逐项风险/省略说明、独立蓝图确认和原下载。真实 Chrome 上传→SSE/刷新→差异接受→正式 PG 蓝图→工程 Run/native/sign/snapshot/BuildExecutor→实际下载字节 hash/一次性拒绝已验证（模型本地 fixture、测试组合根 staged policy，不是生产灰度）。Web 146、contracts 506，完整 API 最终结果/截图证据/中间失败见报告。**T22 仍 IN_PROGRESS，production vision 关闭；剩识别编辑/区域修订/替代/visual retry、升级/恢复/资源专项及真实 provider/KF/Windows/1:1 质量。** 下方“前端/browser 未接”为历史，不重做基础链路；预算暂缓、旧 POST 退役、21 对 18 迁移/试用保护不变。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
**最新 T22 公共工程确认记录：** `agent-app/docs/visual-public-engineering-20261023.md`。公共 confirm_blueprint 已接当前 runtime/gates、同意者/祖先/当前事实校验、原 config/base 固定候选、SQL NULL→签名 freeze 唯一消费，Message/budget/queued/审计原子提交，幂等先于当前 gate/runtime。视觉配置降级不能回落 @6；识别结果等待仍不能跳过差异确认。真实 Cookie/Origin HTTP 确认→正式 PG 工程图→原生快照/签名/BuildExecutor/Delivery→一次性 token/下载字节 hash 已测，新增 22 流程用例。**生产 vision 仍关闭、T22 IN_PROGRESS，前端上传/授权/差异/独立蓝图和 browser 闭环未接；下一步直接接现有 UI，不再重做后端公共确认。** 测试依赖注入 staged 策略不等于生产灰度，真实 provider/KF/像素质量仍需授权验收。无环境/迁移/试用操作，完整结果与中间红测/回归见新报告；下方为历史。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
**前批 T22 工程执行记录：** `agent-app/docs/visual-engineering-run-20261023.md`。内部签名 confirm 已接 cache 前 preflight、独立 visual-engineering step/hash、正式 registry/worker handler、可信状态确定性路由、专用 semantic、原生编译/签名/GenerationSnapshot/BuildJob/真实打包及 Run 交付。新增只读已提交作业恢复分支，先验证不可变 engineering receipt、本 Run 唯一 job/签名 artifact/snapshot/result 绑定，才允许自身结果移动 revision；TTL/撤权不重启生成，不加载图/重复发模型/enqueue。真实 precompile PG checkpoint 中断恢复与撤权拒绝、实际包 SHA-256、错误 native 映射拒绝已测。**T22 仍 IN_PROGRESS：公共视觉 confirm Store/HTTP 到下载/UI 未接，production vision 仍关闭。** 下一步直接公共确认原子事务与 HTTP 全链路，再现有 UI；不重做执行器或模型服务。无迁移/真实模型/KF/实际试用操作；追踪服务告警、中间失败、最终回归以新报告为准，下方均为历史。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
最新T22语义模型runtime见 `agent-app/docs/visual-semantic-runtime-20261022.md`：engineering proof新增可选冻结semantic route/prompt/限制/repairPolicy（旧proof可读但无配置不可执行），专用VisualSemanticService走真实祖先/当前许可/执行scope-fence-DB lease复核、gateway/usage及持久cache；服务端重算候选/素材facts，消息只含可信规划输入与已授权派生结构。普通DeepSeek提示词/校验提为共享纯函数，不改文字语义；runtime装配专用端口并在缺服务时隐藏旧未冻结视觉方法。缓存命中不修复坏hash，同fence并发/新lease恢复/旧fence迟到/取消/撤权和原semantic节点已测。**本轮尚未接可执行@7 confirm/公共Store/完整编译下载，production vision关闭，T22仍IN_PROGRESS**；下一步直接consumer/preflight/handler和已提交BuildJob独立跟踪，再公共事务/原compile/sign/snapshot/build/delivery/UI，不重做模型服务。无迁移/.env/key/试用/真实provider/KF操作，预算暂缓/旧POST退役/21对18保护不变，完整测试与中间超时见报告。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
最新T22蓝图确认继承见 `agent-app/docs/visual-blueprint-confirmation-20261022.md`：正式handler发布蓝图receipt前冻结独立vbpr1签名review，绑定真实模型结果/Message/revision/hash/原视觉确认/owner-fence；内部veng1后继proof绑定confirm_blueprint新action/request、原accepted与已展示蓝图，调用方事务CAS一次消费/审计/恢复读取。重算普通hash、第二条蓝图歧义、来源/许可/身份漂移拒绝；原pause恢复保留。**新确认候选仍为内部事务，未接公共Store/可执行@7 confirm/semantic模型冻结与外发，T22仍IN_PROGRESS，生产vision关闭**，不是工程下载完成。下一步不再重做蓝图review/proof，接semantic/repair冻结与专用gateway/preflight/handler，再同步公共事务/原编译构建交付/UI。原公共accept已在前批完成；本批无迁移/真实provider/KF/.env/key/试用操作，预算暂缓/旧POST退役/21对18保护不变，完整回归与中间超时见报告。下方为历史。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
最新T22公共确认受理见 `agent-app/docs/visual-public-acceptance-20261022.md`：strict action新增真实receipt/有界差异选择（旧内部最小action仅保留读取），RunService/Store已接统一runtime/准入gate和同事务Message/候选/proof/审计/预算/queued，签名器唯一消费旧等待，Store不再二次消费。真实Cookie/Origin HTTP确认→正式executor/registry/Postgres完整图→独立蓝图Message/receipt/WAITING_INPUT已测，新增22流程+1合同；并发/取消/跨scope/过期/回执/选择/幂等关闭后重放/失败回滚与动作-确认体一致性均覆盖。**生产vision仍关闭，T22仍IN_PROGRESS**，不是图生工程下载已完成；下一步直接做confirm_blueprint下一段可信继承、semantic任务冻结/派生外发、原compile/build/delivery及UI/download E2E，不再重做公共accept或handler。仅原同意人/单图/build源；预算暂缓、旧POST退役、源码21对旧试用18保护保持，无实际环境/key/迁移/收费请求。最终回归和中间失败见报告，以下为前批历史。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
最新T22正式执行与worker装配见 `agent-app/docs/visual-blueprint-run-20261022.md`：有限@7已支持签名确认后继经真实preflight/visual-blueprint步骤/registry/ConversationService Postgres完整图→独立蓝图回执/WAITING_INPUT，清旧building/批准状态、确定性跳过文字分类、校验own checkpoint并在暂停前中断后恢复，不重复provider/Message/事件。module/worker已装配Review和专用蓝图ModelPort，gateway凭据绑定完整服务器route，历史冻结host/model变化在外发前拒绝。流程70项+runtime3项定向通过，完整结果/中间红测/最后补强后复验见报告。**公共RunService/Store仍拒绝accept，测试确认候选仍为内部事务；生产vision关闭、下一蓝图/审批动作继承与semantic外发/UI下载E2E未完成，T22 IN_PROGRESS**。下一步直接strict公共payload+Store同事务freeze/Message/queued/幂等，不能重复消费freeze已消费的等待；再真实HTTP确认到蓝图E2E和下一审批继承/原构建交付。预算暂缓/旧POST退役、源码21对旧试用18的保护不变，无实际环境/迁移/收费操作；下方是历史切片，不再以“没有后继handler/worker装配”描述现状。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
最新T22独立视觉蓝图链见 `agent-app/docs/visual-blueprint-20261022.md`：确认proof内新增服务器blueprint route/完整prompt身份，内部专用ModelPort走真实scope/fence/来源/许可三阶段检查、共享gateway/usage及持久缓存；原design-plan节点只用视觉端口，展示v3蓝图停design-review，清除旧工程批准，不隐藏repair/回退文字，普通Run清新stamp，视觉memo隔离完整确认。真实Run到review→内部候选/确认→claim→服务/原节点/Message已测，流程文件62项、本轮新增16，节点本轮新增9；完整回归/中间失败见报告。**公共accept、@7后继executor/handler、完整LangGraph入口/暂停恢复与worker模型装配仍未接，生产vision继续关闭，T22 IN_PROGRESS**。下一步直接装配安全凭据路由+可执行accept/确定性graph入口，之后同步公开Store/action事务；再做蓝图确认的下一段继承、visual semantic模型冻结/外发和现有UI/下载E2E。没有收费/KF/实际环境或迁移操作，21对18保护/预算暂缓/旧POST退役不变；下方是前批历史，不把本轮内部节点当公开图生完成。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
最新T22确认后继原语见 `agent-app/docs/visual-continuation-20261022.md`：新版本化继承不复制原message admission；绑定新actor/action/config/request/base、来源admission/review与accepted选择，HMAC防同时重算内容/step的篡改。同一调用方事务冻结accepted/step/审计、CAS消费等待/唯一后继/终态事件，消费后可复核来源并恢复；暂限原同意人、单图、build accept动作。新30项在真实图片Run到review之后测试内部候选/事务，不是公开确认→worker规划E2E。**公共RunService/Store仍拒绝accept，@7执行器尚不支持后继，生产vision继续关闭**；T22仍IN_PROGRESS，不把该原语当完整图生或蓝图批准。API完整753/753、编排器205/205、contracts505/505与root/API/contracts tsc、3文件ESLint已通过，其他本轮结果以报告为准；中间action/analysis身份缺口红测和既有cleanup WARN保留。下一步冻结其余规划模型/派生外发→可执行accept handler+同锁序preflight→同步公开strict action/Store事务接线→独立蓝图及下一action继承→现有UI/下载E2E。没有迁移/实际环境/收费请求或试用升级，21对18条保护不变，预算暂缓/旧POST不恢复。下方是前批历史。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
最新T22真实图片Run前半链见 `agent-app/docs/visual-run-flow-20261022.md`：实际Run HTTP/Service/Store受理事务已接freeze，Message/Run/input/step/audit/queued原子；worker新增有限@7单图message→分析→signed review/WAITING_INPUT，原文字@6/hash保持。已提交review绑定释放租约owner/fence并只读收尾，取消竞争不复活；mustPause禁止缓存/普通返回跳过review，shutdown保留可恢复租约，Store/控制服务都阻止丢图文字重试。最终API723、图205、domain1403（另5既有条件跳过）、contracts505、root/API/三包tsc与17文件ESLint通过；中间722/1重试漏洞和全部红测记录保留。**生产resolver仍vision关闭，不能通过设AGENT_VISION_V1=true开放；测试仅注入隔离服务器staging policy，未改实际环境**。@7不是全流程：确认后继/可信输入继承/其他规划模型冻结及派生数据外发/UI/下载E2E仍待完成，T22 IN_PROGRESS。下一段直接做同事务确认审计/CAS唯一后继与独立蓝图，review等待存在Run/RunStep而非LangGraph interrupt。无迁移/试用升级，21对18条协调警告不变，旧POST不恢复、预算暂缓；下方保留前批历史。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
最新T22图片输入冻结切片见 `agent-app/docs/visual-admission-20261022.md`：内部同事务freeze原语保存主补图/服务器完整分析路由/版本化发送同意、一次性step与精简审计；分析从快照恢复原route，入口/cache/send/publish复核输入、源事实与scope/fence。review现在还必须匹配受理的指令/图/分析配置，修复TTL过期仍可review/确认。真实图片→gateway/账本→review→acceptance校验内部串联55项及完整API707、图205、domain1403（另5既有跳过）、contracts505通过，root/API/三包tsc与8文件ESLint通过。**freeze尚未接RunStore/HTTP/module，只冻结像素分析模型，不是所有任务配置；未消费等待/创建后继或开放@7执行器/前端**。当前仍@6、vision关闭、T22 IN_PROGRESS。下一段直接接实际准入/完整新协议/事务确认后继和现有UI，不能再把内部原语当公开图生完成。无新迁移/环境改动，21对18条升级警告保持，旧POST不恢复、预算暂缓。以下为前批历史。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
最新T22视觉图节点切片见 `agent-app/docs/visual-graph-20261022.md`：严格accepted envelope、语义节点独立视觉端口、编译节点传区域绑定、两节点视觉memo隔离与普通Run清理checkpoint已实现；本地provider fixture经真实适配器→两个节点→生产KF编译器→签名计划/不可变快照串联通过。完整API689、domain1403（另5既有跳过）、contracts505、图205通过，root/API/图/domain tsc与14文件ESLint通过。这里只预留节点协议`VISUAL_RUN_PLAN_VERSION=run-plan@7`，现行API/执行器仍@6并拒绝@7，未开放视觉动作/附件/flag，也未保存用户确认或创建后继；T22仍IN_PROGRESS，不是完整图生或1:1验收。下一步完整Run准入/配置与发送同意→可执行新协议/事务确认后继→分析review图/UI→下载E2E；派生OCR也受外发策略约束。试用/.env/服务不动，无新迁移，21对18条升级警告保持。前批状态以下文历史为准，不恢复旧POST，预算暂缓。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
最新T22分析执行/管理员外发切片见 `agent-app/docs/visual-egress-20261022.md`：新增本租户GET/PATCH外发策略（角色/Origin/原子审计），内部分析强制scope/owner/fence/墙钟lease及闭合上下文检查；首次分析前固定模型/prompt/config/图/指令hash，缓存命中、发送、发布复核，漂移或迟到结果拒绝。最终API688、domain1401（另5既有跳过）、contracts505、图195通过，root/API tsc/相关ESLint通过。此为分析前hash pinning，不是完整Run准入附件/主补图/配置实体/用户同意冻结；管理员许可不开放vision。核对发现前置缺口，本批未创建确认后继，仍@6、普通Run visual:null、T22 IN_PROGRESS；无新迁移/收费调用/试用改动，源码21对试用18条的升级警告保持。下一步新协议与发送同意/完整准入→原子确认后继→图与UI，不恢复旧POST，预算仍暂缓。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
前批T22内部review切片见 `agent-app/docs/visual-review-20261022.md`：服务端重算映射、签名冻结review、原子input.required/WAITING_INPUT、同事务确认校验原语已测；未注册生产图/HTTP，校验器不创建后继、不持久化用户确认或授予外发/构建权限。修复明确省略未验证区域被误拦、RunStore内部未开放视觉动作会消耗等待的问题。该批API676、domain1401（另5既有跳过）、contracts505、图195通过，静态检查通过；中间红测和fixture错误保留在报告。后续状态以上方最新记录为准；不把短签名receipt当蓝图批准，预算暂缓、旧POST不恢复。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
前批T21视觉语义切片见 `agent-app/docs/visual-semantics-20261022.md`：独立严格视觉语义端口、编译器可信repeater/module来源、内部编译端口到真实sourceMap/snapshot接线已测；无损候选字典修复视觉请求超128KB，不改文字默认prompt或限制。完整API664、domain1400通过（另5既有条件跳过）、contracts505、图195；中间安全守卫失败与最终命令见报告。普通Run尚未调用新端口，visual仍null；后续确认/外发/配置/图/UI以上方最新T22切片为准，不是公开图生工程验收。run-plan@6、vision关闭，无新迁移；旧试用库/服务不动，源码21迁移与旧试用18条的升级警告继续有效。预算暂缓，不恢复旧POST。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
前一T21快照切片见 `agent-app/docs/generation-snapshot-20261022.md`：新creative-v2文本Run在签名计划同事务保存不可变快照，成功构建同事务绑定revision/job/artifact。新迁移202610220001仅部署新测试库（21条）；旧报告未接视觉prompt/展开绑定的描述由上方最新切片补充，其他证据仍保留。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
最新T20切片见 `agent-app/docs/visual-mapping-20261021.md`：已有纯区域检索/控件匹配/证据范围与缺口解释，复用原 registry/打分/编译属性 schema；无报告不升格，partial/空壳不假装可还原UI。尚无图生Run或前端确认，T20仍IN_PROGRESS，下一步T21语义约束/snapshot再T22接线；试用环境不变，预算仍暂缓。测试中间超时与最终回归结果均保留在报告，不能将本批等同真实KF质量验收。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
最新续做T19内部视觉分析服务，见 `agent-app/docs/visual-analysis-20261021.md`：真实派生像素经共享gateway/账本，严格结构/源事实、DB租约缓存、不可变修正、GET/PATCH已测；尚无图生Run、前端授权/确认和工程生成，T19仍IN_PROGRESS。迁移202610210002仅在新analysis专用库deploy（20条），试用库18条/实际.env/常驻服务不动。上批交互诊断的API误降级已修复且原断言通过；最终完整API649/649、contracts505/505、domain相关22项通过，含安全删除/分析清理与主HTTP监听生命周期修正；中间失败记录见报告。继续T20–T22，预算暂缓、vision和外发UI仍关闭，不跳过P2发布门槛或恢复旧POST。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
本批继续图生方向，完成T18的私有参考图接入切片，见 `agent-app/docs/reference-ingestion-20261021.md`。原图/派生图与编译素材隔离、安全解码/元数据剥离/哈希/归属/并发配额/清理已测；尚未接模型分析、附件Run和前端确认，T18不标VERIFIED。新增迁移202610210001只进独立vision测试库，当前试用库/实际.env/服务保持不变。上传独立开关默认false，不等同vision/外发授权，协议仍@6。5文件82项针对性通过，API扩大回归仍有失败，详见新报告；后续推进T19–T22，不跳过P2发布遗留项，也不恢复旧POST。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
2026-10-21 最新记录 `agent-app/docs/run-browser-20261021.md`：现存 Playwright 全部迁移 Run/UI，隔离启动五进程与双租户 agent-worker；三类工程、原生审批/取消、失败重试、SSE 首连接故障恢复、切换/隔离与下载两轮各 9 项通过。补回源工程上传，修复尚未执行的提案被误当编译基线造成空补丁/漏操作的问题，协议升至 run-plan@6；先用旧 worker 排空旧协议再整体升级，实际环境未启用/未重启。相关最新扩大回归 754 passed / 1 failed / 0 skipped（755 项，含浏览器；非 monorepo 全量），API 偶发 HTTP Parse Error 与前次 403 根因未确认，不能报告全绿。下一优先定位这些失败，再做真实进程故障、代理/多副本长期连接、410 与升级回退；预算暂缓、图片未开放，不恢复旧 POST。历史 SSE/审计/flags/队列/退役报告保留。
<!-- end -->

阅读顺序：根 AGENTS.md → 本文件 → design spec → 当前阶段计划 → handoff。每轮只领一个任务，先写红测，再最小实现、绿测、回归和复核。后续若源文件移动，以符号名搜索确认，不能按旧行号盲改。

代码块是合同、关键实现和红测样例，不是让执行者用十行示例覆盖已有完整模块。必须保留现有合法性校验/错误映射并补全对应测试；新文件按任务指定职责组织，测试fixture不得进入生产exports。计划中的fixture字符串仅测试用途，不能成为生产默认值。

| 文档 | 任务 | 交付结果 |
|---|---|---|
| 本文件 | T00 | 安全基线与可执行测试环境 |
| `2026-10-20-agent-app-p1-cost.md` | T01–T06 | 调用账本、网关、缓存友好上下文、统一预算 |
| `2026-10-20-agent-app-p2-runs.md` | T07–T12 | 数据迁移、持久任务、事件恢复、取消与兼容 |
| `2026-10-20-agent-app-p3-workbench.md` | T13–T17 | 会话导航、时间线、附件入口、历史版本 |
| `2026-10-20-agent-app-p4-vision.md` | T18–T23 | 图片理解、能力映射、组件生成、局部编辑 |
| `2026-10-20-agent-app-p5-release.md` | T24–T27 | 证据分级、原生验证、评测与补丁发布 |
| `2026-10-20-agent-app-handoff.md` | 执行台账/移交模板 | 接手入口、停止条件、证据记录 |

所有文件位于本目录；design spec 位于相邻 `specs` 目录。任务 ID 在整个计划中唯一，不在每份文档重新从 1 开始。

## 2. 优先级、依赖和发布切片

```text
T00 → T01 → T02 → T03 → T04 → T05 → T06     P1 成本治理
       └──────────────────→ T07 → T08 → T09 → T10 → T11 → T12  P2 持久执行
                                            └→ T13 → T14 → T15 → T16 → T17 P3 界面
                         T06 + T12 + T16 → T18 → T19 → T20 → T21 → T22 → T23 P4 视觉/编辑
                                                               └→ T24 → T25 → T26 → T27 P5 验收发布
```

默认按顺序执行，避免多模型同时改 contracts/schema/store/deepseek-model。允许的并行仅限已冻结接口后的独立测试/文档；由用户选择子代理执行模式后再安排，不因本计划自动开启多代理。

发布 A：T00–T06，小范围开启 usage，再 prompt v2；旧界面可立即受益。
发布 B：T07–T17，内部租户先开 runs，再 workbench；可不等图生功能。
发布 C：T18–T24，图生和局部修改 beta，显示验证等级。
发布 D：T25–T27，具备授权原生环境后开启 runtime 验证；无环境则 native flag 保持关闭，发布其他已验收能力并明确限制。

粗排期（1 名熟悉全栈工程师，含测试，非承诺）：P0/P1 5–8 人日，P2 8–12，P3 5–8，P4 10–15，P5 5–8，总计33–51人日；不含采购/部署 KF 验证环境、产品验收等待和新控件研发。模型辅助能加快编码，不替代真实环境验证。每阶段完成后依据数据重估。

## 3. 文件边界总图

| 层 | 保留入口 | 计划新增职责 |
|---|---|---|
| contracts | `agent-app/packages/contracts/src/index.ts` | model-usage.ts、agent-run.ts、visual-reference.ts、generation-snapshot.ts、verification.ts |
| 模型/成本 | `apps/api/src/conversations/deepseek-model.ts`、fake-model.ts | `apps/api/src/models/` 网关、任务提示词、上下文、预算、价格与 usage；只抽相关职责，不全仓重构 |
| 运行 | conversation.service/controller/turn-lease | `apps/api/src/runs/` API、store、executor、event service；`run-agent-worker.ts` |
| 前端 | RunWorkbenchView、runs-api、api.ts、router；旧 workspace store 已退役 | 多会话管理、历史与视觉；沿用已有 `components/runs/`，不按旧表重建第二套主界面 |
| 视觉 | assets service + graph ports + domain client compiler | `apps/api/src/vision/`；domain-client 的视觉映射/局部 patch 模块 |
| 验证 | build-jobs、delivery、artifact download | `apps/api/src/verification/`、`tests/evals/`、受控 KF adapter |
| 数据 | `agent-app/prisma/schema.prisma` | 分阶段 additive migration；禁止把全部表一次写入且未使用 |

路径在各任务中精确列出。重复修改文件由对应依赖串行处理；不允许后任务重建并覆盖前任务成果。

## 4. 全局测试和命令约定

除 git 命令外，文档中的 pnpm 命令 cwd 固定为 `/Users/fengjinlong/YK/KingFusion3.6/agent-app`。跨机器替换仓库绝对根路径，不改变仓库相对布局。pnpm 版本先检查项目/lockfile兼容，不顺手升级依赖。Node 使用项目可用版本（本机有 Node24 工具链），CI 与 Windows 写入同一版本约束。

单文件示例使用 `pnpm --filter @kf/api exec vitest run src/path.test.ts`，它不会因测试文件不存在而 passWithNoTests；每次检查测试数>0。不要直接运行 package test 脚本来“验证”一个拼错的文件名。

DB 测试先执行 T00。禁止在未确认连接时直接运行 `pnpm test`、`pnpm e2e` 或任何 seed。环境使用专用 `TEST_DATABASE_URL`/`E2E_DATABASE_URL`，不得回退到生产 `DATABASE_URL`。真实模型验收需维护者提供允许使用的 key/预算；无 key 的 fake tests 可以验证控制流，不能证明缓存、视觉或费用。

每个任务提交点：完成任务范围 diff 检查和绿测后，只提交该任务自己的 hunks；若同一文件混有用户原改动，记录 patch 和证据，暂不提交，向维护者请求一个经过保存的基线。不得 `git add .`、不得把 dirty tree 整体当作自己的实现。文档中的 commit message 是建议检查点，不授权远程 push/PR。

## T00：建立安全的执行基线

**Files**

- Create: `agent-app/tests/helpers/database-safety.ts`
- Create/Test: `agent-app/tests/helpers/database-safety.test.ts`
- Create: `agent-app/tests/helpers/vitest.config.ts`（include仅本目录test文件，避免意外执行集成套件）
- Modify: `agent-app/tests/e2e/helpers/destructive-reset.ts`（复用校验，不削弱现有双开关）
- Modify: `agent-app/apps/api/src/api.integration.test.ts`、`agent-app/apps/worker/src/job-runner.integration.test.ts`，以及 `rg -l 'TRUNCATE|TEST_DATABASE_URL' agent-app --glob '*.test.ts'` 找出的所有破坏性集成测试；实际展开路径记入本任务变更清单，不修改非破坏性测试。
- Create: `agent-app/docs/agent-next-baseline.md`、`agent-app/docs/agent-next-change-manifest.md`

**Interfaces**

- Produces: `assertSafeTestDatabase(input: { url: string | undefined; allowReset: string | undefined; expectedPrefix: "kf_agent_test_" | "kf_agent_e2e_" }): void`。
- Consumes: 已有 E2E destructive-reset 守卫；保持原有拒绝语义。

- [ ] 记录 `git status --short`、`git rev-parse HEAD`、当前分支、Node/pnpm/Postgres版本；基线文件仅存路径与版本，不存连接密码；对将要改动的 dirty 文件记录已有变更摘要。确认继续在现工作目录还是由维护者保存后另建 worktree。
- [ ] 写独立红测（不得连接数据库）：

```ts
import { describe, expect, it } from "vitest";
import { assertSafeTestDatabase } from "./database-safety.js";
describe("database reset guard", () => {
  it("rejects absent and production databases", () => {
    for (const url of [undefined, "postgresql://localhost/production", "postgresql://localhost/kf_agent_test"]) {
      expect(() => assertSafeTestDatabase({ url, allowReset: "1", expectedPrefix: "kf_agent_test_" })).toThrow();
    }
  });
  it("requires both an explicit flag and isolated name", () => {
    const url = "postgresql://localhost/kf_agent_test_agent_next";
    expect(() => assertSafeTestDatabase({ url, allowReset: "0", expectedPrefix: "kf_agent_test_" })).toThrow();
    expect(() => assertSafeTestDatabase({ url, allowReset: "1", expectedPrefix: "kf_agent_test_" })).not.toThrow();
  });
});
```

- [ ] 创建专用config为 `defineConfig({test:{include:["tests/helpers/*.test.ts"]}})`，从vitest/config导入defineConfig；在agent-app执行 `pnpm exec vitest run --config tests/helpers/vitest.config.ts`。预期缺实现导致FAIL，测试数量不能为0，不能意外启动其他DB测试。
- [ ] 实现核心条件，且在任何 Prisma import/连接/seed 之前调用；动态 import 延后到守卫通过之后。

```ts
export function assertSafeTestDatabase(input: {
  url: string | undefined; allowReset: string | undefined;
  expectedPrefix: "kf_agent_test_" | "kf_agent_e2e_";
}): void {
  if (!input.url || input.allowReset !== "1") throw new Error("TEST_DATABASE_NOT_AUTHORIZED");
  const parsed = new URL(input.url);
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)
    || !databaseName.startsWith(input.expectedPrefix)
    || databaseName.length <= input.expectedPrefix.length) throw new Error("UNSAFE_TEST_DATABASE");
}
```

- [ ] 补充 URL 编码名称/空密码/错误协议测试；绿测后在维护者指定隔离数据库运行现有 baseline 集成测试，记录通过/失败/跳过及原因；已有失败单列，不能归罪本轮，也不能删除测试使其变绿。
- [ ] 检查新代码标注；记录任务文件清单和建议提交 `test(agent): guard isolated integration databases`。后续所有数据库任务依赖此门槛。

## 5. 需求覆盖和最终 Definition of Done

| 需求 | 任务与证据 |
|---|---|
| DeepSeek 成本定位/优化 | T01–T06、T26：真实 usage 和固定语料 A/B |
| 多会话与过程展示 | T07–T15：隔离、重连、状态转换、交互 E2E |
| 图片驱动现有组件 | T16、T18–T22：像素请求证据、控件白名单、原生制品 |
| 局部编辑与历史 | T17、T23：不变区域 hash、stale-base 竞争测试 |
| 工程质量不足 | T20、T24–T26：能力证据、静态检查、可选原生截图/交互 |
| 安全、可回退、交接 | T00、T07–T12、T18、T27、handoff |

完成必须同时满足：任务级绿测、相关 legacy/module/creative 回归、租户隔离与安全测试、迁移兼容、Web build、精确证据链接、flag 回退演练、完整补丁清单；没有原生环境时标注运行验证未完成，不把它勾选为已通过。

## 6. 交接给下一模型的启动语

> 请先读根 AGENTS.md、docs/superpowers/plans/2026-10-20-agent-app-next-master.md、对应 design spec 和 handoff 文件。当前要求是按计划实施，不要重写架构。先核对 dirty 工作树与任务台账，只执行第一个依赖已满足的未完成任务，遵守先红测再实现再绿测。所有代码改动采用实际日期和“Agent工作台迭代”标注；不重置用户改动，不访问生产数据库，不修改其他 KingFusion 服务。每完成一个任务记录文件、测试命令/结果、偏差及下一任务；真实模型/KF 环境缺失必须明确报告，不伪造通过。
<!-- end -->
