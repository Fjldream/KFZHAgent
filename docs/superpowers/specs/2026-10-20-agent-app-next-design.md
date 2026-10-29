# Agent App 下一阶段产品与技术设计

<!-- modified by jinlong.feng at 2026-10-28 Agent工作台迭代 -->
### 2026-10-28 识别摘要与批量审核

按用户同意的方案，常规文字/布局/普通按钮等有匹配组件的区域可以一次批量保留；表格、图表、表单及不支持/映射缺失的区域单独分类展示。不支持的内容没有默认省略或自动替代，用户必须明确选择。批量操作只填未调整的选择，自动生成描述实际操作的有界确认说明；不要求逐项写重复理由，不把supported_unverified改为verified。手工选择/说明不被批量操作覆盖，撤销只清除仍与原批量值一致的选择。

主界面只显示摘要和少量例外，仍可展开所有区域逐项处理、编辑识别。原始技术诊断、识别备注默认折叠；冻结数据快照值和明确的执行交互直接显示在摘要中。新Run/receipt/analysisId/specHash清除旧选择，忙碌、策略禁止、图片失败及编辑中均保持原提交屏障。每个区域仍按原acceptedDifferences合同记录，原签名/actor/tenant/基线校验与独立蓝图确认不变；本次不改变模型冻结身份，不实现静态表格/图表替代能力，不自动批准后续蓝图。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-28 Agent工作台迭代 -->
### 2026-10-28 用户指定的图片发送默认值

用户明确要求截图中“我同意本轮外发”默认允许。当前租户及服务端视觉配置允许时，参考图上传成功后默认勾选本轮发送同意，用户仍可取消；仅在用户点击发送时提交已有 noticeVersion/accepted 合同，不自动启动模型。上传中、失败和迟到的其他会话上传不得赋予当前附件同意；取消勾选继续阻断带图提交，不静默降级。替换并成功上传新图片重新应用默认值；刷新/切换仍不持久化附件或旧同意。租户图片外发策略、管理员权限、服务端准入/冻结/审核和蓝图确认不变。本条按用户最新要求替代下方历史“默认不勾”的前端默认值，不修改旧 Run 或回执。
<!-- end -->

日期：2026-10-20。性质：实施基线，不代表功能已经完成。范围：`agent-app`；不修改 KingFusion 其他服务的现有行为。

<!-- modified by jinlong.feng at 2026-10-27 Agent工作台迭代 -->
### 2026-10-27 视觉蓝图观察文字与明确来源归属补充

已实现blueprint@10/repair@4，semantic仍@21/repair@10。视觉通道中的observe.expectedTexts必须精确来自该蓝图page/region明确归属的已审核视觉区域text：允许原单项或同一视觉来源全部非空项按原顺序用单个空格连接（保留原成功“2 项”“15,000 kWh”）；禁止跨视觉来源拼接。已声明工作区字段绑定时，使用该区域服务器冻结的dataSnapshot.value而非旧OCR，不借其他区域、子区域或非截图content/visualIntent/sampleData，不自动归一化或补文案。无来源的视觉观察拒绝；纯布局空文容器不得把排列说明当作阅读文字，可以由模型在未批准提案中显式保留布局说明于visualIntent/acceptanceScenarios并改写错误观察步骤。所有非omit来源及合法阅读要求保持，不由服务器删步骤或换能力。

诊断独立复用原pages、单步journey schema及有界身份；明确且无歧义的局部来源可在别处遗漏来源或其他步骤schema失败时继续诊断，不借重复、未知或omit来源。最多4组观察错误、每组最多12个原expectedTexts索引和20个可读来源ID，原值仅在failedDraft中；与schema/来源合并总数仍≤8，保留schema首错及来源位置，不扩大96KiB请求、32KiB草稿和一次修复上限。新提示与观察策略进入冻结hash。成功模型输出、完成缓存、蓝图审批准备及复读均执行同一观察检查；不更改文本蓝图、原生观察/绑定成功规则，不给旧Run补签。须新审核、独立确认后再做有界真实验收。

本轮完整真实模型4调用/无规划夹具，38项新审核与41节点工程成功，KF独立API往返相等；用户随后报告非法页名及严重显示偏差。原生安全名称、CSS真实物理字段、背景归属及流式顺序已修，但原包保留不回改。原生显示、逐控件CSS与只读文字/尺寸/画布/图表的补充基线见2026-10-27-agent-native-visual-fidelity.md；完整模型/回归/证据与下一模型步骤见agent-app/docs/visual-blueprint-observations-20261027.md。不得把编译/导入或单控件探针当作完整开发/运行及1:1验收。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-27 Agent工作台迭代 -->
### 2026-10-27 蓝图字段与视觉来源联合反馈补充

已实现blueprint@9/repair@3，semantic仍@21/repair@10。完整真实识图得到48个区域，但蓝图初稿同时有重复expectedTexts和遗漏根app来源；@8只反馈schema首类错误，一次修复后才看见来源缺失。仅在蓝图pages子schema完整合法、已审核视觉事实校验通过时，复用原resolveVisualBlueprintSources对pages做独立来源诊断；其他旅程字段失败不再遮住可证明的缺失/重复/未知/omit来源问题。共享函数输入类型缩到真实使用的pages，不构造补齐假蓝图、猜归属、去重验收文字或改审核。

保留首个schema错误，来源诊断最多一项并为其保留一个反馈位置，总数仍≤8；合法蓝图仍经过完整原schema、候选和来源关卡才能返回成功。字段反馈/来源检查版本进入蓝图冻结hash，提示明确根容器及所有非omit来源都要分配、一次修复同时处理各类错误。原输入/草稿/一次额度不增加，旧Run不重签，整体升级后必须新审核/独立确认。工程已真实编译、KF独立导入和原生往返通过，不替代完整真实流程、运行与1:1验收。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-27 Agent工作台迭代 -->
### 2026-10-27 节点必填元数据与字段定位补充

已实现visual-semantic@21 / repair@10；此阶段真实工程与原生往返成功，蓝图随后升@9/repair@3。上一阶段真实回调已修正设备绑定，但12个richtext节点省略styleRole，原错误只保留首个深树路径，无法对应扁平nodeId。新增节点字段统一诊断：复用原control/layout/repeater/module字段schema，忽略只存在于成功树的children/template/slots，以有界、已规范化的扁平草稿检查原元数据。按字段/错误码/缺失与否聚合，给出明确nodeIds和真实count，不回显原值或不可信错误消息；单个错误可带nodeId，最多4组及1项汇总，总反馈仍≤12。

必填字段说明由同一原schema派生并进入视觉system及冻结指纹，明确control.styleRole必填且不能从父布局继承；已有角色引用按原约束验证，不由服务器分配默认角色。诊断不采用schema默认值、不改草稿、不合成树、不签名/构建；成功仍由原全部严格关卡判定。压缩视觉专用重复说明以保留128000bytes输入上限及全部批准JSON事实；保留已批准内层布局的知识。旧Run不重签，新审核后仍至多一次修复。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-27 Agent工作台迭代 -->
### 2026-10-27 精确绑定反馈与合法内层组合补充（@20阶段）

本历史阶段已实现visual-semantic@20 / repair@9，蓝图当时仍@8/repair@2。绑定错误反馈提供实际binding.nodeId、经过schema校验的节点kind/layout/capability、批准能力和直接外层类型。可用内层row/column仅取自该节点所属蓝图区域的真实候选，不借其他区域；对有直接外壳类型的区域，初次及修复请求均展示允许的内层组合，不依赖排列建议或不可信草稿。建议inner仅在实际布局被当前区域候选允许时给出，不能根据不可信草稿扩大权限。

通用绑定首错以同code/regionId的精确诊断补充，仍保持首错顺序、去重及最多12条。模型须让被绑定节点自身发出批准能力，父row不能替代column子节点的绑定；需要组合时显式保留外壳ID、来源、引用和外壳样式，新增内层不重复样式。服务器不自动改布局/包节点/换审核或修复业务值；原graph/delta/native成功规则、限额及一次额度保持。新规则/字段/候选派生方式进入冻结hash，旧Run不重签，新审核后有界联调，未实际交付/KF运行前不称成功。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
### 2026-10-26 可寻址失败草稿与局部结构修复补充（@19阶段历史）

本切片已实现visual-semantic@19 / repair@8，蓝图仍@8/repair@2。单独的失败草稿读取合同仅允许已声明layout.childNodeIds=[]这一明确结构缺陷；其他字段名、必需字段、类型、节点/引用数量上限与原graph外壳保持严格，节点身份必须唯一，compact≤64KiB、深度≤48。既有role身份/权限仍由delta资格检查；身份歧义、未知字段或更广泛的坏外壳仍不进入delta。成功graph及装配/native合同不放宽。

独立覆盖/可达/分组与能力/样式诊断复用同一失败草稿读取，在空布局存在时也反馈空节点列表、真实分组错误及批准能力不符。读取和诊断不补边、不删节点、不改groupWith，不装配假树或产生批准。模型必须显式修正/删除节点及全部受影响引用；delta合并后仍过原严格graph+语义/native/来源等全部关卡，未触及值原样保留。16操作/128变更等上限不扩大，可用既有upsert-nodes数组一次显式替换多个相关节点。

视觉提示明确每个布局1..24个孩子，装饰色块不能作为空布局，优先用批准样式表达；groupWith优先[]并保留原合法有向分组支持。失败草稿合同、资格与独立诊断版本进入冻结hash；旧Run不重签，须排空整体升级、新审核/独立确认，仍至多一次修复。本轮真实delta已接回下半页，但设备绑定仍保留column而批准要求row，尚无合格能源包；下一步优先给出精确binding.nodeId/当前布局/批准能力与合法组合反馈。实施、测试、原件及下一任务见agent-app/docs/visual-addressable-graph-20261026.md，不凭离线副本宣称包或KF成功。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
### 2026-10-26 视觉静态数据与拒绝值反馈补充（@18阶段历史）

本切片已实现visual-semantic@18 / repair@7，蓝图保持@8 / repair@2。视觉专用提示按批准的观察/交互生成；静态内容直接显示，不要求创建无引用的mockData/localState/actions/scripts，可用空数组，但必须保留真实repeater、交互、数据需求及其依赖。文本生成提示与数据schema不变，服务器不自动删数据、改值或放宽technical-placeholder校验。

失败诊断复用原MockDataSetSchema，最多反馈4个技术占位值错误，提供精确plan.mockData索引路径、规则和原值规范hash；完整原值仍在未改写的failedDraft。诊断不再重复回显任意字符串/秘密/注入内容，不将其变成执行指令。总issues仍最多12、草稿64KiB、模型输入128000bytes、delta与一次额度等原限制保持。新规则/反馈版本进入冻结hash，旧Run不重签，须新审核/确认。真实两稿均不再创建无用模拟数据，但空布局触发完整重写、原有groupWith循环与devices能力错误仍阻止交付；下一步审查可寻址失败草稿合同及联合诊断，不能放宽成功schema或自动删边。实施、测试、原件与下一任务见agent-app/docs/visual-static-data-20261026.md；未得到实际包及KF运行证据前不宣称成功。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
### 2026-10-26 有界工程增量修复补充（@17阶段历史）

语义初稿仍为graph/v1；当前已实现visual-semantic@17 / repair@6。结构外壳可解析、节点/样式身份唯一且草稿不超过64KiB时，一次修复输出kf-visual-semantic-graph-delta/v1，绑定服务端提供的baseDraftHash。操作为显式节点增换/删除、按nodeId设置允许字段、绑定列表替换、按role的样式增换/字段设置及指定plan字段替换；没有JSON路径、文件路径或代码执行权限。声明式scripts仍受原合同与原生编译关卡限制。最多16个操作、合计128个实体/字段变更，delta最多64KiB、合并图最多128KiB且原1000节点/12层/负载深度48限制保持。

未触及字段与节点逐值保持；既有样式只允许替换独立诊断标出的role，其他样式不可随修复重写。新样式可显式添加；plan字段按服务端scope限制，schema/blueprintHash/candidateBundleHash始终不可设置。未知字段、错误base hash、重复/冲突操作、无效删除、超限和无实际变化拒绝。合并结果仍是未批准提案，必须重新经过全部原严格校验；服务器不猜边、不删除未知字段、不生成缺失业务内容。坏JSON、坏外壳或身份重复时沿用原一次完整graph重写，不允许模型自行切换格式。

在孤儿存在时也独立复用真实绑定能力与原生样式编译规则，给出有界反馈；诊断不构造修好的树、不签名/发布。新的delta合同、scope规则和限额已进入冻结hash，旧Run不能补配置重签；一次额度与所有历史repair账本、取消/actor/许可/base/lease/fence保护保持。蓝图@8/repair@2不变，生产vision仍关闭；实施、测试、真实负例及下一任务见agent-app/docs/visual-semantic-delta-20261026.md。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
### 2026-10-26 工程完整性与有界联合诊断补充（@16阶段历史）

当前visual-semantic@16 / repair@5，blueprint仍@8 / repair@2；graph/v1传输、内部标准树、签名/缓存/原生构建不变。初次请求与一次修复都提供服务端计算的coverageTarget.requiredRegionCount；必需区域及归属仍以完整requiredVisualBindings为准。目标是所有未omit区域均有真实绑定、每个声明从所属页面/浮层根可达、分组只引用兄弟且无自引/重复/有向环；计数不是模型自报证明，也不替代native来源/能力/观察/交互检查。

只在严格路径拒绝后，附加诊断缺失区域、未知/omit绑定、绑定节点缺失、不可达节点及独立分组错误；保留首个严格错误，合并去重后最多12项。已知缺失regionIds最多100，其他节点/无效regionIds列表最多20且保留真实count；不补节点、不接边、不丢孤儿、不把null groupWith改为[]。平铺诊断与标准树共用同一个兄弟分组校验函数。诊断可为空但不能据此生成成功结果；成功只能来自原严格装配和全量语义/native路径。

完整性规则、反馈字段及版本进入冻结hash；输入128000bytes、草稿64KiB和一次修复等限额不增加。文本生成路径、缓存损坏拒绝及取消/actor/权限/base/lease/fence保护保持；整体排空旧视觉任务/worker、新建审核，不给旧Run重签。测试新增“保存公开事实→新审核/新独立蓝图确认→工程阶段真实调用”模式，明确标记识图/蓝图为本地夹具，真实工程最多2请求；不恢复历史receipt，不冒充新完整端到端识图成功。实际结果及下一任务见agent-app/docs/visual-semantic-completeness-20261026.md；生产vision仍关闭。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
### 2026-10-26 视觉布局提案与组合约束补充（@15阶段历史，当前版本见上）

当前visual-semantic@15 / repair@4，blueprint仍@8 / repair@2，graph/v1和标准内部树不变。新视觉候选记录每个region自己的score/admission，不能借用其他region的最高分或仅因同role而扩入该region候选。明确容器的直接子框在单轴分带、另轴连通且均在父框内时，可在新审核提案中建议row/column；单子节点、重叠、双轴网格、越界等情况不猜方向。既有候选/属性/交互/证据准入保持，证据优先，然后方向建议、本区域评分和稳定id排序；建议理由对用户可见，不构成原生还原效果验证。旧签名review及其mappings不重算、不静默改写；新的显式revision才产生新提案与receipt。

工程请求区分已批准绑定外层directLayoutKinds和内部排列建议；与外层方向不同的明确子框建议附带当前蓝图区域实际允许的inner类型。修复请求额外保留parentRegionId/referenceBox及有界的草稿绑定节点观察，不改变requiredCapabilityId或原草稿。纵向内容已批准layout.2时，可用row外壳包单个column内容，保留两层来源且styleRole只用于外壳；只有实际候选允许才可使用内部布局。模型必须重新完整生成，服务器不自动包节点、接孤儿或删分组边。

新组合规则/obligation版本进入冻结prompt/hash；128000bytes输入、64KiB草稿和一次修复等额度不增加。旧Run不得补配置重签，整体排空升级、新建审核要求保持。模糊双轴设备卡片仍可能沿原候选排序，需要审核与显式容器组合，不能宣称方向建议覆盖全部布局。真实验收仍失败，具体原件、复现和下一任务见agent-app/docs/visual-layout-obligations-20261026.md；production vision继续关闭。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
### 2026-10-26 视觉工程模型传输补充（@14阶段历史，当前版本见上）

视觉模型传输使用 `kf-visual-semantic-graph/v1`：plan仅含元数据，pages/overlays以rootNodeId引用，所有节点在nodes独立声明；layout与模块槽位以childNodeIds引用，repeater以templateNodeId引用。禁止模型返回内嵌root/children/template树。schema、blueprintHash及candidateBundleHash由服务器从同一批准上下文确定，模型不能填写或覆盖。

服务器在装配前检查严格字段名、节点与引用存在性、唯一归属、循环、孤立节点和原1000节点/12层上限。节点载荷保留原值，继续交给既有别名规范化、标准语义合同、候选/来源/观察/交互和native provenance/尺寸校验；不能默默删除节点、猜元数据或扩大能力。标准内部结果、缓存、签名与构建仍为kf-visual-semantic-plan/v1及其原语义树。旧树模型响应不作为新通道回退；图格式缓存也不能重新解释为已提交标准结果。

语义冻结版本为visual-semantic@14、repair@3，包含图合同指纹和有界UTF-16语法位置诊断；蓝图保持@8/repair@2。原一次修复、64KiB草稿、128000byte输入及现有输出上限不增加。须排空旧视觉任务/worker、整体升级并新建确认；同run-plan@7不表示可混部。生产vision默认关闭、预算与业务源暂缓的边界保持。实施及真实验收结果另见本切片报告，不因传输改为平铺就宣称能源工程或KF运行已经成功。
<!-- end -->

## 1. 目标与结论

把当前“对话生成工程”推进为“可计量、可恢复、可复用组件、可验证交付的工程工作台”。不是重写现有工程编译器，也不是接入一个能任意修改本机文件的通用 agent。

三个直接目标：

1. 能解释一次成功交付花了多少 token、钱和模型调用；减少重复上下文及无界修复，而不是只追求缓存命中率。
2. 一个工作区中可以管理多次对话；切换、刷新和断线不会丢失后台任务；显示真实执行步骤、简短决策摘要、制品和错误。
3. 用户上传参考 UI 图，系统先理解结构，再选择现有 KF 控件，确定性编译工程；支持后续局部修改，并明确“可以生成”“已在原生环境验证”的差异。

## 2. 代码审视：事实、推断、缺口

下表依据当前工作目录源文件，不等于线上运行结果；工作目录有大量既有未提交修改。没有获得生产 token 账单，没有在本轮执行完整测试或真实 KF 验收。

| 领域 | 当前事实与代码入口（均相对仓库根） | 产品缺口及优先级 |
|---|---|---|
| 模型调用 | `agent-app/apps/api/src/conversations/deepseek-model.ts` 的 `chatJson` 主要发送 system + user 文本，未形成调用级 usage 账本 | P0：无法证明缓存问题原因，缺少成本/重试观测 |
| 提示词 | 同文件大 SYSTEM_PROMPT 被多类任务使用；creative 有独立 prompt；部分修复把错误放在前面 | P0：任务提示词过重、稳定前缀复用不足；需要实测，不保证命中率 |
| 重试 | 模型适配器内有 JSON/schema/journey 修复；`nodes/solution-implementation-plan.ts` 外层也会修复 | P0：一次用户操作的实际模型调用数不直观；嵌套修复需要统一计数 |
| 超时 | `chatJson` 在收到 headers 后清理 timer，再读取 body | P0：慢 body 不受同一个完整请求 deadline 保护 |
| 对话 | Prisma 已有 Conversation/Message；API 已能按 workspace 列会话 | P1：前端通常选第一条；没有完整多会话管理和分页 |
| 执行 | `conversation.controller.ts` POST 消息 SSE 与执行绑定；断开会 dispose 图 | P0：刷新/切换/断线与任务生命周期耦合 |
| 进度 | 后端输出节点进度白名单；前端主要显示 phaseHint；部分 creative 阶段缺少映射 | P1：缺少可恢复的运行时间线，不能把完成事件伪装成开始事件 |
| 审批 | 已有 blueprint confirmation 快路、resume API、签名计划和审批状态 | 必须复用；“所有确认都先调分类模型”不是事实 |
| 生成主线 | `workspace.service.ts` 新建 mode=new 已选择 creative-v2；上传工程保留 legacy | 不是从零实现 creative；不得把历史 schema 默认值当成当前新建策略 |
| 控件范围 | creative 有语义计划、能力检索、布局/交互编译；不少 adapter 的 runtime 状态仍未验证 | P1：检索应区分支持范围与证据等级；旧 module-v1 的五种稳定模块不是 creative 能力上限 |
| 图片 | assets API 已有上传、sniff/归属验证；模型目录主要只有名称、MIME 等元数据 | P1：上传资源不等于模型看到了像素；参考图与要打包的素材没有清晰区分 |
| 编辑 | 2026-08-17 creative build 计划侧重首次构建 | P1：局部修改需要语义 ID、基线、差异校验，不能每次整页重生成 |
| 预览 | creative-v2 明确关闭旧 preview，旧计划冻结 preview work | 属于历史产品边界，不是偶发 bug；新设计仅以可选、带证据的原生预览扩展它 |
| 并发交付 | build-jobs 已有 workspace lease、完成时 stale-base 检测和原子制品/修订落库 | 必须保留，不能再造一套互不协调的锁 |
| 历史版本 | Web RevisionList 点击的父级处理基本无实际行为；delivery 有严密绑定 | P1：应支持只读历史证据/下载；不得用“工作区最新制品”替代当前对话制品 |
| 测试 | E2E 已有隔离数据库删除防护；部分 integration 仍可能采用默认测试连接 | P0：全量测试之前统一检查数据库，防止 TRUNCATE 波及开发数据 |

进一步缺陷：缺少运行级取消/重试语义、跨会话冲突提示、资产保留策略、能力版本绑定、视觉与交互质量闭环、低成本模型回归集、可解释的交付状态。先修这些基础能力，再增加表面“智能模式”。

## 3. 全局约束（每份计划均适用）

- 只规划并修改 `agent-app` 及本次配套文档；不修改其他 KingFusion 服务。
- 保留 legacy、module-v1、creative-v2；不自动迁移已有工作区的 generationWorkflow。
<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
- 维护者已确认可删除不再需要的旧 HTTP 接口：不再为旧 POST messages/resume 实现兼容桥。生成、确认和审批只经持久化 Run；保留在用的会话/消息/交付查询、历史数据及三种工程工作流。这不授权删库或删除历史制品。
<!-- end -->
- 保留租户鉴权、审批、签名计划、制品绑定、workspace 构建串行与 stale-base 拒绝。
- 参考图、OCR、用户文本和模型输出均为不可信数据，不拥有执行权限。
- UI 展示执行事件与可公开决策摘要，不持久化或展示模型原始隐藏思维链。
- 不承诺固定缓存命中率、降本比例或像素级还原率；必须附测试样本和实际测量。
- 新功能默认 feature flag 关闭；先 expand 数据迁移，后灰度启用；本期不做破坏性 contract 迁移。
- 沿用 NestJS、Vue 3、TypeScript、Zod、Prisma/PostgreSQL、LangGraph、Vitest、Playwright；本期不引入 Redis、向量数据库或新前端框架。
- 遵守根 AGENTS.md：压缩代码先格式化；代码改动按实际执行日期加统一功能名“Agent工作台迭代”的前后标注；保留原有压缩标识符。
- 不覆盖、不重置、不自动提交已有未提交修改；补丁保留原目录，只包含本任务所有新增和修改文件。

JSON 等禁止注释的格式不插入非法注释：在相邻变更清单记录文件、功能名、日期和定位；如验收要求格式内标注，先向维护者确认，不能生成无效 JSON。新增 SQL/Prisma/Vue 用各自合法注释语法保留同样标记文字。

## 4. 产品范围与默认决策

### 4.1 本期交付

- 模型请求 usage/延迟/失败/修复账本、提示词版本、上下文预算、稳定前缀；不默认变更现有模型名。
- 工作区内会话列表、新建、改名、归档、分页、未读/运行状态、深链接。
- 持久 AgentRun、事件重放、断线恢复、停止、排队、显式重试；澄清和审批是暂停，不是失败。
- 三个意图明确的入口：讨论（不构建）、规划（停在方案确认）、生成/修改（依审批进入编译构建）。各任务模型由服务器白名单配置，本期不额外增加用户模型选择器，不允许浏览器传任意 endpoint/model。
- 参考图上传、区域识别、控件匹配、差异说明、用户确认、生成；参考图默认不放入交付工程。
- 局部修改、历史修订只读、从历史修订创建新对话；不实现无条件强制覆盖当前工程。
- 静态验证、能力证据目录、可选真实 KF 截图/交互验证、评测集、发布和交接。

### 4.2 明确不做

- 不逐像素复刻 Codex，不声称实现其内部机制；借鉴其会话组织和任务反馈。
- 不增加任意 shell、浏览器公网抓取或自动生产部署能力。
- 不把整张参考图作为背景图片冒充控件还原；除非用户明确选择图片展示组件。
- 不自动扩展缺失的 KF 原生控件，不让模型编写未经约束的 native 配置或绕过脚本验证。
- 不做多个 agent 同时改写同一工程、自动无冲突合并、运行中任意跳转图节点。
- 不做跨租户语义答案缓存；不为了缓存发送无关资料或超长 filler。
- 不在缺少合法 KF 测试环境时声称原生视觉验证通过。

### 4.3 验收场景

S01 文本新建：讨论 → 规划 → 确认 → 生成 → 可下载绑定制品。
S02 连续修改：同一页改颜色/区域排列，未选区域语义 ID 和 native 输出保持稳定。
S03 图生工程：上传业务页面截图 → 修正识别结构 → 控件映射 → 确认 → 交付。
S04 多对话：A 运行，切 B 发起规划，再回 A 看完成结果；两者不串消息、制品或 usage。
S05 刷新恢复：任务生成中刷新/网络断开，重连后事件不丢不重，任务继续。
S06 竞争修改：A/B 从同一 revision 起步，A 先提交后 B 不能静默覆盖。
S07 停止重试：取消模型等待/排队/构建准备阶段，重试不会重复生成用户消息或重复构建。
S08 隔离：其他 tenant 猜测 run、asset、event、artifact ID 均不可读取或修改。
S09 历史与分叉：从历史版本新建对话可以研究，但生成前必须明确处理当前工程冲突。
S10 降本：同样样本、模型配置和质量门槛下比较每成功交付总成本，不用单个漂亮的命中率代替结论。

## 5. 目标架构与边界

```text
Vue 多会话工作台
  ├─ 会话/消息/附件 API
  ├─ POST AgentRun（幂等）→ PostgreSQL 持久队列
  └─ GET events（订阅/重放，绝不负责执行）
                              ↓
独立 agent-worker 进程 → 现有 LangGraph（同一个 conversation 锁域）
  ├─ ModelGateway → task prompt/context → provider adapter → usage 账本
  ├─ 参考图 → VisualReferenceSpec → 能力检索 → 语义 implementation plan
  └─ 确认/签名 → 确定性编译 → 现有 BuildJob worker → revision/artifact
                                                        ↓
                         静态报告 + 可选原生运行证据 + 历史 delivery
```

API 进程只受理和订阅；agent-worker 用 Nest application context 复用依赖，不开启 HTTP；构建 worker 仍独立。三者共用 PostgreSQL，不在网络请求期间持有数据库事务。引入 `apps/api/src/run-agent-worker.ts`，不新造互相循环依赖的 package。

## 6. 数据模型与一致性合同

新增表均带 tenantId，业务外键查询必须包含 tenantId；用复合唯一键/复合外键保证跨租户不能错误关联。只返回该用户按现有租户角色有权访问的数据；本期沿用工作区租户共享语义，不悄悄改成私有会话。

| 表/字段 | 内容与关键约束 |
|---|---|
| Conversation 扩展 | archivedAt?、forkedFromConversationId?、forkedFromMessageId?、forkedFromRevisionId?、lastActivityAt；旧 updatedAt 不再当消息时间的唯一事实 |
| Message 扩展 | runId?、clientMessageId?、parts Json?；保留 content 兼容；唯一 tenantId/conversationId/clientMessageId（null 历史允许多条） |
| AgentRun | id、tenantId、workspaceId、conversationId、requestedByUserId、clientRequestId、requestHash、mode、action Json、status、baseRevisionId、inputSnapshot Json、checkpointRef?、buildJobId?、resultRevisionId?、configSnapshot Json、leaseOwner?、leaseExpiresAt?、fence 整数、cancelRequestedAt?、failureCode?、createdAt/startedAt/finishedAt；唯一 tenantId/conversationId/clientRequestId |
| AgentRunEvent | runId、tenantId、seq、type、payload Json、createdAt；唯一 runId/seq；事件与运行状态同一事务写入，序号不靠内存计数 |
| AgentRunStep | runId、stepKey、inputHash、status、attempt、outputRef?、providerAttemptId?；唯一 runId/stepKey/inputHash；重启只复用已提交且 schema 版本一致的输出 |
| ModelInvocation | id、tenantId、workspaceId、conversationId?、runId?、task、provider、requestedModel、actualModel?、promptVersion、schemaVersion、prefixHash、inputHash、status、attempt、parentInvocationId?、inputTokens?、outputTokens?、cacheHitTokens?、cacheMissTokens?、reasoningTokens?、usageSource、costMicros?、currency?、pricingVersion?、latencyMs、providerRequestId?、failureCode?、startedAt/finishedAt；不存 API key、图片 base64 或完整 prompt |
| RunBudget | runId、maxInvocations、reservedInvocations、usedInvocations、maxInputTokens、maxOutputTokens、reservedTokenUpperBound、usedKnownTokens、unknownUsageCount；事务原子预占，所有修复/摘要/视觉调用都计入 |
| MessageAttachment | tenantId、workspaceId、messageId、assetId、purpose(reference/material)、order；复合归属校验；附件读取重新鉴权 |
| VisualReferenceAnalysis | tenantId、assetHash、analysisVersion、providerModelConfigHash、instructionHash、status、spec Json、createdAt；同租户内缓存，引用原图版本 |
| GenerationSnapshot | tenantId、runId、revisionId?、baseRevisionId、blueprint Json、implementationPlan Json、capabilityCatalogVersion、compilerVersion、assetManifest Json、visualSpecId?、sourceMap Json、createdAt；不可变；初代历史缺失时禁止假装可以可靠局部改写 |
| VerificationReport | tenantId、runId、artifactId、artifactHash、revisionId、level、status、report Json、runtimeVersion?、viewport Json?、seedStateHash?、createdAt；证据不匹配该制品时不可展示为通过 |

索引：AgentRun(tenantId,conversationId,createdAt,id)、AgentRun(status,leaseExpiresAt,createdAt)、Event(runId,seq)、Message(tenantId,conversationId,createdAt,id)、Conversation(tenantId,workspaceId,archivedAt,lastActivityAt,id)。消息分页固定 `(createdAt,id)` 游标，不用 offset；每页默认 50，上限 100。

数据库唯一约束是幂等的最终保证；浏览器不能提供可信 tenantId、价格、planHash、能力证据或制品路径。`requestHash` 包含规范化业务参数；同 clientRequestId 不同内容返回 409 IDEMPOTENCY_CONFLICT。

## 7. Run 状态机和操作语义

状态固定：`QUEUED | RUNNING | WAITING_INPUT | WAITING_APPROVAL | BUILDING | SUCCEEDED | FAILED | CANCEL_REQUESTED | CANCELLED`。

- QUEUED → RUNNING；RUNNING → WAITING_INPUT/WAITING_APPROVAL/BUILDING/SUCCEEDED/FAILED。
- 等待输入/审批结束当前执行租约，但不是成功交付。对应操作带 expectedRunId 和当前服务端方案 receipt，创建一个新的 run，原 run 保留等待状态及 supersededByRunId 关联；前端展示为“已继续”。给 AgentRun 增加 supersededByRunId?。
- BUILDING 由 BuildJob 终态回填：成功 → SUCCEEDED；失败/stale-base → FAILED。
- 终态不可再次迁移；重试创建新 run 并记录 retryOfRunId?，保留完整审计。
- cancel 是幂等请求：QUEUED 可直接 CANCELLED；RUNNING 先 CANCEL_REQUESTED，abort 发到模型并等 checkpoint 安全边界；未入队构建禁止继续入队。
- 已入队 BuildJob 的停止不是“假装完成取消”：未领取时通过构建协调器安全撤销；已运行则只申请 cooperative cancellation，不能取消时 UI 显示“停止生成请求已收下，构建仍在收尾”，直到 worker 返回实际状态。必须给 BuildJob 添加 cancelRequestedAt?、terminalReason?；不重写原 JobStatus 枚举，取消使用 FAILED + terminalReason=CANCELLED 并在 run 映射为 CANCELLED。
- SUCCEEDED 后 cancel 返回当前状态，不撤回已交付制品。
- “运行中补充要求”进入同一会话下一轮队列，不在已签名计划中途偷改。UI 明示“当前任务完成后处理”。取消当前后启动新轮是两个显式动作。

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
同一 conversation 最多一个活跃执行者；生产入口只允许 Run worker，旧 POST messages/resume 已下线，不再保留第二套 HTTP 执行器。Run worker 仍须使用持久会话 turn lease。排队 run 受理时绑定当时 workspace revision；开始时如同一会话上一 run 成功且没有其他会话更改，可通过明确的 predecessorRunId 更新基线并记录事件；否则 stale-base 返回冲突，不能暗中换基线。等待审批的新 run 使用被确认方案的 baseRevision，不自动 rebase。
<!-- end -->

遇未解决的WAITING_INPUT/WAITING_APPROVAL时，普通排队任务暂停领取；只允许针对当前等待run的合法继续/修改/取消动作通过。继续动作事务内CAS关联supersededByRunId，重复确认不能创建两个后继run；未通过receipt/analysisHash验证前不消耗该等待状态。等待状态不占worker执行租约，但仍是会话业务屏障。

租约默认 30 秒、每 10 秒续期；fence 每次领取递增。每次写事件、提交节点输出和入队构建都验证 fence。lease 超时不意味着旧 provider 请求被撤销；其迟到结果必须丢弃。若外部调用结果未知，记录 UNKNOWN，不声称 exactly-once；恢复最多重试一次且重新占预算。数据库副作用靠幂等键做到不重复。

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
### 2026-10-21 已实施的队列约定（补充 §7）

- 普通 message 按 predecessorRunId 串行排队；每会话最多 20 条 QUEUED 普通输入，满时 409 RUN_QUEUE_FULL。确认/审批继续不受满队列阻断，旧排队输入不能自动充当确认。
- 等待轮次被合法继续消费时，沿用已实施的 `CANCELLED + supersededByRunId` 接管语义，后继队列重接到新的继续 run；不标成成功交付。此处替代初稿中“原 run 保留等待状态”的存储方案，避免旧业务屏障继续阻塞领取。
- 模型上下文只含本 run 和其前序链，按执行前序而非单纯入库时间排序；未来消息、未执行就取消的队列消息不可见。助手消息绑定 runId，旧无 runId 历史只能补在链起点之前。
- 普通输入未固定基线时才允许 follow-predecessor；确认/审批、retry、显式基线及无新策略的旧记录均固定。基线区间每个修订都必须属于本会话前序链的成功 run，否则领取前 FAILED / BASE_REVISION_CONFLICT。一次讨论成功不能“洗白”其他会话的修订。追溯限制 256 层，缺失/循环/超深时不猜测。
- Run 内 load-context 不暗换准入基线；构建入队再次核对 Run 的 baseRevisionId，保留构建提交时 stale-base 校验。当前协议版本为 run-plan@6（在 @5 审批决定恢复基础上修正原生重规划基线），发布前先用旧 worker 排空旧协议任务，再整体切换，不混用。原生待审批 uiImplementation 不是已应用修订，不可当作编译器 previousSpec 来消掉未执行操作；完整期望规格须针对当前锁定基线编译，仍保留模型上下文和未删组件。
- 原生中断已经提交时，停止/恢复必须保留审批屏障，并用确定性 Command(cancel) 后继真正消费 checkpoint；不能只改成取消。cancel 不构建，因此旧审批过期仍可取消，但不能借此在新基线上批准。
- 最新运行查询实际返回业务屏障/执行者，其次队列头，最后逻辑链尾；不得让新排队输入遮住旧审批。前端过期基线转为明确重新规划，不自动重试。

队列历史实现见 `agent-app/docs/run-queue-20261021.md`，准入见 `run-feature-policy-20261021.md`，审计/恢复见 `run-audit-20261021.md`，SSE 见 `run-stream-20261021.md`，最新浏览器/基线修复见 `run-browser-20261021.md`。Playwright 已迁移 Run 与独立 worker，两轮各 9 项通过，但扩大 API 回归仍有偶发失败；完整矩阵、代理/OS kill/升级发布仍未完成。预算暂缓、图片未开放。旧退役进展保留在 `legacy-retirement-20261021.md`。

审计语义补充：RUN_ACTION_ACCEPTED 仅表示受理，蓝图绑定确切 revision/hash；PLAN_* 的 approval_consumed 表示决定消费而非后续交付成功，与 approval-decision memo 同事务；BUILD_START 表示入队，BUILD_RESULT 表示实际提交的成功/失败/取消终态，与 job 提交同事务。approvalDecisionRunId 防止本轮消费后出现的同 hash 新审批被自动重放。恢复仅重放当前持久 Run 已受理、planHash 匹配且尚未消费的原决定，不构造新批准；审计不存正文、原图、私有路径或凭据。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
2026-10-22节点协议补充：`VISUAL_RUN_PLAN_VERSION=run-plan@7`仅为视觉semantic/compile分支预留，当前API `RUN_PLAN_VERSION=run-plan@6`、准入/config/executor和flags不变，@7仍被执行器在step cache前拒绝。新内部AcceptedVisualPlanningInput严格携带reviewHash、reference和canonical confirmationHash，图节点验证完整性/绑定并隔离memo；这不是用户许可、蓝图审批或HTTP入参。普通Run明确清除视觉checkpoint状态。正式启用必须同时实现可信Run输入冻结、用户发送同意/策略复核、原子确认后继和graph暂停/恢复，不可只改版本或flag。节点到真实KF编译器/签名/快照的fixture串联见 `agent-app/docs/visual-graph-20261022.md`，不等同完整图生Run或UI交付。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
2026-10-22受理输入补充：已实现内部 `freezeInTransaction` 保存1–3个参考图的明确主补关系、可信源/派生metadata与完整transform、服务器**像素分析**路由/prompt身份和版本化发送同意，和RunStep/audit同事务；分析恢复取冻结route，不随环境换模型，review也匹配受理的图/指令/模型身份并拒绝TTL过期。说明原文/hash版本化、数据私有，不能由浏览器提供route/snapshot。此原语尚未接RunStore/HTTP/module，现行@6/vision关闭不变，@7仍不可公共执行；其他任务配置、原子确认后继、不同action/重试的可信输入继承及UI尚待接，不将内部freeze当作图生准入完成。具体边界/复验见 `agent-app/docs/visual-admission-20261022.md`。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
2026-10-22有限@7实现补充：实际Run受理事务已接冻结输入，worker/executor已支持服务器staging policy下单图message→真实分析→签名review/WAITING_INPUT；@7现不再只是图节点预留，但**尚不支持确认后继或完整工程生成**。默认文字协议仍@6、生产resolver仍vision关闭，不可仅设AGENT_VISION_V1=true启用。review签名内容绑定释放租约owner/fence，executor只读收尾，mustPause禁止cache/普通返回冒充完成；取消/停机/恢复保留原语义。普通message/蓝图确认不能消费视觉等待，视觉retry须先实现可信输入继承。等待保存在Run/RunStep而非LangGraph interrupt，后续确认后继要显式传可信上下文并独立确认蓝图。真实HTTP/Store/执行器测试与中间失败见 `agent-app/docs/visual-run-flow-20261022.md`，未运行完整视觉upload→download E2E/真实质量或部署试用；此前“@7全部拒绝/模块未接”的段落为历史。
<!-- end -->

## 8. API 与事件合同

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
在用的查询/下载路由保留，旧 POST `/api/conversations/:id/messages`、`/resume` 已删除，均返回 404，无桥接和旧执行 fallback。当前 Run 使用 `/api/conversations/:id/runs`、`/api/runs/:id` 等路径，返回 RunSnapshot；不能按下表规划中的 `/api/v2` 路径调用当前运行接口。`GET /api/v2/workbench-config` 已接通；下表其他分页会话、fork、视觉端点仍是后续目标。所有新增写端点继续遵循 cookie/角色/租户与服务端 Origin 防护。
<!-- end -->

| Endpoint | 请求/返回 |
|---|---|
| GET /api/v2/conversations | workspaceId、cursor?、limit?、archived=false → `{items,nextCursor}` |
| GET /api/v2/workbench-config | 当前租户可见的feature flags、上传限制、图片外发政策；不返回provider密钥/内部URL |
| POST /api/v2/conversations | `{workspaceId,title?}` → conversation；默认标题取首条消息前 24 字，不额外调用 LLM |
| PATCH /api/v2/conversations/:id | `{title?,archived?}`；标题 trim 后 1–100 字；归档活跃会话返回 409 RUN_ACTIVE |
| GET /api/v2/conversations/:id/messages | before?、limit? → `{items,nextCursor}`，parts 有严格版本 |
| POST /api/v2/conversations/:id/runs | `{clientRequestId,clientMessageId,mode,action,attachmentIds,expectedBaseRevisionId?}` → 202 `{runId,status,eventsUrl}` |
| GET /api/v2/runs/:id | 运行快照、最后 seq、usage 汇总、绑定 delivery；必须归属校验 |
| GET /api/v2/runs/:id/events | SSE；Last-Event-ID 或 after；返回 id=seq；周期 heartbeat 不落库 |
| POST /api/v2/runs/:id/cancel | 幂等，返回实际状态 |
| POST /api/v2/runs/:id/retry | `{clientRequestId}` → 新 run；不重复原用户 Message，引用同一不可变输入 |
| POST /api/v2/conversations/:id/fork | `{messageId,revisionId,clientRequestId,title?}` → 新 conversation；只能选可关联的历史基线 |
| POST /api/v2/workspaces/:id/reference-assets | raw bytes + filename；返回资产 ID/尺寸/hash；沿用现有资产服务验证，不另建不安全上传通道 |
| GET /api/v2/workspaces/:id/reference-assets/:assetId/content | 租户鉴权，no-sniff/private cache；不返回物理路径 |
| GET /api/v2/visual-analyses/:id | 当前分析结构、版本hash、可信来源摘要；重新验证归属 |
| PATCH /api/v2/visual-analyses/:id | `{expectedHash,spec}` → 新分析版本；仅可改region/tokens/uncertainties，不可改source事实 |
| GET /api/v2/revisions/:id/delivery | 该 revision 对应的已绑定交付快照；不信任客户端 artifactId |
| GET /api/v2/runs/:id/verification | 精确绑定报告；没有原生环境时返回 `not_configured` 而非通过 |

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
2026-10-22实际新增 `GET/PATCH /api/v2/tenant/visual-egress-policy`：GET按当前租户私有读取策略，PATCH仅本租户tenant_admin与合法Origin，严格boolean字段，更新与审计同事务。它只管理默认拒绝的Tenant.imageEgressAllowed，不启用vision、不替代用户发送同意/蓝图批准。内部视觉分析已加scope/fence/lease、首次分析前模型/来源身份hash固定和发送/发布复核；完整附件与模型配置实体的Run准入冻结、确认后继及图/UI仍未接，详见 `agent-app/docs/visual-egress-20261022.md`。未改下方历史@6 RunAction含义，未部署试用环境。
<!-- end -->

`RunAction` 是严格 discriminated union：

```ts
type RunAction =
  | { type: "message"; text: string }
  | { type: "confirm_blueprint"; expectedRunId: string; receipt: string }
  | { type: "resume_approval"; expectedRunId: string; action: "approve" | "revise" | "cancel"; planHash: string }
  | { type: "accept_visual_reference"; expectedRunId: string; analysisId: string; analysisHash: string }
  | { type: "revise_regions"; text: string; regionIds: string[]; generationSnapshotId: string };
type RunMode = "discuss" | "plan" | "build";
type RunEventType = "run.queued" | "run.started" | "step.started" | "step.completed"
  | "step.failed" | "decision.summary" | "message.completed" | "usage.updated"
  | "approval.required" | "input.required" | "build.updated" | "run.cancel_requested"
  | "run.completed" | "run.failed" | "run.cancelled" | "baseline.changed";
type RunEvent = { schemaVersion: 1; runId: string; seq: number; type: RunEventType;
  createdAt: string; payload: Record<string, unknown> };
```

Zod 用每种 type 对应白名单 payload，不能真的放行任意 Record。step payload 仅 stepKey、label、attempt、durationMs、safeSummary、failureCode；decision.summary 仅简短依据和引用的 control/region IDs，最多 600 字。usage 包含 unknown 标识；不显示伪精确费用。第一版消息以 completed 写入，不为看起来流畅而逐字回放假 token；以后加真正 token streaming 时另加事件合同。

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
重连策略：after 使用客户端本地**已收到**的 lastSeq；新订阅从 0 开始补历史。snapshot.lastSeq 只用来判断是否补齐，不能把尚未收到的历史当已读跳过。数据库按 seq 回放后跟随，客户端按 runId/seq 去重；退避 1/2/4/8/15 秒带抖动，401 重新登录、403/404 停止重试。规划中的保留窗口 410 EVENTS_EXPIRED + snapshotUrl 尚未实现；现行路由为 `/api/runs/:id/events?after=N`，不应把上方规划的 /v2/Last-Event-ID/410 当已实现。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
2026-10-21 实际接线补充/修正：现行 GET `/api/runs/:id/events?after=...` 使用本地**已接收** seq，新订阅从 0 补历史；snapshot.lastSeq 用于判断是否补齐，不能把未收到的事件直接当已读后跳过。现行 Fetch 客户端使用 after，不依赖尚未接通的 Last-Event-ID 或事件保留 410。只读 RunEventStreamService 使用 30 秒窗口、15 秒心跳、1 秒 poll、5 秒 drain 等待及 64 KiB 应用缓冲/单帧上限，断线释放监听器/计时器，正常终态 end 排空；不执行或取消 Run。持续会话复核覆盖撤销、绝对/空闲到期、改密限制、租户/角色变化；内部复核不续 lastUsedAt，普通 HTTP 仍遵循原滑动策略。前端清理 reader/stop/迟到响应，快照鉴权错误停止重连；连续暂时错误指数退避并 ±20% 抖动、最终上限 15 秒，正常结束/新 seq 重置。真实 HTTP/Writable 验证和限制见 run-stream 报告；浏览器/代理、多副本长期 soak、事件过期 410 尚未验收。
<!-- end -->

## 9. 成本与缓存设计

四种东西分别命名：provider prefix cache、应用内分析结果缓存、上下文裁剪/摘要、减少模型调用次数。不能把“文件上传复用”算成推理免计费。

官方资料于 2026-10-20 核对：[上下文缓存](https://api-docs.deepseek.com/guides/kv_cache/) 说明缓存自动且尽力而为，匹配需要符合已经持久化的前缀单元，不是任意相同子串；可用 usage hit/miss 字段观测。[视觉接口](https://api-docs.deepseek.com/guides/vision/) 当前支持图文输入，具体模型、参数和限制上线前再核验。项目当前 `deepseek-chat` 字符串不代表已验证视觉支持。价格页面本次获取超时，因此不写固定单价，不默认切换模型。

请求顺序：稳定任务协议/版本 → 稳定 schema/选定能力包（canonical key 顺序）→ 稳定历史前缀 → 本次需求/附件/修复反馈。不能把时间戳、requestId、随机 ID、当前错误置于稳定内容之前；业务需要的 ID 放动态尾部。保留真实 user/assistant role，不用巨型 user 字符串假扮全历史。JSON plan 任务与聊天任务分别构造消息，保证结构化输出合法。

任务 prompt：intent / blueprint / implementation / repair / summary / vision；intent 不带全量控件知识。确认/取消/重试等结构化动作走确定性路由。已有 fast path 要保留，不能退化成全 LLM 判断。

初始应用预算（不是 provider 限制，可由运维调整）：一次 run 最多 8 次物理 provider 请求，transport retry 每逻辑请求最多 1 次，semantic repair 整个 implementation 阶段最多 1 次；vision review 自动修复默认 0、启用后最多 2 且仍受总预算约束。单次 context 目标 24k token，输出按任务上限 intent=512、summary=1500、vision=6000、blueprint=8000、implementation=32000、repair=16000；actual model 窗口不够时先减 context 或拒绝，不能静默截断 JSON。总 run 上限 input=120k、output=80k token，超限转用户选择继续或停止；继续必须新 run 并确认新预算。

使用 provider tokenizer 时记为 exact；无可靠 tokenizer 时以 UTF-8 bytes + 图片保守上限作为 upper-bound admission estimate，明确标记估算，不冒充账单。图片请求字节上限独立于旧文本 128000-byte guard；不能直接解除所有限制。

费用公式：hitInput × hitRate + missInput × missRate + output × outputRate；reasoning 若已计入 completion 不重复计费；价格表用版本和币种、decimal/int micros。缺 usage、价格不匹配、网络超时结果未知时 cost=null，保守占预算并展示 unknown。重试、失败、取消、摘要、视觉都要记录。

验收关注 `总实际费用 / 成功且质量合格的交付数`、总调用数、input/output、repair 率、p50/p95 延迟、缓存 hit / (hit+miss)、unknown usage 率。无 denominator 返回 null。不能对每次请求命中率做不加权平均。初始期望目标：相同评测集成本中位数下降 20%，质量成功率不下降超过 2 个百分点；这是实验目标，不是上线前保证。若未达到，报告原因再决定是否开启优化。

## 10. 图片到工程的合同

<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
**当前源码：visual-blueprint@7 / visual-semantic@12，语义repair@2。** 先读 `agent-app/docs/visual-semantic-repair-20261026.md`。蓝图/语义各有一次独立修复额度；默认none，服务器对应开关及签名continuation都为once才可调用。语义支持有界、非截断完整外壳的JSON语法修复及schema/来源/真实编译反馈；缓存不修复，额度+所有版本repair账本限次，actor/许可/lease/fence保护保持。候选详情只含最终实际公布能力；真实provenance检查componentId独占归属，独立视觉行使用独立静态节点，不猜来源或自动补业务元数据。

当前完整视觉PG/五种Chrome311/311、相关四文件162/162及API类型通过；完整API1057/1057是@10阶段结果，后续@12视觉及定向结果分开记录，不能宣称已跑最终全API。领域1481 passed/5既有skip；完整历史、首次两项连接/登录态失败及后续全量绿灯、hash与文件清单均见新报告，不合并或擦除旧事实。

本轮五个真实新验收共14物理请求，最新两轮一次修复均把坏JSON变为可解析对象；仍无能源工程包/KF运行/1:1结论。最新repeater=0，剩余5个布局容器styleRole=card-surface不被当前合同/测量编译支持，内存删字段后还有content布局能力不符。已停止追加随机请求；下一优先设计并贯通容器角色样式、padding/border布局及原生handoff，再修正新提案布局能力，不删样式或改旧Run/缓存重签。合法包出现后才做KF443隔离新工程导入与截图验收。

production vision关闭，须排空旧视觉任务/worker、整体升级并新建确认，同run-plan@7不支持混部。预算与业务源暂缓，T22/总体IN_PROGRESS。实际.env、受保护试用库18对源码21迁移及旧服务保持；禁止reset/seed或直接新源码重启，无新迁移/依赖。本轮仅清理两个隔离测试库的夹具数据；未连接KF环境。下方旧版本及“语义修复尚缺”均为历史。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
**当前视觉来源合同（已实施）：** 蓝图区域可选visualRegionIds，单项1–128字符/数组1–100项且无重复，缺字段保留旧文本蓝图与hash。新版视觉蓝图必须为每个未省略视觉区域指定唯一明确蓝图页面/区域，包括容器/叶子；未知/重复/遗漏/省略项拒绝。来源随蓝图hash/HMAC/独立批准展示，不从OCR或同名猜测，不改历史签名。仅在明确来源区域保留已接受的真实registry能力，仍受5控件/3布局/25详情与原交互约束；不可满足时在蓝图发布或工程调用前失败。模型获得显式视觉ID→蓝图页面/区域/能力义务表，语义、native与快照sourceMap再次核对完整归属/能力；来源不是事件/数据授权，不能移动归属绕候选。当前冻结blueprint@7/semantic@8；蓝图有界修复已实施且默认none、服务器可显式once，语义修复尚未实施。须排空整体升级，production vision关闭；真实工程/KF结论仍须实测。详细根因、负例、全量与后续见 `agent-app/docs/visual-blueprint-sources-20261026.md`，下方“最新”是历史。

同批真实负例推动groupWith早期同父/无重复/无循环检查，页面/浮层及模块slot/repeater模板均适用；合法单向分组不改写。直接layout/control绑定须与已确认capability兼容，原生阶段仍证明精确发出能力。directLayoutKinds使用原编译器共享映射，只提示唯一目标能力的布局类型，不新增能力/自动换组件或删除分组。布局与分组prompt/hash分阶段升级，@6只是中间测试版，最终@7不得与旧worker混部；受限可信修复尚缺，不能据提示改善宣称任意图可用。

10月26日后续蓝图显示合同调整：journeys[].completion为可选说明，缺键保留缺键，不填默认值/截断/造业务结果；若给出仍须通过原非空/长度/安全文本规则。该字段未被检索、编译、交互或观察验收用作授权/完成证明，实际验收继续绑定必填steps、result、observe.expectedTexts与原生证据。其余页面/旅程/来源/候选门槛不变，历史提供该字段的蓝图形状/hash不变；明确区别可选展示信息与执行要求。冻结blueprint升@6、semantic仍@7，排空整体升级，不改旧失败Run/缓存或历史原回复。

10月26日有界蓝图提案修复设计：后续@6真实蓝图结构有效但漏来源，不能靠随机重新识图或放松完整性。新增服务器默认none、可显式once的冻结blueprint repairPolicy；蓝图协议升@7、semantic仍@7且语义修复仍none。只允许对语法完整、未截断、大小有界的新provider蓝图提案的schema/来源/区域分组错误反馈修复一次；缓存/权限/取消/过期/路由/上下文错误不修复。原已接受视觉输入不变，不新增动作/数据源/候选权限；修复结果仍完整校验并独立展示/批准。

同一蓝图Run的修复额度以独立RunStep原子预留，实际调用用现有task=repair和专用promptVersion记账；任意既有额度记录或该修复账本均拒绝二次修复，包括新owner恢复。发送最小有界错误、缺失来源ID及该次未批准提案，不重复发图片；请求hash绑定原冻结请求、原提案hash与错误，使用原route和系统前缀。预留/发送/发布前分别复核原actor、签名continuation、当前同意/外发、基线、活跃lease/fence；同调用与原结果缓存联动，迟到owner不能覆盖。网络/截断失败不自动重试，消耗过的修复额度不回滚为可重复收费；初次调用的现行崩溃恢复语义不因此承诺恰好一次。生产vision仍关闭，启用修复不构成上线授权。

后续@7真实蓝图修复已成功，但工程请求129435字节超过原128000上限，且尚未发生工程外发。保留原上限，语义协议升@8，新增确定性无损visualReference reason字典投影：仅将mappings/acceptedDifferences的重复reason字符串改为本对象textDictionary索引；全部ID、角色、文本、几何、映射、选择、说明原文与其关联仍完整可逆。只有序列化更小才选择投影，否则发送原只读结构；服务器验证、审批/HMAC、编译和快照始终使用原始结构，投影不成为权限或存储事实。模型输入明确两种表示与索引含义；冻结hash包含投影版本，不改变128000字节、候选或任何执行门槛。

最新真实语义回复为type=json_object的非合同封装，缺事件空数组；离线逐层诊断还发现main布局能力及header-divider原生尺寸问题，仍无有效包。下一设计有界一次语义修复和真实编译反馈，默认关闭并冻结policy/hash/route；唯一RunStep和repair账本限次，完整来源/候选/许可/lease/fence/原生/制品再证明，不能把内存反事实或修过的旧缓存当交付。完整反例与验收顺序见10月26日报告；蓝图修复已完成，不重复实现。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
**当前有界重复观察合同（已实施）：** 见 `agent-app/docs/visual-repeater-observation-20261023.md`。原编译 provenance 的 key、展开 id/parent、最近 repeater 与别名记录作用域提取为共享纯投影；key/展开 id 碰撞、maxItems、100字符id、5000实例预算失败关闭，模块仍走原 registry 回放。observe 可由普通布局下已声明 mock 的 repeater-field 字符串实例精确覆盖 expectedTexts，不允许数字/对象字符串化或未显示数据作证；原生再证明具体实例/来源/父链/隐藏/屏内几何和 text/content，artifact/物化/签名/快照保持。动态业务源、tab/浮层/模块/屏外依旧不作证，旧无类型旅程仍按真实交互。新冻结 semantic@4/blueprint@4 整体排空升级，生产vision关闭。Chrome fixture 双实例包核对不等于能源图真实模型/KF运行或像素一致；业务源暂缓，T22/计划未完。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
**当前观察合同（已实施）：** 见 `agent-app/docs/visual-observation-journeys-20261023.md`。蓝图步骤严格区分可选 kind=interact（缺字段兼容旧交互）与显式 kind=observe + 1–12项去重 expectedTexts；后者只由对应页面/区域普通布局下受限静态 text/richtext/button 精确原文、真实原生 content/nativeProperties.text 与几何/父链/样式证明，action 禁止冒充。签名前 artifact 与原有 exact materialization/snapshot 继续封口；审批必须展示类型和期望原文。不能把重复模板、隐藏文字、动态数据或模型自报“看到了”当证据；本切片保守不支持重复 mock 实例，下一需复用确定性展开/provenance 单独证明。原交互触发/所属/闭包保持。最新冻结 prompt 为 visual-blueprint@3 / visual-semantic@2，排空旧任务/worker后整体升级，production vision关闭。Chrome fixture 闭环不等于真实能源图或 KF/像素验收；T22/计划 IN_PROGRESS，业务源暂缓。下方“尚未实施观察合同”是前轮记录。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
**最新实施优先级与实测边界：** 用户明确业务源暂缓，先完成客户端工程生成。见 `agent-app/docs/visual-real-model-20261023.md`。能源UI目标图已生成，官方真实识图和独立蓝图已执行通过；真实工程仍失败，没有当前交付包/KF运行或像素一致验收。识图改为vision@v2，受限模型提议仍须原人工审阅确认，不直接产生执行授权，凭据绑定完整部署route；蓝图visual-blueprint@2由原Zod结构合同生成完整JSON Schema，运行时语义/权限验证不变。视觉计划复用原有界规范化后仍完整验证。下一应明确静态观察与可执行交互的旅程合同，现阶段尚未实施；不能伪造动作、删旅程或全面放宽覆盖验证。新prompt/hash/冻结合同需排空整体升级，同@7不代表兼容，production vision关闭，T22仍IN_PROGRESS；下方业务源优先与尚无真实provider调用均是历史。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
最新只读字段设计/实施：可选 dataRequirement={kind:workspace-field,field:name} 仅用于 text 区域，revision 缺字段保持/null 清除，新区先保存。服务端按 Run 的 tenant/workspace 只读真实 solutionWorkspace.name，禁止 caller 值/身份/URL/任意字段；生成一对一 dataSnapshots={regionId,kind,field,value} 并冻结在 HMAC review，而非图像分析缓存。值须符合原语义文本规则，不截断/造值。UI 保存后展示确认值、说明非实时及会进入后续规划，清旧选择、独立蓝图批准。旧版本/重放/后继承接冻结值，新有效修订才重新取值并确认；no-op 不自动刷新。映射只允许真实 text，未知 hint/静态证据不放宽；模型/编译 provenance 要求单一 direct text/content 同值、空属性/事件/tabIds、无 mock；native sourceMap/快照再核对精确 owner/text 同值且无事件。完整 API 988/988 零 skip（三项 Chrome/275 视觉流程）、domain 串行 1431 passed/5 原有 skipped、Web 175、contracts 525、静态/build 通过；浏览器确认后重命名，实际下载包仍核实旧确认值。见 `agent-app/docs/visual-workspace-data-20261023.md`。这仅是工作区元数据快照，不是业务源/实时或 KF 运行验收；T22/计划未完、production vision 关闭，业务源目录/权限/类型/适配和其余交互/替代/retry/T17/T23/T24–T27 仍缺。新增字段与视觉 prompt/hash 继续要求排空整体升级；下方“最新”指前批历史。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
本批结构化交互设计：可选 interactionRequirement={kind:"click-feedback",message,level} 仅用于 action 区域，文字复用 action-graph 安全语义校验；旧缺字段不补默认值，revision 显式 null 清除、新区先保存。仅允许真实 button 候选并要求 click；不靠静态证据宣称运行验证，不解决原未知 hint。原签名/TTL/actor/幂等/CAS/回执/重新接受/独立蓝图保持。模型输出必须只绑定一个 direct button，其唯一 click/唯一直接 show-feedback 与文字级别精确匹配，无条件/依赖/后继/脚本替代/额外事件动作；编译后 sourceMap/快照再核对精确 native owner 的唯一 onClick/event 和无脚本的唯一反馈动作。原 native 编译器生成 ShowMessage，模型不写脚本；clarifications 仍仅未验证参考。新视觉 prompt/hash 与可选 spec 字段要求排空整体升级，不能同 @7 混部。真实数据源绑定、其他交互、替代/可信 retry、T17/T23/T24–T27 与 KF 运行/视觉质量仍未完成，production vision 关闭，细节与本批实际验收见 `agent-app/docs/visual-click-feedback-20261023.md`；下方“结构化交互未接”指更早批次，不能把本地反馈泛化为所有绑定已完成。

本批最终完整 API 975/975 零 skip（262 视觉流程/两项 Chrome），串行 domain 1419 passed / 5 原有 skipped，Web 172、contracts 523、静态检查/build 通过；实际包字节验证不等于原生运行验收。下方“本节最新实施状态”保留为前批说明编辑记录，当前以本段及最新报告为准。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
T22 本批补充说明编辑设计：VisualRegion 可选 clarifications={interaction:string|null,dataSource:string|null}，两者仅为未验证文本（各 1–1000 字），不是模型/用户授予的执行、网络、凭据或绑定权限。原 revision 更新项可编辑，缺字段保留；显式双 null 清除本轮补充说明并回到缺字段的旧形状，但不能删除原 interactionHint、uncertainties 或提高原置信度。仅已保存区域支持，新区先保存；禁止 extras/native/endpoint/credentials/resolved 字段。数据进入 specHash/HMAC/不可变 child/原 TTL/原子新回执/审计，依原授权只作为 JSON 参考传入独立蓝图及语义规划；不新增外部请求或修改冻结 prompt。映射仍维持原交互 hint 拦截，补充说明不能升级证据，原本 verified 的静态组件必须降为 supported_unverified 并说明备注尚未验证，用户需重新选择风险。界面显示“交互说明（未验证）/数据来源说明（未绑定）”，保留原未知问题；本批不等于结构化语义交互要求、真实 KF/HTTP 数据绑定、模拟数据执行合同、替代或视觉 retry 完成，生产 vision 仍关闭。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
本节最新实施状态：补充说明设计已接原 Run revision/UI，见 `agent-app/docs/visual-clarification-notes-20261023.md`。完整 API 963/963 零 skip（250 视觉流程/Chrome）、Web 169、contracts 521、串行 domain 1404 passed / 5 原有 skipped、tsc/vue-tsc/lint/build 通过；初轮并行 domain 单项超时与完整复验如实保留。Chrome 已断言独立蓝图及语义实际 JSON 含备注并走到 native/下载。说明仍未验证/未绑定，不提高静态证据或绕过原未知 hint；层级/原图全局几何/来源/TTL/独立批准保持。T22 仍 IN_PROGRESS、production vision 关闭；剩真正结构化交互要求/数据绑定、替代/可信 retry、系统与真实质量验收。下方尚无说明/层级与旧计数均历史，不覆盖本条当前状态。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
T22 层级修订设计：既有 revision.regions 更新项新增可选 parentId（同分析区域 ID 或显式 null），缺字段保持原父关系/旧请求 hash，不接收新 ID/native/置信度/权限；additions 仍根级，新增区域先保存取得服务器 ID 后再调整层级。针对更新后的完整候选图校验未知/已删父节点、自引用、直接和间接循环；仅当子节点在同一事务被显式移出原父节点时，允许保留它并删除原父节点，否则维持原后代删除规则。坐标始终为原图全局归一化，不自动改文字/几何/交互。UI 延续原图叠层/列表，加入父选择和折叠层级预览，隐藏自身/后代/待删/临时 ID 选项并复核完整 spec；保存沿原 TTL/actor/gates、immutable child/history/CAS/新回执/幂等审计事务，必须重新确认且独立批准蓝图。本批不开放交互/数据源编辑、替代、视觉 retry、T23 局部重生成或生产 flag。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
本节最新实施状态见 `agent-app/docs/visual-region-structure-20261023.md`：上述区域增删设计已接原 UI/Run 修订事务；新增纯浏览器 revision schema subpath（不加载服务端 Node 签名代码）。完整 API 942/942 无 skip、Web 161、contracts 515 与 build/静态检查通过，Chrome 实际手机新增→删除→重新确认→工程下载验证；模型本地 fixture，不宣称 KF/1:1。T22/计划仍 IN_PROGRESS，production vision 关闭；层级/交互与数据源、替代/visual retry 和系统/真实质量仍待做。下方“当前 925/1”与“已有区域但不支持增删”属于前批历史。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
T22 本批区域增删设计：沿用 Run-scoped revision POST，保留 `regions` 更新数组，新增可选 `additions`（仅 role/text/box）与 `removals`（既有区域 ID）数组；总操作数 1–100、最终区域 1–100、UTF-8 64 KiB。新增区域 ID 由服务端根据 requestId/序号分配，根级、confidence=0、interactionHint=null，并保留“用户补充，交互与数据源待确认”的不确定项。禁止客户端指定 ID/父子关系/置信度/native/权限。删除父区域必须明确同时删除所有后代，否则拒绝，不静默级联/重挂；已删区域的不确定项保留为全局问题。仍使用原锁序、原 TTL、不可变 child/签名 history/current CAS/事件/审计原子事务与幂等；重新匹配，旧 receipt 失效，独立蓝图批准不变。UI 沿用原图叠层和列表，新增/待删/恢复/放弃明确，保存前不能接受旧映射。本批不做层级重排/交互数据源编辑、替代、视觉 retry 或完成后区域重生成；生产 vision 关闭。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
当前验收状态：最后 API 925 passed / 1 failed（原 I1 并发批准错误码），214 视觉流程/Chrome、Web 156、contracts 506 通过；见 `visual-review-editing-20261023.md` §7。不能把全量验收或 T22 标完成，不直接开生产 vision。已发布识别结果被立即编辑时，原 worker 仅可通过自身精确 hash 的归档/原事件完成只读收尾，owner/fence/scope/config/释放状态条件不放宽，归档不授权新生成。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
2026-10-23 已有区域编辑补充（最新）：新 POST runs/:runId/visual-review/revisions 只接 UUID/旧 receipt/analysisId/hash/已有区域 role/text/box patches，独立当前 gates/Cookie/Origin/原 actor/WAITING/base/TTL 验证。同事务创建不可变 child（TTL 不延长）、服务器重算映射、归档旧签名、CAS 当前指针并签 revision 元数据、追加新 receipt/event/audit；读取验证直接前版 HMAC 与分析 parent。旧 analysis-only PATCH 退役 404，GET 保留。界面编辑预览不授权生成，保存后重放事件与展示、清空差异选择，旧 receipt 409；UTF-8 序列化 64 KiB、网络失败幂等、另一标签页/陈旧确认/迟到响应有保护。真实手机 Chrome 编辑→重新接受→独立蓝图→native/下载 hash 已扩展验证，见 `agent-app/docs/visual-review-editing-20261023.md`。**T22 IN_PROGRESS、production vision 关闭；增删/层级/交互/数据源/substitute/visual retry 与专项/真实质量待做。** 下方已有区域编辑未接是历史，@7 旧 worker 仍须排空整体升级。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
2026-10-23 UI/浏览器补充（最新）：现有工作台已接单图 raw-body 私有上传、派生图及默认不勾的 explicit-consent；vref1 事件通过新增 Cookie/tenant/原 actor 的 GET runs/:id/visual-review 取白名单 displayed reference，不返回路由/worker/proof/config，坏/过期/base 变化不可确认。未验证项手选保留/省略、unsupported 只可省略，必填理由，不提供未实现替代/区域编辑。识别确认与蓝图确认独立；上传失败/错回执/撤权不得丢图转文字，模糊网络失败复用幂等身份。真实 Chrome/API/SSE 刷新恢复/PG/native/sign/snapshot/BuildExecutor/一次性实际下载 hash 已验证，模型 fixture、测试组合根 staged policy，见 `agent-app/docs/visual-workbench-browser-20261023.md`。**T22 仍 IN_PROGRESS，production vision 关闭；剩编辑/区域/visual retry、升级/恢复/资源/全局调度和真实 provider/KF/Windows/1:1 验收。** 下方“前端未接”均历史，不再重做基础链路。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
2026-10-23 公共工程确认补充：Store 已接视觉 confirm_blueprint 的当前 runtime/gates、原同意人/ancestry/TTL/基线校验和固定原 config/base 的签名继承；同事务 Message/候选 SQL NULL→freeze/source 唯一消费/双审计/budget/queued，幂等先于当前 gate/runtime。原 image → blueprint → outstanding 锁序，不用通用 active 分支二次消费；缺 semanticModel 或 freeze 后故障全部回滚。原视觉输入即使 config 降级也不能回落 @6；识别结果等待不能跳过差异接受。真实 Cookie/Origin confirm→正式 PG 工程图→native/sign/snapshot/BuildExecutor/Delivery→一次性 token/download 字节 SHA-256 已通过 staged 依赖注入集成验证，边界/中间失败见 `agent-app/docs/visual-public-engineering-20261023.md`。**生产 vision 仍关闭，前端上传/授权/差异/独立蓝图/browser 闭环未接，T22 IN_PROGRESS；不以本地模型响应/工程包验证冒充真实 KF/视觉 1:1 验收。** 下方“公共 confirm 未接”属于历史。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
2026-10-23 执行合同补充：内部 @7 confirm 已有独立工程 step/hash、cache 前 proof/current lease 校验与正式 handler。图只恢复签名 blueprint/revision/hash/accepted/stamp、清旧授权并确定性进入 capability/专用 semantic/原 compile/sign/snapshot/build/delivery，不能从 idle/无 job 或假整步缓存宣称工程成功。已提交 job 恢复单独认证 immutable engineering receipt，再验证精确 Run→唯一 job→签名 plan/artifact/native→不可变快照/sourceMap/视觉→唯一结果 revision/package/storage/hash；此方法不授权新 egress/compile/enqueue，仅自身成功提交结果允许基线移动，源 TTL 过期/外发撤权不阻断只读跟踪，但提交前仍完整检查。恢复不加载图、不重复模型或入队；原生映射不匹配拒绝。实际 PG 图/私有包字节 SHA-256 已以本地模型 fixture 验证，**公共 confirm Store/HTTP 到下载/UI 仍未接，生产 vision 关闭、T22 IN_PROGRESS**。详见 `agent-app/docs/visual-engineering-run-20261023.md`，下方旧“consumer 未接”仅为历史，不是 KF/真实视觉 1:1 验收。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
2026-10-22语义任务配置补充：engineering proof可签名冻结semantic route/prompt规则/限制/repairPolicy:none，旧proof可读但缺配置不可执行。专用VisualSemanticService在cache/send/publish按祖先reader→当前DB lease顺序验证来源/同意/TTL/catalog/policy/actor/fence，按可信blueprint/候选/素材构建有界消息，复用原语义提示词与校验，无隐式repair/文字fallback；结果cache同fence并发拒绝、已完成接管复用、未知在途可重发如实计费、迟到不覆盖，坏cache不能被归一化重绑hash。统一runtime/ModelPort已接专用端口，缺服务时隐藏旧未冻结视觉方法，凭据绑定精确服务器route。**当前未接@7 confirm执行consumer/公共Store/完整native下载，production vision关闭，T22仍IN_PROGRESS。** consumer须另外处理已提交BuildJob跟踪与规划base/TTL检查的合法边界，不全局放宽来源验证。细节/真实服务与单节点测试边界见 `agent-app/docs/visual-semantic-runtime-20261022.md`，不视作完整工程还原验收。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
2026-10-22蓝图确认合同补充：正式视觉蓝图handler在receipt发布前冻结独立 `kf-visual-blueprint-review/v1` / vbpr1，绑定实际服务端结果、唯一显示Message、revision/hash/receipt、原视觉确认/continuation和实际owner/fence；暂停仍沿用图→Message→review→事件→pause及租约恢复，不宣称全部原子。新增内部 `kf-visual-engineering-continuation/v1` / veng1（purpose仅semantic-planning）绑定confirm_blueprint新Run/action/request/actor/base/config、原accepted和签名blueprintReview，同调用方事务proof/step/审计/CAS唯一消费源蓝图等待，消费后读取仍复核原签名和当前源/TTL/catalog/policy/Message/receipt。候选由调用方创建，初始input为SQL NULL；不可复用accept-only proof或混入旧工程批准。**本轮仅可信数据继承，尚无semantic/repair配置冻结/发送许可/活跃后继lease验证或执行consumer，公共视觉confirm和production vision仍关闭，T22仍未完成。** 后续先reader→活跃租约及专用任务gateway/cache/handler，再公共完整事务/UI/下载。旧不生成签名review的等待不得临时倒签，旧@7也需排空整体升级。细节与实际测试边界见 `agent-app/docs/visual-blueprint-confirmation-20261022.md`。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
2026-10-22公共确认补充：RunService/PrismaRunStore已接严格 `accept_visual_reference`（真实vref1 receipt与有界acceptedDifferences），候选原config/base/actor固定，当前准入/vision/外发/可执行runtime gate后同事务Message/Run/freeze/proof/审计/预算/queued。signer CAS唯一消费旧review等待，Store跳过通用二次消费；取锁conversation→tenant→workspace→source control→row后再outstanding，避免取消锁倒置。幂等完整action hash优先当前gate，变更receipt/choices冲突，失败整笔回滚；freeze/read绑定动作与accepted同一选择。RunAction字段optional仅兼容读取旧内部历史，公共/Store准入仍要求完整严格确认，leaf schema避免循环。真实Cookie/Origin HTTP确认→正式执行器/PG图→独立蓝图WAITING_INPUT已测，详见 `agent-app/docs/visual-public-acceptance-20261022.md`；下方“公共accept未接”均为历史。**生产vision仍关闭，单图/原同意人/build源限定；下一蓝图/审批/retry可信继承、semantic/repair派生外发、UI/工程下载尚缺，不能拿accept-only proof批准构建或回退文字，T22仍未完成。** 无实际环境/迁移/收费调用，预算暂缓/旧POST退役/旧试用保护不变。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
2026-10-22正式执行补充：有限@7现在支持已签名build accept后继的cache前preflight/独立visual-blueprint步骤、正式worker/registry/ConversationService完整Postgres图→独立蓝图Message/input.required/WAITING_INPUT及恢复。新入口先清旧building/批准channels，确定性设计路由；已有native interrupt或错位own checkpoint拒绝，不靠文字分类或旧批准。已装配统一review/专用蓝图ModelPort，凭据gateway绑定服务器完整route，换host/model的旧Run外发前失败。**公共确认Run受理仍未接、vision继续关闭，下一蓝图/审批继承、semantic外发、UI与图生下载E2E未完成**；测试确认候选为内部事务，不称公开HTTP确认完成。细节/PG恢复/取消/缓存测试见 `agent-app/docs/visual-blueprint-run-20261022.md`，此前“尚无后继handler/完整图/worker装配”为历史；receipt来源stamp不代表构建批准。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
2026-10-22视觉蓝图补充：确认continuation proof可冻结独立blueprint route/完整prompt与限制身份，旧内部proof缺配置不得模型调用或从环境补模型。新内部专用端口经proof/source/current policy/活跃DB lease/fence复核后走共享gateway/usage和持久cache；原design-plan节点展示独立v3蓝图停design-review，清旧工程权限，不回退文字/隐藏repair，视觉memo绑定完整accepted，普通Run清新visualBlueprintConfirmationHash来源stamp。**尚未接公共accept/可执行后继handler/完整LangGraph入口暂停恢复/worker配置装配，默认vision关闭，stamp不代表蓝图已批准**。后续先清旧building/design-review入口并确定性路由，再公开同事务受理；confirm_blueprint等须另一段可信继承，visual semantic任务配置与外发仍待接。详情/测试边界见 `agent-app/docs/visual-blueprint-20261022.md`；不以fixture蓝图或直接节点串联宣称完整图生/真实还原质量。
<!-- end -->

<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
2026-10-22确认继承补充：内部 `kf-visual-continuation/v1`/vcont1 proof已实现，绑定新Run/actor/action/config/request/base、来源admission/review与选择，不复制message快照或伪造新同意。调用方事务内冻结accepted/审计/step、CAS唯一后继/消费旧等待；消费后恢复仍认证原签名/current source/analysis leaf/TTL/base/catalog/许可。暂限单图、原同意人、build accept。此原语尚未接公共准入/worker/graph，@7仍只执行message到review，生产vision关闭；receipt不等于外发许可/蓝图审批。后续其他模型route/prompt冻结、发送/发布复核、可执行accept与独立蓝图、再公开action/Store事务/UI必须一起完成；下一action/不同用户/retry须独立继承合同。新reader锁序为conversation→tenant→workspace→source→后继，执行器不可先持后继控制锁再倒序调用。细节/真实DB测试边界见 `agent-app/docs/visual-continuation-20261022.md`，不是完整图生E2E；此前“确认尚无持久原语”的描述为历史，公共确认仍确实关闭。
<!-- end -->

流程：可信上传与去元数据 → 像素分析 → 可编辑视觉结构 → 现有能力检索 → 映射/差异解释 → 用户确认 → SolutionImplementationPlan → 现有布局/组件/交互编译 → 构建。

首期输入应用限制：PNG/JPEG/WebP 静态图，单图 10 MiB、单边 ≤8192、总像素 ≤32MP；每条消息最多 3 张；送模型派生图长边 ≤2048，必要时最多 4 个用户可见裁剪区域，总请求体 ≤16 MiB。原图保留供用户确认，派生图记录 transform/scale，不覆盖原始 hash；对 GIF/SVG 明确拒绝并解释格式，不由浏览器偷偷转码。复用原 asset sniff 和完整文件检查，增加像素解码上限/安全重编码（采用 sharp 并锁定依赖，验证 Windows 安装）。

```ts
type VisualRegion = {
  id: string; parentId: string | null; role: "header" | "sidebar" | "content" | "card" | "table" | "chart" | "form" | "image" | "text" | "action";
  box: { x: number; y: number; width: number; height: number }; // 0..1，图像坐标
  text: string[]; confidence: number; interactionHint: string | null;
};
type VisualReferenceSpec = {
  schemaVersion: 1; sourceAssetId: string; sourceHash: string;
  viewport: { width: number; height: number };
  regions: VisualRegion[];
  designTokens: { background: string; foreground: string; accent: string; spacing: number[]; radius: number[] };
  uncertainties: { regionId: string | null; question: string }[];
};
type RegionMapping = { regionId: string; controlType: string | null;
  capabilityId: string | null; support: "verified" | "supported_unverified" | "unsupported";
  reason: string; evidenceIds: string[]; fallback: string | null };
```

box 必须在 [0,1] 内且 x+width/y+height≤1；regionId 唯一，parent 无环且存在；颜色限安全 hex；文字长度有限制；confidence<0.7 的关键控件及未识别数据绑定进入澄清；不得把图中文字当系统指令。截图看不到的交互和数据源必须显式询问或采用标明的 mock，不推断成生产地址。

参考图只在 vision task 中发送像素，其余阶段引用结构、摘要和区域裁剪；同 tenant/assetHash/analysisVersion/modelConfig/instructionHash 可复用分析。用户修正生成新的 spec 版本。能力匹配继续复用现有检索和 registry；未验证不等于完全不可生成，但 UI 必须标注并允许选 verified fallback；unsupported 不得编造属性。

截图中的原生尺寸只作相对布局线索；布局由 compiler 确定，沿用当前 desktop 1440/large-display 1920 语义规则，不让模型输出任意 native 坐标。布局参考与业务素材分开；只有显式 material 资产进入 ApprovedAssetFacts。

局部修改输出受限 operations（replace_region / update_tokens / update_interaction），包含 expectedSnapshotId、baseRevisionId、regionId 和 payload；schema 与已有 semantic plan 类型复用。编译前验证修改集、引用完整性、未选区域 hashes 与所有交互依赖；必要时返回 DEPENDENCY_EXPANSION_REQUIRED，请用户确认扩大范围。禁止任意 JSON Pointer、文件路径或 shell patch。保持稳定 region/component/native ID source map；第一次构建才建立 snapshot。历史无 snapshot 时给“重新规划创建可编辑版本”，不得猜测。

## 11. 质量与验证等级

等级不是单个 pass：

- `schema`：结构、引用、控件支持属性、必需输出、资源/脚本安全。
- `compiled`：布局溢出/重叠规则、构建包完整性、可导入静态检查。
- `runtime`：隔离 KF 环境实际导入/启动、目标页面截图、基础交互结果。
- `visual`：在相同 viewport/fonts/seed state 下，区域布局、文字、颜色和人工观感评估。

HTTP 服务启动只能证明启动，不能证明页面正确；HTML 预览不是 KF 原生渲染。每份截图绑定 artifact hash、revision、runtimeVersion、viewport、seedStateHash、字体配置、时间与操作序列。无环境时 schema/compiled 可以通过，runtime/visual 明确 not_configured；可下载，但不能标注“真实运行已验证”。

确定性结构、安全和关键交互失败是硬门槛；视觉相似度低是警告/继续修订入口，不阻止已合法工程下载。最多两次可选局部修复，无改善或预算不足立即停。不能用单一像素差阈值评判不同控件、字体和动态数据。

## 12. 发布、隐私、观测

Flags：`AGENT_USAGE_V2`、`AGENT_PROMPT_V2`、`AGENT_RUNS_V2`、`AGENT_WORKBENCH_V2`、`AGENT_VISION_V1`、`AGENT_REGIONAL_EDIT_V1`、`AGENT_NATIVE_VERIFY_V1`；默认 false，允许 tenant allowlist。依赖：workbench→runs；vision→runs+usage；regional-edit→snapshot；native-verify→显式测试环境配置。运行创建时冻结 flag/config snapshot，不能运行一半换协议。

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
已实现的当前策略：仅 runs/workbench 可以显式启用，配合 `AGENT_FEATURE_TENANT_ALLOWLIST` 精确租户列表；其他上述 flags 仍未接通，置 true 会拒绝新执行准入，而非提前开放功能。GET `/api/v2/workbench-config` 经 TenantGuard 返回有效配置，设置 private/no-store 和 Vary Cookie/Origin，不暴露 allowlist。准入在 RunStore 会话锁内执行，新输入写入前判定；既有幂等重放优先于关闭开关，cancel 始终保留合法性检查后可运行，旧接口仍 404。

新 Run 冻结当前有效 flags/schemaVersion/planVersion，worker 按冻结协议执行已受理任务，不跟随当前 rollout 关闭而假取消；不支持的快照协议在读取 step cache 前失败。尚无快照的历史行不自动回填。此处不等于统一 gateway 的模型/提示词/价格冻结已经完成。前端未启用/无法读取配置时只读、保留历史和停止，切换租户/工程重新读取，不缓存上个租户的授权。图片能力和外发仍关闭，真实工作台不再提示“即将发到视觉模型”。具体字段、环境示例与尚缺审计/浏览器/发布门槛见 `agent-app/docs/agent-runs-operations.md`。
<!-- end -->

原始图片默认私有；向外部模型发送前显示数据发送说明，租户管理员可禁用外发。日志只含摘要/hash，不记录像素、cookie、完整需求或模型原始推理。暂定保留：events 30 天、invocation metadata 90 天、分析缓存30天；已交付 snapshot/制品按现有项目生命周期。清理仅针对过期且未引用内容，先 dry-run manifest，再在维护者启用策略后执行；本计划不授权删除现有数据。

运行告警：队列等待>120秒、lease连续失败、UNKNOWN usage增长、HTTP429、跨会话冲突、取消>30秒、build孤儿、磁盘/资产配额。运行并发初始每 tenant=2、每 conversation=1；部署级 provider 并发由管理员配置，避免新 UI 引爆额度。

发布回退关闭新入口，允许旧版本读取 additive schema；已接收 run 先排空或明确取消，再停 agent-worker。不用 DROP TABLE 回退。DB 恢复必须备份验证后由维护者执行。

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
旧执行 HTTP 已下线后的升级须协调 Web/API/agent-worker：部署前处理旧版本没有 runId 的运行中回合和待审批 checkpoint，不能自动迁移/批准或删除 fence。不可把旧客户端直接切回旧 POST 来“回退”；完整流程及尚缺的服务端 admission 开关、进程故障和 Playwright 验收见 `agent-app/docs/agent-runs-operations.md`。本地测试不是生产升级授权。
<!-- end -->

## 13. 与旧设计的关系

继续遵守 2026-08-17 creative、design knowledge、capability retrieval、interaction compilation 的确定性边界和签名交付。此设计有条件扩展其中“本轮仅首建”“不做原生预览”的范围；不撤销 legacy 保护，不复活已冻结且不能验证 KF 的 HTML preview 作为默认交付依据。

对应实施入口：`docs/superpowers/plans/2026-10-20-agent-app-next-master.md`。设计改变先修改本文件并记录理由，再同步受影响任务；不能由后续模型只在聊天中改口。
