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
