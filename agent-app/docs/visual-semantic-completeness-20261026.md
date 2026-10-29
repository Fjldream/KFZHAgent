<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
# 工程完整性诊断、关系检查与单阶段真实验收：2026-10-26

当前源码 **visual-blueprint@8 / blueprint-repair@2 / visual-semantic@16 / semantic-repair@5**。本切片解决“部分页面被首个journey错误遮住大量缺失区域、孤儿节点遮住独立groupWith循环、反复识图/蓝图增加联调调用”的问题。图wire仍为graph/v1，内部标准树、缓存、签名、原生构建保持。

真实工程初稿现已输出53节点和43区域绑定，groupWith全部为空；剩余一个副标题漏接，一次修复接入后却重写出非法disabled样式字段。初稿副标题边的内存反事实又揭示devices能力和选中态样式问题。**尚无本轮合格能源工程包、BuildJob或KF运行/1:1结论，T22/总体IN_PROGRESS。** 预算与业务源继续暂缓，production vision关闭；实际.env、受保护18迁移试用库、旧服务与KF未动，无迁移/新依赖。

接手先读本报告及唯一design最新完整性补充，再读visual-layout-obligations-20261026.md、visual-semantic-graph-20261026.md历史。不要将单阶段付费工程验收、普通fixture包、离线诊断或新完整端到端识图混为一谈。

## 1. 完整性目标与反馈

初次请求和一次修复都增加服务端coverageTarget.requiredRegionCount，计数来自同一resolveVisualBlueprintSources/requiredVisualBindings；不接收模型自报计数作为证明。完整性规则进入视觉system：不能只输出页头/示例，bindings的不同regionId集合须覆盖全部未omit列表，节点必须从所属页面/浮层根经children/template/slot引用可达，独立声明/绑定不代表已连接。

仍优先用row/column等容器表达排列；groupWith优先[]，合法非空单向兄弟分组继续允许，自引/重复/非兄弟/循环及根分组仍拒绝。没有删功能或在服务器自动改边。压缩了旧重复的视觉group/source规则，完整蓝图、候选、区域、原始草稿均保持；旧大型样本外层JSON.stringify(messages)从@15的127959变成127917bytes，旧54节点图样本112398bytes，输入上限仍128000。

新增visual-semantic-completeness.ts只在严格路径失败后提供诊断：

- 聚合缺失区域；已知缺失regionIds最多100，count是真实缺失数；重复绑定不会冒充多个区域已覆盖。
- 聚合未知/omit区域绑定、绑定到未声明节点；无效regionIds/nodeIds列表最多20，保留真实count。
- 从显式根迭代遍历，循环也能终止，列出最多20个不可达节点及真实总数。不丢孤儿或猜归属。
- 对每个显式兄弟组（包括未连接子树）独立检查groupWith。NodeIntentSchema的groupWith子schema先校验值，缺失/null/非法值不补[]；坏值继续留给原严格合同拒绝。
- 从原validateVisualLayoutGrouping提取共用validateVisualSiblingGrouping；标准树和扁平诊断调用相同的自引/重复/兄弟/有向环规则。无第二份只在fixture中运行的放宽校验器。

保留首个严格错误，优先合并这些完整性反馈，再附其余原诊断，按code/nodeId/regionId/path去重，总数最多12。诊断投影不能装配/修复/授权；只有原严格图装配、标准schema/别名、来源/候选/观察/交互/native/provenance路径能返回成功。已有COMPLETED缓存仍按标准树校验，不借新诊断修坏缓存或重新付费。

上一轮真实5节点/4绑定初稿现在同时得到原journey错误及39个缺失区域；53节点修复稿同时得到header孤儿、4个不可达节点与KPI分组循环，原字节/hash保持。unknown/null/length finishReason、坏审核事实继续不允许repair；草稿64KiB、12 issues、128000bytes输入、32000输出token、2MiB响应及一次修复不扩大。

## 2. 版本、隔离与单阶段验收

semantic身份升@16、repair升@5，合同literal、快照/账本测试同步，完整性规则/字段及kf-visual-completeness/v1进入冻结hash。文本生成system保持；同run-plan@7不支持新旧视觉worker混部，须排空旧任务/worker、整体升级、新建审核，不修改旧Run/缓存重签。取消/actor/权限/base/lease/fence保护及所有历史repair版本共同限次保持。

测试新增energy-saved-planning.ts：只载入上一轮公开spec和blueprint，不载入receipt、密钥、执行事实或原工程响应；校验固定参考图sourceHash，仅向本地mock fetch提供恰好一次vision和一次blueprint响应。检查端点/方法/阶段顺序，第三次或错误阶段拒绝；没有网络fetch。actualModel明确标记saved-public-*-fixture，usage=0，不能冒充提供方调用。

普通PG测试重新上传原PNG，经过真实Run、分析落库、显示review、测试操作员接受43项差异、独立蓝图确认、工程继承签名；确认得到@16/once新continuation且尚无工程调用/BuildJob。签名与analysisId均为新建，本地公开提案仍受原来源完整性和权限校验。根tsconfig只额外纳入该测试helper，使类型/typed lint覆盖，不拓宽其他源码范围。

现有显式付费测试新增 `KF_LIVE_VISUAL_ACCEPTANCE=energy-semantic-saved-20261026`。前两阶段用上述本地提案和新的审核/确认，只有工程gateway使用真实fetch，最大真实请求数1+once=2。原energy-overview-20261023完整验收模式保持最多3+各一次repair。result明确acceptanceMode、planningFixtureRequests、physicalRequests及公开事实hash；新模式成功也不能声称本轮真实识图或完整端到端成功。

运行入口仅供授权隔离测试，不是生产开关：使用绝对Node、--env-file=.env，显式指定本报告两个已核实的kf_agent_test_隔离库之一和KF_TEST_ALLOW_DESTRUCTIVE_RESET=1；普通回归设置COOKIE_SECURE=true并关闭LANGCHAIN_TRACING_V2/LANGSMITH_TRACING。单阶段模式再设KF_LIVE_STATIC_ROW_REVIEW=energy-overview-20261026、KF_LIVE_BLUEPRINT_REPAIR=none、KF_LIVE_SEMANTIC_REPAIR=once，只选现有“accepts the generated energy UI through real DeepSeek”测试。不要打印key或改实际.env；每次新验收都使用新Run/新测试审批，不能复活旧私有授权。

## 3. 测试与失败记录

| 验证 | 结果 | 日志/时间 |
| --- | --- | --- |
| 真实负例完整性单元最终 | 7/7 | /tmp/kf-semantic-completeness-unit-bounds-20261026.log，17:22:45 /2.69s |
| 前序相关5文件 | 156/156，之后补4项边界已由上项和最终全量覆盖 | /tmp/kf-semantic-completeness-focused-20261026.log，17:20:13 /6.62s |
| 合同/领域全量 | 94文件2092pass /5既有skip（2097） | /tmp/kf-semantic-completeness-domain-full-20261026.log，17:26:37 /47.88s |
| PG定向 | 5pass/334未选（339） | /tmp/kf-semantic-completeness-pg-20261026.log，17:26:39 /10.96s |
| 编排全量 | 19文件216/216 | /tmp/kf-semantic-completeness-orchestrator-20261026.log，17:28:23 /14.61s |
| 完整API | 73文件1127/1127，零skip，exit_code=0 | /tmp/kf-semantic-completeness-api-full-20261026.log，17:29:52 /354.52s |
| 其中完整视觉/Chrome | 339/339、208.564s，五种Chrome通过 | 同上；模型为fixture |
| API/领域/合同/根类型 | 全部exit_code=0 | /tmp/kf-semantic-completeness-{api-tsc-final,domain-tsc,contract-tsc,root-tsc}-20261026.log |
| 11个TS文件lint | exit_code=0 | /tmp/kf-semantic-completeness-lint-complete-20261026.log |

Chrome证据前缀 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-visual-browser-`，static/feedback/workspace-data/observe/repeater后缀依次NmEOCQ/syoUYu/ByJeV9/9SUjdj/Khtfb8；下载包仍由真实签名/native编译/build/解包校验产生，fixture不能冒充能源图真实包或KF运行。没有改认证；历史偶发401根因仍未证明，不因本轮全绿抹去历史。

中途失败完整记录：红灯3项中2fail/1pass（缺失39区域、孤儿与独立循环），实现后通过；最初tsc因正则捕获detail可undefined失败，改为已匹配分组的非空断言，未用any。新helper起初不在root project service，typed lint拒绝解析；只显式加入根tsconfig后，lint又指出无await的async fixture fetch，改为返回Promise.resolve的同步函数，最终全绿。未放宽断言、限额、数据库防护或校验。日志分别为-red、-tsc、-lint、-lint-final及最终日志。

## 4. 本轮真实结果与新阻塞

17:29:54 /50.93s，单阶段模式实际2真实请求；另有2个本地规划夹具响应（0 token）。43项差异重新接受、omit=0，before/final相同，无静态行revision；公开蓝图和接受内容与上一轮可相同，但新analysisId/assetId/review/continuation及签名不同，没有历史receipt。

| 真实task | input/output | hit/miss | latencyMs |
| --- | --- | --- | ---: |
| implementation | 26460/7585 | 3584/22876 | 23104 |
| semantic repair | 30350/7567 | 4224/26126 | 21504 |

两份真实响应均为合法graph/v1、53节点/43区域绑定、groupWith全部为空：

- 初稿27504序列化UTF-8 bytes，node-main-subtitle未接入；返回SEMANTIC_GRAPH_ORPHAN及UNREACHABLE_NODES(count=1)。全区域绑定声明不等于能力/原生结果合格。
- 唯一修复27434bytes，已接入副标题，却在roleStyles[7]/nav-item-text顶层新增disabled，初稿没有此字段。严格schema报SEMANTIC_PLAN_INVALID / roleStyles.7: Unrecognized key: "disabled"。整体FAILED/INVALID_MODEL_OUTPUT，额度耗尽即停。
- 离线仅在初稿内存副本接入既有subtitle后，进一步得到devices布局能力不符，以及node-nav-overview的NATIVE_STYLE_STATE_UNSUPPORTED/button.root.selected；没有写回原件或进入Run/包流程。不能把删disabled、接一条边或“诊断没有更多项”当交付成功，也不能直接把未知字段挪到states。

七份原字节JSON及README/SHA在 `tests/fixtures/energy-overview-20261023/live-semantic-completeness-style-regression/`，initial/repaired对应本次model-reply-1/2。result明确两个本地actualModel，缓存字段null不是零；SUCCEEDED invocation不代表最终工程成功。没有成功工程缓存、BuildJob、能源包或KF操作；本轮真实验收exit_code=1，不能与普通回归全绿合并为成功。

普通回归使用kf_agent_test_visual_binding_20261026_1015，真实调用账本使用kf_agent_test_review_flow_20261023_1245；同库套件串行。启动前和收尾两库均21迁移、零其他连接、pendingBuildJobs=0；未重置真实调用账本。实际.env、受保护旧库/服务、KF保持。

收尾26文件清单存在且无重复，其中11个TS；限定清单git diff --check通过。四轮共30份新旧JSON/SHA及私有字段检查通过，4处当前索引均为@16/repair@5。本轮测试、类型和lint进程已退出；没有整库补丁、Git提交或重置。

## 5. 下一任务与验收条件

主线已从“缺大量区域/分组循环”推进到“修复全量重写引入新字段、布局/样式能力不合规”，但不能靠反复加提示和付费试运气：

1. 先以本轮保存公开事实和两份原文离线复现：初稿唯一结构错误是subtitle孤儿，修复稿首先是roleStyles.7.disabled；原SHA不变。只在单独内存副本诊断被遮住的devices能力、button.root.selected等问题，不能把诊断副本当真实成功结果。
2. 修复请求当前要求重写整份图，导致一次拓扑修复把原合法样式改坏。审查支持有界、按稳定id的局部替换/严格patch提案是否更合适：必须先更新design、物理repair合同、操作上限与冻结身份，限制到当前失败提案，不允许文件路径/代码/任意执行，模型显式给出新值；原未修改字段原样保留。应用后仍过完整schema、拓扑、候选、来源/观察/交互/native/provenance，不能服务器猜边或悄悄删未知字段。不能直接把本轮旧Run改配置重签。
3. 诊断完整性目前覆盖区域/引用/分组，不代表已独立检查全部样式与能力。可抽取复用真实绑定兼容/样式能力校验，在孤儿尚存时也给出有界的devices布局和selected态反馈；不得构造“修好”的树跳过严格装配、扩大候选或随意补状态。库原生state能力以真实compiler为准，不凭CSS/组件名称猜支持。
4. devices双轴方向仍模糊且已接受layout.2；模型必须保持row外壳并使用当前候选允许的内层组合，或者通过新的显式审核revision选择其他能力，不静默改accepted mappings。选中外观可在有证据的语义样式范围表达，不把不支持的button.root.selected硬说成已运行。
5. 完成原稿负例、局部替换/冲突/重复id/篡改权限/取消/一次额度/缓存与制品测试后，用本轮新增单阶段模式做新Run/新审批的有界真实工程验收，最多2请求。若得到合格包，再做一次新签完整流程及KF443隔离新工程导入/运行/截图，核对边框、内边距和缩放。预算和业务源继续暂缓。

## 6. 本切片文件清单

相对仓库根目录，共26文件（11个TS、一个根tsconfig及配套文档/原始证据）。如出补丁须保留路径、覆盖每项最终完整文件，不混入数百项历史脏文件，不提交/reset/stash；JSON证据不加非法注释，根tsconfig沿用现有JSONC注释格式。

```text
agent-app/packages/domain-client/src/visual/visual-plan-constraints.ts
agent-app/packages/contracts/src/visual-blueprint-authority.ts
agent-app/apps/api/src/vision/visual-semantic-completeness.ts
agent-app/apps/api/src/vision/visual-semantic-completeness.test.ts
agent-app/apps/api/src/vision/visual-semantic-output.ts
agent-app/apps/api/src/conversations/deepseek-model.ts
agent-app/apps/api/src/vision/visual-semantic-request.ts
agent-app/apps/api/src/vision/visual-layout-obligations.test.ts
agent-app/apps/api/src/vision/visual-semantic-output.test.ts
agent-app/apps/api/src/runs/visual-run-flow.integration.test.ts
agent-app/tests/helpers/energy-saved-planning.ts
agent-app/tsconfig.json
docs/superpowers/specs/2026-10-20-agent-app-next-design.md
agent-app/docs/visual-semantic-completeness-20261026.md
agent-app/docs/agent-runs-operations.md
docs/superpowers/plans/2026-10-20-agent-app-handoff.md
docs/superpowers/plans/2026-10-20-agent-app-next-master.md
docs/superpowers/plans/2026-10-20-agent-app-p4-vision.md
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-completeness-style-regression/reference-review-before-edit.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-completeness-style-regression/reference-review.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-completeness-style-regression/accepted-differences.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-completeness-style-regression/blueprint.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-completeness-style-regression/initial-provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-completeness-style-regression/repaired-provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-completeness-style-regression/result.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-completeness-style-regression/README.md
```
<!-- end -->
