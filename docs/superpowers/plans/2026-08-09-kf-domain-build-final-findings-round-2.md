# Domain Build Final Findings Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four second-review correctness gaps without changing legacy single-project behavior or the conversations baseline.

**Architecture:** Keep `projectKey` as the stable identity, but centralize its normalization in contracts and validate the tagged solution revision envelope before selecting or replacing a project. Preserve the historical default KingClient idempotency key, reject stale build completion inside the existing transaction, and turn project/domain conflicts into normal failed-build diagnostics.

**Tech Stack:** TypeScript, Zod, Prisma/PostgreSQL, Vitest, LangGraph.

## Global Constraints

- Use strict RED → GREEN → REFACTOR for every production behavior change.
- Keep the legacy single-project KingClient flow compatible.
- Do not modify conversations production code or tests.
- Use the bundled Node PATH with `login:false` for every Node/pnpm command.
- Do not add a Prisma migration unless the persisted schema changes; these fixes are validation and transaction semantics only.

---

### Task 1: Legacy idempotency key compatibility

**Files:**
- Modify: `agent-app/packages/agent-orchestrator/src/nodes/enqueue-build.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/solution-graph.test.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/solution-graph.integration.test.ts`

**Interfaces:**
- Consumes: `SolutionGraphDeps.defaultDomainKind`, `SolutionGraphDeps.defaultProjectKey`, `BuildJobPort.enqueue`.
- Produces: the historical key `${conversationId}:${changePlanId}:${planHash}` for `kingclient`/`kingclient`, and `${conversationId}:${projectKey}:${changePlanId}:${planHash}` for every non-default project.

- [ ] **Step 1: Write the failing tests**

Add a unit assertion that the default enqueue uses the literal legacy key and a non-default project uses the scoped key. Add a Postgres-backed replay test that inserts a matching `BuildJob` with the old key before approval resume, then asserts the resumed graph returns that job id, `BuildJob` count remains one, and `SolutionRevision` count remains one.

- [ ] **Step 2: Verify RED**

Run the orchestrator unit and integration files separately. Expected failure: current default node emits `${conversationId}:kingclient:${changePlanId}:${planHash}`, so the literal key assertion fails and replay creates a second job.

- [ ] **Step 3: Implement the minimal key selector**

In `enqueue-build.ts`, derive:

```ts
const isLegacyDefault = domainKind === "kingclient" && projectKey === "kingclient";
const idempotencyKey = isLegacyDefault
  ? `${state.conversationId}:${state.changePlanId}:${state.planHash}`
  : `${state.conversationId}:${projectKey}:${state.changePlanId}:${state.planHash}`;
```

- [ ] **Step 4: Verify GREEN and commit**

Run both focused orchestrator tests and commit only Task 1 files plus this plan.

---

### Task 2: Stale base completion invalidation

**Files:**
- Modify: `agent-app/packages/build-jobs/src/build-job.service.ts`
- Modify: `agent-app/apps/api/src/build-jobs/build-job.integration.test.ts`

**Interfaces:**
- Consumes: `BuildJob.baseRevisionId`, `SolutionWorkspace.currentRevisionId`, existing `ValidationReport` and terminal `FAILED` job semantics.
- Produces: a failed job with diagnostic metadata when the workspace no longer points at the job base, with no new revision/project/artifact database rows and no workspace pointer advance.

- [ ] **Step 1: Write the failing integration test**

Queue two different-project jobs against the same tagged-envelope base. Execute the first successfully, then execute the second. Assert the second is `FAILED`, its validation report contains a stale-base error, the workspace still points at the first result, revision count increased only once, and the first project package remains current.

- [ ] **Step 2: Verify RED**

Run `apps/api/src/build-jobs/build-job.integration.test.ts`. Expected failure: the second job currently succeeds and advances `currentRevisionId` to a revision copied from the stale base.

- [ ] **Step 3: Implement transactional invalidation**

Within the successful-completion transaction, load the tenant/workspace row and compare `currentRevisionId` with `job.baseRevisionId` before creating any success rows. On mismatch, create a failure validation report with an explicit stale-base diagnostic, mark the job `FAILED`, clear its lease, and return without creating or advancing a revision.

- [ ] **Step 4: Verify GREEN and commit**

Run the API build integration file and build-jobs package tests, then commit Task 2 files.

---

### Task 3: Canonical project keys and strict tagged envelopes

**Files:**
- Modify: `agent-app/packages/contracts/src/solution.ts`
- Modify: `agent-app/packages/contracts/src/solution.test.ts`
- Modify: `agent-app/packages/build-jobs/src/revision-state.ts`
- Create: `agent-app/packages/build-jobs/src/revision-state.test.ts`
- Modify: `agent-app/packages/build-jobs/src/build-job.service.ts`
- Modify: `agent-app/packages/build-jobs/src/job-executor.ts`
- Modify: `agent-app/apps/api/src/build-jobs/build-job.integration.test.ts`

**Interfaces:**
- Produces: exported `projectKeySchema` and `solutionRevisionStateSchema`; canonical trimmed keys of 1–128 characters matching a domain-neutral safe identifier format; global uniqueness after legacy-id derivation.
- Consumes: Prisma JSON revision state and the existing `kf-solution-revision-state/v1` discriminator.

- [ ] **Step 1: Write failing contract tests**

Add literal counterexamples for duplicate explicit keys across domains, duplicate derived keys after trimming, unsafe explicit/derived key formats, and normalization of valid explicit/derived keys. Expected failure: duplicates and derived unsafe keys currently parse.

- [ ] **Step 2: Verify contract RED**

Run `packages/contracts/src/solution.test.ts` and confirm each failure is the missing normalization/uniqueness behavior.

- [ ] **Step 3: Implement canonical contract validation**

Export one `projectKeySchema`, apply it after selecting `projectKey ?? id`, then add a `solutionIRSchema.superRefine` pass that reports any repeated canonical key regardless of domain.

- [ ] **Step 4: Verify contract GREEN**

Run the focused contracts test and the full contracts package.

- [ ] **Step 5: Write failing revision-state and executor tests**

Test `projects` as a non-array, malformed project items, duplicate keys across domains, and a key/domain mismatch through both resolve and replace paths. Add API integration cases proving create and modify jobs fail on malformed tagged envelopes and a same-key/different-domain base package fails explicitly without a new revision.

- [ ] **Step 6: Verify revision RED**

Run the new build-jobs unit file and API build integration file. Expected failures: malformed tags fall back to legacy state and project/domain mismatches compile or replace silently.

- [ ] **Step 7: Implement discriminator-first parsing and conflict checks**

Only treat state as legacy when `schema !== "kf-solution-revision-state/v1"`. For a matching tag, parse the complete envelope, require unique canonical keys and valid project shapes, select by key first, and then require the stored domain to match. Query `DomainProjectRevision` by project key first in the executor and reject a domain mismatch; repeat the defensive check in successful transaction persistence.

- [ ] **Step 8: Verify GREEN and commit**

Run contracts, revision-state, API build integration, build-jobs and worker focused tests; commit Task 3 files.

---

### Task 4: Final verification and report

**Files:**
- Modify: `.superpowers/sdd/2026-08-09-kf-domain-build-foundation/final-findings-fix-report.md` (ignored progress artifact, intentionally not staged)

- [ ] **Step 1: Run required verification**

Run contracts, orchestrator, build-jobs/API focused, worker, full workspace typecheck/lint, `prisma validate`, `prisma migrate status`, `git diff --check`, and a conversations path diff boundary check.

- [ ] **Step 2: Update the report**

Append the four root causes, RED/GREEN evidence, legacy key compatibility decision, stale-base failure semantics, canonical key/envelope rules, commands/results, and final commit hashes.

- [ ] **Step 3: Confirm handoff state**

Verify tracked worktree cleanliness, retain the worktree/branch for the parent task, and report any unchanged known baseline failure separately from this fix set.
