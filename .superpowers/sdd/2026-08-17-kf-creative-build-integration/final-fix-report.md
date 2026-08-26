# Phase 5 final review fix report

## Result

`DONE_WITH_CONCERNS`

All nine binding findings in `final-code-review.md` are fixed on the single creative-v2 mainline. Critical and Important findings were not deferred. Legacy/module-v1 compatibility, strict signing/provenance, download-only creative delivery, and the honest manual KingFusion 3.6 status were preserved.

Base: `4331d3a261e27eff45270790f205c9528eb5aa3c`
Fix commit: the commit containing this report.

## Binding findings closed

1. **Durable conversation turn fence**
   - Every acquired turn now creates the exact `{conversationId, ownerId, leaseId}` row while holding the conversation advisory lock and before graph entry.
   - Confirmed normal completion deletes only that exact token before releasing the lock. Quarantine releases/destroys the session and retains the row.
   - A real checked-out PostgreSQL backend termination leaves the durable row blocking a second API manager while unrelated conversations remain available.
   - INSERT/query failures destroy or release the admission client, and shutdown completes within the bounded test deadline without a `pool.end()` hang.

2. **Resume uses the same writer boundary**
   - Approve, revise, and cancel resume paths acquire the same turn lease/key namespace as ordinary messages.
   - Pending-interrupt and plan-hash checks, graph draining, final checkpoint read, and audit effects remain inside that lease.
   - Cross-instance PostgreSQL races prove one writer, one graph/effect set, and rejection of a competing ordinary message.

3. **No model-text existing-runtime selector**
   - Removed semantic ID/native name equality as a path to `uploaded-existing`.
   - Current first-generation correlations are compiler/workspace-derived only; inspected native identifiers are collision evidence, not selectors.
   - Guessed `Page1`/`Button1` cannot select native entities. A legal semantic `Page1` collision fails explicitly with `CREATIVE_RUNTIME_IDENTITY_COLLISION` instead of silently reusing or producing missing-evidence behavior.

4. **Creative Web delivery is authoritative and download-only**
   - The server-owned `generationWorkflow` discriminator and strict `projectDelivery` projection drive creative UI state.
   - Creative workspaces never assign or consume a preview artifact, never request a preview URL, and never mount `PreviewBar`.
   - The real view exposes the gated package download and displays exact `not_performed` / `尚未经过人工 KingFusion 3.6 运行态验证` text.
   - Malformed refreshed delivery data fails closed and clears an older downloadable snapshot.

5. **Canonical revisioned design hash closure**
   - Exported one `hashDesignPlan(plan, revision)` implementation and shared exact-version validation.
   - Confirmation routing, capability retrieval, semantic planning, and final compile/persist authorization recompute the exact blueprint+revision hash.
   - Missing/stale revision, stale hash, and old-blueprint/new-hash cases stop before retrieval, asset/model access, compiler persistence, or enqueue authorization.

6. **Crash-recoverable artifact publication**
   - Worker output uses a deterministic server-issued artifact key bound to tenant and build job.
   - Local storage publishes create-exclusively and adopts an identical retry by size/SHA-256; different bytes cannot overwrite the first object.
   - The real crash/retry integration captures the first stored key and proves the same blob and digest are adopted by the eventual Artifact row.

7. **Bounded build leasing**
   - `leaseNext()` considers at most 16 oldest eligible workspaces and uses non-blocking transaction advisory locks plus `FOR UPDATE SKIP LOCKED` rechecks.
   - The one-live-job-per-workspace invariant remains intact.
   - The 1,000-workspace, two-tenant, four-worker PostgreSQL test claims unrelated workspaces for both tenants with at most 100 observed queries and under the 3-second bound.

8. **Customer-safe diagnostics**
   - Unexpected Worker errors persist only `BUILD_EXECUTION_FAILED`, a fixed bounded safe message, and a UUID correlation ID.
   - Raw errors, stack/cause, paths, and secrets go only to the private operator logger.
   - The API reprojects hostile/legacy error rows to the same public shape; hostile Bearer/path/password/stack/cause content is absent from the customer response.

9. **Tabs/script serialization closure**
   - Shared script-safe JSON escapes U+2028 and U+2029.
   - Compiler-owned markers are recognized only at the source start or exact `\n;\n// kf-compiled-event/v1 ` boundary.
   - Both separators round-trip and a literal marker token in a valid Tabs label no longer triggers compiler-tail rejection.

## TDD evidence

Each binding item was reproduced before its production change. The RED cases demonstrated active-backend lease reopening, resume/message overlap, name-based native selection, creative preview exposure, stale design-version consumption, a different/orphaned retry blob, 4,020 lease queries at scale, raw exception disclosure, and Tabs separator/token rejection. The corresponding focused tests were then made GREEN with the minimum production boundary changes described above.

## Final verification

- Final repository test command: **142 files passed; 2,580 passed, 5 skipped; exit 0**.
- The same run includes contracts, domain-client, artifact storage, build-jobs, orchestrator, API, Worker, and Web.
- Final Web suite: **11 files, 130 tests passed**.
- Conversation fence PostgreSQL integration: **11 tests passed**, including actual backend termination and forced INSERT failure.
- Creative graph-port suite: **29 tests passed**.
- Root typecheck: **11/11 runnable workspace projects passed**.
- Root lint: **11/11 runnable workspace projects passed**.
- Prisma schema validation: valid.
- Prisma migration status: **10 migrations; database up to date**.
- PostgreSQL golden: one integration test passed; three compositionally distinct projects were each built twice through Graph → Worker → delivery/download → import with deterministic package assertions.
- `git diff --check`: passed before staging; the staged diff is checked again at commit time.

## Concerns / explicit non-claims

- Manual KingFusion 3.6 import/runtime verification remains **not performed**. The product continues to display `not_performed` and `尚未经过人工 KingFusion 3.6 运行态验证`; automated package/import checks are not represented as human runtime proof.
- One earlier full verification run emitted non-fatal telemetry-exporter HTTP 429 warnings because the external monthly trace quota was exhausted. That run still passed, and the immediate final full rerun passed without the warning; no product assertion depended on telemetry export.
