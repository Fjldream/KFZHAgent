// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import "reflect-metadata";
import { assertSafeTestDatabase } from "../../../../tests/helpers/database-safety.js";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
assertSafeTestDatabase({ url: process.env.DATABASE_URL, allowReset: process.env.KF_TEST_ALLOW_DESTRUCTIVE_RESET, expectedPrefix: "kf_agent_test_" });
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { canonicalServerHash, VisualReferenceSpecSchema } from "@kf/contracts";
import { withAgentRunExecution } from "@kf/build-jobs";
import { PrismaService } from "../prisma/prisma.service.js";
import { VisualAnalysisService } from "./visual-analysis.service.js";
import { VisualReviewService } from "./visual-review.service.js";
import { PrismaRunStore } from "../runs/run-store.js";
import { resolveWorkbenchConfig } from "../runs/feature-policy.js";

let prisma: PrismaService;
let api: VisualReviewService;
let tenantId: string;
let otherTenantId: string;
let userId: string;
let workspaceId: string;
let conversationId: string;
let baseRevisionId: string;
let runId: string;
let analysisId: string;
let analysisHash: string;
const key = Buffer.alloc(32, 0x52);
const ownerId = "visual-review-worker";
const input = () => ({ tenantId, workspaceId, runId, analysisId, analysisHash });
const scope = () => ({ tenantId, workspaceId, conversationId, userId });
const fenced = <T>(work: () => Promise<T>, fence = 1) => withAgentRunExecution({ tenantId, runId, ownerId, fence, signal: new AbortController().signal }, work);
const acceptance = (review: Awaited<ReturnType<VisualReviewService["prepare"]>>) => ({ expectedRunId: runId, analysisId, analysisHash, receipt: review.receipt,
  acceptedDifferences: [{ regionId: "heading", disposition: "accept-unverified", capabilityId: "richtext", reason: "接受尚无原生验证的富文本控件" }] });
const validate = (body: unknown) => prisma.$transaction(tx => api.validateAcceptanceInTransaction(tx, scope(), body));

beforeAll(async () => {
  prisma = new PrismaService(); await prisma.$connect(); api = new VisualReviewService(prisma, key);
  tenantId = (await prisma.tenant.create({ data: { name: `review-${randomUUID()}` } })).id;
  otherTenantId = (await prisma.tenant.create({ data: { name: `review-other-${randomUUID()}` } })).id;
  userId = (await prisma.user.create({ data: { tenantId, username: "review", passwordHash: "test-only", role: "tenant_admin" } })).id;
});
beforeEach(async () => {
  workspaceId = (await prisma.solutionWorkspace.create({ data: { tenantId, name: randomUUID(), generationWorkflow: "creative-v2" } })).id;
  baseRevisionId = (await prisma.solutionRevision.create({ data: { tenantId, workspaceId, kind: "initial" } })).id;
  await prisma.solutionWorkspace.update({ where: { id: workspaceId }, data: { currentRevisionId: baseRevisionId } });
  conversationId = (await prisma.conversation.create({ data: { tenantId, workspaceId, title: "visual review" } })).id;
  runId = (await prisma.agentRun.create({ data: { tenantId, workspaceId, conversationId, requestedByUserId: userId,
    clientRequestId: randomUUID(), requestHash: "fixture", mode: "build", action: { type: "message", text: "还原标题" },
    baseRevisionId, status: "RUNNING", leaseOwner: ownerId, fence: 1, leaseExpiresAt: new Date(Date.now() + 60000),
    configSnapshot: { schemaVersion: 1, planVersion: "test-only-visual-review" } } })).id;
  const asset = await prisma.referenceAsset.create({ data: { tenantId, workspaceId, name: "fixture.png", mimeType: "image/png", sourceHash: "a".repeat(64),
    storageKey: "private-fixture-only", byteSize: 100, totalBytes: 100, width: 1440, height: 900 } });
  const spec = { schemaVersion: 1, sourceAssetId: asset.id, sourceHash: asset.sourceHash, viewport: { width: 1440, height: 900 },
    regions: [{ id: "heading", parentId: null, role: "text", box: { x: 0, y: 0, width: 1, height: 1 }, text: ["生产总览"], confidence: 0.9, interactionHint: null }],
    designTokens: { background: "#fff", foreground: "#111", accent: "#123456", spacing: [8], radius: [4] }, uncertainties: [] };
  analysisHash = canonicalServerHash(spec);
  analysisId = (await prisma.visualReferenceAnalysis.create({ data: { tenantId, workspaceId, assetId: asset.id, sourceHash: asset.sourceHash,
    derivativeHash: "b".repeat(64), analysisVersion: "visual-analysis@1", modelConfigHash: "c".repeat(64), instructionHash: "d".repeat(64),
    spec, specHash: analysisHash, expiresAt: new Date(Date.now() + 60000) } })).id;
});
afterAll(async () => { await prisma?.$disconnect(); });

describe("server-owned visual review boundary", () => {
  it("rejects expired analyses before freezing a review or publishing a wait", async () => {
    await prisma.visualReferenceAnalysis.update({ where: { id: analysisId }, data: { expiresAt: new Date(0) } });
    await expect(fenced(() => api.prepare(input()))).rejects.toThrow("VISUAL_ANALYSIS_STALE");
    expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe("RUNNING");
    expect(await prisma.agentRunEvent.count({ where: { runId } })).toBe(0);
  });
  it("does not accept a review after its analysis expires while awaiting the user", async () => {
    const review = await fenced(() => api.prepare(input()));
    await prisma.visualReferenceAnalysis.update({ where: { id: analysisId }, data: { expiresAt: new Date(0) } });
    await expect(api.getWaitingReview(scope(), runId)).rejects.toThrow("VISUAL_ANALYSIS_STALE");
    await expect(validate(acceptance(review))).rejects.toThrow("VISUAL_ANALYSIS_STALE");
    expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe("WAITING_INPUT");
  });
  it("atomically freezes server mappings, publishes one small receipt and pauses without compiling", async () => {
    const review = await fenced(() => api.prepare(input()));
    expect(review.content.reference.mappings).toEqual([expect.objectContaining({ regionId: "heading", capabilityId: "richtext", support: "supported_unverified", evidenceIds: [] })]);
    expect(review.content).toMatchObject({ runId, workspaceId, conversationId, baseRevisionId, targetRuntimeVersion: "3.6", analysisModelConfigHash: "c".repeat(64) });
    expect(review.reviewHash).toBe(canonicalServerHash(review.content));
    expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({ status: "WAITING_INPUT", leaseOwner: null, leaseExpiresAt: null });
    const events = await prisma.agentRunEvent.findMany({ where: { runId } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "input.required", payload: { receipt: review.receipt } });
    expect(Buffer.byteLength(JSON.stringify(events[0]!.payload))).toBeLessThan(1000);
    expect(JSON.stringify(events[0]!.payload)).not.toMatch(/生产总览|private-fixture|specHash/);
    expect(await prisma.buildJob.count({ where: { workspaceId } })).toBe(0);
    expect(await prisma.changePlan.count({ where: { workspaceId } })).toBe(0);
    expect(await api.getWaitingReview(scope(), runId)).toEqual(review);
  });
  it("deduplicates concurrent preparation and never replaces a frozen review", async () => {
    const results = await Promise.all([fenced(() => api.prepare(input())), fenced(() => api.prepare(input()))]);
    expect(results[0]).toEqual(results[1]);
    expect(await prisma.agentRunStep.count({ where: { runId, stepKey: "visual-review-v1" } })).toBe(1);
    expect(await prisma.agentRunEvent.count({ where: { runId, type: "input.required" } })).toBe(1);
    await expect(fenced(() => api.prepare({ ...input(), analysisHash: "0".repeat(64) }))).rejects.toThrow("VISUAL_ANALYSIS_STALE");
  });
  it("rejects missing authority, stale fences, cancellation and expired leases before publishing", async () => {
    await expect(api.prepare(input())).rejects.toThrow("VISUAL_REVIEW_RUN_REQUIRED");
    await expect(fenced(() => api.prepare(input()), 0)).rejects.toThrow("VISUAL_REVIEW_RUN_NOT_ACTIVE");
    await prisma.agentRun.update({ where: { id: runId }, data: { cancelRequestedAt: new Date() } });
    await expect(fenced(() => api.prepare(input()))).rejects.toThrow("VISUAL_REVIEW_RUN_NOT_ACTIVE");
    await prisma.agentRun.update({ where: { id: runId }, data: { cancelRequestedAt: null, leaseExpiresAt: new Date(0) } });
    await expect(fenced(() => api.prepare(input()))).rejects.toThrow("VISUAL_REVIEW_RUN_NOT_ACTIVE");
    expect(await prisma.agentRunStep.count({ where: { runId } })).toBe(0);
    expect(await prisma.agentRunEvent.count({ where: { runId } })).toBe(0);
  });
  it("rejects another tenant/workspace/user and never exposes the stored private review", async () => {
    const review = await fenced(() => api.prepare(input()));
    await expect(api.getWaitingReview({ ...scope(), tenantId: otherTenantId }, runId)).rejects.toThrow("VISUAL_REVIEW_NOT_FOUND");
    await expect(api.getWaitingReview({ ...scope(), workspaceId: randomUUID() }, runId)).rejects.toThrow("VISUAL_REVIEW_NOT_FOUND");
    await expect(api.getWaitingReview({ ...scope(), conversationId: randomUUID() }, runId)).rejects.toThrow("VISUAL_REVIEW_NOT_FOUND");
    await expect(api.getWaitingReview({ ...scope(), userId: randomUUID() }, runId)).rejects.toThrow("VISUAL_REVIEW_NOT_FOUND");
    await expect(prisma.$transaction(tx => api.validateAcceptanceInTransaction(tx, { ...scope(), tenantId: otherTenantId }, acceptance(review))))
      .rejects.toThrow("VISUAL_REVIEW_NOT_FOUND");
  });
  it("authenticates stored review contents and receipts instead of trusting recomputed hashes", async () => {
    const review = await fenced(() => api.prepare(input()));
    const stored = await prisma.agentRunStep.findFirstOrThrow({ where: { runId, stepKey: "visual-review-v1" } });
    const changed = structuredClone(review); changed.content.reference.mappings[0]!.support = "verified";
    changed.reviewHash = canonicalServerHash(changed.content);
    await prisma.agentRunStep.update({ where: { id: stored.id }, data: { outputRef: JSON.stringify(changed), inputHash: changed.reviewHash } });
    await expect(api.getWaitingReview(scope(), runId)).rejects.toThrow("VISUAL_REVIEW_INTEGRITY_FAILED");
  });
  it("requires the exact receipt/hash and explicit differences while forbidding client mappings", async () => {
    const review = await fenced(() => api.prepare(input()));
    const good = acceptance(review);
    await expect(validate({ ...good, receipt: undefined })).rejects.toThrow("VISUAL_ACCEPTANCE_INVALID");
    await expect(validate({ ...good, receipt: review.receipt.slice(0, -1) + (review.receipt.endsWith("0") ? "1" : "0") })).rejects.toThrow("VISUAL_REVIEW_RECEIPT_MISMATCH");
    await expect(validate({ ...good, analysisHash: "e".repeat(64) })).rejects.toThrow("VISUAL_ANALYSIS_STALE");
    await expect(validate({ ...good, mappings: [{ support: "verified" }] })).rejects.toThrow("VISUAL_ACCEPTANCE_INVALID");
    await expect(validate({ ...good, acceptedDifferences: [] })).rejects.toThrow("VISUAL_ACKNOWLEDGEMENT_REQUIRED");
    await expect(validate({ ...good, acceptedDifferences: [{ ...good.acceptedDifferences[0], capabilityId: "button" }] })).rejects.toThrow("VISUAL_CAPABILITY_MISMATCH");
    await expect(validate({ ...good, acceptedDifferences: [{ ...good.acceptedDifferences[0], disposition: "substitute", capabilityId: "text" }] }))
      .rejects.toThrow("VISUAL_SUBSTITUTION_REQUIRES_REVIEW");
    const accepted = await validate(good);
    expect(accepted.schema).toBe("kf-accepted-visual-planning/v1");
    expect(accepted.reference).toMatchObject({ analysisId, specHash: analysisHash, acceptedDifferences: good.acceptedDifferences });
    expect(accepted.reviewHash).toBe(review.reviewHash);
    expect(accepted.confirmationHash).toBe(canonicalServerHash({ reviewHash: review.reviewHash, reference: accepted.reference }));
    // Validation alone is not a new Run, blueprint approval, egress consent or execution authorization.
    expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(1);
    expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } })).supersededByRunId).toBeNull();
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })).imageEgressAllowed).toBe(false);
  });
  it("rejects source changes and a child analysis even when the parent hash is still unchanged", async () => {
    const review = await fenced(() => api.prepare(input()));
    const analysis = await prisma.visualReferenceAnalysis.findUniqueOrThrow({ where: { id: analysisId } });
    const service = new VisualAnalysisService(prisma, {} as never, {} as never, {} as never);
    const corrected = await service.revise(tenantId, analysisId, analysisHash, { ...VisualReferenceSpecSchema.parse(analysis.spec), regions: [
      { id: "heading", parentId: null, role: "text", box: { x: 0, y: 0, width: 1, height: 1 }, text: ["修正标题"], confidence: 0.9, interactionHint: null },
    ] });
    expect(corrected.id).not.toBe(analysisId);
    await expect(validate(acceptance(review))).rejects.toThrow("VISUAL_ANALYSIS_STALE");
    await expect(api.getWaitingReview(scope(), runId)).rejects.toThrow("VISUAL_ANALYSIS_STALE");
    expect((await prisma.visualReferenceAnalysis.findUniqueOrThrow({ where: { id: analysisId } })).specHash).toBe(analysisHash);
  });
  it("refuses changed config, moved baselines, consumed waits and corrupt persisted analyses", async () => {
    const review = await fenced(() => api.prepare(input()));
    await prisma.agentRun.update({ where: { id: runId }, data: { configSnapshot: { changed: true } } });
    await expect(validate(acceptance(review))).rejects.toThrow("VISUAL_REVIEW_INTEGRITY_FAILED");
    await prisma.agentRun.update({ where: { id: runId }, data: { configSnapshot: { schemaVersion: 1, planVersion: "test-only-visual-review" } } });
    const next = await prisma.solutionRevision.create({ data: { tenantId, workspaceId, kind: "generated" } });
    await prisma.solutionWorkspace.update({ where: { id: workspaceId }, data: { currentRevisionId: next.id } });
    await expect(validate(acceptance(review))).rejects.toThrow("STALE_BASE_REVISION");
    await prisma.solutionWorkspace.update({ where: { id: workspaceId }, data: { currentRevisionId: baseRevisionId } });
    await prisma.agentRun.update({ where: { id: runId }, data: { status: "CANCELLED" } });
    await expect(validate(acceptance(review))).rejects.toThrow("VISUAL_REVIEW_NOT_WAITING");
    await prisma.agentRun.update({ where: { id: runId }, data: { status: "WAITING_INPUT" } });
    await prisma.visualReferenceAnalysis.update({ where: { id: analysisId }, data: { spec: {} } });
    await expect(validate(acceptance(review))).rejects.toThrow("VISUAL_ANALYSIS_INTEGRITY_FAILED");
  });
  it("allows an explicitly omitted unverified region without pretending it was accepted for generation", async () => {
    const review = await fenced(() => api.prepare(input()));
    const accepted = await validate({ ...acceptance(review), acceptedDifferences: [{ regionId: "heading", disposition: "omit", capabilityId: null, reason: "不生成该标题区域" }] });
    expect(accepted.reference.acceptedDifferences).toEqual([{ regionId: "heading", disposition: "omit", capabilityId: null, reason: "不生成该标题区域" }]);
  });
  it("blocks analysis scope/hash errors before changing the Run and supports explicit omission of unsupported regions", async () => {
    await expect(fenced(() => api.prepare({ ...input(), analysisHash: "e".repeat(64) }))).rejects.toThrow("VISUAL_ANALYSIS_STALE");
    await expect(fenced(() => api.prepare({ ...input(), analysisId: randomUUID() }))).rejects.toThrow("VISUAL_ANALYSIS_NOT_FOUND");
    expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe("RUNNING");
    expect(await prisma.agentRunStep.count({ where: { runId } })).toBe(0);
    const row = await prisma.visualReferenceAnalysis.findUniqueOrThrow({ where: { id: analysisId } });
    const spec = VisualReferenceSpecSchema.parse(row.spec); spec.regions[0]!.role = "chart";
    analysisHash = canonicalServerHash(spec);
    await prisma.visualReferenceAnalysis.update({ where: { id: analysisId }, data: { spec, specHash: analysisHash } });
    const review = await fenced(() => api.prepare(input()));
    expect(review.content.reference.mappings[0]).toMatchObject({ support: "unsupported", capabilityId: null });
    await expect(validate({ ...acceptance(review), acceptedDifferences: [] })).rejects.toThrow("VISUAL_DIFFERENCE_REQUIRED");
    const accepted = await validate({ ...acceptance(review), acceptedDifferences: [{ regionId: "heading", disposition: "omit", capabilityId: null, reason: "明确省略不支持的图表" }] });
    expect(accepted.reference.mappings[0]!.support).toBe("unsupported");
  });
  it("keeps unsupported public-protocol actions and attachments closed at the Store boundary without consuming the review", async () => {
    await fenced(() => api.prepare(input()));
    const store = new PrismaRunStore(prisma, 30000, id => resolveWorkbenchConfig(id, {
      AGENT_RUNS_V2: "true", AGENT_WORKBENCH_V2: "true", AGENT_FEATURE_TENANT_ALLOWLIST: tenantId,
    }));
    for (const request of [
      { action: { type: "accept_visual_reference" as const, expectedRunId: runId, analysisId, analysisHash }, attachmentIds: [] },
      { action: { type: "revise_regions" as const, text: "修改标题", regionIds: ["heading"], generationSnapshotId: "not-a-real-snapshot" }, attachmentIds: [] },
      { action: { type: "message" as const, text: "参考图片" }, attachmentIds: ["not-a-real-asset"] },
    ]) {
      await expect(store.create({ tenantId, userId, conversationId, clientRequestId: randomUUID(), clientMessageId: randomUUID(), mode: "build", ...request }))
        .rejects.toThrow("FEATURE_NOT_ENABLED");
    }
    expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(1);
    expect(await prisma.message.count({ where: { conversationId } })).toBe(0);
    expect(await prisma.runBudget.count({ where: { runId } })).toBe(0);
    expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe("WAITING_INPUT");
  });
  it("rolls review storage and pause back if its receipt event cannot be committed", async () => {
    await prisma.agentRunEvent.create({ data: { tenantId, runId, seq: 1, type: "decision.summary", payload: { summary: "test conflict" } } });
    await expect(fenced(() => api.prepare(input()))).rejects.toThrow();
    expect(await prisma.agentRunStep.count({ where: { runId, stepKey: "visual-review-v1" } })).toBe(0);
    expect(await prisma.agentRunEvent.count({ where: { runId, type: "input.required" } })).toBe(0);
    expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({ status: "RUNNING", leaseOwner: ownerId, lastSeq: 0 });
  });
});
// end
