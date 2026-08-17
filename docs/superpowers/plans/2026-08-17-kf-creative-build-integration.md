# KF Creative Build Integration and Revision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect creative semantic planning, visual/interaction compilation, ChangePlan, Worker packaging, revision persistence, static validation, and downloadable KF artifacts without adding a new customer preview flow.

**Architecture:** Compile `SolutionImplementationPlan` plus its candidate bundle into interaction-complete `UIImplementationSpec v2`, derive a deterministic ChangePlan from stable IDs, and persist a hash-bound creative snapshot beside the server-signed plan. The existing Worker applies, validates, packages, and commits the KF project, then links the immutable snapshot to the resulting revision. Server-derived snapshot diffs support localized future modifications.

**Tech Stack:** TypeScript ES modules, Zod 4, Vitest, Prisma/PostgreSQL, LangGraph, NestJS, existing build jobs/artifact storage/domain pack, pnpm workspace.

## Global Constraints

- Target runtime is KingFusion 3.6.
- The `creative-v2` workflow generates a downloadable KF project; it does not expose or depend on the existing static HTML preview.
- Existing preview code remains in the repository and existing legacy/module workflows remain compatible.
- The build pipeline remains `UIImplementationSpec v2 → InternalChangePlan → signed envelope → Worker patch/validate/package → artifact/revision`.
- The model never authors ChangePlan operations, GUIDs, selectors, KF instance names, native JSON, or revision diffs.
- Stable semantic IDs drive deterministic GUID reuse and server-computed `unchanged`, `added`, `updated`, `moved`, and `removed` sets.
- A revision persists the blueprint, candidate bundle and knowledge version, semantic plan, compiler/template versions, theme/style/script output, final package hash, and bounded user feedback summary.
- Only deterministic engineering failures block delivery; aesthetic judgment is not a gate.
- At most one localized model correction is allowed for a failing semantic subtree; no whole-page visual retry loop is introduced.
- Static validation covers structure, references, layout, CSS, scripts, resources, unknown-field preservation, and package round-trip.
- Runtime-unverified controls, advanced CSS patch sensitivity, and statically checked custom JS are delivery warnings, not automatic blockers.
- The fixed delivery statement is: `工程已通过结构、资源、布局、样式、脚本和引用静态校验；尚未经过系统自动 KF 运行态验证，请导入 KF 后确认视觉与交互效果。`
- Use TDD for every task and commit only the files named by that task.

---

## File Structure

### Contracts and persistence

- Create `agent-app/packages/contracts/src/creative-snapshot.ts`: immutable snapshot, diff, and delivery contracts.
- Create `agent-app/packages/contracts/src/creative-snapshot.test.ts`: hash binding and limits.
- Modify `agent-app/packages/contracts/src/server-plan-envelope.ts`: optional signed creative snapshot hash.
- Create `agent-app/packages/contracts/src/server-plan-envelope.test.ts`: signature and mismatch tests.
- Modify `agent-app/packages/contracts/src/index.ts`: export creative contracts.
- Modify `agent-app/prisma/schema.prisma`: add `CreativeSolutionSnapshot` linked to ChangePlan and successful revision.
- Create `agent-app/prisma/migrations/202608170001_creative_solution_snapshot/migration.sql`: table, foreign keys, and indexes.

### Compilation and orchestration

- Create `agent-app/packages/domain-client/src/implementation/ui-implementation-v2-compiler.ts`: v2 snapshot diff to InternalChangePlan.
- Create `agent-app/packages/domain-client/src/implementation/ui-implementation-v2-compiler.test.ts`: create/update/move/remove and GUID stability.
- Create `agent-app/packages/domain-client/src/validate/creative-static-validator.ts`: pre-build semantic/layout/style/script coverage report.
- Create `agent-app/packages/domain-client/src/validate/creative-static-validator.test.ts`: blocking versus warning policy.
- Modify `agent-app/packages/domain-client/src/index.ts`: export v2 compiler and validator.
- Create `agent-app/packages/agent-orchestrator/src/nodes/compile-creative-solution.ts`: coordinate phases 3/4, local correction, snapshot, signing, and plan persistence.
- Create `agent-app/packages/agent-orchestrator/src/nodes/compile-creative-solution.test.ts`: success, repair, and fail-closed tests.
- Modify `agent-app/packages/agent-orchestrator/src/ports.ts`: creative compiler/snapshot ports.
- Modify `agent-app/packages/agent-orchestrator/src/state.ts`: compilation, validation, and snapshot hashes.
- Modify `agent-app/packages/agent-orchestrator/src/solution-graph.ts`: direct build route without preview review.
- Modify `agent-app/packages/agent-orchestrator/src/nodes/enqueue-build.ts`: authorize `creative-solution` and customer copy.
- Modify `agent-app/packages/agent-orchestrator/src/nodes/enqueue-build.test.ts`: creative authorization and idempotency.

### API, Worker, revision, and delivery

- Create `agent-app/apps/api/src/creative-snapshots/creative-snapshot.repository.ts`: tenant/workspace scoped snapshot persistence.
- Create `agent-app/apps/api/src/creative-snapshots/creative-snapshot.repository.test.ts`: immutability and hash checks.
- Create `agent-app/apps/api/src/creative-snapshots/creative-snapshots.module.ts`: dependency injection.
- Modify `agent-app/apps/api/src/conversations/graph-ports.ts`: creative compiler and repository ports.
- Modify `agent-app/apps/api/src/conversations/conversations.module.ts`: register creative ports.
- Modify `agent-app/apps/api/src/delivery/delivery-snapshot.service.ts`: creative artifact status and fixed delivery statement.
- Create `agent-app/apps/api/src/delivery/delivery-snapshot.service.test.ts`: no-preview creative delivery.
- Modify `agent-app/packages/build-jobs/src/server-plan-authority.ts`: sign/verify creative snapshot hash.
- Modify `agent-app/packages/build-jobs/src/server-plan-authority.test.ts`: tamper tests.
- Modify `agent-app/packages/build-jobs/src/job-executor.ts`: snapshot binding and revision linkage.
- Modify `agent-app/packages/build-jobs/src/job-executor.test.ts`: atomic success/failure linkage.
- Create `agent-app/apps/api/src/revisions/creative-revision-diff.ts`: server-derived semantic diff.
- Create `agent-app/apps/api/src/revisions/creative-revision-diff.test.ts`: unchanged/add/update/move/remove tests.
- Modify `agent-app/apps/api/src/revisions/revision.service.ts`: retrieve creative metadata and diff.
- Modify `agent-app/apps/api/src/revisions/revisions.module.ts`: wire snapshot repository.
- Create `agent-app/packages/contracts/src/solution-revision-patch.ts`: bounded stable-ID semantic patch contract.
- Create `agent-app/packages/contracts/src/solution-revision-patch.test.ts`: base-hash and operation reference tests.
- Create `agent-app/packages/domain-client/src/planning/solution-revision-patcher.ts`: apply semantic patches while preserving unaffected subtrees.
- Create `agent-app/packages/domain-client/src/planning/solution-revision-patcher.test.ts`: exact preservation and invalid-removal tests.
- Create `agent-app/packages/agent-orchestrator/src/nodes/revise-creative-solution.ts`: load prior snapshot, request one patch, apply, retrieve, and recompile.
- Create `agent-app/packages/agent-orchestrator/src/nodes/revise-creative-solution.test.ts`: feedback scope and no-preview routing tests.

### Golden integration

- Create `agent-app/packages/domain-client/src/golden/creative-portal.fixture.ts`: media-led multi-page portal.
- Create `agent-app/packages/domain-client/src/golden/industrial-dashboard.fixture.ts`: industrial operations dashboard.
- Create `agent-app/packages/domain-client/src/golden/management-admin.fixture.ts`: management workspace.
- Create `agent-app/packages/domain-client/src/golden/creative-golden.integration.test.ts`: full compile/package/unpack checks.
- Create `agent-app/docs/creative-golden-acceptance.md`: artifact checks and manual KF import record template.

---

### Task 1: Define and persist immutable creative solution snapshots

**Files:**
- Create: `agent-app/packages/contracts/src/creative-snapshot.ts`
- Create: `agent-app/packages/contracts/src/creative-snapshot.test.ts`
- Modify: `agent-app/packages/contracts/src/server-plan-envelope.ts`
- Create: `agent-app/packages/contracts/src/server-plan-envelope.test.ts`
- Modify: `agent-app/packages/contracts/src/index.ts`
- Modify: `agent-app/prisma/schema.prisma`
- Create: `agent-app/prisma/migrations/202608170001_creative_solution_snapshot/migration.sql`

**Interfaces:**
- Consumes: v3 blueprint, candidate bundle, semantic plan, UI v2, validation report, and compiler version manifest.
- Produces: `CreativeSolutionSnapshotSchema`, `CreativeRevisionDiffSchema`, and signed `creativeSnapshotHash`.

- [ ] **Step 1: Write failing snapshot/hash tests**

```ts
const snapshot = CreativeSolutionSnapshotSchema.parse(snapshotFixture);
expect(snapshot.schema).toBe("kf-creative-solution-snapshot/v1");
expect(snapshot.packageHash).toBeUndefined();
const hash = canonicalCreativeSnapshotHash(snapshot);
expect(hash).toMatch(/^[0-9a-f]{64}$/);
expect(() => validateServerPlanEnvelopeData({ ...signedEnvelope, creativeSnapshotHash: "0".repeat(64) }))
  .toThrow(/SIGNATURE|SNAPSHOT|HASH/);
```

- [ ] **Step 2: Run contract tests and verify missing schema**

```bash
pnpm --dir agent-app --filter @kf/contracts exec vitest run src/creative-snapshot.test.ts src/server-plan-envelope.test.ts
```

- [ ] **Step 3: Implement bounded snapshot contracts**

```ts
export const CreativeSolutionSnapshotSchema = z.object({
  schema: z.literal("kf-creative-solution-snapshot/v1"),
  projectKey: projectKeySchema,
  baseRevisionId: stableText,
  blueprint: CustomerSolutionBlueprintSchema,
  capabilityCandidates: CapabilityCandidateBundleSchema,
  solutionPlan: SolutionImplementationPlanSchema,
  uiImplementation: UIImplementationSpecV2Schema,
  versions: z.object({ knowledge: semver, solutionCompiler: semver, moduleCompiler: semver, controlTemplates: semver, styleCompiler: semver, actionCompiler: semver, scriptCompiler: semver }).strict(),
  validation: CreativeStaticValidationSchema,
  feedbackSummary: z.string().max(2_000).optional(),
  packageHash: sha256.optional(),
}).strict();
```

In the same contract file define:

```ts
export const CreativeStaticIssueSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  nodeId: z.string().max(100).optional(),
  path: z.array(z.union([z.string(), z.number().int().nonnegative()])).max(32),
  message: z.string().min(1).max(500),
  alternatives: z.array(z.string().min(1).max(300)).max(5),
}).strict();

export const CreativeStaticValidationSchema = z.object({
  schema: z.literal("kf-creative-static-validation/v1"),
  status: z.enum(["pass", "fail"]),
  blockingIssues: z.array(CreativeStaticIssueSchema).max(200),
  warnings: z.array(CreativeStaticIssueSchema).max(200),
  deliveryStatement: z.literal("工程已通过结构、资源、布局、样式、脚本和引用静态校验；尚未经过系统自动 KF 运行态验证，请导入 KF 后确认视觉与交互效果。").optional(),
}).strict().superRefine((value, ctx) => {
  if ((value.status === "pass") !== (value.blockingIssues.length === 0)) {
    ctx.addIssue({ code: "custom", path: ["status"], message: "status must match blocking issues" });
  }
  if ((value.status === "pass") !== (value.deliveryStatement !== undefined)) {
    ctx.addIssue({ code: "custom", path: ["deliveryStatement"], message: "delivery statement is present only after static validation passes" });
  }
});
```

Canonical hashing excludes only `packageHash`, which is unavailable before build. Extend the server envelope with optional `creativeSnapshotHash`, include it in HMAC signing bytes, and require it whenever the persisted ChangePlan is linked to a creative snapshot.

- [ ] **Step 4: Add the database table and exact migration**

Create columns `id`, `tenantId`, `workspaceId`, `changePlanId`, nullable `solutionRevisionId`, `snapshotHash`, `snapshot JsonB`, nullable `packageHash`, `createdAt`; unique constraints on `changePlanId`, `snapshotHash`, and nullable `solutionRevisionId`; tenant/workspace and revision indexes; foreign keys to `ChangePlan` and `SolutionRevision` with restrictive deletion.

- [ ] **Step 5: Run contracts and Prisma validation**

```bash
pnpm --dir agent-app --filter @kf/contracts test
pnpm --dir agent-app --filter @kf/contracts typecheck
pnpm --dir agent-app exec prisma validate --schema prisma/schema.prisma
pnpm --dir agent-app exec prisma generate --schema prisma/schema.prisma
```

- [ ] **Step 6: Commit snapshot contracts and schema**

```bash
git add agent-app/packages/contracts/src/creative-snapshot.ts agent-app/packages/contracts/src/creative-snapshot.test.ts agent-app/packages/contracts/src/server-plan-envelope.ts agent-app/packages/contracts/src/server-plan-envelope.test.ts agent-app/packages/contracts/src/index.ts agent-app/prisma/schema.prisma agent-app/prisma/migrations/202608170001_creative_solution_snapshot/migration.sql
git commit -m "feat: persist creative solution snapshots"
```

---

### Task 2: Compile UIImplementationSpec v2 into deterministic ChangePlan deltas

**Files:**
- Create: `agent-app/packages/domain-client/src/implementation/ui-implementation-v2-compiler.ts`
- Create: `agent-app/packages/domain-client/src/implementation/ui-implementation-v2-compiler.test.ts`
- Modify: `agent-app/packages/domain-client/src/index.ts`

**Interfaces:**
- Consumes: current/previous `UIImplementationSpecV2`, editable entities, page GUIDs, base revision ID, and verified assets.
- Produces: `compileUiImplementationV2(input): UiImplementationV2CompileResult` with InternalChangePlan, semantic operations, capability report, and stable-ID diff.

- [ ] **Step 1: Write failing delta and GUID-stability tests**

```ts
const first = compileUiImplementationV2(createInput);
expect(first.diff.added).toContain("visitor-records");
const revised = compileUiImplementationV2({ ...revisionInput, previousSpec: firstSpec });
expect(revised.diff.unchanged).toContain("site-nav");
expect(revised.diff.moved).toContain("visitor-records");
expect(revised.plan.operations.some((operation) => operation.op === "delete" && operation.entityId === stableGuid("removed-card"))).toBe(true);
expect(revised.guidByStableId["site-nav"]).toBe(first.guidByStableId["site-nav"]);
```

- [ ] **Step 2: Run the test and verify the compiler is missing**

Run: `pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/implementation/ui-implementation-v2-compiler.test.ts`

- [ ] **Step 3: Implement snapshot comparison and operation derivation**

Index pages/controls/overlays/scripts by stable ID. Compare canonical semantic fields and classify exact sets:

```ts
export interface CreativeImplementationDiff {
  unchanged: readonly string[];
  added: readonly string[];
  updated: readonly string[];
  moved: readonly string[];
  removed: readonly string[];
}
```

Reuse existing entity GUIDs when present; otherwise derive GUIDs from `{ workspaceId, stableId }`. Create pages before controls, parents before children, scripts before event bindings, and delete children before parents. Translate compiled styles, native properties, assets, mock data, event bindings, and scripts through reviewed existing patch fields. Preserve unknown existing fields by emitting only allowlisted deltas.

- [ ] **Step 4: Keep v1 compilation byte-compatible**

Do not modify `compileUiImplementation()` behavior for v1. Add a dispatcher `compileAnyUiImplementation(input: AnyUIImplementationSpec, context)` that calls v1 or v2 by schema and returns the shared port result plus optional creative diff. Existing callers typed as `UIImplementationSpec` continue to mean v1 and require no casts or property guards.

- [ ] **Step 5: Run implementation and patch regressions**

```bash
pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/implementation/ui-implementation-v2-compiler.test.ts src/implementation/ui-implementation-compiler.test.ts src/patch/client-patcher.test.ts src/patch/client-patcher.container.test.ts
pnpm --dir agent-app --filter @kf/domain-client typecheck
pnpm --dir agent-app --filter @kf/domain-client lint
```

- [ ] **Step 6: Commit v2 ChangePlan compilation**

```bash
git add agent-app/packages/domain-client/src/implementation/ui-implementation-v2-compiler.ts agent-app/packages/domain-client/src/implementation/ui-implementation-v2-compiler.test.ts agent-app/packages/domain-client/src/index.ts
git commit -m "feat: compile UI v2 revision deltas"
```

---

### Task 3: Add deterministic creative static validation

**Files:**
- Create: `agent-app/packages/domain-client/src/validate/creative-static-validator.ts`
- Create: `agent-app/packages/domain-client/src/validate/creative-static-validator.test.ts`
- Modify: `agent-app/packages/domain-client/src/index.ts`

**Interfaces:**
- Consumes: blueprint, candidate bundle, semantic plan, UI v2, and compilation diagnostics.
- Produces: `validateCreativeImplementation(input): CreativeStaticValidation`.

- [ ] **Step 1: Write failing blocking/warning policy tests**

```ts
expect(validateCreativeImplementation(validFixture).status).toBe("pass");
expect(validateCreativeImplementation(missingJourneyFixture).blockingIssues[0]?.code).toBe("BLUEPRINT_JOURNEY_UNIMPLEMENTED");
expect(validateCreativeImplementation(overlapFixture).blockingIssues[0]?.code).toBe("LAYOUT_SEVERE_OVERLAP");
expect(validateCreativeImplementation(unverifiedControlFixture)).toMatchObject({ status: "pass", warnings: [expect.objectContaining({ code: "RUNTIME_UNVERIFIED" })] });
```

- [ ] **Step 2: Run the test and verify validator absence**

Run: `pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/validate/creative-static-validator.test.ts`

- [ ] **Step 3: Implement exact checks**

Check blueprint page/region/journey coverage; stable references; candidate use; intrinsic text space; page bounds; unintended overlap; container capacity; abnormal height and empty space; capability/property/data/event/method/style-part support; token and CSS scope safety; JavaScript syntax/API/input/output; assets; parent/z-order; and source mapping. Block only schema/reference failures, severe overlap/out-of-bounds, missing critical journey, unsupported required capability, unsafe CSS, script error, missing asset, or impossible round-trip precondition. Return sorted issues with `code`, `nodeId`, `path`, `message`, and alternatives.

- [ ] **Step 4: Run validator regressions**

```bash
pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/validate/creative-static-validator.test.ts src/validate/client-validator.test.ts
pnpm --dir agent-app --filter @kf/domain-client typecheck
```

- [ ] **Step 5: Commit creative validation**

```bash
git add agent-app/packages/domain-client/src/validate/creative-static-validator.ts agent-app/packages/domain-client/src/validate/creative-static-validator.test.ts agent-app/packages/domain-client/src/index.ts
git commit -m "feat: validate creative KF implementations"
```

---

### Task 4: Persist creative snapshots through API ports

**Files:**
- Create: `agent-app/apps/api/src/creative-snapshots/creative-snapshot.repository.ts`
- Create: `agent-app/apps/api/src/creative-snapshots/creative-snapshot.repository.test.ts`
- Create: `agent-app/apps/api/src/creative-snapshots/creative-snapshots.module.ts`
- Modify: `agent-app/apps/api/src/conversations/graph-ports.ts`
- Modify: `agent-app/apps/api/src/conversations/conversations.module.ts`

**Interfaces:**
- Consumes: canonical snapshot, tenant/workspace/change-plan identity, and expected hash.
- Produces: `CreativeSnapshotRepositoryPort.savePending()`, `loadByRevision()`, and `loadByChangePlan()`.

- [ ] **Step 1: Write failing repository ownership/immutability tests**

```ts
await repository.savePending(input);
await expect(repository.savePending({ ...input, snapshot: changedSnapshot })).rejects.toThrow(/IMMUTABLE|HASH_MISMATCH/);
await expect(repository.loadByChangePlan("tenant-b", input.changePlanId)).resolves.toBeNull();
expect((await repository.loadByChangePlan(input.tenantId, input.changePlanId))?.snapshotHash).toBe(input.snapshotHash);
```

- [ ] **Step 2: Run API repository tests and verify missing service**

Run: `pnpm --dir agent-app --filter @kf/api exec vitest run src/creative-snapshots/creative-snapshot.repository.test.ts`

- [ ] **Step 3: Implement tenant-scoped immutable persistence**

`savePending()` recomputes the canonical hash, verifies tenant/workspace ownership of the ChangePlan, and creates once. An idempotent replay with identical hash/data succeeds; any differing replay fails. Read methods parse stored JSON with `CreativeSolutionSnapshotSchema` before returning it. Storage keys and raw project JSON never enter the snapshot.

- [ ] **Step 4: Register API ports**

Wire a `CreativeSolutionCompilerPort` that calls phase-three `compileSolutionImplementation()`, phase-four `compileInteractions()`, phase-five `validateCreativeImplementation()`, and `compileUiImplementationV2()`. Wire the repository behind a new orchestrator `CreativeSnapshotPort`.

- [ ] **Step 5: Run API tests/typecheck**

```bash
pnpm --dir agent-app --filter @kf/api exec vitest run src/creative-snapshots/creative-snapshot.repository.test.ts src/conversations/graph-ports.test.ts
pnpm --dir agent-app --filter @kf/api typecheck
pnpm --dir agent-app --filter @kf/api lint
```

- [ ] **Step 6: Commit API creative ports**

```bash
git add agent-app/apps/api/src/creative-snapshots/creative-snapshot.repository.ts agent-app/apps/api/src/creative-snapshots/creative-snapshot.repository.test.ts agent-app/apps/api/src/creative-snapshots/creative-snapshots.module.ts agent-app/apps/api/src/conversations/graph-ports.ts agent-app/apps/api/src/conversations/conversations.module.ts
git commit -m "feat: persist creative build snapshots"
```

---

### Task 5: Compile, sign, persist, and enqueue the creative graph path

**Files:**
- Create: `agent-app/packages/agent-orchestrator/src/nodes/compile-creative-solution.ts`
- Create: `agent-app/packages/agent-orchestrator/src/nodes/compile-creative-solution.test.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/ports.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/state.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/solution-graph.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/nodes/enqueue-build.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/nodes/enqueue-build.test.ts`

**Interfaces:**
- Consumes: confirmed blueprint, candidate bundle, semantic plan, previous creative snapshot, creative compiler port, snapshot port, repository/signing/build ports.
- Produces: signed persisted InternalChangePlan, pending snapshot, `creative-solution` authorization, and durable build job.

- [ ] **Step 1: Write failing creative routing tests**

```ts
expect(routeAfterSolutionPlanReady(creativeState)).toBe("compile-creative-solution");
expect(success.buildAuthorization).toBe("creative-solution");
expect(success.stage).toBe("building");
expect(success.previewArtifactId).toBeUndefined();
expect(repairModel.calls).toHaveLength(1);
expect(enqueueMessage).toContain("工程生成任务已提交");
expect(enqueueMessage).not.toContain("预览");
```

- [ ] **Step 2: Run orchestrator tests and verify missing route/authorization**

```bash
pnpm --dir agent-app --filter @kf/agent-orchestrator exec vitest run src/nodes/compile-creative-solution.test.ts src/nodes/enqueue-build.test.ts
```

- [ ] **Step 3: Extend ports/state and implement compile node**

Add `CreativeSolutionCompilerPort.compile()` returning UI v2, InternalChangePlan, semantic operations, capability report, creative validation, and diff. Add `CreativeSnapshotPort.savePending()`. On blocking diagnostics caused by semantic mismatch, pass only the failing node ID, path, reason, and candidate alternatives to `reviseSolutionImplementationSubtree()` once, then recompile the whole snapshot deterministically. Engineering failures that the compiler can fix—GUID, names, safe spacing, page height, container size, asset paths, scope tokens, instance rewriting—must not call the model.

- [ ] **Step 4: Persist before enqueue and bind signatures**

Create/save ChangeRequest and InternalChangePlan, compute snapshot hash, sign the envelope with `creativeSnapshotHash`, persist the snapshot with the same ChangePlan ID, then set `buildAuthorization: "creative-solution"`. Enqueue accepts that authorization without an approval resume because the customer already confirmed the blueprint. Directly route to `building`; never enter `preview-review` for `creative-v2`.

- [ ] **Step 5: Run graph and regression tests**

```bash
pnpm --dir agent-app --filter @kf/agent-orchestrator test
pnpm --dir agent-app --filter @kf/agent-orchestrator typecheck
pnpm --dir agent-app --filter @kf/agent-orchestrator lint
```

- [ ] **Step 6: Commit creative graph integration**

```bash
git add agent-app/packages/agent-orchestrator/src/nodes/compile-creative-solution.ts agent-app/packages/agent-orchestrator/src/nodes/compile-creative-solution.test.ts agent-app/packages/agent-orchestrator/src/ports.ts agent-app/packages/agent-orchestrator/src/state.ts agent-app/packages/agent-orchestrator/src/solution-graph.ts agent-app/packages/agent-orchestrator/src/nodes/enqueue-build.ts agent-app/packages/agent-orchestrator/src/nodes/enqueue-build.test.ts
git commit -m "feat: enqueue creative KF builds"
```

---

### Task 6: Bind Worker success to the creative revision snapshot

**Files:**
- Modify: `agent-app/packages/build-jobs/src/server-plan-authority.ts`
- Modify: `agent-app/packages/build-jobs/src/server-plan-authority.test.ts`
- Modify: `agent-app/packages/build-jobs/src/job-executor.ts`
- Modify: `agent-app/packages/build-jobs/src/job-executor.test.ts`

**Interfaces:**
- Consumes: signed envelope, pending snapshot row, Worker validation result, packaged artifact hash, and new revision ID.
- Produces: atomically linked immutable snapshot/revision/package and failed-job diagnostics with no link.

- [ ] **Step 1: Write failing tamper and atomicity tests**

```ts
expect(() => authority.verify({ ...creativeEnvelope, creativeSnapshotHash: "f".repeat(64) }, expectations))
  .toThrow(/signature|snapshot/i);
expect(successSnapshot.solutionRevisionId).toBe(successRevision.id);
expect(successSnapshot.packageHash).toBe(successArtifact.sha256);
expect(failedSnapshot.solutionRevisionId).toBeNull();
expect(await prisma.solutionRevision.findMany({ where: { changePlanId: failedPlan.id } })).toHaveLength(0);
```

- [ ] **Step 2: Run build-jobs tests and verify snapshot handling is absent**

```bash
pnpm --dir agent-app --filter @kf/build-jobs exec vitest run src/server-plan-authority.test.ts src/job-executor.test.ts
```

- [ ] **Step 3: Verify the pending snapshot before patching**

When the signed envelope contains `creativeSnapshotHash`, load the tenant/workspace/change-plan scoped row, parse it, recompute its canonical hash, and require exact equality. Reject a missing, reused, mismatched, or already-linked snapshot. Plain legacy/module envelopes continue without a creative snapshot.

- [ ] **Step 4: Link snapshot during the successful build transaction**

After package validation, include the generated revision ID and package SHA-256 in the same transaction that creates Artifact, SolutionRevision, DomainProjectRevision, and marks BuildJob succeeded. Update the snapshot only where `solutionRevisionId IS NULL`, `packageHash IS NULL`, and hash/change-plan bindings match. A zero-row update aborts the transaction. Failed validation/build leaves the snapshot pending for diagnostic retry and creates no revision.

- [ ] **Step 5: Run build job and Worker integration regressions**

```bash
pnpm --dir agent-app --filter @kf/build-jobs test
pnpm --dir agent-app --filter @kf/build-jobs typecheck
pnpm --dir agent-app --filter @kf/worker test
pnpm --dir agent-app --filter @kf/worker typecheck
```

- [ ] **Step 6: Commit Worker snapshot binding**

```bash
git add agent-app/packages/build-jobs/src/server-plan-authority.ts agent-app/packages/build-jobs/src/server-plan-authority.test.ts agent-app/packages/build-jobs/src/job-executor.ts agent-app/packages/build-jobs/src/job-executor.test.ts
git commit -m "feat: bind creative snapshots to KF revisions"
```

---

### Task 7: Expose server-derived revision diffs and download-only delivery

**Files:**
- Create: `agent-app/apps/api/src/revisions/creative-revision-diff.ts`
- Create: `agent-app/apps/api/src/revisions/creative-revision-diff.test.ts`
- Modify: `agent-app/apps/api/src/revisions/revision.service.ts`
- Modify: `agent-app/apps/api/src/revisions/revisions.module.ts`
- Modify: `agent-app/apps/api/src/delivery/delivery-snapshot.service.ts`
- Create: `agent-app/apps/api/src/delivery/delivery-snapshot.service.test.ts`

**Interfaces:**
- Consumes: current/parent creative snapshots and successful artifact/revision rows.
- Produces: `deriveCreativeRevisionDiff(previous, current)` and creative delivery projection.

- [ ] **Step 1: Write failing exact diff tests**

```ts
expect(deriveCreativeRevisionDiff(before, after)).toEqual({
  unchanged: ["site-nav"],
  added: ["approval-dialog"],
  updated: ["visitor-status"],
  moved: ["visitor-records"],
  removed: ["legacy-banner"],
});
expect(creativeDelivery.status).toBe("ready_with_warnings");
expect(creativeDelivery.previewArtifactId).toBeUndefined();
expect(creativeDelivery.statement).toBe(FIXED_CREATIVE_DELIVERY_STATEMENT);
```

- [ ] **Step 2: Run API tests and verify diff/projection absence**

```bash
pnpm --dir agent-app --filter @kf/api exec vitest run src/revisions/creative-revision-diff.test.ts src/delivery/delivery-snapshot.service.test.ts
```

- [ ] **Step 3: Implement canonical semantic diffing**

Compare stable-ID indexes from semantic plan and UI v2. `moved` means only parent/order/geometry changed; `updated` means non-placement semantic/style/data/action/script fields changed; a record cannot appear in both. Sort every list by code point. The model never supplies this diff.

- [ ] **Step 4: Implement creative delivery projection**

For `creative-v2`, return build status, package artifact ID/hash, revision ID, validation blocking issues/warnings, runtime-evidence warnings, fixed delivery statement, and semantic diff. Do not create or require a preview artifact. Existing module delivery projection remains unchanged.

- [ ] **Step 5: Run API regression tests**

```bash
pnpm --dir agent-app --filter @kf/api test
pnpm --dir agent-app --filter @kf/api typecheck
pnpm --dir agent-app --filter @kf/api lint
```

- [ ] **Step 6: Commit revision and delivery projection**

```bash
git add agent-app/apps/api/src/revisions/creative-revision-diff.ts agent-app/apps/api/src/revisions/creative-revision-diff.test.ts agent-app/apps/api/src/revisions/revision.service.ts agent-app/apps/api/src/revisions/revisions.module.ts agent-app/apps/api/src/delivery/delivery-snapshot.service.ts agent-app/apps/api/src/delivery/delivery-snapshot.service.test.ts
git commit -m "feat: expose creative KF revision delivery"
```

---

### Task 8: Apply user feedback as a bounded semantic revision patch

**Files:**
- Create: `agent-app/packages/contracts/src/solution-revision-patch.ts`
- Create: `agent-app/packages/contracts/src/solution-revision-patch.test.ts`
- Modify: `agent-app/packages/contracts/src/index.ts`
- Create: `agent-app/packages/domain-client/src/planning/solution-revision-patcher.ts`
- Create: `agent-app/packages/domain-client/src/planning/solution-revision-patcher.test.ts`
- Modify: `agent-app/packages/domain-client/src/index.ts`
- Create: `agent-app/packages/agent-orchestrator/src/nodes/revise-creative-solution.ts`
- Create: `agent-app/packages/agent-orchestrator/src/nodes/revise-creative-solution.test.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/model-port.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/ports.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/state.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/solution-graph.ts`
- Modify: `agent-app/apps/api/src/conversations/deepseek-model.ts`
- Modify: `agent-app/apps/api/src/conversations/deepseek-model.test.ts`

**Interfaces:**
- Consumes: latest successful creative snapshot, user feedback, and current blueprint/candidate knowledge.
- Produces: `SolutionRevisionPatch`, a fully revalidated revised semantic plan, and a new creative build linked to the previous revision.

- [ ] **Step 1: Write failing patch contract and preservation tests**

```ts
expect(SolutionRevisionPatchSchema.parse(patchFixture).basePlanHash).toBe(canonicalSolutionPlanHash(before));
const revised = applySolutionRevisionPatch(before, patchFixture);
expect(revised.pages.find((page) => page.id === "visitor-overview")?.root).not.toEqual(before.pages[0]?.root);
expect(revised.pages.find((page) => page.id === "settings")).toEqual(before.pages.find((page) => page.id === "settings"));
expect(() => applySolutionRevisionPatch(before, removeReferencedActionPatch)).toThrow(/REVISION_PATCH_REFERENCE_INVALID/);
```

- [ ] **Step 2: Run contract/domain tests and verify patch modules are missing**

```bash
pnpm --dir agent-app --filter @kf/contracts exec vitest run src/solution-revision-patch.test.ts
pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/planning/solution-revision-patcher.test.ts
```

- [ ] **Step 3: Define bounded patch operations**

The strict patch contains `schema: "kf-solution-revision-patch/v1"`, `basePlanHash`, a user-facing reason, affected blueprint page/region IDs, and at most 50 operations. Supported operations are `replace-node`, `update-node-intent`, `upsert/remove-overlay`, `upsert/remove-action`, `upsert/remove-script`, `update-theme`, `upsert/remove-role-style`, `upsert/remove-mock-data`, and `upsert/remove-local-state`. Every target is a stable semantic ID; the patch cannot contain coordinates, GUIDs, native fields, selectors, compiled CSS, or compiled JavaScript.

- [ ] **Step 4: Apply patches with exact unaffected preservation**

Verify `basePlanHash`, clone only the path to each changed record, apply operations in declared order, then parse the complete result with `SolutionImplementationPlanSchema` and candidate validation. Compute the changed stable-ID closure and assert every object outside that closure is canonical-byte equal to the previous snapshot. Recompute the candidate bundle when a patch changes a capability/module/recipe reference; otherwise reuse the hash-bound bundle.

- [ ] **Step 5: Add the feedback revision graph node**

On `MODIFY_REQUIREMENT` for a workspace whose current revision has a creative snapshot, load that snapshot through `CreativeSnapshotPort`, send only the bounded feedback, blueprint, relevant affected subtrees, and candidate profiles to `ModelPort.createSolutionRevisionPatch()`, apply it once, then route through the existing creative compile/enqueue node. The node must not call blueprint generation unless the user explicitly requests information-architecture/page-map redesign; that intent continues through `REVISE_DESIGN`. It records the bounded feedback summary in the next snapshot and never enters preview review.

- [ ] **Step 6: Add strict DeepSeek patch prompting and parsing**

The patch prompt says to preserve every unaffected stable ID and return operations only. Parse with `SolutionRevisionPatchSchema`, require the exact supplied base hash, reject duplicate/conflicting operations, and reject native implementation keys recursively. There is one patch model call and at most one JSON-format extraction repair; semantic patch failures return a node-specific error rather than regenerating the whole plan.

- [ ] **Step 7: Run revision and workflow regressions**

```bash
pnpm --dir agent-app --filter @kf/contracts exec vitest run src/solution-revision-patch.test.ts
pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/planning/solution-revision-patcher.test.ts
pnpm --dir agent-app --filter @kf/agent-orchestrator exec vitest run src/nodes/revise-creative-solution.test.ts src/solution-graph.test.ts
pnpm --dir agent-app --filter @kf/api exec vitest run src/conversations/deepseek-model.test.ts
pnpm --dir agent-app --filter @kf/contracts typecheck
pnpm --dir agent-app --filter @kf/domain-client typecheck
pnpm --dir agent-app --filter @kf/agent-orchestrator typecheck
pnpm --dir agent-app --filter @kf/api typecheck
```

- [ ] **Step 8: Commit localized creative revisions**

```bash
git add agent-app/packages/contracts/src/solution-revision-patch.ts agent-app/packages/contracts/src/solution-revision-patch.test.ts agent-app/packages/contracts/src/index.ts agent-app/packages/domain-client/src/planning/solution-revision-patcher.ts agent-app/packages/domain-client/src/planning/solution-revision-patcher.test.ts agent-app/packages/domain-client/src/index.ts agent-app/packages/agent-orchestrator/src/nodes/revise-creative-solution.ts agent-app/packages/agent-orchestrator/src/nodes/revise-creative-solution.test.ts agent-app/packages/agent-orchestrator/src/model-port.ts agent-app/packages/agent-orchestrator/src/ports.ts agent-app/packages/agent-orchestrator/src/state.ts agent-app/packages/agent-orchestrator/src/solution-graph.ts agent-app/apps/api/src/conversations/deepseek-model.ts agent-app/apps/api/src/conversations/deepseek-model.test.ts
git commit -m "feat: revise creative KF solution subtrees"
```

---

### Task 9: Add three end-to-end Golden KF projects

**Files:**
- Create: `agent-app/packages/domain-client/src/golden/creative-portal.fixture.ts`
- Create: `agent-app/packages/domain-client/src/golden/industrial-dashboard.fixture.ts`
- Create: `agent-app/packages/domain-client/src/golden/management-admin.fixture.ts`
- Create: `agent-app/packages/domain-client/src/golden/creative-golden.integration.test.ts`
- Create: `agent-app/docs/creative-golden-acceptance.md`

**Interfaces:**
- Consumes: phase-two semantic plans and complete phases 3–5 compilation/package pipeline.
- Produces: three deterministic packaged `.gz` KF projects and automated structural/round-trip assertions.

- [ ] **Step 1: Write the failing Golden integration test**

```ts
it.each([
  ["creative portal", creativePortalFixture],
  ["industrial dashboard", industrialDashboardFixture],
  ["management admin", managementAdminFixture],
])("builds %s through package round-trip", async (_name, fixture) => {
  const built = await buildCreativeGolden(fixture);
  expect(built.validation.status).toBe("pass");
  expect(built.packageHash).toMatch(/^[0-9a-f]{64}$/);
  expect(built.roundTripHash).toBe(built.packageHash);
  expect(built.implementation.pages.length).toBeGreaterThanOrEqual(2);
expect(built.interactionCoverage.unimplementedJourneys).toEqual([]);
});
```

Add a second-build assertion for each fixture: apply one bounded feedback patch, rebuild from the first snapshot, verify the expected changed stable IDs, and assert at least one unaffected page, action, script, GUID, and unknown native field remains identical.

- [ ] **Step 2: Run the integration test and verify fixture/build helper failures**

Run: `pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/golden/creative-golden.integration.test.ts`

- [ ] **Step 3: Implement genuinely different Golden fixtures**

The portal uses media-led hero/gallery/detail and avoids Datagrid in narrative regions. The industrial dashboard uses compact metrics, filters, primary Datagrid, selected detail, and alarm Overlay. The admin workspace uses sidebar navigation, form/list master-detail, Tabs, dialog submit, and status feedback. Each has realistic Chinese mock data, multiple pages, at least one Overlay, at least two interaction journeys, scoped CSS, and at least one template script; only the admin fixture requires one constrained custom script.

- [ ] **Step 4: Verify package, unpack, inspect, and round-trip**

Use the actual `compileClientProject`, patcher, validator, `packageNativeClientProject`, `importNativeClientPackage`, and inspector. Assert page manager membership, GUID uniqueness, parent relations, assets, script parsing, event targets, CSS scope tokens, no severe overlap, no abnormal empty page height, and byte-deterministic packaging.

- [ ] **Step 5: Document manual KF import evidence separately**

`creative-golden-acceptance.md` records generated package hash, automated checks, manual importer name/date, KF 3.6 patch version, visual result, interaction result, defects, and evidence file references. Leave manual fields explicitly marked `尚未人工导入验证`; do not claim runtime verification from automated tests.

- [ ] **Step 6: Run the full repository verification suite**

```bash
pnpm --dir agent-app test
pnpm --dir agent-app typecheck
pnpm --dir agent-app lint
pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/golden/creative-golden.integration.test.ts
git diff --check
```

- [ ] **Step 7: Commit Golden acceptance**

```bash
git add agent-app/packages/domain-client/src/golden/creative-portal.fixture.ts agent-app/packages/domain-client/src/golden/industrial-dashboard.fixture.ts agent-app/packages/domain-client/src/golden/management-admin.fixture.ts agent-app/packages/domain-client/src/golden/creative-golden.integration.test.ts agent-app/docs/creative-golden-acceptance.md
git commit -m "test: add creative KF golden projects"
```

---

## Completion Gate

Phase 5 is complete only when:

- `creative-v2` compiles a confirmed semantic plan into a signed InternalChangePlan and durable build job;
- no creative build depends on or exposes the static preview flow;
- Worker output passes structure, resource, geometry, CSS, JavaScript, reference, unknown-field, and round-trip validation;
- a successful artifact, revision, creative snapshot, package hash, and ChangePlan are atomically bound;
- failed builds create no revision and cannot attach a package hash to the snapshot;
- subsequent feedback can load the prior blueprint/bundle/plan/UI/script snapshot and derive exact stable-ID deltas;
- portal, industrial dashboard, and admin Golden projects are compositionally distinct, interaction-complete, packageable, unpackable, and deterministic;
- runtime verification remains an explicit manual record and is never inferred from static tests;
- existing legacy/module workflows and preview code remain green;
- the complete workspace test/typecheck/lint suite passes.
