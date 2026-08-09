// @ts-nocheck -- Step 1/2 测试含 brief 逐字代码（JS 风格）；运行时断言由 vitest 验证。
// Task 9: revision immutability, rollback, currentRevisionId advancement,
// build idempotency, lease recovery, and full build-chain integration.
import "reflect-metadata";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres@127.0.0.1:5432/kf_agent_test";

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { LocalArtifactStorage, type ArtifactStorage } from "@kf/artifact-storage";
import { BuildExecutor } from "@kf/build-jobs";
import {
  createKingClientDomainPack,
  deriveGuid,
  planHash,
  packageNativeClientProject,
} from "@kf/domain-client";
import type { DomainPack } from "@kf/contracts";
import { DomainRegistry } from "@kf/domain-registry";
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../app.module.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { BuildJobService } from "./build-job.service.js";
import { RevisionService } from "../revisions/revision.service.js";
import { WorkspaceService } from "../workspaces/workspace.service.js";

const unknownFieldClientDir = fileURLToPath(
  new URL("../../../../tests/fixtures/client-unknown-field", import.meta.url),
);

let app: INestApplication;
let prisma: PrismaService;
let workspaces: WorkspaceService;
let revisions: RevisionService;
let jobs: BuildJobService;
let storage: LocalArtifactStorage;
let registry: DomainRegistry;
let counter = 0;
let storageRoot: string;

const TABLES = [
  "AuditLog",
  "ValidationReport",
  "Artifact",
  "BuildJob",
  "DomainProjectRevision",
  "SolutionRevision",
  "ChangePlan",
  "ChangeRequest",
  "Message",
  "Conversation",
  "SolutionWorkspace",
  "UserSession",
  "User",
  "Tenant",
];

beforeAll(async () => {
  storageRoot = await mkdtemp(path.join(tmpdir(), "kf-api-artifacts-"));
  process.env.ARTIFACT_STORAGE_ROOT = storageRoot;
  storage = new LocalArtifactStorage(storageRoot);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
  prisma = moduleRef.get(PrismaService);
  workspaces = moduleRef.get(WorkspaceService);
  revisions = moduleRef.get(RevisionService);
  jobs = moduleRef.get(BuildJobService);
  registry = new DomainRegistry();
  registry.register(clientPack());
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
  if (storageRoot.length > 0) {
    await rm(storageRoot, { recursive: true, force: true }).catch(() => {});
  }
});

async function resetDatabase() {
  for (const table of TABLES) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
  }
}

beforeEach(async () => {
  await resetDatabase();
});

function clientPack() {
  return createKingClientDomainPack({ nativeAccepted: true });
}

function tracingPack(
  calls: string[],
  packagedMetadata?: { artifactKind: string; domainProjectKind: string },
) {
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
      return { ...(await real.package(input)), ...packagedMetadata };
    }),
  };
}

function calculationPack(
  expectedProjectIr: unknown,
  bytes = new Uint8Array([80, 75, 3, 4]),
): DomainPack {
  const baseWorkspace = {
    id: "calculation-base",
    rootDir: "/calculation/base",
    mode: "base" as const,
  };
  const candidateWorkspace = {
    id: "calculation-candidate",
    rootDir: "/calculation/candidate",
    mode: "candidate" as const,
  };

  return {
    metadata: {
      kind: "kingcalculation",
      displayName: "KingFusion Calculation",
      supported: true,
      capabilities: {
        create: true,
        import: true,
        modify: true,
        validate: true,
        package: true,
      },
    },
    importPackage: async () => baseWorkspace,
    inspect: async () => ({ privateCalculationJson: true }),
    compile: async ({ projectIr }) => {
      expect(projectIr).toEqual(expectedProjectIr);
      return baseWorkspace;
    },
    patch: async () => candidateWorkspace,
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
      artifactKind: "calculation-package",
      domainProjectKind: "calculation-package",
      mediaType: "application/zip",
      fileExtension: ".zip",
      bytes,
    }),
  };
}

function trackingDomainPack(domainKind, calls) {
  const versions = new Map();
  return {
    metadata: {
      kind: domainKind,
      displayName: domainKind,
      supported: true,
      capabilities: {
        create: true,
        import: true,
        modify: true,
        validate: true,
        package: true,
      },
    },
    async importPackage({ bytes }) {
      const packageMarker = Buffer.from(bytes).toString("utf8");
      const [, projectMarker] = packageMarker.split(":");
      calls.push({ phase: "import", projectMarker, packageMarker });
      return { id: projectMarker, rootDir: `/${domainKind}/${projectMarker}/base`, mode: "base" };
    },
    async inspect() {
      return {};
    },
    async compile({ projectIr }) {
      const projectMarker = projectIr?.marker;
      calls.push({ phase: "compile", projectMarker, projectIr });
      return { id: projectMarker, rootDir: `/${domainKind}/${projectMarker}/compiled`, mode: "base" };
    },
    async patch({ baseWorkspace }) {
      calls.push({ phase: "patch", projectMarker: baseWorkspace.id });
      return {
        id: baseWorkspace.id,
        rootDir: `/${domainKind}/${baseWorkspace.id}/candidate`,
        mode: "candidate",
      };
    },
    async validate() {
      return {
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
      };
    },
    async package({ workspace }) {
      const nextVersion = (versions.get(workspace.id) ?? 0) + 1;
      versions.set(workspace.id, nextVersion);
      const packageMarker = `pkg:${workspace.id}:${nextVersion}`;
      calls.push({ phase: "package", projectMarker: workspace.id, packageMarker });
      return {
        artifactKind: `${domainKind}-package`,
        domainProjectKind: `${domainKind}-project`,
        mediaType: "application/zip",
        fileExtension: ".zip",
        bytes: Buffer.from(packageMarker),
      };
    },
  };
}

async function seedWorkspace(mode = "new") {
  counter += 1;
  const tenant = await prisma.tenant.create({
    data: { name: `Tenant-${Date.now()}-${counter}` },
  });
  const result = await workspaces.createWorkspace({
    tenantId: tenant.id,
    name: `Workspace-${Date.now()}-${counter}`,
    mode,
  });
  return { tenant, ...result };
}

async function seedPlan(tenantId, workspaceId, operations = undefined) {
  // A confirmed plan must change at least one entity (validator business rule);
  // the default touches the initial Text control (located by its derived KF
  // GUID, seed = workspaceId) so both compile and patch flows validate.
  const ops =
    operations === undefined
      ? [
          {
            op: "update",
            entityId: deriveGuid({ seed: workspaceId }, "Text1"),
            entityType: "text",
            changes: [{ path: "/text", value: "Hello" }],
          },
        ]
      : operations;
  const planObj = {
    schema: "kf-change-plan/v1",
    workspaceId,
    operations: ops,
  };
  const hash = planHash(planObj);
  const plan = await prisma.changePlan.create({
    data: { tenantId, workspaceId, planHash: hash, plan: planObj },
  });
  return { plan, hash };
}

function seedInput({ tenantId, workspaceId, baseRevisionId, changePlanId, planHashValue }) {
  counter += 1;
  return {
    tenantId,
    workspaceId,
    baseRevisionId,
    changePlanId,
    planHash: planHashValue,
    domainKind: "kingclient",
    idempotencyKey: `idem-${Date.now()}-${counter}`,
  };
}

async function runToSuccess({ tenantId, workspaceId, baseRevisionId, changePlanId, planHashValue, hooks }) {
  const input = seedInput({ tenantId, workspaceId, baseRevisionId, changePlanId, planHashValue });
  const queued = await jobs.enqueue(input);
  const now = new Date();
  const leased = await jobs.leaseNext("test-worker", now);
  expect(leased?.id).toBe(queued.id);
  const executor = new BuildExecutor({ prisma, storage, registry, hooks });
  const done = await executor.execute(leased);
  expect(done.status).toBe("SUCCEEDED");
  return { input, queued, done };
}

async function runProjectBuild({
  tenantId,
  workspaceId,
  baseRevisionId,
  domainKind,
  projectKey,
  localRegistry,
}) {
  const { plan, hash } = await seedPlan(tenantId, workspaceId);
  const input = {
    ...seedInput({
      tenantId,
      workspaceId,
      baseRevisionId,
      changePlanId: plan.id,
      planHashValue: hash,
    }),
    domainKind,
    projectKey,
  };
  const queued = await jobs.enqueue(input);
  const leased = await jobs.leaseNext(`worker-${projectKey}`, new Date());
  expect(leased?.id).toBe(queued.id);
  const executor = new BuildExecutor({ prisma, storage, registry: localRegistry });
  const done = await executor.execute(leased);
  expect(done.status).toBe("SUCCEEDED");
  const workspace = await prisma.solutionWorkspace.findUnique({ where: { id: workspaceId } });
  return workspace.currentRevisionId;
}

// ---------------------------------------------------------------------------
// Step 1: revision immutability, rollback, currentRevisionId advancement
// ---------------------------------------------------------------------------

describe("revision immutability", () => {
  it("rejects updating or deleting a successful revision through services", async () => {
    const { tenant, workspace } = await seedWorkspace("new");
    const { plan, hash } = await seedPlan(tenant.id, workspace.id);
    await runToSuccess({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      baseRevisionId: workspace.currentRevisionId,
      changePlanId: plan.id,
      planHashValue: hash,
    });

    const built = await prisma.solutionRevision.findFirst({
      where: { workspaceId: workspace.id, kind: "built" },
    });
    expect(built).not.toBeNull();

    await expect(revisions.update(tenant.id, built.id, { state: { tampered: true } })).rejects.toThrow();
    await expect(revisions.delete(tenant.id, built.id)).rejects.toThrow();

    // The revision row is untouched.
    const after = await prisma.solutionRevision.findUnique({ where: { id: built.id } });
    expect(after.state).toEqual(built.state);
  });

  it("rolls back by creating a new revision referencing the historical revision", async () => {
    const { tenant, workspace } = await seedWorkspace("new");
    const { plan, hash } = await seedPlan(tenant.id, workspace.id);
    await runToSuccess({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      baseRevisionId: workspace.currentRevisionId,
      changePlanId: plan.id,
      planHashValue: hash,
    });

    const built = await prisma.solutionRevision.findFirst({
      where: { workspaceId: workspace.id, kind: "built" },
    });
    expect(built).not.toBeNull();

    const rolledBack = await revisions.rollback({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      targetRevisionId: built.id,
    });

    expect(rolledBack.kind).toBe("rollback");
    expect(rolledBack.parentRevisionId).toBe(built.id);
    expect(rolledBack.revisionNumber).toBeGreaterThan(built.revisionNumber);

    const workspaceNow = await prisma.solutionWorkspace.findUnique({
      where: { id: workspace.id },
    });
    expect(workspaceNow.currentRevisionId).toBe(rolledBack.id);
  });

  it("advances currentRevisionId only after a validation pass", async () => {
    const { tenant, workspace } = await seedWorkspace("new");
    const { plan, hash } = await seedPlan(tenant.id, workspace.id);

    const workspaceBefore = await prisma.solutionWorkspace.findUnique({
      where: { id: workspace.id },
    });

    // An invalid IR causes the compile to throw -> the job FAILS and
    // currentRevisionId stays put.
    const baseBefore = workspaceBefore.currentRevisionId;
    await prisma.solutionRevision.update({
      where: { id: baseBefore },
      data: { state: { schema: "kf-client-project-ir/v1", id: "x", name: "x", pages: [] } },
    });

    const input = seedInput({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      baseRevisionId: baseBefore,
      changePlanId: plan.id,
      planHashValue: hash,
    });
    await jobs.enqueue(input);
    const leased = await jobs.leaseNext("test-worker", new Date());
    const executor = new BuildExecutor({ prisma, storage, registry });
    const done = await executor.execute(leased);
    expect(done.status).toBe("FAILED");

    const workspaceFailed = await prisma.solutionWorkspace.findUnique({
      where: { id: workspace.id },
    });
    expect(workspaceFailed.currentRevisionId).toBe(baseBefore);

    // Restore a valid IR and build again -> success advances the pointer.
    const ir = {
      schema: "kf-client-project-ir/v1",
      id: "project-minimal",
      name: "Minimal",
      pages: [
        {
          id: "page-1",
          name: "Page1",
          width: 1440,
          height: 900,
          controls: [
            { id: "Text1", type: "text", x: 40, y: 40, width: 120, height: 30, text: "Hello" },
          ],
        },
      ],
    };
    await prisma.solutionRevision.update({
      where: { id: baseBefore },
      data: { state: ir },
    });

    const input2 = seedInput({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      baseRevisionId: baseBefore,
      changePlanId: plan.id,
      planHashValue: hash,
    });
    await jobs.enqueue(input2);
    const leased2 = await jobs.leaseNext("test-worker", new Date());
    const done2 = await executor.execute(leased2);
    expect(done2.status).toBe("SUCCEEDED");

    const workspaceAfter = await prisma.solutionWorkspace.findUnique({
      where: { id: workspace.id },
    });
    expect(workspaceAfter.currentRevisionId).not.toBe(baseBefore);
    const latest = await prisma.solutionRevision.findFirst({
      where: { workspaceId: workspace.id },
      orderBy: { revisionNumber: "desc" },
    });
    expect(workspaceAfter.currentRevisionId).toBe(latest.id);
  });
});

// ---------------------------------------------------------------------------
// Step 2: build idempotency and lease recovery (brief verbatim)
// ---------------------------------------------------------------------------

describe("build job idempotency and leases", () => {
  it("returns the existing job for the same idempotency key", async () => {
    const { tenant, workspace } = await seedWorkspace("new");
    const { plan, hash } = await seedPlan(tenant.id, workspace.id);
    const input = seedInput({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      baseRevisionId: workspace.currentRevisionId,
      changePlanId: plan.id,
      planHashValue: hash,
    });
    const first = await jobs.enqueue(input);
    const second = await jobs.enqueue(input);
    expect(second.id).toBe(first.id);
  });

  it("rejects reusing an idempotency key for another project", async () => {
    const { tenant, workspace } = await seedWorkspace("new");
    const { plan, hash } = await seedPlan(tenant.id, workspace.id);
    const input = {
      ...seedInput({
        tenantId: tenant.id,
        workspaceId: workspace.id,
        baseRevisionId: workspace.currentRevisionId,
        changePlanId: plan.id,
        planHashValue: hash,
      }),
      projectKey: "primary",
    };
    await jobs.enqueue(input);

    await expect(jobs.enqueue({ ...input, projectKey: "secondary" }))
      .rejects.toThrow("idempotency key already used by another build");
  });

  it("allows recovery only after a lease expires", async () => {
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

    const now = new Date();
    const leaseMs = 30_000;
    const afterLease = new Date(now.getTime() + leaseMs + 1_000);

    const leased = await jobs.leaseNext("worker-a", now, leaseMs);
    expect(leased).not.toBeNull();
    expect(await jobs.leaseNext("worker-b", now)).toBeNull();
    expect((await jobs.leaseNext("worker-b", afterLease)).id).toBe(leased.id);
  });

  it("records diagnostic metadata on failure and never advances the revision", async () => {
    const { tenant, workspace } = await seedWorkspace("new");
    const { plan, hash } = await seedPlan(tenant.id, workspace.id);
    const baseBefore = workspace.currentRevisionId;
    await prisma.solutionRevision.update({
      where: { id: baseBefore },
      data: { state: { schema: "kf-client-project-ir/v1", id: "x", name: "x", pages: [] } },
    });

    const input = seedInput({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      baseRevisionId: baseBefore,
      changePlanId: plan.id,
      planHashValue: hash,
    });
    const queued = await jobs.enqueue(input);
    const leased = await jobs.leaseNext("test-worker", new Date());
    const executor = new BuildExecutor({ prisma, storage, registry });
    const done = await executor.execute(leased);
    expect(done.status).toBe("FAILED");

    const report = await prisma.validationReport.findFirst({
      where: { buildJobId: queued.id },
    });
    expect(report).not.toBeNull();
    expect(report.outcome).toBe("fail");
    expect(report.details).toHaveProperty("error");

    const workspaceNow = await prisma.solutionWorkspace.findUnique({
      where: { id: workspace.id },
    });
    expect(workspaceNow.currentRevisionId).toBe(baseBefore);
  });
});

// ---------------------------------------------------------------------------
// Full chain: upload flow -> source revision -> patch -> built artifact
// ---------------------------------------------------------------------------

describe("full build chain", () => {
  it("stores the source, inspects it, patches, validates, and packages", async () => {
    const { tenant, workspace } = await seedWorkspace("upload");
    expect(workspace.currentRevisionId).toBeNull();

    const source = await packageNativeClientProject(unknownFieldClientDir);
    const sourceRevision = await workspaces.createSourceRevision({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      source,
    });
    expect(sourceRevision.revision.revisionNumber).toBe(1);
    expect(sourceRevision.revision.kind).toBe("source");
    expect(sourceRevision.summary).toMatchObject({ project: { name: "UnknownFieldFixture" } });

    const workspaceAfterImport = await prisma.solutionWorkspace.findUnique({
      where: { id: workspace.id },
    });
    expect(workspaceAfterImport.currentRevisionId).toBe(sourceRevision.revision.id);

    // Patch the imported project: change the Button control text (located by
    // its KF GUID from the fixture).
    const { plan, hash } = await seedPlan(tenant.id, workspace.id, [
      {
        op: "update",
        entityId: "button-guid-1",
        entityType: "button",
        changes: [{ path: "/text", value: "Patched" }],
      },
    ]);
    const built = await runToSuccess({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      baseRevisionId: sourceRevision.revision.id,
      changePlanId: plan.id,
      planHashValue: hash,
    });

    const artifact = await prisma.artifact.findFirst({
      where: { buildJobId: built.queued.id },
    });
    expect(artifact).not.toBeNull();
    expect(artifact.kind).toBe("client-package");

    const latest = await prisma.solutionRevision.findFirst({
      where: { workspaceId: workspace.id },
      orderBy: { revisionNumber: "desc" },
    });
    expect(latest.kind).toBe("built");
    expect(latest.parentRevisionId).toBe(sourceRevision.revision.id);
  });
});

describe("domain pack delegation", () => {
  it("builds and modifies two domain projects without losing or cross-loading either base", async () => {
    const clientCalls = [];
    const calculationCalls = [];
    const localRegistry = new DomainRegistry();
    localRegistry.register(trackingDomainPack("kingclient", clientCalls));
    localRegistry.register(trackingDomainPack("kingcalculation", calculationCalls));
    const { tenant, workspace } = await seedWorkspace("new");
    await prisma.solutionRevision.update({
      where: { id: workspace.currentRevisionId },
      data: {
        state: {
          schema: "kf-solution-revision-state/v1",
          projects: [
            {
              projectKey: "client-main",
              domainKind: "kingclient",
              projectIr: { schema: "client-test/v1", marker: "client-main" },
            },
            {
              projectKey: "calculation-main",
              domainKind: "kingcalculation",
              projectIr: { schema: "calculation-test/v1", marker: "calculation-main" },
            },
          ],
        },
      },
    });

    const clientRevision = await runProjectBuild({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      baseRevisionId: workspace.currentRevisionId,
      domainKind: "kingclient",
      projectKey: "client-main",
      localRegistry,
    });
    expect(clientCalls[0]).toMatchObject({
      phase: "compile",
      projectMarker: "client-main",
      projectIr: { marker: "client-main" },
    });

    const bothCreatedRevision = await runProjectBuild({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      baseRevisionId: clientRevision,
      domainKind: "kingcalculation",
      projectKey: "calculation-main",
      localRegistry,
    });
    expect(calculationCalls[0]).toMatchObject({
      phase: "compile",
      projectMarker: "calculation-main",
      projectIr: { marker: "calculation-main" },
    });
    const bothCreated = await prisma.domainProjectRevision.findMany({
      where: { solutionRevisionId: bothCreatedRevision },
      orderBy: { projectKey: "asc" },
    });
    expect(bothCreated.map(({ projectKey }) => projectKey)).toEqual([
      "calculation-main",
      "client-main",
    ]);
    const calculationBeforeClientModify = bothCreated.find(
      ({ projectKey }) => projectKey === "calculation-main",
    );

    const clientModifiedRevision = await runProjectBuild({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      baseRevisionId: bothCreatedRevision,
      domainKind: "kingclient",
      projectKey: "client-main",
      localRegistry,
    });
    expect(clientCalls.filter(({ phase }) => phase === "import")).toEqual([
      expect.objectContaining({ projectMarker: "client-main", packageMarker: "pkg:client-main:1" }),
    ]);
    const afterClientModify = await prisma.domainProjectRevision.findMany({
      where: { solutionRevisionId: clientModifiedRevision },
    });
    expect(afterClientModify.find(({ projectKey }) => projectKey === "calculation-main"))
      .toMatchObject({
        packageUrl: calculationBeforeClientModify.packageUrl,
        packageHash: calculationBeforeClientModify.packageHash,
      });

    const calculationModifiedRevision = await runProjectBuild({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      baseRevisionId: clientModifiedRevision,
      domainKind: "kingcalculation",
      projectKey: "calculation-main",
      localRegistry,
    });
    expect(calculationCalls.filter(({ phase }) => phase === "import")).toEqual([
      expect.objectContaining({
        projectMarker: "calculation-main",
        packageMarker: "pkg:calculation-main:1",
      }),
    ]);
    const finalProjects = await prisma.domainProjectRevision.findMany({
      where: { solutionRevisionId: calculationModifiedRevision },
    });
    expect(finalProjects).toHaveLength(2);
    expect(finalProjects.find(({ projectKey }) => projectKey === "client-main")?.packageUrl)
      .toBe(afterClientModify.find(({ projectKey }) => projectKey === "client-main")?.packageUrl);
  });

  it("selects the exact base among two projects in the same domain", async () => {
    const calls = [];
    const localRegistry = new DomainRegistry();
    localRegistry.register(trackingDomainPack("kingcalculation", calls));
    const { tenant, workspace } = await seedWorkspace("new");
    await prisma.solutionRevision.update({
      where: { id: workspace.currentRevisionId },
      data: {
        state: {
          schema: "kf-solution-revision-state/v1",
          projects: [
            {
              projectKey: "primary",
              domainKind: "kingcalculation",
              projectIr: { marker: "primary" },
            },
            {
              projectKey: "secondary",
              domainKind: "kingcalculation",
              projectIr: { marker: "secondary" },
            },
          ],
        },
      },
    });
    const primaryRevision = await runProjectBuild({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      baseRevisionId: workspace.currentRevisionId,
      domainKind: "kingcalculation",
      projectKey: "primary",
      localRegistry,
    });
    const bothRevision = await runProjectBuild({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      baseRevisionId: primaryRevision,
      domainKind: "kingcalculation",
      projectKey: "secondary",
      localRegistry,
    });
    await runProjectBuild({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      baseRevisionId: bothRevision,
      domainKind: "kingcalculation",
      projectKey: "primary",
      localRegistry,
    });

    expect(calls.filter(({ phase }) => phase === "compile").map(({ projectMarker }) => projectMarker))
      .toEqual(["primary", "secondary"]);
    expect(calls.filter(({ phase }) => phase === "import")).toEqual([
      expect.objectContaining({ projectMarker: "primary", packageMarker: "pkg:primary:1" }),
    ]);
  });

  it("emits a sliced opaque artifact as its original single stream chunk", async () => {
    const privateCalculationIr = {
      schema: "kf-calculation-project/v1",
      model: { vendorExtension: { retainExactly: true } },
    };
    const backing = new Uint8Array([0xff, 0x00, 0x80, 0x50, 0x4b, 0x03, 0x04, 0xee]);
    const packagedBytes = backing.subarray(1, 7);
    const streamedChunks: Uint8Array[] = [];
    const captureStorage: ArtifactStorage = {
      async put({ stream }) {
        for await (const chunk of stream as AsyncIterable<Uint8Array>) {
          streamedChunks.push(chunk);
        }
        return {
          artifactId: "calculation-stream-artifact",
          sha256: "baf3a6277cc7a9ce2cfd382cf6011839b5fbf46b2517419ab4cbe83eeb67a4b3",
          size: packagedBytes.byteLength,
        };
      },
      async open() {
        throw new Error("not needed for a new-flow build");
      },
      async delete() {},
    };
    const localRegistry = new DomainRegistry();
    localRegistry.register(calculationPack(privateCalculationIr, packagedBytes));
    const { tenant, workspace } = await seedWorkspace("new");
    await prisma.solutionRevision.update({
      where: { id: workspace.currentRevisionId },
      data: { state: privateCalculationIr },
    });
    const { plan, hash } = await seedPlan(tenant.id, workspace.id);
    const input = {
      ...seedInput({
        tenantId: tenant.id,
        workspaceId: workspace.id,
        baseRevisionId: workspace.currentRevisionId,
        changePlanId: plan.id,
        planHashValue: hash,
      }),
      domainKind: "kingcalculation",
    };
    await jobs.enqueue(input);
    const leased = await jobs.leaseNext("calculation-domain", new Date());
    const executor = new BuildExecutor({ prisma, storage: captureStorage, registry: localRegistry });

    expect((await executor.execute(leased)).status).toBe("SUCCEEDED");
    expect(streamedChunks).toHaveLength(1);
    expect(streamedChunks[0]).toBe(packagedBytes);
    expect(streamedChunks[0]).toEqual(new Uint8Array([0x00, 0x80, 0x50, 0x4b, 0x03, 0x04]));
  });

  it("stores an opaque calculation artifact without parsing domain-private JSON", async () => {
    const privateCalculationIr = {
      schema: "kf-calculation-project/v1",
      model: {
        formula: { $opaque: ["mass", "*", "acceleration"] },
        vendorExtension: { retainExactly: true },
      },
    };
    const localRegistry = new DomainRegistry();
    localRegistry.register(calculationPack(privateCalculationIr));
    const { tenant, workspace } = await seedWorkspace("new");
    await prisma.solutionRevision.update({
      where: { id: workspace.currentRevisionId },
      data: { state: privateCalculationIr },
    });
    const { plan, hash } = await seedPlan(tenant.id, workspace.id);
    const input = {
      ...seedInput({
        tenantId: tenant.id,
        workspaceId: workspace.id,
        baseRevisionId: workspace.currentRevisionId,
        changePlanId: plan.id,
        planHashValue: hash,
      }),
      domainKind: "kingcalculation",
    };
    await jobs.enqueue(input);
    const leased = await jobs.leaseNext("calculation-domain", new Date());
    const executor = new BuildExecutor({ prisma, storage, registry: localRegistry });

    const done = await executor.execute(leased);
    expect(done.status).toBe("SUCCEEDED");

    const artifact = await prisma.artifact.findFirst({ where: { buildJobId: done.id } });
    expect(artifact?.kind).toBe("calculation-package");
    expect(artifact?.mediaType).toBe("application/zip");
    expect(artifact?.fileExtension).toBe(".zip");
    const storedBytes = await storage.open(tenant.id, artifact!.storageKey);
    const chunks: Buffer[] = [];
    for await (const chunk of storedBytes) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    expect(Buffer.concat(chunks)).toEqual(Buffer.from([80, 75, 3, 4]));

    const builtRevision = await prisma.solutionRevision.findFirst({
      where: { workspaceId: workspace.id, kind: "built" },
    });
    const domainProject = await prisma.domainProjectRevision.findFirst({
      where: { solutionRevisionId: builtRevision?.id },
    });
    expect(domainProject?.kind).toBe("calculation-package");
    expect(domainProject?.mediaType).toBe("application/zip");
    expect(domainProject?.fileExtension).toBe(".zip");
  });

  it("delegates a new build to compile, patch, validate, and package", async () => {
    const calls: string[] = [];
    const pack = tracingPack(calls, {
      artifactKind: "sentinel-artifact-kind",
      domainProjectKind: "sentinel-domain-project",
    });
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
    const put = vi.spyOn(storage, "put");

    const done = await executor.execute(leased);
    expect(done.status).toBe("SUCCEEDED");
    expect(calls).toEqual(["compile", "patch", "validate", "package"]);
    expect(pack.compile).toHaveBeenCalledWith(expect.objectContaining({
      buildSeed: workspace.id,
    }));
    expect(pack.patch).toHaveBeenCalledWith(expect.objectContaining({
      expectedPlanHash: hash,
    }));
    expect(put).toHaveBeenCalledWith(expect.objectContaining({
      kind: "sentinel-artifact-kind",
    }));

    const artifact = await prisma.artifact.findFirst({ where: { buildJobId: done.id } });
    expect(artifact?.kind).toBe("sentinel-artifact-kind");
    const builtRevision = await prisma.solutionRevision.findFirst({
      where: { workspaceId: workspace.id, kind: "built" },
    });
    const domainProject = await prisma.domainProjectRevision.findFirst({
      where: { solutionRevisionId: builtRevision?.id },
    });
    expect(domainProject?.kind).toBe("sentinel-domain-project");
  });

  it("delegates an upload build to importPackage, patch, validate, and package", async () => {
    const calls: string[] = [];
    const pack = tracingPack(calls);
    const localRegistry = new DomainRegistry();
    localRegistry.register(pack);
    const { tenant, workspace } = await seedWorkspace("upload");
    const source = await packageNativeClientProject(unknownFieldClientDir);
    const sourceRevision = await workspaces.createSourceRevision({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      source,
    });
    const { plan, hash } = await seedPlan(tenant.id, workspace.id, [
      {
        op: "update",
        entityId: "button-guid-1",
        entityType: "button",
        changes: [{ path: "/text", value: "Patched" }],
      },
    ]);
    const input = seedInput({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      baseRevisionId: sourceRevision.revision.id,
      changePlanId: plan.id,
      planHashValue: hash,
    });
    await jobs.enqueue(input);
    const leased = await jobs.leaseNext("domain-delegation", new Date());
    const executor = new BuildExecutor({ prisma, storage, registry: localRegistry });

    expect((await executor.execute(leased)).status).toBe("SUCCEEDED");
    expect(calls).toEqual(["importPackage", "patch", "validate", "package"]);
    expect(pack.compile).not.toHaveBeenCalled();
    expect(pack.importPackage).toHaveBeenCalledWith(expect.objectContaining({
      bytes: expect.any(Uint8Array),
    }));
  });
});
