<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
# 视觉语义一次修复与原生编译反馈

**当前源码blueprint@7 / semantic@12、语义repair@2。** 有界一次语义/语法修复、原生编译预检、候选详情身份修正及真实组件独占归属已实施。@12完整视觉PG/五种Chrome311/311、相关四文件162/162及类型/lint通过；完整API1057/1057是@10阶段结果。真实一次修复已两次修正JSON，但最新仍因布局容器样式字段与布局能力不符而停止，无能源工程包/KF运行/1:1结论。下面各阶段与原事实不改，下一步具体任务见末尾。

## 本轮设计

接续visual-blueprint-sources-20261026.md，修复真实工程阶段，不接业务源或预算。旧real回复与hash保持原样；type=json_object封装、缺eventBindings、main布局能力和header-divider尺寸都由新提案修正，不自动把旧回复转成授权结果。

冻结语义初版visual-semantic@9、后续候选身份修复后为@10，新增repairPolicy=none|once，默认none。服务器KF_VISUAL_SEMANTIC_REPAIR=once和已签continuation中的once必须同时成立才可追加一次请求；未知配置关闭语义runtime。旧任务/worker排空后整体升级并重新确认，production vision继续关闭。蓝图协议保持@7。

新provider JSON先走原严格语义、候选、完整来源绑定和同一原生编译器预检，预检使用当前工作区资产事实、真实registry和原候选。成功预检不替代后续独立工程审批、provenance/native/sourceMap/snapshot/制品检查。原生尺寸/分组失败在语义缓存COMPLETED之前拒绝。

只对未截断、64KiB以内的新草稿产生受限反馈，最多12项。初版要求可解析；@11额外允许finishReason=stop且原文本trim后以{开头、}结尾的语法错误，原文JSON序列化大小仍不超64KiB，作为字符串数据修复，不猜括号。partial/length/unknown/网络/缓存/上下文/权限/取消/过期/路由错误不修复。格式诊断允许在私有副本上只补缺少的事件空集合以暴露后续布局/编译错误，但副本永不成为成功结果；原输出仍须由模型明确重写为严格封装并填齐事件数组。合法非空事件保持，未知字段/错误值不丢弃。诊断失败关闭，不将诊断副本写缓存、签名或入队。

修复请求发送完整失败草稿、原批准蓝图、完整候选只读投影、资产目录和全部来源/能力/交互/数据义务，绑定原请求hash；不重复发送图片、识图冗余reason或任意历史。能力详情包含当前真实minimumSize；默认发送全部详情，仅在完整请求超限时保留草稿实际使用及全部绑定要求的能力/recipe详情，标明detailScope，完整候选身份/顺序/hash/授权范围不变。未使用详情属于修复线索而非授权门槛，服务端仍校验完整原候选。保留128000字节上限、原route、输出上限和稳定system前缀，若必要上下文仍超限则停止，不截断业务内容或扩大上限。返回完整kf-visual-semantic-plan/v1 JSON，不接受patch、别名封装或任意字段删除。

使用唯一visual-semantic-repair-v1 RunStep原子占用额度，task=repair/promptVersion=visual-semantic-repair@1单独记账；任何额度或同修复账本均阻止再次修复，包括新owner恢复和额度行缺失。发送前/返回后/提交前重核actor、continuation、当前许可、基线和lease/fence，修复完成标记与最终语义缓存同事务提交；迟到响应不得覆盖。失败/未知不退还修复额度，初次调用保留现有崩溃恢复语义，不承诺物理请求恰好一次。缓存只严格读取，禁止以新修复逻辑重解释历史COMPLETED事实。

## 验证与交付顺序

1. 原真实负例验证完整格式/事件/布局/尺寸反馈、只读及请求容量；非法字段、截断、过大草稿、错误配置均拒绝。
2. PG覆盖none零修复、once一次成功/失败、缓存恢复/损坏、额度+账本限次、取消/撤权/陈旧fence/并发及实际编译预检。
3. 相关类型/lint、完整视觉PG/五种Chrome及受影响包回归；普通CI禁用live opt-in。
4. 上述通过后才做有上限的全新真实模型验收，合法包校验后才进入KF443隔离新工程验收。无实际包/运行截图前保持T22与总体IN_PROGRESS。

受保护试用库与旧服务不动；只用已有21迁移的独立测试库，同库重置套件串行。实现和最终证据继续记录于本文，不将计划文字当完成事实。

## 实施及中间验证

已接入冻结none/once、服务器开关、continuation与worker配置一致性检查、一次额度/账本、完整原生编译预检和缓存严格读取。原真实响应仍拒绝，私有诊断一次可反馈封装、35处事件集合、main布局能力与header-divider尺寸；未改变旧JSON/hash。模型提示明确schema与事件数组必填，反馈提供真实minimumSize。

13:24:18新增用例先因缺实现红；13:27:39初始3项绿。新增模块误从API未声明的zod依赖导入，已改为识别现有schema错误，无新增依赖；类型/lint检查发现的unknown数组问题用显式unknown类型守卫修复，未关闭规则。

首轮PG定向13:28:26为34通过/1失败/271名称筛选未执行（36.97s）：大管理台草稿连同全部能力详情超原128000字节上限，产品正确停止。修复为仅在超限时收缩未使用的能力详情，完整候选/蓝图/失败草稿仍保留；原生尺寸反馈测试同时核对候选hash和范围未变。13:30:49定向35通过/271名称筛选未执行（37.06s）。追加默认none编译失败、修复中并发及语法损坏负例后，执行完整视觉/Chrome回归，结果另记。

API三文件定向149/149（13:31:06 /5.51s）及API类型/lint通过；contracts完整560/560（22文件，13:32:23 /1.52s）、编排器完整216/216（19文件，13:32:25 /9.94s）及类型通过。普通测试均禁用真实模型，不合并声称完整API通过。

代码审查再加信任上下文损坏负例，13:33:33确认先红（1失败/4名称筛选未执行，2.64s）：反馈分类不应把任何VISUAL前缀错误都当模型可修复问题，即使服务prepare已经验证过签名。后续加纯预检与明确输出错误白名单，最终复验另记。

13:32:26完整视觉PG/五种Chrome **309/309、零skip**（212.27s）通过，模型为fixture。证据统一前缀 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-visual-browser-`，static/feedback/workspace-data/observe/repeater后缀TSxeDU/BNkw9p/rR659S/jVG5TC/20QNMK。随后才做信任上下文和原请求一致性封口；没有在该完整回归运行期间修改其执行源码。

13:35:30原请求与修复上下文不一致负例也先红（1失败/4筛选未执行，2.62s），已补逐项scope与重建原messages的hash一致检查，不只比较system。信任上下文/资产元数据在输出前纯校验、模型错误分类改明确白名单；13:36:32三文件 **150/150**（5.17s）通过。类型检查最初发现exactOptionalPropertyTypes不允许显式undefined可选属性，已改条件构造；后续API类型和当前文件lint通过。

原真实样本在当前提示下初次请求119278字节、完整修复请求126492字节，detailScope=all-candidates，无需缩减任何能力详情。另管理台超限用例验证draft-and-required-capabilities范围内保留完整候选身份/hash和真实minimumSize；仍超限时返回明确VISUAL_SEMANTIC_REPAIR_CONTEXT_TOO_LARGE，图节点不回退文字或自动加调用。

完整API最终复验前，只读发现上一轮独立视觉套件留下20个QUEUED夹具作业。这些套件按新工作区隔离而非每项全库重置；若直接启动全局调度会干扰其他API用例。明确校验独立库名、21条迁移和零其他连接后，只清理该测试库33张业务表并保留迁移表，队列归零；未连接受保护试用库。之后固定源码执行完整API/五种Chrome，最终结果另记，不用中间视觉309或定向150替代全量。

## 完整回归与真实联调

第一轮完整API 13:37:39 /352.96s为 **1053通过/2失败**（69文件）。两个失败分别是feature-policy最后一项beforeEach的401与legacy-routes的socket hang up；语义/原生及五种Chrome通过。13:44:21两文件定向 **15/15**（5.03s）通过，未修改鉴权、会话、超时、租约或测试断言；没有证据宣称首次失败根因已修复。队列只读再次归零后，保持产品源码与普通测试参数重跑，逐项JSON结果保留。

最终完整API **69文件1056/1056、零skip**（13:46:09 /354.53s），日志 `/tmp/kf-semantic-repair-api-final-20261026.log`、逐项结果 `/tmp/kf-semantic-repair-api-final-20261026.json`。完整五种Chrome后缀XOyRVu/kj4aqX/wDIcHY/nUvgob/xcPTUp（同前缀与场景顺序）；均为fixture模型，不是能源真实交付。旧lease cleanup WARN保留，未宣称消除。完整复验期间产品源码未再改变，只继续实现付费opt-in固定图审阅辅助及离线用例；未让旧路由/鉴权失败靠改产品断言通过。

编排器完整216/216、contracts560/560和类型通过，API最后类型及改动文件lint通过；固定图辅助新增用例6/6（13:50:54 /2.61s），辅助最初使用包别名在tests根目录无法被tsc解析，已按现有辅助风格改相对contracts路径，类型与单独projectService lint复验通过，无新增依赖。

真实验收使用另一个独立库 `kf_agent_test_review_flow_20261023_1245`，与完整API库分开；在确认该库名、21迁移及零其他连接后，仅清理33张测试业务表。首轮实际13:47:20 /16.78s，1次vision请求后两状态小色点被当table而停止，未达到工程模型；5份原JSON/sha见 `live-semantic-repair-static-marker/`。固定图审阅明确保留状态文字、通过原接受差异记录省略冗余装饰，不改变生产审阅/映射，未知业务区域仍拒绝；后续新真实结果继续记录，不把这个早停说成语义修复实测成功。

## 最终候选身份修复（semantic@10）

13:52:17真实新验收2次请求后，独立蓝图确认通过，但工程模型未发送：详情ID含未在最终候选中公布的easyui.18（15对14）。保留原5JSON及hash于 `live-detail-reservation/`。不是语义修复失败或provider输出错误，故不追加收费修复；完整原生工程仍未交付。

实际原蓝图新增领域负例13:55:31先红，明确多出easyui.18；只将返回详情ID改为最终regions.controls/layouts的去重并集，不回收预留预算，不增候选、不变排序和完整性门槛。semantic升@10、冻结hash绑定kf-final-selected-details/v1，blueprint仍@7，旧@9任务不能修库续跑。领域完整 **70文件1481 passed/5既有skip**（13:56:28 /24.77s）、contracts完整560/560与类型通过；API三文件 **152/152**（同起点 /14.94s）及类型/lint通过，原真实蓝图可以准备128000字节内请求。

之后固定@10产品源码，完整API/五种Chrome在新API测试库运行，显式单worker/no-file-parallelism；真实联调在另一旧隔离库运行，互不清理数据。结果分别记录，普通回归无live opt-in。

## 完整外壳语法修复（semantic@11）

@10完整API **69文件1057/1057、零skip**（13:58:12 /354.74s）通过，单worker/no-file-parallelism，五种Chrome均通过；日志 `/tmp/kf-semantic-detail-api-full-20261026.log`。这次完整回归结束后才修改@11执行源码；新syntax测试文件是单独红测，不是向@10全量加未实现用例。与此同时真实新验收3调用：识图与独立蓝图通过、工程已发出，但stop响应在16688字符处缺数组闭合，故@10正确停止且无修复。原5JSON/hash见 `live-semantic-json-syntax/`。

@11冻结parser规则、原文本界限、repair@2及稳定system前缀。服务与单测共用纯inspectVisualSemanticResponse，原字节不改；只有当前信任上下文/资产先通过、非截断完整外壳且有界的新响应才可修语法。仍使用唯一visual-semantic-repair-v1额度；账本guard覆盖所有visual-semantic-repair@前缀，不能换版本绕限次。新增none/once真实PG对照，原partial-json、截断、禁用、超限继续0修复。

语法6项14:03:33先红缺实现（2.47s）；14:05:22四文件158/158（6.27s）通过，发现unused import后删除并复验。补完信任上下文负例后，14:06:48四文件 **159/159**（8.14s）、API类型与本批lint通过，contracts完整560/560及类型通过。后续完整视觉PG/五种Chrome与新真实结果另记；不把@10全量1057说成已跑@11全API1066。

## 真实组件独占与独立静态行（semantic@12）

@11完整视觉PG/五种Chrome **311/311**（14:06:55 /212.82s），新增none/once PG对照 **2通过/309名称筛选未执行**（14:07:32 /6.10s）。14:09:26真实4请求中语法修复@2实际执行一次并修成可解析JSON，但repeater缺公共字段仍拒绝；原6JSON/hash及内存反事实见 `live-semantic-repair-repeater/`。没有第二次修复或工程包。

实际三个视觉设备行共用两个模板节点，将来会把同一展开控件分给不同视觉区域。用真实编译golden构造两个明确批准区域认领同一实际componentId，14:17:01先红（1失败/7筛选未执行，2.75s），证明旧预检只检查能力存在，未提前检查所有权。新增componentId→regionId唯一归属证明，复用原provenance展开事实；仅匹配真实发出的所需capability，不按节点文字猜来源。完整快照原所有权门槛保留。明确静态视觉逐行使用独立节点，只有整块重复区才共享模板，repeater本身公共字段仍必填；规则置于system明确优先于通用列表复用要求，文本生成原提示不变。

冻结semantic@12/hash绑定nativeOwnershipVersion与literalRowVersion；server once/default none及repair@2次数不变。14:19:07四文件160/160（6.37s）和API类型/lint通过；@12完整视觉PG/五种Chrome **311/311、零skip**（14:20:32 /211.63s）。证据前缀同前，static/feedback/workspace-data/observe/repeater后缀UovWrF/HMtSR2/pCKhT7/m6V6t2/gasnWS。

14:20:37最后新验收4调用，一次修复又修成JSON，repeater=0，独立行规则已实际反映到新提案。但5个layout带styleRole=card-surface，当前合同与测量/编译不支持；原语义门槛拒绝，无COMPLETED工程结果/包。仅内存删5键后还有content布局能力不符，不能删样式或改映射后交付。原8JSON/hash及实际六行revision的before/edit/final见 `live-semantic-layout-style-role/`。本轮五次新验收共 **14实际请求（1+2+3+4+4）**，上一轮15，本日累计29；已停止追加请求。没有合格交付，不能宣称单位工程成本、缓存或1:1目标达成。

新增两个原修复响应的明确负例，确认不偷偷补repeater字段或删除layout样式；14:25:30四文件 **162/162**（6.19s）、API类型通过。产品源码与@12完整视觉回归相同，后补仅原事实/测试/文档，不重复跑收费模型。

## 下一步：容器样式合同与可编译提案

1. 优先读最新styleRole负例，评估并明确支持layout的语义角色样式。当前 `packages/contracts/src/solution-implementation-plan.ts` 只让control声明styleRole，`solution-compile/solution-compiler.ts` 的布局测量使用空declarations。不能仅允许多余键或删除card-surface：模型要求白底、边框、圆角、padding及阴影，必须有真实原生/样式handoff证明。若改合同，明确版本、可选字段兼容和角色引用检查，不放任任意CSS/原生字段。
2. 若采用layout styleRole，贯通component-compiler的原生容器样式、角色解析、measure/layout中padding/border内容空间、persistedStyleHandoff与provenance/快照；默认无字段的旧布局行为保持。测试真实白色卡片/侧栏、边框圆角和子节点内容空间，非法/不支持属性仍失败。不要靠裁切子节点或忽略样式使包验证通过。
3. 再解决最新视觉区域content的已批准layout能力与模型column等不匹配；用真实反例测试正确row外层/column内容等合法提案。继续区分视觉ID和蓝图ID，不改接受映射、扩大候选或手工补签历史Run。独立静态行与component独占规则不回退。
4. 离线必须让**新提案**走完严格schema、来源/候选、真实编译、provenance、native、sourceMap和snapshot/制品证明，再有上限真实联调；不要把临时内存诊断或篡改过的原回复作为provider成功。模型语法、字段和编译多层问题可考虑分块生成或更精确结构输出；若调整修复次数，先版本化冻结policy与费用/恢复边界，不能在旧once Run暗中加第二次。
5. 只有合法能源客户端包出现后，才做KF443隔离新工程导入/运行/截图及视觉对照。本轮未连接或修改KF环境。业务源与预算继续暂缓，T22/整体计划IN_PROGRESS；受保护试用库/旧服务不动，不能据fixture绿灯直接开启production vision。

## 本轮文件清单（交付时使用本节）

收尾核对：清单59项均存在、无重复，29份新证据JSON全部可解析、SHA256与对应README一致并通过私有内容检查；上一轮27份原证据hash保持。限定本清单的git diff --check通过。最新API类型及改动TS lint通过，@12 contracts完整560/560及类型通过。两个隔离测试库均21条完成迁移、零其他连接；真实联调库pending BuildJob=0，API视觉回归库留存10个夹具待执行作业，无活跃worker。下次运行全局JobRunner/API全量前需按测试安全守卫显式清理该隔离库或使用新隔离库，禁止混入真实模型库/试用库。没有遗留本轮测试进程或KF远程操作；实际.env未改。

以下路径相对仓库根目录；补丁保持原目录，只含本轮文件，不复制其他历史脏修改。原27份证据JSON未改；后续若产生新真实证据另补清单。

```text
agent-app/.env.example
agent-app/packages/contracts/src/visual-blueprint-authority.ts
agent-app/packages/domain-client/src/planning/capability-retrieval.ts
agent-app/packages/domain-client/src/planning/visual-blueprint-candidates.test.ts
agent-app/packages/agent-orchestrator/src/nodes/solution-implementation-plan.ts
agent-app/packages/agent-orchestrator/src/nodes/solution-implementation-plan.test.ts
agent-app/apps/api/src/conversations/deepseek-model.ts
agent-app/apps/api/src/vision/visual-semantic-request.ts
agent-app/apps/api/src/vision/visual-semantic.service.ts
agent-app/apps/api/src/vision/visual-semantic-output.ts
agent-app/apps/api/src/vision/visual-semantic-output.test.ts
agent-app/apps/api/src/vision/visual-semantic-syntax.test.ts
agent-app/apps/api/src/vision/visual-blueprint-runtime.ts
agent-app/apps/api/src/vision/visual-blueprint-authority.ts
agent-app/apps/api/src/vision/visual-review.service.ts
agent-app/apps/api/src/runs/visual-engineering-run-input.ts
agent-app/apps/api/src/runs/visual-run-flow.integration.test.ts
agent-app/tests/helpers/energy-reference-review.ts
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-repair-static-marker/reference-review.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-repair-static-marker/reference-review-before-edit.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-repair-static-marker/reference-review-edit.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-repair-static-marker/provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-repair-static-marker/result.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-repair-static-marker/README.md
agent-app/tests/fixtures/energy-overview-20261023/live-detail-reservation/reference-review.json
agent-app/tests/fixtures/energy-overview-20261023/live-detail-reservation/accepted-differences.json
agent-app/tests/fixtures/energy-overview-20261023/live-detail-reservation/blueprint.json
agent-app/tests/fixtures/energy-overview-20261023/live-detail-reservation/provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-detail-reservation/result.json
agent-app/tests/fixtures/energy-overview-20261023/live-detail-reservation/README.md
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-json-syntax/reference-review.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-json-syntax/accepted-differences.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-json-syntax/blueprint.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-json-syntax/provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-json-syntax/result.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-json-syntax/README.md
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-repair-repeater/reference-review.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-repair-repeater/accepted-differences.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-repair-repeater/blueprint.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-repair-repeater/initial-provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-repair-repeater/repaired-provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-repair-repeater/result.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-repair-repeater/README.md
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-layout-style-role/reference-review-before-edit.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-layout-style-role/reference-review-edit.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-layout-style-role/reference-review.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-layout-style-role/accepted-differences.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-layout-style-role/blueprint.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-layout-style-role/initial-provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-layout-style-role/repaired-provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-layout-style-role/result.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-layout-style-role/README.md
agent-app/docs/visual-semantic-repair-20261026.md
agent-app/docs/visual-blueprint-sources-20261026.md
agent-app/docs/agent-runs-operations.md
docs/superpowers/plans/2026-10-20-agent-app-handoff.md
docs/superpowers/plans/2026-10-20-agent-app-next-master.md
docs/superpowers/plans/2026-10-20-agent-app-p4-vision.md
docs/superpowers/specs/2026-10-20-agent-app-next-design.md
```
<!-- end -->
