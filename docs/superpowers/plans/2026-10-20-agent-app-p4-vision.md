# Agent App Reference Image Generation Implementation Plan

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
**最新重复观察实施：** `agent-app/docs/visual-repeater-observation-20261023.md`。有界 mock 字符串模板的真实展开实例、来源/父链/原生文字/制品证明已接通，复用原 provenance，不另造 native id。新 Chrome 实际核对两个实例包字节（fixture）；旧能源响应的观察全过，但其侧栏按钮候选仍非法，不能当真实工程成功。最新 semantic@4/blueprint@4，须整体排空升级，生产vision关闭。下一严格候选的真实生成与 KF隔离验收，业务源暂缓；T22/计划未完，下方尚无重复观察为历史。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
**当前续做：** 受限静态观察合同已接通，见 `agent-app/docs/visual-observation-journeys-20261023.md`。observe 必须逐项声明期望原文并通过真实静态控件/页面区域/父链/原生文字和制品证明；不使用假动作，旧交互门槛保留。Chrome observe 已真实打包下载/解包核对（fixture 模型），能源图真实交付/KF/像素一致仍未验。重复 mock 实例证明与真实响应候选不符仍是下一优先，不扩业务源。最新冻结协议 visual-blueprint@3 / visual-semantic@2、排空整体升级、production vision关闭，T22/计划 IN_PROGRESS。下方先实施观察合同与旧协议号为历史。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
**最新真实模型验收入口：** `agent-app/docs/visual-real-model-20261023.md`。用户已明确先图生客户端、业务源暂缓；能源UI目标图已生成并用官方DeepSeek实测。识图和独立蓝图通过，真实工程语义仍失败；字体别名顺序修复后离线定位为静态浏览旅程被要求绑定可执行动作。不要伪造动作、删旅程、删除不支持业务区域或放宽所有门槛。先用已保存真实负例完善观察/交互合同，随后真实工程打包与KF独立工程验收；无当前交付包、KF运行或像素一致结论。vision@v2/visual-blueprint@2及新hash不能与旧任务/worker混用，production vision关闭，T22/总体计划IN_PROGRESS；普通fixture回归与真实付费失败实验分开看报告。
<!-- end -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用参考UI图驱动现有KF组件生成，并能在稳定语义基线上局部修改。

**Architecture:** 图像只进入专用视觉理解步骤；结构化VisualReferenceSpec经能力匹配进入现有SolutionImplementationPlan和确定性编译。所有像素、语义计划、资产和制品都带hash和版本来源，不另建模型直接写native文件的旁路。

**Tech Stack:** TypeScript / Zod / 现有domain-client编译器 / Prisma / sharp / Vitest / Vue。

**Spec:** `docs/superpowers/specs/2026-10-20-agent-app-next-design.md`，重点 §10、§11。

## Global Constraints

- 参考图、OCR、用户文本和模型输出均为不可信数据，不拥有执行权限。
- 保留租户鉴权、审批、签名计划、制品绑定、workspace 构建串行与 stale-base 拒绝。
- 不承诺固定缓存命中率、降本比例或像素级还原率；必须附测试样本和实际测量。
- 新功能默认 feature flag 关闭；先 expand 数据迁移，后灰度启用；本期不做破坏性 contract 迁移。
- 不覆盖、不重置、不自动提交已有未提交修改；补丁保留原目录，只包含本任务所有新增和修改文件。
- 其余约束继承design §3；未支持的控件不得伪造，截图不能替代交互需求确认。

---

## 文件职责

`apps/api/src/vision/`负责可信文件访问、provider调用和分析持久化；`packages/contracts`只放schema；`packages/domain-client/src/visual/`只做纯映射/验证，不读数据库、不请求模型；`generation/`保存编译前后语义快照。当前sourceMap和snapshot是局部修改前置条件，不从native压缩JSON临时猜。

## T18：参考图上传、派生像素与附件归属

依赖T06/T12/T16。

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
### 2026-10-21 执行切片：私有上传，不提前开放图生 Run

状态 **IN_PROGRESS**。维护者要求继续推进图生工程，预算仍暂缓。T06/T12/T16 未全部验收，本批仅实施不外发、不触发生成的安全参考图入口；其余依赖与发布门槛不因此视作完成。

- 新增独立 `ReferenceAsset` 源表，不给旧 `WorkspaceAsset` 加隐式用途，避免参考图被既有素材目录/编译器收入 `res/images`；复用原 `inspectImage` 容器检查，再用 sharp 完整解码重编码。
- 原计划 `202610200007_reference_assets` 与既有 `202610200007_build_run_control` 冲突，实际新增 **`202610210001_reference_assets`**，不修改已应用迁移。
- [x] 纯策略红绿测；安全解码、方向校正、EXIF 去除、≤2048 派生像素与独立 hash/transform。
- [x] 私有上传/派生图读取、复合归属、默认关闭、Origin/会话、限定 ID、不泄漏存储路径。
- [x] 源+派生总配额（默认1GiB）、租户锁防并发越额、工作区内重复去重、失败清理/模糊提交保留、工作区删除回收。
- [x] macOS ARM64 sharp 解码 smoke；具体回归、命令及文件清单见 `agent-app/docs/reference-ingestion-20261021.md`。
- [ ] MessageAttachment 和 Run 受理冻结列表：仍拒绝参考图 Run，须在视觉上下文/确认流程接通时一并实施，不建没有调用方的附件表，也不允许“接受图片却只看文字”。
- [ ] 前端上传入口与真实分析、外发授权、Linux/Windows native smoke，仍是后续任务，不以本地图片读取替代验收。

上传单独使用 `AGENT_REFERENCE_UPLOADS_V1=true`，同时要求已准入的 Run/工作台租户；默认 false。`AGENT_VISION_V1` 和 `outboundImagesAllowed` 继续 false，实际试用库/`.env`/服务不变。本切片不改变 Run 协议，仍为 `run-plan@6`。不自动提交。
<!-- end -->

**Files**

- Create: `agent-app/apps/api/src/vision/reference-asset.controller.ts`、`reference-asset.service.ts`、`image-policy.ts`
- Modify: `agent-app/apps/api/src/assets/asset.service.ts`、`assets/asset.controller.ts`
- Modify: `agent-app/apps/api/src/runs/run.service.ts`、`run.module.ts`
- Modify: `agent-app/prisma/schema.prisma`、`agent-app/apps/api/package.json`、`agent-app/pnpm-lock.yaml`
- Create: `agent-app/prisma/migrations/202610200007_reference_assets/migration.sql`
- Test: `agent-app/apps/api/src/vision/image-policy.test.ts`、`reference-asset.integration.test.ts`

**Interfaces**

```ts
export type ReferenceImageFacts = { mimeType: string; byteSize: number; width: number; height: number; animated: boolean };
export function validateReferenceImage(facts: ReferenceImageFacts): void;
export type TrustedReferenceImage = { tenantId: string; workspaceId: string; assetId: string;
  sourceHash: string; derivativeHash: string; mimeType: "image/png" | "image/jpeg" | "image/webp";
  width: number; height: number; bytes: Uint8Array; scale: number };
export interface ReferenceAssetService {
  resolve(tenantId: string, workspaceId: string, assetId: string): Promise<TrustedReferenceImage>;
}
```

- [ ] 红测：

```ts
expect(() => validateReferenceImage({ mimeType: "image/png", byteSize: 1024,
  width: 9000, height: 100, animated: false })).toThrow("IMAGE_DIMENSIONS_EXCEEDED");
expect(() => validateReferenceImage({ mimeType: "image/svg+xml", byteSize: 1024,
  width: 100, height: 100, animated: false })).toThrow("IMAGE_FORMAT_UNSUPPORTED");
expect(() => validateReferenceImage({ mimeType: "image/png", byteSize: 1024,
  width: 1440, height: 900, animated: false })).not.toThrow();
```

- [ ] Run: `pnpm --filter @kf/api exec vitest run src/vision/image-policy.test.ts`；预期 FAIL。
- [ ] 复用原asset sniff/full validation，sharp以limitInputPixels=32_000_000解码，拒绝动画/损坏/伪MIME，去metadata生成≤2048长边派生图，保持aspect ratio；raw原图加密/权限按原storage策略，文件名不拼物理路径。关键校验：

```ts
if (!["image/png", "image/jpeg", "image/webp"].includes(facts.mimeType) || facts.animated)
  throw new Error("IMAGE_FORMAT_UNSUPPORTED");
if (facts.byteSize > 10 * 1024 * 1024) throw new Error("IMAGE_BYTES_EXCEEDED");
if (facts.width <= 0 || facts.height <= 0 || Math.max(facts.width, facts.height) > 8192
  || facts.width * facts.height > 32_000_000) throw new Error("IMAGE_DIMENSIONS_EXCEEDED");
```

- [ ] migration增加MessageAttachment与ReferenceAssetDerivative（tenantId、assetId、sourceHash、derivativeHash、transform Json、storageKey、byteSize），assetId复合归属；run受理时锁定附件列表到inputSnapshot；客户端移除草稿只移引用，不立即删除asset。resolve只接受assetId，不接受用户URL/path，拒绝跨workspace；HTTP body parser在读取巨大body前限流限大小，租户总配额默认1GiB且可配置。
- [ ] 集成测穿越文件名、伪JPEG、解码炸弹、动画WebP、10MiB边界、跨tenant/跨workspace、重复上传同hash、读取鉴权、上传取消、缺外发授权。安装sharp后macOS/Linux/Windows各做decode smoke，不带本机node_modules出补丁。
- [ ] 绿测并提交点 `feat(agent): secure reference image ingestion and derivatives`。

## T19：视觉结构合同、真实像素请求与分析缓存

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
### 2026-10-21 实施切片（内部分析，图生Run尚未开放）

状态 **IN_PROGRESS**；详见 `agent-app/docs/visual-analysis-20261021.md`。

- [x] 严格VisualReferenceSpec合同、真实派生像素请求与实际16MiB请求体测量。
- [x] 共用gateway/usage账本接线（仅视觉新路径），服务实例复制冻结模型配置；预算按维护者要求暂缓，不隐藏自动修复/重试。
- [x] 80KiB响应流上限、视觉错误体不回显、服务端覆盖来源事实、无效结构不缓存。
- [x] PG短租约与发布CAS、同工作区同资产精确缓存、30天TTL、腐坏指针拒绝、不可变修正及并发版本冲突。
- [x] 私有GET和Origin保护的严格PATCH；>64KiB结果真实HTTP修正可用，没有新增发起分析的公开POST旁路。
- [x] 默认拒绝外发的Tenant字段，发送前复核；迁移实际为 **202610210002_visual_analysis**（不是原计划0008），仅在新analysis测试库验证累计20迁移。
- [ ] 管理员外发控制/发送说明、Run受理时冻结模型配置与附件/分析来源、前端review与确认随T22接通；现有`AGENT_VISION_V1`仍不支持提前置true。
- [ ] 真实provider及真实KF质量验收，保持T26/T25独立验证，不以本地provider替身结果宣称看图质量达标。

缓存key比原合同增加workspaceId/assetId/derivativeHash，避免复用另工作区的sourceAssetId及旧派生像素；不跨工作区/租户共享结果。新增租约表只管运行中的缓存构建；分析结果独立保留，TTL不授权删除历史记录。PATCH线性child版本，不实现T17/T23分叉。

顺带修复上批已复现的API交互错误降级：只放行已明确不支持的Image点击，不把所有闭环错误变成warning；原诊断断言未改。contracts导航身份fixture补齐已有必填targetPageName，不放宽生产schema。完整证据和剩余边界见新报告。
<!-- end -->

**Files**

- Create: `agent-app/packages/contracts/src/visual-reference.ts`，Modify: `index.ts`
- Create: `agent-app/apps/api/src/vision/visual-analysis.service.ts`、`visual-analysis-cache.ts`、`visual-analysis.controller.ts`
- Modify: `agent-app/apps/api/src/models/task-prompts.ts`、`model-config.ts`
- Modify: schema，Create: `agent-app/prisma/migrations/202610200008_visual_analysis/migration.sql`
- Test: `agent-app/packages/contracts/src/visual-reference.test.ts`
- Test: `agent-app/apps/api/src/vision/visual-analysis.test.ts`、`visual-analysis.integration.test.ts`

**Interfaces**

```ts
// VisualRegion、VisualReferenceSpec严格采用design §10形状，导出对应Zod schema。
export type VisualAnalysisInput = { tenantId: string; workspaceId: string; runId: string;
  assetId: string; instruction: string; analysisVersion: string };
export type VisualAnalysisResult = { id: string; specHash: string; spec: VisualReferenceSpec;
  reused: boolean; modelConfigHash: string };
export interface VisualAnalysisService {
  analyze(input: VisualAnalysisInput, signal: AbortSignal): Promise<VisualAnalysisResult>;
  revise(tenantId: string, analysisId: string, expectedHash: string, spec: VisualReferenceSpec): Promise<VisualAnalysisResult>;
}
export function visualAnalysisCacheKey(input: { tenantId: string; sourceHash: string;
  analysisVersion: string; modelConfigHash: string; instructionHash: string }): string;
```

- [ ] 红测schema与cache隔离；在test文件定义有效最小spec：sourceAssetId=a1/sourceHash为64hex/viewport1440×900/一个content region范围0,0,1,1/designTokens合法hex/无uncertainties。

```ts
expect(VisualReferenceSpecSchema.safeParse({ ...validSpec,
  regions: [{ ...validSpec.regions[0], box: { x: 0.9, y: 0, width: 0.2, height: 1 } }] }).success).toBe(false);
expect(visualAnalysisCacheKey({ ...cacheInput, tenantId: "a" }))
  .not.toBe(visualAnalysisCacheKey({ ...cacheInput, tenantId: "b" }));
```

- [ ] Run: contracts visual-reference test + API visual-analysis.test；预期 FAIL。
- [ ] 校验region最多100、text每条≤2000、parent无环、ID唯一、颜色hex、confidence0..1、box边界；模型不可信sourceAssetId/hash必须以服务器真实facts替换并校验，不允许模型换素材。构造真正像素请求：

```ts
const dataUrl = `data:${image.mimeType};base64,${Buffer.from(image.bytes).toString("base64")}`;
const userMessage: ModelMessage = { role: "user", content: [
  { type: "text", text: instruction },
  { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
] };
// image=ReferenceAssetService.resolve；只在gateway transport内短暂持有base64，不落日志/events。
```

- [ ] 分别限制文本/图像/总HTTP16MiB并验证route.supportsVision；usage/预算都走gateway。图片分析异常有限修复占统一budget，不能独立无限retry。分析cache只复用VALID且模型/指令/版本全匹配，TTL30天，用户更改生成新analysis而非覆盖旧spec。并发相同key用数据库唯一约束/短lease防止重复发请求，不跨租户复用。
- [ ] 新API `GET /api/v2/visual-analyses/:id` 和 `PATCH /api/v2/visual-analyses/:id`，PATCH带expectedHash/spec；只允许修改region文本/role/box/tokens/uncertainties，不修改source facts。集成测试截获providerbody验证有像素而不是文件名；同图复用少一次调用；文本内“忽略系统指令”不影响工具权限；模型输出URL/path拒绝。
- [ ] 绿测、typecheck；提交点 `feat(agent): analyze UI references with versioned visual specs`。

## T20：现有控件匹配、能力证据与缺口解释

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
### 2026-10-21 纯映射实施切片

状态 **IN_PROGRESS**，见 `agent-app/docs/visual-mapping-20261021.md`。

- [x] 复用现有本地打分与 5 control / 3 layout / 全图 25 profile 上限，真实 registry 身份和设计角色双重校验；表单保留基础输入候选，不以 module-v1 五类模块约束全局。
- [x] 属性名单从既有语义 schema 和 supported style parts 投影；交互从审核 profile 投影，不另造可写属性或脚本权限，不修改旧 catalog snapshot/hash。
- [x] 精确运行时/控件/完整属性交互/制品 hash/报告范围判定；无报告保持 pending-verification，失败/旧版本不升格，不能跨报告拼出验证。
- [x] partial/空壳/preserve-only 不用于新 UI 还原；缺字体、未知脚本、低置信度与交互待确认有解释；替代建议不自动采纳。
- [ ] T21/T22 接真实语义计划、服务端证据来源与 Run；用户确认未验证能力的 acknowledgement 及交付卡持续展示尚未接，不将纯函数测试当图生工程完成。

`controlType` 使用完整 registry 身份；属性采用 `property:text` / `style:root.fontSize` 命名空间，值仍交现有合同/编译器校验。当前候选 evidence 为空；不凭模板或源码记录捏造 runtime verified。无新 API、迁移、模型调用或试用环境升级。
<!-- end -->

**Files**

- Create: `agent-app/packages/domain-client/src/visual/region-mapping.ts`、`capability-evidence.ts`
- Modify: `agent-app/packages/domain-client/src/planning/capability-retrieval.ts`
- Modify: `agent-app/packages/domain-client/src/style/control-capability-registry.ts`
- Modify: `agent-app/packages/domain-client/src/design-knowledge/design-knowledge-catalog.ts`
- Test: `agent-app/packages/domain-client/src/visual/region-mapping.test.ts`、`capability-evidence.test.ts`

**Interfaces**

```ts
export type CapabilityEvidence = { id: string; controlType: string; properties: string[];
  interactions: string[]; runtimeVersion: string; status: "verified" | "failed" | "unverified";
  artifactHash: string | null; reportId: string | null };
export type MappingCandidate = { capabilityId: string; controlType: string; supportedRoles: VisualRegion["role"][];
  evidence: CapabilityEvidence[]; fallback: string | null };
export function mapVisualRegions(input: { regions: VisualRegion[]; candidates: MappingCandidate[];
  targetRuntimeVersion: string }): RegionMapping[];
```

- [ ] 红测：不给不存在控件凭空输出属性；有control但无目标runtime证据只能supported_unverified。

```ts
const region: VisualRegion = { id: "chart-1", parentId: null, role: "chart",
  box: { x: 0, y: 0, width: 1, height: 1 }, text: [], confidence: 0.9, interactionHint: null };
expect(mapVisualRegions({ regions: [region], candidates: [], targetRuntimeVersion: "3.6" })[0])
  .toMatchObject({ regionId: "chart-1", controlType: null, support: "unsupported" });
```

- [ ] Run: `pnpm --filter @kf/domain-client exec vitest run src/visual/region-mapping.test.ts src/visual/capability-evidence.test.ts`；预期 FAIL。
- [ ] 先用现有capability retrieval提取候选，再按region role/所需属性/交互/版本排序；保留原候选数量上限，稳定排序tie-break capabilityId。证据判断必须匹配控件+属性+interaction+runtime，不能某个按钮验证过就宣布所有脚本能力verified。

```ts
const support = !candidate ? "unsupported"
  : candidate.evidence.some(evidence => evidence.status === "verified"
    && evidence.runtimeVersion === input.targetRuntimeVersion && evidence.reportId !== null)
    ? "verified" : "supported_unverified";
// 属性/交互子集校验通过后才能选用上述verified分支。
```

- [ ] 对pending-verification保留真实标签；特殊chart/partial shell/deferred preserve-only明确不可用于对应新生成能力。unsupported输出原因和已有可实现替代，例如“复杂图表暂以数据表呈现”，不自动替换且假装等价。用户选择保留未验证能力时记录acknowledgement，并在交付卡持续显示未验证。
- [ ] 测试同语义稳定候选、缺字体/无图表/未知脚本、旧runtime证据不升格、控制类型只来自registry、没有把module-v1五种当全局限制；现有capability retrieval和compiler测试不退化。
- [ ] 提交点 `feat(agent): map visual regions to evidence-aware capabilities`。

## T21：视觉约束进入语义计划和不可变 GenerationSnapshot

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
### 2026-10-22 视觉语义与现有编译链内部接线（最新）

状态仍 **IN_PROGRESS**，详见 `agent-app/docs/visual-semantics-20261022.md`；下方来源快照记录保留为前批历史。

- [x] 独立 `kf-visual-semantic-plan/v1` 包装原语义plan与region/node绑定；结构化视觉上下文进入可选ModelPort，不传像素，不允许原生ID/未知字段，不做文字fallback。旧plan/catalog/hash/文字默认prompt不变。
- [x] 编译器包装器复用权威语义投影核对repeater/module来源，进程内plan-hash绑定的不可伪造handle解析展开组件；实际物化再次核对能力/归属，再建sourceMap，不猜ID前缀。
- [x] 服务器内部creative compiler的可选visual输入已接原签名/快照事务；本地真实模型适配器→生产compiler→Prisma集成通过，模型网络响应仍为fixture，非真实视觉质量证据。
- [x] 真实golden暴露132711字节视觉prompt超限；仅视觉端口采用可无损重建的候选理由/限制字典，保留原权限/hash，128000限额不变。不是全局缓存/降本完成，文字大prompt风险仍需后续治理。
- [ ] T22确认凭据/服务端重算映射、附件与模型配置冻结、图片和派生数据外发许可、图节点/memo版本/UI与实际下载闭环尚待接；普通Run仍visual:null，vision不开启。

最终API664、domain1400（另5既有条件跳过）、contracts505、图195通过；实际命令、中间守卫失败和测试范围见报告。无新迁移/试用重启/收费调用，仍run-plan@6。结构校验不是用户授权，不能把浏览器或模型的visual对象直接作为确认记录。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
### 2026-10-22 来源/快照与真实文本Run接线

状态 **IN_PROGRESS**，见 `agent-app/docs/generation-snapshot-20261022.md`。

- [x] 严格 sourceMap/visual context/差异合同；复用已有 CreativeBuildArtifact 内的严格语义数据和版本，不改原签名 hash。
- [x] region/component/native 归属、精确编译身份、过期分析、明确省略/替代/未验证 acknowledgement 检查；不猜 repeater 前缀或 native 路径。
- [x] 新 creative-v2 真实 Run 的计划和 snapshot 同事务保存，成功构建的原事务绑定 revision/job/artifact；并发幂等、失效 fence/取消/错误编译 hash、失败构建、删除清理有红绿测试。
- [x] 新 additive migration **202610220001_generation_snapshots**，两个新专用库累计21迁移；DB trigger 保护不可变内容和一次性绑定。试用库/服务/.env未动。
- [ ] 前批此处尚未接视觉提示词/展开绑定；最新内部接线见上节。普通Run仍visual:null，确认凭据与公开图生流程随T22完成；没有图生工程端到端验收。

精确归属读取现有编译器物化结果即可；本切片未改 solution/layout 编译器或 deepseek-model，避免无调用方地增加模型输入/改变旧计划。GenerationSnapshot 内容封装现有完整 artifact/materialization，额外比原示例保存了 candidate/编译证据以防语义与产物断裂。后续不得将服务端-only visual context 直接作为浏览器/模型可授权 payload。历史无快照不补造来源，旧POST不恢复。
<!-- end -->

**Files**

- Create: `agent-app/packages/contracts/src/generation-snapshot.ts`，Modify: `index.ts`
- Create: `agent-app/packages/domain-client/src/visual/visual-plan-constraints.ts`
- Create: `agent-app/apps/api/src/generation/generation-snapshot.service.ts`
- Modify: `agent-app/apps/api/src/conversations/graph-ports.ts`、`deepseek-model.ts`
- Modify: `agent-app/packages/domain-client/src/solution-compile/solution-compiler.ts`、`layout-compiler.ts`
- Modify: schema，Create: `agent-app/prisma/migrations/202610200009_generation_snapshots/migration.sql`
- Test: `agent-app/packages/domain-client/src/visual/visual-plan-constraints.test.ts`
- Test: `agent-app/apps/api/src/generation/generation-snapshot.integration.test.ts`

**Interfaces**

```ts
export type SourceMapEntry = { regionId: string; componentId: string; nativeIds: string[] };
export type GenerationSnapshotInput = { tenantId: string; runId: string; baseRevisionId: string;
  blueprint: unknown; implementationPlan: unknown; capabilityCatalogVersion: string;
  compilerVersion: string; assetManifest: unknown; visualSpecId: string | null; sourceMap: SourceMapEntry[] };
export interface GenerationSnapshotService {
  create(input: GenerationSnapshotInput): Promise<{ id: string; contentHash: string }>;
  bindRevision(tenantId: string, snapshotId: string, revisionId: string, buildJobId: string): Promise<void>;
}
export function validateVisualPlanReferences(input: { regionIds: string[];
  mappings: RegionMapping[]; sourceMap: SourceMapEntry[] }): void;
```

unknown字段在service入口必须用已有blueprint/implementation/asset schema parse，持久化规范对象；不能把unknown当作免校验。bindRevision是单次nullable绑定，不更新已固定内容。

- [ ] 红测未匹配区域/重复nativeID/跨区域引用：

```ts
expect(() => validateVisualPlanReferences({ regionIds: ["header"], mappings: [],
  sourceMap: [{ regionId: "unknown", componentId: "c1", nativeIds: ["n1"] }] }))
  .toThrow("UNKNOWN_VISUAL_REGION");
```

- [ ] Run: `pnpm --filter @kf/domain-client exec vitest run src/visual/visual-plan-constraints.test.ts`；预期 FAIL。
- [ ] 增implementation prompt输入visualSpec/mappings/acceptedDifferences，仅模型生成语义组件关系、控件类型和受支持属性；布局坐标仍由compiler。若要加合同字段，升级schemaVersion并为旧计划保留parse path，不能直接改变旧signed plan hash含义。

```ts
const allowed = new Set(input.regionIds);
for (const entry of input.sourceMap) {
  if (!allowed.has(entry.regionId)) throw new Error("UNKNOWN_VISUAL_REGION");
}
// compile阶段稳定生成nativeIds，并建立region→component→native映射；不得把模型原始id直接作为文件路径。
```

- [ ] 编译前语义输出先按T09存completed step；编译器在内存产生完整sourceMap后创建不可变GenerationSnapshot，再入队build，不创建后续覆盖内容的可变草稿。revision绑定在build成功事务链中幂等完成，失败snapshot保留run关联但无revision。只将purpose=material经批准的facts传编译器；reference图不进入res/images。sourceMap可重复component归属时明确父子关系，native ownership不能有冲突。
- [ ] 集成验证相同计划/版本/资产输出确定、缺asset拒绝、snapshot跨tenant拒绝、contentHash重复一致、retry同step不重建snapshot、错误build不绑定成功revision。现有creative-native-materializer与signed-plan测试必须全绿。
- [ ] 提交点 `feat(agent): compile visual constraints with generation provenance`。

## T22：图生任务流程、可编辑识别结果与确认

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
### 2026-10-23 工作区名称只读快照（最新，不是实时业务源）

状态 **IN_PROGRESS**，此窄范围闭环完成，见 `agent-app/docs/visual-workspace-data-20261023.md`。完整 API **988/988、零 skip**（275 视觉流程/三项 Chrome）、串行 domain **1431 passed / 5 原有 skipped**、Web 175、contracts 525，类型/14 TS lint/build 通过；中间错误与证据如实保留。

- [x] 只选当前工作区 name，role=text、缺字段保持/null 清除；服务端 scoped 查询，dataSnapshots 进入签名 review/确认/后继，不让 caller 或模型填写来源值/身份/连接。
- [x] 实际值展示/非实时/外发说明、原子修订/TTL/幂等/清旧选择/独立批准；快照覆盖、精确语义 text 与 native owner/text 二次校验，原未知 hint 和证据边界不放宽。
- [x] 新 Chrome 完成实际取值→确认→重命名→蓝图/语义/native/真实构建→下载解包，精确文本仍为确认值；原 static/feedback 用例保留。不是 KF Windows 或 1:1 验收。
- [ ] 业务源目录/类型/读权限/凭据/撤权/原生适配、实时/刷新合同；其他交互/原未知 hint 明确解决、替代/可信 retry 与 T23。
- [ ] 系统恢复/资源/调度/代理/多副本/整体升级回退、真实 provider/KF/Windows/视觉质量与发布；生产关闭、预算暂缓/试用保护/旧入口退役保持。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
### 2026-10-23 结构化本地点击反馈（最新）

状态 **IN_PROGRESS**，仅此受限交互闭环完成，见 `agent-app/docs/visual-click-feedback-20261023.md`。最终完整 API **975/975、零 skip**（262 视觉流程/两项 Chrome）、串行 domain **1419 passed / 5 原有 skipped**、Web 172、contracts 523，类型/lint/build 通过；命令/证据/中间失败见报告 §6，不用上批计数替代。

- [x] action 区域有界 interactionRequirement，原 revision 缺字段保持/null 清除/新区先保存/签名/TTL/幂等/CAS/新回执/重新选择/独立批准，原未知问题和 hint 保留。
- [x] 仅真实 button 候选/click，精确语义事件/唯一直接无条件 feedback 与文字级别校验；禁止依赖/后继/脚本替代/额外事件动作。原生 sourceMap/快照再核对唯一 owner/onClick/event/无脚本/精确 feedback，不因静态报告标 verified。
- [x] 原 static Chrome 保留，新增反馈 Chrome 手机配置→独立蓝图/语义/native/sign/snapshot/BuildExecutor/一次性包下载，按精确 sourceMap 解包核对绑定控件的真实 ShowMessage 字节。模型 fixture，非 KF 原生运行或像素质量验收。
- [ ] 真实数据源目录/有类型与权限的绑定、原未知 hint 明确解决、其他交互、替代和可信视觉 retry；T23 完成后局部重生成另做。
- [ ] 系统恢复/资源/代理/多副本/升级回退/受控 rollout 与真实 provider/KF/Windows/1:1；production vision 关闭、预算暂缓、试用保护/旧入口退役保持，新视觉 prompt/hash/字段仍要求排空整体升级。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
### 2026-10-23 交互/数据来源补充说明（最新，未验证）

状态 **IN_PROGRESS**，本批仅说明编辑/传递范围已验证，见 `agent-app/docs/visual-clarification-notes-20261023.md`。完整 API **963/963、零 skip**（250 视觉流程/Chrome），Web 169、contracts 521，串行 domain **1404 passed / 5 原有 skipped**，静态检查/build 通过；首次并行 domain 原用例超时与复验均保留报告，不改 timeout/断言。

- [x] 可选有界 clarifications、缺字段保持/双 null 清空，已保存区域原生折叠表单；保留原 hint/未知问题/置信度与来源，文字不拥有执行或连接权限。
- [x] 原 revision 原子签名/新回执/TTL/CAS/审计/幂等/回滚与并发；原 hint 仍拦截，静态 verified 带备注降为 supported_unverified；清空不复活旧接受。
- [x] Chrome 实际 UI 修改→独立差异/蓝图→蓝图和语义 JSON 请求都含备注→原 native/BuildExecutor/一次性下载。本地模型 fixture，不是实际交互或数据绑定验收。
- [ ] 有真实能力证据的结构化交互要求/数据绑定合同、编译及闭环验证（当前备注框不等于完成）；替代组件和可信视觉 retry；T23 完成后局部重生成另做。
- [ ] 真实 provider/KF/Windows/1:1、系统恢复/资源/代理/多副本/升级回退与受控 rollout；生产 vision 关闭、预算暂缓、旧试用保护/旧接口退役保持。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
### 2026-10-23 区域父子层级调整（最新）

状态 **IN_PROGRESS**，本批范围已验证，详见 `agent-app/docs/visual-region-hierarchy-20261023.md`。最终完整 API 952/952 无 skip（239 视觉流程/Chrome），Web 165、contracts 517、静态检查/build 通过；下方“层级未完成”为历史。

- [x] 更新项可选 parentId/null，旧缺字段/hash 不变；已保存区域父选择/根级/层级预览，新区先保存、不接临时/native/权限字段。
- [x] 完整候选图拒绝未知/已删父、自/直接与间接循环；显式移出子节点后可删除原父，不静默重挂，不改变原图全局 box。
- [x] 原 TTL/actor/gates/immutable child/history/CAS/新回执/事件/审计/幂等；冲突并发不合并成环、后置审计回滚及手机 Chrome 层级修改→独立确认→工程包下载已测，模型 fixture。
- [ ] 交互/数据源编辑、替代组件和可信视觉 retry；T23 完成后区域重生成另做。
- [ ] 真实 provider/KF/Windows/1:1、系统恢复/资源/调度/升级回退/受控 rollout，生产 vision 关闭，预算暂缓。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
### 2026-10-23 区域增删与重新确认（最新）

状态 **IN_PROGRESS**，本批范围已验证，见 `agent-app/docs/visual-region-structure-20261023.md`；下方“区域增删未实现”和 925/1 均历史。最终完整 API 942/942、无 skip（229 视觉流程/真实 Chrome），Web 161、contracts 515、tsc/vue-tsc/lint/build 通过；不以本地模型流程替代真实 KF/视觉质量。

- [x] Run revision 严格 additions/removals/updates、总操作/最终区域/UTF-8 上限，server ID/root/confidence=0/未知问题，禁止客户端配置原生/身份/权限；旧 update-only 幂等形状保持。
- [x] 显式删除全部后代、保留被删区域未知问题为 global，最终 spec 校验；原 TTL/不可变 child/重算映射/签名 history/current CAS/事件/审计，幂等/竞争/回滚测试通过。
- [x] 现有 UI 新增/待删/恢复/放弃/原图叠层与新选择；浏览器纯输入 schema subpath，修复 Node barrel 导入。Chrome 手机新增保存→删除保存→独立差异/蓝图→实际 native 工程下载。
- [ ] 层级重排、交互/数据源编辑、替代组件与可信 visual retry；完成后区域重生成另属 T23。
- [ ] 恢复/资源/升级/回退/全局调度专项、真实 provider/KF/Windows/1:1、受控 rollout，production vision 继续关闭，预算暂缓。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
### 2026-10-23 已有区域编辑与原子重新确认（最新）

状态 **IN_PROGRESS**，见 `agent-app/docs/visual-review-editing-20261023.md`；下方“已有区域编辑未实现”均历史。

本批最终 API 925/1：214 视觉流程/Chrome 通过，但原 I1 并发批准错误码验收未过；具体失败/前两轮/空库复验见报告 §7，不能把 P4 标完成或开启生产。另补立即编辑早于 worker 收尾时的只读精确归档确认，不改变旧 lease 策略。

- [x] Cookie/Origin/当前独立 gates/tenant/原同意者的 Run-scoped revision POST，严格文字/role/box patch，界面预览/放弃/边界/UTF-8 64 KiB 校验；旧不带 Run 的 analysis PATCH 404。
- [x] 同事务 child（不延长 TTL）/重算映射/history/current CAS/签名新版本/事件/审计/幂等；坏/过期/基线/撤权、冲突竞争、后置故障回滚、历史/父关系损坏拒绝。
- [x] 保存后重新展示且清空旧差异选择，旧 receipt 拒绝；多标签页 409 和手工重读刷新真实事件。手机 Chrome 实际编辑→新差异接受→独立蓝图→原 native/download 验证；模型 fixture，生产关闭，非质量验收。
- [ ] 区域增删/层级/交互与数据源的编辑、替代组件/visual retry；不是完成后区域重生成。
- [ ] 恢复/资源/升级/回退/全局调度专项、真实 provider/KF/Windows/1:1 与受控 rollout。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
### 2026-10-23 现有工作台与真实浏览器闭环（最新）

状态仍 **IN_PROGRESS**，以 `agent-app/docs/visual-workbench-browser-20261023.md` 为准；下方“前端/browser 未接”均历史。

- [x] 现有 UI 单图私有上传/派生图、默认不勾外发同意、完整告知；失败保留图片意图，导航/租户切换清理，迟到响应隔离。
- [x] 真实只读签名 review 展示投影，Cookie/tenant/原 actor/TTL/base 校验；逐项确认未验证风险或省略+理由，识别接受不等于蓝图确认。
- [x] Chrome 真实上传/确认/SSE 刷新恢复→正式 PG 蓝图→独立确认→native 编译/签名/快照/构建→下载字节 SHA-256 与一次性拒绝。桌面/手机布局检查，模型本地 fixture，生产策略不开放；完整结果见报告。
- [ ] 可编辑识别/区域修订/替代组件/visual retry、恢复/资源/升级/回退与全局 worker 调度专项。
- [ ] 真实 provider/计费/缓存质量与 KF/Windows/参考图还原质量；满足专项后再设计受控 rollout，不直接开 flag。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
### 2026-10-23 公共工程确认与 HTTP 下载（最新）

状态 **IN_PROGRESS**，见 `agent-app/docs/visual-public-engineering-20261023.md`；下方“公共 confirm 未接”均为历史。

- [x] 公共 confirm 当前 runtime/gates、同意者/原 ancestry/TTL/基线/签名 review/实际 Message/回执校验，原 config/base 固定候选 SQL NULL→freeze 唯一消费；Message/budget/queued/审计同事务，幂等重放优先 gate/runtime。
- [x] 确认/停止竞争、相同和不同请求、scope、配置降级/缺模型、post-freeze 错误等拒绝或回滚；识别结果等待不能提前确认蓝图。
- [x] 真实 Cookie/Origin HTTP confirm→正式 PG 图→原 native snapshot/sign/build/Delivery→私有 token/下载字节 SHA-256；跨租户、无会话/Origin、token 盗用/重放均验证。新增 22 项，完整回归/中间失败见报告。
- [ ] 现有前端参考图上传/明确外发同意/差异接受/独立蓝图确认与 browser 上传→下载闭环。production vision 仍关闭，不拿 staged Store 注入测试替代 rollout/真实 provider/KF/Windows/像素验收。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
### 2026-10-23 工程 Run 正式消费者与提交后只读恢复（前批）

状态 **IN_PROGRESS**，详见 `agent-app/docs/visual-engineering-run-20261023.md`；下方 2026-10-22“consumer 未接”属于历史。

- [x] 内部 signed confirm → cache 前 proof/current lease preflight → 独立 @7 工程 step/hash/正式 registry/worker handler → PG 图。清旧 channels，签名 blueprint/accepted/stamp 确定性进入原 capability/专用 semantic/compile/sign/snapshot/enqueue。
- [x] 真实客户端包/结果修订/快照绑定与 SHA-256 测试；缺配置、错误控件映射不能被当作成功。
- [x] 已提交作业先验证本 Run 唯一 job/签名 plan/不可变 snapshot/视觉及 blueprint/结果包绑定；只读跟踪不重启图或重复计费，允许仅自身成功 revision 变化。TTL/撤权仍阻止编译前恢复，不全局放宽来源校验。
- [x] 提交前后、semantic 后 compile 前的真实 PG checkpoint 恢复/撤权与 fake binding/cache/签名拒绝。新增 17 流程测试；完整结果及中间失败/WARN 见报告。
- [ ] 公共 Store confirm 原子事务与完整 HTTP 确认→下载、现有 UI 上传/授权/差异/蓝图/交付；生产 vision 继续关闭。真实 provider/KF/Windows/像素验收另行完成，不拿 fixture 包替代质量结论。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
### 2026-10-22 专用视觉语义模型/网关/runtime（最新）

状态 **IN_PROGRESS**，见 `agent-app/docs/visual-semantic-runtime-20261022.md`。

- [x] engineering proof冻结semantic route/prompt/限制/repairPolicy:none；旧内部proof缺配置仅可读，不按当前环境补模型。
- [x] 原提示词/候选投影/语义校验共享纯函数，专用服务在cache/send/publish复核祖先签名/当前许可/真实scope-fence-lease，服务器重算候选与资产元数据，走实际gateway/usage/持久结果缓存。
- [x] 并发、恢复、旧响应、取消/撤权/损坏输出与缓存hash一致性；runtime精确route凭据绑定，缺专用端口隐藏旧视觉方法，原semantic节点保留视觉stamp。新22流程+2runtime，完整结果/中间失败见报告。
- [ ] @7 confirm消费preflight/step/handler、已提交job跟踪、公共同事务确认与原编译构建下载/UI仍未接；production vision关闭，不以服务/单节点测试标T22 VERIFIED。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
### 2026-10-22 蓝图展示签名/确认后继继承（前批）

状态 **IN_PROGRESS**，见 `agent-app/docs/visual-blueprint-confirmation-20261022.md`。

- [x] 正式handler在发布蓝图receipt前持久化vbpr1签名review，绑定实际模型结果/唯一Message/revision/hash/视觉确认/实际执行租约；恢复复用旧展示不重复发布。
- [x] 内部confirm_blueprint的独立veng1/semantic-planning proof、actor/action/request/base/config/原accepted+blueprintReview绑定；同调用方事务唯一消费/审计/step/终态事件，失败回滚、消费后认证恢复。不是把accept-only proof复制给新动作。
- [x] 来源和图/模型/Message/回执/签名/歧义/租约/取消/政策/TTL/并发/回滚/身份漂移测试补齐，新增31流程，总123，完整结果/中间失败见报告。
- [ ] semantic/repair路由/prompt冻结与专用模型发送/cache/派生OCR授权、可执行@7 confirm preflight/handler、公共Store完整事务、原编译构建交付与UI/download E2E仍未接。
- [ ] 生产vision仍关闭，公共confirm仍拒绝；新候选仍内部手工事务，方法不创建Message/预算/queued或授权build，不标T22 VERIFIED。旧试用/迁移/整体升级worker保护保持。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
### 2026-10-22 公共确认受理/真实HTTP确认到蓝图（前批）

状态 **IN_PROGRESS**，详见 `agent-app/docs/visual-public-acceptance-20261022.md`；下方旧切片的“公共accept仍关闭”为历史描述，不再代表当前源码。

- [x] strict receipt/差异action、有界共享leaf schema避免循环；新HTTP/Store都要求完整确认，旧内部最小action仅可读。
- [x] 统一runtime准入依赖/当前vision与管理员外发gate；原config/base/actor/predecessor固定，初始SQL NULL input只由signer写入；Message/Run/proof/安全审计/预算行/queued同事务，原等待CAS一次消费，不再重复终态事件。
- [x] 控制锁先于源Run行锁，确认/取消无死锁/不复活；并发相同请求同Run、不同请求唯一后继；完整action与accepted选择双向校验。失败含freeze后缺模型配置均整笔回滚。
- [x] 真实Cookie/Origin HTTP确认→正式executor/registry/PG完整图→独立蓝图Message/receipt/WAITING_INPUT，流程92项（新22）与contracts新1，完整回归/中间错误见报告。
- [ ] confirm_blueprint/审批/retry下一段可信继承与visual semantic/repair路由/派生OCR外发、原构建交付、现有前端和upload→download视觉E2E仍未完成。
- [ ] 生产vision仍关闭；只限单图/原同意人/build源，不能靠flag或手工造Run试用，不标T22 VERIFIED。旧试用保护/整体升级worker、预算暂缓/旧POST退役保持。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
### 2026-10-22 确认后继正式执行器/完整PG图/等待恢复（前批）

状态 **IN_PROGRESS**，详见 `agent-app/docs/visual-blueprint-run-20261022.md`。

- [x] @7 accept的cache前可信输入preflight、独立visual-blueprint步骤/hash/mustPause，正式registry/handler/真实会话turn与memo。
- [x] 新图输入在load-context前清旧构建/批准channels，确定性设计路由；真实Postgres完整图产独立蓝图Message/回执并WAITING_INPUT，不能用旧native interrupt或错位own checkpoint继续。
- [x] 已完成checkpoint/receipt投影与去重；input.required后pause故障，新Nest上下文+真实租约恢复无重复模型/Message/事件；坏proof+完成缓存、假完成缓存、取消/shutdown已测。
- [x] module/worker/Conversations统一runtime装配，专用模型组合保留文字private receiver，gateway凭据绑定完整服务器route，换host/model在外发前明确拒绝。流程70+runtime3定向通过，完整回归见报告。
- [ ] 公共RunService/Store reserved accept仍关闭，生产vision仍关闭，测试确认候选仍为内部事务。下一步strict公共payload+原子Message/Run/freeze/queued/幂等/错误映射，避免freeze后重复消费原等待，再真正HTTP确认E2E。
- [ ] 下一蓝图/审批/重试可信继承、visual semantic route/prompt/派生外发与原构建交付、当前UI/upload→download E2E仍待接。不能把accept-only proof当蓝图批准，不标T22 VERIFIED。

无迁移/实际环境/收费或KF试用操作，预算暂缓/旧POST退役/21对18升级保护不变。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
### 2026-10-22 视觉蓝图模型与独立设计节点（前批）

状态 **IN_PROGRESS**，详见 `agent-app/docs/visual-blueprint-20261022.md`。

- [x] 确认proof冻结服务器蓝图route/prompt/限制；旧内部proof可读但缺配置不能调模型，不接浏览器route或默认环境fallback。
- [x] 专用视觉blueprint ModelPort：三阶段proof/source/DB lease/fence/当前外发许可复核，统一gateway/账本、一次物理请求/无隐藏修复，严格v3输出及持久步骤。
- [x] 并发/未知cache拒绝、完成结果真实租约恢复复用、在途新owner接管与旧fence禁止覆盖，保留所有实际usage，不承诺网络exactly-once。
- [x] 原design-plan节点视觉分支、独立蓝图Message/design-review、清旧构建批准/旧plan上下文、完整accepted隔离memo，普通Run清新来源stamp。流程62项（本轮新增16）、节点新增9；完整验证与中间失败见报告。
- [ ] 公共action/RunService/Store、@7 accept executor/handler/worker模型装配、完整LangGraph入口和WAITING_INPUT/checkpoint恢复尚未接；生产vision继续关闭。测试直接原节点不当公开确认E2E。
- [ ] 下一步先装配匹配冻结host的安全凭据网关+可执行accept/清旧graph状态/确定性路由，后同步公开事务受理；再confirm_blueprint等新action可信继承、visual semantic模型冻结及OCR外发、独立批准到原compile/build/delivery，最后当前UI/download E2E。

无新迁移/环境/收费或KF试用操作，不标T22 VERIFIED，预算暂缓/旧POST退役不变。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
### 2026-10-22 确认后继可信继承/原子消费（前批）

状态仍 **IN_PROGRESS**，详见 `agent-app/docs/visual-continuation-20261022.md`。不是公开确认流程或图生工程完成。

- [x] 不复制message admission，新严格continuation容器绑定新Run/actor/action/config/request/base与来源admission/review/accepted选择，独立HMAC签名。
- [x] 调用方同事务候选后继→校验review→accepted/step/审计→CAS原等待/唯一supersededBy→原终态事件；并发唯一、整体回滚、同后继幂等/不同选择冲突。
- [x] 已消费原Run不再错误要求仍WAITING_INPUT；恢复验证精确原链/HMAC/current analysis/source/leaf/TTL/catalog/base和Tenant许可。仅原同意人、单图、build accept；不授予外发/蓝图/执行权限。
- [x] 真实Run到review后内部事务新30项，原文件合计46项；API完整753、编排器205、contracts505及root/API/contracts tsc/3文件ESLint通过。中间action分析身份缺口和fixture错误、其他本轮完整结果见报告。
- [ ] 公共strict action/RunService/Store受理尚未接，@7 executor/handler尚不能执行accept；生产vision仍关闭，不能先放开守卫。测试手工候选不等于HTTP确认→worker E2E。
- [ ] 先冻结其他规划任务配置/派生OCR外发复核，接可执行handler/同锁序preflight/恢复与独立蓝图等待，再同步公开受理事务。confirm_blueprint/审批/不同actor/retry须另设计继承，不得复制仅限accept的v1。最后现有UI/review/差异选择/下载E2E。

无迁移/依赖/实际环境或试用重启，不标T22 VERIFIED，预算暂缓/旧POST不恢复。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
### 2026-10-22 真实Run受理→执行→review等待（前批）

状态仍 **IN_PROGRESS**，详见 `agent-app/docs/visual-run-flow-20261022.md`。

- [x] HTTP严格visualReference字段、真实Store创建事务接freeze，Message/Run/input/step/audit/queued原子；默认开关关闭和幂等重放优先保留。
- [x] worker注册有限@7单图message的正式visual-reference步骤；真实租约/缓存前preflight、分析gateway/usage、signed review等待，文字@6/hash不变，不调用文字生成图/不构建。
- [x] 释放租约来源写入签名review，RunPersistedPause只读核对owner/fence/review身份后收尾；暂停后立即取消不复活或重复终态。
- [x] mustPause防完成缓存/普通返回跳过review；进程signal中断保留可恢复租约，过期owner接手复用已分析结果；Store和HTTP控制层都阻止丢图文字retry。
- [x] 隔离服务器staging policy下真实cookie/Origin保护的Run HTTP→Store→executor→review，以及回滚、取消/恢复等新16项已验，包含在最终API723项内。
- [ ] 生产resolver仍不开放vision，AGENT_VISION_V1=true仍不可用；新@7只到review，不能视为完整协议。单图/空闲会话限制待多图组合review与队列策略完善，原freeze主补图合同保留。
- [ ] 可信确认/重试输入继承、同事务accepted/审计/CAS唯一后继、@7后续handler、其他模型冻结/派生OCR外发、独立蓝图批准与现有工作台UI/下载E2E仍待完成。当前review等待是Run/RunStep，不是LangGraph interrupt。

最终API723、图205、domain1403（另5既有条件跳过）、contracts505通过，root/API/三包tsc与17文件ESLint通过；内部retry缺口的中间722/1和修复后完整723均保留报告。无新迁移/试用改动/真实provider或KF请求，不标T22整体VERIFIED。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
### 2026-10-22 图片输入冻结与 review 来源/TTL（前批）

状态仍 **IN_PROGRESS**，详见 `agent-app/docs/visual-admission-20261022.md`。

- [x] 内部受理事务freeze原语，严格主补图/当前actor/固定基线、完整服务器分析route与prompt身份、notice版本/hash和发送同意；inputSnapshot/一次性step/精简审计原子，幂等与调用方rollback已测。
- [x] 分析从受理快照恢复旧服务器route，入口/cache/send/publish复核scope/fence与源/派生事实/真实像素；输入损坏不降级，变指令/图/模式/配置不冒用旧同意，管理员撤销仍有效。
- [x] review/read/acceptance匹配受理的图片、派生尺寸/hash、指令、模型配置和分析版本；修复TTL过期仍可冻结/确认，PG时钟与旧等待保持已测。
- [x] 内部freeze→真实安全派生像素→shared gateway/usage→signed review/等待→acceptance校验串联，包含在最终55项针对性/707项API内。
- [ ] freeze尚未接RunStore/HTTP/生产module；@7仍是预留协议、现行执行器@6拒绝@7，视觉action/附件/flag未开放。用户实际发送UI、真实准入、确认持久化/CAS后继与新协议执行/恢复要一起接通。
- [ ] 当前完整冻结仅像素分析模型；其他蓝图/视觉语义配置与派生OCR发送复核、严格后继/重试输入继承、多图冲突澄清、现有UI到下载E2E/真实质量仍待完成。

完整API707、图205、domain1403（另5既有条件跳过）、contracts505通过，root/API/contracts/图/domain tsc与8文件ESLint通过；无新迁移/试用改动或真实provider/KF请求，不标图生整体VERIFIED。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
### 2026-10-22 视觉语义与编译图节点接线（前批）

状态仍 **IN_PROGRESS**，详见 `agent-app/docs/visual-graph-20261022.md`。

- [x] 新严格 AcceptedVisualPlanningInput 与纯完整性校验；review确认校验器返回同一结构，不冒充已持久化用户确认/授权。
- [x] 现有semantic节点接独立视觉端口、strict wrapper、候选与区域节点校验、confirmation stamp；缺视觉端口不降级，孤立checkpoint拒绝，原文字repair保持。
- [x] 现有compile节点复核exact plan/wrapper/确认身份并向原生产compiler传visual input；坏输入不编译/追加消息，可信来源、签名、snapshot沿用既有机制。
- [x] 两节点视觉memo包含完整确认/绑定；普通Run三个视觉字段明确null，文字memo输入形状不变。新保留节点协议@7与旧@6缓存隔离。
- [x] 本地provider响应fixture→真实DeepSeek适配器→两个图节点→生产KF编译器→Prisma/签名计划/不可变来源快照串联；错误绑定/改分析不能产生第二份快照。
- [ ] **@7只预留节点，不是已发布协议**。现行API/执行器仍@6、cache前拒绝@7，视觉action/附件/flag关闭；完整准入、配置与用户发送同意、确认审计/CAS唯一后继和prepare暂停适配未做，不可只改常量开放。
- [ ] 分析/review完整图、独立蓝图确认、现有工作台上传/review/修正/来源卡/下载与fake视觉E2E、真实provider/KF质量验收尚未完成。派生OCR/结构也需外发许可，不因“只发文字”绕过策略。

最终完整API689、domain1403（另5既有条件跳过）、contracts505、图205通过，root/API/图/domain tsc与14文件ESLint通过；无新迁移/试用服务操作/收费外发，不宣称完整图生或像素级还原。前批数字/状态保留为历史。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
### 2026-10-22 分析执行身份/输入固定与管理员外发API（前批）

状态仍 **IN_PROGRESS**，详见 `agent-app/docs/visual-egress-20261022.md`。

- [x] 本租户GET/PATCH外发策略，真实会话/角色/Origin/严格boolean、DB角色再校验，策略与审计同事务；不能选择其他tenant或借此打开vision。
- [x] 内部分析入口/缓存事务/发送前/发布事务校验scope、owner/fence、真实时钟lease和Run状态；withAgentRunNode阻止闭合scope脱离调用，迟到结果不发布但实际provider usage保留。
- [x] 首次分析前在RunStep固定模型/prompt/配置和图/指令hash；严格parse/内容校验/同输入复用，缓存命中也不旁路；恢复配置漂移拒绝，不覆盖旧身份。
- [ ] 上述是调用前hash pinning，不是受理时完整附件/主补图/模型配置实体与用户发送同意快照。语义模型发送派生OCR/结构也须接策略复核，管理员界面/发送说明仍未完成。
- [ ] 原计划确认后继本批未启用：@6图/执行器仍不支持视觉action。先补新协议与完整准入，再在同一受理事务保存确认数据并CAS唯一后继，接图与当前工作台UI；不以创建不可执行Run代替完成。

最终API688、domain1401（另5既有条件跳过）、contracts505、图195通过，root/API tsc/相关ESLint通过；analysis集成25项含原13项，非另加总数。管理员API已注册模块，review服务仍未接生产图/HTTP。无新迁移、收费调用或试用升级，vision关闭、普通Run visual:null；不宣称完整图生或真实KF质量。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
### 2026-10-22 服务端review与确认校验原语（前批）

状态 **IN_PROGRESS**，详见 `agent-app/docs/visual-review-20261022.md`。

- [x] 严格review/acceptance新合同；服务端scoped analysis、原检索/映射重算、config/catalog/source绑定、HMAC短回执，不信任client mappings/verified。
- [x] 内部prepare同事务保存一次signed completed step、发布小input.required、转WAITING_INPUT和释放lease；并发幂等、旧fence/取消/租约/基线/分析child拒绝及事件失败回滚已测。不创建编译/构建。
- [x] validateAcceptanceInTransaction复核scope/准确receipt与版本/差异；明确省略不再误要求接受未验证控件。未展示的替代映射仍拒绝，须先重新review；不会自动确认未知能力。
- [x] 修复Store内部能绕过HTTP拒绝未开放视觉action/附件并消耗等待的缺口；当前@6仓储层也fail closed，幂等重放优先级保留。
- [ ] 服务尚未装配生产module/graph/HTTP；确认校验不消费等待、不存确认、不创建后继。下一步在新协议受理事务中保存reference/reviewHash/confirmationHash与确认审计、CAS创建唯一后继；不得事务外校验后直接启动。
- [ ] 附件/主补图与真实模型路由配置冻结、管理员外发许可与图片/派生OCR结构发送说明、低置信/未知交互澄清、新review替代选择、图checkpoint/停止适配、独立蓝图确认和前端下载闭环仍待完成。当前vision关闭，不改旧@6 action合同。

新review12项与省略修复红绿测通过；完整API676、domain1401（另5既有条件跳过）、contracts505、图195，root/API/domain tsc与相关ESLint通过。无新迁移/收费调用/试用重启；不是完整图生或真实像素质量验收。step只写一次+签名复核，不宣称新增DB不可变trigger。前端接线继续复用当前components/runs和RunWorkbenchView，不照下方历史文件表示例另造主界面。
<!-- end -->

**Files**

- Create: `agent-app/packages/agent-orchestrator/src/nodes/analyze-reference.ts`、`map-visual-capabilities.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/solution-graph.ts`、`state.ts`、`model-port.ts`
- Modify: `agent-app/packages/contracts/src/agent-run.ts`、`agent-app/apps/api/src/runs/action-router.ts`、`run-executor.ts`
- Create: `agent-app/apps/web/src/components/workbench/VisualReferenceReview.vue`、`CapabilityMappingPanel.vue`
- Modify: `agent-app/apps/web/src/components/ConversationPanel.vue`、`api.ts`
- Test: `agent-app/apps/api/src/vision/visual-flow.integration.test.ts`
- Test: `agent-app/apps/web/src/components/workbench/VisualReferenceReview.test.ts`
- Create: `agent-app/tests/e2e/reference-generation.spec.ts`

**Interfaces**

```ts
// T07/T09已预留的合同，本任务启用对应handler：
type AcceptVisualReferenceAction = { type: "accept_visual_reference"; expectedRunId: string;
  analysisId: string; analysisHash: string };
// RunAction包含AcceptVisualReferenceAction，ActionRoute包含"accept_visual_reference"；不要重复追加定义。
export interface VisualGraphPort {
  analyze(input: VisualAnalysisInput, signal: AbortSignal): Promise<VisualAnalysisResult>;
  mappings(tenantId: string, analysisId: string): Promise<RegionMapping[]>;
}
```

- [ ] 红测：缺receipt/analysisHash过期不能跳过视觉确认；正常flow首次停WAITING_INPUT且enqueue=0：

```ts
expect(routeRunAction({ type: "accept_visual_reference", expectedRunId: "run-1",
  analysisId: "analysis-1", analysisHash: "hash-1" })).toBe("accept_visual_reference");
// integration实际API：附件message run结束于input.required，payload仅analysisId/hash/安全摘要。
// PATCH修改region后，旧hash确认返回409 VISUAL_ANALYSIS_STALE。
```

- [ ] Run visual-flow/VisualReferenceReview测试；预期 FAIL。
- [ ] graph顺序load→analyze→map→WAITING_INPUT；用户修改/接受后新run关联分析，继续blueprint，按原blueprint确认才进入implementation/build。不能一次“接受识别”就自动批准原生工程变更。纯文本creative路径不经过vision节点；discuss模式可描述图但不构建。

```ts
if (accepted.analysisHash !== stored.specHash) throw new Error("VISUAL_ANALYSIS_STALE");
if (stored.tenantId !== scope.tenantId || stored.workspaceId !== scope.workspaceId)
  throw new Error("REFERENCE_NOT_FOUND");
// 通过后写acceptedAnalysisId/hash到新run.inputSnapshot，再继续blueprint；不信任客户端mapping。
```

- [ ] review显示原图区域叠层、区域角色/文字、控件映射、confidence、未知交互/数据源、fallback选择；允许表单修正，用T19 PATCH严格版本检查；提供“按当前理解继续”而不是强制用户编辑所有区块。多图各自spec，用用户指定主图+补充图关系；冲突布局要求选择，不凭顺序覆盖。关键低置信区域要确认。
- [ ] E2E fake视觉输出+真实图像文件走完整upload→review→confirm→build→download，断言reference原图未打包、资源material已打包、文本模式仍成功、错误时保留图/草稿；真实provider smoke另列T26，不用fake通过证明模型看图能力。
- [ ] 提交点 `feat(agent): deliver reviewed image-to-component generation`。

## T23：受限局部修改与未选区域不变性

**Files**

- Create: `agent-app/packages/contracts/src/semantic-patch.ts`，Modify: `index.ts`
- Create: `agent-app/packages/domain-client/src/visual/semantic-patch.ts`、`unchanged-region-check.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/solution-graph.ts`、`nodes/design-plan.ts`、`model-port.ts`
- Modify: `agent-app/apps/api/src/conversations/deepseek-model.ts`、`graph-ports.ts`
- Modify: `agent-app/apps/web/src/components/workbench/VisualReferenceReview.vue`
- Test: `agent-app/packages/domain-client/src/visual/semantic-patch.test.ts`
- Test: `agent-app/apps/api/src/generation/regional-edit.integration.test.ts`

**Interfaces**

```ts
// semantic-patch.ts：payload分别复用已有region计划、token、interaction的Zod类型，不开放任意对象。
export type RegionHashes = Record<string, string>;
export function assertUnchangedRegions(before: RegionHashes, after: RegionHashes, allowedRegionIds: string[]): void;
export type SemanticPatchEnvelope = { schemaVersion: 1; expectedSnapshotId: string; baseRevisionId: string;
  operations: Array<{ type: "replace_region" | "update_tokens" | "update_interaction"; regionId: string; payload: unknown }> };
// schema实际为按type的严格union；下列计划类型从@kf/contracts现有导出引入。
export function applySemanticPatch(snapshot: { id: string; baseRevisionId: string;
  implementationPlan: SolutionImplementationPlan }, patch: SemanticPatchEnvelope): SolutionImplementationPlan;
// 返回值经过现有SolutionImplementationPlanSchema校验；不得创建名字相近的第二套计划schema。
```

- [ ] 红测：

```ts
expect(() => assertUnchangedRegions({ a: "h1", b: "h2" }, { a: "changed", b: "h2" }, ["a"])).not.toThrow();
expect(() => assertUnchangedRegions({ a: "h1", b: "h2" }, { a: "changed", b: "changed" }, ["a"]))
  .toThrow("UNSELECTED_REGION_CHANGED");
```

- [ ] Run: `pnpm --filter @kf/domain-client exec vitest run src/visual/semantic-patch.test.ts`；预期 FAIL。
- [ ] 实现clone不可变snapshot→schema parse patch→校验allowedRegionIds→应用semantic变更→依赖闭包校验→确定性编译→未选region hash比较。hash排除时间戳等非语义字段，但不能排除脚本/geometry/asset refs。核心检查：

```ts
const allowed = new Set(allowedRegionIds);
for (const regionId of new Set([...Object.keys(before), ...Object.keys(after)])) {
  if (!allowed.has(regionId) && before[regionId] !== after[regionId])
    throw new Error("UNSELECTED_REGION_CHANGED");
}
```

- [ ] shared token/父布局变化影响其他region时返回DEPENDENCY_EXPANSION_REQUIRED及具体列表，不自动把所有region加入allowed；用户确认范围后重新规划/签名。保留稳定component/nativeId，禁止跨工程粘贴ID；planHash改变必须重新审批。无snapshot返回GENERATION_SNAPSHOT_REQUIRED并提供“重新规划可编辑版本”。
- [ ] 集成验收：只改表头颜色、移动独立卡片、更改表单交互；每例比较未选区域结构/native hash；A/B同base竞争只允许一个finalize；局部模型输出任意路径/未知控件拒绝；失败后旧revision仍可下载。预算/修复限制仍有效，不因局部编辑另起无限修复。
- [ ] 提交点 `feat(agent): apply bounded regional edits with revision safety`。P4 gate：S02/S03/S06通过，首次图生与局部修改均附真实制品，视觉相似度不能仅凭schema通过宣布完成。
