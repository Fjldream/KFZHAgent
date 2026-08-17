# KF Design Knowledge Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the versioned, immutable KF control design, style, script, and composition knowledge layer required by later capability retrieval without changing planning, compilation, preview, or runtime behavior.

**Architecture:** Add strict Zod contracts in `@kf/contracts`, then implement four focused registries in `@kf/domain-client` backed by explicit reviewed records. A final aggregate catalog cross-checks every reference against the existing `ControlCapabilityRegistry` and StyleAdapter inventory, exposing a stable snapshot for the future retrieval phase.

**Tech Stack:** TypeScript ES modules, Zod 4, Vitest, pnpm workspace, existing `@kf/contracts` and `@kf/domain-client` packages.

## Global Constraints

- Target runtime knowledge is KingFusion 3.6; no other runtime version is introduced in this phase.
- This phase does not modify DeepSeek prompts, `ModulePlan`, `UIImplementationSpec`, `ChangePlan`, layout compilation, control compilation, preview, Worker, or exported KF packages.
- Existing static preview remains frozen and is not used as a quality signal.
- Knowledge records are explicit, versioned, schema-validated, deeply immutable, and sorted deterministically by ID.
- A design record may describe desired use, but it must not upgrade technical support declared by `ControlCapabilityRegistry`.
- A supported style part must have an existing StyleAdapter; planned parts may be documented without claiming current compilation support.
- A supported script event, method, or action must carry a concrete repository evidence reference; unsupported or unverified behavior is recorded as `planned`, never inferred.
- No raw CSS, selectors, KF GUIDs, arbitrary JavaScript, external network behavior, or runtime credentials are stored in this knowledge layer.
- Use TDD for every task and commit only files named by that task.

---

## File Structure

### Contracts

- Create `agent-app/packages/contracts/src/design-knowledge.ts`: strict schemas and inferred types shared by registries and future retrieval.
- Create `agent-app/packages/contracts/src/design-knowledge.test.ts`: contract bounds, strictness, and cross-field tests.
- Modify `agent-app/packages/contracts/src/index.ts`: export the new public contracts.

### Domain knowledge

- Create `agent-app/packages/domain-client/src/design-knowledge/registry.ts`: generic immutable keyed registry helper.
- Create `agent-app/packages/domain-client/src/design-knowledge/control-design-registry.ts`: reviewed `ControlDesignProfile` records.
- Create `agent-app/packages/domain-client/src/design-knowledge/control-design-registry.test.ts`: exact baseline coverage, semantic counterexamples, and immutability tests.
- Create `agent-app/packages/domain-client/src/design-knowledge/style-capability-registry.ts`: semantic parts, states, and current/planned style properties.
- Create `agent-app/packages/domain-client/src/design-knowledge/style-capability-registry.test.ts`: StyleAdapter alignment and non-overclaiming tests.
- Create `agent-app/packages/domain-client/src/design-knowledge/script-capability-registry.ts`: semantic actions/events/methods with evidence and planned gaps.
- Create `agent-app/packages/domain-client/src/design-knowledge/script-capability-registry.test.ts`: template/compiler evidence and non-overclaiming tests.
- Create `agent-app/packages/domain-client/src/design-knowledge/composition-recipe-registry.ts`: six reusable composition recipes.
- Create `agent-app/packages/domain-client/src/design-knowledge/composition-recipe-registry.test.ts`: role, alternative, and referential-integrity tests.
- Create `agent-app/packages/domain-client/src/design-knowledge/design-knowledge-catalog.ts`: aggregate snapshot and integrity assertion.
- Create `agent-app/packages/domain-client/src/design-knowledge/design-knowledge-catalog.test.ts`: cross-registry integrity, sorting, and deep-freeze tests.
- Modify `agent-app/packages/domain-client/src/index.ts`: export only the aggregate and focused public lookup APIs.
- Create `agent-app/docs/design-knowledge-v1.md`: baseline coverage, evidence policy, and extension procedure.

---

### Task 1: Define strict design-knowledge contracts

**Files:**
- Create: `agent-app/packages/contracts/src/design-knowledge.ts`
- Create: `agent-app/packages/contracts/src/design-knowledge.test.ts`
- Modify: `agent-app/packages/contracts/src/index.ts:1-12`

**Interfaces:**
- Consumes: Zod from `zod`; existing control capability IDs remain plain semantic strings.
- Produces: `ControlDesignProfileSchema`, `StyleCapabilityProfileSchema`, `ScriptCapabilityProfileSchema`, `CompositionRecipeSchema` and their inferred TypeScript types.

- [ ] **Step 1: Write failing strict-schema tests**

Create `design-knowledge.test.ts` with concrete valid records and rejection cases:

```ts
import { describe, expect, it } from "vitest";
import {
  CompositionRecipeSchema,
  ControlDesignProfileSchema,
  ScriptCapabilityProfileSchema,
  StyleCapabilityProfileSchema,
} from "./design-knowledge.js";

const controlProfile = {
  schema: "kf-control-design-profile/v1",
  capabilityId: "easyui.1",
  version: "1.0.0",
  semanticRoles: ["structured-record-list", "record-selection"],
  useFor: ["字段稳定且需要选择记录的数据列表"],
  avoidFor: ["图片主导的作品展示", "品牌叙事内容"],
  dataShapes: ["record-list"],
  densities: ["compact", "comfortable"],
  regions: ["main", "workspace"],
  minimumSize: { width: 640, height: 240 },
  recommendedCompanions: ["easyui.6", "select", "easyui.22"],
  alternatives: [{ when: "内容强调图片和叙事", capabilityIds: ["image", "text", "button"] }],
  parentRoles: ["data-workspace"],
  childRoles: [],
  designNotes: ["表头、筛选工具栏和数据列需要形成统一对齐线"],
} as const;

describe("design knowledge contracts", () => {
  it("accepts a bounded control design profile", () => {
    expect(ControlDesignProfileSchema.parse(controlProfile).capabilityId).toBe("easyui.1");
  });

  it("rejects unknown fields and empty positive guidance", () => {
    expect(ControlDesignProfileSchema.safeParse({ ...controlProfile, css: "body{}" }).success).toBe(false);
    expect(ControlDesignProfileSchema.safeParse({ ...controlProfile, useFor: [] }).success).toBe(false);
  });

  it("requires planned style parts to be explicit", () => {
    const profile = StyleCapabilityProfileSchema.parse({
      schema: "kf-style-capability-profile/v1",
      capabilityId: "button",
      version: "1.0.0",
      parts: [{
        id: "root",
        availability: "supported",
        semanticRoles: ["action-surface"],
        properties: ["backgroundColor", "textColor", "borderRadius"],
        states: ["hover", "active", "focus", "disabled"],
        notes: ["主要按钮必须有可辨识的 focus 状态"],
      }],
    });
    expect(profile.parts[0]?.availability).toBe("supported");
  });

  it("requires evidence for every supported script member", () => {
    const missingEvidence = {
      schema: "kf-script-capability-profile/v1",
      capabilityId: "select",
      version: "1.0.0",
      availability: "supported",
      actions: [],
      events: [{
        semanticEvent: "change",
        kfEvent: "Change",
        availability: "supported",
        arguments: [],
        evidence: [],
      }],
      methods: [],
      initialization: { supportsConfigureData: false, lifecycleEvents: [] },
      limitations: [],
    };
    expect(ScriptCapabilityProfileSchema.safeParse(missingEvidence).success).toBe(false);
  });

  it("requires every recipe role to offer real candidates", () => {
    const result = CompositionRecipeSchema.safeParse({
      schema: "kf-composition-recipe/v1",
      id: "filtered-record-workspace",
      version: "1.0.0",
      purpose: "筛选并选择结构化记录",
      useFor: ["设备列表"],
      avoidFor: [],
      requiredRoles: [{ role: "record-list", capabilityCandidates: [] }],
      optionalRoles: [],
      layoutPrinciples: ["筛选区位于数据区上方"],
      interactionFlow: ["修改筛选条件", "刷新结果"],
      substitutions: [],
      designNotes: [],
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the contract test and verify the missing-module failure**

Run:

```bash
pnpm --dir agent-app --filter @kf/contracts exec vitest run src/design-knowledge.test.ts
```

Expected: FAIL because `./design-knowledge.js` does not exist.

- [ ] **Step 3: Implement the schemas and inferred types**

Create `design-knowledge.ts` with these exact public shapes:

```ts
import { z } from "zod";

const id = z.string().trim().min(1).max(100).regex(/^[A-Za-z][A-Za-z0-9_.-]*$/);
const text = z.string().trim().min(1).max(400);
const textList = z.array(text).max(16);
const version = z.string().trim().regex(/^\d+\.\d+\.\d+$/);
const evidence = z.object({
  kind: z.enum(["template", "compiler", "fixture", "product-source"]),
  ref: z.string().trim().min(1).max(300),
}).strict();
const availability = z.enum(["supported", "planned"]);

export const DesignDensitySchema = z.enum(["compact", "comfortable", "spacious"]);
export const DesignRegionSchema = z.enum(["header", "main", "sidebar", "footer", "toolbar", "overlay", "workspace"]);
export const DesignDataShapeSchema = z.enum([
  "none", "scalar", "record", "record-list", "hierarchy", "time-series", "media-list", "action-list",
]);
export const StyleKnowledgePropertySchema = z.enum([
  "backgroundColor", "textColor", "borderColor", "borderRadius", "fontSize", "fontWeight",
  "lineHeight", "padding", "margin", "gap", "boxShadow", "opacity", "textAlign",
]);
export const StyleKnowledgeStateSchema = z.enum(["hover", "active", "focus", "disabled", "selected", "error"]);

export const ControlDesignProfileSchema = z.object({
  schema: z.literal("kf-control-design-profile/v1"),
  capabilityId: id,
  version,
  semanticRoles: z.array(id).min(1).max(16),
  useFor: textList.min(1),
  avoidFor: textList,
  dataShapes: z.array(DesignDataShapeSchema).min(1).max(8),
  densities: z.array(DesignDensitySchema).min(1).max(3),
  regions: z.array(DesignRegionSchema).min(1).max(7),
  minimumSize: z.object({ width: z.number().int().min(1).max(8192), height: z.number().int().min(1).max(8192) }).strict(),
  recommendedCompanions: z.array(id).max(16),
  alternatives: z.array(z.object({ when: text, capabilityIds: z.array(id).min(1).max(12) }).strict()).max(12),
  parentRoles: z.array(id).max(12),
  childRoles: z.array(id).max(12),
  designNotes: textList,
}).strict();

export const StyleCapabilityProfileSchema = z.object({
  schema: z.literal("kf-style-capability-profile/v1"),
  capabilityId: id,
  version,
  parts: z.array(z.object({
    id,
    availability,
    semanticRoles: z.array(id).min(1).max(12),
    properties: z.array(StyleKnowledgePropertySchema).min(1).max(13),
    states: z.array(StyleKnowledgeStateSchema).max(6),
    notes: textList,
  }).strict()).min(1).max(16),
}).strict();

const supportedMember = z.object({
  semanticEvent: id,
  kfEvent: text,
  linkId: z.number().int().min(0).max(65535).optional(),
  availability,
  arguments: z.array(z.object({ name: id, position: z.number().int().min(0).max(32).optional() }).strict()).max(16),
  evidence: z.array(evidence).max(8),
}).strict().superRefine((value, ctx) => {
  if (value.availability === "supported" && value.evidence.length === 0) {
    ctx.addIssue({ code: "custom", path: ["evidence"], message: "supported script event requires evidence" });
  }
});

const method = z.object({
  semanticMethod: id,
  kfMethod: text,
  availability,
  parameters: z.array(id).max(16),
  returns: z.enum(["void", "scalar", "record", "record-list", "unknown"]),
  evidence: z.array(evidence).max(8),
}).strict().superRefine((value, ctx) => {
  if (value.availability === "supported" && value.evidence.length === 0) {
    ctx.addIssue({ code: "custom", path: ["evidence"], message: "supported script method requires evidence" });
  }
});

const action = z.object({
  semanticAction: id,
  implementation: z.enum(["restricted-action", "event-script", "configure-data"]),
  availability,
  evidence: z.array(evidence).max(8),
}).strict().superRefine((value, ctx) => {
  if (value.availability === "supported" && value.evidence.length === 0) {
    ctx.addIssue({ code: "custom", path: ["evidence"], message: "supported script action requires evidence" });
  }
});

export const ScriptCapabilityProfileSchema = z.object({
  schema: z.literal("kf-script-capability-profile/v1"),
  capabilityId: id,
  version,
  availability,
  actions: z.array(action).max(16),
  events: z.array(supportedMember).max(32),
  methods: z.array(method).max(32),
  initialization: z.object({ supportsConfigureData: z.boolean(), lifecycleEvents: z.array(id).max(12) }).strict(),
  limitations: textList,
}).strict();

const recipeRole = z.object({ role: id, capabilityCandidates: z.array(id).min(1).max(16) }).strict();
export const CompositionRecipeSchema = z.object({
  schema: z.literal("kf-composition-recipe/v1"),
  id,
  version,
  purpose: text,
  useFor: textList.min(1),
  avoidFor: textList,
  requiredRoles: z.array(recipeRole).min(1).max(16),
  optionalRoles: z.array(recipeRole).max(16),
  layoutPrinciples: textList.min(1),
  interactionFlow: textList,
  substitutions: z.array(z.object({ when: text, replaceRole: id, withCapabilities: z.array(id).min(1).max(12) }).strict()).max(12),
  designNotes: textList,
}).strict();

export type ControlDesignProfile = z.infer<typeof ControlDesignProfileSchema>;
export type StyleCapabilityProfile = z.infer<typeof StyleCapabilityProfileSchema>;
export type ScriptCapabilityProfile = z.infer<typeof ScriptCapabilityProfileSchema>;
export type CompositionRecipe = z.infer<typeof CompositionRecipeSchema>;
```

Add `export * from "./design-knowledge.js";` to `contracts/src/index.ts`.

- [ ] **Step 4: Run contract tests and typecheck**

Run:

```bash
pnpm --dir agent-app --filter @kf/contracts exec vitest run src/design-knowledge.test.ts
pnpm --dir agent-app --filter @kf/contracts typecheck
```

Expected: both commands PASS.

- [ ] **Step 5: Commit the contract boundary**

```bash
git add agent-app/packages/contracts/src/design-knowledge.ts agent-app/packages/contracts/src/design-knowledge.test.ts agent-app/packages/contracts/src/index.ts
git commit -m "feat: add KF design knowledge contracts"
```

---

### Task 2: Build the immutable control design registry

**Files:**
- Create: `agent-app/packages/domain-client/src/design-knowledge/registry.ts`
- Create: `agent-app/packages/domain-client/src/design-knowledge/control-design-registry.ts`
- Create: `agent-app/packages/domain-client/src/design-knowledge/control-design-registry.test.ts`

**Interfaces:**
- Consumes: `ControlDesignProfile` and `ControlDesignProfileSchema` from `@kf/contracts`; `getControlCapability()` from the existing technical registry.
- Produces: `listControlDesignProfiles(): readonly ControlDesignProfile[]`, `getControlDesignProfile(capabilityId: string): ControlDesignProfile | undefined`, and `requireControlDesignProfile(capabilityId: string): ControlDesignProfile`.

- [ ] **Step 1: Write failing registry tests**

```ts
import { describe, expect, it } from "vitest";
import {
  getControlDesignProfile,
  listControlDesignProfiles,
  requireControlDesignProfile,
} from "./control-design-registry.js";

const expectedIds = [
  "button", "checkbox", "datetimepicker", "easyui.1", "easyui.12", "easyui.18", "easyui.19",
  "easyui.2", "easyui.22", "easyui.6", "image", "input", "inputnumber", "layout.2", "layout.4",
  "layout.5", "list", "navmenu", "radio", "richtext", "select", "switch", "tabs", "tag", "text", "tree",
];

describe("control design registry", () => {
  it("publishes the exact phase-one baseline in deterministic order", () => {
    expect(listControlDesignProfiles().map((profile) => profile.capabilityId)).toEqual(expectedIds);
  });

  it("records strong negative semantics for structured tables", () => {
    const table = requireControlDesignProfile("easyui.1");
    expect(table.semanticRoles).toContain("structured-record-list");
    expect(table.avoidFor).toContain("图片主导的作品展示");
    expect(table.avoidFor).toContain("品牌叙事内容");
  });

  it("keeps layout and atomic alternatives available for creative composition", () => {
    const table = requireControlDesignProfile("easyui.1");
    expect(table.alternatives).toContainEqual({
      when: "内容强调图片和叙事",
      capabilityIds: ["image", "text", "button", "layout.2"],
    });
  });

  it("returns undefined for absent optional lookup and throws for require", () => {
    expect(getControlDesignProfile("prototype.Unknown")).toBeUndefined();
    expect(() => requireControlDesignProfile("prototype.Unknown"))
      .toThrow("CONTROL_DESIGN_PROFILE_NOT_FOUND: prototype.Unknown");
  });

  it("deep-freezes canonical records", () => {
    const profile = requireControlDesignProfile("button");
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.useFor)).toBe(true);
    expect(Object.isFrozen(profile.alternatives)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and verify the missing-registry failure**

Run:

```bash
pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/design-knowledge/control-design-registry.test.ts
```

Expected: FAIL because the registry module does not exist.

- [ ] **Step 3: Implement the generic immutable registry**

```ts
export interface KnowledgeRegistry<T> {
  list(): readonly T[];
  get(id: string): T | undefined;
  require(id: string): T;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function createKnowledgeRegistry<T>(
  records: readonly T[],
  keyOf: (record: T) => string,
  missingCode: string,
): KnowledgeRegistry<T> {
  const compareCodePoints = (left: string, right: string): number =>
    left < right ? -1 : left > right ? 1 : 0;
  const sorted = [...records]
    .sort((left, right) => compareCodePoints(keyOf(left), keyOf(right)))
    .map(deepFreeze);
  const byId = new Map<string, T>();
  for (const record of sorted) {
    const key = keyOf(record);
    if (byId.has(key)) throw new Error(`KNOWLEDGE_RECORD_DUPLICATE: ${key}`);
    byId.set(key, record);
  }
  const frozen = Object.freeze(sorted);
  return Object.freeze({
    list: () => frozen,
    get: (id: string) => byId.get(id),
    require: (id: string) => {
      const record = byId.get(id);
      if (record === undefined) throw new Error(`${missingCode}: ${id}`);
      return record;
    },
  });
}
```

- [ ] **Step 4: Implement and validate the explicit baseline profiles**

Parse every literal with `ControlDesignProfileSchema.parse()` before registry construction. Use schema/version `kf-control-design-profile/v1` and `1.0.0` for every record. Define these exact families and overrides:

| IDs | Semantic roles | Positive use | Required negative guidance |
|---|---|---|---|
| `text`, `richtext` | heading, body-copy, narrative-content | headings, descriptions, long-form content | not a replacement for structured records or interactive controls |
| `image` | media, portrait, product-visual | visual storytelling and identifiable media | not decorative filler without content purpose |
| `tag` | status-label, category-label | compact status and category | not long prose or primary action |
| `button`, `easyui.2` | primary-action, secondary-action | explicit user actions | not navigation decoration without an action |
| `input`, `inputnumber`, `select`, `checkbox`, `radio`, `switch`, `datetimepicker` | form-input plus the exact value kind | bounded form entry and filtering | not read-only content display |
| `tabs` | view-switcher, content-grouping | sibling views sharing context | not single-section decoration |
| `list` | simple-record-list | short, low-column record collections | not high-column comparison |
| `tree` | hierarchy-navigation | parent-child structures | not flat unrelated records |
| `navmenu` | primary-navigation | multi-destination navigation | not a single oversized home button |
| `easyui.1` | structured-record-list, comparison, record-selection | filterable homogeneous records | exactly `图片主导的作品展示` and `品牌叙事内容` |
| `easyui.6` | record-search | keyword search adjacent to a result view | not a standalone content block |
| `easyui.12`, `easyui.19` | modal-detail, focused-task | contextual detail and focused tasks | not permanent primary page layout |
| `easyui.18` | hierarchical-record-list | hierarchy plus columns | not flat narrative content |
| `easyui.22` | pagination | paged record collections | not a result view by itself |
| `layout.2`, `layout.4`, `layout.5` | row-layout, column-layout, dock-layout | spatial composition | not customer-visible content |

Use these exact layout minimum sizes: `layout.2` 160×40, `layout.4` 160×80, `layout.5` 480×320. Use 640×240 for `easyui.1`, 520×240 for `easyui.18`, 320×180 for modal/window controls, and template fixed sizes for the remaining controls. Add the exact table alternative tested above.

Finish with:

```ts
const registry = createKnowledgeRegistry(
  RAW_PROFILES.map((profile) => ControlDesignProfileSchema.parse(profile)),
  (profile) => profile.capabilityId,
  "CONTROL_DESIGN_PROFILE_NOT_FOUND",
);

export const listControlDesignProfiles = registry.list;
export const getControlDesignProfile = registry.get;
export const requireControlDesignProfile = registry.require;
```

- [ ] **Step 5: Run focused tests and typecheck**

```bash
pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/design-knowledge/control-design-registry.test.ts
pnpm --dir agent-app --filter @kf/domain-client typecheck
```

Expected: both PASS.

- [ ] **Step 6: Commit the control design registry**

```bash
git add agent-app/packages/domain-client/src/design-knowledge/registry.ts agent-app/packages/domain-client/src/design-knowledge/control-design-registry.ts agent-app/packages/domain-client/src/design-knowledge/control-design-registry.test.ts
git commit -m "feat: add KF control design knowledge"
```

---

### Task 3: Add style-part knowledge without overstating support

**Files:**
- Create: `agent-app/packages/domain-client/src/design-knowledge/style-capability-registry.ts`
- Create: `agent-app/packages/domain-client/src/design-knowledge/style-capability-registry.test.ts`

**Interfaces:**
- Consumes: `StyleCapabilityProfileSchema`; `listControlDesignProfiles()`; internal `getStyleAdapter()`.
- Produces: `listStyleCapabilityProfiles()`, `getStyleCapabilityProfile(capabilityId)`, and `requireStyleCapabilityProfile(capabilityId)` with `StyleCapabilityProfile` values.

- [ ] **Step 1: Write failing support-alignment tests**

```ts
import { describe, expect, it } from "vitest";
import { getStyleAdapter } from "../style/adapters/base-adapters.js";
import {
  listStyleCapabilityProfiles,
  requireStyleCapabilityProfile,
} from "./style-capability-registry.js";

describe("style capability knowledge", () => {
  it("has a profile for every phase-one control design profile", () => {
    expect(listStyleCapabilityProfiles()).toHaveLength(26);
  });

  it("never calls a part supported when no adapter exists", () => {
    for (const profile of listStyleCapabilityProfiles()) {
      if (profile.parts.some((part) => part.availability === "supported")) {
        expect(getStyleAdapter(profile.capabilityId)).toBeDefined();
      }
    }
  });

  it("documents rich internal parts as planned until dedicated adapters exist", () => {
    const table = requireStyleCapabilityProfile("easyui.1");
    expect(table.parts.map((part) => [part.id, part.availability])).toEqual([
      ["root", "planned"],
      ["header", "planned"],
      ["row", "planned"],
      ["cell", "planned"],
      ["empty", "planned"],
    ]);
  });

  it("exposes button interaction states on the reviewed root adapter", () => {
    const root = requireStyleCapabilityProfile("button").parts.find((part) => part.id === "root");
    expect(root).toMatchObject({ availability: "supported" });
    expect(root?.states).toEqual(["hover", "active", "focus", "disabled", "selected"]);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/design-knowledge/style-capability-registry.test.ts
```

Expected: FAIL because `style-capability-registry.ts` does not exist.

- [ ] **Step 3: Implement the exact style profile matrix**

Use the common property groups below; every property must be a value accepted by `StyleKnowledgePropertySchema`:

```ts
const SURFACE = ["backgroundColor", "borderColor", "borderRadius", "boxShadow", "opacity"] as const;
const TYPE = ["textColor", "fontSize", "fontWeight", "lineHeight", "textAlign"] as const;
const SPACE = ["padding", "margin", "gap"] as const;
const INTERACTIVE = ["hover", "active", "focus", "disabled", "selected"] as const;
const FORM = ["hover", "active", "focus", "disabled", "error"] as const;
```

Create one profile for each of the 26 IDs from Task 2. Apply this exact support policy:

- `text`: supported `root` with TYPE and `hover/active/focus/disabled`.
- `richtext`: supported `root` with SURFACE+TYPE+SPACE and FORM; planned `content` with TYPE+SPACE.
- `image`: supported `root` with SURFACE+SPACE and `hover/active/focus/disabled`; planned `media` with opacity.
- `tag`, `button`, `easyui.2`: supported `root` with SURFACE+TYPE+SPACE and INTERACTIVE; planned `label` and `icon` with TYPE.
- `input`, `inputnumber`, `select`, `checkbox`, `radio`, `switch`, `datetimepicker`: supported `root` with SURFACE+TYPE+SPACE and FORM; planned `input`, `label`, `indicator`, or `placeholder` parts as appropriate.
- `tabs`: supported `root`; planned `tab`, `active-indicator`, and `panel`.
- `layout.2`, `layout.4`, `layout.5`: supported `root` with SURFACE+SPACE and no states.
- `list`, `tree`, `navmenu`, `easyui.1`, `easyui.6`, `easyui.12`, `easyui.18`, `easyui.19`, `easyui.22`: all semantic parts are `planned` because no current reviewed adapter exists.

For `easyui.1`, insert parts in the exact order asserted by the test. Parse records through `StyleCapabilityProfileSchema` and expose them through `createKnowledgeRegistry(..., "STYLE_CAPABILITY_PROFILE_NOT_FOUND")`.

- [ ] **Step 4: Run focused and existing style tests**

```bash
pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/design-knowledge/style-capability-registry.test.ts src/style/adapters/base-adapters.test.ts src/style/style-engine.test.ts
pnpm --dir agent-app --filter @kf/domain-client typecheck
```

Expected: all PASS; existing adapters and style compilation remain unchanged.

- [ ] **Step 5: Commit the style knowledge**

```bash
git add agent-app/packages/domain-client/src/design-knowledge/style-capability-registry.ts agent-app/packages/domain-client/src/design-knowledge/style-capability-registry.test.ts
git commit -m "feat: describe KF style capability parts"
```

---

### Task 4: Add evidence-backed script capability knowledge

**Files:**
- Create: `agent-app/packages/domain-client/src/design-knowledge/script-capability-registry.ts`
- Create: `agent-app/packages/domain-client/src/design-knowledge/script-capability-registry.test.ts`

**Interfaces:**
- Consumes: `ScriptCapabilityProfileSchema`; Task 2 baseline IDs; existing control templates and restricted action compiler evidence.
- Produces: `listScriptCapabilityProfiles()`, `getScriptCapabilityProfile(capabilityId)`, and `requireScriptCapabilityProfile(capabilityId)`.

- [ ] **Step 1: Write failing evidence tests**

```ts
import { describe, expect, it } from "vitest";
import {
  listScriptCapabilityProfiles,
  requireScriptCapabilityProfile,
} from "./script-capability-registry.js";

describe("script capability knowledge", () => {
  it("records every phase-one control even when behavior is only planned", () => {
    expect(listScriptCapabilityProfiles()).toHaveLength(26);
  });

  it("ties supported select events to the native template", () => {
    const select = requireScriptCapabilityProfile("select");
    expect(select.events.map((event) => event.kfEvent)).toEqual([
      "Change", "visible-Change", "Remove-Tag", "Clear", "Blur", "Focus",
    ]);
    expect(select.events.every((event) => event.evidence.some((item) =>
      item.ref === "templates/control-templates/select.json#connectArray",
    ))).toBe(true);
  });

  it("records the reviewed button restricted actions", () => {
    const button = requireScriptCapabilityProfile("button");
    expect(button.actions.map((action) => action.semanticAction)).toEqual([
      "navigate-page", "set-variable", "open-dialog",
    ]);
    expect(button.actions.every((action) => action.implementation === "restricted-action")).toBe(true);
    expect(button.actions.find((action) => action.semanticAction === "open-dialog")?.availability)
      .toBe("planned");
    expect(button.actions.filter((action) => action.availability === "supported")
      .map((action) => action.semanticAction)).toEqual(["navigate-page", "set-variable"]);
  });

  it("does not claim planned datagrid methods as supported", () => {
    const table = requireScriptCapabilityProfile("easyui.1");
    expect(table.availability).toBe("planned");
    expect(table.methods.every((method) => method.availability === "planned")).toBe(true);
  });

  it("gives every supported member repository evidence", () => {
    for (const profile of listScriptCapabilityProfiles()) {
      for (const member of [...profile.actions, ...profile.events, ...profile.methods]) {
        if (member.availability === "supported") expect(member.evidence.length).toBeGreaterThan(0);
      }
    }
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/design-knowledge/script-capability-registry.test.ts
```

Expected: FAIL because the script registry does not exist.

- [ ] **Step 3: Implement supported, evidenced records**

Create one profile for each Task 2 ID. Use `availability: "planned"`, empty supported arrays, and a concrete limitation for controls without reviewed behavior. Add these exact supported records:

- `button` actions `navigate-page` and `set-variable` as supported `restricted-action` members, evidenced by the current action IR and compiler tests. Record `open-dialog` as a planned `restricted-action`: its compiled type exists, but the current plan schema cannot yet produce it, so compiler type presence alone must not upgrade it to supported.
- `checkbox` event `change` → KF `Change`, evidenced by `templates/control-templates/checkbox.json#connectArray`.
- `image` events `load` → `Load` and `error` → `Error`, including their reviewed numeric `linkId` values, evidenced by `templates/control-templates/image.json#linkMng`.
- `select` events in the exact test order, evidenced by `templates/control-templates/select.json#connectArray`.
- `tabs` events `tab-click`, `tab-remove`, `tab-add`, `edit` mapped to `Tab-click`, `Tab-remove`, `Tab-add`, `Edit`, evidenced by `templates/control-templates/tabs.json#connectArray`.

For template events whose source does not expose a stable numeric mapping, omit `linkId`; never invent one. Record these planned datagrid methods without evidence claims: `set-data` → `SetData`, `get-data` → `GetData`, `get-selected` → `GetSelected`. Set `availability: "planned"` on each and on the `easyui.1` profile. Record `initialization.supportsConfigureData: true` for EasyUI controls and `false` for the five reviewed static controls above unless their template proves otherwise.

Parse all records through `ScriptCapabilityProfileSchema` and construct the registry with missing code `SCRIPT_CAPABILITY_PROFILE_NOT_FOUND`.

- [ ] **Step 4: Run script knowledge and regression tests**

```bash
pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/design-knowledge/script-capability-registry.test.ts src/compile/control-compiler.test.ts src/validate/client-validator.test.ts
pnpm --dir agent-app --filter @kf/domain-client typecheck
```

Expected: all PASS; no compiler or validator behavior changes.

- [ ] **Step 5: Commit the script knowledge**

```bash
git add agent-app/packages/domain-client/src/design-knowledge/script-capability-registry.ts agent-app/packages/domain-client/src/design-knowledge/script-capability-registry.test.ts
git commit -m "feat: add KF script capability knowledge"
```

---

### Task 5: Add reusable composition recipes

**Files:**
- Create: `agent-app/packages/domain-client/src/design-knowledge/composition-recipe-registry.ts`
- Create: `agent-app/packages/domain-client/src/design-knowledge/composition-recipe-registry.test.ts`

**Interfaces:**
- Consumes: `CompositionRecipeSchema`; Task 2 control design IDs.
- Produces: `listCompositionRecipes()`, `getCompositionRecipe(id)`, and `requireCompositionRecipe(id)`.

- [ ] **Step 1: Write failing recipe tests**

```ts
import { describe, expect, it } from "vitest";
import {
  listCompositionRecipes,
  requireCompositionRecipe,
} from "./composition-recipe-registry.js";

describe("composition recipe registry", () => {
  it("publishes the exact initial recipe set", () => {
    expect(listCompositionRecipes().map((recipe) => recipe.id)).toEqual([
      "filtered-record-workspace",
      "form-dialog-flow",
      "master-detail-workspace",
      "media-card-gallery",
      "sidebar-admin-shell",
      "split-hero",
    ]);
  });

  it("keeps recipes substitutable rather than fixed templates", () => {
    const gallery = requireCompositionRecipe("media-card-gallery");
    expect(gallery.substitutions).toContainEqual({
      when: "内容没有可用图片",
      replaceRole: "media",
      withCapabilities: ["richtext", "tag"],
    });
  });

  it("keeps the filtered workspace semantically separate from media content", () => {
    const recipe = requireCompositionRecipe("filtered-record-workspace");
    expect(recipe.avoidFor).toContain("图片主导的作品展示");
    expect(recipe.requiredRoles.find((role) => role.role === "record-list")?.capabilityCandidates)
      .toEqual(["easyui.1", "list", "easyui.18"]);
  });
});
```

- [ ] **Step 2: Run the recipe test and verify it fails**

```bash
pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/design-knowledge/composition-recipe-registry.test.ts
```

Expected: FAIL because the recipe registry does not exist.

- [ ] **Step 3: Implement the six exact recipes**

Each record uses schema `kf-composition-recipe/v1` and version `1.0.0`. Define these exact role candidates:

| Recipe | Required role candidates | Core layout principle |
|---|---|---|
| `split-hero` | heading: `text`; narrative: `richtext,text`; primary-action: `button,easyui.2`; media: `image`; structure: `layout.2,layout.4` | 5/7 or 7/5 split with one dominant side; height follows content |
| `media-card-gallery` | media: `image`; title: `text`; summary: `text,richtext`; action: `button,easyui.2`; structure: `layout.2,layout.4` | one featured item plus secondary items or a responsive grid |
| `filtered-record-workspace` | search: `easyui.6,input`; filter: `select,checkbox,radio`; record-list: `easyui.1,list,easyui.18`; structure: `layout.4`; pagination: `easyui.22` | toolbar aligns above the result surface; result owns remaining space |
| `master-detail-workspace` | master: `easyui.1,list,tree,easyui.18`; detail: `richtext,text`; structure: `layout.2,layout.5` | master stays narrower than detail; overlay is an allowed alternative |
| `sidebar-admin-shell` | navigation: `navmenu,tree`; content: `layout.4`; structure: `layout.5` | persistent narrow navigation with one primary work surface |
| `form-dialog-flow` | input: `input,inputnumber,select,checkbox,radio,switch,datetimepicker`; action: `button,easyui.2`; overlay: `easyui.12,easyui.19`; structure: `layout.4` | labels and inputs align; primary action is distinct from reset/cancel |

Add the exact gallery substitution and filtered-workspace negative guidance asserted above. Every recipe must include at least one interaction-flow step except `split-hero`, which must include the primary-action step. Parse through `CompositionRecipeSchema` and expose through `createKnowledgeRegistry(..., "COMPOSITION_RECIPE_NOT_FOUND")`.

- [ ] **Step 4: Run focused tests and typecheck**

```bash
pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/design-knowledge/composition-recipe-registry.test.ts
pnpm --dir agent-app --filter @kf/domain-client typecheck
```

Expected: both PASS.

- [ ] **Step 5: Commit the recipes**

```bash
git add agent-app/packages/domain-client/src/design-knowledge/composition-recipe-registry.ts agent-app/packages/domain-client/src/design-knowledge/composition-recipe-registry.test.ts
git commit -m "feat: add KF composition recipes"
```

---

### Task 6: Aggregate, validate, export, and document the catalog

**Files:**
- Create: `agent-app/packages/domain-client/src/design-knowledge/design-knowledge-catalog.ts`
- Create: `agent-app/packages/domain-client/src/design-knowledge/design-knowledge-catalog.test.ts`
- Modify: `agent-app/packages/domain-client/src/index.ts:1-45`
- Create: `agent-app/docs/design-knowledge-v1.md`

**Interfaces:**
- Consumes: all four registries; `getControlCapability()`; `getStyleAdapter()`.
- Produces: `assertDesignKnowledgeIntegrity(): void` and `getDesignKnowledgeSnapshot(): DesignKnowledgeSnapshot`.

- [ ] **Step 1: Write failing aggregate integrity tests**

```ts
import { describe, expect, it } from "vitest";
import {
  assertDesignKnowledgeIntegrity,
  getDesignKnowledgeSnapshot,
} from "./design-knowledge-catalog.js";

describe("design knowledge catalog", () => {
  it("cross-validates all technical and semantic references", () => {
    expect(() => assertDesignKnowledgeIntegrity()).not.toThrow();
  });

  it("returns a deterministic deeply frozen snapshot", () => {
    const snapshot = getDesignKnowledgeSnapshot();
    expect(snapshot.schema).toBe("kf-design-knowledge-catalog/v1");
    expect(snapshot.version).toBe("1.0.0");
    expect(snapshot.controlDesignProfiles).toHaveLength(26);
    expect(snapshot.styleCapabilityProfiles).toHaveLength(26);
    expect(snapshot.scriptCapabilityProfiles).toHaveLength(26);
    expect(snapshot.compositionRecipes).toHaveLength(6);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.controlDesignProfiles)).toBe(true);
  });

  it("exports defensive canonical data rather than mutable copies", () => {
    const first = getDesignKnowledgeSnapshot();
    const second = getDesignKnowledgeSnapshot();
    expect(second).toBe(first);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
pnpm --dir agent-app --filter @kf/domain-client exec vitest run src/design-knowledge/design-knowledge-catalog.test.ts
```

Expected: FAIL because the aggregate catalog does not exist.

- [ ] **Step 3: Implement exact integrity checks**

Define:

```ts
export interface DesignKnowledgeSnapshot {
  readonly schema: "kf-design-knowledge-catalog/v1";
  readonly version: "1.0.0";
  readonly controlDesignProfiles: ReturnType<typeof listControlDesignProfiles>;
  readonly styleCapabilityProfiles: ReturnType<typeof listStyleCapabilityProfiles>;
  readonly scriptCapabilityProfiles: ReturnType<typeof listScriptCapabilityProfiles>;
  readonly compositionRecipes: ReturnType<typeof listCompositionRecipes>;
}
```

`assertDesignKnowledgeIntegrity()` must throw a single `DESIGN_KNOWLEDGE_INTEGRITY_FAILED: ...` error containing sorted issue strings when any of these conditions fails:

1. A control/style/script profile references a capability absent from `ControlCapabilityRegistry`.
2. A recommended companion, alternative, or recipe candidate lacks a `ControlDesignProfile`.
3. A style or script profile lacks the corresponding `ControlDesignProfile`.
4. A `supported` style part belongs to a capability without `getStyleAdapter(capabilityId)`.
5. A supported script action/event/method has no evidence.
6. A recipe has duplicate required/optional roles.
7. Any registry list is not sorted by code-point ID or contains duplicate IDs.

Build one frozen canonical snapshot after a successful assertion and return the same object on every call. Do not include technical `ControlCapability` records in the snapshot; phase 2 will join them explicitly so design metadata cannot override technical truth.

- [ ] **Step 4: Export the public API and document extension policy**

Add these exports to `domain-client/src/index.ts`:

```ts
export * from "./design-knowledge/control-design-registry.js";
export * from "./design-knowledge/style-capability-registry.js";
export * from "./design-knowledge/script-capability-registry.js";
export * from "./design-knowledge/composition-recipe-registry.js";
export * from "./design-knowledge/design-knowledge-catalog.js";
```

Create `agent-app/docs/design-knowledge-v1.md` with these fixed sections and facts:

- Purpose and the four-registry separation.
- Exact baseline counts: 26 control, 26 style, 26 script, 6 recipe records.
- `supported` versus `planned` semantics.
- Evidence kinds and accepted repository reference format.
- Rule that design knowledge cannot upgrade technical capability status.
- How to add a record: add contract-valid data, add focused tests, run aggregate integrity, then run both package test/typecheck commands.
- Explicit phase boundary: retrieval, prompts, new plan schemas, CSS expansion, ActionGraph, ScriptCompiler, and runtime verification are not implemented here.

- [ ] **Step 5: Run the full phase-one verification suite**

```bash
pnpm --dir agent-app --filter @kf/contracts test
pnpm --dir agent-app --filter @kf/contracts typecheck
pnpm --dir agent-app --filter @kf/contracts lint
pnpm --dir agent-app --filter @kf/domain-client test
pnpm --dir agent-app --filter @kf/domain-client typecheck
pnpm --dir agent-app --filter @kf/domain-client lint
git diff --check
```

Expected: every command exits 0. The domain-client test count increases only by the five new knowledge test files; existing compiler, patcher, validator, style, and module tests remain green.

- [ ] **Step 6: Commit the aggregate catalog and documentation**

```bash
git add agent-app/packages/domain-client/src/design-knowledge/design-knowledge-catalog.ts agent-app/packages/domain-client/src/design-knowledge/design-knowledge-catalog.test.ts agent-app/packages/domain-client/src/index.ts agent-app/docs/design-knowledge-v1.md
git commit -m "feat: publish KF design knowledge catalog"
```

---

## Completion Gate

Phase 1 is complete only when:

- all four contract schemas are strict and exported;
- the exact 26/26/26/6 baseline is present and immutable;
- `easyui.1` explicitly rejects media-led and brand-narrative use;
- supported style claims align with existing StyleAdapters;
- supported script claims carry concrete template/compiler evidence;
- every cross-registry capability reference resolves;
- the catalog snapshot is deterministic and deeply frozen;
- contracts and domain-client test, typecheck, lint, and `git diff --check` commands pass;
- no prompt, compiler, preview, Worker, or KF package behavior has changed.
