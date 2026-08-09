# KF Domain Build Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the BuildExecutor's hard-coded KingClient pipeline with a real, domain-neutral DomainPack contract while preserving existing KingClient build behavior.

**Architecture:** `@kf/contracts` defines runtime-neutral domain execution inputs and outputs. `@kf/domain-client` implements those ports by adapting the existing importer, inspector, compiler, patcher, validator, and packager. `@kf/build-jobs` resolves a pack from `DomainRegistry` and owns only job state, artifact storage, and transactional revision completion.

**Tech Stack:** TypeScript 5.9, Node.js 24, Zod 4, Vitest 3, Prisma 6, pnpm workspace, existing `@kf/domain-*` packages.

## Global Constraints

- Work from the approved design at `docs/superpowers/specs/2026-08-09-kf-solution-agent-evolution-design.md`.
- Phase 1 activates only `kingclient`; register `kingcalculation`, `kingdbconnector`, `kingioserver`, and `kingalarm` as metadata with `supported: false`.
- Do not connect to a customer machine, deploy, publish, or start a KF runtime.
- Preserve the existing create, upload/modify, preview, validation, artifact, and revision behavior.
- A retry with the same IR, plan, and workspace seed must remain deterministic.
- The Agent never receives compile, patch, package, artifact, or revision methods as LangChain Tools.
- Unknown imported fields and controls must remain untouched by this refactor.
- Do not commit raw SDB projects, customer data, credentials, generated artifact directories, or screenshots.
- The current working tree contains user changes. At execution time, use `superpowers:using-git-worktrees` or explicitly preserve and reconcile those changes; never reset or overwrite them.
- Use tests first, run `git diff --check` before every commit, and make one focused commit per task.

---

## File Structure

### New files

- `agent-app/packages/contracts/src/domain.test.ts` — executable examples and schema tests for domain metadata and pack outputs.
- `agent-app/packages/domain-client/src/domain-pack/king-client-domain-pack.ts` — the only adapter that maps generic DomainPack calls to KingClient functions.
- `agent-app/packages/domain-client/src/domain-pack/king-client-domain-pack.test.ts` — adapter contract, deterministic package, and validation tests.
- `agent-app/apps/worker/src/domain-packs.ts` — production registry construction and future-domain metadata registration.
- `agent-app/apps/worker/src/domain-packs.test.ts` — worker registry publication-gate tests.

### Modified files

- `agent-app/packages/contracts/src/domain.ts` — domain execution types, artifact descriptor, and DomainPack interface.
- `agent-app/packages/contracts/src/index.ts` — exports the new contracts.
- `agent-app/packages/domain-registry/src/domain-registry.ts` — indexes packs by `pack.metadata.kind`.
- `agent-app/packages/domain-registry/src/domain-registry.test.ts` — new interface and unsupported metadata behavior.
- `agent-app/packages/domain-client/src/index.ts` — exports the real KingClientDomainPack factory.
- `agent-app/packages/build-jobs/src/job-executor.ts` — delegates import/compile/patch/validate/package to the selected pack.
- `agent-app/packages/build-jobs/package.json` — removes the direct `@kf/domain-client` dependency.
- `agent-app/apps/worker/src/run.ts` — uses `createWorkerDomainRegistry()`.
- `agent-app/apps/worker/src/job-runner.integration.test.ts` — registers a real or explicit fake pack under the new contract.
- `agent-app/apps/api/src/build-jobs/build-job.integration.test.ts` — updates pack setup without changing API behavior.

## Stable Interfaces Produced by This Plan

```ts
export interface DomainWorkspace {
  id: string;
  rootDir: string;
  mode: "base" | "candidate";
}

export interface PackagedDomainArtifact {
  artifactKind: string;
  domainProjectKind: string;
  mediaType: string;
  fileExtension: string;
  bytes: Uint8Array;
}

export interface DomainPack {
  readonly metadata: DomainMetadata;
  importPackage(input: DomainImportInput): Promise<DomainWorkspace>;
  inspect(input: DomainInspectInput): Promise<unknown>;
  compile(input: DomainCompileInput): Promise<DomainWorkspace>;
  patch(input: DomainPatchInput): Promise<DomainWorkspace>;
  validate(input: DomainValidateInput): Promise<ValidationReport>;
  package(input: DomainPackageInput): Promise<PackagedDomainArtifact>;
}

export function createKingClientDomainPack(options: {
  nativeAccepted: boolean;
}): DomainPack;

export function createWorkerDomainRegistry(options: {
  kingClientNativeAccepted: boolean;
}): DomainRegistry;
```

---

### Task 1: Define the Domain Execution Contract

**Files:**
- Create: `agent-app/packages/contracts/src/domain.test.ts`
- Modify: `agent-app/packages/contracts/src/domain.ts`
- Modify: `agent-app/packages/contracts/src/index.ts`

**Interfaces:**
- Consumes: existing `ValidationReport` from `@kf/contracts`.
- Produces: `domainMetadataSchema`, `DomainWorkspace`, `DomainImportInput`, `DomainInspectInput`, `DomainCompileInput`, `DomainPatchInput`, `DomainValidateInput`, `DomainPackageInput`, `PackagedDomainArtifact`, and `DomainPack`.

- [ ] **Step 1: Write failing metadata and pack contract tests**

Create `domain.test.ts` with concrete runtime and compile-time examples:

```ts
import { describe, expect, it } from "vitest";
import {
  domainMetadataSchema,
  type DomainPack,
  type DomainWorkspace,
} from "./domain.js";

const workspace: DomainWorkspace = {
  id: "workspace-1",
  rootDir: "/tmp/workspace-1",
  mode: "candidate",
};

describe("domain execution contracts", () => {
  it("accepts metadata for a reserved unsupported domain", () => {
    expect(domainMetadataSchema.parse({
      kind: "kingcalculation",
      displayName: "KingFusion Calculation",
      supported: false,
      capabilities: {
        create: false,
        import: false,
        modify: false,
        validate: false,
        package: false,
      },
    }).kind).toBe("kingcalculation");
  });

  it("defines a pack whose artifact metadata is not client-specific", async () => {
    const pack: DomainPack = {
      metadata: {
        kind: "fake",
        displayName: "Fake",
        supported: true,
        capabilities: {
          create: true,
          import: true,
          modify: true,
          validate: true,
          package: true,
        },
      },
      importPackage: async () => ({ ...workspace, mode: "base" }),
      inspect: async () => ({ entities: [] }),
      compile: async () => workspace,
      patch: async () => workspace,
      validate: async () => ({
        status: "pass",
        checks: {
          packageStructure: "pass",
          jsonSchema: "pass",
          references: "pass",
          businessRules: "pass",
          changeScope: "pass",
          roundTrip: "pass",
        },
        warnings: [],
      }),
      package: async () => ({
        artifactKind: "fake-package",
        domainProjectKind: "fake-project",
        mediaType: "application/octet-stream",
        fileExtension: ".bin",
        bytes: new Uint8Array([1, 2, 3]),
      }),
    };

    expect((await pack.package({ workspace })).artifactKind).toBe("fake-package");
  });
});
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run:

```bash
cd agent-app
pnpm --filter @kf/contracts test -- src/domain.test.ts
```

Expected: TypeScript/Vitest fails because `domainMetadataSchema`, the input types, and the new DomainPack shape do not exist.

- [ ] **Step 3: Implement the domain schemas and execution types**

Replace the old function-shaped `DomainPack` section in `domain.ts` with this explicit contract:

```ts
import { z } from "zod";
import type { ValidationReport } from "./validation.js";

export type DomainKind = string;

export const domainCapabilitiesSchema = z.object({
  create: z.boolean(),
  import: z.boolean(),
  modify: z.boolean(),
  validate: z.boolean(),
  package: z.boolean(),
});
export type DomainCapabilities = z.infer<typeof domainCapabilitiesSchema>;

export const domainMetadataSchema = z.object({
  kind: z.string().min(1),
  displayName: z.string().min(1),
  supported: z.boolean(),
  capabilities: domainCapabilitiesSchema,
});
export type DomainMetadata = z.infer<typeof domainMetadataSchema>;

export interface DomainWorkspace {
  id: string;
  rootDir: string;
  mode: "base" | "candidate";
}

export interface DomainImportInput {
  bytes: Uint8Array;
  workRoot?: string;
}

export interface DomainInspectInput {
  workspace: DomainWorkspace;
}

export interface DomainCompileInput {
  projectIr: unknown;
  buildSeed: string;
  workRoot?: string;
}

export interface DomainPatchInput {
  baseWorkspace: DomainWorkspace;
  changePlan: unknown;
  expectedPlanHash: string;
  workRoot?: string;
}

export interface DomainValidateInput {
  baseWorkspace: DomainWorkspace;
  candidateWorkspace: DomainWorkspace;
  changePlan: unknown;
}

export interface DomainPackageInput {
  workspace: DomainWorkspace;
}

export interface PackagedDomainArtifact {
  artifactKind: string;
  domainProjectKind: string;
  mediaType: string;
  fileExtension: string;
  bytes: Uint8Array;
}

export interface DomainPack {
  readonly metadata: DomainMetadata;
  importPackage(input: DomainImportInput): Promise<DomainWorkspace>;
  inspect(input: DomainInspectInput): Promise<unknown>;
  compile(input: DomainCompileInput): Promise<DomainWorkspace>;
  patch(input: DomainPatchInput): Promise<DomainWorkspace>;
  validate(input: DomainValidateInput): Promise<ValidationReport>;
  package(input: DomainPackageInput): Promise<PackagedDomainArtifact>;
}
```

Keep `DomainSubgraphPort` exported for future domain planning, but do not attach it to the execution pack in this task. Export all symbols through `src/index.ts` via the existing `export * from "./domain.js"`.

- [ ] **Step 4: Run contract tests and typecheck**

Run:

```bash
cd agent-app
pnpm --filter @kf/contracts test -- src/domain.test.ts
pnpm --filter @kf/contracts typecheck
```

Expected: both commands pass.

- [ ] **Step 5: Commit the domain contract**

```bash
git add agent-app/packages/contracts/src/domain.ts \
  agent-app/packages/contracts/src/domain.test.ts \
  agent-app/packages/contracts/src/index.ts
git diff --cached --check
git commit -m "refactor(contracts): define domain build execution ports"
```

---

### Task 2: Adapt DomainRegistry to Metadata-Backed Packs

**Files:**
- Modify: `agent-app/packages/domain-registry/src/domain-registry.ts`
- Modify: `agent-app/packages/domain-registry/src/domain-registry.test.ts`

**Interfaces:**
- Consumes: `DomainPack.metadata` and `DomainMetadata` from Task 1.
- Produces: unchanged public methods `register`, `registerMetadata`, `require`, `metadata`, `has`, and `kinds`, now indexed by `pack.metadata.kind`.

- [ ] **Step 1: Rewrite the registry tests for the new pack shape**

Replace the test fixture with a `DomainPack` that has `metadata`, then add assertions that a pack can be executable even when its publication flag is false:

```ts
it("returns a registered pack even when native publication is not accepted", () => {
  const registry = new DomainRegistry();
  registry.register({
    ...clientPack,
    metadata: { ...clientPack.metadata, supported: false },
  });

  expect(registry.require("kingclient").metadata.supported).toBe(false);
});

it("rejects require for metadata-only future domains", () => {
  const registry = new DomainRegistry();
  registry.registerMetadata(futureCalculationMetadata);
  expect(() => registry.require("kingcalculation"))
    .toThrow("domain not supported: kingcalculation");
});
```

Keep duplicate registration and `metadata()` coverage.

- [ ] **Step 2: Run the registry tests and verify they fail**

Run:

```bash
cd agent-app
pnpm --filter @kf/domain-registry test -- src/domain-registry.test.ts
```

Expected: failures reference `pack.kind` or the missing `metadata` layout.

- [ ] **Step 3: Update registry indexing without changing support semantics**

Implement:

```ts
register(pack: DomainPack): void {
  const kind = pack.metadata.kind;
  if (this.#entries.has(kind)) {
    throw new Error(`domain already registered: ${kind}`);
  }
  this.#entries.set(kind, { type: "pack", pack });
}

metadata(kind: DomainKind): DomainMetadata {
  const entry = this.#entries.get(kind);
  if (!entry) throw new Error(`domain not registered: ${kind}`);
  return entry.type === "pack" ? entry.pack.metadata : entry.metadata;
}
```

`require()` must continue returning a registered pack regardless of `metadata.supported`; that flag records native publication acceptance, not whether the internal test pipeline can execute.

- [ ] **Step 4: Run registry tests and typecheck**

```bash
cd agent-app
pnpm --filter @kf/domain-registry test -- src/domain-registry.test.ts
pnpm --filter @kf/domain-registry typecheck
```

Expected: pass.

- [ ] **Step 5: Commit registry adaptation**

```bash
git add agent-app/packages/domain-registry/src/domain-registry.ts \
  agent-app/packages/domain-registry/src/domain-registry.test.ts
git diff --cached --check
git commit -m "refactor(domain-registry): index packs by domain metadata"
```

---

### Task 3: Implement the Real KingClientDomainPack

**Files:**
- Create: `agent-app/packages/domain-client/src/domain-pack/king-client-domain-pack.ts`
- Create: `agent-app/packages/domain-client/src/domain-pack/king-client-domain-pack.test.ts`
- Modify: `agent-app/packages/domain-client/src/index.ts`

**Interfaces:**
- Consumes: the DomainPack ports from Task 1 and existing `importNativeClientPackage`, `inspectClientProject`, `compileClientProject`, `applyClientPatch`, `validateClientProject`, and `packageNativeClientProject`.
- Produces: `createKingClientDomainPack({ nativeAccepted }): DomainPack`.

- [ ] **Step 1: Write failing adapter tests**

Create a minimal IR fixture in the test and assert the complete adapter cycle:

```ts
const ir = {
  schema: "kf-client-project-ir/v1" as const,
  id: "client-1",
  name: "Client One",
  version: "1.0.0.1",
  pages: [{
    id: "page-1",
    name: "Page1",
    controls: [{
      id: "Title",
      type: "text" as const,
      x: 10,
      y: 10,
      width: 200,
      height: 40,
      text: "Title",
    }],
  }],
};

it("compiles, patches, validates, and packages through DomainPack", async () => {
  const pack = createKingClientDomainPack({ nativeAccepted: false });
  const base = await pack.compile({
    projectIr: ir,
    buildSeed: "workspace-1",
  });
  const changePlan = {
    schema: "kf-change-plan/v1",
    workspaceId: "workspace-1",
    operations: [],
  };
  const hash = planHash(changePlan);
  const candidate = await pack.patch({
    baseWorkspace: base,
    changePlan,
    expectedPlanHash: hash,
  });
  const report = await pack.validate({
    baseWorkspace: base,
    candidateWorkspace: candidate,
    changePlan,
  });
  const artifact = await pack.package({ workspace: candidate });

  expect(pack.metadata.kind).toBe("kingclient");
  expect(pack.metadata.supported).toBe(false);
  expect(report.status).toBe("pass");
  expect(artifact.artifactKind).toBe("client-package");
  expect(artifact.domainProjectKind).toBe("client-package");
  expect(artifact.fileExtension).toBe(".gz");
  expect(artifact.bytes.byteLength).toBeGreaterThan(0);
});
```

Add a second test that packages, imports through `pack.importPackage()`, and inspects the imported workspace.

- [ ] **Step 2: Run the adapter test and verify it fails**

```bash
cd agent-app
pnpm --filter @kf/domain-client test -- src/domain-pack/king-client-domain-pack.test.ts
```

Expected: module or factory not found.

- [ ] **Step 3: Implement a thin adapter over existing deterministic functions**

The factory must validate external inputs at the adapter edge and never duplicate compiler logic:

```ts
export function createKingClientDomainPack(options: {
  nativeAccepted: boolean;
}): DomainPack {
  return {
    metadata: {
      kind: "kingclient",
      displayName: "KingFusion Client",
      supported: options.nativeAccepted,
      capabilities: {
        create: true,
        import: true,
        modify: true,
        validate: true,
        package: true,
      },
    },

    async importPackage({ bytes, workRoot }) {
      const destination = await mkdtemp(path.join(workRoot ?? tmpdir(), "kf-client-base-"));
      const rootDir = await importNativeClientPackage(Buffer.from(bytes), destination);
      return { id: "imported-client", rootDir, mode: "base" };
    },

    async inspect({ workspace }) {
      return inspectClientProject(workspace.rootDir);
    },

    async compile({ projectIr, buildSeed }) {
      const parsed = ClientProjectIRSchema.parse(projectIr);
      const workspace = await compileClientProject(parsed, { seed: buildSeed });
      return { id: workspace.id, rootDir: workspace.rootDir, mode: "candidate" };
    },

    async patch({ baseWorkspace, changePlan, expectedPlanHash }) {
      const workspace = await applyClientPatch(baseWorkspace.rootDir, changePlan, {
        planHash: expectedPlanHash,
      });
      return { id: workspace.id, rootDir: workspace.rootDir, mode: "candidate" };
    },

    async validate({ baseWorkspace, candidateWorkspace, changePlan }) {
      return validateClientProject(
        baseWorkspace.rootDir,
        candidateWorkspace.rootDir,
        changePlan,
        { skipRoundTrip: false },
      );
    },

    async package({ workspace }) {
      const bytes = await packageNativeClientProject(workspace.rootDir);
      return {
        artifactKind: "client-package",
        domainProjectKind: "client-package",
        mediaType: "application/gzip",
        fileExtension: ".gz",
        bytes,
      };
    },
  };
}
```

If `importNativeClientPackage()` already returns the supplied destination rather than another path, preserve its actual return value. Export the factory from `src/index.ts`.

- [ ] **Step 4: Run adapter and existing domain-client tests**

```bash
cd agent-app
pnpm --filter @kf/domain-client test -- src/domain-pack/king-client-domain-pack.test.ts
pnpm --filter @kf/domain-client test
pnpm --filter @kf/domain-client typecheck
```

Expected: pass, including deterministic compiler and native package tests.

- [ ] **Step 5: Commit the KingClient adapter**

```bash
git add agent-app/packages/domain-client/src/domain-pack/king-client-domain-pack.ts \
  agent-app/packages/domain-client/src/domain-pack/king-client-domain-pack.test.ts \
  agent-app/packages/domain-client/src/index.ts
git diff --cached --check
git commit -m "feat(domain-client): add executable KingClient domain pack"
```

---

### Task 4: Make BuildExecutor Domain-Neutral

**Files:**
- Modify: `agent-app/packages/build-jobs/src/job-executor.ts`
- Modify: `agent-app/apps/api/src/build-jobs/build-job.integration.test.ts`
- Modify: `agent-app/packages/build-jobs/package.json`

**Interfaces:**
- Consumes: `DomainRegistry.require(job.domainKind): DomainPack` and all Task 1 pack methods.
- Produces: unchanged `BuildExecutor.execute(job): Promise<BuildJob>` behavior with no `@kf/domain-client` import.

- [ ] **Step 1: Write failing delegation tests in the existing database suite**

Import `createKingClientDomainPack` and `vi`, then add a `tracingPack()` helper beside the existing `clientPack()` helper:

```ts
function tracingPack(calls: string[]) {
  const real = createKingClientDomainPack({ nativeAccepted: true });
  return {
    ...real,
    compile: vi.fn(async (input) => {
      calls.push("compile");
      return real.compile(input);
    }),
    importPackage: vi.fn(async (input) => {
      calls.push("importPackage");
      return real.importPackage(input);
    }),
    patch: vi.fn(async (input) => {
      calls.push("patch");
      return real.patch(input);
    }),
    validate: vi.fn(async (input) => {
      calls.push("validate");
      return real.validate(input);
    }),
    package: vi.fn(async (input) => {
      calls.push("package");
      return real.package(input);
    }),
  };
}
```

Add a new-flow test using the existing `seedWorkspace`, `seedPlan`, `jobs`, `prisma`, and `storage` helpers:

```ts
it("delegates a new build to compile, patch, validate, and package", async () => {
  const calls: string[] = [];
  const pack = tracingPack(calls);
  const localRegistry = new DomainRegistry();
  localRegistry.register(pack);
  const { tenant, workspace } = await seedWorkspace("new");
  const { plan, hash } = await seedPlan(tenant.id, workspace.id);
  const input = seedInput({
    tenantId: tenant.id,
    workspaceId: workspace.id,
    baseRevisionId: workspace.currentRevisionId,
    changePlanId: plan.id,
    planHashValue: hash,
  });
  await jobs.enqueue(input);
  const leased = await jobs.leaseNext("domain-delegation", new Date());
  const executor = new BuildExecutor({ prisma, storage, registry: localRegistry });

  expect((await executor.execute(leased)).status).toBe("SUCCEEDED");
  expect(calls).toEqual(["compile", "patch", "validate", "package"]);
  expect(pack.compile).toHaveBeenCalledWith(expect.objectContaining({
    buildSeed: workspace.id,
  }));
  expect(pack.patch).toHaveBeenCalledWith(expect.objectContaining({
    expectedPlanHash: hash,
  }));
});
```

Add an upload-mode counterpart based on the existing `full build chain` setup and assert:

```ts
expect(calls).toEqual(["importPackage", "patch", "validate", "package"]);
expect(pack.compile).not.toHaveBeenCalled();
expect(pack.importPackage).toHaveBeenCalledWith(expect.objectContaining({
  bytes: expect.any(Uint8Array),
}));
```

- [ ] **Step 2: Run the focused test and verify it fails**

```bash
cd agent-app
pnpm --filter @kf/api test -- src/build-jobs/build-job.integration.test.ts
```

Expected: both new tests fail because BuildExecutor still invokes KingClient functions directly and the call arrays remain empty.

- [ ] **Step 3: Replace hard-coded imports with pack delegation**

Remove all imports from `@kf/domain-client`. Refactor candidate preparation to this shape:

```ts
const pack = this.#deps.registry.require(job.domainKind);
const planInput = plan.plan ?? {};

let baseWorkspace: DomainWorkspace;
if (baseRevision.kind === "initial") {
  baseWorkspace = await pack.compile({
    projectIr: baseRevision.state ?? {},
    buildSeed: job.workspaceId,
    workRoot: this.#deps.workRoot,
  });
} else {
  const packageBytes = await this.readBasePackage(
    job.tenantId,
    domainProject.packageUrl,
  );
  baseWorkspace = await pack.importPackage({
    bytes: packageBytes,
    workRoot: this.#deps.workRoot,
  });
}

const candidateWorkspace = await pack.patch({
  baseWorkspace,
  changePlan: planInput,
  expectedPlanHash: job.planHash,
  workRoot: this.#deps.workRoot,
});

const report = await pack.validate({
  baseWorkspace,
  candidateWorkspace,
  changePlan: planInput,
});

const packaged = await pack.package({ workspace: candidateWorkspace });
```

Keep the current behavior that a new flow compiles the initial IR and then applies the confirmed plan. Replace `unpackBase()` with `readBasePackage()` that only reads and returns `Uint8Array`; safe, domain-specific unpacking belongs to the pack.

Pass `packaged.artifactKind` to storage and `packaged.domainProjectKind` to `completeBuild`. Preserve lease recovery, validation failure, crash injection, currentRevisionId, and transaction behavior.

- [ ] **Step 4: Remove the forbidden package dependency**

Delete this entry from `agent-app/packages/build-jobs/package.json`:

```json
"@kf/domain-client": "workspace:*"
```

Run `pnpm install --lockfile-only` from `agent-app` only if pnpm reports that the workspace lockfile records this direct dependency; otherwise do not rewrite the lockfile.

- [ ] **Step 5: Run focused and integration tests**

```bash
cd agent-app
pnpm --filter @kf/api test -- src/build-jobs/build-job.integration.test.ts
pnpm --filter @kf/build-jobs typecheck
```

Expected: pass. A repository search must return no result:

```bash
rg -n '@kf/domain-client' packages/build-jobs
```

Expected: no output.

- [ ] **Step 6: Commit the domain-neutral executor**

```bash
git add agent-app/packages/build-jobs/src/job-executor.ts \
  agent-app/apps/api/src/build-jobs/build-job.integration.test.ts \
  agent-app/packages/build-jobs/package.json \
  agent-app/pnpm-lock.yaml
git diff --cached --check
git commit -m "refactor(build-jobs): delegate execution to domain packs"
```

If `pnpm-lock.yaml` did not change, omit it from `git add`.

---

### Task 5: Build the Production Worker Registry

**Files:**
- Create: `agent-app/apps/worker/src/domain-packs.ts`
- Create: `agent-app/apps/worker/src/domain-packs.test.ts`
- Modify: `agent-app/apps/worker/src/run.ts`

**Interfaces:**
- Consumes: `createKingClientDomainPack()` from Task 3 and `DomainRegistry` from Task 2.
- Produces: `createWorkerDomainRegistry({ kingClientNativeAccepted }): DomainRegistry`.

- [ ] **Step 1: Write failing registry-construction tests**

```ts
describe("createWorkerDomainRegistry", () => {
  it("registers an executable KingClient pack", () => {
    const registry = createWorkerDomainRegistry({
      kingClientNativeAccepted: false,
    });
    expect(registry.require("kingclient").metadata.kind).toBe("kingclient");
    expect(registry.metadata("kingclient").supported).toBe(false);
  });

  it.each([
    "kingcalculation",
    "kingdbconnector",
    "kingioserver",
    "kingalarm",
  ])("reserves %s as unsupported metadata", (kind) => {
    const registry = createWorkerDomainRegistry({
      kingClientNativeAccepted: false,
    });
    expect(registry.metadata(kind)).toMatchObject({ kind, supported: false });
    expect(() => registry.require(kind)).toThrow(`domain not supported: ${kind}`);
  });
});
```

- [ ] **Step 2: Run the worker test and verify it fails**

```bash
cd agent-app
pnpm --filter @kf/worker test -- src/domain-packs.test.ts
```

Expected: module or factory not found.

- [ ] **Step 3: Implement production pack registration**

`domain-packs.ts` must register the real KingClient adapter and metadata-only future domains:

```ts
export function createWorkerDomainRegistry(options: {
  kingClientNativeAccepted: boolean;
}): DomainRegistry {
  const registry = new DomainRegistry();
  registry.register(createKingClientDomainPack({
    nativeAccepted: options.kingClientNativeAccepted,
  }));

  for (const metadata of FUTURE_DOMAIN_METADATA) {
    registry.registerMetadata(metadata);
  }
  return registry;
}
```

Each future metadata record has all capabilities `false`. Keep these records in a frozen constant exported for tests and later capability Tools.

- [ ] **Step 4: Simplify the worker entrypoint**

Delete the placeholder `kingClientPack()` from `run.ts`. Construct the registry with:

```ts
const registry = createWorkerDomainRegistry({
  kingClientNativeAccepted:
    process.env[NATIVE_ACCEPTED_ENV] === "true",
});
```

Keep the existing log message and `KINGCLIENT_NATIVE_ACCEPTED` semantics.

- [ ] **Step 5: Run worker tests and typecheck**

```bash
cd agent-app
pnpm --filter @kf/worker test -- src/domain-packs.test.ts
pnpm --filter @kf/worker test
pnpm --filter @kf/worker typecheck
```

Expected: pass.

- [ ] **Step 6: Commit worker registry construction**

```bash
git add agent-app/apps/worker/src/domain-packs.ts \
  agent-app/apps/worker/src/domain-packs.test.ts \
  agent-app/apps/worker/src/run.ts
git diff --cached --check
git commit -m "feat(worker): register executable and reserved domain packs"
```

---

### Task 6: Update All Build Test Fixtures to the Real Contract

**Files:**
- Modify: `agent-app/apps/api/src/build-jobs/build-job.integration.test.ts`
- Modify: `agent-app/apps/worker/src/job-runner.integration.test.ts`

**Interfaces:**
- Consumes: `createKingClientDomainPack()` and the new `DomainPack` interface.
- Produces: integration suites that exercise the same executable adapter used by production.

- [ ] **Step 1: Find every obsolete pack fixture**

Run:

```bash
cd agent-app
rg -n 'registry\.register\(|kind: "kingclient"|DomainPack' \
  apps packages --glob '*.test.ts'
```

Expected files are exactly the API and Worker integration suites listed above. `packages/domain-registry/src/domain-registry.test.ts` was already migrated in Task 2 and is not changed here.

- [ ] **Step 2: Run affected suites once to capture failures**

```bash
cd agent-app
pnpm --filter @kf/api test -- src/build-jobs/build-job.integration.test.ts
pnpm --filter @kf/worker test -- src/job-runner.integration.test.ts
```

Expected before fixture migration: compile/type failures or runtime failures caused by the old pack shape.

- [ ] **Step 3: Replace production-path fixtures with the real adapter**

Use:

```ts
registry.register(createKingClientDomainPack({ nativeAccepted: true }));
```

Use explicit fake packs only in tests that assert failures, leases, crashes, or alternate domain output. Those fakes must implement all DomainPack methods and return domain-neutral artifact metadata.

- [ ] **Step 4: Add a non-client artifact regression case**

In the BuildExecutor integration suite, register a fake domain whose package result is:

```ts
{
  artifactKind: "calculation-package",
  domainProjectKind: "calculation-package",
  mediaType: "application/octet-stream",
  fileExtension: ".zip",
  bytes: new Uint8Array([80, 75, 3, 4]),
}
```

Assert the stored Artifact and DomainProjectRevision use the fake pack's kinds rather than `client-package`. This proves the executor is genuinely domain-neutral.

- [ ] **Step 5: Run affected suites**

```bash
cd agent-app
pnpm --filter @kf/api test -- src/build-jobs/build-job.integration.test.ts
pnpm --filter @kf/worker test -- src/job-runner.integration.test.ts
```

Expected: pass with the same revision and lease assertions as before.

- [ ] **Step 6: Commit fixture migration**

```bash
git add agent-app/apps/api/src/build-jobs/build-job.integration.test.ts \
  agent-app/apps/worker/src/job-runner.integration.test.ts
git diff --cached --check
git commit -m "test(build): verify domain-neutral build execution"
```

Only add files that actually changed.

---

### Task 7: Verify Package Boundaries and Full Regression

**Files:**
- Read-only verification; no files are modified in this task.

**Interfaces:**
- Consumes: all deliverables from Tasks 1–6.
- Produces: a green repository with a verified dependency boundary.

- [ ] **Step 1: Verify dependency direction**

Run:

```bash
cd agent-app
rg -n '@kf/domain-client' packages/build-jobs
rg -n 'compileClientProject|applyClientPatch|validateClientProject|packageNativeClientProject' \
  packages/build-jobs apps/worker/src/run.ts
```

Expected: no output. The concrete function names may appear only in `packages/domain-client` and its tests.

- [ ] **Step 2: Run package-level tests in dependency order**

```bash
cd agent-app
pnpm --filter @kf/contracts test
pnpm --filter @kf/domain-registry test
pnpm --filter @kf/domain-client test
pnpm --filter @kf/build-jobs test
pnpm --filter @kf/worker test
pnpm --filter @kf/api test
```

Expected: all pass.

- [ ] **Step 3: Run repository verification**

```bash
cd agent-app
pnpm test
pnpm typecheck
pnpm lint
```

Expected: all pass. If a command fails, stop this task, record the exact command and output, and return to the task that owns the failing file. Do not weaken tests or add an unplanned fix in the verification task.

- [ ] **Step 4: Inspect the final diff**

```bash
git diff --check
git status --short
git log --oneline -7
```

Expected: no whitespace errors; only planned implementation files are changed; Tasks 1–6 appear as focused commits.

- [ ] **Step 5: Confirm verification made no changes**

Run:

```bash
git status --short
```

Expected: the status matches the pre-verification status exactly. Do not create an empty verification commit.

## Completion Evidence

Before reporting this plan complete, record:

```text
contracts tests: PASS
domain-registry tests: PASS
domain-client tests: PASS
build-jobs tests: PASS
worker tests: PASS
api tests: PASS
full pnpm test: PASS
pnpm typecheck: PASS
pnpm lint: PASS
build-jobs imports @kf/domain-client: NO
future metadata registered: kingcalculation, kingdbconnector, kingioserver, kingalarm
customer-machine or deployment action performed: NO
```
