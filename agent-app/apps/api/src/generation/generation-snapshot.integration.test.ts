// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import "reflect-metadata";
import { assertSafeTestDatabase } from "../../../../tests/helpers/database-safety.js";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
assertSafeTestDatabase({ url: process.env.DATABASE_URL, allowReset: process.env.KF_TEST_ALLOW_DESTRUCTIVE_RESET, expectedPrefix: "kf_agent_test_" });
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalArtifactStorage } from "@kf/artifact-storage";
import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, it } from "vitest";
import { BuildJobService, withAgentRunExecution } from "@kf/build-jobs";
import { canonicalServerHash, VisualPlanningContextSchema, VisualSemanticPlanSchema } from "@kf/contracts";
// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { serializeVisualSemanticGraph } from "@kf/contracts";
// end
import { generationFixture } from "../../../../tests/helpers/generation-fixture.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { GenerationSnapshotService } from "./generation-snapshot.service.js";
import { WorkspaceService } from "../workspaces/workspace.service.js";
import { createCreativeSolutionCompilerFromEnvironment } from "../conversations/graph-ports.js";
import { DeepSeekModelPort } from "../conversations/deepseek-model.js";
import { hashDesignPlan, type AgentGraphStateValue, type SolutionGraphDeps } from "@kf/agent-orchestrator";
import { createSolutionImplementationPlanNode } from "../../../../packages/agent-orchestrator/src/nodes/solution-implementation-plan.js";
import { createCompileCreativeSolutionNode } from "../../../../packages/agent-orchestrator/src/nodes/compile-creative-solution.js";

let prisma: PrismaService;
let api: GenerationSnapshotService;
let tenantId: string;
let otherTenantId: string;
let userId: string;
let workspaceId: string;
let baseRevisionId: string;
let runId: string;
let planId: string;
let fixture: Awaited<ReturnType<typeof generationFixture>>;
const ownerId = "snapshot-worker";
const fenced = <T>(work: () => Promise<T>, fence = 1) => withAgentRunExecution({ runId, tenantId, ownerId, fence, signal: new AbortController().signal }, work);
const input = () => ({ tenantId, workspaceId, runId, stepKey: "compile-creative-solution", baseRevisionId, changePlanId: planId,
  artifact: fixture.artifact, materialization: fixture.materialization, assetManifest: [], visual: null });

beforeAll(async () => {
  prisma = new PrismaService(); await prisma.$connect(); api = new GenerationSnapshotService(prisma);
  tenantId = (await prisma.tenant.create({ data: { name: `generation-${randomUUID()}` } })).id;
  otherTenantId = (await prisma.tenant.create({ data: { name: `generation-other-${randomUUID()}` } })).id;
  userId = (await prisma.user.create({ data: { tenantId, username: "generation", passwordHash: "fixture-only", role: "tenant_admin" } })).id;
});
beforeEach(async () => {
  workspaceId = (await prisma.solutionWorkspace.create({ data: { tenantId, name: `snapshot-${randomUUID()}`, generationWorkflow: "creative-v2" } })).id;
  baseRevisionId = (await prisma.solutionRevision.create({ data: { tenantId, workspaceId, kind: "initial" } })).id;
  await prisma.solutionWorkspace.update({ where: { id: workspaceId }, data: { currentRevisionId: baseRevisionId } });
  const conversation = await prisma.conversation.create({ data: { tenantId, workspaceId, title: "generation" } });
  runId = (await prisma.agentRun.create({ data: { tenantId, workspaceId, conversationId: conversation.id, requestedByUserId: userId,
    clientRequestId: randomUUID(), requestHash: "fixture", mode: "build", action: {}, baseRevisionId, status: "RUNNING",
    leaseOwner: ownerId, fence: 1, leaseExpiresAt: new Date(Date.now() + 60000) } })).id;
  fixture = await generationFixture(workspaceId, baseRevisionId);
  planId = (await prisma.changePlan.create({ data: { tenantId, workspaceId, planHash: fixture.envelope.planHash, plan: JSON.parse(JSON.stringify(fixture.envelope)) } })).id;
});
afterAll(async () => { await prisma?.$disconnect(); });
afterEach(async () => {
  // Only this test's synthetic workspace: don't leave a scheduler-visible fake lease for later suites.
  await prisma.buildJob.updateMany({ where: { tenantId, workspaceId, status: { in: ["QUEUED", "RUNNING", "VALIDATING"] } },
    data: { status: "FAILED", leaseOwner: null, leaseExpiresAt: null, terminalReason: "TEST_FIXTURE_TEARDOWN" } });
});

async function runningBuild() {
  const job = await prisma.buildJob.create({ data: { tenantId, workspaceId, baseRevisionId, changePlanId: planId, planHash: fixture.envelope.planHash,
    projectKey: fixture.artifact.semanticPlan.projectKey, domainKind: "kingclient", idempotencyKey: randomUUID(), agentRunId: runId,
    status: "RUNNING", leaseOwner: "build-worker", attemptCount: 1, leaseExpiresAt: new Date(Date.now() + 60000) } });
  await prisma.agentRun.update({ where: { id: runId }, data: { status: "BUILDING", buildJobId: job.id } });
  return job;
}
function result() {
  return { kind: "built", state: {}, domainKind: "kingclient", domainProjectKind: "client-package", mediaType: "application/gzip", fileExtension: ".gz",
    packageHash: "b".repeat(64), packageUrl: "fixture-only", creativeBinding: { creativeArtifactHash: fixture.envelope.creativeArtifactHash!, nativeMaterializationHash: fixture.envelope.nativeMaterializationHash! },
    artifact: { kind: "client-package", mediaType: "application/gzip", fileExtension: ".gz", storageKey: "fixture-only", sizeBytes: 100, sha256: "b".repeat(64) } };
}

describe("immutable generation snapshots", () => {
  it("creates one immutable scoped snapshot and reuses the exact completed compile input", async () => {
    const first = await fenced(() => api.create(input()));
    expect(await fenced(() => api.create(input()))).toEqual(first);
    const stored = await api.get(tenantId, first.id);
    expect(stored).toMatchObject({ tenantId, workspaceId, runId, revisionId: null, buildJobId: null });
    expect(stored.contentHash).toBe(canonicalServerHash(stored.content));
    expect(await prisma.generationSnapshot.count({ where: { runId } })).toBe(1);
    await expect(api.get(otherTenantId, first.id)).rejects.toThrow("snapshot");
  });
  it("deduplicates concurrent creates with the database's authoritative key", async () => {
    const snapshots = await Promise.all([fenced(() => api.create(input())), fenced(() => api.create(input()))]);
    expect(snapshots[0]).toEqual(snapshots[1]);
    expect(await prisma.generationSnapshot.count({ where: { runId } })).toBe(1);
  });
  it("rejects missing execution authority, lost fences, cancellations and expired leases", async () => {
    await expect(api.create(input())).rejects.toThrow("GENERATION_RUN_REQUIRED");
    await expect(fenced(() => api.create(input()), 0)).rejects.toThrow("GENERATION_RUN_NOT_ACTIVE");
    await prisma.agentRun.update({ where: { id: runId }, data: { cancelRequestedAt: new Date() } });
    await expect(fenced(() => api.create(input()))).rejects.toThrow("GENERATION_RUN_NOT_ACTIVE");
    await prisma.agentRun.update({ where: { id: runId }, data: { cancelRequestedAt: null, leaseExpiresAt: new Date(0) } });
    await expect(fenced(() => api.create(input()))).rejects.toThrow("GENERATION_RUN_NOT_ACTIVE");
  });
  it("does not accept another workspace, changed artifacts or invalid semantic JSON", async () => {
    await expect(fenced(() => api.create({ ...input(), tenantId: otherTenantId }))).rejects.toThrow();
    await expect(fenced(() => api.create({ ...input(), artifact: { ...fixture.artifact, semanticPlan: {} } }))).rejects.toThrow();
    await expect(fenced(() => api.create({ ...input(), materialization: { ...fixture.materialization, workspaceId: "different" } }))).rejects.toThrow("GENERATION_SCOPE_MISMATCH");
    expect(await prisma.generationSnapshot.count({ where: { runId } })).toBe(0);
  });
  it("rejects a reference ID without a matching persisted analysis instead of trusting model facts", async () => {
    const spec = { schemaVersion: 1, sourceAssetId: "reference1", sourceHash: "a".repeat(64), viewport: { width: 1440, height: 900 },
      regions: [{ id: "heading", parentId: null, role: "text", box: { x: 0, y: 0, width: 1, height: 1 }, text: ["标题"], confidence: 0.9, interactionHint: null }],
      designTokens: { background: "#fff", foreground: "#111", accent: "#123456", spacing: [8], radius: [4] }, uncertainties: [] };
    const control = fixture.materialization.controls.find(control => control.capabilityId === "text")!;
    await expect(fenced(() => api.create({ ...input(), visual: { schemaVersion: 1, analysisId: randomUUID(), specHash: canonicalServerHash(spec), spec,
      mappings: [{ regionId: "heading", controlType: "text", capabilityId: "text", support: "supported_unverified", reason: "未验证", evidenceIds: [], fallback: null }],
      bindings: [{ regionId: "heading", componentId: control.semanticControlId }], acceptedDifferences: [{ regionId: "heading", disposition: "accept-unverified", capabilityId: "text", reason: "同意" }] } })))
      .rejects.toThrow("GENERATION_VISUAL_ANALYSIS_MISMATCH");
  });
  it("enforces content immutability even for direct database writes", async () => {
    const snapshot = await fenced(() => api.create(input()));
    await expect(prisma.generationSnapshot.update({ where: { id: snapshot.id }, data: { contentHash: "f".repeat(64) } })).rejects.toThrow();
    expect((await api.get(tenantId, snapshot.id)).contentHash).toBe(snapshot.contentHash);
  });
  it("freezes the exact persisted analysis and rejects subsequent model-authored revisions", async () => {
    const reference = await prisma.referenceAsset.create({ data: { tenantId, workspaceId, name: "fixture.png", mimeType: "image/png",
      sourceHash: "a".repeat(64), storageKey: "fixture-only", byteSize: 100, totalBytes: 100, width: 1440, height: 900 } });
    const spec = { schemaVersion: 1, sourceAssetId: reference.id, sourceHash: reference.sourceHash, viewport: { width: 1440, height: 900 },
      regions: [{ id: "heading", parentId: null, role: "text", box: { x: 0, y: 0, width: 1, height: 1 }, text: ["标题"], confidence: 0.9, interactionHint: null }],
      designTokens: { background: "#fff", foreground: "#111", accent: "#123456", spacing: [8], radius: [4] }, uncertainties: [] };
    const analysis = await prisma.visualReferenceAnalysis.create({ data: { tenantId, workspaceId, assetId: reference.id, sourceHash: reference.sourceHash,
      derivativeHash: "b".repeat(64), analysisVersion: "fixture-v1", modelConfigHash: "c".repeat(64), instructionHash: "d".repeat(64),
      spec, specHash: canonicalServerHash(spec), expiresAt: new Date(Date.now() + 60000) } });
    const control = fixture.materialization.controls.find(control => control.capabilityId === "text")!;
    const visual = { schemaVersion: 1, analysisId: analysis.id, specHash: analysis.specHash, spec,
      mappings: [{ regionId: "heading", controlType: "text", capabilityId: "text", support: "supported_unverified", reason: "未验证", evidenceIds: [], fallback: null }],
      bindings: [{ regionId: "heading", componentId: control.semanticControlId }],
      acceptedDifferences: [{ regionId: "heading", disposition: "accept-unverified", capabilityId: "text", reason: "确认接受未验证差异" }] };
    const root = await mkdtemp(path.join(tmpdir(), "kf-visual-semantic-compile-"));
    const compiler = createCreativeSolutionCompilerFromEnvironment(prisma, new LocalArtifactStorage(root), {
      resolveManyForCompilation: async () => [],
    }, { KF_SERVER_PLAN_HMAC_KEY_BASE64: Buffer.alloc(32, 0x68).toString("base64") });
    const conversation = await prisma.agentRun.findUniqueOrThrow({ where: { id: runId }, select: { conversationId: true } });
    const referenceContext = VisualPlanningContextSchema.parse({ schemaVersion: 1, analysisId: visual.analysisId, specHash: visual.specHash, spec: visual.spec,
      mappings: visual.mappings, acceptedDifferences: visual.acceptedDifferences });
    const modelPort = new DeepSeekModelPort({ apiKey: "fixture-only", baseUrl: "https://fixture.invalid",
      // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
      fetch: async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(serializeVisualSemanticGraph({ schema: "kf-visual-semantic-plan/v1",
        plan: fixture.artifact.semanticPlan, bindings: [{ regionId: "heading", nodeId: control.sourceSolutionNodeId }] })) } }] }),
      // end
      { headers: { "content-type": "application/json" } }),
    });
    const reviewHash = "e".repeat(64);
    const state = { tenantId, workspaceId, userId, conversationId: conversation.conversationId, runId, planVersion: "run-plan@7",
      generationWorkflow: "creative-v2", recentMessages: [], currentRevisionId: baseRevisionId,
      designPlan: fixture.artifact.blueprint, designRevision: 1, designPlanHash: hashDesignPlan(fixture.artifact.blueprint, 1),
      capabilityCandidates: fixture.artifact.candidateBundle, capabilityCandidatesHash: canonicalServerHash(fixture.artifact.candidateBundle),
      acceptedVisualPlanningInput: { schema: "kf-accepted-visual-planning/v1", reviewHash, reference: referenceContext,
        confirmationHash: canonicalServerHash({ reviewHash, reference: referenceContext }) },
    } as unknown as AgentGraphStateValue;
    const deps = { modelPort, assetCatalog: { list: async () => [] }, creativeSolutionCompiler: compiler } as unknown as SolutionGraphDeps;
    const planning = await createSolutionImplementationPlanNode(deps)(state);
    expect(planning.stage).toBe("solution-plan-ready");
    const planned = VisualSemanticPlanSchema.parse(planning.visualSemanticPlan);
    expect(planned.bindings).toEqual([{ regionId: "heading", nodeId: control.sourceSolutionNodeId }]);
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    expect(planned.plan.projectKey).toBe("kingclient");
    // end
    const semanticInput = { tenantId, workspaceId, conversationId: conversation.conversationId, baseRevisionId,
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      projectKey: planned.plan.projectKey, domainKind: "kingclient", blueprint: fixture.artifact.blueprint,
      // end
      candidateBundle: fixture.artifact.candidateBundle, semanticPlan: planned.plan,
      visual: { reference: referenceContext, bindings: planned.bindings } };
    try {
      const outcome = await fenced(() => createCompileCreativeSolutionNode(deps)({ ...state, ...planning } as AgentGraphStateValue));
      expect(outcome).toMatchObject({ stage: "building", buildAuthorization: "creative-solution" });
      const signed = await prisma.changePlan.findUniqueOrThrow({ where: { id: String(outcome.changePlanId) } });
      expect(signed.planHash).toBe(outcome.planHash);
      expect((signed.plan as { creativeArtifactHash?: string }).creativeArtifactHash).toMatch(/^[a-f0-9]{64}$/);
    } finally { await rm(root, { recursive: true, force: true }); }
    const snapshot = await prisma.generationSnapshot.findFirstOrThrow({ where: { runId } });
    const content = (await api.get(tenantId, snapshot.id)).content as { visual: { specHash: string }; sourceMap: unknown[] };
    expect(content.visual.specHash).toBe(analysis.specHash);
    expect(content.sourceMap).toHaveLength(1);
    const invalid = await fenced(() => compiler.compile({ ...semanticInput, visual: { ...semanticInput.visual,
      bindings: [{ regionId: "heading", nodeId: "not-a-semantic-node" }] } }));
    expect(invalid.status).toBe("blocked");
    if (invalid.status === "blocked") expect(invalid.diagnostics[0]?.code).toBe("VISUAL_SEMANTIC_NODE_MISSING");
    expect(await prisma.generationSnapshot.count({ where: { runId } })).toBe(1);
    const changed = { ...spec, regions: [{ ...spec.regions[0]!, text: ["未确认的修改"] }] };
    await expect(fenced(() => api.create({ ...input(), visual: { ...visual, spec: changed, specHash: canonicalServerHash(changed) } })))
      .rejects.toThrow("GENERATION_VISUAL_ANALYSIS_MISMATCH");
  });
  it("rejects a different persisted plan for the same completed compile step", async () => {
    const snapshot = await fenced(() => api.create(input()));
    const another = await prisma.changePlan.create({ data: { tenantId, workspaceId, planHash: fixture.envelope.planHash, plan: JSON.parse(JSON.stringify(fixture.envelope)) } });
    await expect(fenced(() => api.create({ ...input(), changePlanId: another.id }))).rejects.toThrow("GENERATION_SNAPSHOT_CONFLICT");
    expect((await api.get(tenantId, snapshot.id)).changePlanId).toBe(planId);
  });
  it("keeps normal confirmed workspace deletion working with immutable generation history", async () => {
    const snapshot = await fenced(() => api.create(input()));
    await prisma.agentRun.update({ where: { id: runId }, data: { status: "SUCCEEDED", finishedAt: new Date() } });
    const root = await mkdtemp(path.join(tmpdir(), "kf-snapshot-delete-"));
    try {
      await new WorkspaceService(prisma, new LocalArtifactStorage(root)).deleteWorkspace(tenantId, workspaceId);
      expect(await prisma.generationSnapshot.findUnique({ where: { id: snapshot.id } })).toBeNull();
      expect(await prisma.solutionWorkspace.findUnique({ where: { id: workspaceId } })).toBeNull();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("binds revision and build identity atomically inside successful build completion", async () => {
    const snapshot = await fenced(() => api.create(input()));
    const job = await runningBuild();
    const builds = new BuildJobService(prisma, 30000);
    await builds.completeBuild({ jobId: job.id, tenantId, leaseOwner: "build-worker", leaseAttempt: 1, status: "SUCCEEDED",
      validationReport: { outcome: "pass", summary: "fixture", details: {} }, result: result() });
    const stored = await api.get(tenantId, snapshot.id);
    const revision = await prisma.solutionRevision.findFirstOrThrow({ where: { tenantId, workspaceId, changePlanId: planId } });
    expect(stored).toMatchObject({ revisionId: revision.id, buildJobId: job.id, contentHash: snapshot.contentHash });
    expect((await prisma.solutionWorkspace.findUniqueOrThrow({ where: { id: workspaceId } })).currentRevisionId).toBe(revision.id);
    await api.bindRevision(tenantId, snapshot.id, revision.id, job.id);
    await expect(prisma.generationSnapshot.update({ where: { id: snapshot.id }, data: { revisionId: baseRevisionId } })).rejects.toThrow();
  });
  it("keeps failed builds and manual premature bindings from publishing a revision", async () => {
    const snapshot = await fenced(() => api.create(input()));
    const job = await runningBuild();
    await expect(api.bindRevision(tenantId, snapshot.id, baseRevisionId, job.id)).rejects.toThrow("GENERATION_BUILD_BINDING_MISMATCH");
    await new BuildJobService(prisma, 30000).completeBuild({ jobId: job.id, tenantId, leaseOwner: "build-worker", leaseAttempt: 1,
      status: "FAILED", validationReport: { outcome: "fail", summary: "fixture", details: {} } });
    expect(await api.get(tenantId, snapshot.id)).toMatchObject({ revisionId: null, buildJobId: null });
  });
  it("rolls back successful publication when the delivered compiler hashes do not match the snapshot", async () => {
    const snapshot = await fenced(() => api.create(input()));
    const job = await runningBuild();
    await expect(new BuildJobService(prisma, 30000).completeBuild({ jobId: job.id, tenantId, leaseOwner: "build-worker", leaseAttempt: 1,
      status: "SUCCEEDED", validationReport: { outcome: "pass", summary: "fixture", details: {} },
      result: { ...result(), creativeBinding: { ...result().creativeBinding, nativeMaterializationHash: "f".repeat(64) } } })).rejects.toThrow("GENERATION_BUILD_BINDING_MISMATCH");
    expect(await prisma.solutionRevision.count({ where: { tenantId, workspaceId } })).toBe(1);
    expect(await api.get(tenantId, snapshot.id)).toMatchObject({ revisionId: null, buildJobId: null });
  });
});
// end
