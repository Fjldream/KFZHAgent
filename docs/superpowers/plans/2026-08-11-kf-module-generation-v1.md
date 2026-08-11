# KF Module Generation V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a module-planning layer that lets DeepSeek autonomously compose validated KingClient modules while deterministic tools generate exact KF controls, assets, layouts, previews, and incremental revisions.

**Architecture:** Keep the current LangGraph, `UIImplementationSpec`, KingClient DomainPack, build worker, validation, preview, Revision, and packaging pipeline. Replace the confirmed-blueprint path in which DeepSeek directly authors every control with `CustomerEffectBlueprint → ModulePlan → deterministic Module Compiler → UIImplementationSpec`; preserve the legacy UI implementation path only for imported controls that have not yet been adopted into a module. The first release executes only `kingclient`, while existing DomainPack and Solution revision boundaries remain the extension point for calculation, datasource, and acquisition projects.

**Tech Stack:** TypeScript 5.9, Zod 4, LangGraph 1.4, NestJS 11, Prisma 6/PostgreSQL, DeepSeek OpenAI-compatible API, Vitest 3, Vue 3/Vite, existing `@kf/contracts`, `@kf/domain-client`, `@kf/agent-orchestrator`, `@kf/build-jobs`, and artifact storage packages.

## Global Constraints

- First release executes only `kingclient`; future domain metadata remains registered as unsupported and no empty future-domain package may be emitted.
- The customer approves only the customer-effect blueprint and the final preview; `ModulePlan`, `UIImplementationSpec`, and `ChangePlan` are internal and never require a customer-facing technical-plan approval.
- DeepSeek may choose module kind, variant, order, region, grid span, preferred height, alignment, emphasis, theme tokens, assets, and registered interactions.
- DeepSeek must never emit raw KF JSON, KF GUIDs, absolute control coordinates, file paths, storage keys, arbitrary CSS, JavaScript, or unregistered scripts.
- Exact coordinates, stable component IDs, native fields, controlled CSS, asset target paths, and KF JSON are deterministic Tool/compiler outputs.
- KF-native controls are mandatory by default; WebContainer is allowed only after explicit user authorization recorded in the plan.
- Missing critical assets, blueprint coverage, controls, interactions, geometry, references, or package files block delivery; minor supported visual differences may produce `ready_with_warnings`.
- No complex module may silently degrade to one text control.
- New projects may remove only the known generated seed placeholder; imported unrelated customer controls must be preserved.
- Incremental changes must preserve untouched module IDs, component IDs, KF GUIDs, geometry, style, properties, and asset bindings.
- Automatic repair is bounded to three attempts and mutates ModulePlan, never raw KF JSON.
- Multimodal visual review, AI image generation, customer-machine deployment, and real calculation/datasource/acquisition compilers remain out of scope.
- Tests use strict RED/GREEN TDD. Every task ends with focused tests, package typecheck, changed-file lint, `git diff --check`, and an independently reviewable commit.
- Existing unrelated untracked files (`1.js`, `docs/audits/`, `docs/kf-special-node-field-map.md`, `docs/superpowers/plans/2026-08-10-kf-special-nodes.md`, `reasonix.toml`) must not be staged or modified.
- Calculation, datasource, and acquisition implementations require separate domain-specific specs and plans after this KingClient V1 is accepted; this plan changes no future-domain compiler.

## File and Ownership Map

| Area | Files | Responsibility |
|---|---|---|
| Shared contract | `packages/contracts/src/module-plan.ts`, `asset.ts`, `module-delivery.ts` | Strict model-safe plans, asset references, delivery states, trace reports |
| Module domain | `packages/domain-client/src/modules/*` | Registry, layout solver, module templates, deterministic compilation, quality gates |
| Asset API | `apps/api/src/assets/*`, Prisma `WorkspaceAsset` | Tenant-scoped upload, metadata, lookup, storage adoption |
| Agent model | `apps/api/src/conversations/deepseek-model.ts`, `fake-model.ts` | Generate/revise ModulePlan only from bounded registries |
| Workflow | `packages/agent-orchestrator/src/nodes/module-plan.ts` | Coverage, compile, repair, persistence, direct preview build authorization |
| Build materialization | `packages/build-jobs/src/job-executor.ts`, DomainPack patch input, client patcher | Resolve approved asset IDs and copy bytes into safe KF package paths |
| Web delivery | workspace store and result components | Show preview, `ready` state, warnings, unsupported capabilities, and revision changes |
| Acceptance | package/API/E2E tests and `agent-app/docs/module-generation-v1-acceptance.md` | Portal, industrial dashboard, and admin golden flows |

---

### Task 1: Add Strict ModulePlan, Asset, Trace, and Delivery Contracts

**Files:**
- Create: `agent-app/packages/contracts/src/module-plan.ts`
- Create: `agent-app/packages/contracts/src/module-plan.test.ts`
- Create: `agent-app/packages/contracts/src/asset.ts`
- Create: `agent-app/packages/contracts/src/asset.test.ts`
- Create: `agent-app/packages/contracts/src/module-delivery.ts`
- Create: `agent-app/packages/contracts/src/module-delivery.test.ts`
- Modify: `agent-app/packages/contracts/src/index.ts`

**Interfaces:**
- Consumes: existing `ThemeSpecSchema`, `projectKeySchema`, and JSON-safe Zod patterns.
- Produces: `ModulePlanSchema`, `ModulePlanOperationSchema`, `AssetRecordSchema`, `ResolvedAssetSchema`, `ModuleTraceSchema`, `ModuleDeliveryReportSchema`, and their inferred TypeScript types.

- [ ] **Step 1: Write RED schema tests** for a valid `vertical-flow` portal, duplicate page/module IDs, unknown keys, arbitrary `css`, raw coordinates, paths, storage keys, scripts, and invalid asset references.

```ts
expect(ModulePlanSchema.parse(validPlan).schema).toBe("kf-module-plan/v1");
expect(ModulePlanSchema.safeParse({
  ...validPlan,
  pages: [{ ...validPlan.pages[0], modules: [
    { ...hero, id: "hero" }, { ...hero, id: "hero" },
  ] }],
}).success).toBe(false);
expect(ModulePlanSchema.safeParse({
  ...validPlan,
  pages: [{ ...validPlan.pages[0], modules: [{ ...hero, css: "*{}" }] }],
}).success).toBe(false);
```

- [ ] **Step 2: Run RED:** `pnpm --filter @kf/contracts exec vitest run src/module-plan.test.ts src/asset.test.ts src/module-delivery.test.ts`; expect missing exports/schemas.
- [ ] **Step 3: Implement strict schemas** with page modes `vertical-flow | dashboard-grid | admin-shell`, stable bounded IDs, `placement` (`region`, `order`, `columnSpan`, `preferredHeight`, `alignment`, `emphasis`), registered interaction shapes, `assetId` references, and `add/update/move/resize/remove` operations. Use `.strict()` and `superRefine()` for uniqueness and cross-reference checks.
- [ ] **Step 4: Define delivery states** exactly as `ready | ready_with_warnings | blocked`; every gap carries `moduleId`, `requirement`, `severity`, `status`, `reason`, and optional alternatives.
- [ ] **Step 5: Run GREEN and typecheck:** focused Vitest command above, then `pnpm --filter @kf/contracts typecheck` and `pnpm --filter @kf/contracts lint`.
- [ ] **Step 6: Commit:** `git commit -m "feat(contracts): add module planning contracts"`.

### Task 2: Implement the Versioned Module Registry

**Files:**
- Create: `agent-app/packages/domain-client/src/modules/types.ts`
- Create: `agent-app/packages/domain-client/src/modules/module-registry.ts`
- Create: `agent-app/packages/domain-client/src/modules/module-registry.test.ts`
- Modify: `agent-app/packages/domain-client/src/index.ts`

**Interfaces:**
- Consumes: Task 1 `ModuleInstance`, `ModuleDeliveryGap`, `AssetRecord`, and current `UIComponentSpec` types.
- Produces: `ModuleDefinition`, `ModuleCompileContext`, `ModuleCompileOutput`, `ModuleRegistry`, and `createDefaultModuleRegistry()`.

```ts
export interface ModuleDefinition {
  readonly kind: string;
  readonly version: string;
  readonly category: string;
  readonly maturity: "stable" | "beta" | "unsupported";
  readonly variants: readonly string[];
  readonly contentSchema: z.ZodType<Record<string, unknown>>;
  readonly assetSlots: readonly AssetSlotDefinition[];
  readonly requiredKfCapabilities: readonly string[];
  readonly layout: ModuleLayoutContract;
  compile(input: ModuleCompileInput): ModuleCompileOutput;
}
```

- [ ] **Step 1: Write RED tests** for duplicate `kind@version`, exact version resolution, stable-only planning catalog, beta warning, unsupported rejection, missing capability rejection, and immutable catalog snapshots.
- [ ] **Step 2: Run RED:** `pnpm --filter @kf/domain-client exec vitest run src/modules/module-registry.test.ts`; expect missing registry.
- [ ] **Step 3: Implement registry operations** `register`, `require`, `listForPlanning`, and `validateInstance`; never select “latest” implicitly—ModulePlan must pin an exact version.
- [ ] **Step 4: Add a deterministic planning summary** that exposes only kind, version, maturity, variants, slots, interactions, and layout bounds; exclude compiler functions and KF native templates.
- [ ] **Step 5: Run GREEN, typecheck, scoped lint, and diff check.**
- [ ] **Step 6: Commit:** `git commit -m "feat(domain-client): add versioned module registry"`.

### Task 3: Build the Deterministic Three-Mode Layout Solver

**Files:**
- Create: `agent-app/packages/domain-client/src/modules/layout/layout-engine.ts`
- Create: `agent-app/packages/domain-client/src/modules/layout/layout-engine.test.ts`
- Create: `agent-app/packages/domain-client/src/modules/layout/layout-errors.ts`
- Modify: `agent-app/packages/domain-client/src/modules/types.ts`
- Modify: `agent-app/packages/domain-client/src/index.ts`

**Interfaces:**
- Consumes: validated page layout, ordered module instances, and Registry layout contracts.
- Produces: `solvePageLayout(page, registry): PageLayoutResult` with page dimensions and one integer `ModuleBounds` per module.

```ts
export interface ModuleBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageLayoutResult {
  pageId: string;
  width: number;
  height: number;
  boundsByModuleId: Readonly<Record<string, ModuleBounds>>;
}
```

- [ ] **Step 1: Write RED tests** proving `vertical-flow` grows beyond 900px, 12-column spans are exact, `dashboard-grid` blocks overflow without global scaling, `admin-shell` reserves header/sidebar/main regions, and only the affected suffix moves after insertion.
- [ ] **Step 2: Run RED:** `pnpm --filter @kf/domain-client exec vitest run src/modules/layout/layout-engine.test.ts`.
- [ ] **Step 3: Implement integer grid math** from `canvasWidth`, padding, gap, region, span, and Registry min/preferred/max height. Sort by `(region, order, moduleId)` for deterministic tie-breaking.
- [ ] **Step 4: Implement overflow behavior:** grow page height only for `vertical-flow`; return typed `LAYOUT_OVERFLOW`, `MODULE_TOO_SMALL`, or `INVALID_REGION` issues for fixed layouts; never mutate unrelated bounds to repair one module.
- [ ] **Step 5: Add previous-layout anchoring** so unchanged prefix/sibling modules keep their bounds during a local revision.
- [ ] **Step 6: Run GREEN, full domain-client tests, typecheck, scoped lint, and diff check.**
- [ ] **Step 7: Commit:** `git commit -m "feat(domain-client): add deterministic module layout solver"`.

### Task 4: Add Tenant-Scoped Asset Upload and Catalog APIs

**Files:**
- Modify: `agent-app/prisma/schema.prisma`
- Create: `agent-app/prisma/migrations/20260811160000_workspace_assets/migration.sql`
- Create: `agent-app/apps/api/src/assets/assets.module.ts`
- Create: `agent-app/apps/api/src/assets/asset.controller.ts`
- Create: `agent-app/apps/api/src/assets/asset.service.ts`
- Create: `agent-app/apps/api/src/assets/asset.service.test.ts`
- Modify: `agent-app/apps/api/src/app.module.ts`
- Modify: `agent-app/apps/api/package.json`
- Modify: `agent-app/pnpm-lock.yaml`

**Interfaces:**
- Consumes: Task 1 `AssetRecord`, current `ArtifactStorage`, tenant guard, and raw streaming upload pattern used by workspace source packages.
- Produces: `POST /api/workspaces/:workspaceId/assets`, `GET /api/workspaces/:workspaceId/assets`, and `AssetService.resolveMany()`.

```prisma
model WorkspaceAsset {
  id          String   @id @default(uuid())
  tenantId    String
  workspaceId String
  type        String
  name        String
  mediaType   String
  storageKey  String
  sha256      String
  sizeBytes   Int
  width       Int?
  height      Int?
  tags        Json
  createdAt   DateTime @default(now())

  @@unique([tenantId, workspaceId, sha256])
  @@index([tenantId, workspaceId])
}
```

- [ ] **Step 1: Add RED service/API tests** for PNG/JPEG/WebP upload, MIME sniffing, size limit, tenant isolation, checksum deduplication, missing workspace, list metadata without `storageKey`, and deletion cleanup through workspace deletion.
- [ ] **Step 2: Run RED:** `pnpm --filter @kf/api exec vitest run src/assets/asset.service.test.ts src/api.integration.test.ts -t "workspace assets"`.
- [ ] **Step 3: Add `image-size` to `@kf/api`** and implement streaming storage plus bounded metadata inspection; reject SVG, HTML, executable, empty, and dimensionless payloads.
- [ ] **Step 4: Persist only after storage succeeds; on DB failure use the existing adopted/unknown/unreferenced cleanup pattern so an ambiguous commit never deletes an adopted blob.**
- [ ] **Step 5: Implement `resolveMany({ tenantId, workspaceId, assetIds })`** with one tenant/workspace-scoped query, stable ordering, and exact missing-ID reporting; never return `storageKey` to the model or web catalog response.
- [ ] **Step 6: Generate Prisma client, run migration validation, focused tests, API typecheck/lint, and diff check.**
- [ ] **Step 7: Commit:** `git commit -m "feat(api): add workspace asset catalog"`.

### Task 5: Implement the Module Compiler Core and Theme Translation

**Files:**
- Create: `agent-app/packages/domain-client/src/modules/module-compiler.ts`
- Create: `agent-app/packages/domain-client/src/modules/module-compiler.test.ts`
- Create: `agent-app/packages/domain-client/src/modules/theme/module-theme.ts`
- Create: `agent-app/packages/domain-client/src/modules/theme/module-theme.test.ts`
- Create: `agent-app/packages/domain-client/src/modules/stable-ids.ts`
- Modify: `agent-app/packages/domain-client/src/index.ts`

**Interfaces:**
- Consumes: ModulePlan, Registry, layout results, resolved asset metadata, previous ModulePlan/UIImplementationSpec, and existing component identities.
- Produces: `compileModulePlan(input): ModuleCompilationResult` containing `UIImplementationSpec`, `ModuleTrace[]`, asset bindings, and preliminary delivery gaps.

```ts
export interface ModuleCompilationResult {
  implementation: UIImplementationSpec;
  traces: ModuleTrace[];
  assetBindings: ResolvedAssetBinding[];
  gaps: ModuleDeliveryGap[];
}

export function compileModulePlan(input: {
  plan: ModulePlan;
  registry: ModuleRegistry;
  assetsById: Readonly<Record<string, ResolvedAsset>>;
  previousPlan?: ModulePlan;
  previousImplementation?: UIImplementationSpec;
}): ModuleCompilationResult;
```

- [ ] **Step 1: Write RED tests** for stable IDs (`module-id/slot`), local-to-page coordinate translation, exact ThemeSpec output, missing asset blocking, no raw CSS/native payload, deterministic repeated compilation, and previous untouched component reuse.
- [ ] **Step 2: Run RED:** `pnpm --filter @kf/domain-client exec vitest run src/modules/module-compiler.test.ts src/modules/theme/module-theme.test.ts`.
- [ ] **Step 3: Implement theme token resolution** exclusively into the existing strict `ThemeSpec` and `ComponentStyleSpec`; delegate CSS/native compilation to existing Style Adapter code.
- [ ] **Step 4: Implement compilation orchestration** as `validate plan → resolve exact definitions → solve page layout → compile each module locally → translate to page coordinates → schema-parse UIImplementationSpec`.
- [ ] **Step 5: Reject duplicate stable component IDs and any module compiler output outside its assigned bounds.**
- [ ] **Step 6: Run GREEN, all domain-client tests, typecheck, scoped lint, and diff check.**
- [ ] **Step 7: Commit:** `git commit -m "feat(domain-client): compile module plans deterministically"`.

### Task 6: Implement Portal Modules with Runtime-Gated Maturity

**Files:**
- Create: `agent-app/packages/domain-client/src/modules/definitions/portal-modules.ts`
- Create: `agent-app/packages/domain-client/src/modules/definitions/portal-modules.test.ts`
- Create: `agent-app/packages/domain-client/src/modules/definitions/shared-primitives.ts`
- Create: `agent-app/packages/domain-client/src/modules/definitions/fixtures/portal-plan.ts`
- Modify: `agent-app/packages/domain-client/src/modules/module-registry.ts`

**Interfaces:**
- Consumes: Task 2 Registry, Task 3 bounds, Task 5 compiler helpers, existing capabilities `layout.*`, `text`, `richtext`, `image`, `button`, `tag`, `timeline`, `tabs`, `input`, and `navmenu`.
- Produces definitions for `navigation.top`, `content.hero`, `metric.kpi-grid`, `content.card-grid`, `content.timeline`, `interaction.tabs-filter`, `form.record-editor`, and `content.contact-footer`; maturity remains `beta` unless every required KF capability already has matching real-runtime verification evidence.

- [ ] **Step 1: Write RED contract tests** for every module variant, required content/assets, minimum child-control structure, content-length overflow, and critical interaction output.
- [ ] **Step 2: Add a golden portal test** requiring a portrait Hero, KPI cards, portfolio card grid, timeline, and contact form to produce distinct containers and controls—never one merged rich-text block.
- [ ] **Step 3: Run RED:** `pnpm --filter @kf/domain-client exec vitest run src/modules/definitions/portal-modules.test.ts`.
- [ ] **Step 4: Implement shared deterministic primitives** for section title, surface, labeled value, image slot, action button, repeated card, and form row. Every primitive receives local bounds and returns reviewed `UIComponentSpec` values.
- [ ] **Step 5: Implement and register exact `1.0.0` portal definitions** with asset-slot and interaction validation. Hero variants are `portrait-left`, `portrait-right`, and `no-portrait`; missing portrait may switch only when ModulePlan explicitly selects `no-portrait`. Set maturity from existing `runtimeVerification` evidence and otherwise retain `beta` for Task 13 promotion.
- [ ] **Step 6: Run portal, compiler, full domain-client tests, typecheck, scoped lint, and diff check.**
- [ ] **Step 7: Commit:** `git commit -m "feat(domain-client): add stable portal modules"`.

### Task 7: Implement Dashboard and Admin Modules with Safe Native Data Adapters

**Files:**
- Create: `agent-app/packages/domain-client/src/modules/definitions/dashboard-modules.ts`
- Create: `agent-app/packages/domain-client/src/modules/definitions/dashboard-modules.test.ts`
- Create: `agent-app/packages/domain-client/src/modules/definitions/admin-modules.ts`
- Create: `agent-app/packages/domain-client/src/modules/definitions/admin-modules.test.ts`
- Create: `agent-app/packages/domain-client/src/modules/definitions/native-data-adapters.ts`
- Create: `agent-app/packages/domain-client/src/modules/definitions/native-data-adapters.test.ts`
- Modify: `agent-app/packages/domain-client/src/implementation/component-properties.ts`
- Modify: `agent-app/packages/domain-client/src/patch/client-patcher.ts`
- Modify: `agent-app/packages/domain-client/src/modules/module-registry.ts`

**Interfaces:**
- Consumes: existing reviewed prototype charts, EasyUI datagrid, navmenu, tags, buttons, layouts, and property allowlists.
- Produces definitions for `navigation.sidebar`, `data.chart-panel`, `data.status-grid`, `data.table`, `data.detail`, `action.toolbar`, and `feedback.alert-list`; unverified native data adapters remain `beta` until Task 13 real-runtime acceptance.

- [ ] **Step 1: Write RED native-adapter tests** for a bounded structured chart series and table column/row model, escaping quotes/newlines/U+2028/U+2029 and rejecting functions, expressions, HTML, prototype keys, and script fragments.
- [ ] **Step 2: Run RED:** `pnpm --filter @kf/domain-client exec vitest run src/modules/definitions/native-data-adapters.test.ts`.
- [ ] **Step 3: Add strict semantic property schemas** for only the reviewed chart/table fields and compile them through registered deterministic KF configuration templates; never accept raw `configureData` or user-authored code.
- [ ] **Step 4: Write and run RED module tests** requiring fixed dashboard bounds, readable status severity, non-empty chart/table structures, admin shell regions, real form/table/action controls, and no overflow.
- [ ] **Step 5: Implement and register exact `1.0.0` dashboard/admin definitions. Keep each definition `beta` unless all required capabilities already carry matching real KF runtime verification; Task 13 is the only task allowed to promote newly verified definitions.**
- [ ] **Step 6: Run focused modules, patcher, compiler, full domain-client tests, typecheck, scoped lint, and diff check.**
- [ ] **Step 7: Commit:** `git commit -m "feat(domain-client): add dashboard and admin modules"`.

### Task 8: Add Blueprint Coverage, Delivery Gates, and Incremental Preservation

**Files:**
- Create: `agent-app/packages/domain-client/src/modules/module-quality.ts`
- Create: `agent-app/packages/domain-client/src/modules/module-quality.test.ts`
- Create: `agent-app/packages/domain-client/src/modules/module-diff.ts`
- Create: `agent-app/packages/domain-client/src/modules/module-diff.test.ts`
- Modify: `agent-app/packages/domain-client/src/modules/module-compiler.ts`
- Modify: `agent-app/packages/domain-client/src/index.ts`

**Interfaces:**
- Consumes: blueprint, ModulePlan, compilation result, Registry, previous successful result, and current editable entity identities.
- Produces: `evaluateModuleDelivery(...)`, `diffModulePlans(...)`, `ModuleDeliveryReport`, and `UnexpectedModuleChangeError`.

- [ ] **Step 1: Write RED tests** for missing blueprint module, critical slot/control/interaction, broken asset binding, template residue (`Hello`, default label, placeholder image), geometry overflow/overlap, silent fallback, and complex-module-to-text collapse.
- [ ] **Step 2: Write RED incremental tests** proving content/style/asset-only updates preserve unrelated implementation objects byte-for-byte and that add/remove/move recalculates only the affected layout interval.
- [ ] **Step 3: Run RED:** `pnpm --filter @kf/domain-client exec vitest run src/modules/module-quality.test.ts src/modules/module-diff.test.ts`.
- [ ] **Step 4: Implement delivery classification:** any critical issue yields `blocked`; only documented non-critical differences yield `ready_with_warnings`; otherwise `ready`.
- [ ] **Step 5: Emit `changedModules`, `unchangedModules`, and `unexpectedChanges`; fail compilation when `unexpectedChanges` is non-empty.**
- [ ] **Step 6: Run GREEN, full domain-client tests, typecheck, scoped lint, and diff check.**
- [ ] **Step 7: Commit:** `git commit -m "feat(domain-client): enforce module delivery quality"`.

### Task 9: Make DeepSeek Plan Modules Instead of Controls

**Files:**
- Modify: `agent-app/packages/agent-orchestrator/src/model-port.ts`
- Modify: `agent-app/apps/api/src/conversations/deepseek-model.ts`
- Modify: `agent-app/apps/api/src/conversations/deepseek-model.test.ts`
- Modify: `agent-app/apps/api/src/conversations/fake-model.ts`
- Modify: `agent-app/apps/api/src/conversations/kf-design-principles.ts`
- Modify: `agent-app/apps/api/src/conversations/kf-design-principles.test.ts`

**Interfaces:**
- Consumes: confirmed v2 blueprint, previous ModulePlan, bounded Registry planning summary, bounded asset catalog, delivery rejection reasons, and recent conversation context.
- Produces: `ModelPort.createModulePlan(context)` and `reviseModulePlan(context)` returning strict `ModulePlan`.

```ts
createModulePlan(input: ModelPortContext): Promise<ModulePlan>;
reviseModulePlan(input: ModelPortContext): Promise<ModulePlan>;
```

- [ ] **Step 1: Write RED prompt/output tests** requiring exact registered kind/version/variant, every blueprint module ID, asset IDs only, semantic placement, stable module IDs, complete-plan revision, and explicit preservation of unaffected modules.
- [ ] **Step 2: Add rejection tests** for model output containing geometry, CSS, file paths, storage keys, raw KF fields, scripts, unknown modules, beta/unsupported modules, or missing prior modules.
- [ ] **Step 3: Run RED:** `pnpm --filter @kf/api exec vitest run src/conversations/deepseek-model.test.ts src/conversations/kf-design-principles.test.ts`.
- [ ] **Step 4: Implement bounded prompts** from `listForPlanning()` and asset metadata; parse with `ModulePlanSchema`; permit one JSON-repair call for malformed output but no schema weakening.
- [ ] **Step 5: Update deterministic fake model** with portal, dashboard, and admin fixtures so graph/API tests never call the network.
- [ ] **Step 6: Run GREEN, API/orchestrator typechecks, changed-file lint, and diff check.**
- [ ] **Step 7: Commit:** `git commit -m "feat(api): plan registered KF modules with DeepSeek"`.

### Task 10: Insert Module Planning and Bounded Repair into LangGraph

**Files:**
- Create: `agent-app/packages/agent-orchestrator/src/nodes/module-plan.ts`
- Create: `agent-app/packages/agent-orchestrator/src/nodes/module-plan.test.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/state.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/state.test.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/ports.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/solution-graph.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/solution-graph.test.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/nodes/enqueue-build.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/nodes/enqueue-build.test.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/index.ts`

**Interfaces:**
- Consumes: Task 9 model methods and injected `ModuleCompilerPort`/`AssetCatalogPort`.
- Produces: graph fields `modulePlan`, `modulePlanHash`, `moduleDeliveryReport`, `moduleRepairAttempt`, and `buildAuthorization`.

```ts
export interface ModuleCompilerPort {
  compile(input: {
    workspaceId: string;
    blueprint: CustomerEffectBlueprint;
    plan: ModulePlan;
    previousPlan?: ModulePlan;
    previousImplementation?: UIImplementationSpec;
    editableEntities: EditableEntity[];
  }): Promise<ModuleCompilationResult>;
}
```

- [ ] **Step 1: Write RED node tests** for initial plan, revision, missing blueprint coverage, one/two/three repair attempts, fourth-attempt block, missing asset question, deterministic compile error, and success persistence.
- [ ] **Step 2: Write RED routing tests** proving `CONFIRM_DESIGN` runs module planning and directly enqueues a preview build without a technical approval interrupt; preview feedback also rebuilds directly; legacy v1 plans and imported unadopted-control edits retain the current approval path.
- [ ] **Step 3: Run RED:** `pnpm --filter @kf/agent-orchestrator exec vitest run src/nodes/module-plan.test.ts src/solution-graph.test.ts src/nodes/enqueue-build.test.ts`.
- [ ] **Step 4: Implement module state and node** with SHA-256 stable hashes, exact full-plan preservation merge, bounded rejection reasons, and maximum three model repair calls.
- [ ] **Step 5: Add `buildAuthorization: confirmed-blueprint | preview-feedback | legacy-plan-approval`; update enqueue guard to accept only these proven origins and keep current idempotency semantics.**
- [ ] **Step 6: Keep `implementation-plan.ts` as compatibility code** only for imported controls not represented by a ModulePlan; it must not create a new v2 blueprint page.
- [ ] **Step 7: Run GREEN, full orchestrator tests, typecheck, lint, and diff check.**
- [ ] **Step 8: Commit:** `git commit -m "feat(orchestrator): add module planning workflow"`.

### Task 11: Wire Asset Resolution and Materialization Through API and Worker

**Files:**
- Modify: `agent-app/packages/contracts/src/change-plan.ts`
- Modify: `agent-app/packages/contracts/src/change-plan.test.ts`
- Modify: `agent-app/packages/contracts/src/domain.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/ports.ts`
- Modify: `agent-app/apps/api/src/conversations/graph-ports.ts`
- Modify: `agent-app/apps/api/src/conversations/graph-ports.test.ts`
- Modify: `agent-app/apps/api/src/conversations/conversation.service.ts`
- Modify: `agent-app/packages/build-jobs/src/job-executor.ts`
- Modify: `agent-app/packages/build-jobs/src/job-executor.test.ts`
- Create: `agent-app/packages/domain-client/src/assets/materialize-client-assets.ts`
- Create: `agent-app/packages/domain-client/src/assets/materialize-client-assets.test.ts`
- Modify: `agent-app/packages/domain-client/src/patch/client-patcher.ts`
- Modify: `agent-app/packages/domain-client/src/domain-pack/king-client-domain-pack.ts`

**Interfaces:**
- Consumes: tenant/workspace-scoped `WorkspaceAsset`, internal ChangePlan asset bindings, and artifact storage streams.
- Produces: verified `DomainAssetInput[]` and safe package files under `static/agent-assets/<sha256>.<ext>`.

```ts
export interface DomainAssetInput {
  assetId: string;
  targetPath: string;
  mediaType: string;
  sha256: string;
  bytes: Uint8Array;
}
```

- [ ] **Step 1: Write RED contract/executor tests** for asset bindings, tenant/workspace mismatch, missing/deleted asset, checksum mismatch, duplicate target, traversal path, oversize aggregate, retry/idempotency, and build failure without revision advancement.
- [ ] **Step 2: Write RED client materialization tests** proving exact bytes land under the candidate workspace, image controls reference that relative path, validation catches absent resources, and packaging round-trip retains them.
- [ ] **Step 3: Run RED:** focused contracts, build-jobs, domain-client asset tests.
- [ ] **Step 4: Extend ChangePlan with compiler-owned `assetBindings`**; model-facing schemas/prompts must still forbid this field. BuildExecutor resolves rows by tenant, workspace, and ID, opens storage, verifies size/hash, and passes bytes only to DomainPack.
- [ ] **Step 5: Materialize assets after candidate copy/compile and before validation** using normalized relative paths, `lstat` ancestor checks, exclusive writes, and checksum verification; no path may escape the workspace.
- [ ] **Step 6: Wire production `ModuleCompilerPort` and `AssetCatalogPort`** in `createGraphPorts()` using the default Registry and `AssetService`; compile the resulting UIImplementationSpec through the existing `compileUiImplementation()`.
- [ ] **Step 7: Run contracts/domain-client/build-jobs/API/worker focused suites, all affected typechecks, changed-file lint, Prisma validation, and diff check.**
- [ ] **Step 8: Commit:** `git commit -m "feat(build): materialize approved module assets"`.

### Task 12: Expose Delivery Results Without Technical Plan Approval UI

**Files:**
- Modify: `agent-app/apps/api/src/conversations/conversation.service.ts`
- Modify: `agent-app/apps/api/src/api.integration.test.ts`
- Modify: `agent-app/apps/web/src/types.ts`
- Modify: `agent-app/apps/web/src/stores/workspace.ts`
- Modify: `agent-app/apps/web/src/stores/workspace.test.ts`
- Create: `agent-app/apps/web/src/components/ModuleDeliveryReport.vue`
- Create: `agent-app/apps/web/src/components/ModuleDeliveryReport.test.ts`
- Modify: `agent-app/apps/web/src/views/WorkspaceView.vue`
- Modify: `agent-app/apps/web/src/components/ConversationPanel.vue`
- Modify: `agent-app/apps/web/src/components/ConversationPanel.test.ts`

**Interfaces:**
- Consumes: graph `modulePlanHash`, `moduleDeliveryReport`, build status, preview, artifact, and revision endpoints.
- Produces: customer-facing `ready | ready_with_warnings | blocked` result, capability gaps, changed/preserved modules, and normal preview/export actions.

- [ ] **Step 1: Write RED API/Web tests** proving a confirmed v2 blueprint never exposes `plan-approval`, successful build shows preview plus delivery report, warnings remain visible, blocked results cannot be exported, and technical ModulePlan/ChangePlan JSON is not rendered.
- [ ] **Step 2: Add concurrency tests** ensuring route changes, overlapping workspace loads, send/resume operations, and build polling cannot apply an old workspace delivery report to the current workspace.
- [ ] **Step 3: Run RED:** focused API integration and Web store/component tests.
- [ ] **Step 4: Add bounded final-state fields** and implement `ModuleDeliveryReport.vue` with implemented modules, warnings, unsupported requirements, repair count, and revision diff; keep the existing preview and artifact controls.
- [ ] **Step 5: Disable export only for `blocked`; allow `ready_with_warnings` after showing warnings. Do not reintroduce an implementation approval sheet for module builds.**
- [ ] **Step 6: Run GREEN, Web/API typecheck, Web lint, changed-file lint, and diff check.**
- [ ] **Step 7: Commit:** `git commit -m "feat(web): show module delivery results"`.

### Task 13: Golden Flows, Real KF Acceptance, and Release Evidence

**Files:**
- Create: `agent-app/tests/fixtures/module-plans/personal-portal.json`
- Create: `agent-app/tests/fixtures/module-plans/industrial-dashboard.json`
- Create: `agent-app/tests/fixtures/module-plans/admin-console.json`
- Modify: `agent-app/packages/agent-orchestrator/src/solution-graph.integration.test.ts`
- Modify: `agent-app/apps/api/src/api.integration.test.ts`
- Modify: `agent-app/apps/worker/src/job-runner.integration.test.ts`
- Create: `agent-app/tests/e2e/module-generation.spec.ts`
- Create: `agent-app/docs/module-generation-v1-acceptance.md`
- Modify: `agent-app/packages/domain-client/src/modules/definitions/portal-modules.ts`
- Modify: `agent-app/packages/domain-client/src/modules/definitions/dashboard-modules.ts`
- Modify: `agent-app/packages/domain-client/src/modules/definitions/admin-modules.ts`

**Interfaces:**
- Consumes: the complete V1 flow, real DeepSeek configuration, local API/web/worker, generated artifacts, and the provided KF test server.
- Produces: repeatable evidence for new project, imported project modification, preview, export, partial revision, and real KF import/runtime.

- [ ] **Step 1: Add RED golden integration tests** for portal, dashboard, and admin fixtures. Each asserts blueprint coverage, multiple real controls per complex module, valid assets, zero geometry overlap/overflow, `unexpectedChanges=[]`, and either `ready` for previously verified modules or an exact maturity warning for modules awaiting Step 7 runtime verification.
- [ ] **Step 2: Add RED end-to-end tests** for `new → clarify → blueprint → confirm → automatic build → preview → modify one module → rebuild → export`, and for imported-package modification preserving unrelated controls.
- [ ] **Step 3: Run RED before final wiring fixes**, then make only integration fixes required by these scenarios.
- [ ] **Step 4: Run package gates:** contracts, domain-client, agent-orchestrator, build-jobs, API, worker, and Web tests/typechecks; run changed-file lint and compare any package baseline against `main`.
- [ ] **Step 5: Run root serial test once:** `pnpm test`. If the documented macOS stale-process hang recurs after all relevant suites pass, stop the run, record the exact completed suites/process state, and do not claim a root-suite pass.
- [ ] **Step 6: Start API, worker, and Web in DeepSeek mode and perform one real-model portal smoke**; verify the persisted ModulePlan uses only registered modules/assets and the package contains the traced controls.
- [ ] **Step 7: Upload each golden package through the KF native development UI on the provided test server, open it in runtime, exercise navigation/tabs/form/table/chart/status interactions, and capture exact pass/fail evidence. Do not store server credentials in the repository or report.**
- [ ] **Step 8: For every module that passed Step 7, record the server/runtime/baseline evidence and promote only that exact definition version from `beta` to `stable`; rerun all three golden flows and require `ready` for their stable-only plans. Failed modules remain `beta` with an exact gap.**
- [ ] **Step 9: Record versions, commands, screenshots/paths, delivery gaps, and module maturity decisions** in `agent-app/docs/module-generation-v1-acceptance.md`.
- [ ] **Step 10: Run credential scan, `git diff --check`, verify only intended files are staged, and commit:** `git commit -m "test: verify module generation V1 end to end"`.

## Final Verification Checklist

- [ ] `ModulePlanSchema` rejects GUIDs, raw coordinates, CSS, paths, storage keys, scripts, duplicate IDs, and unknown module fields.
- [ ] DeepSeek receives only bounded blueprint, module catalog, asset metadata, previous ModulePlan, and repair reasons.
- [ ] Same ModulePlan, versions, and assets produce byte-equivalent UIImplementationSpec and stable IDs.
- [ ] `vertical-flow` grows page height; dashboard/admin fixed layouts never globally rescale to hide overflow.
- [ ] Portal, dashboard, and admin golden plans use only Registry `stable` modules when delivery is `ready`.
- [ ] Every complex module expands into its required KF container/controls and never silently collapses into one text control.
- [ ] Critical asset IDs resolve tenant/workspace-safely, materialize in the KF package, survive round-trip packaging, and render without broken links.
- [ ] Existing structured style adapters remain the only route to native fields and managed CSS.
- [ ] Customer blueprint confirmation triggers module planning and preview build without a customer-facing technical plan approval.
- [ ] Preview feedback rebuilds only affected modules; untouched IDs, GUIDs, geometry, properties, styles, and assets remain unchanged.
- [ ] `ready`, `ready_with_warnings`, and `blocked` are calculated by deterministic gates and shown accurately in Web.
- [ ] New and imported KingClient packages validate, preview, export, import in the KF native development UI, and open in runtime.
- [ ] Future domains remain metadata-only unsupported entries; no empty calculation/datasource/acquisition artifact is emitted.
- [ ] All affected package tests and typechecks pass; changed-file lint and diff check are clean.
- [ ] No API keys, passwords, server credentials, generated packages, screenshots containing secrets, or customer data are committed.
