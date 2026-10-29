<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
# 能源 UI → 真实模型 → 客户端工程联调（2026-10-23）

## 1. 当前结论与优先级

<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
后续受限静态观察合同已实施，当前进度优先看 `visual-observation-journeys-20261023.md`：kind/expectedTexts、共享语义与原生/制品证明、审批展示和新冻结 prompt 均已接入。旧真实负例未改写，重复模板内容证明和实际响应的侧栏按钮候选不匹配仍待解决，仍无该能源图真实交付/KF运行结论。下文是前轮真实调用历史，不是本轮又发生付费调用。
<!-- end -->

**真实识图与独立蓝图阶段已经执行通过；真实模型工程生成验收仍失败，没有产出本轮可交付工程，更没有完成本轮 KF 导入、运行或 1:1 验收。** 本地 fixture 闭环和真实模型结果必须分开报告。

用户最新要求：先完成客户端工程生成，真实业务数据源暂不做；预算强制限制仍暂缓，调用/用量记录保留。用户授权真实模型测试，要求生成能源管理系统 UI 图作为可外发验收输入，并提供 KF 测试环境。后续不再以业务源目录为当前主线。

本轮使用已有本地配置读取模型密钥；没有把聊天中提供的凭据写入代码、环境文件、文档、证据或日志。建议用户更换聊天中发过的密钥及密码。KF 环境与账号可用于后续授权测试，但不能据此覆盖已有工程、重启既有应用或部署到任意端口。

## 2. 验收参考图

- `tests/fixtures/energy-overview-20261023/reference.png`，内置 imagegen 按用户要求生成，最终提示词和来源见同目录 README。
- 1586 × 992；源文件 1,245,528 bytes；SHA-256 `3a79f4361e1e48b80ce64b1ec4053be63b4827df1c3f42deb5c7887bd3f2488c`。
- 通过原 `prepareReferenceImage` 得到无元数据 lossless WebP，735,594 bytes；SHA-256 `084fbf8a65522489b39e45c346ea893075beed99ab3cf93de30b95177e79660c`。
- 画面：能源总览、三项指标、设备状态、运行摘要、查看运行说明按钮；所有数字明确为演示数据。此图是目标图，不是生成工程的运行截图。
- 本轮验收范围是静态原生界面近似，不接业务源、不生成未确认的导航或按钮动作；允许明确省略纯装饰细分隔线，不自动省略其他不支持区域。不允许整图作为背景冒充原生组件还原。

## 3. 服务与环境只读检查

- 用户确认服务商 DeepSeek。官方当前文档：`https://api-docs.deepseek.com/zh-cn/guides/vision/`、`https://api-docs.deepseek.com/api/list-models/`、`https://api-docs.deepseek.com/zh-cn/quick_start/pricing/`。
- 已真实 GET 官方 `/models`，返回 `deepseek-flash` 接受 text/image，context_window=1048576；`deepseek-v4-pro` 是 text-only。API Key 未输出。
- 本地已配置真实 DeepSeek、官方地址和文本模型 `deepseek-v4-flash`，**视觉模型配置为空**；未修改真实 `.env`。本轮只在验收组合根使用官方 `deepseek-flash`，明确 supportsThinking 并关闭本次 thinking，timeout=120000；context 按实测元数据声明为 1048576。
- `https://192.168.3.32:443` 的只读 HEAD 返回 200。默认 shell 代理不可用；指定该内网地址直连后通过。
- 内置浏览器返回 `ERR_CERT_AUTHORITY_INVALID`。仅连通性 HEAD 对该测试主机临时忽略证书验证；未修改系统信任、服务器证书或全局 TLS 设置。未 SSH、未 KF 登录、未上传、未导入、未发布/部署/启动应用。本轮未重新确认 KF 实际版本；旧验收文档写 3.6/SP4 只能当历史线索。

## 4. 已修复的源码问题

### 4.1 识图输出协议与模型权限

- `vision@v2` 用可解析 JSON 示例和精确七个顶层字段，明确 API 的 `type:json_object` 不属于输出数据。真实模型曾混入该字段；严格 schema 的拒绝保留，不做自动删除。
- 明确文本叶子/父容器不重复、数值不是 card；静态且没有可见行为时 interactionHint=null，不填字面量 static/none。真实模型曾用 static 导致正确的未知交互能力阻断；未放宽映射校验。
- 提示词要求模型不要自行补充人工修订字段。服务器保留原有受限提议→签名review展示→用户差异确认→独立蓝图确认流程；提议本身不是执行授权。完整回归验证了初始工作区名称只读提议仍能正常展示真实快照，不破坏原有功能。
- 识图网关绑定服务启动时复制的完整有效 route。旧签名任务若冻结了其他地址/模型/能力档位，不会取得当前密钥的调用出口；在记账/外发前拒绝。与蓝图/工程网关边界一致。

### 4.2 蓝图提示词与真实合同不一致

真实蓝图曾漏 schema、sampleData 中出现 boolean/number、容器 content=[]。旧提示词没有完整表达这些约束。

- `getCustomerSolutionBlueprintJsonSchema()` 在 contracts 包内从原 Zod 合同生成结构性 JSON Schema，API 不新增 zod 直接依赖。
- `visual-blueprint@2` 系统提示词携带完整结构合同，并明确 schema 实际输出、sampleData 字符串值、content/states 等非空、蓝图高层区域最多12个。
- 原运行时实现数据禁入、跨引用、能力、审批和签名验证仍保留。JSON Schema 不是可绕过这些验证的替代品。
- 修复后的真实蓝图经正式 PG 图进入独立 WAITING_INPUT，之后通过原确认动作进入工程 Run。

### 4.3 视觉工程规范化顺序

真实响应使用 `theme.fontFamily="system-ui, sans-serif"`。文本生成已有有界别名规范化，但视觉入口先校验完整外层 schema，提前拒绝该合法可规范化形式。

现在先校验严格外层封装和 bindings，再调用原 `validateSemanticImplementationOutput` 的规范化与完整计划验证。未知外层字段、原生字段、非法 plan、能力、旅程、视觉绑定检查均不删除；缓存仍要求规范化后与已保存事实精确一致。新增红绿测覆盖字体/颜色别名和注入拒绝。

## 5. 本轮仍未解决的实际阻塞

离线重放真实第三阶段响应，字体问题修复后精确失败：

```text
solution implementation plan failed journey gate:
必须将已确认旅程步骤 review-overview:0 映射到实际实现该交互的 action.journeyStepRefs
```

该蓝图旅程是静态浏览总览，真实计划 `actions=[]`，并非缺少用户要求的点击事件。当前合同把每个旅程步骤都当作必须由可执行动作覆盖，没有结构化的只读观察步骤区分。**不要通过伪造反馈/导航动作、删除旅程或跳过全部旅程验证让它通过。**

下一实施切片应先设计并红测观察/交互两类旅程：旧无类型步骤保持原交互约束；观察步骤必须有真实可见内容和读路径覆盖；交互步骤继续要求真实事件/动作/observable closure。同步蓝图合同/显示、模型协议/版本、语义验证、领域编译和 native/sourceMap 证据，保留独立用户确认和旧任务不混部边界。使用下面真实负例先离线复现，再验证真实模型工程、打包、KF 独立测试工程导入与运行，最后做截图还原度比较。未知 interactionHint 的明确解决、替代/可信视觉 retry、T17/T23 和 T24–T27 仍非本轮已完成项。

## 6. 真实付费尝试与负例证据

另有一次直接调用原图片处理、request builder 和 transport 的识图 smoke：10,382ms，48个区域；input=1344/output=3108/cacheHit=0。它未经过 Run/账本，不作为完整流程通过依据。此前一次模块路径错误在请求前失败，没有产生该次模型调用。

正式 Run 验收每轮新建隔离租户/工作区，不重置数据库，不自动重试；固定官方端点与图片 hash，每轮最多3次物理调用。使用生产 Store/executor/PG图、原 review/独立蓝图确认、原语义/编译/BuildExecutor 入口；组合根仅注入实验视觉策略，production resolver 仍关闭。最后两个阶段发生失败时无 build job/工程包；不把 provider 的 SUCCEEDED 账单状态当任务成功。

| 尝试 | 正式物理调用数 | 结果 | 临时证据目录后缀 |
| --- | ---: | --- | --- |
| 16:37:19，15.79s | 1 | 识图成功；验收脚本额外要求无全局问题，被静态导航/数据源问题阻断；后续保留问题，不清除或授予执行权限 | `MqzbN2` |
| 16:38:45，10.78s | 1 | provider多出type字段，被原严格schema拒绝 | `PzkP3D` |
| 16:42:55，13.17s | 1 | 新协议有效，但 interactionHint=static 导致未知交互映射阻断，未自动省略业务区域 | `62SJus` |
| 16:44:46，28.58s | 2 | 识图/差异接受成功；蓝图实际输出合同失败 | `jAcuqI` |
| 16:49:47，54.01s | 3 | 识图和修复后的蓝图成功；工程字体先校验问题；修复后离线进一步定位静态旅程阻塞 | `fG3JON` |

这些目录完整前缀为 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-energy-live-`，均保留。五轮各执行一个指定测试，其余275项是按名称筛选未执行，不属于那五轮回归通过计数。

最终轮实际用量：vision 1534/3287（命中1280）；blueprint 10708/2645（命中0）；implementation 28514/6065（命中0），分别约10.9/16.1/19.3秒。数字为input/output tokens。前缀、协议和输入多次变化，**不能据此声称缓存命中率或降本目标已验收**；费用定价版本未配置，不能编造人民币成本。

已复制必要、无凭据的模型负例到 `tests/fixtures/energy-overview-20261023/live-negative/`：

- `reference-review.json`：原识别结构/映射；不含私有 review HMAC。
- `accepted-differences.json`：该静态验收的明确差异选择。
- `blueprint.json`：通过独立审批阶段的真实蓝图。
- `semantic-provider-reply.json`：真实模型工程响应正文封装，不含 HTTP headers、reasoning_content、图片 base64 或凭据。
- `result.json`：三次调用用量与当时任务状态。它记录的是**修复字体顺序之前的失败**，后续离线诊断不能回填成原轮通过。

新模型可完全离线读取这些文件，以 `retrieveCapabilities({blueprint,knowledge:getDesignKnowledgeSnapshot()})` 重建原候选，组装 visualReference.acceptedDifferences 和 confirmedSolutionBlueprint，调用 `validateVisualSemanticOutput` 重现 §5；不修改原响应，不需要密钥或数据库。

## 7. 验证记录

- 新提示词和网关边界先红测；最终视觉凭据边界新增1项（内部检查7种route变更），提示词新增2项，蓝图请求新增2项，规范化新增2项。中间 API 直接导入未声明 zod 的错误已修复为由 contracts 提供 schema 工厂；无新增依赖或 lockfile 变更。
- 初段5个纯测试文件27/27；收窄字段限制后以最终完整回归为准。DeepSeek adapter完整129/129；API/root tsc、Web vue-tsc、最终12份TS类型感知lint、Web build通过（180 modules，JS384.58kB/gzip131.60kB，CSS60.53kB）。
- Web 26文件175/175，contracts 21文件525/525（16:50:08）。
- API退出后串行domain-client全量：68文件1431 passed / 5原有skipped（17:05:27 / 39.89s）。四包合计3126 passed / 5原有skipped；不是整个monorepo所有独立包的全量测试结论。
- 首轮完整API **66文件，998 passed / 1 failed**（16:54:20 / 281.49s），275视觉流程中的274项及三项Chrome通过。失败精确为原“初始只读字段提议”正向用例：本轮额外字段禁入过度收紧了既有设计。该流程仍须用户审阅，不是模型授权；已撤回新增禁入逻辑，恢复原解析器，保留原正向用例/所有断言及权限/签名门槛，没有删除原有测试或放宽schema。同步移除4项本轮为已撤销限制新增的测试，因此最终数由999变为995，不是跳过原有失败。
- **最终完整 API：66文件995/995，无failed/skip**（17:00:30 / 271.94s），包含全部275视觉流程及三项真实本地Chrome上传到下载。三份最终浏览器证据分别为 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-visual-browser-6iLzOy`、`kf-visual-browser-QE1CbH`、`kf-visual-browser-rZpNVC`（后两项同一父目录）。模型是fixture，不是上面真实模型验收全绿。既有lease cleanup WARN仍出现，未宣称根治。
- 本轮使用既有安全隔离库 `kf_agent_test_review_flow_20261023_1245`，不连接/迁移/清空受保护的试用库。源码21迁移对旧试用18保护不变。完整回归可能清理隔离库内旧测试行，持久证据以上述文件为准。
- 测试后只读复核：隔离库21条已完成迁移、其他连接0，测试进程均退出，数据库/临时证据保留。普通沙箱的连库检查曾被网络限制拒绝，获得检查权限后成功；没有把连接拒绝解释为数据库服务故障或据此重启服务。

命令（工作目录 `agent-app/apps/api`，密钥仅由本地已忽略 `.env` 读取，绝不写在命令中）：

```sh
# 真实验收，仅明确授权后执行；每轮最多3次调用；本轮最终失败不应被当成通过。
LANGCHAIN_TRACING_V2=false LANGSMITH_TRACING=false MODEL_PORT_MODE=fake KF_LIVE_VISUAL_ACCEPTANCE=energy-overview-20261023 TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_review_flow_20261023_1245 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node --env-file=../../.env ../../node_modules/vitest/vitest.mjs run src/runs/visual-run-flow.integration.test.ts -t 'accepts the generated energy UI through real DeepSeek and the native engineering pipeline' --reporter=dot

# 本地完整回归；付费用例显式禁用；Chrome的provider是fixture，不能替代真实模型验收。
LANGCHAIN_TRACING_V2=false LANGSMITH_TRACING=false KF_LIVE_VISUAL_ACCEPTANCE=disabled KF_VISUAL_BROWSER_TEST=1 COOKIE_SECURE=true TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_review_flow_20261023_1245 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --reporter=dot
```

## 8. 升级与交接边界

- **T22/总体计划仍 IN_PROGRESS，production vision继续关闭。** 不直接修改 flag 来开放；不宣称真实工程、KF 或像素验收完成。
- `vision@v2`、`visual-blueprint@2` 和 prompt/config hash 改变；新的严格蓝图冻结合同拒绝旧@1。即使 Run 仍@7也不能混部。需要排空旧视觉任务与worker、整体升级并重新创建/确认验收任务，不能倒签或改写旧证据。
- 没有新数据库迁移、依赖、实际 `.env` 修改、试用进程重启、KF远程写入、git提交/推送、worktree或子代理。未动 `front`/其他服务现有混合修改。
- 本批12份TS代码/测试：`models/task-prompts.ts/.test.ts`，`vision/visual-analysis-protocol.ts/.test.ts`，`reference-assets.module.ts`，`visual-blueprint-request.ts/.test.ts`，`runs/visual-run-flow.integration.test.ts`，`conversations/deepseek-model.ts/.test.ts`，contracts的`visual-review.ts`和`solution-blueprint.ts`。`visual-analysis.service.ts`的本轮额外限制已完整撤回。另有本报告、验收图/README/5份负例JSON、master/handoff/P4/design§10/operations索引。补丁如需交付必须保留路径并包含本任务全部新增和修改，不能按当前混合dirty一股脑打包。
<!-- end -->
