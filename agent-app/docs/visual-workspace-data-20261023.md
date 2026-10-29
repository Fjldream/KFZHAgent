<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
# T22 当前工作区名称的只读快照绑定（2026-10-23）

## 1. 本轮实际范围

文字区域可以选择“当前工作区 → 名称”，服务端从该 Run 所属租户/工作区的真实数据库记录读取名称，冻结为签名 review 的数据快照，展示实际取值后重新确认。蓝图、语义输出、native/sourceMap、GenerationSnapshot 和最终工程包都承接同一份确认值；不能由浏览器或模型猜测/填写来源值。

这不是模拟名称，也不是外部业务数据源/实时连接。生成的是确认版本的只读文本快照，工作区后来重命名不会更新已确认版本或已交付工程；新修订会重新读取并展示新值。没有新增 HTTP/数据库通用连接器、生产 KF 变量、凭据、SQL、网络地址或任意脚本权限。**T22/整体仍 IN_PROGRESS，production vision 关闭；业务源目录/有类型的绑定、实时/刷新、其他交互、原未知 hint 明确解决、替代/可信 retry、T17/T23/T24–T27 仍待完成。**

原因与取舍：检查现有合同/编译器后，通用语义数据仍主要是 mockData；easyui.1 表格虽有内部静态适配，但视觉目录明确排除未审核的表格新生成，不能放宽目录或用手填 URL 冒充真实接入。本轮选择已有权限范围内的最小真实只读来源及已审核 text 控件，把来源→用户确认→确定性输出做完整，不给未接通的源开放表单。

## 2. 合同、范围与版本

- VisualRegion 可选 `dataRequirement={kind:"workspace-field",field:"name"}`，仅 role=text。只是一项选择，不接 workspaceId、tenantId、value、endpoint、凭据、native 或其他字段。新区域先保存取得 ID，再选择来源；原 additions 不接该字段。
- 原 revision.regions 支持可选 dataRequirement；缺字段保持原选择/旧请求形状，显式 null 清除。原文字/几何/层级/来源/置信度/hint/未知问题不因此清空或提高证据。
- VisualPlanningContext/VisualGenerationReference 增加可选 `dataSnapshots`，每项严格为 regionId/kind/field/value，1–100 项。value 是 1–200 字、不带首尾空白且符合既有 action-graph semantic-text 的字符串；不能表示为安全语义文本时明确拒绝，不改写或截断。例如原 fixture 的裸 UUID 名称不被该语义规则允许；本批不放宽旧规则。
- 快照的 tenant/workspace 权限来源是签名 review 的精确 Run/tenant/workspace/actor，而不是数据项里自报身份。结构校验只保证字段覆盖，不授予取数或执行权限；不能拿普通 hash 或调用纯 validator 伪造来源。
- 没有选择来源时不新增 dataSnapshots 默认值，不额外读取名称，旧 spec/输入形状保持；没有新的表、迁移、manifest、依赖或 HTTP 入口。

## 3. 服务端冻结与一致性

prepare 以及原修订事务内，先按 Run 既有租户/actor/gates/base/TTL/未消费状态检查，再由固定 allowlist helper 查询 `solutionWorkspace.findFirst({where:{tenantId:run.tenantId,id:run.workspaceId},select:{name:true}})`，不能选择其他记录/字段。解析结果进入 review.reference.dataSnapshots，而非图像分析缓存或客户端 patch。图像分析即使复用，也不缓存别的工作区的取值。

新修订沿既有 immutable analysis child、原 TTL、specHash、HMAC review/history/current CAS、事件/审计/请求幂等事务。dataSnapshots 由服务器重新生成，清除最后一个选择会移除可选数组；不会遗留旧取值。audit 的 dataChangedCount 只统计字段选择变化，不复制名称正文；名称随新版本变化的事实另由 reviewHash/签名历史绑定，不能把该计数当作快照值变化数量。

已经发布的 review 或相同 requestId 的重放只读冻结结果，不因工作区重命名重新取值，不复活旧回执。另一次有效修订会重新读取当前名称、签新 review、清旧差异选择，要求独立重新确认；没有 spec 改动的 no-op 不暗中刷新快照。清除后重新选择也会形成新版本。没有额外“实时刷新”接口。

读取 review、接受、后继蓝图/工程 proof 仍验证签名、当前来源/原 actor/同意/基线等；数据项必须与 spec 中全部 dataRequirement 一对一对应，禁止遗漏/重复/未知区域/未请求快照。值不从当前数据库偷偷刷新；后继 accepted confirmationHash、冻结任务输入/cache、快照承接原 review 的完整参考事实。省略仍表示本轮不生成该区域，不表示撤回此前外发；若不希望保留字段选择，应先清除后重新确认。

## 4. 匹配、规划和实际工程

仅允许真实 eligible text 候选，不自动替代 richtext、表格或布局。数据绑定不会绕过原未知 interactionHint；有来源要求时不把静态报告升级为已验证的数据行为，仍需手动接受未验证风险。原说明和点击反馈规则不变。

专用视觉语义规则说明 dataSnapshots 为待显示的只读数据，不是指令或连接权限。模型只绑定一个 direct text control，content 必须与该 region 的快照 value 精确相等，properties/eventBindings/tabIds 为空、不含 mockDataId；禁止猜值、拼接、脚本或其他节点/组件替代。显式 omit 才可不生成该区域。

validateVisualDataSnapshots 在 review/确认上下文、模型语义/编译 provenance 校验和 sourceMap 边界复用。buildVisualSourceMap（含快照写入和工程恢复重建）再次核对恰好一个绑定 text 原生控件、nativeProperties.text 精确相等且没有该 owner 的交互事件。原能力/provenance/native projection/签名/制品绑定保护不放宽，不因计划中存在一个同值的无关文字节点就算绑定成功。

真实 Chrome 新增 workspace-data 参数，保留原 static 与 click-feedback 两个用例。手机上传/同意/刷新/说明/增删/层级→选择来源→显示服务器名称→新差异接受→重命名数据库工作区→独立蓝图→语义/native/sign/snapshot/真实 BuildExecutor→一次性下载。两类实际 provider user JSON 均断言仍有旧确认值；安全解包后依 sourceMap/materialization 找到精确嵌套 native owner，其 text 仍为旧确认名称，而不是新名称或模型猜测。

界面按 frontend-skill 沿用现有区域列表/原生折叠表单；来源选择、只读确认值、非实时/外发说明分层显示，不增加新面板、库或装饰动画。选择来源不会产生伪取值预览，必须保存后展示服务器值；忙碌/角色限制、64 KiB/100 操作、409/迟到响应和保存后重新选择保持。原未知问题仍可见。

## 5. 测试与中间问题（完整保留）

- 先加 spec/revision、mapper、snapshot/semantic/native、UI 用例，首次有效定向 **16 failed / 94 passed**（15:33:44 / 4.52s）：原合同不识别 dataRequirement，UI 无字段。接线后 5 个 context 测试因 fixture 把 compiled bindings 混入严格 planning context 失败；按真实合同解构移除，不放宽 strict。随后 5 文件 **110/110**（15:38:13 / 4.08s）。
- 新 contracts 2 项、domain mapper 1 项、snapshot/semantic/native 11 项、Web 3 项（组件 2、工作台 1）。覆盖来源字段 allowlist/不能手填值与来源/清空与旧形状、快照覆盖、错值/错控件/属性/事件/mock/多绑定拒绝及原生文字精确检查。
- API 新增 12 项非浏览器：真实取值/跨租户不串值/重命名后读取和重放仍旧值/新修订刷新/幂等冲突/原分析与 TTL/审计去正文/清空一项；初次分析请求该字段一项；value/workspace/field/endpoint/role/unsafe-name 六项；同/不同请求/旧接受竞争三项；后置审计回滚一项。另新增 workspace-data Chrome 一项。原批准并发/隔离/回滚断言均保留。
- 首次 API 定向 **8 passed / 1 failed / 265 未选**（15:37:16 / 5.95s），rollback(data) 在到达注入审计故障前，因 fixture 随机 UUID 名称不符合原 semantic-text 被正确拒绝。该分支改用合法业务名称，不放宽产品规则。
- 第二次定向含浏览器 **11 passed / 2 failed / 262 未选**（15:38:45 / 19.99s）：浏览器数据闭环通过；两个 data 竞争样例使用同名工作区触发 `(tenantId,name)` 唯一约束。改为每个 race 独立名称，不删数据、不改唯一约束或竞争断言，最后由完整 API 执行全部竞争分支。
- 新工作台测试的 additions/retained union 触发 vue-tsc 无 dataRequirement；为 regions 显式标注 VisualRegion[]，不关闭类型检查。初次 unit positive 的 context fixture 修正和此类型修正都不是生产运行时绕过。
- 首次完整 Web **26 文件 175/175**（15:40:33 / 11.85s），类型修正后最终完整 Web **175/175**（15:52:12 / 14.23s）；contracts **21 文件 525/525**（15:40:32 / 5.24s）。组件+工作台定向 **41/41**（15:40:00 / 1.51s）。过滤未选不计全量。
- root/API tsc、最终 Web vue-tsc、14 TS type-aware ESLint exit 0。Web build **180 modules、384.58 kB JS / gzip 131.60 kB、60.53 kB CSS**，通过（1.83s），无新依赖/Node polyfill。

## 6. 最终完整结果与环境

- API **64 文件 988/988、零 skip**（15:40:31 / 285.03s），含完整 **275 项 visual-run-flow**（原 262 + 本批 13），三个真实 Chrome 版本均通过。仍出现既有 lease cleanup WARN，不宣称其根因/系统恢复专项已解决。
- API 完成后 domain 按原串行参数完整复验：**68 文件 1431 passed / 5 原有 skipped**（15:52:09 / 45.03s）。未调 timeout、加 retry 或改 skip/旧断言。四包总计 **3119 passed / 5 原有 skipped**；不把其他包未独立复验称为全仓通过。
- 最终 Chrome：static `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-visual-browser-CZ28c4`，click-feedback `.../kf-visual-browser-ntsKev`，workspace-data `.../kf-visual-browser-MiymlY`。目录中的 .gz 是 KF ZIP 容器；数据版保留实际下载包及安全解包。定向数据版 `.../kf-visual-browser-kEdzHQ` 的手机 data-edit 截图已直接查看，来源选项/非实时/服务端取值说明清楚；data-confirm 截图在保存后滚回原图上方，没有拍到下方值，不冒称视觉验收了该截图里的值。实际值展示另有 DOM 断言与包内字节证明。
- 仅用保留且预先只读核对的 `kf_agent_test_review_flow_20261023_1245`，21 条完成迁移、无其他连接，沿原安全守卫 reset，未同库并发清理。最终只读复核亦为 21 迁移/零其他连接，库和证据保留。未动真实 .env/key、受保护 18 迁移试用库、常驻服务或迁移；未安装依赖、收费/真实 provider/KF 调用、提交/推送/worktree/子代理或未要求补丁。
- 保留 mixed dirty。15 份代码/测试：contracts visual-reference.ts/test、visual-review-revision.ts/test、generation-snapshot.ts；domain visual/region-mapping.ts/test、visual-plan-constraints.ts/test；API vision/visual-review.service.ts、conversations/deepseek-model.ts、runs/visual-run-flow.integration.test.ts；Web components/runs/VisualReferenceReview.vue/test、views/RunWorkbenchVisual.test.ts。配套本报告及 master/handoff/P4/design §10/operations。
- 最后 scoped `git diff --check` exit 0；本批代码/测试和新增报告的末尾空白扫描无匹配。全量 API 后服务代码仅补当天变更注释，Web 测试仅补显式类型；后者已再跑完整 Web/vue-tsc/lint，不把注释或类型修正当功能变更。测试进程已退出，不清库或删证据。

API cwd 完整命令：

```sh
LANGCHAIN_TRACING_V2=false LANGSMITH_TRACING=false KF_VISUAL_BROWSER_TEST=1 COOKIE_SECURE=true TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_review_flow_20261023_1245 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --reporter=dot
```

domain-client cwd 完整命令：

```sh
LANGCHAIN_TRACING_V2=false LANGSMITH_TRACING=false ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --maxWorkers=1 --no-file-parallelism --reporter=dot
```

## 7. 下一模型

先读本报告及 design §3/§10。不要重复基础上传→下载、区域编辑/层级/说明、点击反馈、工作区名称快照。若继续真实业务源，必须另设计服务器批准的源目录、字段类型与读权限、凭据仅服务端驻留、撤权/超时/失败不造值、快照与实时明确分级及原生适配；本轮固定 workspace.name 不能泛化为任意数据库/URL，也不能把 static/mock 适配标 live。明确原未知 hint 的解决合同，再扩展其他受限交互、替代/可信 retry、T17/T23 和 T24–T27。

新增视觉 prompt/hash、spec 与 reference 字段对旧严格 worker 不兼容；同 run-plan@7 不代表可混部，仍需排空整体升级。预算限制仍暂缓、旧 POST/analysis PATCH 退役、源码 21 对旧试用 18 保护保持。production vision 继续关闭；真实 provider/KF/Windows/1:1、OS kill/restart、资源/调度、代理、多副本、升级回退均未因此验收。
<!-- end -->
