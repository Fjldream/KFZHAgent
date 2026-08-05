# KingFusion Solution Agent MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Build a multi-tenant, login-protected web Agent that creates KF client projects or losslessly modifies uploaded native client .gz projects, validates them deterministically, and returns packages importable through the native KF development UI.

**Architecture:** Use a TypeScript pnpm monorepo with Vue, NestJS, PostgreSQL/Prisma, LangGraph JS, and a separate build worker. LangGraph owns resumable conversation workflow; PostgreSQL owns users, workspaces, change requests, revisions, jobs, and audit data; private artifact storage owns project packages and workspaces. The first executable Domain Pack is kingclient, while an open Domain Registry preserves solution-level extensibility.

**Tech Stack:** Node.js LTS, TypeScript, pnpm workspaces, NestJS, Vue 3, Vite, PostgreSQL, Prisma, LangGraph JS, Zod, Vitest, Supertest, Playwright, Argon2id, ZIP-compatible archive libraries, Docker Compose.

## Global Constraints

- First release is offline-only: no customer-side connector, customer IP access, online KF writes, publication, deployment, or runtime control.
- First release implements only the kingclient Domain Pack; other KF domains register capability metadata with supported=false.
- Domain identifiers are open strings using KF module names such as kingclient, kingcalculation, kingdbconnector, kingioserver, and kingalarm.
- The LLM may emit only structured ProjectDesign and ChangePlan data; it must never read/write arbitrary files, execute uploaded scripts, or author final KF JSON directly.
- New projects use a deterministic compiler; uploaded projects use a lossless field-level patcher that preserves unknown files and fields.
- Every build is bound to an immutable baseRevisionId, confirmed planHash, and idempotencyKey.
- Every successful build creates a new immutable SolutionRevision and never overwrites a prior successful revision.
- Raw Center/sdb projects are read-only private corpus, never committed to Git, never sent to the model, and never copied into public fixtures.
- Only deterministic validators can assign pass/fail; the LLM may explain reports but cannot override them.
- A KF capability becomes supported only after native import, open, save, export, and re-import validation on the test server.
- Use TDD for every task and commit after each independently testable deliverable.

---

## Planned File Map

~~~text
agent-app/
├─ package.json
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ vitest.workspace.ts
├─ docker-compose.yml
├─ .env.example
├─ apps/
│  ├─ api/src/
│  ├─ worker/src/
│  └─ web/src/
├─ packages/
│  ├─ contracts/src/
│  ├─ domain-registry/src/
│  ├─ kf-schema-extractor/src/
│  ├─ artifact-storage/src/
│  ├─ domain-client/src/
│  └─ agent-orchestrator/src/
├─ prisma/
│  ├─ schema.prisma
│  └─ migrations/
└─ tests/
   ├─ fixtures/
   ├─ integration/
   └─ e2e/
~~~

Responsibilities:

- contracts: shared IDs, IR, ChangePlan, validation, job, and artifact schemas.
- domain-registry: open registration and capability routing.
- kf-schema-extractor: read-only inventory, schema mining, diffing, secret detection, and sanitization for development.
- artifact-storage: tenant-scoped private file access with atomic candidate/final writes.
- domain-client: native package import/export, inspect, compile, patch, preview, and validate.
- agent-orchestrator: LangGraph state, nodes, structured LLM ports, interrupts, and build-job handoff.
- api: authentication, tenancy, HTTP/SSE, workspace lifecycle, uploads, confirmations, downloads, and audit.
- worker: durable job leasing and deterministic build execution.
- web: login, workspace/conversation, upload, plan approval, preview, revisions, reports, and download.

---

### Task 1: Monorepo and Test Harness

**Files:**
- Create: agent-app/package.json
- Create: agent-app/pnpm-workspace.yaml
- Create: agent-app/tsconfig.base.json
- Create: agent-app/vitest.workspace.ts
- Create: agent-app/eslint.config.js
- Create: agent-app/.gitignore
- Create: agent-app/.env.example
- Create: agent-app/apps/api/package.json
- Create: agent-app/apps/worker/package.json
- Create: agent-app/apps/web/package.json
- Create: agent-app/packages/contracts/package.json
- Create: agent-app/packages/domain-registry/package.json
- Create: agent-app/packages/kf-schema-extractor/package.json
- Create: agent-app/packages/artifact-storage/package.json
- Create: agent-app/packages/domain-client/package.json
- Create: agent-app/packages/agent-orchestrator/package.json
- Test: agent-app/packages/contracts/src/smoke.test.ts

**Interfaces:**
- Consumes: none.
- Produces: pnpm test, pnpm typecheck, and pnpm lint root commands; @kf/contracts and @kf/domain-registry workspace packages.

- [ ] **Step 1: Write the failing workspace smoke test**

~~~ts
import { describe, expect, it } from "vitest";
import { solutionId } from "./ids.js";

describe("solutionId", () => {
  it("brands a non-empty string", () => {
    expect(solutionId("solution-1")).toBe("solution-1");
  });
  it("rejects an empty string", () => {
    expect(() => solutionId("")).toThrow("solution id is required");
  });
});
~~~

- [ ] **Step 2: Create the pnpm workspace and test scripts**

Root package.json scripts:

~~~json
{
  "name": "kf-solution-agent",
  "private": true,
  "scripts": {
    "test": "vitest run --workspace vitest.workspace.ts",
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint"
  }
}
~~~

Configure pnpm-workspace.yaml for apps/* and packages/*, and set strict TypeScript options including noUncheckedIndexedAccess, exactOptionalPropertyTypes, and noImplicitOverride.
Configure ESLint with the TypeScript parser and rules that reject floating promises, unused variables, explicit any, and unsafe member access. Each workspace package must expose test, typecheck, and lint scripts, even when its initial test suite is empty.

- [ ] **Step 3: Run the smoke test and verify failure**

Run: cd agent-app && pnpm install && pnpm test

Expected: FAIL because packages/contracts/src/ids.ts and solutionId do not exist.

- [ ] **Step 4: Add the minimal branded ID implementation**

~~~ts
export type SolutionId = string & { readonly __brand: "SolutionId" };

export function solutionId(value: string): SolutionId {
  if (value.trim().length === 0) throw new Error("solution id is required");
  return value as SolutionId;
}
~~~

- [ ] **Step 5: Verify root quality commands**

Run: cd agent-app && pnpm test && pnpm typecheck && pnpm lint

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

~~~bash
git add agent-app
git commit -m "chore: scaffold KF solution agent workspace"
~~~

---

### Task 2: Solution Contracts and Open Domain Registry

**Files:**
- Create: agent-app/packages/contracts/src/domain.ts
- Create: agent-app/packages/contracts/src/solution.ts
- Create: agent-app/packages/contracts/src/change-plan.ts
- Create: agent-app/packages/contracts/src/validation.ts
- Create: agent-app/packages/contracts/src/index.ts
- Create: agent-app/packages/domain-registry/src/domain-registry.ts
- Create: agent-app/packages/domain-registry/src/domain-registry.test.ts
- Create: agent-app/packages/domain-registry/src/index.ts

**Interfaces:**
- Consumes: SolutionId from @kf/contracts.
- Produces: DomainKind, DomainCapabilities, DomainPack, DomainRegistry, SolutionIR, ChangePlan, ValidationReport.

- [ ] **Step 1: Write registry behavior tests**

~~~ts
import { describe, expect, it } from "vitest";
import { DomainRegistry } from "./domain-registry.js";

const client = {
  kind: "kingclient",
  displayName: "客户端工程",
  supported: true,
  capabilities: { create: true, import: true, modify: true, validate: true, package: true },
  inspect: async () => ({}),
  compile: async () => ({}),
  patch: async () => ({}),
  validate: async () => ({
    status: "pass",
    checks: {
      packageStructure: "pass",
      jsonSchema: "pass",
      references: "pass",
      businessRules: "pass",
      changeScope: "pass",
      roundTrip: "pass"
    },
    warnings: []
  }),
  package: async () => "artifact-1"
};

describe("DomainRegistry", () => {
  it("resolves a registered domain", () => {
    const registry = new DomainRegistry();
    registry.register(client);
    expect(registry.require("kingclient")).toEqual(client);
  });

  it("rejects duplicate registrations", () => {
    const registry = new DomainRegistry();
    registry.register(client);
    expect(() => registry.register(client)).toThrow("domain already registered: kingclient");
  });

  it("reports unsupported metadata without a compiler", () => {
    const registry = new DomainRegistry();
    registry.registerMetadata({
      kind: "kingalarm",
      displayName: "告警工程",
      supported: false,
      capabilities: { create: false, import: false, modify: false, validate: false, package: false }
    });
    expect(registry.metadata("kingalarm").supported).toBe(false);
  });
});
~~~

- [ ] **Step 2: Run the tests and verify failure**

Run: cd agent-app && pnpm --filter @kf/domain-registry test

Expected: FAIL because DomainRegistry is not implemented.

- [ ] **Step 3: Define exact shared contracts**

~~~ts
export type DomainKind = string;

export type DomainCapabilities = {
  create: boolean;
  import: boolean;
  modify: boolean;
  validate: boolean;
  package: boolean;
};

export type DomainMetadata = {
  kind: DomainKind;
  displayName: string;
  supported: boolean;
  capabilities: DomainCapabilities;
};

export type DomainPack = DomainMetadata & {
  graph?: DomainSubgraphPort;
  inspect: (artifactId: string) => Promise<unknown>;
  compile: (projectIr: unknown) => Promise<unknown>;
  patch: (workspaceId: string, plan: ChangePlan) => Promise<unknown>;
  validate: (workspaceId: string) => Promise<ValidationReport>;
  package: (workspaceId: string) => Promise<string>;
};

export type DomainSubgraphPort = {
  invoke: (input: unknown, config?: Record<string, unknown>) => Promise<unknown>;
};
~~~

Define SolutionIR with schema="kf-solution-ir/v1", projects using DomainKind, dependencies using project IDs, and pendingRequirements as structured text plus requested domains. Define ChangePlan operations as discriminated create/update/delete operations with target entity IDs and JSON-pointer field patches.

- [ ] **Step 4: Implement the registry**

Use a Map keyed by DomainKind. require(kind) must reject missing and unsupported entries; metadata(kind) may return unsupported entries; register(pack) and registerMetadata(metadata) must reject duplicates.

- [ ] **Step 5: Run contract and registry tests**

Run: cd agent-app && pnpm --filter @kf/contracts test && pnpm --filter @kf/domain-registry test && pnpm typecheck

Expected: PASS.

- [ ] **Step 6: Commit**

~~~bash
git add agent-app/packages/contracts agent-app/packages/domain-registry
git commit -m "feat: define solution contracts and domain registry"
~~~

---

### Task 3: Read-Only SDB Inventory and Sanitized Fixture Pipeline

**Files:**
- Create: agent-app/packages/kf-schema-extractor/src/inventory.ts
- Create: agent-app/packages/kf-schema-extractor/src/json-shape.ts
- Create: agent-app/packages/kf-schema-extractor/src/secret-scanner.ts
- Create: agent-app/packages/kf-schema-extractor/src/sanitizer.ts
- Create: agent-app/packages/kf-schema-extractor/src/cli.ts
- Create: agent-app/packages/kf-schema-extractor/src/inventory.test.ts
- Create: agent-app/tests/fixtures/extractor-safe/project.json
- Create: agent-app/tests/fixtures/extractor-secret/project.json
- Modify: agent-app/.gitignore

**Interfaces:**
- Consumes: a read-only filesystem root.
- Produces: inventory(root): CorpusInventory, scanSecrets(value): SecretFinding[], sanitizeProject(input): SanitizedProject.

- [ ] **Step 1: Add safe and sensitive minimal fixtures**

Safe fixture contains guid, name, projectData.type, and a nested project object. Sensitive fixture contains password, token, connectionString, host, and an IPv4 address using documentation-only values.

- [ ] **Step 2: Write failing tests for non-disclosure**

~~~ts
it("counts projects without returning field values", async () => {
  const result = await inventory(fixtureRoot("extractor-safe"));
  expect(result.projectCount).toBe(1);
  expect(JSON.stringify(result)).not.toContain("DemoProject");
});

it("detects secrets and replaces their values", async () => {
  const source = await readFixture("extractor-secret/project.json");
  const findings = scanSecrets(source);
  expect(findings.map(f => f.kind)).toEqual(
    expect.arrayContaining(["password", "token", "connection-string", "ip-address"])
  );
  expect(JSON.stringify(sanitizeProject(source))).not.toContain("secret-value");
});
~~~

- [ ] **Step 3: Run tests and verify failure**

Run: cd agent-app && pnpm --filter @kf/kf-schema-extractor test

Expected: FAIL because extractor functions do not exist.

- [ ] **Step 4: Implement read-only traversal**

Use lstat and realpath checks. Reject symlinks, never open files outside the supplied root, record only relative structural paths, extensions, sizes, JSON field paths, and inferred primitive types. Never return JSON values from inventory().

- [ ] **Step 5: Implement secret scanning and sanitization**

Detect case-insensitive key names password, passwd, pwd, token, secret, connectionString, username, host, ip, and url. Replace values with deterministic non-secret markers so references remain comparable. Do not modify the raw corpus.

- [ ] **Step 6: Add CLI dry-run output**

Command:

~~~bash
pnpm --filter @kf/kf-schema-extractor cli --root ../KingFusion3.6_Center/sdb --mode inventory --output .private/inventory.json
~~~

The CLI must refuse output paths inside tests/fixtures or any Git-tracked directory. Add .private/, raw-corpus/, and sanitized-golden/ to .gitignore.

- [ ] **Step 7: Verify against fixtures and a read-only local SDB scan**

Run: cd agent-app && pnpm --filter @kf/kf-schema-extractor test

Then run the CLI against the local Center/sdb and verify it reports the five observed modules without printing project names or secret values.

- [ ] **Step 8: Commit only code and safe fixtures**

~~~bash
git add agent-app/packages/kf-schema-extractor agent-app/tests/fixtures agent-app/.gitignore
git commit -m "feat: add safe KF schema extraction pipeline"
~~~

---

### Task 4: Private Artifact Storage and Safe Native Client Package IO

**Files:**
- Create: agent-app/packages/artifact-storage/src/artifact-storage.ts
- Create: agent-app/packages/artifact-storage/src/local-artifact-storage.ts
- Create: agent-app/packages/artifact-storage/src/local-artifact-storage.test.ts
- Create: agent-app/packages/domain-client/src/package/safe-unzip.ts
- Create: agent-app/packages/domain-client/src/package/native-client-package.ts
- Create: agent-app/packages/domain-client/src/package/native-client-package.test.ts
- Create: agent-app/tests/fixtures/client-minimal/1.0.0.1/project.json

**Interfaces:**
- Consumes: tenantId, artifactId, readable stream, destination workspace.
- Produces: ArtifactStorage.put/get/delete, ClientWorkspace, importNativeClientPackage(), packageNativeClientProject().

- [ ] **Step 1: Write storage isolation tests**

Test that tenant-a cannot read tenant-b/artifact-1, path components containing .. are rejected, writes use a temporary file followed by rename, and returned paths always remain below the configured root.

- [ ] **Step 2: Write native package safety tests**

~~~ts
it("round-trips a minimal native client package", async () => {
  const gz = await packageNativeClientProject(minimalProjectDir);
  const unpacked = await importNativeClientPackage(gz, tempDir());
  expect(await readJson(unpacked + "/1.0.0.1/project.json")).toMatchObject({ name: "Minimal" });
});

it("rejects path traversal entries", async () => {
  const maliciousGz = await makeZip([{ path: "../../outside.txt", content: "blocked" }]);
  await expect(importNativeClientPackage(maliciousGz, tempDir()))
    .rejects.toThrow("PACKAGE_UNPACK_FAILED: unsafe entry path");
});
~~~

- [ ] **Step 3: Run tests and verify failure**

Run: cd agent-app && pnpm --filter @kf/artifact-storage test && pnpm --filter @kf/domain-client test

Expected: FAIL because storage and package functions do not exist.

- [ ] **Step 4: Implement LocalArtifactStorage**

Use tenant-scoped roots, opaque UUID artifact IDs, create-exclusive temporary writes, fsync, atomic rename, and explicit maximum size. Do not expose absolute paths through public return types.

~~~ts
export interface ArtifactStorage {
  put(input: {
    tenantId: string;
    kind: ArtifactKind;
    stream: NodeJS.ReadableStream;
    maxBytes: number;
  }): Promise<{ artifactId: string; sha256: string; size: number }>;
  open(tenantId: string, artifactId: string): Promise<NodeJS.ReadableStream>;
  delete(tenantId: string, artifactId: string): Promise<void>;
}

export type ClientWorkspace = {
  id: string;
  rootDir: string;
  mode: "source" | "candidate";
  sourceArtifactId?: string;
};
~~~

rootDir is an internal worker-only path and must never be serialized into an API response or LangGraph state.

- [ ] **Step 5: Implement safe ZIP-compatible .gz handling**

Treat client .gz as a ZIP container. Enforce maximum compressed size, maximum expanded size, maximum file count, maximum path length, compression ratio limit, no symlinks, no absolute paths, and no path traversal. Accept only one recognized version directory plus allowed top-level metadata.

- [ ] **Step 6: Implement deterministic packaging**

Sort entries lexically, normalize timestamps to a fixed epoch, use stable permissions, exclude pagerecord and Agent-private metadata, and write a .gz extension while preserving ZIP container semantics.

- [ ] **Step 7: Verify package reproducibility**

Package the same fixture twice and assert the SHA-256 hashes match. Unpack both and compare every byte.

- [ ] **Step 8: Commit**

~~~bash
git add agent-app/packages/artifact-storage agent-app/packages/domain-client/src/package agent-app/tests/fixtures/client-minimal
git commit -m "feat: add private artifacts and native client package IO"
~~~

---

### Task 5: Client IR, Templates, and Lossless Inspector

**Files:**
- Create: agent-app/packages/domain-client/src/ir/client-project-ir.ts
- Create: agent-app/packages/domain-client/src/ir/client-project-ir.schema.ts
- Create: agent-app/packages/domain-client/src/templates/page-skeleton.json
- Create: agent-app/packages/domain-client/src/templates/base-fields.json
- Create: agent-app/packages/domain-client/src/templates/control-templates/text.json
- Create: agent-app/packages/domain-client/src/templates/control-templates/button.json
- Create: agent-app/packages/domain-client/src/templates/control-templates/inputnumber.json
- Create: agent-app/packages/domain-client/src/inspect/client-inspector.ts
- Create: agent-app/packages/domain-client/src/inspect/client-inspector.test.ts
- Create: agent-app/tests/fixtures/client-unknown-field/

**Interfaces:**
- Consumes: unpacked native client workspace.
- Produces: ClientProjectIRSchema, ClientProjectSummary, EntityIndex keyed by KF GUID, raw-field provenance.

- [ ] **Step 1: Add a fixture with a known control and unknown fields**

The page fixture must include pageProperty, objects, one button with a stable GUID, and customFutureField at both page and control level.

- [ ] **Step 2: Write failing inspector tests**

~~~ts
it("indexes pages and controls by GUID without dropping unknown fields", async () => {
  const result = await inspectClientProject(fixture("client-unknown-field"));
  expect(result.index.controls["button-guid-1"].pageGuid).toBe("page-guid-1");
  expect(result.raw.pages["page-guid-1"].customFutureField).toEqual({ keep: true });
  expect(result.summary.pages[0].controls[0]).toMatchObject({
    guid: "button-guid-1",
    type: "button"
  });
});
~~~

- [ ] **Step 3: Run tests and verify failure**

Run: cd agent-app && pnpm --filter @kf/domain-client test -- client-inspector

Expected: FAIL because inspectClientProject is missing.

- [ ] **Step 4: Define exact IR schemas**

Use Zod discriminated unions for text, button, inputnumber, switch, checkbox, radio, select, image, tabs, table, richtext, and spacer. Define PageIR, VariableIR, ScriptIR, resource references, layout coordinates, and stable semantic IDs separate from KF GUIDs.

~~~ts
const BaseControlIR = z.object({
  id: z.string().min(1),
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  width: z.number().positive(),
  height: z.number().positive()
});

export const ControlIR = z.discriminatedUnion("type", [
  BaseControlIR.extend({ type: z.literal("text"), text: z.string() }),
  BaseControlIR.extend({
    type: z.literal("button"),
    text: z.string(),
    action: RestrictedAction.optional()
  }),
  BaseControlIR.extend({
    type: z.literal("inputnumber"),
    variableId: z.string().min(1),
    decimals: z.number().int().min(0).max(10)
  })
]);
~~~

Add the remaining approved control variants using the same base fields. No variant may expose a raw KF object or arbitrary property bag.

- [ ] **Step 5: Extract and review initial templates**

Run the extractor against kmui model sources and compare generated candidate fields with docs/kf-control-schema.md and existing SDB pages. Commit only the reviewed page skeleton, base fields, and first three control templates in this task.

- [ ] **Step 6: Implement the inspector**

Parse project.json, page manager, page files, Tag files, scripts, and resource references. Preserve raw JSON trees, collect unknown fields, build a GUID index, and return only a bounded structured summary for LLM use.

- [ ] **Step 7: Add summary size limits**

Test that a page with 10,000 controls returns counts and a capped representative list rather than all raw controls. Raw content remains in artifact storage.

- [ ] **Step 8: Verify tests and commit**

Run: cd agent-app && pnpm --filter @kf/domain-client test && pnpm typecheck

~~~bash
git add agent-app/packages/domain-client/src/ir agent-app/packages/domain-client/src/templates agent-app/packages/domain-client/src/inspect agent-app/tests/fixtures/client-unknown-field
git commit -m "feat: define client IR and lossless inspector"
~~~

---

### Task 6: Deterministic Client Compiler and Preview

**Files:**
- Create: agent-app/packages/domain-client/src/compile/guid-factory.ts
- Create: agent-app/packages/domain-client/src/compile/control-compiler.ts
- Create: agent-app/packages/domain-client/src/compile/page-compiler.ts
- Create: agent-app/packages/domain-client/src/compile/client-compiler.ts
- Create: agent-app/packages/domain-client/src/compile/client-compiler.test.ts
- Create: agent-app/packages/domain-client/src/preview/client-preview.ts
- Create: agent-app/packages/domain-client/src/preview/client-preview.test.ts
- Create: agent-app/tests/fixtures/client-ir/minimal.json

**Interfaces:**
- Consumes: ClientProjectIR and BuildSeed.
- Produces: compileClientProject(ir, seed): ClientWorkspace; renderClientPreview(ir): sanitized HTML.

- [ ] **Step 1: Write a minimal valid ClientProjectIR fixture**

Include one 1440x900 page, one text control, one button, one numeric control, one float variable, and a button action referencing a restricted action DSL command.

- [ ] **Step 2: Write deterministic compiler tests**

~~~ts
it("compiles the same IR and seed byte-for-byte", async () => {
  const first = await compileClientProject(ir, { seed: "build-1" });
  const second = await compileClientProject(ir, { seed: "build-1" });
  expect(await hashDirectory(first.path)).toBe(await hashDirectory(second.path));
});

it("uses reviewed templates rather than model-provided raw fields", async () => {
  const result = await compileClientProject(irWithInjectedRawField, { seed: "build-2" });
  expect(await findJsonValue(result.path, "arbitraryRawField")).toBeUndefined();
});
~~~

- [ ] **Step 3: Run tests and verify failure**

Run: cd agent-app && pnpm --filter @kf/domain-client test -- client-compiler

Expected: FAIL because compiler functions are missing.

- [ ] **Step 4: Implement deterministic GUID derivation**

Derive UUID-compatible GUIDs from build seed plus semantic entity ID. Reject duplicate semantic IDs before writing files.

~~~ts
export type BuildSeed = { seed: string };

export function deriveGuid(build: BuildSeed, entityId: string): string {
  return uuidV5(entityId, uuidV5(build.seed, KF_BUILD_NAMESPACE));
}
~~~

- [ ] **Step 5: Implement page and control compilation**

Deep-clone reviewed templates, apply only schema-approved overrides, generate runtime fields, create page manager entries, create variable files, and serialize with stable key ordering.

- [ ] **Step 6: Implement restricted action compilation**

Support only explicitly defined actions such as setVariable, navigatePage, and openDialog. Reject raw JavaScript in the default path with MODEL_OUTPUT_INVALID.

- [ ] **Step 7: Implement sanitized preview**

Render a self-contained HTML preview from IR, escape all text, use no remote assets, prohibit script tags, and apply a Content Security Policy suitable for iframe srcdoc.

- [ ] **Step 8: Verify compiler and preview**

Run: cd agent-app && pnpm --filter @kf/domain-client test && pnpm typecheck

Expected: deterministic hashes, valid preview escaping, and all tests PASS.

- [ ] **Step 9: Commit**

~~~bash
git add agent-app/packages/domain-client/src/compile agent-app/packages/domain-client/src/preview agent-app/tests/fixtures/client-ir
git commit -m "feat: compile and preview client projects deterministically"
~~~

---

### Task 7: Change Planner Contracts, Lossless Patcher, and Validator

**Files:**
- Create: agent-app/packages/domain-client/src/patch/client-patcher.ts
- Create: agent-app/packages/domain-client/src/patch/change-scope.ts
- Create: agent-app/packages/domain-client/src/patch/client-patcher.test.ts
- Create: agent-app/packages/domain-client/src/validate/client-validator.ts
- Create: agent-app/packages/domain-client/src/validate/client-validator.test.ts
- Create: agent-app/packages/domain-client/src/validate/report.ts

**Interfaces:**
- Consumes: base ClientWorkspace, confirmed ChangePlan, planHash.
- Produces: applyClientPatch(base, plan): ClientWorkspace and validateClientProject(base, candidate, plan): ValidationReport.

- [ ] **Step 1: Write field-level preservation tests**

~~~ts
it("changes only the confirmed field and preserves unknown content", async () => {
  const candidate = await applyClientPatch(base, {
    operations: [{
      action: "update",
      entityType: "control",
      entityId: "button-guid-1",
      changes: [{ path: "/backgroundColor", value: "#ff0000" }]
    }]
  });
  expect(await controlField(candidate, "button-guid-1", "backgroundColor")).toBe("#ff0000");
  expect(await controlField(candidate, "button-guid-1", "customFutureField")).toEqual({ keep: true });
});
~~~

- [ ] **Step 2: Write validator failure tests**

Test duplicate GUID, missing variable reference, unknown uiModelType, page geometry outside bounds, unconfirmed delete, changed file outside scope, malformed script action, and package round-trip mismatch.

- [ ] **Step 3: Run tests and verify failure**

Run: cd agent-app && pnpm --filter @kf/domain-client test -- client-patcher client-validator

Expected: FAIL because patcher and validator are missing.

- [ ] **Step 4: Implement JSON-pointer field patches**

Permit only allowlisted paths per entity type. Locate entities by GUID. Add operations compile a complete entity from templates. Delete operations require destructiveConfirmed=true and a matching operation digest.

- [ ] **Step 5: Implement change-scope hashing**

Hash every base file before patching, track touched JSON pointers, and compare candidate files after patching. Report any changed file or field not represented by the confirmed plan.

- [ ] **Step 6: Implement six-layer validation**

Return checks for packageStructure, jsonSchema, references, businessRules, changeScope, and roundTrip. status is pass only if every required check passes; warnings never override failures.

- [ ] **Step 7: Verify tests and commit**

Run: cd agent-app && pnpm --filter @kf/domain-client test && pnpm typecheck

~~~bash
git add agent-app/packages/domain-client/src/patch agent-app/packages/domain-client/src/validate
git commit -m "feat: add lossless client patching and validation"
~~~

---

### Task 8: PostgreSQL Schema, Local Authentication, and Tenant Isolation

**Files:**
- Create: agent-app/prisma/schema.prisma
- Create: agent-app/apps/api/src/auth/auth.module.ts
- Create: agent-app/apps/api/src/auth/password.service.ts
- Create: agent-app/apps/api/src/auth/session.service.ts
- Create: agent-app/apps/api/src/auth/auth.controller.ts
- Create: agent-app/apps/api/src/auth/tenant.guard.ts
- Create: agent-app/apps/api/src/auth/auth.integration.test.ts
- Create: agent-app/apps/api/src/users/users.service.ts
- Create: agent-app/apps/api/src/tenants/tenants.service.ts

**Interfaces:**
- Consumes: PostgreSQL DATABASE_URL and SESSION_SECRET.
- Produces: authenticated SessionPrincipal, tenant-scoped request context, platform_admin/tenant_admin/member authorization.

- [ ] **Step 1: Define the Prisma schema**

Create Tenant, User, UserSession, SolutionWorkspace, Conversation, Message, ChangeRequest, ChangePlan, SolutionRevision, DomainProjectRevision, BuildJob, Artifact, ValidationReport, and AuditLog. Every tenant business model contains tenantId. Add unique indexes for tenant-scoped names and job idempotency keys.

Use these key relations and constraints:

~~~prisma
model Tenant {
  id         String              @id @default(uuid())
  name       String              @unique
  users      User[]
  workspaces SolutionWorkspace[]
  createdAt  DateTime            @default(now())
}

model User {
  id                 String        @id @default(uuid())
  tenantId           String
  tenant             Tenant        @relation(fields: [tenantId], references: [id])
  username           String
  passwordHash       String
  role               UserRole
  mustChangePassword Boolean       @default(true)
  lockedUntil        DateTime?
  sessions           UserSession[]
  @@unique([tenantId, username])
}

model BuildJob {
  id              String   @id @default(uuid())
  tenantId        String
  workspaceId     String
  baseRevisionId  String
  changePlanId    String
  planHash        String
  domainKind      String
  idempotencyKey  String   @unique
  status          JobStatus
  leaseOwner      String?
  leaseExpiresAt  DateTime?
  attemptCount    Int      @default(0)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@index([status, leaseExpiresAt])
  @@index([tenantId, workspaceId])
}
~~~

Define enums UserRole and JobStatus and apply the same tenant indexes to conversations, revisions, artifacts, validation reports, and audit logs.

- [ ] **Step 2: Write failing authentication integration tests**

Use a test PostgreSQL database. Test temporary password login, mandatory first password change, Argon2id verification, Secure HttpOnly SameSite cookie attributes, session revocation after password change, failed-login lockout, and tenant boundary denial.

~~~ts
it("revokes prior sessions after a password change", async () => {
  const cookie = await loginWithTemporaryPassword(app, seededUser);
  await request(app.getHttpServer())
    .post("/api/auth/change-password")
    .set("Cookie", cookie)
    .send({ currentPassword: "TempPass-123", newPassword: "NewPass-456" })
    .expect(204);
  await request(app.getHttpServer())
    .get("/api/me")
    .set("Cookie", cookie)
    .expect(401);
});
~~~

- [ ] **Step 3: Run migration and tests to verify failure**

Run: cd agent-app && pnpm prisma migrate dev --name init && pnpm --filter api test -- auth.integration

Expected: database migration succeeds; tests FAIL because services/controllers are missing.

- [ ] **Step 4: Implement password and session services**

Use Argon2id with library defaults reviewed in tests, store only hashes, generate opaque 256-bit session tokens, store token hashes in PostgreSQL, rotate on login, expire inactive sessions, and revoke all sessions on password reset.

~~~ts
export type SessionPrincipal = {
  userId: string;
  tenantId: string;
  role: "platform_admin" | "tenant_admin" | "member";
  sessionId: string;
};
~~~

- [ ] **Step 5: Implement closed account provisioning**

Platform admin creates Tenant plus initial tenant_admin and one-time password. Tenant admin creates member accounts inside the same tenant. No public registration route exists.

- [ ] **Step 6: Implement tenant guard and role decorators**

Resolve tenantId exclusively from the authenticated session and route resource; never trust a request-body tenantId. Return 404 for cross-tenant object lookups to avoid resource enumeration.

- [ ] **Step 7: Verify auth tests and commit**

Run: cd agent-app && pnpm --filter api test -- auth.integration && pnpm typecheck

~~~bash
git add agent-app/prisma agent-app/apps/api/src/auth agent-app/apps/api/src/users agent-app/apps/api/src/tenants
git commit -m "feat: add local authentication and tenant isolation"
~~~

---

### Task 9: Workspace, Revisions, Artifacts, and Durable Build Jobs

**Files:**
- Create: agent-app/apps/api/src/workspaces/workspace.service.ts
- Create: agent-app/apps/api/src/revisions/revision.service.ts
- Create: agent-app/apps/api/src/artifacts/artifact.service.ts
- Create: agent-app/apps/api/src/build-jobs/build-job.service.ts
- Create: agent-app/apps/api/src/build-jobs/build-job.integration.test.ts
- Create: agent-app/apps/worker/src/job-runner.ts
- Create: agent-app/apps/worker/src/job-runner.integration.test.ts

**Interfaces:**
- Consumes: Prisma client, ArtifactStorage, DomainRegistry, confirmed planHash.
- Produces: createWorkspace(), createSourceRevision(), enqueueBuild(), leaseNextJob(), completeBuild().

- [ ] **Step 1: Write revision immutability tests**

Test that a successful revision cannot be updated or deleted through services, a rollback creates a new revision referencing the historical revision, and currentRevisionId advances only after validation pass.

- [ ] **Step 2: Write build idempotency and lease tests**

~~~ts
it("returns the existing job for the same idempotency key", async () => {
  const first = await jobs.enqueue(input);
  const second = await jobs.enqueue(input);
  expect(second.id).toBe(first.id);
});

it("allows recovery only after a lease expires", async () => {
  const leased = await jobs.leaseNext("worker-a", now);
  expect(await jobs.leaseNext("worker-b", now)).toBeNull();
  expect((await jobs.leaseNext("worker-b", afterLease)).id).toBe(leased.id);
});
~~~

- [ ] **Step 3: Run tests and verify failure**

Run: cd agent-app && pnpm --filter api test -- build-job.integration && pnpm --filter worker test

Expected: FAIL because services and worker runner do not exist.

- [ ] **Step 4: Implement workspace and source revision creation**

New flow starts from an empty solution revision. Upload flow stores the source .gz, imports it into a read-only workspace, inspects it, and creates Source Revision 1.

- [ ] **Step 5: Implement durable BuildJob leasing**

Use a transaction with row locking, leaseOwner, leaseExpiresAt, attemptCount, and terminal states. Bind input to tenantId, workspaceId, baseRevisionId, changePlanId, planHash, domainKind, and idempotencyKey.

- [ ] **Step 6: Implement worker execution**

Worker resolves DomainPack, creates a candidate copy, compiles or patches, validates, packages, writes artifacts atomically, and in one transaction creates the new revision plus marks the job SUCCEEDED. On failure, retain diagnostic metadata but do not advance currentRevisionId.

- [ ] **Step 7: Verify crash recovery**

Simulate worker termination after artifact write but before database completion. Retry with the same idempotency key and assert one successful revision and one final artifact.

- [ ] **Step 8: Commit**

~~~bash
git add agent-app/apps/api/src/workspaces agent-app/apps/api/src/revisions agent-app/apps/api/src/artifacts agent-app/apps/api/src/build-jobs agent-app/apps/worker
git commit -m "feat: add immutable revisions and durable build jobs"
~~~

---

### Task 10: LangGraph Single-Agent Solution Workflow

**Files:**
- Create: agent-app/packages/agent-orchestrator/src/state.ts
- Create: agent-app/packages/agent-orchestrator/src/model-port.ts
- Create: agent-app/packages/agent-orchestrator/src/schemas/intent.ts
- Create: agent-app/packages/agent-orchestrator/src/schemas/project-design.ts
- Create: agent-app/packages/agent-orchestrator/src/schemas/change-plan.ts
- Create: agent-app/packages/agent-orchestrator/src/nodes/load-context.ts
- Create: agent-app/packages/agent-orchestrator/src/nodes/classify-intent.ts
- Create: agent-app/packages/agent-orchestrator/src/nodes/plan-change.ts
- Create: agent-app/packages/agent-orchestrator/src/nodes/approval.ts
- Create: agent-app/packages/agent-orchestrator/src/nodes/enqueue-build.ts
- Create: agent-app/packages/agent-orchestrator/src/solution-graph.ts
- Create: agent-app/packages/agent-orchestrator/src/solution-graph.test.ts

**Interfaces:**
- Consumes: ModelPort, workspace query port, change-plan repository, build-job port, Postgres checkpointer.
- Produces: compileSolutionGraph(deps), thread_id=conversationId, structured interrupts, resumable graph state.

- [ ] **Step 1: Define graph state and structured model ports**

Graph state contains tenantId, userId, workspaceId, conversationId, currentRevisionId, activeChangeRequestId, changePlanId, planHash, buildJobId, intent, stage, recentMessages, conversationSummary, and lastErrorCode. ModelPort exposes classifyIntent(), createProjectDesign(), createChangePlan(), reviseChangePlan(), and explainValidation().

~~~ts
export const AgentGraphState = new StateSchema({
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  workspaceId: z.string().min(1),
  conversationId: z.string().min(1),
  currentRevisionId: z.string().optional(),
  activeChangeRequestId: z.string().optional(),
  changePlanId: z.string().optional(),
  planHash: z.string().optional(),
  buildJobId: z.string().optional(),
  intent: IntentSchema.optional(),
  stage: StageSchema,
  recentMessages: z.array(MessageSchema),
  conversationSummary: z.string().optional(),
  lastErrorCode: z.string().optional()
});
~~~

- [ ] **Step 2: Write failing graph tests using FakeModelPort**

Test ordinary question route, new requirement route, plan revision before confirmation, approval interrupt, rejection, planHash mismatch, confirmed build enqueue, build failure returning to planning, successful revision returning to idle, and a new requirement after success using the latest revision.

- [ ] **Step 3: Run tests and verify failure**

Run: cd agent-app && pnpm --filter @kf/agent-orchestrator test

Expected: FAIL because graph nodes are missing.

- [ ] **Step 4: Implement deterministic routing**

Use StateGraph with explicit conditional edges. The model classifies intent into QUESTION, NEW_REQUIREMENT, MODIFY_REQUIREMENT, CONFIRM_PLAN, CANCEL_PLAN, ROLLBACK, or BUILD. Unsupported domain requests create pendingRequirements and never enqueue a build.

- [ ] **Step 5: Implement approval interrupt**

Interrupt payload contains type, changeRequestId, planHash, summary, diffArtifactId, and previewArtifactId. Resume requires action approve/revise/cancel and exact planHash. Place all persistent side effects after approval or make them idempotent.

- [ ] **Step 6: Implement context limits**

Load recent messages plus rolling summary and the bounded current revision summary. Never include raw uploaded files, secrets, full page JSON, or untrusted script text as instructions.

- [ ] **Step 7: Add Postgres checkpoint integration test**

Start a thread, stop at approval, destroy the graph instance, recreate it with PostgresSaver, resume with Command, and assert the same conversation continues.

- [ ] **Step 8: Verify and commit**

Run: cd agent-app && pnpm --filter @kf/agent-orchestrator test && pnpm typecheck

~~~bash
git add agent-app/packages/agent-orchestrator
git commit -m "feat: add resumable LangGraph solution workflow"
~~~

---

### Task 11: HTTP/SSE API, Upload, Confirmation, and Download

**Files:**
- Create: agent-app/apps/api/src/app.module.ts
- Create: agent-app/apps/api/src/conversations/conversation.controller.ts
- Create: agent-app/apps/api/src/conversations/conversation.service.ts
- Create: agent-app/apps/api/src/workspaces/workspace.controller.ts
- Create: agent-app/apps/api/src/artifacts/artifact.controller.ts
- Create: agent-app/apps/api/src/build-jobs/build-job.controller.ts
- Create: agent-app/apps/api/src/audit/audit.service.ts
- Create: agent-app/apps/api/src/api.integration.test.ts

**Interfaces:**
- Consumes: authenticated principal, SolutionGraph, workspace/revision/artifact/build services.
- Produces: REST endpoints, SSE event stream, short-lived authorized downloads, audit events.

- [ ] **Step 1: Write API contract tests**

Cover POST /api/workspaces, POST /api/workspaces/:id/uploads, POST /api/conversations, POST /api/conversations/:id/messages, POST /api/conversations/:id/resume, GET /api/workspaces/:id/revisions, GET /api/build-jobs/:id, GET /api/artifacts/:id/download, and DELETE /api/workspaces/:id.

~~~ts
it("requires the displayed plan hash when resuming approval", async () => {
  await request(server)
    .post("/api/conversations/conversation-1/resume")
    .set("Cookie", memberCookie)
    .send({ action: "approve", planHash: "wrong-hash" })
    .expect(409)
    .expect(({ body }) => {
      expect(body.error.code).toBe("PLAN_HASH_MISMATCH");
    });
});
~~~

- [ ] **Step 2: Assert security behavior first**

Tests must prove unauthenticated requests return 401, cross-tenant IDs return 404, oversized uploads return 413, unsupported containers return PACKAGE_UNSUPPORTED, and artifact downloads require an active session plus matching tenant.

- [ ] **Step 3: Run tests and verify failure**

Run: cd agent-app && pnpm --filter api test -- api.integration

Expected: FAIL because controllers are missing.

- [ ] **Step 4: Implement upload streaming**

Stream directly to ArtifactStorage with a strict byte limit and content sniffing; do not buffer the package in memory. Create the source revision only after safe import and inspection succeeds.

- [ ] **Step 5: Implement message and resume endpoints**

Message endpoint invokes the graph with conversationId as thread_id. Resume endpoint accepts approve/revise/cancel plus planHash. Return interrupt payloads as normal API data and stream model tokens and state changes through SSE.

- [ ] **Step 6: Implement authorized downloads**

Return a short-lived single-use download token bound to userId, tenantId, artifactId, and expiration. The file route revalidates all bindings before streaming.

- [ ] **Step 7: Add audit events**

Record login, logout, tenant/user creation, upload, plan confirmation, destructive confirmation, build start/result, download, workspace deletion, and platform-admin content access.

- [ ] **Step 8: Verify and commit**

Run: cd agent-app && pnpm --filter api test && pnpm typecheck

~~~bash
git add agent-app/apps/api/src
git commit -m "feat: expose secure agent workflow API"
~~~

---

### Task 12: Vue Web Application and Full Acceptance Suite

**Files:**
- Create: agent-app/apps/web/src/main.ts
- Create: agent-app/apps/web/src/router.ts
- Create: agent-app/apps/web/src/stores/session.ts
- Create: agent-app/apps/web/src/stores/workspace.ts
- Create: agent-app/apps/web/src/views/LoginView.vue
- Create: agent-app/apps/web/src/views/WorkspaceView.vue
- Create: agent-app/apps/web/src/components/ConversationPanel.vue
- Create: agent-app/apps/web/src/components/ProjectTree.vue
- Create: agent-app/apps/web/src/components/ChangePlanPanel.vue
- Create: agent-app/apps/web/src/components/PreviewFrame.vue
- Create: agent-app/apps/web/src/components/RevisionList.vue
- Create: agent-app/apps/web/src/components/ValidationReport.vue
- Create: agent-app/apps/web/src/components/ArtifactDownload.vue
- Create: agent-app/apps/web/src/components/WorkspaceView.test.ts
- Create: agent-app/tests/e2e/new-project.spec.ts
- Create: agent-app/tests/e2e/modify-project.spec.ts
- Create: agent-app/tests/e2e/tenant-isolation.spec.ts
- Create: agent-app/docs/kf-native-acceptance.md
- Create: agent-app/docker-compose.yml

**Interfaces:**
- Consumes: Task 11 API/SSE contracts.
- Produces: login, solution workspace, continuous conversation, upload, preview, confirmation, revision history, validation report, and download UX.

- [ ] **Step 1: Write component tests**

Test login-required routing, create/upload entry choices, conversation streaming, plan approval disabled when planHash is absent, destructive operation warning, sanitized iframe preview, failed validation display, revision switching, and download button availability only for successful artifacts.

~~~ts
it("disables approval until a plan hash is present", async () => {
  const wrapper = mount(ChangePlanPanel, {
    props: { plan: confirmedPlanSummary, planHash: undefined }
  });
  expect(wrapper.get('[data-testid="approve-plan"]').attributes("disabled")).toBeDefined();
});

it("never renders model output through v-html", async () => {
  const wrapper = mount(ConversationPanel, {
    props: { messages: [{ role: "assistant", content: "<img src=x onerror=alert(1)>" }] }
  });
  expect(wrapper.html()).not.toContain("onerror=");
});
~~~

- [ ] **Step 2: Run component tests and verify failure**

Run: cd agent-app && pnpm --filter web test

Expected: FAIL because views and components are missing.

- [ ] **Step 3: Implement the workspace shell**

Use a solution tree whose first child is 客户端工程. Display unsupported registered domains as disabled capabilities rather than empty editors. Keep conversation, plan/diff, preview, revisions, and report visible without navigating away.

- [ ] **Step 4: Implement confirmation UX**

Show plan summary, exact create/update/delete operations, warnings, preview, and planHash. Approval sends the displayed planHash. Any new user requirement clears the local approval state.

- [ ] **Step 5: Implement safe preview and downloads**

Use sandboxed iframe without allow-scripts for generated HTML. Never use v-html for model output. Download only through authorized artifact endpoint.

- [ ] **Step 6: Write end-to-end new-project test**

Log in with a seeded tenant member, create a workspace, submit a deterministic fake-model request, revise the plan, approve, wait for worker completion, assert validation pass, download .gz, unpack it in the test, and verify required client project files.

- [ ] **Step 7: Write end-to-end uploaded-project modification test**

Upload the minimal native .gz, request one button color change, approve, download the result, and byte-compare all files/fields outside the confirmed patch. Assert customFutureField remains unchanged.

- [ ] **Step 8: Write tenant and security E2E tests**

Prove a second tenant cannot list, view, resume, download, or delete the first tenant's workspace. Upload path-traversal and zip-bomb fixtures and assert rejection without workspace creation.

- [ ] **Step 9: Add Docker Compose and run the full automated suite**

Compose services: postgres, api, worker, web. Mount a private artifacts volume. Run:

~~~bash
cd agent-app
docker compose up -d postgres
pnpm prisma migrate deploy
pnpm test
pnpm typecheck
pnpm lint
pnpm exec playwright test
~~~

Expected: all commands PASS.

- [ ] **Step 10: Execute and record KF native acceptance**

Use agent-app/docs/kf-native-acceptance.md to record for both a generated project and modified project:

~~~text
Agent build → native KF import → open project → open pages
→ inspect controls/variables/scripts → save → native export → re-import
~~~

Record package hashes, test-server build identifier, importer result, editor result, re-export result, and screenshots. Mark kingclient supported=true only after every required row passes.

- [ ] **Step 11: Commit**

~~~bash
git add agent-app/apps/web agent-app/tests/e2e agent-app/docs agent-app/docker-compose.yml
git commit -m "feat: complete KF solution agent MVP"
~~~

---

## Spec Coverage Map

| Approved design area | Implemented by |
|---|---|
| Modular monorepo, Vue, NestJS, PostgreSQL, Worker | Tasks 1, 8, 9, 11, 12 |
| Open Domain Registry and solution-level model | Task 2 |
| SDB inventory, secret scanning, sanitization, Golden Samples | Task 3 |
| Private artifacts and safe native .gz handling | Task 4 |
| Client IR, templates, Inspector, unknown-field preservation | Task 5 |
| Deterministic new-project compilation and preview | Task 6 |
| Lossless modification, destructive confirmation, six-layer validation | Task 7 |
| Closed account provisioning, sessions, roles, tenant isolation | Task 8 |
| Immutable Revision, rollback, idempotent build jobs, crash recovery | Task 9 |
| Single Agent, LangGraph persistence, interrupts, continuous requirements | Task 10 |
| Upload, SSE, resume, short-lived downloads, audit | Task 11 |
| Customer UI, revision history, reports, E2E, native KF acceptance | Task 12 |

No task enables customer-machine connectivity, online KF mutation, unsupported Domain Packs, multi-Agent orchestration, or runtime publication.

## Final Verification Gate

Before calling the MVP complete:

- [ ] Run cd agent-app && pnpm test and confirm zero failures.
- [ ] Run cd agent-app && pnpm typecheck and confirm zero errors.
- [ ] Run cd agent-app && pnpm lint and confirm zero errors.
- [ ] Run cd agent-app && pnpm exec playwright test and confirm new, modify, tenant, and upload-security flows pass.
- [ ] Verify no raw-corpus, sanitized secrets, customer project names, IPs, connection strings, passwords, or tokens are Git-tracked.
- [ ] Verify the same IR and seed produce the same native package SHA-256.
- [ ] Verify a field-level modification changes only the confirmed file paths and JSON pointers.
- [ ] Verify failed builds do not advance currentRevisionId or replace successful artifacts.
- [ ] Verify LangGraph resumes an approval after process restart using PostgreSQL checkpoints.
- [ ] Verify generated and modified .gz packages complete the native KF import/open/save/export/re-import cycle.
- [ ] Verify Domain Registry reports kingclient supported=true only after native acceptance and reports all other registered domains supported=false.
- [ ] Review every audit event required by the design.

## Deferred Work, Excluded from This Plan

- Customer-side connector and public-IP communication.
- Online KF modification, backup, rollback, publication, deployment, and runtime verification.
- Calculation, data-source, acquisition, alarm, and other Domain Pack implementations.
- Cross-domain Symbol Registry and multi-package solution bundles.
- Supervisor plus domain-specific multi-agent orchestration.
- Multi-version KF compatibility.
