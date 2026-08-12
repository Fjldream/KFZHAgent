// Task 9 Step 6/7: worker execution chain and crash recovery.
// The crash-recovery test simulates a worker terminating after the artifact
// write but before the database commit, then retries with the same
// idempotency key and asserts exactly one successful revision and one final
// artifact.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:5432/kf_agent_test";

import { cp, mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { LocalArtifactStorage, type ArtifactStorage, type StoredArtifact } from "@kf/artifact-storage";
import { ModulePlanSchema, workspaceAssetIdToModelId, type ModulePlan } from "@kf/contracts";
import {
  BuildExecutor,
  BuildJobService,
  BuildWorkerCrash,
  createHmacServerPlanAuthority,
} from "@kf/build-jobs";
import {
  compileUiImplementation,
  compileModulePlan,
  createDefaultModuleRegistry,
  createKingClientDomainPack,
  deriveGuid,
  importNativeClientPackage,
  inspectClientProject,
  packageNativeClientProject,
  applyClientPatch,
  planHash,
  resolveVersionDirName,
  validateClientProject,
} from "@kf/domain-client";
import { DomainRegistry } from "@kf/domain-registry";
import { PrismaClient, type Prisma } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { JobRunner } from "./job-runner.js";
import {
  acceptedArtifactForPlan,
  verifiedCompilationFor,
} from "../../../packages/domain-client/src/modules/testing/module-artifact-test-helpers.js";

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
  "WorkspaceAsset",
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

const GOLDEN_CAPABILITIES = [
  "layout.2", "text", "button", "image", "tabs", "input", "tag", "easyui.1",
  "prototype.TrendChart", "prototype.BarChart", "prototype.PieChart",
] as const;

async function readGoldenPlan(name: string): Promise<ModulePlan> {
  const url = new URL(`../../../tests/fixtures/module-plans/${name}.json`, import.meta.url);
  return ModulePlanSchema.parse(JSON.parse(await readFile(url, "utf8")) as unknown);
}

async function goldenBaseWorkspace(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "kf-module-golden-base-"));
  await cp(new URL("../../../tests/fixtures/client-unknown-field/", import.meta.url), root, { recursive: true });
  return root;
}

async function buildGoldenPackage(name: string) {
  const plan = await readGoldenPlan(name);
  const registry = createDefaultModuleRegistry();
  const assetBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const sha256 = createHash("sha256").update(assetBytes).digest("hex");
  const approvedAssetsById = Object.fromEntries(plan.assets.map((asset) => [asset.id, {
    workspaceAssetId: "00000000-0000-4000-8000-000000000001",
    targetPath: `static/agent-assets/${sha256}.png`, mediaType: "image/png" as const, sha256, sizeBytes: assetBytes.byteLength,
  }]));
  const assetsById = Object.fromEntries(plan.assets.map((asset) => [asset.id, { assetId: asset.id, status: "resolved" as const, resolvedName: asset.name }]));
  const compiled = compileModulePlan({
    plan, acceptedBlueprintArtifact: acceptedArtifactForPlan(plan, registry), registry, assetsById, approvedAssetsById,
    validationContext: { availableKfCapabilities: GOLDEN_CAPABILITIES, approvedAuthorizationRefs: [] },
  });
  const assetTargetPath = `static/agent-assets/${sha256}.png`;
  if (compiled.status !== "compiled") return { plan, compiled, assetBytes, assetTargetPath, sha256 };
  const implementation = compileUiImplementation(compiled.implementation, {
    workspaceId: "00000000-0000-4000-8000-000000000013", pageGuidById: { Page1: "page-guid-1" },
    existingControlGuidByComponentId: {}, existingControlCapabilityIdByComponentId: {},
    moduleCompilationArtifact: verifiedCompilationFor(compiled),
  });
  const base = await goldenBaseWorkspace();
  const domainAssets = plan.assets.map((asset) => ({
    assetId: asset.id, targetPath: assetTargetPath, mediaType: "image/png", sha256, bytes: assetBytes,
  }));
  const candidate = await applyClientPatch(base, implementation.plan, { semanticOperations: implementation.semanticOperations, assets: domainAssets });
  const validation = await validateClientProject(base, candidate, implementation.plan, { assetTargetPaths: domainAssets.map((asset) => asset.targetPath) });
  const bytes = await packageNativeClientProject(candidate.rootDir);
  return { plan, compiled, implementation, candidate, validation, bytes, assetBytes, assetTargetPath, sha256 };
}

function containsDirectProperty(value: unknown, key: string, expected: unknown): boolean {
  if (Array.isArray(value)) return value.some((entry) => containsDirectProperty(entry, key, expected));
  if (value === null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record[key] === expected || Object.values(record).some((entry) => containsDirectProperty(entry, key, expected));
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

async function seedSignedAssetBuild() {
  const seeded = await seedNewWorkspace({
    ...INITIAL_IR,
    pages: [{
      ...INITIAL_IR.pages[0]!,
      controls: [{
        id: "Portrait", type: "image", x: 40, y: 40, width: 160, height: 160, src: "asset",
      }] as unknown as typeof INITIAL_IR.pages[0]["controls"],
    }],
  });
  const bytes = Buffer.from("approved worker asset bytes");
  const stored = await storage.put({
    tenantId: seeded.tenant.id,
    kind: "workspace-asset",
    stream: Readable.from([bytes]),
    maxBytes: 1024,
  });
  const row = await prisma.workspaceAsset.create({
    data: {
      tenantId: seeded.tenant.id,
      workspaceId: seeded.workspace.id,
      type: "image",
      name: "portrait.png",
      mediaType: "image/png",
      storageKey: stored.artifactId,
      sha256: stored.sha256,
      sizeBytes: stored.size,
      width: 1,
      height: 1,
      tags: [],
    },
  });
  const assetId = workspaceAssetIdToModelId(row.id);
  const targetPath = `static/agent-assets/${stored.sha256}.png`;
  const portraitGuid = deriveGuid({ seed: seeded.workspace.id }, "Portrait");
  const authority = createHmacServerPlanAuthority(Buffer.alloc(32, 0x62));
  const internalPlan = {
    schema: "kf-change-plan/v1" as const,
    workspaceId: seeded.workspace.id,
    operations: [{
      op: "update" as const,
      entityType: "control",
      entityId: portraitGuid,
      changes: [{ path: "/src", value: `static/agent-assets/pending-${assetId}` }],
    }],
    assetBindings: [{
      assetId,
      workspaceAssetId: row.id,
      entityId: portraitGuid,
      controlId: "Portrait",
      capabilityId: "image" as const,
      targetPath,
      mediaType: "image/png" as const,
      sha256: stored.sha256,
      sizeBytes: stored.size,
    }],
  };
  const envelope = authority.sign({ plan: internalPlan, revisionId: seeded.revision.id, semanticOperations: [] });
  await prisma.changePlan.update({
    where: { id: seeded.plan.id },
    data: { planHash: envelope.planHash, plan: envelope as Prisma.InputJsonValue },
  });
  return { seeded: { ...seeded, hash: envelope.planHash }, authority, row, bytes, targetPath };
}

async function expectAssetBuildNotAdvanced(input: Awaited<ReturnType<typeof seedSignedAssetBuild>>): Promise<void> {
  const queued = await jobs.enqueue(enqueueInput(input.seeded));
  const leased = await jobs.leaseNext(`asset-tamper-${++counter}`, new Date());
  const executor = new BuildExecutor({ prisma, storage, registry, serverPlanVerifier: input.authority });
  expect((await executor.execute(leased!)).status).toBe("FAILED");
  expect(await prisma.solutionRevision.count({ where: { workspaceId: input.seeded.workspace.id } })).toBe(1);
  expect(await prisma.artifact.count({ where: { buildJobId: queued.id } })).toBe(0);
  expect((await prisma.solutionWorkspace.findUnique({ where: { id: input.seeded.workspace.id } }))?.currentRevisionId)
    .toBe(input.seeded.revision.id);
}

class TrackingStorage implements ArtifactStorage {
  readonly deleted: Array<{ tenantId: string; artifactId: string }> = [];
  failDelete = false;

  constructor(private readonly inner: LocalArtifactStorage) {}

  put(input: {
    tenantId: string;
    kind: string;
    stream: NodeJS.ReadableStream;
    maxBytes: number;
  }): Promise<StoredArtifact> {
    return this.inner.put(input);
  }

  open(tenantId: string, artifactId: string): Promise<NodeJS.ReadableStream> {
    return this.inner.open(tenantId, artifactId);
  }

  async delete(tenantId: string, artifactId: string): Promise<void> {
    this.deleted.push({ tenantId, artifactId });
    if (this.failDelete) throw new Error("tracking delete failed");
    await this.inner.delete(tenantId, artifactId);
  }
}

async function advanceWorkspacePastBase(seeded: Seeded): Promise<void> {
  const competing = await prisma.solutionRevision.create({
    data: {
      tenantId: seeded.tenant.id,
      workspaceId: seeded.workspace.id,
      revisionNumber: 2,
      kind: "built",
      parentRevisionId: seeded.revision.id,
      state: INITIAL_IR,
    },
  });
  await prisma.solutionWorkspace.update({
    where: { id: seeded.workspace.id },
    data: { currentRevisionId: competing.id },
  });
}

describe("job runner", () => {
  it.each(["personal-portal", "admin-console"])("packages the %s golden into a native round-trip artifact", async (name) => {
    const built = await buildGoldenPackage(name);
    expect(built.compiled.status).toBe("compiled");
    if (built.compiled.status !== "compiled" || !("bytes" in built)) return;
    expect(built.validation).toBeDefined();
    if (built.validation === undefined) return;
    expect(built.validation.status, built.validation.warnings.join("\n")).toBe("pass");
    expect(built.bytes.byteLength).toBeGreaterThan(0);
    const evidenceRoot = process.env.KF_GOLDEN_OUTPUT_DIR;
    if (evidenceRoot !== undefined) {
      await mkdir(evidenceRoot, { recursive: true });
      await writeFile(path.join(evidenceRoot, `${name}.gz`), built.bytes);
    }
    const unpacked = await importNativeClientPackage(built.bytes, await mkdtemp(path.join(tmpdir(), `kf-${name}-roundtrip-`)));
    const inspection = await inspectClientProject(unpacked);
    const controls = Object.values(inspection.index.controls);
    for (const module of built.plan.pages.flatMap((page) => page.modules)) {
      expect(controls.some((control) => control.id.startsWith(`${module.id}/`)), `missing ${module.id}`).toBe(true);
    }
    for (const asset of built.plan.assets) {
      expect(built.compiled.assetBindings).toContainEqual(expect.objectContaining({ assetId: asset.id }));
    }
    if (name === "personal-portal") {
      const versionDir = await resolveVersionDirName(unpacked);
      const materialized = await readFile(path.join(unpacked, versionDir, built.assetTargetPath));
      expect(materialized).toEqual(built.assetBytes);
      expect(createHash("sha256").update(materialized).digest("hex")).toBe(built.sha256);
      expect(containsDirectProperty(inspection.raw.pages, "src", built.assetTargetPath)).toBe(true);
    }
  });

  it("refuses to package the dashboard chart golden until its exact native series mapping is verified", async () => {
    const built = await buildGoldenPackage("industrial-dashboard");
    expect(built.compiled.status).toBe("blocked");
    expect(built.compiled.gaps).toContainEqual(expect.objectContaining({
      moduleId: "dashboard-chart", severity: "blocking", reason: "kf36-static-chart-series-mapping-unverified",
    }));
    expect("bytes" in built).toBe(false);
  });

  it("builds a complete multi-module implementation into the native client package", async () => {
    const seeded = await seedNewWorkspace();
    const moduleIds = ["brand", "overview", "skills", "experience", "projects", "about", "contact"];
    const compiled = compileUiImplementation({
      schema: "kf-ui-implementation/v1",
      theme: {
        background: "#0f172a",
        surface: "#111827",
        primary: "#2563eb",
        accent: "#38bdf8",
        textPrimary: "#f8fafc",
        textSecondary: "#cbd5e1",
        fontFamily: "Arial",
        spacingUnit: 8,
        radiusScale: { small: 4, medium: 8, large: 16 },
      },
      pages: [{
        id: "Page1",
        width: 1440,
        height: 900,
        components: moduleIds.map((sectionId, index) => ({
          id: index === 0 ? "Text1" : sectionId,
          role: "section-heading",
          capabilityId: "text",
          critical: true,
          content: `${sectionId} 内容`,
          geometry: { x: 60, y: 60 + index * 100, width: 420, height: 48 },
          properties: {},
          style: {
            declarations: { fontSize: 24, textColor: "{theme.textPrimary}" },
            states: {},
          },
        })),
      }],
    }, {
      workspaceId: seeded.workspace.id,
      pageGuidById: { Page1: `k${deriveGuid({ seed: seeded.workspace.id }, "Page1")}` },
      existingControlGuidByComponentId: {
        Text1: deriveGuid({ seed: seeded.workspace.id }, "Text1"),
      },
      existingControlCapabilityIdByComponentId: { Text1: "text" },
    });
    const hash = planHash(compiled.plan);
    await prisma.changePlan.update({
      where: { id: seeded.plan.id },
      data: { planHash: hash, plan: compiled.plan as Prisma.InputJsonValue },
    });
    seeded.hash = hash;

    const runner = new JobRunner({ prisma, storage, registry });
    await jobs.enqueue(enqueueInput(seeded));
    const done = await runner.runOnce("worker-multi-module", new Date());
    expect(done?.status).toBe("SUCCEEDED");

    const artifact = await prisma.artifact.findFirst({ where: { buildJobId: done!.id } });
    const packageStream = await storage.open(seeded.tenant.id, artifact!.storageKey);
    const chunks: Buffer[] = [];
    for await (const chunk of packageStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const unpacked = await importNativeClientPackage(
      Buffer.concat(chunks),
      await mkdtemp(path.join(tmpdir(), "kf-job-multi-module-check-")),
    );
    const versionDir = await resolveVersionDirName(unpacked);
    const pageRoot = path.join(unpacked, versionDir, "project", "page");
    const pageFile = (await readdir(pageRoot)).find((file) => file.endsWith(".json"));
    const page = JSON.parse(await readFile(path.join(pageRoot, pageFile!), "utf8")) as {
      objects: Array<Record<string, unknown>>;
    };
    expect(page.objects).toHaveLength(moduleIds.length);
    for (const moduleId of moduleIds) {
      expect(page.objects.some((object) => object["text"] === `${moduleId} 内容`)).toBe(true);
    }
    expect(page.objects.every((object) => typeof object["styleDataNew"] === "string")).toBe(true);
  });

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

  it("renews a fenced lease while a legitimate build runs longer than its TTL", async () => {
    const seeded = await seedNewWorkspace();
    const queued = await jobs.enqueue(enqueueInput(seeded));
    const leaseMs = 120;
    const leased = await jobs.leaseNext("slow-worker", new Date(), leaseMs);
    const real = clientPack();
    const slowRegistry = new DomainRegistry();
    slowRegistry.register({
      ...real,
      package: async (input) => {
        await new Promise((resolve) => setTimeout(resolve, leaseMs * 2));
        return real.package(input);
      },
    });
    const executor = new BuildExecutor({
      prisma,
      storage,
      registry: slowRegistry,
      leaseMs,
    });

    const done = await executor.execute(leased!);

    expect(done).toMatchObject({ id: queued.id, status: "SUCCEEDED", attemptCount: 1 });
    expect(await prisma.solutionRevision.count({ where: { workspaceId: seeded.workspace.id } }))
      .toBe(2);
    expect(await prisma.artifact.count({ where: { buildJobId: queued.id } })).toBe(1);
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

  it("removes executor-owned workspaces after a successful package is durably adopted", async () => {
    const seeded = await seedNewWorkspace();
    await jobs.enqueue(enqueueInput(seeded));
    const leased = await jobs.leaseNext("success-workspace-cleanup", new Date());
    const workRoot = await mkdtemp(path.join(tmpdir(), "kf-worker-success-root-"));
    const executor = new BuildExecutor({ prisma, storage, registry, workRoot });

    expect((await executor.execute(leased!)).status).toBe("SUCCEEDED");
    expect(await readdir(workRoot)).toEqual([]);
  });

  it("removes executor-owned workspaces when validation rejects the candidate", async () => {
    const seeded = await seedNewWorkspace();
    await jobs.enqueue(enqueueInput(seeded));
    const leased = await jobs.leaseNext("failed-workspace-cleanup", new Date());
    const workRoot = await mkdtemp(path.join(tmpdir(), "kf-worker-failure-root-"));
    const real = clientPack();
    const rejectingRegistry = new DomainRegistry();
    rejectingRegistry.register({
      ...real,
      validate: async () => ({
        status: "fail" as const,
        warnings: ["forced validation failure"],
        checks: {
          packageStructure: "pass" as const,
          jsonSchema: "pass" as const,
          references: "pass" as const,
          businessRules: "fail" as const,
          changeScope: "pass" as const,
          roundTrip: "pass" as const,
        },
      }),
    });
    const executor = new BuildExecutor({ prisma, storage, registry: rejectingRegistry, workRoot });

    expect((await executor.execute(leased!)).status).toBe("FAILED");
    expect(await readdir(workRoot)).toEqual([]);
  });

  it("fails a signed build with a deleted asset without advancing the workspace revision", async () => {
    const seeded = await seedNewWorkspace();
    const authority = createHmacServerPlanAuthority(Buffer.alloc(32, 0x61));
    const missingAssetId = "asset-00000000000040008000000000000001";
    const missingAssetSha = "1".repeat(64);
    const internalPlan = {
      schema: "kf-change-plan/v1" as const,
      workspaceId: seeded.workspace.id,
      operations: [],
      assetBindings: [{
        assetId: missingAssetId,
        workspaceAssetId: "00000000-0000-4000-8000-000000000001",
        entityId: "missing-image",
        controlId: "missing-image",
        capabilityId: "image" as const,
        targetPath: `static/agent-assets/${missingAssetSha}.png`,
        mediaType: "image/png" as const,
        sha256: missingAssetSha,
        sizeBytes: 1,
      }],
    };
    const envelope = authority.sign({
      plan: internalPlan,
      revisionId: seeded.revision.id,
      semanticOperations: [],
    });
    await prisma.changePlan.update({
      where: { id: seeded.plan.id },
      data: { planHash: envelope.planHash, plan: envelope as Prisma.InputJsonValue },
    });
    const queued = await jobs.enqueue(enqueueInput({ ...seeded, hash: envelope.planHash }));
    const leased = await jobs.leaseNext("missing-asset-worker", new Date());
    const executor = new BuildExecutor({
      prisma,
      storage,
      registry,
      serverPlanVerifier: authority,
    });

    expect((await executor.execute(leased!)).status).toBe("FAILED");
    expect(await prisma.solutionRevision.count({ where: { workspaceId: seeded.workspace.id } })).toBe(1);
    expect(await prisma.artifact.count({ where: { buildJobId: queued.id } })).toBe(0);
    expect((await prisma.solutionWorkspace.findUnique({ where: { id: seeded.workspace.id } }))?.currentRevisionId)
      .toBe(seeded.revision.id);
    expect((await prisma.validationReport.findFirst({ where: { buildJobId: queued.id } }))?.details)
      .toEqual(expect.objectContaining({
        error: expect.objectContaining({ message: expect.stringMatching(/asset.*missing|missing.*asset/i) }),
      }));
  });

  it("materializes a fully signed workspace asset through the production worker", async () => {
    const input = await seedSignedAssetBuild();
    const queued = await jobs.enqueue(enqueueInput(input.seeded));
    const leased = await jobs.leaseNext("signed-asset-worker", new Date());
    const executor = new BuildExecutor({ prisma, storage, registry, serverPlanVerifier: input.authority });

    expect((await executor.execute(leased!)).status).toBe("SUCCEEDED");
    expect(await prisma.solutionRevision.count({ where: { workspaceId: input.seeded.workspace.id } })).toBe(2);
    expect(await prisma.artifact.count({ where: { buildJobId: queued.id } })).toBe(1);
    const artifact = await prisma.artifact.findFirstOrThrow({ where: { buildJobId: queued.id } });
    const packageBytes = await collect(await storage.open(input.seeded.tenant.id, artifact.storageKey));
    const unpacked = await importNativeClientPackage(packageBytes, await mkdtemp(path.join(tmpdir(), "kf-worker-asset-check-")));
    const versionDir = await resolveVersionDirName(unpacked);
    expect(await readFile(path.join(unpacked, versionDir, input.targetPath))).toEqual(input.bytes);
  });

  it("fails closed if signed workspace asset metadata is replaced after confirmation", async () => {
    const input = await seedSignedAssetBuild();
    const replacement = Buffer.from("replacement internally consistent bytes");
    const stored = await storage.put({
      tenantId: input.seeded.tenant.id,
      kind: "workspace-asset",
      stream: Readable.from([replacement]),
      maxBytes: 1024,
    });
    await prisma.workspaceAsset.update({
      where: { id: input.row.id },
      data: { storageKey: stored.artifactId, sha256: stored.sha256, sizeBytes: stored.size },
    });

    await expectAssetBuildNotAdvanced(input);
  });

  it("fails closed if the private blob is replaced behind unchanged signed metadata", async () => {
    const input = await seedSignedAssetBuild();
    const stored = await storage.put({
      tenantId: input.seeded.tenant.id,
      kind: "workspace-asset",
      stream: Readable.from([Buffer.from("tampered blob")]),
      maxBytes: 1024,
    });
    await prisma.workspaceAsset.update({
      where: { id: input.row.id },
      data: { storageKey: stored.artifactId },
    });

    await expectAssetBuildNotAdvanced(input);
  });

  it("deletes the stored blob when a stale completion does not adopt it", async () => {
    const seeded = await seedNewWorkspace();
    const queued = await jobs.enqueue(enqueueInput(seeded));
    const leased = await jobs.leaseNext("stale-blob", new Date());
    let stored: StoredArtifact | undefined;
    const executor = new BuildExecutor({
      prisma,
      storage,
      registry,
      hooks: {
        beforeCommit: async (artifact) => {
          stored = artifact;
          await advanceWorkspacePastBase(seeded);
        },
      },
    });

    expect((await executor.execute(leased!)).status).toBe("FAILED");
    expect(await prisma.artifact.count({ where: { buildJobId: queued.id } })).toBe(0);
    expect(stored).toBeDefined();
    await expect(storage.open(seeded.tenant.id, stored!.artifactId)).rejects.toThrow(
      "ARTIFACT_NOT_FOUND",
    );
  });

  it("does not let a cleanup delete error replace the stale completion result", async () => {
    const seeded = await seedNewWorkspace();
    await jobs.enqueue(enqueueInput(seeded));
    const leased = await jobs.leaseNext("delete-failure", new Date());
    const tracking = new TrackingStorage(storage);
    tracking.failDelete = true;
    let stored: StoredArtifact | undefined;
    const executor = new BuildExecutor({
      prisma,
      storage: tracking,
      registry,
      hooks: {
        beforeCommit: async (artifact) => {
          stored = artifact;
          await advanceWorkspacePastBase(seeded);
        },
      },
    });

    expect((await executor.execute(leased!)).status).toBe("FAILED");
    expect(tracking.deleted).toEqual([
      { tenantId: seeded.tenant.id, artifactId: stored!.artifactId },
    ]);
    expect(await collect(await tracking.open(seeded.tenant.id, stored!.artifactId)))
      .not.toHaveLength(0);
  });

  it("deletes a losing blob when another completion already made the job terminal", async () => {
    const seeded = await seedNewWorkspace();
    const queued = await jobs.enqueue(enqueueInput(seeded));
    const leased = await jobs.leaseNext("terminal-loser", new Date());
    await jobs.completeBuild({
      jobId: queued.id,
      tenantId: seeded.tenant.id,
      leaseOwner: leased!.leaseOwner!,
      leaseAttempt: leased!.attemptCount,
      status: "SUCCEEDED",
      validationReport: { outcome: "pass", summary: "winner", details: {} },
      result: {
        kind: "built",
        state: { mode: "compile" },
        domainKind: "kingclient",
        domainProjectKind: "client-package",
        mediaType: "application/zip",
        fileExtension: ".gz",
        packageHash: "winner-hash",
        packageUrl: "winner-storage-key",
        artifact: {
          kind: "client-package",
          mediaType: "application/zip",
          fileExtension: ".gz",
          storageKey: "winner-storage-key",
          sizeBytes: 4,
          sha256: "winner-hash",
        },
      },
    });
    let losingArtifact: StoredArtifact | undefined;
    const executor = new BuildExecutor({
      prisma,
      storage,
      registry,
      hooks: {
        beforeCommit: async (artifact) => {
          losingArtifact = artifact;
        },
      },
    });

    expect((await executor.execute(leased!)).status).toBe("SUCCEEDED");
    expect(await prisma.artifact.count({ where: { buildJobId: queued.id } })).toBe(1);
    expect(losingArtifact).toBeDefined();
    await expect(storage.open(seeded.tenant.id, losingArtifact!.artifactId)).rejects.toThrow(
      "ARTIFACT_NOT_FOUND",
    );
  });

  it("cleans the stored blob when completion throws without masking that error", async () => {
    const seeded = await seedNewWorkspace();
    await jobs.enqueue(enqueueInput(seeded));
    const leased = await jobs.leaseNext("completion-error", new Date());
    let stored: StoredArtifact | undefined;
    const executor = new BuildExecutor({
      prisma,
      storage,
      registry,
      hooks: {
        beforeCommit: async (artifact) => {
          stored = artifact;
          await prisma.buildJob.update({
            where: { id: leased!.id },
            data: { leaseExpiresAt: new Date(Date.now() - 1_000) },
          });
        },
      },
    });

    await expect(executor.execute(leased!)).rejects.toThrow(
      "lease was lost or expired before completion",
    );
    expect(stored).toBeDefined();
    await expect(storage.open(seeded.tenant.id, stored!.artifactId)).rejects.toThrow(
      "ARTIFACT_NOT_FOUND",
    );
  });
});

async function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

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
