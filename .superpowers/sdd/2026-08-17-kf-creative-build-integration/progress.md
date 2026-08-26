# SDD ledger — plan: docs/superpowers/plans/2026-08-17-kf-creative-build-integration.md

## Global constraints

- One production mainline: blueprint v3 → candidates → semantic plan → UI v2 → interactions → signed materialization → Worker → KF package.
- No preview dependency or aesthetic gate.
- Model output never directly supplies ChangePlan, GUIDs, runtime names, selectors, native JSON, compiled actions, or JavaScript.
- Preserve legacy/module-v1 compatibility and unrelated dirty files.
- User explicitly authorized direct single-mainline development in the current checkout.

## Pre-flight interface scan

| Producer | Consumer | Shared interface | Finding / ruling |
|---|---|---|---|
| Task 1 | Task 3/5/7 | journey-proven `compiledActions` and `compiledScripts` | Compatible. Task 3 consumes final interaction-complete UI v2 without redefining interactions. |
| Task 2 | Task 3/4/5 | exact `runtimeCorrelation` | Compatible. Uploaded native identities remain exact/case-preserved; derived pages use strict `k` GUID convention. |
| Task 3 | Task 4/6 | signed creative artifact and trusted native materialization | Materialization stays envelope-only; `InternalChangePlan` carries hashes only. Full deterministic artifact→materialization binding is load-bearing. |
| Task 4 | Task 6/7 | native patch/validate/package path | Compatible. Task 4 must consume Task 3 signed materialization rather than widen generic model-facing mutations. |
| Task 5 | Task 6/7 | compiler port and graph node | Compatible. One graph route only; no fallback to UI v1. |
| Task 6 | Task 7 | production Worker delivery | Compatible. Golden projects must traverse this exact path. |
| Task 1 | self | auxiliary actions vs full journey coverage | Ruling already implemented: journey-bound steps require coverage; unrelated auxiliary actions may remain journey-free. |
| Task 2 | self | opaque uploaded identities vs derived naming grammar | Ruling already implemented: preserve exact verified uploaded identities; apply strict compiler grammar only to derived identities. |
| Task 3 | self | public plan vs native materialization | Ruling: public plan contains only canonical hash references; complete native payload is server-signed and envelope-only. |
| Task 4 | self | preserve unknown native fields vs compiler-owned updates | Ruling: use allowlisted deltas and replace only provenance-owned native entries. |
| Task 5 | self | confirmation vs preview approval | Ruling: confirmed blueprint authorizes first build; no preview/reapproval node. |
| Task 6 | self | automated validation wording | Ruling: package validation is not represented as manual KF runtime proof. |
| Task 7 | self | creative diversity vs deterministic compiler | Ruling: model owns composition/IA; deterministic lowering preserves it without pattern-locking. |

## Progress

Task 1: complete
- Commits: c74f3a9, 0623667, 6334ec9
- Spec and quality review passed.

Task 2: complete
- Commits: 86a5ad6, d17e355, e9d8500, 9794151, a46fd92, 4d7740d, a77cd8e, ab9fa4f
- Final spec and quality review passed; contracts/domain tests, typecheck, lint, diff check green.

Task 3: in progress
- Implementer: /root/phase5_task2_runtime_correlation
- Architecture audit completed by /root/phase5_task2_runtime_correlation/task3_arch_audit.
- Ruling: signed materialization must be a complete deterministic projection of the signed implementation, not merely identity/interaction-equivalent.
- Initial commit: 8d1a875.
- Review round 0: spec Needs fixes; quality Ready No.
- Ruling: Task 3 ChangePlan entity IDs remain semantic and native page/control identities stay in signed materialization — Task 4 explicitly owns consuming that mapping in the real patcher; changing Task 3 plan IDs to GUID/instance names would violate the plan's semantic/runtime separation and lose provenance. Cost if wrong: Task 4 must revisit the plan operation contract instead of only the materializer.
- Ruling: the unchanged legacy patcher's inability to create controls on newly created pages or use runtime instance names is a Task 4 deliverable, not a Task 3 gap. Cost if wrong: the creative plan cannot be executed between Task 3 and Task 4, which is already true because no production graph route exists until Task 5.
- Confirmed fix scope from quality review: issuer boundary, authoritative interaction provenance, fail-closed Worker discrimination, full existing/assets/style projection, shared ordering, Proxy/alias rejection, public plan projection, and legacy golden bytes.
- Task 3: fix round 1/5 (8 addressed, 5 open — public issuer capability; self-reported existing/asset evidence; delta allowlist regression; issuer Proxy trap; duplicate asset facts; commits 8d1a875..a4375a5).
- Spec re-review: compliant/approved. Quality re-review: not ready.
- Task 3: fix round 2/5 (4 addressed, 1 open — independent capability-aware delta allowlist; commits a4375a5..bbae7f1).
- Task 3: fix round 3/5 (coverage addressed, 1 open — artifact can self-report/re-hash a widened allowlist; commits bbae7f1..e393438).
- Task 3: fix round 4/5 (canonical policy provenance addressed, 1 open — shared policy tables/returned sets runtime-mutable; commits e393438..49f6d6e).
- Task 3: fix round 5/5 (runtime immutability addressed, 0 open; commits 49f6d6e..c2669e9).
- Task 3: complete (commits ab9fa4f..c2669e9, spec compliant, quality review clean).

Task 4: in progress
- Base: c2669e9
- Initial commit: 8a88e82.
- Review round 0: spec Needs fixes; quality Ready No.
- Open: exact scope baseline/extra entities, authority-scoped verified handle, asset runtime path, existing style/data, declared interaction order/provenance, exact geometry/z-order, scale, flat-root path, post-import navigation.
- Task 4: fix round 1/5 (7 addressed, 2 open — same-event mixed-phase order; schema-max per-control page I/O/DFS; commits 8a88e82..68719f8).
- Spec re-review: compliant/approved. Quality re-review: not ready.
- Task 4: fix round 2/5 (2 addressed, 0 open; commits 68719f8..1ac0303).
- Task 4: complete (commits c2669e9..1ac0303, spec compliant, quality review clean).

Task 5: in progress
- Base: 1ac0303
- Initial commit: b24ec67.
- Review round 0: spec compliant/approved; quality Ready No.
- Open: pre-persist envelope verification, exact project-scoped existing evidence, duplicate/concurrent confirmation, revise-state clearing, safe diagnostics, post-enqueue failure semantics, narrow DI facade, atomic plan persistence, package inspection budget.
- Pending: fix round 1, scoped re-review.
- Task 5: fix round 1/5 (9 findings addressed: complete JSON-roundtrip verification and narrow persisted receipt; exact one-pass full-index project/workspace evidence with budgets; sequential/concurrent exactly-once confirmation; v3/REVISE_DESIGN cleanup; allowlisted correlated diagnostics; durable post-enqueue job semantics; closure-scoped facade DI; atomic ownership-bound persistence; bounded inspection concurrency; commit 26b96e1; pending scoped re-review).
- Task 5: fix round 2/5 (3 re-review findings addressed: dedicated bounded fail-fast PostgreSQL turn lease with real small-pool same/different-conversation and abort coverage; exact ChangeRequest tenant/workspace/status proof plus exact-one status synchronization preserving an already-enqueued job on failure; real creative compiler page-201/control-51 uploaded correlation with one package open; pending scoped re-review).
- Task 5: fix round 3/5 (1 re-review finding addressed: cancellation-settled lease release ordering, bounded socket cleanup with fail-closed same-thread quarantine for delayed/rejected/hanging iterator return, active-next close race, and real PostgreSQL delayed-abort no-overlap proof; pending scoped re-review).
- Task 5: fix round 4/5 (1 re-review finding addressed: gap-free durable conversation fence handoff, O(API-instance) owner-liveness session, cross-manager live/stale-owner CAS proof, bounded admission-client recovery beyond pool max, shutdown cleanup, and independent checkpoint pool; pending scoped re-review).
- Task 5: fix round 5/5 (1 final re-review finding addressed: removed owner-session-loss stale-fence recovery, forced owner disconnect remains conversation-scoped fail-closed, shutdown preserves or creates durable fences unless exact cancellation settles, unrelated conversations remain available; pending final scoped re-review).
- Ruling: owner-session loss is not proof that an old graph stopped. Unconfirmed durable fences remain fail-closed for that conversation without retaining PostgreSQL clients; no TTL or automatic stale-owner recovery is allowed.
- Task 5: complete (commits 1ac0303..6286c09; final scoped review Spec PASS, Quality PASS, Ready Yes; full API/orchestrator tests, typecheck, lint, Prisma validation, and diff checks green).

Task 6: complete
- Production Worker reloads the signed creative envelope by ChangePlan ID and fails closed on plan/base/artifact/materialization/tenant/workspace/project mismatches before native mutation.
- Successful creative completion atomically binds artifact, solution revision, package SHA, creative artifact hash, and native materialization hash; failures leave no successful revision/artifact binding.
- Explicit rollout: new target workspaces enter `creative-v2`; upload and existing legacy/module rows remain unchanged and compatible.
- Creative delivery exposes a downloadable token endpoint without preview dependency and states `尚未经过人工 KingFusion 3.6 运行态验证` (`not_performed`).
- Migration adds nullable creative delivery bindings only; no historical backfill. Task 5 `ConversationTurnFence` remains fail closed and unchanged.
- TDD RED/GREEN plus full contracts/domain-client/build-jobs/orchestrator/API/Worker/Web tests, typecheck, lint, Prisma migration, and diff gates passed. Report: `task-6-report.md`.
- Task 6: fix round 1/5 (review round 0 findings addressed: authoritative creative-v2 reverse Worker gate; workspace/job/ChangePlan/revision-based delivery discrimination rejecting wrong/partial/both-null hashes at issuance and consumption; real creative graph → signed plan → Worker → delivery → token HTTP GET → hash/import package test; workspace-mismatch fixture now reaches and diagnoses `SERVER_PLAN_CREATIVE_MISMATCH`; legacy/module compatibility retained; commit `d874af0`; full affected suites, typecheck, lint, Prisma validate/status, and diff check green; pending scoped re-review).
Task 7: complete
- Added three structurally distinct Portal, Industrial dashboard, and Management admin fixtures plus one production-path graph/Worker/delivery/download/import integration suite and a manual KF 3.6 import record template.
- Each golden has 2 pages, 1 overlay, at least 2 complete journeys, realistic Chinese mock data, structured CSS roles, and necessary constrained scripts. Structural assertions distinguish information architecture, layout tree, density, visual-role system, and interaction graph rather than colors alone.
- Production package assertions cover all native navigation, Industrial Datagrid `onClickRow → SetData`, Management Tabs `Tab-click → SetData`, submit validation/status, compiled CSS, constrained-script markers, signed overlay hosts, and two-build deterministic hashes.
- Ruling: privileged Datagrid authorization is derived only from the compiler-validated semantic plan, exact materialization binding, and actual emitted ChangePlan. Model-supplied authorization, table data without binding, forged/extra payloads, and unmatched authorization fail closed with the existing signed authority boundary; legacy and module-v1 remain compatible.
- Ruling: candidate ranking keeps full precision, while the server retrieval boundary quantizes only transported scores to 12 significant digits before JSON/JSONB persistence. Candidate hash/signing checks remain exact; repeating/exponent/boundary values, real PostgreSQL round trip, and tampering are covered.
- Ruling: nested page-absolute geometry is materialized parent-locally; only compiler-signed scroll content extents may exceed viewports. Tabs validation accepts only the exact registry-evidenced `Tab-click` tuple.
- Focused and full contracts/domain-client/build-jobs/orchestrator/API/Worker/Web tests, workspace typecheck/lint, Prisma validate/status, and final diff gates passed. Report: `task-7-report.md`.
- Manual KingFusion 3.6 import/runtime verification remains explicitly `尚未人工导入验证`; automated tests do not claim it.
- Task 7: fix round 1/5 (review round 0 findings addressed: all three fixtures now package exact compiler-authored `Visible` open/close overlay scripts with signed owner/target provenance and initially-hidden hosts; Management semantic Tabs compile to validated native `tabData`/`activeName` with package-inspected labeled content switching; Stage 4 uses explicit ownership projection so runtime parents and Datagrid/Tabs adapters cannot be overwritten by semantic fields; Portal uploads four distinct approved PNGs through AssetService → attest/sign → Worker materialize → package/import; creative asset collection recognizes only canonical image `src` properties and nested lookalikes remain unauthorized; asset page key canonicalization is compared by deep strict JSON value while tampering still fails; normalized structural fingerprints are invariant to raw ID/role renaming and remain distinct; focused/full tests, typecheck, lint, Prisma validation/status, and diff checks green; manual KF fields remain `尚未人工导入验证`; commit `a8dc508`; pending scoped re-review).
- Task 7: fix round 2/5 (re-review round 1 findings addressed: layout overlays now compile only exact compiler-authored `<correlated layout>.setVisible(true|false)` from checked-in `KMLayoutCompBase.prototype.setVisible` evidence, marker v3 and validator reject property assignment/arbitrary methods/expressions/aliases/tamper; Management owned tab records are re-derived from validated plan plus exact candidate regions and signed as `tabPane`, then materialized as actual native Tabs `tabData`/`activeName` plus direct `insiderObjects`/`region` panes with three distinct nested contents; compiler-owned pane relocation preserves exact trusted-layout correlation without accepting model native parent/region/geometry; missing/duplicate/cross-page/invalid-active/self-consistent forgery and package `region`/`activeName` tamper fail closed; direct/legacy label-only Tabs and module-v1 remain compatible; Portal stale navigation wording corrected; real production graph/Worker/delivery/download/import double-build is green; full affected tests, workspace typecheck/lint, Prisma validation/status, and diff checks green; manual KF fields remain `尚未人工导入验证`; commit `ed36037`; pending scoped re-review).
- Task 7: fix round 3/5 (re-review round 2's sole finding addressed: checked-in KF loader evidence proves top-level `tabData`/`activeName` are runtime-inert, so signed creative Tabs now use a specialized canonical `kf-compiled-tabs/v1` `configureData` containing only exact `this.tabs({tabData,activeName})`; payload is deterministically re-derived from compiler-validated signed materialization and exact runtime correlation, restricted to `uiModelType=47`, bounded unique tab definitions and an active member, and independently reserialized by validation; faithful checked-in-runtime harness proves post-patch and package/import `$vm` tabs, active selection, componentMap regions and selected pane; self-consistent missing-tab/forged-active/other-method plus region/property/expression/alias/unbounded tamper fail closed; inert raw fields are rejected; direct/legacy Tabs and module-v1 remain compatible; real production graph/Worker/delivery/download/import double-build is green; contracts 480, domain-client 1,280 (5 skipped), build-jobs 66, orchestrator 162, API 315, Worker 39, Web 128, workspace typecheck/lint, Prisma validate/status and diff checks green; manual KF fields remain `尚未人工导入验证`; commit `4331d3a`; pending scoped re-review).

Final review fix: complete
- Closed all 9 binding final-review findings in Critical → Important → Minor order with RED-before-GREEN coverage: durable exact-token turn fences; unified resume/message writer leases; no semantic-name native selector inference; authoritative creative download-only Web delivery; canonical revisioned design hash closure; deterministic crash-recoverable artifact adoption; bounded build leasing; public-only correlated diagnostics; and script-safe Tabs/marker handling.
- Preserved the one creative-v2 production mainline, signed/provenance boundaries, legacy/module-v1 compatibility, no-preview completion gate, and honest `not_performed` manual KF 3.6 status.
- Final verification: repository tests 142 files / 2,580 passed / 5 skipped; Web 130; real PostgreSQL conversation-backend-loss, resume/message races, forced fence INSERT failure, 1,000-workspace lease scale, Worker crash adoption, hostile diagnostics, and three-golden double-build tests green; root typecheck/lint green; Prisma schema valid and 10 migrations up to date; diff checks green.
- Non-blocking environment note: one earlier full run emitted an HTTP 429 monthly-trace-quota warning while still exiting 0; the immediate final full rerun was clean. Manual KingFusion 3.6 import/runtime verification remains explicitly not performed.
- Report: `final-fix-report.md`.
