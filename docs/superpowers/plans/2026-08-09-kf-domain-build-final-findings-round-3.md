# KF Domain Build Final Findings Round 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make build completion, rollback, and source revision commits race-safe; fence expired workers; clean unadopted blobs; and preserve project-key and ZIP download compatibility.

**Architecture:** PostgreSQL row locks serialize each mutation at its durable authority. Build completion always locks `BuildJob` then `SolutionWorkspace`, validates the existing `attemptCount` lease fence and database-time expiry, and only then checks the base pointer and writes; rollback and source commit lock only `SolutionWorkspace` before reading or writing revisions. Executor cleanup is compensating and conservative: delete only an artifact proven not to have been adopted, and never replace the original result or error.

**Tech Stack:** TypeScript, Prisma 6, PostgreSQL, NestJS, Vitest, pnpm.

## Global Constraints

- Strict RED → GREEN TDD for every behavior change.
- Keep legacy single-project behavior and legacy default-project idempotency keys.
- Do not modify the unrelated conversations baseline.
- Run commands with the bundled Node PATH and `login:false`.
- PostgreSQL lock order is always `BuildJob` then `SolutionWorkspace`; a workspace-only writer never acquires a BuildJob lock.

---

### Task 1: Atomic completion and lease fencing

**Files:**
- Modify: `packages/build-jobs/src/types.ts`
- Modify: `packages/build-jobs/src/build-job.service.ts`
- Modify: `packages/build-jobs/src/job-executor.ts`
- Modify: `apps/api/src/build-jobs/build-job.integration.test.ts`

**Interfaces:**
- Consumes: Prisma transaction raw SQL and existing `BuildJob.attemptCount`.
- Produces: `CompleteBuildInput.leaseAttempt: number`; fenced completion and validation transition.

- [ ] Add integration tests proving an expired/reclaimed attempt cannot commit and two barrier-released completions create at most one revision and one artifact.
- [ ] Run the focused tests and record the expected duplicate/fencing RED failures.
- [ ] Lock the job and workspace rows in fixed order, validate owner/attempt/database-time lease expiry after locking, and pass the leased attempt through executor completion.
- [ ] Condition `markValidating` on owner, attempt, active status, and unexpired lease.
- [ ] Run the focused tests to GREEN.

### Task 2: Serialize rollback and source commits

**Files:**
- Modify: `apps/api/src/revisions/revision.service.ts`
- Modify: `apps/api/src/workspaces/workspace.service.ts`
- Modify: `apps/api/src/build-jobs/build-job.integration.test.ts`

**Interfaces:**
- Consumes: the same workspace row used by build completion.
- Produces: workspace-locked append-only revision writers.

- [ ] Add a real concurrent completion-versus-rollback test behind a caller barrier and assert a valid serialized history with no overwritten pointer.
- [ ] Add a concurrent source-commit test proving a single source revision wins.
- [ ] Run tests and record the duplicate revision/pointer RED failures.
- [ ] Move rollback/source authoritative reads and validations inside transactions after `SELECT ... FOR UPDATE` on the tenant-scoped workspace.
- [ ] Run tests to GREEN.

### Task 3: Clean unadopted executor blobs

**Files:**
- Modify: `packages/build-jobs/src/job-executor.ts`
- Modify: `apps/worker/src/job-runner.integration.test.ts`

**Interfaces:**
- Consumes: `ArtifactStorage.delete` and persisted `Artifact(buildJobId, storageKey)`.
- Produces: best-effort cleanup that never masks the completion result or original exception.

- [ ] Add tracking-storage tests for FAILED completion cleanup, delete failure, and completion/open failure.
- [ ] Run focused tests and record leftover storage objects as RED.
- [ ] Track the stored artifact, verify adoption after a terminal success, delete only a proven loser, and preserve `BuildWorkerCrash` semantics.
- [ ] Run focused tests to GREEN.

### Task 4: Canonical enqueue identity

**Files:**
- Modify: `packages/agent-orchestrator/src/nodes/enqueue-build.ts`
- Modify: `packages/agent-orchestrator/src/solution-graph.test.ts`
- Modify: `packages/agent-orchestrator/src/solution-graph.integration.test.ts`

**Interfaces:**
- Consumes: exported `projectKeySchema`.
- Produces: one canonical key used for legacy detection, idempotency-key construction, and enqueue payload.

- [ ] Add replay tests for `calc`/` calc ` equivalence and ` kingclient ` legacy-key reuse.
- [ ] Run focused tests and record duplicate/scoped-key RED failures.
- [ ] Parse the selected key before branching or constructing any payload; trim the domain kind used for its default.
- [ ] Run focused tests to GREEN.

### Task 5: Source ZIP extension compatibility

**Files:**
- Modify: `apps/api/src/workspaces/workspace.service.ts`
- Modify: `apps/api/src/artifacts/download-token.service.ts`
- Modify: `apps/api/src/api.integration.test.ts`
- Create: `prisma/migrations/20260809210000_source_zip_extension/migration.sql`

**Interfaces:**
- Consumes: source-package kind plus `application/zip` media type.
- Produces: `.zip` for new source rows and read-time correction of legacy `.gz` source ZIP rows.

- [ ] Add token, filename, and `Content-Disposition` tests for new and legacy source ZIP records.
- [ ] Run focused tests and record `.gz` metadata RED failures.
- [ ] Write `.zip` for new source revisions, correct only legacy source ZIP metadata during resolution, and add a narrow data migration.
- [ ] Run API tests and Prisma validation/migration status to GREEN.

### Task 6: Unique production worker owner

**Files:**
- Create: `apps/worker/src/worker-instance-id.ts`
- Create: `apps/worker/src/worker-instance-id.test.ts`
- Modify: `apps/worker/src/run.ts`

**Interfaces:**
- Produces: `createWorkerInstanceId(hostname?: string, pid?: number, nonce?: string): string`.

- [ ] Add a test proving two startup instances with the same host and PID still have different owners.
- [ ] Run the test and record the missing helper RED failure.
- [ ] Build the owner from hostname, PID, and a startup UUID; create it once before `runForever`.
- [ ] Run worker tests to GREEN.

### Task 7: Verification, report, and commits

**Files:**
- Modify: `.superpowers/sdd/2026-08-09-kf-domain-build-foundation/final-findings-fix-report.md`

**Interfaces:**
- Produces: evidence-backed RED/GREEN ledger and final verification record.

- [ ] Run build/API/orchestrator/worker/artifact tests, typecheck, lint, Prisma validate, and migration status.
- [ ] Confirm `git diff --check` and inspect the complete diff for unrelated conversation changes.
- [ ] Record lock order, fencing, cleanup, canonicalization, ZIP compatibility, commands, and results in the report.
- [ ] Commit in a small number of coherent commits and report their hashes.
