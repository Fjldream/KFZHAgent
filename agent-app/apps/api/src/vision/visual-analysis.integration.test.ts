// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import "reflect-metadata";
import { assertSafeTestDatabase } from "../../../../tests/helpers/database-safety.js";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
assertSafeTestDatabase({ url: process.env.DATABASE_URL, allowReset: process.env.KF_TEST_ALLOW_DESTRUCTIVE_RESET, expectedPrefix: "kf_agent_test_" });
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { canonicalServerHash, type ModelRoute } from "@kf/contracts";
import type { ArtifactStorage } from "@kf/artifact-storage";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import cookieParser from "cookie-parser";
import request from "supertest";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../app.module.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ModelGatewayService } from "../models/model-gateway.js";
import { ModelInvocationService } from "../models/model-invocation.service.js";
import { ReferenceAssetService } from "./reference-asset.service.js";
import { VisualAnalysisService } from "./visual-analysis.service.js";
import { ARTIFACT_STORAGE } from "../artifacts/artifact-storage.js";
import { SessionService, SESSION_COOKIE_NAME } from "../auth/session.service.js";
import { WorkspaceService } from "../workspaces/workspace.service.js";
// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { withAgentRunExecution } from "@kf/build-jobs";
import type { VisualAnalysisInput } from "./visual-analysis.service.js";
import { visualAnalysisCacheKey } from "./visual-analysis-cache.js";
import { visualModelConfigHash } from "./visual-analysis-request.js";
import { VisualEgressPolicyService } from "./visual-egress-policy.service.js";
import { AsyncResource } from "node:async_hooks";
// end

const route: ModelRoute = { provider: "deepseek", baseUrl: "https://local-provider.invalid/v1", model: "vision-fixture", supportsVision: true,
  supportsJson: true, supportsThinking: false, maxContextTokens: 64000, timeoutMs: 1000, pricingVersion: null };
const origin = "http://localhost:5174";
const spec = () => ({ schemaVersion: 1, sourceAssetId: "model-invented-asset", sourceHash: "f".repeat(64), viewport: { width: 999, height: 999 },
  regions: [{ id: "main", parentId: null, role: "content", box: { x: 0, y: 0, width: 1, height: 1 }, text: ["生产总览"], confidence: 0.9, interactionHint: null }],
  designTokens: { background: "#001122", foreground: "#ffffff", accent: "#00aacc", spacing: [8, 16], radius: [4] }, uncertainties: [] });
let app: INestApplication;
let prisma: PrismaService;
let references: ReferenceAssetService;
let root: string;
let tenantId: string;
let otherTenantId: string;
let workspaceId: string;
let runId: string;
let assetId: string;
let cookie: string;
let otherCookie: string;
// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
let memberCookie: string;
// end
let instruction: string;
// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
let api: Pick<VisualAnalysisService, "analyze" | "get" | "revise">;
let unscopedApi: VisualAnalysisService;
let providerFetch: typeof fetch;
let userId: string;
let conversationId: string;
const analysisOwner = "analysis-worker";
function inRun<T>(value: VisualAnalysisInput, signal: AbortSignal, work: () => Promise<T>, fence = 1) {
  return withAgentRunExecution({ tenantId: value.tenantId, runId: value.runId, ownerId: analysisOwner, fence, signal }, work);
}
async function newActiveRun() {
  return (await prisma.agentRun.create({ data: { tenantId, workspaceId, conversationId, requestedByUserId: userId,
    clientRequestId: randomUUID(), requestHash: "test-only", mode: "plan", action: {}, inputSnapshot: {}, status: "RUNNING",
    leaseOwner: analysisOwner, fence: 1, leaseExpiresAt: new Date(Date.now() + 60000) } })).id;
}
// end
let calls: Array<{ body: Record<string, unknown>; signal: AbortSignal | null | undefined }>;
let providerReply: unknown;
let providerStatus: number;
let providerWait: Promise<void> | undefined;
let providerReached: (() => void) | undefined;
const input = () => ({ tenantId, workspaceId, runId, assetId, instruction, analysisVersion: "visual-analysis@1" });

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "kf-analysis-tests-"));
  process.env.ARTIFACT_STORAGE_ROOT = root;
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication();
  app.use(cookieParser());
  await app.init();
  prisma = app.get(PrismaService);
  references = new ReferenceAssetService(prisma, app.get<ArtifactStorage>(ARTIFACT_STORAGE));
  tenantId = (await prisma.tenant.create({ data: { name: `analysis-${randomUUID()}`, imageEgressAllowed: true } })).id;
  otherTenantId = (await prisma.tenant.create({ data: { name: `analysis-other-${randomUUID()}` } })).id;
  const user = await prisma.user.create({ data: { tenantId, username: "analysis", passwordHash: "session-only", role: "tenant_admin", mustChangePassword: false } });
  // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
  userId = user.id;
  // end
  const other = await prisma.user.create({ data: { tenantId: otherTenantId, username: "analysis", passwordHash: "session-only", role: "tenant_admin", mustChangePassword: false } });
  cookie = `${SESSION_COOKIE_NAME}=${(await app.get(SessionService).createSession(user.id)).token}`;
  otherCookie = `${SESSION_COOKIE_NAME}=${(await app.get(SessionService).createSession(other.id)).token}`;
  // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
  const member = await prisma.user.create({ data: { tenantId, username: "analysis-member", passwordHash: "session-only", role: "member", mustChangePassword: false } });
  memberCookie = `${SESSION_COOKIE_NAME}=${(await app.get(SessionService).createSession(member.id)).token}`;
  // end
  workspaceId = (await prisma.solutionWorkspace.create({ data: { tenantId, name: "visual-analysis" } })).id;
  const conversation = await prisma.conversation.create({ data: { tenantId, workspaceId, title: "analysis" } });
  // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
  conversationId = conversation.id;
  // end
  const image = await sharp({ create: { width: 400, height: 200, channels: 4, background: "#123456" } }).png().toBuffer();
  assetId = (await references.upload({ tenantId, workspaceId, stream: Readable.from([image]) })).id;
}, 30000);
beforeEach(async () => {
  // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
  runId = await newActiveRun();
  // end
  calls = []; providerReply = spec(); providerStatus = 200; providerWait = undefined; providerReached = undefined;
  instruction = `布局分析-${randomUUID()}`;
  vi.stubEnv("AGENT_ALLOWED_ORIGINS", origin);
  await prisma.tenant.update({ where: { id: tenantId }, data: { imageEgressAllowed: true } });
  const fetchImpl: typeof fetch = async (_url, options) => {
    if (typeof options?.body !== "string") throw new Error("expected a serialized provider request");
    calls.push({ body: JSON.parse(options.body) as Record<string, unknown>, signal: options.signal });
    providerReached?.();
    await providerWait;
    if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return new Response(JSON.stringify({ model: "vision-fixture", choices: [{ finish_reason: "stop", message: { content: JSON.stringify(providerReply) } }],
      usage: { prompt_tokens: 100, completion_tokens: 20, prompt_cache_hit_tokens: 40, prompt_cache_miss_tokens: 60 } }),
    { status: providerStatus, headers: { "content-type": "application/json" } });
  };
  // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
  providerFetch = fetchImpl;
  unscopedApi = new VisualAnalysisService(prisma, references, new ModelGatewayService(new ModelInvocationService(prisma), fetchImpl, "test-only-key"), route);
  // Real production services; only install the same execution scope the worker supplies.
  api = { analyze: (value, signal) => inRun(value, signal, () => unscopedApi.analyze(value, signal)),
    get: unscopedApi.get.bind(unscopedApi), revise: unscopedApi.revise.bind(unscopedApi) };
  // end
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => { await app?.close(); if (root) await rm(root, { recursive: true, force: true }); });

describe("persisted visual analysis with real pixels and gateway accounting", () => {
  it("sends verified pixels, freezes source facts and records real gateway usage without storing pixels/prompts", async () => {
    const result = await api.analyze(input(), new AbortController().signal);
    const image = await references.resolve(tenantId, workspaceId, assetId);
    expect(result.spec).toMatchObject({ sourceAssetId: assetId, sourceHash: image.sourceHash, viewport: { width: 400, height: 200 } });
    expect(result.specHash).toBe(canonicalServerHash(result.spec));
    expect(calls).toHaveLength(1);
    const messages = calls[0]!.body.messages as Array<{ role: string; content: unknown }>;
    const content = messages[1]!.content as Array<{ type: string; image_url?: { url: string } }>;
    expect(content[1]?.type).toBe("image_url");
    expect(Buffer.from(content[1]!.image_url!.url.split(",")[1]!, "base64")).toEqual(Buffer.from(image.bytes));
    const ledger = await prisma.modelInvocation.findFirstOrThrow({ where: { tenantId, runId, task: "vision", inputHash: { not: "" } }, orderBy: { startedAt: "desc" } });
    expect(ledger).toMatchObject({ status: "SUCCEEDED", inputTokens: 100, outputTokens: 20, cacheHitTokens: 40, costMicros: null });
    const stored = await prisma.visualReferenceAnalysis.findUniqueOrThrow({ where: { id: result.id } });
    expect(JSON.stringify(stored)).not.toContain("base64");
    expect(JSON.stringify(stored)).not.toContain(instruction);
    expect((await api.analyze(input(), new AbortController().signal))).toMatchObject({ id: result.id, reused: true });
    expect(calls).toHaveLength(1);
  });
  it("checks persisted tenant egress consent, scope and route before invoking a provider", async () => {
    await prisma.tenant.update({ where: { id: tenantId }, data: { imageEgressAllowed: false } });
    await expect(api.analyze(input(), new AbortController().signal)).rejects.toThrow("IMAGE_EGRESS_NOT_ALLOWED");
    await expect(api.analyze({ ...input(), tenantId: otherTenantId }, new AbortController().signal)).rejects.toThrow("run");
    expect(calls).toHaveLength(0);
    await prisma.tenant.update({ where: { id: tenantId }, data: { imageEgressAllowed: true } });
    const unsupported = new VisualAnalysisService(prisma, references, { completeJson: async () => { throw new Error("must not call"); } }, { ...route, supportsVision: false });
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    const signal = new AbortController().signal;
    await expect(inRun(input(), signal, () => unsupported.analyze(input(), signal))).rejects.toThrow("MODEL_CAPABILITY_UNSUPPORTED");
    // end
    expect(calls).toHaveLength(0);
  });
  it("uses a database lease so concurrent identical analyses cannot both send pixels", async () => {
    let release!: () => void;
    providerWait = new Promise(resolve => { release = resolve; });
    const reached = new Promise<void>(resolve => { providerReached = resolve; });
    const first = api.analyze(input(), new AbortController().signal);
    try {
      await reached;
      await expect(api.analyze(input(), new AbortController().signal)).rejects.toThrow("VISUAL_ANALYSIS_IN_PROGRESS");
      expect(calls).toHaveLength(1);
    } finally { release(); }
    const result = await first;
    expect((await api.analyze(input(), new AbortController().signal)).id).toBe(result.id);
  });
  it("expires caches and isolates instructions/model configuration without overwriting old valid analyses", async () => {
    const first = await api.analyze(input(), new AbortController().signal);
    await prisma.visualReferenceAnalysis.update({ where: { id: first.id }, data: { expiresAt: new Date(0) } });
    const second = await api.analyze(input(), new AbortController().signal);
    expect(second.id).not.toBe(first.id);
    expect((await prisma.visualReferenceAnalysis.findUniqueOrThrow({ where: { id: first.id } })).specHash).toBe(first.specHash);
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    await api.analyze({ ...input(), runId: await newActiveRun(), instruction: "另一个布局" }, new AbortController().signal);
    // end
    expect(calls).toHaveLength(3);
  });
  it("rejects a corrupted cache pointer instead of returning another instruction's valid analysis", async () => {
    const first = await api.analyze(input(), new AbortController().signal);
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    const second = await api.analyze({ ...input(), runId: await newActiveRun(), instruction: "another instruction" }, new AbortController().signal);
    // end
    await prisma.visualAnalysisCacheEntry.updateMany({ where: { tenantId, analysisId: first.id }, data: { analysisId: second.id } });
    await expect(api.analyze(input(), new AbortController().signal)).rejects.toThrow("VISUAL_ANALYSIS_INTEGRITY_FAILED");
    expect(calls).toHaveLength(2);
  });
  it("cannot publish after losing its cache lease or release a replacement owner's lease", async () => {
    let release!: () => void;
    providerWait = new Promise(resolve => { release = resolve; });
    const reached = new Promise<void>(resolve => { providerReached = resolve; });
    const pending = api.analyze(input(), new AbortController().signal);
    await reached;
    const cache = await prisma.visualAnalysisCacheEntry.findFirstOrThrow({ where: { tenantId, workspaceId, leaseOwner: { not: null } } });
    await prisma.visualAnalysisCacheEntry.update({ where: { cacheKey: cache.cacheKey }, data: { leaseOwner: "replacement-owner", leaseExpiresAt: new Date(Date.now() + 30000) } });
    release();
    await expect(pending).rejects.toThrow("VISUAL_ANALYSIS_LEASE_LOST");
    expect(await prisma.visualReferenceAnalysis.count({ where: { tenantId, instructionHash: canonicalServerHash(instruction) } })).toBe(0);
    expect((await prisma.visualAnalysisCacheEntry.findUniqueOrThrow({ where: { cacheKey: cache.cacheKey } })).leaseOwner).toBe("replacement-owner");
  });
  it("rejects unsafe or malformed model output, does not cache failure, and releases the lease for explicit retry", async () => {
    for (const bad of [{ ...spec(), sourceAssetId: "https://attacker.invalid/file.png" }, { ...spec(), nativePath: "../project.json" },
      { ...spec(), regions: [{ ...spec().regions[0], box: { x: 0.8, y: 0, width: 0.5, height: 1 } }] }]) {
      providerReply = bad;
      await expect(api.analyze(input(), new AbortController().signal)).rejects.toThrow("VISUAL_ANALYSIS_INVALID");
    }
    expect(await prisma.visualReferenceAnalysis.count({ where: { tenantId, instructionHash: canonicalServerHash(instruction) } })).toBe(0);
    providerReply = spec();
    expect((await api.analyze(input(), new AbortController().signal)).reused).toBe(false);
    expect(calls).toHaveLength(4); // no hidden repair/retry loop
  });
  it("cancels without publishing a valid analysis and records a cancelled invocation", async () => {
    let release!: () => void;
    providerWait = new Promise(resolve => { release = resolve; });
    const reached = new Promise<void>(resolve => { providerReached = resolve; });
    const controller = new AbortController();
    const pending = api.analyze(input(), controller.signal);
    await reached; controller.abort(); release();
    await expect(pending).rejects.toThrow("MODEL_CANCELLED");
    expect(await prisma.visualReferenceAnalysis.count({ where: { tenantId, instructionHash: canonicalServerHash(instruction) } })).toBe(0);
    expect(await prisma.modelInvocation.count({ where: { tenantId, runId, task: "vision", status: "CANCELLED" } })).toBeGreaterThan(0);
  });
  it("stores user corrections as an immutable child and rejects frozen source changes or stale concurrent edits", async () => {
    const first = await api.analyze(input(), new AbortController().signal);
    const updated = { ...first.spec, regions: first.spec.regions.map(region => ({ ...region, text: ["修正后的标题"] })) };
    const revised = await api.revise(tenantId, first.id, first.specHash, updated);
    expect(revised.id).not.toBe(first.id);
    expect(revised.spec.regions[0]?.text).toEqual(["修正后的标题"]);
    expect((await api.get(tenantId, first.id)).spec).toEqual(first.spec);
    await expect(api.revise(tenantId, first.id, first.specHash, updated)).rejects.toThrow("VISUAL_ANALYSIS_STALE");
    await expect(api.revise(tenantId, revised.id, revised.specHash, { ...updated, sourceHash: "0".repeat(64) })).rejects.toThrow("VISUAL_SOURCE_IMMUTABLE");
    await expect(api.get(otherTenantId, first.id)).rejects.toThrow("visual analysis");
  });
  it("permits only one child when two corrections race against the same original version", async () => {
    const first = await api.analyze(input(), new AbortController().signal);
    const results = await Promise.allSettled(["A", "B"].map(text => api.revise(tenantId, first.id, first.specHash,
      { ...first.spec, regions: first.spec.regions.map(region => ({ ...region, text: [text] })) })));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(await prisma.visualReferenceAnalysis.count({ where: { parentId: first.id } })).toBe(1);
  });
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  it("keeps authenticated private GET but retires the unscoped analysis mutation route", async () => {
    const first = await api.analyze(input(), new AbortController().signal);
    const url = `/api/v2/visual-analyses/${first.id}`;
    await request(app.getHttpServer()).get(url).expect(401);
    await request(app.getHttpServer()).get(url).set("Cookie", otherCookie).expect(404);
    const response = await request(app.getHttpServer()).get(url).set("Cookie", cookie).expect(200);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(JSON.stringify(response.body)).not.toMatch(/storageKey|base64|local-provider/);
    await request(app.getHttpServer()).patch(url).set("Cookie", cookie).send({ expectedHash: first.specHash, spec: first.spec }).expect(404);
    await request(app.getHttpServer()).patch(url).set("Cookie", cookie).set("Origin", origin).send({ expectedHash: first.specHash, spec: first.spec, route }).expect(404);
    await request(app.getHttpServer()).patch(url).set("Cookie", cookie).set("Origin", origin).send({ expectedHash: first.specHash, spec: first.spec }).expect(404);
    expect(await prisma.visualReferenceAnalysis.count({ where: { parentId: first.id } })).toBe(0);
    await request(app.getHttpServer()).post("/api/v2/visual-analyses").set("Cookie", cookie).set("Origin", origin).send(input()).expect(404);
  });
  it("does not allow old large full-spec payloads to bypass run-scoped review editing", async () => {
    const base = spec();
    providerReply = { ...base, regions: Array.from({ length: 18 }, (_, index) => ({ ...base.regions[0], id: `region-${index}`, text: ["x".repeat(1800), "y".repeat(1800)] })) };
    const first = await api.analyze(input(), new AbortController().signal);
    const body = { expectedHash: first.specHash, spec: first.spec };
    expect(Buffer.byteLength(JSON.stringify(body))).toBeGreaterThan(64 * 1024);
    await request(app.getHttpServer()).patch(`/api/v2/visual-analyses/${first.id}`).set("Cookie", cookie).set("Origin", origin).send(body).expect(404);
    expect(await prisma.visualReferenceAnalysis.count({ where: { parentId: first.id } })).toBe(0);
  });
  // end
  it("deletes populated analysis caches and immutable versions with their workspace", async () => {
    const workspace = await prisma.solutionWorkspace.create({ data: { tenantId, name: randomUUID() } });
    const conversation = await prisma.conversation.create({ data: { tenantId, workspaceId: workspace.id, title: "cleanup" } });
    const owner = await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } });
    const run = await prisma.agentRun.create({ data: { tenantId, workspaceId: workspace.id, conversationId: conversation.id,
      // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
      requestedByUserId: owner.requestedByUserId, clientRequestId: randomUUID(), requestHash: "cleanup-only", mode: "plan", action: {}, inputSnapshot: {}, status: "RUNNING",
      leaseOwner: analysisOwner, fence: 1, leaseExpiresAt: new Date(Date.now() + 60000) } });
      // end
    const image = await references.resolve(tenantId, workspaceId, assetId);
    const asset = await references.upload({ tenantId, workspaceId: workspace.id, stream: Readable.from([image.bytes]) });
    const analysis = await api.analyze({ ...input(), workspaceId: workspace.id, runId: run.id, assetId: asset.id }, new AbortController().signal);
    await api.revise(tenantId, analysis.id, analysis.specHash, analysis.spec);
    expect(await prisma.visualReferenceAnalysis.count({ where: { workspaceId: workspace.id } })).toBe(2);
    await expect(app.get(WorkspaceService).deleteWorkspace(tenantId, workspace.id)).rejects.toThrow("WORKSPACE_ACTIVE_RUNS");
    expect(await prisma.visualReferenceAnalysis.count({ where: { workspaceId: workspace.id } })).toBe(2);
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", finishedAt: new Date() } });
    const build = await prisma.buildJob.create({ data: { tenantId, workspaceId: workspace.id, baseRevisionId: "cleanup-base", changePlanId: "cleanup-plan",
      planHash: "cleanup-hash", domainKind: "kingclient", idempotencyKey: randomUUID(), status: "RUNNING" } });
    await expect(app.get(WorkspaceService).deleteWorkspace(tenantId, workspace.id)).rejects.toThrow("WORKSPACE_ACTIVE_BUILDS");
    await prisma.buildJob.update({ where: { id: build.id }, data: { status: "FAILED" } });
    await app.get(WorkspaceService).deleteWorkspace(tenantId, workspace.id);
    expect(await prisma.visualReferenceAnalysis.count({ where: { workspaceId: workspace.id } })).toBe(0);
    expect(await prisma.visualAnalysisCacheEntry.count({ where: { workspaceId: workspace.id } })).toBe(0);
    const invocations = await prisma.modelInvocation.findMany({ where: { tenantId, workspaceId: workspace.id } });
    expect(invocations).toHaveLength(1);
    expect(invocations[0]?.runId).toBeNull();
    await expect(references.resolve(tenantId, workspace.id, asset.id)).rejects.toThrow("workspace");
  });
});
// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
describe("visual analysis Run authority and pinned inputs", () => {
  // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
  it("refuses the staged visual protocol without an admission-time input and user sending consent", async () => {
    await prisma.agentRun.update({ where: { id: runId }, data: { configSnapshot: { schemaVersion: 1, planVersion: "run-plan@7" } } });
    await expect(api.analyze(input(), new AbortController().signal)).rejects.toThrow("VISUAL_RUN_INPUT_REQUIRED");
    expect(calls).toHaveLength(0);
    expect(await prisma.modelInvocation.count({ where: { runId } })).toBe(0);
  });
  it("does not silently downgrade a corrupt admission snapshot to the legacy internal analysis path", async () => {
    await prisma.agentRun.update({ where: { id: runId }, data: { inputSnapshot: { visualAdmission: { forged: true } } } });
    await expect(api.analyze(input(), new AbortController().signal)).rejects.toThrow("VISUAL_RUN_INPUT_INVALID");
    expect(calls).toHaveLength(0);
  });
  // end
  it("refuses an unscoped internal invocation before image egress", async () => {
    await expect(unscopedApi.analyze(input(), new AbortController().signal)).rejects.toThrow("VISUAL_RUN_REQUIRED");
    expect(calls).toHaveLength(0);
    expect(await prisma.modelInvocation.count({ where: { runId } })).toBe(0);
  });
  it("refuses a detached call after its server execution scope has closed", async () => {
    const signal = new AbortController().signal;
    let delayed!: () => Promise<unknown>;
    await inRun(input(), signal, async () => { delayed = AsyncResource.bind(() => unscopedApi.analyze(input(), signal)); });
    await expect(delayed()).rejects.toThrow("RUN_EXECUTION_SCOPE_CLOSED");
    expect(calls).toHaveLength(0);
  });
  it("refuses stale fences, expired leases and cancelled execution before model calls", async () => {
    const signal = new AbortController().signal;
    await expect(inRun(input(), signal, () => unscopedApi.analyze(input(), signal), 0)).rejects.toThrow("VISUAL_RUN_NOT_ACTIVE");
    await prisma.agentRun.update({ where: { id: runId }, data: { leaseExpiresAt: new Date(0) } });
    await expect(api.analyze(input(), signal)).rejects.toThrow("VISUAL_RUN_NOT_ACTIVE");
    await prisma.agentRun.update({ where: { id: runId }, data: { leaseExpiresAt: new Date(Date.now() + 60000), cancelRequestedAt: new Date() } });
    await expect(api.analyze(input(), signal)).rejects.toThrow("VISUAL_RUN_NOT_ACTIVE");
    expect(calls).toHaveLength(0);
  });
  it("pins model/prompt and exact image/instruction identities without storing private request data", async () => {
    await api.analyze(input(), new AbortController().signal);
    const config = await prisma.agentRunStep.findFirstOrThrow({ where: { runId, stepKey: "visual-analysis-config-v1" } });
    expect(JSON.parse(config.outputRef!)).toMatchObject({ schema: "kf-visual-analysis-config/v1", tenantId, workspaceId, runId, analysisVersion: "visual-analysis@1" });
    const image = await prisma.agentRunStep.findFirstOrThrow({ where: { runId, stepKey: { startsWith: "visual-analysis-image-" } } });
    expect(JSON.parse(image.outputRef!)).toMatchObject({ schema: "kf-visual-analysis-image/v1", assetId, instructionHash: canonicalServerHash(instruction) });
    expect(config.inputHash).toBe(canonicalServerHash(JSON.parse(config.outputRef!)));
    expect(`${config.outputRef}${image.outputRef}`).not.toMatch(/base64|storageKey|test-only-key|local-provider/);
    expect(image.outputRef).not.toContain(instruction);
    const changed = new VisualAnalysisService(prisma, references, new ModelGatewayService(new ModelInvocationService(prisma), providerFetch, "test-only-key"), { ...route, model: "changed-model" });
    const signal = new AbortController().signal;
    await expect(inRun(input(), signal, () => changed.analyze(input(), signal))).rejects.toThrow("VISUAL_MODEL_CONFIG_CHANGED");
    await expect(api.analyze({ ...input(), instruction: "未冻结的新要求" }, signal)).rejects.toThrow("VISUAL_REFERENCE_INPUT_CHANGED");
    expect((await api.analyze(input(), signal)).reused).toBe(true);
    expect(calls).toHaveLength(1);
  });
  it("does not publish a late response after a replacement execution fence takes over", async () => {
    let release!: () => void;
    providerWait = new Promise(resolve => { release = resolve; });
    const reached = new Promise<void>(resolve => { providerReached = resolve; });
    const pending = api.analyze(input(), new AbortController().signal);
    await reached;
    const image = await references.resolve(tenantId, workspaceId, assetId);
    // Locate this call's lease; the assertion below checks cleanup, not cache-key generation.
    const cacheKey = visualAnalysisCacheKey({ tenantId, workspaceId, assetId, sourceHash: image.sourceHash, derivativeHash: image.derivativeHash,
      instructionHash: canonicalServerHash(instruction), analysisVersion: "visual-analysis@1", modelConfigHash: visualModelConfigHash(route) });
    await prisma.agentRun.update({ where: { id: runId }, data: { fence: 2, leaseOwner: "replacement" } });
    release();
    await expect(pending).rejects.toThrow("VISUAL_RUN_NOT_ACTIVE");
    expect(await prisma.visualReferenceAnalysis.count({ where: { tenantId, instructionHash: canonicalServerHash(instruction) } })).toBe(0);
    expect(await prisma.modelInvocation.findFirstOrThrow({ where: { runId } })).toMatchObject({ status: "SUCCEEDED" });
    expect(await prisma.visualAnalysisCacheEntry.findUniqueOrThrow({ where: { cacheKey } })).toMatchObject({ leaseOwner: null, analysisId: null });
  });
  it("refuses publication when the frozen Run configuration changes during the provider call", async () => {
    let release!: () => void;
    providerWait = new Promise(resolve => { release = resolve; });
    const reached = new Promise<void>(resolve => { providerReached = resolve; });
    const pending = api.analyze(input(), new AbortController().signal);
    await reached;
    await prisma.agentRun.update({ where: { id: runId }, data: { configSnapshot: { changed: true } } });
    release();
    await expect(pending).rejects.toThrow("VISUAL_MODEL_CONFIG_CHANGED");
    expect(await prisma.visualReferenceAnalysis.count({ where: { tenantId, instructionHash: canonicalServerHash(instruction) } })).toBe(0);
    expect(calls).toHaveLength(1);
  });
  it("rejects a corrupt pinned snapshot instead of silently replacing it on a cache hit", async () => {
    await api.analyze(input(), new AbortController().signal);
    const stored = await prisma.agentRunStep.findFirstOrThrow({ where: { runId, stepKey: "visual-analysis-config-v1" } });
    await prisma.agentRunStep.update({ where: { id: stored.id }, data: { outputRef: "{}" } });
    await expect(api.analyze(input(), new AbortController().signal)).rejects.toThrow("VISUAL_ANALYSIS_INPUT_CORRUPT");
    expect((await prisma.agentRunStep.findUniqueOrThrow({ where: { id: stored.id } })).outputRef).toBe("{}");
    expect(calls).toHaveLength(1);
  });
});

describe("tenant visual egress administrator policy", () => {
  const url = "/api/v2/tenant/visual-egress-policy";
  it("is authenticated, private, tenant-scoped and readable by members without exposing provider configuration", async () => {
    await request(app.getHttpServer()).get(url).expect(401);
    const response = await request(app.getHttpServer()).get(url).set("Cookie", memberCookie).expect(200);
    expect(response.body).toEqual({ schemaVersion: 1, imageEgressAllowed: true, coverage: "reference-images-and-derived-structure" });
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.headers.vary).toContain("Cookie");
    const other = await request(app.getHttpServer()).get(url).set("Cookie", otherCookie).expect(200);
    expect(other.body.imageEgressAllowed).toBe(false);
    expect(JSON.stringify(response.body)).not.toMatch(/baseUrl|model|key|tenantId/);
  });
  it("requires a current tenant administrator and valid Origin before policy changes", async () => {
    await request(app.getHttpServer()).patch(url).send({ imageEgressAllowed: false }).expect(401);
    await request(app.getHttpServer()).patch(url).set("Cookie", cookie).send({ imageEgressAllowed: false }).expect(403);
    await request(app.getHttpServer()).patch(url).set("Cookie", memberCookie).set("Origin", origin).send({ imageEgressAllowed: false }).expect(403);
    await request(app.getHttpServer()).patch(url).set("Cookie", cookie).set("Origin", "https://attacker.invalid").send({ imageEgressAllowed: false }).expect(403);
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })).imageEgressAllowed).toBe(true);
  });
  it("enforces current tenant administrator authority for internal callers too", async () => {
    const member = await prisma.user.findFirstOrThrow({ where: { tenantId, role: "member" } });
    const other = await prisma.user.findFirstOrThrow({ where: { tenantId: otherTenantId, role: "tenant_admin" } });
    await expect(app.get(VisualEgressPolicyService).update(tenantId, member.id, false)).rejects.toThrow("VISUAL_EGRESS_ADMIN_REQUIRED");
    await expect(app.get(VisualEgressPolicyService).update(tenantId, other.id, false)).rejects.toThrow("VISUAL_EGRESS_ADMIN_REQUIRED");
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })).imageEgressAllowed).toBe(true);
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: otherTenantId } })).imageEgressAllowed).toBe(false);
  });
  it("rejects forged scope/permissions and nonboolean policies without mutation", async () => {
    for (const body of [{ imageEgressAllowed: "false" }, { imageEgressAllowed: 1 }, {}, { imageEgressAllowed: false, tenantId: otherTenantId },
      { imageEgressAllowed: true, flags: { vision: true } }]) {
      await request(app.getHttpServer()).patch(url).set("Cookie", cookie).set("Origin", origin).send(body).expect(400);
    }
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: otherTenantId } })).imageEgressAllowed).toBe(false);
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })).imageEgressAllowed).toBe(true);
  });
  it("audits actual changes atomically and leaves feature activation independent from administrative permission", async () => {
    const before = await prisma.auditLog.count({ where: { tenantId, action: "VISUAL_EGRESS_POLICY_CHANGED" } });
    await request(app.getHttpServer()).patch(url).set("Cookie", cookie).set("Origin", origin).send({ imageEgressAllowed: false }).expect(200);
    await request(app.getHttpServer()).patch(url).set("Cookie", cookie).set("Origin", origin).send({ imageEgressAllowed: false }).expect(200);
    expect(await prisma.auditLog.count({ where: { tenantId, action: "VISUAL_EGRESS_POLICY_CHANGED" } })).toBe(before + 1);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { tenantId, action: "VISUAL_EGRESS_POLICY_CHANGED" }, orderBy: { createdAt: "desc" } });
    expect(audit).toMatchObject({ actorUserId: userId, resourceType: "TENANT", resourceId: tenantId,
      detail: { previousAllowed: true, imageEgressAllowed: false, coverage: "reference-images-and-derived-structure" } });
    await request(app.getHttpServer()).patch(url).set("Cookie", cookie).set("Origin", origin).send({ imageEgressAllowed: true }).expect(200);
    const config = await request(app.getHttpServer()).get("/api/v2/workbench-config").set("Cookie", cookie).expect(200);
    expect(config.body).toMatchObject({ flags: { agentVisionV1: false }, outboundImagesAllowed: false });
    await request(app.getHttpServer()).post("/api/v2/visual-analyses").set("Cookie", cookie).set("Origin", origin).send(input()).expect(404);
  });
});
// end
// end
