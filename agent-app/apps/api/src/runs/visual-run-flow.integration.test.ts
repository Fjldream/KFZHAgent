// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import "reflect-metadata";
import { assertSafeTestDatabase } from "../../../../tests/helpers/database-safety.js";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
assertSafeTestDatabase({ url: process.env.DATABASE_URL, allowReset: process.env.KF_TEST_ALLOW_DESTRUCTIVE_RESET, expectedPrefix: "kf_agent_test_" });
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { AppModule } from "../app.module.js";
import { ARTIFACT_STORAGE } from "../artifacts/artifact-storage.js";
import { SessionService, SESSION_COOKIE_NAME } from "../auth/session.service.js";
import { RUN_STORE } from "./run.module.js";
import { planVisualReferenceSteps } from "./run-execution-plan.js";
import { encodeBlueprintConfirmation } from "@kf/agent-orchestrator";
// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { visualSemanticDeltaFixture } from "../../../../tests/helpers/visual-semantic-delta.js";
// end
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { LocalArtifactStorage } from "@kf/artifact-storage";
import { CustomerSolutionBlueprintSchema, canonicalServerHash, type ModelRoute, type CustomerSolutionBlueprint } from "@kf/contracts";
import { withAgentRunExecution } from "@kf/build-jobs";
import { PrismaService } from "../prisma/prisma.service.js";
import { ReferenceAssetService } from "../vision/reference-asset.service.js";
import { VisualRunAdmissionService } from "../vision/visual-run-admission.js";
import { VisualAnalysisService } from "../vision/visual-analysis.service.js";
import { VisualReviewService } from "../vision/visual-review.service.js";
import { ModelGatewayService } from "../models/model-gateway.js";
import { ModelInvocationService } from "../models/model-invocation.service.js";
import { PrismaRunStore } from "./run-store.js";
import { RunService } from "./run.service.js";
import { PrismaRunQueries } from "./run-query.service.js";
import { PrismaRunStepStore } from "./run-step-store.js";
import { RunExecutionService } from "./run-execution.service.js";
import { createRunHandlerRegistry } from "./run-handler-registry.js";
import { RunControlService } from "./run-control.service.js";
import { resolveWorkbenchConfig, type WorkbenchConfig } from "./feature-policy.js";
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import { VISUAL_PLANNING_RUNTIME } from "../vision/visual-blueprint-runtime.js";
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import type { VisualRegion } from "@kf/contracts";
// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { serializeVisualSemanticGraph, type VisualSemanticPlan } from "@kf/contracts";
// end
let fixtureRegions: VisualRegion[] | undefined;
let fixtureUncertainties: { regionId: string | null; question: string }[] | undefined;
// end
// end

const route: ModelRoute = { provider: "deepseek", baseUrl: "https://visual-flow.invalid/v1", model: "vision-fixture", supportsJson: true,
  supportsVision: true, supportsThinking: false, maxContextTokens: 64000, timeoutMs: 1000, pricingVersion: null };
// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
const blueprintRoute: ModelRoute = { ...route, baseUrl: "https://visual-blueprint.invalid/v1", model: "blueprint-fixture", supportsVision: false };
// end
let prisma: PrismaService;
let root: string;
let tenantId: string;
let userId: string;
let workspaceId: string;
let conversationId: string;
let baseRevisionId: string;
let assetId: string;
let enabled: boolean;
let store: PrismaRunStore;
let runs: RunService;
let controls: RunControlService;
let analysis: VisualAnalysisService;
let reviews: VisualReviewService;
let calls: number;
let graphLoads: number;
let disposed: number;
let reached: (() => void) | undefined;
let providerWait: Promise<void> | undefined;
// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
let blueprint: CustomerSolutionBlueprint;
// end
const text = "根据参考图生成客户端工程";
const body = (clientRequestId = randomUUID()) => ({ clientRequestId, clientMessageId: `message:${clientRequestId}`, mode: "build",
  action: { type: "message", text }, attachmentIds: [assetId], visualReference: {
    primaryAssetId: assetId, sendingConsent: { noticeVersion: "visual-egress@1", accepted: true },
  } });
const start = (value: unknown = body()) => runs.start({ tenantId, userId }, conversationId, value as never);
const config = (id: string): WorkbenchConfig => ({ ...resolveWorkbenchConfig(id, { AGENT_RUNS_V2: "true", AGENT_FEATURE_TENANT_ALLOWLIST: tenantId }),
  flags: { ...resolveWorkbenchConfig(id).flags, agentRunsV2: true, agentVisionV1: enabled },
  imagePolicy: enabled ? "explicit-consent" : "disabled", outboundImagesAllowed: enabled,
});
function executor(review = reviews) {
  return new RunExecutionService({ prisma, store, steps: new PrismaRunStepStore(prisma), handlers: createRunHandlerRegistry({ prisma,
    loadGraph: async () => { graphLoads++; throw new Error("text graph must not run before reference review"); },
    acquireTurn: async () => ({ dispose: async () => { disposed++; } }), visualReference: { analysis, reviews: review },
  }) });
}
async function claim(runId: string, ownerId = "visual-flow-worker") {
  const lease = await store.claim(ownerId, tenantId, new Date());
  if (!lease || lease.runId !== runId) throw new Error("fixture lease mismatch");
  return lease;
}
async function execute() {
  const run = await start();
  const lease = await claim(run.id);
  const outcome = await executor().executeLease(lease, new AbortController().signal);
  return { run, lease, outcome };
}
beforeAll(async () => {
  prisma = new PrismaService(); await prisma.$connect();
  // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
  const golden = JSON.parse(await readFile(new URL("../../../../tests/fixtures/creative-goldens/management-admin.json", import.meta.url), "utf8")) as { blueprint: unknown };
  blueprint = CustomerSolutionBlueprintSchema.parse(golden.blueprint);
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  blueprint.pages[0]!.regions.find((region) => region.id === "admin-sidebar-brand")!.visualRegionIds = ["heading"];
  // end
  // end
  root = await mkdtemp(path.join(tmpdir(), "kf-visual-run-flow-"));
  tenantId = (await prisma.tenant.create({ data: { name: `visual-flow-${randomUUID()}`, imageEgressAllowed: true } })).id;
  userId = (await prisma.user.create({ data: { tenantId, username: "flow", passwordHash: "fixture-only", role: "member", mustChangePassword: false } })).id;
});
beforeEach(async () => {
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  fixtureRegions = undefined; fixtureUncertainties = undefined;
  // end
  enabled = true; calls = 0; graphLoads = 0; disposed = 0; reached = undefined; providerWait = undefined;
  await prisma.tenant.update({ where: { id: tenantId }, data: { imageEgressAllowed: true } });
  workspaceId = (await prisma.solutionWorkspace.create({ data: { tenantId, name: randomUUID(), generationWorkflow: "creative-v2" } })).id;
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  const { DEFAULT_INITIAL_IR } = await import("../workspaces/workspace.service.js");
  baseRevisionId = (await prisma.solutionRevision.create({ data: { tenantId, workspaceId, kind: "initial", state: structuredClone(DEFAULT_INITIAL_IR) } })).id;
  // end
  await prisma.solutionWorkspace.update({ where: { id: workspaceId }, data: { currentRevisionId: baseRevisionId } });
  conversationId = (await prisma.conversation.create({ data: { tenantId, workspaceId, title: "visual-flow" } })).id;
  const references = new ReferenceAssetService(prisma, new LocalArtifactStorage(root));
  const bytes = await sharp({ create: { width: 400, height: 200, channels: 4, background: "#123456" } }).png().toBuffer();
  assetId = (await references.upload({ tenantId, workspaceId, stream: Readable.from([bytes]) })).id;
  const queries = new PrismaRunQueries(prisma);
  analysis = new VisualAnalysisService(prisma, references, new ModelGatewayService(new ModelInvocationService(prisma), async () => {
    calls++; reached?.(); await providerWait;
    return new Response(JSON.stringify({ model: "vision-fixture", choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
      schemaVersion: 1, sourceAssetId: "image", sourceHash: "0".repeat(64), viewport: { width: 1, height: 1 },
      // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
      regions: fixtureRegions ?? [{ id: "heading", parentId: null, role: "text", box: { x: 0, y: 0, width: 1, height: 1 }, text: ["标题"], confidence: 0.9, interactionHint: null }],
      designTokens: { background: "#fff", foreground: "#111", accent: "#123456", spacing: [8], radius: [4] }, uncertainties: fixtureUncertainties ?? [],
      // end
    }) } }], usage: { prompt_tokens: 100, completion_tokens: 20 } }), { headers: { "content-type": "application/json" } });
  }, "fixture-key"), route);
  // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
  reviews = new VisualReviewService(prisma, Buffer.alloc(32, 0x48), { blueprint: blueprintRoute });
  store = new PrismaRunStore(prisma, 30000, config, new VisualRunAdmissionService(route), reviews);
  runs = new RunService(store, queries); controls = new RunControlService(prisma, store, queries);
  // end
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await prisma.agentRun.updateMany({ where: { tenantId, workspaceId, status: { notIn: ["SUCCEEDED", "FAILED", "CANCELLED"] } },
    data: { status: "CANCELLED", leaseOwner: null, leaseExpiresAt: null, finishedAt: new Date() } });
});
afterAll(async () => { await prisma?.$disconnect(); if (root) await rm(root, { recursive: true, force: true }); });

// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
describe("visual confirmation inheritance", () => {
  const scope = () => ({ tenantId, workspaceId, conversationId, userId });
  async function waiting() {
    const { run } = await execute();
    const source = await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });
    const review = await reviews.getWaitingReview(scope(), source.id);
    const acceptance = { expectedRunId: source.id, analysisId: review.content.reference.analysisId,
      analysisHash: review.content.reference.specHash, receipt: review.receipt,
      acceptedDifferences: [{ regionId: "heading", disposition: "accept-unverified", capabilityId: "richtext", reason: "接受未验证的标题控件" }] };
    return { source, review, acceptance };
  }
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  const reviewPolicy = (id: string): WorkbenchConfig => ({ ...config(id), flags: { ...config(id).flags, agentWorkbenchV2: true } });
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  it("persists a new directional proposal for review without silently changing it on replay", async () => {
    fixtureRegions = [{ id: "vertical-card", parentId: null, role: "card", text: [], box: { x: 0, y: 0, width: 1, height: 1 }, confidence: 0.9, interactionHint: null },
      ...[0.1, 0.6].map((y, index) => ({ id: `label-${index}`, parentId: "vertical-card", role: "text" as const, text: [`示例 ${index}`],
        box: { x: 0.1, y, width: 0.8, height: 0.2 }, confidence: 0.9, interactionHint: null }))];
    const input = await waiting();
    expect(input.review.content.reference.mappings.find(item => item.regionId === "vertical-card"))
      .toMatchObject({ capabilityId: "layout.4", support: "supported_unverified", reason: expect.stringContaining("纵向") });
    const expectedHash = canonicalServerHash(input.review);
    expect(canonicalServerHash(await reviews.getWaitingReview(scope(), input.source.id))).toBe(expectedHash);
    expect(await prisma.agentRunEvent.count({ where: { runId: input.source.id, type: "input.required" } })).toBe(1);
    expect(await prisma.buildJob.count({ where: { tenantId, workspaceId } })).toBe(0);
    expect(calls).toBe(1);
  });
  // end
  async function withReviewHttp(work: (app: import("@nestjs/common").INestApplication, cookie: string) => Promise<void>, policy = reviewPolicy) {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(RUN_STORE).useValue(store)
      // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
      .overrideProvider(RunService).useValue(new RunService(store, new PrismaRunQueries(prisma), reviews, policy))
      // end
      .overrideProvider(VISUAL_PLANNING_RUNTIME).useValue({ reviews, blueprints: null, semantics: null })
      .overrideProvider(ARTIFACT_STORAGE).useValue(new LocalArtifactStorage(root)).compile();
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    const app = module.createNestApplication(); app.use(cookieParser());
    // One listener per scenario; otherwise Supertest starts/closes this server for each request.
    await app.listen(0, "127.0.0.1");
    // end
    try { await work(app, `${SESSION_COOKIE_NAME}=${(await app.get(SessionService).createSession(userId)).token}`); }
    finally { await app.close(); }
  }
  it("publishes only the authenticated displayed reference review, never private execution facts", async () => {
    const input = await waiting();
    const eventsBefore = await prisma.agentRunEvent.count({ where: { runId: input.source.id } });
    await withReviewHttp(async (app, cookie) => {
      const url = `/api/runs/${input.source.id}/visual-review`;
      await request(app.getHttpServer()).get(url).expect(401);
      const response = await request(app.getHttpServer()).get(url).set("Cookie", cookie).expect(200);
      expect(response.headers["cache-control"]).toBe("private, no-store");
      expect(response.headers.vary).toContain("Cookie");
      expect(response.body).toEqual({ schemaVersion: 1, runId: input.source.id, workspaceId, conversationId,
        receipt: input.review.receipt, reference: input.review.content.reference });
      expect(JSON.stringify(response.body)).not.toMatch(/execution|ownerId|configHash|modelConfig|knowledgeHash|vcont1:|veng1:/);
      const otherTenant = await prisma.tenant.create({ data: { name: `review-other-${randomUUID()}` } });
      const other = await prisma.user.create({ data: { tenantId: otherTenant.id, username: randomUUID(), passwordHash: "fixture", role: "member", mustChangePassword: false } });
      const foreignCookie = `${SESSION_COOKIE_NAME}=${(await app.get(SessionService).createSession(other.id)).token}`;
      await request(app.getHttpServer()).get(url).set("Cookie", foreignCookie).expect(404);
      await request(app.getHttpServer()).get(`/api/runs/${randomUUID()}/visual-review`).set("Cookie", cookie).expect(404);
      const peer = await prisma.user.create({ data: { tenantId, username: randomUUID(), passwordHash: "fixture", role: "member", mustChangePassword: false } });
      const peerCookie = `${SESSION_COOKIE_NAME}=${(await app.get(SessionService).createSession(peer.id)).token}`;
      await request(app.getHttpServer()).get(url).set("Cookie", peerCookie).expect(403);
      await prisma.agentRun.update({ where: { id: input.source.id }, data: { status: "CANCELLED" } });
      await request(app.getHttpServer()).get(url).set("Cookie", cookie).expect(409);
    });
    expect(await prisma.agentRunEvent.count({ where: { runId: input.source.id } })).toBe(eventsBefore);
    expect(calls).toBe(1);
  });
  it.each(["corrupted", "expired", "base-changed"] as const)("refuses to display a %s review instead of returning a confirmation receipt", async changed => {
    const input = await waiting();
    if (changed === "corrupted") await prisma.agentRunStep.updateMany({ where: { runId: input.source.id, stepKey: "visual-review-v1" }, data: { outputRef: "{}" } });
    if (changed === "expired") await prisma.visualReferenceAnalysis.update({ where: { id: input.acceptance.analysisId }, data: { expiresAt: new Date(0) } });
    if (changed === "base-changed") await prisma.solutionWorkspace.update({ where: { id: workspaceId }, data: { currentRevisionId: null } });
    await withReviewHttp(async (app, cookie) => {
      const result = await request(app.getHttpServer()).get(`/api/runs/${input.source.id}/visual-review`).set("Cookie", cookie).expect(409);
      expect(result.body.message).toBe("VISUAL_REVIEW_UNAVAILABLE");
      expect(JSON.stringify(result.body)).not.toContain(input.review.receipt);
    });
  });
  // end
  type Waiting = Awaited<ReturnType<typeof waiting>>;
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  const revisionBody = (input: Waiting, clientRequestId = randomUUID()) => ({ clientRequestId, receipt: input.review.receipt,
    analysisId: input.acceptance.analysisId, analysisHash: input.acceptance.analysisHash,
    regions: [{ regionId: "heading", role: "text", text: ["修正后的标题"], box: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } }] });
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  const manualRegion = { role: "text", text: ["补充内容"], box: { x: 0.1, y: 0.2, width: 0.6, height: 0.2 } } satisfies Pick<VisualRegion, "role" | "text" | "box">;
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  const clarificationBody = (input: Waiting) => {
    const region = input.review.content.reference.spec.regions[0]!;
    return { ...revisionBody(input), regions: [{ regionId: region.id, role: region.role, text: region.text, box: region.box,
      clarifications: { interaction: "点击意图需要独立核对", dataSource: "数据来源待绑定，不是生产配置" } }] };
  };
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  const interactionBody = (input: Waiting) => ({ ...revisionBody(input), regions: [{ ...revisionBody(input).regions[0]!, role: "action",
    interactionRequirement: { kind: "click-feedback", level: "info", message: "已收到本地操作" } }] });
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  const dataBody = (input: Waiting) => {
    const region = input.review.content.reference.spec.regions[0]!;
    return { ...revisionBody(input), regions: [{ regionId: region.id, role: "text", text: region.text, box: region.box,
      dataRequirement: { kind: "workspace-field", field: "name" } }] };
  };
  it("reads only the scoped workspace field, freezes its value across rename and replay, then clears it atomically", async () => {
    await prisma.solutionWorkspace.update({ where: { id: workspaceId }, data: { name: "当前租户工作区" } });
    const foreign = await prisma.tenant.create({ data: { name: randomUUID() } });
    await prisma.solutionWorkspace.create({ data: { tenantId: foreign.id, name: "其他租户的名称不得读取" } });
    const input = await waiting(); const value = dataBody(input);
    const original = await prisma.visualReferenceAnalysis.findUniqueOrThrow({ where: { id: input.acceptance.analysisId } });
    vi.stubEnv("AGENT_ALLOWED_ORIGINS", "http://localhost:5174");
    await withReviewHttp(async (app, cookie) => {
      const path = `/api/runs/${input.source.id}/visual-review/revisions`;
      const post = (body: object) => request(app.getHttpServer()).post(path).set("Cookie", cookie).set("Origin", "http://localhost:5174").send(body);
      const saved = (await post(value).expect(200)).body;
      expect(saved.reference.dataSnapshots).toEqual([{ regionId: "heading", kind: "workspace-field", field: "name", value: "当前租户工作区" }]);
      expect(saved.reference.mappings[0]).toMatchObject({ capabilityId: "text", support: "supported_unverified" });
      expect(JSON.stringify(saved)).not.toContain("其他租户的名称不得读取");
      await prisma.solutionWorkspace.update({ where: { id: workspaceId }, data: { name: "重命名后的工作区" } });
      expect((await post(value).expect(200)).body).toEqual(saved);
      expect((await reviews.getWaitingReview(scope(), input.source.id)).content.reference.dataSnapshots).toEqual(saved.reference.dataSnapshots);
      await post({ ...value, regions: [{ ...value.regions[0], dataRequirement: null }] }).expect(409);
      await expect(start(confirmation(input))).rejects.toMatchObject({ status: 409 });
      expect(await prisma.visualReferenceAnalysis.findUniqueOrThrow({ where: { id: original.id } })).toEqual(original);
      expect(await prisma.visualReferenceAnalysis.findUniqueOrThrow({ where: { id: saved.reference.analysisId } })).toMatchObject({ parentId: original.id, expiresAt: original.expiresAt });
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { resourceId: input.source.id, action: "VISUAL_REVIEW_REVISED" } });
      expect(audit.detail).toMatchObject({ dataChangedCount: 1 }); expect(JSON.stringify(audit.detail)).not.toContain("当前租户工作区");
      const refreshed = (await post({ ...value, clientRequestId: randomUUID(), receipt: saved.receipt, analysisId: saved.reference.analysisId,
        analysisHash: saved.reference.specHash, regions: [{ regionId: "heading", role: "text", text: ["修改说明会生成新确认版本"], box: value.regions[0]!.box }] }).expect(200)).body;
      expect(refreshed.reference.spec.regions[0].dataRequirement).toEqual(value.regions[0]!.dataRequirement);
      expect(refreshed.reference.dataSnapshots[0].value).toBe("重命名后的工作区");
      const cleared = (await post({ ...value, clientRequestId: randomUUID(), receipt: refreshed.receipt, analysisId: refreshed.reference.analysisId,
        analysisHash: refreshed.reference.specHash, regions: [{ ...value.regions[0], dataRequirement: null }] }).expect(200)).body;
      expect(cleared.reference.spec).toEqual(input.review.content.reference.spec);
      expect(cleared.reference).not.toHaveProperty("dataSnapshots"); expect(cleared.receipt).not.toBe(input.review.receipt);
    });
    expect(calls).toBe(1); expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(1);
  });
  it("resolves an initial visual data selection from the current scoped workspace before publishing its signed review", async () => {
    await prisma.solutionWorkspace.update({ where: { id: workspaceId }, data: { name: "初次读取的工作区" } });
    fixtureRegions = [{ ...manualRegion, id: "heading", parentId: null, confidence: 0.9, interactionHint: null,
      dataRequirement: { kind: "workspace-field", field: "name" } }];
    const input = await waiting();
    expect(input.review.content.reference.dataSnapshots).toEqual([{ regionId: "heading", kind: "workspace-field", field: "name", value: "初次读取的工作区" }]);
  });
  it.each(["value", "workspace", "field", "endpoint", "role", "unsafe-name"])("rejects workspace data correction %s without publishing residue", async changed => {
    const input = await waiting(); const value = dataBody(input);
    const dataRequirement: Record<string, unknown> = { ...value.regions[0]!.dataRequirement };
    if (changed === "value") dataRequirement.value = "伪造取值";
    if (changed === "workspace") dataRequirement.workspaceId = randomUUID();
    if (changed === "field") dataRequirement.field = "credentials";
    if (changed === "endpoint") dataRequirement.endpoint = "https://example.invalid";
    if (changed === "unsafe-name") await prisma.solutionWorkspace.update({ where: { id: workspaceId }, data: { name: "fetch('/secret')" } });
    vi.stubEnv("AGENT_ALLOWED_ORIGINS", "http://localhost:5174");
    await withReviewHttp(async (app, cookie) => {
      await request(app.getHttpServer()).post(`/api/runs/${input.source.id}/visual-review/revisions`).set("Cookie", cookie).set("Origin", "http://localhost:5174")
        .send({ ...value, regions: [{ ...value.regions[0], ...(changed === "role" ? { role: "action" } : {}), dataRequirement }] }).expect(400);
    });
    expect(await reviews.getWaitingReview(scope(), input.source.id)).toEqual(input.review);
    expect(await prisma.visualReferenceAnalysis.count({ where: { parentId: input.acceptance.analysisId } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { resourceId: input.source.id, action: "VISUAL_REVIEW_REVISED" } })).toBe(0);
  });
  // end
  it("atomically saves, replays and clears an executable feedback requirement without resolving source hints", async () => {
    const input = await waiting(); const value = interactionBody(input);
    const original = await prisma.visualReferenceAnalysis.findUniqueOrThrow({ where: { id: input.acceptance.analysisId } });
    vi.stubEnv("AGENT_ALLOWED_ORIGINS", "http://localhost:5174");
    await withReviewHttp(async (app, cookie) => {
      const path = `/api/runs/${input.source.id}/visual-review/revisions`;
      const post = (body: object) => request(app.getHttpServer()).post(path).set("Cookie", cookie).set("Origin", "http://localhost:5174").send(body);
      const saved = (await post(value).expect(200)).body;
      expect(saved.reference.spec.regions[0].interactionRequirement).toEqual(value.regions[0]!.interactionRequirement);
      expect(saved.reference.mappings[0]).toMatchObject({ capabilityId: "button", support: "supported_unverified" });
      expect((await post(value).expect(200)).body).toEqual(saved);
      await post({ ...value, regions: [{ ...value.regions[0], interactionRequirement: null }] }).expect(409);
      await expect(start(confirmation(input))).rejects.toMatchObject({ status: 409 });
      expect(await prisma.visualReferenceAnalysis.findUniqueOrThrow({ where: { id: original.id } })).toEqual(original);
      expect(await prisma.visualReferenceAnalysis.findUniqueOrThrow({ where: { id: saved.reference.analysisId } })).toMatchObject({ parentId: original.id, expiresAt: original.expiresAt });
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { resourceId: input.source.id, action: "VISUAL_REVIEW_REVISED" } });
      expect(audit.detail).toMatchObject({ interactionChangedCount: 1 }); expect(JSON.stringify(audit.detail)).not.toContain("已收到本地操作");
      const cleared = (await post({ ...value, clientRequestId: randomUUID(), receipt: saved.receipt, analysisId: saved.reference.analysisId,
        analysisHash: saved.reference.specHash, regions: [{ ...value.regions[0], interactionRequirement: null }] }).expect(200)).body;
      expect(cleared.reference.spec.regions[0]).not.toHaveProperty("interactionRequirement");
      expect(cleared.reference.spec.regions[0].interactionHint).toBeNull();
      expect(cleared.receipt).not.toBe(saved.receipt);
    });
    expect(calls).toBe(1); expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(1);
  });
  it.each(["role", "blank", "oversized", "script", "native", "network"])("rejects executable feedback requirement %s without publishing residue", async changed => {
    const input = await waiting(); const value = interactionBody(input);
    const interactionRequirement: Record<string, unknown> = { ...value.regions[0]!.interactionRequirement };
    if (changed === "blank") interactionRequirement.message = " ";
    if (changed === "oversized") interactionRequirement.message = "x".repeat(401);
    if (changed === "script") interactionRequirement.message = "fetch('/secret')";
    if (changed === "native") interactionRequirement.nativeId = "unknown";
    if (changed === "network") interactionRequirement.kind = "http-request";
    vi.stubEnv("AGENT_ALLOWED_ORIGINS", "http://localhost:5174");
    await withReviewHttp(async (app, cookie) => {
      await request(app.getHttpServer()).post(`/api/runs/${input.source.id}/visual-review/revisions`).set("Cookie", cookie).set("Origin", "http://localhost:5174")
        .send({ ...value, regions: [{ ...value.regions[0], ...(changed === "role" ? { role: "text" } : {}), interactionRequirement }] }).expect(400);
    });
    expect(await reviews.getWaitingReview(scope(), input.source.id)).toEqual(input.review);
    expect(await prisma.visualReferenceAnalysis.count({ where: { parentId: input.acceptance.analysisId } })).toBe(0);
  });
  // end
  it("atomically saves clarification notes, replays once and clears only notes without resolving original unknowns", async () => {
    fixtureUncertainties = [{ regionId: "heading", question: "原始数据源尚未知" }];
    const input = await waiting(); const value = clarificationBody(input);
    const original = await prisma.visualReferenceAnalysis.findUniqueOrThrow({ where: { id: input.acceptance.analysisId } });
    vi.stubEnv("AGENT_ALLOWED_ORIGINS", "http://localhost:5174");
    await withReviewHttp(async (app, cookie) => {
      const path = `/api/runs/${input.source.id}/visual-review/revisions`;
      const post = (body: object) => request(app.getHttpServer()).post(path).set("Cookie", cookie).set("Origin", "http://localhost:5174").send(body);
      const result = await post(value).expect(200);
      expect(result.body.reference.spec.regions[0]).toEqual({ ...input.review.content.reference.spec.regions[0], clarifications: value.regions[0]!.clarifications });
      expect(result.body.reference.spec.uncertainties).toEqual(input.review.content.reference.spec.uncertainties);
      expect(result.body.receipt).not.toBe(input.review.receipt);
      expect(result.body.reference.mappings[0].reason).toContain("补充说明未验证");
      expect((await post(value).expect(200)).body).toEqual(result.body);
      await post({ ...value, regions: [{ ...value.regions[0], clarifications: { interaction: null, dataSource: null } }] }).expect(409);
      expect(await prisma.visualReferenceAnalysis.findUniqueOrThrow({ where: { id: original.id } })).toEqual(original);
      expect(await prisma.visualReferenceAnalysis.findUniqueOrThrow({ where: { id: result.body.reference.analysisId } })).toMatchObject({ parentId: original.id, expiresAt: original.expiresAt });
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { resourceId: input.source.id, action: "VISUAL_REVIEW_REVISED" } });
      expect(audit).toMatchObject({ detail: { clarifiedCount: 1 } });
      expect(JSON.stringify(audit.detail)).not.toContain("不是生产配置");
      await expect(start(confirmation(input))).rejects.toMatchObject({ status: 409 });
      const cleared = await post({ ...value, clientRequestId: randomUUID(), receipt: result.body.receipt,
        analysisId: result.body.reference.analysisId, analysisHash: result.body.reference.specHash,
        regions: [{ ...value.regions[0], clarifications: { interaction: null, dataSource: null } }] }).expect(200);
      expect(cleared.body.reference.spec).toEqual(input.review.content.reference.spec);
      expect(cleared.body.receipt).not.toBe(input.review.receipt);
      expect(await prisma.visualReferenceAnalysis.findUniqueOrThrow({ where: { id: cleared.body.reference.analysisId } })).toMatchObject({ expiresAt: original.expiresAt });
    });
    expect(calls).toBe(1); expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(1);
  });
  it("does not bypass an original unresolved interaction hint by adding or clearing clarification notes", async () => {
    fixtureRegions = [{ ...manualRegion, id: "heading", parentId: null, confidence: 0.9, interactionHint: "截图中的点击去向未知" }];
    const input = await waiting();
    const noted = await reviews.reviseWaitingReview(scope(), input.source.id, clarificationBody(input));
    expect(noted.reference.mappings[0]!.support).toBe("unsupported");
    expect(noted.reference.spec.regions[0]!.interactionHint).toBe("截图中的点击去向未知");
    const cleared = await reviews.reviseWaitingReview(scope(), input.source.id, { ...clarificationBody(input), clientRequestId: randomUUID(),
      receipt: noted.receipt, analysisId: noted.reference.analysisId, analysisHash: noted.reference.specHash,
      regions: [{ ...clarificationBody(input).regions[0]!, clarifications: { interaction: null, dataSource: null } }] });
    expect(cleared.reference.mappings[0]!.support).toBe("unsupported");
    expect(cleared.reference.spec.regions[0]!.interactionHint).toBe("截图中的点击去向未知");
    expect(calls).toBe(1);
  });
  it.each(["empty", "oversized", "authority", "native", "no-change"] as const)("rejects clarification correction %s without publishing residue", async changed => {
    const input = await waiting(); const value = clarificationBody(input);
    const notes: Record<string, unknown> = { interaction: null, dataSource: null };
    if (changed === "empty") notes.interaction = " ";
    if (changed === "oversized") notes.dataSource = "x".repeat(1001);
    if (changed === "authority") notes.resolved = true;
    if (changed === "native") notes.nativeId = "untrusted-native";
    vi.stubEnv("AGENT_ALLOWED_ORIGINS", "http://localhost:5174");
    await withReviewHttp(async (app, cookie) => {
      await request(app.getHttpServer()).post(`/api/runs/${input.source.id}/visual-review/revisions`).set("Cookie", cookie).set("Origin", "http://localhost:5174")
        .send({ ...value, regions: [{ ...value.regions[0], clarifications: notes }] }).expect(400);
    });
    expect(await reviews.getWaitingReview(scope(), input.source.id)).toEqual(input.review);
    expect(await prisma.visualReferenceAnalysis.count({ where: { parentId: input.acceptance.analysisId } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { resourceId: input.source.id, action: "VISUAL_REVIEW_REVISED" } })).toBe(0);
  });
  // end
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  const hierarchyFixture = () => {
    const root: VisualRegion = { ...manualRegion, id: "heading", parentId: null, confidence: 0.9, interactionHint: null };
    fixtureRegions = [root, { ...root, id: "child" }, { ...root, id: "grandchild", parentId: "child" }];
    return fixtureRegions[1]!;
  };
  it("reparents a region atomically, preserves its global box and original TTL, and rejects a stale acceptance", async () => {
    const child = hierarchyFixture(); const input = await waiting();
    const original = await prisma.visualReferenceAnalysis.findUniqueOrThrow({ where: { id: input.acceptance.analysisId } });
    const value = { ...revisionBody(input), regions: [{ regionId: child.id, role: child.role, text: child.text, box: child.box, parentId: "heading" }] };
    vi.stubEnv("AGENT_ALLOWED_ORIGINS", "http://localhost:5174");
    await withReviewHttp(async (app, cookie) => {
      const url = `/api/runs/${input.source.id}/visual-review/revisions`;
      const response = await request(app.getHttpServer()).post(url).set("Cookie", cookie).set("Origin", "http://localhost:5174").send(value).expect(200);
      expect(response.body.reference.spec.regions).toEqual(fixtureRegions!.map(region => region.id === child.id ? { ...region, parentId: "heading" } : region));
      expect(response.body.receipt).not.toBe(input.review.receipt);
      expect(await prisma.visualReferenceAnalysis.findUniqueOrThrow({ where: { id: response.body.reference.analysisId } })).toMatchObject({ parentId: original.id, expiresAt: original.expiresAt });
      expect(await prisma.visualReferenceAnalysis.findUniqueOrThrow({ where: { id: original.id } })).toEqual(original);
      const replay = await request(app.getHttpServer()).post(url).set("Cookie", cookie).set("Origin", "http://localhost:5174").send(value).expect(200);
      expect(replay.body).toEqual(response.body);
      await request(app.getHttpServer()).post(url).set("Cookie", cookie).set("Origin", "http://localhost:5174")
        .send({ ...value, regions: [{ ...value.regions[0], parentId: null }] }).expect(409);
      expect(await prisma.visualReferenceAnalysis.count({ where: { parentId: original.id } })).toBe(1);
      expect(await prisma.auditLog.findFirstOrThrow({ where: { resourceId: input.source.id, action: "VISUAL_REVIEW_REVISED" } })).toMatchObject({ detail: { reparentedCount: 1 } });
      await expect(start(confirmation(input))).rejects.toMatchObject({ status: 409 });
      const newAcceptance = { type: "accept_visual_reference", expectedRunId: input.source.id, receipt: response.body.receipt,
        analysisId: response.body.reference.analysisId, analysisHash: response.body.reference.specHash,
        acceptedDifferences: response.body.reference.mappings.map((mapping: { regionId: string; capabilityId: string }) => ({
          regionId: mapping.regionId, capabilityId: mapping.capabilityId, disposition: "accept-unverified", reason: "接受层级修正后的未验证控件",
        })) };
      expect((await start({ ...confirmation(input), action: newAcceptance })).status).toBe("QUEUED");
    });
    expect(calls).toBe(1);
  });
  it("explicitly moves a child to the root and permits deleting only its former parent in the same revision", async () => {
    const child = hierarchyFixture(); fixtureRegions![1]!.parentId = "heading";
    fixtureUncertainties = [{ regionId: "heading", question: "原父区域仍有未知数据源" }];
    const input = await waiting();
    const response = await reviews.reviseWaitingReview(scope(), input.source.id, { ...revisionBody(input),
      regions: [{ regionId: child.id, role: child.role, text: child.text, box: child.box, parentId: null }], removals: ["heading"] });
    expect(response.reference.spec.regions.map(region => ({ id: region.id, parentId: region.parentId }))).toEqual([
      { id: "child", parentId: null }, { id: "grandchild", parentId: "child" },
    ]);
    expect(response.reference.spec.uncertainties).toContainEqual({ regionId: null, question: "原父区域仍有未知数据源" });
    expect(calls).toBe(1);
  });
  it.each(["self", "cycle", "indirect-cycle", "unknown", "removed-parent", "no-change"] as const)("rejects hierarchy correction %s without publishing an analysis or receipt", async changed => {
    const child = hierarchyFixture();
    if (changed === "indirect-cycle") fixtureRegions![1]!.parentId = "heading";
    const input = await waiting();
    const value = { ...revisionBody(input), regions: [{ regionId: changed === "indirect-cycle" ? "heading" : child.id, role: child.role, text: child.text, box: child.box,
      parentId: changed === "self" ? "child" : changed === "cycle" ? "grandchild" : changed === "unknown" ? "foreign-region" : changed === "no-change" ? null : "heading" }],
      ...(changed === "removed-parent" ? { removals: ["heading"] } : {}) };
    if (changed === "indirect-cycle") value.regions[0]!.parentId = "grandchild";
    vi.stubEnv("AGENT_ALLOWED_ORIGINS", "http://localhost:5174");
    await withReviewHttp(async (app, cookie) => {
      await request(app.getHttpServer()).post(`/api/runs/${input.source.id}/visual-review/revisions`).set("Cookie", cookie).set("Origin", "http://localhost:5174").send(value).expect(400);
    });
    expect(await reviews.getWaitingReview(scope(), input.source.id)).toEqual(input.review);
    expect(await prisma.visualReferenceAnalysis.count({ where: { parentId: input.acceptance.analysisId } })).toBe(0);
    expect(await prisma.agentRunEvent.count({ where: { runId: input.source.id, type: "input.required" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { resourceId: input.source.id, action: "VISUAL_REVIEW_REVISED" } })).toBe(0);
  });
  it("serializes independently valid hierarchy edits instead of merging them into a cycle", async () => {
    hierarchyFixture(); const input = await waiting();
    vi.stubEnv("AGENT_ALLOWED_ORIGINS", "http://localhost:5174");
    await withReviewHttp(async (app, cookie) => {
      const posts = [["heading", "grandchild"], ["child", "heading"]].map(([regionId, parentId]) => request(app.getHttpServer())
        .post(`/api/runs/${input.source.id}/visual-review/revisions`).set("Cookie", cookie).set("Origin", "http://localhost:5174")
        .send({ ...revisionBody(input), regions: [{ ...manualRegion, regionId, parentId }] }));
      const responses = await Promise.all(posts);
      expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
      expect(await prisma.visualReferenceAnalysis.count({ where: { parentId: input.acceptance.analysisId } })).toBe(1);
      expect(await prisma.auditLog.count({ where: { resourceId: input.source.id, action: "VISUAL_REVIEW_REVISED" } })).toBe(1);
      expect((await reviews.getWaitingReview(scope(), input.source.id)).content.reference.spec.regions).toHaveLength(3);
    });
    expect(calls).toBe(1); expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(1);
  });
  // end
  it("rejects deleting a parent without its descendants and permits only explicitly selected subtree removal", async () => {
    const parent: VisualRegion = { ...manualRegion, role: "text", id: "heading", parentId: null, confidence: 0.9, interactionHint: null };
    fixtureRegions = [parent, { ...parent, id: "child", parentId: "heading" }, { ...parent, id: "grandchild", parentId: "child" }];
    fixtureUncertainties = [{ regionId: "child", question: "子区域数据源未知" }];
    const input = await waiting(); const base = { ...revisionBody(input), regions: [], additions: [manualRegion] };
    vi.stubEnv("AGENT_ALLOWED_ORIGINS", "http://localhost:5174");
    await withReviewHttp(async (app, cookie) => {
      const url = `/api/runs/${input.source.id}/visual-review/revisions`;
      for (const removals of [["heading"], ["heading", "child"]]) {
        const rejected = await request(app.getHttpServer()).post(url).set("Cookie", cookie).set("Origin", "http://localhost:5174")
          .send({ ...base, removals }).expect(400);
        expect(rejected.body.message).toBe("VISUAL_REVIEW_REGION_HAS_CHILDREN");
        expect(await prisma.visualReferenceAnalysis.count({ where: { parentId: input.acceptance.analysisId } })).toBe(0);
      }
      const result = await request(app.getHttpServer()).post(url).set("Cookie", cookie).set("Origin", "http://localhost:5174")
        .send({ ...base, removals: ["heading", "child", "grandchild"] }).expect(200);
      expect(result.body.reference.spec.regions).toHaveLength(1);
      expect(result.body.reference.spec.regions[0]).toMatchObject({ parentId: null, confidence: 0 });
      expect(result.body.reference.spec.uncertainties).toContainEqual({ regionId: null, question: "子区域数据源未知" });
    });
  });
  it.each(["question-limit", "id-collision"] as const)("refuses structural edit %s without discarding unresolved facts", async changed => {
    const requestId = randomUUID();
    if (changed === "question-limit") fixtureUncertainties = Array.from({ length: 100 }, (_, index) => ({ regionId: "heading", question: `问题 ${index}` }));
    if (changed === "id-collision") fixtureRegions = [
      { ...manualRegion, role: "text", id: "heading", parentId: null, confidence: 0.9, interactionHint: null },
      { ...manualRegion, role: "text", id: `user_${requestId.replaceAll("-", "")}_1`, parentId: null, confidence: 0.9, interactionHint: null },
    ];
    const input = await waiting();
    await expect(reviews.reviseWaitingReview(scope(), input.source.id, { ...revisionBody(input, requestId), regions: [], additions: [manualRegion] }))
      .rejects.toThrow("VISUAL_REVIEW_REVISION_INVALID");
    expect(await reviews.getWaitingReview(scope(), input.source.id)).toEqual(input.review);
    expect(await prisma.visualReferenceAnalysis.count({ where: { parentId: input.acceptance.analysisId } })).toBe(0);
  });
  it("adds user regions atomically with server IDs, unknown confidence, immutable TTL and idempotent review replay", async () => {
    const input = await waiting(); const original = await prisma.visualReferenceAnalysis.findUniqueOrThrow({ where: { id: input.acceptance.analysisId } });
    const value = { ...revisionBody(input), regions: [], additions: [manualRegion] };
    vi.stubEnv("AGENT_ALLOWED_ORIGINS", "http://localhost:5174");
    await withReviewHttp(async (app, cookie) => {
      const url = `/api/runs/${input.source.id}/visual-review/revisions`;
      const edited = await request(app.getHttpServer()).post(url).set("Cookie", cookie).set("Origin", "http://localhost:5174").send(value).expect(200);
      const reference = edited.body.reference;
      const addedId = `user_${value.clientRequestId.replaceAll("-", "")}_1`;
      expect(reference.spec.regions).toEqual([input.review.content.reference.spec.regions[0], {
        ...manualRegion, id: addedId, parentId: null, confidence: 0, interactionHint: null,
      }]);
      expect(reference.spec.uncertainties).toContainEqual({ regionId: addedId, question: "用户补充区域，交互与数据源尚待确认。" });
      expect(reference.mappings.map((mapping: { regionId: string }) => mapping.regionId)).toEqual(["heading", addedId]);
      expect(edited.body.receipt).not.toBe(input.review.receipt);
      expect(await prisma.visualReferenceAnalysis.findUniqueOrThrow({ where: { id: reference.analysisId } })).toMatchObject({ parentId: original.id, expiresAt: original.expiresAt });
      expect(await prisma.visualReferenceAnalysis.findUniqueOrThrow({ where: { id: original.id } })).toEqual(original);
      const replay = await request(app.getHttpServer()).post(url).set("Cookie", cookie).set("Origin", "http://localhost:5174").send(value).expect(200);
      expect(replay.body).toEqual(edited.body);
      await request(app.getHttpServer()).post(url).set("Cookie", cookie).set("Origin", "http://localhost:5174")
        .send({ ...value, additions: [{ ...manualRegion, text: ["changed"] }] }).expect(409);
      expect(await prisma.visualReferenceAnalysis.count({ where: { parentId: original.id } })).toBe(1);
      expect(await prisma.auditLog.findFirstOrThrow({ where: { resourceId: input.source.id, action: "VISUAL_REVIEW_REVISED" } })).toMatchObject({
        detail: { regionCount: 1, addedCount: 1, removedCount: 0, updatedCount: 0 },
      });
      await expect(start(confirmation(input))).rejects.toMatchObject({ status: 409 });
    });
    expect(calls).toBe(1); expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(1);
  });
  it("removes an explicitly selected region, preserves its unknown questions and accepts only the new mappings", async () => {
    const input = await waiting();
    const added = await reviews.reviseWaitingReview(scope(), input.source.id, { ...revisionBody(input), regions: [], additions: [manualRegion] });
    const addedId = added.reference.spec.regions[1]!.id;
    const removed = await reviews.reviseWaitingReview(scope(), input.source.id, { clientRequestId: randomUUID(), receipt: added.receipt,
      analysisId: added.reference.analysisId, analysisHash: added.reference.specHash, regions: [], removals: [addedId] });
    expect(removed.reference.spec.regions.map(region => region.id)).toEqual(["heading"]);
    expect(removed.reference.mappings.map(mapping => mapping.regionId)).toEqual(["heading"]);
    expect(removed.reference.spec.uncertainties).toContainEqual({ regionId: null, question: "用户补充区域，交互与数据源尚待确认。" });
    expect(removed.receipt).not.toBe(added.receipt);
    const accepted = await start({ ...confirmation(input), action: { ...input.acceptance, type: "accept_visual_reference",
      analysisId: removed.reference.analysisId, analysisHash: removed.reference.specHash, receipt: removed.receipt } });
    expect(accepted.status).toBe("QUEUED"); expect(calls).toBe(1);
  });
  it.each(["last-region", "missing-region", "duplicate-remove", "update-and-remove", "native-addition", "overflow"] as const)(
    "rejects structural edit %s with no partially published version", async changed => {
      const input = await waiting(); const value: Record<string, unknown> = { ...revisionBody(input), regions: [], additions: [manualRegion] };
      if (changed === "last-region") { delete value.additions; value.removals = ["heading"]; }
      if (changed === "missing-region") value.removals = ["absent"];
      if (changed === "duplicate-remove") value.removals = ["heading", "heading"];
      if (changed === "update-and-remove") { value.regions = revisionBody(input).regions; value.removals = ["heading"]; }
      if (changed === "native-addition") value.additions = [{ ...manualRegion, id: "native-1", confidence: 1 }];
      if (changed === "overflow") value.additions = Array.from({ length: 100 }, () => manualRegion);
      vi.stubEnv("AGENT_ALLOWED_ORIGINS", "http://localhost:5174");
      await withReviewHttp(async (app, cookie) => {
        await request(app.getHttpServer()).post(`/api/runs/${input.source.id}/visual-review/revisions`)
          .set("Cookie", cookie).set("Origin", "http://localhost:5174").send(value).expect(400);
      });
      expect(await reviews.getWaitingReview(scope(), input.source.id)).toEqual(input.review);
      expect(await prisma.visualReferenceAnalysis.count({ where: { parentId: input.acceptance.analysisId } })).toBe(0);
      expect(await prisma.auditLog.count({ where: { resourceId: input.source.id, action: "VISUAL_REVIEW_REVISED" } })).toBe(0);
      expect(calls).toBe(1);
    });
  // end
  it("atomically revises a displayed review, archives the old version, replays once and accepts only the new receipt", async () => {
    const input = await waiting(); const value = revisionBody(input);
    const original = await prisma.visualReferenceAnalysis.findUniqueOrThrow({ where: { id: input.acceptance.analysisId } });
    vi.stubEnv("AGENT_ALLOWED_ORIGINS", "http://localhost:5174");
    await withReviewHttp(async (app, cookie) => {
      const url = `/api/runs/${input.source.id}/visual-review/revisions`;
      await request(app.getHttpServer()).post(url).send(value).expect(401);
      await request(app.getHttpServer()).post(url).set("Cookie", cookie).send(value).expect(403);
      const response = await request(app.getHttpServer()).post(url).set("Cookie", cookie).set("Origin", "http://localhost:5174").send(value).expect(200);
      expect(response.body.reference.spec.regions[0]).toMatchObject({ id: "heading", text: ["修正后的标题"], box: value.regions[0]!.box });
      expect(response.body.receipt).not.toBe(input.review.receipt);
      expect(response.body.reference.analysisId).not.toBe(input.acceptance.analysisId);
      const child = await prisma.visualReferenceAnalysis.findUniqueOrThrow({ where: { id: response.body.reference.analysisId as string } });
      expect(child).toMatchObject({ parentId: original.id, expiresAt: original.expiresAt, assetId: original.assetId,
        modelConfigHash: original.modelConfigHash, derivativeHash: original.derivativeHash });
      expect(await prisma.visualReferenceAnalysis.findUniqueOrThrow({ where: { id: original.id } })).toEqual(original);
      expect(await prisma.agentRunStep.count({ where: { runId: input.source.id, stepKey: { startsWith: "visual-review-history-v1:" } } })).toBe(1);
      const replay = await request(app.getHttpServer()).post(url).set("Cookie", cookie).set("Origin", "http://localhost:5174").send(value).expect(200);
      expect(replay.body).toEqual(response.body);
      await request(app.getHttpServer()).post(url).set("Cookie", cookie).set("Origin", "http://localhost:5174")
        .send({ ...value, regions: [{ ...value.regions[0], text: ["不同请求" ] }] }).expect(409);
      expect(await prisma.visualReferenceAnalysis.count({ where: { parentId: original.id } })).toBe(1);
      const displayed = await request(app.getHttpServer()).get(`/api/runs/${input.source.id}/visual-review`).set("Cookie", cookie).expect(200);
      expect(displayed.body).toEqual(response.body);
      expect(JSON.stringify(response.body)).not.toMatch(/modelConfigHash|execution|configHash|vcont1:/);
      const events = await prisma.agentRunEvent.findMany({ where: { runId: input.source.id, type: "input.required" }, orderBy: { seq: "asc" } });
      expect(events).toHaveLength(2); expect(events[1]!.payload).toMatchObject({ receipt: response.body.receipt });
      expect(await prisma.auditLog.count({ where: { resourceId: input.source.id, action: "VISUAL_REVIEW_REVISED" } })).toBe(1);
      await expect(start(confirmation(input))).rejects.toMatchObject({ status: 409 });
      const accepted = await start({ ...confirmation(input), action: { type: "accept_visual_reference", ...input.acceptance,
        analysisId: response.body.reference.analysisId, analysisHash: response.body.reference.specHash, receipt: response.body.receipt } });
      expect(accepted.status).toBe("QUEUED");
      await request(app.getHttpServer()).post(url).set("Cookie", cookie).set("Origin", "http://localhost:5174").send(value).expect(409);
    });
    expect(calls).toBe(1);
  });
  it.each(["receipt", "expired", "base", "cancelled", "disabled", "egress", "unknown-region", "duplicate-region", "outside", "source-field", "no-change", "too-large"] as const)(
    "rejects review edit %s without analysis, review, event or audit residue", async changed => {
      const input = await waiting(); const value: Record<string, unknown> = revisionBody(input);
      if (changed === "receipt") value.receipt = `vref1:${"0".repeat(64)}:${"0".repeat(64)}`;
      if (changed === "expired") await prisma.visualReferenceAnalysis.update({ where: { id: input.acceptance.analysisId }, data: { expiresAt: new Date(0) } });
      if (changed === "base") await prisma.solutionWorkspace.update({ where: { id: workspaceId }, data: { currentRevisionId: null } });
      if (changed === "cancelled") await controls.cancel(tenantId, input.source.id, userId);
      if (changed === "disabled") enabled = false;
      if (changed === "egress") await prisma.tenant.update({ where: { id: tenantId }, data: { imageEgressAllowed: false } });
      const patch = revisionBody(input).regions[0]!;
      if (changed === "unknown-region") value.regions = [{ ...patch, regionId: "invented" }];
      if (changed === "duplicate-region") value.regions = [patch, patch];
      if (changed === "outside") value.regions = [{ ...patch, box: { x: 0.9, y: 0, width: 1, height: 1 } }];
      if (changed === "source-field") value.sourceAssetId = randomUUID();
      if (changed === "too-large") value.regions = [{ ...patch, text: Array.from({ length: 20 }, () => "中".repeat(1100)) }];
      if (changed === "no-change") { const region = input.review.content.reference.spec.regions[0]!;
        value.regions = [{ regionId: region.id, role: region.role, text: region.text, box: region.box }]; }
      const before = await prisma.agentRunEvent.count({ where: { runId: input.source.id } });
      vi.stubEnv("AGENT_ALLOWED_ORIGINS", "http://localhost:5174");
      await withReviewHttp(async (app, cookie) => {
        const response = await request(app.getHttpServer()).post(`/api/runs/${input.source.id}/visual-review/revisions`)
          .set("Cookie", cookie).set("Origin", "http://localhost:5174").send(value);
        expect(response.status).toBe(["disabled", "egress"].includes(changed) ? 403
          : ["unknown-region", "duplicate-region", "outside", "source-field", "no-change", "too-large"].includes(changed) ? 400 : 409);
      });
      expect(await prisma.visualReferenceAnalysis.count({ where: { parentId: input.acceptance.analysisId } })).toBe(0);
      expect(await prisma.agentRunEvent.count({ where: { runId: input.source.id } })).toBe(before);
      expect(await prisma.agentRunStep.count({ where: { runId: input.source.id, stepKey: { startsWith: "visual-review-history-v1:" } } })).toBe(0);
      expect(await prisma.auditLog.count({ where: { resourceId: input.source.id, action: "VISUAL_REVIEW_REVISED" } })).toBe(0);
    });
  // end
  // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
  const confirmation = (input: Waiting, clientRequestId = randomUUID()) => ({ clientRequestId,
    clientMessageId: `confirm:${clientRequestId}`, mode: "build", attachmentIds: [],
    action: { type: "accept_visual_reference", ...input.acceptance } });
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  it("serializes two edits and an old-receipt acceptance without partially consuming the image wait", async () => {
    const input = await waiting(); vi.stubEnv("AGENT_ALLOWED_ORIGINS", "http://localhost:5174");
    await withReviewHttp(async (app, cookie) => {
      const edit = () => request(app.getHttpServer()).post(`/api/runs/${input.source.id}/visual-review/revisions`)
        .set("Cookie", cookie).set("Origin", "http://localhost:5174").send(revisionBody(input));
      const accept = request(app.getHttpServer()).post(`/api/conversations/${conversationId}/runs`)
        .set("Cookie", cookie).set("Origin", "http://localhost:5174").send(confirmation(input));
      const responses = await Promise.all([edit(), edit(), accept]);
      expect(responses.filter(response => [200, 202].includes(response.status))).toHaveLength(1);
      expect(responses.filter(response => response.status === 409)).toHaveLength(2);
      const source = await prisma.agentRun.findUniqueOrThrow({ where: { id: input.source.id } });
      const edited = responses[0].status === 200 || responses[1].status === 200;
      expect(source.status).toBe(edited ? "WAITING_INPUT" : "CANCELLED");
      expect(await prisma.visualReferenceAnalysis.count({ where: { parentId: input.acceptance.analysisId } })).toBe(edited ? 1 : 0);
      expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(edited ? 1 : 2);
    });
  });
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  it.each((["same-request", "different-request", "acceptance"] as const).flatMap(race =>
    (["structure", "clarification", "interaction", "data"] as const).map(kind => ({ race, kind }))))("serializes $kind edit $race without duplicate versions or a partially consumed wait", async ({ race, kind }) => {
    if (kind === "data") await prisma.solutionWorkspace.update({ where: { id: workspaceId }, data: { name: `并发快照工作区-${race}` } });
    const input = await waiting(); const value = kind === "data" ? dataBody(input) : kind === "interaction" ? interactionBody(input) : kind === "clarification" ? clarificationBody(input) : { ...revisionBody(input), regions: [], additions: [manualRegion] };
    vi.stubEnv("AGENT_ALLOWED_ORIGINS", "http://localhost:5174");
    await withReviewHttp(async (app, cookie) => {
      const post = (path: string, body: object) => request(app.getHttpServer()).post(path).set("Cookie", cookie).set("Origin", "http://localhost:5174").send(body);
      const path = `/api/runs/${input.source.id}/visual-review/revisions`;
      const other = race === "acceptance" ? post(`/api/conversations/${conversationId}/runs`, confirmation(input))
        : post(path, race === "same-request" ? value : { ...value, clientRequestId: randomUUID() });
      const responses = await Promise.all([post(path, value), other]);
      if (race === "same-request") {
        expect(responses.map(response => response.status)).toEqual([200, 200]); expect(responses[0].body).toEqual(responses[1].body);
      } else expect(responses.map(response => response.status).sort()).toEqual(race === "acceptance" && responses[1].status === 202 ? [202, 409] : [200, 409]);
      const edited = responses[0].status === 200 || (race !== "acceptance" && responses[1].status === 200);
      expect(await prisma.visualReferenceAnalysis.count({ where: { parentId: input.acceptance.analysisId } })).toBe(edited ? 1 : 0);
      expect(await prisma.auditLog.count({ where: { resourceId: input.source.id, action: "VISUAL_REVIEW_REVISED" } })).toBe(edited ? 1 : 0);
      expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(race === "acceptance" && !edited ? 2 : 1);
      expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: input.source.id } })).status).toBe(edited ? "WAITING_INPUT" : "CANCELLED");
    });
  });
  // end
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  it.each(["updates", "structure", "hierarchy", "clarification", "interaction", "data"] as const)("rolls back the new analysis and displayed receipt if audit persistence fails after the edit (%s)", async kind => {
    if (kind === "hierarchy") hierarchyFixture();
    if (kind === "data") await prisma.solutionWorkspace.update({ where: { id: workspaceId }, data: { name: "事务回滚工作区" } });
    const input = await waiting(); const before = input.source.lastSeq;
    const transaction = prisma.$transaction.bind(prisma);
    const spy = vi.spyOn(prisma, "$transaction").mockImplementation(async (work: (tx: import("@prisma/client").Prisma.TransactionClient) => Promise<unknown>) =>
      transaction(async tx => {
        const create = tx.auditLog.create.bind(tx.auditLog);
        tx.auditLog.create = ((args: Parameters<typeof create>[0]) => {
          if (args.data.action === "VISUAL_REVIEW_REVISED") throw new Error("injected audit failure");
          return create(args);
        }) as unknown as typeof create;
        return work(tx);
      }));
    const value = kind === "data" ? dataBody(input) : kind === "interaction" ? interactionBody(input) : kind === "clarification" ? clarificationBody(input) : kind === "updates" ? revisionBody(input) : kind === "hierarchy"
      ? { ...revisionBody(input), regions: [{ ...manualRegion, regionId: "child", parentId: "heading" }] }
      : { ...revisionBody(input), regions: [], additions: [manualRegion], removals: ["heading"] };
    try { await expect(reviews.reviseWaitingReview(scope(), input.source.id, value as never)).rejects.toThrow("injected audit failure"); }
    finally { spy.mockRestore(); }
    expect(await reviews.getWaitingReview(scope(), input.source.id)).toEqual(input.review);
    expect(await prisma.visualReferenceAnalysis.count({ where: { parentId: input.acceptance.analysisId } })).toBe(0);
    expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: input.source.id } })).toMatchObject({ lastSeq: before, status: "WAITING_INPUT" });
  });
  // end
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  it.each(["history", "parent"] as const)("rejects edited review %s corruption before accepting a new receipt", async changed => {
    const input = await waiting();
    const revised = await reviews.reviseWaitingReview(scope(), input.source.id, revisionBody(input) as never);
    if (changed === "history") await prisma.agentRunStep.updateMany({ where: { runId: input.source.id,
      stepKey: { startsWith: "visual-review-history-v1:" } }, data: { outputRef: "{}" } });
    else await prisma.visualReferenceAnalysis.update({ where: { id: revised.reference.analysisId }, data: { parentId: null } });
    await expect(reviews.getWaitingReview(scope(), input.source.id)).rejects.toThrow("VISUAL_REVIEW_INTEGRITY_FAILED");
  });
  it("isolates review edits from another tenant and another same-tenant actor", async () => {
    const input = await waiting(); vi.stubEnv("AGENT_ALLOWED_ORIGINS", "http://localhost:5174");
    await withReviewHttp(async (app, cookie) => {
      const foreign = await prisma.tenant.create({ data: { name: randomUUID() } });
      for (const [targetTenant, status] of [[tenantId, 403], [foreign.id, 404]] as const) {
        const peer = await prisma.user.create({ data: { tenantId: targetTenant, username: randomUUID(), passwordHash: "fixture", role: "member", mustChangePassword: false } });
        const peerCookie = `${SESSION_COOKIE_NAME}=${(await app.get(SessionService).createSession(peer.id)).token}`;
        await request(app.getHttpServer()).post(`/api/runs/${input.source.id}/visual-review/revisions`).set("Cookie", peerCookie)
          .set("Origin", "http://localhost:5174").send(revisionBody(input)).expect(status);
      }
      await request(app.getHttpServer()).post(`/api/runs/${randomUUID()}/visual-review/revisions`).set("Cookie", cookie)
        .set("Origin", "http://localhost:5174").send(revisionBody(input)).expect(404);
    });
    expect(await prisma.visualReferenceAnalysis.count({ where: { parentId: input.acceptance.analysisId } })).toBe(0);
    expect(await reviews.getWaitingReview(scope(), input.source.id)).toEqual(input.review);
  });
  it.each(["runs", "workbench", "vision", "image-policy", "outbound"] as const)("checks the independent current %s gate before editing", async closed => {
    const input = await waiting(); vi.stubEnv("AGENT_ALLOWED_ORIGINS", "http://localhost:5174");
    await withReviewHttp(async (app, cookie) => {
      await request(app.getHttpServer()).post(`/api/runs/${input.source.id}/visual-review/revisions`).set("Cookie", cookie)
        .set("Origin", "http://localhost:5174").send(revisionBody(input)).expect(403);
    }, id => {
      const policy = reviewPolicy(id);
      if (closed === "runs") policy.flags.agentRunsV2 = false;
      if (closed === "workbench") policy.flags.agentWorkbenchV2 = false;
      if (closed === "vision") policy.flags.agentVisionV1 = false;
      if (closed === "image-policy") policy.imagePolicy = "disabled";
      if (closed === "outbound") policy.outboundImagesAllowed = false;
      return policy;
    });
    expect(await prisma.visualReferenceAnalysis.count({ where: { parentId: input.acceptance.analysisId } })).toBe(0);
  });
  it("serializes simultaneous identical edit requests into one analysis and one new receipt", async () => {
    const input = await waiting(); const value = revisionBody(input); vi.stubEnv("AGENT_ALLOWED_ORIGINS", "http://localhost:5174");
    await withReviewHttp(async (app, cookie) => {
      const responses = await Promise.all([1, 2].map(() => request(app.getHttpServer()).post(`/api/runs/${input.source.id}/visual-review/revisions`)
        .set("Cookie", cookie).set("Origin", "http://localhost:5174").send(value)));
      expect(responses.map(response => response.status)).toEqual([200, 200]);
      expect(responses[0]!.body).toEqual(responses[1]!.body);
    });
    expect(await prisma.visualReferenceAnalysis.count({ where: { parentId: input.acceptance.analysisId } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { resourceId: input.source.id, action: "VISUAL_REVIEW_REVISED" } })).toBe(1);
  });
  it("settles the exact releasing worker against its archived receipt when an immediate user edit advances the wait", async () => {
    const prepare = reviews.prepare.bind(reviews); let publishedHash = "";
    const spy = vi.spyOn(reviews, "prepare").mockImplementationOnce(async input => {
      const original = await prepare(input); publishedHash = original.reviewHash;
      await reviews.reviseWaitingReview(scope(), input.runId, { clientRequestId: randomUUID(), receipt: original.receipt,
        analysisId: original.content.reference.analysisId, analysisHash: original.content.reference.specHash,
        regions: [{ regionId: "heading", role: "text", text: ["立即编辑的标题"], box: { x: 0, y: 0, width: 1, height: 1 } }] });
      return original;
    });
    let result: Awaited<ReturnType<typeof execute>>;
    try { result = await execute(); } finally { spy.mockRestore(); }
    expect(result.outcome).toMatchObject({ status: "WAITING_INPUT", failureCode: null });
    const current = await reviews.getWaitingReview(scope(), result.run.id);
    expect(current.reviewHash).not.toBe(publishedHash);
    expect(current.content.reference.spec.regions[0]!.text).toEqual(["立即编辑的标题"]);
    expect(await store.observeCommittedReviewPause(result.lease, tenantId, publishedHash)).toEqual(result.outcome);
    for (const lease of [{ ...result.lease, ownerId: "wrong-owner" }, { ...result.lease, fence: result.lease.fence + 1 }]) {
      await expect(store.observeCommittedReviewPause(lease, tenantId, publishedHash)).rejects.toThrow("FENCE_REJECTED");
    }
    await expect(store.observeCommittedReviewPause(result.lease, tenantId, "0".repeat(64))).rejects.toThrow("FENCE_REJECTED");
    expect(await prisma.agentRunEvent.count({ where: { runId: result.run.id, type: "run.failed" } })).toBe(0);
    expect(calls).toBe(1);
  });
  // end
  it("atomically admits public confirmation and replays it after policy closes without duplicating the source cancellation", async () => {
    const input = await waiting(); const value = confirmation(input); const run = await start(value);
    expect(run).toMatchObject({ status: "QUEUED", lastSeq: 1, baseRevisionId, buildJobId: null });
    expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({
      predecessorRunId: input.source.id, action: value.action, configSnapshot: input.source.configSnapshot,
      inputSnapshot: { attachmentIds: [assetId], baseRevisionPolicy: "fixed", visualContinuation: { content: {
        sourceRunId: input.source.id, accepted: { reference: { acceptedDifferences: input.acceptance.acceptedDifferences } }, blueprintModel: { route: blueprintRoute },
      } } } });
    expect(await prisma.message.findFirstOrThrow({ where: { runId: run.id } })).toMatchObject({ role: "user", content: "[accept_visual_reference]" });
    expect(await prisma.runBudget.count({ where: { runId: run.id } })).toBe(1);
    expect(await prisma.agentRunStep.count({ where: { runId: run.id, stepKey: "visual-continuation-v1" } })).toBe(1);
    expect(await prisma.agentRunEvent.count({ where: { runId: input.source.id, type: "run.cancelled" } })).toBe(1);
    for (const action of ["RUN_ACTION_ACCEPTED", "VISUAL_REFERENCE_ACCEPTED"]) expect(await prisma.auditLog.count({ where: { resourceId: run.id, action } })).toBe(1);
    enabled = false; await prisma.tenant.update({ where: { id: tenantId }, data: { imageEgressAllowed: false } });
    expect(await start(value)).toEqual(run);
    await expect(start({ ...value, action: { ...value.action, acceptedDifferences: [] } })).rejects.toMatchObject({ status: 409, message: "IDEMPOTENCY_CONFLICT" });
    await expect(start({ ...value, action: { ...value.action, receipt: `vref1:${"0".repeat(64)}:${"0".repeat(64)}` } })).rejects.toMatchObject({ status: 409, message: "IDEMPOTENCY_CONFLICT" });
    expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(2);
  });
  it("admits exactly one successor when distinct confirmation requests race", async () => {
    const input = await waiting(); const results = await Promise.allSettled([start(confirmation(input)), start(confirmation(input))]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toMatchObject([{ reason: { status: 409 } }]);
    expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(2);
    expect(await prisma.message.count({ where: { conversationId, role: "user" } })).toBe(2);
    expect(await prisma.agentRunEvent.count({ where: { runId: input.source.id, type: "run.cancelled" } })).toBe(1);
  });
  it("returns one committed successor to concurrent identical retries", async () => {
    const input = await waiting(); const value = confirmation(input);
    const results = await Promise.all([start(value), start(value)]);
    expect(results[0]).toEqual(results[1]);
    expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { resourceId: results[0].id, action: "VISUAL_REFERENCE_ACCEPTED" } })).toBe(1);
  });
  it("serializes cancellation against confirmation without deadlock or a revived source", async () => {
    const input = await waiting(); const value = confirmation(input);
    const [acceptance, cancellation] = await Promise.allSettled([start(value), controls.cancel(tenantId, input.source.id, userId)]);
    expect(cancellation.status).toBe("fulfilled");
    const source = await prisma.agentRun.findUniqueOrThrow({ where: { id: input.source.id } });
    expect(source.status).toBe("CANCELLED");
    if (acceptance.status === "fulfilled") {
      expect(source.supersededByRunId).toBe(acceptance.value.id);
      expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(2);
    } else {
      expect(acceptance.reason).toMatchObject({ status: 409 });
      expect(source.supersededByRunId).toBeNull();
      expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(1);
    }
    expect(await prisma.agentRunEvent.count({ where: { runId: input.source.id, type: "run.cancelled" } })).toBe(1);
  });
  it("hides an actual reviewed source from another conversation and another tenant", async () => {
    const input = await waiting(); const value = confirmation(input);
    const otherConversation = await prisma.conversation.create({ data: { tenantId, workspaceId, title: "other scope" } });
    await expect(runs.start({ tenantId, userId }, otherConversation.id, value)).rejects.toMatchObject({ status: 404 });
    const otherTenant = await prisma.tenant.create({ data: { name: randomUUID() } });
    await expect(runs.start({ tenantId: otherTenant.id, userId }, conversationId, value)).rejects.toMatchObject({ status: 404 });
    expect(await prisma.message.count({ where: { conversationId: otherConversation.id } })).toBe(0);
    expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: input.source.id } })).status).toBe("WAITING_INPUT");
  });
  it.each(["receipt", "analysis", "choices", "duplicate", "substitute", "expired", "actor", "policy", "cancel", "dependency", "model", "scope", "base"] as const)(
    "rejects %s without partially consuming a visual wait or retaining a candidate", async failure => {
      const input = await waiting(); const value = confirmation(input); let expectedStatus = 409; let actorId = userId;
      const budgetCount = await prisma.runBudget.count();
      if (failure === "receipt") value.action.receipt = `vref1:${"0".repeat(64)}:${"0".repeat(64)}`;
      if (failure === "analysis") value.action.analysisHash = "0".repeat(64);
      if (failure === "choices") value.action.acceptedDifferences = [];
      if (failure === "duplicate") value.action.acceptedDifferences.push(value.action.acceptedDifferences[0]!);
      if (failure === "substitute") value.action.acceptedDifferences[0]!.disposition = "substitute";
      if (failure === "expired") await prisma.visualReferenceAnalysis.update({ where: { id: input.acceptance.analysisId }, data: { expiresAt: new Date(0) } });
      if (failure === "actor") {
        expectedStatus = 403;
        actorId = (await prisma.user.create({ data: { tenantId, username: randomUUID(), passwordHash: "fixture", role: "member" } })).id;
      }
      if (failure === "policy") { expectedStatus = 403; await prisma.tenant.update({ where: { id: tenantId }, data: { imageEgressAllowed: false } }); }
      if (failure === "cancel") await controls.cancel(tenantId, input.source.id, userId);
      if (failure === "dependency" || failure === "model") {
        expectedStatus = 403;
        const unavailable = failure === "model" ? new VisualReviewService(prisma, Buffer.alloc(32, 0x48)) : undefined;
        runs = new RunService(new PrismaRunStore(prisma, 30000, config, new VisualRunAdmissionService(route), unavailable), new PrismaRunQueries(prisma));
      }
      if (failure === "scope") { expectedStatus = 404; value.action.expectedRunId = randomUUID(); }
      if (failure === "base") {
        const next = await prisma.solutionRevision.create({ data: { tenantId, workspaceId, kind: "initial" } });
        await prisma.solutionWorkspace.update({ where: { id: workspaceId }, data: { currentRevisionId: next.id } });
      }
      await expect(runs.start({ tenantId, userId: actorId }, conversationId, value)).rejects.toMatchObject({ status: expectedStatus });
      expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(1);
      expect(await prisma.message.count({ where: { conversationId, role: "user" } })).toBe(1);
      expect(await prisma.agentRunStep.count({ where: { tenantId, run: { conversationId }, stepKey: "visual-continuation-v1" } })).toBe(0);
      expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: input.source.id } })).supersededByRunId).toBeNull();
      expect(await prisma.auditLog.count({ where: { tenantId, action: "VISUAL_REFERENCE_ACCEPTED", detail: { path: ["sourceRunId"], equals: input.source.id } } })).toBe(0);
      expect(await prisma.runBudget.count()).toBe(budgetCount);
      if (failure !== "cancel") expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: input.source.id } })).status).toBe("WAITING_INPUT");
    });
  it("rejects incomplete public acceptance and browser-owned authority instead of stripping it", async () => {
    const input = await waiting(); const value = confirmation(input);
    const missingReceipt: Record<string, unknown> = { ...value.action }; delete missingReceipt.receipt;
    for (const action of [missingReceipt, { ...value.action, configSnapshot: {} }, { ...value.action, native: {} }]) {
      await expect(start({ ...value, action })).rejects.toMatchObject({ status: 400 });
    }
    await expect(start({ ...value, attachmentIds: [assetId] })).rejects.toMatchObject({ status: 400 });
    expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(1);
  });
  it.each(["receipt", "choices"] as const)("refuses a signed internal candidate whose full public %s disagrees with the acceptance body", async changed => {
    const input = await waiting(); const value = confirmation(input); const successorId = randomUUID();
    if (changed === "receipt") value.action.receipt = `vref1:${"0".repeat(64)}:${"0".repeat(64)}`;
    else value.action.acceptedDifferences = [];
    await expect(prisma.$transaction(async tx => {
      await tx.agentRun.create({ data: { id: successorId, tenantId, workspaceId, conversationId, requestedByUserId: userId,
        clientRequestId: randomUUID(), requestHash: "mismatched-public-action", mode: "build", predecessorRunId: input.source.id,
        baseRevisionId, action: value.action, configSnapshot: input.source.configSnapshot! } });
      return reviews.freezeContinuationInTransaction(tx, scope(), successorId, input.acceptance);
    })).rejects.toThrow("VISUAL_CONTINUATION_IDENTITY_MISMATCH");
    expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: input.source.id } })).status).toBe("WAITING_INPUT");
    expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(1);
  });
  // end
  // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
  async function inherit(input: Waiting, successorId: string = randomUUID(), body: unknown = input.acceptance, rollback = false) {
  // end
    return prisma.$transaction(async tx => {
      await tx.agentRun.create({ data: { id: successorId, tenantId, workspaceId, conversationId, requestedByUserId: userId,
        clientRequestId: randomUUID(), requestHash: "internal-continuation-fixture", mode: "build", predecessorRunId: input.source.id,
        baseRevisionId, action: { type: "accept_visual_reference", expectedRunId: input.source.id,
          analysisId: input.acceptance.analysisId, analysisHash: input.acceptance.analysisHash }, configSnapshot: input.source.configSnapshot! } });
      const snapshot = await reviews.freezeContinuationInTransaction(tx, scope(), successorId, body);
      if (rollback) throw new Error("fixture outer transaction rollback");
      return snapshot;
    });
  }
  it("freezes actor/action-bound accepted input and consumes exactly the reviewed wait in the caller transaction", async () => {
    const input = await waiting(); const successorId = randomUUID();
    const snapshot = await inherit(input, successorId);
    expect(snapshot.content).toMatchObject({ schema: "kf-visual-continuation/v1", runId: successorId, sourceRunId: input.source.id,
      requestedByUserId: userId, baseRevisionId, sourceReviewHash: input.review.reviewHash,
      accepted: { reference: { analysisId: input.acceptance.analysisId, acceptedDifferences: input.acceptance.acceptedDifferences } } });
    expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: input.source.id } })).toMatchObject({ status: "CANCELLED", supersededByRunId: successorId });
    expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: successorId } })).toMatchObject({ status: "QUEUED", buildJobId: null,
      inputSnapshot: { attachmentIds: [assetId], baseRevisionPolicy: "fixed", visualContinuation: snapshot } });
    expect(await prisma.agentRunStep.count({ where: { runId: successorId, stepKey: "visual-continuation-v1", status: "COMPLETED" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { resourceId: successorId, action: "VISUAL_REFERENCE_ACCEPTED" } })).toBe(1);
    expect(await prisma.buildJob.count({ where: { workspaceId } })).toBe(0);
    expect(await prisma.changePlan.count({ where: { workspaceId } })).toBe(0);
    const restored = await prisma.$transaction(tx => reviews.readContinuationInTransaction(tx, scope(), successorId));
    expect(restored.accepted).toEqual(snapshot.content.accepted);
    expect(restored.admission.content).toMatchObject({ runId: input.source.id, attachments: [{ assetId }],
      sendingConsent: { userId, coverage: "reference-images-and-derived-structure" } });
    expect(calls).toBe(1); expect(graphLoads).toBe(0);
  });
  // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
  it("freezes a separate server blueprint route and prompt identity inside the signed continuation", async () => {
    const input = await waiting(); const snapshot = await inherit(input);
    // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    expect(snapshot.content.blueprintModel).toMatchObject({ route: blueprintRoute, promptVersion: "visual-blueprint@14",
    // end
    // end
    // end
    // end
      configHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    // end
    expect(JSON.stringify(snapshot)).not.toContain("fixture-key");
  });
  it("rejects an invalid server planning route instead of committing confirmation with an unusable model", async () => {
    const input = await waiting();
    reviews = new VisualReviewService(prisma, Buffer.alloc(32, 0x48), { blueprint: { ...blueprintRoute, baseUrl: "http://unsafe.invalid/v1" } });
    await expect(inherit(input)).rejects.toThrow("VISUAL_BLUEPRINT_CONFIG_INVALID");
    expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(1);
    expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: input.source.id } })).status).toBe("WAITING_INPUT");
  });
  describe("leased visual blueprint gateway", () => {
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    async function planning(options: { noConfig?: boolean; inFlight?: (requestIndex: number) => Promise<void>; response?: unknown; responses?: unknown[];
      finishReason?: string; http?: boolean; repair?: boolean; allowRepair?: boolean; responseTexts?: string[]; finishReasons?: Array<string | null> } = {}) {
      if (options.repair) reviews = new VisualReviewService(prisma, Buffer.alloc(32, 0x48), { blueprint: blueprintRoute, blueprintRepairPolicy: "once" });
    // end
    // end
      const input = await waiting();
      if (options.noConfig) reviews = new VisualReviewService(prisma, Buffer.alloc(32, 0x48));
      // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
      let successorId: string;
      let snapshot: Awaited<ReturnType<typeof inherit>>;
      if (options.http) {
        const origin = "http://localhost:5174"; vi.stubEnv("AGENT_ALLOWED_ORIGINS", origin);
        const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(RUN_STORE).useValue(store)
          .overrideProvider(ARTIFACT_STORAGE).useValue(new LocalArtifactStorage(root)).compile();
        const app = module.createNestApplication(); app.use(cookieParser()); await app.init();
        try {
          const cookie = `${SESSION_COOKIE_NAME}=${(await app.get(SessionService).createSession(userId)).token}`;
          const url = `/api/conversations/${conversationId}/runs`; const value = confirmation(input);
          await request(app.getHttpServer()).post(url).send(value).expect(401);
          await request(app.getHttpServer()).post(url).set("Cookie", cookie).send(value).expect(403);
          const result = await request(app.getHttpServer()).post(url).set("Cookie", cookie).set("Origin", origin).send(value).expect(202);
          successorId = result.body.id as string;
          expect(JSON.stringify(result.body)).not.toMatch(/visualContinuation|vcont1:|vref1:|configSnapshot|invalid/);
          // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
          const replay = await request(app.getHttpServer()).post(url).set("Cookie", cookie).set("Origin", origin).send(value);
          expect({ status: replay.status, error: replay.status === 202 ? null : replay.body }).toEqual({ status: 202, error: null });
          // end
          expect(replay.body.id).toBe(successorId);
          await request(app.getHttpServer()).post(url).set("Cookie", cookie).set("Origin", origin)
            .send({ ...value, action: { ...value.action, acceptedDifferences: [] } }).expect(409);
          await request(app.getHttpServer()).post(url).set("Cookie", cookie).set("Origin", origin)
            .send({ ...value, action: { ...value.action, route: blueprintRoute } }).expect(400);
          const inherited = await prisma.$transaction(tx => reviews.readContinuationInTransaction(tx, scope(), successorId));
          snapshot = inherited.snapshot;
        } finally { await app.close(); }
      } else { successorId = randomUUID(); snapshot = await inherit(input, successorId); }
      // end
      const lease = await claim(successorId, "blueprint-worker");
      const sent: Array<{ url: string; body: Record<string, unknown> }> = [];
      const gateway = new ModelGatewayService(new ModelInvocationService(prisma), async (url, init) => {
        sent.push({ url: typeof url === "string" ? url : url instanceof URL ? url.href : url.url,
          body: JSON.parse(init?.body as string) as Record<string, unknown> });
        // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
        await options.inFlight?.(sent.length);
        const proposal = options.responses && sent.length <= options.responses.length ? options.responses[sent.length - 1] : options.response ?? blueprint;
        const finishReason = options.finishReasons && sent.length <= options.finishReasons.length
          ? options.finishReasons[sent.length - 1] : options.finishReason ?? "stop";
        // end
        return new Response(JSON.stringify({ model: "blueprint-fixture", choices: [{ finish_reason: finishReason,
          // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
          message: { content: options.responseTexts?.[sent.length - 1] ?? JSON.stringify(proposal) } }], usage: { prompt_tokens: 200, completion_tokens: 50 } }));
          // end
      }, "fixture-key");
      const { VisualBlueprintService } = await import("../vision/visual-blueprint.service.js");
      // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
      const service = new VisualBlueprintService(prisma, reviews, gateway, { allowRepair: options.repair === true && options.allowRepair !== false });
      // end
      const context = { ...scope(), generationWorkflow: "creative-v2" as const, currentRevisionId: baseRevisionId, recentMessages: [],
        visualReference: snapshot.content.accepted.reference };
      const run = <T>(work: () => Promise<T>, fence = lease.fence) => withAgentRunExecution({ tenantId, runId: successorId,
        ownerId: lease.ownerId, fence, signal: new AbortController().signal }, work);
      return { input, snapshot, successorId, lease, sent, context, service, run };
    }
    it("uses the frozen separate route, sends only reviewed structure, records usage and reuses completed output", async () => {
      const test = await planning();
      expect(await test.run(() => test.service.createVisualDesignPlan(test.context))).toEqual(blueprint);
      expect(await test.run(() => test.service.createVisualDesignPlan(test.context))).toEqual(blueprint);
      expect(test.sent).toHaveLength(1);
      expect(test.sent[0]!.url).toBe("https://visual-blueprint.invalid/v1/chat/completions");
      expect(test.sent[0]!.body.model).toBe("blueprint-fixture");
      const wire = JSON.stringify(test.sent[0]!.body);
      expect(wire).toContain("标题");
      expect(wire).not.toMatch(/image_url|base64|vcont1:|vref1:|leaseOwner|fixture-key|visual-flow.invalid/);
      expect(await prisma.modelInvocation.count({ where: { runId: test.successorId, task: "blueprint", status: "SUCCEEDED" } })).toBe(1);
      expect(await prisma.agentRunStep.count({ where: { runId: test.successorId, stepKey: "visual-blueprint-result-v1", status: "COMPLETED" } })).toBe(1);
      expect(await prisma.buildJob.count({ where: { workspaceId } })).toBe(0);
    });
    it("rejects missing execution scope and stale fence before a provider call", async () => {
      const test = await planning();
      await expect(test.service.createVisualDesignPlan(test.context)).rejects.toThrow("VISUAL_RUN_REQUIRED");
      await expect(test.run(() => test.service.createVisualDesignPlan(test.context), test.lease.fence - 1)).rejects.toThrow("VISUAL_RUN_NOT_ACTIVE");
      expect(test.sent).toHaveLength(0);
    });
    it("requires the frozen planning config instead of selecting the current environment model", async () => {
      const test = await planning({ noConfig: true });
      await expect(test.run(() => test.service.createVisualDesignPlan(test.context))).rejects.toThrow("VISUAL_BLUEPRINT_CONFIG_REQUIRED");
      expect(test.sent).toHaveLength(0);
    });
    it("does not send a graph-supplied altered reference even within a legitimate execution scope", async () => {
      const test = await planning(); const visualReference = structuredClone(test.context.visualReference);
      visualReference.spec.regions[0]!.text = ["替换后的OCR"];
      await expect(test.run(() => test.service.createVisualDesignPlan({ ...test.context, visualReference }))).rejects.toThrow("VISUAL_BLUEPRINT_CONTEXT_MISMATCH");
      expect(test.sent).toHaveLength(0);
    });
    it("retains real usage but refuses publication when administrative egress is revoked in flight", async () => {
      const test = await planning({ inFlight: async () => { await prisma.tenant.update({ where: { id: tenantId }, data: { imageEgressAllowed: false } }); } });
      await expect(test.run(() => test.service.createVisualDesignPlan(test.context))).rejects.toThrow("IMAGE_EGRESS_NOT_ALLOWED");
      expect(test.sent).toHaveLength(1);
      expect(await prisma.modelInvocation.count({ where: { runId: test.successorId, status: "SUCCEEDED" } })).toBe(1);
      expect(await prisma.agentRunStep.count({ where: { runId: test.successorId, stepKey: "visual-blueprint-result-v1", status: "COMPLETED" } })).toBe(0);
    });
    it.each(["invalid", "truncated"] as const)("does not cache or silently repair %s model output", async failure => {
      const test = await planning(failure === "invalid" ? { response: { schema: "kf-design-plan/v3", displayName: "不完整" } } : { finishReason: "length" });
      await expect(test.run(() => test.service.createVisualDesignPlan(test.context))).rejects.toThrow("VISUAL_BLUEPRINT_OUTPUT_INVALID");
      expect(test.sent).toHaveLength(1);
      expect(await prisma.agentRunStep.count({ where: { runId: test.successorId, stepKey: "visual-blueprint-result-v1", status: "COMPLETED" } })).toBe(0);
    });
    it("does not publish a late blueprint after the user cancels the successor", async () => {
      let successor = "";
      const test = await planning({ inFlight: async () => { await controls.cancel(tenantId, successor, userId); } }); successor = test.successorId;
      await expect(test.run(() => test.service.createVisualDesignPlan(test.context))).rejects.toThrow("VISUAL_RUN_NOT_ACTIVE");
      expect(test.sent).toHaveLength(1);
      expect(await prisma.agentRunStep.count({ where: { runId: successor, stepKey: "visual-blueprint-result-v1", status: "COMPLETED" } })).toBe(0);
    });
    it("drives the real design-plan node into independent review and persists the displayed blueprint without build authority", async () => {
      const test = await planning();
      const { createDesignPlanNode } = await import("../../../../packages/agent-orchestrator/src/nodes/design-plan.js");
      const node = createDesignPlanNode({ modelPort: { createVisualDesignPlan: test.service.createVisualDesignPlan.bind(test.service),
        createDesignPlan: async () => { throw new Error("must not use text blueprint"); } }, workspaceQuery: {
        appendMessage: async (message: { tenantId: string; conversationId: string; role: string; content: string }) => {
          await prisma.message.create({ data: { ...message, runId: test.successorId } });
        },
      } } as never);
      const update = await test.run(() => node({ ...test.context, runId: test.successorId, planVersion: "run-plan@7", runMode: "build",
        acceptedVisualPlanningInput: test.snapshot.content.accepted, recentMessages: [{ role: "user", content: text }],
        designPlan: blueprint, designPlanHash: "0".repeat(64), buildAuthorization: "confirmed-blueprint", buildJobId: "old-checkpoint-job" } as never));
      expect(update).toMatchObject({ stage: "design-review", designPlan: blueprint,
        visualBlueprintConfirmationHash: test.snapshot.content.accepted.confirmationHash });
      expect(update.buildAuthorization).toBeUndefined(); expect(update.buildJobId).toBeUndefined();
      expect(await prisma.message.count({ where: { runId: test.successorId, role: "assistant" } })).toBe(1);
      expect(await prisma.changePlan.count({ where: { workspaceId } })).toBe(0);
      expect(await prisma.buildJob.count({ where: { workspaceId } })).toBe(0);
    });
    it("rejects corrupt completed output rather than resending or using the text route", async () => {
      const test = await planning(); await test.run(() => test.service.createVisualDesignPlan(test.context));
      await prisma.agentRunStep.updateMany({ where: { runId: test.successorId, stepKey: "visual-blueprint-result-v1" }, data: { outputRef: "{}" } });
      await expect(test.run(() => test.service.createVisualDesignPlan(test.context))).rejects.toThrow("VISUAL_BLUEPRINT_CACHE_INVALID");
      expect(test.sent).toHaveLength(1);
    });
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    it.each(["missing", "unknown", "duplicate"] as const)("does not publish a visual blueprint with %s source associations", async failure => {
      const proposed = structuredClone(blueprint);
      const owner = proposed.pages[0]!.regions.find((region) => region.id === "admin-sidebar-brand")!;
      if (failure === "missing") delete owner.visualRegionIds;
      if (failure === "unknown") owner.visualRegionIds = ["not-in-the-reviewed-image"];
      if (failure === "duplicate") proposed.pages[0]!.regions.find((region) => region.id !== owner.id)!.visualRegionIds = ["heading"];
      const test = await planning({ response: proposed });
      await expect(test.run(() => test.service.createVisualDesignPlan(test.context))).rejects.toThrow("VISUAL_BLUEPRINT_OUTPUT_INVALID");
      expect(test.sent).toHaveLength(1);
      expect(await prisma.agentRunStep.count({ where: { runId: test.successorId, status: "COMPLETED", stepKey: "visual-blueprint-result-v1" } })).toBe(0);
      expect(await prisma.modelInvocation.count({ where: { tenantId, task: "implementation" } })).toBe(0);
      expect(await prisma.buildJob.count({ where: { workspaceId } })).toBe(0);
    });
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    it("repairs an ungrounded observation once and caches only text grounded in the reviewed region", async () => {
      const valid = structuredClone(blueprint);
      valid.journeys[0]!.steps.push({ kind: "observe", pageId: "admin-directory-bp", regionId: "admin-sidebar-brand",
        action: "阅读已审核标题", result: "看到标题", expectedTexts: ["标题"] });
      const invalid = structuredClone(valid);
      const step = invalid.journeys[0]!.steps.at(-1)!;
      if (step.kind !== "observe") throw new Error("observation fixture required");
      step.expectedTexts = ["容器从上到下排列的设计说明"];
      const test = await planning({ repair: true, responses: [invalid, valid] });
      expect(await test.run(() => test.service.createVisualDesignPlan(test.context))).toEqual(valid);
      expect(await test.run(() => test.service.createVisualDesignPlan(test.context))).toEqual(valid);
      expect(test.sent).toHaveLength(2);
      const messages = test.sent[1]!.body.messages as Array<{ content: string }>;
      const payload = JSON.parse(messages[1]!.content) as { repairContext: { failedDraft: unknown; issues: unknown[] } };
      expect(payload.repairContext.failedDraft).toEqual(invalid);
      expect(payload.repairContext.issues).toEqual([expect.objectContaining({ code: "VISUAL_BLUEPRINT_OBSERVATION_TEXT_UNSUPPORTED",
        blueprintRegionId: "admin-sidebar-brand", expectedTextIndexes: [0], availableTextRegionIds: ["heading"] })]);
      expect((test.sent[0]!.body.messages as Array<{ content: string }>)[0]).toEqual(messages[0]);
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      expect(await prisma.modelInvocation.count({ where: { runId: test.successorId, task: "repair", promptVersion: "visual-blueprint-repair@8" } })).toBe(1);
      // end
      expect(await prisma.buildJob.count({ where: { workspaceId } })).toBe(0);
    });
    it("rejects a schema-valid ungrounded cache and refuses to sign it even when its stored model and message agree", async () => {
      const test = await planning({ repair: true });
      await test.run(() => test.service.createVisualDesignPlan(test.context));
      const invalid = structuredClone(blueprint);
      invalid.journeys[0]!.steps.push({ kind: "observe", pageId: "admin-directory-bp", regionId: "admin-sidebar-brand",
        action: "阅读布局说明", result: "看到设计说明", expectedTexts: ["没有经过审核的容器排列文案"] });
      await prisma.agentRunStep.updateMany({ where: { runId: test.successorId, stepKey: "visual-blueprint-result-v1" }, data: { outputRef: JSON.stringify(invalid) } });
      await expect(test.run(() => test.service.createVisualDesignPlan(test.context))).rejects.toThrow("VISUAL_BLUEPRINT_CACHE_INVALID");
      const { encodeBlueprintMessage, hashDesignPlan } = await import("@kf/agent-orchestrator");
      const designPlanHash = hashDesignPlan(invalid, 1);
      await prisma.message.create({ data: { tenantId, conversationId, runId: test.successorId, role: "assistant", content: encodeBlueprintMessage(invalid, 1, designPlanHash) } });
      await expect(test.run(() => reviews.prepareBlueprintReview({ runId: test.successorId, blueprint: invalid, revision: 1, designPlanHash,
        visualConfirmationHash: test.snapshot.content.accepted.confirmationHash }))).rejects.toThrow("VISUAL_BLUEPRINT_REVIEW_MISMATCH");
      expect(test.sent).toHaveLength(1);
      expect(await prisma.agentRunStep.count({ where: { runId: test.successorId, stepKey: "visual-blueprint-review-v1" } })).toBe(0);
      expect(await prisma.modelInvocation.count({ where: { runId: test.successorId, task: "repair" } })).toBe(0);
      expect(await prisma.buildJob.count({ where: { workspaceId } })).toBe(0);
    });
    // end
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    it("repairs schema and source defects together under one frozen blueprint allowance", async () => {
      const invalid = { ...structuredClone(blueprint), audiences: [null] };
      delete invalid.pages[0]!.regions.find(region => region.id === "admin-sidebar-brand")!.visualRegionIds;
      const test = await planning({ repair: true, responses: [invalid, blueprint] });
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      expect(test.snapshot.content.blueprintModel?.promptVersion).toBe("visual-blueprint@14");
      // end
      // end
      expect(await test.run(() => test.service.createVisualDesignPlan(test.context))).toEqual(blueprint);
      expect(await test.run(() => test.service.createVisualDesignPlan(test.context))).toEqual(blueprint);
      expect(test.sent).toHaveLength(2);
      const messages = test.sent[1]!.body.messages as Array<{ content: string }>;
      const payload = JSON.parse(messages[1]!.content) as { repairContext: { failedDraft: unknown; issues: unknown[] } };
      expect(payload.repairContext.failedDraft).toEqual(invalid);
      expect(payload.repairContext.issues).toEqual(expect.arrayContaining([
        { code: "SCHEMA_invalid_type", path: "audiences.0" },
        { code: "VISUAL_BLUEPRINT_SOURCES_REQUIRED", regionIds: ["heading"] },
      ]));
      expect((test.sent[0]!.body.messages as Array<{ content: string }>)[0]).toEqual(messages[0]);
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      expect(await prisma.modelInvocation.count({ where: { runId: test.successorId, task: "repair", promptVersion: "visual-blueprint-repair@8" } })).toBe(1);
      // end
      // end
      expect(await prisma.agentRunStep.count({ where: { runId: test.successorId, stepKey: "visual-blueprint-result-v1", status: "COMPLETED" } })).toBe(1);
      expect(await prisma.buildJob.count({ where: { workspaceId } })).toBe(0);
    });
    // end
    it("repairs one new proposal under a frozen opt-in policy and reuses only the fully validated final cache", async () => {
      const invalid = structuredClone(blueprint);
      delete invalid.pages[0]!.regions.find(region => region.id === "admin-sidebar-brand")!.visualRegionIds;
      const test = await planning({ repair: true, responses: [invalid, blueprint] });
      expect(test.snapshot.content.blueprintModel?.repairPolicy).toBe("once");
      expect(await test.run(() => test.service.createVisualDesignPlan(test.context))).toEqual(blueprint);
      expect(await test.run(() => test.service.createVisualDesignPlan(test.context))).toEqual(blueprint);
      expect(test.sent).toHaveLength(2);
      expect(await prisma.modelInvocation.count({ where: { runId: test.successorId, task: "blueprint" } })).toBe(1);
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      expect(await prisma.modelInvocation.count({ where: { runId: test.successorId, task: "repair", promptVersion: "visual-blueprint-repair@8" } })).toBe(1);
      // end
      // end
      // end
      expect(test.sent[1]!.url).toBe(test.sent[0]!.url);
      expect(JSON.stringify(test.sent[1]!.body)).toContain("repairContext");
      expect(JSON.stringify(test.sent[1]!.body)).toContain("heading");
      expect(JSON.stringify(test.sent[1]!.body)).not.toMatch(/image_url|base64|vcont1:|vref1:|leaseOwner|fixture-key/);
      expect(await prisma.agentRunStep.count({ where: { runId: test.successorId, stepKey: "visual-blueprint-repair-v1", status: "COMPLETED" } })).toBe(1);
      expect(await prisma.buildJob.count({ where: { workspaceId } })).toBe(0);
    });
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    it("repairs stopped malformed JSON once and caches only the fully validated blueprint", async () => {
      const text = '{"schema":"kf-design-plan/v3","pages":[broken]}';
      const test = await planning({ repair: true, responseTexts: [text] });
      expect(await test.run(() => test.service.createVisualDesignPlan(test.context))).toEqual(blueprint);
      expect(await test.run(() => test.service.createVisualDesignPlan(test.context))).toEqual(blueprint);
      expect(test.sent).toHaveLength(2);
      const messages = test.sent[1]!.body.messages as Array<{ content: string }>;
      const payload = JSON.parse(messages[1]!.content) as { repairContext: { failedDraft: unknown; issues: unknown[] } };
      expect(payload.repairContext).toMatchObject({ failedDraft: text, issues: [{ code: "BLUEPRINT_JSON_SYNTAX_INVALID" }] });
      expect((test.sent[0]!.body.messages as Array<{ content: string }>)[0]).toEqual(messages[0]);
      const cached = await prisma.agentRunStep.findFirstOrThrow({ where: { runId: test.successorId, stepKey: "visual-blueprint-result-v1" } });
      expect(cached.status).toBe("COMPLETED");
      expect(JSON.parse(cached.outputRef!)).toEqual(blueprint);
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      expect(await prisma.modelInvocation.count({ where: { runId: test.successorId, task: "repair", promptVersion: "visual-blueprint-repair@8" } })).toBe(1);
      // end
      // end
      // end
      expect(await prisma.buildJob.count({ where: { workspaceId } })).toBe(0);
      await prisma.agentRunStep.update({ where: { id: cached.id }, data: { outputRef: text } });
      await expect(test.run(() => test.service.createVisualDesignPlan(test.context))).rejects.toThrow("VISUAL_BLUEPRINT_CACHE_INVALID");
      expect(test.sent).toHaveLength(2);
    });
    it.each([
      { text: "{", finishReason: "stop" },
      { text: "{bad}", finishReason: "length" },
      { text: "{bad}", finishReason: null },
      { text: "{}", finishReason: null },
      { text: "{bad}", finishReason: "content_filter" },
      { text: "[]", finishReason: "stop" },
      { text: `{"${"界".repeat(12000)}":bad}`, finishReason: "stop" },
    ])("does not spend a repair for an ineligible JSON frame ($finishReason)", async ({ text, finishReason }) => {
      const test = await planning({ repair: true, responseTexts: [text], finishReasons: [finishReason] });
      await expect(test.run(() => test.service.createVisualDesignPlan(test.context))).rejects.toThrow("VISUAL_BLUEPRINT_OUTPUT_INVALID");
      expect(test.sent).toHaveLength(1);
      expect(await prisma.modelInvocation.count({ where: { runId: test.successorId, task: "repair" } })).toBe(0);
      expect(await prisma.agentRunStep.count({ where: { runId: test.successorId, stepKey: "visual-blueprint-repair-v1" } })).toBe(0);
    });
    it.each(["default-off", "server-disabled"] as const)("retains %s for syntax repair", async policy => {
      const test = await planning({ responseTexts: ["{bad}"], ...(policy === "server-disabled" ? { repair: true, allowRepair: false } : {}) });
      await expect(test.run(() => test.service.createVisualDesignPlan(test.context))).rejects.toThrow();
      expect(test.sent).toHaveLength(1);
      expect(await prisma.modelInvocation.count({ where: { runId: test.successorId, task: "repair" } })).toBe(0);
    });
    it("blocks any second syntax repair across old ledger versions and a missing allowance record", async () => {
      const test = await planning({ repair: true, responseTexts: ["{bad}", "{still-bad}", "{bad}"] });
      await expect(test.run(() => test.service.createVisualDesignPlan(test.context))).rejects.toThrow("VISUAL_BLUEPRINT_OUTPUT_INVALID");
      expect(test.sent).toHaveLength(2);
      await prisma.agentRunStep.deleteMany({ where: { runId: test.successorId, stepKey: "visual-blueprint-repair-v1" } });
      await prisma.modelInvocation.updateMany({ where: { runId: test.successorId, task: "repair" }, data: { promptVersion: "visual-blueprint-repair@1" } });
      await expect(test.run(() => test.service.createVisualDesignPlan(test.context))).rejects.toThrow("VISUAL_BLUEPRINT_REPAIR_ALREADY_USED");
      expect(test.sent).toHaveLength(3); // Recovery may repeat the initial call; it cannot repeat the repair.
      expect(await prisma.modelInvocation.count({ where: { runId: test.successorId, task: "repair" } })).toBe(1);
      expect(await prisma.agentRunStep.count({ where: { runId: test.successorId, stepKey: "visual-blueprint-result-v1", status: "COMPLETED" } })).toBe(0);
    });
    it("serializes concurrent re-entry while the syntax repair is in flight", async () => {
      let release!: () => void; let reached!: () => void;
      const barrier = new Promise<void>(resolve => { reached = resolve; });
      const paused = new Promise<void>(resolve => { release = resolve; });
      const test = await planning({ repair: true, responseTexts: ["{bad}"], inFlight: async index => { if (index === 2) { reached(); await paused; } } });
      const running = test.run(() => test.service.createVisualDesignPlan(test.context));
      const settled = running.then(value => ({ value }), error => ({ error: error as unknown }));
      await Promise.race([barrier, settled.then(() => { throw new Error("repair settled before the expected in-flight boundary"); })]);
      try { await expect(test.run(() => test.service.createVisualDesignPlan(test.context))).rejects.toThrow("VISUAL_BLUEPRINT_IN_PROGRESS"); }
      finally { release(); }
      expect(await settled).toEqual({ value: blueprint });
      expect(test.sent).toHaveLength(2);
      expect(await prisma.modelInvocation.count({ where: { runId: test.successorId, task: "repair" } })).toBe(1);
    });
    // end
    it("never repairs a failed repair again, including after a new owner recovers the same Run", async () => {
      const test = await planning({ repair: true, response: {} });
      await expect(test.run(() => test.service.createVisualDesignPlan(test.context))).rejects.toThrow("VISUAL_BLUEPRINT_OUTPUT_INVALID");
      expect(test.sent).toHaveLength(2);
      await prisma.agentRun.update({ where: { id: test.successorId }, data: { leaseExpiresAt: new Date(0) } });
      const recovered = await store.recoverExpired("blueprint-repair-recovery", tenantId, new Date());
      expect(recovered?.runId).toBe(test.successorId);
      await expect(withAgentRunExecution({ tenantId, runId: recovered!.runId, ownerId: recovered!.ownerId, fence: recovered!.fence,
        signal: new AbortController().signal }, () => test.service.createVisualDesignPlan(test.context))).rejects.toThrow("VISUAL_BLUEPRINT_REPAIR_ALREADY_USED");
      expect(test.sent).toHaveLength(3); // Existing initial-call recovery semantics; no second repair.
      expect(await prisma.modelInvocation.count({ where: { runId: test.successorId, task: "repair" } })).toBe(1);
      expect(await prisma.agentRunStep.count({ where: { runId: test.successorId, stepKey: "visual-blueprint-result-v1", status: "COMPLETED" } })).toBe(0);
    });
    it("does not repair or reinterpret already committed cached facts even under a once policy", async () => {
      const test = await planning({ repair: true });
      await test.run(() => test.service.createVisualDesignPlan(test.context));
      await prisma.agentRunStep.updateMany({ where: { runId: test.successorId, stepKey: "visual-blueprint-result-v1" }, data: { outputRef: "{}" } });
      await expect(test.run(() => test.service.createVisualDesignPlan(test.context))).rejects.toThrow("VISUAL_BLUEPRINT_CACHE_INVALID");
      expect(test.sent).toHaveLength(1);
      expect(await prisma.modelInvocation.count({ where: { runId: test.successorId, task: "repair" } })).toBe(0);
    });
    it("uses the ledger as a second one-shot guard when the repair allowance record is missing", async () => {
      const test = await planning({ repair: true, response: {} });
      await expect(test.run(() => test.service.createVisualDesignPlan(test.context))).rejects.toThrow("VISUAL_BLUEPRINT_OUTPUT_INVALID");
      await prisma.agentRunStep.deleteMany({ where: { runId: test.successorId, stepKey: "visual-blueprint-repair-v1" } });
      await expect(test.run(() => test.service.createVisualDesignPlan(test.context))).rejects.toThrow("VISUAL_BLUEPRINT_REPAIR_ALREADY_USED");
      expect(test.sent).toHaveLength(3);
      expect(await prisma.modelInvocation.count({ where: { runId: test.successorId, task: "repair" } })).toBe(1);
    });
    it.each(
      (["cancel", "policy", "fence", "actor"] as const).flatMap(change => (["schema", "syntax"] as const).map(mode => ({ change, mode }))),
    )("rechecks $change before reserving or sending any repair ($mode)", async ({ change, mode }) => {
      let successorId = "";
      const test = await planning({ repair: true, response: {}, ...(mode === "syntax" ? { responseTexts: ["{bad}"] } : {}), inFlight: async index => {
        if (index !== 1) return;
        if (change === "cancel") await controls.cancel(tenantId, successorId, userId);
        else if (change === "policy") await prisma.tenant.update({ where: { id: tenantId }, data: { imageEgressAllowed: false } });
        else if (change === "actor") {
          const replacementActor = await prisma.user.create({ data: { tenantId, username: randomUUID(), passwordHash: "fixture-only", role: "member" } });
          await prisma.agentRun.update({ where: { id: successorId }, data: { requestedByUserId: replacementActor.id } });
        } else {
          await prisma.agentRun.update({ where: { id: successorId }, data: { leaseExpiresAt: new Date(0) } });
          expect((await store.recoverExpired("blueprint-before-repair-new-owner", tenantId, new Date()))?.runId).toBe(successorId);
        }
      } }); successorId = test.successorId;
      await expect(test.run(() => test.service.createVisualDesignPlan(test.context))).rejects.toThrow();
      expect(test.sent).toHaveLength(1);
      expect(await prisma.modelInvocation.count({ where: { runId: successorId, task: "repair" } })).toBe(0);
    });
    it.each(
      (["cancel", "policy", "fence", "actor"] as const).flatMap(change => (["schema", "syntax"] as const).map(mode => ({ change, mode }))),
    )("does not publish a repaired proposal after $change changes in flight ($mode)", async ({ change, mode }) => {
      let successorId = "";
      const test = await planning({ repair: true, responses: [{}, blueprint], ...(mode === "syntax" ? { responseTexts: ["{bad}"] } : {}), inFlight: async index => {
        if (index !== 2) return;
        if (change === "cancel") await controls.cancel(tenantId, successorId, userId);
        else if (change === "policy") await prisma.tenant.update({ where: { id: tenantId }, data: { imageEgressAllowed: false } });
        else if (change === "actor") {
          const replacementActor = await prisma.user.create({ data: { tenantId, username: randomUUID(), passwordHash: "fixture-only", role: "member" } });
          await prisma.agentRun.update({ where: { id: successorId }, data: { requestedByUserId: replacementActor.id } });
        } else {
          await prisma.agentRun.update({ where: { id: successorId }, data: { leaseExpiresAt: new Date(0) } });
          expect((await store.recoverExpired("blueprint-repair-new-owner", tenantId, new Date()))?.runId).toBe(successorId);
        }
      } }); successorId = test.successorId;
      await expect(test.run(() => test.service.createVisualDesignPlan(test.context))).rejects.toThrow();
      expect(test.sent).toHaveLength(2);
      expect(await prisma.agentRunStep.count({ where: { runId: successorId, stepKey: "visual-blueprint-result-v1", status: "COMPLETED" } })).toBe(0);
      expect(await prisma.modelInvocation.count({ where: { runId: successorId, task: "repair", status: "SUCCEEDED" } })).toBe(1);
    });
    it.each(["truncated", "disabled"] as const)("does not repair %s output or exceed current server policy", async change => {
      const test = await planning({ repair: true, response: {}, ...(change === "truncated" ? { finishReason: "length" } : { allowRepair: false }) });
      await expect(test.run(() => test.service.createVisualDesignPlan(test.context))).rejects.toThrow();
      expect(test.sent).toHaveLength(1);
      expect(await prisma.modelInvocation.count({ where: { runId: test.successorId, task: "repair" } })).toBe(0);
    });
    // end
    it("does not resend after an unknown persisted cache status", async () => {
      const test = await planning(); await test.run(() => test.service.createVisualDesignPlan(test.context));
      await prisma.agentRunStep.updateMany({ where: { runId: test.successorId, stepKey: "visual-blueprint-result-v1" }, data: { status: "CORRUPT" } });
      await expect(test.run(() => test.service.createVisualDesignPlan(test.context))).rejects.toThrow("VISUAL_BLUEPRINT_CACHE_INVALID");
      expect(test.sent).toHaveLength(1);
    });
    it("serializes concurrent calls for the same lease instead of charging twice", async () => {
      let release!: () => void; let reached!: () => void;
      const barrier = new Promise<void>(resolve => { reached = resolve; }); const paused = new Promise<void>(resolve => { release = resolve; });
      const test = await planning({ inFlight: async () => { reached(); await paused; } });
      const first = test.run(() => test.service.createVisualDesignPlan(test.context));
      await barrier;
      try { await expect(test.run(() => test.service.createVisualDesignPlan(test.context))).rejects.toThrow("VISUAL_BLUEPRINT_IN_PROGRESS"); }
      finally { release(); }
      expect(await first).toEqual(blueprint); expect(test.sent).toHaveLength(1);
    });
    it("reuses completed blueprint output after a real expired lease is recovered by a new owner", async () => {
      const test = await planning(); await test.run(() => test.service.createVisualDesignPlan(test.context));
      await prisma.agentRun.update({ where: { id: test.successorId }, data: { leaseExpiresAt: new Date(0) } });
      const lease = await store.recoverExpired("blueprint-recovery", tenantId, new Date());
      expect(lease?.runId).toBe(test.successorId);
      expect(await withAgentRunExecution({ tenantId, runId: lease!.runId, ownerId: lease!.ownerId, fence: lease!.fence,
        signal: new AbortController().signal }, () => test.service.createVisualDesignPlan(test.context))).toEqual(blueprint);
      expect(test.sent).toHaveLength(1);
    });
    it("prevents a late old-fence result from overwriting a recovered owner's completed blueprint", async () => {
      let release!: () => void; let reached!: () => void; let requests = 0;
      const barrier = new Promise<void>(resolve => { reached = resolve; }); const paused = new Promise<void>(resolve => { release = resolve; });
      const test = await planning({ inFlight: async () => { if (++requests === 1) { reached(); await paused; } } });
      const late = test.run(() => test.service.createVisualDesignPlan(test.context)).catch((error: unknown) => error);
      await barrier;
      try {
        await prisma.agentRun.update({ where: { id: test.successorId }, data: { leaseExpiresAt: new Date(0) } });
        const lease = await store.recoverExpired("blueprint-new-owner", tenantId, new Date());
        expect(lease?.runId).toBe(test.successorId);
        expect(await withAgentRunExecution({ tenantId, runId: lease!.runId, ownerId: lease!.ownerId, fence: lease!.fence,
          signal: new AbortController().signal }, () => test.service.createVisualDesignPlan(test.context))).toEqual(blueprint);
      } finally { release(); }
      expect(await late).toMatchObject({ message: "VISUAL_RUN_NOT_ACTIVE" });
      const saved = await prisma.agentRunStep.findFirstOrThrow({ where: { runId: test.successorId, stepKey: "visual-blueprint-result-v1" } });
      expect(saved).toMatchObject({ status: "COMPLETED", attempt: 2 });
      expect(JSON.parse(saved.outputRef!)).toEqual(blueprint);
      expect(test.sent).toHaveLength(2);
      expect(await prisma.modelInvocation.count({ where: { runId: test.successorId, task: "blueprint", status: "SUCCEEDED" } })).toBe(2);
    });
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
    async function runtime<T>(test: Pick<Awaited<ReturnType<typeof planning>>, "service">, work: (value: {
    // end
      execution: RunExecutionService; conversations: import("../conversations/conversation.service.js").ConversationService;
    }) => Promise<T>) {
      const { AgentWorkerModule } = await import("./run-worker.module.js");
      const { ConversationService } = await import("../conversations/conversation.service.js");
      const { MODEL_PORT, DEFAULT_MODEL_PORT } = await import("../conversations/model-port.js");
      const app = await Test.createTestingModule({ imports: [AgentWorkerModule] }).overrideProvider(MODEL_PORT).useValue({
        ...DEFAULT_MODEL_PORT, createVisualDesignPlan: test.service.createVisualDesignPlan.bind(test.service),
        classifyIntent: async () => { throw new Error("visual acceptance must bypass text classification"); },
        createDesignPlan: async () => { throw new Error("visual acceptance must not use text blueprint"); },
      }).compile();
      await app.init();
      try {
        const conversations = app.get(ConversationService);
        const handlers = createRunHandlerRegistry({ prisma, loadGraph: async () => (await conversations.getGraph()) as unknown as import("./run-graph-runner.js").GraphLike,
          acquireTurn: id => conversations.acquireRunTurn(id), registerMemo: (id, memo) => conversations.registerRunMemo(id, memo),
          visualContinuation: reviews });
        return await work({ conversations, execution: new RunExecutionService({ prisma, store, steps: new PrismaRunStepStore(prisma),
          handlers, visualContinuation: reviews }) });
      } finally { await app.close(); }
    }
    it("executes the accepted successor through the real worker registry, PostgreSQL graph and durable blueprint pause", async () => {
      const test = await planning();
      await runtime(test, async ({ execution, conversations }) => {
        const outcome = await execution.executeLease(test.lease, new AbortController().signal);
        expect(outcome).toMatchObject({ status: "WAITING_INPUT", failureCode: null, buildJobId: null });
        const checkpoint = await (await conversations.getGraph()).getState({ configurable: { thread_id: conversationId } });
        expect(checkpoint.values).toMatchObject({ runId: test.successorId, planVersion: "run-plan@7", stage: "design-review",
          acceptedVisualPlanningInput: test.snapshot.content.accepted, visualBlueprintConfirmationHash: test.snapshot.content.accepted.confirmationHash });
        expect(checkpoint.values.buildAuthorization).toBeUndefined();
        const events = await prisma.agentRunEvent.findMany({ where: { runId: test.successorId }, orderBy: { seq: "asc" } });
        const pending = events.filter(event => event.type === "input.required");
        expect(pending).toHaveLength(1);
        expect((pending[0]!.payload as { receipt: string }).receipt).toBe(encodeBlueprintConfirmation(checkpoint.values.designRevision, checkpoint.values.designPlanHash));
        expect(JSON.stringify(events)).not.toMatch(/已完成流程节点：classify-intent|visual-blueprint.invalid|vcont1:/);
        expect(await prisma.message.count({ where: { runId: test.successorId, role: "assistant" } })).toBe(1);
        expect(test.sent).toHaveLength(1);
        expect(await prisma.buildJob.count({ where: { workspaceId } })).toBe(0);
      });
    });
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    it("continues public HTTP confirmation through the actual executor and PG graph to a separate blueprint receipt", async () => {
      const test = await planning({ http: true });
      await runtime(test, async ({ execution }) => {
        expect(await execution.executeLease(test.lease, new AbortController().signal)).toMatchObject({ status: "WAITING_INPUT", buildJobId: null });
        const event = await prisma.agentRunEvent.findFirstOrThrow({ where: { runId: test.successorId, type: "input.required" } });
        expect((event.payload as { receipt: string }).receipt).not.toMatch(/^vref1:|^vcont1:/);
        expect(await prisma.message.count({ where: { runId: test.successorId, role: "assistant" } })).toBe(1);
        expect(test.sent).toHaveLength(1);
        expect(await prisma.buildJob.count({ where: { workspaceId } })).toBe(0);
        await expect(start({ clientRequestId: randomUUID(), clientMessageId: randomUUID(), mode: "build",
          action: { type: "confirm_blueprint", expectedRunId: test.successorId, receipt: (event.payload as { receipt: string }).receipt } }))
          // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
          .rejects.toMatchObject({ status: 403, message: "VISUAL_FLOW_NOT_CONFIGURED" });
          // end
      });
    });
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
    async function blueprintWaiting(options: { http?: boolean } = {}) {
      const test = await planning(options);
    // end
      await runtime(test, async ({ execution }) => {
        expect(await execution.executeLease(test.lease, new AbortController().signal)).toMatchObject({ status: "WAITING_INPUT" });
      });
      const event = await prisma.agentRunEvent.findFirstOrThrow({ where: { runId: test.successorId, type: "input.required" } });
      return { ...test, receipt: (event.payload as { receipt: string }).receipt,
        source: await prisma.agentRun.findUniqueOrThrow({ where: { id: test.successorId } }) };
    }
    it.each(["model-hash", "model-output", "message", "stamp", "revision", "fence"] as const)(
      "refuses to sign a blueprint review with inconsistent %s before publication", async changed => {
        const test = await planning(); await test.run(() => test.service.createVisualDesignPlan(test.context));
        const { encodeBlueprintMessage, hashDesignPlan } = await import("@kf/agent-orchestrator");
        const designPlanHash = hashDesignPlan(blueprint, 1);
        await prisma.message.create({ data: { tenantId, conversationId, runId: test.successorId, role: "assistant",
          content: changed === "message" ? "不是蓝图" : encodeBlueprintMessage(blueprint, 1, designPlanHash) } });
        if (changed === "model-hash") await prisma.agentRunStep.updateMany({ where: { runId: test.successorId, stepKey: "visual-blueprint-result-v1" }, data: { inputHash: "0".repeat(64) } });
        if (changed === "model-output") await prisma.agentRunStep.updateMany({ where: { runId: test.successorId, stepKey: "visual-blueprint-result-v1" }, data: { outputRef: JSON.stringify({ ...blueprint, displayName: "不同结果" }) } });
        const code = changed === "message" ? "VISUAL_BLUEPRINT_MESSAGE_MISMATCH" : changed === "fence" ? "VISUAL_RUN_NOT_ACTIVE" : "VISUAL_BLUEPRINT_REVIEW_MISMATCH";
        await expect(test.run(() => reviews.prepareBlueprintReview({ runId: test.successorId, blueprint,
          revision: changed === "revision" ? 2 : 1, designPlanHash,
          visualConfirmationHash: changed === "stamp" ? "0".repeat(64) : test.snapshot.content.accepted.confirmationHash }),
          changed === "fence" ? test.lease.fence + 1 : test.lease.fence)).rejects.toThrow(code);
        expect(await prisma.agentRunStep.count({ where: { runId: test.successorId, stepKey: "visual-blueprint-review-v1" } })).toBe(0);
        expect(await prisma.agentRunEvent.count({ where: { runId: test.successorId, type: "input.required" } })).toBe(0);
      });
    type BlueprintWaiting = Awaited<ReturnType<typeof blueprintWaiting>>;
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    const semanticRoute: ModelRoute = { ...blueprintRoute, baseUrl: "https://visual-semantic.invalid/v1", model: "semantic-fixture", maxContextTokens: 256000 };
    // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    async function semantic(options: { noConfig?: boolean; response?: unknown; responses?: unknown[]; inFlight?: (index: number) => Promise<void>;
      responseText?: string; responseTexts?: string[]; finishReason?: string; public?: boolean; repair?: boolean; allowRepair?: boolean } = {}) {
    // end
      const input = await blueprintWaiting(options.public ? { http: true } : {});
    // end
      // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
      if (!options.noConfig) reviews = new VisualReviewService(prisma, Buffer.alloc(32, 0x48), { blueprint: blueprintRoute, implementation: semanticRoute,
        semanticRepairPolicy: options.repair ? "once" : "none" });
      // end
      // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
      let inherited: Awaited<ReturnType<typeof engineering>>;
      let publicRequest: ReturnType<typeof engineeringBody> | undefined;
      if (options.public) {
        publicEngineeringStore(); publicRequest = engineeringBody(input);
        const successorId = await withPublicHttp(async ({ app, cookie }) => {
          const response = await request(app.getHttpServer()).post(`/api/conversations/${conversationId}/runs`)
            .set("Cookie", cookie).set("Origin", "http://localhost:5174").send(publicRequest).expect(202);
          expect(JSON.stringify(response.body)).not.toMatch(/visualEngineering|veng1:|vbpr1:|vcont1:|configSnapshot|semantic-fixture/);
          return response.body.id as string;
        });
        inherited = { successorId, snapshot: (await prisma.$transaction(tx => reviews.readEngineeringInTransaction(tx, scope(), successorId))).snapshot };
      } else inherited = await engineering(input);
      const { snapshot, successorId } = inherited; const lease = await claim(successorId, "semantic-worker");
      // end
      const { getDesignKnowledgeSnapshot, retrieveCapabilities } = await import("@kf/domain-client");
      const { SolutionImplementationPlanSchema, VisualSemanticPlanSchema } = await import("@kf/contracts");
      // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
      const candidates = retrieveCapabilities({ blueprint, knowledge: getDesignKnowledgeSnapshot(), visualReference: snapshot.content.accepted.reference });
      // end
      const golden = JSON.parse(await readFile(new URL("../../../../tests/fixtures/creative-goldens/management-admin.json", import.meta.url), "utf8")) as { plan: Record<string, unknown> };
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      // This fixture's admitted baseline is initial: expected metadata uses the server's default identity.
      const expected = VisualSemanticPlanSchema.parse({ schema: "kf-visual-semantic-plan/v1", plan: SolutionImplementationPlanSchema.parse({ ...golden.plan,
        projectKey: "kingclient", blueprintHash: canonicalServerHash(blueprint), candidateBundleHash: canonicalServerHash(candidates) }), bindings: [{ regionId: "heading", nodeId: "admin-brand-title" }] });
      // end
      // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
      // Model fixture must propose the exact reviewed capability, as the browser fixture already does.
      const headingCapability = snapshot.content.accepted.reference.mappings.find(mapping => mapping.regionId === "heading")!.capabilityId;
      if (headingCapability !== "text" && headingCapability !== "richtext") throw new Error("semantic heading fixture requires a reviewed text capability");
      const proposalNodes = expected.plan.pages.map(page => page.root);
      while (proposalNodes.length > 0) {
        const node = proposalNodes.pop()!;
        if (node.kind === "control" && node.id === "admin-brand-title") node.capabilityId = headingCapability;
        if (node.kind === "layout") proposalNodes.push(...node.children);
      }
      // end
      const context = { ...scope(), generationWorkflow: "creative-v2" as const, currentRevisionId: baseRevisionId, recentMessages: [],
        confirmedSolutionBlueprint: blueprint, capabilityCandidates: candidates, assetCatalog: [], visualReference: snapshot.content.accepted.reference };
      const sent: Array<{ url: string; body: Record<string, unknown> }> = [];
      const gateway = new ModelGatewayService(new ModelInvocationService(prisma), async (url, init) => {
        sent.push({ url: typeof url === "string" ? url : url instanceof URL ? url.href : url.url,
          // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
          body: JSON.parse(init?.body as string) as Record<string, unknown> }); await options.inFlight?.(sent.length);
        const proposal = options.responses?.[sent.length - 1] ?? options.response ?? expected;
        const candidate = proposal as { schema?: unknown; plan?: { pages?: unknown } };
        let wireProposal = candidate?.schema === "kf-visual-semantic-plan/v1" && Array.isArray(candidate.plan?.pages)
          ? serializeVisualSemanticGraph(proposal as VisualSemanticPlan) : proposal;
        const messages = (sent.at(-1)!.body.messages as Array<{ content: string }>);
        let repairInput: { repairProtocol?: { mode?: string }; failedDraft?: unknown } | null = null;
        try { repairInput = JSON.parse(messages[1]!.content); } catch { /* Initial user prompt is intentionally not JSON. */ }
        if (options.responseTexts?.[sent.length - 1] === undefined && options.responseText === undefined
          && repairInput?.repairProtocol?.mode === "delta" && (wireProposal as { schema?: string })?.schema === "kf-visual-semantic-graph/v1") {
          wireProposal = visualSemanticDeltaFixture(repairInput.failedDraft, wireProposal);
        }
        return new Response(JSON.stringify({ model: "semantic-fixture", choices: [{ finish_reason: options.finishReason ?? "stop", message: {
          content: options.responseTexts?.[sent.length - 1] ?? options.responseText ?? JSON.stringify(wireProposal) } }], usage: { prompt_tokens: 800, completion_tokens: 100 } }));
          // end
      }, "fixture-key");
      const { VisualSemanticService } = await import("../vision/visual-semantic.service.js");
      // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
      const service = new VisualSemanticService(prisma, reviews, gateway, { allowRepair: options.repair === true && options.allowRepair !== false });
      // end
      const run = <T>(work: () => Promise<T>, fence = lease.fence) => withAgentRunExecution({ tenantId, runId: successorId,
        ownerId: lease.ownerId, fence, signal: new AbortController().signal }, work);
      // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
      return { input, snapshot, successorId, lease, context, expected, sent, service, run, publicRequest };
      // end
    }
    it("freezes the dedicated semantic route and prompt identity in the signed engineering continuation", async () => {
      const input = await blueprintWaiting();
      reviews = new VisualReviewService(prisma, Buffer.alloc(32, 0x48), { blueprint: blueprintRoute, implementation: semanticRoute });
      const { snapshot } = await engineering(input);
      // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
      // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
      // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      expect(snapshot.content.semanticModel).toMatchObject({ route: semanticRoute, promptVersion: "visual-semantic@24", repairPolicy: "none", configHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
      // end
      // end
      // end
      // end
      // end
      // end
    });
    it("executes reviewed semantic planning through the frozen gateway, ledger and durable result cache", async () => {
      const test = await semantic(); const result = await test.run(() => test.service.createVisualSolutionImplementationPlan(test.context));
      expect(result.bindings).toEqual(test.expected.bindings); expect(result.plan.blueprintHash).toBe(test.expected.plan.blueprintHash);
      expect(await test.run(() => test.service.createVisualSolutionImplementationPlan(test.context))).toEqual(result);
      expect(test.sent).toHaveLength(1); expect(test.sent[0]!.url).toBe("https://visual-semantic.invalid/v1/chat/completions");
      expect(test.sent[0]!.body.model).toBe("semantic-fixture");
      const wire = JSON.stringify(test.sent[0]!.body); expect(wire).toContain("标题"); expect(wire).toContain("capabilityCandidateProjection");
      expect(wire).not.toMatch(/image_url|base64|veng1:|vbpr1:|vcont1:|fixture-key|leaseOwner/);
      expect(await prisma.modelInvocation.count({ where: { runId: test.successorId, task: "implementation", status: "SUCCEEDED" } })).toBe(1);
    });
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    it("rejects a legacy nested wire response without silently migrating it", async () => {
      const modelReply = { responseText: "" };
      const test = await semantic(modelReply);
      modelReply.responseText = JSON.stringify(test.expected);
      await expect(test.run(() => test.service.createVisualSolutionImplementationPlan(test.context))).rejects.toThrow("VISUAL_SEMANTIC_OUTPUT_INVALID");
      expect(test.sent).toHaveLength(1);
      expect(await prisma.buildJob.count({ where: { workspaceId } })).toBe(0);
    });
    it("never treats a graph-format cache as a committed canonical semantic result", async () => {
      const test = await semantic();
      await test.run(() => test.service.createVisualSolutionImplementationPlan(test.context));
      await prisma.agentRunStep.updateMany({ where: { runId: test.successorId, stepKey: "visual-semantic-result-v1" },
        data: { outputRef: JSON.stringify(serializeVisualSemanticGraph(test.expected)) } });
      await expect(test.run(() => test.service.createVisualSolutionImplementationPlan(test.context))).rejects.toThrow("VISUAL_SEMANTIC_CACHE_INVALID");
      expect(test.sent).toHaveLength(1);
    });
    // end
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    it("repairs semantic output exactly once under the independently frozen policy and caches only a compilable result", async () => {
      const test = await semantic({ repair: true, responses: [{}] });
      expect(test.snapshot.content.semanticModel?.repairPolicy).toBe("once");
      const result = await test.run(() => test.service.createVisualSolutionImplementationPlan(test.context));
      expect(result.bindings).toEqual(test.expected.bindings);
      expect(await test.run(() => test.service.createVisualSolutionImplementationPlan(test.context))).toEqual(result);
      expect(test.sent).toHaveLength(2);
      expect(test.sent[1]!.url).toBe(test.sent[0]!.url);
      expect(JSON.stringify(test.sent[1]!.body)).toContain("visual-semantic-repair");
      expect(JSON.stringify(test.sent[1]!.body)).not.toMatch(/image_url|base64|veng1:|vbpr1:|fixture-key|leaseOwner/);
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      expect(await prisma.modelInvocation.count({ where: { runId: test.successorId, task: "repair", promptVersion: "visual-semantic-repair@13" } })).toBe(1);
      // end
      // end
      // end
      expect(await prisma.agentRunStep.count({ where: { runId: test.successorId, stepKey: "visual-semantic-repair-v1", status: "COMPLETED" } })).toBe(1);
      expect(await prisma.buildJob.count({ where: { workspaceId } })).toBe(0);
    });
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    it("sends explicit missing-region coverage into the one repair and caches only the fully bound result", async () => {
      const responses: unknown[] = [];
      const test = await semantic({ repair: true, responses });
      const partial = structuredClone(test.expected);
      partial.bindings = [];
      responses.push(partial);
      const result = await test.run(() => test.service.createVisualSolutionImplementationPlan(test.context));
      expect(result.bindings).toEqual(test.expected.bindings);
      const messages = test.sent[1]!.body.messages as Array<{ content: string }>;
      const payload = JSON.parse(messages[1]!.content);
      expect(payload.coverageTarget).toEqual({ requiredRegionCount: 1 });
      expect(payload.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "VISUAL_REGION_COVERAGE_INCOMPLETE", count: 1, regionIds: ["heading"] })]));
      expect(payload.failedDraft).toEqual(serializeVisualSemanticGraph(partial));
      expect((test.sent[0]!.body.messages as Array<{ content: string }>)[0]).toEqual(messages[0]);
      expect(await test.run(() => test.service.createVisualSolutionImplementationPlan(test.context))).toEqual(result);
      expect(test.sent).toHaveLength(2);
      expect(await prisma.modelInvocation.count({ where: { runId: test.successorId, task: "repair" } })).toBe(1);
      expect(await prisma.buildJob.count({ where: { workspaceId } })).toBe(0);
    });
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    it("sends exact bound-node capability facts into one repair without widening its source or rebuilding on replay", async () => {
      const responseTexts: string[] = [];
      const test = await semantic({ repair: true, responseTexts });
      const graph = serializeVisualSemanticGraph(test.expected);
      const partial = structuredClone(graph);
      const binding = partial.bindings[0]!;
      const node = partial.nodes.find(node => node.id === binding.nodeId)! as Record<string, unknown> & { id: string };
      if (node.kind !== "control") throw new Error("control fixture required");
      const requiredCapabilityId = node.capabilityId;
      const requiredStyleRole = node.styleRole;
      const actualCapabilityId = requiredCapabilityId === "text" ? "richtext" : "text";
      node.capabilityId = actualCapabilityId; delete node.styleRole;
      responseTexts.push(JSON.stringify(partial), JSON.stringify({ schema: "kf-visual-semantic-graph-delta/v1", baseDraftHash: canonicalServerHash(partial),
        operations: [{ op: "set-node-field", nodeId: node.id, field: "capabilityId", value: requiredCapabilityId },
          { op: "set-node-field", nodeId: node.id, field: "styleRole", value: requiredStyleRole }] }));
      const result = await test.run(() => test.service.createVisualSolutionImplementationPlan(test.context));
      expect(result).toEqual(test.expected);
      expect(await test.run(() => test.service.createVisualSolutionImplementationPlan(test.context))).toEqual(result);
      expect(test.sent).toHaveLength(2);
      const payload = JSON.parse((test.sent[1]!.body.messages as Array<{ content: string }>)[1]!.content);
      expect(payload.failedDraft).toEqual(partial);
      expect(payload.issues).toEqual(expect.arrayContaining([expect.objectContaining({ nodeId: node.id, regionId: binding.regionId,
        bindingRequirement: { requiredCapabilityId, actualKind: "control", actualCapabilityId, directLayoutKinds: [], availableInnerLayoutKinds: [] } })]));
      expect(payload.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "SEMANTIC_NODE_FIELD_INVALID", nodeId: node.id, nodeField: "styleRole", missing: true, count: 1 })]));
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      expect(await prisma.modelInvocation.count({ where: { runId: test.successorId, task: "repair", promptVersion: "visual-semantic-repair@13" } })).toBe(1);
      // end
      // end
      expect(await prisma.buildJob.count({ where: { workspaceId } })).toBe(0);
    });
    // end
    it("repairs an empty-layout failed draft under one explicit delta and caches only the canonical compiled result", async () => {
      const responseTexts: string[] = [];
      const test = await semantic({ repair: true, responseTexts });
      const graph = serializeVisualSemanticGraph(test.expected);
      const partial = structuredClone(graph);
      const root = partial.nodes.find(node => node.id === partial.plan.pages[0]!.rootNodeId)!;
      if (root.kind !== "layout") throw new Error("layout fixture required");
      const childNodeIds = [...root.childNodeIds]; root.childNodeIds = [];
      responseTexts.push(JSON.stringify(partial), JSON.stringify({ schema: "kf-visual-semantic-graph-delta/v1", baseDraftHash: canonicalServerHash(partial),
        operations: [{ op: "set-node-field", nodeId: root.id, field: "childNodeIds", value: childNodeIds }] }));
      const result = await test.run(() => test.service.createVisualSolutionImplementationPlan(test.context));
      expect(result).toEqual(test.expected);
      expect(await test.run(() => test.service.createVisualSolutionImplementationPlan(test.context))).toEqual(result);
      expect(test.sent).toHaveLength(2);
      const payload = JSON.parse((test.sent[1]!.body.messages as Array<{ content: string }>)[1]!.content);
      expect(payload.repairProtocol.mode).toBe("delta");
      expect(payload.failedDraft).toEqual(partial);
      expect(payload.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "SEMANTIC_GRAPH_EMPTY_LAYOUTS", nodeIds: [root.id] })]));
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      expect(await prisma.modelInvocation.count({ where: { runId: test.successorId, task: "repair", promptVersion: "visual-semantic-repair@13" } })).toBe(1);
      // end
      // end
      // end
      expect(await prisma.buildJob.count({ where: { workspaceId } })).toBe(0);
    });
    it.each(["full-graph", "unrelated-style", "wrong-base"] as const)("rejects a delta repair %s violation without publication or another allowance", async violation => {
      const responseTexts: string[] = [];
      const test = await semantic({ repair: true, responseTexts });
      const graph = serializeVisualSemanticGraph(test.expected);
      const partial = structuredClone(graph); partial.bindings = [];
      responseTexts.push(JSON.stringify(partial));
      const firstRole = test.expected.plan.roleStyles[0]!.role;
      const delta = { schema: "kf-visual-semantic-graph-delta/v1", baseDraftHash: canonicalServerHash(partial), operations: violation === "unrelated-style"
        ? [{ op: "set-role-field", role: firstRole, field: "states", value: { disabled: {} } }]
        : [{ op: "replace-bindings", bindings: graph.bindings }] };
      if (violation === "wrong-base") delta.baseDraftHash = "0".repeat(64);
      responseTexts.push(JSON.stringify(violation === "full-graph" ? graph : delta));
      await expect(test.run(() => test.service.createVisualSolutionImplementationPlan(test.context))).rejects.toThrow("VISUAL_SEMANTIC_OUTPUT_INVALID");
      const messages = test.sent[1]!.body.messages as Array<{ content: string }>;
      expect(JSON.parse(messages[1]!.content).repairProtocol.mode).toBe("delta");
      expect(test.sent).toHaveLength(2);
      expect(await prisma.modelInvocation.count({ where: { runId: test.successorId, task: "repair" } })).toBe(1);
      expect(await prisma.agentRunStep.count({ where: { runId: test.successorId, stepKey: "visual-semantic-result-v1", status: "COMPLETED" } })).toBe(0);
      expect(await prisma.agentRunStep.count({ where: { runId: test.successorId, stepKey: "visual-semantic-repair-v1", status: "FAILED" } })).toBe(1);
      expect(await prisma.buildJob.count({ where: { workspaceId } })).toBe(0);
    });
    // end
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    it.each([false, true])("allows a stopped complete-looking syntax draft to repair only with frozen once=%s", async repair => {
      const invalid = '{"schema":bad}';
      const test = await semantic({ repair, responseTexts: [invalid] });
      const running = test.run(() => test.service.createVisualSolutionImplementationPlan(test.context));
      if (repair) {
        expect((await running).bindings).toEqual(test.expected.bindings);
        expect(test.sent).toHaveLength(2);
        expect(JSON.stringify(test.sent[1]!.body)).toContain("SEMANTIC_JSON_SYNTAX_INVALID");
        // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
        // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
        // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
        expect(await prisma.modelInvocation.count({ where: { runId: test.successorId, task: "repair", promptVersion: "visual-semantic-repair@13" } })).toBe(1);
        // end
        // end
        // end
      } else {
        await expect(running).rejects.toThrow("VISUAL_SEMANTIC_OUTPUT_INVALID");
        expect(test.sent).toHaveLength(1);
        expect(await prisma.modelInvocation.count({ where: { runId: test.successorId, task: "repair" } })).toBe(0);
      }
    });
    // end
    it("feeds actual native geometry failures into the bounded semantic repair before completing the result cache", async () => {
      const responses: unknown[] = [];
      const test = await semantic({ repair: true, responses });
      const draft = structuredClone(test.expected);
      draft.plan.pages[0]!.root.intent.width = { mode: "fixed", value: 1 };
      responses.push(draft);
      await test.run(() => test.service.createVisualSolutionImplementationPlan(test.context));
      expect(test.sent).toHaveLength(2);
      expect(JSON.stringify(test.sent[1]!.body)).toContain("NATIVE_LAYOUT_UNSATISFIABLE");
      const messages = test.sent[1]!.body.messages as { content: string }[];
      const payload = JSON.parse(messages[1]!.content) as { detailScope: string; blueprint: unknown; failedDraft: unknown;
        capabilityCandidateProjection: { bundleHash: string; regions: unknown[] }; detailedDesignKnowledge: { controlProfiles: { minimumSize: unknown }[] } };
      expect(payload.detailScope).toBe("draft-and-required-capabilities");
      expect(payload.blueprint).toEqual(test.context.confirmedSolutionBlueprint);
      expect(payload.failedDraft).toEqual(serializeVisualSemanticGraph(draft));
      expect(payload.capabilityCandidateProjection.bundleHash).toBe(canonicalServerHash(test.context.capabilityCandidates));
      expect(payload.capabilityCandidateProjection.regions).toHaveLength(test.context.capabilityCandidates.regions.length);
      expect(payload.detailedDesignKnowledge.controlProfiles.every(profile => profile.minimumSize !== undefined)).toBe(true);
    });
    it("rejects a schema-valid but unbuildable semantic plan under the default no-repair policy", async () => {
      const responses: unknown[] = [];
      const test = await semantic({ responses });
      const draft = structuredClone(test.expected);
      draft.plan.pages[0]!.root.intent.width = { mode: "fixed", value: 1 }; responses.push(draft);
      await expect(test.run(() => test.service.createVisualSolutionImplementationPlan(test.context))).rejects.toThrow("VISUAL_SEMANTIC_OUTPUT_INVALID");
      expect(test.sent).toHaveLength(1);
      expect(await prisma.modelInvocation.count({ where: { runId: test.successorId, task: "repair" } })).toBe(0);
      expect(await prisma.agentRunStep.count({ where: { runId: test.successorId, stepKey: "visual-semantic-result-v1", status: "COMPLETED" } })).toBe(0);
    });
    it("rejects concurrent semantic callers while the single repair is in flight without charging twice", async () => {
      let reached!: () => void; let release!: () => void;
      const barrier = new Promise<void>(resolve => { reached = resolve; }); const paused = new Promise<void>(resolve => { release = resolve; });
      const test = await semantic({ repair: true, responses: [{}], inFlight: async index => { if (index === 2) { reached(); await paused; } } });
      const first = test.run(() => test.service.createVisualSolutionImplementationPlan(test.context)); await barrier;
      try { await expect(test.run(() => test.service.createVisualSolutionImplementationPlan(test.context))).rejects.toThrow("VISUAL_SEMANTIC_IN_PROGRESS"); }
      finally { release(); }
      expect((await first).bindings).toEqual(test.expected.bindings);
      expect(test.sent).toHaveLength(2);
      expect(await prisma.modelInvocation.count({ where: { runId: test.successorId, task: "repair" } })).toBe(1);
    });
    it.each([false, true])("does not repair again after failure across recovery, even when the allowance row is deleted=%s", async removeAllowance => {
      const test = await semantic({ repair: true, response: {} });
      await expect(test.run(() => test.service.createVisualSolutionImplementationPlan(test.context))).rejects.toThrow("VISUAL_SEMANTIC_OUTPUT_INVALID");
      if (removeAllowance) await prisma.agentRunStep.deleteMany({ where: { runId: test.successorId, stepKey: "visual-semantic-repair-v1" } });
      await prisma.agentRun.update({ where: { id: test.successorId }, data: { leaseExpiresAt: new Date(0) } });
      const lease = await store.recoverExpired("semantic-repair-recovery", tenantId, new Date());
      expect(lease?.runId).toBe(test.successorId);
      await expect(withAgentRunExecution({ tenantId, runId: lease!.runId, ownerId: lease!.ownerId, fence: lease!.fence,
        signal: new AbortController().signal }, () => test.service.createVisualSolutionImplementationPlan(test.context)))
        .rejects.toThrow("VISUAL_SEMANTIC_REPAIR_ALREADY_USED");
      expect(test.sent).toHaveLength(3); // The existing initial-call recovery can resend, but repair cannot.
      expect(await prisma.modelInvocation.count({ where: { runId: test.successorId, task: "repair" } })).toBe(1);
      expect(await prisma.agentRunStep.count({ where: { runId: test.successorId, stepKey: "visual-semantic-result-v1", status: "COMPLETED" } })).toBe(0);
    });
    it("rejects corrupt committed semantic cache without charging for any repair", async () => {
      const test = await semantic({ repair: true });
      await test.run(() => test.service.createVisualSolutionImplementationPlan(test.context));
      await prisma.agentRunStep.updateMany({ where: { runId: test.successorId, stepKey: "visual-semantic-result-v1" }, data: { outputRef: "{}" } });
      await expect(test.run(() => test.service.createVisualSolutionImplementationPlan(test.context))).rejects.toThrow("VISUAL_SEMANTIC_CACHE_INVALID");
      expect(test.sent).toHaveLength(1);
      expect(await prisma.modelInvocation.count({ where: { runId: test.successorId, task: "repair" } })).toBe(0);
    });
    it.each(["cancel", "policy", "fence"] as const)("rechecks semantic %s before reserving any repair", async change => {
      let successorId = "";
      const test = await semantic({ repair: true, response: {}, inFlight: async index => {
        if (index !== 1) return;
        if (change === "cancel") await controls.cancel(tenantId, successorId, userId);
        else if (change === "policy") await prisma.tenant.update({ where: { id: tenantId }, data: { imageEgressAllowed: false } });
        else await prisma.agentRun.update({ where: { id: successorId }, data: { leaseExpiresAt: new Date(0) } });
      } }); successorId = test.successorId;
      await expect(test.run(() => test.service.createVisualSolutionImplementationPlan(test.context))).rejects.toThrow();
      expect(test.sent).toHaveLength(1);
      expect(await prisma.modelInvocation.count({ where: { runId: successorId, task: "repair" } })).toBe(0);
    });
    it.each(["cancel", "policy", "fence"] as const)("does not publish a semantic repair after %s changes during the second call", async change => {
      let successorId = "";
      const test = await semantic({ repair: true, responses: [{}], inFlight: async index => {
        if (index !== 2) return;
        if (change === "cancel") await controls.cancel(tenantId, successorId, userId);
        else if (change === "policy") await prisma.tenant.update({ where: { id: tenantId }, data: { imageEgressAllowed: false } });
        else {
          await prisma.agentRun.update({ where: { id: successorId }, data: { leaseExpiresAt: new Date(0) } });
          expect((await store.recoverExpired("semantic-repair-new-owner", tenantId, new Date()))?.runId).toBe(successorId);
        }
      } }); successorId = test.successorId;
      await expect(test.run(() => test.service.createVisualSolutionImplementationPlan(test.context))).rejects.toThrow();
      expect(test.sent).toHaveLength(2);
      expect(await prisma.modelInvocation.count({ where: { runId: successorId, task: "repair", status: "SUCCEEDED" } })).toBe(1);
      expect(await prisma.agentRunStep.count({ where: { runId: successorId, stepKey: "visual-semantic-result-v1", status: "COMPLETED" } })).toBe(0);
      expect(await prisma.agentRunStep.count({ where: { runId: successorId, stepKey: "visual-semantic-repair-v1", status: "COMPLETED" } })).toBe(0);
    });
    it.each(["truncated", "partial-json", "disabled", "large"] as const)("never repairs %s semantic proposals", async change => {
      const test = await semantic({ repair: true, response: change === "large" ? { text: "x".repeat(65536) } : {},
        ...(change === "partial-json" ? { responseText: "{" } : {}), ...(change === "truncated" ? { finishReason: "length" } : {}),
        ...(change === "disabled" ? { allowRepair: false } : {}) });
      await expect(test.run(() => test.service.createVisualSolutionImplementationPlan(test.context))).rejects.toThrow();
      expect(test.sent).toHaveLength(1);
      expect(await prisma.modelInvocation.count({ where: { runId: test.successorId, task: "repair" } })).toBe(0);
    });
    // end
    it.each(["reference", "blueprint", "candidates", "assets", "actor", "fence", "expired", "policy", "no-config"] as const)(
      "rejects semantic %s drift before any physical request", async changed => {
        const test = await semantic({ noConfig: changed === "no-config" }); const context = structuredClone(test.context);
        if (changed === "reference") context.visualReference.acceptedDifferences[0]!.reason = "changed";
        if (changed === "blueprint") context.confirmedSolutionBlueprint.displayName = "changed";
        if (changed === "candidates") context.capabilityCandidates = { ...context.capabilityCandidates, regions: [] };
        if (changed === "assets") (context.assetCatalog as unknown[]) = [{ id: "invented", kind: "image", name: "invented", mimeType: "image/png", description: "invented" }];
        if (changed === "actor") context.userId = randomUUID();
        if (changed === "expired") await prisma.visualReferenceAnalysis.update({ where: { id: test.input.input.acceptance.analysisId }, data: { expiresAt: new Date(0) } });
        if (changed === "policy") await prisma.tenant.update({ where: { id: tenantId }, data: { imageEgressAllowed: false } });
        await expect(test.run(() => test.service.createVisualSolutionImplementationPlan(context), changed === "fence" ? test.lease.fence + 1 : test.lease.fence)).rejects.toThrow();
        expect(test.sent).toHaveLength(0);
        expect(await prisma.modelInvocation.count({ where: { runId: test.successorId } })).toBe(0);
      });
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    it("does not publish or repair a cyclic layout returned by the semantic provider", async () => {
      const test: Awaited<ReturnType<typeof semantic>> = await semantic({ inFlight: async () => {
        const pending = [test.expected.plan.pages[0]!.root];
        while (pending.length > 0) {
          const node = pending.pop()!;
          if (node.kind !== "layout") continue;
          if (node.children.length >= 2) {
            const [first, second] = node.children;
            first!.intent.groupWith = [second!.id]; second!.intent.groupWith = [first!.id];
            return;
          }
          pending.push(...node.children);
        }
        throw new Error("semantic fixture has no siblings");
      } });
      await expect(test.run(() => test.service.createVisualSolutionImplementationPlan(test.context))).rejects.toThrow("VISUAL_SEMANTIC_OUTPUT_INVALID");
      expect(test.sent).toHaveLength(1);
      expect(await prisma.agentRunStep.count({ where: { runId: test.successorId, stepKey: "visual-semantic-result-v1", status: "COMPLETED" } })).toBe(0);
      expect(await prisma.buildJob.count({ where: { tenantId } })).toBe(0);
    });
    // end
    it.each(["invalid", "truncated", "cancel", "policy"] as const)("retains usage but refuses semantic %s output without hidden repair", async changed => {
      let id = "";
      const test = await semantic({ ...(changed === "invalid" ? { response: {} } : {}), ...(changed === "truncated" ? { finishReason: "length" } : {}),
        inFlight: async () => { if (changed === "cancel") await controls.cancel(tenantId, id, userId);
          if (changed === "policy") await prisma.tenant.update({ where: { id: tenantId }, data: { imageEgressAllowed: false } }); } }); id = test.successorId;
      await expect(test.run(() => test.service.createVisualSolutionImplementationPlan(test.context))).rejects.toThrow();
      expect(test.sent).toHaveLength(1);
      expect(await prisma.modelInvocation.count({ where: { runId: id, task: "implementation", status: "SUCCEEDED" } })).toBe(1);
      expect(await prisma.agentRunStep.count({ where: { runId: id, stepKey: "visual-semantic-result-v1", status: "COMPLETED" } })).toBe(0);
    });
    it("recovers completed semantic output under a new real lease without another request", async () => {
      const test = await semantic(); const result = await test.run(() => test.service.createVisualSolutionImplementationPlan(test.context));
      await prisma.agentRun.update({ where: { id: test.successorId }, data: { leaseExpiresAt: new Date(0) } });
      const lease = await store.recoverExpired("semantic-recovery", tenantId, new Date()); expect(lease?.runId).toBe(test.successorId);
      expect(await withAgentRunExecution({ tenantId, runId: lease!.runId, ownerId: lease!.ownerId, fence: lease!.fence,
        signal: new AbortController().signal }, () => test.service.createVisualSolutionImplementationPlan(test.context))).toEqual(result);
      expect(test.sent).toHaveLength(1);
    });
    it("rejects missing execution and revoked policy even when completed semantic output is cached", async () => {
      const test = await semantic();
      await expect(test.service.createVisualSolutionImplementationPlan(test.context)).rejects.toThrow("VISUAL_RUN_REQUIRED");
      expect(test.sent).toHaveLength(0);
      await test.run(() => test.service.createVisualSolutionImplementationPlan(test.context));
      await prisma.tenant.update({ where: { id: tenantId }, data: { imageEgressAllowed: false } });
      await expect(test.run(() => test.service.createVisualSolutionImplementationPlan(test.context))).rejects.toThrow("IMAGE_EGRESS_NOT_ALLOWED");
      expect(test.sent).toHaveLength(1);
    });
    it("does not resend or downgrade corrupt completed semantic output", async () => {
      const test = await semantic(); await test.run(() => test.service.createVisualSolutionImplementationPlan(test.context));
      await prisma.agentRunStep.updateMany({ where: { runId: test.successorId, stepKey: "visual-semantic-result-v1" }, data: { outputRef: "{}" } });
      await expect(test.run(() => test.service.createVisualSolutionImplementationPlan(test.context))).rejects.toThrow("VISUAL_SEMANTIC_CACHE_INVALID");
      expect(test.sent).toHaveLength(1);
    });
    it("does not silently rebind a corrupted cached semantic blueprint hash", async () => {
      const test = await semantic(); const result = await test.run(() => test.service.createVisualSolutionImplementationPlan(test.context));
      const changed = structuredClone(result); changed.plan.blueprintHash = "0".repeat(64);
      await prisma.agentRunStep.updateMany({ where: { runId: test.successorId, stepKey: "visual-semantic-result-v1" }, data: { outputRef: JSON.stringify(changed) } });
      await expect(test.run(() => test.service.createVisualSolutionImplementationPlan(test.context))).rejects.toThrow("VISUAL_SEMANTIC_CACHE_INVALID");
      expect(test.sent).toHaveLength(1);
    });
    it("rejects a duplicate semantic request under the same actual lease while the first is in flight", async () => {
      let reached!: () => void; let release!: () => void;
      const barrier = new Promise<void>(resolve => { reached = resolve; }); const paused = new Promise<void>(resolve => { release = resolve; });
      const test = await semantic({ inFlight: async () => { reached(); await paused; } });
      const first = test.run(() => test.service.createVisualSolutionImplementationPlan(test.context)); await barrier;
      try { await expect(test.run(() => test.service.createVisualSolutionImplementationPlan(test.context))).rejects.toThrow("VISUAL_SEMANTIC_IN_PROGRESS"); }
      finally { release(); }
      expect((await first).bindings).toEqual(test.expected.bindings); expect(test.sent).toHaveLength(1);
    });
    it("keeps a late old semantic response from overwriting the recovered lease result", async () => {
      let reached!: () => void; let release!: () => void; let calls = 0;
      const barrier = new Promise<void>(resolve => { reached = resolve; }); const paused = new Promise<void>(resolve => { release = resolve; });
      const test = await semantic({ inFlight: async () => { if (++calls === 1) { reached(); await paused; } } });
      const late = test.run(() => test.service.createVisualSolutionImplementationPlan(test.context)).catch((error: unknown) => error); await barrier;
      try {
        await prisma.agentRun.update({ where: { id: test.successorId }, data: { leaseExpiresAt: new Date(0) } });
        const lease = await store.recoverExpired("semantic-new-owner", tenantId, new Date()); expect(lease?.runId).toBe(test.successorId);
        await withAgentRunExecution({ tenantId, runId: lease!.runId, ownerId: lease!.ownerId, fence: lease!.fence,
          signal: new AbortController().signal }, () => test.service.createVisualSolutionImplementationPlan(test.context));
      } finally { release(); }
      expect(await late).toMatchObject({ message: "VISUAL_RUN_NOT_ACTIVE" }); expect(test.sent).toHaveLength(2);
      expect(await prisma.agentRunStep.findFirstOrThrow({ where: { runId: test.successorId, stepKey: "visual-semantic-result-v1" } })).toMatchObject({ status: "COMPLETED", attempt: 2 });
      expect(await prisma.modelInvocation.count({ where: { runId: test.successorId, task: "implementation", status: "SUCCEEDED" } })).toBe(2);
    });
    it("drives the existing semantic graph node with the dedicated gateway and preserves the visual confirmation stamp", async () => {
      const test = await semantic();
      const { createSolutionImplementationPlanNode } = await import("../../../../packages/agent-orchestrator/src/nodes/solution-implementation-plan.js");
      const node = createSolutionImplementationPlanNode({ modelPort: { createVisualSolutionImplementationPlan: test.service.createVisualSolutionImplementationPlan.bind(test.service),
        createSolutionImplementationPlan: async () => { throw new Error("must not use text semantic route"); } }, assetCatalog: { list: async () => [] } } as never);
      const result = await test.run(() => node({ ...test.context, runId: test.successorId, planVersion: "run-plan@7",
        designPlan: blueprint, designRevision: test.snapshot.content.blueprintReview.content.revision,
        designPlanHash: test.snapshot.content.blueprintReview.content.designPlanHash, capabilityCandidatesHash: canonicalServerHash(test.context.capabilityCandidates),
        acceptedVisualPlanningInput: test.snapshot.content.accepted } as never));
      expect(result).toMatchObject({ stage: "solution-plan-ready", visualPlanConfirmationHash: test.snapshot.content.accepted.confirmationHash,
        visualSemanticPlan: { bindings: test.expected.bindings } });
      expect(result.buildAuthorization).toBeUndefined(); expect(test.sent).toHaveLength(1);
    });
    // end
    async function engineering(input: BlueprintWaiting, successorId: string = randomUUID(), rollback = false) {
      return prisma.$transaction(async tx => {
        await tx.agentRun.create({ data: { id: successorId, tenantId, workspaceId, conversationId, requestedByUserId: userId,
          clientRequestId: randomUUID(), requestHash: "engineering-confirmation-fixture", mode: "build", predecessorRunId: input.source.id,
          baseRevisionId, action: { type: "confirm_blueprint", expectedRunId: input.source.id, receipt: input.receipt }, configSnapshot: input.source.configSnapshot! } });
        const snapshot = await reviews.freezeEngineeringInTransaction(tx, scope(), successorId, input.source.id);
        if (rollback) throw new Error("engineering outer rollback");
        return { snapshot, successorId };
      });
    }
    // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
    const engineeringBody = (input: BlueprintWaiting, clientRequestId = randomUUID()) => ({ clientRequestId,
      clientMessageId: `engineering:${clientRequestId}`, mode: "build", attachmentIds: [],
      action: { type: "confirm_blueprint", expectedRunId: input.source.id, receipt: input.receipt } });
    function publicEngineeringStore(dependency: Pick<VisualReviewService, "readContinuationInTransaction" | "freezeEngineeringInTransaction"> | undefined = reviews) {
      store = new PrismaRunStore(prisma, 30000, config, new VisualRunAdmissionService(route), reviews, dependency);
      const queries = new PrismaRunQueries(prisma);
      runs = new RunService(store, queries); controls = new RunControlService(prisma, store, queries);
    }
    async function withPublicHttp<T>(work: (context: { app: import("@nestjs/common").INestApplication; cookie: string }) => Promise<T>) {
      vi.stubEnv("AGENT_ALLOWED_ORIGINS", "http://localhost:5174");
      vi.stubEnv("KF_SERVER_PLAN_HMAC_KEY_BASE64", Buffer.alloc(32, 0x62).toString("base64"));
      const { MODEL_PORT, DEFAULT_MODEL_PORT } = await import("../conversations/model-port.js");
      const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(RUN_STORE).useValue(store)
        .overrideProvider(ARTIFACT_STORAGE).useValue(new LocalArtifactStorage(root)).overrideProvider(MODEL_PORT).useValue(DEFAULT_MODEL_PORT).compile();
      const app = module.createNestApplication(); app.use(cookieParser()); await app.init();
      try {
        const cookie = `${SESSION_COOKIE_NAME}=${(await app.get(SessionService).createSession(userId)).token}`;
        return await work({ app, cookie });
      } finally { await app.close(); }
    }
    it("atomically admits public visual blueprint confirmation with a fixed signed engineering input and idempotent replay", async () => {
      const input = await blueprintWaiting();
      reviews = new VisualReviewService(prisma, Buffer.alloc(32, 0x48), { blueprint: blueprintRoute, implementation: semanticRoute });
      publicEngineeringStore();
      const value = engineeringBody(input); const run = await start(value);
      expect(run).toMatchObject({ status: "QUEUED", lastSeq: 1, baseRevisionId, buildJobId: null });
      expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({
        predecessorRunId: input.source.id, configSnapshot: input.source.configSnapshot,
        inputSnapshot: { attachmentIds: [assetId], baseRevisionPolicy: "fixed", visualEngineering: { content: {
          runId: run.id, sourceRunId: input.source.id, accepted: input.snapshot.content.accepted, semanticModel: { route: semanticRoute },
        } } } });
      expect(await prisma.message.findMany({ where: { runId: run.id } })).toMatchObject([{ role: "user", content: input.receipt }]);
      expect(await prisma.runBudget.count({ where: { runId: run.id } })).toBe(1);
      expect(await prisma.agentRunStep.count({ where: { runId: run.id, stepKey: "visual-engineering-continuation-v1" } })).toBe(1);
      expect(await prisma.agentRunEvent.count({ where: { runId: input.source.id, type: "run.cancelled" } })).toBe(1);
      for (const action of ["RUN_ACTION_ACCEPTED", "VISUAL_BLUEPRINT_CONFIRMED"]) expect(await prisma.auditLog.count({ where: { resourceId: run.id, action } })).toBe(1);
      enabled = false; await prisma.tenant.update({ where: { id: tenantId }, data: { imageEgressAllowed: false } });
      store = new PrismaRunStore(prisma, 30000, config);
      runs = new RunService(store, new PrismaRunQueries(prisma));
      expect(await start(value)).toEqual(run);
      await expect(start({ ...value, action: { ...value.action, receipt: encodeBlueprintConfirmation(2, "0".repeat(64)) } })).rejects.toMatchObject({ status: 409, message: "IDEMPOTENCY_CONFLICT" });
      expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(3);
      expect(await prisma.agentRunEvent.count({ where: { runId: input.source.id, type: "run.cancelled" } })).toBe(1);
    });
    it.each(["missing-model", "after-freeze"] as const)("rolls back the entire public engineering admission for %s failure", async failure => {
      const input = await blueprintWaiting();
      reviews = new VisualReviewService(prisma, Buffer.alloc(32, 0x48), { blueprint: blueprintRoute,
        ...(failure === "missing-model" ? {} : { implementation: semanticRoute }) });
      publicEngineeringStore({ readContinuationInTransaction: reviews.readContinuationInTransaction.bind(reviews),
        freezeEngineeringInTransaction: async (...args) => {
          const proof = await reviews.freezeEngineeringInTransaction(...args);
          if (failure === "after-freeze") throw new Error("SIMULATED_ENGINEERING_ROLLBACK");
          return proof;
        } });
      const budgetCount = await prisma.runBudget.count();
      const auditCount = await prisma.auditLog.count({ where: { tenantId, action: "VISUAL_BLUEPRINT_CONFIRMED" } });
      await expect(start(engineeringBody(input))).rejects.toThrow(failure === "missing-model" ? "VISUAL_FLOW_NOT_CONFIGURED" : "SIMULATED_ENGINEERING_ROLLBACK");
      expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(2);
      expect(await prisma.message.count({ where: { conversationId, role: "user" } })).toBe(1);
      expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: input.source.id } })).toMatchObject({ status: "WAITING_INPUT", supersededByRunId: null });
      expect(await prisma.agentRunEvent.count({ where: { runId: input.source.id, type: "run.cancelled" } })).toBe(0);
      expect(await prisma.runBudget.count()).toBe(budgetCount);
      expect(await prisma.auditLog.count({ where: { tenantId, action: "VISUAL_BLUEPRINT_CONFIRMED" } })).toBe(auditCount);
    });
    it.each(["disabled", "policy", "expired", "actor", "receipt", "cancel", "review", "message", "config", "runtime", "model", "base", "expected-base"] as const)(
      "rejects public engineering %s without consuming the blueprint or retaining a candidate", async changed => {
        const input = await blueprintWaiting();
        reviews = new VisualReviewService(prisma, Buffer.alloc(32, 0x48), { blueprint: blueprintRoute,
          implementation: changed === "model" ? { ...semanticRoute, maxContextTokens: 16000 } : semanticRoute });
        publicEngineeringStore();
        const value: ReturnType<typeof engineeringBody> & { expectedBaseRevisionId?: string } = engineeringBody(input); let actorId = userId; let expectedStatus = 409;
        if (["disabled", "policy", "actor", "runtime", "model"].includes(changed)) expectedStatus = 403;
        if (changed === "disabled") enabled = false;
        if (changed === "policy") await prisma.tenant.update({ where: { id: tenantId }, data: { imageEgressAllowed: false } });
        if (changed === "expired") await prisma.visualReferenceAnalysis.update({ where: { id: input.input.acceptance.analysisId }, data: { expiresAt: new Date(0) } });
        if (changed === "actor") actorId = (await prisma.user.create({ data: { tenantId, username: randomUUID(), passwordHash: "fixture", role: "member" } })).id;
        if (changed === "receipt") value.action.receipt = encodeBlueprintConfirmation(2, "0".repeat(64));
        if (changed === "cancel") await controls.cancel(tenantId, input.source.id, userId);
        if (changed === "review") await prisma.agentRunStep.deleteMany({ where: { runId: input.source.id, stepKey: "visual-blueprint-review-v1" } });
        if (changed === "message") await prisma.message.updateMany({ where: { runId: input.source.id, role: "assistant" }, data: { content: "不再是已展示的蓝图" } });
        if (changed === "config") await prisma.agentRun.update({ where: { id: input.source.id }, data: { configSnapshot: { ...(input.source.configSnapshot as Record<string, unknown>), planVersion: "run-plan@6" } } });
        if (changed === "runtime") { store = new PrismaRunStore(prisma, 30000, config, new VisualRunAdmissionService(route), reviews); runs = new RunService(store, new PrismaRunQueries(prisma)); }
        if (changed === "base") {
          const revision = await prisma.solutionRevision.create({ data: { tenantId, workspaceId, kind: "built", parentRevisionId: baseRevisionId } });
          await prisma.solutionWorkspace.update({ where: { id: workspaceId }, data: { currentRevisionId: revision.id } });
        }
        if (changed === "expected-base") value.expectedBaseRevisionId = randomUUID();
        const budgets = await prisma.runBudget.count();
        await expect(runs.start({ tenantId, userId: actorId }, conversationId, value)).rejects.toMatchObject({ status: expectedStatus });
        expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(2);
        expect(await prisma.message.count({ where: { conversationId, role: "user" } })).toBe(1);
        expect(await prisma.runBudget.count()).toBe(budgets);
        expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: input.source.id } })).toMatchObject({
          status: changed === "cancel" ? "CANCELLED" : "WAITING_INPUT", supersededByRunId: null });
      });
    it.each(["same-request", "different-request", "cancel"] as const)("serializes public engineering %s races without a second successor or deadlock", async scenario => {
      const input = await blueprintWaiting();
      reviews = new VisualReviewService(prisma, Buffer.alloc(32, 0x48), { blueprint: blueprintRoute, implementation: semanticRoute });
      publicEngineeringStore(); const value = engineeringBody(input);
      if (scenario === "same-request") {
        const result = await Promise.all([start(value), start(value)]);
        expect(result[0]).toEqual(result[1]);
      } else {
        const results = await Promise.allSettled([start(value), scenario === "cancel"
          ? controls.cancel(tenantId, input.source.id, userId) : start(engineeringBody(input))]);
        if (scenario === "different-request") expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
        else expect(results[1].status).toBe("fulfilled");
      }
      const source = await prisma.agentRun.findUniqueOrThrow({ where: { id: input.source.id } });
      expect(source.status).toBe("CANCELLED");
      expect(await prisma.agentRunEvent.count({ where: { runId: source.id, type: "run.cancelled" } })).toBe(1);
      expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(source.supersededByRunId ? 3 : 2);
      expect(await prisma.agentRunStep.count({ where: { runId: source.supersededByRunId ?? "not-created", stepKey: "visual-engineering-continuation-v1" } })).toBe(source.supersededByRunId ? 1 : 0);
    });
    it("does not reveal or consume a public engineering source through another conversation or tenant", async () => {
      const input = await blueprintWaiting();
      reviews = new VisualReviewService(prisma, Buffer.alloc(32, 0x48), { blueprint: blueprintRoute, implementation: semanticRoute }); publicEngineeringStore();
      const other = await prisma.conversation.create({ data: { tenantId, workspaceId, title: "other" } });
      await expect(runs.start({ tenantId, userId }, other.id, engineeringBody(input))).rejects.toMatchObject({ status: 409, message: "RUN_ACTION_STALE" });
      await expect(runs.start({ tenantId, userId }, other.id, { ...engineeringBody(input), action: { ...engineeringBody(input).action, expectedRunId: randomUUID() } }))
        .rejects.toMatchObject({ status: 409, message: "RUN_ACTION_STALE" });
      const foreign = await prisma.tenant.create({ data: { name: randomUUID() } });
      await expect(runs.start({ tenantId: foreign.id, userId }, conversationId, engineeringBody(input))).rejects.toMatchObject({ status: 404 });
      expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: input.source.id } })).toMatchObject({ status: "WAITING_INPUT", supersededByRunId: null });
      expect(await prisma.message.count({ where: { conversationId: other.id } })).toBe(0);
    });
    it("rejects malformed public HTTP engineering actions before consuming any review", async () => {
      const input = await blueprintWaiting();
      reviews = new VisualReviewService(prisma, Buffer.alloc(32, 0x48), { blueprint: blueprintRoute, implementation: semanticRoute }); publicEngineeringStore();
      await withPublicHttp(async ({ app, cookie }) => {
        const value = engineeringBody(input); const url = `/api/conversations/${conversationId}/runs`;
        const invalid = [{ ...value, mode: "plan" }, { ...value, action: { ...value.action, receipt: "" } },
          { ...value, action: { ...value.action, semanticModel: semanticRoute } }, { ...value, attachmentIds: [assetId] }];
        for (const body of invalid) await request(app.getHttpServer()).post(url).set("Cookie", cookie).set("Origin", "http://localhost:5174").send(body).expect(400);
        expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(2);
        expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: input.source.id } })).toMatchObject({ status: "WAITING_INPUT", supersededByRunId: null });
      });
    });
    // end
    // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
    async function engineeringRuntime<T>(test: Pick<Awaited<ReturnType<typeof semantic>>, "service" | "successorId">, work: (value: {
      execution: RunExecutionService; buildOwnJob: () => Promise<import("@kf/build-jobs").BuildJob>;
      conversations: import("../conversations/conversation.service.js").ConversationService;
    }) => Promise<T>) {
      const { AgentWorkerModule } = await import("./run-worker.module.js");
      const { ConversationService } = await import("../conversations/conversation.service.js");
      const { MODEL_PORT, DEFAULT_MODEL_PORT } = await import("../conversations/model-port.js");
      const { SERVER_PLAN_AUTHORITY } = await import("../conversations/server-plan-authority.js");
      const { DomainRegistry } = await import("@kf/domain-registry");
      const { createKingClientDomainPack } = await import("@kf/domain-client");
      const { BuildExecutor } = await import("@kf/build-jobs");
      vi.stubEnv("KF_SERVER_PLAN_HMAC_KEY_BASE64", Buffer.alloc(32, 0x62).toString("base64"));
      const storage = new LocalArtifactStorage(root);
      const app = await Test.createTestingModule({ imports: [AgentWorkerModule] })
        .overrideProvider(ARTIFACT_STORAGE).useValue(storage).overrideProvider(MODEL_PORT).useValue({
          ...DEFAULT_MODEL_PORT, createVisualSolutionImplementationPlan: test.service.createVisualSolutionImplementationPlan.bind(test.service),
          classifyIntent: async () => { throw new Error("engineering must bypass text classification"); },
          createDesignPlan: async () => { throw new Error("engineering must not regenerate blueprint"); },
          createSolutionImplementationPlan: async () => { throw new Error("engineering must not use legacy semantics"); },
        }).compile();
      await app.init();
      try {
        const conversations = app.get(ConversationService);
        const authority = app.get<import("@kf/build-jobs").ServerPlanAuthority>(SERVER_PLAN_AUTHORITY);
        const handlers = createRunHandlerRegistry({ prisma, loadGraph: async () => await conversations.getGraph() as unknown as import("./run-graph-runner.js").GraphLike,
          acquireTurn: id => conversations.acquireRunTurn(id), registerMemo: (id, memo) => conversations.registerRunMemo(id, memo),
          visualEngineering: { reviews, verifier: authority }, buildPollMs: 10 });
        const registry = new DomainRegistry(); registry.register(createKingClientDomainPack({ nativeAccepted: false }));
        const buildErrors: unknown[] = [];
        const builder = new BuildExecutor({ prisma, storage, registry, serverPlanVerifier: authority,
          operatorLogger: { error: (_message, error) => { buildErrors.push(error); } } });
        return await work({ conversations, execution: new RunExecutionService({ prisma, store, steps: new PrismaRunStepStore(prisma), handlers,
          visualEngineering: { reviews, verifier: authority } }), buildOwnJob: async () => {
          // Isolate this test from unrelated queued fixtures; exercise the real build executor, not global queue selection.
          const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: test.successorId } });
          const job = await prisma.buildJob.findFirstOrThrow({ where: { id: run.buildJobId!, tenantId, workspaceId, agentRunId: run.id, status: "QUEUED" } });
          const leased = await prisma.buildJob.update({ where: { id: job.id }, data: { status: "RUNNING", leaseOwner: "visual-test-build",
            leaseExpiresAt: new Date(Date.now() + 30000), attemptCount: { increment: 1 } } });
          const result = await builder.execute(leased);
          if (result.status === "FAILED" && buildErrors.length) throw buildErrors[0];
          return result;
        } });
      } finally { await app.close(); }
    }
    async function nativeEngineering(publicConfirmation = false) {
      const test = await semantic({ public: publicConfirmation });
      // Match the accepted richtext capability, not the golden's plain text control.
      const visit = (node: unknown): void => {
        if (!node || typeof node !== "object") return;
        const value = node as Record<string, unknown>;
        if (value.id === "admin-brand-title") value.capabilityId = "richtext";
        for (const child of Object.values(value)) if (Array.isArray(child)) child.forEach(visit); else if (child && typeof child === "object") visit(child);
      };
      visit(test.expected.plan);
      return test;
    }
    // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
    // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    it("creates fresh signed reviews and engineering authority from saved public energy proposals without provider egress", async () => {
      const { createSavedEnergyPlanningFixture } = await import("../../../../tests/helpers/energy-saved-planning.js");
      const { resolveModelRoutes } = await import("../models/model-config.js");
      const { createVisualPlanningRuntime } = await import("../vision/visual-blueprint-runtime.js");
      const { bindVisualAnalysisGateway } = await import("../vision/visual-analysis-protocol.js");
      const fixture = createSavedEnergyPlanningFixture();
      const environment = { MODEL_PORT_MODE: "deepseek", DEEPSEEK_API_KEY: "fixture-only-key", DEEPSEEK_MODEL: "deepseek-flash",
        DEEPSEEK_VISION_MODEL: "deepseek-flash", DEEPSEEK_MAX_CONTEXT_TOKENS: "1048576", KF_VISUAL_SEMANTIC_REPAIR: "once",
        KF_SERVER_PLAN_HMAC_KEY_BASE64: Buffer.alloc(32, 0x48).toString("base64") };
      const fixtureRuntime = createVisualPlanningRuntime(prisma, environment, fixture.fetch);
      if (!fixtureRuntime.reviews || !fixtureRuntime.blueprints) throw new Error("fixture runtime required");
      reviews = fixtureRuntime.reviews;
      const visionRoute = resolveModelRoutes(environment).vision;
      const references = new ReferenceAssetService(prisma, new LocalArtifactStorage(root));
      assetId = (await references.upload({ tenantId, workspaceId, stream: Readable.from([await readFile(new URL("../../../../tests/fixtures/energy-overview-20261023/reference.png", import.meta.url))]) })).id;
      analysis = new VisualAnalysisService(prisma, references,
        bindVisualAnalysisGateway(new ModelGatewayService(new ModelInvocationService(prisma), fixture.fetch, "fixture-only-key"), visionRoute), visionRoute);
      store = new PrismaRunStore(prisma, 30000, config, new VisualRunAdmissionService(visionRoute), reviews, reviews);
      runs = new RunService(store, new PrismaRunQueries(prisma));
      const initial = await execute();
      const review = await reviews.getWaitingReview(scope(), initial.run.id);
      expect(review.content.reference.spec.regions).toHaveLength(43);
      const acceptance = { expectedRunId: initial.run.id, analysisId: review.content.reference.analysisId,
        analysisHash: review.content.reference.specHash, receipt: review.receipt, acceptedDifferences: review.content.reference.mappings.map(mapping => {
          if (mapping.support !== "supported_unverified" || !mapping.capabilityId) throw new Error("saved proposal still requires explicit review");
          return { regionId: mapping.regionId, disposition: "accept-unverified", capabilityId: mapping.capabilityId,
            reason: "测试操作员重新接受静态演示近似，无业务源或导航，不代表真实模型识图或KF运行。" };
        }) };
      const planningRun = await start({ clientRequestId: randomUUID(), clientMessageId: randomUUID(), mode: "build", attachmentIds: [],
        action: { type: "accept_visual_reference", ...acceptance } });
      await runtime({ service: fixtureRuntime.blueprints }, async ({ execution }) => {
        expect(await execution.executeLease(await claim(planningRun.id), new AbortController().signal)).toMatchObject({ status: "WAITING_INPUT", failureCode: null });
      });
      const event = await prisma.agentRunEvent.findFirstOrThrow({ where: { runId: planningRun.id, type: "input.required" }, orderBy: { seq: "desc" } });
      const successor = await start({ clientRequestId: randomUUID(), clientMessageId: randomUUID(), mode: "build", attachmentIds: [],
        action: { type: "confirm_blueprint", expectedRunId: planningRun.id, receipt: (event.payload as { receipt: string }).receipt } });
      const inherited = await prisma.$transaction(tx => reviews.readEngineeringInTransaction(tx, scope(), successor.id));
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      expect(inherited.snapshot.content.semanticModel).toMatchObject({ promptVersion: "visual-semantic@24", repairPolicy: "once" });
      // end
      // end
      // end
      expect(inherited.snapshot.content.accepted.reference.analysisId).toBe(review.content.reference.analysisId);
      expect(fixture.fixtureRequests()).toBe(2);
      expect(await prisma.modelInvocation.count({ where: { tenantId, workspaceId, task: { in: ["implementation", "repair"] } } })).toBe(0);
      expect(await prisma.buildJob.count({ where: { tenantId, workspaceId } })).toBe(0);
    });
    // Paid acceptance is absent from normal regression discovery. No automatic provider retries or KF deployment.
    if (["energy-overview-20261023", "energy-semantic-saved-20261026"].includes(process.env.KF_LIVE_VISUAL_ACCEPTANCE ?? "")) {
      it("accepts the generated energy UI through real DeepSeek and the native engineering pipeline", async () => {
        const { createHash } = await import("node:crypto");
        const { writeFile } = await import("node:fs/promises");
        const { setTimeout: delay } = await import("node:timers/promises");
        const { resolveModelRoutes } = await import("../models/model-config.js");
        const { createVisualPlanningRuntime } = await import("../vision/visual-blueprint-runtime.js");
        const { bindVisualAnalysisGateway } = await import("../vision/visual-analysis-protocol.js");
        const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
        if (!apiKey) throw new Error("LIVE_VISUAL_KEY_REQUIRED");
        const pixels = await readFile(new URL("../../../../tests/fixtures/energy-overview-20261023/reference.png", import.meta.url));
        expect(createHash("sha256").update(pixels).digest("hex"))
          .toBe("3a79f4361e1e48b80ce64b1ec4053be63b4827df1c3f42deb5c7887bd3f2488c");
        const evidence = await mkdtemp(path.join(tmpdir(), "kf-energy-live-"));
        const savedFactsMode = process.env.KF_LIVE_VISUAL_ACCEPTANCE === "energy-semantic-saved-20261026";
        const { createSavedEnergyPlanningFixture } = await import("../../../../tests/helpers/energy-saved-planning.js");
        const savedPlanning = savedFactsMode ? createSavedEnergyPlanningFixture() : null;
        const liveEnvironment = { MODEL_PORT_MODE: "deepseek", DEEPSEEK_API_KEY: apiKey,
          DEEPSEEK_BASE_URL: "https://api.deepseek.com", DEEPSEEK_MODEL: "deepseek-flash",
          DEEPSEEK_VISION_MODEL: "deepseek-flash", DEEPSEEK_THINKING: "1", DEEPSEEK_TIMEOUT_MS: "120000",
          DEEPSEEK_MAX_CONTEXT_TOKENS: "1048576",
          // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
          KF_VISUAL_BLUEPRINT_REPAIR: process.env.KF_LIVE_BLUEPRINT_REPAIR === "once" ? "once" : "none",
          KF_VISUAL_SEMANTIC_REPAIR: process.env.KF_LIVE_SEMANTIC_REPAIR === "once" ? "once" : "none",
          KF_SERVER_PLAN_HMAC_KEY_BASE64: Buffer.alloc(32, 0x48).toString("base64") };
        const maximumPhysicalRequests = (savedFactsMode ? 1 : 3 + Number(liveEnvironment.KF_VISUAL_BLUEPRINT_REPAIR === "once"))
          + Number(liveEnvironment.KF_VISUAL_SEMANTIC_REPAIR === "once");
        // end
        let physicalRequests = 0;
        const liveFetch: typeof fetch = async (url, init) => {
          const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
          if (target.href !== "https://api.deepseek.com/chat/completions" || init?.method !== "POST") {
            throw new Error("LIVE_VISUAL_ENDPOINT_REJECTED");
          }
          // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
          if (physicalRequests >= maximumPhysicalRequests) throw new Error("LIVE_VISUAL_CALL_LIMIT_EXCEEDED");
          physicalRequests++;
          // end
          const response = await fetch(url, init);
          if (response.ok && response.body) {
            // Retain only bounded successful model content for schema diagnosis, never auth headers or error bodies.
            const reader = response.clone().body!.getReader();
            const chunks: Uint8Array[] = [];
            let size = 0;
            try {
              while (true) {
                const next = await reader.read();
                if (next.done) break;
                size += next.value.byteLength;
                if (size > 2 * 1024 * 1024) break;
                chunks.push(next.value);
              }
              if (size <= 2 * 1024 * 1024) {
                const envelope = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
                  model?: string; choices?: { finish_reason?: string; message?: { content?: string } }[];
                };
                await writeFile(path.join(evidence, `model-reply-${physicalRequests}.json`), JSON.stringify({
                  model: envelope.model, finishReason: envelope.choices?.[0]?.finish_reason,
                  content: envelope.choices?.[0]?.message?.content }, null, 2));
              }
            } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
          }
          return response;
        };
        const liveRuntime = createVisualPlanningRuntime(prisma, liveEnvironment, liveFetch);
        if (!liveRuntime.reviews || !liveRuntime.blueprints || !liveRuntime.semantics) throw new Error("LIVE_VISUAL_RUNTIME_REQUIRED");
        const planningRuntime = savedPlanning ? createVisualPlanningRuntime(prisma, liveEnvironment, savedPlanning.fetch) : liveRuntime;
        if (!planningRuntime.reviews || !planningRuntime.blueprints) throw new Error("LIVE_VISUAL_RUNTIME_REQUIRED");
        const blueprintService = planningRuntime.blueprints;
        const semanticService = liveRuntime.semantics;
        reviews = planningRuntime.reviews;
        const liveRoute = resolveModelRoutes(liveEnvironment).vision;
        const references = new ReferenceAssetService(prisma, new LocalArtifactStorage(root));
        assetId = (await references.upload({ tenantId, workspaceId, stream: Readable.from([pixels]),
          name: "energy-overview-20261023.png", declaredMimeType: "image/png" })).id;
        analysis = new VisualAnalysisService(prisma, references,
          bindVisualAnalysisGateway(new ModelGatewayService(new ModelInvocationService(prisma), savedPlanning?.fetch ?? liveFetch, apiKey), liveRoute), liveRoute);
        // Longer test-local leases accommodate actual provider latency; production defaults are untouched.
        store = new PrismaRunStore(prisma, 180000, config, new VisualRunAdmissionService(liveRoute), reviews, reviews);
        runs = new RunService(store, new PrismaRunQueries(prisma));
        const instruction = "根据参考图生成能源管理系统的原生客户端静态总览页。所有数值均为演示数据，不接业务源。"
          + "侧栏为静态展示，不实现导航；查看运行说明按钮先保留静态外观，不添加未经确认的动作。"
          + "保留独立文字区域和父子层级，父容器不重复子节点文字；不使用整张截图作为背景。";
        const startAction = (action: Record<string, unknown>, attachmentIds: string[] = []) => {
          const clientRequestId = randomUUID();
          return runs.start({ tenantId, userId }, conversationId, { clientRequestId,
            clientMessageId: `energy-acceptance:${clientRequestId}`, mode: "build", action, attachmentIds,
            ...(attachmentIds.length ? { visualReference: { primaryAssetId: assetId,
              sendingConsent: { noticeVersion: "visual-egress@1", accepted: true } } } : {}) });
        };
        try {
          const initial = await startAction({ type: "message", text: instruction }, [assetId]);
          expect(await executor().executeLease(await claim(initial.id), new AbortController().signal))
            .toMatchObject({ status: "WAITING_INPUT", failureCode: null });
          // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
          let review = await reviews.getWaitingReview(scope(), initial.id);
          // Explicit test-operator review of this fixed synthetic image; never a production table fallback.
          if (process.env.KF_LIVE_STATIC_ROW_REVIEW === "energy-overview-20261026") {
            await writeFile(path.join(evidence, "reference-review-before-edit.json"), JSON.stringify(review.content.reference, null, 2));
            const original = review.content.reference;
            const rowTitles = new Set(["1号配电室", "中央空调", "光伏逆变器", "当前告警", "今日能耗目标", "数据更新时间"]);
            const descendantText = (parentId: string): string[] => original.spec.regions.filter(region => region.parentId === parentId)
              .flatMap(region => [...region.text, ...descendantText(region.id)]);
            const corrections = original.spec.regions.filter(region => region.role === "table" && region.text.length === 0
              && region.interactionHint === null && region.box.y >= 0.55 && region.box.x >= 0.17
              && region.box.width <= 0.5 && region.box.height <= 0.15
              && original.mappings.some(mapping => mapping.regionId === region.id && mapping.support === "unsupported")
              && descendantText(region.id).some(text => rowTitles.has(text)))
              .map(region => ({ regionId: region.id, role: "content" as const, text: region.text, box: region.box }));
            if (corrections.length > 0) {
              await reviews.reviseWaitingReview(scope(), initial.id, { clientRequestId: randomUUID(), receipt: review.receipt,
                analysisId: original.analysisId, analysisHash: original.specHash, regions: corrections });
              review = await reviews.getWaitingReview(scope(), initial.id);
              await writeFile(path.join(evidence, "reference-review-edit.json"), JSON.stringify({
                scenario: "operator-reviewed-static-rows", regionIds: corrections.map(region => region.regionId),
                originalHash: original.specHash, revisedHash: review.content.reference.specHash,
                omitsBusinessContent: false, addsDataSourceOrInteraction: false }, null, 2));
            }
          }
          // end
          await writeFile(path.join(evidence, "reference-review.json"), JSON.stringify(review.content.reference, null, 2));
          const uncertaintyIds = new Set(review.content.reference.spec.uncertainties.map(item => item.regionId));
          // Global questions remain visible in the signed context/blueprint. They grant no datasource or navigation authority.
          // This static acceptance scope already says no business source and no navigation; do not erase the questions.
          // This acceptance scenario explicitly accepts static native approximations, not runtime interactivity or 1:1 fidelity.
          // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
          const { reviewedEnergyDecorationOmissions } = await import("../../../../tests/helpers/energy-reference-review.js");
          const reviewedDecorations = new Map((process.env.KF_LIVE_STATIC_ROW_REVIEW === "energy-overview-20261026"
            ? reviewedEnergyDecorationOmissions(review.content.reference.spec) : []).map(item => [item.regionId, item]));
          // end
          const acceptedDifferences = review.content.reference.mappings.flatMap<import("@kf/contracts").VisualReviewAcceptance["acceptedDifferences"][number]>(mapping => {
            // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
            const reviewedDecoration = reviewedDecorations.get(mapping.regionId);
            if (reviewedDecoration) return [reviewedDecoration];
            // end
            if (mapping.support === "verified" && !uncertaintyIds.has(mapping.regionId)) return [];
            const region = review.content.reference.spec.regions.find(item => item.id === mapping.regionId)!;
            if (mapping.support === "unsupported") {
              const decorativeDivider = region.role === "image" && region.text.length === 0
                && (region.box.width < 0.01 || region.box.height < 0.01);
              if (!decorativeDivider) throw new Error("LIVE_VISUAL_UNSUPPORTED_REGION_REQUIRES_REVIEW");
              return [{ regionId: region.id, disposition: "omit" as const, capabilityId: null, reason: "验收用例明确省略纯装饰分隔线，不省略业务文字或组件。" }];
            }
            return [{ regionId: region.id, disposition: "accept-unverified" as const, capabilityId: mapping.capabilityId,
              reason: "仅接受静态原生组件近似；数据为演示值，无导航或数据源；不代表交互、运行或像素一致已验证。" }];
          });
          await writeFile(path.join(evidence, "accepted-differences.json"), JSON.stringify(acceptedDifferences, null, 2));
          const planningRun = await startAction({ type: "accept_visual_reference", expectedRunId: initial.id,
            analysisId: review.content.reference.analysisId, analysisHash: review.content.reference.specHash,
            receipt: review.receipt, acceptedDifferences });
          await runtime({ service: blueprintService }, async ({ execution, conversations }) => {
            const outcome = await execution.executeLease(await claim(planningRun.id), new AbortController().signal);
            const checkpoint = await (await conversations.getGraph()).getState({ configurable: { thread_id: conversationId } });
            await writeFile(path.join(evidence, "blueprint.json"), JSON.stringify(checkpoint.values.designPlan ?? null, null, 2));
            await writeFile(path.join(evidence, "blueprint-diagnostics.json"), JSON.stringify({ outcome,
              lastErrorCode: checkpoint.values.lastErrorCode ?? null }, null, 2));
            expect(outcome).toMatchObject({ status: "WAITING_INPUT", failureCode: null });
          });
          const event = await prisma.agentRunEvent.findFirstOrThrow({ where: { runId: planningRun.id, type: "input.required" }, orderBy: { seq: "desc" } });
          const receipt = (event.payload as { receipt?: string }).receipt;
          if (!receipt) throw new Error("LIVE_VISUAL_BLUEPRINT_RECEIPT_REQUIRED");
          const engineeringRun = await startAction({ type: "confirm_blueprint", expectedRunId: planningRun.id, receipt });
          await engineeringRuntime({ successorId: engineeringRun.id, service: semanticService }, async ({ execution, buildOwnJob, conversations }) => {
            const abort = new AbortController();
            let settled = false;
            const running = execution.executeLease(await claim(engineeringRun.id), abort.signal).finally(() => { settled = true; });
            try {
              const deadline = Date.now() + 125000;
              let current = await prisma.agentRun.findUniqueOrThrow({ where: { id: engineeringRun.id } });
              while (!settled && current.status !== "BUILDING" && Date.now() < deadline) {
                await delay(100);
                current = await prisma.agentRun.findUniqueOrThrow({ where: { id: engineeringRun.id } });
              }
              const checkpoint = await (await conversations.getGraph()).getState({ configurable: { thread_id: conversationId } });
              await writeFile(path.join(evidence, "engineering-diagnostics.json"), JSON.stringify({ status: current.status,
                failureCode: current.failureCode, lastErrorCode: checkpoint.values.lastErrorCode ?? null,
                visualSemanticPlan: checkpoint.values.visualSemanticPlan ?? null }, null, 2));
              expect(current).toMatchObject({ status: "BUILDING", failureCode: null });
              expect(await buildOwnJob()).toMatchObject({ status: "SUCCEEDED" });
              expect(await running).toMatchObject({ status: "SUCCEEDED" });
            } finally { abort.abort(); await running.catch(() => undefined); }
          });
          const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: engineeringRun.id } });
          const artifact = await prisma.artifact.findFirstOrThrow({ where: { tenantId, buildJobId: run.buildJobId!, kind: "client-package" } });
          const chunks: Buffer[] = [];
          for await (const chunk of await new LocalArtifactStorage(root).open(tenantId, artifact.storageKey)) chunks.push(Buffer.from(chunk));
          const packageBytes = Buffer.concat(chunks);
          expect(createHash("sha256").update(packageBytes).digest("hex")).toBe(artifact.sha256);
          await writeFile(path.join(evidence, "energy-client.gz"), packageBytes);
          // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
          expect(physicalRequests).toBeGreaterThanOrEqual(savedFactsMode ? 1 : 3);
          expect(physicalRequests).toBeLessThanOrEqual(maximumPhysicalRequests);
          if (savedPlanning) expect(savedPlanning.fixtureRequests()).toBe(2);
          expect(await prisma.modelInvocation.count({ where: { tenantId, workspaceId, task: "repair", promptVersion: { startsWith: "visual-blueprint-repair@" } } })).toBeLessThanOrEqual(1);
          expect(await prisma.modelInvocation.count({ where: { tenantId, workspaceId, task: "repair", promptVersion: { startsWith: "visual-semantic-repair@" } } })).toBeLessThanOrEqual(1);
          // end
        } finally {
          const invocations = await prisma.modelInvocation.findMany({ where: { tenantId, workspaceId }, orderBy: { startedAt: "asc" },
            select: { task: true, requestedModel: true, actualModel: true, status: true, failureCode: true,
              inputTokens: true, outputTokens: true, cacheHitTokens: true, cacheMissTokens: true, latencyMs: true } });
          const outcomes = await prisma.agentRun.findMany({ where: { tenantId, workspaceId }, orderBy: { createdAt: "asc" },
            select: { id: true, status: true, failureCode: true } });
          await writeFile(path.join(evidence, "result.json"), JSON.stringify({ physicalRequests,
            acceptanceMode: savedFactsMode ? "semantic-only-with-new-approvals" : "full-new-reference",
            planningFixtureRequests: savedPlanning?.fixtureRequests() ?? 0, publicFactsHash: savedPlanning?.publicFactsHash ?? null, invocations, outcomes,
            productionRollout: false, nativeKfAccepted: false, browserAccepted: false }, null, 2));
          console.log(`[energy-live] evidence retained at ${evidence}`);
        }
      }, 360000);
    }
    // end
    // end
    // Explicitly opt in to installed Chrome. This is not a production rollout flag.
    // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
    it.skipIf(process.env.KF_VISUAL_BROWSER_TEST !== "1").each(["static", "click-feedback", "workspace-data", "observe", "observe-repeater"] as const)("runs the actual browser upload, consent, reference review, blueprint and native package download (%s)", async interactionMode => {
    // end
      const { chromium, expect: browserExpect } = await import("@playwright/test");
      const { createServer } = await import("vite");
      const { WorkbenchConfigController } = await import("./workbench-config.controller.js");
      const { VisualBlueprintService } = await import("../vision/visual-blueprint.service.js");
      const { VisualSemanticService } = await import("../vision/visual-semantic.service.js");
      const { getDesignKnowledgeSnapshot, retrieveCapabilities } = await import("@kf/domain-client");
      const { VisualSemanticPlanSchema } = await import("@kf/contracts");
      const { createHash } = await import("node:crypto");
      const evidence = await mkdtemp(path.join(tmpdir(), "kf-visual-browser-"));
      // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
      const browserBlueprint = structuredClone(blueprint);
      // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
      if (interactionMode === "click-feedback") {
        delete browserBlueprint.pages[0]!.regions.find((region) => region.id === "admin-sidebar-brand")!.visualRegionIds;
        browserBlueprint.pages[0]!.regions.find((region) => region.id === "admin-sidebar-action")!.visualRegionIds = ["heading"];
      }
      // end
      if (interactionMode === "workspace-data") await prisma.solutionWorkspace.update({ where: { id: workspaceId }, data: { name: "浏览器当前工作区" } });
      if (interactionMode === "click-feedback") browserBlueprint.journeys[0]!.steps.push({ pageId: "admin-directory-bp",
        regionId: "admin-sidebar-action", action: "点击本地反馈按钮", result: "显示已收到本地操作提示" });
      // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
      if (interactionMode === "observe") browserBlueprint.journeys[0]!.steps.push({ kind: "observe", pageId: "admin-directory-bp",
        regionId: "admin-sidebar-brand", action: "阅读品牌名称", result: "看到已确认品牌文字", expectedTexts: ["知序组织"] });
      if (interactionMode === "observe-repeater") browserBlueprint.journeys[0]!.steps.push({ kind: "observe", pageId: "admin-directory-bp",
        regionId: "admin-sidebar-brand", action: "阅读演示设备名称", result: "看到两个已确认设备名称", expectedTexts: ["演示设备A", "演示设备B"] });
      // end
      // end
      reviews = new VisualReviewService(prisma, Buffer.alloc(32, 0x48), { blueprint: blueprintRoute, implementation: semanticRoute });
      publicEngineeringStore();
      // Test-local effective policy only. resolveWorkbenchConfig still closes production vision.
      const configHandler: unknown = Object.getOwnPropertyDescriptor(WorkbenchConfigController.prototype, "get")?.value;
      if (typeof configHandler !== "function") throw new Error("browser fixture missing config handler");
      const configSpy = vi.spyOn(WorkbenchConfigController.prototype, "get").mockImplementation(() => ({
        ...config(tenantId), flags: { ...config(tenantId).flags, agentWorkbenchV2: true },
      }));
      // Preserve Nest route/guard/header metadata on this test-only policy double.
      for (const key of Reflect.getMetadataKeys(configHandler) as unknown[]) {
        Reflect.defineMetadata(key, Reflect.getMetadata(key, configHandler) as unknown, configSpy);
      }
      vi.stubEnv("AGENT_RUNS_V2", "true"); vi.stubEnv("AGENT_WORKBENCH_V2", "true");
      vi.stubEnv("AGENT_FEATURE_TENANT_ALLOWLIST", tenantId); vi.stubEnv("AGENT_VISION_V1", "false");
      vi.stubEnv("AGENT_REFERENCE_UPLOADS_V1", "true");
      vi.stubEnv("KF_SERVER_PLAN_HMAC_KEY_BASE64", Buffer.alloc(32, 0x62).toString("base64"));
      const { MODEL_PORT, DEFAULT_MODEL_PORT } = await import("../conversations/model-port.js");
      const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(RUN_STORE).useValue(store)
        .overrideProvider(VISUAL_PLANNING_RUNTIME).useValue({ reviews, blueprints: null, semantics: null })
        .overrideProvider(RunService).useValue(new RunService(store, new PrismaRunQueries(prisma), reviews, reviewPolicy))
        .overrideProvider(ARTIFACT_STORAGE).useValue(new LocalArtifactStorage(root)).overrideProvider(MODEL_PORT).useValue(DEFAULT_MODEL_PORT).compile();
      const app = module.createNestApplication(); app.use(cookieParser()); await app.listen(0, "127.0.0.1");
      let web: Awaited<ReturnType<typeof createServer>> | undefined;
      let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
      try {
        const apiUrl = await app.getUrl();
        web = await createServer({ root: new URL("../../../web/", import.meta.url).pathname,
          configFile: new URL("../../../web/vite.config.ts", import.meta.url).pathname, envFile: false,
          server: { host: "127.0.0.1", port: 0, proxy: { "/api": { target: apiUrl, changeOrigin: false } } } });
        await web.listen();
        const address = web.httpServer!.address();
        if (!address || typeof address === "string") throw new Error("browser fixture missing web port");
        const webUrl = `http://localhost:${address.port}`;
        vi.stubEnv("AGENT_ALLOWED_ORIGINS", webUrl);
        browser = await chromium.launch({ channel: "chrome", headless: true });
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
        await context.addCookies([{ name: SESSION_COOKIE_NAME, value: (await app.get(SessionService).createSession(userId)).token,
          url: webUrl, httpOnly: true, secure: true, sameSite: "Lax" }]);
        // No external requests are required or permitted by this fixture.
        await context.route("**/*", route => new URL(route.request().url()).origin === webUrl ? route.continue() : route.abort());
        const page = await context.newPage(); const pageErrors: string[] = [];
        page.on("pageerror", error => pageErrors.push(error.message));
        await page.goto(`${webUrl}/workspaces/${workspaceId}/workbench/${conversationId}`);
        await browserExpect(page.getByRole("textbox", { name: "描述你的需求" })).toBeEnabled();
        const pixels = await sharp({ create: { width: 400, height: 200, channels: 4, background: "#123456" } }).png().toBuffer();
        await page.getByTestId("reference-file-input").setInputFiles({ name: "browser-reference.png", mimeType: "image/png", buffer: pixels });
        await browserExpect(page.getByText("参考图已上传，尚未发送给模型。")).toBeVisible();
        // modified by jinlong.feng at 2026-10-28 Agent工作台迭代
        await browserExpect(page.getByTestId("reference-consent")).toBeChecked();
        await page.getByTestId("reference-consent").uncheck();
        // end
        await page.getByRole("textbox", { name: "描述你的需求" }).fill(text);
        await browserExpect(page.getByRole("button", { name: "发送", exact: true })).toBeDisabled();
        expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(0);
        await page.getByTestId("reference-consent").check();
        await page.getByRole("button", { name: "发送", exact: true }).click();
        const newest = async () => prisma.agentRun.findFirstOrThrow({ where: { conversationId }, orderBy: { createdAt: "desc" } });
        await vi.waitFor(async () => expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(1));
        const imageRun = await newest();
        expect(await executor().executeLease(await claim(imageRun.id), new AbortController().signal)).toMatchObject({ status: "WAITING_INPUT" });
        await browserExpect(page.getByTestId("accept-reference")).toBeVisible();
        await browserExpect(page.getByRole("button", { name: "确认蓝图并生成工程", exact: true })).toHaveCount(0);
        // Refresh exercises actual snapshot/SSE/review recovery, with no frontend-only fixture state.
        await page.reload();
        await browserExpect(page.getByTestId("accept-reference")).toBeDisabled();
        await page.screenshot({ path: path.join(evidence, "reference-desktop.png"), fullPage: true });
        await page.setViewportSize({ width: 390, height: 844 });
        await browserExpect(page.getByTestId("accept-reference")).toBeVisible();
        expect(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);
        await page.screenshot({ path: path.join(evidence, "reference-mobile.png"), fullPage: true });
        const beforeEdit = await reviews.getWaitingReview(scope(), imageRun.id);
        // modified by jinlong.feng at 2026-10-28 Agent工作台迭代
        await page.getByTestId("review-show-details").check();
        // end
        await page.getByLabel("区域 heading 的处理方式").selectOption("accept-unverified");
        await page.getByLabel("区域 heading 的确认说明").fill("这项旧选择必须在修改后清除");
        await page.getByTestId("edit-reference").click();
        await page.getByLabel("区域 heading 的识别文字").fill("浏览器修正标题");
        await page.getByLabel("区域 heading 的 width", { exact: true }).fill("0.8");
        await page.getByLabel("区域 heading 的 x", { exact: true }).fill("0.1");
        // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
        await page.locator('[data-region-id="heading"] .visual-clarification-edit summary').click();
        await page.getByLabel("区域 heading 的交互说明", { exact: true }).fill("浏览器说明：仅作交互需求参考，未验证");
        await page.getByLabel("区域 heading 的数据来源说明", { exact: true }).fill("浏览器说明：数据来源待绑定");
        await page.screenshot({ path: path.join(evidence, "reference-mobile-clarification-edit.png"), fullPage: true });
        // end
        // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
        await page.getByTestId("add-reference-region").click();
        await page.locator('[data-new-region="true"] textarea').fill("临时补充区域");
        // end
        await page.screenshot({ path: path.join(evidence, "reference-mobile-edit.png"), fullPage: true });
        await page.getByTestId("save-reference-edit").click();
        await browserExpect(page.getByTestId("edit-reference")).toBeVisible();
        // modified by jinlong.feng at 2026-10-28 Agent工作台迭代
        await page.getByTestId("review-show-details").check();
        // end
        await browserExpect(page.getByText("1 · 浏览器修正标题", { exact: true })).toBeVisible();
        await browserExpect(page.getByTestId("accept-reference")).toBeDisabled();
        // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
        const addedReview = await reviews.getWaitingReview(scope(), imageRun.id);
        // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
        expect(addedReview.content.reference.spec.regions.find(region => region.id === "heading")!.clarifications).toEqual({
          interaction: "浏览器说明：仅作交互需求参考，未验证", dataSource: "浏览器说明：数据来源待绑定",
        });
        // end
        const addedRegion = addedReview.content.reference.spec.regions.find(region => region.id !== "heading");
        expect(addedRegion).toMatchObject({ parentId: null, confidence: 0, text: ["临时补充区域"] });
        if (!addedRegion) throw new Error("BROWSER_ADDED_REGION_MISSING");
        await page.screenshot({ path: path.join(evidence, "reference-mobile-added.png"), fullPage: true });
        await page.getByTestId("edit-reference").click();
        // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
        await page.getByLabel(`区域 ${addedRegion.id} 的父区域`, { exact: true }).selectOption("heading");
        await browserExpect(page.getByLabel("区域 heading 的父区域", { exact: true }).locator(`option[value="${addedRegion.id}"]`)).toHaveCount(0);
        await page.locator(".visual-hierarchy summary").click();
        await page.screenshot({ path: path.join(evidence, "reference-mobile-hierarchy-edit.png"), fullPage: true });
        await page.getByTestId("save-reference-edit").click();
        await browserExpect(page.getByTestId("edit-reference")).toBeVisible();
        // modified by jinlong.feng at 2026-10-28 Agent工作台迭代
        await page.getByTestId("review-show-details").check();
        // end
        const parentedReview = await reviews.getWaitingReview(scope(), imageRun.id);
        expect(parentedReview.content.reference.spec.regions.find(region => region.id === addedRegion.id)).toEqual({ ...addedRegion, parentId: "heading" });
        expect(parentedReview.receipt).not.toBe(addedReview.receipt);
        await browserExpect(page.getByTestId("accept-reference")).toBeDisabled();
        await page.getByTestId("edit-reference").click();
        // end
        await page.getByLabel(`删除区域 ${addedRegion.id}`, { exact: true }).click();
        await browserExpect(page.getByLabel(`查看区域 ${addedRegion.id}`, { exact: true })).toHaveCount(0);
        await page.getByTestId("save-reference-edit").click();
        await browserExpect(page.getByTestId("edit-reference")).toBeVisible();
        // modified by jinlong.feng at 2026-10-28 Agent工作台迭代
        await page.getByTestId("review-show-details").check();
        // end
        const removedReview = await reviews.getWaitingReview(scope(), imageRun.id);
        expect(removedReview.receipt).not.toBe(addedReview.receipt);
        expect(removedReview.content.reference.spec.regions.map(region => region.id)).toEqual(["heading"]);
        expect(removedReview.content.reference.spec.uncertainties).toContainEqual({ regionId: null, question: "用户补充区域，交互与数据源尚待确认。" });
        await browserExpect(page.getByTestId("accept-reference")).toBeDisabled();
        await page.screenshot({ path: path.join(evidence, "reference-mobile-removed.png"), fullPage: true });
        // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
        if (interactionMode === "click-feedback") {
          await page.getByTestId("edit-reference").click();
          await page.getByLabel("区域 heading 的区域类型", { exact: true }).selectOption("action");
          await page.locator('[data-region-id="heading"] .visual-interaction-edit summary').click();
          await page.getByLabel("区域 heading 的执行交互", { exact: true }).selectOption("click-feedback");
          await page.getByLabel("区域 heading 的反馈文字", { exact: true }).fill("已收到本地操作");
          await page.screenshot({ path: path.join(evidence, "reference-mobile-interaction-edit.png"), fullPage: true });
          await page.getByTestId("save-reference-edit").click();
          await browserExpect(page.getByTestId("edit-reference")).toBeVisible();
          // modified by jinlong.feng at 2026-10-28 Agent工作台迭代
          await page.getByTestId("review-show-details").check();
          // end
          const interactionReview = await reviews.getWaitingReview(scope(), imageRun.id);
          expect(interactionReview.content.reference.spec.regions[0]!.interactionRequirement).toEqual({ kind: "click-feedback", level: "info", message: "已收到本地操作" });
          expect(interactionReview.content.reference.mappings[0]).toMatchObject({ capabilityId: "button", support: "supported_unverified" });
          await browserExpect(page.getByTestId("accept-reference")).toBeDisabled();
        }
        if (interactionMode === "workspace-data") {
          await page.getByTestId("edit-reference").click();
          await page.locator('[data-region-id="heading"] .visual-data-edit summary').click();
          await page.getByLabel("区域 heading 的数据绑定", { exact: true }).selectOption("workspace-name");
          await page.screenshot({ path: path.join(evidence, "reference-mobile-data-edit.png"), fullPage: true });
          await page.getByTestId("save-reference-edit").click();
          await browserExpect(page.getByTestId("edit-reference")).toBeVisible();
          // modified by jinlong.feng at 2026-10-28 Agent工作台迭代
          await page.getByTestId("review-show-details").check();
          // end
          const dataReview = await reviews.getWaitingReview(scope(), imageRun.id);
          expect(dataReview.content.reference.dataSnapshots).toEqual([{ regionId: "heading", kind: "workspace-field", field: "name", value: "浏览器当前工作区" }]);
          expect(dataReview.content.reference.mappings[0]).toMatchObject({ capabilityId: "text", support: "supported_unverified" });
          await browserExpect(page.getByText(/本版本取值：浏览器当前工作区/)).toBeVisible();
          await browserExpect(page.getByTestId("accept-reference")).toBeDisabled();
          await page.screenshot({ path: path.join(evidence, "reference-mobile-data-confirm.png"), fullPage: true });
        }
        // end
        // end
        // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
        if (interactionMode === "observe" || interactionMode === "observe-repeater") {
          const approvedTexts = interactionMode === "observe" ? ["知序组织"] : ["演示设备A", "演示设备B"];
          await page.getByTestId("edit-reference").click();
          await page.getByLabel("区域 heading 的识别文字").fill(approvedTexts.join("\n"));
          await page.getByTestId("save-reference-edit").click();
          await browserExpect(page.getByTestId("edit-reference")).toBeVisible();
          // modified by jinlong.feng at 2026-10-28 Agent工作台迭代
          await page.getByTestId("review-show-details").check();
          // end
          const observationReview = await reviews.getWaitingReview(scope(), imageRun.id);
          expect(observationReview.content.reference.spec.regions.find(region => region.id === "heading")!.text).toEqual(approvedTexts);
          await browserExpect(page.getByTestId("accept-reference")).toBeDisabled();
        }
        // end
        const oldAcceptance = await context.request.post(`${webUrl}/api/conversations/${conversationId}/runs`, { headers: { Origin: webUrl },
          data: { clientRequestId: randomUUID(), clientMessageId: randomUUID(), mode: "build", action: { type: "accept_visual_reference",
            expectedRunId: imageRun.id, analysisId: beforeEdit.content.reference.analysisId, analysisHash: beforeEdit.content.reference.specHash,
            receipt: beforeEdit.receipt, acceptedDifferences: [{ regionId: "heading", disposition: "accept-unverified", capabilityId: "richtext", reason: "旧版本" }] } } });
        expect(oldAcceptance.status()).toBe(409);
        expect(calls).toBe(1);
        expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(1);
        // modified by jinlong.feng at 2026-10-28 Agent工作台迭代
        await page.getByTestId("batch-keep-supported").click();
        await browserExpect(page.getByTestId("accept-reference")).toBeEnabled();
        // end
        await page.getByTestId("accept-reference").scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(evidence, "reference-mobile-actions.png"), fullPage: true });
        await page.getByTestId("accept-reference").click();
        await page.setViewportSize({ width: 1440, height: 1000 });
        await vi.waitFor(async () => expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(2));
        const blueprintRun = await newest();
        // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
        if (interactionMode === "workspace-data") await prisma.solutionWorkspace.update({ where: { id: workspaceId }, data: { name: "确认后重命名不得改变快照" } });
        // end
        // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
        const blueprintService = new VisualBlueprintService(prisma, reviews, new ModelGatewayService(new ModelInvocationService(prisma), async (_url, init) => {
          if (typeof init?.body !== "string") throw new Error("VISUAL_BLUEPRINT_FIXTURE_BODY_REQUIRED");
          const sent = JSON.parse(init.body) as { messages: { content: string }[] };
          expect(JSON.stringify(sent.messages)).toContain("浏览器说明：仅作交互需求参考，未验证");
          expect(JSON.stringify(sent.messages)).toContain("浏览器说明：数据来源待绑定");
          if (interactionMode === "click-feedback") expect(sent.messages.map(message => message.content).join("\n")).toContain('"kind":"click-feedback"');
          if (interactionMode === "workspace-data") expect(sent.messages.map(message => message.content).join("\n")).toContain('"value":"浏览器当前工作区"');
          return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(browserBlueprint) } }], usage: { prompt_tokens: 200, completion_tokens: 50 } }));
        }, "fixture-key"));
        // end
        await runtime({ service: blueprintService }, async ({ execution }) => {
          expect(await execution.executeLease(await claim(blueprintRun.id), new AbortController().signal)).toMatchObject({ status: "WAITING_INPUT" });
        });
        const confirm = page.getByRole("button", { name: "确认蓝图并生成工程", exact: true });
        await browserExpect(confirm).toBeVisible();
        await browserExpect(page.getByText(blueprint.objective, { exact: true })).toBeVisible();
        // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
        await browserExpect(page.getByText("参考图来源：heading", { exact: true })).toBeVisible();
        // end
        // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
        if (interactionMode === "observe") await browserExpect(page.getByText("应看到的文字：知序组织", { exact: true })).toBeVisible();
        if (interactionMode === "observe-repeater") await browserExpect(page.getByText("应看到的文字：演示设备A、演示设备B", { exact: true })).toBeVisible();
        // end
        await confirm.click();
        await vi.waitFor(async () => expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(3));
        const engineeringRun = await newest();
        // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
        const acceptedEngineering = await prisma.$transaction(tx => reviews.readEngineeringInTransaction(tx, scope(), engineeringRun.id));
        const candidates = retrieveCapabilities({ blueprint: browserBlueprint, knowledge: getDesignKnowledgeSnapshot(), visualReference: acceptedEngineering.accepted.reference });
        // end
        const golden = JSON.parse(await readFile(new URL("../../../../tests/fixtures/creative-goldens/management-admin.json", import.meta.url), "utf8")) as { plan: Record<string, unknown> };
        const semanticResult = VisualSemanticPlanSchema.parse({ schema: "kf-visual-semantic-plan/v1", plan: { ...golden.plan,
          blueprintHash: canonicalServerHash(browserBlueprint), candidateBundleHash: canonicalServerHash(candidates) }, bindings: [{ regionId: "heading",
            nodeId: interactionMode === "click-feedback" ? "admin-sidebar-members" : "admin-brand-title" }] });
        // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
        if (interactionMode === "click-feedback") {
          const actionIndex = semanticResult.plan.actions.findIndex(action => action.id === "admin-sidebar-home-action");
          semanticResult.plan.actions[actionIndex] = { id: "admin-sidebar-home-action", kind: "show-feedback", level: "info", message: "已收到本地操作",
            afterActionIds: [], journeyStepRefs: [{ journeyId: browserBlueprint.journeys[0]!.id, stepIndex: browserBlueprint.journeys[0]!.steps.length - 1 }] };
        }
        // end
        const visit = (value: unknown): void => {
          if (!value || typeof value !== "object") return;
          const node = value as Record<string, unknown>;
          if (node.id === "admin-brand-title") {
            node.capabilityId = interactionMode === "workspace-data" ? "text" : "richtext";
            if (interactionMode === "workspace-data") node.content = "浏览器当前工作区";
            // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
            if (interactionMode === "observe-repeater" && typeof node.content === "string") {
              const sourceBlueprintRegionIds = node.sourceBlueprintRegionIds;
              const intent = node.intent;
              const template = { ...node, content: { kind: "repeater-field", itemAlias: "brandDevice", field: "name" } };
              Object.keys(node).forEach((key) => { delete node[key]; });
              Object.assign(node, { kind: "repeater", id: "admin-brand-list", mockDataId: "brand-device-records", itemAlias: "brandDevice", keyField: "id", maxItems: 2,
                sourceBlueprintRegionIds, intent, template });
            }
            // end
          }
          for (const child of Object.values(node)) if (Array.isArray(child)) child.forEach(visit); else if (child && typeof child === "object") visit(child);
        };
        visit(semanticResult.plan);
        // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
        if (interactionMode === "observe-repeater") semanticResult.plan.mockData.push({ id: "brand-device-records", purpose: "演示设备名称",
          fields: [{ key: "id", label: "标识", type: "text" }, { key: "name", label: "设备名称", type: "text" }],
          records: ["A", "B"].map((name) => ({ values: [{ field: "id", value: name }, { field: "name", value: `演示设备${name}` }] })) });
        // end
        // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
        const semanticService = new VisualSemanticService(prisma, reviews, new ModelGatewayService(new ModelInvocationService(prisma), async (_url, init) => {
          if (typeof init?.body !== "string") throw new Error("VISUAL_SEMANTIC_FIXTURE_BODY_REQUIRED");
          const sent = JSON.parse(init.body) as { messages: { content: string }[] };
          expect(JSON.stringify(sent.messages)).toContain("浏览器说明：仅作交互需求参考，未验证");
          expect(JSON.stringify(sent.messages)).toContain("浏览器说明：数据来源待绑定");
          if (interactionMode === "click-feedback") expect(sent.messages.map(message => message.content).join("\n")).toContain('"kind":"click-feedback"');
          if (interactionMode === "workspace-data") expect(sent.messages.map(message => message.content).join("\n")).toContain('"value":"浏览器当前工作区"');
          return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(serializeVisualSemanticGraph(semanticResult)) } }], usage: { prompt_tokens: 800, completion_tokens: 100 } }));
        }, "fixture-key"));
        // end
        const lease = await claim(engineeringRun.id);
        await engineeringRuntime({ successorId: engineeringRun.id, service: semanticService }, async ({ execution, buildOwnJob }) => {
          const abort = new AbortController(); const running = execution.executeLease(lease, abort.signal);
          try {
            await vi.waitFor(async () => expect(await newest()).toMatchObject({ id: engineeringRun.id, status: "BUILDING" }), { timeout: 5000 });
            expect(await buildOwnJob()).toMatchObject({ status: "SUCCEEDED" });
            expect(await running).toMatchObject({ status: "SUCCEEDED" });
          } finally { abort.abort(); await running.catch(() => undefined); }
        });
        await browserExpect(page.getByRole("button", { name: "下载工程包", exact: true })).toBeVisible();
        const downloadEvent = page.waitForEvent("download");
        await page.getByRole("button", { name: "下载工程包", exact: true }).click();
        const downloaded = await downloadEvent;
        const packagePath = path.join(evidence, "client-project.gz"); await downloaded.saveAs(packagePath);
        const run = await newest();
        const artifact = await prisma.artifact.findFirstOrThrow({ where: { tenantId, buildJobId: run.buildJobId!, kind: "client-package" } });
        expect(createHash("sha256").update(await readFile(packagePath)).digest("hex")).toBe(artifact.sha256);
        // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
        if (interactionMode !== "static") {
          const { GenerationSnapshotContentSchema } = await import("@kf/contracts");
          const { importNativeClientPackage } = await import("@kf/domain-client");
          const { readdir } = await import("node:fs/promises");
          const snapshot = GenerationSnapshotContentSchema.parse((await prisma.generationSnapshot.findFirstOrThrow({ where: { runId: run.id } })).content);
          const sources = snapshot.sourceMap.filter(item => item.regionId === "heading");
          const source = sources[0]!;
          const control = snapshot.materialization.controls.find(item => item.semanticControlId === source.componentId)!;
          if (interactionMode === "click-feedback") {
            expect(control.capabilityId).toBe("button");
            expect(snapshot.materialization.interactions.actions.filter(action => action.ownerInstanceName === control.instanceName))
              .toMatchObject([{ kind: "show-feedback", level: "info", message: "已收到本地操作" }]);
          // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
          } else if (interactionMode === "observe") {
            expect(control).toMatchObject({ capabilityId: "richtext", content: "知序组织", nativeProperties: { text: "知序组织" } });
            expect(snapshot.artifact.blueprint.journeys[0]!.steps.at(-1)).toMatchObject({ kind: "observe", expectedTexts: ["知序组织"] });
          } else if (interactionMode === "observe-repeater") {
            expect(sources).toHaveLength(2);
            expect(sources.map((item) => snapshot.materialization.controls.find((candidate) => candidate.semanticControlId === item.componentId)!.nativeProperties["text"]).sort())
              .toEqual(["演示设备A", "演示设备B"]);
            expect(snapshot.artifact.blueprint.journeys[0]!.steps.at(-1)).toMatchObject({ kind: "observe", expectedTexts: ["演示设备A", "演示设备B"] });
          } else {
          // end
            expect(control).toMatchObject({ capabilityId: "text", nativeProperties: { text: "浏览器当前工作区" } });
            expect(snapshot.visual!.dataSnapshots![0]!.value).toBe("浏览器当前工作区");
          }
          const unpacked = await importNativeClientPackage(await readFile(packagePath), path.join(evidence, "unpacked"));
          const version = (await readdir(unpacked)).find(name => /^\d+\.\d+\.\d+\.\d+$/.test(name))!;
          const pageDirectory = path.join(unpacked, version, "project", "page");
          const matching: Record<string, unknown>[] = [];
          const instanceNames = new Set(sources.map((item) => snapshot.materialization.controls.find((candidate) => candidate.semanticControlId === item.componentId)!.instanceName));
          const visitControl = (object: Record<string, unknown>): void => {
            if (typeof object.name === "string" && instanceNames.has(object.name)
              || instanceNames.has((object.baseProperty as { name?: string } | undefined)?.name ?? "")) matching.push(object);
            if (Array.isArray(object.insiderObjects)) for (const child of object.insiderObjects as Record<string, unknown>[]) visitControl(child);
          };
          for (const file of await readdir(pageDirectory)) {
            const document = JSON.parse(await readFile(path.join(pageDirectory, file), "utf8")) as { objects: Record<string, unknown>[] };
            document.objects.forEach(visitControl);
          }
          expect(matching).toHaveLength(interactionMode === "observe-repeater" ? 2 : 1);
          if (interactionMode === "click-feedback") {
            const links = (matching[0]!.linkMng as { linkList: { name: string; script: string }[] }).linkList;
            expect(links.filter(link => link.name === "onClick")).toHaveLength(1);
            expect(links.find(link => link.name === "onClick")!.script).toContain('ShowMessage({"message":"已收到本地操作","type":"info"});');
          // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
          } else if (interactionMode === "observe-repeater") expect(matching.map((item) => item.text).sort()).toEqual(["演示设备A", "演示设备B"]);
          else expect(matching[0]!.text).toBe(interactionMode === "observe" ? "知序组织" : "浏览器当前工作区");
          // end
        }
        // end
        expect((await context.request.get(downloaded.url())).status()).toBe(401);
        expect(pageErrors).toEqual([]);
        await page.screenshot({ path: path.join(evidence, "delivery-desktop.png"), fullPage: true });
        console.log(`[visual-browser] evidence retained at ${evidence}`);
      } finally { await browser?.close(); await web?.close(); await app.close(); configSpy.mockRestore(); }
    }, 60000);
    // end
    it("continues public HTTP blueprint confirmation through the real engineering graph to a tenant-bound one-use package download", async () => {
      const test = await nativeEngineering(true);
      await engineeringRuntime(test, async ({ execution, buildOwnJob }) => {
        const controller = new AbortController(); let settled = false;
        const running = execution.executeLease(test.lease, controller.signal).finally(() => { settled = true; });
        try {
          await vi.waitFor(async () => {
            const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: test.successorId } });
            expect({ status: run.status, failureCode: run.failureCode, settled }).toEqual({ status: "BUILDING", failureCode: null, settled: false });
          }, { timeout: 5000 });
          expect(await buildOwnJob()).toMatchObject({ status: "SUCCEEDED" });
          expect(await running).toMatchObject({ status: "SUCCEEDED" });
        } finally { controller.abort(); await running.catch(() => undefined); }
      });
      await withPublicHttp(async ({ app, cookie }) => {
        const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: test.successorId } });
        if (!run.buildJobId) throw new Error("fixture delivery missing job");
        const url = `/api/conversations/${conversationId}/runs`;
        await request(app.getHttpServer()).post(url).send(test.publicRequest).expect(401);
        await request(app.getHttpServer()).post(url).set("Cookie", cookie).send(test.publicRequest).expect(403);
        expect((await request(app.getHttpServer()).post(url).set("Cookie", cookie).set("Origin", "http://localhost:5174")
          .send(test.publicRequest).expect(202)).body.id).toBe(run.id);
        const delivery = await request(app.getHttpServer()).get(`/api/conversations/${conversationId}/delivery?buildJobId=${run.buildJobId}`)
          .set("Cookie", cookie).expect(200);
        expect(delivery.body.projectDelivery.status).toBe("downloadable");
        const artifactId = delivery.body.artifactId as string;
        const artifact = await prisma.artifact.findFirstOrThrow({ where: { id: artifactId, tenantId, buildJobId: run.buildJobId } });
        const otherTenant = await prisma.tenant.create({ data: { name: randomUUID() } });
        const otherUser = await prisma.user.create({ data: { tenantId: otherTenant.id, username: randomUUID(), passwordHash: "fixture", role: "member", mustChangePassword: false } });
        const otherCookie = `${SESSION_COOKIE_NAME}=${(await app.get(SessionService).createSession(otherUser.id)).token}`;
        await request(app.getHttpServer()).post(`/api/artifacts/${artifactId}/download-token`).set("Cookie", otherCookie).expect(404);
        const token = await request(app.getHttpServer()).post(`/api/artifacts/${artifactId}/download-token`).set("Cookie", cookie).expect(200);
        const downloadUrl = `/api/artifacts/download/${token.body.token}`;
        await request(app.getHttpServer()).get(downloadUrl).set("Cookie", otherCookie).expect(401);
        const downloaded = await request(app.getHttpServer()).get(downloadUrl).set("Cookie", cookie).buffer(true)
          .parse((response: import("supertest").Response, callback: (error: Error | null, body?: Buffer) => void) => {
            const chunks: Buffer[] = []; response.on("data", (chunk: Buffer) => chunks.push(chunk));
            response.on("end", () => callback(null, Buffer.concat(chunks))); response.on("error", callback);
          }).expect(200);
        const { createHash } = await import("node:crypto");
        expect(createHash("sha256").update(downloaded.body as Buffer).digest("hex")).toBe(artifact.sha256);
        expect(Number(downloaded.headers["content-length"])).toBe(artifact.sizeBytes);
        await request(app.getHttpServer()).get(downloadUrl).set("Cookie", cookie).expect(401);
      });
      expect(test.sent).toHaveLength(1);
      expect(await prisma.buildJob.count({ where: { agentRunId: test.successorId } })).toBe(1);
    }, 30000);
    it("runs confirmed visual engineering through the real PG graph, native snapshot, build and package delivery", async () => {
      const test = await nativeEngineering();
      await engineeringRuntime(test, async ({ execution, buildOwnJob }) => {
        const controller = new AbortController();
        let settled = false;
        const running = execution.executeLease(test.lease, controller.signal).finally(() => { settled = true; });
        try {
          const { setTimeout: delay } = await import("node:timers/promises");
          let bound = await prisma.agentRun.findUniqueOrThrow({ where: { id: test.successorId } });
          for (let attempt = 0; attempt < 500 && !settled && bound.status !== "BUILDING"; attempt++) {
            await delay(10); bound = await prisma.agentRun.findUniqueOrThrow({ where: { id: test.successorId } });
          }
          expect({ status: bound.status, failureCode: bound.failureCode }).toEqual({ status: "BUILDING", failureCode: null });
          expect(await prisma.buildJob.findUniqueOrThrow({ where: { id: bound.buildJobId! } })).toMatchObject({ agentRunId: test.successorId, baseRevisionId });
          const snapshot = await prisma.generationSnapshot.findFirstOrThrow({ where: { runId: test.successorId } });
          expect(snapshot.content).toMatchObject({ visual: { specHash: test.snapshot.content.accepted.reference.specHash }, sourceMap: [{ regionId: "heading" }] });
          expect(await buildOwnJob()).toMatchObject({ id: bound.buildJobId, status: "SUCCEEDED" });
          const completed = await running;
          expect(completed).toMatchObject({ status: "SUCCEEDED", buildJobId: bound.buildJobId, failureCode: null });
          expect(await prisma.generationSnapshot.findUniqueOrThrow({ where: { id: snapshot.id } })).toMatchObject({ buildJobId: bound.buildJobId, revisionId: completed.resultRevisionId });
          const artifact = await prisma.artifact.findFirstOrThrow({ where: { buildJobId: bound.buildJobId!, kind: "client-package" } });
          expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
          const stream = await new LocalArtifactStorage(root).open(tenantId, artifact.storageKey);
          const { buffer } = await import("node:stream/consumers");
          const { createHash } = await import("node:crypto");
          const bytes = await buffer(stream);
          expect(bytes.byteLength).toBeGreaterThan(100);
          expect(createHash("sha256").update(bytes).digest("hex")).toBe(artifact.sha256);
          expect(test.sent).toHaveLength(1);
          expect(await prisma.agentRunStep.count({ where: { runId: test.successorId, stepKey: "visual-engineering", status: "COMPLETED" } })).toBe(1);
        } finally { controller.abort(); await running.catch(() => undefined); }
      });
    }, 30000);
    async function submitEngineering(test: Awaited<ReturnType<typeof semantic>>) {
      await engineeringRuntime(test, async ({ execution }) => {
        const controller = new AbortController(); let settled = false;
        const running = execution.executeLease(test.lease, controller.signal).finally(() => { settled = true; });
        try {
          const { setTimeout: delay } = await import("node:timers/promises");
          let run = await prisma.agentRun.findUniqueOrThrow({ where: { id: test.successorId } });
          for (let attempt = 0; attempt < 500 && !settled && run.status !== "BUILDING"; attempt++) {
            await delay(10); run = await prisma.agentRun.findUniqueOrThrow({ where: { id: test.successorId } });
          }
          expect({ status: run.status, failureCode: run.failureCode }).toEqual({ status: "BUILDING", failureCode: null });
        } finally { controller.abort(); await running.catch(() => undefined); }
      });
      const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: test.successorId } });
      expect(run).toMatchObject({ status: "BUILDING", leaseOwner: test.lease.ownerId });
      return prisma.buildJob.findUniqueOrThrow({ where: { id: run.buildJobId! } });
    }
    it.each(["before-build", "after-build"] as const)("recovers submitted visual engineering %s after TTL expiry and policy revocation without another model call", async phase => {
      const test = await nativeEngineering(); const job = await submitEngineering(test);
      await prisma.visualReferenceAnalysis.update({ where: { id: test.snapshot.content.accepted.reference.analysisId }, data: { expiresAt: new Date(0) } });
      await prisma.tenant.update({ where: { id: tenantId }, data: { imageEgressAllowed: false } });
      enabled = false;
      if (phase === "after-build") await engineeringRuntime(test, async ({ buildOwnJob }) => {
        expect(await buildOwnJob()).toMatchObject({ id: job.id, status: "SUCCEEDED" });
      });
      await prisma.agentRun.update({ where: { id: test.successorId }, data: { leaseExpiresAt: new Date(0) } });
      const lease = await store.recoverExpired("engineering-recovered", tenantId, new Date());
      expect(lease?.runId).toBe(test.successorId);
      await engineeringRuntime(test, async ({ execution, buildOwnJob, conversations }) => {
        const load = vi.spyOn(conversations, "getGraph").mockRejectedValue(new Error("submitted recovery must not load the graph"));
        const controller = new AbortController();
        const running = execution.executeLease(lease!, controller.signal);
        try {
          if (phase === "before-build") {
            await vi.waitFor(async () => {
              expect(await prisma.agentRunEvent.count({ where: { runId: test.successorId, type: "run.started" } })).toBe(2);
            });
            expect(await buildOwnJob()).toMatchObject({ id: job.id, status: "SUCCEEDED" });
          }
          expect(await running).toMatchObject({ status: "SUCCEEDED", buildJobId: job.id, failureCode: null });
        } finally { controller.abort(); await running.catch(() => undefined); load.mockRestore(); }
      });
      expect(await prisma.buildJob.count({ where: { agentRunId: test.successorId } })).toBe(1);
      expect(test.sent).toHaveLength(1);
      expect(await prisma.modelInvocation.count({ where: { runId: test.successorId, task: "implementation" } })).toBe(1);
    }, 30000);
    it.each(["resume", "revoked"] as const)("recovers the real precompile checkpoint with %s authority", async scenario => {
      const test = await nativeEngineering();
      const controller = new AbortController();
      const append = store.append.bind(store);
      const publisher = vi.spyOn(store, "append").mockImplementation(async (...args) => {
        const result = await append(...args);
        if (args[2].type === "decision.summary" && args[2].payload.summary === "已完成流程节点：solution-implementation-plan") controller.abort();
        return result;
      });
      try {
        await engineeringRuntime(test, async ({ execution }) => {
          await expect(execution.executeLease(test.lease, controller.signal)).rejects.toThrow();
        });
      } finally { publisher.mockRestore(); }
      expect(test.sent).toHaveLength(1);
      expect(await prisma.buildJob.count({ where: { agentRunId: test.successorId } })).toBe(0);
      expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: test.successorId } })).toMatchObject({ status: "RUNNING" });
      if (scenario === "revoked") await prisma.tenant.update({ where: { id: tenantId }, data: { imageEgressAllowed: false } });
      await prisma.agentRun.update({ where: { id: test.successorId }, data: { leaseExpiresAt: new Date(0) } });
      const lease = await store.recoverExpired("precompile-recovered", tenantId, new Date());
      expect(lease?.runId).toBe(test.successorId);
      await engineeringRuntime(test, async ({ execution, buildOwnJob }) => {
        const shutdown = new AbortController(); let settled = false;
        const running = execution.executeLease(lease!, shutdown.signal).finally(() => { settled = true; });
        try {
          if (scenario === "resume") {
            await vi.waitFor(async () => {
              const current = await prisma.agentRun.findUniqueOrThrow({ where: { id: test.successorId } });
              expect({ status: current.status, failureCode: current.failureCode, settled }).toEqual({ status: "BUILDING", failureCode: null, settled: false });
            }, { timeout: 5000 });
            expect(await buildOwnJob()).toMatchObject({ status: "SUCCEEDED" });
          }
          expect(await running).toMatchObject({ status: scenario === "resume" ? "SUCCEEDED" : "FAILED" });
        } finally { shutdown.abort(); await running.catch(() => undefined); }
      });
      expect(test.sent).toHaveLength(1);
      expect(await prisma.buildJob.count({ where: { agentRunId: test.successorId } })).toBe(scenario === "resume" ? 1 : 0);
    }, 30000);
    it.each(["policy", "expired", "cache", "cancel", "no-config", "bad-proof"] as const)("fails closed for engineering %s before planning", async changed => {
      const test = await semantic({ noConfig: changed === "no-config" });
      if (changed === "policy") await prisma.tenant.update({ where: { id: tenantId }, data: { imageEgressAllowed: false } });
      if (changed === "expired") await prisma.visualReferenceAnalysis.update({ where: { id: test.snapshot.content.accepted.reference.analysisId }, data: { expiresAt: new Date(0) } });
      if (changed === "cache") await prisma.agentRunStep.create({ data: { tenantId, runId: test.successorId, stepKey: "visual-engineering", status: "COMPLETED", inputHash: "f".repeat(64), outputRef: "{}" } });
      if (changed === "cancel") await controls.cancel(tenantId, test.successorId, userId);
      if (changed === "bad-proof") await prisma.agentRunStep.updateMany({ where: { runId: test.successorId, stepKey: "visual-engineering-continuation-v1" }, data: { outputRef: "{}" } });
      await engineeringRuntime(test, async ({ execution }) => {
        const result = await execution.executeLease(test.lease, new AbortController().signal);
        expect(result.status).toBe(changed === "cancel" ? "CANCELLED" : "FAILED");
        if (changed === "cache") expect(result.failureCode).toBe("RUN_STEP_CACHE_INVALID");
        if (changed === "no-config") expect(result.failureCode).toBe("VISUAL_SEMANTIC_CONFIG_REQUIRED");
      });
      expect(test.sent).toHaveLength(0);
      expect(await prisma.buildJob.count({ where: { agentRunId: test.successorId } })).toBe(0);
    });
    it.each(["foreign-job", "signature", "proof", "result", "queued-cache"] as const)("rejects submitted engineering %s instead of reusing an untrusted binding", async changed => {
      const test = await nativeEngineering(); const job = await submitEngineering(test);
      if (changed === "foreign-job") await prisma.buildJob.update({ where: { id: job.id }, data: { agentRunId: null } });
      if (changed === "signature") {
        const plan = await prisma.changePlan.findUniqueOrThrow({ where: { id: job.changePlanId } });
        await prisma.changePlan.update({ where: { id: plan.id }, data: { plan: { ...(plan.plan as Record<string, unknown>), signature: "0".repeat(64) } as never } });
      }
      if (changed === "proof") await prisma.agentRunStep.updateMany({ where: { runId: test.successorId, stepKey: "visual-engineering-continuation-v1" }, data: { outputRef: "{}" } });
      if (changed === "result") await prisma.agentRun.update({ where: { id: test.successorId }, data: { resultRevisionId: baseRevisionId } });
      if (changed === "queued-cache") await prisma.agentRunStep.create({ data: { tenantId, runId: test.successorId, stepKey: "visual-engineering", status: "COMPLETED", inputHash: "f".repeat(64), outputRef: "{}" } });
      await prisma.agentRun.update({ where: { id: test.successorId }, data: { leaseExpiresAt: new Date(0) } });
      const lease = await store.recoverExpired("engineering-invalid-binding", tenantId, new Date());
      expect(lease?.runId).toBe(test.successorId);
      await engineeringRuntime(test, async ({ execution }) => {
        expect(await execution.executeLease(lease!, new AbortController().signal)).toMatchObject({ status: "FAILED" });
      });
      expect(test.sent).toHaveLength(1);
      expect(await prisma.buildJob.count({ where: { tenantId, workspaceId } })).toBe(1);
    }, 30000);
    it("does not call an unmatched visual control a successful engineering delivery", async () => {
      const test = await semantic();
      // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
      // Inject the mismatch explicitly; the shared positive fixture now follows the reviewed capability.
      const proposalNodes = test.expected.plan.pages.map(page => page.root);
      let changedHeading = false;
      while (proposalNodes.length > 0) {
        const node = proposalNodes.pop()!;
        if (node.kind === "control" && node.id === "admin-brand-title") {
          node.capabilityId = node.capabilityId === "text" ? "richtext" : "text";
          changedHeading = true;
        }
        if (node.kind === "layout") proposalNodes.push(...node.children);
      }
      expect(changedHeading).toBe(true);
      // end
      await engineeringRuntime(test, async ({ execution }) => {
        const result = await execution.executeLease(test.lease, new AbortController().signal);
        expect(result.status).toBe("FAILED");
      });
      expect(test.sent).toHaveLength(1);
      expect(await prisma.generationSnapshot.count({ where: { runId: test.successorId } })).toBe(0);
      expect(await prisma.buildJob.count({ where: { agentRunId: test.successorId } })).toBe(0);
    });
    // end
    it("freezes a signed displayed blueprint before the real graph Run pauses", async () => {
      const input = await blueprintWaiting();
      const row = await prisma.agentRunStep.findFirstOrThrow({ where: { runId: input.source.id, stepKey: "visual-blueprint-review-v1" } });
      const review = JSON.parse(row.outputRef!) as { content: Record<string, unknown>; inputHash: string; receipt: string };
      expect(review.content).toMatchObject({ schema: "kf-visual-blueprint-review/v1", runId: input.source.id,
        sourceContinuationHash: input.snapshot.inputHash, visualConfirmationHash: input.snapshot.content.accepted.confirmationHash,
        blueprint, blueprintReceipt: input.receipt, execution: { ownerId: input.lease.ownerId, fence: input.lease.fence } });
      expect(row).toMatchObject({ status: "COMPLETED", inputHash: review.inputHash });
      expect(review.receipt).toMatch(/^vbpr1:[a-f0-9]{64}:[a-f0-9]{64}$/);
    });
    it("binds confirmed blueprint, original visual choices and the new action in a distinct recoverable engineering proof", async () => {
      const input = await blueprintWaiting(); const { snapshot, successorId } = await engineering(input);
      expect(snapshot.content).toMatchObject({ schema: "kf-visual-engineering-continuation/v1", purpose: "semantic-planning",
        runId: successorId, sourceRunId: input.source.id, sourceContinuationHash: input.snapshot.inputHash,
        accepted: input.snapshot.content.accepted, blueprintReview: { content: { blueprint, blueprintReceipt: input.receipt } } });
      expect(snapshot.receipt).toMatch(/^veng1:[a-f0-9]{64}:[a-f0-9]{64}$/);
      expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: input.source.id } })).toMatchObject({ status: "CANCELLED", supersededByRunId: successorId });
      expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: successorId } })).toMatchObject({ status: "QUEUED", buildJobId: null,
        inputSnapshot: { baseRevisionPolicy: "fixed", attachmentIds: [assetId], visualEngineering: snapshot } });
      expect(await prisma.agentRunEvent.count({ where: { runId: input.source.id, type: "run.cancelled" } })).toBe(1);
      expect(await prisma.auditLog.count({ where: { resourceId: successorId, action: "VISUAL_BLUEPRINT_CONFIRMED" } })).toBe(1);
      expect((await prisma.$transaction(tx => reviews.readEngineeringInTransaction(tx, scope(), successorId))).snapshot).toEqual(snapshot);
      expect(await prisma.$transaction(tx => reviews.freezeEngineeringInTransaction(tx, scope(), successorId, input.source.id))).toEqual(snapshot);
      expect(await prisma.buildJob.count({ where: { workspaceId } })).toBe(0);
    });
    it("rolls back a consumed blueprint and its proof/audit if the caller transaction fails", async () => {
      const input = await blueprintWaiting();
      await expect(engineering(input, randomUUID(), true)).rejects.toThrow("engineering outer rollback");
      expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(2);
      expect(await prisma.agentRunStep.count({ where: { tenantId, run: { conversationId }, stepKey: "visual-engineering-continuation-v1" } })).toBe(0);
      expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: input.source.id } })).status).toBe("WAITING_INPUT");
    });
    it("permits exactly one engineering successor when two real confirmation transactions race", async () => {
      const input = await blueprintWaiting(); const results = await Promise.allSettled([engineering(input), engineering(input)]);
      expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
      expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(3);
      expect(await prisma.agentRunEvent.count({ where: { runId: input.source.id, type: "run.cancelled" } })).toBe(1);
    });
    it.each(["message", "review", "receipt", "cancel", "policy", "expired"] as const)("refuses engineering confirmation after %s changes", async changed => {
      const input = await blueprintWaiting();
      if (changed === "message") await prisma.message.updateMany({ where: { runId: input.source.id, role: "assistant" }, data: { content: "替换展示蓝图" } });
      if (changed === "review") await prisma.agentRunStep.deleteMany({ where: { runId: input.source.id, stepKey: "visual-blueprint-review-v1" } });
      if (changed === "receipt") input.receipt = encodeBlueprintConfirmation(99, "0".repeat(64));
      if (changed === "cancel") await controls.cancel(tenantId, input.source.id, userId);
      if (changed === "policy") await prisma.tenant.update({ where: { id: tenantId }, data: { imageEgressAllowed: false } });
      if (changed === "expired") await prisma.visualReferenceAnalysis.update({ where: { id: input.input.acceptance.analysisId }, data: { expiresAt: new Date(0) } });
      const expectedCode = { message: "VISUAL_BLUEPRINT_MESSAGE_MISMATCH", review: "VISUAL_BLUEPRINT_REVIEW_INTEGRITY_FAILED",
        receipt: "BLUEPRINT_RECEIPT_MISMATCH", cancel: "VISUAL_BLUEPRINT_NOT_WAITING", policy: "IMAGE_EGRESS_NOT_ALLOWED", expired: "VISUAL_ANALYSIS_STALE" }[changed];
      await expect(engineering(input)).rejects.toThrow(expectedCode);
      expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(2);
      expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: input.source.id } })).supersededByRunId).toBeNull();
    });
    it("rejects engineering proof tampering even if every public hash and durable step is recomputed", async () => {
      const input = await blueprintWaiting(); const { snapshot, successorId } = await engineering(input);
      const changed = structuredClone(snapshot); changed.content.blueprintReview.content.blueprint.displayName = "伪造蓝图";
      changed.inputHash = canonicalServerHash(changed.content);
      await prisma.agentRun.update({ where: { id: successorId }, data: { inputSnapshot: { attachmentIds: [assetId], baseRevisionPolicy: "fixed", visualEngineering: changed } } });
      await prisma.agentRunStep.updateMany({ where: { runId: successorId, stepKey: "visual-engineering-continuation-v1" }, data: { inputHash: changed.inputHash, outputRef: JSON.stringify(changed) } });
      await expect(prisma.$transaction(tx => reviews.readEngineeringInTransaction(tx, scope(), successorId))).rejects.toThrow("VISUAL_ENGINEERING_INTEGRITY_FAILED");
    });
    it("refuses a blueprint review whose content and step hashes were rewritten without its server signature", async () => {
      const input = await blueprintWaiting();
      const { VisualBlueprintReviewSchema } = await import("@kf/contracts");
      const row = await prisma.agentRunStep.findFirstOrThrow({ where: { runId: input.source.id, stepKey: "visual-blueprint-review-v1" } });
      const changed = VisualBlueprintReviewSchema.parse(JSON.parse(row.outputRef!) as unknown);
      changed.content.blueprint.displayName = "伪造展示"; changed.inputHash = canonicalServerHash(changed.content);
      await prisma.agentRunStep.update({ where: { id: row.id }, data: { inputHash: changed.inputHash, outputRef: JSON.stringify(changed) } });
      await expect(engineering(input)).rejects.toThrow("VISUAL_BLUEPRINT_REVIEW_INTEGRITY_FAILED");
      expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: input.source.id } })).status).toBe("WAITING_INPUT");
    });
    it("refuses an ambiguous later blueprint message rather than confirming the originally signed one", async () => {
      const input = await blueprintWaiting();
      const message = await prisma.message.findFirstOrThrow({ where: { runId: input.source.id, role: "assistant" } });
      await prisma.message.create({ data: { tenantId, conversationId, runId: input.source.id, role: "assistant", content: message.content } });
      await expect(engineering(input)).rejects.toThrow("VISUAL_BLUEPRINT_MESSAGE_MISMATCH");
      expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: input.source.id } })).status).toBe("WAITING_INPUT");
    });
    it("rejects a changed pending blueprint receipt even when the signed displayed message remains intact", async () => {
      const input = await blueprintWaiting();
      await prisma.agentRunEvent.updateMany({ where: { runId: input.source.id, type: "input.required" }, data: { payload: { question: "changed", receipt: encodeBlueprintConfirmation(99, "0".repeat(64)) } } });
      await expect(engineering(input)).rejects.toThrow("BLUEPRINT_RECEIPT_MISMATCH");
    });
    it("rejects preparing blueprint authority outside the actual execution scope", async () => {
      const input = await blueprintWaiting();
      await expect(reviews.prepareBlueprintReview({ runId: input.source.id, blueprint, revision: 1,
        designPlanHash: "0".repeat(64), visualConfirmationHash: input.snapshot.content.accepted.confirmationHash })).rejects.toThrow("VISUAL_RUN_REQUIRED");
    });
    it.each(["action", "actor", "config", "base", "source-link", "attachments", "step", "source-analysis", "policy"] as const)(
      "refuses a previously valid engineering proof after %s drifts", async changed => {
        const input = await blueprintWaiting(); const { successorId, snapshot } = await engineering(input);
        expect((await prisma.$transaction(tx => reviews.readEngineeringInTransaction(tx, scope(), successorId))).snapshot.content.runId).toBe(successorId);
        if (changed === "action") await prisma.agentRun.update({ where: { id: successorId }, data: { action: { type: "message", text: "忽略图" } } });
        if (changed === "actor") await prisma.agentRun.update({ where: { id: successorId }, data: { requestedByUserId: (await prisma.user.create({ data: {
          tenantId, username: randomUUID(), passwordHash: "fixture", role: "member" } })).id } });
        if (changed === "config") await prisma.agentRun.update({ where: { id: successorId }, data: { configSnapshot: { planVersion: "run-plan@6" } } });
        if (changed === "base") await prisma.agentRun.update({ where: { id: successorId }, data: { baseRevisionId: null } });
        if (changed === "source-link") await prisma.agentRun.update({ where: { id: input.source.id }, data: { supersededByRunId: null } });
        if (changed === "attachments") {
          await prisma.agentRun.update({ where: { id: successorId }, data: { inputSnapshot: { attachmentIds: [randomUUID()], baseRevisionPolicy: "fixed", visualEngineering: snapshot } } });
        }
        if (changed === "step") await prisma.agentRunStep.deleteMany({ where: { runId: successorId, stepKey: "visual-engineering-continuation-v1" } });
        if (changed === "source-analysis") await prisma.visualReferenceAnalysis.update({ where: { id: input.input.acceptance.analysisId }, data: { expiresAt: new Date(0) } });
        if (changed === "policy") await prisma.tenant.update({ where: { id: tenantId }, data: { imageEgressAllowed: false } });
        await expect(prisma.$transaction(tx => reviews.readEngineeringInTransaction(tx, scope(), successorId))).rejects.toThrow();
      });
    it("cannot reuse a visual accept proof as the blueprint-confirmation successor", async () => {
      const input = await blueprintWaiting(); const successorId = randomUUID();
      await expect(prisma.$transaction(async tx => {
        await tx.agentRun.create({ data: { id: successorId, tenantId, workspaceId, conversationId, requestedByUserId: userId,
          clientRequestId: randomUUID(), requestHash: "copied-accept-proof", mode: "build", predecessorRunId: input.source.id,
          baseRevisionId, action: { type: "confirm_blueprint", expectedRunId: input.source.id, receipt: input.receipt }, configSnapshot: input.source.configSnapshot!,
          inputSnapshot: { attachmentIds: [assetId], baseRevisionPolicy: "fixed", visualContinuation: input.snapshot } } });
        return reviews.freezeEngineeringInTransaction(tx, scope(), successorId, input.source.id);
      })).rejects.toThrow("VISUAL_ENGINEERING_INTEGRITY_FAILED");
      expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: input.source.id } })).status).toBe("WAITING_INPUT");
    });
    // end
    // end
    it("rejects a damaged accepted proof before the worker reads a completed step cache", async () => {
      const test = await planning();
      const { planVisualBlueprintSteps } = await import("./run-execution-plan.js");
      const step = planVisualBlueprintSteps({ type: "accept_visual_reference", expectedRunId: test.input.source.id,
        analysisId: test.input.acceptance.analysisId, analysisHash: test.input.acceptance.analysisHash }, baseRevisionId, test.snapshot.inputHash)[0]!;
      await new PrismaRunStepStore(prisma).complete({ lease: test.lease, tenantId, ...step, output: { stage: "done" } });
      await prisma.agentRunStep.deleteMany({ where: { runId: test.successorId, stepKey: "visual-continuation-v1" } });
      await runtime(test, async ({ execution }) => {
        expect(await execution.executeLease(test.lease, new AbortController().signal)).toMatchObject({ status: "FAILED", failureCode: "VISUAL_CONTINUATION_INTEGRITY_FAILED" });
        expect(test.sent).toHaveLength(0);
        expect(await prisma.message.count({ where: { runId: test.successorId, role: "assistant" } })).toBe(0);
      });
    });
    it("recovers a PostgreSQL graph checkpoint after the blueprint event committed but Run.pause failed", async () => {
      const test = await planning();
      await runtime(test, async ({ execution }) => {
        const paused = vi.spyOn(store, "pause").mockRejectedValueOnce(new Error("fixture crash before pause"));
        try { await expect(execution.executeLease(test.lease, new AbortController().signal)).rejects.toThrow("fixture crash before pause"); }
        finally { paused.mockRestore(); }
      });
      await prisma.agentRun.update({ where: { id: test.successorId }, data: { leaseExpiresAt: new Date(0) } });
      const recovered = await store.recoverExpired("blueprint-graph-recovery", tenantId, new Date());
      expect(recovered?.runId).toBe(test.successorId);
      await runtime(test, async ({ execution }) => {
        expect(await execution.executeLease(recovered!, new AbortController().signal)).toMatchObject({ status: "WAITING_INPUT" });
        expect(test.sent).toHaveLength(1);
        expect(await prisma.message.count({ where: { runId: test.successorId, role: "assistant" } })).toBe(1);
        expect(await prisma.agentRunEvent.count({ where: { runId: test.successorId, type: "input.required" } })).toBe(1);
      });
    });
    it("clears an older building/approved checkpoint before loading the new visual turn", async () => {
      const test = await planning();
      await runtime(test, async ({ execution, conversations }) => {
        const graph = await conversations.getGraph();
        await graph.updateState({ configurable: { thread_id: conversationId } }, { ...test.context, runId: "older-run", stage: "building",
          buildJobId: "older-job", buildAuthorization: "confirmed-blueprint", creativeConfirmationId: "a".repeat(64),
          designPlan: blueprint, designPlanHash: "b".repeat(64), recentMessages: [] });
        expect(await execution.executeLease(test.lease, new AbortController().signal)).toMatchObject({ status: "WAITING_INPUT", failureCode: null });
        const state = (await graph.getState({ configurable: { thread_id: conversationId } })).values;
        expect(state.runId).toBe(test.successorId); expect(state.buildJobId).toBeUndefined(); expect(state.buildAuthorization).toBeUndefined();
        expect(test.sent).toHaveLength(1);
      });
    });
    it("rejects a conflicting own checkpoint instead of reinterpreting it as a fresh text turn", async () => {
      const test = await planning();
      await runtime(test, async ({ execution, conversations }) => {
        await (await conversations.getGraph()).updateState({ configurable: { thread_id: conversationId } }, {
          ...test.context, runId: test.successorId, planVersion: "run-plan@7", stage: "design-review", recentMessages: [],
          acceptedVisualPlanningInput: null,
        });
        expect(await execution.executeLease(test.lease, new AbortController().signal)).toMatchObject({ status: "FAILED", failureCode: "VISUAL_BLUEPRINT_CHECKPOINT_INVALID" });
        expect(test.sent).toHaveLength(0);
      });
    });
    it("cannot treat a completed execution-step cache as a successful visual blueprint without pausing", async () => {
      const test = await planning();
      const { planVisualBlueprintSteps } = await import("./run-execution-plan.js");
      const action = (await prisma.agentRun.findUniqueOrThrow({ where: { id: test.successorId } })).action;
      const step = planVisualBlueprintSteps(action as never, baseRevisionId, test.snapshot.inputHash)[0]!;
      await new PrismaRunStepStore(prisma).complete({ lease: test.lease, tenantId, ...step, output: { stage: "done" } });
      await runtime(test, async ({ execution }) => {
        expect(await execution.executeLease(test.lease, new AbortController().signal)).toMatchObject({ status: "FAILED", failureCode: "RUN_STEP_CACHE_INVALID" });
        expect(test.sent).toHaveLength(0);
        expect(await prisma.agentRunEvent.count({ where: { runId: test.successorId, type: "run.completed" } })).toBe(0);
      });
    });
    it("keeps an accepted Run recoverable when shutdown precedes preflight", async () => {
      const test = await planning(); const stopped = new AbortController(); stopped.abort();
      await runtime(test, async ({ execution }) => {
        await expect(execution.executeLease(test.lease, stopped.signal)).rejects.toThrow();
        expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: test.successorId } })).toMatchObject({ status: "RUNNING", leaseOwner: test.lease.ownerId });
        expect(test.sent).toHaveLength(0);
      });
    });
    it("honors cancellation during the actual blueprint graph without publishing a blueprint wait or Message", async () => {
      let successor = "";
      const test = await planning({ inFlight: async () => { await controls.cancel(tenantId, successor, userId); } }); successor = test.successorId;
      await runtime(test, async ({ execution }) => {
        expect(await execution.executeLease(test.lease, new AbortController().signal)).toMatchObject({ status: "CANCELLED" });
        expect(await prisma.agentRunEvent.count({ where: { runId: successor, type: "input.required" } })).toBe(0);
        expect(await prisma.message.count({ where: { runId: successor, role: "assistant" } })).toBe(0);
        expect(await prisma.buildJob.count({ where: { workspaceId } })).toBe(0);
      });
    });
    // end
  });
  // end
  it("rolls back successor, acceptance proof, audit, event and consumption together", async () => {
    const input = await waiting(); const successorId = randomUUID();
    await expect(inherit(input, successorId, input.acceptance, true)).rejects.toThrow("fixture outer transaction rollback");
    expect(await prisma.agentRun.findUnique({ where: { id: successorId } })).toBeNull();
    expect(await prisma.auditLog.count({ where: { resourceId: successorId } })).toBe(0);
    expect(await prisma.agentRunStep.count({ where: { runId: successorId } })).toBe(0);
    expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: input.source.id } })).toMatchObject({ status: "WAITING_INPUT", supersededByRunId: null });
    expect(await prisma.agentRunEvent.count({ where: { runId: input.source.id, type: "run.cancelled" } })).toBe(0);
  });
  it("admits only one concurrent successor and rolls back the losing candidate", async () => {
    const input = await waiting();
    const results = await Promise.allSettled([inherit(input), inherit(input)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { tenantId, action: "VISUAL_REFERENCE_ACCEPTED", detail: { path: ["sourceRunId"], equals: input.source.id } } })).toBe(1);
    expect(await prisma.agentRunEvent.count({ where: { runId: input.source.id, type: "run.cancelled" } })).toBe(1);
  });
  it("replays the same successor without resigning or duplicating audit, but refuses different choices", async () => {
    const input = await waiting(); const successorId = randomUUID(); const first = await inherit(input, successorId);
    expect(await prisma.$transaction(tx => reviews.freezeContinuationInTransaction(tx, scope(), successorId, input.acceptance))).toEqual(first);
    await expect(prisma.$transaction(tx => reviews.freezeContinuationInTransaction(tx, scope(), successorId,
      { ...input.acceptance, acceptedDifferences: [{ regionId: "heading", disposition: "omit", capabilityId: null, reason: "不生成" }] })))
      .rejects.toThrow("VISUAL_CONTINUATION_CONFLICT");
    expect(await prisma.auditLog.count({ where: { resourceId: successorId, action: "VISUAL_REFERENCE_ACCEPTED" } })).toBe(1);
  });
  it("rejects forged receipts without consuming the source or keeping a candidate", async () => {
    const input = await waiting();
    await expect(inherit(input, randomUUID(), { ...input.acceptance, receipt: `vref1:${"0".repeat(64)}:${"0".repeat(64)}` })).rejects.toThrow("VISUAL_REVIEW_RECEIPT_MISMATCH");
    expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(1);
    expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: input.source.id } })).status).toBe("WAITING_INPUT");
  });
  it("does not inherit the original user's consent for a different real member", async () => {
    const input = await waiting();
    const another = await prisma.user.create({ data: { tenantId, username: randomUUID(), passwordHash: "fixture", role: "member" } });
    await expect(prisma.$transaction(tx => reviews.freezeContinuationInTransaction(tx, { ...scope(), userId: another.id }, randomUUID(), input.acceptance)))
      .rejects.toThrow("VISUAL_CONTINUATION_ACTOR_MISMATCH");
    expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: input.source.id } })).status).toBe("WAITING_INPUT");
  });
  it("does not accept after tenant egress permission is revoked", async () => {
    const input = await waiting();
    await prisma.tenant.update({ where: { id: tenantId }, data: { imageEgressAllowed: false } });
    await expect(inherit(input)).rejects.toThrow("IMAGE_EGRESS_NOT_ALLOWED");
    expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(1);
  });
  it("authenticates accepted choices even if all plain content hashes and stored copies were recomputed", async () => {
    const input = await waiting(); const successorId = randomUUID(); const snapshot = await inherit(input, successorId);
    const changed = structuredClone(snapshot);
    changed.content.accepted.reference.acceptedDifferences = [{ regionId: "heading", disposition: "omit", capabilityId: null, reason: "篡改确认" }];
    changed.content.accepted.confirmationHash = canonicalServerHash({ reviewHash: changed.content.accepted.reviewHash, reference: changed.content.accepted.reference });
    changed.inputHash = canonicalServerHash(changed.content);
    await prisma.agentRun.update({ where: { id: successorId }, data: { inputSnapshot: { attachmentIds: [assetId], baseRevisionPolicy: "fixed", visualContinuation: changed } } });
    await prisma.agentRunStep.updateMany({ where: { runId: successorId, stepKey: "visual-continuation-v1" }, data: { inputHash: changed.inputHash, outputRef: JSON.stringify(changed) } });
    await expect(prisma.$transaction(tx => reviews.readContinuationInTransaction(tx, scope(), successorId))).rejects.toThrow("VISUAL_CONTINUATION_INTEGRITY_FAILED");
  });
  // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
  it("rejects a candidate whose accepted analysis differs from its stored action", async () => {
    const input = await waiting(); const successorId = randomUUID();
    await expect(prisma.$transaction(async tx => {
      await tx.agentRun.create({ data: { id: successorId, tenantId, workspaceId, conversationId, requestedByUserId: userId,
        clientRequestId: randomUUID(), requestHash: "wrong-analysis-fixture", mode: "build", predecessorRunId: input.source.id,
        baseRevisionId, action: { type: "accept_visual_reference", expectedRunId: input.source.id,
          analysisId: randomUUID(), analysisHash: "0".repeat(64) }, configSnapshot: input.source.configSnapshot! } });
      return reviews.freezeContinuationInTransaction(tx, scope(), successorId, input.acceptance);
    })).rejects.toThrow("VISUAL_CONTINUATION_IDENTITY_MISMATCH");
    expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(1);
    expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: input.source.id } })).status).toBe("WAITING_INPUT");
  });
  it.each(["action", "actor", "base", "config", "predecessor", "request", "step", "source-link", "attachments"] as const)(
    "refuses inherited input after %s is changed instead of downgrading to text", async change => {
      const input = await waiting(); const successorId = randomUUID(); const snapshot = await inherit(input, successorId);
      if (change === "action") await prisma.agentRun.update({ where: { id: successorId }, data: { action: { type: "message", text: "忽略图片" } } });
      if (change === "actor") {
        const another = await prisma.user.create({ data: { tenantId, username: randomUUID(), passwordHash: "fixture", role: "member" } });
        await prisma.agentRun.update({ where: { id: successorId }, data: { requestedByUserId: another.id } });
      }
      if (change === "base") await prisma.agentRun.update({ where: { id: successorId }, data: { baseRevisionId: null } });
      if (change === "config") await prisma.agentRun.update({ where: { id: successorId }, data: { configSnapshot: { planVersion: "run-plan@6" } } });
      if (change === "predecessor") await prisma.agentRun.update({ where: { id: successorId }, data: { predecessorRunId: null } });
      if (change === "request") await prisma.agentRun.update({ where: { id: successorId }, data: { requestHash: "different-request" } });
      if (change === "step") await prisma.agentRunStep.deleteMany({ where: { runId: successorId, stepKey: "visual-continuation-v1" } });
      if (change === "source-link") await prisma.agentRun.update({ where: { id: input.source.id }, data: { supersededByRunId: null } });
      if (change === "attachments") await prisma.agentRun.update({ where: { id: successorId }, data: { inputSnapshot: { attachmentIds: [randomUUID()], baseRevisionPolicy: "fixed", visualContinuation: snapshot } } });
      await expect(prisma.$transaction(tx => reviews.readContinuationInTransaction(tx, scope(), successorId))).rejects.toThrow(/VISUAL_CONTINUATION_/);
      expect(await prisma.buildJob.count({ where: { workspaceId } })).toBe(0);
      expect(graphLoads).toBe(0);
    });
  it.each(["expiry", "child", "baseline", "source", "policy"] as const)("rechecks current %s before inherited planning", async change => {
    const input = await waiting(); const successorId = randomUUID(); await inherit(input, successorId);
    const row = await prisma.visualReferenceAnalysis.findUniqueOrThrow({ where: { id: input.acceptance.analysisId } });
    if (change === "expiry") await prisma.visualReferenceAnalysis.update({ where: { id: row.id }, data: { expiresAt: new Date(0) } });
    if (change === "child") await prisma.visualReferenceAnalysis.create({ data: { tenantId, workspaceId, assetId, parentId: row.id,
      sourceHash: row.sourceHash, derivativeHash: row.derivativeHash, analysisVersion: row.analysisVersion, modelConfigHash: row.modelConfigHash,
      instructionHash: row.instructionHash, spec: row.spec!, specHash: row.specHash, expiresAt: row.expiresAt } });
    if (change === "baseline") await prisma.solutionWorkspace.update({ where: { id: workspaceId }, data: { currentRevisionId: null } });
    if (change === "source") await prisma.referenceAsset.update({ where: { id: assetId }, data: { sourceHash: "e".repeat(64) } });
    if (change === "policy") await prisma.tenant.update({ where: { id: tenantId }, data: { imageEgressAllowed: false } });
    await expect(prisma.$transaction(tx => reviews.readContinuationInTransaction(tx, scope(), successorId))).rejects.toThrow();
    expect(calls).toBe(1); expect(graphLoads).toBe(0);
  });
  it("never consumes a review cancelled before acceptance", async () => {
    const input = await waiting(); await controls.cancel(tenantId, input.source.id, userId);
    await expect(inherit(input)).rejects.toThrow("VISUAL_REVIEW_NOT_WAITING");
    expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(1);
    expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: input.source.id } })).supersededByRunId).toBeNull();
  });
  it("rolls consumption and proof back on a later audit constraint failure in the caller transaction", async () => {
    const input = await waiting(); const successorId = randomUUID();
    // Fail after proof/consumption writes, without replacing the production repository or transaction.
    await expect(prisma.$transaction(async tx => {
      await tx.agentRun.create({ data: { id: successorId, tenantId, workspaceId, conversationId, requestedByUserId: userId,
        clientRequestId: randomUUID(), requestHash: "audit-rollback-fixture", mode: "build", predecessorRunId: input.source.id, baseRevisionId,
        action: { type: "accept_visual_reference", expectedRunId: input.source.id, analysisId: input.acceptance.analysisId, analysisHash: input.acceptance.analysisHash },
        configSnapshot: input.source.configSnapshot! } });
      await reviews.freezeContinuationInTransaction(tx, scope(), successorId, input.acceptance);
      const audit = await tx.auditLog.findFirstOrThrow({ where: { resourceId: successorId, action: "VISUAL_REFERENCE_ACCEPTED" } });
      await tx.auditLog.create({ data: { id: audit.id, tenantId, action: "fixture duplicate key", resourceType: "AGENT_RUN", resourceId: successorId } });
    })).rejects.toThrow();
    expect(await prisma.agentRun.findUnique({ where: { id: successorId } })).toBeNull();
    expect(await prisma.auditLog.count({ where: { resourceId: successorId } })).toBe(0);
    expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: input.source.id } })).status).toBe("WAITING_INPUT");
  });
  it("rolls the internal proof and source update back if its cancellation event cannot be inserted", async () => {
    const input = await waiting(); const successorId = randomUUID();
    await prisma.agentRunEvent.create({ data: { tenantId, runId: input.source.id, seq: input.source.lastSeq + 1,
      type: "decision.summary", payload: { summary: "fixture collision" } } });
    await expect(inherit(input, successorId)).rejects.toThrow();
    expect(await prisma.agentRun.findUnique({ where: { id: successorId } })).toBeNull();
    expect(await prisma.agentRunStep.count({ where: { runId: successorId } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { resourceId: successorId } })).toBe(0);
    expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: input.source.id } })).toMatchObject({ status: "WAITING_INPUT", supersededByRunId: null });
  });
  it.each(["tenant", "workspace", "conversation", "user"] as const)("does not expose inherited planning to another %s scope", async change => {
    const input = await waiting(); const successorId = randomUUID(); await inherit(input, successorId);
    const changedScope = { ...scope(), [`${change}Id`]: randomUUID() };
    await expect(prisma.$transaction(tx => reviews.readContinuationInTransaction(tx, changedScope, successorId))).rejects.toThrow();
    expect(await prisma.buildJob.count({ where: { workspaceId } })).toBe(0);
  });
  // end
});
// end

describe("durable reference message Run through the production Store and executor", () => {
  it("atomically admits the input, claims a real lease and stops at exactly one signed review without text planning or build", async () => {
    const { run, outcome } = await execute();
    expect(outcome).toMatchObject({ id: run.id, status: "WAITING_INPUT", failureCode: null, buildJobId: null });
    const stored = await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(stored).toMatchObject({ leaseOwner: null, leaseExpiresAt: null, configSnapshot: { planVersion: "run-plan@7" },
      inputSnapshot: { visualAdmission: { content: { runId: run.id, attachments: [{ assetId, role: "primary" }] } } } });
    const events = await prisma.agentRunEvent.findMany({ where: { runId: run.id }, orderBy: { seq: "asc" } });
    expect(events.map(event => event.seq)).toEqual(events.map((_, index) => index + 1));
    expect(events.filter(event => event.type === "input.required")).toHaveLength(1);
    expect(events[0]?.type).toBe("run.queued");
    expect(events.some(event => ["run.completed", "run.failed", "step.failed"].includes(event.type))).toBe(false);
    expect(JSON.stringify(events.map(event => event.payload))).not.toMatch(/visual-flow.invalid|base64|fixture-key|标题/);
    expect(await prisma.agentRunStep.count({ where: { runId: run.id, stepKey: "visual-reference", status: "COMPLETED" } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { resourceId: run.id, action: "VISUAL_INPUT_FROZEN" } })).toBe(1);
    expect(await prisma.message.count({ where: { runId: run.id, role: "user" } })).toBe(1);
    expect(await prisma.buildJob.count({ where: { tenantId, workspaceId } })).toBe(0);
    expect(calls).toBe(1); expect(graphLoads).toBe(0); expect(disposed).toBe(1);
  });
  it("keeps the default product policy closed even though the worker can execute the staged protocol", async () => {
    enabled = false;
    await expect(start()).rejects.toMatchObject({ status: 403, response: { error: { code: "FEATURE_NOT_ENABLED" } } });
    expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(0);
    expect(await prisma.message.count({ where: { conversationId } })).toBe(0);
    expect(calls).toBe(0);
  });
  it("accepts the same strict request through the real authenticated Origin-protected Run HTTP route under a staged server policy", async () => {
    const origin = "http://localhost:5174"; vi.stubEnv("AGENT_ALLOWED_ORIGINS", origin);
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(RUN_STORE).useValue(store)
      .overrideProvider(ARTIFACT_STORAGE).useValue(new LocalArtifactStorage(root)).compile();
    const app = module.createNestApplication(); app.use(cookieParser()); await app.init();
    try {
      const cookie = `${SESSION_COOKIE_NAME}=${(await app.get(SessionService).createSession(userId)).token}`;
      const url = `/api/conversations/${conversationId}/runs`;
      await request(app.getHttpServer()).post(url).send(body()).expect(401);
      await request(app.getHttpServer()).post(url).set("Cookie", cookie).send(body()).expect(403);
      const result = await request(app.getHttpServer()).post(url).set("Cookie", cookie).set("Origin", origin).send(body()).expect(202);
      expect(result.body).toMatchObject({ status: "QUEUED", workspaceId, conversationId });
      expect(JSON.stringify(result.body)).not.toMatch(/visualAdmission|visual-flow.invalid|sendingConsent|configSnapshot/);
      expect(await prisma.message.count({ where: { conversationId } })).toBe(1);
      expect(await executor().executeLease(await claim(result.body.id as string), new AbortController().signal)).toMatchObject({ status: "WAITING_INPUT" });
    } finally { await app.close(); }
  });
  it("rejects missing/forged consent and more than one image without creating a partial Run or Message", async () => {
    for (const value of [{ ...body(), visualReference: undefined }, { ...body(), visualReference: { ...body().visualReference, route } },
      { ...body(), visualReference: { primaryAssetId: assetId, sendingConsent: { noticeVersion: "visual-egress@1", accepted: false } } },
      { ...body(), attachmentIds: [assetId, randomUUID()] }]) await expect(start(value)).rejects.toThrow();
    expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(0);
    expect(await prisma.message.count({ where: { conversationId } })).toBe(0);
  });
  it("replays an admitted request after rollout and administrative policy close without duplicating any row", async () => {
    const value = body(); const first = await start(value);
    enabled = false; await prisma.tenant.update({ where: { id: tenantId }, data: { imageEgressAllowed: false } });
    expect(await start(value)).toEqual(first);
    expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(1);
    expect(await prisma.message.count({ where: { conversationId } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { resourceId: first.id, action: "VISUAL_INPUT_FROZEN" } })).toBe(1);
  });
  it("rolls back Message/Run when a real foreign-workspace reference fails admission", async () => {
    const otherWorkspace = await prisma.solutionWorkspace.create({ data: { tenantId, name: randomUUID() } });
    const another = await prisma.conversation.create({ data: { tenantId, workspaceId: otherWorkspace.id, title: "foreign" } });
    await prisma.solutionWorkspace.update({ where: { id: workspaceId }, data: { currentRevisionId: baseRevisionId } });
    // Target scope is a real workspace with a real base, but the image belongs elsewhere.
    const base = await prisma.solutionRevision.create({ data: { tenantId, workspaceId: otherWorkspace.id, kind: "initial" } });
    await prisma.solutionWorkspace.update({ where: { id: otherWorkspace.id }, data: { currentRevisionId: base.id, generationWorkflow: "creative-v2" } });
    await expect(runs.start({ tenantId, userId }, another.id, body() as never)).rejects.toThrow("VISUAL_REFERENCE_NOT_FOUND");
    expect(await prisma.message.count({ where: { conversationId: another.id } })).toBe(0);
    expect(await prisma.agentRun.count({ where: { conversationId: another.id } })).toBe(0);
  });
  it("validates frozen visual input before an already-completed execution step can bypass it", async () => {
    const run = await start(); const lease = await claim(run.id);
    await prisma.agentRunStep.deleteMany({ where: { runId: run.id, stepKey: "visual-run-admission-v1" } });
    await prisma.agentRunStep.create({ data: { tenantId, runId: run.id, stepKey: "visual-reference", inputHash: "f".repeat(64), status: "COMPLETED", outputRef: "{}" } });
    expect(await executor().executeLease(lease, new AbortController().signal)).toMatchObject({ status: "FAILED", failureCode: "VISUAL_RUN_INPUT_INVALID" });
    expect(calls).toBe(0); expect(graphLoads).toBe(0);
    expect(await prisma.agentRunStep.count({ where: { runId: run.id, stepKey: "visual-reference", status: "COMPLETED" } })).toBe(1);
  });
  it("does not reuse a completed reference-step cache as proof that the user review already happened", async () => {
    const run = await start(); const lease = await claim(run.id);
    const stored = await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });
    const admission = stored.inputSnapshot as { visualAdmission: { inputHash: string } };
    const step = planVisualReferenceSteps({ type: "message", text }, baseRevisionId, admission.visualAdmission.inputHash)[0]!;
    await new PrismaRunStepStore(prisma).complete({ lease, tenantId, ...step, output: { stage: "done" } });
    expect(await executor().executeLease(lease, new AbortController().signal)).toMatchObject({ status: "FAILED", failureCode: "RUN_STEP_CACHE_INVALID" });
    expect(calls).toBe(0);
    expect(await prisma.agentRunEvent.count({ where: { runId: run.id, type: "run.completed" } })).toBe(0);
  });
  it("cannot turn a reference handler's ordinary return into completion without the mandatory review pause", async () => {
    const run = await start(); const lease = await claim(run.id);
    const service = new RunExecutionService({ prisma, store, steps: new PrismaRunStepStore(prisma), handlers: {
      "visual-reference": async () => ({ output: { stage: "done" } }),
    } });
    expect(await service.executeLease(lease, new AbortController().signal)).toMatchObject({ status: "FAILED", failureCode: "RUN_STEP_REQUIRES_PAUSE" });
    expect(await prisma.agentRunStep.count({ where: { runId: run.id, stepKey: "visual-reference", status: "COMPLETED" } })).toBe(0);
  });
  it("settles a committed pause only for the exact releasing owner/fence and review identity", async () => {
    const { run, lease, outcome } = await execute();
    const review = await reviews.getWaitingReview({ tenantId, workspaceId, conversationId, userId }, run.id);
    expect(await store.observeCommittedReviewPause(lease, tenantId, review.reviewHash)).toEqual(outcome);
    for (const altered of [{ ...lease, ownerId: "not-the-releasing-worker" }, { ...lease, fence: lease.fence + 1 }]) {
      await expect(store.observeCommittedReviewPause(altered, tenantId, review.reviewHash)).rejects.toThrow("FENCE_REJECTED");
    }
    await expect(store.observeCommittedReviewPause(lease, tenantId, "e".repeat(64))).rejects.toThrow("FENCE_REJECTED");
    expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe("WAITING_INPUT");
  });
  it("honors cancellation while pixels are in flight without publishing review or a build", async () => {
    const run = await start(); const lease = await claim(run.id);
    let release!: () => void;
    providerWait = new Promise(resolve => { release = resolve; });
    const sending = new Promise<void>(resolve => { reached = resolve; });
    const pending = executor().executeLease(lease, new AbortController().signal);
    await sending; await controls.cancel(tenantId, run.id, userId); release();
    expect(await pending).toMatchObject({ status: "CANCELLED" });
    expect(await prisma.agentRunEvent.count({ where: { runId: run.id, type: "input.required" } })).toBe(0);
    expect(await prisma.buildJob.count({ where: { workspaceId } })).toBe(0);
  });
  it("keeps a claimed image Run recoverable when worker shutdown precedes visual preflight", async () => {
    const run = await start(); const lease = await claim(run.id);
    const stopped = new AbortController(); stopped.abort();
    await expect(executor().executeLease(lease, stopped.signal)).rejects.toThrow();
    expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({ status: "RUNNING", leaseOwner: lease.ownerId });
    expect(await prisma.agentRunEvent.count({ where: { runId: run.id, type: { in: ["run.failed", "run.cancelled"] } } })).toBe(0);
    expect(calls).toBe(0);
  });
  it("returns a cancellation committed just after review pause instead of reviving or failing that Run", async () => {
    const run = await start(); const lease = await claim(run.id);
    const wrapped = { prepare: async (input: Parameters<VisualReviewService["prepare"]>[0]) => {
      const review = await reviews.prepare(input); await controls.cancel(tenantId, run.id, userId); return review;
    } } as VisualReviewService;
    expect(await executor(wrapped).executeLease(lease, new AbortController().signal)).toMatchObject({ status: "CANCELLED" });
    expect(await prisma.agentRunEvent.count({ where: { runId: run.id, type: "run.cancelled" } })).toBe(1);
    expect(await prisma.agentRunEvent.count({ where: { runId: run.id, type: "run.failed" } })).toBe(0);
  });
  it("cannot consume the visual wait with a text message or blueprint confirmation, but can stop it", async () => {
    const { run } = await execute();
    await expect(start({ ...body(), attachmentIds: [], visualReference: undefined })).rejects.toThrow("VISUAL_REVIEW_ACTION_REQUIRED");
    await expect(start({ ...body(), attachmentIds: [], visualReference: undefined, action: { type: "confirm_blueprint", expectedRunId: run.id,
      receipt: encodeBlueprintConfirmation(1, "a".repeat(64)) } })).rejects.toThrow("VISUAL_REVIEW_ACTION_REQUIRED");
    expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe("WAITING_INPUT");
    expect(await controls.cancel(tenantId, run.id, userId)).toMatchObject({ status: "CANCELLED" });
  });
  it("does not retry a failed visual Run as a plain text Run that loses the reference", async () => {
    const run = await start(); await controls.cancel(tenantId, run.id, userId);
    await expect(controls.retry(tenantId, run.id, userId, randomUUID())).rejects.toThrow("VISUAL_RETRY_NOT_ENABLED");
    await expect(store.create({ tenantId, userId, conversationId, clientRequestId: randomUUID(), clientMessageId: randomUUID(), mode: "build",
      action: { type: "message", text }, attachmentIds: [], retryOfRunId: run.id })).rejects.toThrow("VISUAL_RETRY_NOT_ENABLED");
    expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(1);
  });
  it("recovers an expired lease from the exact frozen input and reuses completed image analysis without sending twice", async () => {
    const run = await start(); const lease = await claim(run.id);
    await withAgentRunExecution({ tenantId, runId: run.id, ownerId: lease.ownerId, fence: lease.fence, signal: new AbortController().signal },
      () => analysis.analyze({ tenantId, workspaceId, runId: run.id, assetId, instruction: text, analysisVersion: "visual-analysis@1" }, new AbortController().signal));
    await prisma.agentRun.update({ where: { id: run.id }, data: { leaseExpiresAt: new Date(0) } });
    const recovered = await store.recoverExpired("visual-recovery", tenantId, new Date());
    expect(recovered?.runId).toBe(run.id);
    expect(await executor().executeLease(recovered!, new AbortController().signal)).toMatchObject({ status: "WAITING_INPUT" });
    expect(calls).toBe(1);
    expect(await prisma.agentRunEvent.count({ where: { runId: run.id, type: "input.required" } })).toBe(1);
  });
});
// end
