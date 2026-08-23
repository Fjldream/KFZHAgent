# KF Creative Build Mainline Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Implement each task with TDD, independent spec review, and independent code-quality review.

**Goal:** Turn one confirmed creative-v2 customer blueprint into one downloadable, importable KingFusion 3.6 project through the existing signed ChangePlan, Worker validation, packaging, artifact, and revision pipeline. No preview is added or required.

**Architecture:** Keep one production path only:

`confirmed CustomerSolutionBlueprint v3`
`→ CapabilityCandidateBundle`
`→ SolutionImplementationPlan`
`→ UIImplementationSpec v2`
`→ journey-proven InteractionCompilation`
`→ InternalChangePlan + signed trusted native materialization`
`→ existing Worker patch / validate / package`
`→ downloadable KF artifact`

The model owns customer-facing information architecture, page composition, interaction intent, and constrained semantic scripts. Deterministic compilers own KF controls, geometry, CSS serialization, GUIDs, runtime instance names, native actions, JavaScript rewriting, native JSON, and package output.

## Scope and decisions

- Target runtime is KingFusion 3.6.
- This phase proves the first complete generated project. Creative snapshot-based incremental revision and localized follow-up edits are deferred until this mainline works.
- The existing static preview code stays untouched. creative-v2 never waits for or advertises preview output.
- Front-end-only loops are allowed: page navigation, popup/overlay, filtering, selection/detail, tabs, local data mutation, validation, simulated submit, feedback, and bounded timers.
- CSS and necessary JavaScript are first-class mechanisms, but only deterministic style compilation and constrained, evidence-backed JavaScript may reach KF.
- Aesthetic scoring is not a build gate. Only invalid provenance, unsupported runtime capabilities, unsafe scripts/styles, impossible references/layout, or failed native validation/package checks block generation.
- No model-authored ChangePlan, GUID, KF instance name, selector, raw native JSON, compiled action, or compiled JavaScript is trusted.
- Existing legacy and module-v1 workflows remain compatible.
- Use TDD, preserve unrelated dirty files, and commit only task-owned files.

## Task 1: Make confirmed journeys authoritative interaction input

**Files:** contracts action/solution schemas and tests; interaction compiler and tests; DeepSeek solution-plan prompt/parser and tests.

**Deliverable:** Replace the permanent `JOURNEY_PROVENANCE_UNAVAILABLE` blocker with exact blueprint-bound journey coverage.

- Add bounded `journeyStepRefs: [{ journeyId, stepIndex }]` to native semantic actions; keep the legacy branch unchanged.
- Require the solution-planning prompt to map every confirmed journey step to at least one action without adding KF implementation data.
- Change `compileInteractions` input to the exact strict tuple `{ blueprint, plan, implementation }`.
- Recompute `canonicalServerHash(blueprint)` and require equality with `plan.blueprintHash`.
- Verify every reference exists, the trigger belongs to the referenced page/region, every step is covered, and the trigger closure ends in an observable front-end result.
- Reject ambiguous references, uncovered steps, and plan/blueprint mismatch while preserving all phase-4 safety checks.

## Task 2: Derive deterministic KF runtime correlation

**Files:** create `domain-client/src/implementation/runtime-correlation.ts` and tests; export from domain-client.

**Deliverable:** Produce stable compiler-owned runtime names and page GUIDs before interaction compilation.

- Consume workspace identity, UI v2, and verified existing page/control entities.
- Derive collision-free JavaScript-safe control instance names ending in a digit and stable across identical rebuilds.
- Reuse verified existing native names/GUIDs for uploaded/later patch paths; derive missing page GUIDs with the exact materializer algorithm.
- Attach complete `runtimeCorrelation`; reject aliases, missing entities, case-insensitive collisions, and forged mappings.
- Keep semantic IDs unchanged; runtime names are a separate compiler-owned mapping.

## Task 3: Define the signed creative artifact and lower UI v2

**Files:** create creative artifact/materialization contracts and tests; extend server-plan envelope; create `ui-implementation-v2-compiler.ts` and tests; export contracts/domain APIs.

**Deliverable:** Deterministically produce `InternalChangePlan`, capability report, verified assets, and trusted native materialization from interaction-complete UI v2.

- Define a bounded immutable creative build artifact containing exact blueprint, candidate bundle, semantic plan, final UI v2, compiler/evidence versions, and canonical hashes.
- Bind the creative artifact hash and native materialization hash into server-envelope signing bytes; legacy envelopes remain compatible.
- Create missing pages before controls; emit compiled width/height and the same page GUID convention used by the patcher/compiler.
- Create controls parent-before-child; translate geometry, native properties, content, structured style/CSS, data bindings, and approved assets.
- For existing entities, emit allowlisted deltas only and preserve unknown native fields.
- Use runtime instance names as native control names while retaining semantic IDs in signed provenance.
- Put V2 style fragments, compiled native actions, scripts, and event bindings in a strict server-only trusted materialization; public/model plans cannot inject it.
- Make plan/idempotency hashes sensitive to CSS, action, and script-only changes.

## Task 4: Materialize through the real KF patch path

**Files:** patcher, domain-pack inputs, control serializer, change-scope/client validator and focused tests.

**Deliverable:** Persist exactly the interaction-complete UI v2 output in the native KF project.

- Apply signed changes in stages: pages → parent controls → child controls → styles/data → native actions/scripts, rebuilding the entity index where required.
- Share one reviewed serializer for KF native actions, event `linkMng`, and `configureData`; do not create a second format.
- Resolve signed semantic/runtime correlations against created or existing native entities.
- Serialize native actions and marker-bearing scripts in declared event order.
- Preserve unrelated existing `linkMng`/`configureData`; replace only compiler-owned entries with matching provenance.
- Make created pages honor compiled dimensions and the same `k`-prefixed GUID rule as fresh project compilation.
- Validate marker hashes, owner/event bindings, referenced instances/pages, native-action targets, change scope, and absence of orphan compiled entries.
- Prove actual patch → validate → package → import round trips for navigation and Datagrid onClickRow → Datagrid SetData.

## Task 5: Add one creative compiler port and graph node

**Files:** orchestrator ports/state/graph/enqueue; new `compile-creative-solution` node and tests; API graph ports/composition and tests.

**Deliverable:** Route creative-v2 from semantic-plan readiness directly into the existing signed build queue.

- Add one `CreativeSolutionCompilerPort` that resolves approved assets/evidence and runs: solution compiler → runtime correlation → interaction compiler → v2 lowering.
- Input is the exact confirmed blueprint, candidate bundle, semantic plan, workspace/revision identity, and verified editable entities.
- Blocking diagnostics fail with bounded actionable details; warnings do not block and there is no aesthetic score gate.
- The node signs and persists InternalChangePlan plus the creative artifact/materialization, then grants only `creative-solution` build authorization.
- Route `solution-implementation-plan → compile-creative-solution → enqueue-build → END`.
- Do not re-enter approval or preview-review: blueprint confirmation authorizes this first generation.
- Creative messages say “工程生成/工程包”, never “预览”.
- Do not fall back to UI v1 if any creative dependency is absent.

## Task 6: Prove Worker delivery and activate the production entry

**Files:** server-plan authority, build executor/domain pack tests, workspace creation routing, delivery projection and tests.

**Deliverable:** The real Worker verifies, patches, validates, packages, stores, and creates a revision for a production-reachable creative build.

- Worker verifies plan hash, base revision, creative artifact hash, materialization hash, and tenant/workspace/project binding before patching.
- Success atomically binds artifact, revision, package hash, and creative artifact; failure creates no successful revision/artifact binding.
- Keep `EnqueueBuildInput` small: Worker loads the signed authoritative payload by ChangePlan ID.
- Make newly created target workspaces enter creative-v2 through an explicit, tested rollout decision; do not migrate existing rows silently.
- Creative delivery exposes downloadable project status and explicitly says automated KF runtime verification has not occurred; no preview artifact is required.
- Preserve legacy/module-v1 behavior.

## Task 7: Add three compositionally distinct golden projects

**Files:** three golden fixtures, one production-path integration suite, and a manual KF import record template.

**Deliverable:** Demonstrate that creativity is not reduced to a fixed pattern library.

- Portal: media-led hero/gallery/detail, narrative composition, no default dashboard grid.
- Industrial dashboard: compact KPIs, filters, primary Datagrid, selected detail, alarm overlay.
- Management admin: sidebar navigation, form/list master-detail, tabs, dialog submit, status feedback.
- Each uses a distinct information architecture, layout tree, density, visual role system, and interaction graph.
- Each includes realistic Chinese mock data, at least two pages, one overlay, two complete journeys, structured CSS, and at least one necessary script.
- Compile through the exact graph/Worker path, package, import, inspect, validate, and compare deterministic hashes.
- Record manual KF 3.6 fields as `尚未人工导入验证`; automated tests never claim runtime proof.

## Completion gate

Phase 5 is complete only when:

- creative-v2 has exactly one production route from confirmed blueprint to downloadable KF package;
- every blueprint journey step is explicitly mapped and proven against the same blueprint hash;
- CSS, native actions, and necessary constrained JavaScript exist in the packaged native project;
- the Worker consumes the signed payload, patches a real KF workspace, validates it, packages it, stores the artifact, and creates the revision;
- no creative build requires or advertises preview output;
- navigation and Datagrid onClickRow → Datagrid SetData pass actual package/import validation;
- all three golden projects are compositionally distinct rather than template-identical;
- legacy/module workflows remain green;
- full tests, typecheck, lint, and `git diff --check` pass.

## Deferred next phase

After first-generation delivery is proven, the next phase adds localized feedback/revision patches and server-derived semantic diffs. Those features must reuse this mainline rather than create another build path.
