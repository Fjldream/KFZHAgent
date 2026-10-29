<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
# Run 工作台浏览器验收与审批重规划修复交接

日期：2026-10-21。基线：main / `94364cd9add74915c6f85af96357ee5b286faede`，沿用维护者选择的混合 dirty 工作区。范围：T09/T12 浏览器与独立执行进程子项，附带修复两个真实流程缺口。**T12 整体仍 IN_PROGRESS，未获生产发布验收。**

## 1. 本批结果

1. 迁移全部现存 Playwright specs/helpers，不再依赖旧 UI、POST messages/resume 或旧 `done` SSE。
2. 隔离环境启动 API、build-worker、tenant A agent-worker、tenant B agent-worker、Web 五个独立进程。API/build-worker 使用生产入口；B 使用生产 agent-worker 入口与现有 fake model；A 复用相同 bootstrap/图/存储/执行器，只经 Nest 测试装配替换 ModelPort。
3. 新建 creative-v2、已映射 module-v1、上传 legacy 原生工程均通过当前 Run 链路实际构建。原生工程有真实审批/重规划/取消；creative/module 确认蓝图后按当前设计直接受控编译，不制造额外技术审批。
4. 新建工程的实际浏览器下载，与独立两段式 token 下载字节一致；查询 delivery 的 job/revision/artifact 绑定一致。
5. 原生上传包经签名样式编译只改变 Button1.backgroundColor 为 `#ff0000`。Page1 其余完整 JSON 相等；包内其他文件逐字节一致，文件集合无增删，未知字段保留。

## 2. 真实问题与修复

### 2.1 新工作台遗漏上传入口

`RunWorkbenchView` 未消费 `workspace.mode`，只提供消息输入，原有 UploadGuide 没接入。上传工作区没有 currentRevisionId 时无法在 UI 上传源包。

现在空上传工作区展示原有 UploadGuide；上传前/中禁止发 Run；成功后重新查询权威 workspace/revisions，显示 v1 后开放输入。拒绝上传保留入口与错误，不能创建 Run。已有视图代际校验保护跨工作区/租户切换后的迟到结果；readonly 不允许经该入口上传。没有修改后端既有上传权限合同。

单测先复现没有上传入口（1 failed / 17 passed），修复并补拒绝/readonly/迟到响应后视图 21 项通过，全 Web 129 项通过。

### 2.2 待审批方案被误当成已执行基线

浏览器原生审批重规划得到 `UI_IMPLEMENTATION_INVALID`。追踪发现 implementation-plan 向编译器传 `previousSpec=state.uiImplementation`，但该值只是待审批提案，尚未应用到当前修订。确定性编译器正常地过滤“相对上一提案没有变化”的操作，实际造成：

- 相同提案编成空补丁，无法重新审批；
- 仅改一部分提案时，其他仍未应用的操作被遗漏。

新增两项使用真实 `compileUiImplementation` 的节点测试，红测分别复现上述两种结果。修复是原生 implementation-plan 始终以 `currentRevisionId` 查询出的真实 editableEntities 编译完整期望规格，不再用待审批规格作已应用 diff 基线。给模型的修订上下文、未被模型显式包含的先前组件保留逻辑仍存在；module/creative 的独立编译协议未改。

修复后，固定模型返回相同方案时仍生成相同 planHash、重新进入真实原生 interrupt，必须由用户针对新的 expectedRunId 再批准；没有自动批准。浏览器最后实际下载包验证颜色改变与其他内容不变。

**执行语义升级为 `run-plan@6`**。与历史 @5 的区别是原生重规划编译基线。维护者升级前须用匹配的旧 worker 排空旧协议任务/审批，再整体切换 Web/API/agent-worker/build-worker；不能清空 configSnapshot/checkpoint、改历史 planVersion 或复活旧写接口来绕过校验。实际业务环境尚未升级。

## 3. 浏览器验收矩阵

系统 Google Chrome headless，所有请求访问真实本机 HTTP；不拦截或伪造业务响应。

| 场景 | 断言 |
|---|---|
| creative-v2 新建 | UI 登录/创建/需求、真实事件时间线、刷新恢复蓝图、确认、新 Run 成功、实际构建报告/修订/多页面包、浏览器下载及 delivery 绑定；无旧 POST |
| legacy 上传/重规划/批准 | UI 上传、蓝图确认、原生审批、相同方案重新审批、刷新后明确批准、实际 job/package、仅按钮颜色变化 |
| legacy 取消方案 | 原生取消后继消费 interrupt，成功结束但没有 job/resultRevision/download |
| module-v1 | 正常初始 IR + 已映射 v2 蓝图，经代码内已有 reviewed catalog 编译/签名/构建；无旧原生技术审批 |
| 模型失败/重试 | 仅 A 的测试模型按固定测试 prompt 拒绝，真实 Run FAILED/INVALID_MODEL_OUTPUT，没有构建；UI retry 返回另一个持久 Run，不假装成功 |
| SSE 传输故障 | 第一次 GET events 在浏览器路由层 connectionreset，后续放行真实服务器；worker 独立推进到 WAITING_INPUT，客户端重新从 after=0 获取未读历史，seq 完整；刷新无重复消息、无构建 |
| 多会话/讨论 | B 的生产 agent-worker 入口；两次 discuss 不构建，左栏切换后消息互不串会话 |
| 安全/幂等 | 缺 Origin 拒绝；相同 request body 返回原 Run；跨租户 snapshot/events/usage/controls/job/artifact 拒绝；旧写端点 404；两个恶意源包拒绝且无源修订 |
| rollout 关闭 | C 不在 allowlist，真实 readonly UI；直接 POST Run 403 且不写消息 |

最终**两轮独立重置后的完整浏览器套件均 9 passed / 0 failed / 0 skipped**（44.1 秒、47.7 秒），未开启 retries 或删掉失败场景。浏览器 connectionreset 是可重复的浏览器传输故障注入，不是 OS kill、整机网络断开、代理故障或生产 soak。

历史 module spec 的“目录必为空”假设已过时：代码当前含 reviewed module evidence。本批没有提升任何原生证据、删除模块门槛或宣称新做了 KF 验收。最初种子错误地使用 solution IR，现改复用生产 `DEFAULT_INITIAL_IR`。生产 fake model 的 creative-v3 能力没有被偷偷补成 golden；A 的确定性语义响应全部在 test-support，不由任何生产 flag/HTTP 选择，也不被 src/ 导入。

历史 byte-compare 原来拿上传 `.gz` 与 loose fixture 目录对比。该目录的 km_global_script.js 在本批开始前已有独立修改，其 SHA256 为 `9e2ad1400f55f4bd3d6a05feec01673f7c6ba98af9e3d902453401e4251ace9c`，而上传包中对应文件为 `6295f4cc926072d03b72af594fc173e95959f915f33e810827955d90ad2cd695`。现在解开**实际上传的源包**作为字节基准，不覆盖用户 loose fixture，也没有排除脚本校验。

## 4. 扩大回归：不能报告全绿

| 范围 | 最新结果 |
|---|---|
| API 35 文件 | **424 passed / 1 failed**，共 425 |
| Web 23 文件 | 129 passed；vue-tsc、Vite build（93 modules）通过 |
| 工作流 5 文件 | 69 passed（包含 implementation-plan 9 项） |
| build-jobs 4 文件 | 68 passed |
| worker 4 文件 | 41 passed |
| E2E 安全/环境单测 2 文件 | 14 passed |
| Playwright 4 specs | 9 passed，两次完整成功 |

按上述最新运行去重计 **754 passed / 1 failed / 0 skipped，共 755**；不把多次浏览器运行累加，不把单独重跑替换失败的整批结果。本表是相关选定回归，不是 monorepo 全量。

未解决异常：

- 第一次 API 整批为 424/425：run-flow 中 discuss 成功后提交 plan 偶发 403。该文件单独 15/15、第二次整批该文件 15/15。已将有关受理断言增加 response body 诊断，但没有放宽准入/Origin 或改变错误状态断言。根因未确认。
- 第二次 API 整批为 424/425：历史 api.integration 第一个“最近 20 条消息”场景报 `Parse Error: Expected HTTP/, RTSP/ or ICE/`。属于先前报告也出现过的 HTTP 解析异常类型，但不是已确认同一根因；不能标记修复。该次其他 API 文件均通过。
- 前批 corrupt-plan HTTP Parse Error / creative delivery 404 的记录仍保留，不能因本批部分通过删除历史。

根/ API/worker/agent-orchestrator TypeScript 检查通过；相关改动 TS（含 E2E）ESLint 通过。Vue 由 vue-tsc/build 校验。没有用 skip/exclude/retry 掩盖旧用例，也没有声称已通过完整发布矩阵。

## 5. 复现命令和隔离边界

工作目录 `agent-app`，本机系统 Node 的 ICU 不兼容，因此使用仓库 bundled Node。其他机器使用可工作的 Node；子进程复用 process.execPath，不再经 pnpm 启动另一个系统 Node。

```bash
E2E_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_e2e_browser_20261021 \
  ../.toolchain/node-v24.19.0-darwin-arm64/bin/node \
  node_modules/@playwright/test/cli.js test

../.toolchain/node-v24.19.0-darwin-arm64/bin/node node_modules/vitest/vitest.mjs run \
  --config tests/e2e/vite.e2e.config.ts \
  tests/e2e/helpers/runtime.test.ts tests/e2e/helpers/destructive-reset.test.ts
```

- 先验证本机 `kf_agent_e2e_*` 与 reset sentinel，再验证 43180/43181 两个端口空闲，之后才 migrate deploy/reset/seed。端口占用即拒绝，不借用现有开发服务。可显式 E2E_API_PORT/E2E_WEB_PORT 改端口；同一个测试库不能并发跑多个套件，即使改了端口也不允许。
- 明确传 E2E_DATABASE_URL，不回退业务 DATABASE_URL；默认 fallback 也只能是本机隔离库。Playwright 显式运行器按既有约定设置 E2E reset sentinel；直接 seed 仍必须单独传 sentinel，原守卫 13 项测试保留。
- 环境只继承 PATH/HOME/临时目录等 OS 项；数据库、Origin、存储、测试签名钥、精确 fixture UUID allowlist 显式设定。真实模型钥、NODE_OPTIONS、任意 rollout/vision/native 开关不继承；图片/预算关闭。实际 `.env` 未写入，API/worker 不通过 --env-file 加载业务配置；Prisma CLI 自身可能按既有规则读取 .env，但 DATABASE_URL 已显式覆盖为受保护的 E2E 目标，Vite 的 API_BASE 亦显式覆盖。
- 使用 per-run mkdtemp 的存储/日志，不覆盖开发 `.kf-artifacts`。globalSetup 返回当次清理函数；只终止内存记录的当次进程，超时再杀这些子进程，不信任持久化 PID。旧 global-teardown.ts 因此删除，可从 Git 恢复；没有删除用户工程/业务数据。
- 只在新独立库 `kf_agent_e2e_browser_20261021` 应用既有 18 条 migration；无新 migration。0007 数据库 checksum 与当前文件相同：`b905fb94542f7455c67afcc173e06a20b9c8767fd6ae31e30c7a793c0e7b6920`。LangGraph 自建 checkpoint 表继续由 saver 初始化。
- API 广回归仍使用 `kf_agent_test_retirement_20261021_1015`；build 与 worker 串行使用 `kf_agent_test_runflow_20261020_462937`，没有与 E2E 共享 destructive reset。
- 两次成功 runtime 日志/制品保留在 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-agent-e2e-wjboJd`、`.../kf-agent-e2e-qEMecv`，只供本机追溯，不是交付依赖。清理后 43180/43181 无监听、测试五进程无残留。失败 trace 会被后续 Playwright 输出刷新，关键失败内容已记在本报告。

## 6. 本批文件清单（不是此前全部迭代补丁）

- 新增：`apps/api/src/runs/agent-worker-bootstrap.ts`、`apps/api/test-support/e2e-agent-worker.ts`、`tests/e2e/helpers/runtime.test.ts`、本报告。
- 修改：`apps/api/src/run-agent-worker.ts`、`apps/api/src/e2e-seed.ts`、`apps/api/src/runs/run-execution-plan.ts`、`apps/api/src/runs/feature-policy.integration.test.ts`、`apps/api/src/runs/run-flow.integration.test.ts`。
- 修改：`packages/agent-orchestrator/src/nodes/implementation-plan.ts`、对应 `.test.ts`。
- 修改：`apps/web/src/views/RunWorkbenchView.vue`、对应 `.test.ts`。
- 修改：`playwright.config.ts`、`tsconfig.json`、`tests/e2e/global-setup.ts`、`tests/e2e/helpers/api.ts`、`tests/e2e/helpers/config.ts`、四个 `tests/e2e/*.spec.ts`。
- 删除：`tests/e2e/global-teardown.ts`（旧持久 PID 清理器）。
- 文档同步：operations、run-stream 历史报告的接续指针、master、P2、handoff、design。

全部本批代码用 2026-10-21 / Agent工作台迭代标注。未提交、未推送、未制作正式补丁。多数文件包含此前用户/其他批次改动；如需 Windows 补丁，必须合并此前清单、保留目录并覆盖所有任务文件，不能把这里的本批清单误当整次迭代完整交付。

## 7. 下一步

1. 先保留上述 API 偶发失败，独立定位 HTTP 生命周期/响应与 403 的具体返回码；收集证据后修复，不放宽权限，不把重复运行变绿当根因。
2. 在新的隔离进程测试中实做 API kill 不影响 worker、agent/build worker SIGKILL/restart、过期 lease 接管且不重复 message/job；当前只是独立进程正常运行/退出，并非上述故障演练。
3. 旧协议/无 runId checkpoint 清单、@5 → @6 排空/整体升级/回退；代理/多副本/长期 soak、保留策略与 410 + snapshotUrl。不能清空事件/审计绕过。
4. 再继续会话分页/归档/历史交付与视觉链路。预算限制暂缓，图片未开放；真实模型成本/缓存、真实 KF 导入运行态/视觉效果需要独立授权和证据。
<!-- end -->
