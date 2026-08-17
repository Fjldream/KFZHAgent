# KF Interaction and Script Compilation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compile complete front-end demo interaction loops into KF native actions, verified script templates, or constrained custom JavaScript without enabling backend, network, or arbitrary runtime access.

**Architecture:** Normalize semantic actions into an `ActionGraph`, resolve the cheapest supported implementation tier, and compile event bindings against phase-one script capability knowledge. Template scripts are generated from typed parameters; custom scripts are parsed with an AST, checked against a semantic API allowlist, rewritten from stable IDs to compiler-owned KF instance names, and serialized into reviewed KF event/configuration fields.

**Tech Stack:** TypeScript ES modules, Zod 4, Vitest, Acorn AST parser with estree-walker, existing KF control templates/compiler, pnpm workspace, `@kf/contracts`, `@kf/domain-client`.

## Global Constraints

- Target runtime is KingFusion 3.6.
- Supported scope is front-end demonstration only: page navigation, Overlay open/close, filtering, selection/detail, Tabs, local record changes, form validation, simulated submit, feedback, and bounded timed demonstration.
- Real APIs, devices, variables, databases, credentials, file-system access, dynamic script loading, and external network requests are out of scope.
- NativeAction is preferred over ScriptTemplate; ScriptTemplate is preferred over CustomScript.
- CustomScript is allowed only when no registered template satisfies the declared interaction.
- Model scripts use stable semantic APIs and IDs, never KF instance names, GUIDs, `linkId`, selectors, or DOM access.
- Every emitted event/method must exist in `ScriptCapabilityProfile` with `availability: supported` and repository evidence.
- Parsing, reference resolution, API checks, rewriting, and serialization are deterministic and do not call a model.
- Block `eval`, `Function`, imports, dynamic import, fetch/XHR/WebSocket, DOM globals, prototype mutation, unbounded loops, recursion, and unknown globals.
- Loop bounds are statically known and at most 1,000 iterations; timers are at least 100 ms, at most 60 seconds, and at most 10 repetitions.
- Existing native `navigatePage` and `setVariable` actions remain compatible.
- Use TDD for every task and commit only the files named by that task.

---

## File Structure

### Contracts

- Create `agent-app/packages/contracts/src/action-graph.ts`: normalized actions, conditions, effects, and bindings.
- Create `agent-app/packages/contracts/src/action-graph.test.ts`: reference and bounded-condition tests.
- Create `agent-app/packages/contracts/src/script-program.ts`: template/custom script inputs and compiled script output.
- Create `agent-app/packages/contracts/src/script-program.test.ts`: source bounds and binding strictness.
- Modify `agent-app/packages/contracts/src/design-knowledge.ts`: add evidence-backed readable/writable runtime properties.
- Modify `agent-app/packages/contracts/src/design-knowledge.test.ts`: supported property evidence tests.
- Modify `agent-app/packages/contracts/src/solution-implementation-plan.ts`: reference canonical action/script schemas.
- Modify `agent-app/packages/contracts/src/ui-style.ts`: type v2 event bindings and compiled script modules.
- Modify `agent-app/packages/contracts/src/index.ts`: export action/script contracts.

### Action and script compilers

- Create `agent-app/packages/domain-client/src/interaction/action-graph.ts`: normalize and validate interaction graphs.
- Create `agent-app/packages/domain-client/src/interaction/action-graph.test.ts`: dependency order and cycle tests.
- Create `agent-app/packages/domain-client/src/interaction/action-compiler.ts`: NativeAction and tier selection.
- Create `agent-app/packages/domain-client/src/interaction/action-compiler.test.ts`: page, overlay, visibility, tabs, and feedback tests.
- Create `agent-app/packages/domain-client/src/interaction/script-template-registry.ts`: five reviewed front-end templates.
- Create `agent-app/packages/domain-client/src/interaction/script-template-registry.test.ts`: exact generated scripts.
- Create `agent-app/packages/domain-client/src/interaction/semantic-script-api.ts`: stable semantic API and KF mapping.
- Create `agent-app/packages/domain-client/src/interaction/semantic-script-api.test.ts`: event/method evidence tests.
- Modify `agent-app/packages/domain-client/src/design-knowledge/script-capability-registry.ts`: promote only reviewed runtime properties and methods.
- Modify `agent-app/packages/domain-client/src/design-knowledge/script-capability-registry.test.ts`: exact product/template evidence assertions.
- Create `agent-app/packages/domain-client/src/interaction/custom-script-validator.ts`: AST safety checks.
- Create `agent-app/packages/domain-client/src/interaction/custom-script-validator.test.ts`: allowed and forbidden syntax matrix.
- Create `agent-app/packages/domain-client/src/interaction/script-compiler.ts`: template/custom compilation and KF serialization.
- Create `agent-app/packages/domain-client/src/interaction/script-compiler.test.ts`: rewrite and event output tests.
- Create `agent-app/packages/domain-client/src/interaction/interaction-compiler.ts`: coordinate graph, actions, scripts, and UI v2.
- Create `agent-app/packages/domain-client/src/interaction/interaction-compiler.test.ts`: full front-end loops.
- Modify `agent-app/packages/domain-client/src/compile/control-compiler.ts`: serialize compiled event bindings and configuration scripts.
- Modify `agent-app/packages/domain-client/src/compile/control-compiler.test.ts`: preserve old actions and add reviewed scripts.
- Modify `agent-app/packages/domain-client/src/validate/client-validator.ts`: JavaScript syntax/reference/API checks.
- Modify `agent-app/packages/domain-client/src/validate/client-validator.test.ts`: blocking script failures.
- Modify `agent-app/packages/domain-client/src/index.ts`: export interaction compiler.
- Modify `agent-app/packages/domain-client/package.json`: promote workspace-locked `acorn` and `estree-walker` to direct dependencies.
- Modify `agent-app/pnpm-lock.yaml`: lock exact resolved dependencies.

---

### Task 1: Define strict ActionGraph and script program contracts

**Files:**
- Create: `agent-app/packages/contracts/src/action-graph.ts`
- Create: `agent-app/packages/contracts/src/action-graph.test.ts`
- Create: `agent-app/packages/contracts/src/script-program.ts`
- Create: `agent-app/packages/contracts/src/script-program.test.ts`
- Modify: `agent-app/packages/contracts/src/design-knowledge.ts`
- Modify: `agent-app/packages/contracts/src/design-knowledge.test.ts`
- Modify: `agent-app/packages/contracts/src/solution-implementation-plan.ts`
- Modify: `agent-app/packages/contracts/src/ui-style.ts`
- Modify: `agent-app/packages/contracts/src/index.ts`

**Interfaces:**
- Consumes: stable page/control/overlay/state/mock-data IDs from the semantic plan.
- Produces: `ActionGraphSchema`, `ActionGraph`, `ScriptPlanSchema`, `CompiledScriptModuleSchema`, `CompiledEventBindingSchema`, and script-capability runtime-property records.

- [ ] **Step 1: Write failing contract tests**

```ts
expect(ActionGraphSchema.parse(filterGraphFixture).actions).toHaveLength(3);
expect(ActionGraphSchema.safeParse(graphWithUnknownTarget).success).toBe(false);
expect(ActionGraphSchema.safeParse(graphWithCycle).success).toBe(false);
expect(ScriptPlanSchema.safeParse({
  kind: "custom",
  id: "load-records",
  purpose: "加载服务器记录",
  inputs: [], outputs: [], bindings: [], source: "fetch('/api/records')",
}).success).toBe(false);
```

- [ ] **Step 2: Run tests and verify the contract modules are missing**

```bash
pnpm --dir agent-app --filter @kf/contracts exec vitest run src/action-graph.test.ts src/script-program.test.ts
```

- [ ] **Step 3: Implement canonical action contracts**

```ts
export const ActionEffectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("navigate-page"), targetPageId: stableId }).strict(),
  z.object({ kind: z.literal("open-overlay"), overlayId: stableId }).strict(),
  z.object({ kind: z.literal("close-overlay"), overlayId: stableId, result: jsonScalar.optional() }).strict(),
  z.object({ kind: z.literal("set-visibility"), targetId: stableId, visible: z.boolean() }).strict(),
  z.object({ kind: z.literal("switch-tab"), targetId: stableId, tabId: stableId }).strict(),
  z.object({ kind: z.literal("set-state"), stateId: stableId, value: boundedJson }).strict(),
  z.object({ kind: z.literal("set-control-value"), targetId: stableId, value: ValueExpressionSchema }).strict(),
  z.object({ kind: z.literal("show-feedback"), level: z.enum(["success", "info", "warning", "error"]), message: text }).strict(),
  z.object({ kind: z.literal("run-script"), scriptId: stableId }).strict(),
]);
```

An action has one trigger `{ controlId, semanticEvent }`, optional bounded boolean conditions, ordered effects, and optional `afterActionIds`. Reject unknown references, duplicate IDs, dependency cycles, and effects with no user-visible or state-visible result.

- [ ] **Step 4: Implement script input/output and compiled output contracts**

`ScriptPlanSchema` distinguishes `template` and `custom`. Both declare purpose, typed inputs/outputs, and event bindings. Custom source is 1–8,000 characters and is rejected at schema level if it contains obvious forbidden tokens such as `fetch`, `XMLHttpRequest`, `WebSocket`, `eval`, `Function`, `document`, `window`, `globalThis`, `import(`, or `require(`; AST enforcement remains authoritative. Compiled modules contain compiler-owned instance references, initialization placement `event | configure-data`, and source hash.

Extend `ScriptCapabilityProfileSchema` with `properties`. Each member contains `semanticProperty`, `kfProperty`, `readable`, `writable`, `availability`, and evidence. The supported-evidence refinement used by events and methods also applies to properties, so `Value`-style access is explicit rather than represented as invented `GetValue`/`SetValue` methods.

- [ ] **Step 5: Run contract verification**

```bash
pnpm --dir agent-app --filter @kf/contracts exec vitest run src/action-graph.test.ts src/script-program.test.ts src/solution-implementation-plan.test.ts src/ui-style.test.ts
pnpm --dir agent-app --filter @kf/contracts typecheck
pnpm --dir agent-app --filter @kf/contracts lint
```

- [ ] **Step 6: Commit action/script contracts**

```bash
git add agent-app/packages/contracts/src/action-graph.ts agent-app/packages/contracts/src/action-graph.test.ts agent-app/packages/contracts/src/script-program.ts agent-app/packages/contracts/src/script-program.test.ts agent-app/packages/contracts/src/design-knowledge.ts agent-app/packages/contracts/src/design-knowledge.test.ts agent-app/packages/contracts/src/solution-implementation-plan.ts agent-app/packages/contracts/src/ui-style.ts agent-app/packages/contracts/src/index.ts
git commit -m "feat: define KF action and script contracts"
```

---

### Task 2: Normalize ActionGraph and compile NativeActions

**Files:**
- Create: `agent-app/packages/domain-client/src/interaction/action-graph.ts`
- Create: `agent-app/packages/domain-client/src/interaction/action-graph.test.ts`
- Create: `agent-app/packages/domain-client/src/interaction/action-compiler.ts`
- Create: `agent-app/packages/domain-client/src/interaction/action-compiler.test.ts`

**Interfaces:**
- Consumes: semantic actions, v2 control/page/overlay index, and script capability profiles.
- Produces: `normalizeActionGraph()` and `compileNativeActions()`.

- [ ] **Step 1: Write failing normalization and native-action tests**

```ts
expect(normalizeActionGraph(graphFixture).executionOrder).toEqual(["open-detail", "populate-detail"]);
expect(compileNativeActions(navigationFixture).bindings[0]?.nativeAction).toEqual({ action: "navigatePage", pageId: "page-guid-detail" });
expect(compileNativeActions(openDialogFixture).bindings[0]?.nativeAction.kind).toBe("open-overlay");
expect(compileNativeActions(complexFilterFixture).scriptRequests[0]?.templateId).toBe("multi-filter");
```

- [ ] **Step 2: Run focused tests and verify missing modules**

```bash
pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/interaction/action-graph.test.ts src/interaction/action-compiler.test.ts
```

- [ ] **Step 3: Implement graph normalization**

Build page/control/overlay/state/script indexes, resolve semantic events against phase-one knowledge, topologically sort dependencies with code-point ID tie-breaks, and classify each action as `native`, `template`, or `custom`. Return node-specific errors for unknown events or targets.

- [ ] **Step 4: Implement NativeAction compilation**

Compile page navigation, Overlay open/close, visibility, Tabs switch, simple state/value assignment, and feedback without generating JavaScript where KF has reviewed native support. If an effect group needs record iteration, cross-control data transfer, validation, or calculation, emit a typed script request instead of concatenating JavaScript.

- [ ] **Step 5: Run action and legacy control tests**

```bash
pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/interaction/action-graph.test.ts src/interaction/action-compiler.test.ts src/compile/control-compiler.test.ts
pnpm --dir agent-app --filter @kf/domain-client typecheck
```

- [ ] **Step 6: Commit action compilation**

```bash
git add agent-app/packages/domain-client/src/interaction/action-graph.ts agent-app/packages/domain-client/src/interaction/action-graph.test.ts agent-app/packages/domain-client/src/interaction/action-compiler.ts agent-app/packages/domain-client/src/interaction/action-compiler.test.ts
git commit -m "feat: compile KF native interaction actions"
```

---

### Task 3: Build the reviewed script template registry

**Files:**
- Create: `agent-app/packages/domain-client/src/interaction/script-template-registry.ts`
- Create: `agent-app/packages/domain-client/src/interaction/script-template-registry.test.ts`

**Interfaces:**
- Consumes: typed semantic IDs and template parameters.
- Produces: `listScriptTemplates()`, `requireScriptTemplate()`, and `renderScriptTemplate()`.

- [ ] **Step 1: Write failing exact-output tests**

```ts
expect(listScriptTemplates().map((template) => template.id)).toEqual([
  "form-validate-submit", "master-detail-fill", "multi-filter", "record-mutate", "reset-controls",
]);
expect(renderScriptTemplate("multi-filter", filterParams)).toEqual(expectedMultiFilterSemanticSource);
expect(() => renderScriptTemplate("record-mutate", { ...params, operation: "network-sync" }))
  .toThrow(/SCRIPT_TEMPLATE_PARAMETER_INVALID/);
```

- [ ] **Step 2: Run the test and verify registry absence**

Run: `pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/interaction/script-template-registry.test.ts`

- [ ] **Step 3: Implement five immutable templates**

Templates cover multi-condition filtering, selected-record detail fill, form validation with simulated submit, local append/update/delete, and reset. Templates return semantic API source only; they never contain GUIDs, instance names, selectors, network calls, or native KF event IDs. Parse parameters with strict Zod schemas and deep-freeze registry output.

- [ ] **Step 4: Run tests and typecheck**

```bash
pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/interaction/script-template-registry.test.ts
pnpm --dir agent-app --filter @kf/domain-client typecheck
```

- [ ] **Step 5: Commit templates**

```bash
git add agent-app/packages/domain-client/src/interaction/script-template-registry.ts agent-app/packages/domain-client/src/interaction/script-template-registry.test.ts
git commit -m "feat: add reviewed KF script templates"
```

---

### Task 4: Define semantic script APIs backed by KF evidence

**Files:**
- Create: `agent-app/packages/domain-client/src/interaction/semantic-script-api.ts`
- Create: `agent-app/packages/domain-client/src/interaction/semantic-script-api.test.ts`
- Modify: `agent-app/packages/domain-client/src/design-knowledge/script-capability-registry.ts`
- Modify: `agent-app/packages/domain-client/src/design-knowledge/script-capability-registry.test.ts`

**Interfaces:**
- Consumes: phase-one `ScriptCapabilityProfile`, compiled control instance index, page GUID index, and local state/data IDs.
- Produces: `resolveSemanticApiCall()` and `resolveEventBinding()`.

- [ ] **Step 1: Write failing API resolution tests**

```ts
expect(resolveSemanticApiCall(call("$control.getValue", "status-filter"), context)).toMatchObject({ instanceName: "Select1", access: "property-read", kfProperty: "Value" });
expect(resolveEventBinding({ controlId: "status-filter", semanticEvent: "change" }, context)).toMatchObject({ kfEvent: "Change" });
expect(() => resolveSemanticApiCall(call("$control.deleteAll", "records"), context)).toThrow(/SCRIPT_METHOD_UNSUPPORTED/);
expect(() => resolveEventBinding({ controlId: "records", semanticEvent: "change" }, plannedOnlyContext)).toThrow(/SCRIPT_EVENT_NOT_SUPPORTED/);
```

- [ ] **Step 2: Run the test and verify API resolver absence**

Run: `pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/interaction/semantic-script-api.test.ts`

- [ ] **Step 3: Promote only product-evidenced runtime access**

Add supported property/method records only when an existing KF 3.6 page or reviewed control template demonstrates the exact spelling. The baseline includes input/select value read/write through the reviewed `Value` property strategy and Datagrid `SetData`. Use exact evidence records from `KingFusion3.6_Node/sdb/kingclient/bbb85040-d19b-11f0-b646-250384722929/e91a8070-d94e-11f0-bc3d-dbe5f779bd94/pagerecord/recordpages/修改班组20230718142335.json` for `Select*.Value`, and `KingFusion3.6_Center/sdb/c7f1771f-0c8f-4c75-9d71-3b8c4b6bd190/kingclient/9fdd3be0-2d91-11f1-b60a-4937cd79e5a1/pagerecord/recordpages/数据模型管理_属性定义20230511104433.json` for `input1.Value` and `Table1.SetData`. Evidence stores the repository path plus the matched script SHA-256 so later page reformatting cannot silently change the claim. Selection retrieval uses the reviewed row/selection event argument unless an exact `GetSelected` spelling has product evidence; a planned method is never callable.

- [ ] **Step 4: Implement the stable API namespaces**

Allow only `$control.getValue`, `$control.setValue`, `$control.setData`, `$event.record`, `$control.setVisible`, `$control.setEnabled`, `$page.navigate`, `$overlay.open`, `$overlay.close`, `$state.get`, `$state.set`, `$data.get`, `$data.set`, `$feedback.show`, `$timer.after`, and `$timer.repeat`. Every control call resolves through compiled stable IDs and supported property/method evidence. `$event.record` is available only on a reviewed row/selection event whose argument profile declares a record. Page, Overlay, feedback, and timer globals are registered with exact product-source evidence in `semantic-script-api.ts`. Local state/data APIs compile to one namespaced page-local runtime object, never browser storage or globals.

- [ ] **Step 5: Run resolver and knowledge tests**

```bash
pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/interaction/semantic-script-api.test.ts src/design-knowledge/script-capability-registry.test.ts
pnpm --dir agent-app --filter @kf/domain-client typecheck
```

- [ ] **Step 6: Commit semantic API mapping**

```bash
git add agent-app/packages/domain-client/src/interaction/semantic-script-api.ts agent-app/packages/domain-client/src/interaction/semantic-script-api.test.ts agent-app/packages/domain-client/src/design-knowledge/script-capability-registry.ts agent-app/packages/domain-client/src/design-knowledge/script-capability-registry.test.ts
git commit -m "feat: resolve semantic KF script APIs"
```

---

### Task 5: Validate constrained custom JavaScript with an AST

**Files:**
- Create: `agent-app/packages/domain-client/src/interaction/custom-script-validator.ts`
- Create: `agent-app/packages/domain-client/src/interaction/custom-script-validator.test.ts`
- Modify: `agent-app/packages/domain-client/package.json`
- Modify: `agent-app/pnpm-lock.yaml`

**Interfaces:**
- Consumes: custom semantic source and declared input/output IDs.
- Produces: `validateCustomScript(input): ValidatedScriptAst`.

- [ ] **Step 1: Add direct parser dependencies**

Run:

```bash
pnpm --dir agent-app --filter @kf/domain-client add acorn@8.18.0 estree-walker@3.0.3
```

Expected: only the `domain-client` importer in `package.json`/`pnpm-lock.yaml` changes; both exact package versions already exist in the workspace lockfile.

- [ ] **Step 2: Write failing allowed/forbidden AST tests**

```ts
expect(validateCustomScript({ source: allowedFilterSource, inputs: ["records", "status"], outputs: ["filtered-records"] }).calls)
  .toContainEqual(expect.objectContaining({ namespace: "$data", method: "set" }));
for (const source of [
  "fetch('/x')", "eval('1')", "new Function('return 1')", "document.querySelector('x')",
  "while(true){}", "for(;;){}", "Object.prototype.x=1", "import('x')", "window.location='x'",
]) {
  expect(() => validateCustomScript({ source, inputs: [], outputs: [] })).toThrow(/CUSTOM_SCRIPT_FORBIDDEN/);
}
```

- [ ] **Step 3: Run the test and verify validator absence**

Run: `pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/interaction/custom-script-validator.test.ts`

- [ ] **Step 4: Implement AST allowlisting**

Parse as ECMAScript 2022 script, not module. Allow literals, arrays/objects, local `const`/`let`, bounded `for`/`for...of`, `if`, conditional/logical/arithmetic expressions, approved array methods, approved `Math`/`String`/`Number`/`Date` conversions, functions without recursion, and semantic API calls. Reject assignments to undeclared/global objects, computed calls on unknown values, getters/setters/classes/imports, tagged templates, regex with unsafe nested quantifiers, and ASTs above 2,000 nodes or nesting depth 32. Verify declared inputs are read only through semantic APIs and declared outputs match writes.

- [ ] **Step 5: Run security tests, typecheck, and dependency audit**

```bash
pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/interaction/custom-script-validator.test.ts
pnpm --dir agent-app --filter @kf/domain-client typecheck
pnpm --dir agent-app --filter @kf/domain-client lint
pnpm --dir agent-app audit --prod
```

- [ ] **Step 6: Commit AST validation**

```bash
git add agent-app/packages/domain-client/src/interaction/custom-script-validator.ts agent-app/packages/domain-client/src/interaction/custom-script-validator.test.ts agent-app/packages/domain-client/package.json agent-app/pnpm-lock.yaml
git commit -m "feat: validate constrained KF scripts"
```

---

### Task 6: Compile and serialize scripts into KF controls

**Files:**
- Create: `agent-app/packages/domain-client/src/interaction/script-compiler.ts`
- Create: `agent-app/packages/domain-client/src/interaction/script-compiler.test.ts`
- Modify: `agent-app/packages/domain-client/src/compile/control-compiler.ts`
- Modify: `agent-app/packages/domain-client/src/compile/control-compiler.test.ts`

**Interfaces:**
- Consumes: template/custom script plan, validated AST, semantic API resolver, event bindings, and compiled instance index.
- Produces: `compileScriptPlan()` and control properties containing reviewed `linkMng`/`configureData` updates.

- [ ] **Step 1: Write failing rewrite and serialization tests**

```ts
const compiled = compileScriptPlan(customDetailScript, compileContext);
expect(compiled.source).toContain("Select1");
expect(compiled.source).toContain("DataGrid1");
expect(compiled.source).not.toContain("status-filter");
expect(compiled.source).not.toContain("$control");
expect(compileControl(buttonWithScript).linkMng.linkList[0]).toMatchObject({ eventName: "Click" });
expect(compileControl(buttonWithScript).linkMng.linkList[0].script).toBe(compiled.source);
```

- [ ] **Step 2: Run tests and verify script compilation is absent**

```bash
pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/interaction/script-compiler.test.ts src/compile/control-compiler.test.ts
```

- [ ] **Step 3: Implement AST rewriting and deterministic code generation**

Rewrite only validated semantic call nodes. Escape all string literals through the generator, sort object keys when semantics do not depend on insertion, and emit semicolon-terminated source with a SHA-256 hash. Map event bindings using evidence-backed KF event names and optional `linkId`. Merge into existing `linkMng` without discarding unknown template fields. Use `configureData` only when the capability profile permits it and the script declares initialization placement.

- [ ] **Step 4: Preserve legacy action behavior**

Keep existing `navigatePage` and `setVariable` serialization byte-equivalent for v1 inputs. Reject a control that receives two compiled bindings for the same KF event and phase unless the contract declares an explicit ordered chain.

- [ ] **Step 5: Run compiler regressions**

```bash
pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/interaction/script-compiler.test.ts src/compile/control-compiler.test.ts src/templates/merge-template.test.ts
pnpm --dir agent-app --filter @kf/domain-client typecheck
```

- [ ] **Step 6: Commit script serialization**

```bash
git add agent-app/packages/domain-client/src/interaction/script-compiler.ts agent-app/packages/domain-client/src/interaction/script-compiler.test.ts agent-app/packages/domain-client/src/compile/control-compiler.ts agent-app/packages/domain-client/src/compile/control-compiler.test.ts
git commit -m "feat: compile scripts into KF events"
```

---

### Task 7: Coordinate interaction compilation and static validation

**Files:**
- Create: `agent-app/packages/domain-client/src/interaction/interaction-compiler.ts`
- Create: `agent-app/packages/domain-client/src/interaction/interaction-compiler.test.ts`
- Modify: `agent-app/packages/domain-client/src/validate/client-validator.ts`
- Modify: `agent-app/packages/domain-client/src/validate/client-validator.test.ts`
- Modify: `agent-app/packages/domain-client/src/index.ts`

**Interfaces:**
- Consumes: semantic plan and phase-three `UIImplementationSpecV2`.
- Produces: `compileInteractions(input): UIImplementationSpecV2` with compiled bindings/modules and interaction diagnostics.

- [ ] **Step 1: Write failing complete-loop tests**

```ts
const result = compileInteractions(visitorApprovalFixture);
expect(result.diagnostics.errors).toEqual([]);
expect(traceDemo(result.implementation, "filter-open-approve")).toEqual([
  "filter-records", "select-record", "open-detail", "validate-form", "show-success", "close-detail", "update-record",
]);
expect(result.implementation.compiledScripts.length).toBeGreaterThan(0);
expect(result.implementation.compiledScripts.every((script) => script.sourceHash.length === 64)).toBe(true);
```

- [ ] **Step 2: Run interaction tests and verify coordinator absence**

Run: `pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/interaction/interaction-compiler.test.ts`

- [ ] **Step 3: Implement tier selection and closed-loop coverage**

Normalize actions, compile native effects, render requested templates, validate/compile custom scripts, attach event bindings, and return deterministic diagnostics. Each blueprint acceptance journey must map to at least one trigger-to-visible-result path. Missing triggers, unreachable effects, or output state with no consumer are blocking errors.

- [ ] **Step 4: Extend project validation**

Parse every emitted script with Acorn, verify hashes, event/method mappings, target instances, declared inputs/outputs, forbidden APIs, and `linkMng` shape. Add script/reference issues to `businessRules` and `references`; syntax, unknown method, missing target, or forbidden API fails validation. Unverified runtime evidence remains a warning.

- [ ] **Step 5: Run full phase-four verification**

```bash
pnpm --dir agent-app --filter @kf/contracts test
pnpm --dir agent-app --filter @kf/domain-client test
pnpm --dir agent-app --filter @kf/contracts typecheck
pnpm --dir agent-app --filter @kf/domain-client typecheck
pnpm --dir agent-app --filter @kf/contracts lint
pnpm --dir agent-app --filter @kf/domain-client lint
git diff --check
```

- [ ] **Step 6: Commit integrated interactions**

```bash
git add agent-app/packages/domain-client/src/interaction/interaction-compiler.ts agent-app/packages/domain-client/src/interaction/interaction-compiler.test.ts agent-app/packages/domain-client/src/validate/client-validator.ts agent-app/packages/domain-client/src/validate/client-validator.test.ts agent-app/packages/domain-client/src/index.ts
git commit -m "feat: complete KF front-end interaction loops"
```

---

## Completion Gate

Phase 4 is complete only when:

- navigation, Overlay, visibility, Tabs, feedback, simple state/value changes use NativeAction when supported;
- multi-filter, master-detail, validation/submit, local record mutation, and reset use reviewed templates;
- a valid bounded custom script compiles through AST validation and stable-ID rewriting;
- every emitted KF event and method is evidence-backed and supported;
- network, DOM, dynamic code, global mutation, imports, unbounded loops, and unknown APIs are rejected;
- legacy `navigatePage` and `setVariable` output remains compatible;
- visitor approval, record filtering/detail, Tabs, and simulated form submission fixtures each form a trigger-to-visible-result loop;
- the client validator blocks invalid scripts and reports unverified runtime evidence only as a warning;
- contracts and domain-client tests/typechecks/lints pass.
