# KF Page and Visual Compilation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compile semantic solution trees into content-driven KF page geometry, native controls, repeaters, overlays, and scoped visual output represented by backward-compatible `UIImplementationSpec v2`.

**Architecture:** A deterministic compiler pipeline expands modules and repeaters, measures intrinsic content, recursively solves semantic layouts, maps controls and overlays to KF capabilities, and resolves three-level style inheritance. It emits a v2 implementation snapshot containing concrete geometry and compiled style artifacts while leaving actions and scripts declarative for phase 4.

**Tech Stack:** TypeScript ES modules, Zod 4, Vitest, existing KF templates/module compiler/style engine, pnpm workspace, `@kf/contracts`, `@kf/domain-client`.

## Global Constraints

- Target runtime is KingFusion 3.6.
- Input is a validated `kf-solution-implementation/v1` snapshot and its bound capability candidate bundle.
- Layout, GUIDs, instance names, selectors, CSS scoping, native properties, and page height are compiler-owned.
- The model never supplies final coordinates, selectors, complete CSS rules, KF native JSON, or `styleDataNew`.
- Default page width is 1440 unless the semantic plan supplies an allowed canvas width; default height is content-driven, not 900 or another fixed viewport.
- Layout failure recovery order is: preferred layout, compress spacing, reduce columns, increase content height, enable declared local scrolling, then fail with a node-specific error.
- The compiler must not delete content, overlap controls, shrink text below declared minimums, or use oversized pages to hide failures.
- `spacious` changes rhythm and surface spacing but must not create large empty regions.
- Style inheritance order is `Theme Tokens → Role Styles → Instance Overrides`.
- Advanced style declarations are property/value whitelisted and automatically scoped; raw selectors and global CSS are rejected.
- Existing `kf-ui-implementation/v1` remains parseable and converts to the v2 subset.
- This phase does not compile ActionGraph or JavaScript and does not wire the Worker/build queue.
- Existing static preview remains frozen and is not extended.
- Use TDD for every task and commit only the files named by that task.

---

## File Structure

### Contracts

- Modify `agent-app/packages/contracts/src/ui-style.ts`: richer token/style contracts and `UIImplementationSpec v2`.
- Modify `agent-app/packages/contracts/src/ui-style.test.ts`: v1 compatibility, v2 strictness, and advanced-style rejection.

### Layout and component compilation

- Create `agent-app/packages/domain-client/src/solution-compile/intrinsic-measure.ts`: text/control/module intrinsic sizing.
- Create `agent-app/packages/domain-client/src/solution-compile/intrinsic-measure.test.ts`: wrapping and min/preferred/max tests.
- Create `agent-app/packages/domain-client/src/solution-compile/layout-compiler.ts`: recursive layout solver.
- Create `agent-app/packages/domain-client/src/solution-compile/layout-compiler.test.ts`: nested, asymmetric, density, and failure tests.
- Create `agent-app/packages/domain-client/src/solution-compile/component-compiler.ts`: controls, repeaters, and overlays.
- Create `agent-app/packages/domain-client/src/solution-compile/component-compiler.test.ts`: expansion, native property, and parent tests.
- Create `agent-app/packages/domain-client/src/solution-compile/module-node-compiler.ts`: bridge existing registered modules into the new tree.
- Create `agent-app/packages/domain-client/src/solution-compile/module-node-compiler.test.ts`: module output and source mapping tests.
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
- Modify `agent-app/packages/domain-client/src/style/style-engine.ts`: compile resolved v2 styles.
- Modify `agent-app/packages/domain-client/src/style/style-engine.test.ts`: scoped style merge tests.
- Modify `agent-app/packages/domain-client/src/index.ts`: export the solution compiler and v1 adapter.

---

### Task 1: Define richer styles and UIImplementationSpec v2

**Files:**
- Modify: `agent-app/packages/contracts/src/ui-style.ts`
- Modify: `agent-app/packages/contracts/src/ui-style.test.ts`

**Interfaces:**
- Consumes: existing `UIImplementationSpecSchema` v1 and `ComponentStyleSpecSchema`.
- Produces: `UIImplementationSpecV2Schema`, `AnyUIImplementationSpecSchema`, `UIImplementationSpecV2`, `AnyUIImplementationSpec`, `CompiledStyleSpec`, and `adaptUiImplementationV1()` while retaining the existing v1 names.

- [ ] **Step 1: Write failing v2 contract tests**

```ts
expect(UIImplementationSpecV2Schema.parse(v2Fixture).schema).toBe("kf-ui-implementation/v2");
expect(adaptUiImplementationV1(v1Fixture).pages[0]?.controls[0]?.parentId).toBeUndefined();
expect(UIImplementationSpecV2Schema.safeParse({
  ...v2Fixture,
  pages: [{ ...v2Fixture.pages[0], controls: [{ ...v2Fixture.pages[0].controls[0], compiledStyle: { css: "body{display:none}" } }] }],
}).success).toBe(false);
expect(UIImplementationSpecV2Schema.safeParse(v2WithUnknownParent).success).toBe(false);
```

- [ ] **Step 2: Run the test and verify v2 is not defined**

Run: `pnpm --dir agent-app --filter @kf/contracts exec vitest run src/ui-style.test.ts`

- [ ] **Step 3: Extend style intent without accepting raw CSS**

Add per-side border widths/colors/radii, horizontal/vertical padding, letter spacing, truncation, gradients, background asset IDs, object fit, overflow, icon size/color/gap, focus ring, bounded translate/scale/rotate, and transition property/duration/easing. Add semantic parts as a record keyed by reviewed part IDs. Advanced declarations use a discriminated value union, never a free CSS string.

```ts
export const AdvancedStyleDeclarationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("gradient"), angle: z.number().min(0).max(360), stops: z.array(GradientStopSchema).min(2).max(5) }).strict(),
  z.object({ kind: z.literal("background-image"), assetId: stableId }).strict(),
  z.object({ kind: z.literal("transform"), translateX: px.optional(), translateY: px.optional(), scale: z.number().min(0.8).max(1.2).optional(), rotate: z.number().min(-15).max(15).optional() }).strict(),
]);
```

- [ ] **Step 4: Define concrete v2 output**

`UIImplementationSpecV2Schema` contains canonical theme tokens, compiled role styles, pages with computed width/height, flattened controls with `parentId`, `depth`, `zIndex`, geometry, native properties, compiled style output, data binding, event bindings, action/script references, assets, overlay host metadata, and blueprint source IDs. Keep action/script arrays empty-capable for phase 3. Add cross-reference and containment checks. Preserve the existing `UIImplementationSpecSchema` and `UIImplementationSpec` exports as v1 so current module/compiler code remains source-compatible. Add `AnyUIImplementationSpecSchema = z.discriminatedUnion("schema", [UIImplementationSpecSchema, UIImplementationSpecV2Schema])` and its inferred type for new dispatching code.

- [ ] **Step 5: Run contract regression tests**

```bash
pnpm --dir agent-app --filter @kf/contracts exec vitest run src/ui-style.test.ts src/change-plan.test.ts src/module-plan.test.ts
pnpm --dir agent-app --filter @kf/contracts typecheck
pnpm --dir agent-app --filter @kf/contracts lint
```

- [ ] **Step 6: Commit v2 contracts**

```bash
git add agent-app/packages/contracts/src/ui-style.ts agent-app/packages/contracts/src/ui-style.test.ts
git commit -m "feat: define UI implementation v2"
```

---

### Task 2: Measure intrinsic content and controls

**Files:**
- Create: `agent-app/packages/domain-client/src/solution-compile/intrinsic-measure.ts`
- Create: `agent-app/packages/domain-client/src/solution-compile/intrinsic-measure.test.ts`

**Interfaces:**
- Consumes: one expanded semantic node, resolved density, width constraint, control design profile, and style font metrics.
- Produces: `measureIntrinsic(input: IntrinsicMeasureInput): IntrinsicSize`.

- [ ] **Step 1: Write failing measurement tests**

```ts
expect(measureIntrinsic(textInput("园区访客预约审核", 160))).toMatchObject({ minHeight: 24, preferredHeight: 48 });
expect(measureIntrinsic(buttonInput("提交审核"))).toMatchObject({ minHeight: 32, maxHeight: 56 });
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

Use reviewed profile minimum sizes, CJK width `fontSize`, Latin width `0.56 * fontSize`, resolved line height, padding, border, item counts, table header/row heights, image ratio, and layout child measures. Cap text measurement at declared line clamp. No browser or preview renderer is used.

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

Support all eleven layout kinds. Columns and rows allocate content first, then fixed, minmax, ratio, and fill. Grid chooses the requested column count only when child minimum widths fit; otherwise reduces columns. `asymmetric-grid`, `sidebar-content`, and `master-detail` honor weights. Dock reserves edges before center. Stack and Overlay anchor share geometry intentionally and set z-order. Scroll regions are allowed only when declared.

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

**Interfaces:**
- Consumes: measured semantic nodes, mock data, capability candidates, `ModuleRegistry`, registered `ModuleDefinition.compile()`, control templates, and component property validators.
- Produces: `compileComponents(input): CompiledControl[]` and `compileRegisteredModuleNode(input): CompiledControl[]`.

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

Resolve each `ControlNode.capabilityId` against the candidate bundle and technical registry. Generate native properties using the existing control compiler/property validation, never by copying arbitrary model properties. Expand Repeaters with stable IDs `${repeaterId}--${normalizedKey}--${templateNodeId}` and fail on duplicate/missing keys or `maxItems` overflow. Compile Overlay roots under an explicit host/page relation with hidden initial state and higher z-order. Preserve source blueprint page/region/journey IDs.

- [ ] **Step 4: Bridge registered modules**

Resolve the exact kind/version through `ModuleRegistry.require()`, parse node content through the definition's `contentSchema`, validate asset slots and required KF capabilities, then call the registered `ModuleDefinition.compile()` with compiler-owned local bounds. Prefix returned local component IDs with the semantic module ID and translate their geometry into the allocated node rectangle. Do not call `compileModulePlan()` here because that legacy coordinator requires a v2 `AcceptedBlueprintArtifact` containing `expectedKind`; the creative v3 blueprint intentionally has no such field. Reject modules whose kind/version/variant is absent from candidate evidence, and do not let module output determine total page height.

- [ ] **Step 5: Run component, module, and control regressions**

```bash
pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/solution-compile/component-compiler.test.ts src/solution-compile/module-node-compiler.test.ts src/modules/module-compiler.test.ts src/implementation/ui-implementation-compiler.test.ts src/compile/control-compiler.test.ts
pnpm --dir agent-app --filter @kf/domain-client typecheck
```

- [ ] **Step 6: Commit component compilation**

```bash
git add agent-app/packages/domain-client/src/solution-compile/component-compiler.ts agent-app/packages/domain-client/src/solution-compile/component-compiler.test.ts agent-app/packages/domain-client/src/solution-compile/module-node-compiler.ts agent-app/packages/domain-client/src/solution-compile/module-node-compiler.test.ts
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

Add reviewed parts for Button, inputs, Select, Tabs, Datagrid, Tree/List, Image, Tag, NavMenu, Dialog/Window, and layout surfaces. The compiler creates a unique component scope token and combines it with adapter selectors; it never accepts a selector from the plan.

- [ ] **Step 5: Run all style regressions**

```bash
pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/style/advanced-style.test.ts src/style/theme-resolver.test.ts src/style/css-compiler.test.ts src/style/adapters/base-adapters.test.ts src/style/style-engine.test.ts src/style/style-data-merge.test.ts
pnpm --dir agent-app --filter @kf/domain-client typecheck
pnpm --dir agent-app --filter @kf/domain-client lint
```

- [ ] **Step 6: Commit visual style compilation**

```bash
git add agent-app/packages/domain-client/src/style/advanced-style.ts agent-app/packages/domain-client/src/style/advanced-style.test.ts agent-app/packages/domain-client/src/style/theme-resolver.ts agent-app/packages/domain-client/src/style/theme-resolver.test.ts agent-app/packages/domain-client/src/style/css-compiler.ts agent-app/packages/domain-client/src/style/css-compiler.test.ts agent-app/packages/domain-client/src/style/style-adapter.ts agent-app/packages/domain-client/src/style/adapters/base-adapters.ts agent-app/packages/domain-client/src/style/adapters/base-adapters.test.ts agent-app/packages/domain-client/src/style/style-engine.ts agent-app/packages/domain-client/src/style/style-engine.test.ts
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

The order is: validate hashes and references; resolve tokens/role styles; expand modules/repeaters; measure intrinsic content; solve pages and overlays; compile controls/native properties; compile styles; assemble v2; validate geometry/parent/source integrity; deep-freeze output. Errors use `SOLUTION_COMPILE_FAILED` with `phase`, `nodeId`, `code`, `message`, and bounded alternatives. Do not call a model.

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
- controls, repeaters, overlays, and registered modules preserve stable IDs and blueprint provenance;
- style tokens, roles, parts, states, instance overrides, native fields, and scoped CSS compile without accepting model selectors or raw CSS;
- v1 implementation specs still parse and adapt to the v2 subset;
- v2 action/script slots remain structurally present but are not compiled in this phase;
- contracts and domain-client tests/typechecks/lints pass.
