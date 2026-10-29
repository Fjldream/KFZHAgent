<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
# T22 现有工作台图生工程与真实浏览器闭环（2026-10-23）

## 1. 当前结论

现有工作台已接单图私有上传、明确外发同意、真实识别结果读取、逐区域差异接受、独立蓝图确认和原工程包下载。沿用 10-20 工作台的布局/表面/强调色，确认内容就地展示；没有另造工作台、恢复旧 POST、增加动画库或重写生成核心。

真实 Chrome 已执行：`UI 上传/同意 → 公共 Run → 正式分析 executor → SSE/GET 识别等待/刷新恢复 → UI 差异接受 → 公共后继 Run → 正式 PG 蓝图图 → UI 独立确认 → 公共工程 Run → 专用 semantic gateway → native compile/sign/GenerationSnapshot → BuildJob/真实 BuildExecutor → Delivery → 浏览器一次性私有下载`。

**T22 仍 IN_PROGRESS，production vision resolver 仍关闭。** 模型为本地 fixture fetch，Nest/Prisma/PG/SSE/Vue/编译打包/私有存储与下载均真实；有效视觉策略仅在测试组合根注入。浏览器不 mock API/SSE，禁止外域请求。精确 claim 当前测试 Run、构建本 Run job，不冒充全局调度器或 OS kill 验收。蓝色 fixture 图不是 1:1 还原样本。

上批 `visual-public-engineering-20261023.md` 的“前端未接”为历史；不用重做 Store/proof/gateway/engineering handler。真实 provider/收费/缓存质量、KF 3.6/Windows 运行态与像素还原仍未验收。

## 2. 公开展示接口

新增 `GET /api/runs/:runId/visual-review`，Cookie 鉴权，`Cache-Control: private, no-store`、`Vary: Cookie`。

- 先 tenant-scoped snapshot，跨租户/不存在均 404，之后才检测 runtime。workspace/conversation 从 Run 推导，不接受客户端自报作用域。
- 当前只给原同意者展示可确认 review，同租户其他 actor 403。复用签名 review/当前 analysis/base/TTL 校验；必须仍 WAITING_INPUT、未取消/消费/构建。损坏、过期、基线变化返回 409，不给可确认回执。
- `VisualReviewDisplaySchema` 白名单仅 `schemaVersion/runId/workspaceId/conversationId/receipt/reference`；reference 为真实 spec/mappings/analysisId/specHash，不含默认接受项。
- 不返回 execution owner/fence、配置/模型/目录 hash、路由/凭据、内部 continuation/engineering proof。不发模型、不消费来源、不追加事件。
- RunService 可选 read dependency 由原 runtime.reviews 提供；未配置明确 403，不放宽原写权限。

## 3. 前端合同与安全行为

### 上传/外发

有效 runs/workbench/vision 全开、`imagePolicy=explicit-consent`、`outboundImagesAllowed=true` 才在 build 提供图片入口，不从本地上传能力推断外发权。生产入口仍关闭。

只选单张非空 PNG/JPEG/WebP，最大 10 MiB；服务器继续负责像素/MIME/配额/去元数据/派生完整性。raw-body 上传携带 Cookie、真实 Content-Type、编码文件名和 AbortSignal，不从浏览器直发 provider。

上传成功后默认不勾同意，展示私有安全派生缩略图及 `visual-egress@1` 完整告知；勾选后才发 `attachmentIds/primaryAssetId/sendingConsent`。有图锁住 build 模式，运行中不排队图片。失败保留失败附件并阻止发送，必须明确移除/重传，不能丢图转文字。未知进度显示“上传中…”，不伪造百分比。

工作区/租户/会话切换和卸载 abort 并清理图片/同意；迟到上传/识别响应不能串入新上下文。附件按钮是否暂时不可用与是否允许图片外发分离，避免已选图时错误承诺“不发送图片”。

### 识别与蓝图两次确认

`input.required` 的 `vref1:` 回执始终走识别分支，即使 GET 失败也不出现普通蓝图确认。读取展示并核对 Run/workspace/conversation/receipt；失败可重读/停止。

`VisualReferenceReview` 展示私有派生图、归一化区域框、区域文字/置信度、能力映射/支持状态/理由/降级说明和不确定项。框与行可鼠标/键盘聚焦联动；OCR/理由均文本插值，不执行 HTML。

- verified 不伪造风险接受项。
- supported_unverified 必须手选保留/省略并填写非空说明。
- unsupported 当前只可明确省略并填写说明，不提供未实现的 substitute/区域编辑。
- 未选不默认接受；只发真实 displayed analysisId/hash/receipt/逐项 acceptedDifferences。图片读取失败/映射缺失/busy/当前 gate 关闭不能确认，停止独立可用。
- 识别接受后正式显示蓝图并再次等待，必须独立确认才生成工程。

### 幂等/草稿/交付

相同 conversation 和输入/动作，网络失败重试复用完整 request/message ID 与 body，避免响应丢失后重复建 Run。内容变更用新身份，成功/切换上下文清理旧身份。服务器接受前保留文字/图片/同意；自动新建会话成功但提交 Run 失败也不清首条草稿。

沿用原 Delivery、download-token、downloadUrl helper；先绑定本 Run resultRevision/buildJob 才展示包。参考图默认不进客户端资源，未人工 KF 验收提示保留。另修复 `fetchLatestRun` 对 Nest null 空 body 的处理，空会话不再 JSON parse 报错。

## 4. 验证与中间失败

Web 基线 23 文件 129/129，本批 26 文件 **146/146**，新增 17 项：transport 2、review 2、visual workbench 11、Composer 1、latest-null 1。覆盖同意、逐项选择、两次确认、gate、上传失败不丢图、多图/MIME、scope/receipt、迟到响应、模糊失败幂等、首条草稿。

contracts **20 文件 506/506**；展示白名单/隔离由真实 API HTTP 另测。新增 API 4 个展示用例（含 corrupt/TTL/base 三分支）和 1 个 opt-in Chrome 用例。`KF_VISUAL_BROWSER_TEST=1` 才启用新浏览器用例；未安装 Chrome 的普通 API 运行仅此新测试条件 skip，不修改既有 retry/timeout/skip。

Chrome 检查 1440×1000、390×844、真实刷新后 snapshot/SSE/review 恢复、手机布局实际选择/确认、无 document 横向溢出。实际下载 gzip 的 SHA-256 与同 tenant/job 的 client-package Artifact 相同；同 URL 第二次请求 401，pageerror 为空。

root/API tsc、Web vue-tsc、14 个 TS 文件 type-aware ESLint、Web Vite build 已通过。Web 只新增 workspace contracts 类型依赖，offline/frozen-lockfile/ignore-scripts 链接通过；package.json 是严格 JSON，不插非法注释，该依赖和 lock 归属本功能。

中间失败保留：

1. 公开读取红测因路由不存在 404；实现后测试双漏 User.role，补齐 fixture。
2. 新组件/transport 初次无实现不能加载；工作台初次 4 个行为失败；latest-null 独立红测 JSON parse 拒绝。
3. Chrome 首次测试配置方法替换丢 Nest metadata，配置路由未注册；复制原 metadata 后正常，无放宽生产策略。
4. Chrome 第二次已下载包，但测试误查 kind=package；改为真实 client-package，不改打包器。
5. 类型检查暴露缺 Web contracts 类型依赖和 Node API 测试直接用 DOM 全局；补依赖、固定表达式放浏览器执行。lint 的 unbound method/Request 字符串化/多余断言修复，不关闭规则。
6. Composer 红测证实禁用再添加与关闭外发能力混淆；拆 attachDisabled。
7. 首条草稿红测证实自动建会话使 Composer key 变化；改为明确导航 draft identity。

完整 API 含 Chrome 的最后结果见 §7，不用前批 896 冒充本轮。此前 cleanup WARN、短 lease/偶发 404 根因仍不宣称根治。

## 5. 重跑与保护

API cwd：

```sh
LANGCHAIN_TRACING_V2=false LANGSMITH_TRACING=false KF_VISUAL_BROWSER_TEST=1 COOKIE_SECURE=true TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_generation_full_20261022_0940 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --reporter=dot
```

仅 Chrome 可追加 `src/runs/visual-run-flow.integration.test.ts -t 'runs the actual browser'`，定向用 targeted_0930 库，不同测试不能同库并发 reset。随机端口 Vite（envFile=false）+ Nest，测试 session/私有图/本地 fixture，finally 关闭浏览器/应用/端口；截图与实际包保留在输出的 mkdtemp evidence 目录。

所有命令关闭 tracing；未读/改实际 .env/key，未访问真实 provider/KF，未重启试用进程，未对试用库 reset/seed/迁移。旧试用 `kf_agent_e2e_trial_20261021_01` 的 18 migrations+数据与源码 21 条的 expand/排空/整体升级要求不变。无 commit/push/worktree/多代理/未要求的补丁。

## 6. 文件清单与直接接手

代码/测试/依赖共 19 份：contracts/src/visual-review.ts；API vision/visual-review.service.ts 和 runs/run.service.ts、run.controller.ts、run.module.ts、visual-run-flow.integration.test.ts；Web src/api.ts、runs-api.ts、runs-api.test.ts、components/runs/ComposerBar.vue、ComposerBar.test.ts、views/RunWorkbenchView.vue；Web 新增 visual-api.ts/test、VisualReferenceReview.vue/test、views/RunWorkbenchVisual.test.ts；apps/web/package.json、pnpm-lock.yaml（保留此前其余 lock 改动）。

文档 6 份：本报告、master、handoff、P4、design §10、operations。

下一步不重做“上传到下载”的基础通路：

1. T22 识别编辑/region 修订/substitute/视觉 retry 仍需合同与实现；保持单图/原同意者/build，不能丢图绕过。通用失败重试 UI 不代表 visual retry 已支持，服务器仍拒绝未实现路径。
2. 等待态撤权/跨用户/过期提示、确认前后崩溃恢复与资源专项，进一步验收。
3. 现有升级/排空/回退/配置有效性及真实 worker 调度专项，再设计受控 rollout；不能只改 AGENT_VISION_V1=true，当前 resolver 对不可用功能开关仍失败关闭。
4. 真实 provider 能力/配额/收费/缓存与真实设计样本、KF/Windows/像素质量，需要授权实测。
5. 预算拦截继续暂缓；原 usage/审计/签名/一次性下载不撤掉。

## 7. 最终复验

2026-10-23 Asia/Shanghai，完整 API **64 文件、901 passed / 0 failed / 0 skipped**（11:36:11 开始，240.89s），包含 189 项完整 visual-run-flow 与真实 Chrome opt-in 用例。定向结果计入全量，不重复累计。既有 `Conversation turn lease connection was destroyed during cleanup` WARN 仍出现，本批不宣称根治；前批短租约/404 未在最终全量复现，历史记录保留。

同批 Web **26 文件 146/146**（10:48:17，4.97s）、contracts **20 文件 506/506**（10:48:18，2.97s）；共 1553 passed，不代表未重跑的 domain/build-jobs/orchestrator/其他 E2E 套件全量通过。原生编译/签名/BuildExecutor/真实下载由本批 API 与浏览器流程覆盖，不替代这些包的全部测试。

最终 root/API tsc、Web vue-tsc、14 TS lint 均 exit 0；Web build 98 modules、273.55 kB JS（100.16 kB gzip）通过。代码/依赖与文档 scoped diff/新增文件末尾空白检查通过；未自动提交。

最终 Chrome 证据目录：`/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-visual-browser-iW1u1M`。`reference-desktop.png`、`reference-mobile.png`、`reference-mobile-actions.png`、`delivery-desktop.png` 和实际 `client-project.gz` 留存；已直接查看桌面与手机操作截图。它们是隔离 fixture/临时文件，不是正式交付工程或持久生产资源。测试及本批创建的临时浏览器/Nest/Vite 均已结束，试用服务未动。
<!-- end -->
