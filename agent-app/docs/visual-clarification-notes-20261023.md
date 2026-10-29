<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
# T22 交互/数据来源补充说明（未验证，2026-10-23）

## 1. 实际交付范围

已有识别区域现在可编辑交互意图和数据来源的补充说明，沿原 Run-scoped revision 保存为新签名版本，重新匹配并要求新的差异选择。说明保留在后续受控蓝图/语义规划 JSON 输入内，原图布局、层级、置信度、来源、TTL 和独立蓝图批准不变；保存本身不调用模型、不新建 Run 或 BuildJob。

**这是未验证的说明编辑，不是语义交互执行/数据源接入完成。** 当前语义计划主要承接既有 mockData；本批不新增真实 KF 变量/HTTP/数据库适配器、不连接用户填写的地址、不接收账号/凭据/native/脚本/执行权限，不将自然语言变成已验证能力。T22/整体仍 IN_PROGRESS，production vision 关闭；结构化交互要求与数据绑定、替代组件、可信视觉 retry、T17/T23/T24–T27 及真实质量/发布仍缺。

## 2. 合同、完整性与权限

VisualRegion 新增可选 `clarifications: { interaction: string|null, dataSource: string|null }`，每段非空时 trim 后 1–1000 字，严格拒绝未知字段。字段是未验证文本，无论来自参考结构还是人工修订，都不能自称 resolved、verified 或授权工具。人工修改的 actor 仍由签名 review.revision 及审计绑定，不由模型文本声明。

原 revision.regions 更新项允许该字段；缺字段保持旧说明/旧请求形状，不补默认值。仅已保存区域可编辑，新区先取得服务端 ID。explicit 双 null 表示清除本轮说明并移除 spec 的可选字段；没有说明时再清除属于 no-op。原 interactionHint、uncertainties、confidence/源字段不因此删除、清空或升级。

新说明进入 canonical specHash、immutable analysis child、原 expiresAt、完整 HMAC review/history/current CAS、事件/审计/幂等事务。原 actor/tenant/Origin/独立 gates/base/TTL/未消费状态/外发授权检查保持。审计只新增 clarifiedCount，统计实际改变说明的区域，不复制备注正文。原 review/analysis hash 确认失效；清空说明即使回到原 spec，也有新版本 ID/回执，不复活旧接受。

同请求重放不双写，不同正文复用 requestId 拒绝；备注修订与旧接受竞争仍只允许一方更新事实；后置审计失败整笔回滚。

## 3. 映射与规划边界

原有“未确认 interactionHint 缺少结构化 requirements 时拒绝映射”的守卫完全保留，补充/清除备注均不能绕过它。添加备注不能提升候选或覆盖 runtime 证据。

对于仅有静态组件验证证据的区域，有非空备注时最终映射降为 supported_unverified，固定显示“补充说明未验证，不代表交互或数据绑定已实现。”，要求重新填写风险处理与理由。原本 unsupported 的区域继续 unsupported；既有证据 ID 仍仅代表原静态范围，不代表备注通过验证。没有备注/双 null 时，旧映射输出与排序不变。

说明作为完整 spec 的一部分，经原权限与受控 gateway 发送到独立蓝图和语义服务；不修改冻结模型配置/prompt/version，不把备注变成模型外发或构建授权。JSON 输入原规则仍禁止执行截图/用户文字指令、访问 URL 或编造生产数据源；原 semantic closure/能力白名单/签名/快照/原生编译/下载链未放宽。

## 4. 工作台交互

按 frontend-skill 延续现有原图叠层/区域表单，新增原生 details 折叠“交互与数据说明”，不引入新库、装饰面板或动画。字段明确标为“未验证”“未绑定”，提示不要填写密钥。只编辑补充说明；原始交互线索与未知问题仍只读可见，清空说明不表示解决。

显示/未保存预览使用 Vue 字符串插值；备注长度、完整候选 spec、100 项/64 KiB 上限复用原浏览器安全合同校验。没有备注的旧结果打开编辑不产生假修改，首尾空白归一化后相同内容不重复提交；字段忙碌/过期确认不可发送。保存后沿原 requestId 指纹、SSE/GET、新 receipt 清空旧选择与多标签页/409/迟到响应隔离。

## 5. 测试与中间过程

API 新增 11 项：正常说明/原分析不变/TTL/审计去正文/幂等/不同正文冲突/旧回执拒绝/清空仅移除备注；原 interactionHint 添加及清空说明仍 unsupported；空白/超长/resolved/native/no-op 负例；并发同/不同请求/接受三项；既有审计后置回滚增加说明分支。原结构/层级/文字、严格 I1 并发、租户/撤权/历史签名断言保留。

contracts 新增 4 项（2 revision、2 spec）；domain mapper 新增 1 项，覆盖静态 verified 降级、原 hint 仍拒绝、空备注不改变旧行为；Web 新增 4 项（3 组件、1 工作台 POST/新展示/选择清空）。原 Chrome 用例扩展而非重复计数：手机编辑说明→新增/层级/删除→真实新回执→独立差异/蓝图→语义/native/签名/快照/真实 BuildExecutor→gzip/hash/一次性下载。蓝图与语义的本地 provider 边界分别断言备注在实际 user JSON 中，非仅前端保存；不冒充真实模型或实际交互/数据绑定质量。

中间记录：

- revision 正常备注先红：旧 schema 不接受 clarifications；domain mapper 同样先因未知字段红。API 正常两项先红 400/INVALID；5 拒绝项在旧合同下通过，不当成功接线证据。
- 原 hint 拦截/静态验证降级和合同接线后通过；API 备注/原回滚定向 11/11，组件 16/16，组件+工作台 35/35；过滤执行未选用例不计全量。
- 3 个新增 UI 用例先红缺字段；Vue 类型检查随后发现临时新增区域的推导 union 没有 optional clarifications，改为显式 VisualRegion 类型，不关闭检查。
- provider 测试 String(init.body) 触发 no-base-to-string，改成实际类型守卫确认 JSON string，不关 lint。
- 一次组合 apply_patch 的 hunk 顺序错误被原子拒绝，代码未落地、后续测试命令未启动；修正顺序后执行。
- Web **26 文件 169/169**（14:27:58 / 12.49s），contracts **21 文件 521/521**（14:27:58 / 5.20s）；root/API tsc、Web vue-tsc、10 TS type-aware ESLint exit 0。Web build 179 modules、356.91 kB JS（gzip 123.98 kB）、60.53 kB CSS 通过；无新依赖/Node polyfill。
- 首轮 domain 全量与多个包同时默认并行运行，为 **1403 passed / 1 failed / 5 原有 skipped**（14:27:58 / 36.52s）。唯一失败是未修改 control-compiler.test.ts:517 的脚本聚合/恶意 descriptor 测试原 5000ms 超时，其他 67 文件通过。不得隐藏此失败或调高 timeout。
- 仓库根 test 脚本原本使用 --maxWorkers=1 --no-file-parallelism。按该原配置复验完整 control-compiler 文件 **62 passed / 3 原有 skipped**（14:29:23 / 1.92s）。脚本长度/序列化/getter 不读等原断言与源码未改；单文件绿不替代全量，也不把资源争用推测当根因证明。API 完成后再顺序运行 domain 全量，最终见 §7。

定向 Chrome **1/1**（14:25:41 / 28.41s，其他 246 未选），目录 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-visual-browser-vqUndZ`；此时已检验蓝图请求，之后新增语义边界断言由最终完整 API 执行。已直接查看 reference-mobile-clarification-edit.png，“未验证/未绑定”和只读原提示清楚；最终浏览器/完整结果另见 §7。

## 6. 文件、环境与下一步

11 份代码/测试：contracts/src/visual-reference.ts/test、visual-review-revision.ts/test；domain-client/src/visual/region-mapping.ts/test；API vision/visual-review.service.ts、runs/visual-run-flow.integration.test.ts；Web components/runs/VisualReferenceReview.vue/test、views/RunWorkbenchVisual.test.ts。配套本报告、master/handoff/P4/design §10/operations。

仅使用已保留且预先核对库名/21 迁移/无其他连接的 `kf_agent_test_review_flow_20261023_1245`，按既有守卫清理测试数据，禁止同库并发 reset。无 schema/迁移/manifest/锁文件/依赖、真实 .env/key/试用进程/受保护 18 迁移业务库操作，无收费/真实 KF 请求、commit/push/worktree/子代理或未要求补丁。保留 mixed dirty。新可选 spec 字段会让旧严格解析 worker 不兼容；同 @7 不等于可混部，仍须排空整体升级，不据测试开放生产 flag。

API cwd：

```sh
LANGCHAIN_TRACING_V2=false LANGSMITH_TRACING=false KF_VISUAL_BROWSER_TEST=1 COOKIE_SECURE=true TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_review_flow_20261023_1245 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --reporter=dot
```

domain-client cwd 的串行完整复验（不改配置文件或超时）：

```sh
LANGCHAIN_TRACING_V2=false LANGSMITH_TRACING=false ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --maxWorkers=1 --no-file-parallelism --reporter=dot
```

下一模型优先设计有真实能力证据的结构化交互需求/数据绑定合同与闭环校验（不能把说明输入框当成已完成），再替代/可信视觉 retry、T17/T23 与 T24–T27。生产视觉关闭、预算暂缓、原试用 expand/排空/整体升级和旧接口退役保护保持；不重复备注/层级/增删/下载，不宣称历史短 lease/404/WARN/OS kill/资源/调度/代理/多副本/回退或真实 provider/KF/Windows/1:1 已验。

## 7. 最终完整复验

- API **64 文件 963/963、零 skip**（14:27:56 / 333.55s），包含完整 **250 项 visual-run-flow** 和扩展真实 Chrome。浏览器实际蓝图与语义请求都断言携带两段说明，最终 native/签名/快照/BuildExecutor/一次性工程下载校验通过。最终浏览器证据目录 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-visual-browser-sLiPZu`；保留 `reference-mobile-clarification-edit.png`。模型仍本地 fixture，不宣称真实交互/数据接入或视觉质量验收。
- API 运行仍出现既有 `Conversation turn lease connection was destroyed during cleanup` WARN；本批没有修复或证实其根因，不把测试绿解释为 OS kill/恢复/资源/全局调度已验。
- API 完成后按仓库原串行配置运行 domain 全量：**68 文件全通过，1404 passed / 5 原有 skipped**（14:34:30 / 42.18s）。原脚本聚合/恶意 descriptor 测试和完整文件均通过，未改 timeout/retry/skip/原断言。首轮默认并行全量的一项超时仍保留 §5，串行复验不证明并行超时的根因。
- Web **169/169**、contracts **521/521**、domain **1404 passed / 5 skipped**、API **963/963**，本批这四包共 **3057 passed / 5 原有 skipped**；不把其他包未复验当作全仓通过。root/API tsc、Web vue-tsc、10 TS type-aware ESLint 与 Web build 均 exit 0。
- 测试进程已退出。只读复核 `kf_agent_test_review_flow_20261023_1245`：21 条已完成迁移、除本次查询外零连接，库与浏览器证据保留；受保护试用库、环境和常驻进程未动。最后对本批代码/测试及配套计划执行 scoped `git diff --check` exit 0；新增报告 no-index check 无空白错误输出，本批 11 份代码/测试及新增报告的末尾空白扫描无匹配。另直接查看最终 Chrome 的 `reference-mobile-clarification-edit.png`，手机宽度折叠字段、原始线索、未验证/未绑定与风险状态可见。
<!-- end -->
