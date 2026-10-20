# Agent App 下一阶段产品与技术设计

日期：2026-10-20。性质：实施基线，不代表功能已经完成。范围：`agent-app`；不修改 KingFusion 其他服务的现有行为。

## 1. 目标与结论

把当前“对话生成工程”推进为“可计量、可恢复、可复用组件、可验证交付的工程工作台”。不是重写现有工程编译器，也不是接入一个能任意修改本机文件的通用 agent。

三个直接目标：

1. 能解释一次成功交付花了多少 token、钱和模型调用；减少重复上下文及无界修复，而不是只追求缓存命中率。
2. 一个工作区中可以管理多次对话；切换、刷新和断线不会丢失后台任务；显示真实执行步骤、简短决策摘要、制品和错误。
3. 用户上传参考 UI 图，系统先理解结构，再选择现有 KF 控件，确定性编译工程；支持后续局部修改，并明确“可以生成”“已在原生环境验证”的差异。

## 2. 代码审视：事实、推断、缺口

下表依据当前工作目录源文件，不等于线上运行结果；工作目录有大量既有未提交修改。没有获得生产 token 账单，没有在本轮执行完整测试或真实 KF 验收。

| 领域 | 当前事实与代码入口（均相对仓库根） | 产品缺口及优先级 |
|---|---|---|
| 模型调用 | `agent-app/apps/api/src/conversations/deepseek-model.ts` 的 `chatJson` 主要发送 system + user 文本，未形成调用级 usage 账本 | P0：无法证明缓存问题原因，缺少成本/重试观测 |
| 提示词 | 同文件大 SYSTEM_PROMPT 被多类任务使用；creative 有独立 prompt；部分修复把错误放在前面 | P0：任务提示词过重、稳定前缀复用不足；需要实测，不保证命中率 |
| 重试 | 模型适配器内有 JSON/schema/journey 修复；`nodes/solution-implementation-plan.ts` 外层也会修复 | P0：一次用户操作的实际模型调用数不直观；嵌套修复需要统一计数 |
| 超时 | `chatJson` 在收到 headers 后清理 timer，再读取 body | P0：慢 body 不受同一个完整请求 deadline 保护 |
| 对话 | Prisma 已有 Conversation/Message；API 已能按 workspace 列会话 | P1：前端通常选第一条；没有完整多会话管理和分页 |
| 执行 | `conversation.controller.ts` POST 消息 SSE 与执行绑定；断开会 dispose 图 | P0：刷新/切换/断线与任务生命周期耦合 |
| 进度 | 后端输出节点进度白名单；前端主要显示 phaseHint；部分 creative 阶段缺少映射 | P1：缺少可恢复的运行时间线，不能把完成事件伪装成开始事件 |
| 审批 | 已有 blueprint confirmation 快路、resume API、签名计划和审批状态 | 必须复用；“所有确认都先调分类模型”不是事实 |
| 生成主线 | `workspace.service.ts` 新建 mode=new 已选择 creative-v2；上传工程保留 legacy | 不是从零实现 creative；不得把历史 schema 默认值当成当前新建策略 |
| 控件范围 | creative 有语义计划、能力检索、布局/交互编译；不少 adapter 的 runtime 状态仍未验证 | P1：检索应区分支持范围与证据等级；旧 module-v1 的五种稳定模块不是 creative 能力上限 |
| 图片 | assets API 已有上传、sniff/归属验证；模型目录主要只有名称、MIME 等元数据 | P1：上传资源不等于模型看到了像素；参考图与要打包的素材没有清晰区分 |
| 编辑 | 2026-08-17 creative build 计划侧重首次构建 | P1：局部修改需要语义 ID、基线、差异校验，不能每次整页重生成 |
| 预览 | creative-v2 明确关闭旧 preview，旧计划冻结 preview work | 属于历史产品边界，不是偶发 bug；新设计仅以可选、带证据的原生预览扩展它 |
| 并发交付 | build-jobs 已有 workspace lease、完成时 stale-base 检测和原子制品/修订落库 | 必须保留，不能再造一套互不协调的锁 |
| 历史版本 | Web RevisionList 点击的父级处理基本无实际行为；delivery 有严密绑定 | P1：应支持只读历史证据/下载；不得用“工作区最新制品”替代当前对话制品 |
| 测试 | E2E 已有隔离数据库删除防护；部分 integration 仍可能采用默认测试连接 | P0：全量测试之前统一检查数据库，防止 TRUNCATE 波及开发数据 |

进一步缺陷：缺少运行级取消/重试语义、跨会话冲突提示、资产保留策略、能力版本绑定、视觉与交互质量闭环、低成本模型回归集、可解释的交付状态。先修这些基础能力，再增加表面“智能模式”。

## 3. 全局约束（每份计划均适用）

- 只规划并修改 `agent-app` 及本次配套文档；不修改其他 KingFusion 服务。
- 保留 legacy、module-v1、creative-v2；不自动迁移已有工作区的 generationWorkflow。
- 保留租户鉴权、审批、签名计划、制品绑定、workspace 构建串行与 stale-base 拒绝。
- 参考图、OCR、用户文本和模型输出均为不可信数据，不拥有执行权限。
- UI 展示执行事件与可公开决策摘要，不持久化或展示模型原始隐藏思维链。
- 不承诺固定缓存命中率、降本比例或像素级还原率；必须附测试样本和实际测量。
- 新功能默认 feature flag 关闭；先 expand 数据迁移，后灰度启用；本期不做破坏性 contract 迁移。
- 沿用 NestJS、Vue 3、TypeScript、Zod、Prisma/PostgreSQL、LangGraph、Vitest、Playwright；本期不引入 Redis、向量数据库或新前端框架。
- 遵守根 AGENTS.md：压缩代码先格式化；代码改动按实际执行日期加统一功能名“Agent工作台迭代”的前后标注；保留原有压缩标识符。
- 不覆盖、不重置、不自动提交已有未提交修改；补丁保留原目录，只包含本任务所有新增和修改文件。

JSON 等禁止注释的格式不插入非法注释：在相邻变更清单记录文件、功能名、日期和定位；如验收要求格式内标注，先向维护者确认，不能生成无效 JSON。新增 SQL/Prisma/Vue 用各自合法注释语法保留同样标记文字。

## 4. 产品范围与默认决策

### 4.1 本期交付

- 模型请求 usage/延迟/失败/修复账本、提示词版本、上下文预算、稳定前缀；不默认变更现有模型名。
- 工作区内会话列表、新建、改名、归档、分页、未读/运行状态、深链接。
- 持久 AgentRun、事件重放、断线恢复、停止、排队、显式重试；澄清和审批是暂停，不是失败。
- 三个意图明确的入口：讨论（不构建）、规划（停在方案确认）、生成/修改（依审批进入编译构建）。各任务模型由服务器白名单配置，本期不额外增加用户模型选择器，不允许浏览器传任意 endpoint/model。
- 参考图上传、区域识别、控件匹配、差异说明、用户确认、生成；参考图默认不放入交付工程。
- 局部修改、历史修订只读、从历史修订创建新对话；不实现无条件强制覆盖当前工程。
- 静态验证、能力证据目录、可选真实 KF 截图/交互验证、评测集、发布和交接。

### 4.2 明确不做

- 不逐像素复刻 Codex，不声称实现其内部机制；借鉴其会话组织和任务反馈。
- 不增加任意 shell、浏览器公网抓取或自动生产部署能力。
- 不把整张参考图作为背景图片冒充控件还原；除非用户明确选择图片展示组件。
- 不自动扩展缺失的 KF 原生控件，不让模型编写未经约束的 native 配置或绕过脚本验证。
- 不做多个 agent 同时改写同一工程、自动无冲突合并、运行中任意跳转图节点。
- 不做跨租户语义答案缓存；不为了缓存发送无关资料或超长 filler。
- 不在缺少合法 KF 测试环境时声称原生视觉验证通过。

### 4.3 验收场景

S01 文本新建：讨论 → 规划 → 确认 → 生成 → 可下载绑定制品。
S02 连续修改：同一页改颜色/区域排列，未选区域语义 ID 和 native 输出保持稳定。
S03 图生工程：上传业务页面截图 → 修正识别结构 → 控件映射 → 确认 → 交付。
S04 多对话：A 运行，切 B 发起规划，再回 A 看完成结果；两者不串消息、制品或 usage。
S05 刷新恢复：任务生成中刷新/网络断开，重连后事件不丢不重，任务继续。
S06 竞争修改：A/B 从同一 revision 起步，A 先提交后 B 不能静默覆盖。
S07 停止重试：取消模型等待/排队/构建准备阶段，重试不会重复生成用户消息或重复构建。
S08 隔离：其他 tenant 猜测 run、asset、event、artifact ID 均不可读取或修改。
S09 历史与分叉：从历史版本新建对话可以研究，但生成前必须明确处理当前工程冲突。
S10 降本：同样样本、模型配置和质量门槛下比较每成功交付总成本，不用单个漂亮的命中率代替结论。

## 5. 目标架构与边界

```text
Vue 多会话工作台
  ├─ 会话/消息/附件 API
  ├─ POST AgentRun（幂等）→ PostgreSQL 持久队列
  └─ GET events（订阅/重放，绝不负责执行）
                              ↓
独立 agent-worker 进程 → 现有 LangGraph（同一个 conversation 锁域）
  ├─ ModelGateway → task prompt/context → provider adapter → usage 账本
  ├─ 参考图 → VisualReferenceSpec → 能力检索 → 语义 implementation plan
  └─ 确认/签名 → 确定性编译 → 现有 BuildJob worker → revision/artifact
                                                        ↓
                         静态报告 + 可选原生运行证据 + 历史 delivery
```

API 进程只受理和订阅；agent-worker 用 Nest application context 复用依赖，不开启 HTTP；构建 worker 仍独立。三者共用 PostgreSQL，不在网络请求期间持有数据库事务。引入 `apps/api/src/run-agent-worker.ts`，不新造互相循环依赖的 package。

## 6. 数据模型与一致性合同

新增表均带 tenantId，业务外键查询必须包含 tenantId；用复合唯一键/复合外键保证跨租户不能错误关联。只返回该用户按现有租户角色有权访问的数据；本期沿用工作区租户共享语义，不悄悄改成私有会话。

| 表/字段 | 内容与关键约束 |
|---|---|
| Conversation 扩展 | archivedAt?、forkedFromConversationId?、forkedFromMessageId?、forkedFromRevisionId?、lastActivityAt；旧 updatedAt 不再当消息时间的唯一事实 |
| Message 扩展 | runId?、clientMessageId?、parts Json?；保留 content 兼容；唯一 tenantId/conversationId/clientMessageId（null 历史允许多条） |
| AgentRun | id、tenantId、workspaceId、conversationId、requestedByUserId、clientRequestId、requestHash、mode、action Json、status、baseRevisionId、inputSnapshot Json、checkpointRef?、buildJobId?、resultRevisionId?、configSnapshot Json、leaseOwner?、leaseExpiresAt?、fence 整数、cancelRequestedAt?、failureCode?、createdAt/startedAt/finishedAt；唯一 tenantId/conversationId/clientRequestId |
| AgentRunEvent | runId、tenantId、seq、type、payload Json、createdAt；唯一 runId/seq；事件与运行状态同一事务写入，序号不靠内存计数 |
| AgentRunStep | runId、stepKey、inputHash、status、attempt、outputRef?、providerAttemptId?；唯一 runId/stepKey/inputHash；重启只复用已提交且 schema 版本一致的输出 |
| ModelInvocation | id、tenantId、workspaceId、conversationId?、runId?、task、provider、requestedModel、actualModel?、promptVersion、schemaVersion、prefixHash、inputHash、status、attempt、parentInvocationId?、inputTokens?、outputTokens?、cacheHitTokens?、cacheMissTokens?、reasoningTokens?、usageSource、costMicros?、currency?、pricingVersion?、latencyMs、providerRequestId?、failureCode?、startedAt/finishedAt；不存 API key、图片 base64 或完整 prompt |
| RunBudget | runId、maxInvocations、reservedInvocations、usedInvocations、maxInputTokens、maxOutputTokens、reservedTokenUpperBound、usedKnownTokens、unknownUsageCount；事务原子预占，所有修复/摘要/视觉调用都计入 |
| MessageAttachment | tenantId、workspaceId、messageId、assetId、purpose(reference/material)、order；复合归属校验；附件读取重新鉴权 |
| VisualReferenceAnalysis | tenantId、assetHash、analysisVersion、providerModelConfigHash、instructionHash、status、spec Json、createdAt；同租户内缓存，引用原图版本 |
| GenerationSnapshot | tenantId、runId、revisionId?、baseRevisionId、blueprint Json、implementationPlan Json、capabilityCatalogVersion、compilerVersion、assetManifest Json、visualSpecId?、sourceMap Json、createdAt；不可变；初代历史缺失时禁止假装可以可靠局部改写 |
| VerificationReport | tenantId、runId、artifactId、artifactHash、revisionId、level、status、report Json、runtimeVersion?、viewport Json?、seedStateHash?、createdAt；证据不匹配该制品时不可展示为通过 |

索引：AgentRun(tenantId,conversationId,createdAt,id)、AgentRun(status,leaseExpiresAt,createdAt)、Event(runId,seq)、Message(tenantId,conversationId,createdAt,id)、Conversation(tenantId,workspaceId,archivedAt,lastActivityAt,id)。消息分页固定 `(createdAt,id)` 游标，不用 offset；每页默认 50，上限 100。

数据库唯一约束是幂等的最终保证；浏览器不能提供可信 tenantId、价格、planHash、能力证据或制品路径。`requestHash` 包含规范化业务参数；同 clientRequestId 不同内容返回 409 IDEMPOTENCY_CONFLICT。

## 7. Run 状态机和操作语义

状态固定：`QUEUED | RUNNING | WAITING_INPUT | WAITING_APPROVAL | BUILDING | SUCCEEDED | FAILED | CANCEL_REQUESTED | CANCELLED`。

- QUEUED → RUNNING；RUNNING → WAITING_INPUT/WAITING_APPROVAL/BUILDING/SUCCEEDED/FAILED。
- 等待输入/审批结束当前执行租约，但不是成功交付。对应操作带 expectedRunId 和当前服务端方案 receipt，创建一个新的 run，原 run 保留等待状态及 supersededByRunId 关联；前端展示为“已继续”。给 AgentRun 增加 supersededByRunId?。
- BUILDING 由 BuildJob 终态回填：成功 → SUCCEEDED；失败/stale-base → FAILED。
- 终态不可再次迁移；重试创建新 run 并记录 retryOfRunId?，保留完整审计。
- cancel 是幂等请求：QUEUED 可直接 CANCELLED；RUNNING 先 CANCEL_REQUESTED，abort 发到模型并等 checkpoint 安全边界；未入队构建禁止继续入队。
- 已入队 BuildJob 的停止不是“假装完成取消”：未领取时通过构建协调器安全撤销；已运行则只申请 cooperative cancellation，不能取消时 UI 显示“停止生成请求已收下，构建仍在收尾”，直到 worker 返回实际状态。必须给 BuildJob 添加 cancelRequestedAt?、terminalReason?；不重写原 JobStatus 枚举，取消使用 FAILED + terminalReason=CANCELLED 并在 run 映射为 CANCELLED。
- SUCCEEDED 后 cancel 返回当前状态，不撤回已交付制品。
- “运行中补充要求”进入同一会话下一轮队列，不在已签名计划中途偷改。UI 明示“当前任务完成后处理”。取消当前后启动新轮是两个显式动作。

同一 conversation 最多一个活跃执行者；旧 SSE 入口和新 worker 必须使用同一锁域。排队 run 受理时绑定当时 workspace revision；开始时如同一会话上一 run 成功且没有其他会话更改，可通过明确的 predecessorRunId 更新基线并记录事件；否则 stale-base 返回冲突，不能暗中换基线。等待审批的新 run 使用被确认方案的 baseRevision，不自动 rebase。

遇未解决的WAITING_INPUT/WAITING_APPROVAL时，普通排队任务暂停领取；只允许针对当前等待run的合法继续/修改/取消动作通过。继续动作事务内CAS关联supersededByRunId，重复确认不能创建两个后继run；未通过receipt/analysisHash验证前不消耗该等待状态。等待状态不占worker执行租约，但仍是会话业务屏障。

租约默认 30 秒、每 10 秒续期；fence 每次领取递增。每次写事件、提交节点输出和入队构建都验证 fence。lease 超时不意味着旧 provider 请求被撤销；其迟到结果必须丢弃。若外部调用结果未知，记录 UNKNOWN，不声称 exactly-once；恢复最多重试一次且重新占预算。数据库副作用靠幂等键做到不重复。

## 8. API 与事件合同

旧路由与返回形状保留；新 API 使用 `/api/v2`。新创建、改名、归档等端点遵循现有 cookie/角色/租户保护，增加服务端 Origin/CSRF 防护测试。

| Endpoint | 请求/返回 |
|---|---|
| GET /api/v2/conversations | workspaceId、cursor?、limit?、archived=false → `{items,nextCursor}` |
| GET /api/v2/workbench-config | 当前租户可见的feature flags、上传限制、图片外发政策；不返回provider密钥/内部URL |
| POST /api/v2/conversations | `{workspaceId,title?}` → conversation；默认标题取首条消息前 24 字，不额外调用 LLM |
| PATCH /api/v2/conversations/:id | `{title?,archived?}`；标题 trim 后 1–100 字；归档活跃会话返回 409 RUN_ACTIVE |
| GET /api/v2/conversations/:id/messages | before?、limit? → `{items,nextCursor}`，parts 有严格版本 |
| POST /api/v2/conversations/:id/runs | `{clientRequestId,clientMessageId,mode,action,attachmentIds,expectedBaseRevisionId?}` → 202 `{runId,status,eventsUrl}` |
| GET /api/v2/runs/:id | 运行快照、最后 seq、usage 汇总、绑定 delivery；必须归属校验 |
| GET /api/v2/runs/:id/events | SSE；Last-Event-ID 或 after；返回 id=seq；周期 heartbeat 不落库 |
| POST /api/v2/runs/:id/cancel | 幂等，返回实际状态 |
| POST /api/v2/runs/:id/retry | `{clientRequestId}` → 新 run；不重复原用户 Message，引用同一不可变输入 |
| POST /api/v2/conversations/:id/fork | `{messageId,revisionId,clientRequestId,title?}` → 新 conversation；只能选可关联的历史基线 |
| POST /api/v2/workspaces/:id/reference-assets | raw bytes + filename；返回资产 ID/尺寸/hash；沿用现有资产服务验证，不另建不安全上传通道 |
| GET /api/v2/workspaces/:id/reference-assets/:assetId/content | 租户鉴权，no-sniff/private cache；不返回物理路径 |
| GET /api/v2/visual-analyses/:id | 当前分析结构、版本hash、可信来源摘要；重新验证归属 |
| PATCH /api/v2/visual-analyses/:id | `{expectedHash,spec}` → 新分析版本；仅可改region/tokens/uncertainties，不可改source事实 |
| GET /api/v2/revisions/:id/delivery | 该 revision 对应的已绑定交付快照；不信任客户端 artifactId |
| GET /api/v2/runs/:id/verification | 精确绑定报告；没有原生环境时返回 `not_configured` 而非通过 |

`RunAction` 是严格 discriminated union：

```ts
type RunAction =
  | { type: "message"; text: string }
  | { type: "confirm_blueprint"; expectedRunId: string; receipt: string }
  | { type: "resume_approval"; expectedRunId: string; action: "approve" | "revise" | "cancel"; planHash: string }
  | { type: "accept_visual_reference"; expectedRunId: string; analysisId: string; analysisHash: string }
  | { type: "revise_regions"; text: string; regionIds: string[]; generationSnapshotId: string };
type RunMode = "discuss" | "plan" | "build";
type RunEventType = "run.queued" | "run.started" | "step.started" | "step.completed"
  | "step.failed" | "decision.summary" | "message.completed" | "usage.updated"
  | "approval.required" | "input.required" | "build.updated" | "run.cancel_requested"
  | "run.completed" | "run.failed" | "run.cancelled" | "baseline.changed";
type RunEvent = { schemaVersion: 1; runId: string; seq: number; type: RunEventType;
  createdAt: string; payload: Record<string, unknown> };
```

Zod 用每种 type 对应白名单 payload，不能真的放行任意 Record。step payload 仅 stepKey、label、attempt、durationMs、safeSummary、failureCode；decision.summary 仅简短依据和引用的 control/region IDs，最多 600 字。usage 包含 unknown 标识；不显示伪精确费用。第一版消息以 completed 写入，不为看起来流畅而逐字回放假 token；以后加真正 token streaming 时另加事件合同。

重连策略：先读取 snapshot 的 lastSeq，再订阅 after=lastSeq；SSE 连接先回放所有更晚事件，再跟随新事件，数据库游标是事实源，不能“先查后订阅”丢掉中间事件。超过保留窗口返回 410 EVENTS_EXPIRED + snapshotUrl。客户端按 runId/seq 去重，断线指数退避 1/2/4/8/15 秒，带随机抖动；401 重新登录、403/404 停止重试。

## 9. 成本与缓存设计

四种东西分别命名：provider prefix cache、应用内分析结果缓存、上下文裁剪/摘要、减少模型调用次数。不能把“文件上传复用”算成推理免计费。

官方资料于 2026-10-20 核对：[上下文缓存](https://api-docs.deepseek.com/guides/kv_cache/) 说明缓存自动且尽力而为，匹配需要符合已经持久化的前缀单元，不是任意相同子串；可用 usage hit/miss 字段观测。[视觉接口](https://api-docs.deepseek.com/guides/vision/) 当前支持图文输入，具体模型、参数和限制上线前再核验。项目当前 `deepseek-chat` 字符串不代表已验证视觉支持。价格页面本次获取超时，因此不写固定单价，不默认切换模型。

请求顺序：稳定任务协议/版本 → 稳定 schema/选定能力包（canonical key 顺序）→ 稳定历史前缀 → 本次需求/附件/修复反馈。不能把时间戳、requestId、随机 ID、当前错误置于稳定内容之前；业务需要的 ID 放动态尾部。保留真实 user/assistant role，不用巨型 user 字符串假扮全历史。JSON plan 任务与聊天任务分别构造消息，保证结构化输出合法。

任务 prompt：intent / blueprint / implementation / repair / summary / vision；intent 不带全量控件知识。确认/取消/重试等结构化动作走确定性路由。已有 fast path 要保留，不能退化成全 LLM 判断。

初始应用预算（不是 provider 限制，可由运维调整）：一次 run 最多 8 次物理 provider 请求，transport retry 每逻辑请求最多 1 次，semantic repair 整个 implementation 阶段最多 1 次；vision review 自动修复默认 0、启用后最多 2 且仍受总预算约束。单次 context 目标 24k token，输出按任务上限 intent=512、summary=1500、vision=6000、blueprint=8000、implementation=32000、repair=16000；actual model 窗口不够时先减 context 或拒绝，不能静默截断 JSON。总 run 上限 input=120k、output=80k token，超限转用户选择继续或停止；继续必须新 run 并确认新预算。

使用 provider tokenizer 时记为 exact；无可靠 tokenizer 时以 UTF-8 bytes + 图片保守上限作为 upper-bound admission estimate，明确标记估算，不冒充账单。图片请求字节上限独立于旧文本 128000-byte guard；不能直接解除所有限制。

费用公式：hitInput × hitRate + missInput × missRate + output × outputRate；reasoning 若已计入 completion 不重复计费；价格表用版本和币种、decimal/int micros。缺 usage、价格不匹配、网络超时结果未知时 cost=null，保守占预算并展示 unknown。重试、失败、取消、摘要、视觉都要记录。

验收关注 `总实际费用 / 成功且质量合格的交付数`、总调用数、input/output、repair 率、p50/p95 延迟、缓存 hit / (hit+miss)、unknown usage 率。无 denominator 返回 null。不能对每次请求命中率做不加权平均。初始期望目标：相同评测集成本中位数下降 20%，质量成功率不下降超过 2 个百分点；这是实验目标，不是上线前保证。若未达到，报告原因再决定是否开启优化。

## 10. 图片到工程的合同

流程：可信上传与去元数据 → 像素分析 → 可编辑视觉结构 → 现有能力检索 → 映射/差异解释 → 用户确认 → SolutionImplementationPlan → 现有布局/组件/交互编译 → 构建。

首期输入应用限制：PNG/JPEG/WebP 静态图，单图 10 MiB、单边 ≤8192、总像素 ≤32MP；每条消息最多 3 张；送模型派生图长边 ≤2048，必要时最多 4 个用户可见裁剪区域，总请求体 ≤16 MiB。原图保留供用户确认，派生图记录 transform/scale，不覆盖原始 hash；对 GIF/SVG 明确拒绝并解释格式，不由浏览器偷偷转码。复用原 asset sniff 和完整文件检查，增加像素解码上限/安全重编码（采用 sharp 并锁定依赖，验证 Windows 安装）。

```ts
type VisualRegion = {
  id: string; parentId: string | null; role: "header" | "sidebar" | "content" | "card" | "table" | "chart" | "form" | "image" | "text" | "action";
  box: { x: number; y: number; width: number; height: number }; // 0..1，图像坐标
  text: string[]; confidence: number; interactionHint: string | null;
};
type VisualReferenceSpec = {
  schemaVersion: 1; sourceAssetId: string; sourceHash: string;
  viewport: { width: number; height: number };
  regions: VisualRegion[];
  designTokens: { background: string; foreground: string; accent: string; spacing: number[]; radius: number[] };
  uncertainties: { regionId: string | null; question: string }[];
};
type RegionMapping = { regionId: string; controlType: string | null;
  capabilityId: string | null; support: "verified" | "supported_unverified" | "unsupported";
  reason: string; evidenceIds: string[]; fallback: string | null };
```

box 必须在 [0,1] 内且 x+width/y+height≤1；regionId 唯一，parent 无环且存在；颜色限安全 hex；文字长度有限制；confidence<0.7 的关键控件及未识别数据绑定进入澄清；不得把图中文字当系统指令。截图看不到的交互和数据源必须显式询问或采用标明的 mock，不推断成生产地址。

参考图只在 vision task 中发送像素，其余阶段引用结构、摘要和区域裁剪；同 tenant/assetHash/analysisVersion/modelConfig/instructionHash 可复用分析。用户修正生成新的 spec 版本。能力匹配继续复用现有检索和 registry；未验证不等于完全不可生成，但 UI 必须标注并允许选 verified fallback；unsupported 不得编造属性。

截图中的原生尺寸只作相对布局线索；布局由 compiler 确定，沿用当前 desktop 1440/large-display 1920 语义规则，不让模型输出任意 native 坐标。布局参考与业务素材分开；只有显式 material 资产进入 ApprovedAssetFacts。

局部修改输出受限 operations（replace_region / update_tokens / update_interaction），包含 expectedSnapshotId、baseRevisionId、regionId 和 payload；schema 与已有 semantic plan 类型复用。编译前验证修改集、引用完整性、未选区域 hashes 与所有交互依赖；必要时返回 DEPENDENCY_EXPANSION_REQUIRED，请用户确认扩大范围。禁止任意 JSON Pointer、文件路径或 shell patch。保持稳定 region/component/native ID source map；第一次构建才建立 snapshot。历史无 snapshot 时给“重新规划创建可编辑版本”，不得猜测。

## 11. 质量与验证等级

等级不是单个 pass：

- `schema`：结构、引用、控件支持属性、必需输出、资源/脚本安全。
- `compiled`：布局溢出/重叠规则、构建包完整性、可导入静态检查。
- `runtime`：隔离 KF 环境实际导入/启动、目标页面截图、基础交互结果。
- `visual`：在相同 viewport/fonts/seed state 下，区域布局、文字、颜色和人工观感评估。

HTTP 服务启动只能证明启动，不能证明页面正确；HTML 预览不是 KF 原生渲染。每份截图绑定 artifact hash、revision、runtimeVersion、viewport、seedStateHash、字体配置、时间与操作序列。无环境时 schema/compiled 可以通过，runtime/visual 明确 not_configured；可下载，但不能标注“真实运行已验证”。

确定性结构、安全和关键交互失败是硬门槛；视觉相似度低是警告/继续修订入口，不阻止已合法工程下载。最多两次可选局部修复，无改善或预算不足立即停。不能用单一像素差阈值评判不同控件、字体和动态数据。

## 12. 发布、隐私、观测

Flags：`AGENT_USAGE_V2`、`AGENT_PROMPT_V2`、`AGENT_RUNS_V2`、`AGENT_WORKBENCH_V2`、`AGENT_VISION_V1`、`AGENT_REGIONAL_EDIT_V1`、`AGENT_NATIVE_VERIFY_V1`；默认 false，允许 tenant allowlist。依赖：workbench→runs；vision→runs+usage；regional-edit→snapshot；native-verify→显式测试环境配置。运行创建时冻结 flag/config snapshot，不能运行一半换协议。

原始图片默认私有；向外部模型发送前显示数据发送说明，租户管理员可禁用外发。日志只含摘要/hash，不记录像素、cookie、完整需求或模型原始推理。暂定保留：events 30 天、invocation metadata 90 天、分析缓存30天；已交付 snapshot/制品按现有项目生命周期。清理仅针对过期且未引用内容，先 dry-run manifest，再在维护者启用策略后执行；本计划不授权删除现有数据。

运行告警：队列等待>120秒、lease连续失败、UNKNOWN usage增长、HTTP429、跨会话冲突、取消>30秒、build孤儿、磁盘/资产配额。运行并发初始每 tenant=2、每 conversation=1；部署级 provider 并发由管理员配置，避免新 UI 引爆额度。

发布回退关闭新入口，允许旧版本读取 additive schema；已接收 run 先排空或明确取消，再停 agent-worker。不用 DROP TABLE 回退。DB 恢复必须备份验证后由维护者执行。

## 13. 与旧设计的关系

继续遵守 2026-08-17 creative、design knowledge、capability retrieval、interaction compilation 的确定性边界和签名交付。此设计有条件扩展其中“本轮仅首建”“不做原生预览”的范围；不撤销 legacy 保护，不复活已冻结且不能验证 KF 的 HTML preview 作为默认交付依据。

对应实施入口：`docs/superpowers/plans/2026-10-20-agent-app-next-master.md`。设计改变先修改本文件并记录理由，再同步受影响任务；不能由后续模型只在聊天中改口。
