# KF Native Style Engine Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the typed, deterministic foundation that converts KF UI style intent into safe native fields and scoped `styleDataNew`, applies it consistently to newly created and imported controls, reports every unsupported capability, and renders a faithful local preview for the first high-frequency control set.

**Architecture:** Shared Zod contracts define themes, component styles, UI implementation specs, capability records, and a new `applyStyle` change operation. `@kf/domain-client` owns the capability registry, safe CSS compiler, KF 3.6 runtime profile, per-control style adapters, deterministic UI implementation compiler, and integration with both the compiler and lossless patcher. This plan stops at a complete local vertical slice; real KF browser automation, graph/customer-flow integration, complex charts/EasyUI, and remaining-control rollout are separate follow-on plans.

**Tech Stack:** TypeScript 5, Zod 4, Vitest, pnpm workspaces, existing `@kf/contracts` and `@kf/domain-client` packages; no new runtime dependency.

## Global Constraints

- Use only KF native controls, native layouts, special nodes, native fields, and KF-supported `styleDataNew`; never generate a whole-page WebContainer implementation.
- LLM output may contain ThemeSpec/StyleSpec but never raw CSS, arbitrary JavaScript, KF GUID invention, or complete ECharts JavaScript.
- CSS is emitted only by deterministic adapters using selector and property allowlists.
- Every compiler/template/IR control must have a capability record; missing records fail tests.
- New or discovered controls default to `unsupported`; only real KF verification may promote them to `full`.
- Phase-one adapters remain `pending-verification` until the separate runtime-verification plan passes them on KF 3.6.
- Unsupported and partial effects are returned in structured reports; critical unsupported effects fail compilation, and non-critical effects require an explicit verified fallback.
- New controls and imported controls use the same StyleSpec and adapter implementation.
- Do not persist server addresses, user names, passwords, tokens, or other credentials in source, fixtures, snapshots, logs, or commits.
- Preserve unknown customer-project fields losslessly and never modify unrelated entities.
- Keep the current package boundaries; do not add a new workspace package in this plan.

## Scope Decomposition

This plan implements the first independently testable subsystem from the approved specification. Follow-on plans are required for:

1. LangGraph/UI implementation workflow, new-workspace initialization, and removal of the second technical approval for safe new projects.
2. Real KF import, browser login, DOM/computed-style inspection, screenshot baselines, cleanup, and runtime statuses.
3. Complex EasyUI, table, chart, alarm/event-window style and data adapters.
4. Continuous promotion of all remaining registry entries from unsupported/partial to verified full support.

## File Structure

### Shared contracts

- `agent-app/packages/contracts/src/ui-style.ts`: ThemeSpec, declarations, states, component style, UI implementation, and capability-report contracts.
- `agent-app/packages/contracts/src/ui-style.test.ts`: strict parsing, invalid raw-CSS rejection, and contract round-trip tests.
- `agent-app/packages/contracts/src/change-plan.ts`: add the typed `applyStyle` operation.
- `agent-app/packages/contracts/src/change-plan.test.ts`: preserve StyleSpec through Zod parsing.
- `agent-app/packages/contracts/src/index.ts`: public exports.

### Domain client

- `agent-app/packages/domain-client/src/style/control-capability-registry.ts`: single source of truth for control capability status and inventory coverage.
- `agent-app/packages/domain-client/src/style/control-capability-registry.test.ts`: compiler/IR/registry parity and default-status tests.
- `agent-app/packages/domain-client/src/style/runtime-profile.ts`: versioned selector roles; only known KF 3.6 root roles are introduced here.
- `agent-app/packages/domain-client/src/style/css-compiler.ts`: deterministic declaration serialization and injection rejection.
- `agent-app/packages/domain-client/src/style/css-compiler.test.ts`: allowed values, blocked values, stable ordering, and scoping tests.
- `agent-app/packages/domain-client/src/style/theme-resolver.ts`: theme-token and style-layer resolution.
- `agent-app/packages/domain-client/src/style/theme-resolver.test.ts`: precedence and unresolved-token failures.
- `agent-app/packages/domain-client/src/style/style-adapter.ts`: adapter interfaces, result types, and registry lookup.
- `agent-app/packages/domain-client/src/style/adapters/base-adapters.ts`: text/display/action/form/layout-root adapters for the first control set.
- `agent-app/packages/domain-client/src/style/adapters/base-adapters.test.ts`: native-field/CSS split and unsupported-style assertions.
- `agent-app/packages/domain-client/src/style/style-engine.ts`: common compile entry point used by compiler, patcher, implementation compiler, and preview.
- `agent-app/packages/domain-client/src/style/style-engine.test.ts`: end-to-end local style compilation.
- `agent-app/packages/domain-client/src/implementation/ui-implementation-compiler.ts`: deterministic UIImplementationSpec to ChangePlan compilation for known pages.
- `agent-app/packages/domain-client/src/implementation/ui-implementation-compiler.test.ts`: new/existing controls, critical gaps, fallbacks, and stable operation ordering.
- `agent-app/packages/domain-client/src/compile/control-compiler.ts`: apply StyleSpec during new IR compilation and export inventory helpers.
- `agent-app/packages/domain-client/src/compile/control-compiler.test.ts`: style fields survive deterministic compile.
- `agent-app/packages/domain-client/src/ir/client-project-ir.schema.ts`: optional validated StyleSpec on BaseControlIR.
- `agent-app/packages/domain-client/src/ir/client-project-ir.test.ts`: raw CSS is rejected at the IR gate.
- `agent-app/packages/domain-client/src/patch/client-patcher.ts`: normalize and execute `applyStyle`; compile create-operation style through the same engine.
- `agent-app/packages/domain-client/src/patch/client-patcher.test.ts`: imported/new control parity and unknown-field preservation.
- `agent-app/packages/domain-client/src/preview/client-preview.ts`: render StyleSpec through safe preview declarations instead of fixed default styling.
- `agent-app/packages/domain-client/src/preview/client-preview.test.ts`: preview theme/style fidelity and CSP regression tests.
- `agent-app/packages/domain-client/src/index.ts`: public exports.

---

### Task 1: Add Shared UI Style and Capability Contracts

**Files:**
- Create: `agent-app/packages/contracts/src/ui-style.ts`
- Create: `agent-app/packages/contracts/src/ui-style.test.ts`
- Modify: `agent-app/packages/contracts/src/index.ts`

**Interfaces:**
- Produces: `ThemeSpecSchema`, `StyleDeclarationSchema`, `ComponentStyleSpecSchema`, `UIImplementationSpecSchema`, `ControlCapabilitySchema`, `CapabilityReportSchema` and their inferred TypeScript types.
- Consumes: Zod only; this task must not import domain-client types.

- [ ] **Step 1: Write strict contract tests**

```ts
import { describe, expect, it } from "vitest";
import {
  ComponentStyleSpecSchema,
  ControlCapabilitySchema,
  UIImplementationSpecSchema,
} from "./ui-style.js";

describe("KF UI style contracts", () => {
  it("accepts structured style intent without raw CSS", () => {
    const parsed = ComponentStyleSpecSchema.parse({
      role: "primary-action",
      declarations: {
        backgroundColor: "{theme.primary}",
        textColor: "#ffffff",
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 600,
      },
      states: { hover: { backgroundColor: "#1d4ed8" } },
    });
    expect(parsed.role).toBe("primary-action");
  });

  it("rejects raw CSS and unknown declaration keys", () => {
    expect(ComponentStyleSpecSchema.safeParse({ css: "body{display:none}" }).success).toBe(false);
    expect(ComponentStyleSpecSchema.safeParse({ declarations: { position: "fixed" } }).success).toBe(false);
  });

  it("requires every capability dimension", () => {
    expect(ControlCapabilitySchema.safeParse({ id: "button" }).success).toBe(false);
  });

  it("requires stable page and component ids", () => {
    expect(UIImplementationSpecSchema.safeParse({ schema: "kf-ui-implementation/v1", theme: {}, pages: [] }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --filter @kf/contracts exec vitest run src/ui-style.test.ts`

Expected: FAIL because `ui-style.ts` and its exports do not exist.

- [ ] **Step 3: Implement the contracts**

Use strict objects and exact status values:

```ts
import { z } from "zod";

export const CapabilityStatusSchema = z.enum([
  "full",
  "partial",
  "preserve-only",
  "unsupported",
  "pending-verification",
]);

export const StyleDeclarationSchema = z.object({
  backgroundColor: z.string().max(128).optional(),
  textColor: z.string().max(128).optional(),
  borderColor: z.string().max(128).optional(),
  borderRadius: z.number().min(0).max(100).optional(),
  fontSize: z.number().min(8).max(200).optional(),
  fontWeight: z.number().int().min(100).max(900).optional(),
  lineHeight: z.number().min(0.5).max(4).optional(),
  padding: z.number().min(0).max(200).optional(),
  margin: z.number().min(0).max(200).optional(),
  gap: z.number().min(0).max(200).optional(),
  boxShadow: z.enum(["none", "small", "medium", "large"]).optional(),
  opacity: z.number().min(0).max(1).optional(),
  textAlign: z.enum(["left", "center", "right"]).optional(),
}).strict();

export const ComponentStyleSpecSchema = z.object({
  role: z.string().min(1).max(100).optional(),
  declarations: StyleDeclarationSchema.default({}),
  states: z.object({
    hover: StyleDeclarationSchema.optional(),
    active: StyleDeclarationSchema.optional(),
    focus: StyleDeclarationSchema.optional(),
    disabled: StyleDeclarationSchema.optional(),
    selected: StyleDeclarationSchema.optional(),
    error: StyleDeclarationSchema.optional(),
  }).strict().default({}),
}).strict();

export const ThemeSpecSchema = z.object({
  background: z.string().max(128),
  surface: z.string().max(128),
  primary: z.string().max(128),
  accent: z.string().max(128),
  textPrimary: z.string().max(128),
  textSecondary: z.string().max(128),
  fontFamily: z.string().min(1).max(200),
  spacingUnit: z.number().int().min(1).max(64),
  radiusScale: z.object({
    small: z.number().min(0).max(100),
    medium: z.number().min(0).max(100),
    large: z.number().min(0).max(100),
  }).strict(),
}).strict();

export const UIComponentSpecSchema = z.object({
  id: z.string().min(1).max(100),
  role: z.string().min(1).max(100),
  capabilityId: z.string().min(1).max(100),
  critical: z.boolean().default(true),
  fallbackCapabilityId: z.string().min(1).max(100).optional(),
  content: z.string().max(2_000).optional(),
  geometry: z.object({
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive(),
  }).strict(),
  properties: z.record(z.string(), z.unknown()).default({}),
  style: ComponentStyleSpecSchema,
}).strict();

export const UIImplementationSpecSchema = z.object({
  schema: z.literal("kf-ui-implementation/v1"),
  theme: ThemeSpecSchema,
  pages: z.array(z.object({
    id: z.string().min(1).max(100),
    width: z.number().positive(),
    height: z.number().positive(),
    components: z.array(UIComponentSpecSchema).min(1),
  }).strict()).min(1),
}).strict();

const CapabilityDimensionSchema = z.object({
  status: CapabilityStatusSchema,
  supported: z.array(z.string()).default([]),
  unsupported: z.array(z.string()).default([]),
}).strict();

export const ControlCapabilitySchema = z.object({
  id: z.string().min(1),
  category: z.enum(["static", "easyui", "layout", "prototype"]),
  displayName: z.string().min(1),
  generation: CapabilityDimensionSchema,
  style: CapabilityDimensionSchema.extend({ adapter: z.string().min(1).optional() }).strict(),
  preview: CapabilityDimensionSchema,
  dataBinding: CapabilityDimensionSchema,
  interaction: CapabilityDimensionSchema,
  runtimeVerification: z.object({
    status: z.enum(["unverified", "verified", "failed"]),
    runtimeFamily: z.string().optional(),
    runtimeVersion: z.string().optional(),
    baselineId: z.string().optional(),
  }).strict(),
  limitations: z.array(z.string()).default([]),
}).strict();

export const DeliveryGapSchema = z.object({
  componentId: z.string().min(1),
  capability: z.string().min(1),
  severity: z.enum(["critical", "non-critical"]),
  fallback: z.string().min(1).optional(),
  reason: z.string().min(1),
}).strict();

export const CapabilityReportSchema = z.object({
  status: z.enum(["pass", "warning", "fail"]),
  full: z.array(z.string()),
  partial: z.array(z.string()),
  unsupported: z.array(z.string()),
  deliveryGaps: z.array(DeliveryGapSchema),
}).strict();
```

Export every schema and its `z.infer` type. The arbitrary `properties` record is not copied into KF JSON directly; Task 7 validates it against the selected capability and Task 6 continues to use reviewed templates and pass-through lists.

- [ ] **Step 4: Export and run package gates**

Run:

```bash
pnpm --filter @kf/contracts exec vitest run src/ui-style.test.ts
pnpm --filter @kf/contracts typecheck
pnpm --filter @kf/contracts lint
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add agent-app/packages/contracts/src/ui-style.ts agent-app/packages/contracts/src/ui-style.test.ts agent-app/packages/contracts/src/index.ts
git commit -m "feat(contracts): add KF UI style contracts"
```

### Task 2: Add the Typed `applyStyle` Change Operation

**Files:**
- Modify: `agent-app/packages/contracts/src/change-plan.ts`
- Modify: `agent-app/packages/contracts/src/change-plan.test.ts`

**Interfaces:**
- Consumes: `ComponentStyleSpecSchema` and `ComponentStyleSpec` from Task 1.
- Produces: `ApplyStyleOperation` with `{ op: "applyStyle"; entityId: string; entityType: "control"; style: ComponentStyleSpec }`.

- [ ] **Step 1: Write failing operation round-trip tests**

```ts
it("keeps a structured applyStyle operation after parsing", () => {
  const parsed = changePlanSchema.parse({
    schema: "kf-change-plan/v1",
    workspaceId: "w-1",
    operations: [{
      op: "applyStyle",
      entityId: "button-guid-1",
      entityType: "control",
      style: {
        declarations: { backgroundColor: "#2563eb", borderRadius: 8 },
        states: { hover: { backgroundColor: "#1d4ed8" } },
      },
    }],
  });
  expect(parsed.operations[0]).toMatchObject({ op: "applyStyle", entityId: "button-guid-1" });
});

it("rejects applyStyle raw CSS", () => {
  expect(changePlanSchema.safeParse({
    schema: "kf-change-plan/v1",
    workspaceId: "w-1",
    operations: [{ op: "applyStyle", entityId: "x", entityType: "control", style: { css: "*{}" } }],
  }).success).toBe(false);
});
```

- [ ] **Step 2: Run RED test**

Run: `pnpm --filter @kf/contracts exec vitest run src/change-plan.test.ts`

Expected: FAIL because `applyStyle` is not in the discriminated union.

- [ ] **Step 3: Add the operation schema**

```ts
export const applyStyleOperationSchema = z.object({
  op: z.literal("applyStyle"),
  entityId: z.string().min(1),
  entityType: z.literal("control"),
  style: ComponentStyleSpecSchema,
}).strict();
```

Add it to `changeOperationSchema` and export the inferred type.

- [ ] **Step 4: Run package gates and commit**

```bash
pnpm --filter @kf/contracts exec vitest run src/change-plan.test.ts
pnpm --filter @kf/contracts typecheck
pnpm --filter @kf/contracts lint
git add agent-app/packages/contracts/src/change-plan.ts agent-app/packages/contracts/src/change-plan.test.ts
git commit -m "feat(contracts): add structured style operation"
```

### Task 3: Build the Capability Registry and Inventory Gate

**Files:**
- Create: `agent-app/packages/domain-client/src/style/control-capability-registry.ts`
- Create: `agent-app/packages/domain-client/src/style/control-capability-registry.test.ts`
- Modify: `agent-app/packages/domain-client/src/compile/control-compiler.ts`
- Modify: `agent-app/packages/domain-client/src/index.ts`

**Interfaces:**
- Consumes: `ControlCapability` from Task 1 and compiler template inventories.
- Produces: `listControlCapabilities()`, `getControlCapability(id)`, `assertCapabilityCoverage()`, `supportedEasyuiProtos()`, and `supportedPrototypeNames()`.

- [ ] **Step 1: Write inventory parity tests**

```ts
describe("control capability registry", () => {
  it("covers every compiler type and variant exactly once", () => {
    expect(() => assertCapabilityCoverage()).not.toThrow();
    expect(new Set(listControlCapabilities().map((item) => item.id)).size)
      .toBe(listControlCapabilities().length);
  });

  it("does not claim full support without runtime verification", () => {
    for (const capability of listControlCapabilities()) {
      if (capability.runtimeVerification.status !== "verified") {
        expect(capability.style.status).not.toBe("full");
      }
    }
  });

  it("records unsupported style capability instead of omitting the control", () => {
    expect(getControlCapability("webcontainer")?.style.status)
      .toBe("unsupported");
  });
});
```

- [ ] **Step 2: Run RED test**

Run: `pnpm --filter @kf/domain-client exec vitest run src/style/control-capability-registry.test.ts`

Expected: FAIL because the registry functions do not exist.

- [ ] **Step 3: Export compiler inventories**

Add pure read-only helpers returning sorted immutable lists. Do not export template objects:

```ts
export function supportedEasyuiProtos(): readonly number[] {
  return Object.keys(EASYUI_TEMPLATES).map(Number).sort((a, b) => a - b);
}
```

Expose the reviewed prototype names from the single template source used by compilation. Do not duplicate the list in tests.

- [ ] **Step 4: Implement explicit registry records**

Use ids `button`, `text`, `layout.2`, `easyui.2`, and `prototype.TrendChart`. First-batch entries start `pending-verification`; other known entries are `partial`, `preserve-only`, or `unsupported` with non-empty limitations. `assertCapabilityCoverage()` compares the registry against all static control types, EasyUI proto ids, layout types `0,2,3,4,5,6`, and reviewed prototype names.

- [ ] **Step 5: Run package gates and commit**

```bash
pnpm --filter @kf/domain-client exec vitest run src/style/control-capability-registry.test.ts
pnpm --filter @kf/domain-client typecheck
pnpm --filter @kf/domain-client lint
git add agent-app/packages/domain-client/src/style agent-app/packages/domain-client/src/compile/control-compiler.ts agent-app/packages/domain-client/src/index.ts
git commit -m "feat(domain-client): register control capabilities"
```

### Task 4: Implement Safe CSS Compilation and Theme Resolution

**Files:**
- Create: `agent-app/packages/domain-client/src/style/runtime-profile.ts`
- Create: `agent-app/packages/domain-client/src/style/css-compiler.ts`
- Create: `agent-app/packages/domain-client/src/style/css-compiler.test.ts`
- Create: `agent-app/packages/domain-client/src/style/theme-resolver.ts`
- Create: `agent-app/packages/domain-client/src/style/theme-resolver.test.ts`

**Interfaces:**
- Consumes: `ThemeSpec`, `StyleDeclaration`, `ComponentStyleSpec`.
- Produces: `KF36_RUNTIME_PROFILE`, `resolveComponentStyle(theme, roleStyle, typeStyle, instanceStyle)`, and `compileScopedCss(selectorRoles, declarationsByState)`.

- [ ] **Step 1: Write CSS rejection and determinism tests**

```ts
it("emits deterministic scoped CSS", () => {
  expect(compileScopedCss(KF36_RUNTIME_PROFILE.selectors.button, {
    normal: { borderRadius: 8, boxShadow: "medium" },
    hover: { backgroundColor: "#1d4ed8" },
  })).toBe(
    "#domId{border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.18)}" +
    "#domId:hover{background-color:#1d4ed8}",
  );
});

it.each(["url(https://evil.invalid/x)", "expression(alert(1))", "javascript:alert(1)", "@import x"])(
  "rejects unsafe value %s",
  (value) => expect(() => compileScopedCss({ root: "#domId" }, {
    normal: { backgroundColor: value },
  })).toThrow(/unsafe style value/i),
);
```

- [ ] **Step 2: Run RED tests**

Run: `pnpm --filter @kf/domain-client exec vitest run src/style/css-compiler.test.ts src/style/theme-resolver.test.ts`

Expected: FAIL because compiler and resolver do not exist.

- [ ] **Step 3: Implement token resolution and layer precedence**

Resolve only exact `{theme.<key>}` tokens. Throw `STYLE_TOKEN_UNRESOLVED` for missing keys. Merge declarations in the approved order `theme-derived role → role → type → instance`; state declarations merge independently with the same precedence.

- [ ] **Step 4: Implement declaration serialization**

Map contract keys to fixed CSS property names, map shadow enums to fixed values, append `px` only for numeric pixel fields, sort properties lexicographically, and reject any string containing case-insensitive `url(`, `@import`, `javascript:`, `expression(`, `behavior:`, `<`, `>`, `{`, or `}`. Selectors come only from `KFRuntimeProfile`; the function accepts no arbitrary selector string from model data.

- [ ] **Step 5: Run package gates and commit**

```bash
pnpm --filter @kf/domain-client exec vitest run src/style/css-compiler.test.ts src/style/theme-resolver.test.ts
pnpm --filter @kf/domain-client typecheck
pnpm --filter @kf/domain-client lint
git add agent-app/packages/domain-client/src/style
git commit -m "feat(domain-client): compile safe scoped KF styles"
```

### Task 5: Implement the Style Engine and First-Batch Adapters

**Files:**
- Create: `agent-app/packages/domain-client/src/style/style-adapter.ts`
- Create: `agent-app/packages/domain-client/src/style/adapters/base-adapters.ts`
- Create: `agent-app/packages/domain-client/src/style/adapters/base-adapters.test.ts`
- Create: `agent-app/packages/domain-client/src/style/style-engine.ts`
- Create: `agent-app/packages/domain-client/src/style/style-engine.test.ts`
- Modify: `agent-app/packages/domain-client/src/index.ts`

**Interfaces:**
- Consumes: resolved ComponentStyleSpec, capability id, `KF36_RUNTIME_PROFILE`.
- Produces: `compileControlStyle({ capabilityId, theme, roleStyle, typeStyle, instanceStyle, runtimeProfile }): CompiledControlStyle` with `nativeFields`, `styleDataNew`, `unsupported`, and `warnings`.

```ts
export interface UnsupportedStyle {
  token: string;
  reason: string;
}

export interface StyleWarning {
  code: string;
  message: string;
}

export interface CompiledControlStyle {
  nativeFields: Record<string, unknown>;
  styleDataNew: string;
  unsupported: UnsupportedStyle[];
  warnings: StyleWarning[];
}
```

- [ ] **Step 1: Write adapter behavior tests**

```ts
it("splits a button style into native fields and scoped CSS", () => {
  expect(compileControlStyle({
    capabilityId: "button",
    theme: { primary: "#2563eb", surface: "#172338", textPrimary: "#ffffff", textSecondary: "#94a3b8", fontFamily: "Microsoft YaHei", spacingUnit: 8, radiusScale: { small: 4, medium: 8, large: 12 } },
    instanceStyle: {
      declarations: { backgroundColor: "{theme.primary}", textColor: "#ffffff", fontSize: 14, fontWeight: 600, borderRadius: 8 },
      states: { hover: { backgroundColor: "#1d4ed8" } },
    },
    runtimeProfile: KF36_RUNTIME_PROFILE,
  })).toMatchObject({
    nativeFields: { backgroundColor: "#2563eb" },
    unsupported: [],
  });
});

it("records unsupported state styles", () => {
  const result = compileControlStyle({
    capabilityId: "text",
    theme: themeFixture,
    instanceStyle: { declarations: {}, states: { selected: { backgroundColor: "#fff" } } },
    runtimeProfile: KF36_RUNTIME_PROFILE,
  });
  expect(result.unsupported).toContainEqual(expect.objectContaining({ token: "states.selected.backgroundColor" }));
});
```

- [ ] **Step 2: Run RED tests**

Run: `pnpm --filter @kf/domain-client exec vitest run src/style/adapters/base-adapters.test.ts src/style/style-engine.test.ts`

Expected: FAIL because adapter registry and engine do not exist.

- [ ] **Step 3: Implement focused adapter groups**

Implement adapters for:

- display: text, richtext, image, tag;
- action: button and EasyUI linkbutton (`easyui.2`);
- form: input, inputnumber, select, checkbox, radio, switch, datetimepicker;
- organization: tabs, spacer and layout roots `layout.2`, `layout.4`, `layout.5`, `layout.6`.

Use native fields only where existing KF templates/allowlists prove the field name. Use scoped CSS for remaining approved declarations. Unsupported declarations must be returned, never silently dropped.

- [ ] **Step 4: Register adapters and enforce capability agreement**

At module initialization, verify that each `pending-verification` style capability names a registered adapter and each adapter targets an existing capability id. Throw `STYLE_ADAPTER_REGISTRY_MISMATCH` otherwise.

- [ ] **Step 5: Run package gates and commit**

```bash
pnpm --filter @kf/domain-client exec vitest run src/style/adapters/base-adapters.test.ts src/style/style-engine.test.ts
pnpm --filter @kf/domain-client typecheck
pnpm --filter @kf/domain-client lint
git add agent-app/packages/domain-client/src/style agent-app/packages/domain-client/src/index.ts
git commit -m "feat(domain-client): add KF control style adapters"
```

### Task 6: Apply Styles in IR Compilation and Lossless Patching

**Files:**
- Modify: `agent-app/packages/domain-client/src/ir/client-project-ir.schema.ts`
- Modify: `agent-app/packages/domain-client/src/ir/client-project-ir.test.ts`
- Modify: `agent-app/packages/domain-client/src/compile/control-compiler.ts`
- Modify: `agent-app/packages/domain-client/src/compile/control-compiler.test.ts`
- Modify: `agent-app/packages/domain-client/src/patch/client-patcher.ts`
- Modify: `agent-app/packages/domain-client/src/patch/client-patcher.test.ts`

**Interfaces:**
- Consumes: `ComponentStyleSpec`, `ApplyStyleOperation`, `compileControlStyle()`.
- Produces: optional `style` on `BaseControlIR`; `NormalizedOperation.op` includes `applyStyle`; create operations may carry a validated `properties.style`.

- [ ] **Step 1: Write RED tests for new and imported controls**

```ts
it("compiles the same StyleSpec for a new IR button", () => {
  const compiled = compileControl(build, buttonIrWithStyle, context);
  expect(compiled.backgroundColor).toBe("#2563eb");
  expect(compiled.styleDataNew).toContain("border-radius:8px");
});

it("applies structured style to an imported control without changing unknown fields", async () => {
  const candidate = await applyClientPatch(base, plan([{
    op: "applyStyle",
    entityId: "button-guid-1",
    entityType: "control",
    style: { declarations: { backgroundColor: "#2563eb", borderRadius: 8 }, states: {} },
  }]));
  expect(await controlField(candidate, "button-guid-1", "backgroundColor")).toBe("#2563eb");
  expect(await controlField(candidate, "button-guid-1", "styleDataNew")).toContain("border-radius:8px");
  expect(await controlField(candidate, "button-guid-1", "customFutureField")).toEqual({ keep: true });
});
```

- [ ] **Step 2: Run focused RED tests**

Run:

```bash
pnpm --filter @kf/domain-client exec vitest run src/ir/client-project-ir.test.ts src/compile/control-compiler.test.ts src/patch/client-patcher.test.ts
```

Expected: FAIL because IR style and `applyStyle` are not supported.

- [ ] **Step 3: Add validated IR style**

Extend `BaseControlIR` with `style: ComponentStyleSpecSchema.optional()`. Keep the discriminated union strict enough that a `css` field or undeclared style token fails Zod parsing.

- [ ] **Step 4: Apply style after semantic overrides in the compiler**

Compile the control normally, call `compileControlStyle`, merge `nativeFields`, and set `styleDataNew` to the compiled CSS. Direct IR compilation has no fallback context, so any non-empty `unsupported` list throws `MODEL_OUTPUT_INVALID: UNSUPPORTED_STYLE_TOKEN`; Task 7 is the only layer allowed to turn a non-critical request into an explicit verified fallback and capability-report entry.

- [ ] **Step 5: Normalize and execute `applyStyle` in the patcher**

Extend `NormalizedOperation` with `op: "applyStyle"` and `style?: ComponentStyleSpec`. Resolve the imported control type/proto/layout from inspection, map it to capability id, compile the style, and assign only returned native fields plus `styleDataNew`. Validate each native field against the existing allowlist before assignment. For create operations, parse `properties.style` with `ComponentStyleSpecSchema` and use the same engine after template merging.

- [ ] **Step 6: Run domain-client gates and commit**

```bash
pnpm --filter @kf/domain-client test
pnpm --filter @kf/domain-client typecheck
pnpm --filter @kf/domain-client lint
git add agent-app/packages/domain-client/src/ir agent-app/packages/domain-client/src/compile agent-app/packages/domain-client/src/patch
git commit -m "feat(domain-client): apply structured styles to KF controls"
```

### Task 7: Compile UIImplementationSpec into a Deterministic ChangePlan

**Files:**
- Create: `agent-app/packages/domain-client/src/implementation/ui-implementation-compiler.ts`
- Create: `agent-app/packages/domain-client/src/implementation/ui-implementation-compiler.test.ts`
- Modify: `agent-app/packages/domain-client/src/index.ts`

**Interfaces:**
- Consumes: validated `UIImplementationSpec`, capability registry, and `ImplementationCompileContext`.
- Produces: `compileUiImplementation(spec, context): { plan: ChangePlan; capabilityReport: CapabilityReport }`.

```ts
export interface ImplementationCompileContext {
  workspaceId: string;
  pageGuidById: Readonly<Record<string, string>>;
  existingControlGuidByComponentId: Readonly<Record<string, string>>;
}
```

- [ ] **Step 1: Write deterministic planning tests**

```ts
it("creates new controls and styles existing controls in stable order", () => {
  const result = compileUiImplementation(specFixture, {
    workspaceId: "w-1",
    pageGuidById: { overview: "page-guid-1" },
    existingControlGuidByComponentId: { ExistingTitle: "title-guid-1" },
  });
  expect(result.plan.operations.map((op) => `${op.op}:${op.entityId}`)).toEqual([
    "applyStyle:title-guid-1",
    "create:SubmitButton",
  ]);
});

it("fails on a critical unsupported control", () => {
  expect(() => compileUiImplementation(unsupportedCriticalSpec, context))
    .toThrow(/UNSUPPORTED_CRITICAL_CAPABILITY/);
});

it("records a verified non-critical fallback", () => {
  const result = compileUiImplementation(specWithFallback, context);
  expect(result.capabilityReport.deliveryGaps).toContainEqual(
    expect.objectContaining({ severity: "non-critical", fallback: "text" }),
  );
});
```

- [ ] **Step 2: Run RED test**

Run: `pnpm --filter @kf/domain-client exec vitest run src/implementation/ui-implementation-compiler.test.ts`

Expected: FAIL because implementation compiler does not exist.

- [ ] **Step 3: Implement validation and stable compilation**

Parse input with `UIImplementationSpecSchema`, resolve each page id through `pageGuidById`, query capabilities, reject critical gaps, and sort operations by page order then component order. Existing components produce `applyStyle` plus semantic update operations only for declared content changes. New components produce a create operation whose `properties` include pageId, selected type/variant, geometry, semantic properties, and structured `style`—never raw CSS.

- [ ] **Step 4: Ensure reports list every partial or unsupported token**

The compiler must aggregate adapter `unsupported` results by component id and include the selected fallback. An empty report is allowed only when every selected capability supports every requested token.

- [ ] **Step 5: Run package gates and commit**

```bash
pnpm --filter @kf/domain-client exec vitest run src/implementation/ui-implementation-compiler.test.ts
pnpm --filter @kf/domain-client typecheck
pnpm --filter @kf/domain-client lint
git add agent-app/packages/domain-client/src/implementation agent-app/packages/domain-client/src/index.ts
git commit -m "feat(domain-client): compile UI implementation plans"
```

### Task 8: Render Safe Style-Aware Local Previews and Verify the Foundation

**Files:**
- Modify: `agent-app/packages/domain-client/src/preview/client-preview.ts`
- Modify: `agent-app/packages/domain-client/src/preview/client-preview.test.ts`
- Create: `docs/superpowers/reports/2026-08-10-kf-style-engine-foundation-verification.md`

**Interfaces:**
- Consumes: IR `style`, `compileControlStyle`, and the approved preview CSP.
- Produces: preview markup with safe deterministic inline declarations and a verification report for the entire foundation plan.

- [ ] **Step 1: Write preview fidelity and security tests**

```ts
it("renders approved style intent without exposing raw KF CSS", () => {
  const html = renderClientPreview(irWithStyledButton);
  expect(html).toContain("background-color:#2563eb");
  expect(html).toContain("border-radius:8px");
  expect(html).not.toContain("styleDataNew");
});

it("keeps the preview inert", () => {
  const html = renderClientPreview(irWithStyledButton);
  expect(html).not.toContain("<script");
  expect(html).not.toMatch(/https?:\/\//i);
  expect(html).toContain("default-src 'none'");
});
```

- [ ] **Step 2: Run RED preview test**

Run: `pnpm --filter @kf/domain-client exec vitest run src/preview/client-preview.test.ts`

Expected: FAIL because preview ignores StyleSpec.

- [ ] **Step 3: Render through the same resolved style model**

Use the style engine's resolved declarations and a preview-specific property serializer. Do not inject `styleDataNew` into preview HTML. Keep all user text escaped, remote resources blocked, and scripts absent. Continue to treat this as a fast preview; do not label it runtime verified.

- [ ] **Step 4: Run all affected package gates**

```bash
pnpm --filter @kf/contracts test
pnpm --filter @kf/domain-client test
pnpm --filter @kf/contracts typecheck
pnpm --filter @kf/domain-client typecheck
pnpm --filter @kf/contracts lint
pnpm --filter @kf/domain-client lint
```

Expected: all PASS.

- [ ] **Step 5: Run repository-wide regression gates**

```bash
pnpm test
pnpm typecheck
pnpm lint
```

Expected: all PASS. If an unrelated pre-existing failure occurs, record the exact command, test name, error, and evidence that the focused packages pass; do not claim full verification.

- [ ] **Step 6: Write the verification report**

The report must list commands and results, capability counts by status, first-batch adapter ids, unsupported controls/tokens, known limitations, and explicitly state that real KF runtime verification is deferred to the next plan. Scan it for credentials before staging.

- [ ] **Step 7: Commit**

```bash
git add agent-app/packages/domain-client/src/preview docs/superpowers/reports/2026-08-10-kf-style-engine-foundation-verification.md
git commit -m "test(domain-client): verify KF style engine foundation"
```

## Plan Completion Criteria

The plan is complete only when:

- Shared contracts reject raw CSS and unknown style fields.
- Every current compiler/IR control and variant has a capability record.
- First-batch adapters compile structured style to native fields and scoped CSS deterministically.
- New IR controls, create operations, and imported-control updates use the same style engine.
- UIImplementationSpec compiles to stable ChangePlan operations with a complete capability report.
- Local preview renders the approved style intent safely.
- Focused tests, typecheck, and lint pass; repository-wide results are documented.
- No capability is promoted to `full` before real KF runtime verification.
- No credentials or server-specific secrets are present in source, fixtures, snapshots, reports, or commits.
