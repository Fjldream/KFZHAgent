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
