// @ts-nocheck -- Step 1/2 测试含 brief 逐字代码（JS 风格）；运行时断言由 vitest 验证。
// Task 9: revision immutability, rollback, currentRevisionId advancement,
// build idempotency, lease recovery, and full build-chain integration.
import "reflect-metadata";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres@127.0.0.1:5432/kf_agent_test_agent_next";

// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { assertSafeTestDatabase } from "../../../../tests/helpers/database-safety.js";
assertSafeTestDatabase({
  url: process.env.DATABASE_URL,
  allowReset: process.env.KF_TEST_ALLOW_DESTRUCTIVE_RESET,
  expectedPrefix: "kf_agent_test_",
});
// end
process.env.KF_SERVER_PLAN_HMAC_KEY_BASE64 ??= Buffer.alloc(32, 0x54).toString("base64");

import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { ConflictException, type INestApplication } from "@nestjs/common";
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
  if (mode === "new") {
    await prisma.solutionWorkspace.update({
      where: { id: result.workspace.id },
      data: { generationWorkflow: "legacy" },
    });
    result.workspace.generationWorkflow = "legacy";
  }
  return { tenant, ...result };
}

async function seedPlan(tenantId, workspaceId, operations = undefined) {
  // A confirmed plan must change at least one entity (validator business rule);
  // new workspaces deliberately start with an empty Page1, so the default
  // creates the first text control instead of relying on a seeded Hello node.
  const ops =
    operations === undefined
      ? [
          {
            op: "create",
            entityId: "Text1",
            entityType: "control",
            properties: {
              pageId: `k${deriveGuid({ seed: workspaceId }, "Page1")}`,
              type: "text",
              x: 40,
              y: 40,
              width: 120,
              height: 30,
              text: "Hello",
            },
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

function successfulCompletionInput(job, storageKey) {
  return {
    jobId: job.id,
    tenantId: job.tenantId,
    leaseOwner: job.leaseOwner,
    leaseAttempt: job.attemptCount,
    status: "SUCCEEDED",
    validationReport: { outcome: "pass", summary: "pass", details: {} },
    result: {
      kind: "built",
      state: { mode: "compile" },
      domainKind: job.domainKind,
      domainProjectKind: "client-package",
      mediaType: "application/zip",
      fileExtension: ".gz",
      packageHash: `${storageKey}-hash`,
      packageUrl: storageKey,
      artifact: {
        kind: "client-package",
        mediaType: "application/zip",
        fileExtension: ".gz",
        storageKey,
        sizeBytes: 4,
        sha256: `${storageKey}-hash`,
      },
    },
  };
}

async function holdRowLock(table, id) {
  let signalLocked;
  let releaseLock;
  const locked = new Promise((resolve) => {
    signalLocked = resolve;
  });
  const released = new Promise((resolve) => {
    releaseLock = resolve;
  });
  const transaction = prisma.$transaction(
    async (tx) => {
      await tx.$queryRawUnsafe(`SELECT "id" FROM "${table}" WHERE "id" = $1 FOR UPDATE`, id);
      signalLocked();
      await released;
    },
    { timeout: 10_000 },
  );
  await locked;
  return async () => {
    releaseLock();
    await transaction;
  };
}

async function waitForBlockedQueries(expectations) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRaw`
      SELECT "query"
      FROM "pg_stat_activity"
      WHERE "datname" = current_database()
        AND "pid" <> pg_backend_pid()
        AND "wait_event_type" = 'Lock'
    `;
    const allBlocked = expectations.every(({ marker, count }) =>
      rows.filter((row) => row.query.includes(marker)).length >= count,
    );
    if (allBlocked) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for blocked queries: ${JSON.stringify(expectations)}`);
}

function workspaceServiceWithTransactionFailure(error, options = {}) {
  const prismaProxy = new Proxy(prisma, {
    get(target, property, receiver) {
      if (property === "$transaction") {
        return async (...args) => {
          if (options.afterCommit === true) {
            await target.$transaction(...args);
          }
          throw error;
        };
      }
      if (property === "domainProjectRevision" && options.failReferenceLookup === true) {
        return new Proxy(target.domainProjectRevision, {
          get(model, modelProperty, modelReceiver) {
            if (modelProperty === "findFirst") {
              return async () => {
                throw new Error("reference lookup unavailable");
              };
            }
            const value = Reflect.get(model, modelProperty, modelReceiver);
            return typeof value === "function" ? value.bind(model) : value;
          },
        });
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return new WorkspaceService(prismaProxy, storage);
}

async function expectCommittedSourceBlobRetained(tenantId, workspaceId) {
  const revision = await prisma.solutionRevision.findFirstOrThrow({
    where: { tenantId, workspaceId, kind: "source" },
  });
  const domainProject = await prisma.domainProjectRevision.findFirstOrThrow({
    where: { tenantId, solutionRevisionId: revision.id },
  });
  expect(domainProject.packageUrl).not.toBeNull();
  const stream = await storage.open(tenantId, domainProject.packageUrl);
  stream.destroy();
  expect(await readdir(path.join(storageRoot, tenantId))).toEqual([domainProject.packageUrl]);
  expect((await prisma.solutionWorkspace.findUnique({ where: { id: workspaceId } }))
    ?.currentRevisionId).toBe(revision.id);
}

async function runToSuccess({ tenantId, workspaceId, baseRevisionId, changePlanId, planHashValue, hooks, workRoot }) {
  const input = seedInput({ tenantId, workspaceId, baseRevisionId, changePlanId, planHashValue });
  const queued = await jobs.enqueue(input);
  const now = new Date();
  const leased = await jobs.leaseNext("test-worker", now);
  expect(leased?.id).toBe(queued.id);
  const executor = new BuildExecutor({ prisma, storage, registry, hooks, workRoot });
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
          controls: [],
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

  it("applies the canonical projectKey format before enqueue", async () => {
    const { tenant, workspace } = await seedWorkspace("new");
    const { plan, hash } = await seedPlan(tenant.id, workspace.id);
    const input = seedInput({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      baseRevisionId: workspace.currentRevisionId,
      changePlanId: plan.id,
      planHashValue: hash,
    });

    await expect(jobs.enqueue({ ...input, projectKey: "unsafe/project" }))
      .rejects.toThrow(/projectKey/);
    expect(await prisma.buildJob.count({ where: { workspaceId: workspace.id } })).toBe(0);
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

  it("fences an older attempt even when a reclaimed lease has the same owner", async () => {
    const { tenant, workspace } = await seedWorkspace("new");
    const { plan, hash } = await seedPlan(tenant.id, workspace.id);
    const queued = await jobs.enqueue(seedInput({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      baseRevisionId: workspace.currentRevisionId,
      changePlanId: plan.id,
      planHashValue: hash,
    }));
    const firstLeaseAt = new Date();
    const first = await jobs.leaseNext("worker-collision", firstLeaseAt, 1_000);
    const reclaimed = await jobs.leaseNext(
      "worker-collision",
      new Date(firstLeaseAt.getTime() + 1_001),
      30_000,
    );

    expect(first.id).toBe(queued.id);
    expect(reclaimed.id).toBe(queued.id);
    expect(reclaimed.attemptCount).toBe(first.attemptCount + 1);
    await expect(jobs.completeBuild(successfulCompletionInput(first, "old-attempt")))
      .rejects.toThrow("lease was lost or expired before completion");
    expect(await prisma.solutionRevision.count({ where: { workspaceId: workspace.id } })).toBe(1);
    expect(await prisma.artifact.count({ where: { buildJobId: queued.id } })).toBe(0);

    expect((await jobs.completeBuild(successfulCompletionInput(reclaimed, "new-attempt"))).status)
      .toBe("SUCCEEDED");
  });

  it("rejects a completion after its lease has expired in database time", async () => {
    const { tenant, workspace } = await seedWorkspace("new");
    const { plan, hash } = await seedPlan(tenant.id, workspace.id);
    const queued = await jobs.enqueue(seedInput({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      baseRevisionId: workspace.currentRevisionId,
      changePlanId: plan.id,
      planHashValue: hash,
    }));
    const expired = await jobs.leaseNext(
      "expired-worker",
      new Date(Date.now() - 60_000),
      1_000,
    );

    await expect(jobs.completeBuild(successfulCompletionInput(expired, "expired-attempt")))
      .rejects.toThrow("lease was lost or expired before completion");
    expect(await prisma.buildJob.findUnique({ where: { id: queued.id } })).toMatchObject({
      status: "RUNNING",
      attemptCount: 1,
    });
    expect(await prisma.solutionRevision.count({ where: { workspaceId: workspace.id } })).toBe(1);
  });

  it("rejects a lease that expires while completion waits to acquire its job lock", async () => {
    const { tenant, workspace } = await seedWorkspace("new");
    const { plan, hash } = await seedPlan(tenant.id, workspace.id);
    const queued = await jobs.enqueue(seedInput({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      baseRevisionId: workspace.currentRevisionId,
      changePlanId: plan.id,
      planHashValue: hash,
    }));
    const leased = await jobs.leaseNext("lock-wait-expiry", new Date(), 100);
    const release = await holdRowLock("BuildJob", queued.id);

    const completion = jobs.completeBuild(successfulCompletionInput(leased, "lock-wait-expired"));
    await waitForBlockedQueries([{ marker: "kf_complete_build_job_lock", count: 1 }]);
    await new Promise((resolve) => setTimeout(resolve, 150));
    await release();

    await expect(completion).rejects.toThrow("lease was lost or expired before completion");
    expect(await prisma.solutionRevision.count({ where: { workspaceId: workspace.id } })).toBe(1);
    expect(await prisma.artifact.count({ where: { buildJobId: queued.id } })).toBe(0);
  });

  it("commits at most one revision and artifact when the same job completes concurrently", async () => {
    const { tenant, workspace } = await seedWorkspace("new");
    const { plan, hash } = await seedPlan(tenant.id, workspace.id);
    const queued = await jobs.enqueue(seedInput({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      baseRevisionId: workspace.currentRevisionId,
      changePlanId: plan.id,
      planHashValue: hash,
    }));
    const leased = await jobs.leaseNext("double-completion", new Date());
    const release = await holdRowLock("BuildJob", queued.id);

    const first = jobs.completeBuild(successfulCompletionInput(leased, "double-a"));
    const second = jobs.completeBuild(successfulCompletionInput(leased, "double-b"));
    await waitForBlockedQueries([{ marker: "kf_complete_build_job_lock", count: 2 }]);
    await release();
    const results = await Promise.allSettled([first, second]);

    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    expect(await prisma.solutionRevision.count({ where: { workspaceId: workspace.id } })).toBe(2);
    expect(await prisma.artifact.count({ where: { buildJobId: queued.id } })).toBe(1);
    expect(await prisma.validationReport.count({ where: { buildJobId: queued.id } })).toBe(1);
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
    expect(sourceRevision.domainProject).toMatchObject({
      kind: "source-package",
      mediaType: "application/zip",
      fileExtension: ".zip",
    });
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
    const workRoot = await mkdtemp(path.join(tmpdir(), "kf-import-build-cleanup-"));
    const built = await runToSuccess({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      baseRevisionId: sourceRevision.revision.id,
      changePlanId: plan.id,
      planHashValue: hash,
      workRoot,
    });
    expect(await readdir(workRoot)).toEqual([]);

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

  it("keeps a buffered source blob when commit succeeded before the response was lost", async () => {
    const { tenant, workspace } = await seedWorkspace("upload");
    const source = await packageNativeClientProject(unknownFieldClientDir);
    const responseLost = new Error("buffered source commit response lost");
    const lossyWorkspaces = workspaceServiceWithTransactionFailure(responseLost, {
      afterCommit: true,
    });

    await expect(lossyWorkspaces.createSourceRevision({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      source,
    })).rejects.toBe(responseLost);

    await expectCommittedSourceBlobRetained(tenant.id, workspace.id);
  });

  it("keeps a streaming source blob when commit succeeded before the response was lost", async () => {
    const { tenant, workspace } = await seedWorkspace("upload");
    const source = await packageNativeClientProject(unknownFieldClientDir);
    const responseLost = new Error("streaming source commit response lost");
    const lossyWorkspaces = workspaceServiceWithTransactionFailure(responseLost, {
      afterCommit: true,
    });

    await expect(lossyWorkspaces.uploadSourceRevision({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      stream: Readable.from([source]),
    })).rejects.toBe(responseLost);

    await expectCommittedSourceBlobRetained(tenant.id, workspace.id);
  });

  it("keeps a buffered source blob when reference lookup is unavailable", async () => {
    const { tenant, workspace } = await seedWorkspace("upload");
    const source = await packageNativeClientProject(unknownFieldClientDir);
    const commitError = new Error("buffered source commit status unknown");
    const uncertainWorkspaces = workspaceServiceWithTransactionFailure(commitError, {
      failReferenceLookup: true,
    });

    await expect(uncertainWorkspaces.createSourceRevision({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      source,
    })).rejects.toBe(commitError);

    expect(await prisma.solutionRevision.count({ where: { workspaceId: workspace.id } })).toBe(0);
    expect(await readdir(path.join(storageRoot, tenant.id))).toHaveLength(1);
  });

  it("does not mask a streaming commit error when loser blob deletion fails", async () => {
    const { tenant, workspace } = await seedWorkspace("upload");
    const source = await packageNativeClientProject(unknownFieldClientDir);
    const commitError = new Error("streaming source commit failed");
    const failedWorkspaces = workspaceServiceWithTransactionFailure(commitError);
    const deleteFailure = vi.spyOn(storage, "delete").mockRejectedValueOnce(
      new Error("source blob delete failed"),
    );

    try {
      await expect(failedWorkspaces.uploadSourceRevision({
        tenantId: tenant.id,
        workspaceId: workspace.id,
        stream: Readable.from([source]),
      })).rejects.toBe(commitError);
    } finally {
      deleteFailure.mockRestore();
    }

    expect(await prisma.solutionRevision.count({ where: { workspaceId: workspace.id } })).toBe(0);
    expect(await readdir(path.join(storageRoot, tenant.id))).toHaveLength(1);
  });

  it("commits only one source revision when two imports race on an empty workspace", async () => {
    const { tenant, workspace } = await seedWorkspace("upload");
    const source = await packageNativeClientProject(unknownFieldClientDir);
    const release = await holdRowLock("SolutionWorkspace", workspace.id);

    const first = workspaces.createSourceRevision({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      source,
    });
    const second = workspaces.createSourceRevision({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      source,
    });
    await waitForBlockedQueries([{ marker: "kf_source_workspace_lock", count: 2 }]);
    await release();
    const results = await Promise.allSettled([first, second]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.solutionRevision.count({ where: { workspaceId: workspace.id } })).toBe(1);
    const winner = results.find((result) => result.status === "fulfilled");
    expect((await prisma.solutionWorkspace.findUnique({ where: { id: workspace.id } }))
      ?.currentRevisionId).toBe(winner.value.revision.id);
    expect(await readdir(path.join(storageRoot, tenant.id))).toHaveLength(1);
  });

  it("keeps streaming source-upload race losers as 409 and removes their blobs", async () => {
    const { tenant, workspace } = await seedWorkspace("upload");
    const source = await packageNativeClientProject(unknownFieldClientDir);
    const release = await holdRowLock("SolutionWorkspace", workspace.id);

    const first = workspaces.uploadSourceRevision({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      stream: Readable.from([source]),
    });
    const second = workspaces.uploadSourceRevision({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      stream: Readable.from([source]),
    });
    await waitForBlockedQueries([{ marker: "kf_source_workspace_lock", count: 2 }]);
    await release();
    const results = await Promise.allSettled([first, second]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const loser = results.find((result) => result.status === "rejected");
    expect(loser.reason).toBeInstanceOf(ConflictException);
    expect(loser.reason.getStatus()).toBe(409);
    expect(await prisma.solutionRevision.count({ where: { workspaceId: workspace.id } })).toBe(1);
    expect(await readdir(path.join(storageRoot, tenant.id))).toHaveLength(1);
  });
});

describe("concurrent revision writers", () => {
  it("serializes completion and rollback without duplicate revisions or pointer overwrite", async () => {
    const { tenant, workspace } = await seedWorkspace("new");
    const firstPlan = await seedPlan(tenant.id, workspace.id);
    await runToSuccess({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      baseRevisionId: workspace.currentRevisionId,
      changePlanId: firstPlan.plan.id,
      planHashValue: firstPlan.hash,
    });
    const builtBase = await prisma.solutionRevision.findFirstOrThrow({
      where: { workspaceId: workspace.id, kind: "built" },
    });
    const secondPlan = await seedPlan(tenant.id, workspace.id);
    const queued = await jobs.enqueue(seedInput({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      baseRevisionId: builtBase.id,
      changePlanId: secondPlan.plan.id,
      planHashValue: secondPlan.hash,
    }));
    const leased = await jobs.leaseNext("completion-vs-rollback", new Date());
    const release = await holdRowLock("SolutionWorkspace", workspace.id);

    const completion = jobs.completeBuild(successfulCompletionInput(leased, "race-completion"));
    const rollback = revisions.rollback({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      targetRevisionId: builtBase.id,
    });
    await waitForBlockedQueries([
      { marker: "kf_complete_workspace_lock", count: 1 },
      { marker: "kf_rollback_workspace_lock", count: 1 },
    ]);
    await release();
    const [completionResult, rollbackResult] = await Promise.allSettled([completion, rollback]);

    expect(completionResult.status).toBe("fulfilled");
    expect(rollbackResult.status).toBe("fulfilled");
    if (completionResult.status !== "fulfilled" || rollbackResult.status !== "fulfilled") return;
    const history = await prisma.solutionRevision.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { revisionNumber: "asc" },
    });
    expect(history.map((revision) => revision.revisionNumber))
      .toEqual(history.map((_, index) => index + 1));
    expect((await prisma.solutionWorkspace.findUnique({ where: { id: workspace.id } }))
      ?.currentRevisionId).toBe(rollbackResult.value.id);
    expect(await prisma.artifact.count({ where: { buildJobId: queued.id } })).toBe(
      completionResult.value.status === "SUCCEEDED" ? 1 : 0,
    );
  });
});

describe("domain pack delegation", () => {
  it("invalidates the second of two project jobs queued against the same base", async () => {
    const clientCalls = [];
    const calculationCalls = [];
    const localRegistry = new DomainRegistry();
    localRegistry.register(trackingDomainPack("kingclient", clientCalls));
    localRegistry.register(trackingDomainPack("kingcalculation", calculationCalls));
    const { tenant, workspace } = await seedWorkspace("new");
    const baseRevisionId = workspace.currentRevisionId;
    await prisma.solutionRevision.update({
      where: { id: baseRevisionId },
      data: {
        state: {
          schema: "kf-solution-revision-state/v1",
          projects: [
            {
              projectKey: "client-main",
              domainKind: "kingclient",
              projectIr: { marker: "client-main" },
            },
            {
              projectKey: "calculation-main",
              domainKind: "kingcalculation",
              projectIr: { marker: "calculation-main" },
            },
          ],
        },
      },
    });
    const clientPlan = await seedPlan(tenant.id, workspace.id);
    const calculationPlan = await seedPlan(tenant.id, workspace.id);
    const clientJob = await jobs.enqueue({
      ...seedInput({
        tenantId: tenant.id,
        workspaceId: workspace.id,
        baseRevisionId,
        changePlanId: clientPlan.plan.id,
        planHashValue: clientPlan.hash,
      }),
      domainKind: "kingclient",
      projectKey: "client-main",
    });
    const calculationJob = await jobs.enqueue({
      ...seedInput({
        tenantId: tenant.id,
        workspaceId: workspace.id,
        baseRevisionId,
        changePlanId: calculationPlan.plan.id,
        planHashValue: calculationPlan.hash,
      }),
      domainKind: "kingcalculation",
      projectKey: "calculation-main",
    });
    const executor = new BuildExecutor({ prisma, storage, registry: localRegistry });

    const firstLease = await jobs.leaseNext("stale-worker-a", new Date());
    expect(firstLease?.id).toBe(clientJob.id);
    expect((await executor.execute(firstLease)).status).toBe("SUCCEEDED");
    const afterFirst = await prisma.solutionWorkspace.findUnique({
      where: { id: workspace.id },
    });

    const secondLease = await jobs.leaseNext("stale-worker-b", new Date());
    expect(secondLease?.id).toBe(calculationJob.id);
    const secondDone = await executor.execute(secondLease);

    expect(secondDone.status).toBe("FAILED");
    expect((await prisma.solutionWorkspace.findUnique({
      where: { id: workspace.id },
    }))?.currentRevisionId).toBe(afterFirst?.currentRevisionId);
    expect(await prisma.solutionRevision.count({
      where: { workspaceId: workspace.id },
    })).toBe(2);
    expect(await prisma.domainProjectRevision.findMany({
      where: { solutionRevisionId: afterFirst?.currentRevisionId },
      select: { projectKey: true },
    })).toEqual([{ projectKey: "client-main" }]);
    expect(await prisma.artifact.count({ where: { buildJobId: calculationJob.id } })).toBe(0);
    const report = await prisma.validationReport.findFirst({
      where: { buildJobId: calculationJob.id },
    });
    expect(report).toMatchObject({
      outcome: "fail",
      summary: expect.stringContaining("stale base revision"),
    });
  });

  it("fails a create build instead of treating a malformed tagged envelope as legacy IR", async () => {
    const calls = [];
    const localRegistry = new DomainRegistry();
    localRegistry.register(trackingDomainPack("kingclient", calls));
    const { tenant, workspace } = await seedWorkspace("new");
    await prisma.solutionRevision.update({
      where: { id: workspace.currentRevisionId },
      data: {
        state: {
          schema: "kf-solution-revision-state/v1",
          projects: { projectKey: "client-main" },
        },
      },
    });
    const { plan, hash } = await seedPlan(tenant.id, workspace.id);
    const queued = await jobs.enqueue({
      ...seedInput({
        tenantId: tenant.id,
        workspaceId: workspace.id,
        baseRevisionId: workspace.currentRevisionId,
        changePlanId: plan.id,
        planHashValue: hash,
      }),
      projectKey: "client-main",
    });
    const leased = await jobs.leaseNext("malformed-create", new Date());
    const executor = new BuildExecutor({ prisma, storage, registry: localRegistry });

    expect((await executor.execute(leased)).status).toBe("FAILED");
    expect(await prisma.solutionRevision.count({
      where: { workspaceId: workspace.id },
    })).toBe(1);
    expect(await prisma.validationReport.findFirst({
      where: { buildJobId: queued.id },
    })).toMatchObject({
      outcome: "fail",
      summary: "构建执行未完成，请使用参考编号联系管理员。",
      details: { error: {
        code: "BUILD_EXECUTION_FAILED",
        message: "构建执行未完成，请使用参考编号联系管理员。",
        correlationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      } },
    });
  });

  it("fails a modify build when a tagged envelope project has an invalid shape", async () => {
    const calls = [];
    const localRegistry = new DomainRegistry();
    localRegistry.register(trackingDomainPack("kingclient", calls));
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
              projectIr: { marker: "client-main" },
            },
          ],
        },
      },
    });
    const builtRevisionId = await runProjectBuild({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      baseRevisionId: workspace.currentRevisionId,
      domainKind: "kingclient",
      projectKey: "client-main",
      localRegistry,
    });
    await prisma.solutionRevision.update({
      where: { id: builtRevisionId },
      data: {
        state: {
          schema: "kf-solution-revision-state/v1",
          projects: [{ projectKey: "client-main", projectIr: { marker: "client-main" } }],
        },
      },
    });
    const revisionCountBefore = await prisma.solutionRevision.count({
      where: { workspaceId: workspace.id },
    });
    const { plan, hash } = await seedPlan(tenant.id, workspace.id);
    const queued = await jobs.enqueue({
      ...seedInput({
        tenantId: tenant.id,
        workspaceId: workspace.id,
        baseRevisionId: builtRevisionId,
        changePlanId: plan.id,
        planHashValue: hash,
      }),
      projectKey: "client-main",
    });
    const leased = await jobs.leaseNext("malformed-modify", new Date());
    const executor = new BuildExecutor({ prisma, storage, registry: localRegistry });

    expect((await executor.execute(leased)).status).toBe("FAILED");
    expect(await prisma.solutionRevision.count({
      where: { workspaceId: workspace.id },
    })).toBe(revisionCountBefore);
    expect(await prisma.validationReport.findFirst({
      where: { buildJobId: queued.id },
    })).toMatchObject({
      outcome: "fail",
      summary: "构建执行未完成，请使用参考编号联系管理员。",
      details: { error: {
        code: "BUILD_EXECUTION_FAILED",
        message: "构建执行未完成，请使用参考编号联系管理员。",
        correlationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      } },
    });
  });

  it("rejects a successful commit when its projectKey belongs to another domain", async () => {
    const { tenant, workspace } = await seedWorkspace("new");
    const baseRevisionId = workspace.currentRevisionId;
    await prisma.domainProjectRevision.create({
      data: {
        tenantId: tenant.id,
        solutionRevisionId: baseRevisionId,
        projectKey: "shared",
        domainKind: "kingclient",
        kind: "client-package",
        packageHash: "client-hash",
        packageUrl: "client-package",
      },
    });
    const { plan, hash } = await seedPlan(tenant.id, workspace.id);
    const queued = await jobs.enqueue({
      ...seedInput({
        tenantId: tenant.id,
        workspaceId: workspace.id,
        baseRevisionId,
        changePlanId: plan.id,
        planHashValue: hash,
      }),
      projectKey: "shared",
      domainKind: "kingcalculation",
    });
    const leased = await jobs.leaseNext("domain-conflict", new Date());
    const done = await jobs.completeBuild({
      jobId: queued.id,
      tenantId: tenant.id,
      leaseOwner: leased.leaseOwner,
      leaseAttempt: leased.attemptCount,
      status: "SUCCEEDED",
      validationReport: { outcome: "pass", summary: "pass", details: {} },
      result: {
        kind: "built",
        state: { mode: "compile" },
        domainKind: "kingcalculation",
        domainProjectKind: "calculation-package",
        mediaType: "application/zip",
        fileExtension: ".zip",
        packageHash: "calculation-hash",
        packageUrl: "calculation-package",
        artifact: {
          kind: "calculation-package",
          mediaType: "application/zip",
          fileExtension: ".zip",
          storageKey: "calculation-package",
          sizeBytes: 4,
          sha256: "calculation-hash",
        },
      },
    });

    expect(done.status).toBe("FAILED");
    expect(await prisma.solutionRevision.count({
      where: { workspaceId: workspace.id },
    })).toBe(1);
    expect(await prisma.domainProjectRevision.findFirst({
      where: { solutionRevisionId: baseRevisionId, projectKey: "shared" },
    })).toMatchObject({ domainKind: "kingclient", packageUrl: "client-package" });
    expect(await prisma.validationReport.findFirst({
      where: { buildJobId: queued.id },
    })).toMatchObject({
      outcome: "fail",
      summary: expect.stringContaining("projectKey shared belongs to domain kingclient"),
    });
  });

  it("rejects a stored project/domain conflict before invoking the target DomainPack", async () => {
    const calls = [];
    const localRegistry = new DomainRegistry();
    localRegistry.register(trackingDomainPack("kingcalculation", calls));
    const { tenant, workspace } = await seedWorkspace("new");
    await prisma.domainProjectRevision.create({
      data: {
        tenantId: tenant.id,
        solutionRevisionId: workspace.currentRevisionId,
        projectKey: "shared",
        domainKind: "kingclient",
        kind: "client-package",
        packageHash: "client-hash",
        packageUrl: "client-package",
      },
    });
    const { plan, hash } = await seedPlan(tenant.id, workspace.id);
    const queued = await jobs.enqueue({
      ...seedInput({
        tenantId: tenant.id,
        workspaceId: workspace.id,
        baseRevisionId: workspace.currentRevisionId,
        changePlanId: plan.id,
        planHashValue: hash,
      }),
      projectKey: "shared",
      domainKind: "kingcalculation",
    });
    const leased = await jobs.leaseNext("executor-domain-conflict", new Date());
    const executor = new BuildExecutor({ prisma, storage, registry: localRegistry });

    expect((await executor.execute(leased)).status).toBe("FAILED");
    expect(calls).toEqual([]);
    expect(await prisma.validationReport.findFirst({
      where: { buildJobId: queued.id },
    })).toMatchObject({
      outcome: "fail",
      summary: "构建执行未完成，请使用参考编号联系管理员。",
      details: { error: {
        code: "BUILD_EXECUTION_FAILED",
        message: "构建执行未完成，请使用参考编号联系管理员。",
        correlationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      } },
    });
  });

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
