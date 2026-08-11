# Task 8 Report — Module Delivery Quality and Revision Diff

## Delivered

- Added `evaluateModuleDelivery(...)`, which validates confirmed-blueprint coverage, emitted critical controls/traces/interactions, requested asset bindings, template residue, silent fallback, complex-module-to-text collapse, fixed-page overflow, and unrelated critical sibling overlap.
- The report is parsed through the existing strict `ModuleDeliveryReport` contract: unresolved blocking gaps produce `blocked`, only unresolved warnings produce `ready_with_warnings`, and clean output produces `ready`.
- Added descriptor-only input audits for quality evaluation and revision diffing; accessor, non-plain, sparse/custom-array, symbol, dangerous-key, and cyclic inputs reject before any getter runs.
- Added `diffModulePlans(...)` with deterministic direct change/unchanged lists, deterministic layout-affected intervals, byte-identical preservation checks for unaffected module and legacy implementation objects, and `UnexpectedModuleChangeError`.
- `compileModulePlan(...)` now carries optional confirmed-blueprint delivery reports/diffs, throws on unexpected untouched changes, and returns `blocked` whenever any unresolved blocking gap remains even if other controls/pages compiled. This prevents partial output from entering preview/export/build.
- Added regression proof that the known unresolved static-chart series gap blocks a mixed dashboard output.

## RED → GREEN evidence

Initial RED command (using the bundled Node runtime because the host Node has an ICU dylib failure):

```text
pnpm --filter @kf/domain-client exec vitest run src/modules/module-quality.test.ts src/modules/module-diff.test.ts
2 suites failed: cannot find ./module-quality.js and ./module-diff.js
```

An incremental descriptor-safety RED then failed because `diffModulePlans` accepted a getter-backed plan. The implementation now rejects it without invoking the getter.

GREEN verification:

```text
pnpm --filter @kf/domain-client exec vitest run \
  src/modules/module-quality.test.ts src/modules/module-diff.test.ts \
  src/modules/module-compiler.test.ts src/modules/definitions/dashboard-modules.test.ts
4 files, 40 tests passed

pnpm --filter @kf/domain-client typecheck
passed

pnpm --filter @kf/domain-client test
34 files, 523 tests passed

pnpm exec eslint [8 Task 8 changed files]
passed

git diff --check
passed
```

## Historical scope note (resolved)

The first Task 8 draft exposed a historical 32px-usable toolbar mismatch. That draft is no longer the current implementation: the admin shell header is now 64px with exactly 48px usable after padding, and the toolbar golden remains in its real `toolbar` region. Any earlier “32px current” wording is obsolete.

## Review fix round 1

- Added explicit optional `sourceBlueprintModuleIds`; evaluation requires it only when a confirmed blueprint is supplied, so legacy callers remain compatible and human-readable blueprint IDs need not equal stable module IDs.
- Evaluation now consumes Registry quality contracts (including the exact `data.table` minimum/roles/capabilities), validates exact `(pageId,moduleId,outputId)` traces, maps blueprint interaction intent, and uses resolved asset records.
- Removed broad `Hello`/`default`/SVG heuristics. Delivery detects only explicit known seed placeholder tokens recursively through descriptor-audited data.
- Preserved no-`sourceModuleId` prior components in compilation and passed editable-identity scope through the compiler input.
- Corrected the admin-shell toolbar height to 64px, leaving 48px usable, and restored the real toolbar golden placement. Main content shifts from y=124 to y=140 while the shell remains 1440×900.
- Gap caps now retain one deterministic highest-priority diagnostic for every module before filling remaining detail capacity.

## Review fix round 2

- `diffModulePlans` now keeps `changedModules` and `unchangedModules` disjoint, marks resolved-asset identity/status changes only on referring modules, and protects layout-affected modules field-by-field: geometry may move, while identifiers, content, structure, capabilities, properties, styles, and assets must remain unchanged.
- Compiler definition identity is captured only with compiler-owned implementation objects. A real registered compiler identity change is expected work; the same plan plus the same identity with changed output remains `UnexpectedModuleChangeError`.
- All 15 exact V1 definitions now expose a frozen quality contract. The contract requires at least two controls, a critical control/role, concrete role and capability requirements; `data.table` retains its stricter native-grid contract.
- Legacy entities are retained by explicit editable identity, never by text. This historical round briefly allowed trusted generated-seed removal; Round 4 removes that authorization entirely and preserves every legacy customer control.
- Added regressions for compiler identity, change-set exclusivity, resolved-to-pending assets, 250-plan-module/12-blueprint cap coverage, V1 quality contract freezing, and unconditional customer `Text1`/`Hello Alice` preservation.

## Review fix round 2 verification

```text
pnpm --filter @kf/domain-client test
34 files, 530 tests passed

pnpm --filter @kf/contracts test
9 files, 67 tests passed

pnpm --filter @kf/domain-client typecheck
passed

pnpm --filter @kf/contracts typecheck
passed

pnpm exec eslint [Task 8 changed module/test files]
passed

git diff --check
passed
```

## Review fix round 3

- Replaced non-persistable compiler-definition WeakMap identity with the strict JSON `kf-module-compilation-metadata/v1` contract. Every registered definition now has validated/frozen stable compiler and layout fingerprints; a fingerprint change is expected revision work, while same-fingerprint output drift remains unexpected.
- Compilation outcomes now carry a JSON-roundtrippable metadata snapshot containing module fingerprints, referenced asset identities/statuses, and accepted blueprint mappings. Existing module revisions require a valid prior snapshot; first imports without a prior ModulePlan remain supported.
- Replaced the public blueprint-mapping record with accepted metadata mappings. Customer-effect blueprints can now carry controlled optional expected kind/category expectations; without those facts a new mapping is not derived from model-authored Plan declarations.
- This historical round replaced bare IDs with bound seed metadata. Round 4 supersedes it: there is no public mint helper and module compilation never deletes legacy controls, even when IDs or content resemble a seed.
- Asset revisions use persisted opaque asset identity/status metadata. A prior asset snapshot is required for an existing revision with referenced assets, and resolved-to-pending keeps its module in the expected affected set while delivery still reports required/optional gaps correctly.
- The toolbar scope note is resolved: the admin shell now provides 48px usable toolbar height, and the real toolbar golden remains in the toolbar region.

## Review fix round 3 verification

```text
pnpm --filter @kf/domain-client test
34 files, 530 tests passed

pnpm --filter @kf/contracts test
10 files, 69 tests passed

pnpm --filter @kf/domain-client typecheck
passed

pnpm --filter @kf/contracts typecheck
passed

pnpm exec eslint [Task 8 changed files]
passed

git diff --check
passed
```

## Review fix round 3 completion addendum

- Replaced the uniform V1 quality fallback with exact kind contracts for all 15 V1 definitions, including native datagrid/tabs/tag requirements, module-specific minimum structure, critical roles, and native navigation action kinds where the module exposes navigation.
- Added an initial contract-driven 15-kind deletion matrix. Round 4 replaces its synthetic conforming controls with every real definition/variant compiler output before applying deletions and replacements.
- Blueprint interaction requirements now bind deterministic `(type, actionKind, target, outputId)` entries into persisted metadata. Delivery re-checks the actual generated output action and rejects missing or unrelated bindings. Legacy text-only blueprint interactions remain non-machine-verifiable and cannot authorize arbitrary plan interactions.
- Previous asset snapshots now fail closed when a revision references an asset but lacks its persisted identity/status entry. Added explicit coverage alongside resolved-to-pending affected-module behavior.
- The historical Round 3 seed check bound page/entity/hash and preserved changed customer content. Round 5 removes seed provenance from the V1 compiler boundary entirely, so all legacy controls are preserved and no seed evidence is consumed or claimed.

## Review fix round 4 — persisted server authority and real variant gates

- Reused the deployment-only `KF_SERVER_PLAN_HMAC_KEY_BASE64` authority with two fixed, domain-separated HMAC discriminators for accepted blueprints and module compilations. Cross-type replay, wrong key, tampering, and project/revision/blueprint/plan/implementation binding mismatches fail closed. Signed JSON never contains the key.
- Added strict signed `kf-accepted-blueprint-artifact/v1`. The API confirmation boundary builds it from the accepted customer blueprint plus the server Registry: kind/category and machine interaction action kinds are Registry facts, not model authority. The real `CONFIRM_DESIGN` implementation node now calls the API confirmation port and persists the artifact in checkpoint state for module-ready blueprints.
- Added strict signed `kf-module-compilation-artifact/v1`, binding project, revision, accepted-blueprint hash, current plan hash, implementation hash, metadata hash, metadata, and exact sorted source module IDs. Runtime brands are created only by successful server verification and cannot be reconstructed from caller JSON.
- `compileModulePlan` now requires a verified accepted artifact and accepts an optional verified previous compilation artifact only for a revision. It produces an unsigned current candidate. `ModuleCompilationCoordinator` signs the candidate, simulates the checkpoint JSON round trip, verifies the persisted current artifact back to a runtime brand, and only then invokes the UI compiler. A first compilation does not require a current artifact.
- Removed the non-persistable `TRUSTED_MODULE_SOURCE_IDS` WeakMap and all `trustedModuleImplementation` call sites. The UI compiler verifies the exact canonical implementation hash and exact sorted source set after JSON round trip. The legacy pre-module API path erases unverified model source claims before this boundary; it does not grant module authority.
- Removed every seed-mint, seed-verification, seed-artifact, metadata-claim, and implicit seed-deletion path from V1. All no-`sourceModuleId` controls are preserved byte-for-byte. Seed provenance is deferred to the Task 10 project-creation service; raw IDs and caller hashes are never authorization.
- Added checkpoint fields for accepted artifact, ModulePlan/hash, current compilation artifact, delivery report, and bounded repair attempt, plus concrete module compiler/confirmation ports and the real coordinator service required by the later Task 10 node.
- Every one of the 15 V1 kinds now declares an explicit contract for every registered variant. The table-driven quality test starts with each real `definition.compile` legal output, then deletes or changes every required slot/role/capability/critical/asset/action item and requires `blocked`. It covers form input and submit, navigation/toolbar action buttons, hero portrait asset, status tag, and detail edit input. The three chart variants remain truthfully server-blocked with `kf36-static-chart-series-mapping-unverified` rather than receiving fabricated output.

## Review fix round 4 verification

Using the bundled Node runtime:

```text
pnpm --filter @kf/contracts test
10 files, 72 tests passed

pnpm --filter @kf/build-jobs test
4 files, 48 tests passed

pnpm --filter @kf/domain-client test
35 files, 536 tests passed

pnpm --filter @kf/agent-orchestrator test
12 files, 92 tests passed

pnpm --filter @kf/api test
9 files, 176 tests passed

pnpm typecheck
11 workspace projects passed

pnpm --filter @kf/contracts --filter @kf/build-jobs \
  --filter @kf/domain-client --filter @kf/agent-orchestrator \
  --filter @kf/api lint
all Task 8 affected packages passed

git diff --check
passed
```

The repository-wide lint command also reaches the untouched `@kf/preview-renderer` package, whose existing `renderer.ts` has three `no-unnecessary-type-assertion` errors. Task 8 does not modify that package; all five affected package lint suites pass.

## Review fix round 5 — exact interaction authority and instance manifests

- Accepted interactions are now an exact signed set per mapped blueprint module. Registry-derived `(type, actionKind, target)` requirements are unique and canonically ordered; legacy text-only interactions without machine requirements stop at confirmation with `ACCEPTED_BLUEPRINT_INTERACTIONS_NEED_RECONFIRM`.
- ModulePlan interactions must equal that signed set. Empty requirements authorize no interaction. Missing, extra, duplicate, unregistered, unrelated, or reused-output bindings block delivery. Every requirement binds one unique native output; legal multi-action navigation, toolbar, and hero-style output sequences retain deterministic order and distinct actions.
- Every V1 definition now derives an exact required-output manifest from its schema-parsed instance content and variant, independently of compiler output. Dynamic KPI cards, card grids, timelines, navigation items, form fields, status rows, detail edit inputs, toolbar actions, and alert rows are all enumerated. Compilation checks the exact critical output set; delivery independently rechecks it.
- The real-definition matrix covers all 15 kinds and every registered variant. For every legal compile output it removes each actual critical control, each asset-bound output, and each native action output together with its trace and requires delivery to block. This includes the previously missed KPI title.
- Revision identity now separates compiler and layout fingerprints. A compiler fingerprint change is full changed work; a layout fingerprint change joins `layoutAffectedModules`, where only geometry may differ. Content, properties, style, capability, action, ordering, parent structure, or any other field drift is unexpected. The behavior is verified after JSON metadata round trip.
- Removed `ProjectCreationSeedSignInput`, signed seed artifacts, all public seed authority methods/exports, seed metadata, and compiler residue logic. V1 preserves every legacy control and makes no seed claim; provenance remains deferred to the Task 10 creation service.

## Review fix round 5 verification

Using the bundled arm64 Node runtime:

```text
pnpm --filter @kf/contracts test
10 files, 74 tests passed

pnpm --filter @kf/build-jobs test
4 files, 48 tests passed

pnpm --filter @kf/domain-client test
35 files, 543 tests passed

pnpm --filter @kf/agent-orchestrator test
12 files, 93 tests passed

pnpm --filter @kf/api test
9 files, 177 tests passed

pnpm typecheck
11 workspace projects passed

pnpm --filter @kf/contracts --filter @kf/build-jobs \
  --filter @kf/domain-client --filter @kf/agent-orchestrator \
  --filter @kf/api lint
all Task 8 affected packages passed
```
