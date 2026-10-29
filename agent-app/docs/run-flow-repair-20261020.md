<!-- modified by jinlong.feng at 2026-10-20 Agent工作台迭代 -->
# Agent 工作台流程修复与交接（2026-10-20）

> 本文记录前一批文本闭环修复；后续已实现安全停止、幂等新运行重试及构建取消/恢复。最新文件、迁移、验证与剩余事项以 `run-control-20261020.md` 为准。本文“无 schema 变更”和“强停/重试未完成”等描述仅指前一批，不能作为当前状态。

## 本轮范围

按用户要求暂不启用模型预算控制。本轮修复的是工作台的**文本需求 → 蓝图 → 用户确认 → 语义规划/确定性编译 → 持久构建 → 工程包下载**主链路，不代表视觉参考、区域修改及全部产品规划已经完成。

保留既有签名、租户鉴权、工程包绑定、构建工作区串行化和过期基线保护。不修改生产数据库或真实模型配置；不安装新依赖，无 schema 变更。

## 执行语义

1. `discuss`：允许分类和文字回复，不进入规划/编译/构建；已有蓝图的阶段不会被讨论消息清空。
2. `plan`：生成/修订蓝图，停在 `WAITING_INPUT`。模型输出不能通过 `BUILD`、`CONFIRM_DESIGN` 等分类绕过模式边界。
3. `build`：需求同样先出蓝图；确认按钮显式提交结构化 `confirm_blueprint`，携带原运行 id 与精确回执。
4. 入队事务校验原运行、等待状态、回执/审批哈希；worker 在共享会话锁内再校验实际 checkpoint。旧按钮、跨轮次确认、并发不同提交返回 409，不会伪装成普通用户消息。
5. 对于审批中断，`resume_approval` 使用 LangGraph 原生 `Command({ resume })`，支持 approve/revise/cancel；普通消息不能覆盖待审批状态。
6. 等待运行被合法后继消费后，原运行转为 `CANCELLED` 并记录 `supersededByRunId`，新运行记录 `predecessorRunId`。这是“由后继接管”，不代表整个需求被用户取消，也不将未交付的等待运行标成成功。
7. 图停在 `building` 仅说明任务已入队：运行绑定实际 `buildJobId` 并进入 `BUILDING`，持续续租、等待独立 build-worker 完成。
8. 只有同租户、同工作区的作业成功，且唯一修订、工程包、DomainProjectRevision 的路径与哈希相互吻合，才写 `resultRevisionId` 并结束为 `SUCCEEDED`。缺失/错配明确失败。
9. `lastErrorCode` 不再被“图正常返回”吞掉；构建失败不会显示已交付。入队后的辅助同步错误则继续跟踪已存在作业，不把真实构建丢下。

## 并发与恢复

- Run 入队和领取使用会话级事务 advisory lock，领取后再次检查业务屏障；同一会话不接收第二个不同的活跃提交，不同会话仍可排队。
- worker 和旧 SSE 入口共用 ConversationTurnLease，不再绕过既有执行屏障。
- 节点 memo 按运行 id 注册、按租约绑定，图单例运行时解析；离开本轮即释放，避免串 run。
- 计划版本提升为 `run-plan@3`，节点 memo 将状态中的计划版本纳入缓存键，不复用旧的“构建刚入队即成功”语义输出。
- 同一 run 已完成/暂停的 checkpoint 只投影结果，不再发起新一轮生成；尚有后续节点时从 checkpoint 继续。
- 已绑定构建的运行恢复时直接跟踪原作业，不再调用生成图。
- 恢复范围包含过期 `BUILDING`；存在 PENDING、ADMITTED 或 QUARANTINED 会话屏障时保持故障关闭，不抢占旧执行者。
- worker 关闭不是用户取消：保留可恢复租约；续租失败中止本轮后续执行，不允许旧 fence 写终态。步骤结果写入也锁定对应运行行。
- 终态、`lastSeq`、终态事件与会话活动时间同事务提交，事件失败会回滚终态；终态写入增加租约过期校验。
- 请求哈希只包含用户显式提交的基线字段；工作区修订前进后，重发相同请求仍返回原 run。显式过期基线返回 409。

注意：历史硬崩溃留下的 ADMITTED/QUARANTINED 屏障不能仅因时间过去自动删除，必须先确认旧执行者已经停止，再按原有运维恢复流程处理。本轮没有通过删除安全屏障来“强行恢复”。

## 工作台接线

- 新增 `GET /api/conversations/:conversationId/runs/latest`，刷新/切换会话时恢复最新运行。
- `input.required` 可带蓝图确认回执；`approval.required` 带审批哈希。终态统一使用合同中的 `run.completed` / `run.failed` / `run.cancelled`，不再输出未定义的 `run.finished` / `run.paused`。
- SSE 校验错误返回 400，不存在/跨租户返回 404；等待态停止空轮询，断开连接不取消后台任务。
- 浏览器按 seq 续传、去重、检测缺口；即使快照已终态，也会先补齐剩余分页事件。等待态不再无限重连。
- 流程节点显示受限的执行摘要，不传递模型原始思维链。
- 蓝图显示名称、目标、页面/区域、视觉方向和待确认问题，不直接展示内部 JSON 信封。
- 确认/审批按钮提交真实动作；工程包沿用现有短期下载令牌与下载时再次鉴权，不提供绕过校验的直链。
- 消息刷新使用请求代次防止旧响应覆盖新消息；切换会话/运行清除旧交付卡。
- 用量账本尚未接通时显示明确说明，不把没有记录呈现成真实零消耗。

## 额外发现的构建阻塞

工业控制台测试样例在告警弹层内包含 EasyUI Datagrid。编译器会对弹层及其子控件生成显隐调用，但校验器此前只允许 layout/static 的 `setVisible`，因此工程在验证阶段失败。

核对仓库内 `中车现场代码/kingclient/exe/public/javascripts/Common/Graphic/UI/kmui_ext_datagrid.js`，存在真实的 `KMUIExtDatagrid.prototype.setVisible(bool)`。校验器现在只额外允许精确 Datagrid 类型的该方法；保留已声明实例、布尔字面量、编译脚本来源与其他安全校验，没有放开任意 EasyUI 方法或任意脚本。

## 启动与配置

API、agent-worker、build-worker 必须共用数据库、签名密钥、工程存储目录。启动命令在 `agent-app/package.json`：

```sh
pnpm start:api
pnpm start:agent-worker
pnpm start:worker
pnpm start:web
```

四个服务分别启动，agent-worker 不负责启动 build-worker。

必须配置：

- `AGENT_TENANT_ID`：数据库中的目标租户 id。当前一租户一个 agent-worker；空值会明确启动失败，不再假装 ready 但不领任务。
- `AGENT_ALLOWED_ORIGINS`：实际工作台浏览器 origin，严格匹配；缺失/不匹配时写请求 403。示例已补入 `.env.example`，生产需收紧。
- `KF_SERVER_PLAN_HMAC_KEY_BASE64`：API 和两个 worker 使用相同密钥，不可发给浏览器/模型。
- `ARTIFACT_STORAGE_ROOT`：三个后端进程看到相同路径/同一存储服务。
- 模型部署继续使用已有 `MODEL_PORT_MODE=deepseek` 等配置；本轮测试使用测试模型，不修改真实密钥。

Mac 当前 shell 的系统 Node 存在 ICU 依赖问题。本轮实际使用仓库 `.toolchain/node-v24.19.0-darwin-arm64/bin/node`，没有改系统环境。

## 验证方式

新建独立测试库 `kf_agent_test_runflow_20261020_462937`，仅该库做 schema 初始化。测试携带 `TEST_DATABASE_URL` 与 `KF_TEST_ALLOW_DESTRUCTIVE_RESET=1`，并经 `assertSafeTestDatabase` 校验；没有清空现有开发库。

`apps/api/src/runs/run-flow.integration.test.ts` 使用真实 Nest API、PostgreSQL checkpoint、RunStore、生成图、签名编译器、独立 JobRunner、产物/修订和下载鉴权。仅模型输出替换为已有工业控制台固定样例，不调用收费模型。

覆盖讨论/规划边界、旧回执拒绝、重复请求幂等、构建完成前不能成功、真实工程包生成与下载、工作区前进后的重发，以及 Origin/并发/事件游标错误。配套回归覆盖终态事务回滚、旧 fence 拒绝、三类屏障、旧排队数据并发领取、原生审批命令和 checkpoint 复用。

运行测试前必须显式选择隔离库，禁止把下面地址换成业务库：

```sh
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_runflow_20261020_462937 \
KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 \
node ../../node_modules/vitest/vitest.mjs run src/runs/run-flow.integration.test.ts
```

上例工作目录为 `agent-app/apps/api`，`node` 需使用可运行的本机 Node。数据库与测试产物暂保留用于检查，不作为部署数据。

## 明确未完成 / 后续优先项

1. **真实 DeepSeek 模型验收**：本轮未发送收费模型请求；真实模型输出质量、延迟、缓存命中和长上下文仍需独立验收。
2. **视觉参考及区域编辑**：尚无完整视觉解析链路；相关动作/附件返回明确的未启用错误，不能声称图片已被模型理解，也不静默忽略附件。
3. **运行中强停、通用重试端点**：尚未实现安全的用户强停及跨阶段重试协议。工作台运行中停止按钮仍禁用；方案审批的 cancel 已走真实原生恢复命令。不能用“取消订阅”代替“取消构建”。
4. **预算/实际调用账本**：按本轮要求推迟，保留已有表结构但未宣称已完成真实计费或预算限制。
5. **KF 运行态验收**：工程包已经过现有编译、静态验证、打包和绑定检查；尚未人工导入 KingFusion 3.6 完成运行态验收，界面明确提示。
6. 归档/分支等外围管理不属于本轮主链路修复。

## 本轮最终验证结果

| 范围 | 结果 |
| --- | --- |
| API Run 相关单元/隔离库集成测试 | 14 个文件，67 项通过 |
| Web 全量 Vitest | 24 个文件，118 项通过 |
| 生成图、分类、节点 memo 回归 | 3 个文件，53 项通过 |
| 控件编译、客户端验证、原生物化回归 | 3 个文件，155 项通过；3 项已有跳过 |
| Run 合同 | 1 个文件，5 项通过 |
| API TypeScript / Web vue-tsc | 通过 |
| Web Vite 生产构建 | 通过 |
| 本轮选定修改的 Run/接线 TypeScript 文件 ESLint | 通过 |

合计 398 项相关测试通过，另有 3 项已有跳过；不是整个 monorepo 的全量验证。没有真实 DeepSeek 调用、生产部署或人工 KF 运行态验收。

## 交接文件范围

后端：`apps/api/src/runs/` 中本轮修改的执行、仓库、查询、HTTP、worker 和对应测试；新增 `run-build.ts`、`run-handler-registry.test.ts`、`run-flow.integration.test.ts`。另含 `apps/api/src/run-agent-worker.ts`、`apps/api/src/conversations/conversation.service.ts`。

图与合同：`packages/agent-orchestrator/src/{state.ts,solution-graph.ts,run-step-memo.ts,nodes/classify-intent.ts}`、`packages/contracts/src/agent-run.ts`、`packages/domain-client/src/validate/client-validator.ts`。

前端：`apps/web/src/{runs-api.ts,composables/useRunStream.ts,composables/useRunStream.test.ts,views/RunWorkbenchView.vue,views/RunWorkbenchView.test.ts,components/runs/MessageBubble.vue,components/runs/ContextPanel.vue}`。

配置与说明：`.env.example`、本文档。

工作区此前已有大量未提交改动；本轮未 reset、提交、推送或覆盖无关功能。交付补丁时保留 `agent-app/` 层级，仅收集上述实际修改/新增文件，不能直接打包整个 dirty worktree。
<!-- end -->
