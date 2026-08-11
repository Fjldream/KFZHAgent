# Task 10 Report — Module Planning Workflow

## Delivered

- Added the LangGraph `module-plan` node with strict initial planning and revision paths, SHA-256 canonical plan/implementation hashes, full-plan preservation, checkpoint hash binding, bounded deterministic errors, and a maximum of three model repair calls.
- The node uses the real `ModuleCompilationCoordinator`: it verifies the newly accepted blueprint artifact, re-verifies the previous compilation artifact for revisions, signs/checkpoints/verifies the current compilation artifact, and gives only that verified current artifact to the UI compiler.
- Missing blueprint coverage and other owned blocking gaps feed bounded deterministic rejection reasons into `reviseModulePlan`. One, two, or three repairs may succeed; a fourth blocked compile stops with `MODULE_PLAN_REPAIR_EXHAUSTED`. Missing customer assets ask the user instead of retrying or fabricating a path.
- Added persisted `moduleRepairAttempt: 0..3` and exact `buildAuthorization` origins: `confirmed-blueprint`, `preview-feedback`, and `legacy-plan-approval`.
- Acceptance-ready v2 blueprint confirmation and module-owned preview feedback route through ModulePlan and directly enqueue the preview build. Legacy v1 and pre-adoption UI checkpoints retain the approval compatibility path.
- The enqueue guard consumes only one exact routing-owned authorization and preserves the prior idempotency key. Direct/stale `BUILD` input remains rejected.
- Wired production API ports to one shared Module Registry, a tenant/workspace-scoped asset catalog, the real deterministic module compiler, the accepted-blueprint signer, and the existing UI compiler. With no Task 13 runtime evidence, the production stable catalog is intentionally empty and returns an actionable block without exposing beta modules.

## RED → GREEN

Initial RED command:

```text
pnpm --filter @kf/agent-orchestrator exec vitest run \
  src/nodes/module-plan.test.ts src/solution-graph.test.ts \
  src/nodes/enqueue-build.test.ts

FAIL src/nodes/module-plan.test.ts
Cannot find module './module-plan.js'
```

Final focused verification:

```text
agent-orchestrator module/route/state/enqueue: 4 files / 60 tests passed
API graph ports: 1 file / 5 tests passed
```

Final full verification with the bundled Node runtime:

```text
@kf/agent-orchestrator test: 14 files / 111 tests passed
@kf/api test: 9 files / 204 tests passed
@kf/agent-orchestrator typecheck + lint: passed
@kf/api typecheck + lint: passed
git diff --check: passed
```

## Compatibility note

Historical v2 checkpoints that predate server-confirmable `expectedKind`
mapping cannot produce an accepted module artifact. They remain on the old
implementation-plan approval path until reconfirmed/adopted. New
acceptance-ready v2 blueprints never show a technical approval. A direct call
to the module node with an unmapped blueprint fails explicitly with
`MODULE_BLUEPRINT_MAPPING_REQUIRED`; it never silently downgrades inside the
module workflow.

## Review fix round 1

- Workspace asset UUIDs remain API/database identities. A strict reversible
  `asset-<32 lowercase hex>` alias is now the only ID exposed to the model
  catalog; malformed aliases, raw UUIDs, and cross-tenant/workspace references
  are rejected without exposing storage keys. Existing upload/list/delete and
  dedupe semantics retain the internal `id`, with `modelAssetId` added for
  planning.
- Revision merge now rebuilds pages/modules in the verified previous order,
  replaces returned existing IDs in place, restores omissions unless an
  explicit remove exists, inserts explicit additions deterministically, and
  derives fresh exact operations from the final merged snapshot.
- Enqueue failures now checkpoint only `ENQUEUE_FAILED` and a fixed user-safe
  message; raw exception messages, stacks, control characters, and secrets do
  not cross the graph/SSE boundary.

Focused review verification: orchestrator 18/18, API assets/GraphPorts 37/37;
full orchestrator 112/112; API and orchestrator typechecks and changed-file
lint passed. The API full-suite process could not complete in this shared
worktree because unrelated pre-existing Vitest processes held the test
environment; all affected API suites passed in isolation.
