// Task 9 Step 6/7: worker execution chain and crash recovery.
// The crash-recovery test simulates a worker terminating after the artifact
// write but before the database commit, then retries with the same
// idempotency key and asserts exactly one successful revision and one final
// artifact.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:5432/kf_agent_test";

import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { createHash, createHmac } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { LocalArtifactStorage, type ArtifactStorage, type StoredArtifact } from "@kf/artifact-storage";
import {
  CapabilityCandidateBundleSchema,
  CustomerSolutionBlueprintSchema,
  ModulePlanSchema,
  SolutionImplementationPlanSchema,
  canonicalChangePlanHash,
  canonicalServerHash,
  canonicalServerPlanSigningBytes,
  workspaceAssetIdToModelId,
  type ModulePlan,
} from "@kf/contracts";
import {
  BuildExecutor,
  BuildJobService,
  BuildWorkerCrash,
  createHmacCreativeBuildFacade,
  createHmacServerPlanAuthority,
} from "@kf/build-jobs";
import {
  attachRuntimeCorrelation,
  compileInteractions,
  compileSolutionImplementation,
  compileUiImplementation,
  compileModulePlan,
  compileClientProject,
  createCreativeUIImplementationV2Compiler,
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
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
const GOLDEN_RUNTIME_BASE_SEED = "kf-module-golden-runtime-base";
const GOLDEN_RUNTIME_PAGE_GUID = `k${deriveGuid({ seed: GOLDEN_RUNTIME_BASE_SEED }, "Page1")}`;

async function readGoldenPlan(name: string): Promise<ModulePlan> {
  const url = new URL(`../../../tests/fixtures/module-plans/${name}.json`, import.meta.url);
  return ModulePlanSchema.parse(JSON.parse(await readFile(url, "utf8")) as unknown);
}

async function goldenBaseWorkspace(): Promise<string> {
  const irUrl = new URL("../../../tests/fixtures/client-ir/minimal.json", import.meta.url);
  const ir = JSON.parse(await readFile(irUrl, "utf8")) as Parameters<typeof compileClientProject>[0];
  const blankIr: Parameters<typeof compileClientProject>[0] = {
    ...ir,
    name: "Generated module project",
    pages: ir.pages.map((page) => ({ ...page, controls: [] })),
  };
  const compiled = await compileClientProject(
    blankIr,
    { seed: GOLDEN_RUNTIME_BASE_SEED },
    { workRoot: await mkdtemp(path.join(tmpdir(), "kf-module-golden-base-")) },
  );
  return compiled.rootDir;
}

async function buildGoldenPackage(name: string) {
  const plan = await readGoldenPlan(name);
  const registry = createDefaultModuleRegistry();
  const assetBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const sha256 = createHash("sha256").update(assetBytes).digest("hex");
  const approvedAssetsById = Object.fromEntries(plan.assets.map((asset) => [asset.id, {
    workspaceAssetId: "00000000-0000-4000-8000-000000000001",
    targetPath: `project/res/images/${sha256}.png`, mediaType: "image/png" as const, sha256, sizeBytes: assetBytes.byteLength,
  }]));
  const assetsById = Object.fromEntries(plan.assets.map((asset) => [asset.id, { assetId: asset.id, status: "resolved" as const, resolvedName: asset.name }]));
  const compiled = compileModulePlan({
    plan, acceptedBlueprintArtifact: acceptedArtifactForPlan(plan, registry), registry, assetsById, approvedAssetsById,
    validationContext: { availableKfCapabilities: GOLDEN_CAPABILITIES, approvedAuthorizationRefs: [] },
  });
  const assetTargetPath = `project/res/images/${sha256}.png`;
  if (compiled.status !== "compiled") return { plan, compiled, assetBytes, assetTargetPath, sha256 };
  const implementation = compileUiImplementation(compiled.implementation, {
    workspaceId: "00000000-0000-4000-8000-000000000013", pageGuidById: { Page1: GOLDEN_RUNTIME_PAGE_GUID },
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

function creativeFixture() {
  const blueprint = CustomerSolutionBlueprintSchema.parse({
    schema: "kf-design-plan/v3",
    displayName: "创意工程",
    objective: "帮助客户从首页进入详情",
    audiences: ["客户"],
    scenarios: ["查看详情"],
    pages: ["home", "detail"].map((id) => ({
      id: `bp-${id}`,
      title: id === "home" ? "首页" : "详情",
      purpose: id === "home" ? "引导查看" : "展示详情",
      readingOrder: [`region-${id}`],
      regions: [{
        id: `region-${id}`,
        purpose: id === "home" ? "引导查看" : "展示详情",
        semanticRoles: [id === "home" ? "action" : "content"],
        dataShape: "content",
        density: "comfortable",
        importance: "primary",
        content: [id === "home" ? "打开详情" : "详情内容"],
        sampleData: [],
        interactions: id === "home" ? ["点击打开详情"] : [],
        states: ["ready"],
        visualIntent: "清晰",
      }],
    })),
    journeys: [{
      id: "open-detail",
      actor: "客户",
      goal: "查看详情",
      steps: [{ pageId: "bp-home", regionId: "region-home", action: "点击", result: "详情可见" }],
      completion: "详情可见",
    }],
    visualDirection: {
      tone: "专业",
      colors: ["蓝色"],
      typography: "清晰",
      spacingAndSurfaces: "舒适",
    },
    acceptanceScenarios: ["详情可见"],
    openQuestions: [],
  });
  const ranked = (id: string, score: number) => ({
    id, score, reasons: ["适用"], limitations: [], knowledgeVersion: "1.0.0",
  });
  const candidates = CapabilityCandidateBundleSchema.parse({
    schema: "kf-capability-candidates/v1",
    knowledgeCatalogVersion: "1.0.0",
    blueprintHash: canonicalServerHash(blueprint),
    regions: ["home", "detail"].map((id) => ({
      pageId: `bp-${id}`,
      regionId: `region-${id}`,
      controls: [ranked("button", 3), ranked("text", 2), ranked("image", 1)],
      layouts: [ranked("layout.4", 3)],
      recipes: [ranked("content.hero", 3)],
    })),
    detailedCapabilityIds: ["button", "image", "layout.4", "text"],
    generatedAtPolicy: "deterministic-no-timestamp",
  });
  const intent = {
    importance: "primary",
    visualWeight: 3,
    readingOrder: 0,
    density: "comfortable",
    groupWith: [],
    width: { mode: "fixed", value: 160 },
    height: { mode: "content" },
    align: "start",
  } as const;
  const plan = SolutionImplementationPlanSchema.parse({
    schema: "kf-solution-implementation/v1",
    projectKey: "creative",
    blueprintHash: canonicalServerHash(blueprint),
    candidateBundleHash: canonicalServerHash(candidates),
    theme: {
      background: "#ffffff", surface: "#ffffff", primary: "#123456", accent: "#654321",
      textPrimary: "#111111", textSecondary: "#555555", fontFamily: "Inter", spacingUnit: 8,
      radiusScale: { small: 4, medium: 8, large: 16 },
    },
    roleStyles: [
      { role: "action", declarations: {}, states: {} },
      { role: "content", declarations: {}, states: {} },
    ],
    mockData: [],
    localState: [],
    pages: [{
      id: "home", title: "首页", purpose: "引导查看", canvas: "desktop",
      sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["region-home"], initialStateIds: [],
      root: {
        id: "open", kind: "control", capabilityId: "button", content: "打开详情",
        properties: [], tabIds: [], styleRole: "action", sourceBlueprintRegionIds: ["region-home"],
        intent, eventBindings: [{ semanticEvent: "click", actionIds: ["navigate"] }],
      },
    }, {
      id: "detail", title: "详情", purpose: "展示详情", canvas: "desktop",
      sourceBlueprintPageId: "bp-detail", sourceBlueprintRegionIds: ["region-detail"], initialStateIds: [],
      root: {
        id: "detail-content", kind: "control", capabilityId: "text", content: "详情内容",
        properties: [], tabIds: [], styleRole: "content", sourceBlueprintRegionIds: ["region-detail"],
        intent, eventBindings: [],
      },
    }],
    overlays: [],
    actions: [{
      id: "navigate", kind: "navigate-page", targetPageId: "detail", afterActionIds: [],
      journeyStepRefs: [{ journeyId: "open-detail", stepIndex: 0 }],
    }],
    scripts: [],
  });
  return { blueprint, candidates, plan };
}

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
    data: {
      tenantId: tenant.id,
      name: `W-Workspace-${suffix}`,
      mode: "new",
      generationWorkflow: "legacy",
    },
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

async function seedCreativeBuild(): Promise<Seeded & {
  authority: ReturnType<typeof createHmacServerPlanAuthority>;
  creativeArtifactHash: string;
  materializationHash: string;
  expectedControlNames: string[];
}> {
  const seeded = await seedNewWorkspace();
  const fixture = creativeFixture();
  const implementation = compileSolutionImplementation({
    plan: fixture.plan,
    candidateBundle: fixture.candidates,
    moduleRegistry: createDefaultModuleRegistry(),
    approvedAssets: [],
    activeCatalogVersion: fixture.candidates.knowledgeCatalogVersion,
  });
  const correlated = attachRuntimeCorrelation({
    workspaceId: seeded.workspace.id,
    baseRevisionId: seeded.revision.id,
    implementation,
  });
  const interactions = compileInteractions({
    blueprint: fixture.blueprint,
    plan: fixture.plan,
    implementation: correlated,
  });
  expect(interactions.diagnostics.errors).toEqual([]);
  expect(interactions.diagnostics.requests).toEqual([]);
  const facade = createHmacCreativeBuildFacade(
    Buffer.alloc(32, 0x71),
    createCreativeUIImplementationV2Compiler,
  );
  const lowered = facade.compiler.compiler.compile({
    workspaceId: seeded.workspace.id,
    baseRevisionId: seeded.revision.id,
    blueprint: fixture.blueprint,
    candidateBundle: fixture.candidates,
    semanticPlan: fixture.plan,
    implementation: interactions.implementation,
    compilerVersion: "1.0.0",
    evidenceVersion: "1.0.0",
    verifiedAssets: facade.compiler.assetProofResolver.attestResolvedAssets({
      workspaceId: seeded.workspace.id,
      assets: [],
    }),
  });
  const envelope = facade.authority.sign({
    plan: lowered.plan,
    revisionId: seeded.revision.id,
    semanticOperations: [],
    creative: lowered.trustedCreativePayload,
  });
  await prisma.$transaction([
    prisma.solutionWorkspace.update({
      where: { id: seeded.workspace.id },
      data: { generationWorkflow: "creative-v2" },
    }),
    prisma.changePlan.update({
      where: { id: seeded.plan.id },
      data: {
        planHash: envelope.planHash,
        plan: JSON.parse(JSON.stringify(envelope)) as Prisma.InputJsonValue,
      },
    }),
  ]);
  const verified = facade.authority.verify(JSON.parse(JSON.stringify(envelope)), {
    expectedPlanHash: envelope.planHash,
    expectedRevisionId: seeded.revision.id,
  });
  return {
    ...seeded,
    hash: envelope.planHash,
    authority: facade.authority,
    creativeArtifactHash: verified.creativeArtifactHash!,
    materializationHash: verified.nativeMaterializationHash!,
    expectedControlNames: verified.trustedNativeMaterialization!.controls.map((control) => control.instanceName),
  };
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
  const targetPath = `project/res/images/${stored.sha256}.png`;
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
    artifactId?: string;
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
  it.each(["plain plan", "signed non-creative envelope"])(
    "rejects a creative-v2 workspace downgrade through a %s",
    async (variant) => {
      const seeded = await seedNewWorkspace();
      const authority = createHmacServerPlanAuthority(Buffer.alloc(32, 0x72));
      await prisma.solutionWorkspace.update({
        where: { id: seeded.workspace.id },
        data: { generationWorkflow: "creative-v2" },
      });
      if (variant === "signed non-creative envelope") {
        const stored = await prisma.changePlan.findUniqueOrThrow({ where: { id: seeded.plan.id } });
        const envelope = authority.sign({
          plan: stored.plan as never,
          revisionId: seeded.revision.id,
          semanticOperations: [],
        });
        await prisma.changePlan.update({
          where: { id: seeded.plan.id },
          data: { planHash: envelope.planHash, plan: envelope as Prisma.InputJsonValue },
        });
        seeded.hash = envelope.planHash;
      }
      const queued = await jobs.enqueue(enqueueInput(seeded));
      const runner = new JobRunner({ prisma, storage, registry, serverPlanVerifier: authority });

      expect((await runner.runOnce(`creative-downgrade-${++counter}`, new Date()))?.status).toBe("FAILED");
      expect(await prisma.solutionRevision.count({
        where: { workspaceId: seeded.workspace.id, changePlanId: seeded.plan.id },
      })).toBe(0);
      expect(await prisma.artifact.count({ where: { buildJobId: queued.id } })).toBe(0);
      expect((await prisma.solutionWorkspace.findUniqueOrThrow({ where: { id: seeded.workspace.id } })).currentRevisionId)
        .toBe(seeded.revision.id);
    },
  );

  it("delivers a signed creative envelope through the real Worker and atomically binds its downloadable package", async () => {
    const seeded = await seedCreativeBuild();
    const queued = await jobs.enqueue({
      ...enqueueInput(seeded),
      projectKey: "creative",
    });
    const runner = new JobRunner({
      prisma,
      storage,
      registry,
      serverPlanVerifier: seeded.authority,
    });

    const done = await runner.runOnce(`creative-worker-${++counter}`, new Date());

    expect(done).toMatchObject({ id: queued.id, status: "SUCCEEDED" });
    const revision = await prisma.solutionRevision.findFirstOrThrow({
      where: {
        tenantId: seeded.tenant.id,
        workspaceId: seeded.workspace.id,
        changePlanId: seeded.plan.id,
        parentRevisionId: seeded.revision.id,
      },
    });
    const artifact = await prisma.artifact.findFirstOrThrow({
      where: { tenantId: seeded.tenant.id, buildJobId: queued.id },
    });
    const project = await prisma.domainProjectRevision.findFirstOrThrow({
      where: {
        tenantId: seeded.tenant.id,
        solutionRevisionId: revision.id,
        projectKey: "creative",
        domainKind: "kingclient",
      },
    });
    expect(artifact).toMatchObject({
      solutionRevisionId: revision.id,
      creativeArtifactHash: seeded.creativeArtifactHash,
      sha256: project.packageHash,
      storageKey: project.packageUrl,
    });
    expect(revision.state).toMatchObject({
      build: {
        creativeArtifactHash: seeded.creativeArtifactHash,
        nativeMaterializationHash: seeded.materializationHash,
        packageHash: project.packageHash,
      },
    });
    const packaged = await storage.open(seeded.tenant.id, artifact.storageKey);
    const unpacked = await importNativeClientPackage(
      await collect(packaged),
      await mkdtemp(path.join(tmpdir(), "kf-creative-worker-download-")),
    );
    const inspection = await inspectClientProject(unpacked);
    expect(Object.values(inspection.index.controls).map((control) => control.name))
      .toEqual(expect.arrayContaining(seeded.expectedControlNames));
  });

  it("rejects a signed creative materialization bound to another workspace at the materialization boundary", async () => {
    const seeded = await seedCreativeBuild();
    const otherWorkspace = await prisma.solutionWorkspace.create({ data: {
      tenantId: seeded.tenant.id,
      name: `Foreign-workspace-${Date.now()}-${++counter}`,
      mode: "new",
      generationWorkflow: "creative-v2",
    } });
    const stored = await prisma.changePlan.findUniqueOrThrow({ where: { id: seeded.plan.id } });
    const envelope = structuredClone(stored.plan) as Record<string, unknown>;
    const innerPlan = envelope["plan"] as Record<string, unknown>;
    innerPlan["workspaceId"] = otherWorkspace.id;
    envelope["planHash"] = canonicalChangePlanHash(innerPlan);
    envelope["signature"] = createHmac("sha256", Buffer.alloc(32, 0x71))
      .update(canonicalServerPlanSigningBytes(envelope as never))
      .digest("hex");
    await prisma.$transaction([
      prisma.solutionWorkspace.update({
        where: { id: seeded.workspace.id },
        data: { currentRevisionId: null },
      }),
      prisma.solutionRevision.update({
        where: { id: seeded.revision.id },
        data: { workspaceId: otherWorkspace.id },
      }),
      prisma.solutionWorkspace.update({
        where: { id: otherWorkspace.id },
        data: { currentRevisionId: seeded.revision.id },
      }),
      prisma.changePlan.update({
        where: { id: seeded.plan.id },
        data: {
          workspaceId: otherWorkspace.id,
          planHash: envelope["planHash"] as string,
          plan: envelope as Prisma.InputJsonValue,
        },
      }),
    ]);
    const queued = await jobs.enqueue({
      ...enqueueInput({
        ...seeded,
        workspace: otherWorkspace,
        hash: envelope["planHash"] as string,
      }),
      projectKey: "creative",
    });
    const runner = new JobRunner({
      prisma,
      storage,
      registry,
      serverPlanVerifier: seeded.authority,
    });

    expect((await runner.runOnce(`creative-workspace-mismatch-${++counter}`, new Date()))?.status).toBe("FAILED");
    expect(await prisma.solutionRevision.count({
      where: { workspaceId: otherWorkspace.id, changePlanId: seeded.plan.id },
    })).toBe(0);
    expect(await prisma.artifact.count({ where: { buildJobId: queued.id } })).toBe(0);
    expect((await prisma.solutionWorkspace.findUniqueOrThrow({ where: { id: otherWorkspace.id } })).currentRevisionId)
      .toBe(seeded.revision.id);
    expect(await prisma.validationReport.findFirstOrThrow({ where: { buildJobId: queued.id } }))
      .toMatchObject({
        outcome: "fail",
        summary: "构建执行未完成，请使用参考编号联系管理员。",
        details: { error: {
          code: "BUILD_EXECUTION_FAILED",
          message: "构建执行未完成，请使用参考编号联系管理员。",
          correlationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        } },
      });
  });

  it.each([
    ["tenant", async (seeded: Awaited<ReturnType<typeof seedCreativeBuild>>) => {
      const otherTenant = await prisma.tenant.create({ data: { name: `Foreign-${Date.now()}-${++counter}` } });
      const queued = await jobs.enqueue({ ...enqueueInput(seeded), projectKey: "creative" });
      await prisma.changePlan.update({ where: { id: seeded.plan.id }, data: { tenantId: otherTenant.id } });
      return queued;
    }],
    ["project", async (seeded: Awaited<ReturnType<typeof seedCreativeBuild>>) =>
      jobs.enqueue({ ...enqueueInput(seeded), projectKey: "different-project" })],
    ["plan hash", async (seeded: Awaited<ReturnType<typeof seedCreativeBuild>>) => {
      const queued = await jobs.enqueue({ ...enqueueInput(seeded), projectKey: "creative" });
      const wrongHash = "f".repeat(64);
      await prisma.$transaction([
        prisma.changePlan.update({ where: { id: seeded.plan.id }, data: { planHash: wrongHash } }),
        prisma.buildJob.update({ where: { id: queued.id }, data: { planHash: wrongHash } }),
      ]);
      return queued;
    }],
    ["base revision", async (seeded: Awaited<ReturnType<typeof seedCreativeBuild>>) => {
      const queued = await jobs.enqueue({ ...enqueueInput(seeded), projectKey: "creative" });
      const otherBase = await prisma.solutionRevision.create({ data: {
        tenantId: seeded.tenant.id, workspaceId: seeded.workspace.id,
        revisionNumber: 2, kind: "initial", state: INITIAL_IR,
      } });
      return prisma.buildJob.update({ where: { id: queued.id }, data: { baseRevisionId: otherBase.id } });
    }],
    ["creative artifact hash", async (seeded: Awaited<ReturnType<typeof seedCreativeBuild>>) => {
      const queued = await jobs.enqueue({ ...enqueueInput(seeded), projectKey: "creative" });
      const stored = await prisma.changePlan.findUniqueOrThrow({ where: { id: seeded.plan.id } });
      const envelope = structuredClone(stored.plan) as Record<string, unknown>;
      envelope["creativeArtifactHash"] = "e".repeat(64);
      await prisma.changePlan.update({ where: { id: seeded.plan.id }, data: { plan: envelope as Prisma.InputJsonValue } });
      return queued;
    }],
    ["native materialization hash", async (seeded: Awaited<ReturnType<typeof seedCreativeBuild>>) => {
      const queued = await jobs.enqueue({ ...enqueueInput(seeded), projectKey: "creative" });
      const stored = await prisma.changePlan.findUniqueOrThrow({ where: { id: seeded.plan.id } });
      const envelope = structuredClone(stored.plan) as Record<string, unknown>;
      envelope["nativeMaterializationHash"] = "d".repeat(64);
      await prisma.changePlan.update({ where: { id: seeded.plan.id }, data: { plan: envelope as Prisma.InputJsonValue } });
      return queued;
    }],
  ])("fails closed for a signed creative %s binding mismatch without a successful revision or artifact", async (_binding, arrange) => {
    const seeded = await seedCreativeBuild();
    const queued = await arrange(seeded);
    const runner = new JobRunner({
      prisma,
      storage,
      registry,
      serverPlanVerifier: seeded.authority,
    });

    expect((await runner.runOnce(`creative-mismatch-${++counter}`, new Date()))?.status).toBe("FAILED");
    expect(await prisma.solutionRevision.count({
      where: { workspaceId: seeded.workspace.id, changePlanId: seeded.plan.id },
    })).toBe(0);
    expect(await prisma.artifact.count({ where: { buildJobId: queued.id } })).toBe(0);
    expect((await prisma.solutionWorkspace.findUniqueOrThrow({ where: { id: seeded.workspace.id } })).currentRevisionId)
      .toBe(seeded.revision.id);
  });

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
    const versionDir = await resolveVersionDirName(unpacked);
    await expect(readFile(path.join(unpacked, versionDir, "project", "authManager.json"), "utf8"))
      .resolves.toContain('"currentAuth": 1');
    await expect(readFile(path.join(unpacked, versionDir, "project", "config", "loginConfig.json"), "utf8"))
      .resolves.toContain('"config"');
    const controls = Object.values(inspection.index.controls);
    expect(controls.some((control) => ["Text1", "Button1", "Input1"].includes(control.id))).toBe(false);
    for (const module of built.plan.pages.flatMap((page) => page.modules)) {
      expect(controls.some((control) => control.id.startsWith(`${module.id}/`)), `missing ${module.id}`).toBe(true);
    }
    for (const asset of built.plan.assets) {
      expect(built.compiled.assetBindings).toContainEqual(expect.objectContaining({ assetId: asset.id }));
    }
    if (name === "personal-portal") {
      const materialized = await readFile(path.join(unpacked, versionDir, built.assetTargetPath));
      expect(materialized).toEqual(built.assetBytes);
      expect(createHash("sha256").update(materialized).digest("hex")).toBe(built.sha256);
      expect(containsDirectProperty(inspection.raw.pages, "src", built.assetTargetPath)).toBe(false);
      expect(containsDirectProperty(inspection.raw.pages, "src", path.basename(built.assetTargetPath))).toBe(true);
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
        targetPath: `project/res/images/${missingAssetSha}.png`,
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
        error: {
          code: "BUILD_EXECUTION_FAILED",
          message: "构建执行未完成，请使用参考编号联系管理员。",
          correlationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        },
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
    let firstStored: StoredArtifact | undefined;
    const crashingExecutor = new BuildExecutor({
      prisma,
      storage,
      registry,
      hooks: {
        beforeCommit: async (stored) => {
          firstStored = stored;
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
    expect(firstStored).toBeDefined();
    await expect(collect(await storage.open(tenant.id, firstStored!.artifactId)))
      .resolves.toHaveLength(firstStored!.size);
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
    expect(artifacts[0]!.storageKey).toBe(firstStored!.artifactId);
    expect(artifacts[0]!.sha256).toBe(firstStored!.sha256);
    await expect(collect(await storage.open(tenant.id, firstStored!.artifactId)))
      .resolves.toHaveLength(firstStored!.size);

    const workspaceNow = await prisma.solutionWorkspace.findUnique({
      where: { id: workspace.id },
    });
    expect(workspaceNow!.currentRevisionId).toBe(built[0]!.id);
  });
});

describe("customer-safe worker diagnostics", () => {
  it("persists only a public code, bounded message, and correlation id while privately logging the hostile error", async () => {
    const seeded = await seedNewWorkspace();
    const queued = await jobs.enqueue(enqueueInput(seeded));
    const leased = await jobs.leaseNext("hostile-diagnostic-worker", new Date());
    const hostilePack = clientPack();
    const hostileRegistry = new DomainRegistry();
    hostileRegistry.register({
      ...hostilePack,
      async compile() {
        throw new Error(
          "Authorization: Bearer worker-secret at /Users/operator/private/project.json",
          { cause: new Error("database-password=super-secret") },
        );
      },
    });
    const operatorError = vi.fn();
    const executor = new BuildExecutor({
      prisma,
      storage,
      registry: hostileRegistry,
      operatorLogger: { error: operatorError },
    });

    expect((await executor.execute(leased!)).status).toBe("FAILED");

    const report = await prisma.validationReport.findFirstOrThrow({
      where: { buildJobId: queued.id },
    });
    expect(report.details).toEqual({
      error: {
        code: "BUILD_EXECUTION_FAILED",
        message: "构建执行未完成，请使用参考编号联系管理员。",
        correlationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      },
    });
    expect(`${report.summary} ${JSON.stringify(report.details)}`).not.toMatch(
      /Bearer|worker-secret|\/Users|private|password|super-secret|stack|cause/i,
    );
    const correlationId = (report.details as { error: { correlationId: string } }).error.correlationId;
    expect(operatorError).toHaveBeenCalledWith(
      expect.stringContaining(correlationId),
      expect.objectContaining({ message: expect.stringContaining("worker-secret") }),
    );
  });
});
