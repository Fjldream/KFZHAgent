<!-- modified by jinlong.feng at 2026-10-27 Agent工作台迭代 -->
# 精确绑定、节点元数据与蓝图联合诊断：2026-10-27

当前源码 **visual-blueprint@9 / blueprint-repair@3 / visual-semantic@21 / semantic-repair@10**。这次已获得真实 DeepSeek 工程产物，且在 KF443 完成独立工程导入、页面读回、导出与再导入。首份成功包的识图/蓝图来自公开本地提案并重新审核，完整真实模型流程另做验收；两类证据必须区分。T22/总体仍 IN_PROGRESS，原生发布/运行、实际界面效果和1:1均未验收。

生产 vision 仍关闭，预算与业务源暂缓。未修改实际 .env、受保护的18迁移试用库、旧服务或 KF 服务代码；仅两个21迁移隔离测试库及 KF 独立新工程用于验收，无新依赖/迁移。所有本次代码改动用当天 `Agent工作台迭代` 标注；未提交、重置或覆盖其他工作。

## 1. 精确绑定与合法布局组合（@20/repair@9）

旧反馈只有code/regionId，模型无法分清被绑定节点自身和其父容器的能力。现在验证真实候选bundle及blueprintHash后，给出实际nodeId、已校验的kind/layout/capability、requiredCapabilityId、directLayoutKinds和availableInnerLayoutKinds。直接外层由原布局能力表确定；允许内层只来自该蓝图区域自己的真实候选，不能借其他区域候选或从不可信草稿扩大权限。只有当前布局本就在允许内层中且不同于批准外层时才给suggestedInnerLayoutKind。

初次及修复请求都包含本区域合法内层，即使双轴框没有方向建议。修复知识的压缩回退也保留这些内层能力profile。被绑定节点必须自己发出批准能力；可由模型显式提交row外壳、唯一column子节点、两层来源和仅外壳样式。服务器不包节点/改绑定。通用首错按同code/regionId补精确事实并去重，总反馈仍≤12，严格成功路径不变。

五项新绑定测试涵盖真实反例、模糊区域合法内层、跨区域候选禁止、原稿及未触及字段保持、控制能力错误和坏观察不回显。PG用例验证精确capability事实与缺失styleRole同时进入一次delta，显式操作后缓存标准结果，重放不再调用、不创建BuildJob。

## 2. 原schema驱动的扁平节点元数据（@21/repair@10）

09:37真实修复已解决devices绑定，但初稿12个richtext缺少styleRole，深树首错无法指向所有扁平节点。新visual-node-metadata复用Control/Layout/Repeater/RegisteredModule原字段schema，先通过有界可寻址读取，再规范化副本，逐字段验证；不采用parse返回值/默认值，不填角色、不改变原草稿。children/template/slots等内部树字段由原graph装配校验，不伪造树。

按字段、错误码及是否缺失聚合，给出nodeField、schemaCode、missing、真实count和最多20个稳定nodeIds；单节点另有nodeId。最多4组及一项剩余汇总，再与原首错/数据/完整性/能力诊断合并≤12。不回显原值、动态错误消息或任意嵌套键。合法且唯一的已声明role列表还用于识别未知styleRole引用，仍不替节点选值。

必填字段由同一schema对undefined的校验派生，进入稳定system与冻结指纹。control.styleRole必填且不从父容器继承；其他节点遵循原可选字段规则。新增五项元数据测试含真实12节点聚合、坏输入在规范化前拒绝、反馈界限、未知role不回显、原稿hash保持及显式测试副本通过完整native预检。离线副本不覆盖真实失败原件或冒充交付。

为保留全部批准JSON事实及128000bytes上限，仅压缩视觉专用重复文字；保留静态依赖、分组、外层/内层、来源/样式和全部7种delta操作，文本生成提示未改。最大历史语法负例输入实测127814bytes（system18104、user96783）；上限未增、候选/蓝图/草稿未截断。仍需监控新增较大真实样本，不能把这一数值当通用余量保证。

## 3. 蓝图schema与来源联合诊断（@9/repair@3）

10:26完整真实识图得到48区域。蓝图初稿同时存在重复expectedTexts与遗漏app根容器；原输出检查先返回schema错误，一次修复仅解决重复，之后才看到来源缺失，工程阶段未开始。

现在先校验已审核视觉事实；即使其他蓝图字段错误，只要pages字段完整通过原pages子schema，就复用原resolveVisualBlueprintSources独立诊断来源。共享函数形参缩为实际使用的Pick<Blueprint,"pages">，没有构造补齐的假蓝图。首个schema错误保持，最多1条来源问题并预留一个反馈位，总数仍是原8条、草稿32KiB、请求96KiB。缺失列表只取已知非omit区域，最多100，未知值只给静态错误码。合法成功仍必须通过完整原schema、候选、来源及后续独立审核。

system明确包含无文字的根容器，输出前对照全部spec.regions检查，修复同时处理schema和来源错误。sourceFeedbackVersion及新提示进入冻结hash。旧Run、旧缓存不得补配置重签；蓝图@9/repair@3与工程@21/repair@10整体升级后新审核/新确认，不以相同run-plan@7认为能混部。

新增五项离线测试：未改真实稿同时两类错误、显式分配根后仍拒绝坏旅程、坏pages不独立遍历/坏审核拒绝、8项预算保留来源位、真实修复稿仍缺来源。新增PG验证同一repairContext保留原草稿和两类错误、同system同route、2调用/1修复、仅完整成功缓存、重放0新调用且无BuildJob。

## 4. 真实模型轮次与交付

| 轮次 | 冻结版本 | 真实调用 | 本地规划响应 | 结果 |
| --- | --- | ---: | ---: | --- |
| 09:37 单独工程 | 蓝图8/2，工程20/9 | 2 | 2（0token） | devices已修复，12控件缺styleRole；失败，无包 |
| 10:14 单独工程 | 蓝图8/2，工程21/10 | 2 | 2（0token） | 真实Run/BuildJob成功，原始制品生成 |
| 10:26 全部真实 | 蓝图8/2，工程21/10 | 3 | 0 | 48区域识图成功；蓝图一次修复后仍缺app，停止，无本轮新包 |
| 10:33 联合反馈后的全部真实 | 蓝图9/3，工程21/10 | 5 | 0 | 50区域，蓝图一次修复成功；工程观察与绑定错误，严格拒绝，无本轮新包 |

09:37初稿52节点/43绑定，一个upsert-nodes修3节点，原devices错误消失而12角色仍缺。10:14初稿55节点/43绑定，所有控件已有显式角色；一次delta仅upsert-nodes两节点，修devices为row外壳/column内容，原plan/绑定/样式不重写，原严格语义、候选、来源、观察、native/provenance全部通过。实际BuildJob及工程Run均SUCCEEDED，读取真实storage字节并对数据库artifact.sha256核验；不是离线手工补值产生的包。

产物 `agent-app/outputs/energy-ui-20261027/energy-client.gz`，22404bytes、ZIP64项、展开128965bytes，SHA256 `ebd0d47c13f568a50afcc9c29113f39a2356100de10f17992baeb5df9f9e59c7`。原始result.json中nativeKfAccepted/browserAccepted=false保留测试结束时事实，后续KF证据另存，不倒改原件。

| 轮次/task | input/output tokens | cache hit/miss | latencyMs |
| --- | --- | --- | ---: |
| 09:37 implementation | 26678/6908 | 3456/23222 | 21289 |
| 09:37 repair | 30161/377 | 4352/25809 | 2643 |
| 10:14 implementation | 26513/7553 | 0/26513 | 23388 |
| 10:14 repair | 30776/272 | 4352/26424 | 2261 |
| 10:26 vision | 1534/3129 | 1280/254 | 10537 |
| 10:26 blueprint | 11428/3022 | 2304/9124 | 16287 |
| 10:26 blueprint repair | 14497/3019 | 11392/3105 | 10919 |
| 10:33 vision | 1534/3307 | 1280/254 | 10795 |
| 10:33 blueprint | 11936/2604 | 384/11552 | 12952 |
| 10:33 blueprint repair | 14588/2859 | 11904/2684 | 11139 |
| 10:33 implementation | 30054/7838 | 4352/25702 | 24138 |
| 10:33 semantic repair | 27337/1167 | 4352/22985 | 4685 |

272输出token是这次局部修复观测，不保证固定省费或缓存命中。模型的invocation SUCCEEDED只代表服务响应成功，不能替代最终Run或交付状态。完整真实验收第一次启动因漏传KF_TEST_ALLOW_DESTRUCTIVE_RESET被守卫在数据库/模型前拒绝，0调用；补上仅用于隔离库的标志后运行，未弱化守卫。

本次实际付费请求合计12次（2+2+3+5），另有4次明确本地规划提案。最后一轮初始蓝图schema已合法，但漏content/bottom-row来源，一次修复后完整通过；这不是同轮schema和来源双错的实际修复，联合双错由上一原件及PG验证。工程初稿53节点/50绑定，布局/分组/角色/依赖均未暴露旧问题，但蓝图read-overview:2把纯布局描述作为expectedTexts要求显示。真实delta新增描述并将content从布局改绑定至node-content-desc richtext，原layout.4能力门槛严格拒绝；没有放宽绑定或再加修复。

当前首要缺口是视觉蓝图观察约束与可见原文/区域的对应，而不是把布局描述补成界面文字。应先设计“纯布局要求进入visualIntent或布局验收说明、observe仅核对正确区域的真实可见文字”的合法提案及错误反馈，再变更冻结协议；不能服务器自动删步骤、编造截图文字或换审核能力。新原稿的不可达/分组/样式不是本轮失败原因。原件见live-full-journey-binding，新增第六项绑定测试证明初稿观察拒绝及实际delta能力拒绝，并保留全部原hash。

## 5. KF443原生往返证据

使用用户已授权测试账号，登录凭据/token不写仓库或本报告。只读核对当前KF前端真实调用参数后，以原始制品字节导入新工程；没有更改服务配置或覆盖旧工程。

| 步骤 | 实测 |
| --- | --- |
| 导入原包 | EnergyUi20261027，ID54c4d850-d1ad-11f1-9098-17c9886f9377，工程数44→45 |
| 页面读回 | page-overview，1440×1628，33原生控件（uiModelType7、35），与原包页面逐值一致 |
| 原生导出 | 137744bytes、64项，SHA256 b12fc82dbf29ea3ba6b9e12cab45ce0b1b98c253d8e42ef356a3124ecf60e28f；页面逐值一致 |
| 再导入 | EnergyUiRoundtrip20261027，IDaffce550-d1ad-11f1-9098-17c9886f9377，45→46，页面仍逐值一致 |
| 发布/运行/截图 | 未执行；两个新工程未发布，原工程保持 |

原响应、包与使用说明见outputs/energy-ui-20261027。页面高度1628及布局/字体/缩放的实际呈现尚需浏览器核对；接口成功和结构一致不等于运行或1:1通过。

## 6. 回归与失败记录

| 验证 | 结果/日志 |
| --- | --- |
| 绑定功能红灯→绿灯 | /tmp/kf-binding-red-20261027.log为3fail/1pass；定向最终157/157及PG5项通过 |
| 元数据功能红灯→绿灯 | /tmp/kf-node-metadata-red-20261027.log四项失败；相关7文件167/167，最终第五项纳入全量 |
| @8/2 + @21/10 全部API分批 | run-flow15 +其余77文件1141，共78文件1156/1156；视觉344及五种Chrome均通过 |
| 该阶段合同/领域 | 95文件2118pass/5既有skip（2123） |
| 蓝图联合红灯→绿灯 | 新5项红灯3fail/2pass；4文件28/28通过，/tmp/kf-blueprint-joint-green3-20261027.log |
| 蓝图PG联合修复/缓存 | 4pass、341名称过滤，/tmp/kf-blueprint-joint-pg-green-20261027.log |
| 最终@9/3合同/领域 | 95文件2118pass/5既有skip，/tmp/kf-blueprint-final-domain-20261027.log |
| 最终@9/3全部API | **79文件全部唯一1163项分批通过**：run-flow15/15；其余78文件1143pass/5默认skip（1148）；再显式Chrome开关补跑5/5，不重复计名称过滤项 |
| 类型/lint | API/合同/根类型及19个本次TS lint通过；最后PG断言仅改测试预期为共享函数真实错误码 |

最终顺序日志：/tmp/kf-blueprint-final-serial-flow-complete-20261027.log（10:40:24 /11.86s，15/15）；/tmp/kf-blueprint-final-serial-main-complete-20261027.log（10:40:37 /342.47s，1143pass/5skip）；/tmp/kf-blueprint-final-chrome-20261027.log（10:46:37 /65.60s，5pass/340名称过滤）。主批的5skip仅因该命令未显式KF_VISUAL_BROWSER_TEST=1，已经用原同代码、同断言独立真实Chrome补齐；不称为单次无skip全量。视觉345项的340项在主批执行、5项在浏览器批执行。五个最终Chrome证据根依次kf-visual-browser-ljrGcT（static）、XZkN3S（click-feedback）、TuSzRH（workspace-data）、cySbkv（observe）、qvJKZR（observe-repeater），位于系统临时目录；不是KF原生运行或本轮真实模型验收。

最终真实负例2文件11/11，/tmp/kf-binding-final-real-negatives-green-20261027.log；原有83份公开JSON逐份SHA/JSON/私有字段扫描通过，2工程包SHA与ZIP一致性通过。新负例首次断言误将嵌套bindingRequirement用外层objectContaining当递归部分匹配，改为完整断言真实直接/内层候选后通过，没有改生产行为。API类型和19文件lint日志/tmp/kf-binding-complete-api-tsc-20261027.log、lint同前缀；合同及根类型/tmp/kf-blueprint-final-contract-tsc-20261027.log、root-tsc同前缀均通过。

第一次@20单次全量并非全绿：77文件75pass/2failed，1135pass/1fail/15skip（1151）；一项历史大语法样本超过128000bytes，已通过压缩重复文字修复，完整语法测试保留。另一文件run-flow的beforeAll拒绝非清洁BuildJob队列，15项未运行；全量后只读查零pending，不能确定遗留队列由哪个测试产生。最终采用先单独完整跑run-flow，再顺序其余API，覆盖不减少，不删除守卫或延长时间掩盖。定向PG的名称过滤skip不能算执行通过，不能重复累加到全量。

最后一阶段首次主批命令未显式传--no-file-parallelism/--maxWorkers=1，出现同库TRUNCATE锁死、外键数据串扰及3个unhandled，24文件failed/54pass，541fail/575pass/31skip（1147）；该结果保留在/tmp/kf-blueprint-final-api-main-20261027.log，不能当产品回归全绿。只读确认零其他连接后，仅清理锁定普通隔离库的测试Tenant/BuildJob夹具，保留迁移与真实调用记录库。仅截断Tenant未清掉独立BuildJob，一次run-flow守卫仍拒绝15skip；补清BuildJob并断言全部QUEUED/RUNNING/VALIDATING为零后，以显式单worker先15项、再其余全部API复验。未变更生产调度、测试断言或超时，最终结果另列。

蓝图初次实现使用带refinement的Zod对象pick而被运行时拒绝，改为直接复用原shape.pages；新测试一度错误预期12条而原限额是8、PG错误预期MISSING而该夹具实际上全部来源字段缺失应为SOURCES_REQUIRED，已按原共享合同改断言，未放宽生产规则。历史socket/401/404/403/租约等待等根因未证明，不因本轮绿灯声称均已解决。

最终只读核对：两个隔离测试库均21条已完成迁移、other_connections=0，QUEUED/RUNNING/VALIDATING构建合计0。日志/tmp/kf-binding-final-database-state-20261027.log；真实调用记录库保留，受保护18迁移试用库未连接/清理。最后新增真实负例字段断言后的单文件lint再次通过；临时KF登录session文件已删除。没有启用生产开关或重启旧服务。

## 7. 后续执行顺序

1. 优先解决50区域真实蓝图的观察语义：read-overview:2不得把容器排列描述当成必须渲染的截图原文。先校准明确设计与可见文字/页面/区域约束、真实负例、冻结版本及PG有界反馈，保留完整来源、原观察与能力关卡；不自动删蓝图步骤、添加无意义可见文字或将layout.4绑定到richtext。之后才新审核/确认、有上限地重跑完整真实链路。
2. 在独立测试应用验证这份原生包的发布/运行及浏览器显示，记录panel、坐标、字体、边框、滚动与缩放；保留原有运行应用，不能把导入当运行。
3. 根据实际显示检查1440×1628与目标图的布局差距，再修编译/布局或模型约束；需要设计图1:1证据，不能仅凭33控件和43绑定判定。
4. 用户可见完整工作台上传/审核/确认/SSE恢复/下载验收；排空旧视觉任务后整体升级到21迁移的独立环境，禁止reset/seed受保护18迁移试用库。预算与业务源暂缓。

## 8. 本次文件范围

本次共71文件：19个TS、11个Markdown、39个JSON、2个工程包。包括20个基线已有文件和51个新增文件；本仓库另有大量既有未提交修改，不属于本次范围。没有制作与已取消的oauth/maxkey任务有关的补丁。83份历史及本次公开JSON逐份SHA验证，2包SHA/ZIP验证、标注与精确清单diff --check通过。

```text
agent-app/apps/api/src/conversations/deepseek-model.ts
agent-app/apps/api/src/runs/visual-run-flow.integration.test.ts
agent-app/apps/api/src/vision/visual-addressable-graph.test.ts
agent-app/apps/api/src/vision/visual-binding-feedback.test.ts
agent-app/apps/api/src/vision/visual-blueprint-joint-feedback.test.ts
agent-app/apps/api/src/vision/visual-blueprint-output.ts
agent-app/apps/api/src/vision/visual-blueprint-request.test.ts
agent-app/apps/api/src/vision/visual-blueprint-request.ts
agent-app/apps/api/src/vision/visual-layout-obligations.test.ts
agent-app/apps/api/src/vision/visual-layout-obligations.ts
agent-app/apps/api/src/vision/visual-node-metadata.test.ts
agent-app/apps/api/src/vision/visual-node-metadata.ts
agent-app/apps/api/src/vision/visual-semantic-diagnostics.ts
agent-app/apps/api/src/vision/visual-semantic-output.test.ts
agent-app/apps/api/src/vision/visual-semantic-output.ts
agent-app/apps/api/src/vision/visual-semantic-request.ts
agent-app/docs/agent-runs-operations.md
agent-app/docs/visual-binding-feedback-20261027.md
agent-app/outputs/energy-ui-20261027/README.md
agent-app/outputs/energy-ui-20261027/energy-client.gz
agent-app/outputs/energy-ui-20261027/kf-native-export.gz
agent-app/outputs/energy-ui-20261027/kf-native/export-response.json
agent-app/outputs/energy-ui-20261027/kf-native/import-response.json
agent-app/outputs/energy-ui-20261027/kf-native/page-response.json
agent-app/outputs/energy-ui-20261027/kf-native/pages.json
agent-app/outputs/energy-ui-20261027/kf-native/project.json
agent-app/outputs/energy-ui-20261027/kf-native/roundtrip.json
agent-app/outputs/energy-ui-20261027/kf-native/upload-response.json
agent-app/packages/contracts/src/visual-blueprint-authority.ts
agent-app/packages/contracts/src/visual-blueprint-sources.ts
agent-app/packages/contracts/src/visual-review.ts
agent-app/tests/fixtures/energy-overview-20261023/live-binding-fixed-missing-roles/README.md
agent-app/tests/fixtures/energy-overview-20261023/live-binding-fixed-missing-roles/accepted-differences.json
agent-app/tests/fixtures/energy-overview-20261023/live-binding-fixed-missing-roles/blueprint.json
agent-app/tests/fixtures/energy-overview-20261023/live-binding-fixed-missing-roles/initial-provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-binding-fixed-missing-roles/reference-review-before-edit.json
agent-app/tests/fixtures/energy-overview-20261023/live-binding-fixed-missing-roles/reference-review.json
agent-app/tests/fixtures/energy-overview-20261023/live-binding-fixed-missing-roles/repair-delta-provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-binding-fixed-missing-roles/result.json
agent-app/tests/fixtures/energy-overview-20261023/live-binding-node-metadata-success/README.md
agent-app/tests/fixtures/energy-overview-20261023/live-binding-node-metadata-success/accepted-differences.json
agent-app/tests/fixtures/energy-overview-20261023/live-binding-node-metadata-success/blueprint.json
agent-app/tests/fixtures/energy-overview-20261023/live-binding-node-metadata-success/initial-provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-binding-node-metadata-success/reference-review-before-edit.json
agent-app/tests/fixtures/energy-overview-20261023/live-binding-node-metadata-success/reference-review.json
agent-app/tests/fixtures/energy-overview-20261023/live-binding-node-metadata-success/repair-delta-provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-binding-node-metadata-success/result.json
agent-app/tests/fixtures/energy-overview-20261023/live-blueprint-joint-feedback/README.md
agent-app/tests/fixtures/energy-overview-20261023/live-blueprint-joint-feedback/accepted-differences.json
agent-app/tests/fixtures/energy-overview-20261023/live-blueprint-joint-feedback/blueprint.json
agent-app/tests/fixtures/energy-overview-20261023/live-blueprint-joint-feedback/initial-blueprint-provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-blueprint-joint-feedback/reference-review-before-edit.json
agent-app/tests/fixtures/energy-overview-20261023/live-blueprint-joint-feedback/reference-review.json
agent-app/tests/fixtures/energy-overview-20261023/live-blueprint-joint-feedback/repair-blueprint-provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-blueprint-joint-feedback/result.json
agent-app/tests/fixtures/energy-overview-20261023/live-blueprint-joint-feedback/vision-provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-full-journey-binding/README.md
agent-app/tests/fixtures/energy-overview-20261023/live-full-journey-binding/accepted-differences.json
agent-app/tests/fixtures/energy-overview-20261023/live-full-journey-binding/blueprint.json
agent-app/tests/fixtures/energy-overview-20261023/live-full-journey-binding/initial-blueprint-provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-full-journey-binding/initial-provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-full-journey-binding/reference-review-before-edit.json
agent-app/tests/fixtures/energy-overview-20261023/live-full-journey-binding/reference-review.json
agent-app/tests/fixtures/energy-overview-20261023/live-full-journey-binding/repair-blueprint-provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-full-journey-binding/repair-delta-provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-full-journey-binding/result.json
agent-app/tests/fixtures/energy-overview-20261023/live-full-journey-binding/vision-provider-reply.json
docs/superpowers/plans/2026-10-20-agent-app-handoff.md
docs/superpowers/plans/2026-10-20-agent-app-next-master.md
docs/superpowers/plans/2026-10-20-agent-app-p4-vision.md
docs/superpowers/specs/2026-10-20-agent-app-next-design.md
```

## 9. 可重复的验证方式

使用仓库.toolchain下Node24，先对目标库名和21迁移做只读核对；普通测试库为kf_agent_test_visual_binding_20261026_1015，真实调用记录库为kf_agent_test_review_flow_20261023_1245。每个进程显式TEST_DATABASE_URL指向相应隔离库及KF_TEST_ALLOW_DESTRUCTIVE_RESET=1，关闭LangSmith/LangChain外发追踪。禁止指向受保护kf_agent_e2e_trial_20261021_01。

普通API命令使用vitest run --project @kf/api --no-file-parallelism --maxWorkers=1；先仅run-flow.integration.test.ts全部15项，结束后--exclude该文件运行其余全部API。合同/领域为--project @kf/contracts --project @kf/domain-client。API/合同/根tsc --noEmit及19个本次TS ESLint分别验证。

浏览器必须显式KF_VISUAL_BROWSER_TEST=1，并以名称过滤runs the actual browser upload, consent, reference review, blueprint and native package download执行全部5场景；使用夹具模型，不产生提供方调用。浏览器批与同库其他集成测试严格顺序，不能与TRUNCATE夹具清理并行。

付费测试只显式选择accepts the generated energy UI through real DeepSeek，.env仅由Node --env-file加载且不输出值。KF_LIVE_VISUAL_ACCEPTANCE=energy-overview-20261023表示全部真实，energy-semantic-saved-20261026表示0token公开规划提案并新审核；KF_LIVE_STATIC_ROW_REVIEW=energy-overview-20261026为已审核合成图静态差异方案。KF_LIVE_BLUEPRINT_REPAIR/KF_LIVE_SEMANTIC_REPAIR仅none/once，全部真实最多5请求、单独工程最多2。当前已用完最后一轮上限，须先修复/验证明确问题，再为新轮次新建审核，不能给原Run追加额度。

<!-- end -->
