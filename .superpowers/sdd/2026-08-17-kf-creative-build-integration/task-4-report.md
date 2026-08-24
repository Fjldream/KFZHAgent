# Task 4 Report — Real KF 3.6 Creative Materialization

## Outcome

DONE. A creative `ChangePlan` now reaches the real KingFusion client patch, validation, package, and import paths only when accompanied by the complete HMAC-verified Task 3 envelope/materialization. Legacy and module-v1 plans keep their existing paths.

## Architecture and trust boundary

- `ServerPlanAuthority.verify` records a deep-frozen creative payload in a private `WeakMap`; the exported `VerifiedCreativeMaterialization` type is opaque and `readVerifiedCreativeMaterialization` rejects forged or raw objects.
- `resolveStoredPlan` accepts creative work only after the actual HMAC verifier produced that opaque handle. `BuildExecutor` forwards the same handle to `DomainPack.patch` and `DomainPack.validate`; there is no creative-to-legacy fallback.
- `ChangePlan` operation `entityId` values remain semantic. Native page GUIDs, control instance names, existing native GUIDs, parent relationships, styles/data, interactions, and asset facts are read only from the verified materialization.
- Creative patching is staged as pages, parent-before-child controls, exact existing-entity deltas, styles/data, actions/scripts, and assets. Inspection/index state is rebuilt after page creation and before later native correlation work.
- New pages use the signed `k` GUID plus signed width/height. New controls use the compiler-owned `instanceName`; their GUID is derived from `workspaceId + instanceName`, never from the semantic ID.
- `serializeReviewedNativeInteractions` is the one internal reviewed serializer for native actions, event `linkMng`, and `configureData`. It validates schemas, hashes, canonical marker encoding, owner/event/link/phase provenance, duplicates, missing references, multi-bindings, and orphan compiler entries. It preserves unrelated native entries and legacy script prefixes, removes only validated compiler-owned tails/actions, and keeps distinct event groups in authoritative declaration order.
- The evidence-backed native action implemented here is `navigate-page -> { action: "navigatePage", pageId: <signed page GUID> }`. Other native action kinds remain fail-closed until a real KF 3.6 serialization form is evidenced.
- Existing pages retain unknown fields except signed dimensions. Existing controls retain unknown fields and receive only Task 3 exact allowlisted deltas plus authoritative reviewed interaction replacement.
- Creative styles are recomputed with the KF 3.6 runtime profile and compared with the signed compiled style before persistence. Data records are written from signed materialization facts. Approved assets are resolved tenant/workspace-exactly by the Worker, byte/SHA/size checked, published to the signed path, and image bindings use signed semantic-to-runtime correlation.
- Creative validation checks exact page/control correlation, dimensions, hierarchy, native fields and deltas, recomputed managed style data, data records, interaction idempotence/provenance, general instance/page references and native targets, asset bytes, page-manager integrity, unrelated files/entities, and package round trip.

## Files

- `agent-app/packages/build-jobs/src/server-plan-authority.ts`
- `agent-app/packages/build-jobs/src/job-executor.ts`
- `agent-app/packages/build-jobs/src/job-executor.test.ts`
- `agent-app/packages/build-jobs/src/index.ts`
- `agent-app/packages/contracts/src/domain.ts`
- `agent-app/packages/domain-client/src/domain-pack/king-client-domain-pack.ts`
- `agent-app/packages/domain-client/src/patch/client-patcher.ts`
- `agent-app/packages/domain-client/src/patch/creative-native-materializer.test.ts`
- `agent-app/packages/domain-client/src/compile/control-compiler.ts`
- `agent-app/packages/domain-client/src/compile/control-compiler.test.ts`
- `agent-app/packages/domain-client/src/assets/materialize-client-assets.ts`
- `agent-app/packages/domain-client/src/validate/client-validator.ts`
- `.superpowers/sdd/2026-08-17-kf-creative-build-integration/task-4-report.md`

No public `ChangePlan` raw mutation allowlist was widened. Preview, graph integration, and production rollout were not changed.

## TDD evidence

Initial RED command (package-local Vitest under Node 22):

```sh
/Users/fengjinlong/.nvm/versions/node/v22.14.0/bin/node ../../node_modules/vitest/vitest.mjs run src/patch/creative-native-materializer.test.ts --maxWorkers=1 --no-file-parallelism --testTimeout=60000
```

The first RED failed because `resolveStoredPlan` was not exported. After exposing the trust-boundary entry, the functional RED failed with `PATCH_CONFLICT: INVALID_CREATE_CONTROL_ENVELOPE ... pageId ... undefined`, demonstrating that the generic path incorrectly tried to use semantic identities as native page/control identities; the unverified creative path also did not yet reach the required fail-closed boundary.

A later ordering RED used:

```sh
/Users/fengjinlong/.nvm/versions/node/v22.14.0/bin/node ../../node_modules/vitest/vitest.mjs run src/compile/control-compiler.test.ts --maxWorkers=1 --no-file-parallelism --testTimeout=60000
```

It produced `expected ['Alpha', 'Zed'] to deeply equal ['Zed', 'Alpha']`, proving distinct event groups were being dictionary-sorted instead of serialized in authoritative declaration order. The minimal fix iterates the insertion-ordered event map.

The real-path integration compiles Task 3 output, HMAC signs it, JSON-roundtrips it, verifies it, calls the actual King client DomainPack patch/validate/package APIs, imports the package, and inspects the result. It proves:

- semantic control IDs are not persisted as new control names;
- signed page GUIDs and dimensions and parent nesting are exact;
- `navigate-page` targets the signed detail-page GUID;
- Datagrid data is materialized;
- Datagrid `onClickRow` is linkId `200024` and contains the compiled instance-qualified `SetData` marker-bearing script after package/import.

## Verification

All commands used `/Users/fengjinlong/.nvm/versions/node/v22.14.0/bin/node` because the fallback Homebrew Node executable on this machine cannot load its ICU dynamic library.

Focused final command:

```sh
cd agent-app/packages/domain-client
/Users/fengjinlong/.nvm/versions/node/v22.14.0/bin/node ../../node_modules/vitest/vitest.mjs run src/compile/control-compiler.test.ts src/patch/creative-native-materializer.test.ts src/validate/client-validator.test.ts --maxWorkers=1 --no-file-parallelism --testTimeout=60000
```

Result: 3 files passed; 102 tests passed, 3 skipped.

Affected package full tests:

```sh
cd agent-app/packages/contracts
/Users/fengjinlong/.nvm/versions/node/v22.14.0/bin/node ../../node_modules/vitest/vitest.mjs run --passWithNoTests --maxWorkers=1 --no-file-parallelism --testTimeout=60000

cd ../build-jobs
/Users/fengjinlong/.nvm/versions/node/v22.14.0/bin/node ../../node_modules/vitest/vitest.mjs run --passWithNoTests --maxWorkers=1 --no-file-parallelism --testTimeout=60000

cd ../domain-client
/Users/fengjinlong/.nvm/versions/node/v22.14.0/bin/node ../../node_modules/vitest/vitest.mjs run --passWithNoTests --maxWorkers=1 --no-file-parallelism --testTimeout=60000
```

Results:

- contracts: 18 files, 480 passed.
- build-jobs: 4 files, 66 passed.
- domain-client: 62 files, 1225 passed, 5 skipped.

Affected package typechecks and lints:

```sh
/Users/fengjinlong/.nvm/versions/node/v22.14.0/bin/node ../../node_modules/typescript/bin/tsc --noEmit
/Users/fengjinlong/.nvm/versions/node/v22.14.0/bin/node ../../node_modules/eslint/bin/eslint.js .
```

Both commands passed from each of `agent-app/packages/contracts`, `agent-app/packages/build-jobs`, and `agent-app/packages/domain-client` (six successful commands total).

Repository whitespace check:

```sh
git diff --check
```

Result: passed with no output.

## Residual risk

No blocking concern. Native action kinds other than the Task 2-evidenced `navigate-page` representation intentionally fail closed; supporting them later requires equivalent KF 3.6 evidence and reviewed serializer tests. The five skipped domain-client tests are pre-existing optional golden-reference tests and are not creative materialization failures.

---

## Review Round 1 fixes (2026-08-24)

### Outcome and architecture changes

All Round 0 Critical, Important, and Minor findings were addressed without changing the public/model `ChangePlan` raw mutation allowlist or entering Task 5/6 graph/rollout work.

- Creative change scope now builds an exact expected workspace by applying the same HMAC-verified plan/materialization to the immutable base with the same Worker-resolved assets, then compares the complete relative-path file set and every byte. This rejects added/deleted controls, unmarked actions/scripts, legacy handler/configureData drift, page-manager drift, extra/missing files, and signed-page drift. Creative materialization issues are computed once and reused by business-rules and change-scope checks.
- HMAC verification now attests the verified envelope to the concrete authority identity. `resolveStoredPlan` mints a separate frozen, propertyless materialization capability bound to that authority plus the expected plan hash/revision. Raw envelopes, custom-verifier replay, and cross-authority attestation replay cannot become Worker capabilities.
- The native patcher still stages pages, parent-before-child controls, exact uploaded-existing deltas, styles/data, then actions/scripts. It now pre-indexes pages, controls, implementation controls, styles, actions, scripts, and event bindings; performs one post-structure inspection; and caches each touched page document for one read/write across z-order, style/data, and interaction stages.
- KF sibling-array order is the reviewed native z-order representation. Compiler-created sibling slots are sorted by signed `zIndex` then signed order while unrelated slots remain in place. Signed geometry and z-order are both explicitly validated.
- Uploaded-existing controls now receive signed native style fields, managed CSS tails, and data records as well as exact Task 3 deltas. Unknown native fields, unrelated legacy CSS, `linkMng`, and `configureData` remain preserved. The reviewed CSS merge accepts only exact selectors enumerated by the KF 3.6 runtime profile, including the evidenced part selector `#domId .el-button`.
- The shared reviewed interaction serializer emits action-only, script-only, combined, and multi-action bindings in declared order. It no longer globally prepends actions, rejects action references when the actions table is absent, and checks an old action marker against its enclosing owner/event/link/action identity before replacement.
- Image validation derives native `src` from the verified asset binding basename and separately verifies target bytes, size, SHA-256, and signed path. The integration test exercises actual Worker asset resolution through native patch, validate, package, import, and post-import inspection for an uploaded-existing image.
- Flat-root creative scope uses relative paths without `./`, and the native navigation target is asserted again after package/import.

### Round 1 files

- `agent-app/packages/build-jobs/src/index.ts`
- `agent-app/packages/build-jobs/src/job-executor.ts`
- `agent-app/packages/build-jobs/src/job-executor.test.ts`
- `agent-app/packages/build-jobs/src/server-plan-authority.ts`
- `agent-app/packages/domain-client/src/compile/control-compiler.ts`
- `agent-app/packages/domain-client/src/compile/control-compiler.test.ts`
- `agent-app/packages/domain-client/src/domain-pack/king-client-domain-pack.ts`
- `agent-app/packages/domain-client/src/patch/client-patcher.ts`
- `agent-app/packages/domain-client/src/patch/creative-native-materializer.test.ts`
- `agent-app/packages/domain-client/src/style/style-data-merge.ts`
- `agent-app/packages/domain-client/src/style/style-data-merge.test.ts`
- `agent-app/packages/domain-client/src/validate/client-validator.ts`
- `.superpowers/sdd/2026-08-17-kf-creative-build-integration/task-4-report.md`

### Round 1 TDD evidence

All commands ran from `agent-app` with `PATH=/Users/fengjinlong/.nvm/versions/node/v22.14.0/bin:$PATH`.

- Exact-scope RED: the 7-test creative suite had 5 failures because the property-bearing envelope handle and extra control, deleted legacy handler, configureData drift, and signed page-manager drift were accepted. After the exact-expected and capability changes, all 7 passed.
- Interaction RED: `pnpm --filter @kf/domain-client exec vitest run src/compile/control-compiler.test.ts` produced 5 failures covering mixed declared order, missing actions table, and enclosing event/link/action marker drift. The focused compiler/creative run then passed 47 tests with 3 skipped.
- Z-order RED: the native sibling array was `[Button…, Image…]` while the signed order required `[Image…, Button…]`. The geometry/z-order tamper test later RED-failed with only the generic exact-candidate byte mismatch, then GREEN-passed with explicit geometry and z-order diagnostics.
- Uploaded style/data RED: uploaded Datagrid data remained the legacy record instead of the signed record. The CSS merge RED also rejected the Task 3-evidenced `#domId .el-button` selector. Both focused suites passed after the reviewed runtime-profile selector and source-neutral style/data application changes.
- Asset RED sequence: the public Worker resolver was initially unavailable, then native materialization rejected the signed full target path, and finally validation failed because it compared uploaded `/src` to the full path instead of the KF basename. The Worker→patch→validate→package→import asset test now passes and detects post-patch asset-byte tampering.
- Scale structural RED: source still contained `materialization.controls.find`, per-style `inspectClientProject(candidate)`, and per-control interaction array filters. The structural regression now passes after indexed/cached staging.
- Flat-root focused command: `pnpm --filter @kf/domain-client exec vitest run src/patch/creative-native-materializer.test.ts -t 'flat-root native workspace'` — 1 passed, 11 skipped.

Final focused commands:

```sh
pnpm --filter @kf/domain-client exec vitest run src/compile/control-compiler.test.ts src/patch/creative-native-materializer.test.ts src/style/style-data-merge.test.ts src/validate/client-validator.test.ts
pnpm --filter @kf/build-jobs exec vitest run src/server-plan-authority.test.ts src/job-executor.test.ts
```

Results: domain-client 4 files passed, 132 passed and 3 skipped; build-jobs 2 files passed, 55 passed.

Full package commands:

```sh
pnpm --filter @kf/contracts test
pnpm --filter @kf/build-jobs test
pnpm --filter @kf/domain-client test
```

Results: contracts 18 files/480 tests passed; build-jobs 4 files/66 tests passed; domain-client 62 files/1241 passed and 5 skipped.

Typecheck/lint commands:

```sh
pnpm --filter @kf/contracts typecheck
pnpm --filter @kf/build-jobs typecheck
pnpm --filter @kf/domain-client typecheck
pnpm --filter @kf/contracts lint
pnpm --filter @kf/build-jobs lint
pnpm --filter @kf/domain-client lint
git diff --check
```

Final result: all three typechecks and lints passed; `git diff --check` passed with no output.

### Residual risk after Round 1

No blocking concern. Exact creative validation intentionally performs a second materialization into a temporary expected workspace, trading validation cost for a byte-exact trust boundary. Native action kinds beyond the Task 2-evidenced `navigate-page` representation remain fail-closed pending equivalent KF 3.6 evidence. The five skipped domain-client tests remain pre-existing optional golden-reference tests.
