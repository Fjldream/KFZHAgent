# 对话全链路"温和专业"化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 KF Solution Agent 全链路回复改为温和专业的客服式文案：澄清追问带序号选项、设计计划/构建提示/落地确认礼貌自然、普通问答客服语气。

**Architecture:** 只改文案层——DeepSeek prompt（SYSTEM_PROMPT persona + classifyIntent 澄清规则）与 4 处节点文案（design-plan/enqueue-build/done）。图路由、状态机、契约 schema 不动；前端零改动（parseClarifyingQuestion 已支持 ①② 序号解析）。

**Tech Stack:** TypeScript、NestJS、LangGraph（agent-orchestrator）、vitest。

## Global Constraints

- 语气基调：**温和专业风**——用「您好/请/您可以」，**禁止 emoji、禁止语气词**（呀/哦/呢）。
- 选项序号格式：`①②③④⑤`（最多 5 个），如 `① 生产车间监控`。
- 澄清判定规则（信息不足必 CLARIFY、一次一维、≤5 选项、禁止猜测需求）保持不变。
- 前端 `apps/web/src/components/ConversationPanel.vue` **不得修改**。
- 全仓 `pnpm test` 全绿、typecheck/lint 干净。
- 环境：Node 用 `export PATH="/Users/fengjinlong/YK/KingFusion3.6/.toolchain/node-v24.19.0-darwin-arm64/bin:$PATH"`。

---

### Task 1: DeepSeek 澄清规则 + 客服 persona（prompt 层）

**Files:**
- Modify: `apps/api/src/conversations/deepseek-model.ts`（SYSTEM_PROMPT 常量 + classifyIntent 的 userPrompt 澄清规则段）
- Test: `apps/api/src/conversations/deepseek-model.test.ts`

**Interfaces:**
- Produces: 无新接口；DeepSeek classifyIntent 输出 CLARIFY 时 `clarifyingQuestion.options` 为带序号字符串数组（`["① 生产车间监控", ...]`）

- [ ] **Step 1: 写失败测试**——在 deepseek-model.test.ts 追加用例：mock fetch 返回 CLARIFY + options 含 `① ` 序号前缀的 JSON，断言 `port.classifyIntent` 输出 options 保持序号透传。

```ts
// 追加到 deepseek-model.test.ts 的 describe 内（沿用现有 mockFetch 构造方式）
it("passes through numbered clarifying options verbatim", async () => {
  mockFetch({ ... }); // 返回 { intent: "CLARIFY", clarifyingQuestion: { question: "…", options: ["① 生产车间监控", "② 机房设备监控"] } }
  const result = await port.classifyIntent({ tenantId: "t", userId: "u", workspaceId: "w", conversationId: "c", recentMessages: [] });
  expect(result.intent).toBe("CLARIFY");
  expect(result.clarifyingQuestion?.options?.[0]).toMatch(/^① /);
});
```

- [ ] **Step 2: 跑测试确认失败**——Run: `pnpm --filter @kf/api test -- conversations/deepseek-model.test.ts`；若用例本身通过（mock 透传天然成立），则改为断言 prompt 约束存在：mock 捕获请求体，断言 user prompt 含「选项必须带序号」与「您好」字样，先写此断言让其失败。

- [ ] **Step 3: 改 deepseek-model.ts**
  1. `SYSTEM_PROMPT` 常量首部追加 persona：`你以礼貌、专业的客服顾问口吻与客户沟通，回复简洁自然，像真人顾问在对话，避免机械罗列。`
  2. classifyIntent userPrompt 的「澄清判定规则」段替换为：

```
澄清判定规则：
- 判断需求信息是否足够生成设计方案：若主题/页面/布局/风格等关键信息缺失或模糊，intent 必须为 CLARIFY。
- CLARIFY 时：问题用礼貌开场，格式为「您好，为了帮您把方案做得更贴合需求，先确认一下：<具体问题>。请选择或直接告诉我。」
- 选项必须带序号（①②③④⑤），最多 5 个，一次只问一个维度，选项简短具体（如「① 生产车间监控」）。
- 信息足够时才返回 NEW_REQUIREMENT / MODIFY_REQUIREMENT，禁止猜测需求。
```

- [ ] **Step 4: 跑测试确认通过**——Run: `pnpm --filter @kf/api test -- conversations/deepseek-model.test.ts`（含新断言 + 既有用例不回归）。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/conversations/deepseek-model.ts apps/api/src/conversations/deepseek-model.test.ts
git commit -m "feat(api): warm-professional persona + numbered clarifying options in DeepSeek prompts"
```

---

### Task 2: 设计计划展示文案

**Files:**
- Modify: `packages/agent-orchestrator/src/nodes/design-plan.ts`（`formatDesignPlan` 函数）
- Test: `packages/agent-orchestrator/src/nodes/design-plan.test.ts`

**Interfaces:**
- Consumes: `formatDesignPlan(plan)` 现有签名不变。
- Produces: 展示文本开头含「您好，我已根据您的需求整理出一份设计草案，请您过目：」，结尾含「您可以随时告诉我哪里需要调整；确认没问题的话，回复「确认」即可。」

- [ ] **Step 1: 写失败测试**——在 design-plan.test.ts 已有「shows the display name, style, sections and the confirm/revise prompt」用例中追加断言：

```ts
expect(shown).toContain("您好，我已根据您的需求整理出一份设计草案");
expect(shown).toContain("确认没问题的话，回复「确认」即可");
```

- [ ] **Step 2: 跑测试确认失败**——Run: `pnpm --filter @kf/agent-orchestrator test -- nodes/design-plan.test.ts`，断言不通过（现文案无此两段）。

- [ ] **Step 3: 改 formatDesignPlan**——`packages/agent-orchestrator/src/nodes/design-plan.ts` 的 `formatDesignPlan` 开头追加一行 `您好，我已根据您的需求整理出一份设计草案，请您过目：`，结尾（签名/记忆点行之后）追加 `您可以随时告诉我哪里需要调整；确认没问题的话，回复「确认」即可。`。

- [ ] **Step 4: 跑测试确认通过**——Run: `pnpm --filter @kf/agent-orchestrator test`（含新断言 + 不回归）。

- [ ] **Step 5: 提交**

```bash
git add packages/agent-orchestrator/src/nodes/design-plan.ts packages/agent-orchestrator/src/nodes/design-plan.test.ts
git commit -m "feat(agent-orchestrator): warm-professional design plan presentation copy"
```

---

### Task 3: 构建提示 + 落地确认文案

**Files:**
- Modify: `packages/agent-orchestrator/src/nodes/enqueue-build.ts`（构建完成提示文本）
- Modify: `packages/agent-orchestrator/src/solution-graph.ts`（done 节点新增 appendMessage）
- Test: `packages/agent-orchestrator/src/solution-graph.test.ts`

**Interfaces:**
- Consumes: 无新接口；`deps.workspaceQuery.appendMessage({ tenantId, conversationId, role, content })` 现有签名。
- Produces: enqueue-build 提示为「预览已生成，您可以在右侧查看实际效果；满意的话回复「确认落地」，需要调整也可以直接告诉我。」；done 节点新增 assistant 消息「方案已确认落地。感谢您的沟通！后续如需继续调整或新增需求，随时找我。」

- [ ] **Step 1: 写失败测试**——solution-graph.test.ts：
  1. 找到构建成功用例（approve 后断言 enqueue-build 提示的），把断言文本改为新文案「预览已生成，您可以在右侧查看实际效果」。
  2. 追加落地用例：`CONFIRM_BUILD` → done 后断言 `bed.workspace.appendCalls` 含 role=assistant 且 content 含「方案已确认落地。感谢您的沟通！」。

- [ ] **Step 2: 跑测试确认失败**——Run: `pnpm --filter @kf/agent-orchestrator test -- solution-graph.test`，两处断言不通过。

- [ ] **Step 3: 实现**
  1. `enqueue-build.ts` 中构建完成提示文本改为：`预览已生成，您可以在右侧查看实际效果；满意的话回复「确认落地」，需要调整也可以直接告诉我。`
  2. `solution-graph.ts` 的 done 节点（`createDoneNode`）内，返回 `{ stage: "done", buildConfirmed: true }` 之前调用 `deps.workspaceQuery.appendMessage({ tenantId, conversationId, role: "assistant", content: "方案已确认落地。感谢您的沟通！后续如需继续调整或新增需求，随时找我。" })`——注意 done 节点当前是无参函数，需改为接收 state（`(state: AgentGraphStateValue) => ...`），`deps` 需传入（确认 `createDoneNode` 当前签名；若无 deps 参数则改为 `createDoneNode(deps)`，在 graph 组装处同步）。

- [ ] **Step 4: 跑测试确认通过**——Run: `pnpm --filter @kf/agent-orchestrator test` + `pnpm --filter @kf/agent-orchestrator typecheck`。

- [ ] **Step 5: 提交**

```bash
git add packages/agent-orchestrator/src/nodes/enqueue-build.ts packages/agent-orchestrator/src/solution-graph.ts packages/agent-orchestrator/src/solution-graph.test.ts
git commit -m "feat(agent-orchestrator): warm-professional build-preview and landing copy"
```

---

### Task 4: 全量验证 + 真实走查

**Files:**
- 无代码改动（仅验证）

**Interfaces:**
- Consumes: Task 1-3 全部改动。

- [ ] **Step 1: 全量测试**——Run: `pnpm test`，预期 369+ 全绿（新用例计入）；`pnpm typecheck` 0 错误；`pnpm lint` 0 错误。

- [ ] **Step 2: 真实 DeepSeek 走查**——重启 demo（api+worker，`ARTIFACT_STORAGE_ROOT=/Users/fengjinlong/YK/KingFusion3.6/agent-app/.kf-demo-artifacts`，`MODEL_PORT_MODE=deepseek` + `DEEPSEEK_API_KEY`），新对话发「生成一个监控大屏」，验证：
  - 澄清追问为「您好，为了帮您把方案做得更贴合需求，先确认一下：…」且选项带 ①②③④ 序号；
  - 回复「生产制造过程」后设计计划展示含礼貌开场与结尾引导；
  - 普通问答（如「你好」）reply 礼貌自然。

- [ ] **Step 3: 提交（如有走查修复）**——走查若发现文案/序号问题，修复后提交并记录。

**验收对照（spec §6）**：澄清格式、设计计划开场结尾、构建/落地提示、普通问答语气、全量测试——全部满足后本计划完成。
