# KF Advanced Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compile common customer-demo interactions into deterministic, validated KingFusion 3.6 project behavior without executing model-authored JavaScript.

**Architecture:** Separate trigger evidence from effect serialization, correlate semantic state to compiler-owned KF variables, and lower recognized workflows to reviewed generated scripts. Unsupported effects remain explicit diagnostics.

**Tech Stack:** TypeScript 5.9, Zod, Vitest, NestJS graph ports, KingClient domain pack, KF 3.6 JSON templates.

**Spec:** `docs/superpowers/specs/2026-08-29-kf-advanced-interactions-design.md`

## Global Constraints

- Never execute or materialize model-authored JavaScript.
- Every supported KF event, method, property, action, and runtime function must carry exact evidence.
- Generated scripts must pass the existing AST and semantic API validators.
- DOM, network, storage, dynamic evaluation, timers, and arbitrary calls remain forbidden.
- Record transforms are capped at 100 records.
- Structural, provenance, security, and partial-serialization failures remain blocking.
- Shared-database API and Worker suites run serially.

---

### Task 1: Separate Trigger and Effect Evidence

**Files:**
- Create: `agent-app/packages/domain-client/src/design-knowledge/native-action-capability-registry.ts`
- Test: `agent-app/packages/domain-client/src/design-knowledge/native-action-capability-registry.test.ts`
- Modify: `agent-app/packages/domain-client/src/design-knowledge/script-capability-registry.ts`
- Modify: `agent-app/packages/domain-client/src/design-knowledge/design-knowledge-catalog.ts`
- Modify: `agent-app/packages/domain-client/src/interaction/action-compiler.ts`
- Test: `agent-app/packages/domain-client/src/interaction/action-compiler.test.ts`

**Interfaces:**
- Produces `requireNativeActionCapability(kind: ActionEffect["kind"]): NativeActionCapability`.
- Trigger owners authorize events; the global registry authorizes effects; target profiles authorize target methods and properties.

- [ ] **Step 1: Write failing tests**

```ts
it("allows a reviewed Datagrid event to trigger reviewed navigation", () => {
  const result = compileNativeActions({ normalized: normalizedRowNavigation() });
  expect(result.actions).toEqual([expect.objectContaining({ kind: "navigate-page" })]);
  expect(result.scriptRequests).toEqual([]);
});

it("rejects an action without exact evidence", () => {
  expect(() => requireNativeActionCapability("run-script"))
    .toThrow("NATIVE_ACTION_CAPABILITY_NOT_SUPPORTED");
});
```

- [ ] **Step 2: Verify RED**

```bash
cd agent-app/packages/domain-client
pnpm exec vitest run src/design-knowledge/native-action-capability-registry.test.ts src/interaction/action-compiler.test.ts
```

Expected: registry import is missing and Datagrid navigation is returned as `ACTION_CAPABILITY_UNSUPPORTED`.

- [ ] **Step 3: Implement the immutable registry**

```ts
export interface NativeActionCapability {
  readonly semanticAction: "navigate-page" | "open-overlay" | "close-overlay" | "set-state" | "show-feedback";
  readonly availability: "supported" | "planned";
  readonly serialization: "navigate-command" | "overlay-visibility" | "variable-command" | "feedback-script";
  readonly evidence: readonly ScriptCapabilityEvidence[];
}
```

Register navigation with existing compiler evidence. Keep state and feedback planned until Tasks 3 and 4 establish serialization. Refactor `compileNativeActions` to stop requiring every effect on the trigger owner's `profile.actions`.

- [ ] **Step 4: Re-run focused tests; expect PASS**

- [ ] **Step 5: Commit exact Task 1 files**

```bash
git add agent-app/packages/domain-client/src/design-knowledge/native-action-capability-registry.ts agent-app/packages/domain-client/src/design-knowledge/native-action-capability-registry.test.ts agent-app/packages/domain-client/src/design-knowledge/script-capability-registry.ts agent-app/packages/domain-client/src/design-knowledge/design-knowledge-catalog.ts agent-app/packages/domain-client/src/interaction/action-compiler.ts agent-app/packages/domain-client/src/interaction/action-compiler.test.ts
git commit -m "refactor: separate KF trigger and action evidence"
```

### Task 2: Normalize Clickable Text to a Link-style Button

**Files:**
- Modify: `agent-app/packages/domain-client/src/solution-compile/component-compiler.ts`
- Test: `agent-app/packages/domain-client/src/solution-compile/component-compiler.test.ts`
- Modify: `agent-app/packages/domain-client/src/style/control-capability-registry.ts`
- Test: `agent-app/packages/domain-client/src/style/control-capability-registry.test.ts`
- Modify: `agent-app/apps/api/src/conversations/deepseek-model.ts`
- Test: `agent-app/apps/api/src/conversations/deepseek-model.test.ts`

**Interfaces:**
- Produces `effectiveInteractiveCapability(node): string`.
- Preserves semantic ID, content, actions, regions, geometry, and provenance.

- [ ] **Step 1: Write failing tests**

```ts
it("materializes clickable text as a link-style button", () => {
  const compiled = compileComponent(fixture(clickableText("open")));
  expect(compiled.capabilityId).toBe("button");
  expect(compiled.sourceSolutionNodeId).toBe("link-text");
  expect(compiled.eventBindings[0]?.actionIds).toEqual(["open"]);
});

it("does not invent image click support", () => {
  expect(() => compileComponent(fixture(clickableImage("open"))))
    .toThrow(/image.*click.*unsupported/i);
});
```

- [ ] **Step 2: Run and verify RED**

```bash
cd agent-app/packages/domain-client
pnpm exec vitest run src/solution-compile/component-compiler.test.ts src/style/control-capability-registry.test.ts
```

- [ ] **Step 3: Implement Text-to-Button normalization**

Only Text with a non-empty `click` binding is converted. Add an `interactive-text` role using transparent background, no border, inherited typography, pointer cursor, and focus-visible outline through the structured style engine. Image remains unsupported.

- [ ] **Step 4: Add exact prompt guidance**

```text
需要 click 的文字必须选择 button capability 并使用 interactive-text 样式角色；text 和 image 不得声明 click。
```

- [ ] **Step 5: Run Domain Client and DeepSeek tests; expect PASS**

```bash
cd agent-app/packages/domain-client && pnpm exec vitest run src/solution-compile/component-compiler.test.ts src/style/control-capability-registry.test.ts
cd ../../../agent-app/apps/api && pnpm exec vitest run src/conversations/deepseek-model.test.ts
```

- [ ] **Step 6: Commit exact Task 2 files**

```bash
git add agent-app/packages/domain-client/src/solution-compile/component-compiler.ts agent-app/packages/domain-client/src/solution-compile/component-compiler.test.ts agent-app/packages/domain-client/src/style/control-capability-registry.ts agent-app/packages/domain-client/src/style/control-capability-registry.test.ts agent-app/apps/api/src/conversations/deepseek-model.ts agent-app/apps/api/src/conversations/deepseek-model.test.ts
git commit -m "feat: normalize clickable text to KF buttons"
```

### Task 3: Materialize Semantic State as KF Variables

**Files:**
- Modify: `agent-app/packages/contracts/src/ui-style.ts`
- Test: `agent-app/packages/contracts/src/ui-style.test.ts`
- Modify: `agent-app/packages/contracts/src/creative-build-artifact.test.ts`
- Modify: `agent-app/packages/domain-client/src/implementation/runtime-correlation.ts`
- Test: `agent-app/packages/domain-client/src/implementation/runtime-correlation.test.ts`
- Modify: `agent-app/packages/domain-client/src/implementation/ui-implementation-v2-compiler.ts`
- Test: `agent-app/packages/domain-client/src/implementation/ui-implementation-v2-compiler.test.ts`
- Modify: `agent-app/packages/domain-client/src/patch/client-patcher.ts`
- Test: `agent-app/packages/domain-client/src/patch/client-patcher.test.ts`

**Interfaces:**
- Extends runtime correlation with `states: Array<{ semanticStateId: string; variableName: string }>`.
- Produces `runtimeVariableName(workspaceId: string, stateId: string): string`.
- Creates one signed variable operation for each local state definition.

- [ ] **Step 1: Write failing contract/correlation tests**

```ts
const variableName = runtimeVariableName("workspace", "filter-tech");
expect(attached.runtimeCorrelation?.states).toEqual([
  { semanticStateId: "filter-tech", variableName },
]);
expect(result.plan.operations).toContainEqual({
  op: "create",
  entityType: "variable",
  entityId: variableName,
  properties: expect.objectContaining({ defaultValue: "all" }),
});
```

- [ ] **Step 2: Verify RED**

```bash
cd agent-app/packages/contracts && pnpm exec vitest run src/ui-style.test.ts src/creative-build-artifact.test.ts
cd ../domain-client && pnpm exec vitest run src/implementation/runtime-correlation.test.ts src/implementation/ui-implementation-v2-compiler.test.ts src/patch/client-patcher.test.ts
```

- [ ] **Step 3: Implement deterministic variable identity**

Build the name from a normalized state prefix and the first twelve SHA-256 characters of `workspaceId + "\0" + stateId`. Enforce case-insensitive uniqueness. Map boolean/number/text to KF data types 1/2/3; serialize record keys as text and record-key lists as canonical JSON text.

- [ ] **Step 4: Bind variables into trusted native materialization**

Validate every variable operation against the semantic state ID, type, and initial value. Extend correlation equality, hashing, signing, and tamper tests.

- [ ] **Step 5: Run focused tests and type checks; expect PASS**

- [ ] **Step 6: Commit exact Task 3 files**

```bash
git add agent-app/packages/contracts/src/ui-style.ts agent-app/packages/contracts/src/ui-style.test.ts agent-app/packages/contracts/src/creative-build-artifact.test.ts agent-app/packages/domain-client/src/implementation/runtime-correlation.ts agent-app/packages/domain-client/src/implementation/runtime-correlation.test.ts agent-app/packages/domain-client/src/implementation/ui-implementation-v2-compiler.ts agent-app/packages/domain-client/src/implementation/ui-implementation-v2-compiler.test.ts agent-app/packages/domain-client/src/patch/client-patcher.ts agent-app/packages/domain-client/src/patch/client-patcher.test.ts
git commit -m "feat: materialize semantic state as KF variables"
```

### Task 4: Serialize State Writes and Feedback

**Files:**
- Modify: `agent-app/packages/contracts/src/action-graph.ts`
- Test: `agent-app/packages/contracts/src/action-graph.test.ts`
- Modify: `agent-app/packages/domain-client/src/design-knowledge/native-action-capability-registry.ts`
- Test: `agent-app/packages/domain-client/src/design-knowledge/native-action-capability-registry.test.ts`
- Modify: `agent-app/packages/domain-client/src/interaction/action-compiler.ts`
- Test: `agent-app/packages/domain-client/src/interaction/action-compiler.test.ts`
- Modify: `agent-app/packages/domain-client/src/compile/control-compiler.ts`
- Test: `agent-app/packages/domain-client/src/compile/control-compiler.test.ts`
- Modify: `agent-app/packages/domain-client/src/validate/client-validator.ts`
- Test: `agent-app/packages/domain-client/src/validate/client-validator.test.ts`

**Interfaces:**
- Compiled `set-state` includes `targetVariableName`.
- State serializes as `{ action: "setVariable", variableId, value }`.
- Feedback serializes as compiler-owned `ShowMessage({ message, type })` source.

- [ ] **Step 1: Write failing serializer tests**

```ts
expect(serialize(stateAction, binding)).toMatchObject({
  action: "setVariable", variableId: expect.stringMatching(/^\$kf_/), value: true,
});
expect(serialize(feedbackAction, binding).script)
  .toBe('ShowMessage({"message":"保存成功","type":"success"});');
```

Add tamper tests for variable name, message, level, marker, and script bytes.

- [ ] **Step 2: Verify RED**

```bash
cd agent-app/packages/domain-client
pnpm exec vitest run src/interaction/action-compiler.test.ts src/compile/control-compiler.test.ts src/validate/client-validator.test.ts
```

- [ ] **Step 3: Register exact product evidence**

Use this exact product script:

```text
KingFusion3.6_Center/sdb/c7f1771f-0c8f-4c75-9d71-3b8c4b6bd190/kingclient/9fdd3be0-2d91-11f1-b60a-4937cd79e5a1/pagerecord/recordpages/数据共享_共享设备配置20230601175014.json#linkMng.linkList.4.script
SHA-256: 61ab4359b8a7a596282bfd48d7998765d6b9a5607fc58da68225600bd826d673
```

The evidence test must verify exact bytes and examples matching a `$Variable` member assignment and a `ShowMessage` object containing literal `message` and `type` fields.

- [ ] **Step 4: Implement compilation and canonical serialization**

Resolve `stateId` through correlated states and allow literal type-compatible values only. Add a dedicated feedback marker schema, canonical JSON escaping, marker stripping, duplicate checks, validation, and symmetric tamper detection.

- [ ] **Step 5: Run focused tests plus creative materialization regression; expect PASS**

```bash
cd agent-app/packages/domain-client
pnpm exec vitest run src/interaction/action-compiler.test.ts src/compile/control-compiler.test.ts src/validate/client-validator.test.ts src/patch/creative-native-materializer.test.ts
```

- [ ] **Step 6: Commit exact Task 4 files**

```bash
git add agent-app/packages/contracts/src/action-graph.ts agent-app/packages/contracts/src/action-graph.test.ts agent-app/packages/domain-client/src/design-knowledge/native-action-capability-registry.ts agent-app/packages/domain-client/src/design-knowledge/native-action-capability-registry.test.ts agent-app/packages/domain-client/src/interaction/action-compiler.ts agent-app/packages/domain-client/src/interaction/action-compiler.test.ts agent-app/packages/domain-client/src/compile/control-compiler.ts agent-app/packages/domain-client/src/compile/control-compiler.test.ts agent-app/packages/domain-client/src/validate/client-validator.ts agent-app/packages/domain-client/src/validate/client-validator.test.ts
git commit -m "feat: compile KF state and feedback actions"
```

### Task 5: Serialize Reviewed Filter and Form Templates

**Files:**
- Modify: `agent-app/packages/domain-client/src/design-knowledge/script-capability-registry.ts`
- Test: `agent-app/packages/domain-client/src/design-knowledge/script-capability-registry.test.ts`
- Modify: `agent-app/packages/domain-client/src/interaction/semantic-script-api.ts`
- Test: `agent-app/packages/domain-client/src/interaction/semantic-script-api.test.ts`
- Modify: `agent-app/packages/domain-client/src/interaction/script-template-registry.ts`
- Test: `agent-app/packages/domain-client/src/interaction/script-template-registry.test.ts`
- Modify: `agent-app/packages/domain-client/src/interaction/script-compiler.ts`
- Test: `agent-app/packages/domain-client/src/interaction/script-compiler.test.ts`
- Modify: `agent-app/packages/domain-client/src/compile/control-compiler.ts`
- Test: `agent-app/packages/domain-client/src/compile/control-compiler.test.ts`

**Interfaces:**
- Supports reviewed Select/Input reads, Datagrid `SetData`, compiler-owned variable writes, and feedback.
- Semantic calls lower from validated AST; no textual replacement of model source is permitted.

- [ ] **Step 1: Write failing lowering tests**

```ts
expect(compileTemplate(multiFilter)).toContain("Select1.GetCheckedNodes()");
expect(compileTemplate(multiFilter)).toContain("Datagrid1.SetData(filtered)");
expect(compileTemplate(formSubmit)).toContain("Input1.Value");
expect(compileTemplate(formSubmit)).toContain("$Variable.kf_form_submitted = valid");
expect(compileTemplate(formSubmit)).toContain("ShowMessage(");
```

Also prove arbitrary custom source containing those native identifiers is rejected.

- [ ] **Step 2: Verify RED**

```bash
cd agent-app/packages/domain-client
pnpm exec vitest run src/interaction/semantic-script-api.test.ts src/interaction/script-template-registry.test.ts src/interaction/script-compiler.test.ts src/compile/control-compiler.test.ts
```

- [ ] **Step 3: Register exact read/write evidence**

Bind Select `GetCheckedNodes()` to a checked-in product script, retain Input `Value` and Datagrid `SetData` evidence, and reuse Task 4 variable/feedback evidence. Do not promote Input writes, state reads, or persistent mock-data mutation without separate exact evidence.

- [ ] **Step 4: Implement a closed lowering table**

```ts
type ReviewedRuntimeCall =
  | { kind: "read-control"; instanceName: string; expression: "Value" | "GetCheckedNodes()" }
  | { kind: "set-datagrid"; instanceName: string; argument: string }
  | { kind: "set-variable"; variableName: string; argument: string }
  | { kind: "show-message"; level: FeedbackLevel; message: string };
```

- [ ] **Step 5: Enable only complete templates**

Enable `multi-filter` and `form-validate-submit` when every call lowers. Keep master-detail, record mutation, and reset branches requiring unverified writes/storage planned with exact diagnostics.

- [ ] **Step 6: Run focused tests and `interaction-compiler.test.ts`; expect PASS**

- [ ] **Step 7: Commit exact Task 5 files**

```bash
git add agent-app/packages/domain-client/src/design-knowledge/script-capability-registry.ts agent-app/packages/domain-client/src/design-knowledge/script-capability-registry.test.ts agent-app/packages/domain-client/src/interaction/semantic-script-api.ts agent-app/packages/domain-client/src/interaction/semantic-script-api.test.ts agent-app/packages/domain-client/src/interaction/script-template-registry.ts agent-app/packages/domain-client/src/interaction/script-template-registry.test.ts agent-app/packages/domain-client/src/interaction/script-compiler.ts agent-app/packages/domain-client/src/interaction/script-compiler.test.ts agent-app/packages/domain-client/src/compile/control-compiler.ts agent-app/packages/domain-client/src/compile/control-compiler.test.ts
git commit -m "feat: serialize reviewed KF filter and form templates"
```

### Task 6: Lower Recognized Model Intent to Templates

**Files:**
- Create: `agent-app/packages/domain-client/src/interaction/interaction-intent-lowering.ts`
- Test: `agent-app/packages/domain-client/src/interaction/interaction-intent-lowering.test.ts`
- Modify: `agent-app/packages/domain-client/src/interaction/interaction-compiler.ts`
- Test: `agent-app/packages/domain-client/src/interaction/interaction-compiler.test.ts`
- Modify: `agent-app/apps/api/src/conversations/deepseek-model.ts`
- Test: `agent-app/apps/api/src/conversations/deepseek-model.test.ts`

**Interfaces:**
- Produces `lowerReviewedInteractionIntents(plan): SolutionImplementationPlan`.
- Returns immutable validated data and converts only fully parameterized, one-to-one matches.

- [ ] **Step 1: Write failing positive and ambiguity tests**

```ts
const lowered = lowerReviewedInteractionIntents(customFilterFixture());
expect(lowered.scripts[0]).toMatchObject({
  kind: "template",
  template: "multi-filter",
  inputs: expect.arrayContaining([
    expect.objectContaining({ name: "records", refKind: "mock-data" }),
    expect.objectContaining({ name: "criterion-1-value", refKind: "control" }),
  ]),
});
```

Negative cases: missing field, source/output alias, multiple controls, unknown mode, proxy/accessor input, and unrecognized workflow.

- [ ] **Step 2: Verify RED**

```bash
cd agent-app/packages/domain-client
pnpm exec vitest run src/interaction/interaction-intent-lowering.test.ts src/interaction/interaction-compiler.test.ts
```

- [ ] **Step 3: Implement exact-pattern lowering**

Natural-language intent may select a candidate workflow, but every native parameter must come from explicit semantic ports/properties. Require exactly one match and re-parse with `SolutionImplementationPlanSchema`.

- [ ] **Step 4: Integrate before action normalization**

Record a separate server-owned lowered-plan hash; do not claim the lowered bytes equal the raw model plan.

- [ ] **Step 5: Add exact DeepSeek template guidance and prompt assertions**

List `multi-filter` and `form-validate-submit` ports and parameters. Reserve `custom` for unmatched workflows.

- [ ] **Step 6: Run Domain Client and API focused tests; expect PASS**

- [ ] **Step 7: Commit exact Task 6 files**

```bash
git add agent-app/packages/domain-client/src/interaction/interaction-intent-lowering.ts agent-app/packages/domain-client/src/interaction/interaction-intent-lowering.test.ts agent-app/packages/domain-client/src/interaction/interaction-compiler.ts agent-app/packages/domain-client/src/interaction/interaction-compiler.test.ts agent-app/apps/api/src/conversations/deepseek-model.ts agent-app/apps/api/src/conversations/deepseek-model.test.ts
git commit -m "feat: lower interaction intent to reviewed templates"
```

### Task 7: Saved-output End-to-end Regression

**Files:**
- Create: `agent-app/apps/api/src/conversations/fixtures/v4-flash-portfolio-interactions.json`
- Create: `agent-app/apps/api/src/conversations/advanced-interactions.integration.test.ts`
- Modify: `agent-app/apps/api/src/conversations/graph-ports.test.ts`
- Modify: `agent-app/packages/domain-client/src/patch/creative-native-materializer.test.ts`
- Modify: `agent-app/apps/worker/src/job-runner.integration.test.ts`

**Interfaces:**
- Fixture contains sanitized semantic output only; no API key, credentials, tenant/workspace IDs, or executable source.
- Exercises Text-to-Button, state write, Select filter, validation, feedback, navigation, overlays, and unresolved Image click.

- [ ] **Step 1: Write the failing integration test**

```ts
expect(result.diagnostics.errors.filter((entry) =>
  ["INTERACTION_SCRIPT_BLOCKED", "INTERACTION_OUTPUT_CONSUMER_MISSING"].includes(entry.code),
)).toEqual([]);
expect(result.diagnostics.requests).toEqual([
  expect.objectContaining({ reason: "TRIGGER_EVENT_UNSUPPORTED", actionId: "action-open-avatar-overlay" }),
]);
```

- [ ] **Step 2: Verify RED**

```bash
cd agent-app/apps/api
pnpm exec vitest run src/conversations/advanced-interactions.integration.test.ts
```

- [ ] **Step 3: Add sanitized fixture and full assertions**

Derive from `/tmp/kf-solution-output-3.json`, remove environment metadata, and compile through the production graph port. Build through the Worker, validate ZIP, import it, and assert native variable, `setVariable`, `ShowMessage`, Select filter, and Datagrid `SetData` structures. Assert no model-authored source survives.

- [ ] **Step 4: Run API and Worker integration serially; expect PASS**

```bash
cd agent-app/apps/api && pnpm exec vitest run src/conversations/advanced-interactions.integration.test.ts src/conversations/graph-ports.test.ts
cd ../worker && KINGCLIENT_NATIVE_ACCEPTED=true pnpm exec vitest run src/job-runner.integration.test.ts
```

- [ ] **Step 5: Commit exact Task 7 files**

```bash
git add agent-app/apps/api/src/conversations/fixtures/v4-flash-portfolio-interactions.json agent-app/apps/api/src/conversations/advanced-interactions.integration.test.ts agent-app/apps/api/src/conversations/graph-ports.test.ts agent-app/packages/domain-client/src/patch/creative-native-materializer.test.ts agent-app/apps/worker/src/job-runner.integration.test.ts
git commit -m "test: cover advanced KF interactions end to end"
```

### Task 8: Full Verification and Delivery Report

**Files:**
- Create: `docs/superpowers/reports/2026-08-29-kf-advanced-interactions-verification.md`

**Interfaces:**
- Produces a durable report with supported interactions, remaining warnings, test evidence, package hash, and manual KF checklist.

- [ ] **Step 1: Run all checks serially by package**

```bash
cd agent-app/packages/contracts && pnpm test && pnpm typecheck && pnpm lint
cd ../domain-client && pnpm test && pnpm typecheck && pnpm lint
cd ../../apps/api && pnpm test && pnpm typecheck && pnpm lint
cd ../worker && KINGCLIENT_NATIVE_ACCEPTED=true pnpm test && pnpm typecheck && pnpm lint
cd ../web && pnpm test && pnpm typecheck && pnpm lint && pnpm build
```

- [ ] **Step 2: Build the saved fixture without calling DeepSeek**

Start API and Worker with the bundled Node runtime, enqueue the sanitized fixture, wait for `SUCCEEDED`, download the package, and run `unzip -t`.

- [ ] **Step 3: Write exact results into the report**

Include commit IDs, commands and counts, package path/size/SHA-256, implemented interaction kinds, unresolved evidence gaps, and KF manual checks for import, navigation, overlay, filter, feedback, and state.

- [ ] **Step 4: Verify hygiene**

```bash
git diff --check
git status --short
rg -n 'sk-[A-Za-z0-9]+' agent-app docs --glob '!node_modules/**' --glob '!.env'
```

Expected: no whitespace errors, temporary source, or secret matches; only known user-owned unrelated changes remain.

- [ ] **Step 5: Commit the report**

```bash
git add docs/superpowers/reports/2026-08-29-kf-advanced-interactions-verification.md
git commit -m "docs: verify advanced KF interactions"
```
