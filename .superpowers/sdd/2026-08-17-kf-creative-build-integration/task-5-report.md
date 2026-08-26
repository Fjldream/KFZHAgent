# Task 5 Report — Creative Compiler Port and Direct Build Graph

## Outcome

DONE. A confirmed `creative-v2` blueprint now follows one graph mainline:

`solution-implementation-plan → compile-creative-solution → enqueue-build → END`

The new node does not enter approval or preview review. It persists the complete signed creative server envelope, grants only the transient `creative-solution` authorization, and the enqueue node consumes that authorization only after re-reading the exact persisted `plan:<workspace>:<planHash>` identity.

## Architecture and trust boundary

- Added one public graph boundary, `CreativeSolutionCompilerPort`. Its input is the exact confirmed v3 blueprint, capability candidate bundle, semantic implementation plan, tenant/workspace/base-revision identity, and exact-base editable entities read by the server rather than stored in checkpoint state.
- API composition owns the port implementation and executes the required sequence: workspace-scoped asset resolution → solution compiler → runtime correlation and uploaded-existing evidence verification → interaction compiler → creative v2 lowering → HMAC authority signing.
- `CREATIVE_BUILD_FACADE` is a Nest singleton created from the deployment HMAC key. Its issuer and asset-proof resolver remain closure-bound. `SERVER_PLAN_AUTHORITY` is taken from the same facade instance, so API signing and Worker verification share one authority identity.
- Neither controller, graph state, checkpoint, nor build-job input contains the issuer, asset proof handle, verified existing handle, trusted creative payload, or native materialization. The graph node receives the signed envelope locally and persists it; enqueue receives only IDs, hashes, project/domain identity, and idempotency key.
- Exact uploaded-existing matches require a tenant/workspace/revision-scoped source-package inspection and Task 2 opaque runtime-correlation proof. Missing, ambiguous, or mismatched evidence fails closed. Unmatched new semantic nodes retain deterministic workspace-derived correlation.
- Blocking solution/interaction/lowering diagnostics return bounded actionable details and never persist or enqueue. Interaction and capability warnings remain non-blocking. No aesthetic score is read or used as a gate. A contradictory `compiled` result with a failing capability report is rejected at the node boundary.
- Signed output is checked against workspace, revision, canonical plan hash, creative artifact hash, and native materialization hash before persistence. Malformed envelope data and repository lookup/write errors become bounded customer-safe error codes rather than thrown technical details.
- `enqueue-build` excludes `creative-v2` from both legacy approval and module authorization. Creative enqueue accepts only `creative-solution`, no resume action, exact plan ID, and a matching persisted plan hash. Missing compiler, asset/evidence dependency, signed output, or persisted plan never falls back to UI v1 or module-v1.
- Creative success/failure text uses “工程生成/工程包” and never “预览”. A successful creative job lands at `done`, while legacy/module success still enters the existing `preview-review` path. Preview implementation and routes were not changed.
- Revising a previously compiled creative blueprint clears its stale generated plan/job/artifact references before the next design confirmation, without changing legacy/module behavior.

## Files

- `agent-app/packages/agent-orchestrator/src/ports.ts`
- `agent-app/packages/agent-orchestrator/src/state.ts`
- `agent-app/packages/agent-orchestrator/src/state.test.ts`
- `agent-app/packages/agent-orchestrator/src/index.ts`
- `agent-app/packages/agent-orchestrator/src/solution-graph.ts`
- `agent-app/packages/agent-orchestrator/src/solution-graph.test.ts`
- `agent-app/packages/agent-orchestrator/src/nodes/compile-creative-solution.ts`
- `agent-app/packages/agent-orchestrator/src/nodes/compile-creative-solution.test.ts`
- `agent-app/packages/agent-orchestrator/src/nodes/enqueue-build.ts`
- `agent-app/packages/agent-orchestrator/src/nodes/enqueue-build.test.ts`
- `agent-app/packages/agent-orchestrator/src/nodes/load-context.ts`
- `agent-app/packages/agent-orchestrator/src/nodes/load-context.test.ts`
- `agent-app/packages/agent-orchestrator/src/nodes/design-plan.ts`
- `agent-app/apps/api/src/conversations/graph-ports.ts`
- `agent-app/apps/api/src/conversations/graph-ports.test.ts`
- `agent-app/apps/api/src/conversations/server-plan-authority.ts`
- `agent-app/apps/api/src/conversations/server-plan-authority.test.ts`
- `agent-app/apps/api/src/conversations/conversation.service.ts`
- `agent-app/apps/api/src/conversations/conversation.service.test.ts`
- `agent-app/apps/api/src/delivery/delivery.module.ts`
- `.superpowers/sdd/2026-08-17-kf-creative-build-integration/task-5-report.md`

No Task 6 workspace rollout or production entry was added. Legacy/module-v1 routing and preview code remain present. Existing user-owned `.DS_Store`, audit documents, special-node documents, old plan, and `reasonix.toml` were not staged.

## TDD evidence

Initial orchestrator RED:

```sh
PATH=/Users/fengjinlong/.nvm/versions/node/v22.14.0/bin:$PATH pnpm --filter @kf/agent-orchestrator exec vitest run src/nodes/compile-creative-solution.test.ts src/nodes/enqueue-build.test.ts --maxWorkers=1 --no-file-parallelism
```

The first run failed because `compile-creative-solution` did not exist and enqueue rejected the new authorization. Later focused REDs proved that creative could incorrectly reuse `legacy-plan-approval`, creative success entered `preview-review`, creative enqueue failures used legacy “构建” wording, a lowering `fail` report was signed as compiled, malformed envelopes escaped canonical validation, and repository lookup errors escaped the persistence boundary. Each regression was made GREEN before the corresponding implementation was retained.

Initial API composition RED:

```sh
/Users/fengjinlong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ../../node_modules/vitest/vitest.mjs run src/conversations/graph-ports.test.ts --maxWorkers=1 --no-file-parallelism
```

It first failed because no creative compiler was composed. The real-chain fixture then exposed bounded `LAYOUT_UNSATISFIABLE` diagnostics and a non-semver compiler version before reaching the final GREEN path. The completed test uses the real Task 3 facade, lowers, signs, JSON-roundtrips, and verifies the creative envelope.

Final focused suites are included in the full runs below. In particular:

- `compile-creative-solution.test.ts`: 6 passed.
- `enqueue-build.test.ts`: 7 passed.
- `load-context.test.ts`: 5 passed.
- `solution-graph.test.ts`: 38 passed, including MemorySaver compile/persist/single-enqueue, missing dependency, blocking diagnostic, no approval, no preview, and no duplicate enqueue cases.
- API `graph-ports.test.ts`: 12 passed, including real sign/verify, uploaded-existing evidence failure, and lowering failure before signing.

## Fresh verification

All final commands used the bundled arm64 Node path where needed because the NVM Node binary on this host is x86_64 and cannot load the installed API SWC binary.

Agent orchestrator full test:

```sh
cd agent-app
PATH=/Users/fengjinlong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm --filter @kf/agent-orchestrator test
```

Result: 17 files passed; 155 tests passed.

API full test:

```sh
cd agent-app/apps/api
/Users/fengjinlong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ../../node_modules/vitest/vitest.mjs run --passWithNoTests
```

Result: 13 files passed; 282 tests passed, including 57 API contract/security tests, 31 build-job integration tests, and 12 creative graph-port tests.

Affected upstream/downstream package full tests:

```sh
cd agent-app
PATH=/Users/fengjinlong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm --filter @kf/contracts --filter @kf/domain-client --filter @kf/build-jobs --parallel test
```

Results:

- contracts: 18 files; 480 passed.
- build-jobs: 4 files; 66 passed.
- domain-client: 62 files; 1,244 passed and 5 pre-existing optional tests skipped.

Touched-package typecheck:

```sh
cd agent-app
PATH=/Users/fengjinlong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm --filter @kf/agent-orchestrator --filter @kf/api --parallel typecheck
```

Result: both packages passed.

Touched-package lint:

```sh
cd agent-app
PATH=/Users/fengjinlong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm --filter @kf/agent-orchestrator --filter @kf/api --parallel lint
```

Result: both packages passed.

Repository checks:

```sh
git diff --check
rg -n "issuer|assetProofResolver|trustedCreativePayload|verifiedExisting" agent-app/packages/agent-orchestrator/src/state.ts agent-app/apps/api/src/conversations/*controller.ts agent-app/apps/api/src/conversations/conversation.service.ts
```

Result: `git diff --check` passed with no output; the capability search returned no controller, state, checkpoint, or conversation-service serialization site.

## Residual risk

No blocking concern. The direct production entry/rollout for new creative workspaces remains intentionally out of scope for Task 6. Native interaction and uploaded-existing forms not already backed by Task 2–4 evidence continue to fail closed. The five skipped domain-client tests are pre-existing optional golden-reference tests, not creative graph failures.

---

## Fix round 1/5 — review round 0 closure

This section supersedes the initial report's trust-boundary details where they describe a DI-exported full facade or a raw signed envelope crossing the graph node boundary. The graph now receives only a narrow verified persistence receipt; the issuer-bound compiler facade remains private to the API provider closure.

### Important findings

1. **Complete pre-persist verification.** API composition signs through its closure-local HMAC facade, JSON-roundtrips the complete envelope, then verifies it with that same facade authority and explicit expected revision, canonical plan, creative artifact, and native materialization hashes. Only that verified value enters `persistCreativePlan`. The public `CreativeSolutionCompilerPort` returns IDs, hashes, operation count, confirmation identity, project/domain identity, capability report, and warnings—never the envelope, issuer, asset proof, verified handle, artifact, or native materialization. Before enqueue, the repository JSON-roundtrips and HMAC-verifies the persisted envelope again, including tenant/workspace/revision/plan/request ownership.
2. **Exact full-index evidence.** Creative evidence selects the exact revision by tenant + workspace + revision and the exact uploaded package by projectKey + domainKind. It buffers at most 32 MiB compressed, limits expansion to 128 MiB / 2,500 files / 512-character paths / ratio 30, caps the singleton provider at two concurrent inspections, and bounds pages/controls/variables/scripts. One `inspection.index` supplies both editable entities and runtime-correlation proof; summary truncation is not used. Ambiguous names, duplicate exact packages, wrong project/workspace, budget overflow, and inspection warnings fail closed.
3. **Exactly-once confirmation.** Creative confirmation is accepted only from `design-review` when no confirmation was consumed, or from `idle` for the exact `重新生成工程` phrase with an allowlisted no-plan/no-job error. A canonical confirmation identity is checkpointed. `ConversationService.startTurn` holds a PostgreSQL session advisory lock across checkpoint re-read, user-message persistence, and the complete graph stream; concurrent confirmations therefore observe the winner's checkpoint. Failed unlock destroys the client and does not mask the graph error. Sequential and concurrent tests each prove one compile/persist/enqueue.
4. **Revision cleanup.** Every successful creative v3 revision, including explicit `REVISE_DESIGN`, clears candidates and hashes, semantic plan and hash/repair state, confirmation/project/domain receipt, ChangeRequest/ChangePlan/hash/summary/capability report, build authorization/job, and diff/preview artifact references. A follow-on capability failure test proves stale identities remain absent.
5. **Safe diagnostics.** Dependency messages never enter graph state or customer text. API composition maps only allowlisted reason codes and bounded schema-safe node/alternative fields; unexpected raw exceptions are logged server-side with a UUID correlation ID, while customer output receives only fixed engineering wording and the safe reference ID. Hostile path, bearer token, secret, control-character, and traversal-shaped inputs are covered.
6. **Post-enqueue durability.** Enqueue failure remains `ENQUEUE_FAILED`. Once enqueue returns a durable job ID, status/message side-effect failures return `buildJobId`, `stage=building`, consumed authorization, and bounded `BUILD_POST_ENQUEUE_SYNC_FAILED`; replay cannot enqueue again. Status-write and assistant-message-write failures are tested separately.
7. **Narrow DI.** `CREATIVE_BUILD_FACADE` and its environment factory were removed from exported DI and `ConversationService`. `ConversationsModule` constructs only `CreativeSolutionCompilerPort`; the facade, compiler issuer, and asset attester exist only in that provider's closure. Delivery exports only the verifier/authorities needed by existing consumers.

### Minor findings

- `persistCreativePlan` is one Prisma transaction binding tenant/workspace/revision/conversation-derived request/confirmation/plan hash/envelope. It rolls back the request when plan creation fails, accepts content reuse only for identical ownership and canonical envelope content, and gives another conversation a different persisted identity.
- Uploaded evidence is opened/unpacked/inspected once per compile with the bounded limits and provider-scoped concurrency cap above; no repeated 256 MiB materialization remains.

### TDD evidence

Focused REDs were observed before their minimal production fixes: forged persisted signatures and wrong request ownership were accepted; exact retry classification cleared the allowlisted error before its route edge; plain duplicate/concurrent confirmations could reach compilation twice; `REVISE_DESIGN` retained downstream identities; hostile messages escaped diagnostics; status/message failures after durable enqueue lost the successful job; the full facade remained injectable; split persistence could leave an orphan request; summary evidence omitted page 201/control 51; and advisory-unlock failure masked the original graph error. Each test then passed after its corresponding boundary change. The final regression set additionally covers JSON transport verification, atomic rollback/content ownership, wrong workspace/project, one-pass uploaded inspection, evidence ambiguity/budgets, explicit retry, request-owner verification, server correlation logging, and legacy/module compatibility.

Focused commands:

```sh
cd agent-app/packages/agent-orchestrator
/Users/fengjinlong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ../../node_modules/vitest/vitest.mjs run src/nodes/classify-intent.test.ts src/nodes/capability-retrieval.test.ts src/nodes/compile-creative-solution.test.ts src/nodes/enqueue-build.test.ts src/nodes/design-plan.test.ts src/solution-graph.test.ts src/solution-graph.integration.test.ts

cd agent-app/apps/api
LANGCHAIN_TRACING_V2=false LANGSMITH_TRACING=false /Users/fengjinlong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ../../node_modules/vitest/vitest.mjs run src/conversations/graph-ports.test.ts src/conversations/server-plan-authority.test.ts src/conversations/conversation.service.test.ts
```

Round-1 focused result before the final full gate: orchestrator 7 files / 97 tests and API 3 files / 30 tests passed. The `REVISE_DESIGN` follow-on failure evidence was then re-run separately and passed.

### Verification commands and results

All commands use the bundled arm64 Node because the host's `/usr/local` x86 Node cannot load this checkout's native dependencies.

```sh
cd agent-app/packages/agent-orchestrator
/Users/fengjinlong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ../../node_modules/vitest/vitest.mjs run
# 17 files, 162 tests passed

cd agent-app/apps/api
LANGCHAIN_TRACING_V2=false LANGSMITH_TRACING=false /Users/fengjinlong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ../../node_modules/vitest/vitest.mjs run
# 13 files, 291 tests passed

cd agent-app/packages/build-jobs
/Users/fengjinlong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ../../node_modules/vitest/vitest.mjs run
# 4 files, 66 tests passed

cd agent-app/packages/contracts
/Users/fengjinlong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ../../node_modules/vitest/vitest.mjs run
# 18 files, 480 tests passed

cd agent-app/packages/domain-client
/Users/fengjinlong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ../../node_modules/vitest/vitest.mjs run
# 62 files, 1,244 passed; 5 pre-existing optional tests skipped

cd agent-app/packages/agent-orchestrator
/Users/fengjinlong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ../../node_modules/typescript/bin/tsc --noEmit
/Users/fengjinlong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ../../node_modules/eslint/bin/eslint.js .

cd agent-app/apps/api
/Users/fengjinlong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ../../node_modules/typescript/bin/tsc --noEmit
/Users/fengjinlong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ../../node_modules/eslint/bin/eslint.js .

git diff --check
git diff --cached --check
```

The final gate is re-run after these report/ledger edits and recorded in the commit handoff. A deliberately overlapping orchestrator full run briefly caused two legacy PostgreSQL checkpoint tests to compete on their shared truncation tables; the clean serial rerun passed 17/17 files and 162/162 tests. This is test-database isolation noise, not a creative-route failure.

### Round-1 residual risk

No Task 5 blocker is known. PostgreSQL session advisory locks serialize all turns in one conversation for correctness; this intentionally trades same-conversation concurrency for exactly-once graph effects. Post-enqueue metadata/message repair is identified by `BUILD_POST_ENQUEUE_SYNC_FAILED` but no new outbox was introduced because Task 5 has no existing outbox boundary. Task 6 production rollout and preview implementation remain untouched.

---

## Fix round 2/5 — re-review round 1 closure

This round supersedes the Round-1 residual statement about session locks using the checkpoint pool.

### Critical — independent bounded turn lease and eager SSE cleanup

- `ConversationService` no longer checks a long-lived advisory-lock client out of `PG_POOL`. `ConversationsModule` creates a separate `PostgresConversationTurnLeaseManager` with its own small pool, bounded acquisition timeout, statement/query timeout, and non-blocking `pg_try_advisory_lock`.
- Same-conversation contention and lease-pool saturation fail fast with a bounded `409 CONVERSATION_TURN_IN_PROGRESS`; no raw PostgreSQL error reaches the client.
- The returned SSE stream has an explicit idempotent `dispose()`. It initiates graph cancellation and releases the lease even if the graph iterator is unentered or refuses to resolve `return()`.
- The controller registers `Response.close` before awaiting `startTurn`, disposes on pre-header abort, header/flush failure, write failure, normal completion, and client abort, and removes the listener in all cases.
- A real PostgreSQL test uses a one-client `PostgresSaver` pool alongside the independent two-client lease pool. It proves same-conversation fail-fast behavior, a four-request different-conversation burst with bounded rejection, continued checkpoint progress while leases are held, and actual controller/service abort followed by reacquisition of the same advisory lock.

### Important — durable ChangeRequest provenance and status synchronization

- `verifyPersistedCreativePlan` now reads the scoped ChangePlan and the exact ChangeRequest in one Prisma transaction. The request must match ID, tenant, workspace, and one of the only allowed pre-enqueue states (`OPEN` or replay-safe `APPROVED`) before the HMAC envelope can authorize enqueue.
- Missing, wrong-workspace, wrong-tenant, and `CLOSED` ChangeRequests all fail closed.
- `setChangeRequestStatus` now binds tenant + workspace + request ID and requires exactly one affected row. A zero-row update throws the fixed `CHANGE_REQUEST_STATUS_SYNC_FAILED` boundary error.
- The existing post-enqueue isolation converts that zero-row failure to `BUILD_POST_ENQUEUE_SYNC_FAILED` while preserving the returned job ID, `stage=building`, and consumed authorization; replay remains unable to enqueue again.

### Minor — creative compiler full-index evidence path

- The legacy workspace-query page-201/control-51 test remains unchanged.
- A new regression builds and uploads an exact-project KingClient package whose only relevant existing match is page 201 / control 51 (`detail` / `Text51`), invokes `createCreativeSolutionCompilerFromEnvironment(...).compile`, HMAC-verifies the persisted envelope, and proves both materialization entries use `uploaded-existing` correlation. The artifact storage package is opened exactly once and exactly one plan is persisted.

### Round-2 TDD evidence

Observed REDs before production changes:

- all four missing/misowned/disallowed ChangeRequest cases returned `true`;
- status synchronization omitted workspace and silently accepted `{ count: 0 }`;
- controller header/write/abort paths never invoked explicit disposal;
- the new turn-lease integration could not load because no independent port existed;
- an uncooperative graph iterator kept the lease past the 100 ms cleanup bound;
- the real creative compile path initially exposed an invalid native test identity, then passed after the fixture used the valid 51st native instance without changing production behavior.

Focused GREEN commands:

```sh
PATH=/Applications/Cursor.app/Contents/Resources/app/resources/helpers:$PATH \
  pnpm --dir agent-app/apps/api exec vitest run \
  src/conversations/conversation.service.test.ts \
  src/conversations/conversation.controller.test.ts \
  src/conversations/conversation-turn-lease.integration.test.ts \
  src/conversations/graph-ports.test.ts
# 4 files, 37 tests passed

PATH=/Applications/Cursor.app/Contents/Resources/app/resources/helpers:$PATH \
  pnpm --dir agent-app/packages/agent-orchestrator exec vitest run src/nodes/enqueue-build.test.ts
# 1 file, 9 tests passed
```

The initial attempt with the NVM x64 Node failed before collection because this arm64 checkout's SWC binding could not load. All evidence below uses the installed bundled arm64 Cursor Node (`v22.22.1`).

### Round-2 full verification

```sh
PATH=/Applications/Cursor.app/Contents/Resources/app/resources/helpers:$PATH \
  pnpm --dir agent-app/packages/agent-orchestrator exec vitest run
# 17 files, 162 tests passed

PATH=/Applications/Cursor.app/Contents/Resources/app/resources/helpers:$PATH \
  pnpm --dir agent-app/apps/api exec vitest run
# 15 files, 306 tests passed

PATH=/Applications/Cursor.app/Contents/Resources/app/resources/helpers:$PATH \
  pnpm --dir agent-app/packages/build-jobs exec vitest run
# 4 files, 66 tests passed

PATH=/Applications/Cursor.app/Contents/Resources/app/resources/helpers:$PATH \
  pnpm --dir agent-app/packages/domain-client exec vitest run
# 62 files, 1,244 tests passed; 5 pre-existing optional tests skipped

PATH=/Applications/Cursor.app/Contents/Resources/app/resources/helpers:$PATH \
  pnpm --dir agent-app/packages/contracts exec vitest run
# 18 files, 480 tests passed

PATH=/Applications/Cursor.app/Contents/Resources/app/resources/helpers:$PATH \
  pnpm --dir agent-app --filter @kf/agent-orchestrator typecheck
PATH=/Applications/Cursor.app/Contents/Resources/app/resources/helpers:$PATH \
  pnpm --dir agent-app --filter @kf/api typecheck
PATH=/Applications/Cursor.app/Contents/Resources/app/resources/helpers:$PATH \
  pnpm --dir agent-app --filter @kf/agent-orchestrator lint
PATH=/Applications/Cursor.app/Contents/Resources/app/resources/helpers:$PATH \
  pnpm --dir agent-app --filter @kf/api lint
# all passed

git diff --check
git diff --cached --check
```

API full tests printed the existing best-effort external trace-upload `429` warnings; all 306 assertions passed and the command exited zero.

### Round-2 residual risk

No Task 5 blocker is known. The independent lease pool is intentionally small and rejects saturation instead of queueing; deployments can tune its positive bounded size/timeouts through `KF_CONVERSATION_TURN_LEASE_*`. Task 6 rollout, new-workspace production entry, and preview implementation remain untouched.
