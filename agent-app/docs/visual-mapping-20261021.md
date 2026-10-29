<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
# T20 视觉区域到 KF 控件：实施与交接

日期：2026-10-21；功能标注：Agent工作台迭代。

## 本批结果与边界

实现了 domain-client 内的纯能力检索、区域映射及运行时证据范围判断。它们不读数据库、不调用模型、不写 native 文件。T20 **IN_PROGRESS**：纯映射核心已有测试；用户选择、未验证能力 acknowledgement 与交付持续展示须随 T21/T22 接线，不以函数测试替代图生工程验收。

沿用当前 main，基线 HEAD `94364cd9add74915c6f85af96357ee5b286faede`。保留大量既有 dirty 文件，不新建 worktree，不自动提交、推送或打正式补丁。相关旧文件已是可读排版，未对其他功能做格式化或重构。原生编译器、签名计划、catalog v1 snapshot 和已有文本检索行为不变。

未修改实际 `.env`、模型配置、数据库或试用常驻服务；没有收费调用、真实 KF 执行或部署。当前试用库仍是旧的 18 条迁移，源代码需要 20 条；不得为试用重启直接加载新代码，先遵守上一批 expand 升级约定。

## 接口与使用方法

生产包导出：

- `getVisualCapabilitySurface(capabilityId)`：从真实技术 registry、设计知识、语义组件属性 schema、支持的 style part 和 script profile 投影，不增加旧 snapshot 字段或版本。
- `retrieveVisualCapabilities({regions, knowledge})`：复用既有 `rankedControls` 的本地打分；最多 100 个区域，每种区域最多 5 个 control / 3 个 layout，全图最多 25 个详细能力。按区域 ID、能力 ID 稳定排序；表单同时提供布局和实际输入控件，不套用 module-v1 的五类模块限制。
- `mapVisualRegions({regions, candidates, targetRuntimeVersion, requirements?})`：返回设计合同中的 `RegionMapping[]`，不修改输入，也不自动执行 fallback。
- `evaluateCapabilityEvidence(...)`：判断同一份报告是否完整覆盖请求的控件类型、属性、交互及目标版本；不同报告的互不完整切片不能拼成“已验证”。

属性使用明确命名空间：`property:text`、`property:placeholder` 表示现有语义属性；`style:root.fontSize` 表示已支持部件的样式属性。没有 `native:*`、任意 selector、脚本、fontFamily 白名单扩展。这里仅检查属性名称，实际属性值、嵌套字段、资产、事件闭环仍须经过已有合同和权威编译器验证。

`requirements` 是**服务端从用户确认后的语义需求产生**的区域属性/事件集合，不是 OCR 或模型授予的权限。存在 `interactionHint` 却没有该区域的结构化 requirements 时返回 unsupported/交互需确认；不把自然语言猜成可执行事件。显式空集合表示上游已确认静态实现，T22 不得在没有用户确认时自动填空。区域包含可见文字且候选有 text 属性时，自动将 `property:text` 纳入证据范围。

`controlType` 使用 registry 的完整能力身份（例如 `easyui.2`，不是含糊的 `easyui`）。该身份仍交给现有编译链解析，不是让模型构造 native dispatch 字段。

## 安全与质量决策

1. 只允许当前 registry 中 generation/style 为 full 或 pending-verification 的新生成能力，并再次核对权威角色投影；候选伪造 controlType/role 不能扩大权限。
2. partial、preserve-only、仅能生成空壳的复杂 chart/table 不作为可还原 UI 的候选。既有文本/模块路径能力不因此被删除。特殊表格需要专用 adapter，图表不能凭空补 options 或数据绑定。
3. 未支持时返回 null 控件、原因和需要确认的替代建议。例如复杂图表可以建议现有布局和文本组成静态数据表，但不冒充同等图表/分页/数据绑定，不自动替换。参考图片仍不是工程素材。
4. 无有效目标运行时报告只能 supported_unverified，并保留 pending-verification 标签。已有模板、产品源码、编译测试证据不会自动转换成 runtime verified。
5. verified 需要合法 artifact SHA-256、非空 reportId、精确 runtime、controlType 以及全部属性/交互覆盖。匹配的失败报告优先阻止升格。即使验证通过也只表示本次所列范围，不代表全控件、全脚本或整个页面已验证。
6. evidence 必须来自未来受控的服务端证据存储，**不得从浏览器/模型直接接受**。纯函数检查范围，不能凭 hash 字符串证明报告真实性。当前检索一律返回空 evidence，不捏造真实 KF 验收。
7. 置信度 <0.7 保留澄清提示；重复区域/候选、超限、无效 requirements/runtime、未知区域引用拒绝处理。只做纯输出，没有隐式 fallback、无副作用的“自动修复”。

## TDD 与验证记录

工具链：仓库 `.toolchain/node-v24.19.0-darwin-arm64/bin/node`，复用现有依赖，不安装或升级。

基线：domain 的原有 capability retrieval、registry、catalog 三文件 **58/58**。

红测：先新增两文件测试，首次因实现模块不存在失败；补最小返回 stub 后实际执行 **28 项，13 failed / 15 passed**，正向证据、缺口、稳定排序等行为断言失败，不以 import 错误作为唯一红测证据。之后先写表单用例，复现“表单只有布局，缺 input”的失败，再补候选；边界用例先复现非法 requirements 没有拒绝，再补限制。

中间检查：首次 root tsc 发现技术状态枚举应为 `full` 而不是 script profile 的 `supported`；已按已有合同修正。首次 ESLint 发现测试多余非空断言，已去除，未改变断言或编译 schema。

首次完整 domain 默认并发回归：**63 文件通过 / 4 文件失败；1370 passed / 2 failed / 5 skipped**（另两个文件在收集阶段超时）。失败：client-validator 删除变量、creative-native-materializer Tabs 测试超时，preview 与 registry 文件加载 RPC 超时；两项测试出现约 81 秒共同停顿。后续主机 load average 约 28，不能仅凭负载归因或声称消除了根因。未跳过失败测试、未提高超时阈值、未改生产编译逻辑。

原失败四文件使用 `--maxWorkers=1` 原断言复测：**106/106，10.58 秒**。最终完整串行回归结果见下方追加记录；历史失败不能被这次通过覆盖。

最终验证（代码不再改动后）：

- domain-client 完整：**67 文件、1385 passed / 0 failed / 5 skipped（1390 项）**，20:22:07 开始，34.25 秒。包括新增映射/证据 33 项、既有文本检索、legacy/module/creative 编译与签名物化回归。
- 5 项 skipped 是既有 `skipIf`：control-compiler 的 3 项 golden 依赖 `/tmp/kf_ref`，container-inspect 的 2 项依赖参考页面；本批未新增 skip，也未改这些测试。不能将它们报告为已通过。
- contracts 完整：**20 文件、505 passed / 0 failed / 0 skipped**，20:22:08 开始，4.59 秒。
- root tsc、API tsc、相关 TS ESLint、任务范围 `git diff --check` 均 exit 0。首次检查失败与修复记录保留在上文。

命令（均为明确包目录，无数据库测试）：

```sh
# cwd: agent-app/packages/domain-client
../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --maxWorkers=1
# cwd: agent-app/packages/contracts
../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --maxWorkers=1
# cwd: agent-app
../.toolchain/node-v24.19.0-darwin-arm64/bin/node node_modules/typescript/bin/tsc --noEmit
../.toolchain/node-v24.19.0-darwin-arm64/bin/node node_modules/typescript/bin/tsc -p apps/api --noEmit
../.toolchain/node-v24.19.0-darwin-arm64/bin/node node_modules/eslint/bin/eslint.js packages/domain-client/src/visual/*.ts packages/domain-client/src/planning/capability-retrieval.ts packages/domain-client/src/design-knowledge/design-knowledge-catalog.ts packages/domain-client/src/style/control-capability-registry.ts packages/domain-client/src/implementation/component-properties.ts packages/domain-client/src/index.ts
```

本批未重跑 API/worker/Web/浏览器测试，也无真实模型、原生 KF、跨平台验收。过去 API 649/649 是上一批记录，不能算本批执行结果。

## 本批文件清单

新增：

- `agent-app/packages/domain-client/src/visual/region-mapping.ts`
- `agent-app/packages/domain-client/src/visual/region-mapping.test.ts`
- `agent-app/packages/domain-client/src/visual/capability-evidence.ts`
- `agent-app/packages/domain-client/src/visual/capability-evidence.test.ts`
- `agent-app/docs/visual-mapping-20261021.md`

修改（只增加本批职责，保留同文件已有 dirty 改动）：

- `agent-app/packages/domain-client/src/planning/capability-retrieval.ts`
- `agent-app/packages/domain-client/src/style/control-capability-registry.ts`
- `agent-app/packages/domain-client/src/design-knowledge/design-knowledge-catalog.ts`
- `agent-app/packages/domain-client/src/implementation/component-properties.ts`（额外的小型 schema 名称投影，避免复制属性白名单）
- `agent-app/packages/domain-client/src/index.ts`
- `docs/superpowers/plans/2026-10-20-agent-app-p4-vision.md`
- `docs/superpowers/plans/2026-10-20-agent-app-next-master.md`
- `docs/superpowers/plans/2026-10-20-agent-app-handoff.md`

## 下一步

先读 T21 和既有 SolutionImplementationPlan、creative-v2 权威编译器的 provenance 输入，写 visual-plan-constraints 红测。将 visual spec、映射和用户确认差异进入同一语义计划，生成确定性 region→component→native sourceMap 与不可变 GenerationSnapshot；不另建 native 写入路径，不改变既有签名 hash 语义。

随后 T22 接附件和模型配置受理冻结、管理员外发控制及说明、review/确认、未验证能力 acknowledgement 持久化与交付持续显示。未完成前继续拒绝图生 Run，vision/outbound flag 保持关闭，不恢复旧 POST `/messages`、`/resume`。预算限制仍按维护者要求暂缓。
<!-- end -->
