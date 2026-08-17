# KF Solution Planning and Capability Retrieval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace module-constrained planning with a creative, blueprint-led `SolutionImplementationPlan` and a deterministic KF capability retrieval bundle while keeping legacy `module-v1` revisions compatible.

**Architecture:** Introduce a v3 customer blueprint with explicit pages, regions, states, and interaction journeys but no KF implementation identifiers. A deterministic retrieval service joins phase-one design knowledge with technical capability truth, then the DeepSeek model produces one strict semantic implementation tree. Existing `ModulePlan v1` remains available through a one-way compatibility adapter.

**Tech Stack:** TypeScript ES modules, Zod 4, Vitest, LangGraph, DeepSeek OpenAI-compatible JSON output, pnpm workspace, `@kf/contracts`, `@kf/domain-client`, `@kf/agent-orchestrator`, `@kf/api`.

## Global Constraints

- Target runtime is KingFusion 3.6.
- This phase does not emit coordinates, KF GUIDs, raw KF JSON, selectors, CSS rules, JavaScript, `styleDataNew`, `linkId`, or `configureData`.
- Blueprint generation and implementation planning remain the only two primary model planning calls.
- Capability retrieval is deterministic and local; it does not call a model.
- The v3 blueprint must not contain `expectedKind`, module catalog kinds, capability IDs, GUIDs, or coordinates.
- Retrieval returns only technically generatable candidates and never upgrades technical capability status from design metadata.
- Each region receives 3–5 control candidates, 1–3 layout candidates, and 1–3 composition recipes; the aggregate detailed profile set is capped at 25.
- Recipes are advisory evidence, not mandatory templates.
- Mock data is customer-readable and industry-specific; placeholder values such as `ONLINE`, `INFO`, `Item 1`, and `Lorem ipsum` are rejected.
- Existing `kf-design-plan/v2`, `kf-module-plan/v1`, and `module-v1` behavior remain parseable and routable.
- The new `creative-v2` workflow stops after a validated semantic plan in this phase; build enqueueing is added only in phase 5.
- Use TDD for every task and commit only the files named by that task.

---

## File Structure

### Contracts

- Create `agent-app/packages/contracts/src/solution-blueprint.ts`: v3 blueprint and journey contracts.
- Create `agent-app/packages/contracts/src/solution-blueprint.test.ts`: strictness, forbidden implementation fields, and reference tests.
- Create `agent-app/packages/contracts/src/capability-candidates.ts`: bounded retrieval bundle contract.
- Create `agent-app/packages/contracts/src/capability-candidates.test.ts`: counts, sorting, and provenance tests.
- Create `agent-app/packages/contracts/src/solution-implementation-plan.ts`: semantic tree, mock data, local state, styles, actions, and scripts.
- Create `agent-app/packages/contracts/src/solution-implementation-plan.test.ts`: recursive-node and cross-reference tests.
- Modify `agent-app/packages/contracts/src/design-plan.ts`: add v3 to the existing discriminated union without changing v1/v2.
- Modify `agent-app/packages/contracts/src/index.ts`: export the three new contract modules.

### Retrieval and compatibility

- Create `agent-app/packages/domain-client/src/planning/blueprint-region-query.ts`: convert v3 regions to deterministic retrieval queries.
- Create `agent-app/packages/domain-client/src/planning/capability-retrieval.ts`: filter, score, limit, and explain candidates.
- Create `agent-app/packages/domain-client/src/planning/capability-retrieval.test.ts`: negative-semantic ranking and bounds.
- Create `agent-app/packages/domain-client/src/planning/legacy-module-plan-adapter.ts`: `ModulePlan v1` to semantic plan conversion.
- Create `agent-app/packages/domain-client/src/planning/legacy-module-plan-adapter.test.ts`: stable IDs and preservation tests.
- Modify `agent-app/packages/domain-client/src/index.ts`: export retrieval and adapter APIs.

### Orchestration and model

- Create `agent-app/packages/agent-orchestrator/src/nodes/capability-retrieval.ts`: server-owned retrieval node.
- Create `agent-app/packages/agent-orchestrator/src/nodes/capability-retrieval.test.ts`: graph-state and failure tests.
- Create `agent-app/packages/agent-orchestrator/src/nodes/solution-implementation-plan.ts`: model call, one local repair, and state persistence.
- Create `agent-app/packages/agent-orchestrator/src/nodes/solution-implementation-plan.test.ts`: bounded context and rejection tests.
- Modify `agent-app/packages/agent-orchestrator/src/model-port.ts`: add v3 plan context and model methods.
- Modify `agent-app/packages/agent-orchestrator/src/ports.ts`: add a capability retrieval port.
- Modify `agent-app/packages/agent-orchestrator/src/state.ts`: persist the bundle, semantic plan, hashes, and repair count.
- Modify `agent-app/packages/agent-orchestrator/src/solution-graph.ts`: route `creative-v2` through retrieval and semantic planning.
- Modify `agent-app/apps/api/src/conversations/deepseek-model.ts`: v3 blueprint and implementation prompts/parsers.
- Modify `agent-app/apps/api/src/conversations/deepseek-model.test.ts`: prompt boundaries and schema parsing.
- Modify `agent-app/apps/api/src/conversations/graph-ports.ts`: production retrieval wiring.
- Modify `agent-app/apps/api/src/conversations/conversations.module.ts`: inject the retrieval port.

---

### Task 1: Define the implementation-free v3 customer blueprint

**Files:**
- Create: `agent-app/packages/contracts/src/solution-blueprint.ts`
- Create: `agent-app/packages/contracts/src/solution-blueprint.test.ts`
- Modify: `agent-app/packages/contracts/src/design-plan.ts`
- Modify: `agent-app/packages/contracts/src/index.ts`

**Interfaces:**
- Consumes: no phase-two implementation types.
- Produces: `CustomerSolutionBlueprintSchema`, `CustomerSolutionBlueprint`, `BlueprintPage`, `BlueprintRegion`, and `BlueprintJourney`.

- [ ] **Step 1: Write failing blueprint contract tests**

```ts
const valid = {
  schema: "kf-design-plan/v3",
  displayName: "华东园区访客通行中心",
  objective: "帮助园区前台快速审核预约并处理异常通行",
  audiences: ["园区前台", "安保主管"],
  scenarios: ["预约审核", "到访核验", "异常处置"],
  pages: [{
    id: "visitor-overview",
    title: "访客总览",
    purpose: "浏览当日预约并进入访客详情",
    readingOrder: ["summary", "filters", "records"],
    regions: [{
      id: "records",
      purpose: "筛选和选择预约记录",
      semanticRoles: ["filter-controls", "structured-record-list"],
      dataShape: "record-list",
      density: "comfortable",
      importance: "primary",
      content: ["访客姓名", "受访部门", "预约时段", "审核状态"],
      sampleData: [{ "访客姓名": "陈嘉宁", "受访部门": "数字能源部", "审核状态": "待审核" }],
      interactions: ["按审核状态筛选", "选择记录查看详情"],
      states: ["initial", "filtered", "selected", "empty"],
      visualIntent: "清晰、可信、强调待处理任务",
    }],
  }],
  journeys: [{
    id: "review-visitor",
    actor: "园区前台",
    goal: "完成一条预约审核",
    steps: [
      { pageId: "visitor-overview", regionId: "records", action: "筛选待审核记录", result: "显示待审核访客" },
      { pageId: "visitor-overview", regionId: "records", action: "打开访客详情", result: "显示详情弹窗" },
    ],
    completion: "显示审核成功反馈并更新列表状态",
  }],
  visualDirection: { tone: "专业而友好", colors: ["深海蓝", "通行绿"], typography: "中文信息密集但层级清晰", spacingAndSurfaces: "紧凑工具区与舒适内容区" },
  acceptanceScenarios: ["用户可以完成筛选、查看详情和模拟审核闭环"],
  openQuestions: [],
} as const;

expect(CustomerSolutionBlueprintSchema.parse(valid).pages[0]?.id).toBe("visitor-overview");
expect(CustomerSolutionBlueprintSchema.safeParse({
  ...valid,
  pages: [{ ...valid.pages[0], regions: [{ ...valid.pages[0].regions[0], expectedKind: "data.table" }] }],
}).success).toBe(false);
expect(CustomerSolutionBlueprintSchema.safeParse({
  ...valid,
  journeys: [{ ...valid.journeys[0], steps: [{ ...valid.journeys[0].steps[0], pageId: "missing" }] }],
}).success).toBe(false);
```

- [ ] **Step 2: Run the focused test and verify the missing-schema failure**

Run: `pnpm --dir agent-app --filter @kf/contracts exec vitest run src/solution-blueprint.test.ts`

Expected: FAIL because `solution-blueprint.ts` does not exist.

- [ ] **Step 3: Implement strict v3 schemas**

Use bounded strings, stable semantic IDs, maximum 8 pages, 12 regions per page, 12 journeys, and 12 steps per journey. Add a `.superRefine()` that rejects duplicate page/region/journey IDs, unknown reading-order regions, and journey steps that reference unknown page-region pairs. Keep `CustomerEffectBlueprintSchema` unchanged and add `CustomerSolutionBlueprintSchema` to `DesignPlanSchema`.

```ts
export const CustomerSolutionBlueprintSchema = z.object({
  schema: z.literal("kf-design-plan/v3"),
  displayName: blueprintText,
  objective: blueprintText,
  audiences: blueprintTextList.min(1),
  scenarios: blueprintTextList.min(1),
  pages: z.array(BlueprintPageSchema).min(1).max(8),
  journeys: z.array(BlueprintJourneySchema).min(1).max(12),
  visualDirection: BlueprintVisualDirectionSchema,
  acceptanceScenarios: blueprintTextList.min(1),
  openQuestions: blueprintTextList,
}).strict().superRefine(validateBlueprintReferences);
```

- [ ] **Step 4: Run contracts tests, typecheck, and lint**

```bash
pnpm --dir agent-app --filter @kf/contracts exec vitest run src/solution-blueprint.test.ts src/design-plan.test.ts
pnpm --dir agent-app --filter @kf/contracts typecheck
pnpm --dir agent-app --filter @kf/contracts lint
```

Expected: all commands exit 0; v1 and v2 fixtures still parse.

- [ ] **Step 5: Commit the blueprint contract**

```bash
git add agent-app/packages/contracts/src/solution-blueprint.ts agent-app/packages/contracts/src/solution-blueprint.test.ts agent-app/packages/contracts/src/design-plan.ts agent-app/packages/contracts/src/index.ts
git commit -m "feat: add implementation-free solution blueprint"
```

---

### Task 2: Define bounded capability candidate bundles

**Files:**
- Create: `agent-app/packages/contracts/src/capability-candidates.ts`
- Create: `agent-app/packages/contracts/src/capability-candidates.test.ts`
- Modify: `agent-app/packages/contracts/src/index.ts`

**Interfaces:**
- Consumes: stable blueprint page/region IDs and phase-one knowledge versions.
- Produces: `CapabilityCandidateBundleSchema`, `CapabilityCandidateBundle`, and `RegionCapabilityCandidates`.

- [ ] **Step 1: Write failing candidate-bound tests**

```ts
const parsed = CapabilityCandidateBundleSchema.parse(bundleFixture);
expect(parsed.regions[0]?.controls).toHaveLength(3);
expect(parsed.regions[0]?.layouts.length).toBeGreaterThanOrEqual(1);
expect(parsed.detailedCapabilityIds.length).toBeLessThanOrEqual(25);
expect(CapabilityCandidateBundleSchema.safeParse({
  ...bundleFixture,
  regions: [{ ...bundleFixture.regions[0], controls: [] }],
}).success).toBe(false);
```

- [ ] **Step 2: Run the test and verify it fails because the module is missing**

Run: `pnpm --dir agent-app --filter @kf/contracts exec vitest run src/capability-candidates.test.ts`

- [ ] **Step 3: Implement the exact candidate contract**

```ts
const RankedCandidateSchema = z.object({
  id: stableId,
  score: z.number().finite().min(-1000).max(1000),
  reasons: z.array(text).min(1).max(8),
  limitations: z.array(text).max(8),
  knowledgeVersion: semver,
}).strict();

export const RegionCapabilityCandidatesSchema = z.object({
  pageId: stableId,
  regionId: stableId,
  controls: z.array(RankedCandidateSchema).min(3).max(5),
  layouts: z.array(RankedCandidateSchema).min(1).max(3),
  recipes: z.array(RankedCandidateSchema).min(1).max(3),
}).strict();

export const CapabilityCandidateBundleSchema = z.object({
  schema: z.literal("kf-capability-candidates/v1"),
  knowledgeCatalogVersion: semver,
  blueprintHash: z.string().regex(/^[0-9a-f]{64}$/),
  regions: z.array(RegionCapabilityCandidatesSchema).min(1).max(96),
  detailedCapabilityIds: z.array(stableId).min(1).max(25),
  generatedAtPolicy: z.literal("deterministic-no-timestamp"),
}).strict();
```

Add cross-field checks for unique `(pageId, regionId)`, unique candidates in each category, sorted `detailedCapabilityIds`, and the presence of every returned control/layout ID in `detailedCapabilityIds`.

- [ ] **Step 4: Verify contracts**

```bash
pnpm --dir agent-app --filter @kf/contracts exec vitest run src/capability-candidates.test.ts
pnpm --dir agent-app --filter @kf/contracts typecheck
```

- [ ] **Step 5: Commit the candidate boundary**

```bash
git add agent-app/packages/contracts/src/capability-candidates.ts agent-app/packages/contracts/src/capability-candidates.test.ts agent-app/packages/contracts/src/index.ts
git commit -m "feat: define bounded capability candidates"
```

---

### Task 3: Define the recursive SolutionImplementationPlan contract

**Files:**
- Create: `agent-app/packages/contracts/src/solution-implementation-plan.ts`
- Create: `agent-app/packages/contracts/src/solution-implementation-plan.test.ts`
- Modify: `agent-app/packages/contracts/src/index.ts`

**Interfaces:**
- Consumes: `ThemeSpecSchema`, phase-one capability IDs, blueprint provenance IDs, and candidate bundle IDs.
- Produces: `SolutionImplementationPlanSchema`, `SolutionImplementationPlan`, `SolutionNode`, `LayoutNode`, `RegisteredModuleNode`, `ControlNode`, and `RepeaterNode`.

- [ ] **Step 1: Write failing semantic-tree tests**

```ts
expect(SolutionImplementationPlanSchema.parse(solutionPlanFixture).schema)
  .toBe("kf-solution-implementation/v1");
expect(SolutionImplementationPlanSchema.safeParse({
  ...solutionPlanFixture,
  pages: [{ ...solutionPlanFixture.pages[0], root: { ...solutionPlanFixture.pages[0].root, geometry: { x: 0, y: 0, width: 100, height: 100 } } }],
}).success).toBe(false);
expect(SolutionImplementationPlanSchema.safeParse(planWithUnknownDataSource).success).toBe(false);
expect(SolutionImplementationPlanSchema.safeParse(planWithDuplicateStableId).success).toBe(false);
```

- [ ] **Step 2: Run the focused test and verify the missing-contract failure**

Run: `pnpm --dir agent-app --filter @kf/contracts exec vitest run src/solution-implementation-plan.test.ts`

- [ ] **Step 3: Implement the public semantic types**

Define a recursive discriminated union with these exact node kinds and common intent:

```ts
const NodeIntentSchema = z.object({
  importance: z.enum(["primary", "secondary", "supporting"]),
  visualWeight: z.number().int().min(1).max(5),
  readingOrder: z.number().int().min(0).max(1000),
  density: z.enum(["compact", "comfortable", "spacious"]),
  groupWith: z.array(stableId).max(12),
  width: z.object({ mode: z.enum(["content", "fixed", "fill", "ratio", "minmax"]), value: z.number().positive().optional(), min: z.number().positive().optional(), max: z.number().positive().optional() }).strict(),
  height: z.object({ mode: z.enum(["content", "fixed", "fill", "viewport", "ratio", "minmax"]), value: z.number().positive().optional(), min: z.number().positive().optional(), max: z.number().positive().optional() }).strict(),
  align: z.enum(["start", "center", "end", "stretch"]),
}).strict();

export const SolutionNodeSchema: z.ZodType<SolutionNode> = z.lazy(() => z.discriminatedUnion("kind", [
  LayoutNodeSchema,
  RegisteredModuleNodeSchema,
  ControlNodeSchema,
  RepeaterNodeSchema,
]));
```

`LayoutNode.layout` supports exactly `row`, `column`, `grid`, `asymmetric-grid`, `split`, `stack`, `dock`, `sidebar-content`, `master-detail`, `scroll-region`, and `overlay-anchor`. `ControlNode` contains `capabilityId`, semantic `content`, `properties`, optional `mockDataId`, `styleRole`, `styleOverride`, and `eventActionIds`. `RegisteredModuleNode` contains the existing module kind/version/variant plus semantic children only for declared slots. `RepeaterNode` contains `mockDataId`, `itemAlias`, `keyField`, `maxItems`, and one template node.

Top-level fields are exactly:

```ts
{
  schema: "kf-solution-implementation/v1";
  projectKey: string;
  blueprintHash: string;
  candidateBundleHash: string;
  theme: ThemeIntent;
  roleStyles: RoleStyleIntent[];
  mockData: MockDataSet[];
  localState: LocalStateDefinition[];
  pages: SolutionPage[];
  overlays: OverlayPlan[];
  actions: ActionPlan[];
  scripts: ScriptPlan[];
}
```

Keep action/script bodies declarative in this phase: action kinds are the phase-four target set, while scripts declare only `template` plus parameters or `custom` plus purpose/inputs/outputs/source. Schema cross-field refinement validates global stable-ID uniqueness, blueprint provenance, mock-data/state/action/script references, navigation page targets, and Overlay targets. Candidate membership is validated by the domain function in Task 4 because the bundle is a separate signed input rather than part of the Zod object.

- [ ] **Step 4: Run contract regression verification**

```bash
pnpm --dir agent-app --filter @kf/contracts exec vitest run src/solution-implementation-plan.test.ts src/ui-style.test.ts src/module-plan.test.ts
pnpm --dir agent-app --filter @kf/contracts typecheck
pnpm --dir agent-app --filter @kf/contracts lint
```

- [ ] **Step 5: Commit the semantic implementation contract**

```bash
git add agent-app/packages/contracts/src/solution-implementation-plan.ts agent-app/packages/contracts/src/solution-implementation-plan.test.ts agent-app/packages/contracts/src/index.ts
git commit -m "feat: define semantic solution implementation plan"
```

---

### Task 4: Implement deterministic capability retrieval

**Files:**
- Create: `agent-app/packages/domain-client/src/planning/blueprint-region-query.ts`
- Create: `agent-app/packages/domain-client/src/planning/capability-retrieval.ts`
- Create: `agent-app/packages/domain-client/src/planning/capability-retrieval.test.ts`
- Modify: `agent-app/packages/domain-client/src/index.ts`

**Interfaces:**
- Consumes: `CustomerSolutionBlueprint`, phase-one `getDesignKnowledgeSnapshot()`, and `listControlCapabilities()`.
- Produces: `retrieveCapabilities(input: CapabilityRetrievalInput): CapabilityCandidateBundle` and `assertSolutionPlanUsesCandidates(plan, bundle): void`.

- [ ] **Step 1: Write failing ranking and limit tests**

```ts
const bundle = retrieveCapabilities({ blueprint: portfolioBlueprint, knowledge: getDesignKnowledgeSnapshot() });
const gallery = bundle.regions.find((region) => region.regionId === "selected-work")!;
expect(gallery.controls.map((item) => item.id)).toContain("image");
expect(gallery.controls.map((item) => item.id)).not.toContain("easyui.1");
expect(gallery.controls).toHaveLength(5);
expect(bundle.detailedCapabilityIds.length).toBeLessThanOrEqual(25);
expect(retrieveCapabilities({ blueprint: portfolioBlueprint, knowledge: getDesignKnowledgeSnapshot() }))
  .toEqual(bundle);
```

- [ ] **Step 2: Run the test and verify missing retrieval implementation**

Run: `pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/planning/capability-retrieval.test.ts`

- [ ] **Step 3: Implement query extraction and technical filtering**

`buildBlueprintRegionQueries()` copies only bounded semantic roles, data shape, density, region purpose, interactions, and visual intent. `retrieveCapabilities()` excludes `generation.status` values `unsupported` and `preserve-only`, excludes candidates missing a required interaction, and never includes a record absent from `ControlDesignProfile`.

Use the exact deterministic scoring components:

```ts
const score =
  40 * roleOverlap
  + 25 * dataShapeMatch
  + 15 * regionMatch
  + 10 * densityMatch
  + 10 * interactionCoverage
  + 8 * companionCompatibility
  - 60 * avoidForMatch
  - 20 * technicalLimitationMatch;
```

Tokenize Chinese and ASCII text as normalized character bigrams plus lower-cased words. Sort by descending score, then code-point ID. When negative guidance matches `easyui.1` for gallery/portfolio/media narrative, remove it rather than merely lowering it. Build layout and recipe rankings with the same deterministic tie-break and emit human-readable reasons from the non-zero score components.

Implement `assertSolutionPlanUsesCandidates()` to verify plan/bundle hashes, every `ControlNode.capabilityId`, every `RegisteredModuleNode` kind/version/variant, and every adopted recipe reference. It throws sorted `SOLUTION_PLAN_CANDIDATE_MISMATCH` issues and never silently substitutes a candidate.

- [ ] **Step 4: Run focused and phase-one regression tests**

```bash
pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/planning/capability-retrieval.test.ts src/design-knowledge/design-knowledge-catalog.test.ts src/style/control-capability-registry.test.ts
pnpm --dir agent-app --filter @kf/domain-client typecheck
pnpm --dir agent-app --filter @kf/domain-client lint
```

- [ ] **Step 5: Commit retrieval**

```bash
git add agent-app/packages/domain-client/src/planning/blueprint-region-query.ts agent-app/packages/domain-client/src/planning/capability-retrieval.ts agent-app/packages/domain-client/src/planning/capability-retrieval.test.ts agent-app/packages/domain-client/src/index.ts
git commit -m "feat: retrieve KF capabilities for blueprint regions"
```

---

### Task 5: Adapt legacy ModulePlan snapshots into the semantic tree

**Files:**
- Create: `agent-app/packages/domain-client/src/planning/legacy-module-plan-adapter.ts`
- Create: `agent-app/packages/domain-client/src/planning/legacy-module-plan-adapter.test.ts`
- Modify: `agent-app/packages/domain-client/src/index.ts`

**Interfaces:**
- Consumes: `ModulePlan` and an optional previous `SolutionImplementationPlan`.
- Produces: `adaptLegacyModulePlan(plan: ModulePlan): SolutionImplementationPlan`.

- [ ] **Step 1: Write failing adapter tests**

```ts
const adapted = adaptLegacyModulePlan(portalPlanFixture);
expect(adapted.pages[0]?.root.kind).toBe("layout");
expect(flattenNodes(adapted.pages[0]!.root).filter((node) => node.kind === "registered-module")
  .map((node) => node.id)).toEqual(portalPlanFixture.pages[0]!.modules.map((module) => module.id));
expect(adapted.actions.find((action) => action.kind === "navigate-page")?.targetPageId).toBeDefined();
expect(adaptLegacyModulePlan(portalPlanFixture)).toEqual(adapted);
```

- [ ] **Step 2: Run the test and verify the adapter is absent**

Run: `pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/planning/legacy-module-plan-adapter.test.ts`

- [ ] **Step 3: Implement a one-way deterministic adapter**

Map `vertical-flow` to `column`, `dashboard-grid` to `grid`, and `admin-shell` to `sidebar-content`. Convert each module to `RegisteredModuleNode`, preserve `id`, kind/version/variant, title/content, asset binding, source blueprint IDs, order, column span, preferred height, alignment, and emphasis. Convert supported legacy interactions to action records. Generate no overlays, scripts, arbitrary controls, or fabricated mock data. Use a fixed candidate bundle hash of `sha256("legacy-module-plan-adapter/v1")` and keep the original ModulePlan unchanged.

- [ ] **Step 4: Run adapter and module regression tests**

```bash
pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/planning/legacy-module-plan-adapter.test.ts src/modules/module-compiler.test.ts src/modules/module-diff.test.ts
pnpm --dir agent-app --filter @kf/domain-client typecheck
```

- [ ] **Step 5: Commit compatibility support**

```bash
git add agent-app/packages/domain-client/src/planning/legacy-module-plan-adapter.ts agent-app/packages/domain-client/src/planning/legacy-module-plan-adapter.test.ts agent-app/packages/domain-client/src/index.ts
git commit -m "feat: adapt legacy module plans to solution plans"
```

---

### Task 6: Add retrieval and semantic-planning graph nodes

**Files:**
- Create: `agent-app/packages/agent-orchestrator/src/nodes/capability-retrieval.ts`
- Create: `agent-app/packages/agent-orchestrator/src/nodes/capability-retrieval.test.ts`
- Create: `agent-app/packages/agent-orchestrator/src/nodes/solution-implementation-plan.ts`
- Create: `agent-app/packages/agent-orchestrator/src/nodes/solution-implementation-plan.test.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/model-port.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/ports.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/state.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/solution-graph.ts`

**Interfaces:**
- Consumes: confirmed v3 blueprint, `CapabilityRetrievalPort.retrieve()`, and `ModelPort.createSolutionImplementationPlan()`.
- Produces: graph state fields `capabilityCandidates`, `capabilityCandidatesHash`, `solutionImplementationPlan`, `solutionImplementationPlanHash`, and `solutionPlanRepairAttempt`.

- [ ] **Step 1: Write failing node and routing tests**

```ts
expect(routeAfterDesignConfirmation({ generationWorkflow: "creative-v2", designPlan: v3Blueprint }))
  .toBe("capability-retrieval");
expect(await retrievalNode(state)).toMatchObject({ stage: "implementation-planning" });
expect(model.calls[0]?.input.capabilityCandidates.detailedCapabilityIds.length).toBeLessThanOrEqual(25);
expect(result.solutionPlanRepairAttempt).toBeLessThanOrEqual(1);
```

- [ ] **Step 2: Run node tests and verify missing node/port failures**

```bash
pnpm --dir agent-app --filter @kf/agent-orchestrator exec vitest run src/nodes/capability-retrieval.test.ts src/nodes/solution-implementation-plan.test.ts
```

- [ ] **Step 3: Add ports, state, and deterministic hashes**

```ts
export interface CapabilityRetrievalPort {
  retrieve(input: { blueprint: CustomerSolutionBlueprint }): Promise<CapabilityCandidateBundle>;
}

export interface ModelPort {
  createSolutionImplementationPlan(input: ModelPortContext): Promise<SolutionImplementationPlan>;
  reviseSolutionImplementationSubtree(input: ModelPortContext): Promise<SolutionImplementationPlan>;
}
```

Extend `generationWorkflow` to `"legacy" | "module-v1" | "creative-v2"`. The retrieval node requires a v3 blueprint, computes the canonical blueprint hash, verifies the returned bundle binds that hash, and writes no model-authored data. The planning node accepts one initial call and at most one localized repair when schema/reference validation fails; JSON extraction repair remains inside the model port and also has a maximum of one attempt.

- [ ] **Step 4: Implement safe graph routing**

`creative-v2` follows `design-plan → design-review → capability-retrieval → solution-implementation-plan → solution-plan-ready`. Add `solution-plan-ready` to `StageSchema`; it is a non-build terminal stage in phase 2. `module-v1` and upload workflows keep their current routes. The new nodes must not populate `changePlanId`, `buildJobId`, `previewArtifactId`, or `buildAuthorization`.

- [ ] **Step 5: Run orchestrator regression tests**

```bash
pnpm --dir agent-app --filter @kf/agent-orchestrator test
pnpm --dir agent-app --filter @kf/agent-orchestrator typecheck
pnpm --dir agent-app --filter @kf/agent-orchestrator lint
```

- [ ] **Step 6: Commit graph planning**

```bash
git add agent-app/packages/agent-orchestrator/src/nodes/capability-retrieval.ts agent-app/packages/agent-orchestrator/src/nodes/capability-retrieval.test.ts agent-app/packages/agent-orchestrator/src/nodes/solution-implementation-plan.ts agent-app/packages/agent-orchestrator/src/nodes/solution-implementation-plan.test.ts agent-app/packages/agent-orchestrator/src/model-port.ts agent-app/packages/agent-orchestrator/src/ports.ts agent-app/packages/agent-orchestrator/src/state.ts agent-app/packages/agent-orchestrator/src/solution-graph.ts
git commit -m "feat: plan creative KF solution trees"
```

---

### Task 7: Update DeepSeek prompts and production retrieval wiring

**Files:**
- Modify: `agent-app/apps/api/src/conversations/deepseek-model.ts`
- Modify: `agent-app/apps/api/src/conversations/deepseek-model.test.ts`
- Modify: `agent-app/apps/api/src/conversations/graph-ports.ts`
- Modify: `agent-app/apps/api/src/conversations/conversations.module.ts`

**Interfaces:**
- Consumes: bounded v3 blueprint and `CapabilityCandidateBundle`.
- Produces: schema-gated v3 blueprint and `SolutionImplementationPlan`; production `CapabilityRetrievalPort`.

- [ ] **Step 1: Write failing prompt-boundary tests**

```ts
expect(capturedBlueprintPrompt).not.toContain("expectedKind");
expect(capturedBlueprintPrompt).not.toContain("content.hero");
expect(capturedImplementationPrompt).toContain("kf-capability-candidates/v1");
expect(capturedImplementationPrompt).toContain("可以自由组合或忽略组合经验");
expect(capturedImplementationPrompt).not.toContain("styleDataNew");
expect(capturedImplementationPromptBytes).toBeLessThanOrEqual(128_000);
```

- [ ] **Step 2: Run API model tests and verify prompt assertions fail**

Run: `pnpm --dir agent-app --filter @kf/api exec vitest run src/conversations/deepseek-model.test.ts`

- [ ] **Step 3: Implement separate v3 system prompts**

The blueprint prompt asks for customer tasks, page map, information architecture, realistic content, states, interaction journeys, and visual direction. It explicitly forbids KF identifiers. The implementation prompt sends only the confirmed v3 blueprint, candidate bundle, detailed profiles for its 25 IDs, asset metadata, and bounded prior plan for revision. It requires complete pages, overlays, mock data, local state, actions, and scripts, but prohibits implementation fields owned by later compilers.

Parse with `CustomerSolutionBlueprintSchema` and `SolutionImplementationPlanSchema`. Reject output containing any forbidden key found recursively: `guid`, `objectType`, `uiModelType`, `styleDataNew`, `selector`, `css`, `x`, `y`, `leftTopPt`, `linkId`, or `configureData`.

- [ ] **Step 4: Wire retrieval from the domain-client catalog**

Implement `CapabilityRetrievalPort.retrieve()` in `graph-ports.ts` by calling `retrieveCapabilities()` with `getDesignKnowledgeSnapshot()`. Do not perform network access or database reads. Register it in `conversations.module.ts` beside the existing module/UI compiler ports.

- [ ] **Step 5: Run API and full phase-two verification**

```bash
pnpm --dir agent-app --filter @kf/contracts test
pnpm --dir agent-app --filter @kf/domain-client test
pnpm --dir agent-app --filter @kf/agent-orchestrator test
pnpm --dir agent-app --filter @kf/api test
pnpm --dir agent-app --filter @kf/contracts typecheck
pnpm --dir agent-app --filter @kf/domain-client typecheck
pnpm --dir agent-app --filter @kf/agent-orchestrator typecheck
pnpm --dir agent-app --filter @kf/api typecheck
git diff --check
```

- [ ] **Step 6: Commit production planning wiring**

```bash
git add agent-app/apps/api/src/conversations/deepseek-model.ts agent-app/apps/api/src/conversations/deepseek-model.test.ts agent-app/apps/api/src/conversations/graph-ports.ts agent-app/apps/api/src/conversations/conversations.module.ts
git commit -m "feat: wire creative solution planning prompts"
```

---

## Completion Gate

Phase 2 is complete only when:

- a v3 blueprint can express multiple pages, regions, states, and interaction journeys without KF implementation identifiers;
- portfolio/media regions demonstrably reject Datagrid through negative design semantics;
- retrieval output is deterministic, technically filtered, bounded, and evidence-explained;
- `SolutionImplementationPlan` validates recursive layouts, modules, controls, repeaters, overlays, mock data, local state, actions, scripts, and all stable-ID references;
- DeepSeek receives no full control catalog and no raw KF implementation details;
- model planning remains two primary calls: blueprint and semantic implementation;
- `creative-v2` reaches `solution-plan-ready` without enqueuing a build;
- `module-v1` tests remain green and `ModulePlan v1` converts deterministically through the compatibility adapter;
- contracts, domain-client, orchestrator, and API tests/typechecks/lints pass.
