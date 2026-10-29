<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
# T22 识别区域增删与原子重新确认（2026-10-23）

## 1. 本批范围

在已有区域文字/类型/位置编辑上增加“新增区域 / 删除区域 / 恢复待删区域”，仍沿用原 Run-scoped revision POST 和签名重新确认链。结构修订不调用模型、不创建新 Run 或工程、不延长 TTL。确认新差异后仍须独立批准工程蓝图。

**T22 仍 IN_PROGRESS，production vision 仍关闭。** 本批不是完成后区域重生成，不含父子层级重排、交互/数据源编辑、替代组件、视觉 retry、拖拽缩放、多图或真实 provider/KF/Windows/1:1 质量验收。前批 I1 并发测试时序已收口，见 `approval-concurrency-20261023.md`，本批保留该严格回归。

## 2. 公共合同与安全边界

沿用 `POST /api/runs/:runId/visual-review/revisions`，Cookie + Origin、原 tenant/actor、当前独立 feature/outbound gates、WAITING_INPUT、未消费、base/TTL/签名和原受理数据全部检查不变。

body 保留 `clientRequestId/receipt/analysisId/analysisHash/regions`。新增可选：

- `additions: Array<{role,text,box}>`，不接收 id/regionId/parentId/confidence/interactionHint/nativeId/模型配置/权限。
- `removals: string[]`，只接受本次分析中真实存在的区域 ID。
- `regions` 更新数组现在允许空，三种操作总数必须 1–100，重复删除/重复更新/同一区域又改又删拒绝；可选数组若提供必须非空。
- 继续严格对象解析、归一化 box/文字上限，以及解析后序列化 UTF-8 最大 65536 bytes。旧 update-only 请求不会被补默认字段，已保存请求 hash/幂等形状不变。

新增 ID 由服务器根据 request UUID 与顺序构造 `user_<uuid无连字符>_<序号>`，由最终 VisualReferenceSpec 校验排除 ID 冲突。新区域固定 root、confidence=0、interactionHint=null；不把人工补充说成模型识别，也不授予原生执行权限。每项保留“用户补充区域，交互与数据源尚待确认。”不确定项，重新检索现有组件，不接受浏览器自报映射或证据。

删除父区域须明确包含其所有后代；有任意保留子节点则 400 `VISUAL_REVIEW_REGION_HAS_CHILDREN`，不静默级联、不自动提升子节点。删除后的相关未知问题改为 regionId=null 保留原文字，不宣称解决，也不留下悬空引用。最终区域必须 1–100、不确定项最多 100；超限整笔拒绝，不截断或悄悄丢信息。

这只是对现有 revision 合同的兼容扩展，不放开新 RunAction 或普通 visual retry。旧 analysis-only PATCH、messages/resume POST 仍退役；不把新版能力判定为旧 @7 worker 已支持，开放前仍需排空整体升级。

## 3. 原子提交与界面

继续原 conversation→tenant→workspace→source 锁序、完整事实复核和 edit request step 幂等。更新/新增/删除先组成候选 spec 并完整校验，才创建 immutable analysis child（原 expiresAt/图片/配置/指令/模型来源不变）、重新映射、归档旧签名 review、CAS 当前指针、记录新签名与 receipt/event/seq/activity/audit。同一事务后置审计失败全部回滚；原分析与旧制品不修改。

审计只新增操作计数 `updatedCount/addedCount/removedCount`，`regionCount` 为三类操作总数；不复制 OCR/文字。相同当前请求重放不再新增区域/事件/审计，改变 additions/removals 后复用 requestId 拒绝；与旧回执接受竞争只允许一方改变来源事实。接受仍严格绑定最新展示和差异选择。

按 frontend-skill 的克制应用布局保留原图叠层和列表，没有新增 UI 库、装饰卡片或动画。编辑态新增草稿框和“保存后匹配”标记，人工区域显示“未经过模型识别”；待删条目明确标记并从叠层预览隐藏，可恢复/放弃。删除父节点前先删子节点，恢复子节点前先恢复父节点；不允许保存空参考结果。保存按钮复用浏览器安全共享 schema 校验，计数/边界/文字/UTF-8/未知问题超限不能发送。保存后沿原 SSE/GET 更新展示并清空旧差异选择；既有网络重试身份/409 刷新/迟到响应隔离保持。

## 4. 浏览器安全合同入口

初版从 `@kf/contracts` 的完整 barrel 值导入 revision schema，单测通过但真实浏览器页面和 Vite build 失败：barrel 引入 server-plan/creative-build 的 node:crypto/node:util，createHash 不能被浏览器加载。

现将 revision 输入 schema 放入纯 `packages/contracts/src/visual-review-revision.ts`（仅 Zod 和 visual-reference 结构），原 visual-review.ts 继续 re-export，保持服务器公共导出不变。contracts/package.json 新增明确 subpath `./visual-review-revision`；Web 只从该入口导入值，其他服务器合同仍 type-only。未添加 Node polyfill、关闭检查或引入新依赖。

`packages/contracts/package.json` 为合法 JSON，不加入注释；本段记录 2026-10-23“Agent工作台迭代”的修改定位：exports 中新增上述唯一 subpath。无需锁文件/数据库迁移。

## 5. 测试、中间失败与证据

新增 API 15 项：新增/重放/冲突/源行不变/TTL/审计计数/旧回执拒绝；删除保留问题/新确认；父子全量显式删除；问题上限与 ID 冲突；末区/未知/重复/改删冲突/native 注入/区域总量拒绝；相同/不同请求与接受竞争；原后置审计回滚用例增加结构修订分支。保留已有更新、权限/撤权、历史/HMAC、旧接口退役、普通 Run 与 I1 并发断言。

新增 contracts 9 项，Web 5 项（4 组件、1 工作台 transport/重匹配/新区域选择）；原 Chrome 用例扩展而非重复计数：真实上传→SSE/刷新→手机新增与修改保存→服务器分配 ID/置信度→再次删除保存→旧接受 409→新独立差异/蓝图确认→真实 PG/native/sign/snapshot/BuildExecutor→实际 gzip/hash/一次性下载。人工修订全程分析模型调用仍只有一次，编译/签名/下载不 mock；三个阶段模型均本地 fixture，不作为真实质量证据。

中间过程：

- contracts 先红：旧 schema 拒绝 additions 和空 regions；API 两项正常增删先红 400/INVALID，其他拒绝分支已通过。
- 4 项新增 UI 先红：缺新增/删除/恢复控件；实现后组件 10/10，工作台与组件定向 27/27。
- 新父子/冲突/竞态/回滚定向共 16/16（包括既有更新回滚）；其他未选用例明确标 skip，不当全量。
- 一次 contracts 工具链相对路径多写一级，命令未启动测试；修正后执行。一次 vue-tsc 指向 root 未安装位置未启动；改为 Web 包已安装位置后 exit 0。
- TS 报新测试 helper 的 unknown 不能传 supertest.send，修为 object；ESLint 报一个多余 as never，改为共享类型约束，不关闭规则。
- 初版 Web build 因上述 Node 导入失败；真实 Chrome 停在初始 textbox 不存在，同时有 Zod 预优化重载日志；不能仅归咎优化时序或延长超时。拆纯入口后生产构建通过，Chrome 原命令 1/1 通过（13:42:56 / 16.29s，其他 228 未选）。
- 最后 Web 26 文件 161/161（13:44:04 / 9.39s），contracts 21 文件 515/515（13:44:04 / 5.39s）；API/root tsc、Web vue-tsc、8 TS 文件 type-aware ESLint 均 exit 0。Web build 179 modules，352.23 kB JS（gzip 122.71 kB）、59.89 kB CSS，通过；包含 Zod 输入校验的实际体积，不忽略新增 bundle 成本。

定向 Chrome 证据保留 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-visual-browser-YrqMz5`，已直接查看 reference-mobile-edit.png 与 reference-mobile-removed.png，新增/删除界面布局未横向溢出；包括 added/removed 截图和实际工程包。最终完整 API 与其浏览器证据在 §7 追加。

## 6. 文件、环境与下一步

10 份代码/合同/测试/manifest：contracts/package.json、src/visual-review.ts、src/visual-review-revision.ts/test；API vision/visual-review.service.ts、runs/run.service.ts、runs/visual-run-flow.integration.test.ts；Web components/runs/VisualReferenceReview.vue/test、views/RunWorkbenchVisual.test.ts。配套本报告、master/handoff/P4/design §10/operations。

使用既有 `kf_agent_test_review_flow_20261023_1245`，执行前确认库名/21 条迁移/无其他连接，仅此隔离库跑有安全守卫的测试清理，禁止同库并发 reset。不改业务 schema、迁移、实际 .env/key、试用进程或保护的 18 迁移试用库；不发送收费请求、不部署、不提交/push/worktree/子代理。保留所有原 mixed dirty；Web dist 仅既有 build 生成，不作正式补丁交付。

完整 API 命令（API cwd）：

```sh
LANGCHAIN_TRACING_V2=false LANGSMITH_TRACING=false KF_VISUAL_BROWSER_TEST=1 COOKIE_SECURE=true TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_review_flow_20261023_1245 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --reporter=dot
```

之后继续 T22 层级/交互/数据源编辑、替代及可信视觉重试；T17/T23 历史/局部修改和 T24–T27 证据/真实模型/KF/Windows/1:1/发布仍待实施/验收。保持生产视觉关闭、预算拦截暂缓、旧试用 expand/排空/整体升级保护；不要重做已有 UI→工程下载和本批增删，也不把单次绿测当短 lease/偶发 404/WARN/OS kill/多副本/升级回退专项根治。

## 7. 最终完整复验

2026-10-23 Asia/Shanghai：完整 API **64 文件 942/942 passed、0 failed、0 skipped**（13:43:38 / 260.78s），包含完整 **229 项 visual-run-flow** 和扩展的真实 Chrome 增删→工程下载；原严格 I1 concurrency/ordering 均保留并通过。新增 API 15 项，前批 927 变为 942，不对扩展的原浏览器用例重复计数。

本批最终 Web **26 文件 161/161**、contracts **21 文件 515/515**；API/root tsc、Web vue-tsc、8 TS type-aware ESLint 与 Web build 通过。没有将 API 工程包覆盖算成 domain/build-jobs/orchestrator 独立全量复验。

完整 API 的最终 Chrome 证据保留 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-visual-browser-2YodK2`，含手机 edit/added/removed/actions、桌面和交付截图、实际 gzip；hash 与一次性 token 断言通过。此处为真实编译/交付、本地模型 fixture，不是正式客户端交付或 KF/视觉质量验收。所有本批测试与临时 API/Vite/Chrome 已退出，隔离库/证据保留；原 cleanup WARN 仍出现，不宣称历史短 lease/404/故障演练问题根治。

scoped diff 与新增文件末尾空白检查通过。**本批区域增删已完成验证，T22/计划整体仍 IN_PROGRESS、production vision 关闭**，后续按 §6 继续，预算暂缓和旧试用保护不变。
<!-- end -->
