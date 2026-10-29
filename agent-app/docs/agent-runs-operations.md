<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
# Agent Run 运行与升级手册（本地实施版）

<!-- modified by jinlong.feng at 2026-10-27 Agent工作台迭代 -->
**本轮可用版已验收交付（VERIFIED_V1）。** 真实DeepSeek文字生成、原需求继续修改、单图识别/审核/独立蓝图/构建下载、最终历史分叉均通过；三份最终包在独立KF工程导入/逐页读回相等、开发态打开无名称警告/JS错误，测试席位已释放，未发布运行态。最终源码为visual-blueprint@14 / blueprint-repair@8 / visual-semantic@24 / semantic-repair@13，生成名称最长32；结构投影v2及混合坐标/稳定记录key修复已回归。最终包与截图见agent-app/outputs/usable-v1-20261027/native-name-fixed/，父目录旧包为历史负例。入口43301、独立库UTC22迁移；完整验收见agent-app/docs/agent-next-acceptance.md，补丁见同outputs目录patch/。

**接手边界：** 优先级仍为可用流程，UI还原后置；已有图片普通文字续改明确模型前拒绝，T23新同意/局部编辑、完整运行态/交互验收、成本缓存A/B、预算和真实业务源尚未完成。已有repeater记录key集合增删暂不支持，显示值/排序可改；旧长名基线只读/历史下载，新建短名工程继续。下文旧版本号、未启用结论、“下一优先UI”等全部是对应阶段历史，不覆盖本条或最终验收表。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-27 Agent工作台迭代 -->
**当前可用版操作入口已独立收口：** `agent-next-release-runbook.md`。本轮仅创建并启动新的本机试用库/43300 API/43301 Web，源码 22 条迁移，旧 18 条试用库和旧服务未由本轮升级。生产 resolver 现在支持显式 runs/workbench/vision + 准确租户 allowlist，默认仍关闭，管理员策略/逐次同意继续必需。所有视觉协议升级须排空并整体重启、新审核/独立确认；下文各次 hard-off 和下一步属于历史记录。
<!-- end -->

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
最新运行注意：`visual-repeater-observation-20261023.md` 记录@4/@4最终全量的2项超时/异步FENCE错误及同时间合盖/维护睡眠。请保持测试机器唤醒约6分钟后补回归，不改电源设置/租约/fence或跳过测试来制造全绿。两个新真实验收共5调用，已暂停进一步收费；工程仍因 recipeId/区域候选问题失败，无能源包/KF运行结论。production vision关闭，整体排空升级与试用库保护保持。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
## 当前源码边界：有界 mock 重复观察

见 `visual-repeater-observation-20261023.md`。共享投影提取原 provenance 规则，观察可按实际模板字符串实例证明，native/sourceMap/制品继续封口，不引入真实业务源或模型自报证明。冻结协议现在为 **visual-semantic@4 / visual-blueprint@4**，须排空旧视觉任务与 worker 后整体升级并新建/独立确认，不能因同 run-plan@7 混部或直接改库重签。

production vision仍关闭；五种 Chrome 仍为 fixture 验收，不是生产/KF运行许可。旧能源响应的观察已过、侧栏按钮候选仍拒绝，后续按新协议真实规划与有效包验收；业务源暂缓，T22/总体未完。下方重复观察未接与 semantic@2为上轮历史。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
## 当前源码边界：显式静态观察旅程

详见 `visual-observation-journeys-20261023.md`。新蓝图 observe + expectedTexts 必须重新独立确认；旧缺 kind 步骤不得按动词猜测或改写原签名事实。观察由受限静态语义/原生/制品证明，禁止 action 冒充；interact 保持原真实闭包。审批卡展示类型和全部期望文字，不能隐藏判断依据。

冻结协议升为 **visual-blueprint@3 / visual-semantic@2**。排空旧视觉任务、停止旧 worker，整体部署兼容源码后新建/重新确认；同 run-plan@7 仍不支持混部，不直接改库重签历史任务。production vision保持关闭；本地四种 Chrome 下载场景不构成灰度/KF运行许可。下一是有界 mock 重复实例观察证明、真实输出候选约束与能源图真实包验收，不继续扩业务源。未改实际 .env/迁移/试用进程/远端 KF，既有18迁移试用库仍受保护。下面旧协议号与“先做观察合同”均为历史。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
## 最新源码边界：真实能源 UI 模型联调（2026-10-23）

先读 `visual-real-model-20261023.md`。业务源按用户最新要求暂缓，当前主线是客户端工程生成。官方真实识图/差异接受/修复后的独立蓝图已执行；工程调用仍失败，字体规范化修复后离线定位到静态观察旅程的动作覆盖合同，尚无本轮工程包/KF运行/像素验收。普通fixture测试与真实付费失败实验必须分开。

`vision@v2` 与 `visual-blueprint@2`（完整结构JSON Schema）改变prompt/冻结hash；新的蓝图合同拒绝旧@1，不支持同@7混部。排空旧视觉任务和worker后整体升级并新建/重新确认，不能改写旧证据。原受限提议仍须人工确认，不等于执行授权；识图gateway与其他视觉网关一样绑定部署时复制的完整route，更换地址/模型后旧任务外发前拒绝。**production vision仍关闭，不是改flag即可试用。** 未改真实.env/迁移/试用进程或KF；密钥仅从已忽略本地配置读取，不抄写聊天凭据。KF443可达但内置浏览器证书不受信任，未修改全局TLS/证书设置。下一先观察/交互合同与真实工程，再KF独立测试工程，不继续扩业务源。完整证据/复现/检查与文件清单见报告。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
## 最新源码边界：当前工作区名称只读快照（2026-10-23）

见 `visual-workspace-data-20261023.md`。当前 dataRequirement 只允许文字区域读取本 Run 租户/工作区的 name；服务端取真实值，冻结 dataSnapshots 到签名 review/后继/工程快照并先展示值再确认，不允许 caller 来源值/其他工作区/URL/凭据。旧版本与重放不因重命名刷新，新有效修订才重新取值和确认；不是实时接口。精确语义与 native/sourceMap 文字校验均接通，实际 Chrome 在确认后重命名仍于下载包核对原确认值。

完整 API **988/988、零 skip**（275 视觉流程/三项 Chrome）、串行 domain **1431 passed / 5 原有 skipped**、Web 175、contracts 525、类型/14 TS lint/build 通过；既有 lease cleanup WARN 未根治。**T22/计划 IN_PROGRESS、production vision 关闭**；业务源目录/权限/类型/凭据/撤权/适配、实时更新、其他交互/未知 hint/替代/retry、T17/T23/T24–T27 和系统/真实质量仍待完成。

无新迁移/依赖/实际环境/试用进程操作，只用原隔离测试库（21 完成迁移，测试后零其他连接）。预算暂缓、旧入口退役、旧试用 18 对源码 21 保护保持；新增 spec/reference 字段和视觉 prompt/hash 不支持旧严格 @7 worker 混部，仍须排空整体升级，不据 fixture 验证只开 flag。下方计数和“数据绑定未接”均历史，不泛化本批工作区元数据能力。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
## 最新源码边界：结构化本地点击反馈（2026-10-23）

最新见 `visual-click-feedback-20261023.md`：已保存 action 区域可选有界 click-feedback 要求，原 revision/签名/TTL/幂等/审计/新回执/独立批准保持。仅 button，校验实际唯一直接 click→show-feedback、精确文字/级别且无条件/依赖/后继/脚本替代；native sourceMap/快照再核对唯一精确 owner/onClick/反馈动作。原 static Chrome 保留，新增反馈 Chrome 实际解包核对按钮 ShowMessage 字节。clarifications 仍是未验证文本，不产生真实数据连接，原未知 hint 不自动消除。

最终完整 API **64 文件 975/975、零 skip**（262 视觉流程/两项 Chrome）、串行 domain **68 文件 1419 passed / 5 原有 skipped**、Web 172、contracts 523、类型/13 TS lint/build 通过；实际结果和所有中间红测见报告 §6，既有 lease cleanup WARN 未根治。**production vision 仍关闭，T22/计划未完**，真实数据绑定、其他交互/未知 hint 解决、替代/可信 retry、T17/T23/T24–T27 和真实质量/系统发布尚缺。视觉 prompt/hash 与新严格 spec 字段要求排空整体升级，即使同 @7 也不能混部；不按本地 fixture 的包字节验证宣称 KF 运行/1:1。

预算限制暂缓，旧接口退役和试用 18 对源码 21 保护不变；无新 schema/迁移/依赖/实际环境/试用服务操作，只用既有隔离测试库。下方尚无执行交互与旧计数为历史。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
## 最新源码边界：交互/数据来源补充说明（2026-10-23）

最新见 `visual-clarification-notes-20261023.md`。可选 clarifications 仅作未验证文本，沿原 Run revision 原子保存/签名/TTL/新回执/重选，并进入原蓝图/语义 JSON 参考；没有新网络请求、真实数据连接或执行权限。原 interactionHint 拦截不变，静态 verified 带说明降为 supported_unverified；清空说明不能删除原未知问题。现有 UI 原生折叠字段明确“未验证/未绑定”，不要填写密钥。

完整 API **64 文件 963/963、零 skip**（250 视觉流程/真实 Chrome 到工程下载），Web 169、contracts 521，串行 domain **68 文件 1404 passed / 5 原有 skipped**；类型/lint/build 通过。初轮并行 domain 1 项原用例超时及后续复验均保留报告，不改断言或超时；既有 lease cleanup WARN 不宣称根治。T22/计划仍 IN_PROGRESS，剩真正结构化交互要求/数据绑定、替代/可信 retry、T17/T23/T24–T27 与系统/真实质量验收。

**production vision 继续关闭**；旧严格解析 worker 不能读取新字段，同 @7 不能证明混部兼容，仍需排空整体升级。未动真实环境/试用服务/受保护业务库，仅原隔离测试库（21 迁移）回归，测试后无其他连接；旧试用 18 对源码 21、预算暂缓、旧接口退役保持。下方计数/尚未支持说明编辑均历史，不能按绿测只开 flag。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
## 最新源码边界：识别区域层级修订（2026-10-23）

最新见 `visual-region-hierarchy-20261023.md`。原 revision 更新项支持可选 parentId/null，UI 父选择/根级/折叠层级预览已接，临时新区域先保存后调整；候选图拒绝未知/已删父、自/间接循环，明确移出子节点后才能只删原父。原图全局 box、分析版本父链/TTL/来源/actor/gates/签名/原子新回执与独立蓝图批准保持，旧请求缺字段/hash 不变。

最终完整 API **64 文件 952/952、无 skip**（239 视觉流程/真实 Chrome），Web 165、contracts 517 与 tsc/vue-tsc/lint/build 通过；中间红测与实际包证据见报告。**不开放生产 vision**，交互/数据源、替代/可信 visual retry、真实 provider/KF/Windows/1:1 与系统发布专项仍缺。无新 schema/迁移/依赖/环境/常驻服务操作，预算暂缓、旧试用 18 对源码 21/整体排空升级、旧接口退役保持；同 @7 旧 worker 仍不保证兼容，不能只开 flag/混部。下方旧限制/计数为历史。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
## 最新源码边界：识别区域增删（2026-10-23）

以 `visual-region-structure-20261023.md` 为最新。原 revision POST 支持可选 additions/removals；服务端 ID/root/confidence=0、显式后代删除、保留未知问题、原 TTL/actor/gates/不可变 child/签名 history/CAS/事件/审计原子性不变。原 UI 新增/待删/恢复/放弃已接，保存重新选择差异，仍独立确认蓝图。纯 browser revision schema subpath 避免加载 Node 签名依赖，不允许 client native/身份/置信度/权限字段。

最终完整 API **64 文件 942/942、无 skip**（229 视觉流程/扩展真实 Chrome），Web 161、contracts 515，tsc/vue-tsc/lint/build 通过；完整证据/中间错误见报告。**不开放 production vision**，层级/交互/数据源、替代/视觉 retry、系统与真实 provider/KF/Windows/1:1 仍待验。无新迁移/依赖/实际环境/试用进程操作；旧试用 18 对源码 21、排空整体升级 worker、预算暂缓与旧 POST 退役保持。旧 worker 同 @7 不保证支持新动作/修订，不能据本次绿测混部或只开 flag；下方旧数字和“不支持增删”为历史。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
## 最新验证补充：I1 时序与完整回归（2026-10-23）

以 `approval-concurrency-20261023.md` 为最新：I1 并发用例现以真实 audit 提交 gate 保证请求在同一 ADMITTED fence 持有期重叠，仍严格要求两个 CONVERSATION_TURN_IN_PROGRESS；独立锁释放后重放要求 NO_PENDING_APPROVAL。没有改生产行为、两个码兼容断言、timeout/retry/skip 或已退役入口。API **64 文件 927/927、无 skip**（13:20:50 / 252.22s，含 214 视觉流程与真实浏览器工程下载）、API/root tsc 与改动文件 lint 通过。

下方 925/1 是前批历史，不再作为当前全量失败。production vision 仍关闭，T22/计划未完；历史短 lease/偶发 404/cleanup WARN、真实 kill/restart/资源/代理/多副本/升级回退、真实 provider/KF/Windows/1:1 仍须专项验收。预算暂缓、旧试用 18 对源码 21 和排空整体升级保护保持，不以此测试修改环境/迁移/常驻服务。其他包与 Web 独立全量本批未重跑。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
## 最新源码边界：已有区域编辑与签名新回执（2026-10-23）

最后完整 API **925 passed / 1 failed**，原 I1 并发审批错误码（NO_PENDING_APPROVAL vs CONVERSATION_TURN_IN_PROGRESS）未验收，先排查在途重叠与审批消费时序，不能只放宽断言。视觉 214/Chrome、Web 156、contracts 506 通过不是全量绿灯。立即编辑早于原 worker 收尾的竞争已特定修复：只读核对原 exact hash 的归档/发布事件，不授权执行新内容，owner/fence 条件保持。新建空的 kf_agent_test_review_flow_20261023_1245 仅复制测试 schema/21 migration 元数据，无业务数据复制；原队列/试用库保留。完整证据与失败在报告 §5/§7。

以 `visual-review-editing-20261023.md` 为准。新 POST runs/:id/visual-review/revisions 由 Cookie/Origin/current gates/tenant/原 actor/WAITING/base/TTL 保护，只改已有区域文字/类型/位置，序列化 UTF-8 <=64 KiB。child 继承 TTL/原图/模型事实，history/current review CAS/签名 revision/新事件/审计同事务；旧回执不能接受，编辑不发模型/新建 Run/工程。旧 analysis-only PATCH 已退役 404，私有 GET 保留。不要删除活跃 proof 所依赖的签名 history 或手工换 parent/hash。

界面保存后重读事件/新展示并清差异选择，多标签页 409/模糊网络失败/导航迟到有保护。真实 Chrome 手机编辑→新接受→独立蓝图→原工程/下载验证仍是本地模型/测试组合根策略，不是生产灰度或真实 provider/KF/1:1 验收。

**T22 IN_PROGRESS、production vision 关闭。** 剩增删/层级/交互/数据源/substitute/visual retry 与恢复/资源/升级/回退/全局调度专项。@7 旧 worker 可能不识别 revision 元数据/历史校验，须排空整体升级；不只开 flag。18 对 21 试用保护、预算暂缓和旧 POST 退役保持；本批无实际 env/key/试用/迁移/真实模型操作。重跑命令/最终回归和证据以报告为准，下方均历史。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
## 最新源码边界：现有 UI 与真实 Chrome 图生下载（2026-10-23）

以 `visual-workbench-browser-20261023.md` 为准。前端已接私有单图上传/派生图、明确外发告知/默认未同意、真实 displayed review/逐项差异确认、独立蓝图确认及原下载；新增 GET runs/:id/visual-review 按 Cookie/tenant/原 actor/TTL/base 白名单展示，不返回内部 proof/配置/worker 信息。vref1 读取失败不能进入普通蓝图确认，上传失败不能丢图转文字。

真实 Chrome→Nest/Prisma/PG/SSE/原 native/sign/snapshot/BuildExecutor/实际私有下载和 hash/一次性验证已通，模型本地 fixture、测试组合根 staged policy。**生产 vision resolver 仍关闭、T22 IN_PROGRESS；编辑/区域修订/substitute/visual retry、升级/恢复/资源/全局调度专项及真实 provider/KF/Windows/1:1 质量仍待完成。** 不仅打开 AGENT_VISION_V1；真实受控配置还须私有上传开关、完整 runtime、租户外发许可和审核后的 rollout 改造，不能拿测试配置进入试用。

API 含浏览器重跑须显式 `KF_VISUAL_BROWSER_TEST=1`、禁 tracing、指定 kf_agent_test_* 隔离库并确认 Chrome 安装。测试随机端口 Vite envFile=false + Nest，finally 关闭；不接现有试用服务，完整命令/结果/截图路径在报告。无实际 .env/key/试用/迁移/真实模型操作，旧 18 对 21 迁移、expand/排空/整体升级、预算暂缓和旧 POST 退役保持。下方为历史。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
## 最新源码边界：公共蓝图确认与 HTTP 工程包下载（2026-10-23）

以 `visual-public-engineering-20261023.md` 为准。公共视觉 confirm 已接原子 Store/signature/source 消费/消息/预算观测/queued/审计，runtime 只有 review/blueprint/semantic 齐全才提供工程依赖；幂等优先当前 gate/runtime。视觉输入 config 降级不能走普通文字，识别结果等待仍须先接受差异。复用前批工程消费者与提交后只读恢复，不再手工建工程候选。

真实 Cookie/Origin HTTP confirm→正式 PG 图/native/sign/snapshot/build/Delivery→私有一次性 token/下载字节 hash 已以本地模型 fixture 验证，**生产 resolver 仍关闭、前端和 browser 图生闭环未接，不能只开 flag 试用。** staged Store 策略注入不是生产灰度；真实 provider/KF/Windows/1:1 质量未验收。无实际 `.env`/key/试用/迁移操作，旧试用 18 对源码 21 和排空整体升级不支持 confirm 的旧 worker 要求不变；预算暂缓、旧 POST 退役保持。

本批命令均禁用 tracing；完整回归与中间失败见新报告，不沿用前批通过数。下方是历史记录。

本批最终 API 64 文件 **896/896**（10:07:06 / 226.00s）；既有 cleanup WARN 仍有，前批偶发 lease/404 未宣称根治。根/API tsc 与 5 文件 ESLint 复验；其他包、Web/browser/真实模型未重跑。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
## 前批源码边界：视觉工程 Run 与提交后恢复（2026-10-23）

最新以 `visual-engineering-run-20261023.md` 为准。内部 @7 signed confirm 已有正式 executor/registry/worker handler，进入专用 semantic/原生签名编译/快照/build/包交付；已提交任务独立校验 Run/job/signed plan/snapshot/result，只读恢复不重开模型/图或重复 enqueue。只有这个作业的成功结果能移动原 base；未提交时仍校验原来源/TTL/当前外发/actor/fence/lease，撤权不能通过缓存继续编译。

**公共视觉 confirm Store 和 UI 仍未接，production vision 仍关闭，不能只开 flag 或手工造候选试用。** 新内部候选仅限隔离测试；不要用旧 proof 补签，也不能混部不支持 confirm 的旧 @7 worker。旧试用 18 条迁移对源码 21 的 expand/排空/整体升级要求、预算暂缓/旧 POST 退役保持。

模型为 fixture；真实 PG/native 编译/私有包字节 hash 通过不代表真实 provider/KF/Windows/像素还原验收。测试命令必须在进程内显式禁用 `LANGCHAIN_TRACING_V2`、`LANGSMITH_TRACING`；本批第一次定向继承追踪并报 429，告警保留，不改实际 `.env`/key。最终回归、中间失败及完整边界见新报告，下方是历史记录。

本批最终 API 874/874、图编排 214/214，root/API tsc 与 11 文件 ESLint 通过；首次完整 872/2、单独复验及既有 cleanup WARN 均保留报告，不表示偶发短租约/404 已根治。其他范围未拿前批数冒充当前全量。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
## 最新源码边界：专用视觉语义模型（2026-10-22）

`visual-semantic-runtime-20261022.md` 为最新：已冻结semantic任务配置、装配专用gateway/usage/持久结果缓存与Conversations端口，实际lease/祖先/许可三阶段检查，缺服务禁止回落旧视觉方法。**公共视觉confirm及@7执行consumer仍未接，production vision关闭，不是可用图生工程下载。** 候选仍为隔离测试内部事务，不得手工注入试用队列或改历史proof补签。

规划readers仅适用于RUNNING/未构建；后续须单独验证本Run已提交job/签名artifact/result的跟踪，不能因build后revision变化全局跳过stale-base/TTL或重复enqueue。无实际.env/key/真实provider/KF/迁移/试用服务操作，旧试用18对源码21、排空整体升级worker、预算暂缓/旧POST退役保持。下方为历史；本轮回归和中间超时见新报告。

本轮最终API857/857、编排器214/214、contracts506/506、domain1403 passed/5既有条件skip，root/API tsc和10文件ESLint通过。中间定向超时、完整856/1既有会话创建404、单独及最后完整复验、既有lease cleanup WARN均保留报告，不宣布历史偶发问题已根治；不是完整图生下载/真实还原质量验收。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
## 最新源码边界：蓝图确认可信继承（2026-10-22）

`visual-blueprint-confirmation-20261022.md` 为最新：正式蓝图handler发布回执前持久化独立签名review；内部confirm_blueprint后继有独立engineering proof/一次消费/审计/恢复读取，绑定实际展示与原视觉选择。公共accept前批已通，**公共视觉confirm仍关闭**，新确认候选仍是隔离测试内部手工事务，不是可用工程生成；semantic模型冻结/派生外发/执行handler/公共受理/原编译构建下载与UI仍待接。production vision仍关闭，不可开flag或手工造队列试用。

同@7不代表支持新签名review/动作；不生成签名review的旧等待不能在HTTP确认时倒签或手工塞proof。上线前排空并整体升级，旧试用18迁移对源码21保护和历史数据保留不变，本轮无.env/key/真实provider/KF/迁移/试用进程操作。预算暂缓、旧POST退役保持。下方为前批历史；完整验证及扩大回归中间失败见新报告，不拿旧浏览器结果替代当前验收。

本轮最终API833/833、编排器214/214、contracts506/506、domain1403 passed/5既有条件skip，root/API tsc和7文件ESLint通过。第一轮两个历史API用例超时及同轮User update P2025、单独与完整复验、既有lease cleanup WARN均保留在报告，不能称历史偶发问题全部根治；不放宽timeout或新增retry/永久skip。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
## 最新源码边界：公共视觉确认（2026-10-22）

`visual-public-acceptance-20261022.md` 为最新：strict公共accept现已接RunService/Store同事务准入/签名继承/CAS旧等待/消息/审计/预算/queued，真实Cookie/Origin HTTP确认到正式executor/完整PG图独立蓝图WAITING_INPUT已测。不是再手工建候选；下方旧记录的“公共accept仍关闭”仅为历史。

本轮最终API802/802、编排器214/214、contracts506/506、domain1403 passed/5既有条件skip，root/API tsc及10文件ESLint通过。中间fixture错误和既有lease cleanup WARN完整保留在报告；不是Web/OS kill/真实provider/KF质量或完整图生下载验收。

**仍不可只开flag试用图生工程。** 生产vision resolver未开放，AGENT_VISION_V1=true仍不可用；当前前端未接参考图确认，confirm_blueprint/审批/retry下一段视觉继承、semantic/repair派生外发和工程下载闭环未接。暂限原同意人、单图、build源+后继，公共确认回执不是构建批准。RunsModule需统一runtime同时有review和blueprint，缺配置不能受理；普通文字/历史/停止不因此开放图片。

旧@6、仅message的旧@7或不支持下一动作的worker均不能混领新动作，整体排空升级后才可考虑灰度；同实验@7字符串不保证能力相同。试用库按旧18迁移及用户数据保护，源码21迁移，必须协调expand/worker升级，不reset/seed/直接新源码重启指向它。不读取/改写真实key/.env，不改常驻服务，不自动迁移；预算暂缓、旧POST退役保持。下方本地试用端口/进程是历史快照，本轮没有复核其在线状态。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
## 本机当前试用环境（2026-10-21 17:12）

维护者已要求启动完整本地环境。当前服务持续运行，不需要重跑测试来启动：

- 入口 `http://localhost:43281/login`（请保持 localhost，不要替换为 127.0.0.1；API_BASE/Origin/cookie 按 localhost 配置）。租户 `E2E Acme`，用户 `alice`，密码 `TempPass-123`，仅为隔离试用账号。
- API 43280、前端 43281、两个租户 agent-worker、build-worker 均已启动。原 5174 设计预览未停止、未改配置。
- 数据库 `kf_agent_e2e_trial_20261021_01` 是本次全新隔离库，部署既有18迁移。**禁止对该库执行 E2E global-setup/seed/TRUNCATE；用户接下来创建的试用数据需要保留。** 自动化回归继续使用报告中的其他测试库。
- 模型为固定样例，不外发到 DeepSeek、不产生模型调用费；A 的语义输出使用测试专属模型，编译/签名/构建/下载仍真实。因此可体验流程，但不能据此评价任意需求的生成质量。真实 DeepSeek 需用户明确启用后切换，图片能力仍关闭。
- 已在当前环境实际完成中文工业大屏需求→确认→SUCCEEDED→报告 pass→下载 26,504 字节包。工程 `5dc63eb2-1dfb-4390-a870-716a251f683d`，会话 `a31e4eee-96d6-4736-a598-ef5cce9edebf`，交付 Run `261f6792-b16f-4c6d-b75c-d14a2e2e5b2b`。示例工程名“试用环境验收-工业生产看板”；用户也可创建自己的工程体验。
- 启动时 localhost 前端仅监听 IPv6，本机 Surge DIRECT 对 localhost 使用 IPv4，curl 经代理返回503、直连IPv6为200、直连IPv4拒绝。只重启了**本次试用前端**并改为监听 127.0.0.1；对外链接仍是 localhost。调整后直连/当前网络均200，重新浏览器登录和恢复下载按钮通过。未修改代理设置或业务代码。
- 当前 supervisor 工具 session `42937` 负责 API/build/agent，前端单独 session `56243`；停止需结束这两项当次进程。最初前端子进程已正常停止，不能以 supervisor 中旧前端 PID 推断现前端。任何重启/停止先核对实际命令/端口，不能盲用本文历史 PID 或清理其他服务。
- 运行制品位于 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-agent-e2e-6tGTtx/artifacts`，supervisor 正常结束时输出日志到同一 runtime 根目录。恢复前必须同时保留数据库、制品和当前测试签名权限配置；不要只保留数据库再换签名 key。
- 当前仅本机试用，不得把这些测试账号/端口公开到公网。业务库、实际 `.env`、真实模型密钥和既有常驻服务未修改；本次没有产品源码变更、commit/push。下方发布门槛仍有效，启动成功不等于全量回归已绿或可上线。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
本手册不是生产部署授权。默认文本协议仍为 `run-plan@6`（原生待审批规格不作已应用基线）；worker新增有限@7单图message→分析→review等待，见 `visual-run-flow-20261022.md`。只在隔离服务器staging policy下验证真实Run HTTP/准入/执行器，生产resolver仍将vision关闭、AGENT_VISION_V1=true仍未开放；确认后继、其他规划任务冻结/派生数据外发、前端和视觉下载闭环未完成。后续灰度必须先排空/整体升级旧worker，再开放对应版本，不能让旧@6 worker领取@7。试用库仍按18条旧状态保护，与源码21迁移须协调expand，不得reset/seed或直接重启新源码指向旧库。

当前相关完整API723项通过，旧偶发连接问题不因一次通过就全部结案；lease cleanup WARN与中间722/1的内部重试漏洞及修复后完整重跑已记录。已有Run审计/SSE/现行浏览器核心证据保留，`run-browser-20261021.md`两轮各9项是历史浏览器结果；本批未重跑浏览器或生产代理/OS进程kill，不能据此宣称正式发布就绪。
<!-- end -->

## 1. 当前有效入口

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
最新源码已接有限@7确认后继的实际执行/worker模块/完整PG图与独立蓝图暂停恢复，见 `visual-blueprint-run-20261022.md`。但**公共RunService/Store仍拒绝accept、生产vision仍关闭**，不能手工造队列或仅开AGENT_VISION_V1=true试用，更不是图生下载已就绪。内部测试先手工确认事务，再用正式执行器/真实图，不冒充HTTP确认流程。

VISUAL_PLANNING_RUNTIME现由ReferenceAssetsModule统一提供：只有合法HMAC+deepseek模式+有效route/非空key才装配蓝图模型，fake/stub不外发，原文字方法保留。凭据gateway绑定精确服务器route；历史冻结host/model与当前配置不符时在记账/物理请求前CREDENTIAL_ROUTE_MISMATCH，不把当前key发送给另一个冻结host。当前不是历史凭据版本注册表；不得改旧快照或checkpoint强行恢复，需协调凭据路由或明确重新发起。普通停新准入仍不清历史。

已完成蓝图checkpoint可在新owner/新Nest上下文恢复，receipt/Message不重复；这是故障注入与真实DB租约恢复，不是OS kill/生产多副本验收。下一审批继承/semantic外发/UI下载仍缺，旧试用18对源码21和排空整体升级保护、预算暂缓/旧POST退役不变。未修改实际.env/key/常驻服务；下方为前批历史说明。

本批最终API780/780、编排器214、contracts505、domain1403 passed/5既有条件跳过，静态检查通过；旧cleanup WARN保留。灰度时旧@6和“仅message”的前批@7 worker都须排空整体升级：同样实验@7不等于支持相同动作，不能混领accept或修改历史输入降级补救。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
当前最新内部蓝图切片见 `visual-blueprint-20261022.md`：签名proof可冻结服务器蓝图配置，专用服务走gateway/usage、真实租约/来源/当前许可复核和持久缓存，原设计节点可显示独立蓝图并清旧构建权限。**还没有公共确认/后继worker/完整graph入口或暂停恢复，不能用手工accept Run或开flag试用**；生产vision仍关闭、@7执行器仍只跑message到review。

此服务尚未在module/worker装配；旧两参数ReviewService不会自动得到blueprint配置。后续须装配与冻结provider/host匹配的安全凭据gateway，不能把当前新endpoint的密钥盲配给历史冻结host。blueprintModel缺失/身份变更或当前外发许可撤销会拒绝，不自动回退文字。semantic模型/下一审批继承/UI下载仍待接；21对18试用保护、排空旧worker整体升级、预算暂缓和旧POST退役全部保留。下方continuation/flow结果为前批历史，当前验证见最新报告。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
最新源码边界见 `visual-continuation-20261022.md`：内部已补确认后继proof/原子消费/审计/唯一后继和消费后恢复，但未接公共Run受理或可执行后继handler；**不能通过开flag试用确认，也不可手工往队列造accept Run**。公共accept仍拒绝，worker @7仍只支持单图message到review，默认@6与production vision关闭不变。内部reader只验证数据，不验证当前后继执行租约、不授权模型发送或蓝图批准；其他任务route/prompt冻结、OCR外发复核与独立蓝图/UI仍待接。

本轮完整API753/753、编排器205/205、contracts505/505，静态检查通过；其他本轮结果和中间失败见报告。旧cleanup WARN仍出现，历史浏览器结果不当作本轮重跑。没有修改实际.env/key/进程/迁移；旧试用18对源码21和旧worker排空/整体升级要求全部保留。
<!-- end -->

| 用途 | 实际路由 | 边界 |
|---|---|---|
| 受理消息/蓝图确认/审批 | `POST /api/conversations/:id/runs` | 202 RunSnapshot；cookie + 精确 Origin；确定性 action、receipt、planHash 仍校验 |
| 当前运行 | `GET /api/conversations/:id/runs/latest` | 业务屏障/执行者优先，其次队列头；不是最新创建行 |
| 快照/事件 | `GET /api/runs/:id`、`GET /api/runs/:id/events?after=N` | 事件只订阅；以 seq 续传，不负责执行 |
| 停止/重试 | `POST /api/runs/:id/cancel`、`POST /api/runs/:id/retry` | 真实状态；重试创建新 Run，不绕过基线/审批 |
| 服务端有效配置 | `GET /api/v2/workbench-config` | cookie 租户身份；private/no-store，Vary Cookie/Origin；不返回 allowlist/凭据/内部 URL |
| 会话与历史 | 原有会话创建/列表/详情、`GET /api/conversations/:id/messages` | 保留租户隔离；读历史不会恢复旧执行器 |
| 交付/下载 | `GET /api/conversations/:id/delivery`、制品 download-token/download | 保留会话/job/revision/artifact 的权威绑定和短时 token |
| 已下线 | `POST /api/conversations/:id/messages`、`POST /api/conversations/:id/resume` | 404，无重定向、兼容桥或 flag-off fallback |

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
旧 `state/done` POST SSE 协议不再受支持；前端只使用 Run API 与 GET events。`/api/v2/workbench-config`、本地参考图端点、分析结果GET/PATCH已实现；但分页、归档、fork、图生Run/生成确认仍未接通，不可误当现行能力。旧页面书签可跳到新工作台，不代表旧写API可调用。

## 1.0 私有参考图接入（本批新增，未部署到当前试用进程）

- `POST /api/v2/workspaces/:workspaceId/reference-assets?name=design.png` 收原始二进制图，需cookie、精确Origin、有效Run/Workbench租户准入与 `AGENT_REFERENCE_UPLOADS_V1=true`。默认false，只本地私有存储，不外发、不生成。
- `GET /api/v2/workspaces/:workspaceId/reference-assets/:assetId/image` 验证会话/tenant/workspace后返回无metadata派生WebP，private/no-store/nosniff；原图保留在既有私有storage，不是公开URL或编译素材。
- 新增 `202610210001_reference_assets`，需先expand迁移再部署对应代码；只在新vision测试库验证19迁移，当前试用库仍18条，不能直接开关假装已升级，也不能重跑globalSetup清空试用数据。
- `AGENT_REFERENCE_QUOTA_BYTES` 默认1073741824（参考源+派生总和），并发Tenant锁；格式/解码上限、补偿清理、限制和验证见 `reference-ingestion-20261021.md`。Sharp已锁0.35.5，仅Mac验证原生解码，Windows/Linux未验。
- 这不开放前端附件或Run图生。`AGENT_VISION_V1`与outboundImagesAllowed仍false，预算暂缓；新上传flag不能作为模型外发授权。
<!-- end -->

## 1.1 服务端启用与停新受理

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
### 最新T22外发策略与执行限制（源码已实现，未升级试用进程）

`GET /api/v2/tenant/visual-egress-policy` 用当前Cookie租户读取 `{schemaVersion:1,imageEgressAllowed,coverage:"reference-images-and-derived-structure"}`，private/no-store、Vary Cookie/Origin。本租户成员可读，接口不提供跨租户选择或provider信息。

`PATCH` 同路径只允许本租户tenant_admin + 精确Origin，请求严格 `{imageEgressAllowed:boolean}`；变更和VISUAL_EGRESS_POLICY_CHANGED审计同事务，重复同值不重复记变更。服务也复核DB当前角色；不能传tenantId/flags绕过。此许可覆盖参考图和派生OCR/结构的策略，不等于每次用户发送同意；当前只有像素分析链已执行检查，未来语义发送必须同样接入。PATCH=true**不会启用**vision/工作台图片入口或产生模型调用，普通Run/视觉action仍关闭。

内部分析现在必须有真实Run执行scope/当前owner+fence/有效墙钟lease，无取消或后继/build。首次分析前在RunStep固定模型/prompt/config与图/指令hash，发送及发布再复核；漂移失败，不自动换模型。不是受理时已冻结全部附件/主补图、模型配置实体或用户同意。详情与最终测试见 `visual-egress-20261022.md`。

本批无新迁移；当前源码要求累计21迁移，旧试用库仍按18条对待，不可直接重启或reset/seed升级。管理员界面、实际发送说明、图生Run确认和前端仍未开放，不对实际租户手动开外发。下方T19/18迁移记录是历史批次，不表示当前源码只需20/18条。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
本批T19增加 `GET/PATCH /api/v2/visual-analyses/:id` 私有结果/版本接口（不是发起分析的POST）；内部单图分析已接共享gateway/usage账本、PG缓存租约，详见 `visual-analysis-20261021.md`。分析要求Tenant持久化imageEgressAllowed=true，新增字段默认false；管理员授权界面/发送说明和图生Run/前端随T22实现，当前不要手动启用实际租户外发。

新代码部署前须先expand **202610210002_visual_analysis**（20条迁移），因为Tenant查询涉及新列；不能只重启使用新代码却仍停在18/19条schema。当前试用环境未迁移、未重启；不可用reset/seed升级。预算继续暂缓，vision/outbound UI flag仍false，model配置仅服务实例冻结，不冒充Run受理时已冻结完整模型配置。

现有确认删除工作区对非终态Run返回409 WORKSPACE_ACTIVE_RUNS，对RUNNING/VALIDATING build返回409 WORKSPACE_ACTIVE_BUILDS；先通过既有停止流程结束执行再删，不能直接删活跃运行事实。保留未领取legacy QUEUED job的既有确认删除；终态Run在Conversation之前清理，调用账本沿既有FK保留。此修复未对当前试用工程执行删除，也不等于checkpoint/预算保留策略已完成。
<!-- end -->

默认关闭。启用现行文本工作台需在获准的服务端环境配置下列值并让 API 加载配置（不要填租户名称，不要上传实际密钥到文档）：

```dotenv
AGENT_RUNS_V2=true
AGENT_WORKBENCH_V2=true
AGENT_FEATURE_TENANT_ALLOWLIST=<tenant-uuid-1>,<tenant-uuid-2>
```

- flags 只接受精确 `true`/`false`；未设置等于关闭。allowlist 精确匹配、逗号分隔，空值不开放任何租户，不支持 `*` 通配。
- workbench 依赖 runs。未知布尔值、workbench 开而 runs 关，或提前开启尚未接通的 usage/prompt/vision/regional/native flags，会让有效执行配置关闭，返回 `admission.reason=invalid_configuration`；API 的历史查询仍可使用，不通过启动第二套旧执行器兜底。
- 上述尚未接通 flags 保持 false；`budgetGuard=false`，本轮不启用预算限制。图片外发始终 false，即使填写视觉模型名也不能启用图片链路。真实工作台隐藏未启用的用量入口和图片上传，并明确不会发送图片；设计预览仍可显示原图稿状态，但不发业务请求。
- 准入在存储事务拿到会话锁后、任何新消息/Run 写入前检查。不能通过省略配置参数、请求体伪造 tenant/flags/configSnapshot 或浏览器 localStorage 绕过。
- 关闭新受理：将 RUNS/WORKBENCH 都置 false，或从 allowlist 移除目标租户；按部署方式加载到每一个 API 副本。当前实现是进程环境配置，不是跨副本原子远程开关；不能声称只改一个副本就全局停机。本批没有自动改实际 `.env` 或重启服务。
- 关闭后新消息、蓝图批准/修改和新 retry 返回 403；已接受请求的同幂等键重放仍返回原 Run，原 configSnapshot 不变。查询、事件、下载、cancel 和真实原生审批 cancel 不被开关拦住，已受理执行继续 drain。
- 新 Run 事务冻结当前有效 flags/schemaVersion/planVersion；原生 cancel 后继继承原 Run 配置。worker 不因当前开关关闭就丢弃已受理任务，但在复用 step cache 之前拒绝不认识的冻结协议版本（RUN_CONFIG_VERSION_MISMATCH）。旧 null configSnapshot 不改写，仍按既有协议恢复。
- 本轮仅冻结已支持的功能准入与执行协议，不宣称尚未接线的统一模型网关、模型/提示词/价格版本已完整冻结。切换这些生产模型配置仍须先排空，不能中途换执行者语义。
- 前端配置失败时默认只读，历史/已受理任务照常读取；切换工程/会话身份会重新读配置，忽略旧请求迟到响应。配置不能读取时不自动恢复旧 POST。

## 2. 进程、配置与升级前置

- API：认证、受理、订阅、查询；不在消息 HTTP 内运行图。
- agent-worker：独立 application context，必须显式 `AGENT_TENANT_ID`；多租户当前需分别启动对应实例。
- build-worker：现有构建串行/校验/签名/修订提交机制。三者共用匹配的 DB/schema、签名权限配置和存储配置。
- Web/API/两个 worker 都需加载同一批兼容代码；修改源文件不保证已启动的常驻进程自动刷新。不要把新队列与旧 worker 混用。
- `AGENT_ALLOWED_ORIGINS` 配置真实 Web origin；不能通过放宽租户身份或签名保护解决 403。
- migration `202610200007_build_run_control` 必须先在目标环境经授权部署。本批没有新增 migration，也未操作业务数据库。
- 从 run-plan@4 升级到 @5 时，必须先保留旧版 worker 排空旧协议 Run/审批/构建再整体切换。新 worker 不支持旧冻结协议，会在 step cache 前明确拒绝；不能通过清空 configSnapshot 或删 checkpoint/fence 强行恢复。

升级前停止旧客户端的新生成，排空旧 HTTP 回合，逐个处理旧版本**没有 runId** 的待确认/待审批 checkpoint。此类历史回合没有自动导入 Run 的实现：不能猜 receipt、直接改成批准或把 checkpoint/fence 删掉。须在旧版本的受控升级窗口完成/取消后再升级；无法处置时暂停部署并由维护者决定迁移方案。旧消息、工作流类型和已交付工程包无需删除。

## 3. 只读诊断

先确认连接的是获准检查的数据库；以下仅作 SELECT 示例，不包含需求正文、图片、凭据或签名。

```sql
SELECT "id", "conversationId", "status", "lastSeq", "buildJobId",
       "leaseOwner", "leaseExpiresAt", "fence", "failureCode"
FROM "AgentRun"
WHERE "tenantId" = '<tenant-id>'
  AND "status" NOT IN ('SUCCEEDED', 'FAILED', 'CANCELLED')
ORDER BY "createdAt", "id";

SELECT "runId", "seq", "type", "createdAt"
FROM "AgentRunEvent"
WHERE "tenantId" = '<tenant-id>' AND "runId" = '<run-id>'
ORDER BY "seq";

SELECT "id", "agentRunId", "status", "cancelRequestedAt", "terminalReason"
FROM "BuildJob"
WHERE "tenantId" = '<tenant-id>' AND "id" = '<build-job-id>';

SELECT "conversationId", "state"
FROM "ConversationTurnFence"
WHERE "conversationId" = '<conversation-id>';
```

Run raw-SQL 租约与 ORM BuildJob 租约的 timestamp 写法不同，诊断时确认 DB session 时区；不要用错误口径的时间 SQL 强行“修复过期”。新建本批隔离库的 18 个 Prisma 迁移均已验证可部署；LangGraph 检查点表仍由运行时 saver.setup 幂等建立，不是 Prisma migration。

## 4. 队列、失败与停止

- QUEUED 不动：先看同会话是否有 RUNNING/BUILDING/CANCEL_REQUESTED/WAITING_INPUT/WAITING_APPROVAL、前序链是否终态，再看对应租户 agent-worker 是否存活、lease、turn fence、步骤错误和 build-worker。不要跳过审批屏障。
- BASE_REVISION_CONFLICT：旧任务未在新版本上执行；让用户核对当前版本重新规划，不能强写 baseRevision 或盲目 retry。
- ADMITTED/QUARANTINED fence：会话可能仍有旧计算，租约到期不等于 provider 已停止。不得自动删除；PENDING 也只由已有安全恢复逻辑处理。需要人工确认执行者/外部请求状态后再决定恢复方案。
- BUILDING：按 AgentRun.buildJobId/BuildJob.agentRunId 对照；禁止领取一个工作区最新 job 冒充该 Run 的交付。恢复复用原 job，不重新生成。
- cancel：202/200 和 CANCEL_REQUESTED 不等于已停止；等待实际 CANCELLED 或构建真实结果。原生审批要由确定性 cancel 后继消费 interrupt；不能只改数据库状态。
- UNKNOWN 模型请求：当前统一 gateway/usage 还未完整接线，不能把缺少账本等同零费用，也不能为“恢复”无界重试。记录脱敏 invocation/run 关联，由维护者确认重试；不输出 API key、原图、完整请求或模型隐藏思维。

## 4.1 审计诊断

RUN_ACTION_ACCEPTED 仅表示受理；蓝图记录精确 hash/版本。PLAN_CONFIRMED/PLAN_REVISED/PLAN_CANCELLED 的 phase=approval_consumed，表示真实审批节点已消费决定，不代表后续改稿、ChangeRequest 关闭或工程交付已完成。BUILD_START 的 phase=enqueued，表示实际 job 入队；BUILD_RESULT 的 phase=completed，记录实际提交终态、取消原因和成功修订 ID。查询时必须按 tenantId 加 run/job 关联，不读取工作区最新 job 猜当前结果。

决定日志与 approval-decision memo 同事务，构建日志与状态提交同事务；审计存储失败会回滚对应提交。构建 actorUserId 表示原 Run 请求人（actorRole=requester），取消发起人见既有 RUN_CANCEL_*。不补造旧无 Run 作业历史，不记录正文/私有路径/凭据。稳定审计 id 只供内部幂等；日志保留策略后续须与 Run/memo 一起设计，不能只删除日志后期待重放自动重建历史。

自动原生取消后继的 actor 沿用真实 RUN_CANCEL_REQUESTED 发起人，不是最初的工程请求人。若在途停止审计/actor 缺失，worker 明确报 CANCEL_REQUEST_ACTOR_MISSING 并保留等待屏障；让获准用户在该待审批 Run 上重新显式取消，或由维护者按升级流程处置，不能猜身份、伪造日志或删 checkpoint。保留策略不得先清理仍被在途取消依赖的审计。

## 4.2 SSE 订阅诊断

- 每连接窗口默认 30 秒、poll 1 秒、心跳 15 秒；write 背压后最长等 drain 5 秒，应用层缓冲加单帧最多 65,536 字节。慢连接关闭后从已收到的 seq 重连，不会重跑 Run。
- req.aborted/res.close/res.error/deadline 都释放订阅定时器/监听器；正常终态用 end 排空最后事件。单个已发出的 Prisma 查询无法物理取消，只会丢弃迟到结果，不能把窗口超时误认成 SQL 已终止。
- 首页与持续订阅复核会话撤销、到期/空闲和租户/角色/改密限制；心跳/流内复核不刷新 lastUsedAt，普通 HTTP/重连依旧沿用原滑动规则。已写入网络的字节不能撤回；不声称零时间全局撤销。
- 初始失败返回安全 400/401/404/500，SSE 开始后只结束，不混入私有 JSON 错误；cookie 流 private/no-store/Vary。前端快照鉴权失败停止重连，退出释放 reader，异常大帧明确失败；连续暂时故障按 1/2/4/8/15 秒名义退避、±20% 抖动且最终不超过 15 秒，正常结束/新 seq 重置，stop 可取消等待。
- 已验 100 个真实短订阅断开后 DB 可用、Run 可继续；不是代理/浏览器/多副本长时间压测。事件保留及过期 410 + snapshotUrl、连接配额未实施，不能删除旧事件后假装客户端可自动补齐。

## 5. 停机和回退

1. 维护者在获准窗口通过 §1.1 的 flags/allowlist 阻断**新的 Run 受理**，让所有 API 副本加载一致配置；保留查询/事件/真实取消。本轮没有自动改生产配置或网关。
2. 排空已受理任务；等待/审批由用户显式继续或取消，无法 drain 的项列清单。不要为了停机自动 approve。
3. build-worker 与 agent-worker 保留至构建及取消达到安全边界，再正常 SIGTERM；异常退出由租约/fence 恢复，但 SIGKILL 场景尚未做实际验收。
4. 只有在没有需要新协议继续的活跃 Run、构建或 native interrupt 时，才允许维护者选择匹配的 Web/API/worker 整体代码回退。不得仅复活旧 POST 与新 worker 同时执行。
5. additive 数据表保留，不能 DROP TABLE 回退；历史制品继续只读查询/下载。恢复备份是独立授权操作。

## 6. 尚缺的发布门槛

- flags/allowlist/配置快照已接线，仍须生产配置一致性、升级与回退实测；完整模型/提示词/价格配置冻结随统一 gateway 后续实现。预算限制按用户要求继续暂缓。
- 新 Run 审批/构建审计和 checkpoint gap 恢复已有真实 Run/数据库回归；真实 OS 进程故障与生产审计保留策略仍未验收，不能把注入故障测试当作发布演练。
- SSE 背压/权限失效/限时与资源清理已有真实 HTTP/Writable 回归；浏览器已验证首连接故障重连、刷新/seq 补齐与无重复消息，反向代理、多副本/长期 soak、事件保留与过期 410 仍待验收。
- 真正独立进程的 kill/restart、停新入队/排空/整体回退演练。
- Playwright 全部现存 specs/helpers 已迁移现行 Run/UI，隔离启动五进程（两租户各一个 agent-worker），三类工程核心流程和实际包已验。A 的测试装配只替换模型，B 使用生产 fake-model 入口，不能当真实模型/KF 验收。运行命令、隔离与清理见 run-browser 报告；同库禁止并发重置。
- 扩大 API 回归先后出现偶发 403、HTTP Parse Error，后者最新整批仍失败；未定位根因，不能用独立重跑覆盖失败记录。
- 无 runId 旧 checkpoint 的升级处置记录与三类工程在现行 Run 下的完整验收矩阵。
- 真实模型成本/缓存效果、图片理解与 KF 3.6 原生视觉/交互验收均未在本批验证。
<!-- end -->
