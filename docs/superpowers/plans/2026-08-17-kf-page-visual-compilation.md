# KF Page and Visual Compilation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compile semantic solution trees into content-driven KF page geometry, native controls, repeaters, overlays, and scoped visual output represented by backward-compatible `UIImplementationSpec v2`.

**Architecture:** A deterministic compiler pipeline expands modules and repeaters, measures intrinsic content, recursively solves semantic layouts, maps controls and overlays to KF capabilities, and resolves three-level style inheritance. It emits a v2 implementation snapshot containing concrete geometry and compiled style artifacts while leaving actions and scripts declarative for phase 4.

**Tech Stack:** TypeScript ES modules, Zod 4, Vitest, existing KF templates/module compiler/style engine, pnpm workspace, `@kf/contracts`, `@kf/domain-client`.

**Spec:** `docs/superpowers/specs/2026-08-17-kf-creative-solution-generation-design.md`

## Global Constraints

- Target runtime is KingFusion 3.6.
- Native input is a validated `kf-solution-implementation/v1` snapshot plus the exact signed candidate bundle accepted by `assertSolutionPlanUsesCandidates()`. The isolated legacy ModulePlan compatibility branch is accepted through its reserved discriminator and the Module Registry, without fabricating a candidate bundle.
- Layout, GUIDs, instance names, selectors, CSS scoping, native properties, and page height are compiler-owned.
- The model never supplies final coordinates, selectors, complete CSS rules, KF native JSON, or `styleDataNew`.
- Canvas widths are compiler-owned and deterministic: `responsive` and `desktop` compile at 1440 px, while `large-display` compiles at 1920 px. Default height is content-driven, not 900 or another fixed viewport.
- Layout failure recovery order is: preferred layout, compress spacing, reduce columns, increase content height, enable declared local scrolling, then fail with a node-specific error.
- The compiler must not delete content, overlap controls, shrink text below declared minimums, or use oversized pages to hide failures.
- `spacious` changes rhythm and surface spacing but must not create large empty regions.
- Style inheritance order is `Theme Tokens → Role Styles → Instance Overrides`.
- Advanced style declarations are property/value whitelisted and automatically scoped; raw selectors and global CSS are rejected.
- Existing `kf-ui-implementation/v1` remains parseable and converts to the v2 subset.
- Registered modules are validated independently with `ModuleRegistry.require(kind, version)` and the registered variant list; they are intentionally not members of `CapabilityCandidateBundle`.
- The current Module Registry declares asset slots, not semantic child slots. Native plans with non-empty `RegisteredModuleNode.slots` already fail the candidate boundary and the visual compiler must fail closed if called without that boundary.
- Phase 3 does not change graph routing, ChangePlan compilation, Worker/build queues, download behavior, or the frozen static preview.
- This phase does not compile ActionGraph or JavaScript and does not wire the Worker/build queue.
- Existing static preview remains frozen and is not extended.
- Domain-client full-suite verification must have zero failures. When `/tmp/kf_ref/1.0.0.1/project/page/...` is absent, exactly five real-Golden tests may be reported as skipped (three control-compiler Golden checks and two inspector Golden checks); all synthetic and collected tests still run.
- Use TDD for every task and commit only the files named by that task.

---

## File Structure

### Contracts

- Modify `agent-app/packages/contracts/src/solution-implementation-plan.ts`: add a bounded repeater-item field reference needed to materialize record cards.
- Modify `agent-app/packages/contracts/src/solution-implementation-plan.test.ts`: reference scope, alias, field, and legacy compatibility tests.
- Modify `agent-app/packages/contracts/src/ui-style.ts`: richer token/style contracts and `UIImplementationSpec v2`.
- Modify `agent-app/packages/contracts/src/ui-style.test.ts`: v1 compatibility, v2 strictness, and advanced-style rejection.
- Modify `agent-app/apps/api/src/conversations/deepseek-model.ts`: expose the exact repeater-field reference shape in the semantic-plan skeleton.
- Modify `agent-app/apps/api/src/conversations/deepseek-model.test.ts`: captured-request contract-shape assertion.

### Layout and component compilation

- Create `agent-app/packages/domain-client/src/solution-compile/intrinsic-measure.ts`: text/control/module intrinsic sizing.
- Create `agent-app/packages/domain-client/src/solution-compile/intrinsic-measure.test.ts`: wrapping and min/preferred/max tests.
- Create `agent-app/packages/domain-client/src/solution-compile/layout-compiler.ts`: recursive layout solver.
- Create `agent-app/packages/domain-client/src/solution-compile/layout-compiler.test.ts`: nested, asymmetric, density, and failure tests.
- Create `agent-app/packages/domain-client/src/solution-compile/component-compiler.ts`: controls, repeaters, and overlays.
- Create `agent-app/packages/domain-client/src/solution-compile/component-compiler.test.ts`: expansion, native property, and parent tests.
- Create `agent-app/packages/domain-client/src/solution-compile/module-node-compiler.ts`: bridge existing registered modules into the new tree.
- Create `agent-app/packages/domain-client/src/solution-compile/module-node-compiler.test.ts`: module output and source mapping tests.
- Modify `agent-app/packages/domain-client/src/planning/capability-retrieval.ts`: export the single reviewed semantic-layout compatibility lookup used by retrieval and compilation.
- Modify `agent-app/packages/domain-client/src/planning/capability-retrieval.test.ts`: prove compiler lookup and retrieval filtering share the same mapping.
- Create `agent-app/packages/domain-client/src/solution-compile/solution-compiler.ts`: deterministic phase coordinator.
- Create `agent-app/packages/domain-client/src/solution-compile/solution-compiler.test.ts`: complete portal/admin/dashboard snapshots.

### Style compilation

- Create `agent-app/packages/domain-client/src/style/advanced-style.ts`: bounded advanced value parser.
- Create `agent-app/packages/domain-client/src/style/advanced-style.test.ts`: whitelist and injection tests.
- Modify `agent-app/packages/domain-client/src/style/theme-resolver.ts`: three-level v2 tokens/roles/instance inheritance.
- Modify `agent-app/packages/domain-client/src/style/theme-resolver.test.ts`: precedence and token resolution.
- Modify `agent-app/packages/domain-client/src/style/css-compiler.ts`: semantic parts and scoped state CSS.
- Modify `agent-app/packages/domain-client/src/style/css-compiler.test.ts`: selector ownership and state output.
- Modify `agent-app/packages/domain-client/src/style/style-adapter.ts`: part-aware adapter interface.
- Modify `agent-app/packages/domain-client/src/style/adapters/base-adapters.ts`: high-frequency part adapters.
- Modify `agent-app/packages/domain-client/src/style/adapters/base-adapters.test.ts`: native versus CSS field tests.
- Modify `agent-app/packages/domain-client/src/style/runtime-profile.ts`: reviewed part selector ownership.
- Modify `agent-app/packages/domain-client/src/style/runtime-profile.test.ts`: trusted selector evidence and rejection tests.
- Modify `agent-app/packages/domain-client/src/design-knowledge/style-capability-registry.ts`: promote only parts backed by the new reviewed adapters.
- Modify `agent-app/packages/domain-client/src/design-knowledge/style-capability-registry.test.ts`: exact supported-part evidence assertions.
- Modify `agent-app/packages/domain-client/src/style/style-engine.ts`: compile resolved v2 styles.
- Modify `agent-app/packages/domain-client/src/style/style-engine.test.ts`: scoped style merge tests.
- Modify `agent-app/packages/domain-client/src/index.ts`: export the solution compiler and v1 adapter.

---

### Task 1: Close the semantic input gap and define UIImplementationSpec v2

**Files:**
- Modify: `agent-app/packages/contracts/src/solution-implementation-plan.ts`
- Modify: `agent-app/packages/contracts/src/solution-implementation-plan.test.ts`
- Modify: `agent-app/packages/contracts/src/ui-style.ts`
- Modify: `agent-app/packages/contracts/src/ui-style.test.ts`
- Modify: `agent-app/apps/api/src/conversations/deepseek-model.ts`
- Modify: `agent-app/apps/api/src/conversations/deepseek-model.test.ts`

**Interfaces:**
- Consumes: native `SemanticValueSchema`, `RepeaterNodeSchema`, existing `UIImplementationSpecSchema` v1, and `ComponentStyleSpecSchema`.
- Produces: `RepeaterFieldReferenceSchema`, `UIImplementationSpecV2Schema`, `AnyUIImplementationSpecSchema`, `UIImplementationSpecV2`, `UIImplementationControlV2`, `AnyUIImplementationSpec`, `CompiledStyleSpec`, and `adaptUiImplementationV1()` while retaining the existing v1 names.

- [ ] **Step 1: Write failing v2 contract tests**

```ts
expect(UIImplementationSpecV2Schema.parse(v2Fixture).schema).toBe("kf-ui-implementation/v2");
expect(adaptUiImplementationV1(v1Fixture).pages[0]?.controls[0]?.parentId).toBeUndefined();
expect(UIImplementationSpecV2Schema.safeParse({
  ...v2Fixture,
  pages: [{ ...v2Fixture.pages[0], controls: [{ ...v2Fixture.pages[0].controls[0], compiledStyle: { css: "body{display:none}" } }] }],
}).success).toBe(false);
expect(UIImplementationSpecV2Schema.safeParse(v2WithUnknownParent).success).toBe(false);
expect(SolutionImplementationPlanSchema.safeParse(planWithRepeaterField("visitor", "name")).success).toBe(true);
expect(SolutionImplementationPlanSchema.safeParse(planWithRepeaterField("wrong-alias", "name")).success).toBe(false);
expect(SolutionImplementationPlanSchema.safeParse(planWithRepeaterField("visitor", "missing-field")).success).toBe(false);
```

- [ ] **Step 2: Run the test and verify v2 is not defined**

Run: `pnpm --dir agent-app --filter @kf/contracts exec vitest run src/ui-style.test.ts src/solution-implementation-plan.test.ts`

- [ ] **Step 3: Add the bounded repeater-field reference and prompt shape**

Add exactly one native semantic value variant:

```ts
export const RepeaterFieldReferenceSchema = z.object({
  kind: z.literal("repeater-field"),
  itemAlias: semanticNameSchema,
  field: semanticNameSchema,
}).strict();
```

It is legal only inside the matching `RepeaterNode.template`; `itemAlias` must equal the enclosing repeater alias and `field` must exist in the referenced `MockDataSet`. Nested repeaters shadow outer aliases. The legacy compatibility branch remains unchanged. Update the captured DeepSeek semantic skeleton to show this exact variant and forbid invented `${...}` interpolation syntax.

- [ ] **Step 4: Extend style intent without accepting raw CSS**

Add per-side border widths/colors/radii, horizontal/vertical padding, letter spacing, truncation, gradients, background asset IDs, object fit, overflow, icon size/color/gap, focus ring, bounded translate/scale/rotate, and transition property/duration/easing. Add semantic parts as a record keyed by reviewed part IDs. Advanced declarations use a discriminated value union, never a free CSS string.

```ts
export const AdvancedStyleDeclarationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("gradient"), angle: z.number().min(0).max(360), stops: z.array(GradientStopSchema).min(2).max(5) }).strict(),
  z.object({ kind: z.literal("background-image"), assetId: stableId }).strict(),
  z.object({ kind: z.literal("transform"), translateX: px.optional(), translateY: px.optional(), scale: z.number().min(0.8).max(1.2).optional(), rotate: z.number().min(-15).max(15).optional() }).strict(),
]);
```

- [ ] **Step 5: Define concrete v2 output**

`UIImplementationSpecV2Schema` contains canonical theme tokens, compiled role styles, pages with computed width/height, flattened controls with `parentId`, `depth`, `zIndex`, geometry, native properties, compiled style output, data binding, assets, overlay host metadata, and blueprint source IDs. In Phase 3 each control has `eventBindings: z.array(z.never()).max(0)` and the top level has `compiledActions: z.array(z.never()).max(0)` plus `compiledScripts: z.array(z.never()).max(0)`; Phase 4 replaces these empty structural slots with its canonical compiled contracts. Add cross-reference and containment checks. Preserve the existing `UIImplementationSpecSchema` and `UIImplementationSpec` exports as v1 so current module/compiler code remains source-compatible. `adaptUiImplementationV1()` maps v1 `pages[].components` to v2 `pages[].controls` without inventing parents, provenance, actions, scripts, or overlays. Add `AnyUIImplementationSpecSchema = z.discriminatedUnion("schema", [UIImplementationSpecSchema, UIImplementationSpecV2Schema])` and its inferred type for new dispatching code.

- [ ] **Step 6: Run contract and captured-prompt regression tests**

```bash
pnpm --dir agent-app --filter @kf/contracts exec vitest run src/ui-style.test.ts src/change-plan.test.ts src/module-plan.test.ts
pnpm --dir agent-app --filter @kf/contracts exec vitest run src/solution-implementation-plan.test.ts
pnpm --dir agent-app --filter @kf/api exec vitest run src/conversations/deepseek-model.test.ts
pnpm --dir agent-app --filter @kf/contracts typecheck
pnpm --dir agent-app --filter @kf/contracts lint
pnpm --dir agent-app --filter @kf/api typecheck
pnpm --dir agent-app --filter @kf/api lint
```

- [ ] **Step 7: Commit input and v2 contracts**

```bash
git add agent-app/packages/contracts/src/solution-implementation-plan.ts agent-app/packages/contracts/src/solution-implementation-plan.test.ts agent-app/packages/contracts/src/ui-style.ts agent-app/packages/contracts/src/ui-style.test.ts agent-app/apps/api/src/conversations/deepseek-model.ts agent-app/apps/api/src/conversations/deepseek-model.test.ts
git commit -m "feat: define UI implementation v2"
```

---

### Task 2: Measure intrinsic content and controls

**Files:**
- Create: `agent-app/packages/domain-client/src/solution-compile/intrinsic-measure.ts`
- Create: `agent-app/packages/domain-client/src/solution-compile/intrinsic-measure.test.ts`

**Interfaces:**
- Consumes: one expanded semantic node, resolved density, width constraint, control design profile or registered module layout contract, and style font metrics.
- Produces: `measureIntrinsic(input: IntrinsicMeasureInput): IntrinsicSize`.

- [ ] **Step 1: Write failing measurement tests**

```ts
expect(measureIntrinsic(textInput("园区访客预约审核", 160))).toMatchObject({ minHeight: 24, preferredHeight: 48 });
expect(measureIntrinsic(linkButtonInput("提交审核"))).toMatchObject({ minHeight: 40, maxHeight: 56 });
expect(measureIntrinsic(nativeButtonInput("提交审核"))).toMatchObject({ minHeight: 60, maxHeight: 60 });
expect(measureIntrinsic(datagridInput(8))).toMatchObject({ minHeight: 240 });
expect(measureIntrinsic(imageInput("16:9", 640)).preferredHeight).toBe(360);
```

- [ ] **Step 2: Run the focused test and verify missing implementation**

Run: `pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/solution-compile/intrinsic-measure.test.ts`

- [ ] **Step 3: Implement deterministic measurement rules**

```ts
export interface IntrinsicSize {
  minWidth: number;
  preferredWidth: number;
  maxWidth: number;
  minHeight: number;
  preferredHeight: number;
  maxHeight: number;
  overflow: "wrap" | "clip" | "scroll";
}
```

Use reviewed profile minimum sizes, CJK width `fontSize`, Latin width `0.56 * fontSize`, resolved line height, padding, border, item counts, table header/row heights, image ratio, and layout child measures. The 32–56px action-control band applies only when compatible with the reviewed profile; the native `button` profile's evidenced 60px minimum prevails rather than being silently clamped. Derive text capping from the existing structured contract (`truncate: true` means one line; otherwise use the bounded compiler default) instead of accepting a free-standing line-clamp fact that the semantic plan cannot supply. No browser or preview renderer is used.

- [ ] **Step 4: Run measurement tests and typecheck**

```bash
pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/solution-compile/intrinsic-measure.test.ts
pnpm --dir agent-app --filter @kf/domain-client typecheck
```

- [ ] **Step 5: Commit measurement**

```bash
git add agent-app/packages/domain-client/src/solution-compile/intrinsic-measure.ts agent-app/packages/domain-client/src/solution-compile/intrinsic-measure.test.ts
git commit -m "feat: measure KF solution content"
```

---

### Task 3: Implement the recursive content-driven layout solver

**Files:**
- Create: `agent-app/packages/domain-client/src/solution-compile/layout-compiler.ts`
- Create: `agent-app/packages/domain-client/src/solution-compile/layout-compiler.test.ts`

**Interfaces:**
- Consumes: expanded semantic tree and `measureIntrinsic()`.
- Produces: `compileLayout(input: LayoutCompileInput): CompiledLayoutTree` and `LayoutCompileError`.

```ts
export interface LayoutCompileInput {
  readonly page: SolutionPage;
  readonly expandedRoot: SolutionNode;
  readonly intrinsicByNodeId: ReadonlyMap<string, IntrinsicSize>;
}
export interface CompiledLayoutTree {
  readonly pageWidth: 1440 | 1920;
  readonly pageHeight: number;
  readonly root: CompiledLayoutNode;
  readonly byId: ReadonlyMap<string, CompiledLayoutNode>;
}
```

`CompiledLayoutNode.geometry` is the visible viewport geometry. A `scroll-region` additionally emits a bounded `scrollContentExtent: { width; height }`; its descendants may exceed the viewport only within that extent. Scroll content never increases global `pageHeight`. `UIImplementationControlV2` carries the same compiler-owned metadata so native v2 validation can distinguish a page-bounded viewport from its internal scroll coordinate space; Task 4 must map it to KF overflow/clipping rather than flattening or dropping descendants.

- [ ] **Step 1: Write failing layout behavior tests**

```ts
const compiled = compileLayout(visitorWorkspaceFixture);
expect(compiled.pageHeight).toBeLessThan(1800);
expect(compiled.byId.get("filters")!.geometry.y).toBeLessThan(compiled.byId.get("records")!.geometry.y);
expect(overlaps(compiled.byId.get("summary")!, compiled.byId.get("records")!)).toBe(false);
expect(compiled.byId.get("sidebar")!.geometry.width).toBeLessThan(compiled.byId.get("main")!.geometry.width);
expect(() => compileLayout(impossibleFixedLayout)).toThrowError(/LAYOUT_UNSATISFIABLE:.*node-id/);
```

- [ ] **Step 2: Run the test and verify the solver is missing**

Run: `pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/solution-compile/layout-compiler.test.ts`

- [ ] **Step 3: Implement recursive layout primitives**

Support all eleven layout kinds. Invalid `groupWith` references fail. Build sibling group connected-components, sort groups by their minimum `(readingOrder, stableId)`, then sort members by `(readingOrder, stableId)` so grouped nodes are adjacent without changing their internal reading order. Columns and rows allocate content first, then fixed, minmax, ratio, and fill. Grid derives the largest fitting column count from child minimum widths, capped at 12, and reduces it deterministically when necessary because the semantic contract intentionally contains no model-authored column count. `visualWeight` controls ratio allocation; `importance` wins scarce-space allocation; `align` controls cross-axis placement.

Ordered composite semantics are compiler-owned: `split`, `sidebar-content`, and `master-detail` require exactly two children, with the first child acting as the leading/sidebar/master region and the second as content/detail. `dock` accepts two to five children; the last child is center and preceding children map in order to north, west, east, then south. `asymmetric-grid` uses `visualWeight` to derive track ratios. Stack and `overlay-anchor` intentionally share geometry and increment z-order. `scroll-region` is the only layout allowed to introduce local scrolling: it separates viewport geometry from scroll-content extent, and descendants outside the viewport remain bounded by that extent without expanding the page. The solver rejects ambiguous child counts rather than guessing.

Map `responsive` and `desktop` pages to 1440 px and `large-display` pages to 1920 px. Density page padding is applied once at the page root, not once per nested layout.

Use density tokens:

```ts
const DENSITY = {
  compact: { pagePadding: 24, sectionGap: 16, controlGap: 8 },
  comfortable: { pagePadding: 40, sectionGap: 24, controlGap: 12 },
  spacious: { pagePadding: 56, sectionGap: 32, controlGap: 16 },
} as const;
```

Return structured attempts in `LayoutCompileError.details`, including failed node ID, minimum required size, available size, attempted column counts, and whether scroll was allowed.

- [ ] **Step 4: Run layout and legacy engine tests**

```bash
pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/solution-compile/layout-compiler.test.ts src/modules/layout/layout-engine.test.ts
pnpm --dir agent-app --filter @kf/domain-client typecheck
```

- [ ] **Step 5: Commit recursive layout**

```bash
git add agent-app/packages/domain-client/src/solution-compile/layout-compiler.ts agent-app/packages/domain-client/src/solution-compile/layout-compiler.test.ts
git commit -m "feat: compile content-driven KF layouts"
```

---

### Task 4: Compile controls, repeaters, overlays, and registered modules

**Files:**
- Create: `agent-app/packages/domain-client/src/solution-compile/component-compiler.ts`
- Create: `agent-app/packages/domain-client/src/solution-compile/component-compiler.test.ts`
- Create: `agent-app/packages/domain-client/src/solution-compile/module-node-compiler.ts`
- Create: `agent-app/packages/domain-client/src/solution-compile/module-node-compiler.test.ts`
- Modify: `agent-app/packages/domain-client/src/planning/capability-retrieval.ts`
- Modify: `agent-app/packages/domain-client/src/planning/capability-retrieval.test.ts`

**Interfaces:**
- Consumes: measured semantic nodes, mock data, capability candidates, `ModuleRegistry`, registered `ModuleDefinition.compile()`, control templates, and component property validators.
- Produces: `compileComponents(input): UIImplementationControlV2[]`, `compileOverlay(input): UIImplementationControlV2[]`, `compileRegisteredModuleNode(input): UIImplementationControlV2[]`, and `layoutCapabilityIdsFor(kind): readonly string[]`.

```ts
export interface ComponentCompileInput {
  readonly plan: SolutionImplementationPlan;
  readonly bundle?: CapabilityCandidateBundle;
  readonly layout: CompiledLayoutTree;
  readonly moduleRegistry: ModuleRegistry;
  readonly approvedAssets: readonly ApprovedAssetFacts[];
}
```

The component compiler must preserve `scrollContentExtent` on the emitted native v2 layout control and compile the corresponding KF container overflow/clipping fields; it must not expand page geometry or discard off-viewport scroll descendants.

- [ ] **Step 1: Write failing component expansion tests**

```ts
const controls = compileComponents(cardRepeaterFixture);
expect(controls.filter((control) => control.sourceRepeaterId === "visitor-cards")).toHaveLength(12);
expect(new Set(controls.map((control) => control.id)).size).toBe(controls.length);
expect(controls.find((control) => control.id === "visitor-cards--chen-jianing--name")?.parentId)
  .toBe("visitor-cards--chen-jianing");
expect(compileOverlay(dialogFixture).hostPageId).toBe("visitor-overview");
```

- [ ] **Step 2: Run component tests and verify missing compilers**

```bash
pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/solution-compile/component-compiler.test.ts src/solution-compile/module-node-compiler.test.ts
```

- [ ] **Step 3: Implement deterministic component compilation**

Resolve each `ControlNode.capabilityId` against the exact page-region candidate evidence and technical registry. Convert semantic property arrays to plain data through one bounded `semanticValueToData()` helper, resolve `repeater-field` references only against the current record, then validate the resulting record with `validateGeneratedComponentProperties()`; never copy arbitrary model properties. Map `content` to the reviewed content field for the selected capability and map `mockDataId` through existing native data adapters where the capability supports that data shape.

Every `LayoutNode` emits a compiler-owned KF layout/container control selected deterministically from the signed layout candidates returned by the same exported `layoutCapabilityIdsFor()` lookup used by retrieval; ties use candidate order then code-point capability ID. Its children receive that layout control as `parentId`. A semantic layout with no compatible signed layout candidate is a blocking error, not a geometry-only phantom container. Do not duplicate the semantic-layout compatibility table in a second compiler file.

Expand Repeaters with stable IDs `${repeaterId}--${normalizedKey}--${templateNodeId}` and fail on duplicate/missing keys, unresolved `repeater-field` references, or `maxItems` overflow. Compile Overlay roots under an explicit host/page relation with hidden initial state and higher z-order. Preserve exact source blueprint page/region IDs; journey coverage remains semantic-plan validation and is not fabricated at this layer.

- [ ] **Step 4: Bridge registered modules**

Resolve exact kind/version independently through `ModuleRegistry.require()` and validate the registered variant. For native input, convert record-shaped semantic content to plain data (`undefined` becomes `{}`) and reject non-record content. For the reserved legacy branch, parse the preserved legacy JSON string strictly as data and pass the result through the same registered `contentSchema`; never evaluate it or reinterpret code-like strings. Validate approved assets and required KF capabilities, then call `ModuleDefinition.compile()` with compiler-owned local bounds. Non-empty semantic child slots fail with `MODULE_CHILD_SLOT_UNSUPPORTED` because the current registry owns only asset slots. Prefix returned local component IDs with the semantic module ID, preserve stable source mapping, and translate local geometry into the allocated node rectangle. Do not call `compileModulePlan()` here because that legacy coordinator requires a v2 `AcceptedBlueprintArtifact` containing `expectedKind`; the creative v3 blueprint intentionally has no such field. Modules are not required to appear in candidate evidence, and module output must not determine total page height.

- [ ] **Step 5: Run component, module, and control regressions**

```bash
pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/solution-compile/component-compiler.test.ts src/solution-compile/module-node-compiler.test.ts src/planning/capability-retrieval.test.ts src/modules/module-compiler.test.ts src/implementation/ui-implementation-compiler.test.ts src/compile/control-compiler.test.ts
pnpm --dir agent-app --filter @kf/domain-client typecheck
```

- [ ] **Step 6: Commit component compilation**

```bash
git add agent-app/packages/domain-client/src/solution-compile/component-compiler.ts agent-app/packages/domain-client/src/solution-compile/component-compiler.test.ts agent-app/packages/domain-client/src/solution-compile/module-node-compiler.ts agent-app/packages/domain-client/src/solution-compile/module-node-compiler.test.ts agent-app/packages/domain-client/src/planning/capability-retrieval.ts agent-app/packages/domain-client/src/planning/capability-retrieval.test.ts
git commit -m "feat: compile solution controls and overlays"
```

---

### Task 5: Extend safe style and CSS compilation

**Files:**
- Create: `agent-app/packages/domain-client/src/style/advanced-style.ts`
- Create: `agent-app/packages/domain-client/src/style/advanced-style.test.ts`
- Modify: `agent-app/packages/domain-client/src/style/theme-resolver.ts`
- Modify: `agent-app/packages/domain-client/src/style/theme-resolver.test.ts`
- Modify: `agent-app/packages/domain-client/src/style/css-compiler.ts`
- Modify: `agent-app/packages/domain-client/src/style/css-compiler.test.ts`
- Modify: `agent-app/packages/domain-client/src/style/style-adapter.ts`
- Modify: `agent-app/packages/domain-client/src/style/adapters/base-adapters.ts`
- Modify: `agent-app/packages/domain-client/src/style/adapters/base-adapters.test.ts`
- Modify: `agent-app/packages/domain-client/src/style/runtime-profile.ts`
- Modify: `agent-app/packages/domain-client/src/style/runtime-profile.test.ts`
- Modify: `agent-app/packages/domain-client/src/design-knowledge/style-capability-registry.ts`
- Modify: `agent-app/packages/domain-client/src/design-knowledge/style-capability-registry.test.ts`
- Modify: `agent-app/packages/domain-client/src/style/style-engine.ts`
- Modify: `agent-app/packages/domain-client/src/style/style-engine.test.ts`

**Interfaces:**
- Consumes: theme tokens, role style, instance override, phase-one `StyleCapabilityProfile`, and runtime profile.
- Produces: `compileResolvedStyle(input): CompiledControlStyle` containing native patches and scoped style fragments.

- [ ] **Step 1: Write failing safety and inheritance tests**

```ts
expect(resolveStyle(theme, primaryActionRole, instanceOverride).root.backgroundColor).toBe("#0b6bcb");
expect(() => parseAdvancedStyle({ property: "position", value: "fixed" })).toThrow(/STYLE_PROPERTY_FORBIDDEN/);
expect(() => parseAdvancedStyle({ property: "backgroundImage", value: "url(javascript:alert(1))" })).toThrow(/STYLE_VALUE_FORBIDDEN/);
expect(compilePartStyle("tabs", "activeIndicator", activeStyle).cssFragments[0]?.selectorToken)
  .toBe("part:activeIndicator");
```

- [ ] **Step 2: Run style tests and verify unsupported fields fail**

```bash
pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/style/advanced-style.test.ts src/style/theme-resolver.test.ts src/style/css-compiler.test.ts
```

- [ ] **Step 3: Implement three-level resolution and advanced value parsing**

Resolve tokens before declarations and merge by semantic part/state. Whitelist only the v2 contract properties. Background images must reference approved asset IDs. Gradients serialize from structured stops. Transitions allow `opacity`, `transform`, `background-color`, `border-color`, `box-shadow`, and `color`, with duration 0–600 ms and reviewed easing values. Reject `url()`, `var()`, `calc()`, `@`, braces, semicolons, and selector characters in model values.

- [ ] **Step 4: Make StyleAdapters own selectors**

Extend the adapter interface:

```ts
export interface StylePartAdapter {
  semanticPart: string;
  selector: string;
  nativeProperties: readonly string[];
  cssProperties: readonly string[];
  supportedStates: readonly string[];
}
```

Add reviewed parts for Button, inputs, Select, Tabs, Datagrid, Tree/List, Image, Tag, NavMenu, Dialog/Window, and layout surfaces only where repository templates/runtime evidence establish a selector. Put selector ownership in the branded `KF36_RUNTIME_PROFILE`, make adapters consume that trusted mapping, and promote the matching `StyleCapabilityProfile.parts[].availability` from `planned` to `supported` with exact evidence assertions. Parts without selector evidence remain `planned` and fail closed. The compiler creates a unique component scope token and combines it with adapter selectors; it never accepts a selector from the plan.

- [ ] **Step 5: Run all style regressions**

```bash
pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/style/advanced-style.test.ts src/style/theme-resolver.test.ts src/style/css-compiler.test.ts src/style/adapters/base-adapters.test.ts src/style/runtime-profile.test.ts src/design-knowledge/style-capability-registry.test.ts src/style/style-engine.test.ts src/style/style-data-merge.test.ts
pnpm --dir agent-app --filter @kf/domain-client typecheck
pnpm --dir agent-app --filter @kf/domain-client lint
```

- [ ] **Step 6: Commit visual style compilation**

```bash
git add agent-app/packages/domain-client/src/style/advanced-style.ts agent-app/packages/domain-client/src/style/advanced-style.test.ts agent-app/packages/domain-client/src/style/theme-resolver.ts agent-app/packages/domain-client/src/style/theme-resolver.test.ts agent-app/packages/domain-client/src/style/css-compiler.ts agent-app/packages/domain-client/src/style/css-compiler.test.ts agent-app/packages/domain-client/src/style/style-adapter.ts agent-app/packages/domain-client/src/style/adapters/base-adapters.ts agent-app/packages/domain-client/src/style/adapters/base-adapters.test.ts agent-app/packages/domain-client/src/style/runtime-profile.ts agent-app/packages/domain-client/src/style/runtime-profile.test.ts agent-app/packages/domain-client/src/design-knowledge/style-capability-registry.ts agent-app/packages/domain-client/src/design-knowledge/style-capability-registry.test.ts agent-app/packages/domain-client/src/style/style-engine.ts agent-app/packages/domain-client/src/style/style-engine.test.ts
git commit -m "feat: compile scoped KF visual styles"
```

---

### Task 6: Coordinate the full semantic-to-v2 compiler

**Files:**
- Create: `agent-app/packages/domain-client/src/solution-compile/solution-compiler.ts`
- Create: `agent-app/packages/domain-client/src/solution-compile/solution-compiler.test.ts`
- Modify: `agent-app/packages/domain-client/src/index.ts`

**Interfaces:**
- Consumes: `SolutionImplementationPlan`, `CapabilityCandidateBundle`, registered module compiler, layout/component/style compilers, and approved asset facts.
- Produces: `compileSolutionImplementation(input: SolutionCompileInput): UIImplementationSpecV2`.

```ts
export interface SolutionCompileInput {
  readonly plan: SolutionImplementationPlan;
  /** Required for native plans; forbidden for the reserved legacy branch. */
  readonly candidateBundle?: CapabilityCandidateBundle;
  readonly moduleRegistry: ModuleRegistry;
  readonly approvedAssets: readonly ApprovedAssetFacts[];
  readonly activeCatalogVersion: string;
}
```

- [ ] **Step 1: Write failing end-to-end compiler tests**

```ts
const portal = compileSolutionImplementation(portfolioInput);
expect(portal.schema).toBe("kf-ui-implementation/v2");
expect(portal.pages.length).toBeGreaterThan(1);
expect(portal.pages.flatMap((page) => page.controls).some((control) => control.capabilityId === "image")).toBe(true);
expect(portal.pages.flatMap((page) => page.controls).some((control) => control.capabilityId === "easyui.1")).toBe(false);
expect(findSevereOverlaps(portal)).toEqual([]);
expect(findUnusedVerticalSpace(portal, 0.35)).toEqual([]);
```

- [ ] **Step 2: Run the test and verify the coordinator is missing**

Run: `pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/solution-compile/solution-compiler.test.ts`

- [ ] **Step 3: Implement compilation order and failure paths**

The order is: parse the native or isolated legacy plan; for native input run `assertSolutionPlanUsesCandidates()` before expansion; resolve tokens/role styles; expand repeater records into semantic nodes; measure controls and registered modules from content/profile/registered layout contracts without invoking module compile; choose signed layout capabilities; solve pages and overlays; compile registered module outputs inside their solved bounds; compile controls/native properties; compile styles; assemble v2; validate geometry/parent/source integrity; deep-freeze output. The compiler receives `ModuleRegistry`, approved asset facts, and the exact knowledge/catalog version as explicit dependencies—never process globals. Errors use `SOLUTION_COMPILE_FAILED` with `phase`, `nodeId`, `code`, `message`, and at most five sorted alternatives. Do not call a model.

- [ ] **Step 4: Add three deterministic fixtures**

Embed reviewed semantic fixtures in the test file for a portfolio portal, industrial operations dashboard, and management admin workspace. Assert distinct page trees and compositions rather than snapshots differing only in text/color. Verify no fixed 900 px height assumption and no mechanical single-column fallback.

- [ ] **Step 5: Run full phase-three verification**

```bash
pnpm --dir agent-app --filter @kf/contracts test
pnpm --dir agent-app --filter @kf/domain-client test
pnpm --dir agent-app --filter @kf/contracts typecheck
pnpm --dir agent-app --filter @kf/domain-client typecheck
pnpm --dir agent-app --filter @kf/contracts lint
pnpm --dir agent-app --filter @kf/domain-client lint
git diff --check
```

- [ ] **Step 6: Commit the full compiler**

```bash
git add agent-app/packages/domain-client/src/solution-compile/solution-compiler.ts agent-app/packages/domain-client/src/solution-compile/solution-compiler.test.ts agent-app/packages/domain-client/src/index.ts
git commit -m "feat: compile creative solutions to UI v2"
```

---

## Completion Gate

Phase 3 is complete only when:

- all eleven semantic layout types produce deterministic nested geometry;
- content measurement changes actual node height and final page height;
- portfolio, industrial dashboard, and admin fixtures have materially different compositions;
- no fixture contains severe overlap, out-of-page controls, mechanical full-height stretching, or excessive unused vertical space;
- controls, repeaters, overlays, layout containers, and registered modules preserve stable IDs and blueprint provenance;
- repeater-field references materialize distinct record content and cannot escape their alias/data-set scope;
- style tokens, roles, parts, states, instance overrides, native fields, and scoped CSS compile without accepting model selectors or raw CSS;
- only evidence-backed semantic parts are promoted to `supported`; planned parts remain fail-closed;
- v1 implementation specs still parse and adapt to the v2 subset;
- v2 action/script slots remain structurally present but are not compiled in this phase;
- contracts and domain-client tests have zero failures; only the exact five documented real-Golden skips are allowed when `/tmp/kf_ref` is absent; contracts/domain-client typechecks and lints pass.
