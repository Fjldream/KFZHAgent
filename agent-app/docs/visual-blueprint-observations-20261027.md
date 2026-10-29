<!-- modified by jinlong.feng at 2026-10-27 Agent工作台迭代 -->
# 视觉观察来源约束、完整模型链路及原生显示修复交接

当前模型冻结版本：visual-blueprint@10 / blueprint-repair@4 / visual-semantic@21 / semantic-repair@10。本轮完成观察来源约束，得到完整真实模型工程及KF原生API往返证据；随后用户的开发态反馈证明名称和显示仍有缺陷。已修页名、CSS物理字段、背景归属和流式顺序；只读展示文字、尺寸策略及完整页面视觉验收未完成。T22与总体保持IN_PROGRESS，不能把工程结构合格称为UI合格。

## 1. 本轮边界与阅读顺序

先读本文，再读docs/superpowers/specs/2026-10-27-agent-native-visual-fidelity.md，其中有实际开发/运行消费者、脚本完整摘要、按控件的CSS矩阵与实施顺序。此前@9/3阶段详见visual-binding-feedback-20261027.md；历史证据原件保留。

用户优先客户端生成，暂不做预算和真实业务源；本轮数据都是演示值。仅修改agent-app及配套设计/计划，原生服务代码只读，无新依赖/迁移。生产vision关闭，受保护kf_agent_e2e_trial_20261021_01为18迁移，本轮不reset/seed/migrate，不启动或替换旧服务。21迁移隔离测试库允许既有测试清理，数据库套件严格串行、显式单worker。

## 2. 观察来源修复

上一真实50区域蓝图把容器排列说明当作expectedTexts，工程模型为满足它把批准layout.4改成richtext而被严格拒绝。本轮在蓝图成功前处理可见文字来源，不自动删步骤、换能力、猜原文或补默认值。

- observe.expectedTexts只能精确来自该page/region明确归属、非omit的已审核视觉区域。允许一个原text项，或同一来源全部非空项原序用单空格拼接，保留原成功“2 项”“15,000 kWh”；不允许跨来源拼接、归一化或借父/子/其他区域文字。
- 已声明字段绑定时采用同区域服务器冻结dataSnapshot.value，拒绝旧OCR；原blueprint.content/visualIntent/sampleData不构成独立可见来源。
- 对每个原journey step独立复用原schema，身份/归属无歧义时，别处缺来源或另一步schema失败不遮住当前可证明问题。无明确region来源的视觉observe拒绝。
- 最多4组观察诊断，每组12个expectedTexts索引、20个来源ID并保留总数；不重复回显原值。与schema首错和来源诊断合并仍最多8条，96KiB请求、32KiB草稿、每阶段一次修复保持。
- 模型成功输出、COMPLETED缓存、approval准备与复读共用同一检查；污染但schema合法的缓存也拒绝。新提示及observation/v1策略进入冻结hash，旧Run不补签，整体排空升级后新审核/独立确认。

实现见visual-blueprint-observations.ts及11项测试，输出/service/authority/request和合同接入；PG新增一次修复+缓存重放、污染缓存拒绝签名。浏览器observe/repeater夹具通过实际审核编辑把观察值改为明确文本，再继续原下载流程，未削弱原来源/层级/stale断言。

## 3. 完整真实模型验收

11:04实际4次DeepSeek请求，acceptanceMode=full-new-reference、planningFixtureRequests=0、physicalRequests=4。新上传合成能源图SHA256为3a79f4361e1e48b80ce64b1ec4053be63b4827df1c3f42deb5c7887bd3f2488c；新识图38区域、全部新审核、omit=0，新蓝图独立确认。

初始蓝图遗漏root/main来源，一次真实blueprint repair补齐；本轮初稿和修复稿都符合观察文字新规则，不能声称实际模型这次修过非法布局观察（该反例来自前轮原稿及PG）。工程初稿41节点/38绑定，无semantic repair，通过严格schema/候选/来源/观察/native/provenance，真实Run和BuildJob为SUCCEEDED，存储制品SHA与artifact一致。

| 实际阶段 | 输入/输出token | cache hit/miss | latencyMs |
| --- | --- | --- | ---: |
| vision | 1534/2504 | 1280/254 | 10168 |
| blueprint | 9897/2567 | 640/9257 | 14433 |
| blueprint repair | 12511/2806 | 9856/2655 | 11681 |
| implementation | 26932/5878 | 4352/22580 | 18402 |

不同轮次区域/提案不同，不承诺固定缓存或token改善比例。此前@9/3报告的12次真实调用属于前一轮；本轮只新增上述4次，后续原生探针没有模型费用。

原始目录：/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-energy-live-S0Bem2。公开原件9份JSON及逐件SHA在tests/fixtures/energy-overview-20261023/live-full-observations-success/README.md，没有语义修复回复文件，因为没有发生该调用。保留result.json的nativeKfAccepted/browserAccepted=false，不回改历史结果。

## 4. 原生工程及用户反馈

outputs/energy-ui-full-20261027/energy-client.gz：20122bytes、ZIP64项、展开99939bytes，SHA256 73ab92687642435f3c2b73a156089e5f74587fe32439a0eeaca79eee25d719ba；1440×1412、28个uiModelType7/35控件及布局。扩展名.gz实际是KF ZIP格式。

KF443新建EnergyUiFull20261027（aa3817b0-d1b3-11f1-9098-17c9886f9377），工程数46→47；原包导入、page-overview读回与原JSON逐值一致，原生导出108722bytes/64项、SHA256 99066a1f7d5ad53af3be8aafe05a0108a557338cca13369d404f81a44afe66dd。再导入EnergyUiFullRt20261027（d426f4b0-d1b3-11f1-9098-17c9886f9377），47→48，页面再次相等。两工程unPublished，没有覆盖其他工程。公开原响应保存在同目录kf-native/。

用户随后明确错误在“已导入后打开页面时”，名称含非法字符，并提交开发态截图：大片textarea、顺序错位、默认字体/颜色及大量留白。该反馈优先于字节往返结论；原包保留历史，不当作UI修复版。没有发布运行、完整开发态打开/保存或1:1结论。

## 5. 已实现的原生基础修复

1. native-page-name.ts保留合法ASCII名称，否则以Page+完整SHA256确定性派生原生安全名称；保持semanticPageId、pageGuid及导航GUID。新生成页面同步文件名、pageProperty/pagePrototype、index与pageManager/default/appHomePage；上传既有页面不重命名，碰撞拒绝。
2. native-presentation.ts根据真实消费者路由CSS：布局baseProperty.styleDataNew；已证据化ElementUI族根styleData；EasyUI仍根styleDataNew。直编、普通applyStyle、creative补丁和creative校验共用；旧未知字段与客户CSS保留，受管块幂等。
3. 布局及ElementUI背景改为实际选择器CSS，不再发未被显示消费者应用的backgroundColor。语义样式合同不开放任意CSS，内部历史交接名styleDataNew不等于物理字段名。
4. KF横/纵布局按insiderObjects数组排版，故新生成兄弟按签名几何x/y排序；绝对画布仍按zIndex/order。上传既有兄弟槽保留，校验使用相同规则。
5. 新签名集成用例实际使用page-overview/page-details，经HMAC签名、补丁/校验，证明全部名称位置同步且GUID导航保持；把实际按钮styleData移到错误styleDataNew，校验必失败。没有改旧Run或手补历史包。

## 6. 真实Chrome控件证据与限制

outputs/native-style-probes-20261027保存用户截图、控件探针截图、computedStyle与bootstrap错误。Chrome从KF443实际加载679个脚本，在内存实例化Tag/Button/RichText，分别设置开发/运行标志，没有保存工程。

Tag与Button实际styleData和真实子节点CSS均显示30px/700、目标颜色背景；Tag显式关闭新增/删除，单项文字没有input或button。RichText开发模式仍为默认18px/400的textarea，不消费CSS；运行分支还缺KMUserAuthManager并在权限处理处中断。仅注入WellinUserToken直接打开入口也因缺门户userStore而失败。已保留这些限制，不能把探针叫完整运行应用。

本地RunClient转换/页面管理代码亦已只读审阅；443相同旧路径404，部署版本不同，不能凭旧代码路径声称实机运行侧全通过。完整门户登录→开发态→独立运行态仍是待做验收。

## 7. 验证与初始红灯

观察规则初始5失败/1通过；同来源单位拼接误拒原43项成功稿后，明确原序单空格规则，未做宽松归一化。完整真实模型前API80文件1177/1177、零skip，含347视觉及五类Chrome；这属于原生修复前阶段，不冒充后续源码全量。

原生修复按红绿完成：页名5fail/1pass；样式位置/背景首轮5fail/11pass；ElementUI字段及背景首轮2fail/15pass。旧测试曾断言错误backgroundColor/styleDataNew字段，已按实际消费者修订并保留未知字段/客户CSS/安全/篡改断言。新集成测试初版用了不存在的report.passed/ok及漏传bootstrap镜像校验选项，修正为原report.status和对称授权，未放宽校验器。TypeScript另捕获测试未收窄可选认证句柄，改显式存在检查。

后续当前代码：合同/领域97文件2132pass/5既有skip；新增签名页名/错误CSS槽用例1/1复验。API完整主批79文件1161pass/1fail，失败仅金标准仍读取顶层styleDataNew；已改按实际族读取，随后定向复验见下方最终记录。run-flow独立15/15。不能将重叠复验重复累加或把首批说成单次全绿。

日志：/tmp/kf-native-css-domain-verified-20261027.log、kf-native-name-integration-verified-20261027.log、kf-native-css-api-flow-20261027.log、kf-native-css-api-main-20261027.log、kf-native-css-api-goldens-20261027.log；全部在/tmp。类型与lint最终记录也在/tmp/kf-native-css-*.log。没有通过延长授权/删测试/禁用Chrome/降低原生校验来制造通过。

## 8. 下一模型直接执行顺序

- [ ] 先为只读单行展示文本补受限语义适配，优先复用已探针Tag50；多行正文另验证换行/容器。普通Tag用途兼容，不能悄悄把旧批准richtext转换成Tag。
- [ ] 增加编译器闭合初始化、精确解析与native来源/文字观察；禁止任意configureData。同步候选知识、批准模式和冻结指纹，补篡改/旧审核拒绝/新审核通过测试。
- [ ] 完成字体族与回退、真实label字号/字重/行高/对齐，清默认组件边框/padding，验证Windows可用字体。现有theme.fontFamily尚未实际进入CSS，不能漏掉。
- [ ] 将fixed/content/fill逐轴映射到native sizePolicy/fixedSize，interval/insets按真实开发和运行布局算法传递；固定尺寸来自编译几何，不全局强制fixed或直接保留模板EXPANDING。
- [ ] 冻结参考viewport及坐标比例，检查根画布和留白；图标用授权资源，图表补真实数据/系列/options及重绘。CSS只管外观，不能替代图表配置。
- [ ] 经门户登录建立真实开发态会话，单控件与完整页取DOM、boundingClientRect、computedStyle和截图；保存新工程并原生导出/重导。运行侧须找实际部署入口，不重复猜旧404路径。
- [ ] 上述单控件/离线/PG完成后，用新Run、新审核/蓝图确认做有界真实模型生成；原包原件保持。生成独立修复包，不能重签旧Run或改变已批准能力制造成功。
- [ ] 独立KF工程验证开发态可开/保存，再独立应用部署运行，按目标图对比字体、位置、颜色、卡片、图表/图标、缩放、滚动及必要交互。保留旧工程和运行应用，最终报告实测偏差，不承诺无测量的1:1百分比。

预算与真实业务源继续暂缓。旧服务/受保护库保持，新代码不能混用旧视觉缓存/确认记录；必须排空整体升级、新审核与独立确认。

## 9. 本轮文件清单与最终记录

最终核验：API金标准1/1（13:12:21，11.80s），三个结构不同工程各构建两次，保留Worker、交付、导入及约束脚本断言；主批唯一旧字段断言修复后通过。与主批1161项及独立run-flow15项合计1177个独立API用例均经执行通过，主批仍如实记录1fail，未做重复累加。主批347视觉用例包含5类真实Chrome夹具流程，均通过；这些浏览器模型是夹具，不等于KF运行验收。

合同/领域最终97文件2132pass/5既有skip（/tmp/kf-native-css-domain-verified-20261027.log，13:08:19，15.51s）；之后只给新测试增加可选句柄显式收窄，定向1/1再次通过。API、领域、根TypeScript及本轮26个TS文件ESLint通过。两隔离测试库均21迁移、other_connections=0、pendingBuildJobs=0；只读终检见/tmp/kf-native-css-db-state-20261027.log。临时KF认证会话已删除。

新9份原JSON的README摘要、2份历史工程包SHA及18份公开JSON的私密字段扫描通过；本清单git diff --check通过。原始JSON为证据数据，保持字节与合法JSON，不插入源码注释。原生服务未修改，因此没有格式化或打补丁到压缩服务文件。

本轮精确58文件：25个既有文件改动、33个新增文件（含原始证据、历史工程包及探针截图）。这是相对本轮基线/tmp/kf-observation-baseline-20261027.json的清单，不能拿整个dirty tree出补丁；临时机器清单/tmp/kf-observation-manifest-20261027.json。后续出补丁须逐件包含下列路径、保持目录，不能遗漏新增文件或把前轮无关改动打入。

- `agent-app/apps/api/src/creative-goldens.integration.test.ts`
- `agent-app/apps/api/src/runs/visual-run-flow.integration.test.ts`
- `agent-app/apps/api/src/vision/visual-blueprint-authority.ts`
- `agent-app/apps/api/src/vision/visual-blueprint-observations.test.ts`
- `agent-app/apps/api/src/vision/visual-blueprint-observations.ts`
- `agent-app/apps/api/src/vision/visual-blueprint-output.ts`
- `agent-app/apps/api/src/vision/visual-blueprint-request.test.ts`
- `agent-app/apps/api/src/vision/visual-blueprint-request.ts`
- `agent-app/apps/api/src/vision/visual-blueprint.service.ts`
- `agent-app/docs/agent-runs-operations.md`
- `agent-app/docs/visual-blueprint-observations-20261027.md`
- `agent-app/outputs/energy-ui-full-20261027/README.md`
- `agent-app/outputs/energy-ui-full-20261027/energy-client.gz`
- `agent-app/outputs/energy-ui-full-20261027/kf-native-export.gz`
- `agent-app/outputs/energy-ui-full-20261027/kf-native/export-response.json`
- `agent-app/outputs/energy-ui-full-20261027/kf-native/import-response.json`
- `agent-app/outputs/energy-ui-full-20261027/kf-native/page-response.json`
- `agent-app/outputs/energy-ui-full-20261027/kf-native/pages.json`
- `agent-app/outputs/energy-ui-full-20261027/kf-native/project.json`
- `agent-app/outputs/energy-ui-full-20261027/kf-native/roundtrip.json`
- `agent-app/outputs/energy-ui-full-20261027/kf-native/upload-response.json`
- `agent-app/outputs/native-style-probes-20261027/README.md`
- `agent-app/outputs/native-style-probes-20261027/bootstrap.json`
- `agent-app/outputs/native-style-probes-20261027/component-probes.png`
- `agent-app/outputs/native-style-probes-20261027/components.json`
- `agent-app/outputs/native-style-probes-20261027/user-reported-development.png`
- `agent-app/packages/contracts/src/visual-review.ts`
- `agent-app/packages/domain-client/src/compile/client-compiler.test.ts`
- `agent-app/packages/domain-client/src/compile/control-compiler.test.ts`
- `agent-app/packages/domain-client/src/compile/control-compiler.ts`
- `agent-app/packages/domain-client/src/compile/native-page-name.test.ts`
- `agent-app/packages/domain-client/src/compile/native-page-name.ts`
- `agent-app/packages/domain-client/src/compile/native-presentation.test.ts`
- `agent-app/packages/domain-client/src/compile/native-presentation.ts`
- `agent-app/packages/domain-client/src/implementation/ui-implementation-compiler.test.ts`
- `agent-app/packages/domain-client/src/patch/client-patcher.test.ts`
- `agent-app/packages/domain-client/src/patch/client-patcher.ts`
- `agent-app/packages/domain-client/src/patch/creative-native-materializer.test.ts`
- `agent-app/packages/domain-client/src/solution-compile/solution-compiler.test.ts`
- `agent-app/packages/domain-client/src/style/adapters/base-adapters.test.ts`
- `agent-app/packages/domain-client/src/style/adapters/base-adapters.ts`
- `agent-app/packages/domain-client/src/style/style-engine.test.ts`
- `agent-app/packages/domain-client/src/validate/client-validator.ts`
- `agent-app/tests/fixtures/energy-overview-20261023/live-full-observations-success/README.md`
- `agent-app/tests/fixtures/energy-overview-20261023/live-full-observations-success/accepted-differences.json`
- `agent-app/tests/fixtures/energy-overview-20261023/live-full-observations-success/blueprint.json`
- `agent-app/tests/fixtures/energy-overview-20261023/live-full-observations-success/initial-blueprint-provider-reply.json`
- `agent-app/tests/fixtures/energy-overview-20261023/live-full-observations-success/initial-provider-reply.json`
- `agent-app/tests/fixtures/energy-overview-20261023/live-full-observations-success/reference-review-before-edit.json`
- `agent-app/tests/fixtures/energy-overview-20261023/live-full-observations-success/reference-review.json`
- `agent-app/tests/fixtures/energy-overview-20261023/live-full-observations-success/repair-blueprint-provider-reply.json`
- `agent-app/tests/fixtures/energy-overview-20261023/live-full-observations-success/result.json`
- `agent-app/tests/fixtures/energy-overview-20261023/live-full-observations-success/vision-provider-reply.json`
- `docs/superpowers/plans/2026-10-20-agent-app-handoff.md`
- `docs/superpowers/plans/2026-10-20-agent-app-next-master.md`
- `docs/superpowers/plans/2026-10-20-agent-app-p4-vision.md`
- `docs/superpowers/specs/2026-10-20-agent-app-next-design.md`
- `docs/superpowers/specs/2026-10-27-agent-native-visual-fidelity.md`
<!-- end -->
