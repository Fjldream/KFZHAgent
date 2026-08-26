// Concurrency integration tests for BuildJobService leasing.
//
// The core guarantee under test: at most one build job of a given workspace
// may be RUNNING at any moment, even when two workers concurrently attempt to
// claim two QUEUED jobs of the same workspace. A READ COMMITTED snapshot
// cannot see another transaction's uncommitted RUNNING update, so the naive
// `NOT EXISTS` guard races; `pg_advisory_xact_lock(workspaceId)` serializes
// the claim decision per workspace.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:5432/kf_agent_test";

import { PrismaClient, type BuildJob } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  BuildJobService,
  type BuildJobServiceDebugHooks,
} from "./build-job.service.js";

let prisma: PrismaClient;
let jobs: BuildJobService;
let counter = 0;

const TABLES = [
  "AuditLog",
  "ValidationReport",
  "Artifact",
  "BuildSchedulerCursor",
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
  prisma = new PrismaClient();
  jobs = new BuildJobService(prisma, 30_000);
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  for (const table of TABLES) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
  }
});

interface Seed {
  tenantId: string;
  workspaceId: string;
  revisionId: string;
  planId: string;
}

async function seedWorkspace(): Promise<Seed> {
  counter += 1;
  const suffix = `${Date.now()}-${counter}`;
  const tenant = await prisma.tenant.create({ data: { name: `Race-Tenant-${suffix}` } });
  const workspace = await prisma.solutionWorkspace.create({
    data: { tenantId: tenant.id, name: `Race-Workspace-${suffix}`, mode: "new" },
  });
  const revision = await prisma.solutionRevision.create({
    data: {
      tenantId: tenant.id,
      workspaceId: workspace.id,
      revisionNumber: 1,
      kind: "initial",
      state: { schema: "kf-client-project-ir/v1", id: "s", name: "s", pages: [] },
    },
  });
  await prisma.solutionWorkspace.update({
    where: { id: workspace.id },
    data: { currentRevisionId: revision.id },
  });
  const plan = await prisma.changePlan.create({
    data: {
      tenantId: tenant.id,
      workspaceId: workspace.id,
      planHash: "hash",
      plan: { schema: "kf-change-plan/v1", workspaceId: workspace.id, operations: [] },
    },
  });
  return { tenantId: tenant.id, workspaceId: workspace.id, revisionId: revision.id, planId: plan.id };
}

async function enqueueQueued(seed: Seed, key: string): Promise<BuildJob> {
  return prisma.buildJob.create({
    data: {
      tenantId: seed.tenantId,
      workspaceId: seed.workspaceId,
      baseRevisionId: seed.revisionId,
      changePlanId: seed.planId,
      planHash: "hash",
      domainKind: "kingclient",
      idempotencyKey: key,
      status: "QUEUED",
    },
  });
}

function withWidenedRaceWindow(): BuildJobService {
  const hooks: BuildJobServiceDebugHooks = {
    // Both concurrent transactions pause here with their candidate row locked
    // but before the RUNNING UPDATE, maximizing the READ COMMITTED window in
    // which neither can see the other's uncommitted claim.
    beforeClaim: async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    },
  };
  return new BuildJobService(prisma, 30_000, hooks);
}

describe("BuildJobService lease concurrency", () => {
  it("claims only one job per workspace when two workers race on two QUEUED jobs", async () => {
    const seed = await seedWorkspace();
    await enqueueQueued(seed, `race-a-${counter}`);
    await enqueueQueued(seed, `race-b-${counter}`);
    const racing = withWidenedRaceWindow();
    const now = new Date();

    const results = await Promise.all([
      racing.leaseNext("worker-a", now),
      racing.leaseNext("worker-b", now),
    ]);

    const claimed = results.filter((job): job is BuildJob => job !== null);
    expect(claimed).toHaveLength(1);

    const running = await prisma.buildJob.count({
      where: { workspaceId: seed.workspaceId, status: "RUNNING" },
    });
    expect(running).toBe(1);
  });

  it("still lets different workspaces be claimed concurrently", async () => {
    const seedA = await seedWorkspace();
    const seedB = await seedWorkspace();
    await enqueueQueued(seedA, `race-c-${counter}`);
    await enqueueQueued(seedB, `race-d-${counter}`);
    const racing = withWidenedRaceWindow();
    const now = new Date();

    const results = await Promise.all([
      racing.leaseNext("worker-a", now),
      racing.leaseNext("worker-b", now),
    ]);

    const claimed = results.filter((job): job is BuildJob => job !== null);
    expect(claimed).toHaveLength(2);
    const workspaceIds = new Set(claimed.map((job) => job.workspaceId));
    expect(workspaceIds.size).toBe(2);
  });

  it("returns null for a second worker while the first lease is still live", async () => {
    const seed = await seedWorkspace();
    const job = await enqueueQueued(seed, `race-e-${counter}`);
    const now = new Date();

    const first = await jobs.leaseNext("worker-a", now);
    expect(first?.id).toBe(job.id);
    expect(await jobs.leaseNext("worker-b", now)).toBeNull();

    const afterLease = new Date(now.getTime() + 31_000);
    expect((await jobs.leaseNext("worker-b", afterLease))?.id).toBe(job.id);
  });

  it("keeps lease query count and latency bounded across a thousand multi-tenant workspaces", async () => {
    await prisma.$executeRawUnsafe(`
      INSERT INTO "BuildJob" (
        "id", "tenantId", "workspaceId", "baseRevisionId", "changePlanId",
        "planHash", "projectKey", "domainKind", "idempotencyKey", "status",
        "leaseOwner", "leaseExpiresAt", "attemptCount", "createdAt", "updatedAt"
      )
      SELECT
        'scale-job-' || n,
        CASE WHEN n % 2 = 0 THEN 'scale-tenant-a' ELSE 'scale-tenant-b' END,
        'scale-workspace-' || n,
        'scale-revision-' || n,
        'scale-plan-' || n,
        'hash',
        'kingclient',
        'kingclient',
        'scale-key-' || n,
        'QUEUED'::"JobStatus",
        NULL,
        NULL,
        0,
        clock_timestamp() + (n * interval '1 millisecond'),
        clock_timestamp()
      FROM generate_series(1, 1000) AS n
    `);

    const observed = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
    const queries: string[] = [];
    observed.$on("query", (event) => queries.push(event.query));
    const scaledJobs = new BuildJobService(observed, 30_000);
    const startedAt = performance.now();
    try {
      const claimed = (await Promise.all(
        Array.from({ length: 4 }, (_, index) => scaledJobs.leaseNext(`scale-worker-${index}`, new Date())),
      )).filter((job): job is BuildJob => job !== null);
      const elapsedMs = performance.now() - startedAt;

      expect(claimed).toHaveLength(4);
      expect(new Set(claimed.map((job) => job.workspaceId)).size).toBe(4);
      expect(new Set(claimed.map((job) => job.tenantId))).toEqual(
        new Set(["scale-tenant-a", "scale-tenant-b"]),
      );
      expect(queries.length).toBeLessThanOrEqual(100);
      expect(elapsedMs).toBeLessThan(3_000);
    } finally {
      await observed.$disconnect();
    }
  });

  it("rotates to a quiet tenant despite an older noisy-tenant backlog", async () => {
    await prisma.$executeRawUnsafe(`
      INSERT INTO "BuildJob" (
        "id", "tenantId", "workspaceId", "baseRevisionId", "changePlanId",
        "planHash", "projectKey", "domainKind", "idempotencyKey", "status",
        "leaseOwner", "leaseExpiresAt", "attemptCount", "createdAt", "updatedAt"
      )
      SELECT
        'fair-noisy-job-' || n, 'fair-tenant-a', 'fair-noisy-workspace-' || n,
        'fair-revision-' || n, 'fair-plan-' || n, 'hash', 'kingclient', 'kingclient',
        'fair-noisy-key-' || n, 'QUEUED'::"JobStatus", NULL, NULL, 0,
        clock_timestamp() - interval '1 hour' + (n * interval '1 millisecond'),
        clock_timestamp()
      FROM generate_series(1, 24) AS n
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "BuildJob" (
        "id", "tenantId", "workspaceId", "baseRevisionId", "changePlanId",
        "planHash", "projectKey", "domainKind", "idempotencyKey", "status",
        "leaseOwner", "leaseExpiresAt", "attemptCount", "createdAt", "updatedAt"
      ) VALUES (
        'fair-quiet-job', 'fair-tenant-z', 'fair-quiet-workspace', 'fair-quiet-revision',
        'fair-quiet-plan', 'hash', 'kingclient', 'kingclient', 'fair-quiet-key',
        'QUEUED', NULL, NULL, 0, clock_timestamp(), clock_timestamp()
      )
    `);

    const first = await jobs.leaseNext("fair-worker-a", new Date());
    const second = await jobs.leaseNext("fair-worker-b", new Date());

    expect(first?.tenantId).toBe("fair-tenant-a");
    expect(second?.tenantId).toBe("fair-tenant-z");
  });
});
