// Task 9 Step 6/7: worker execution chain and crash recovery.
// The crash-recovery test simulates a worker terminating after the artifact
// write but before the database commit, then retries with the same
// idempotency key and asserts exactly one successful revision and one final
// artifact.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:5432/kf_agent_test";

import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalArtifactStorage } from "@kf/artifact-storage";
import {
  BuildExecutor,
  BuildJobService,
  BuildWorkerCrash,
} from "@kf/build-jobs";
import {
  createKingClientDomainPack,
  deriveGuid,
  importNativeClientPackage,
  planHash,
  resolveVersionDirName,
} from "@kf/domain-client";
import { DomainRegistry } from "@kf/domain-registry";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { JobRunner } from "./job-runner.js";

let prisma: PrismaClient;
let jobs: BuildJobService;
let storage: LocalArtifactStorage;
let registry: DomainRegistry;
let counter = 0;

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
  prisma = new PrismaClient();
  storage = new LocalArtifactStorage(await mkdtemp(path.join(tmpdir(), "kf-worker-artifacts-")));
  registry = new DomainRegistry();
  registry.register(clientPack());
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

function clientPack() {
  return createKingClientDomainPack({ nativeAccepted: true });
}

const INITIAL_IR = {
  schema: "kf-client-project-ir/v1",
  id: "solution",
  name: "Solution",
  version: "1.0.0.1",
  pages: [
    {
      id: "page-home",
      name: "Page1",
      width: 1440,
      height: 900,
      controls: [
        { id: "Text1", type: "text", x: 40, y: 40, width: 120, height: 30, text: "Hello" },
      ],
    },
  ],
  variables: [],
  scripts: [],
};

interface Seeded {
  tenant: { id: string };
  workspace: { id: string };
  revision: { id: string };
  plan: { id: string };
  hash: string;
}

async function seedNewWorkspace(ir = INITIAL_IR): Promise<Seeded> {
  counter += 1;
  const suffix = `${Date.now()}-${counter}`;
  const tenant = await prisma.tenant.create({ data: { name: `W-Tenant-${suffix}` } });
  const workspace = await prisma.solutionWorkspace.create({
    data: { tenantId: tenant.id, name: `W-Workspace-${suffix}`, mode: "new" },
  });
  const revision = await prisma.solutionRevision.create({
    data: {
      tenantId: tenant.id,
      workspaceId: workspace.id,
      revisionNumber: 1,
      kind: "initial",
      state: ir,
    },
  });
  await prisma.solutionWorkspace.update({
    where: { id: workspace.id },
    data: { currentRevisionId: revision.id },
  });
  const planObj = {
    schema: "kf-change-plan/v1",
    workspaceId: workspace.id,
    operations: [
      {
        op: "update",
        entityId: deriveGuid({ seed: workspace.id }, "Text1"),
        entityType: "text",
        // Deliberately different from the compiled default ("Hello") so the
        // new-flow assertion can prove the confirmed plan really landed in
        // the build artifact (C1).
        changes: [{ path: "/text", value: "由 KF Solution Agent 生成" }],
      },
    ],
  };
  const hash = planHash(planObj);
  const plan = await prisma.changePlan.create({
    data: { tenantId: tenant.id, workspaceId: workspace.id, planHash: hash, plan: planObj },
  });
  return { tenant, workspace, revision, plan, hash };
}

function enqueueInput({ tenant, workspace, revision, plan, hash }: Seeded) {
  counter += 1;
  return {
    tenantId: tenant.id,
    workspaceId: workspace.id,
    baseRevisionId: revision.id,
    changePlanId: plan.id,
    planHash: hash,
    domainKind: "kingclient",
    idempotencyKey: `worker-idem-${Date.now()}-${counter}`,
  };
}

describe("job runner", () => {
  it("executes a new-flow build end to end and advances the revision", async () => {
    const { tenant, workspace, revision, plan, hash } = await seedNewWorkspace();
    const runner = new JobRunner({ prisma, storage, registry });
    await jobs.enqueue(enqueueInput({ tenant, workspace, revision, plan, hash }));

    const done = await runner.runOnce("worker-a", new Date());
    expect(done).not.toBeNull();
    expect(done!.status).toBe("SUCCEEDED");
    expect(done!.attemptCount).toBe(1);

    const built = await prisma.solutionRevision.findFirst({
      where: { workspaceId: workspace.id, kind: "built" },
    });
    expect(built).not.toBeNull();
    expect(built!.parentRevisionId).toBe(revision.id);

    const artifact = await prisma.artifact.findFirst({ where: { buildJobId: done!.id } });
    expect(artifact).not.toBeNull();
    expect(artifact!.kind).toBe("client-package");
    expect(artifact!.sha256).toMatch(/^[0-9a-f]{64}$/);

    const workspaceNow = await prisma.solutionWorkspace.findUnique({
      where: { id: workspace.id },
    });
    expect(workspaceNow!.currentRevisionId).toBe(built!.id);

    const packageBytes = await storage.open(tenant.id, artifact!.storageKey);
    const chunks = [];
    for await (const chunk of packageBytes) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const gz = Buffer.concat(chunks);
    expect(gz.length).toBe(artifact!.sizeBytes);

    // C1: the confirmed change plan must really be inside the new-flow build
    // artifact — unpack the .gz and assert the planned field value landed.
    const unpacked = await importNativeClientPackage(
      gz,
      await mkdtemp(path.join(tmpdir(), "kf-job-newflow-check-")),
    );
    const versionDir = await resolveVersionDirName(unpacked);
    const pageRoot = path.join(unpacked, versionDir, "project", "page");
    const pageFiles = await readdir(pageRoot);
    const pageFile = pageFiles.find((f) => f.endsWith(".json"));
    expect(pageFile).toBeTruthy();
    const page = JSON.parse(
      await readFile(path.join(pageRoot, pageFile!), "utf8"),
    ) as { objects: Array<Record<string, unknown>> };
    const textGuid = deriveGuid({ seed: workspace.id }, "Text1");
    const textControl = page.objects.find((obj) => obj["guid"] === textGuid);
    expect(textControl).toBeTruthy();
    expect(textControl!["text"]).toBe("由 KF Solution Agent 生成");
  });

  it("does not advance the revision or create an artifact on failure", async () => {
    const { tenant, workspace, revision, plan, hash } = await seedNewWorkspace({
      ...INITIAL_IR,
      pages: [], // invalid IR: compiler requires at least one page
    });
    const input = enqueueInput({ tenant, workspace, revision, plan, hash });
    const queued = await jobs.enqueue(input);
    const runner = new JobRunner({ prisma, storage, registry });

    const done = await runner.runOnce("worker-a", new Date());
    expect(done!.status).toBe("FAILED");

    const revisions = await prisma.solutionRevision.findMany({
      where: { workspaceId: workspace.id },
    });
    expect(revisions).toHaveLength(1); // only the initial revision

    const artifacts = await prisma.artifact.findMany({ where: { buildJobId: queued.id } });
    expect(artifacts).toHaveLength(0);

    const report = await prisma.validationReport.findFirst({ where: { buildJobId: queued.id } });
    expect(report).not.toBeNull();
    expect(report!.outcome).toBe("fail");
    expect(report!.details).toHaveProperty("error");
  });
});

describe("crash recovery (Step 7)", () => {
  it("recovers one revision and one final artifact when a worker dies after the artifact write", async () => {
    const { tenant, workspace, revision, plan, hash } = await seedNewWorkspace();
    const input = enqueueInput({ tenant, workspace, revision, plan, hash });
    const queued = await jobs.enqueue(input);
    const now = new Date();
    const leaseMs = 30_000;
    const afterLease = new Date(now.getTime() + leaseMs + 1_000);

    // Worker A claims the job and crashes right after the artifact is written
    // but before the database commit.
    const leased = await jobs.leaseNext("worker-a", now, leaseMs);
    expect(leased!.id).toBe(queued.id);
    const crashingExecutor = new BuildExecutor({
      prisma,
      storage,
      registry,
      hooks: {
        beforeCommit: async () => {
          throw new BuildWorkerCrash("simulated worker termination after artifact write");
        },
      },
    });
    await expect(crashingExecutor.execute(leased!)).rejects.toThrow(BuildWorkerCrash);

    // No revision and no artifact row were committed; the job is not terminal.
    const revisionsAfterCrash = await prisma.solutionRevision.findMany({
      where: { workspaceId: workspace.id },
    });
    expect(revisionsAfterCrash).toHaveLength(1);
    const artifactsAfterCrash = await prisma.artifact.findMany({
      where: { buildJobId: queued.id },
    });
    expect(artifactsAfterCrash).toHaveLength(0);
    const crashedJob = await prisma.buildJob.findUnique({ where: { id: queued.id } });
    expect(["QUEUED", "RUNNING", "VALIDATING"]).toContain(crashedJob!.status);

    // Retry with the same idempotency key returns the same job; it becomes
    // claimable only after the lease expires.
    const sameKey = await jobs.enqueue(input);
    expect(sameKey.id).toBe(queued.id);
    expect(await jobs.leaseNext("worker-b", now)).toBeNull();

    const reclaimed = await jobs.leaseNext("worker-b", afterLease);
    expect(reclaimed!.id).toBe(queued.id);
    expect(reclaimed!.attemptCount).toBe(2);

    const executor = new BuildExecutor({ prisma, storage, registry });
    const done = await executor.execute(reclaimed!);
    expect(done.status).toBe("SUCCEEDED");

    // Exactly one successful revision and one final artifact.
    const built = await prisma.solutionRevision.findMany({
      where: { workspaceId: workspace.id, kind: "built" },
    });
    expect(built).toHaveLength(1);
    const artifacts = await prisma.artifact.findMany({ where: { buildJobId: queued.id } });
    expect(artifacts).toHaveLength(1);

    const workspaceNow = await prisma.solutionWorkspace.findUnique({
      where: { id: workspace.id },
    });
    expect(workspaceNow!.currentRevisionId).toBe(built[0]!.id);
  });
});
