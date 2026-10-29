// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import "reflect-metadata";
import { assertSafeTestDatabase } from "../../../../tests/helpers/database-safety.js";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
assertSafeTestDatabase({ url: process.env.DATABASE_URL, allowReset: process.env.KF_TEST_ALLOW_DESTRUCTIVE_RESET, expectedPrefix: "kf_agent_test_" });
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { LocalArtifactStorage } from "@kf/artifact-storage";
import { canonicalServerHash, type ModelRoute } from "@kf/contracts";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service.js";
import { ReferenceAssetService } from "./reference-asset.service.js";
import { VisualRunAdmissionService, readVisualRunAdmission } from "./visual-run-admission.js";
import { withAgentRunExecution } from "@kf/build-jobs";
import { VisualAnalysisService } from "./visual-analysis.service.js";
import { ModelGatewayService } from "../models/model-gateway.js";
import { ModelInvocationService } from "../models/model-invocation.service.js";
import { VisualReviewService } from "./visual-review.service.js";

const route: ModelRoute = { provider: "deepseek", baseUrl: "https://fixture.invalid/v1", model: "vision-fixture", supportsVision: true,
  supportsJson: true, supportsThinking: false, timeoutMs: 1000, maxContextTokens: 64000, pricingVersion: null };
let prisma: PrismaService;
let api: VisualRunAdmissionService;
let references: ReferenceAssetService;
let root: string;
let tenantId: string;
let userId: string;
let workspaceId: string;
let conversationId: string;
let baseRevisionId: string;
let runId: string;
let assetIds: string[];
const scope = () => ({ tenantId, workspaceId, conversationId, userId });
const request = () => ({ attachmentIds: assetIds, primaryAssetId: assetIds[0],
  sendingConsent: { noticeVersion: "visual-egress@1", accepted: true } });
const freeze = (body: unknown = request()) => prisma.$transaction(tx => api.freezeInTransaction(tx, scope(), runId, body));
const stored = () => prisma.agentRun.findUniqueOrThrow({ where: { id: runId } });
const fenced = <T>(work: () => Promise<T>) => withAgentRunExecution({ tenantId, runId, ownerId: "admission-worker", fence: 1,
  signal: new AbortController().signal }, work);
async function startFrozenAnalysis(fetchImpl: typeof fetch) {
  await freeze();
  await prisma.agentRun.update({ where: { id: runId }, data: { status: "RUNNING", startedAt: new Date(),
    leaseOwner: "admission-worker", fence: 1, leaseExpiresAt: new Date(Date.now() + 60000) } });
  const analysis = new VisualAnalysisService(prisma, references, new ModelGatewayService(new ModelInvocationService(prisma), fetchImpl, "fixture-key"),
    { ...route, model: "changed-environment", baseUrl: "https://new-environment.invalid", supportsVision: false });
  const run = await stored();
  const input = { tenantId, workspaceId, runId, assetId: assetIds[0]!, instruction: (run.action as { text: string }).text, analysisVersion: "visual-analysis@1" };
  return { analysis, input };
}
function response() {
  return new Response(JSON.stringify({ model: "vision-fixture", choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
    schemaVersion: 1, sourceAssetId: "image", sourceHash: "0".repeat(64), viewport: { width: 1, height: 1 },
    regions: [{ id: "heading", parentId: null, role: "text", box: { x: 0, y: 0, width: 1, height: 1 }, text: ["标题"], confidence: 0.9, interactionHint: null }],
    designTokens: { background: "#fff", foreground: "#111", accent: "#123456", spacing: [8], radius: [4] }, uncertainties: [],
  }) } }], usage: { prompt_tokens: 100, completion_tokens: 20 } }), { headers: { "content-type": "application/json" } });
}

beforeAll(async () => {
  prisma = new PrismaService(); await prisma.$connect(); api = new VisualRunAdmissionService(route);
  root = await mkdtemp(path.join(tmpdir(), "kf-visual-admission-"));
  references = new ReferenceAssetService(prisma, new LocalArtifactStorage(root));
  tenantId = (await prisma.tenant.create({ data: { name: `admission-${randomUUID()}`, imageEgressAllowed: true } })).id;
  userId = (await prisma.user.create({ data: { tenantId, username: "admission", passwordHash: "fixture-only", role: "member" } })).id;
});
beforeEach(async () => {
  await prisma.tenant.update({ where: { id: tenantId }, data: { imageEgressAllowed: true } });
  workspaceId = (await prisma.solutionWorkspace.create({ data: { tenantId, name: randomUUID(), generationWorkflow: "creative-v2" } })).id;
  baseRevisionId = (await prisma.solutionRevision.create({ data: { tenantId, workspaceId, kind: "initial" } })).id;
  await prisma.solutionWorkspace.update({ where: { id: workspaceId }, data: { currentRevisionId: baseRevisionId } });
  conversationId = (await prisma.conversation.create({ data: { tenantId, workspaceId, title: "admission" } })).id;
  assetIds = [];
  for (const color of ["#123456", "#456789"]) {
    const bytes = await sharp({ create: { width: 400, height: 200, channels: 4, background: color } }).png().toBuffer();
    assetIds.push((await references.upload({ tenantId, workspaceId, stream: Readable.from([bytes]) })).id);
  }
  runId = (await prisma.agentRun.create({ data: { tenantId, workspaceId, conversationId, requestedByUserId: userId,
    clientRequestId: randomUUID(), requestHash: "fixture", mode: "build", action: { type: "message", text: "按照主图，补充图仅参考颜色" },
    baseRevisionId, configSnapshot: { schemaVersion: 1, planVersion: "run-plan@7" },
    inputSnapshot: { attachmentIds: assetIds, baseRevisionPolicy: "fixed" } } })).id;
});
afterAll(async () => { await prisma?.$disconnect(); if (root) await rm(root, { recursive: true, force: true }); });
afterEach(async () => {
  await prisma.agentRun.updateMany({ where: { tenantId, workspaceId, status: { notIn: ["SUCCEEDED", "FAILED", "CANCELLED"] } },
    data: { status: "CANCELLED", finishedAt: new Date(), leaseOwner: null, leaseExpiresAt: null } });
});

describe("transactional visual Run admission input (internal, public entry remains disabled)", () => {
  it("freezes verified primary/supplementary sources, server model settings and actor-specific consent together", async () => {
    const snapshot = await freeze();
    expect(snapshot.content).toMatchObject({ tenantId, workspaceId, conversationId, runId, requestedByUserId: userId, baseRevisionId,
      attachments: [{ assetId: assetIds[0], role: "primary" }, { assetId: assetIds[1], role: "supplement" }],
      sendingConsent: { userId, noticeVersion: "visual-egress@1", coverage: "reference-images-and-derived-structure" },
      analysisModel: { route: { model: "vision-fixture" } } });
    expect(snapshot.inputHash).toBe(canonicalServerHash(snapshot.content));
    for (const attachment of snapshot.content.attachments) {
      const image = await references.resolve(tenantId, workspaceId, attachment.assetId);
      expect(attachment).toMatchObject({ sourceHash: image.sourceHash,
        derivative: { hash: image.derivativeHash, width: 400, height: 200, scale: 1, mimeType: "image/webp" } });
    }
    expect((await stored()).inputSnapshot).toMatchObject({ visualAdmission: snapshot });
    expect(await prisma.agentRunStep.count({ where: { runId, stepKey: "visual-run-admission-v1" } })).toBe(1);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { resourceId: runId, action: "VISUAL_INPUT_FROZEN" } });
    expect(audit).toMatchObject({ actorUserId: userId, detail: { attachmentCount: 2, primaryAssetId: assetIds[0], inputHash: snapshot.inputHash } });
    expect(JSON.stringify(audit.detail)).not.toMatch(/fixture.invalid|按照主图|storageKey|base64/);
    expect(JSON.stringify(snapshot)).not.toMatch(/storageKey|base64|apiKey|按照主图/);
    expect(await prisma.$transaction(async tx => readVisualRunAdmission(tx, await stored()))).toEqual(snapshot);
  });
  it("deduplicates concurrent identical freezes and never replaces consent time, snapshot or audit", async () => {
    const results = await Promise.all([freeze(), freeze()]);
    expect(results[0]).toEqual(results[1]);
    expect(await prisma.auditLog.count({ where: { resourceId: runId, action: "VISUAL_INPUT_FROZEN" } })).toBe(1);
    expect(await prisma.agentRunStep.count({ where: { runId, stepKey: "visual-run-admission-v1" } })).toBe(1);
  });
  it("rejects missing consent, forged provider/native fields, duplicated or unselected primary images before writing", async () => {
    const valid = request();
    for (const body of [{ ...valid, sendingConsent: undefined }, { ...valid, sendingConsent: { noticeVersion: "visual-egress@1", accepted: false } },
      { ...valid, sendingConsent: { noticeVersion: "old", accepted: true } }, { ...valid, route }, { ...valid, primaryAssetId: randomUUID() },
      { ...valid, attachmentIds: [assetIds[0], assetIds[0]] }, { ...valid, attachmentIds: [] },
      { ...valid, attachmentIds: Array.from({ length: 4 }, () => randomUUID()) }, { ...valid, sourceHash: "a".repeat(64) }]) {
      await expect(freeze(body)).rejects.toThrow("VISUAL_ADMISSION_INVALID");
    }
    expect(await prisma.agentRunStep.count({ where: { runId } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { resourceId: runId } })).toBe(0);
  });
  it("requires the actual requesting actor, conversation scope, current base and creative workflow", async () => {
    const another = await prisma.user.create({ data: { tenantId, username: randomUUID(), passwordHash: "fixture-only", role: "member" } });
    await expect(prisma.$transaction(tx => api.freezeInTransaction(tx, { ...scope(), userId: another.id }, runId, request())))
      .rejects.toThrow("VISUAL_ADMISSION_NOT_FOUND");
    await expect(prisma.$transaction(tx => api.freezeInTransaction(tx, { ...scope(), conversationId: randomUUID() }, runId, request())))
      .rejects.toThrow("VISUAL_ADMISSION_NOT_FOUND");
    await prisma.solutionWorkspace.update({ where: { id: workspaceId }, data: { currentRevisionId: null } });
    await expect(freeze()).rejects.toThrow("VISUAL_ADMISSION_BASE_CHANGED");
    await prisma.solutionWorkspace.update({ where: { id: workspaceId }, data: { currentRevisionId: baseRevisionId, generationWorkflow: "legacy" } });
    await expect(freeze()).rejects.toThrow("VISUAL_ADMISSION_WORKFLOW_INVALID");
  });
  it("does not accept assets outside the Run workspace or missing/mismatched derivative metadata", async () => {
    const otherWorkspace = await prisma.solutionWorkspace.create({ data: { tenantId, name: randomUUID() } });
    await prisma.agentRun.update({ where: { id: runId }, data: { inputSnapshot: { attachmentIds: [randomUUID()], baseRevisionPolicy: "fixed" } } });
    await expect(freeze({ ...request(), attachmentIds: [randomUUID()] })).rejects.toThrow();
    await prisma.agentRun.update({ where: { id: runId }, data: { inputSnapshot: { attachmentIds: assetIds, baseRevisionPolicy: "fixed" } } });
    // A real reference in a different workspace cannot be pulled in by its opaque ID.
    const original = await references.resolve(tenantId, workspaceId, assetIds[0]!);
    const foreign = await references.upload({ tenantId, workspaceId: otherWorkspace.id, stream: Readable.from([original.bytes]) });
    const foreignBody = { ...request(), attachmentIds: [foreign.id], primaryAssetId: foreign.id };
    await prisma.agentRun.update({ where: { id: runId }, data: { inputSnapshot: { attachmentIds: [foreign.id], baseRevisionPolicy: "fixed" } } });
    await expect(freeze(foreignBody)).rejects.toThrow("VISUAL_REFERENCE_NOT_FOUND");
    await prisma.agentRun.update({ where: { id: runId }, data: { inputSnapshot: { attachmentIds: assetIds, baseRevisionPolicy: "fixed" } } });
    await prisma.referenceAssetDerivative.update({ where: { assetId: assetIds[0]! }, data: { transform: {} } });
    await expect(freeze()).rejects.toThrow("VISUAL_REFERENCE_INPUT_INVALID");
    expect(await prisma.auditLog.count({ where: { resourceId: runId } })).toBe(0);
  });
  it("rejects disabled tenant policy, wrong protocol, started runs and unfixed queued baselines", async () => {
    await prisma.tenant.update({ where: { id: tenantId }, data: { imageEgressAllowed: false } });
    await expect(freeze()).rejects.toThrow("IMAGE_EGRESS_NOT_ALLOWED");
    await prisma.tenant.update({ where: { id: tenantId }, data: { imageEgressAllowed: true } });
    await prisma.agentRun.update({ where: { id: runId }, data: { configSnapshot: { schemaVersion: 1, planVersion: "run-plan@6" } } });
    await expect(freeze()).rejects.toThrow("VISUAL_ADMISSION_PROTOCOL_INVALID");
    await prisma.agentRun.update({ where: { id: runId }, data: { configSnapshot: { schemaVersion: 1, planVersion: "run-plan@7" }, status: "RUNNING" } });
    await expect(freeze()).rejects.toThrow("VISUAL_ADMISSION_NOT_QUEUED");
    await prisma.agentRun.update({ where: { id: runId }, data: { status: "QUEUED", inputSnapshot: { attachmentIds: assetIds, baseRevisionPolicy: "follow-predecessor" } } });
    await expect(freeze()).rejects.toThrow("VISUAL_ADMISSION_INPUT_MISMATCH");
  });
  it("never overwrites a frozen choice or accepts a second server route for the same input", async () => {
    const first = await freeze();
    await expect(freeze({ ...request(), primaryAssetId: assetIds[1] })).rejects.toThrow("VISUAL_ADMISSION_INPUT_CHANGED");
    const changed = new VisualRunAdmissionService({ ...route, model: "changed-server-model" });
    await expect(prisma.$transaction(tx => changed.freezeInTransaction(tx, scope(), runId, request())))
      .rejects.toThrow("VISUAL_ADMISSION_INPUT_CHANGED");
    expect((await stored()).inputSnapshot).toMatchObject({ visualAdmission: first });
  });
  it("rejects malformed, credential-bearing or nonvision server routes without freezing input", async () => {
    for (const override of [{ baseUrl: "not-a-url" }, { baseUrl: "http://fixture.invalid" }, { baseUrl: "https://user:secret@fixture.invalid" },
      { baseUrl: "https://fixture.invalid?key=secret" }, { supportsVision: false }, { timeoutMs: 120001 }]) {
      const invalid = new VisualRunAdmissionService({ ...route, ...override });
      await expect(prisma.$transaction(tx => invalid.freezeInTransaction(tx, scope(), runId, request())))
        .rejects.toThrow("VISUAL_ADMISSION_MODEL_INVALID");
    }
    expect(await prisma.agentRunStep.count({ where: { runId } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { resourceId: runId } })).toBe(0);
  });
  it("rolls all admission writes back with its caller's Run creation transaction", async () => {
    const newRunId = randomUUID();
    await expect(prisma.$transaction(async tx => {
      const original = await stored();
      await tx.agentRun.create({ data: { id: newRunId, tenantId, workspaceId, conversationId, requestedByUserId: userId,
        clientRequestId: randomUUID(), requestHash: "rollback", mode: original.mode, action: original.action!,
        configSnapshot: original.configSnapshot!, baseRevisionId, inputSnapshot: { attachmentIds: assetIds, baseRevisionPolicy: "fixed" } } });
      await api.freezeInTransaction(tx, scope(), newRunId, request());
      throw new Error("CALLER_ROLLBACK");
    })).rejects.toThrow("CALLER_ROLLBACK");
    expect(await prisma.agentRun.count({ where: { id: newRunId } })).toBe(0);
    expect(await prisma.agentRunStep.count({ where: { runId: newRunId } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { resourceId: newRunId } })).toBe(0);
  });
  it("fails closed on corrupt persisted input, changed action and changed live source metadata", async () => {
    const first = await freeze();
    const row = await stored();
    await prisma.agentRun.update({ where: { id: runId }, data: { mode: "discuss" } });
    await expect(prisma.$transaction(async tx => readVisualRunAdmission(tx, await stored()))).rejects.toThrow("VISUAL_RUN_INPUT_INVALID");
    await prisma.agentRun.update({ where: { id: runId }, data: { mode: row.mode } });
    await prisma.agentRun.update({ where: { id: runId }, data: { action: { type: "message", text: "未确认的新要求" } } });
    await expect(prisma.$transaction(async tx => readVisualRunAdmission(tx, await stored()))).rejects.toThrow("VISUAL_RUN_INPUT_INVALID");
    await prisma.agentRun.update({ where: { id: runId }, data: { action: row.action!, inputSnapshot: { attachmentIds: assetIds,
      baseRevisionPolicy: "fixed", visualAdmission: { ...first, inputHash: "f".repeat(64) } } } });
    await expect(freeze()).rejects.toThrow("VISUAL_RUN_INPUT_INVALID");
    await prisma.agentRun.update({ where: { id: runId }, data: { inputSnapshot: row.inputSnapshot! } });
    await prisma.referenceAssetDerivative.update({ where: { assetId: assetIds[0]! }, data: { derivativeHash: "e".repeat(64) } });
    await expect(prisma.$transaction(async tx => readVisualRunAdmission(tx, await stored()))).rejects.toThrow("VISUAL_REFERENCE_INPUT_CHANGED");
  });
  it("restores the exact admitted model route across environment changes and keeps cache hits on the same input", async () => {
    const sent: Array<{ url: string; body: unknown }> = [];
    const { analysis, input } = await startFrozenAnalysis(async (url, options) => {
      if (typeof options?.body !== "string") throw new Error("expected serialized request");
      const address = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      sent.push({ url: address, body: JSON.parse(options.body) as unknown }); return response();
    });
    const first = await fenced(() => analysis.analyze(input, new AbortController().signal));
    const second = await fenced(() => analysis.analyze(input, new AbortController().signal));
    expect(first.reused).toBe(false); expect(second).toMatchObject({ id: first.id, reused: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ url: "https://fixture.invalid/v1/chat/completions", body: { model: "vision-fixture" } });
    expect(await prisma.modelInvocation.findFirstOrThrow({ where: { runId } })).toMatchObject({ requestedModel: "vision-fixture", status: "SUCCEEDED" });
  });
  it("does not send changed instructions, unknown attachments or revoked policy even after a completed cache entry", async () => {
    let calls = 0;
    const { analysis, input } = await startFrozenAnalysis(async () => { calls++; return response(); });
    await fenced(() => analysis.analyze(input, new AbortController().signal));
    await expect(fenced(() => analysis.analyze({ ...input, instruction: "未同意的新要求" }, new AbortController().signal)))
      .rejects.toThrow("VISUAL_REFERENCE_INPUT_CHANGED");
    await expect(fenced(() => analysis.analyze({ ...input, assetId: randomUUID() }, new AbortController().signal)))
      .rejects.toThrow("VISUAL_REFERENCE_INPUT_CHANGED");
    await prisma.tenant.update({ where: { id: tenantId }, data: { imageEgressAllowed: false } });
    await expect(fenced(() => analysis.analyze(input, new AbortController().signal))).rejects.toThrow("IMAGE_EGRESS_NOT_ALLOWED");
    expect(calls).toBe(1);
  });
  it("refuses publication when the frozen input disappears in flight, retaining actual provider usage", async () => {
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    let reached!: () => void;
    const sending = new Promise<void>(resolve => { reached = resolve; });
    const { analysis, input } = await startFrozenAnalysis(async () => { reached(); await blocked; return response(); });
    const pending = fenced(() => analysis.analyze(input, new AbortController().signal));
    await sending;
    await prisma.agentRun.update({ where: { id: runId }, data: { inputSnapshot: { attachmentIds: assetIds, baseRevisionPolicy: "fixed" } } });
    release();
    await expect(pending).rejects.toThrow("VISUAL_RUN_INPUT_INVALID");
    expect(await prisma.visualReferenceAnalysis.count({ where: { tenantId, workspaceId } })).toBe(0);
    expect(await prisma.modelInvocation.findFirstOrThrow({ where: { runId } })).toMatchObject({ status: "SUCCEEDED" });
    expect(await prisma.visualAnalysisCacheEntry.findFirstOrThrow({ where: { tenantId, workspaceId } })).toMatchObject({ analysisId: null, leaseOwner: null });
  });
  it("binds review and acceptance validation to the admitted source and instruction, not another analysis from the same workspace", async () => {
    const { analysis, input } = await startFrozenAnalysis(async () => response());
    const result = await fenced(() => analysis.analyze(input, new AbortController().signal));
    const original = await prisma.visualReferenceAnalysis.findUniqueOrThrow({ where: { id: result.id } });
    const foreign = await prisma.visualReferenceAnalysis.create({ data: { tenantId, workspaceId, assetId: original.assetId, sourceHash: original.sourceHash,
      derivativeHash: original.derivativeHash, analysisVersion: original.analysisVersion, modelConfigHash: original.modelConfigHash,
      instructionHash: "e".repeat(64), spec: original.spec!, specHash: original.specHash, expiresAt: new Date(Date.now() + 60000) } });
    const reviews = new VisualReviewService(prisma, Buffer.alloc(32, 0x44));
    await expect(fenced(() => reviews.prepare({ tenantId, workspaceId, runId, analysisId: foreign.id, analysisHash: foreign.specHash })))
      .rejects.toThrow("VISUAL_REVIEW_ADMISSION_MISMATCH");
    expect((await stored()).status).toBe("RUNNING");
    const review = await fenced(() => reviews.prepare({ tenantId, workspaceId, runId, analysisId: result.id, analysisHash: result.specHash }));
    expect((await stored()).status).toBe("WAITING_INPUT");
    expect(await reviews.getWaitingReview(scope(), runId)).toEqual(review);
    const accepted = await prisma.$transaction(tx => reviews.validateAcceptanceInTransaction(tx, scope(), { expectedRunId: runId,
      analysisId: result.id, analysisHash: result.specHash, receipt: review.receipt,
      acceptedDifferences: [{ regionId: "heading", disposition: "accept-unverified", capabilityId: "richtext", reason: "同意保留尚未验证的标题控件" }] }));
    expect(accepted).toMatchObject({ schema: "kf-accepted-visual-planning/v1", reference: { analysisId: result.id, specHash: result.specHash } });
    expect((await stored()).supersededByRunId).toBeNull();
    expect(await prisma.buildJob.count({ where: { tenantId, workspaceId } })).toBe(0);
    await prisma.agentRun.update({ where: { id: runId }, data: { action: { type: "message", text: "未确认的其他需求" } } });
    await expect(reviews.getWaitingReview(scope(), runId)).rejects.toThrow("VISUAL_RUN_INPUT_INVALID");
  });
});
// end
