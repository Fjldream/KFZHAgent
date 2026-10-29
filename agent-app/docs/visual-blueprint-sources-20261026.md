<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
# 视觉来源与蓝图候选一致性

**后续实施入口：** `visual-semantic-repair-20261026.md`。当前源码已升blueprint@7/semantic@12，语义有界一次修复、候选详情身份与原生独占归属已实施；最新回归、真实调用和交接步骤以该报告为准。下面@7/@8状态、75项文件清单和15次收费调用为上一轮封存记录，原27份JSON/hash未改。

**当前源码与结论：visual-blueprint@7 / visual-semantic@8。** 视觉来源、精确候选、分组/布局预校验、可选completion说明、有界蓝图一次修复和reason无损去重已实施。蓝图修复默认none、服务器可显式once；语义修复尚未实施，production vision关闭。须排空旧视觉任务和worker、整体升级并新建确认，同run-plan@7不代表支持混部。

**真实流程尚未跑通：** 本批6次独立验收共15次实际模型请求，最新一次已走完识图、蓝图及其一次修复、独立确认和工程模型请求，仍因语义输出不合法失败；无有效能源工程包、KF导入运行或1:1视觉结论。当前最新完整视觉PG/五种Chrome为292/292、编排器215/215、contracts560/560；它们使用fixture模型，不代表真实交付。完整API1016/1016是@5/@7阶段记录，后续增量和完整视觉回归分别列明，不声称最终全API重新全量通过。以下各版本及失败原事实按时间保留。

## 设计与范围

10月23日真实负例存在两个独立 ID 空间被混用，以及已接受视觉按钮/富文本没有进入相应蓝图候选的问题。不能靠失败后增加候选、OCR相同文字猜归属或删除门槛解决。

本批实施：蓝图区域可显式声明 `visualRegionIds`（1–100项、视觉ID原样引用），随完整蓝图展示、hash/HMAC和独立确认。文本/历史蓝图缺字段保持原形，不自动回填或改写旧证据。新版视觉模型输出必须完整分配每个未省略视觉区域，未知、重复归属、遗漏、省略项复用均拒绝。

已接受映射的真实 capability 只在**明确确认的蓝图区域**内被确定性保留，仍受真实知识/registry、5控件/3布局/25详情上限约束，不因模型输出失败而扩候选，不新增事件、数据源或执行权限。约束不可能满足时在蓝图发布/工程调用前拒绝，不产生一轮无效工程模型费用。

语义绑定的视觉ID与蓝图ID保持独立，所有节点/编译控件/快照 sourceMap 都再检查确认的页面区域归属。源映射不能被模型移动到其他区域来绕候选。模型输入明确列出视觉绑定义务，不包含 native ID。新版冻结协议整体升级，生产vision仍关闭。

先补10月23日受休眠影响的回归，再红绿测合同/检索/来源封口，接入原PG/审批/编译/下载链路。业务源与预算门槛继续暂缓；收费修复仅限新冻结且服务器显式once的蓝图，不引入隐藏语义重试。真实调用另行记录，不将fixture验收当作真实能源工程/KF运行或像素一致；最新阻塞与续做顺序见末尾“最新真实语义负例与交接”。

## 当前回归起点

2026-10-26 09:26:27，原 click-feedback / submitted engineering proof/result 三项定向复验通过（3 passed / 274名称筛选未执行）。09:27:10 原@4/@4完整API **1010/1010、零skip**，67文件、336.04s，五种Chrome均通过；既有lease cleanup WARN仍在。未修改超时、租约、fence或用例；无新收费调用，测试库已核对21完成迁移、零其他连接。此为本批改动前基线，不作为新合同最终验收。

## 实施结果与调用顺序

1. `BlueprintRegion.visualRegionIds` 为可选显式来源字段，单项1–128字符、最多100项、不可重复。旧文本蓝图缺字段不补默认值，旧hash保持；新版视觉输出必须完整覆盖所有未省略的视觉区域，包括容器和叶节点。每个视觉ID只能属于一个蓝图区域；图像ID与蓝图ID不可混用。
2. contracts 的 `resolveVisualBlueprintSources` 核对 specHash、映射/接受项的唯一性与成员范围，以及已接受的有效 capability。结构关联本身不是审批；服务端仍独立认证视觉确认与蓝图确认。省略项不可再引用，未接受项不可借来源获得能力。
3. 检索器只将显式关联中的已接受真实能力保留到对应页面/区域，不改变评分、registry支持、原交互要求和预算。缺上下文、能力不可用、超过5控件/3布局或25详情预算均拒绝；不按相同OCR或名字猜来源，不全局加button/richtext。对旧真实响应的测试另建明确单元批准分组，原负例文件和历史签名未改。
4. 蓝图服务在新输出和缓存发布前验证来源与可满足候选，authority 在保存/签名读取时再次验证。工程prepare及图节点始终使用服务器恢复的 `acceptedVisualPlanningInput.reference`；普通文字检索保持原路径。
5. semantic prompt 明确列出 `requiredVisualBindings={regionId,pageId,blueprintRegionId,requiredCapabilityId}`，其中regionId始终为视觉ID。语义节点归属、编译后的原生控件归属/能力、快照 sourceMap 完整覆盖都核对同一个独立确认的蓝图来源，不允许移到其他页面区域绕过候选。
6. 确认卡显示“参考图来源”，前端类型校验并保留该字段；来源随原蓝图hash、HMAC、独立批准传递。原actor/TTL/receipt/当前基线/租约/fence/事务CAS不变。

冻结协议升级为 **visual-blueprint@5 / visual-semantic@5**；视觉prompt hash加入 `kf-visual-blueprint-sources/v1`。必须排空旧视觉任务、整体升级worker并发起新确认；不能因同run-plan@7混部，也不能给旧Run手工补来源或改库重签。production vision仍关闭，repairPolicy仍为none。

## 回归证据

完整普通回归在收费验收前执行；收费后只新增了真实负例及其测试，没有再改运行代码。浏览器场景计入API套件，不重复累加：

| 套件 | 实际结果 | 本地起始时间/时长 |
| --- | --- | --- |
| 收费前API完整（@5/@5、5种Chrome） | 67文件，1014/1014，零skip | 09:48:13 / 348.05s |
| domain-client串行完整 | 70文件，1469 passed / 5原有skipped | 09:52:30 / 48.17s |
| 编排器完整（含PG恢复） | 19文件，214/214 | 09:54:17 / 10.47s |
| contracts完整 | 22文件，555/555 | 09:46:47 / 1.69s |
| Web完整 | 26文件，188/188 | 09:42:38 / 3.90s |
| 收费后观察/真实负例定向（含1项新用例） | 1文件，13/13 | 10:00:38 / 2.78s |

root/API/编排器/domain/contracts的tsc、Web vue-tsc通过。27份TS类型感知ESLint通过；测试helper不属于现有tsconfig，单独以CLI精确allowDefaultProject校验该文件，未关闭规则或修改lint配置。前端构建180模块，JS385.69kB/gzip131.96kB，CSS60.53kB。既有lease cleanup WARN仍出现，不宣称连接收尾系统问题已治。

最终完整API的Chrome证据统一前缀 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-visual-browser-`：static=`i75Edh`、click-feedback=`t8Rgkd`、workspace-data=`Ck4ZXY`、observe=`eZlfKZ`、observe-repeater=`qMTdyC`。这五项包含审批来源展示、真实编译/签名/快照/BuildExecutor/一次性下载与包内证明，模型仍是本地fixture，不是KF运行。收费后新测试与API tsc、改动测试文件ESLint也通过；未将13项再加到完整回归数中声称全量1015已跑。

新增覆盖：旧蓝图形状/hash不变；来源ID格式/数量/重复；真实负例下精确候选保留和预算；未知/遗漏/省略/未接受/错hash/重复映射/错误capability；六种必要控件超过区域上限拒绝；语义和独立编译原生控件跨区域拒绝；模型输入显式双ID空间；界面展示/坏来源拒绝；公共PG流程对缺失/未知/重复来源拒绝且不发布缓存、不调用工程、不构建。新增浏览器审批来源断言，原五种下载/native字节证明保留。

中间错误均已更正而未放宽产品：原浏览器夹具转发不存在的state字段，改用已接受视觉输入；无关区域测试忽略原有button候选，改为对照同一旧检索结果；Vue it.each数组参数被展开，改为对象用例；新增测试未使用参数导致tsc失败，删除无用命名。最后一次Web构建命令曾指向不存在的root vue-tsc，改用web本包安装；helper的project-service配置问题按上文单文件CLI处理。未增加timeout、跳过新用例或放宽fence。

## 本次真实模型验收（失败，已有推进）

按用户已有授权，在普通回归通过后只执行一次原opt-in正式验收，固定同一图片SHA与静态近似范围；09:54:49 / 53.05s，实际3次物理调用，没有自动重试。识图、独立蓝图确认、@5来源覆盖、精确候选、视觉语义绑定均通过，进入确定性原生编译，随后 `CREATIVE_SOLUTION_BLOCKED`。此测试1 failed / 280名称筛选未执行，不计入普通回归。

具体根因：模型把KPI三卡groupWith相互引用，已有 `validateGroupCycles` 正确拒绝 `LAYOUT_INPUT_INVALID: node-kpi-energy`。0x0是输入错误的默认详情，不能当作实际空间不足。当前语义结构校验没有提前检查同父groupWith循环，因此实现任务可记账SUCCEEDED/完成语义缓存，编译仍必须失败。这是下一片语义可编译性与受限修复要解决的明确缺口，不能把provider成功当工程成功。

只做过一次内存反事实：清除5个节点的分组声明后可编译通过，用于缩小阻断范围；未改变原文件、旧Run、签名事实或产品校验，未签名、入队、打包或交付该反事实计划。它不证明可自动删groupWith，也不证明布局或像素质量正确。

必要脱敏原事实存入 `tests/fixtures/energy-overview-20261023/live-layout-group-cycle/`（5JSON及README/hash），完整临时证据 `kf-energy-live-1dHuCy`。新增回归离线重放真实@5上下文/响应，证明来源和绑定通过，继而精确断言原编译器拒绝循环；没有把失败响应改成成功样例。账本如下：

| task | input/output | hit/miss | latencyMs |
| --- | --- | --- | ---: |
| vision | 1534 / 2947 | 1280 / 254 | 9952 |
| blueprint | 10434 / 2427 | 0 / 10434 | 13519 |
| implementation | 26662 / 7288 | 640 / 26022 | 22471 |

无客户端包、无KF导入运行/截图或1:1结论。单样本不能证明缓存或降本目标达成；成功且质量合格交付数仍为0，不计算“每次合格交付成本”。此后停止付费调用，未改.env或真实凭据。

## 下一模型执行顺序

下面第2/3项中的基础分组与直接布局提示已在本批继续实现，现行实现和复验见下一节；后续不要重复这一层。受限可信修复尚未实现，repairPolicy仍为none。

1. 先读本报告、真实负例README、design §10和P4/T22。不要重新实现上传/差异/独立蓝图/五类下载，旧@4失败回归已补齐，不按历史注记盲目付费重跑。
2. 先红测groupWith的同父兄弟约束、自引用、重复引用、双向/多节点循环及合法单向DAG。对照现有布局编译器门槛，设计共享的早期可编译性校验与包含页面/节点/字段的有界错误；不能只靠schema全局节点存在检查或把0x0误判为排版尺寸问题。模块slot/repeater展开的作用域要与真实编译一致，不能另写一套宽松投影。
3. 明确给模型groupWith语义：同父、无循环，不是为同一行所有卡片互填对方ID；不需要显式分组时输出空数组，网格/行列应由既有layout表达。prompt/hash/冻结合同改变须升级并整体排空；不能修改这次已冻结@5任务的提示或缓存。提示词改善不能代替输出校验，也不能据此宣称任意图可用。
4. 若实施受限语义修复，先更新设计/任务与冻结policy。原 `repairPolicy=none` 不得偷偷触发请求；新policy需明确最多次数、task/route/prompt/hash、使用量/原因及cache身份。沿已签engineering continuation、同一批准蓝图/精确候选/完整视觉来源、当前actor/外发许可/base/活跃lease/fence恢复；不能接受客户端错误报告或把修复当新权限。发送最小结构化错误与必要原语义上下文，不重复外发图片或扩大数据源/动作/组件集合。新输出必须重跑完整语义/来源/候选/编译/provenance/native/snapshot门槛；失败即停止，不自动删业务区域、groupWith或更换已确认映射。缓存恢复、取消、撤权、篡改、重复请求及次数上限都需负例。
5. 离线真实负例、相关完整回归和五类浏览器先绿，再按已有授权进行新的有上限真实能源验收；每次记录实际请求数/版本/usage/失败，不把重放历史响应当新的有效Run。只有真实计划通过全部门槛且真正BuildExecutor产出包，才验证包hash、原生来源/文字/组件与交付。
6. 有有效包后，再到已授权KF443测试环境只新建独立验收工程，先确认版本/导入方式并处理测试证书访问；不覆盖原工程/用户数据或改远端服务。记录真实导入、运行、关键页面截图与目标图对照，才评价视觉和客户端可用性。测试环境凭据只从安全本地配置取，不抄聊天密钥到仓库。

业务源和预算继续暂缓。T22/整体计划未完；T17/T23及T24–T27、生产灰度/迁移/回退/资源/多副本专项按原计划另验，不以本批普通回归替代。

## 分组与布局预校验（该阶段blueprint@5 / semantic@7）

第一次真实失败后继续实施，未修改原响应/已失败Run，也没有自动删边交付：

- `validateVisualLayoutGrouping` 在视觉语义结果发布/cache前核对同父兄弟、自引用、重复引用、双向/多节点循环；递归包含layout子树、module各slot和repeater模板，以及页面/浮层根。保留合法单向DAG且不修改任何groupWith值；原编译器的同类检查继续存在，注册模块与重复展开的原生证明不放宽。
- 新增11项领域用例：合法DAG与不变性，7类非法引用、两类嵌套作用域，以及错误直接control能力。实际@5响应在当前validator会提前以 `VISUAL_LAYOUT_GROUP_INVALID` 失败；新的PG/provider集成负例确认只调用一次、不发布COMPLETED语义缓存、不创建BuildJob、无隐式修复。
- 进一步只在内存清除旧负例的5个分组声明做诊断，发现6个绑定虽能编译布局，实际发出的layout capability不等于已确认映射：content、三张KPI卡、devices、summary。不能把“编译通过”当视觉绑定已证明。新语义门槛会提前拒绝不兼容的直接layout/control；最终compile/provenance/native/sourceMap仍核对实际发出的精确能力，兼容列表不当作已经发出。
- 模型输入 `requiredVisualBindings.directLayoutKinds` 直接使用公开的原编译器 `layoutCapabilityIdsFor`，只列出唯一发出目标能力的类型（例如layout.2对应row，layout.4对应column/stack/scroll-region）。不维护另一张宽松映射表，不把grid等可选多能力类型的兼容列表当保证。提示说明必要时可采用合法row外容器包裹column内容并精确绑定外层，既有来源/候选/布局门槛保持；不会替模型自动改树。
- 冻结语义先升@6（分组），补完布局类型提示/前置检查后最终为 **visual-semantic@7**；hash加入layoutGroupingVersion和layoutBindingVersion。蓝图保持@5，repairPolicy保持none、production vision关闭。旧@5/@6失败任务不可补字段/改缓存继续；部署必须排空整体升级并重新发起。

中间复验记录：分组红测10项先因缺函数失败，接入后53项视觉领域测试通过；最终领域完整 **1480 passed/5原有skip**（70文件，10:14:11 /47.07s），contracts **555/555**（22文件，10:16:07 /1.95s），新API定向13项（10:15:38 /2.76s）与类型检查通过，28份TS（含helper单独配置）lint通过。完整API最终结果另见本节后续记录；没有把定向筛选未执行算成全量通过。

10:08:28中间完整回归 **999 passed/2 failed/15未执行、1套件初始化失败**（353.19s）。其中测试文件在运行中被继续更新，造成两项用例与当时加载的旧模块不一致；另有编排器套件遗留的假排队作业触发 `RUN_FLOW_REQUIRES_CLEAN_BUILD_QUEUE`。此批不是任何最终版本的有效完整验收，没有放松队列保护。10:14后在旧库误发起的新批次已核对本任务Vitest进程后SIGINT停止（exit130），未终止试用服务。

随后新建独立库 `kf_agent_test_visual_binding_20261026_1015`，仅向该空库deploy已有21条迁移；未新增/修改迁移，未动旧试用库。最终@5/@7完整API固定源码在新库执行，编排器完整复验使用旧隔离库，二者不共享队列/清理操作。旧@4与来源@5回归、五份真实原事实仍保留。

新库10:16:06第一轮固定@5/@7全量为 **1008 passed/8 failed**（67文件，369.39s），五种Chrome均通过，但8个语义gateway/cache/recovery用例共用的旧golden标题为text，而本套实际确认映射为richtext；新增精确控件校验正确拒绝了不一致。只修正式模型double的提案：从已签接受映射选择text/richtext填入标题，与现有浏览器夹具一致；不改golden文件、真实响应或产品校验。10:23:28语义/循环定向 **23 passed/258名称筛选未执行**（22.73s），API tsc/lint通过。10:24最终全量前只读核对新库待运行BuildJob=0；本节后续最终记录才是当前完整结论。

10:25:04后续全量 **1015 passed/1 failed**（387.93s，五种Chrome通过），剩余旧负例“unmatched visual control”隐含依赖前述错误夹具；夹具修正后变成合法请求，进入构建等待却没有负例执行器执行job，触发原5000ms超时。将该负例明确注入相反的text/richtext控件，验证当前实际接受映射不匹配时失败/零快照/零BuildJob，不改产品、不放宽超时。10:32:40该项 **1 passed/280名称筛选未执行**（5.69s，测试本体2.21s），API类型/lint通过，队列再次只读为0后才重跑全量。

### 最终固定版本回归

| 套件 | 最终实际结果 | 本地起始时间/时长 |
| --- | --- | --- |
| API完整，blueprint@5/semantic@7 | **67文件，1016/1016，零skip** | 10:33:39 /335.86s |
| domain-client完整 | **70文件，1480 passed/5原有skip** | 10:14:11 /47.07s |
| 编排器完整，独立旧隔离库 | **19文件，214/214** | 10:17:18 /12.26s |
| contracts完整 | **22文件，555/555** | 10:16:07 /1.95s |
| Web完整 | **26文件，188/188** | 10:19:31 /3.78s |

API/root/domain/编排器/contracts tsc、Web vue-tsc、最终28份TS类型感知lint（helper单独配置）通过；Web生产build仍180模块、JS385.69kB/gzip131.96kB、CSS60.53kB。最后只修了测试夹具的明确正负提案，未再改产品运行代码或放宽断言。各轮失败如上保留，不将定向测试重复算入最终1016。

最终五种Chrome证据统一前缀 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-visual-browser-`：static=`hjPeyk`、click-feedback=`fO4Shl`、workspace-data=`wlAorP`、observe=`IAouOT`、observe-repeater=`4vpK53`。全部经过真实编译/签名/快照/BuildExecutor/一次性下载与包内证明，provider仍为fixture，不是能源图真实交付/KF质量证据。旧lease cleanup WARN在本批中间轮仍出现，未声称根因已治。

## 后续真实取样与蓝图说明字段修正

全量1016通过后执行一次@5/@7真实验收：10:39:55 /15.33s，1物理调用，6个静态展示行被识别成table，当前目录不支持，因此在识图确认处停止，没有自动删除业务行。原事实3JSON/hash存于 `live-unsupported-static-rows/`。人工对照原图后，仅为固定演示图新增可显式启用的operator review选项，走原签名revision/重新确认，不是生产table→content自动fallback；文字、数值、状态、层级均保留，未知区域仍由原guard拒绝。

再以新Run开启该限定场景取样：10:47:55 /35.46s，2物理调用；本次vision自然返回可映射角色，**实际0修订**，识图/接受通过，蓝图仅缺journeys[0].completion而被旧@5合同拒绝，未进入工程。4份原JSON/hash在 `live-blueprint-missing-completion/`，未改写或审批旧失败事实。

代码核查completion只作为说明字段声明，未参与检索/编译/交互/观察证明。设计先同步，再将该字段可选化，缺字段原样保留，若提供仍保留原类型/非空/长度校验；不填默认完成结果，steps/result/expectedTexts/页面区域/来源/候选/原生门槛保持。冻结blueprint升@6、semantic仍@7；模型prompt明确展示说明与执行要求的区别。新真实负例可以**原样**通过全部45来源和17候选详情，不需要删字段或补业务内容。缓存/旧Run不重签，需新建确认。

后续contracts **560/560**（22文件，10:54:23 /1.98s），5项新用例包括缺说明保持缺键、显式blank/null/number拒绝、缺实际steps仍拒绝；API请求/语义/真实负例定向 **147/147**（3文件，同起点 /5.15s）及API类型检查通过。Web **188/188**（26文件，10:55:55 /4.88s）、vue-tsc/build和最终改动文件lint通过。@6/@7视觉PG/五种Chrome与后续真实结果继续记录，不把增量测试伪作完整1017已运行。

@6/@7完整视觉PG流程 **281/281、零skip**（10:55:54 /192.44s）通过。五种Chrome后缀依次为 `4cgHGD`、`Qwqzeq`、`198MPo`、`hwLO3O`、`rxIvGR`（同上统一前缀，顺序static/feedback/workspace-data/observe/repeater），仍是fixture模型，真实native/sign/snapshot/build/download。production vision关闭、repairPolicy=none、整体排空升级和18对21试用库保护保持。

## 有界蓝图修复（该阶段blueprint@7 / semantic@7）

10:59:30新@6/@7验收2物理调用后，蓝图schema通过，但缺root/content两个未omit容器来源，正确停止于VISUAL_BLUEPRINT_SOURCE_MISSING。原4JSON/hash见 `live-blueprint-missing-source/`，没有工程调用/包/KF结论。本批到这里累计8次真实物理调用（3+1+2+2），没有自动重试；之后先实现受限反馈，而不继续随机重跑识图。

新blueprint@7冻结 `repairPolicy=none|once`，默认none，服务端 `KF_VISUAL_BLUEPRINT_REPAIR=once` 才配置once且允许实际修复；未知配置关闭视觉规划runtime。production vision仍关闭。semantic@7仍无语义修复。旧@6任务不可修改为once，整体排空升级并新建确认；独立蓝图批准保持。

只对未截断、可解析且有界的新提案的schema/来源/区域分组错误允许一次附加调用；完整性错误会附带缺失ID。纯JSON语法失败、截断、缓存损坏、上下文/权限/取消/租约/路由错误不触发修复。不改已接受视觉输入或候选预算，最终仍完整验证，不自动删字段/区域或补来源。修复发送结构化错误与原未批准草稿，不重发图片，沿原route和稳定system前缀，hash绑定原请求与反馈；最大draft32KiB、最多8项错误、原总输入上限仍在。

在活跃Run锁内预留唯一 `visual-blueprint-repair-v1` 额度，现有task=repair/promptVersion=visual-blueprint-repair@1独立记账。任何既有额度或该修复账本都阻止再修，包含新owner恢复、额度记录缺失但账本仍在的情形。预留/发送前和发布前复核原签名continuation/actor/current permission/base/lease/fence，修复状态与最终结果缓存同事务完成；迟到响应不能覆盖。失败/未知状态不归还额度，初次调用原有崩溃重发语义不承诺恰一次；已COMPLETED缓存仍严格读取，不重新解释或修复。

首轮PG定向 **17 passed/274名称筛选未执行**（11:15:07 /14.06s），覆盖默认none、一次成功+缓存、修复失败后新owner恢复、额度删除账本兜底、初次与修复中撤权/取消/陈旧fence、截断/当前server禁用；后补已提交缓存不修复用例。请求/反馈/运行配置单元7项通过（11:22:25 /2.94s），API tsc和本批TS lint通过。两处多余类型断言已删除，未关闭lint规则。完整视觉回归/后续真实验收另记。

@7/@7完整视觉PG及五种Chrome **292/292、零skip**（11:26:25 /202.03s），API五文件定向 **181/181**（11:26:26 /8.42s）、API/root类型和本批lint通过。Chrome后缀为JKgPS6/y0c6vg/glAWXm/OHW8W6/OwKzKM（同前缀和场景顺序），仍为fixture模型，不是能源真实交付。

之后11:32:12 /39.73s的真实新验收实际3调用：vision、blueprint、repair。初次漏root/main/bottom-row三容器，**一次修复成功**，完整有效蓝图独立确认通过；没有工程模型外发，工程准备因129435字节超过128000上限而失败。本轮operator修订实际0。六份原事实/hash及边界见 `live-engineering-prompt-limit/`。修复输入11756、输出2765、hit9344/miss2412、11529ms；展示前缀复用实测，不宣称有合格交付或整体降本。

## 视觉说明无损去重（当前blueprint@7 / semantic@8）

保留原128000字节/候选/输出/执行限制，仅在模型输入中对mappings和acceptedDifferences的reason重复字符串做本对象textDictionary索引，ID/角色/文本/几何/映射/选择及理由原文的关联完整保留。仅当序列化比原结构更小才选投影，唯一文本多时仍发原结构。模型规则明确索引含义，冻结hash加投影版本；服务校验/HMAC/原生/快照继续用原始reference。真实同一输入从129435降至120713字节（少8722字节），可逐项还原且canonicalHash相同。

原真实请求已作为离线回归，API定向 **151/151**（4文件，11:42:20 /5.05s）和类型/lint通过，涵盖完整可逆、不修改原数据、保留原上限、独特reason不做反向膨胀。编排节点另保留VISUAL_SEMANTIC_CONTEXT_TOO_LARGE为准备容量错误，不再把这个已知错误当模型输出错误，也不回退文字；相关20项通过（11:42:51 /1.61s），完整编排器 **215/215**（19文件，11:45:38 /10.61s）。后续视觉完整回归与真实结果再列，不把定向数加到完整API中。

## 最新真实语义负例与交接

最终@7/@8完整视觉PG/五种Chrome **292/292、零skip**（11:45:35 /202.47s），完整contracts **560/560**（22文件，11:45:36 /1.65s）及类型检查通过。Chrome证据统一前缀 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-visual-browser-`，static/feedback/workspace-data/observe/repeater后缀依次ScxSEH/3PVEAS/cbzX8E/6q2gwh/PxVhqI。均为fixture模型、真实native/sign/snapshot/BuildExecutor/下载字节证明，不是实际能源工程或KF验收。Web最近完整188/188和vue-tsc/build通过，domain最近1480 passed/5既有skip；详见前文时间点，不合并成未执行的最终全API结果。

随后11:51:11 /65.35s新真实验收4次物理请求（vision、blueprint、repair、implementation），蓝图一次修复再次成功并独立确认，工程请求已实际发出，不再卡原129435字节准备错误。工程原返回只有type/plan/bindings，type为json_object，缺严格schema标识，运行失败INVALID_MODEL_OUTPUT。provider账本SUCCEEDED仅说明请求完成，不代表计划、编译或工程成功。原事实5JSON及hash见 `tests/fixtures/energy-overview-20261023/live-semantic-envelope/README.md`。没有BuildJob/能源工程包，没有连接KF测试环境。

仅在内存中对原回复逐层诊断，未写缓存、签名或发包：只修外层封装后仍缺35处eventBindings；补空集合后仍有main布局类型与已接受layout能力不符；将布局包在精确row节点后，严格语义检查可通过，但原生编译拒绝header-divider图像控件最低200×200与可用2×765冲突。这些反事实不是已实现的自动修复，也不是授权过的历史结果，不能把改过的计划当交付。新增原封装及缺事件数组负例；13:13:54离线文件16/16（2.83s）、API tsc通过。至此本批累计15物理调用（3+1+2+2+3+4），停止追加收费请求；无合格交付，不能宣称整体缓存或单位交付成本目标已达成。

交接执行顺序：

1. 先以该原负例设计语义输出的受限格式修复和空集合规则。是否接受封装别名、何时允许空事件集合须显式版本化，不能通用删字段、默认为动作已授权或放宽原严格合同；保留红绿用例。
2. 实施**有界一次语义修复及原生编译反馈**。可复用蓝图修复额度/账本模式，但新增冻结语义policy/version且默认关闭；唯一RunStep及repair账本限制次数，恢复/取消/撤权/陈旧fence/缓存损坏均有负例。语法/schema/来源/布局/尺寸使用受限结构化错误，反馈携带必要原计划，不重发图片，不扩大已批准blueprint、精确候选、来源、动作或数据范围；容量不足应缩小必要反馈而非提高上限。发送、返回、发布继续核对actor、continuation、许可、基线和lease/fence。
3. 编译预检与最终编译必须使用同一真实registry/资产/候选并保持无副作用；修复后重新执行语义、分组、来源、候选、原生编译、provenance、snapshot和制品证明。错误布局或装饰尺寸由新提案修正，不能自动删除业务区域/分组或手改历史成功缓存；修复失败即停止。蓝图一次修复已完成，不要重复实现。
4. 离线负例和PG/五种Chrome通过后，再做有次数上限的全新真实验收；必须得到合法native客户端工程包并检查内容，才进入用户已授权KF443的隔离新工程导入、运行、截图和视觉对照。当前没有包，不提前声称试用/1:1/端到端验收完成。
5. T22及总体计划保持IN_PROGRESS，T17/T23/T24–T27其余未完成项仍以总计划为准；预算和业务源继续暂缓。production vision继续关闭；受保护试用库18对源码21的迁移保护保持，禁止reset/seed/重启或替换旧服务。测试库只部署已有21条迁移，未新增迁移或依赖。

收尾核对：最新真实负例文件16/16、API类型检查和该文件ESLint通过；本批75项文件清单均存在且无重复，48个当日标注文件均包含在清单中，限定这些路径的git diff --check通过。27份原JSON均可解析并完成敏感内容检查，证据hash另按README核对。两个隔离测试库最终均为21条完成迁移、零其他连接；未访问或修改受保护试用库，未进行KF远程操作。

## 本批文件清单

以下路径均相对仓库根目录，交付时保持完整目录结构。只列本批实际修改/新增文件，不代表可从当前脏工作区整体复制其他修改。

```text
agent-app/packages/contracts/src/solution-blueprint.ts
agent-app/.env.example
agent-app/packages/contracts/src/solution-blueprint.test.ts
agent-app/packages/contracts/src/visual-blueprint-sources.ts (新增)
agent-app/packages/contracts/src/index.ts
agent-app/packages/contracts/src/generation-snapshot.ts
agent-app/packages/contracts/src/visual-review.ts
agent-app/packages/contracts/src/visual-blueprint-authority.ts
agent-app/packages/domain-client/src/planning/capability-retrieval.ts
agent-app/packages/domain-client/src/index.ts
agent-app/packages/domain-client/src/planning/visual-blueprint-candidates.test.ts (新增)
agent-app/packages/domain-client/src/visual/visual-plan-constraints.ts
agent-app/packages/domain-client/src/visual/visual-plan-constraints.test.ts
agent-app/packages/agent-orchestrator/src/ports.ts
agent-app/packages/agent-orchestrator/src/nodes/capability-retrieval.ts
agent-app/packages/agent-orchestrator/src/nodes/solution-implementation-plan.ts
agent-app/packages/agent-orchestrator/src/nodes/solution-implementation-plan.test.ts
agent-app/apps/api/src/conversations/graph-ports.ts
agent-app/apps/api/src/conversations/deepseek-model.ts
agent-app/apps/api/src/conversations/observation-journeys.test.ts
agent-app/apps/api/src/vision/visual-blueprint-request.ts
agent-app/apps/api/src/vision/visual-blueprint-request.test.ts
agent-app/apps/api/src/vision/visual-blueprint.service.ts
agent-app/apps/api/src/vision/visual-blueprint-runtime.ts
agent-app/apps/api/src/vision/visual-blueprint-output.ts (新增)
agent-app/apps/api/src/vision/visual-blueprint-output.test.ts (新增)
agent-app/apps/api/src/vision/visual-review.service.ts
agent-app/apps/api/src/vision/visual-blueprint-authority.ts
agent-app/apps/api/src/vision/visual-semantic-request.ts
agent-app/apps/api/src/vision/visual-semantic.service.ts
agent-app/apps/api/src/runs/visual-run-flow.integration.test.ts
agent-app/apps/web/src/types.ts
agent-app/apps/web/src/components/runs/MessageBubble.vue
agent-app/apps/web/src/components/runs/MessageBubble.test.ts
agent-app/tests/helpers/visual-blueprint-sources.ts (新增)
agent-app/tests/fixtures/energy-overview-20261023/live-layout-group-cycle/reference-review.json (新增事实)
agent-app/tests/fixtures/energy-overview-20261023/live-layout-group-cycle/accepted-differences.json (新增事实)
agent-app/tests/fixtures/energy-overview-20261023/live-layout-group-cycle/blueprint.json (新增事实)
agent-app/tests/fixtures/energy-overview-20261023/live-layout-group-cycle/provider-reply.json (新增事实)
agent-app/tests/fixtures/energy-overview-20261023/live-layout-group-cycle/result.json (新增事实)
agent-app/tests/fixtures/energy-overview-20261023/live-layout-group-cycle/README.md (新增)
agent-app/tests/fixtures/energy-overview-20261023/live-unsupported-static-rows/reference-review.json (新增事实)
agent-app/tests/fixtures/energy-overview-20261023/live-unsupported-static-rows/provider-reply.json (新增事实)
agent-app/tests/fixtures/energy-overview-20261023/live-unsupported-static-rows/result.json (新增事实)
agent-app/tests/fixtures/energy-overview-20261023/live-unsupported-static-rows/README.md (新增)
agent-app/tests/fixtures/energy-overview-20261023/live-blueprint-missing-completion/reference-review.json (新增事实)
agent-app/tests/fixtures/energy-overview-20261023/live-blueprint-missing-completion/accepted-differences.json (新增事实)
agent-app/tests/fixtures/energy-overview-20261023/live-blueprint-missing-completion/provider-reply.json (新增事实)
agent-app/tests/fixtures/energy-overview-20261023/live-blueprint-missing-completion/result.json (新增事实)
agent-app/tests/fixtures/energy-overview-20261023/live-blueprint-missing-completion/README.md (新增)
agent-app/tests/fixtures/energy-overview-20261023/live-blueprint-missing-source/reference-review.json (新增事实)
agent-app/tests/fixtures/energy-overview-20261023/live-blueprint-missing-source/accepted-differences.json (新增事实)
agent-app/tests/fixtures/energy-overview-20261023/live-blueprint-missing-source/provider-reply.json (新增事实)
agent-app/tests/fixtures/energy-overview-20261023/live-blueprint-missing-source/result.json (新增事实)
agent-app/tests/fixtures/energy-overview-20261023/live-blueprint-missing-source/README.md (新增)
agent-app/tests/fixtures/energy-overview-20261023/live-engineering-prompt-limit/reference-review.json (新增事实)
agent-app/tests/fixtures/energy-overview-20261023/live-engineering-prompt-limit/accepted-differences.json (新增事实)
agent-app/tests/fixtures/energy-overview-20261023/live-engineering-prompt-limit/blueprint.json (新增事实)
agent-app/tests/fixtures/energy-overview-20261023/live-engineering-prompt-limit/initial-provider-reply.json (新增事实)
agent-app/tests/fixtures/energy-overview-20261023/live-engineering-prompt-limit/repaired-provider-reply.json (新增事实)
agent-app/tests/fixtures/energy-overview-20261023/live-engineering-prompt-limit/result.json (新增事实)
agent-app/tests/fixtures/energy-overview-20261023/live-engineering-prompt-limit/README.md (新增)
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-envelope/reference-review.json (新增事实)
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-envelope/accepted-differences.json (新增事实)
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-envelope/blueprint.json (新增事实)
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-envelope/provider-reply.json (新增事实)
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-envelope/result.json (新增事实)
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-envelope/README.md (新增)
agent-app/docs/visual-blueprint-sources-20261026.md (新增)
agent-app/docs/visual-repeater-observation-20261023.md
agent-app/docs/agent-runs-operations.md
docs/superpowers/plans/2026-10-20-agent-app-handoff.md
docs/superpowers/plans/2026-10-20-agent-app-next-master.md
docs/superpowers/plans/2026-10-20-agent-app-p4-vision.md
docs/superpowers/specs/2026-10-20-agent-app-next-design.md
```

## 复验命令与环境边界

使用仓库自带Node24，不依赖本机默认node；以下命令在 `agent-app/apps/api` 执行。同库数据库测试必须串行。最终API用新库 `kf_agent_test_visual_binding_20261026_1015`，编排器用旧隔离库 `kf_agent_test_review_flow_20261023_1245`；普通回归禁止live opt-in，不将编排器留下的假作业混入全局构建流程套件。前述其他包从相应包目录运行同一vitest/tsc入口。

```sh
LANGCHAIN_TRACING_V2=false LANGSMITH_TRACING=false KF_LIVE_VISUAL_ACCEPTANCE=disabled KF_VISUAL_BROWSER_TEST=1 COOKIE_SECURE=true TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_visual_binding_20261026_1015 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --reporter=dot
```

本批第一次真实验收（@5/@5）实际命令如下；这是已执行的有费opt-in记录，不可放入普通CI自动执行。当前@7/@8若再验收须使用上文新库和新建Run，蓝图修复仅显式KF_LIVE_BLUEPRINT_REPAIR=once时允许，不能恢复旧失败任务：

```sh
LANGCHAIN_TRACING_V2=false LANGSMITH_TRACING=false MODEL_PORT_MODE=fake KF_LIVE_VISUAL_ACCEPTANCE=energy-overview-20261023 TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_review_flow_20261023_1245 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node --env-file=../../.env ../../node_modules/vitest/vitest.mjs run src/runs/visual-run-flow.integration.test.ts -t 'accepts the generated energy UI through real DeepSeek and the native engineering pipeline' --reporter=dot
```

最终只读核验该隔离库21完成迁移、零其他连接。

原试用库 `kf_agent_e2e_trial_20261021_01` 及用户数据仍按18迁移状态保护，源码21迁移；本批未新增/修改schema或迁移，仅向新空测试库部署既有21迁移。无依赖、实际.env/key、常驻试用进程或远端KF操作，无git提交/重置。后续灰度需要独立协调expand和排空升级，不直接用新源码重启旧库。业务源/预算暂缓，T22/整体计划仍IN_PROGRESS。
<!-- end -->
