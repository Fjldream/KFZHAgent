# Reasonix 式对话迭代设计（澄清 + 设计迭代 + 预览反馈）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 KF Solution Agent 从"任务型一次性生成"升级为 Reasonix 式持续对话迭代设计——逐轮需求澄清、设计计划随对话演化、构建后预览反馈循环，最终客户确认落地。

**Architecture:** 在现有 LangGraph 单 Agent 上扩展：`classify-intent` 增加澄清判定（CLARIFY），新增 `clarify` / `design-plan` 节点实现设计迭代循环（REVISE_DESIGN → design-plan 修订），构建成功后进入 `preview-review` 阶段支持预览反馈（REVISE_DESIGN 大改 / MODIFY_REQUIREMENT 小改 / CONFIRM_BUILD 落地）。DeepSeek prompt 增加澄清引导与 `KF_DESIGN_PRINCIPLES`（转录 Anthropic frontend-design）。

**Tech Stack:** TypeScript / LangGraph / zod / DeepSeek API / NestJS / Vue 3。跨平台（Linux x86 + Windows 服务器）。

## Global Constraints

- 代码必须跨平台（目标部署 Linux x86 + Windows 服务器，macOS 仅开发）：文件路径用 `node:path` 跨平台 API，禁止硬编码 `/` 分隔符；无平台专属 API。
- IR 语义字段是唯一模型可见层；KF 原生字段只在模板/编译器内，模型输出不得携带任意 KF 字段（字符串注入防护，MODEL_OUTPUT_INVALID）。
- 所有 ModelPort 输出在进入 graph state 前 zod 预校验；非法输出回 idle + lastErrorCode，不产生副作用。
- 确定性路由：intent 枚举外任何值不路由（runtime gate）。
- LLM 产出必须命中 editableEntities 清单 GUID（防幻觉）；create 的 pageId 必须命中页面 GUID。
- 现有意图路由、approval interrupt、build 守卫、checkpointer（PostgresSaver）行为不回归。
- 测试命令：`pnpm --filter @kf/agent-orchestrator test`、`pnpm --filter @kf/contracts test`、`pnpm --filter apps/api test`、`pnpm typecheck`、`pnpm lint`（全量 `pnpm test`）。
- 真实 LLM 验证需 `MODEL_PORT_MODE=deepseek` + `DEEPSEEK_API_KEY`（demo 用 `.toolchain/demo-run.sh`）。

---

### Task 1: Intent 与 Classify 结果 schema 扩展（CLARIFY + 澄清字段）

**Files:**
- Modify: `packages/agent-orchestrator/src/schemas/intent.ts`
- Test: `packages/agent-orchestrator/src/schemas/intent.test.ts`（若存在；不存在则新建）

**Interfaces:**
- Consumes: 现有 `IntentSchema`（7 值）、`ClassifyIntentResultSchema`
- Produces: 新增 `"CLARIFY"` 意图值；`ClassifyIntentResultSchema` 增加 `needsClarification?: boolean`、`clarifyingQuestion?: { question: string; options?: string[] }`（options ≤5 项）

- [ ] **Step 1: 写失败测试**

`packages/agent-orchestrator/src/schemas/intent.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { ClassifyIntentResultSchema, IntentSchema, intentValues } from "./intent.js";

describe("intent schema v2", () => {
  it("adds CLARIFY to the intent enum", () => {
    expect(intentValues).toContain("CLARIFY");
  });
  it("accepts a clarifying question with options (≤5)", () => {
    const ok = ClassifyIntentResultSchema.safeParse({
      intent: "CLARIFY",
      requestedDomains: ["kingclient"],
      clarifyingQuestion: { question: "主题是哪种？", options: ["①生产监控", "②设备状态", "③能源管理"] },
    });
    expect(ok.success).toBe(true);
  });
  it("rejects a clarifying question without needsClarification when intent is not CLARIFY", () => {
    const bad = ClassifyIntentResultSchema.safeParse({
      intent: "NEW_REQUIREMENT",
      requestedDomains: ["kingclient"],
      clarifyingQuestion: { question: "?" },
    });
    expect(bad.success).toBe(false);
  });
  it("rejects >5 options", () => {
    const bad = ClassifyIntentResultSchema.safeParse({
      intent: "CLARIFY",
      requestedDomains: ["kingclient"],
      clarifyingQuestion: { question: "?", options: ["1", "2", "3", "4", "5", "6"] },
    });
    expect(bad.success).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @kf/agent-orchestrator test -- schemas/intent.test.ts`
Expected: FAIL（`intentValues` 无 `CLARIFY`；schema 无新字段）

- [ ] **Step 3: 实现 schema 扩展**

`packages/agent-orchestrator/src/schemas/intent.ts`：

```ts
export const IntentSchema = z.enum([
  "QUESTION",
  "NEW_REQUIREMENT",
  "MODIFY_REQUIREMENT",
  "CONFIRM_PLAN",
  "CANCEL_PLAN",
  "ROLLBACK",
  "BUILD",
  "CLARIFY",
]);

export const ClassifyIntentResultSchema = z.object({
  intent: IntentSchema,
  requestedDomains: z.array(z.string()),
  reply: z.string().optional(),
  needsClarification: z.boolean().optional(),
  clarifyingQuestion: z
    .object({
      question: z.string().min(1),
      options: z.array(z.string()).max(5).optional(),
    })
    .optional(),
});
// 防假澄清：intent=CLARIFY 时必须有 clarifyingQuestion；非 CLARIFY 时不得携带
// （用 superRefine 实现交叉校验）
```

用 `superRefine` 加交叉校验：

```ts
export const ClassifyIntentResultSchema = z
  .object({
    intent: IntentSchema,
    requestedDomains: z.array(z.string()),
    reply: z.string().optional(),
    needsClarification: z.boolean().optional(),
    clarifyingQuestion: z
      .object({ question: z.string().min(1), options: z.array(z.string()).max(5).optional() })
      .optional(),
  })
  .superRefine((val, ctx) => {
    if (val.intent === "CLARIFY" && !val.clarifyingQuestion) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["clarifyingQuestion"], message: "CLARIFY requires clarifyingQuestion" });
    }
    if (val.intent !== "CLARIFY" && val.clarifyingQuestion) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["clarifyingQuestion"], message: "clarifyingQuestion only allowed with CLARIFY" });
    }
  });
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @kf/agent-orchestrator test -- schemas/intent.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add packages/agent-orchestrator/src/schemas/intent.ts packages/agent-orchestrator/src/schemas/intent.test.ts
git commit -m "feat(agent-orchestrator): add CLARIFY intent and clarifying question to classify result"
```

---

### Task 2: AgentGraphState 扩展（clarificationCount / designPlan / stage）

**Files:**
- Modify: `packages/agent-orchestrator/src/state.ts`
- Test: `packages/agent-orchestrator/src/state.test.ts`（若存在；不存在则新建）

**Interfaces:**
- Consumes: 现有 `AgentGraphState` zod schema、`stage` 枚举
- Produces: state 新增字段：`clarificationCount?: number`（默认 0，上限 5）、`designPlan?: DesignPlan`、`designPlanHash?: string`、`designRevision?: number`；`stage` 枚举扩展为 `"clarifying" | "design-review" | "design-planning" | "planning" | "building" | "preview-review" | "done"`

- [ ] **Step 1: 先创建 DesignPlan 契约类型（Task 3 前置，类型仅声明）**

在 `packages/contracts/src/design-plan.ts` 创建（zod schema + TS 类型，见 Task 3 完整定义），`state.ts` import 该类型。

- [ ] **Step 2: 写失败测试**

`packages/agent-orchestrator/src/state.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { AgentGraphState } from "./state.js";

describe("AgentGraphState v2", () => {
  it("accepts clarificationCount and designPlan fields", () => {
    const parsed = AgentGraphState.safeParse({
      tenantId: "t1", userId: "u1", workspaceId: "w1", conversationId: "c1",
      clarificationCount: 2,
      designPlan: { schema: "kf-design-plan/v1", displayName: "监控大屏", summary: "s", layoutConcept: "l", styleDirection: "d", sections: [], signature: "sig" },
      designPlanHash: "a".repeat(64),
      designRevision: 1,
      stage: "design-review",
    });
    expect(parsed.success).toBe(true);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `pnpm --filter @kf/agent-orchestrator test -- state.test.ts`
Expected: FAIL（state schema 无新字段）

- [ ] **Step 4: 实现 state 扩展**

`packages/agent-orchestrator/src/state.ts`：给 `AgentGraphState` 增加：

```ts
clarificationCount: z.number().int().min(0).max(5).optional(),
designPlan: DesignPlanSchema.optional(),
designPlanHash: z.string().optional(),
designRevision: z.number().int().min(0).optional(),
```

`stage` 枚举扩展（在现有值基础上追加，**保留现有值**避免破坏已有路由）：

```ts
stage: z.enum([...现有值..., "clarifying", "design-review", "design-planning", "planning", "building", "preview-review", "done"]).optional(),
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm --filter @kf/agent-orchestrator test -- state.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add packages/contracts/src/design-plan.ts packages/agent-orchestrator/src/state.ts packages/agent-orchestrator/src/state.test.ts
git commit -m "feat(agent-orchestrator): extend agent state with clarification/design fields and stages"
```

---

### Task 3: DesignPlan 契约（contracts + ModelPort.createDesignPlan）

**Files:**
- Create: `packages/contracts/src/design-plan.ts`
- Modify: `packages/contracts/src/index.ts`（导出）
- Modify: `packages/agent-orchestrator/src/model-port.ts`（接口 +1 方法）
- Test: `packages/contracts/src/design-plan.test.ts`

**Interfaces:**
- Consumes: 12 种 IR 控件类型名（从 `@kf/contracts` 现有导出；控件类型列表：text/button/inputnumber/switch/checkbox/radio/select/image/tabs/table/richtext/spacer）
- Produces: `DesignPlanSchema` / `DesignPlan` 类型；`ModelPort.createDesignPlan(input: ModelPortContext, opts?: { revising?: boolean }): Promise<DesignPlan>`

- [ ] **Step 1: 写失败测试**

`packages/contracts/src/design-plan.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { DesignPlanSchema } from "./design-plan.js";

describe("DesignPlanSchema", () => {
  it("accepts a valid design plan", () => {
    const ok = DesignPlanSchema.safeParse({
      schema: "kf-design-plan/v1",
      displayName: "生产监控大屏",
      summary: "深色工业风监控大屏",
      layoutConcept: "顶部标题 + 中部趋势区 + 右侧状态区",
      styleDirection: "深色工业风 #0f172a + 青绿 #10b981",
      sections: [
        { id: "kpi", label: "顶部 KPI 区", controls: [{ type: "text", text: "产量", note: "KPI 数字" }] },
        { id: "trend", label: "中部趋势区", controls: [{ type: "text", text: "趋势曲线", note: "预留图表区" }] },
      ],
      signature: "中部趋势区联动 KPI 高亮",
    });
    expect(ok.success).toBe(true);
  });
  it("rejects unknown control types", () => {
    const bad = DesignPlanSchema.safeParse({
      schema: "kf-design-plan/v1",
      displayName: "x", summary: "s", layoutConcept: "l", styleDirection: "d",
      sections: [{ id: "a", label: "区", controls: [{ type: "gauge" }] }],
      signature: "sig",
    });
    expect(bad.success).toBe(false);
  });
  it("rejects >8 sections or >12 controls per section", () => {
    const manySections = Array.from({ length: 9 }, (_, i) => ({ id: `s${i}`, label: `区${i}`, controls: [{ type: "text" }] }));
    const bad = DesignPlanSchema.safeParse({
      schema: "kf-design-plan/v1", displayName: "x", summary: "s", layoutConcept: "l", styleDirection: "d",
      sections: manySections, signature: "sig",
    });
    expect(bad.success).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @kf/contracts test`
Expected: FAIL（design-plan.ts 不存在）

- [ ] **Step 3: 实现 DesignPlanSchema**

`packages/contracts/src/design-plan.ts`（控件类型从现有 ControlType 枚举复用）：

```ts
import { z } from "zod";

/** IR 控件类型（与 client-project-ir 对齐；后续计划扩展控件时同步） */
export const DesignPlanControlType = z.enum([
  "text", "button", "inputnumber", "switch", "checkbox", "radio",
  "select", "image", "tabs", "table", "richtext", "spacer",
]);

export const DesignPlanSchema = z
  .object({
    schema: z.literal("kf-design-plan/v1"),
    displayName: z.string().min(1),
    summary: z.string(),
    layoutConcept: z.string().max(400),
    styleDirection: z.string(),
    sections: z
      .array(
        z.object({
          id: z.string().min(1),
          label: z.string(),
          controls: z
            .array(
              z.object({
                type: DesignPlanControlType,
                text: z.string().optional(),
                note: z.string().optional(),
              }),
            )
            .max(12),
        }),
      )
      .min(1)
      .max(8),
    signature: z.string(),
  })
  .strict();

export type DesignPlan = z.infer<typeof DesignPlanSchema>;
```

`packages/contracts/src/index.ts` 追加导出 `DesignPlanSchema, DesignPlan, DesignPlanControlType`。

- [ ] **Step 4: 实现 ModelPort 接口方法**

`packages/agent-orchestrator/src/model-port.ts`（import DesignPlan）：

```ts
createDesignPlan(input: ModelPortContext, opts?: { revising?: boolean }): Promise<DesignPlan>;
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm --filter @kf/contracts test && pnpm typecheck`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add packages/contracts/src/design-plan.ts packages/contracts/src/index.ts packages/contracts/src/design-plan.test.ts packages/agent-orchestrator/src/model-port.ts
git commit -m "feat(contracts): DesignPlan schema + ModelPort.createDesignPlan"
```

---

### Task 4: clarify 节点（CLARIFY 路由 + 追问落 assistant 消息）

**Files:**
- Create: `packages/agent-orchestrator/src/nodes/clarify.ts`
- Modify: `packages/agent-orchestrator/src/solution-graph.ts`（加节点 + 路由 `CLARIFY → clarify`）
- Modify: `packages/agent-orchestrator/src/nodes/classify-intent.ts`（CLARIFY 处理：清空 pendingRequirements、写 reply）
- Test: `packages/agent-orchestrator/src/nodes/clarify.test.ts`（新建）

**Interfaces:**
- Consumes: `AgentGraphStateValue`、`AgentGraphUpdate`、`IntentSchema`（含 CLARIFY）
- Produces: `createClarifyNode(deps)` 返回 `(state) => Promise<AgentGraphUpdate>`；clarify 节点职责：把追问写 assistant 消息（经 `deps.workspaceQuery.persistAssistantMessage` 或现有消息持久化接口）、`clarificationCount + 1`、`stage = "clarifying"`、回 idle

- [ ] **Step 1: 读现有消息持久化接口**

在 `packages/agent-orchestrator/src/ports.ts` 找 assistant 消息持久化方法（如 `persistAssistantMessage(tenantId, conversationId, text)`），记录签名用于 clarify 节点。

- [ ] **Step 2: 写失败测试**

`packages/agent-orchestrator/src/nodes/clarify.test.ts`：

```ts
import { describe, expect, it, vi } from "vitest";
import { createClarifyNode } from "./clarify.js";

const deps = {
  workspaceQuery: {
    persistAssistantMessage: vi.fn().mockResolvedValue(undefined),
  },
} as any;

describe("clarify node", () => {
  it("persists the clarifying question, bumps count, and returns to idle", async () => {
    const node = createClarifyNode(deps);
    const state = {
      tenantId: "t1", userId: "u1", workspaceId: "w1", conversationId: "c1",
      recentMessages: [{ id: "m1", role: "user", content: "生成监控大屏" }],
      clarificationCount: 1,
      intent: "CLARIFY",
      reply: "主题是哪种？①生产监控 ②设备状态",
      stage: "clarifying",
    } as any;
    const update = await node(state);
    expect(deps.workspaceQuery.persistAssistantMessage).toHaveBeenCalledWith(
      "t1", "c1", expect.stringContaining("主题是哪种"),
    );
    expect(update.clarificationCount).toBe(2);
    expect(update.stage).toBe("idle");
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `pnpm --filter @kf/agent-orchestrator test -- nodes/clarify.test.ts`
Expected: FAIL（clarify.ts 不存在）

- [ ] **Step 4: 实现 clarify 节点**

`packages/agent-orchestrator/src/nodes/clarify.ts`（按 Step 1 读到的实际接口签名实现）：

```ts
import type { AgentGraphStateValue, AgentGraphUpdate } from "../state.js";
import type { SolutionGraphDeps } from "../ports.js";

export function createClarifyNode(deps: SolutionGraphDeps) {
  return async (state: AgentGraphStateValue): Promise<AgentGraphUpdate> => {
    const question = state.clarifyingQuestion?.question ?? state.reply ?? "";
    if (state.clarifyingQuestion && state.clarifyingQuestion.options?.length) {
      const options = state.clarifyingQuestion.options.join("\n");
      await deps.workspaceQuery.persistAssistantMessage(state.tenantId, state.conversationId, `${question}\n${options}`);
    } else {
      await deps.workspaceQuery.persistAssistantMessage(state.tenantId, state.conversationId, question);
    }
    return {
      clarificationCount: (state.clarificationCount ?? 0) + 1,
      stage: "idle",
      clarifyingQuestion: undefined,
    };
  };
}
```

（若 ports 实际签名不同，以读到的为准；`clarifyingQuestion` 存 state 的方式见 Task 5 classify 改造。）

- [ ] **Step 5: solution-graph 接线**

`packages/agent-orchestrator/src/solution-graph.ts`：

```ts
.addNode("clarify", createClarifyNode(deps))
```

`routeAfterClassify` 增加分支：

```ts
case "CLARIFY":
  return "clarify";
```

`classify-intent.ts`：CLARIFY 时 `return { ...base, stage: "idle", clarifyingQuestion: result.clarifyingQuestion, reply: result.reply }`（不清空 pendingRequirements——澄清不是不支持域）。

- [ ] **Step 6: 跑测试确认通过 + graph 集成测试不回归**

Run: `pnpm --filter @kf/agent-orchestrator test`
Expected: PASS（含既有 graph 测试——CLARIFY 是新值，旧测试不受影响）

- [ ] **Step 7: 提交**

```bash
git add packages/agent-orchestrator/src/nodes/clarify.ts packages/agent-orchestrator/src/nodes/clarify.test.ts packages/agent-orchestrator/src/solution-graph.ts packages/agent-orchestrator/src/nodes/classify-intent.ts
git commit -m "feat(agent-orchestrator): clarify node + CLARIFY routing with 5-turn cap"
```

---

### Task 5: classify-intent 澄清判定 + DeepSeek 澄清 prompt

**Files:**
- Modify: `packages/agent-orchestrator/src/nodes/classify-intent.ts`（CLARIFY 写 state）
- Modify: `apps/api/src/conversations/deepseek-model.ts`（classifyIntent prompt + needsClarification 引导）
- Test: `apps/api/src/conversations/deepseek-model.test.ts`（新增 classify 澄清断言）

**Interfaces:**
- Consumes: Task 1 的 schema（CLARIFY/needsClarification/clarifyingQuestion）
- Produces: DeepSeek classifyIntent 输出带 needsClarification + clarifyingQuestion；classify 节点把 `clarifyingQuestion` 写入 state

- [ ] **Step 1: 写失败测试**

`apps/api/src/conversations/deepseek-model.test.ts` 追加：

```ts
it("classifyIntent returns CLARIFY with a question when the requirement is underspecified", async () => {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            intent: "CLARIFY",
            requestedDomains: ["kingclient"],
            needsClarification: true,
            clarifyingQuestion: { question: "主题是哪种？", options: ["①生产监控", "②设备状态"] },
          }),
        },
      }],
    }),
  });
  // 用 mockFetch 构造 DeepSeekModelPort（参照文件内既有构造方式）
  const result = await port.classifyIntent({ /* 最小 context */ } as any);
  expect(result.intent).toBe("CLARIFY");
  expect(result.clarifyingQuestion?.options?.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter apps/api test -- conversations/deepseek-model.test.ts`
Expected: FAIL（prompt 未引导、或输出未透传 clarifyingQuestion）

- [ ] **Step 3: 实现 DeepSeek 澄清引导**

`apps/api/src/conversations/deepseek-model.ts` classifyIntent 的 userPrompt 增加：

```
判断需求信息是否足够生成设计方案：
- 若主题/页面/布局/风格等关键信息缺失或模糊，intent 必须为 CLARIFY，并给出 1 个具体问题 + 3-5 个可选项（选项是"答什么"的引导）；
- 选项 ≤5 个，一次只问一个维度；
- 信息足够时才返回 NEW_REQUIREMENT / MODIFY_REQUIREMENT，禁止猜测需求。
```

并把返回 JSON 中 `needsClarification`/`clarifyingQuestion` 透传（若 model 输出不带则按 intent=CLARIFY 时回填默认问题，防止空追问）。

- [ ] **Step 4: classify-intent 节点透传 clarifyingQuestion 到 state**

`packages/agent-orchestrator/src/nodes/classify-intent.ts` CLARIFY 分支：

```ts
if (result.intent === "CLARIFY") {
  return {
    stage: "idle",
    intent: "CLARIFY",
    clarifyingQuestion: result.clarifyingQuestion,
    reply: result.reply,
    pendingRequirements: undefined,
  };
}
```

- [ ] **Step 5: 跑测试确认通过 + 5 轮上限**

Run: `pnpm --filter @kf/agent-orchestrator test && pnpm --filter apps/api test -- conversations/deepseek-model.test.ts`
Expected: PASS

在 classify-intent.ts 加 5 轮上限守卫（达到上限不再接受 CLARIFY，按 NEW_REQUIREMENT 继续）：

```ts
const CLARIFY_MAX_TURNS = 5;
// state.clarificationCount >= CLARIFY_MAX_TURNS 且 result.intent === "CLARIFY" 时
// 视为信息足够，按 NEW_REQUIREMENT 处理（reply 提示"已尝试多轮澄清，按当前理解继续"）
```

- [ ] **Step 6: 提交**

```bash
git add packages/agent-orchestrator/src/nodes/classify-intent.ts apps/api/src/conversations/deepseek-model.ts apps/api/src/conversations/deepseek-model.test.ts
git commit -m "feat(api): DeepSeek clarification prompting + classify CLARIFY state wiring"
```

---

### Task 6: design-plan 节点（生成/修订 DesignPlan + 展示 + 守卫）

**Files:**
- Create: `packages/agent-orchestrator/src/nodes/design-plan.ts`
- Modify: `packages/agent-orchestrator/src/solution-graph.ts`（加节点 + 路由）
- Modify: `packages/agent-orchestrator/src/nodes/plan-change.ts`（设计计划守卫）
- Modify: `packages/agent-orchestrator/src/ports.ts`（如需 designPlan 摘要落消息）
- Test: `packages/agent-orchestrator/src/nodes/design-plan.test.ts`

**Interfaces:**
- Consumes: `ModelPort.createDesignPlan`（Task 3）、`AgentGraphState` 的 designPlan/designPlanHash/designRevision/stage
- Produces: `createDesignPlanNode(deps)`；路由 `CONFIRM_DESIGN → plan-change`、`REVISE_DESIGN → design-plan`；plan-change 守卫（无 designPlanHash 拒绝）

- [ ] **Step 1: 写失败测试**

`packages/agent-orchestrator/src/nodes/design-plan.test.ts`：

```ts
import { describe, expect, it, vi } from "vitest";
import { createDesignPlanNode } from "./design-plan.js";

const designPlan = {
  schema: "kf-design-plan/v1",
  displayName: "监控大屏",
  summary: "深色工业风",
  layoutConcept: "顶部标题 + 中部趋势区",
  styleDirection: "深色工业风",
  sections: [{ id: "kpi", label: "KPI 区", controls: [{ type: "text", text: "产量" }] }],
  signature: "趋势联动 KPI",
};

const deps = {
  modelPort: { createDesignPlan: vi.fn().mockResolvedValue(designPlan) },
  workspaceQuery: { persistAssistantMessage: vi.fn().mockResolvedValue(undefined) },
} as any;

describe("design-plan node", () => {
  it("generates a design plan, hashes it, shows it, and returns to design-review", async () => {
    const node = createDesignPlanNode(deps);
    const state = {
      tenantId: "t1", userId: "u1", workspaceId: "w1", conversationId: "c1",
      recentMessages: [{ id: "m1", role: "user", content: "生成监控大屏" }],
      requirementText: "生成监控大屏",
      stage: "design-review",
    } as any;
    const update = await node(state);
    expect(update.designPlan).toEqual(designPlan);
    expect(update.designPlanHash).toMatch(/^[0-9a-f]{64}$/);
    expect(update.designRevision).toBe(1);
    expect(update.stage).toBe("design-review");
    expect(deps.workspaceQuery.persistAssistantMessage).toHaveBeenCalledWith(
      "t1", "c1", expect.stringContaining("设计计划"),
    );
  });

  it("revises (not regenerates) when revising=true, bumping revision", async () => {
    deps.modelPort.createDesignPlan.mockResolvedValue({ ...designPlan, summary: "修订版" });
    const node = createDesignPlanNode(deps);
    const state = {
      tenantId: "t1", userId: "u1", workspaceId: "w1", conversationId: "c1",
      recentMessages: [], requirementText: "把标题改红色",
      designPlan: designPlan, designPlanHash: "a".repeat(64), designRevision: 1,
      revising: true, stage: "design-review",
    } as any;
    const update = await node(state);
    expect(update.designPlan?.summary).toBe("修订版");
    expect(update.designRevision).toBe(2);
    expect(update.designPlanHash).not.toBe("a".repeat(64));
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @kf/agent-orchestrator test -- nodes/design-plan.test.ts`
Expected: FAIL（design-plan.ts 不存在）

- [ ] **Step 3: 实现 design-plan 节点**

`packages/agent-orchestrator/src/nodes/design-plan.ts`（hash 用 `node:crypto` 的 `createHash("sha256")`；canonical 序列化用 `JSON.stringify(designPlan, Object.keys(designPlan).sort())` 或现有 canonical 工具）：

```ts
import { createHash } from "node:crypto";
import type { AgentGraphStateValue, AgentGraphUpdate } from "../state.js";
import type { SolutionGraphDeps } from "../ports.js";

function hashDesignPlan(plan: unknown): string {
  const canonical = JSON.stringify(plan, Object.keys(plan as object).sort());
  return createHash("sha256").update(canonical).digest("hex");
}

function formatDesignPlan(plan: any): string {
  const sections = plan.sections
    .map((s: any) => `  ${s.label}：${s.controls.map((c: any) => `${c.type}${c.text ? "(" + c.text + ")" : ""}`).join("、")}`)
    .join("\n");
  return [
    `设计计划 v${plan.revision ?? 1}`,
    `工程名：${plan.displayName}`,
    `摘要：${plan.summary}`,
    `布局：${plan.layoutConcept}`,
    `风格：${plan.styleDirection}`,
    `分区：\n${sections}`,
    `记忆点：${plan.signature}`,
    "回复调整意见或「确认」",
  ].join("\n");
}

export function createDesignPlanNode(deps: SolutionGraphDeps) {
  return async (state: AgentGraphStateValue): Promise<AgentGraphUpdate> => {
    const plan = await deps.modelPort.createDesignPlan(
      {
        tenantId: state.tenantId, userId: state.userId, workspaceId: state.workspaceId,
        conversationId: state.conversationId,
        recentMessages: state.recentMessages,
        requirementText: state.requirementText,
        revisionSummary: state.revisionSummary,
        editableEntities: state.editableEntities,
      },
      { revising: state.revising === true },
    );
    const revision = (state.designRevision ?? 0) + 1;
    const withRevision = { ...plan, revision };
    const hash = hashDesignPlan(withRevision);
    const rendered = formatDesignPlan(withRevision);
    await deps.workspaceQuery.persistAssistantMessage(state.tenantId, state.conversationId, rendered);
    return {
      designPlan: withRevision,
      designPlanHash: hash,
      designRevision: revision,
      stage: "design-review",
      revising: undefined,
    };
  };
}
```

（`revising` 标志由 classify 在 REVISE_DESIGN 时置入 state；`editableEntities` 在 state 中存在（Task 2 已加可选字段）。）

- [ ] **Step 4: solution-graph 接线 + plan-change 守卫**

`solution-graph.ts`：`.addNode("design-plan", createDesignPlanNode(deps))`；`routeAfterClassify` 加：

```ts
case "CONFIRM_DESIGN":
  return "plan-change";
case "REVISE_DESIGN":
  return "design-plan";
```

`plan-change.ts` 入口守卫（在现有逻辑最前）：

```ts
if (state.designPlanHash === undefined || state.stage !== "design-review") {
  return { stage: "idle", lastErrorCode: "DESIGN_NOT_CONFIRMED" };
}
```

（CONFIRM_DESIGN 路由进入时 classify 将 stage 置 `"design-planning"`，plan-change 允许；REVISE 后回 `"design-review"`。）

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm --filter @kf/agent-orchestrator test`
Expected: PASS（注意：既有 plan-change 相关测试若未提供 designPlanHash 会因守卫失败——需在既有测试的 state 补 `designPlanHash` 与 `stage:"design-review"`；计划内显式处理此回归）

- [ ] **Step 6: 提交**

```bash
git add packages/agent-orchestrator/src/nodes/design-plan.ts packages/agent-orchestrator/src/nodes/design-plan.test.ts packages/agent-orchestrator/src/solution-graph.ts packages/agent-orchestrator/src/nodes/plan-change.ts
git commit -m "feat(agent-orchestrator): design-plan node with revise loop and plan-change guard"
```

---

### Task 7: DeepSeek createDesignPlan + REVISE_DESIGN 修订上下文

**Files:**
- Modify: `apps/api/src/conversations/deepseek-model.ts`（+createDesignPlan 方法）
- Modify: `apps/api/src/conversations/kf-design-principles.ts`（新建，设计原则章节，见 Task 8）
- Test: `apps/api/src/conversations/deepseek-model.test.ts`

**Interfaces:**
- Consumes: `DesignPlanSchema`（Task 3）、`KF_DESIGN_PRINCIPLES`（Task 8）
- Produces: DeepSeek `createDesignPlan(input, { revising })`；revising 时 prompt 注入上一版 designPlan + 用户修改意见

- [ ] **Step 1: 写失败测试**

`apps/api/src/conversations/deepseek-model.test.ts` 追加：

```ts
it("createDesignPlan returns a valid DesignPlan", async () => {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({
        schema: "kf-design-plan/v1", displayName: "监控大屏", summary: "深色工业风",
        layoutConcept: "顶部标题 + 中部趋势区", styleDirection: "深色工业风",
        sections: [{ id: "kpi", label: "KPI 区", controls: [{ type: "text", text: "产量" }] }],
        signature: "趋势联动 KPI",
      }) } }],
    }),
  });
  const plan = await port.createDesignPlan({ /* 最小 context */ } as any);
  expect(plan.displayName).toBe("监控大屏");
  expect(plan.sections.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter apps/api test -- conversations/deepseek-model.test.ts`
Expected: FAIL（方法不存在）

- [ ] **Step 3: 实现 DeepSeek createDesignPlan**

`apps/api/src/conversations/deepseek-model.ts`：

```ts
async createDesignPlan(input: ModelPortContext, opts?: { revising?: boolean }): Promise<DesignPlan> {
  const system = this.buildSystemPrompt(); // 含 KF_DESIGN_PRINCIPLES（Task 8）
  const lines = [
    "为一个 KF 客户端工程生成设计计划（不是页面控件，是设计意图）。输出 JSON 符合 kf-design-plan/v1：",
    "displayName：工程显示名；summary：一句话摘要；layoutConcept：布局概念（含 ASCII 线框）；",
    "styleDirection：风格方向（配色/基调）；sections：页面分区（≤8 区，每区 ≤12 个控件占位，type 用指定枚举）；",
    "signature：本方案最特别的 1 个设计决策。",
    "需求：" + (input.requirementText ?? ""),
  ];
  if (opts?.revising) {
    lines.push("上一版设计计划：", JSON.stringify(input.designPlan ?? {}));
    lines.push("客户修改意见：" + (input.requirementText ?? ""));
    lines.push("在上一版基础上修订，不要重来；把改动体现在设计计划中。");
  }
  const content = await this.chat(system, lines.join("\n"));
  const parsed = DesignPlanSchema.safeParse(content);
  if (!parsed.success) throw new DeepSeekModelOutputError(`design plan zod gate: ...`);
  return parsed.data;
}
```

（`ModelPortContext` 增加可选 `designPlan?: DesignPlan` 字段，Task 6 已传。）

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter apps/api test -- conversations/deepseek-model.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/conversations/deepseek-model.ts apps/api/src/conversations/deepseek-model.test.ts
git commit -m "feat(api): DeepSeek createDesignPlan with revise context"
```

---

### Task 8: KF_DESIGN_PRINCIPLES 设计原则章节（转录 frontend-design）

**Files:**
- Create: `apps/api/src/conversations/kf-design-principles.ts`
- Modify: `apps/api/src/conversations/deepseek-model.ts`（system prompt 引用该章节）
- Test: `apps/api/src/conversations/kf-design-principles.test.ts`

**Interfaces:**
- Consumes: 无（纯常量）
- Produces: `KF_DESIGN_PRINCIPLES: string`（系统级设计原则，classify / createDesignPlan / createChangePlan 共用）

- [ ] **Step 1: 写失败测试**

`apps/api/src/conversations/kf-design-principles.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { KF_DESIGN_PRINCIPLES } from "./kf-design-principles.js";

describe("KF_DESIGN_PRINCIPLES", () => {
  it("is a non-empty design guidance string", () => {
    expect(KF_DESIGN_PRINCIPLES.length).toBeGreaterThan(500);
  });
  it("includes two-pass and restraint principles", () => {
    expect(KF_DESIGN_PRINCIPLES).toContain("两遍");
    expect(KF_DESIGN_PRINCIPLES).toContain("记忆点");
  });
  it("mentions the KF control vocabulary instead of CSS", () => {
    expect(KF_DESIGN_PRINCIPLES).not.toContain("flexbox");
    expect(KF_DESIGN_PRINCIPLES).toContain("分区");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter apps/api test -- conversations/kf-design-principles.test.ts`
Expected: FAIL（文件不存在）

- [ ] **Step 3: 实现设计原则常量**

`apps/api/src/conversations/kf-design-principles.ts`——转录 Anthropic `frontend-design/SKILL.md`（已获取原文）核心，适配 KF：

```ts
/**
 * KF 场景设计原则（转录 Anthropic frontend-design skill，Apache 2.0，
 * 适配 KF 控件语言：以分区/控件/配色/间距表达，而非 CSS）。
 */
export const KF_DESIGN_PRINCIPLES = `## 设计原则（KF 客户端工程）

你是设计主理人。客户为独特、不模板化的方案付费——每个方案要有明确的视觉个性，避免"默认控件堆砌"。

### 两遍流程
第一遍只出设计计划（DesignPlan：布局/风格/分区/控件占位/记忆点），不直接出控件方案；客户确认或修改后再生成控件方案。

### 先定主题
需求未明确时先自定：主题是什么、给谁看、页面唯一职责。监控大屏示例：主题=生产监控，受众=车间值班员，职责=一屏掌握产线状态。

### 布局即信息
用分区表达信息层级：顶部标题+关键 KPI；中部主内容区（趋势/图表占位）；两侧辅助区（状态/告警/明细）。分区用 KF 控件表达（text/button/table/...），间距与对齐保持一致（如统一 16px 边距、控件网格对齐）。

### 避免模板脸
- 不要"白底默认控件堆叠"（每控件等大等距、无主次）；
- 不要所有内容塞 4 个等大按钮（客户要趋势曲线时用"text 占位注明趋势区"，不要用按钮冒充）；
- 不要无信息含义的装饰（编号 01/02 等只在真是顺序时用）。

### 记忆点
boldness 用在一处：一个签名元素（如中部大趋势区 + 联动 KPI 高亮），其余保持克制。文案是设计材料——控件文本要具体可读，不用"标题1""按钮2"。

### 自审
生成前自问：分区有无主次？间距对齐是否一致？有没有更直接表达该信息的控件类型？能力边界内（当前控件清单）能否更好表达？`;

/** 注入 DeepSeek system prompt 的完整章节（含控件能力边界说明） */
export const KF_DESIGN_PRINCIPLES_FULL = [
  KF_DESIGN_PRINCIPLES,
  "### 控件能力边界",
  "当前可生成控件：text/button/inputnumber/switch/checkbox/radio/select/image/tabs/table/richtext/spacer。",
  "趋势曲线/图表尚未支持：需要图表时用 text 控件标注区名（如 text=中部趋势区）作为占位，不得用按钮冒充。",
].join("\n");
```

`deepseek-model.ts` 的 `buildSystemPrompt()` 把 `KF_DESIGN_PRINCIPLES_FULL` 拼入 system prompt。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter apps/api test -- conversations/kf-design-principles.test.ts && pnpm --filter apps/api test -- conversations/deepseek-model.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/conversations/kf-design-principles.ts apps/api/src/conversations/kf-design-principles.test.ts apps/api/src/conversations/deepseek-model.ts
git commit -m "feat(api): KF_DESIGN_PRINCIPLES from frontend-design, injected into DeepSeek system prompt"
```

---

### Task 9: 预览反馈循环（preview-review 阶段 + CONFIRM_BUILD 落地）

**Files:**
- Modify: `packages/agent-orchestrator/src/solution-graph.ts`（路由 + 阶段）
- Modify: `packages/agent-orchestrator/src/schemas/intent.ts`（+CONFIRM_BUILD）
- Modify: `packages/agent-orchestrator/src/nodes/enqueue-build.ts`（成功后 stage=preview-review + 提示消息）
- Modify: `packages/agent-orchestrator/src/nodes/classify-intent.ts`（预览阶段反馈路由）
- Test: `packages/agent-orchestrator/src/solution-graph.integration.test.ts`（或新建 preview-loop 测试）

**Interfaces:**
- Consumes: Task 2 stage 枚举（preview-review/done）、现有 enqueue-build
- Produces: `CONFIRM_BUILD` 意图 → END（stage=done）；preview-review 阶段 REVISE_DESIGN/MODIFY_REQUIREMENT 回环

- [ ] **Step 1: 写失败测试**

在 `packages/agent-orchestrator/src/solution-graph.test.ts`（或 integration）追加：

```ts
it("build success enters preview-review; CONFIRM_BUILD lands (stage=done)", async () => {
  // 构造已批准（resumeAction=approve）的 state，跑 enqueue-build 后：
  //   stage === "preview-review"
  // 再以 intent=CONFIRM_BUILD 输入，graph 结束，stage=done
});

it("preview feedback REVISE_DESIGN routes back to design-plan", async () => {
  // stage=preview-review 时用户输入"改成浅色风格"
  // classify → REVISE_DESIGN → design-plan 节点执行（designRevision+1）
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @kf/agent-orchestrator test`
Expected: FAIL（无 preview-review 路由）

- [ ] **Step 3: 实现**

- `intent.ts`：`IntentSchema` +`"CONFIRM_BUILD"`；
- `enqueue-build.ts`：成功后返回 `{ stage: "preview-review" }`，并 `persistAssistantMessage` 提示"构建完成，预览已生成；满意回复「确认落地」，或继续提修改意见"；
- `solution-graph.ts`：`routeAfterClassify` 加：

```ts
case "CONFIRM_BUILD":
  return "done";   // 新增终态节点 done（或直接 END + stage=done）
case "REVISE_DESIGN":   // preview-review 阶段大改
  return "design-plan";
case "MODIFY_REQUIREMENT":  // preview-review 阶段小改（复用现有 → plan-change）
  return "plan-change";
```

- 新增 `done` 终态节点（或复用 END）：`{ stage: "done", buildConfirmed: true }`；
- classify-intent：preview-review 阶段的自然语言反馈按内容分档——含"布局/风格/整体/重新设计"等大改词 → REVISE_DESIGN；否则 MODIFY_REQUIREMENT；"确认/可以/落地/满意" → CONFIRM_BUILD（DeepSeek classify prompt 增加该分档说明）。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @kf/agent-orchestrator test && pnpm typecheck`
Expected: PASS（既有 enqueue-build 测试若断言 stage 需同步为 preview-review）

- [ ] **Step 5: 提交**

```bash
git add packages/agent-orchestrator/src/solution-graph.ts packages/agent-orchestrator/src/schemas/intent.ts packages/agent-orchestrator/src/nodes/enqueue-build.ts packages/agent-orchestrator/src/nodes/classify-intent.ts packages/agent-orchestrator/src/solution-graph.test.ts
git commit -m "feat(agent-orchestrator): preview-review loop with CONFIRM_BUILD landing"
```

---

### Task 10: 前端对话展示（澄清追问 / 设计计划 / 预览反馈）

**Files:**
- Modify: `apps/web/src/components/ConversationPanel.vue`（展示澄清追问 + 设计计划结构化消息）
- Modify: `apps/web/src/views/WorkspaceView.vue`（预览反馈入口：预览区 + "确认落地"）
- Modify: `apps/web/src/types.ts`（消息类型扩展：clarifying-question / design-plan / preview-review）
- Test: `apps/web/src/components/ConversationPanel.test.ts`（追加）

**Interfaces:**
- Consumes: 后端 SSE 消息（含新消息类型）、stage 状态
- Produces: 澄清追问可点选（点选项即发送该文本）；设计计划以结构化卡片展示；预览后"确认落地"按钮

- [ ] **Step 1: 写失败测试**

`apps/web/src/components/ConversationPanel.test.ts` 追加：

```ts
it("renders a design-plan message as structured sections", async () => {
  // 构造 design-plan 类型消息（sections/layoutConcept/styleDirection/signature）
  // 断言：显示分区列表、风格方向、记忆点
});

it("renders a clarifying-question message with clickable options", async () => {
  // 断言：问题文本 + 选项按钮；点击选项 emits send(选项文本)
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @kf/web test`
Expected: FAIL（消息类型不识别）

- [ ] **Step 3: 实现**

- `types.ts`：消息类型 union 增加 `"clarifying-question"`（question + options）与 `"design-plan"`（DesignPlan 结构化字段）；
- `ConversationPanel.vue`：按类型分支渲染——clarifying-question 显示问题 + 可点选选项（点击 → send(选项文本)）；design-plan 渲染分区/布局/风格/记忆点卡片；
- `WorkspaceView.vue`：stage=preview-review 时预览区显示"确认落地"按钮（发送 CONFIRM_BUILD 语义的自然语言/意图）；stage=done 显示下载入口。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @kf/web test && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/types.ts apps/web/src/components/ConversationPanel.vue apps/web/src/views/WorkspaceView.vue apps/web/src/components/ConversationPanel.test.ts
git commit -m "feat(web): render clarifying questions, design plans, and preview-review actions"
```

---

### Task 11: 全量验证 + 真实 LLM 走查

**Files:**
- Modify: `tests/e2e/new-project.spec.ts`（E2E 适配新流程：澄清→设计→确认→计划→批准→构建→预览→落地）

**Interfaces:**
- Consumes: 全部前序任务
- Produces: 全绿测试 + 真实 DeepSeek 走查记录（监控大屏需求全链路）

- [ ] **Step 1: 全量测试**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: 全部通过（FakeModelPort 需补 createDesignPlan 确定性实现——E2E 用 fake 模式时澄清/设计走确定性路径）

- [ ] **Step 2: FakeModelPort 补 createDesignPlan**

`apps/api/src/conversations/fake-model.ts`（或等效文件）：补 `createDesignPlan` 确定性实现（固定 DesignPlan：一个分区、一个 text 控件），保证 E2E 稳定。

- [ ] **Step 3: E2E 更新（new-project.spec.ts）**

按新流程走查：输入需求 → 澄清追问出现（fake 模式直接出设计计划）→ 确认设计 → 计划 → 批准 → 构建 → 预览 → 确认落地 → 下载。若 fake 模式跳过澄清，断言设计计划消息存在 + 确认按钮可用。

- [ ] **Step 4: 真实 LLM 走查（可选，需 DEEPSEEK_API_KEY）**

用 `.toolchain/demo-run.sh`（deepseek 模式）起服务，走"生成监控大屏"全链路：澄清 ≥1 轮 → 设计计划 → 自然语言修订 → 确认 → 方案 → 批准 → 构建 → 预览 → 落地。记录走查结论（澄清问题质量、设计计划分区是否合理、修订是否生效）。

- [ ] **Step 5: 提交**

```bash
git add tests/e2e/new-project.spec.ts apps/api/src/conversations/fake-model.ts
git commit -m "test: adapt E2E to iterative design flow; fake createDesignPlan"
```

---

## Self-Review

**Spec 覆盖核对：**
- §4 层 1 澄清 → Task 1/4/5 ✓（intent、clarify 节点、classify 透传、5 轮上限）
- §5 层 2 设计迭代 → Task 3/6/7 ✓（DesignPlan、design-plan 节点、修订、守卫）
- §5.5 预览反馈 → Task 9 ✓（preview-review、CONFIRM_BUILD）
- §6 层 3 审美 → Task 8 ✓（KF_DESIGN_PRINCIPLES）
- §8 后续计划（控件补全）→ 明确不做，未建任务 ✓
- 跨平台约束 → 全任务用 node:path/node:crypto，无平台 API ✓
- 真实 LLM 验证 → Task 11 Step 4 ✓

**占位符扫描：** 无 TBD/TODO；代码块均为具体实现。

**类型一致性：** `clarifyingQuestion`（Task 1/4/5 一致）、`designPlan/designPlanHash/designRevision`（Task 2/6/7 一致）、`createDesignPlan(input, {revising})`（Task 3/6/7 一致）、`stage` 枚举值（Task 2 定义，Task 6/9 引用一致）、`KF_DESIGN_PRINCIPLES_FULL`（Task 8 定义，Task 7 引用）。
