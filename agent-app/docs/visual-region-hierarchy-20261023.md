<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
# T22 区域父子层级修订与重新确认（2026-10-23）

## 1. 范围与当前边界

接续 `visual-region-structure-20261023.md` 的区域增删，本批增加已保存区域的父节点选择、移回根级、候选层级预览和服务端整图校验。保存仍重新匹配/展示，旧确认失效；识别确认与工程蓝图批准保持分开。修改不调用模型、不创建新 Run 或工程、不延长 TTL。

**T22/整体计划仍 IN_PROGRESS，production vision 关闭。** 不包含交互/数据源编辑、替代组件、可信视觉 retry、完成后的区域重生成、多图或拖拽坐标；真实 provider/KF/Windows/1:1 及发布专项仍待验收。

## 2. 合同与服务端规则

原 Run-scoped revision POST 的 `regions[]` 更新项增加可选 `parentId`，值为本分析已有区域 ID 或显式 null。旧字段仍完整严格校验；缺字段保持原父关系，不注入默认值，不改变旧 update-only 请求 hash/幂等形状。additions 仍拒绝 parentId/id/置信度/原生配置，新区必须先保存取得服务器 ID，再调整父子关系；不接收临时草稿 ID 作父节点。

服务器在原租户/同意人/gates/WAITING_INPUT/未消费/base/TTL/签名校验和同一锁序内处理：

1. 先确认被更新/删除区域存在于该分析。
2. 对保留区域应用明确的 parentId（undefined 不改变；null 真正移回根级），文字/类型/box 沿原白名单。
3. 检查更新后还有没有子节点引用待删父节点：若有，400 HAS_CHILDREN。只有显式移出子节点或显式删除相应后代，才能删除原父节点；不静默级联或重挂。
4. 对最终整个 VisualReferenceSpec 校验未知父节点、自引用、直接/间接循环、悬空引用与所有原尺寸/文字/区域数/问题数约束；无变化仍拒绝。
5. 才写原 immutable analysis child、原 expiresAt/来源/配置/模型/指令、重新映射、旧签名 history、current CAS、新签名 receipt/event/seq/activity/audit；后置审计失败全部回滚。

所有 box 仍是相对于原图的全局归一化坐标；调整 parent 不改变 box，不转成相对于容器的坐标，也不推导交互/数据源。新增审计字段 reparentedCount 仅统计实际变更父关系的保留区域，不复制区域文本；updatedCount/regionCount 沿原操作计数，不重复累计。

注意两个 parentId 的区别：`spec.regions[].parentId` 是区域层级；`VisualReferenceAnalysis.parentId` 仍指向上一分析版本的数据库 ID，用于不可变版本/签名继承。本批绝不拿区域 ID 写分析版本关系。HMAC/当前事实/原回执读取和原 engineering/BuildJob 签名交付链不改。

## 3. 界面与浏览器安全校验

按 frontend-skill 保留原图叠层/列表/小型表单，不重绘整个工作台、不增加 UI 库、装饰卡片或动画。

- 已保存区域编辑态可选父区域或“无父区域（根级）”；候选不包含自己、当前后代、待删节点或未保存草稿。
- 新增草稿明确提示“保存后可调整层级”，不会把浏览器临时 ID 传为服务端身份。
- 父关系随草稿进入预览/删除依赖判断；移出子区域后才可删除父节点，恢复子节点仍检查它的当前父节点是否待删。
- 原图下方增加原生 details 折叠层级预览，按候选父子顺序缩进，保留区域 ID；对深层级限制视觉缩进但保留完整层级文本。只用字符串插值，未将 OCR 当 HTML。
- 浏览器从既有安全 subpath 引入 VisualReferenceSpecSchema，与服务器复用完整候选图校验；不重新从完整 contracts barrel 导入 Node 签名模块。候选父索引 computed 缓存，避免每个选项重复创建整张 Map。
- 仅实际父关系变更才发送 parentId，放弃还原原关系；保存仍经原 requestId 指纹/不确定网络重试/409 事件与展示刷新、清空旧选择和迟到响应隔离。

## 4. 测试与中间过程

API 新增 10 项，完整 visual-run-flow 从 229 增至 239：

- 正常父关系修改：原 box/其他区域/原分析不变、TTL 继承、签名新回执、幂等一次、同 requestId 不同 parent 拒绝、旧接受拒绝、新差异接受。
- 明确将子节点移回根级并同时删除原父节点；保留孙节点与原父节点的未知问题。
- 自引用、两节点循环、三节点间接循环、外部/未知父节点、待删父节点、显式但无变化的 parent 修改；均无新分析/回执/审计残留。
- 两条单独有效但合并会成环的并发请求：仅一个版本成功，不合并、不重复模型或 Run。
- 既有审计后置故障回滚增加 hierarchy 分支；文字更新和增删回滚原分支保留。

contracts 新增 2 项（父/null/缺字段兼容及非法身份/权限字段拒绝）；Web 新增 4 项（3 组件、1 工作台 POST/展示/新选择）。原 Chrome 用例扩展而非重复计数：手机新增区域取得真实 ID→设置父节点/折叠树预览→保存并核对完整区域只有 parent 改变→删除补充区域→独立差异/蓝图批准→真实 PG/native/sign/snapshot/BuildExecutor→实际 gzip/hash/一次性下载。模型仍本地 fixture，不作为真实视觉质量证据。

中间记录：

- contracts 新正常层级用例先红：旧 schema 报 parentId 未识别；其他格式拒绝仍通过。
- API 两项正常层级修改先红 400/INVALID；5 项拒绝用例原本因旧 schema 已拒绝，不冒充实现覆盖。接线后原 7 项通过，再补间接循环/并发/回滚，定向 12/12（包括既有更新/增删回滚，其他用例未选）。
- 3 项 UI 新用例先红，缺父选择；实现后组件 13/13，与工作台定向 31/31。
- 本批没有修改旧 timeout/retry/skip、关闭类型/lint 规则或引入依赖。API/root tsc、Web vue-tsc、6 TS type-aware ESLint 均 exit 0。
- 最后 Web 26 文件 **165/165**（14:05:18 / 8.07s）、contracts 21 文件 **517/517**（14:05:18 / 4.24s）；Web build 179 modules、354.61 kB JS（gzip 123.44 kB）、60.37 kB CSS，通过。
- 定向 Chrome 1/1 通过（14:04:18 / 16.30s，其他 238 未选，不当全量）；证据目录 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-visual-browser-FUxDnf`。已直接查看 reference-mobile-hierarchy-edit.png，父子缩进/原图框/未知问题和未保存提示可读；最终完整复验另见 §6。

## 5. 文件、环境与交接

7 份代码/测试：contracts/src/visual-review-revision.ts/test；API vision/visual-review.service.ts、runs/visual-run-flow.integration.test.ts；Web components/runs/VisualReferenceReview.vue/test、views/RunWorkbenchVisual.test.ts。配套本报告、master/handoff/P4/design §10/operations。未修改 package manifest/锁文件、schema/migration、公开 controller、RunService/执行器/lease/生成核心或生产审批。

仍使用安全隔离 `kf_agent_test_review_flow_20261023_1245`，执行前只读确认库名、21 条迁移、无其他连接，仅此库由既有安全守卫执行测试清理；禁止同库并发 reset。不操作旧试用 18 迁移库/业务数据/常驻进程，不读改实际 .env/key，不发收费或真实 KF 请求；未提交/push/worktree/子代理或生成未要求补丁，保留全部原 mixed dirty。构建仅生成既有 Web dist，不是正式发布包。

API cwd 完整复验：

```sh
LANGCHAIN_TRACING_V2=false LANGSMITH_TRACING=false KF_VISUAL_BROWSER_TEST=1 COOKIE_SECURE=true TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_review_flow_20261023_1245 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --reporter=dot
```

下一模型继续 T22 交互/数据源编辑、替代组件、可信视觉 retry；随后 T17/T23 历史/受限局部修改与 T24–T27 证据/真实 provider/KF/Windows/1:1/发布。不要重复建设层级编辑或已有增删/下载。生产 vision 关闭、预算暂缓、旧 POST 退役与旧试用 expand/排空/整体升级保护不变；单次回归不等于短 lease/偶发 404/cleanup WARN、OS kill/资源/调度/代理/多副本/升级回退专项根治。

## 6. 最终完整复验

2026-10-23 Asia/Shanghai：完整 API **64 文件、952/952 passed、0 failed、0 skipped**（14:05:17 / 274.58s），含完整 **239 项 visual-run-flow** 与扩展的 Chrome 手机层级修改→工程下载；原严格 I1 审批并发/已释放顺序用例和既有文字/增删流程均通过。新增 API 10 项，前批 942 变为 952，不对原浏览器扩展重复计数。

本批最终 Web **26 文件 165/165**、contracts **21 文件 517/517**；root/API tsc、Web vue-tsc、6 TS type-aware ESLint 与 Web build 通过。其他包独立全量未重跑，不将 API native 流程算作 domain/build-jobs/orchestrator 独立验收。

最终 Chrome 证据保留 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-visual-browser-3iPHfI`，含 hierarchy-edit/added/removed/桌面/交付截图与实际工程包，gzip/hash/一次性 token 断言通过。本批测试与临时 API/Vite/Chrome 已退出，隔离库与证据保留，旧试用服务未动；旧 cleanup WARN 仍出现，不冒充历史短 lease/404/故障专项根治。

scoped diff 与新增报告尾空白检查通过。**本批识别层级修改已完成验证，T22/计划整体仍 IN_PROGRESS，生产视觉仍关闭。** 按 §5 接续剩余工作，预算暂缓和原迁移/排空/整体升级保护不变。
<!-- end -->
