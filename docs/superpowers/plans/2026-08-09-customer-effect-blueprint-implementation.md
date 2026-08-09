# Customer Effect Blueprint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every customer-visible design proposal, starting with revision 1, a detailed effect blueprint whose revisions visibly and substantively implement customer feedback before any engineering plan is approved.

**Architecture:** Introduce a strict `kf-design-plan/v2` contract while retaining v1 as a readable legacy union. The orchestrator owns blueprint versioning, quality/difference gates and a versioned message codec; the DeepSeek adapter owns detailed blueprint generation; the Vue client renders the structured customer view and keeps the legacy v1 parser.

**Tech Stack:** TypeScript, Zod, LangGraph orchestration, NestJS, DeepSeek OpenAI-compatible API, Vue 3, Vitest, Prisma/PostgreSQL.

## Global Constraints

- Every customer-visible revision, including the first, must contain objective, audiences, scenarios, module details, sample data, interactions, visual direction, highlights and acceptance criteria.
- `kf-design-plan/v2` is internal only; the UI shows customer revision numbers such as “效果蓝图 v1”.
- Customer output must not expose KF GUIDs, coordinates, variable IDs, raw project JSON or tool-call details.
- A revision that does not substantively change the previous blueprint must not replace the previous valid blueprint or enter ChangePlan approval.
- Historical `kf-design-plan/v1` checkpoints and messages must remain readable and confirmable.
- Only explicit customer confirmation may route from `design-review` to ChangePlan generation.
- Model text is rendered through Vue interpolation; `v-html` remains prohibited.
- Use strict TDD: each production change follows a test observed failing for the intended missing behavior.
- Run all `pnpm` commands from `agent-app/`; run repository-level `git` commands from the worktree root.

---

### Task 1: Versioned customer-effect blueprint contract

**Files:**
- Modify: `agent-app/packages/contracts/src/design-plan.ts`
- Modify: `agent-app/packages/contracts/src/design-plan.test.ts`
- Modify: `agent-app/packages/contracts/src/index.ts`

**Interfaces:**
- Produces: `LegacyDesignPlanSchema`, `CustomerEffectBlueprintSchema`, union `DesignPlanSchema`, `LegacyDesignPlan`, `CustomerEffectBlueprint`, and union `DesignPlan`.
- Consumes: existing `DesignPlanControlType` only for the legacy v1 branch.

- [ ] **Step 1: Write failing contract tests**

Add literal v2 fixtures proving that the first blueprint is detailed and strict:

```ts
const detailed = {
  schema: "kf-design-plan/v2",
  displayName: "个人求职作品集",
  overview: {
    objective: "让招聘经理快速理解候选人的能力、产品和项目成果",
    audiences: ["招聘经理", "面试官"],
    scenarios: ["求职应聘"],
    valueProposition: "用产品与项目证据展示候选人的实际价值",
  },
  informationArchitecture: {
    narrative: "从个人定位到产品、项目、履历和联系方式",
    wireframe: "首屏 → 产品 → 项目 → 履历 → 联系方式",
  },
  modules: [{
    id: "products",
    name: "我的产品",
    purpose: "展示主导或参与的产品",
    content: ["产品定位", "个人职责", "量化成果"],
    sampleData: [{ label: "产品名称", value: "工业低代码平台" }],
    interactions: ["点击卡片展开详情"],
    presentation: "大尺寸产品卡片",
  }],
  visualDirection: {
    tone: "专业可信",
    colors: ["深蓝", "暖金"],
    typography: "标题与正文形成清晰层级",
    spacingAndSurfaces: "大留白与轻边框卡片",
  },
  highlights: ["产品与项目形成完整证据链"],
  revisionNotes: { added: ["完整产品模块"], changed: [], retained: [] },
  acceptanceCriteria: ["至少展示两个包含职责和成果的产品案例"],
  openQuestions: ["是否使用真实头像"],
} as const;

expect(CustomerEffectBlueprintSchema.safeParse(detailed).success).toBe(true);
expect(DesignPlanSchema.safeParse(detailed).success).toBe(true);
expect(DesignPlanSchema.safeParse(legacyV1Fixture).success).toBe(true);
expect(CustomerEffectBlueprintSchema.safeParse({ ...detailed, modules: [] }).success).toBe(false);
expect(CustomerEffectBlueprintSchema.safeParse({ ...detailed, acceptanceCriteria: [] }).success).toBe(false);
```

- [ ] **Step 2: Run contract tests and observe RED**

Run: `pnpm --filter @kf/contracts test -- design-plan.test.ts`

Expected: FAIL because `CustomerEffectBlueprintSchema` and the versioned union do not exist.

- [ ] **Step 3: Implement the strict v2 schema and legacy union**

Keep the existing object as `LegacyDesignPlanSchema`. Add bounded `.strict()` Zod objects for every v2 field, then export:

```ts
export const DesignPlanSchema = z.discriminatedUnion("schema", [
  LegacyDesignPlanSchema,
  CustomerEffectBlueprintSchema,
]);
export type LegacyDesignPlan = z.infer<typeof LegacyDesignPlanSchema>;
export type CustomerEffectBlueprint = z.infer<typeof CustomerEffectBlueprintSchema>;
export type DesignPlan = z.infer<typeof DesignPlanSchema>;
```

Use non-empty arrays for `modules`, `content`, `highlights`, and `acceptanceCriteria`; allow empty arrays only for sample data, interactions, individual revision-note categories and open questions. Bound modules to 12, entries per list to 12, sample rows to 10, ordinary strings to 600 characters and wireframe to 1200 characters.

- [ ] **Step 4: Run contracts test, typecheck and lint**

Run:

```bash
pnpm --filter @kf/contracts test -- design-plan.test.ts
pnpm --filter @kf/contracts typecheck
pnpm --filter @kf/contracts lint
```

Expected: all PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add agent-app/packages/contracts/src/design-plan.ts agent-app/packages/contracts/src/design-plan.test.ts agent-app/packages/contracts/src/index.ts
git commit -m "feat(contracts): add detailed effect blueprint schema"
```

---

### Task 2: Blueprint quality gate, retry, and versioned message codec

**Files:**
- Create: `agent-app/packages/agent-orchestrator/src/blueprint-quality.ts`
- Create: `agent-app/packages/agent-orchestrator/src/blueprint-quality.test.ts`
- Create: `agent-app/packages/agent-orchestrator/src/blueprint-message.ts`
- Create: `agent-app/packages/agent-orchestrator/src/blueprint-message.test.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/model-port.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/nodes/design-plan.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/nodes/design-plan.test.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/state.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/index.ts`

**Interfaces:**
- Produces: `assessBlueprintRevision(previous, candidate): string[]`, `encodeBlueprintMessage(blueprint, revision): string`, `decodeBlueprintMessage(content): { blueprint; revision } | null`.
- Changes: `createDesignPlan(input, opts)` options become `{ revising?: boolean; rejectionReasons?: string[] }`.
- Consumes: `CustomerEffectBlueprintSchema`, legacy/v2 `DesignPlanSchema`, and the existing workspace message append port.

- [ ] **Step 1: Write failing quality-gate tests**

Cover observable failures with hand-authored fixtures:

```ts
expect(assessBlueprintRevision(previous, previous)).toContain("蓝图主体没有实质变化");
expect(assessBlueprintRevision(previous, {
  ...previous,
  revisionNotes: { added: [], changed: [], retained: ["保留原布局"] },
})).toContain("修订没有声明新增或调整内容");
expect(assessBlueprintRevision(previous, changedProducts)).toEqual([]);
```

The body comparison must exclude `revisionNotes` so fabricated change prose cannot make an unchanged plan pass.

- [ ] **Step 2: Run the focused test and observe RED**

Run: `pnpm --filter @kf/agent-orchestrator exec vitest run src/blueprint-quality.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement deterministic substantive-difference checks**

Normalize objects by recursively sorting keys and trimming strings. For v2-to-v2 revision compare the normalized candidates without `revisionNotes`; reject equality and reject empty `added + changed`. For legacy-v1-to-v2 treat the schema upgrade as substantive when v2 contains detailed modules and acceptance criteria. Do not attempt probabilistic Chinese keyword matching in deterministic code.

- [ ] **Step 4: Write failing codec tests**

Assert that encoding and decoding preserves the exact v2 object and customer revision, returns `null` for ordinary messages, and never places the internal schema label in the customer-visible heading returned by the decoder’s formatted view.

Use a versioned envelope:

```ts
type BlueprintMessageEnvelope = {
  kind: "kf-customer-effect-blueprint";
  version: 1;
  revision: number;
  blueprint: CustomerEffectBlueprint;
};
```

The message content is `KF_BLUEPRINT_MESSAGE/1\n` followed by compact JSON. This is an internal transport format; the Web client must decode it before display.

- [ ] **Step 5: Run codec tests and observe RED**

Run: `pnpm --filter @kf/agent-orchestrator exec vitest run src/blueprint-message.test.ts`

Expected: FAIL because the codec does not exist.

- [ ] **Step 6: Implement the codec with schema-gated decode**

Decode only the exact prefix, JSON parse inside `try/catch`, validate revision as a positive integer and blueprint with `CustomerEffectBlueprintSchema`. Invalid envelopes return `null` and never throw into conversation rendering/history.

- [ ] **Step 7: Write failing design-node tests for first revision, retry and safe failure**

Add tests proving:

1. The first call returns v2 and appends an encoded “效果蓝图 v1” envelope.
2. An unchanged revision causes a second model call with `rejectionReasons`.
3. A valid second result is stored as revision 2.
4. Two invalid results preserve `state.designPlan`, `state.designPlanHash` and `state.designRevision`, append a detailed retryable assistant explanation, return to `design-review`, and create no plan/build side effect.

The mutation caught by these tests is removing the quality gate or overwriting the previous valid blueprint after a failed retry.

- [ ] **Step 8: Run design-node tests and observe RED**

Run: `pnpm --filter @kf/agent-orchestrator exec vitest run src/nodes/design-plan.test.ts`

Expected: FAIL because the node currently accepts unchanged bodies and emits the legacy text format.

- [ ] **Step 9: Implement one retry and preserve-last-good semantics**

For revisions, call `assessBlueprintRevision`. On failure, call `createDesignPlan` once more with the rejection reasons. Only hash, append and return a new blueprint after the candidate passes. If both fail, append a customer message explaining that the requested change was not reflected and asking the customer to retry or clarify; keep the previous blueprint fields unchanged and `stage: "design-review"`.

For first generation, require `schema === "kf-design-plan/v2"`; legacy v1 is read compatibility only and must never be newly generated.

- [ ] **Step 10: Run orchestrator focused/full verification**

Run:

```bash
pnpm --filter @kf/agent-orchestrator exec vitest run src/blueprint-quality.test.ts src/blueprint-message.test.ts src/nodes/design-plan.test.ts
pnpm --filter @kf/agent-orchestrator test
pnpm --filter @kf/agent-orchestrator typecheck
pnpm --filter @kf/agent-orchestrator lint
```

Expected: all PASS.

- [ ] **Step 11: Commit Task 2**

```bash
git add agent-app/packages/agent-orchestrator
git commit -m "feat(agent): enforce substantive effect blueprint revisions"
```

---

### Task 3: Detailed DeepSeek generation and revision traceability

**Files:**
- Modify: `agent-app/apps/api/src/conversations/deepseek-model.ts`
- Modify: `agent-app/apps/api/src/conversations/deepseek-model.test.ts`
- Modify: `agent-app/apps/api/src/conversations/fake-model.ts`
- Modify: `agent-app/apps/api/src/api.integration.test.ts`

**Interfaces:**
- Consumes: the new `CustomerEffectBlueprint` contract and `rejectionReasons` option.
- Produces: only `kf-design-plan/v2` for new and revised blueprints.

- [ ] **Step 1: Write failing DeepSeek prompt/output tests**

Capture the actual request body passed to the fetch seam. Assert behavior through the returned validated object and the complete request payload:

- The first-generation request demands objective, audiences, scenarios, modules, concrete content, sample data, interactions, visual direction, highlights, acceptance criteria and open questions.
- It states that every first revision is already a complete customer effect blueprint.
- It forbids customer-visible GUIDs, coordinates and raw JSON implementation details.
- A revision request contains the previous blueprint, latest customer feedback and any quality-gate rejection reasons.
- The personal-resume fixture returns distinct `products` and `projects` modules with meaningful sample data.

- [ ] **Step 2: Run focused API model tests and observe RED**

Run: `pnpm --filter @kf/api exec vitest run src/conversations/deepseek-model.test.ts`

Expected: FAIL because the existing method requests the shallow v1 schema.

- [ ] **Step 3: Replace the shallow design prompt with the detailed v2 contract**

Use a dedicated design system prompt emphasizing professional customer-advisor language and concrete content. Set `max_tokens` for blueprint generation to 8000 while leaving classification/plan methods bounded at their existing value. Require revision notes to state added, changed and retained content and require every customer request to land in a module, interaction, visual decision or acceptance criterion.

When `rejectionReasons` is non-empty, append:

```text
上一候选蓝图未通过质量门禁，必须修正以下问题：
- <reason>
请重新生成完整蓝图，不要只改 revisionNotes。
```

- [ ] **Step 4: Update the fake model and API integration fixture**

Return a minimal valid detailed blueprint from every fake `createDesignPlan`. Change integration assertions from shallow formatted text to a decoded blueprint envelope and assert `stage === "design-review"`, internal schema v2 and customer revision 1.

- [ ] **Step 5: Run API model/integration/type verification**

Run:

```bash
pnpm --filter @kf/api exec vitest run src/conversations/deepseek-model.test.ts src/api.integration.test.ts
pnpm --filter @kf/api typecheck
pnpm --filter @kf/api lint
```

Expected: all PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add agent-app/apps/api/src/conversations
git add agent-app/apps/api/src/api.integration.test.ts
git commit -m "feat(api): generate detailed customer effect blueprints"
```

---

### Task 4: Customer-readable Vue blueprint card

**Files:**
- Modify: `agent-app/apps/web/src/types.ts`
- Modify: `agent-app/apps/web/src/components/ConversationPanel.vue`
- Modify: `agent-app/apps/web/src/components/ConversationPanel.test.ts`

**Interfaces:**
- Consumes: the `KF_BLUEPRINT_MESSAGE/1` envelope through an exported Web-side decoder/view mapper.
- Produces: `CustomerEffectBlueprintView`, while retaining `DesignPlanView` and `parseDesignPlan` for legacy v1 messages.

- [ ] **Step 1: Write failing decoder/view tests**

Using a literal encoded message, assert the parsed customer view contains revision, objective, audiences, scenarios, module content, sample data, interactions, visual direction, revision notes, acceptance criteria and open questions. Assert malformed envelopes safely return `null`, and legacy v1 text still parses.

- [ ] **Step 2: Run focused Web tests and observe RED**

Run: `pnpm --filter @kf/web exec vitest run src/components/ConversationPanel.test.ts`

Expected: FAIL because no v2 customer view parser exists.

- [ ] **Step 3: Implement the Web decoder/view mapper**

Mirror the envelope boundary without importing server-only code. Validate required runtime shape before mapping. Do not render the raw envelope on parse failure; malformed `KF_BLUEPRINT_MESSAGE/1` messages map to a safe assistant error text such as “这份效果蓝图暂时无法显示，请重新生成。”

- [ ] **Step 4: Write failing component rendering tests**

Mount `ConversationPanel` with the encoded resume blueprint and assert visible customer text includes:

```text
效果蓝图 v1
方案目标
我的产品
工业低代码平台
点击卡片展开详情
最终验收效果
至少展示两个包含职责和成果的产品案例
```

For a revision fixture assert “本次更新” is displayed before the module list. Click the confirm button and assert one emitted `send` event with `"确认"`. Assert the raw `kf-design-plan/v2` string is absent from rendered text.

- [ ] **Step 5: Run component tests and observe RED**

Run: `pnpm --filter @kf/web exec vitest run src/components/ConversationPanel.test.ts`

Expected: FAIL because the component only renders the shallow legacy card.

- [ ] **Step 6: Implement the detailed card**

Render semantic sections with headings and lists. The revision block appears near the top; on revision 1 its label is “方案要点”, on later revisions it is “本次更新”. Keep long content inside the existing scroll container, use responsive one-column module layout below the current mobile breakpoint and preserve template interpolation for every model-originated value.

- [ ] **Step 7: Run Web focused/full verification**

Run:

```bash
pnpm --filter @kf/web exec vitest run src/components/ConversationPanel.test.ts
pnpm --filter @kf/web test
pnpm --filter @kf/web typecheck
pnpm --filter @kf/web lint
```

Expected: all PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add agent-app/apps/web/src/types.ts agent-app/apps/web/src/components/ConversationPanel.vue agent-app/apps/web/src/components/ConversationPanel.test.ts
git commit -m "feat(web): show complete customer effect blueprints"
```

---

### Task 5: End-to-end regression and live DeepSeek validation

**Files:**
- Modify: `agent-app/packages/agent-orchestrator/src/solution-graph.test.ts`
- Modify: `agent-app/apps/api/src/api.integration.test.ts`
- Create: `docs/superpowers/reports/2026-08-09-customer-effect-blueprint-verification.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: regression evidence that feedback changes the blueprint and does not enter approval until explicit confirmation.

- [ ] **Step 1: Add the graph-level regression test**

Run this conversation with a deterministic model fixture:

1. “个人简历网站”.
2. “① 求职应聘”.
3. “我希望有我的产品、项目经历，可以使用假的数据占位，但是内容要充实”.

Assert first output is a complete customer effect blueprint revision 1. Assert revision 2 contains separate product/project modules, non-empty sample data, `revisionNotes.added`, and detailed acceptance criteria. Assert no `ChangeRequest`, `ChangePlan`, `BuildJob` or approval interrupt exists until a subsequent explicit “确认”.

- [ ] **Step 2: Run the regression and observe RED if any boundary remains shallow**

Run:

```bash
pnpm --filter @kf/agent-orchestrator exec vitest run src/solution-graph.test.ts
pnpm --filter @kf/api exec vitest run src/api.integration.test.ts
```

Expected before final wiring: at least one assertion fails if any path still emits or consumes v1.

- [ ] **Step 3: Make only the wiring changes exposed by the failing regression**

Update fixture/context wiring, state unions or message decoding at the exact failing boundary. Do not broaden scope into JSON generation, deployment or unsupported KF component implementation.

- [ ] **Step 4: Run package and repository verification**

Run:

```bash
pnpm --filter @kf/contracts test
pnpm --filter @kf/agent-orchestrator test
pnpm --filter @kf/api test
pnpm --filter @kf/web test
pnpm typecheck
pnpm lint
git diff --check
```

Expected: all changed-package tests, typecheck, lint and diff check PASS. Any unrelated pre-existing full-suite failure must be reproduced on the base commit and documented rather than silently accepted.

- [ ] **Step 5: Restart the local API/Web services with real DeepSeek configuration**

Use the existing ignored `.env.local`; never print the key. Preserve the existing database and authenticated demo account. Confirm Web returns HTTP 200 and unauthenticated `/api/me` returns HTTP 401.

- [ ] **Step 6: Run the real-model personal-site conversation**

Create a fresh workspace and execute the three regression messages. Record only non-secret workspace/conversation IDs and customer-visible blueprint fields. Verify:

- Revision 1 is already detailed.
- Revision 2 adds a separate product module.
- Project examples contain background, responsibility, solution and outcome.
- Revision notes explain the actual changes.
- No engineering approval appears before “确认”.

- [ ] **Step 7: Write the verification report and commit**

Document exact commands, pass counts, live service probes and redacted real-model observations in the report.

```bash
git add agent-app/packages/agent-orchestrator/src/solution-graph.test.ts agent-app/apps/api/src/api.integration.test.ts docs/superpowers/reports/2026-08-09-customer-effect-blueprint-verification.md
git commit -m "test: verify detailed effect blueprint workflow"
```

---

## Completion Criteria

- The first customer proposal is a complete effect blueprint, not a control-type list.
- Every successful revision has a substantive body difference and a truthful customer-visible change summary.
- The personal-site feedback produces distinct product and project sections with concrete sample content.
- Failed revisions preserve the last good blueprint and never reach approval/build.
- Historical v1 state/messages still work.
- Customer UI never exposes the internal schema version or raw envelope.
- Focused and full verification evidence is recorded without secrets.
