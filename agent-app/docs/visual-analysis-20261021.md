<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
# T19 视觉分析合同、像素请求、缓存与修正实施记录

## 当前结果

已从“仅上传图片”推进到**内部单图视觉分析服务**：读取真实派生像素 → 共享模型网关/调用账本 → 严格视觉结构校验 → 服务器绑定来源事实 → PostgreSQL缓存/租约 → 私有查询和不可变修正版本。

这还不是图生客户端工程。T19保持IN_PROGRESS；T18的MessageAttachment/Run冻结、T20控件映射、T21语义编译/snapshot、T22用户确认与前端接线尚未完成。没有收费模型调用或真实视觉质量结论，不绕过现有签名、审批、编译与构建。

仍为main现有混合dirty工作区，无commit/push；没有重置用户改动、修改其他服务、修改实际.env、启停当前试用服务。新增迁移只在新库 `kf_agent_test_analysis_20261021_1812` 验证，不对试用库 `kf_agent_e2e_trial_20261021_01` 执行迁移/seed/TRUNCATE。

## 1. 修复上一批遗留的交互诊断

先复现 `advanced-interactions.integration.test.ts` 的原失败，没有修改断言。根因是API端按诊断码把**所有**INTERACTION_CLOSURE_MISSING降级为warning；权威native编译器只允许明确不支持的Image click产生的同动作诊断这样处理。

- 导出并复用已有 `explicitlyUnresolvedImageClickActions`，不复制另一套判定规则。
- API仅把匹配Image click且reason=TRIGGER_EVENT_UNSUPPORTED的request及对应闭环错误作为兼容警告；普通动作闭环错误保持阻断，其他未处理的request同样阻断。
- 原失败现在返回mark-details-opened的精确闭环诊断，且不落ChangePlan；合法的Image兼容流程仍可编译。两文件33项及domain相关22项通过，最终API全量记录见后文。
- 扩大contracts回归另发现导航身份测试fixture漏填既有必填targetPageName，导致未进入其目标“GUID精确匹配”验证；只补fixture为home，原正/反断言保留，未放宽生产schema。完整contracts再验505项通过。

## 2. 视觉合同与真实请求

- 新VisualRegion/VisualReferenceSpec严格schema：最多100区域、单条文字≤2000、有限列表、有限安全hex颜色、归一box且不越界、confidence 0..1、ID唯一、parent存在且无环、uncertainty引用存在。额外native/tool/path字段拒绝；sourceAssetId不能是URL/路径。
- 专用稳定system prompt把图/OCR/用户文字当作不可信参考数据，不允许工具调用、抓URL或输出native配置；未知交互/数据源进入uncertainties。未修改既有文字任务prompt。
- `ReferenceAssetService.resolve`返回真实去metadata的WebP；构造user的text+image_url(data:image/webp;base64,detail:high)，而不是文件名或元数据描述。只有vision请求临时持有base64，不写入分析、账本、日志、事件或Run snapshot。
- 对文本UTF-8≤16KiB、图片≤10MiB、**实际序列化HTTP body≤16MiB**分别限制。共享serialize函数用于测量及实际transport，避免只估算messages而遗漏其他字段。
- 视觉provider响应流限制**80KiB**，并拒绝finish_reason=length、坏JSON/无效结构；保留现有100KiB JSON parser不变，保证接受后的spec连同PATCH envelope可提交。真实HTTP已验>64KiB分析修正，未通过放大全局parser影响其他接口。
- 视觉请求的HTTP错误不读取/回显原始provider错误体。非视觉旧调用不传新选项时保持原有transport行为，deadline/取消仍覆盖读取响应体。
- 模型输出先完整校验，再用服务器真实assetId、原图hash、**派生图viewport**覆盖模型猜测；区域采用归一坐标，后续映射仍由compiler决定最终工程尺寸。

## 3. 作用域、外发和记账

- analyze是内部方法，要求真实tenant/workspace/run归属，Run为RUNNING且未取消，tenant持久化 `imageEgressAllowed=true`，路由声明supportsVision；单次发送前再次查外发许可，发布前再次查Run状态和signal。
- Tenant新增外发许可默认**false**。本批未提供管理员启用UI/接口，也未开启任何真实租户；测试仅在新测试租户中显式设true并替换provider transport。T22必须接授权说明及租户管理员控制，不能拿上传开关代替外发授权。
- 生产Nest模块已装配ReferenceAssetService → VisualAnalysisService → ModelGatewayService → ModelInvocationService。无视觉模型或key时supportsVision=false，故障关闭，不退化为纯文字请求。
- 路由按服务实例配置复制冻结，cache记录modelConfigHash（含route、完整prompt、版本、输出/响应限制和thinking策略），**不代表Run受理时的模型配置snapshot已接通**；T22需把运行输入与分析来源/版本一并冻结。
- 视觉调用usage经过共享gateway真实落账本；缺价格仍cost=null，不伪造免费。预算按维护者要求暂缓，网关budget端口保持null。模型输出非法时不缓存，不自动修复或隐藏重试；每次显式analyze最多一次物理调用。

## 4. 缓存、租约和修正版本

- key包含tenant、workspace、assetId、sourceHash、derivativeHash、analysisVersion、modelConfigHash、instructionHash。比原计划增加工作区/资产/派生hash绑定，避免跨工作区误置sourceAssetId或变换版本复用旧像素；只同工作区同资产复用，不跨租户共享。
- 只复用VALID且未过30天TTL的结果；返回前校验缓存指针对应的全部身份字段与spec hash。TTL影响复用，不自动删除历史版本。
- 独立cache entry保存短租约/当前结果指针；短事务锁cache行，事务外调用provider，不长时间占DB连接。并发同key返回409 VISUAL_ANALYSIS_IN_PROGRESS；完成后重试复用结果。
- 租约随机owner+过期时间（route deadline+30秒）；发布做owner/期限CAS。丢失租约不能发布，新owner不被旧请求finally清掉。进程崩溃靠租约到期恢复；不宣称跨网络exactly-once或provider未计费。
- 模型分析结果不可覆盖；PATCH生成新的child ID/specHash，原记录和模型缓存不变。parent唯一约束保证同一版本的并发修正只有一个胜者；过时版本409。该版本策略为线性修正，分叉编辑仍属T17/T23。
- PATCH只修改区域text/role/box、designTokens、uncertainties；schema/source/viewport、区域id/parent/confidence/interactionHint冻结，不允许“换素材”。工作区删除先清cache entry，再由source外键级联回收分析，保留源/派生blob的既有清理逻辑。

新增清理回归又暴露现有Run记录阻止Conversation删除的外键错误，不通过删活跃任务绕过：已有确认删除流程现在对非终态Run返回409 WORKSPACE_ACTIVE_RUNS，对正在RUNNING/VALIDATING的build返回409 WORKSPACE_ACTIVE_BUILDS；保留原确认删除未领取legacy QUEUED job的既有行为。确认没有活跃执行后，先删除该工作区终态Run再删除Conversation。events/steps沿用FK级联，调用账本沿用ON DELETE SET NULL保留。已验证阻断时分析/图片不丢失，以及终态后的分析/cache/version清理和账本保留。此处不自动取消任何任务，也不删除用户试用数据；LangGraph checkpoint/预算等保留数据仍需既有独立保留策略，不宣称全数据擦除完成。

## 5. 当前HTTP接口与未开放项

| 接口 | 行为 | 安全边界 |
|---|---|---|
| GET /api/v2/visual-analyses/:id | 私有结构/来源/hash | cookie租户隔离，private/no-store，Vary Cookie；无provider URL、storageKey或像素 |
| PATCH /api/v2/visual-analyses/:id | expectedHash+完整spec，返回新版本 | 会话+精确Origin，严格body，来源不可变，版本冲突409 |
| POST /api/v2/visual-analyses | **不存在，404** | 不开放浏览器直接触发模型/费用的旁路 |

`AGENT_VISION_V1`及workbench的outboundImagesAllowed仍false，真实工作台图片入口仍关闭；不能将该flag设true跳过未完成依赖。Run目前仍拒绝图片附件。T18的本地上传开关不等于图生或外发授权。新协议没有启用，仍run-plan@6，旧POST messages/resume不恢复。

## 6. 数据、验证和复现

新增 `202610210002_visual_analysis`：Tenant默认拒绝外发字段、VisualReferenceAnalysis、VisualAnalysisCacheEntry，复合FK绑定tenant/workspace/source。全新专用库正常deploy20条；应用迁移后初始Prisma diff为No difference detected。运行图会另外建LangGraph checkpoint表，不能为消除后续diff删除这些非Prisma管理表。

本批已有验证：

- 新视觉contract：8项；完整contracts最终 **20文件505 passed / 0 failed / 0 skipped**。
- API首轮完整 **59文件647 passed / 0 failed / 0 skipped**，117.03s；含新视觉12项之前的11项集成用例。补充大结果HTTP修正后的最终完整结果追加如下，不混算不同运行。
- 新视觉内部分析13项+请求6项：真实像素与ledger、复用/TTL、跨租户、无授权/无视觉能力、DB并发租约、腐坏缓存指针、租约被替换、坏输出无隐藏重试、取消、不可变修正、并发修正、HTTP鉴权/Origin/严格body/大结果PATCH、活跃任务删除保护及终态后清理。最终集成13/13通过，请求6项已通过，不把不同运行拼成完整API总数。
- domain-client interaction/compiler两个相关文件22项通过；原失败advanced-interactions与graph-ports33项通过（均包含于/配套API回归，不重复累计总数）。
- root/API TypeScript、相关TS ESLint、Prisma validate通过。未重跑Web/浏览器/worker全套；无真实provider/KF原生环境/Windows或Linux native smoke结论。
- 初轮contracts曾504/505，根因与fixture修正如上。历史API HTTP Parse Error/偶发403记录仍保留；本轮通过不代表已定位这些偶发问题。

中间完整复核曾648/649（新增清理用例暴露上述Run外键问题）；已修复删除保护与顺序，并保留这条失败记录。最终全量复核另追加，不以此前648/648或单文件通过冒充最终全量。

删除保护初版曾过宽地拒绝旧legacy QUEUED build的既有确认删除，完整回归明确报出2条409/204差异。已收敛为只拦RUNNING/VALIDATING build，保留未领取legacy队列的原行为；不改这两条原断言。Run的非终态仍必须通过取消/结束后再删除，因为此前会直接触发外键失败，不把Run队列当旧legacy队列默删。

随后完整复核647/649的两条失败已不是删除：change-plan租户隔离例的login返回404、成功job报告例socket hang up。检查本机Supertest 7.2.2源码确认未listen的server会在请求构造时listen(0)，请求结束时close；主集成套件此前只app.init，由每请求启停，与其并发SSE/REST存在生命周期风险。现仅改该测试beforeAll为app.listen(0,127.0.0.1)，afterAll沿用app.close；没有改生产server、断言、重试或skip。最终完整结果另记；消除此风险不等于仅凭一次通过就断言所有历史Parse Error/403根因均已解决。

**最终完整验证（18:37:13起，107.42s）：59个API测试文件，649 passed / 0 failed / 0 skipped。** 包含最新13项视觉集成、6项像素/限制请求用例、59项主HTTP套件、Run核心流程与旧入口退役等；此前失败/中间回归均按上述实际原因保留，未用重试器、排除或改断言伪造通过。contracts完整505/505，domain相关22项；不等于monorepo全量或真实provider/原生KF验收。最终root/API tsc、相关TS ESLint、Prisma validate及diff whitespace检查通过。图初始化后只读Prisma diff返回2，仅列4个LangGraph管理的checkpoint表，不执行drop，不把这个返回码写成迁移失败或整库零drift。

复现（cwd=agent-app/apps/api，使用捆绑Node，显式Secure-cookie避免本机HTTP.env干扰）：

```sh
COOKIE_SECURE=true TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_analysis_20261021_1812 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run
```

测试只替换外部fetch/provider，真实图片、ArtifactStorage、Prisma、gateway、账本、schema、缓存、版本及HTTP边界保留。测试收到的usage为本地fixture数值，不是DeepSeek真实缓存/费用测量。

## 7. 本批文件清单与下一接手点

新增：

- packages/contracts/src/visual-reference.ts、visual-reference.test.ts
- apps/api/src/vision/visual-analysis-request.ts、visual-analysis-cache.ts、visual-analysis.service.ts、visual-analysis.controller.ts、visual-analysis.test.ts、visual-analysis.integration.test.ts
- prisma/migrations/202610210002_visual_analysis/migration.sql
- docs/visual-analysis-20261021.md

修改：

- packages/contracts/src/index.ts；ui-style.test.ts仅导航fixture必填字段
- packages/domain-client/src/implementation/ui-implementation-v2-compiler.ts仅导出已有Image-click判定
- apps/api/src/conversations/graph-ports.ts交互兼容判定收紧
- apps/api/src/api.integration.test.ts仅套件监听生命周期（init后listen一次，原app.close收尾）
- apps/api/src/models/task-prompts.ts、deepseek-transport.ts
- apps/api/src/vision/reference-assets.module.ts、workspaces/workspace.service.ts
- prisma/schema.prisma、docs/agent-runs-operations.md
- 仓库docs/superpowers/plans下p4-vision、next-master、handoff

不包含上一批所有改动，也不是整轮Windows补丁清单；正式出补丁仍需覆盖整次任务全部新增/修改文件且保留目录结构。

下一步：T20实现纯视觉region→既有控件/能力证据映射（不另写native旁路），T21接现有SolutionImplementationPlan与snapshot，T22一起补Run附件冻结、授权说明/租户管理、分析review/确认/前端和完整图生build/download。保留签名/审批/交付绑定、旧协议排空与P2发布门槛，真实模型smoke单独申请，不擅自启用当前试用租户外发。
<!-- end -->
