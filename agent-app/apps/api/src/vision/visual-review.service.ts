// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import type { AgentRun, Prisma, PrismaClient } from "@prisma/client";
import { createHmac, timingSafeEqual } from "node:crypto";
import { currentAgentRunExecution } from "@kf/build-jobs";
import { canonicalServerHash, AcceptedVisualPlanningInputSchema, VisualReviewSchema, VisualReviewContentSchema, VisualReviewAcceptanceSchema, VisualReferenceSpecSchema,
  type VisualReview, type AcceptedVisualPlanningInput } from "@kf/contracts";
// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import type { VisualReviewAcceptance } from "@kf/contracts";
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import { VisualReviewDisplaySchema, VisualReviewRevisionSchema, type VisualReviewRevision } from "@kf/contracts";
import { VisualWorkspaceDataSnapshotSchema, type VisualReferenceSpec } from "@kf/contracts";
// end
// end
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import { getDesignKnowledgeSnapshot, retrieveVisualCapabilities, mapVisualRegions,
  validateVisualPlanningContext, validateVisualDataSnapshots } from "@kf/domain-client";
// end
import { readVisualRunAdmission } from "./visual-run-admission.js";
// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { RunActionSchema, VISUAL_RUN_PLAN_VERSION, VisualContinuationContentSchema, VisualContinuationSnapshotSchema,
  VisualContinuationInputSnapshotSchema, type ModelRoute, type VisualContinuationSnapshot, type VisualRunAdmissionSnapshot } from "@kf/contracts";
import { freezeVisualBlueprintModel } from "./visual-blueprint-request.js";
// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { VisualBlueprintAuthority, type PrepareVisualBlueprintReview } from "./visual-blueprint-authority.js";
// end
// end

export type VisualReviewScope = { tenantId: string; workspaceId: string; conversationId: string; userId: string };
export type PrepareVisualReview = { tenantId: string; workspaceId: string; runId: string; analysisId: string; analysisHash: string };
const STEP_KEY = "visual-review-v1";

/** Internal primitive only: callers must separately gate Run admission, model egress and blueprint approval. */
export class VisualReviewService {
  private readonly key: Buffer;
  // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
  private readonly blueprintAuthority: VisualBlueprintAuthority;
  // end
  // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  private readonly planningRoutes: { blueprint: ModelRoute; implementation?: ModelRoute; blueprintRepairPolicy?: "none" | "once"; semanticRepairPolicy?: "none" | "once" } | undefined;
  constructor(private readonly prisma: PrismaClient, key: Uint8Array, planningRoutes?: { blueprint: ModelRoute; implementation?: ModelRoute; blueprintRepairPolicy?: "none" | "once"; semanticRepairPolicy?: "none" | "once" }) {
  // end
    if (key.byteLength < 32) throw new Error("VISUAL_REVIEW_KEY_INVALID");
    this.key = Buffer.from(key);
    this.planningRoutes = planningRoutes === undefined ? undefined : structuredClone(planningRoutes);
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    this.blueprintAuthority = new VisualBlueprintAuthority(prisma, this, this.key, this.planningRoutes?.implementation, this.planningRoutes?.semanticRepairPolicy);
    // end
    // end
  }
  // end

  // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
  prepareBlueprintReview(input: PrepareVisualBlueprintReview) { return this.blueprintAuthority.prepare(input); }
  freezeEngineeringInTransaction(tx: Prisma.TransactionClient, scope: VisualReviewScope, successorId: string, sourceRunId: string) {
    return this.blueprintAuthority.freeze(tx, scope, successorId, sourceRunId);
  }
  readEngineeringInTransaction(tx: Prisma.TransactionClient, scope: VisualReviewScope, runId: string) {
    return this.blueprintAuthority.read(tx, scope, runId);
  }
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  readEngineeringReceiptInTransaction(tx: Prisma.TransactionClient, scope: VisualReviewScope, runId: string) {
    return this.blueprintAuthority.readReceipt(tx, scope, runId);
  }
  // end
  // end

  async prepare(input: PrepareVisualReview): Promise<VisualReview> {
    const execution = currentAgentRunExecution();
    if (!execution || execution.tenantId !== input.tenantId || execution.runId !== input.runId) throw new Error("VISUAL_REVIEW_RUN_REQUIRED");
    execution.signal.throwIfAborted();
    return this.prisma.$transaction(async tx => {
      const run = await this.lockRun(tx, input, input.runId);
      if (!run || run.fence !== execution.fence || run.cancelRequestedAt || run.supersededByRunId || run.buildJobId) throw new Error("VISUAL_REVIEW_RUN_NOT_ACTIVE");
      const existing = await tx.agentRunStep.findMany({ where: { tenantId: input.tenantId, runId: run.id, stepKey: STEP_KEY } });
      if (run.status === "WAITING_INPUT" && existing.length === 1) {
        const review = await this.readWaitingReview(tx, run);
        if (review.content.reference.analysisId !== input.analysisId || review.content.reference.specHash !== input.analysisHash) throw new Error("VISUAL_ANALYSIS_STALE");
        return review;
      }
      const [clock] = await tx.$queryRaw<{ active: boolean }[]>`SELECT "leaseExpiresAt" > (clock_timestamp() AT TIME ZONE 'UTC') AS active FROM "AgentRun" WHERE "id"=${run.id}`;
      if (run.status !== "RUNNING" || run.leaseOwner !== execution.ownerId || clock?.active !== true) throw new Error("VISUAL_REVIEW_RUN_NOT_ACTIVE");
      if (existing.length !== 0) throw new Error("VISUAL_REVIEW_ALREADY_FROZEN");
      await this.assertBase(tx, run);
      const analysis = await this.loadCurrentAnalysis(tx, run, input.analysisId, input.analysisHash);
      const knowledge = getDesignKnowledgeSnapshot();
      const mappings = mapVisualRegions({ regions: analysis.spec.regions,
        candidates: retrieveVisualCapabilities({ regions: analysis.spec.regions, knowledge }), targetRuntimeVersion: "3.6" });
      // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
      const dataSnapshots = await this.resolveWorkspaceDataSnapshots(tx, run, analysis.spec);
      // end
      const content = VisualReviewContentSchema.parse({ schema: "kf-visual-review/v1", tenantId: run.tenantId, workspaceId: run.workspaceId,
        conversationId: run.conversationId, runId: run.id, baseRevisionId: run.baseRevisionId,
        configHash: canonicalServerHash(run.configSnapshot), knowledgeHash: canonicalServerHash(knowledge),
        analysisModelConfigHash: analysis.row.modelConfigHash, derivativeHash: analysis.row.derivativeHash, targetRuntimeVersion: "3.6",
        execution: { ownerId: execution.ownerId, fence: execution.fence },
        // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
        reference: { schemaVersion: 1, analysisId: analysis.row.id, specHash: analysis.row.specHash, spec: analysis.spec, mappings,
          ...(dataSnapshots.length ? { dataSnapshots } : {}) } });
      // end
      const reviewHash = canonicalServerHash(content);
      const review = VisualReviewSchema.parse({ content, reviewHash, receipt: this.receiptFor(reviewHash) });
      execution.signal.throwIfAborted();
      await tx.agentRunStep.create({ data: { tenantId: run.tenantId, runId: run.id, stepKey: STEP_KEY, inputHash: reviewHash,
        status: "COMPLETED", outputRef: JSON.stringify(review) } });
      // This transaction publishes the wait and its exact receipt together. No build side effects.
      await tx.agentRunEvent.create({ data: { tenantId: run.tenantId, runId: run.id, seq: run.lastSeq + 1, type: "input.required",
        payload: { question: "请核对图片识别、控件映射与未验证差异；确认后仍需单独确认工程蓝图。", receipt: review.receipt } } });
      await tx.agentRun.update({ where: { id: run.id }, data: { status: "WAITING_INPUT", lastSeq: { increment: 1 }, leaseOwner: null, leaseExpiresAt: null } });
      await tx.conversation.update({ where: { id: run.conversationId }, data: { lastActivityAt: new Date() } });
      return review;
    });
  }

  async getWaitingReview(scope: VisualReviewScope, runId: string): Promise<VisualReview> {
    return this.prisma.$transaction(async tx => this.readWaitingReview(tx, await this.scopedRun(tx, scope, runId)));
  }
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  async getWaitingReviewDisplay(scope: VisualReviewScope, runId: string) {
    return this.prisma.$transaction(async tx => {
      const run = await this.scopedRun(tx, scope, runId);
      if (run.requestedByUserId !== scope.userId) throw new Error("VISUAL_CONTINUATION_ACTOR_MISMATCH");
      const review = await this.readWaitingReview(tx, run);
      return VisualReviewDisplaySchema.parse({ schemaVersion: 1, runId, workspaceId: run.workspaceId,
        conversationId: run.conversationId, receipt: review.receipt, reference: review.content.reference });
    });
  }
  /** Only an unconsumed image wait can be edited. Analysis, history, receipt, event and audit commit together. */
  async reviseWaitingReview(scope: VisualReviewScope, runId: string, body: VisualReviewRevision) {
    const parsed = VisualReviewRevisionSchema.safeParse(body);
    if (!parsed.success) throw new Error("VISUAL_REVIEW_REVISION_INVALID");
    return this.prisma.$transaction(async tx => {
      await this.lockContinuationScope(tx, scope);
      const run = await this.scopedRun(tx, scope, runId);
      if (run.requestedByUserId !== scope.userId) throw new Error("VISUAL_CONTINUATION_ACTOR_MISMATCH");
      const admission = await readVisualRunAdmission(tx, run);
      if (!admission || run.mode !== "build" || admission.content.attachments.length !== 1
        || admission.content.sendingConsent.userId !== scope.userId) throw new Error("VISUAL_CONTINUATION_INPUT_REQUIRED");
      const requestHash = canonicalServerHash(parsed.data);
      const stepKey = `visual-review-edit-v1:${parsed.data.clientRequestId}`;
      const edits = await tx.agentRunStep.findMany({ where: { tenantId: scope.tenantId, runId, stepKey } });
      if (edits.length > 0 && (edits.length !== 1 || edits[0]!.inputHash !== requestHash)) throw new Error("VISUAL_REVIEW_REVISION_CONFLICT");
      const previous = await this.readWaitingReview(tx, run);
      const display = (review: VisualReview) => VisualReviewDisplaySchema.parse({ schemaVersion: 1, runId,
        workspaceId: run.workspaceId, conversationId: run.conversationId, receipt: review.receipt, reference: review.content.reference });
      if (edits.length === 1) {
        let saved: VisualReview;
        try { saved = VisualReviewSchema.parse(JSON.parse(edits[0]!.outputRef ?? "null") as unknown); }
        catch { throw new Error("VISUAL_REVIEW_INTEGRITY_FAILED"); }
        if (edits[0]!.status !== "COMPLETED" || canonicalServerHash(saved) !== canonicalServerHash(previous)) throw new Error("VISUAL_REVIEW_REVISION_STALE");
        return display(previous);
      }
      if (!secureEqual(previous.receipt, parsed.data.receipt) || previous.content.reference.analysisId !== parsed.data.analysisId
        || previous.content.reference.specHash !== parsed.data.analysisHash) throw new Error("VISUAL_REVIEW_RECEIPT_MISMATCH");
      const original = await this.loadCurrentAnalysis(tx, run, parsed.data.analysisId, parsed.data.analysisHash);
      // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
      const changes = new Map(parsed.data.regions.map(region => [region.regionId, region]));
      const removals = new Set(parsed.data.removals ?? []);
      if ([...changes.keys(), ...removals].some(id => !original.spec.regions.some(region => region.id === id))) throw new Error("VISUAL_REVIEW_REGION_UNKNOWN");
      const additions = (parsed.data.additions ?? []).map((region, index) => ({ ...region,
        id: `user_${parsed.data.clientRequestId.replaceAll("-", "")}_${index + 1}`, parentId: null, confidence: 0, interactionHint: null,
      }));
      const retained = original.spec.regions.filter(region => !removals.has(region.id)).map(region => {
        const patch = changes.get(region.id);
        // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
        if (!patch) return region;
        const updated = { ...region, role: patch.role, text: patch.text, box: patch.box,
          ...(patch.parentId !== undefined ? { parentId: patch.parentId } : {}) };
        if (patch.clarifications !== undefined) {
          if (patch.clarifications.interaction === null && patch.clarifications.dataSource === null) delete updated.clarifications;
          else updated.clarifications = patch.clarifications;
        }
        // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
        if (patch.interactionRequirement === null) delete updated.interactionRequirement;
        else if (patch.interactionRequirement !== undefined) updated.interactionRequirement = patch.interactionRequirement;
        if (patch.dataRequirement === null) delete updated.dataRequirement;
        else if (patch.dataRequirement !== undefined) updated.dataRequirement = patch.dataRequirement;
        // end
        return updated;
        // end
      });
      // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
      // A retained child must explicitly move out before its former parent can be removed.
      if (retained.some(region => region.parentId !== null && removals.has(region.parentId))) throw new Error("VISUAL_REVIEW_REGION_HAS_CHILDREN");
      const reparentedCount = retained.filter(region => region.parentId !== original.spec.regions.find(originalRegion => originalRegion.id === region.id)!.parentId).length;
      const clarifiedCount = retained.filter(region => canonicalServerHash(region.clarifications ?? null)
        !== canonicalServerHash(original.spec.regions.find(previousRegion => previousRegion.id === region.id)!.clarifications ?? null)).length;
      const interactionChangedCount = retained.filter(region => canonicalServerHash(region.interactionRequirement ?? null)
        !== canonicalServerHash(original.spec.regions.find(previousRegion => previousRegion.id === region.id)!.interactionRequirement ?? null)).length;
      const dataChangedCount = retained.filter(region => canonicalServerHash(region.dataRequirement ?? null)
        !== canonicalServerHash(original.spec.regions.find(previousRegion => previousRegion.id === region.id)!.dataRequirement ?? null)).length;
      // end
      // Preserve unresolved questions after deletion without leaving dangling region references.
      const candidate = VisualReferenceSpecSchema.safeParse({ ...original.spec, regions: [...retained, ...additions],
        uncertainties: [...original.spec.uncertainties.map(item => item.regionId !== null && removals.has(item.regionId)
          ? { ...item, regionId: null } : item), ...additions.map(region => ({ regionId: region.id, question: "用户补充区域，交互与数据源尚待确认。" }))],
      });
      if (!candidate.success) throw new Error("VISUAL_REVIEW_REVISION_INVALID");
      const spec = candidate.data;
      // end
      const specHash = canonicalServerHash(spec);
      if (specHash === original.row.specHash) throw new Error("VISUAL_REVIEW_NO_CHANGES");
      const child = await tx.visualReferenceAnalysis.create({ data: { tenantId: scope.tenantId, workspaceId: run.workspaceId,
        assetId: original.row.assetId, sourceHash: original.row.sourceHash, derivativeHash: original.row.derivativeHash,
        analysisVersion: original.row.analysisVersion, modelConfigHash: original.row.modelConfigHash, instructionHash: original.row.instructionHash,
        parentId: original.row.id, expiresAt: original.row.expiresAt, spec, specHash } });
      const knowledge = getDesignKnowledgeSnapshot();
      const mappings = mapVisualRegions({ regions: spec.regions, candidates: retrieveVisualCapabilities({ regions: spec.regions, knowledge }), targetRuntimeVersion: "3.6" });
      // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
      const dataSnapshots = await this.resolveWorkspaceDataSnapshots(tx, run, spec);
      const reference = { ...previous.content.reference, analysisId: child.id, specHash, spec, mappings };
      if (dataSnapshots.length) reference.dataSnapshots = dataSnapshots;
      else delete reference.dataSnapshots;
      // end
      // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
      const content = VisualReviewContentSchema.parse({ ...previous.content,
        revision: { requestId: parsed.data.clientRequestId, previousReviewHash: previous.reviewHash, actorUserId: scope.userId },
        reference });
      // end
      const reviewHash = canonicalServerHash(content);
      const revised = VisualReviewSchema.parse({ content, reviewHash, receipt: this.receiptFor(reviewHash) });
      await tx.agentRunStep.create({ data: { tenantId: scope.tenantId, runId, stepKey: `visual-review-history-v1:${previous.reviewHash}`,
        inputHash: previous.reviewHash, status: "COMPLETED", outputRef: JSON.stringify(previous) } });
      const updated = await tx.agentRunStep.updateMany({ where: { tenantId: scope.tenantId, runId, stepKey: STEP_KEY,
        inputHash: previous.reviewHash, status: "COMPLETED" }, data: { inputHash: reviewHash, outputRef: JSON.stringify(revised) } });
      if (updated.count !== 1) throw new Error("VISUAL_REVIEW_INTEGRITY_FAILED");
      await tx.agentRunStep.create({ data: { tenantId: scope.tenantId, runId, stepKey, inputHash: requestHash,
        status: "COMPLETED", outputRef: JSON.stringify(revised) } });
      await tx.agentRunEvent.create({ data: { tenantId: scope.tenantId, runId, seq: run.lastSeq + 1, type: "input.required",
        payload: { question: "识别结果已修改并重新匹配组件，请重新核对差异；确认后仍需独立确认工程蓝图。", receipt: revised.receipt } } });
      await tx.agentRun.update({ where: { id: runId }, data: { lastSeq: { increment: 1 } } });
      await tx.auditLog.create({ data: { tenantId: scope.tenantId, actorUserId: scope.userId, action: "VISUAL_REVIEW_REVISED",
        resourceType: "AGENT_RUN", resourceId: runId, detail: { requestId: parsed.data.clientRequestId,
          // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
          previousReviewHash: previous.reviewHash, reviewHash, regionCount: changes.size + additions.length + removals.size,
          updatedCount: changes.size, addedCount: additions.length, removedCount: removals.size, reparentedCount, clarifiedCount, interactionChangedCount, dataChangedCount } } });
          // end
      await tx.conversation.update({ where: { id: scope.conversationId }, data: { lastActivityAt: new Date() } });
      return display(revised);
    });
  }
  // end

  /** Must run in the SAME transaction as successor creation/CAS. This alone consumes nothing. */
  async validateAcceptanceInTransaction(tx: Prisma.TransactionClient, scope: VisualReviewScope, body: unknown): Promise<AcceptedVisualPlanningInput> {
    const parsed = VisualReviewAcceptanceSchema.safeParse(body);
    if (!parsed.success) throw new Error("VISUAL_ACCEPTANCE_INVALID");
    const accepted = parsed.data;
    const run = await this.scopedRun(tx, scope, accepted.expectedRunId);
    const review = await this.readWaitingReview(tx, run);
    if (!secureEqual(accepted.receipt, review.receipt)) throw new Error("VISUAL_REVIEW_RECEIPT_MISMATCH");
    if (accepted.analysisId !== review.content.reference.analysisId || accepted.analysisHash !== review.content.reference.specHash) throw new Error("VISUAL_ANALYSIS_STALE");
    // Alternative controls need a new displayed review with their own support/risks first.
    if (accepted.acceptedDifferences.some(difference => difference.disposition === "substitute")) throw new Error("VISUAL_SUBSTITUTION_REQUIRES_REVIEW");
    const reference = validateVisualPlanningContext({ ...review.content.reference, acceptedDifferences: accepted.acceptedDifferences });
    return AcceptedVisualPlanningInputSchema.parse({ schema: "kf-accepted-visual-planning/v1", reviewHash: review.reviewHash,
      reference, confirmationHash: canonicalServerHash({ reviewHash: review.reviewHash, reference }) });
  }

  private receiptFor(hash: string): string {
    const signature = createHmac("sha256", this.key).update(`kf-visual-review/v1\n${hash}`, "utf8").digest("hex");
    return `vref1:${hash}:${signature}`;
  }

  // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
  /** Internal only. Caller creates the candidate/Message/queued event in this transaction, and must have a runnable handler before exposing admission. */
  async freezeContinuationInTransaction(tx: Prisma.TransactionClient, scope: VisualReviewScope, successorId: string, body: unknown): Promise<VisualContinuationSnapshot> {
    const parsed = VisualReviewAcceptanceSchema.safeParse(body);
    if (!parsed.success) throw new Error("VISUAL_ACCEPTANCE_INVALID");
    await this.lockContinuationScope(tx, scope);
    const source = await this.scopedRun(tx, scope, parsed.data.expectedRunId);
    // Consent remains the original actor's consent. Collaborative acceptance needs its own future consent contract.
    if (source.requestedByUserId !== scope.userId) throw new Error("VISUAL_CONTINUATION_ACTOR_MISMATCH");
    const successor = await this.scopedRun(tx, scope, successorId);
    if (source.id === successor.id || successor.requestedByUserId !== scope.userId) throw new Error("VISUAL_CONTINUATION_ACTOR_MISMATCH");
    const existing = await tx.agentRunStep.count({ where: { tenantId: scope.tenantId, runId: successorId, stepKey: "visual-continuation-v1" } });
    if (existing || successor.inputSnapshot !== null) {
      const restored = await this.readContinuationInTransaction(tx, scope, successorId);
      if (parsed.data.expectedRunId !== restored.snapshot.content.sourceRunId || parsed.data.receipt !== restored.review.receipt
        || parsed.data.analysisId !== restored.accepted.reference.analysisId || parsed.data.analysisHash !== restored.accepted.reference.specHash
        || canonicalServerHash(parsed.data.acceptedDifferences) !== canonicalServerHash(restored.accepted.reference.acceptedDifferences)) throw new Error("VISUAL_CONTINUATION_CONFLICT");
      return restored.snapshot;
    }
    if (successor.status !== "QUEUED" || successor.startedAt || successor.fence !== 0 || successor.leaseOwner || successor.leaseExpiresAt
      || successor.cancelRequestedAt || successor.supersededByRunId || successor.buildJobId || successor.retryOfRunId) throw new Error("VISUAL_CONTINUATION_NOT_QUEUED");
    this.assertContinuationIdentity(source, successor, { analysisId: parsed.data.analysisId, specHash: parsed.data.analysisHash });
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    this.assertContinuationChoices(successor, parsed.data);
    // end
    const accepted = await this.validateAcceptanceInTransaction(tx, scope, parsed.data);
    const admission = await readVisualRunAdmission(tx, source);
    if (!admission || admission.content.attachments.length !== 1 || admission.content.sendingConsent.userId !== scope.userId) throw new Error("VISUAL_CONTINUATION_INPUT_REQUIRED");
    const content = VisualContinuationContentSchema.parse({ schema: "kf-visual-continuation/v1", tenantId: scope.tenantId,
      workspaceId: scope.workspaceId, conversationId: scope.conversationId, runId: successor.id, sourceRunId: source.id,
      requestedByUserId: scope.userId, baseRevisionId: successor.baseRevisionId, mode: successor.mode,
      configHash: canonicalServerHash(successor.configSnapshot), actionHash: canonicalServerHash(successor.action), requestHash: successor.requestHash,
      sourceAdmissionHash: admission.inputHash, sourceReviewHash: accepted.reviewHash, acceptedAt: new Date().toISOString(), accepted,
      // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
      // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
      ...(this.planningRoutes ? { blueprintModel: freezeVisualBlueprintModel(this.planningRoutes.blueprint, this.planningRoutes.blueprintRepairPolicy ?? "none") } : {}),
      // end
      // end
    });
    const inputHash = canonicalServerHash(content);
    const snapshot = VisualContinuationSnapshotSchema.parse({ content, inputHash, receipt: this.continuationReceiptFor(inputHash) });
    const input = VisualContinuationInputSnapshotSchema.parse({ attachmentIds: admission.content.attachments.map(image => image.assetId),
      baseRevisionPolicy: "fixed", visualContinuation: snapshot });
    const consumed = await tx.agentRun.updateMany({ where: { id: source.id, tenantId: scope.tenantId, status: "WAITING_INPUT",
      supersededByRunId: null, cancelRequestedAt: null, buildJobId: null }, data: { status: "CANCELLED", supersededByRunId: successor.id,
      finishedAt: new Date(), lastSeq: { increment: 1 } } });
    if (consumed.count !== 1) throw new Error("VISUAL_REVIEW_NOT_WAITING");
    await tx.agentRun.update({ where: { id: successor.id }, data: { inputSnapshot: input } });
    await tx.agentRunStep.create({ data: { tenantId: scope.tenantId, runId: successor.id, stepKey: "visual-continuation-v1",
      status: "COMPLETED", inputHash, outputRef: JSON.stringify(snapshot) } });
    await tx.agentRunEvent.create({ data: { tenantId: scope.tenantId, runId: source.id, seq: source.lastSeq + 1, type: "run.cancelled", payload: {} } });
    await tx.auditLog.create({ data: { tenantId: scope.tenantId, actorUserId: scope.userId, action: "VISUAL_REFERENCE_ACCEPTED",
      resourceType: "AGENT_RUN", resourceId: successor.id, detail: { sourceRunId: source.id, reviewHash: accepted.reviewHash,
        confirmationHash: accepted.confirmationHash, inputHash, differenceCount: accepted.reference.acceptedDifferences.length } } });
    await tx.conversation.update({ where: { id: scope.conversationId }, data: { lastActivityAt: new Date() } });
    return snapshot;
  }

  /** Authenticates immutable acceptance AND current source facts after the predecessor was consumed. No model calls or execution authorization. */
  async readContinuationInTransaction(tx: Prisma.TransactionClient, scope: VisualReviewScope, runId: string): Promise<{
    snapshot: VisualContinuationSnapshot; accepted: AcceptedVisualPlanningInput; admission: VisualRunAdmissionSnapshot; review: VisualReview;
  }> {
    await this.lockContinuationScope(tx, scope);
    // Discover the source without acquiring the successor lock first; both paths lock source then successor.
    const candidate = await tx.agentRun.findFirst({ where: { id: runId, tenantId: scope.tenantId, workspaceId: scope.workspaceId, conversationId: scope.conversationId } });
    const parsed = VisualContinuationInputSnapshotSchema.safeParse(candidate?.inputSnapshot);
    if (!candidate || !parsed.success) throw new Error("VISUAL_CONTINUATION_INTEGRITY_FAILED");
    const source = await this.scopedRun(tx, scope, parsed.data.visualContinuation.content.sourceRunId);
    const successor = await this.scopedRun(tx, scope, runId);
    const input = VisualContinuationInputSnapshotSchema.safeParse(successor.inputSnapshot);
    if (!input.success) throw new Error("VISUAL_CONTINUATION_INTEGRITY_FAILED");
    const snapshot = input.data.visualContinuation; const content = snapshot.content;
    const rows = await tx.agentRunStep.findMany({ where: { tenantId: scope.tenantId, runId, stepKey: "visual-continuation-v1" } });
    let stored: unknown;
    try { stored = JSON.parse(rows.length === 1 ? rows[0]!.outputRef ?? "null" : "null") as unknown; }
    catch { throw new Error("VISUAL_CONTINUATION_INTEGRITY_FAILED"); }
    if (rows.length !== 1 || rows[0]!.status !== "COMPLETED" || rows[0]!.inputHash !== snapshot.inputHash
      || canonicalServerHash(stored) !== canonicalServerHash(snapshot) || canonicalServerHash(content) !== snapshot.inputHash
      || !secureEqual(snapshot.receipt, this.continuationReceiptFor(snapshot.inputHash))
      || content.runId !== successor.id || content.sourceRunId !== source.id || content.tenantId !== scope.tenantId
      || content.workspaceId !== scope.workspaceId || content.conversationId !== scope.conversationId || content.requestedByUserId !== scope.userId
      || content.baseRevisionId !== successor.baseRevisionId || content.mode !== successor.mode || content.requestHash !== successor.requestHash
      || content.configHash !== canonicalServerHash(successor.configSnapshot) || content.actionHash !== canonicalServerHash(successor.action)
      || content.accepted.confirmationHash !== canonicalServerHash({ reviewHash: content.accepted.reviewHash, reference: content.accepted.reference })) throw new Error("VISUAL_CONTINUATION_INTEGRITY_FAILED");
    this.assertContinuationIdentity(source, successor, content.accepted.reference);
    if (source.status !== "CANCELLED" || source.supersededByRunId !== successor.id || source.cancelRequestedAt || source.buildJobId
      || source.requestedByUserId !== scope.userId || successor.requestedByUserId !== scope.userId) throw new Error("VISUAL_CONTINUATION_SOURCE_MISMATCH");
    const review = await this.readReviewFacts(tx, source);
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    this.assertContinuationChoices(successor, { expectedRunId: source.id, analysisId: content.accepted.reference.analysisId,
      analysisHash: content.accepted.reference.specHash, receipt: review.receipt, acceptedDifferences: content.accepted.reference.acceptedDifferences });
    // end
    if (review.reviewHash !== content.sourceReviewHash || review.reviewHash !== content.accepted.reviewHash
      || canonicalServerHash({ ...content.accepted.reference, acceptedDifferences: undefined }) !== canonicalServerHash({ ...review.content.reference, acceptedDifferences: undefined })) throw new Error("VISUAL_CONTINUATION_INTEGRITY_FAILED");
    validateVisualPlanningContext(content.accepted.reference);
    const admission = await readVisualRunAdmission(tx, source);
    if (!admission || admission.inputHash !== content.sourceAdmissionHash || admission.content.sendingConsent.userId !== scope.userId
      || canonicalServerHash(input.data.attachmentIds) !== canonicalServerHash(admission.content.attachments.map(image => image.assetId))) throw new Error("VISUAL_CONTINUATION_INTEGRITY_FAILED");
    return { snapshot, accepted: content.accepted, admission, review };
  }

  private continuationReceiptFor(hash: string): string {
    return `vcont1:${hash}:${createHmac("sha256", this.key).update(`kf-visual-continuation/v1\n${hash}`, "utf8").digest("hex")}`;
  }

  private async lockContinuationScope(tx: Prisma.TransactionClient, scope: VisualReviewScope): Promise<void> {
    // Same outer order as RunStore admission: conversation advisory, tenant, workspace, then Run control locks.
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`kf-run:${scope.conversationId}`}, 0))`;
    const [tenant] = await tx.$queryRaw<{ imageEgressAllowed: boolean }[]>`SELECT "imageEgressAllowed" FROM "Tenant" WHERE "id"=${scope.tenantId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "SolutionWorkspace" WHERE "id"=${scope.workspaceId} AND "tenantId"=${scope.tenantId} FOR SHARE`;
    if (tenant?.imageEgressAllowed !== true) throw new Error("IMAGE_EGRESS_NOT_ALLOWED");
  }

  private assertContinuationIdentity(source: AgentRun, successor: AgentRun, reference: { analysisId: string; specHash: string }): void {
    const config = successor.configSnapshot as { schemaVersion?: unknown; planVersion?: unknown; flags?: { agentVisionV1?: unknown } } | null;
    const action = RunActionSchema.safeParse(successor.action);
    if (config?.schemaVersion !== 1 || config.planVersion !== VISUAL_RUN_PLAN_VERSION || config.flags?.agentVisionV1 !== true
      || canonicalServerHash(source.configSnapshot) !== canonicalServerHash(successor.configSnapshot)
      || source.mode !== "build" || successor.mode !== "build" || successor.predecessorRunId !== source.id || successor.baseRevisionId !== source.baseRevisionId
      || !action.success || action.data.type !== "accept_visual_reference" || action.data.expectedRunId !== source.id
      || action.data.analysisId !== reference.analysisId || action.data.analysisHash !== reference.specHash) throw new Error("VISUAL_CONTINUATION_IDENTITY_MISMATCH");
  }
  // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
  private assertContinuationChoices(successor: AgentRun, acceptance: VisualReviewAcceptance): void {
    const action = RunActionSchema.safeParse(successor.action);
    if (!action.success || action.data.type !== "accept_visual_reference") throw new Error("VISUAL_CONTINUATION_IDENTITY_MISMATCH");
    // Older internal proofs signed a minimal action. New public actions must bind every displayed choice.
    if (action.data.receipt === undefined && action.data.acceptedDifferences === undefined) return;
    const choices: Record<string, unknown> = { ...action.data }; delete choices.type;
    const parsed = VisualReviewAcceptanceSchema.safeParse(choices);
    if (!parsed.success || canonicalServerHash(parsed.data) !== canonicalServerHash(acceptance)) throw new Error("VISUAL_CONTINUATION_IDENTITY_MISMATCH");
  }
  // end
  // end

  private async lockRun(tx: Prisma.TransactionClient, scope: { tenantId: string; workspaceId: string }, runId: string): Promise<AgentRun | undefined> {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`kf-run-control:${runId}`}, 0))`;
    const [run] = await tx.$queryRaw<AgentRun[]>`SELECT * FROM "AgentRun" WHERE "id"=${runId} AND "tenantId"=${scope.tenantId} AND "workspaceId"=${scope.workspaceId} FOR UPDATE`;
    return run;
  }

  private async scopedRun(tx: Prisma.TransactionClient, scope: VisualReviewScope, runId: string): Promise<AgentRun> {
    const user = await tx.user.findFirst({ where: { id: scope.userId, tenantId: scope.tenantId }, select: { id: true } });
    if (!user) throw new Error("VISUAL_REVIEW_NOT_FOUND");
    const run = await this.lockRun(tx, scope, runId);
    if (!run || run.conversationId !== scope.conversationId) throw new Error("VISUAL_REVIEW_NOT_FOUND");
    return run;
  }

  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  private async resolveWorkspaceDataSnapshots(tx: Prisma.TransactionClient, run: AgentRun, spec: VisualReferenceSpec) {
    const regions = spec.regions.filter(region => region.dataRequirement !== undefined);
    if (!regions.length) return [];
    const workspace = await tx.solutionWorkspace.findFirst({ where: { tenantId: run.tenantId, id: run.workspaceId }, select: { name: true } });
    if (!workspace) throw new Error("VISUAL_REVIEW_REVISION_INVALID");
    return regions.map(region => {
      const snapshot = VisualWorkspaceDataSnapshotSchema.safeParse({ regionId: region.id, kind: "workspace-field", field: "name", value: workspace.name });
      if (!snapshot.success) throw new Error("VISUAL_REVIEW_REVISION_INVALID");
      return snapshot.data;
    });
  }
  // end
  private async assertBase(tx: Prisma.TransactionClient, run: AgentRun): Promise<void> {
    const workspace = await tx.solutionWorkspace.findFirst({ where: { tenantId: run.tenantId, id: run.workspaceId }, select: { currentRevisionId: true, generationWorkflow: true } });
    if (!workspace || workspace.generationWorkflow !== "creative-v2" || !run.baseRevisionId || workspace.currentRevisionId !== run.baseRevisionId) throw new Error("STALE_BASE_REVISION");
  }

  private async loadCurrentAnalysis(tx: Prisma.TransactionClient, run: AgentRun, analysisId: string, expectedHash: string) {
    // Hold until admission commit: a new child's parent FK check serializes corrections behind this lock.
    await tx.$queryRaw`SELECT "id" FROM "VisualReferenceAnalysis" WHERE "id"=${analysisId} AND "tenantId"=${run.tenantId} AND "workspaceId"=${run.workspaceId} FOR UPDATE`;
    const row = await tx.visualReferenceAnalysis.findFirst({ where: { id: analysisId, tenantId: run.tenantId, workspaceId: run.workspaceId, status: "VALID" } });
    if (!row) throw new Error("VISUAL_ANALYSIS_NOT_FOUND");
    const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT (clock_timestamp() AT TIME ZONE 'UTC') AS now`;
    if (!clock || row.expiresAt <= clock.now || row.specHash !== expectedHash
      || await tx.visualReferenceAnalysis.findFirst({ where: { parentId: row.id }, select: { id: true } })) throw new Error("VISUAL_ANALYSIS_STALE");
    const parsed = VisualReferenceSpecSchema.safeParse(row.spec);
    if (!parsed.success || canonicalServerHash(parsed.data) !== row.specHash || parsed.data.sourceAssetId !== row.assetId || parsed.data.sourceHash !== row.sourceHash) throw new Error("VISUAL_ANALYSIS_INTEGRITY_FAILED");
    const admission = await readVisualRunAdmission(tx, run);
    if (admission) {
      const attachment = admission.content.attachments.find(image => image.assetId === row.assetId);
      if (!attachment || attachment.sourceHash !== row.sourceHash || attachment.derivative.hash !== row.derivativeHash
        || parsed.data.viewport.width !== attachment.derivative.width || parsed.data.viewport.height !== attachment.derivative.height
        || admission.content.instructionHash !== row.instructionHash || admission.content.analysisModel.configHash !== row.modelConfigHash
        || admission.content.analysisModel.analysisVersion !== row.analysisVersion) throw new Error("VISUAL_REVIEW_ADMISSION_MISMATCH");
    }
    return { row, spec: parsed.data };
  }

  private async readWaitingReview(tx: Prisma.TransactionClient, run: AgentRun): Promise<VisualReview> {
    if (run.status !== "WAITING_INPUT" || run.supersededByRunId || run.cancelRequestedAt || run.buildJobId) throw new Error("VISUAL_REVIEW_NOT_WAITING");
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    return this.readReviewFacts(tx, run);
  }

  private async readReviewFacts(tx: Prisma.TransactionClient, run: AgentRun): Promise<VisualReview> {
    // Shared authenticity/current-fact checks; only the caller decides whether the source must still be waiting.
    // end
    const rows = await tx.agentRunStep.findMany({ where: { runId: run.id, tenantId: run.tenantId, stepKey: STEP_KEY, status: "COMPLETED" } });
    let review: VisualReview;
    try { review = VisualReviewSchema.parse(JSON.parse(rows.length === 1 ? rows[0]!.outputRef ?? "null" : "null") as unknown); }
    catch { throw new Error("VISUAL_REVIEW_INTEGRITY_FAILED"); }
    const content = review.content;
    // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
    validateVisualDataSnapshots(content.reference);
    // end
    if (rows[0]!.inputHash !== review.reviewHash || canonicalServerHash(content) !== review.reviewHash || !secureEqual(review.receipt, this.receiptFor(review.reviewHash))
      || content.tenantId !== run.tenantId || content.workspaceId !== run.workspaceId || content.conversationId !== run.conversationId || content.runId !== run.id
      || content.baseRevisionId !== run.baseRevisionId || content.configHash !== canonicalServerHash(run.configSnapshot)
      || content.knowledgeHash !== canonicalServerHash(getDesignKnowledgeSnapshot())) throw new Error("VISUAL_REVIEW_INTEGRITY_FAILED");
    const pending = await tx.agentRunEvent.findFirst({ where: { runId: run.id, tenantId: run.tenantId, type: "input.required" }, orderBy: { seq: "desc" } });
    if ((pending?.payload as { receipt?: unknown } | undefined)?.receipt !== review.receipt) throw new Error("VISUAL_REVIEW_INTEGRITY_FAILED");
    await this.assertBase(tx, run);
    const analysis = await this.loadCurrentAnalysis(tx, run, content.reference.analysisId, content.reference.specHash);
    if (analysis.row.modelConfigHash !== content.analysisModelConfigHash || analysis.row.derivativeHash !== content.derivativeHash) throw new Error("VISUAL_REVIEW_INTEGRITY_FAILED");
    // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
    if (content.revision) {
      const history = await tx.agentRunStep.findMany({ where: { tenantId: run.tenantId, runId: run.id,
        stepKey: `visual-review-history-v1:${content.revision.previousReviewHash}`, status: "COMPLETED" } });
      let previous: VisualReview;
      try { previous = VisualReviewSchema.parse(JSON.parse(history.length === 1 ? history[0]!.outputRef ?? "null" : "null") as unknown); }
      catch { throw new Error("VISUAL_REVIEW_INTEGRITY_FAILED"); }
      if (history[0]!.inputHash !== previous.reviewHash || previous.reviewHash !== content.revision.previousReviewHash
        || canonicalServerHash(previous.content) !== previous.reviewHash || !secureEqual(previous.receipt, this.receiptFor(previous.reviewHash))
        || previous.content.runId !== run.id || previous.content.tenantId !== run.tenantId
        || previous.content.workspaceId !== run.workspaceId || previous.content.conversationId !== run.conversationId
        || previous.content.baseRevisionId !== run.baseRevisionId || previous.content.configHash !== content.configHash
        || content.revision.actorUserId !== run.requestedByUserId || analysis.row.parentId !== previous.content.reference.analysisId) {
        throw new Error("VISUAL_REVIEW_INTEGRITY_FAILED");
      }
    }
    // end
    return review;
  }
}

function secureEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8"); const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
// end
