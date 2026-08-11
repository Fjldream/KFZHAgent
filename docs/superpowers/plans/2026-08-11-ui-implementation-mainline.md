# UI Implementation Mainline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the confirmed customer-effect blueprint to the existing `UIImplementationSpec` compiler so a multi-module blueprint deterministically produces a complete, styled KingClient `ChangePlan` and build instead of a single model-authored update.

**Architecture:** Keep LangGraph as the durable workflow owner and DeepSeek as the bounded structured planner. Add one UI implementation planning stage between `design-plan` and the existing approval/build pipeline; the model emits only a validated `UIImplementationSpec`, while `compileUiImplementation()` and the capability registry deterministically emit the `ChangePlan`. Persist the implementation spec and reports in graph state, reject incomplete blueprint coverage, and reuse the same stage for preview feedback.

**Tech Stack:** TypeScript, LangGraph, NestJS, DeepSeek OpenAI-compatible API, Zod, Prisma/PostgreSQL checkpointing, Vitest, existing `@kf/contracts`, `@kf/domain-client`, and `@kf/agent-orchestrator` packages.

## Global Constraints

- First release only executes `kingclient`; no customer-machine deployment or online import is added.
- Visual screenshot comparison and multimodal acceptance are explicitly out of scope.
- Theme, structured style, capability selection, safe CSS compilation, deterministic patching, validation, packaging, and local preview already implemented must be reused rather than bypassed.
- The model must never emit raw KF JSON, GUIDs, arbitrary CSS, JavaScript, build artifacts, or direct file mutations.
- A confirmed blueprint with multiple modules must not compile when any module has no implementation component.
- Critical unsupported capabilities fail before build; non-critical gaps require a verified fallback and remain recorded in the capability report.
- New projects may replace the generated seed placeholder; imported projects preserve unrelated customer controls.
- Tests follow strict RED/GREEN TDD and each task ends in an independently reviewable commit.

---

### Task 1: Add Traceable Implementation Contracts and Graph State

**Files:**
- Modify: `agent-app/packages/contracts/src/ui-style.ts`
- Modify: `agent-app/packages/contracts/src/ui-style.test.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/model-port.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/state.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/state.test.ts`

**Interfaces:**
- Consumes: existing `CustomerEffectBlueprint`, `UIImplementationSpec`, and `CapabilityReport` contracts.
- Produces: optional `sourceModuleId` on `UIComponentSpec`; `ModelPort.createUiImplementation()` / `reviseUiImplementation()`; graph fields `uiImplementation`, `uiImplementationHash`, and `capabilityReport`.

- [ ] **Step 1: Write failing contract tests** proving a component can carry a bounded `sourceModuleId`, graph state accepts a valid implementation spec/report, and invalid payloads are rejected.
- [ ] **Step 2: Run focused contract/state tests and observe RED** because the fields and model methods do not exist.
- [ ] **Step 3: Add the minimal Zod fields and TypeScript interfaces** without weakening strict style/property validation.
- [ ] **Step 4: Run focused tests and package typechecks to GREEN.**
- [ ] **Step 5: Commit** with `feat(orchestrator): add UI implementation planning contracts`.

### Task 2: Generate UIImplementationSpec Through the DeepSeek Model Port

**Files:**
- Modify: `agent-app/apps/api/src/conversations/deepseek-model.ts`
- Modify: `agent-app/apps/api/src/conversations/deepseek-model.test.ts`
- Modify: `agent-app/apps/api/src/conversations/model-port.ts`
- Modify: `agent-app/apps/api/src/conversations/fake-model.ts`

**Interfaces:**
- Consumes: confirmed `designPlan`, bounded editable entities, current revision summary, and the reviewed capability inventory.
- Produces: `createUiImplementation(context): Promise<UIImplementationSpec>` and `reviseUiImplementation(context): Promise<UIImplementationSpec>`.

- [ ] **Step 1: Write failing DeepSeek prompt/output tests** requiring all blueprint module IDs in component `sourceModuleId`, existing page semantic IDs, structured theme/style, bounded geometry, and no raw CSS/KF fields.
- [ ] **Step 2: Run the focused DeepSeek tests and observe RED** on the missing methods.
- [ ] **Step 3: Implement the model methods** using `response_format=json_object`, `UIImplementationSpecSchema`, the reviewed capability summary, and an 8000-token bound.
- [ ] **Step 4: Add a deterministic fake implementation spec** with at least two blueprint modules so graph tests do not depend on network calls.
- [ ] **Step 5: Run focused API model tests and typecheck to GREEN.**
- [ ] **Step 6: Commit** with `feat(api): generate structured UI implementation specs`.

### Task 3: Compile Blueprint Implementations in a Dedicated LangGraph Node

**Files:**
- Create: `agent-app/packages/agent-orchestrator/src/nodes/implementation-plan.ts`
- Create: `agent-app/packages/agent-orchestrator/src/nodes/implementation-plan.test.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/ports.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/solution-graph.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/solution-graph.test.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/index.ts`

**Interfaces:**
- Consumes: `ModelPort.createUiImplementation`, confirmed `designPlan`, current editable entities, and a new injected `UiImplementationCompilerPort`.
- Produces: compiled `ChangePlan`, capability report, implementation hash, coverage report/error code, and existing approval/build state fields.

- [ ] **Step 1: Write failing node tests** for complete module coverage, missing-module rejection, compiler failure, critical capability failure, one bounded repair retry, and successful deterministic plan persistence.
- [ ] **Step 2: Run focused orchestrator tests and observe RED** because the node/port/routing do not exist.
- [ ] **Step 3: Define `UiImplementationCompilerPort`** accepting spec plus page/control maps and returning the existing compiler result.
- [ ] **Step 4: Implement `implementation-plan`** to generate or revise the spec, validate every blueprint module is represented, compile it, retry once with bounded rejection reasons, and save the resulting ChangePlan through the existing repository.
- [ ] **Step 5: Route `CONFIRM_DESIGN` and preview feedback through `implementation-plan`; retain legacy direct planning only for non-blueprint compatibility paths.**
- [ ] **Step 6: Run node, graph, and state tests to GREEN.**
- [ ] **Step 7: Commit** with `feat(orchestrator): connect blueprint implementation planning`.

### Task 4: Wire the Existing KingClient Compiler and Preserve the Build Boundary

**Files:**
- Modify: `agent-app/apps/api/src/conversations/graph-ports.ts`
- Modify: `agent-app/apps/api/src/conversations/conversations.module.ts`
- Modify: `agent-app/apps/api/src/conversations/graph-ports.test.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/ports.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/solution-graph.integration.test.ts`

**Interfaces:**
- Consumes: `compileUiImplementation`, editable page/control entities, and `ControlCapabilityRegistry` from `@kf/domain-client`.
- Produces: production `UiImplementationCompilerPort` dependency used by the graph; no model-authored `ChangePlan` for confirmed blueprints.

- [ ] **Step 1: Write failing API/graph integration tests** showing a two-module blueprint produces multiple create/apply-style operations and reaches the existing approval/build boundary.
- [ ] **Step 2: Run focused integration tests and observe RED** because production graph dependencies do not expose the compiler.
- [ ] **Step 3: Build compiler context maps** from bounded editable entities using page names, control semantic IDs/GUIDs, and actual capability IDs.
- [ ] **Step 4: Call the existing `compileUiImplementation()` unchanged** and propagate its capability report; do not duplicate style or control compilation in API code.
- [ ] **Step 5: Run API, orchestrator, contracts, and domain-client focused suites to GREEN.**
- [ ] **Step 6: Commit** with `feat(api): wire KingClient implementation compiler into graph`.

### Task 5: Complete New/Modify Flow Regression and Real-Model Smoke Verification

**Files:**
- Modify: `agent-app/packages/agent-orchestrator/src/solution-graph.integration.test.ts`
- Modify: `agent-app/apps/api/src/api.integration.test.ts`
- Modify: `agent-app/apps/web/src/**` only if the existing state parser drops new non-user-facing fields.
- Create: `agent-app/docs/ui-implementation-mainline-acceptance.md`

**Interfaces:**
- Consumes: fully wired graph, current build worker, local preview endpoint, and DeepSeek configuration.
- Produces: regression evidence and operator acceptance steps for new project and incremental modification.

- [ ] **Step 1: Write failing end-to-end regression** reproducing the personal-resume failure: a seven-module confirmed blueprint cannot persist a one-operation Text1-only plan.
- [ ] **Step 2: Run the regression and observe RED against the pre-fix behavior.**
- [ ] **Step 3: Add only the minimal compatibility fixes** needed for new-project seed replacement and preview-feedback revision while preserving imported unrelated controls.
- [ ] **Step 4: Run full workspace tests, all project typechecks, lint baselines, and diff/credential checks.**
- [ ] **Step 5: Start API/web/worker with DeepSeek mode and perform one real-model smoke flow** confirming the persisted plan contains all blueprint modules and the built package contains multiple styled controls.
- [ ] **Step 6: Record exact acceptance evidence and known non-visual limitations** in `agent-app/docs/ui-implementation-mainline-acceptance.md`.
- [ ] **Step 7: Commit** with `test: verify UI implementation mainline end to end`.

## Final Verification

- [ ] `pnpm test` exits 0 with no failing files.
- [ ] All workspace TypeScript project typechecks exit 0.
- [ ] Changed-file lint is clean; any package baseline issue is explicitly compared with `main`.
- [ ] A confirmed multi-module blueprint persists an implementation spec and a ChangePlan containing operations for every module.
- [ ] The resulting KingClient package contains multiple controls and structured style output, not only the seed `Text1`.
- [ ] Preview feedback produces an incremental implementation revision without dropping unrelated components.
- [ ] No API keys, passwords, generated artifacts, or customer data are committed.
