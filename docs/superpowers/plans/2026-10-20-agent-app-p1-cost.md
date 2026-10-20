# Agent App Cost Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每次模型调用可计量、可取消、可追溯，减少无效上下文和嵌套修复。

**Architecture:** 在现有 DeepSeekModelPort 外围抽取小型 ModelGateway；业务模型方法仍返回已有合同。提示词、HTTP、usage、budget 分开，旧模式可通过 flag 回退。

**Tech Stack:** TypeScript / NestJS / Zod / Prisma / PostgreSQL / Vitest。

**Spec:** `docs/superpowers/specs/2026-10-20-agent-app-next-design.md`，重点 §2、§6、§9。

## Global Constraints

- 保留 legacy、module-v1、creative-v2；不自动迁移已有工作区的 generationWorkflow。
- 保留租户鉴权、审批、签名计划、制品绑定、workspace 构建串行与 stale-base 拒绝。
- 不承诺固定缓存命中率、降本比例或像素级还原率；必须附测试样本和实际测量。
- 新功能默认 feature flag 关闭；先 expand 数据迁移，后灰度启用；本期不做破坏性 contract 迁移。
- 不覆盖、不重置、不自动提交已有未提交修改；补丁保留原目录，只包含本任务所有新增和修改文件。
- 其余全局约束逐条继承 design §3；执行前读 master 的测试/提交约定与 T00。

---

## 文件职责与接口基线

`models/` 放模型基础设施，不搬迁全部 2500 行 DeepSeek 业务逻辑。contracts 只定义跨包数据，不依赖 API/Nest。budget 的数据库实现属于 API，orchestrator 只依赖 port。所有相对路径以仓库根为起点。

## T01：模型合同、配置能力与 usage 规范化

**Files**

- Create: `agent-app/packages/contracts/src/model-usage.ts`
- Modify: `agent-app/packages/contracts/src/index.ts`
- Create: `agent-app/apps/api/src/models/model-types.ts`、`model-config.ts`、`normalize-usage.ts`
- Test: `agent-app/apps/api/src/models/normalize-usage.test.ts`、`model-config.test.ts`
- Modify: `agent-app/.env.example`（仅变量说明，无真实密钥）

**Interfaces**

```ts
export type ModelTask = "intent" | "blueprint" | "implementation" | "repair" | "summary" | "vision";
export type NormalizedUsage = { inputTokens: number | null; outputTokens: number | null;
  cacheHitTokens: number | null; cacheMissTokens: number | null; reasoningTokens: number | null;
  source: "provider" | "unknown"; inconsistent: boolean };
export type ProviderUsage = { prompt_tokens?: number; completion_tokens?: number;
  prompt_cache_hit_tokens?: number; prompt_cache_miss_tokens?: number;
  completion_tokens_details?: { reasoning_tokens?: number } };
export function normalizeUsage(raw: ProviderUsage | undefined): NormalizedUsage;
export type ModelRoute = { provider: "deepseek"; baseUrl: string; model: string;
  supportsVision: boolean; supportsJson: boolean; supportsThinking: boolean;
  maxContextTokens: number; timeoutMs: number; pricingVersion: string | null };
export function validateModelRoute(route: ModelRoute, task: ModelTask): ModelRoute;
```

- [ ] 写红测，确保缺失值不是零：

```ts
import { expect, it } from "vitest";
import { normalizeUsage } from "./normalize-usage.js";
it("keeps missing usage unknown and counts hit/miss independently", () => {
  expect(normalizeUsage(undefined).inputTokens).toBeNull();
  const usage = normalizeUsage({ prompt_tokens: 1000, completion_tokens: 30,
    prompt_cache_hit_tokens: 800, prompt_cache_miss_tokens: 200 });
  expect(usage).toMatchObject({ inputTokens: 1000, outputTokens: 30,
    cacheHitTokens: 800, cacheMissTokens: 200, source: "provider", inconsistent: false });
});
```

- [ ] Run: `pnpm --filter @kf/api exec vitest run src/models/normalize-usage.test.ts`；预期缺模块 FAIL。
- [ ] 实现合法非负整数归一；不从百分比猜 tokens，不一致时保留原始数字标记 inconsistent，费用停止精确计算。

```ts
const count = (value: unknown): number | null =>
  Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
// normalizeUsage 中分别 count 各字段；input 与 hit+miss 同时已知且不同则 inconsistent=true。
// validateModelRoute：task=vision && !supportsVision -> MODEL_CAPABILITY_UNSUPPORTED。
```

- [ ] 增加负数、浮点、溢出、hit+miss 不一致、reasoning 不重复计费测试；配置从服务端白名单读取。保留现有 text 默认 model；vision 未配置时直接拒绝而非降级为只传文字。
- [ ] Run: `pnpm --filter @kf/api exec vitest run src/models/normalize-usage.test.ts src/models/model-config.test.ts`；预期全部 PASS；`pnpm --filter @kf/contracts typecheck`。
- [ ] 复核与记录提交点：`feat(agent): define model usage and route capabilities`。

## T02：调用账本与费用计算

依赖 T01、T00；先支持 runId=null 的旧调用，T07 再增加 FK。

**Files**

- Modify: `agent-app/prisma/schema.prisma`
- Create: `agent-app/prisma/migrations/202610200001_model_invocations/migration.sql`
- Create: `agent-app/apps/api/src/models/model-invocation.service.ts`、`pricing.ts`
- Test: `agent-app/apps/api/src/models/pricing.test.ts`、`model-invocation.integration.test.ts`

**Interfaces**

```ts
export type PriceRates = { version: string; currency: string;
  hitMicrosPerMillion: bigint; missMicrosPerMillion: bigint; outputMicrosPerMillion: bigint };
export function estimateCostMicros(usage: NormalizedUsage, rates: PriceRates | null): bigint | null;
// model-invocation.service.ts
export type InvocationStart = { tenantId: string; workspaceId: string; conversationId: string | null;
  runId: string | null; task: ModelTask; provider: string; requestedModel: string;
  promptVersion: string; schemaVersion: string; prefixHash: string; inputHash: string; attempt: number };
export type InvocationFinish = { status: "SUCCEEDED" | "FAILED" | "CANCELLED" | "UNKNOWN";
  usage: NormalizedUsage; actualModel: string | null; latencyMs: number;
  providerRequestId: string | null; failureCode: string | null };
export interface InvocationRecorder {
  start(input: InvocationStart): Promise<string>;
  finish(id: string, tenantId: string, result: InvocationFinish): Promise<void>;
}
```

- [ ] 写费用红测（新增 imports 指向 T01 和 pricing.ts）：

```ts
import { expect, it } from "vitest";
import { normalizeUsage } from "./normalize-usage.js";
import { estimateCostMicros } from "./pricing.js";
it("prices weighted input and excludes double-counted reasoning", () => {
  const usage = normalizeUsage({ prompt_tokens: 1000, completion_tokens: 100,
    prompt_cache_hit_tokens: 800, prompt_cache_miss_tokens: 200,
    completion_tokens_details: { reasoning_tokens: 50 } });
  expect(estimateCostMicros(usage, { version: "test", currency: "TEST",
    hitMicrosPerMillion: 1000000n, missMicrosPerMillion: 2000000n,
    outputMicrosPerMillion: 3000000n })).toBe(1500n);
  expect(estimateCostMicros(normalizeUsage(undefined), null)).toBeNull();
});
```

- [ ] Run: `pnpm --filter @kf/api exec vitest run src/models/pricing.test.ts`；预期 FAIL。
- [ ] 按 design §6 建 ModelInvocation，费率为部署配置的版本表；价格未配置时 null，不猜币种。核心计算：

```ts
// usage 不完整或 inconsistent 时 return null；以下运算在完整性校验后执行。
const numerator = BigInt(usage.cacheHitTokens!) * rates.hitMicrosPerMillion
  + BigInt(usage.cacheMissTokens!) * rates.missMicrosPerMillion
  + BigInt(usage.outputTokens!) * rates.outputMicrosPerMillion;
return (numerator + 999999n) / 1000000n; // 向上取整到 micro-unit，JSON 输出 decimal string。
```

- [ ] 实现 recorder 写前状态 RUNNING；finish 以 tenant+id+未终态 CAS，重复同结果幂等；超时未知标 UNKNOWN。补数据库测试：其他租户 finish 失败、重复 finish 不累计两次、不存 prompt/key。先迁移空测试 DB，再用历史 schema fixture 升级验证旧 API 可读。
- [ ] Run: `pnpm --filter @kf/api exec vitest run src/models/pricing.test.ts src/models/model-invocation.integration.test.ts`；T00 守卫必须已满足；`pnpm exec prisma validate`、`pnpm exec prisma generate`、API typecheck。预期全部 PASS。
- [ ] 记录迁移 checksum、向前/回退步骤（保留新表）；提交点 `feat(agent): persist model invocation accounting`。

## T03：统一 provider transport、全程 deadline 与取消

**Files**

- Create: `agent-app/apps/api/src/models/model-gateway.ts`、`deepseek-transport.ts`
- Modify: `agent-app/apps/api/src/conversations/deepseek-model.ts`、`model-port.ts`、`fake-model.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/model-port.ts`
- Test: `agent-app/apps/api/src/models/deepseek-transport.test.ts`、`model-gateway.test.ts`
- Test/Modify: `agent-app/apps/api/src/conversations/deepseek-model.test.ts`

**Interfaces**

```ts
export type ModelContentPart = { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail: "low" | "high" } };
export type ModelMessage = { role: "system" | "user" | "assistant"; content: string | ModelContentPart[] };
export type JsonModelRequest = { scope: InvocationStart; route: ModelRoute;
  messages: ModelMessage[]; maxOutputTokens: number; thinking: boolean; signal?: AbortSignal };
export type JsonModelResult = { text: string; usage: NormalizedUsage; actualModel: string | null;
  providerRequestId: string | null };
export function requestDeepSeekJson(request: JsonModelRequest, fetchImpl: typeof fetch, apiKey: string): Promise<JsonModelResult>;
export interface ModelGateway { completeJson(request: JsonModelRequest): Promise<JsonModelResult> }
```

orchestrator 原 ModelContext 增可选 `execution?: {runId:string; signal:AbortSignal}`，旧调用仍合法；Node AbortSignal 属标准类型，不从 API 导入。gateway 创建 scope、记账、finally 收尾；实现语义仍在原 ModelPort 方法。

- [ ] 写完整 body deadline 红测；在测试文件定义 `request`，route timeoutMs=20、fake scope 为固定测试值、messages=[{role:'user',content:'test'}]、maxOutputTokens=10、thinking=false。fake fetch 收到 signal 后返回永不结束的 ReadableStream，abort 时 stream.error(signal.reason)。断言：

```ts
await expect(requestDeepSeekJson(request, fakeFetch, "test-key")).rejects.toMatchObject({ code: "MODEL_TIMEOUT" });
// 同文件第二例：外部 controller.abort() → MODEL_CANCELLED，不归类为 TIMEOUT。
// 第三例：response 已有 headers 但 body 悬挂也必须在 deadline 终止。
```

- [ ] Run: `pnpm --filter @kf/api exec vitest run src/models/deepseek-transport.test.ts`；预期缺实现/错误超时 FAIL。
- [ ] 将旧 chatJson 的 HTTP 部分委托 transport；timer 必须覆盖 fetch、body、JSON parse，finally 才清理。signal 合并必须移除监听器。

```ts
const timeoutController = new AbortController();
const timeout = setTimeout(() => timeoutController.abort("deadline"), request.route.timeoutMs);
const signal = request.signal
  ? AbortSignal.any([request.signal, timeoutController.signal]) : timeoutController.signal;
const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
const body = { model: request.route.model, messages: request.messages,
  max_tokens: request.maxOutputTokens, response_format: { type: "json_object" },
  ...(request.route.supportsThinking ? { thinking: { type: request.thinking ? "enabled" : "disabled" } } : {}) };
try {
  const response = await fetchImpl(new URL("chat/completions", request.route.baseUrl.replace(/\/?$/, "/")), {
    method: "POST", signal, headers, body: JSON.stringify(body),
  });
  // apiKey只来自服务器secret配置，不从浏览器/日志/数据库的route JSON读取。
  const payload = await response.json();
  // response.ok、choices.content、usage、model 验证后返回；非 JSON 错误分类为 MODEL_PROTOCOL_ERROR。
} finally { clearTimeout(timeout); }
```

- [ ] 请求正文使用既有 DeepSeek 合法参数，thinking 参数仅 route 支持时发送；error body 不原样写日志，按 status 映射 AUTH/QUOTA/RATE_LIMIT/TRANSIENT/PROTOCOL。HTTP 400/401/403 不重试；429/502/503 等重试政策由 T06 一处控制。预算/账本失败时关闭新 run 外发，旧入口按 flag 明确降级策略并告警。
- [ ] 补 text/image 消息互斥、baseURL路径、响应无 choices、usage缺失、取消后无新请求、secret脱敏、原方法返回值不变测试。Run: `pnpm --filter @kf/api exec vitest run src/models/deepseek-transport.test.ts src/models/model-gateway.test.ts src/conversations/deepseek-model.test.ts`；API/orchestrator typecheck PASS。
- [ ] 提交点 `refactor(agent): centralize model transport and cancellation`。

## T04：按任务拆 prompt，稳定前缀和确定性动作

**Files**

- Create: `agent-app/apps/api/src/models/task-prompts.ts`、`canonical-json.ts`
- Modify: `agent-app/apps/api/src/conversations/deepseek-model.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/nodes/classify-intent.ts`
- Test: `agent-app/apps/api/src/models/task-prompts.test.ts`
- Test: `agent-app/packages/agent-orchestrator/src/nodes/classify-intent.test.ts`（存在则扩展）

**Interfaces**

```ts
export function canonicalJson(value: unknown): string; // 对象 key 递归排序；数组保持语义顺序。
export type PromptInput = { task: ModelTask; schemaVersion: string; capabilityPack: unknown;
  history: ModelMessage[]; instruction: string; repairFeedback?: string };
export type BuiltPrompt = { messages: ModelMessage[]; promptVersion: string; prefixHash: string };
export function buildTaskPrompt(input: PromptInput): BuiltPrompt;
```

- [ ] 写红测：相同任务/schema/capability，动态 instruction/repair 不同，首个 system 内容及 prefixHash 相同；对象 key 顺序不影响序列化；intent prompt 不含 full registry。测试核心：

```ts
const first = buildTaskPrompt({ task: "repair", schemaVersion: "1", capabilityPack: { b: 2, a: 1 }, history: [], instruction: "fix A", repairFeedback: "E1" });
const second = buildTaskPrompt({ task: "repair", schemaVersion: "1", capabilityPack: { a: 1, b: 2 }, history: [], instruction: "fix B", repairFeedback: "E2" });
expect(first.messages[0]).toEqual(second.messages[0]);
expect(first.prefixHash).toEqual(second.prefixHash);
expect(first.messages.at(-1)).not.toEqual(second.messages.at(-1));
```

- [ ] Run: `pnpm --filter @kf/api exec vitest run src/models/task-prompts.test.ts`；预期 FAIL。
- [ ] 把现有六类相关 prompt 原文迁入任务模板，先保持要求等价再删不相关资料；稳定内容用 SHA256，不包含 tenant 私有原文。消息顺序：

```ts
const messages: ModelMessage[] = [
  { role: "system", content: stableProtocolAndSchema },
  ...input.history,
  { role: "user", content: canonicalJson({ instruction: input.instruction,
    repairFeedback: input.repairFeedback ?? null }) },
];
// stableProtocolAndSchema 由当前 task 模板 + schemaVersion + canonical capabilityPack 构造。
```

- [ ] 保留 blueprint receipt/retry 已有快路；structured actions 在 T09 直接路由，不把按钮文案交给分类器。加入 fake model call spy：confirm/retry fast path 的 classify 调用数为0；普通不明确文本仍分类，不根据模糊 substring 自动执行构建。
- [ ] Run: 上述 prompt 测试 + 原 deepseek-model 和 classify-intent 测试；所有旧 schema/交互约束仍通过；记录文本请求大小与稳定前缀样例（脱敏）。prefix equality 是离线证据，命中率要等 T26 实测。
- [ ] 提交点 `perf(agent): version task prompts and stabilize prefixes`。

## T05：上下文装配、摘要有效性与窗口预算

**Files**

- Create: `agent-app/apps/api/src/models/context-builder.ts`
- Modify: `agent-app/apps/api/src/conversations/graph-ports.ts`、`deepseek-model.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/nodes/load-context.ts`、`model-port.ts`
- Test: `agent-app/apps/api/src/models/context-builder.test.ts`
- Modify: `agent-app/prisma/schema.prisma`，Create: `agent-app/prisma/migrations/202610200002_conversation_summary_version/migration.sql`

**Interfaces**

```ts
export type ContextMessage = { id: string; role: "user" | "assistant"; content: string };
export type ConversationMemory = { schemaVersion: 1; throughMessageId: string;
  requirements: string[]; acceptedDecisions: string[]; openQuestions: string[];
  baseRevisionId: string; generatedAt: string };
export type ContextInput = { messages: ContextMessage[]; memory: ConversationMemory | null;
  baseRevisionId: string; instruction: string; budgetTokens: number };
export type BuiltContext = { history: ModelMessage[]; memoryText: string | null;
  droppedMessageIds: string[]; estimatedTokens: number; estimateKind: "upper_bound" };
export function buildContext(input: ContextInput): BuiltContext;
```

Conversation 增 memory Json?、memoryThroughMessageId?，保留 summary 旧字符串；只有服务端验证过来源的新 memory 才能用于新主线。

- [ ] 红测：超长历史淘汰最老消息，不能丢当前指令；不同 base revision 的 memory 无效；不把修复堆栈带入长期记忆。

```ts
const result = buildContext({ messages: [{ id: "m1", role: "user", content: "x".repeat(5000) },
  { id: "m2", role: "assistant", content: "已确认蓝色主题" }], memory: null,
  baseRevisionId: "r1", instruction: "只修改表头", budgetTokens: 1000 });
expect(result.droppedMessageIds).toContain("m1");
expect(result.history.some(message => message.content === "已确认蓝色主题")).toBe(true);
expect(result.estimatedTokens).toBeLessThanOrEqual(1000);
```

- [ ] Run: `pnpm --filter @kf/api exec vitest run src/models/context-builder.test.ts`；预期 FAIL。
- [ ] 实现优先保留：服务器约束/当前指令→有效 memory→最近完整轮次；测量 UTF8 bytes 保守上界，模型 tokenizer 后续可替换；当前必需内容本身超预算返回 CONTEXT_BUDGET_EXCEEDED，不截断 JSON。

```ts
const estimateText = (text: string): number => Buffer.byteLength(text, "utf8");
// 每条消息另预留64 tokens协议开销；从最旧完整轮次移除到总量<=budgetTokens。
// memory.baseRevisionId !== input.baseRevisionId 时不装入模型，返回需刷新记忆状态。
```

- [ ] 接入 creative blueprint 和 implementation prompt，修复“summary 已加载但 creative 未使用”的链路；摘要只在历史跨过阈值时生成，用 summary task 计费，不每轮总结。摘要事实包含 source message IDs，生成失败保留旧 memory+最近消息，不抹除用户需求；不能从旧 build 日志尾巴伪造设计记忆。
- [ ] 绿测覆盖多字节中文、极短预算、超长单条、摘要版本不匹配、system 不被用户伪造；Run context/graph-ports/deepseek-model 测试与 typecheck。验证一次请求当前用户消息不会同时出现在 history 和 instruction 两遍。
- [ ] 提交点 `perf(agent): bound context and version conversation memory`。

## T06：统一预算、重试协调器与统计接口

**Files**

- Create: `agent-app/apps/api/src/models/run-budget.service.ts`、`retry-policy.ts`、`usage-summary.ts`
- Modify: `agent-app/apps/api/src/models/model-gateway.ts`、`conversations/deepseek-model.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/nodes/solution-implementation-plan.ts`、`model-port.ts`
- Test: `agent-app/apps/api/src/models/retry-policy.test.ts`、`run-budget.integration.test.ts`、`usage-summary.test.ts`
- Modify: schema，Create: `agent-app/prisma/migrations/202610200003_run_budgets/migration.sql`；runId 外键待 T07 添加。

**Interfaces**

```ts
export type RetryDecision = "retry_transport" | "repair_semantic" | "stop";
export function decideRetry(input: { code: string; transportRetries: number;
  semanticRepairs: number; remainingInvocations: number; aborted: boolean }): RetryDecision;
export interface BudgetPort {
  reserve(input: { tenantId: string; runId: string; invocationId: string;
    estimatedInputUpperBound: number; maxOutputTokens: number }): Promise<void>;
  settle(input: { tenantId: string; runId: string; invocationId: string;
    usage: NormalizedUsage; result: "known" | "unknown" | "not_sent" }): Promise<void>;
}
export function aggregateUsage(rows: NormalizedUsage[]): {
  hitRatio: number | null; knownInputTokens: number; unknownCount: number };
```

新增 BudgetReservation 表：(tenantId,runId,invocationId) 唯一，reservedInput/reservedOutput/state，避免并发超发和重复 settle。T07之前RunBudget.runId只是受控测试作用域ID，生产旧入口使用同一政策的请求内BudgetPort实现，ModelInvocation.runId保持null，不创建虚构AgentRun外键；整个旧请求所有修复共用一个budget实例。T07迁移前测试数据清理在隔离测试库完成，新增外键后持久run才使用数据库budget。T12桥接后旧入口也进入持久run，不存在永久预算旁路。

- [ ] 红测定义：

```ts
expect(decideRetry({ code: "MODEL_RATE_LIMIT", transportRetries: 0, semanticRepairs: 0,
  remainingInvocations: 2, aborted: false })).toBe("retry_transport");
expect(decideRetry({ code: "SCHEMA_INVALID", transportRetries: 0, semanticRepairs: 1,
  remainingInvocations: 7, aborted: false })).toBe("stop");
expect(aggregateUsage([]).hitRatio).toBeNull();
```

- [ ] Run: `pnpm --filter @kf/api exec vitest run src/models/retry-policy.test.ts src/models/usage-summary.test.ts`；预期 FAIL。
- [ ] 实现规则；transport 只网关负责、semantic 只 orchestration coordinator 负责。移除 deepseek adapter 内再次递归修复，返回 typed error 与有界 issues（最多20条、每条300字），外层最多修复一次；不因这一抽取删除已有 normalize/validate。

```ts
if (input.aborted || input.remainingInvocations <= 0) return "stop";
if (["MODEL_RATE_LIMIT", "MODEL_TRANSIENT"].includes(input.code)
  && input.transportRetries < 1) return "retry_transport";
if (["SCHEMA_INVALID", "JOURNEY_INVALID", "JSON_INVALID"].includes(input.code)
  && input.semanticRepairs < 1) return "repair_semantic";
return "stop";
```

- [ ] reserve 在短事务内锁 RunBudget+检查余额后插入 reservation；settle幂等；UNKNOWN 保留保守额度，not_sent 释放；正常调用按实际结算。429 backoff 使用 Retry-After（最大10秒）或随机1–2秒且响应 abort；provider body错误未知计费不当成免费。把 graph 旧修复路径、vision/summary全纳入计数。
- [ ] 集成测试用 Promise.all 发20个 reserve、maxInvocations=8，恰好8成功其余 BUDGET_EXCEEDED；重复 settle不超退；crash后reservation保留；nested schema修复实际请求≤2；用户看到已知/未知 usage。Run 所有 models tests + deepseek-model + solution-implementation-plan 节点测试。
- [ ] 提交点 `feat(agent): enforce shared model budgets and bounded repairs`。阶段门槛：成本可观测，旧文本生成回归通过，usage flag可单独启用；无真实调用数据时缓存优化效果标“待实测”。
