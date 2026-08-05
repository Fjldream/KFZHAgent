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
import { LocalArtifactStorage } from "@kf/artifact-storage";
import { BuildExecutor } from "@kf/build-jobs";
import { deriveGuid, planHash, packageNativeClientProject } from "@kf/domain-client";
import { DomainRegistry } from "@kf/domain-registry";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
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
  return {
    kind: "kingclient",
    displayName: "KingFusion Client",
    supported: true,
    capabilities: {
      create: true,
      import: true,
      modify: true,
      validate: true,
      package: true,
    },
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
        roundTrip: "pass",
      },
      warnings: [],
    }),
    package: async () => "",
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
