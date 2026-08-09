# Design Review Conversation Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep supplemental customer requirements in the design revision loop until the customer explicitly confirms the design.

**Architecture:** Add a deterministic stage-aware guard after model classification, while improving DeepSeek prompts so the model receives complete intent vocabulary and conversation context. Preserve the existing approval interrupt and build pipeline.

**Tech Stack:** TypeScript, LangGraph, NestJS, Vitest, DeepSeek OpenAI-compatible API.

## Global Constraints

- Explicit short design confirmation is the only path from `design-review` to `plan-change`.
- Supplemental requirements before confirmation produce a revised DesignPlan and no ChangePlan.
- Existing plan approval and build authorization semantics remain unchanged.

---

### Task 1: Make design-review routing deterministic

**Files:**
- Modify: `agent-app/packages/agent-orchestrator/src/nodes/classify-intent.ts`
- Test: `agent-app/packages/agent-orchestrator/src/nodes/classify-intent.test.ts`
- Test: `agent-app/packages/agent-orchestrator/src/solution-graph.test.ts`

**Interfaces:**
- Consumes: `AgentGraphStateValue.stage`, `ClassifyIntentResult.intent`.
- Produces: `REVISE_DESIGN` for supplemental design feedback; `CONFIRM_DESIGN` only for explicit short confirmation.

- [ ] Add a failing node test using “我希望有我的产品，项目经历，可以使用假的数据占位，但是内容要充实” while `stage=design-review` and a model result of `MODIFY_REQUIREMENT`; expect `REVISE_DESIGN`.
- [ ] Run the focused test and confirm it fails with `MODIFY_REQUIREMENT`.
- [ ] Add the minimal stage-aware normalization after the explicit-confirmation branch.
- [ ] Add a graph regression asserting a second DesignPlan is emitted and no ChangePlan/approval interrupt is created.
- [ ] Run orchestrator focused and full tests.

### Task 2: Preserve full requirement context in DeepSeek prompts

**Files:**
- Modify: `agent-app/apps/api/src/conversations/deepseek-model.ts`
- Test: `agent-app/apps/api/src/conversations/deepseek-model.test.ts`

**Interfaces:**
- Consumes: `ModelPortContext.recentMessages`, `requirementText`, optional prior `designPlan`.
- Produces: DeepSeek user prompts containing the complete recent conversation and all supported stage intents.

- [ ] Add failing prompt-capture tests asserting `createDesignPlan` contains both “个人简历网站” and “① 求职应聘”, and `classifyIntent` lists `CONFIRM_DESIGN`/`REVISE_DESIGN`.
- [ ] Run the focused model tests and confirm the missing prompt content failures.
- [ ] Add a bounded recent-conversation block to the design prompt and complete the intent vocabulary.
- [ ] Run model tests, API typecheck, and ESLint.
- [ ] Run the real “个人网站” scenario against DeepSeek and confirm supplemental feedback yields `design-review` v2 without a ChangePlan.

