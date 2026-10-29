// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { createHmac, timingSafeEqual } from "node:crypto";
import type { AgentRun, Prisma, PrismaClient } from "@prisma/client";
import { currentAgentRunExecution } from "@kf/build-jobs";
import { decodeBlueprintMessage, encodeBlueprintMessage, encodeBlueprintConfirmation, hashDesignPlan } from "@kf/agent-orchestrator";
import { canonicalServerHash, CustomerSolutionBlueprintSchema, RunActionSchema, VISUAL_RUN_PLAN_VERSION,
  VisualBlueprintReviewContentSchema, VisualBlueprintReviewSchema, VisualEngineeringContinuationContentSchema,
  VisualEngineeringContinuationSchema, VisualEngineeringInputSnapshotSchema,
  type CustomerSolutionBlueprint, type VisualBlueprintReview, type VisualEngineeringContinuation, type ModelRoute } from "@kf/contracts";
import { freezeVisualSemanticModel } from "./visual-semantic-request.js";
import type { VisualReviewScope, VisualReviewService } from "./visual-review.service.js";
import { lockActiveVisualRun } from "./visual-analysis-input.js";
import { buildVisualBlueprintRequest } from "./visual-blueprint-request.js";
// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { resolveVisualBlueprintSources } from "@kf/contracts";
// end
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { inspectVisualBlueprintObservations } from "./visual-blueprint-observations.js";
// end

const REVIEW_STEP = "visual-blueprint-review-v1";
const ENGINEERING_STEP = "visual-engineering-continuation-v1";
type Reader = Pick<VisualReviewService, "readContinuationInTransaction">;
type Restored = Awaited<ReturnType<Reader["readContinuationInTransaction"]>>;
export type PrepareVisualBlueprintReview = { runId: string; blueprint: CustomerSolutionBlueprint; revision: number;
  designPlanHash: string; visualConfirmationHash: string };

/** Server authority over the exact displayed blueprint; all ancestry checks retain the original lock order. */
export class VisualBlueprintAuthority {
  private readonly key: Buffer;
  private readonly semanticRoute: ModelRoute | undefined;
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  constructor(private readonly prisma: PrismaClient, private readonly reviews: Reader, key: Uint8Array, semanticRoute?: ModelRoute,
    private readonly semanticRepairPolicy: "none" | "once" = "none") {
    this.key = Buffer.from(key); this.semanticRoute = semanticRoute ? structuredClone(semanticRoute) : undefined;
  }
  // end

  async prepare(input: PrepareVisualBlueprintReview): Promise<VisualBlueprintReview> {
    const execution = currentAgentRunExecution();
    if (!execution || execution.runId !== input.runId) throw new Error("VISUAL_RUN_REQUIRED");
    execution.signal.throwIfAborted();
    const candidate = await this.prisma.agentRun.findFirst({ where: { id: input.runId, tenantId: execution.tenantId } });
    if (!candidate) throw new Error("VISUAL_BLUEPRINT_REVIEW_NOT_FOUND");
    const scope = { tenantId: candidate.tenantId, workspaceId: candidate.workspaceId,
      conversationId: candidate.conversationId, userId: candidate.requestedByUserId };
    return this.prisma.$transaction(async tx => {
      const restored = await this.reviews.readContinuationInTransaction(tx, scope, candidate.id);
      const run = await lockActiveVisualRun(tx, { tenantId: scope.tenantId, workspaceId: scope.workspaceId, runId: candidate.id });
      const blueprint = CustomerSolutionBlueprintSchema.parse(input.blueprint);
      if (!Number.isInteger(input.revision) || input.revision < 1 || hashDesignPlan(blueprint, input.revision) !== input.designPlanHash
        || input.visualConfirmationHash !== restored.accepted.confirmationHash) throw new Error("VISUAL_BLUEPRINT_REVIEW_MISMATCH");
      await this.assertModelResult(tx, restored, blueprint);
      const messages = await tx.message.findMany({ where: { tenantId: run.tenantId, conversationId: run.conversationId, runId: run.id, role: "assistant" },
        select: { id: true, content: true } });
      const displayed = messages.filter(message => decodeBlueprintMessage(message.content) !== null);
      if (displayed.length !== 1 || displayed[0]!.content !== encodeBlueprintMessage(blueprint, input.revision, input.designPlanHash)) throw new Error("VISUAL_BLUEPRINT_MESSAGE_MISMATCH");
      const content = VisualBlueprintReviewContentSchema.parse({ schema: "kf-visual-blueprint-review/v1", ...this.identity(run),
        sourceContinuationHash: restored.snapshot.inputHash, visualConfirmationHash: restored.accepted.confirmationHash,
        blueprint, revision: input.revision, designPlanHash: input.designPlanHash,
        blueprintReceipt: encodeBlueprintConfirmation(input.revision, input.designPlanHash), messageId: displayed[0]!.id,
        execution: { ownerId: execution.ownerId, fence: execution.fence } });
      const rows = await tx.agentRunStep.findMany({ where: { tenantId: run.tenantId, runId: run.id, stepKey: REVIEW_STEP } });
      if (rows.length) {
        const existing = await this.readReview(tx, run, restored, false);
        // A new lease may finish the original pause, but may not change what the user saw.
        if (canonicalServerHash({ ...content, execution: undefined }) !== canonicalServerHash({ ...existing.content, execution: undefined })) throw new Error("VISUAL_BLUEPRINT_REVIEW_MISMATCH");
        return existing;
      }
      const inputHash = canonicalServerHash(content);
      const review = VisualBlueprintReviewSchema.parse({ content, inputHash, receipt: this.sign("vbpr1", inputHash) });
      execution.signal.throwIfAborted();
      await tx.agentRunStep.create({ data: { tenantId: run.tenantId, runId: run.id, stepKey: REVIEW_STEP,
        status: "COMPLETED", inputHash, outputRef: JSON.stringify(review) } });
      return review;
    });
  }

  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  /** Caller creates the candidate in this transaction; public Store owns runtime readiness, message/budget/queue and rollback. */
  // end
  async freeze(tx: Prisma.TransactionClient, scope: VisualReviewScope, successorId: string, sourceRunId: string): Promise<VisualEngineeringContinuation> {
    // Authenticate/lock original image then blueprint Run, never lock the new candidate first.
    const restored = await this.reviews.readContinuationInTransaction(tx, scope, sourceRunId);
    const source = await this.lockRun(tx, scope, sourceRunId);
    const successor = await this.lockRun(tx, scope, successorId);
    this.assertIdentity(source, successor, scope);
    if (successor.inputSnapshot !== null || await tx.agentRunStep.count({ where: { tenantId: scope.tenantId, runId: successorId, stepKey: ENGINEERING_STEP } })) {
      return (await this.read(tx, scope, successorId)).snapshot;
    }
    if (source.status !== "WAITING_INPUT" || source.cancelRequestedAt || source.supersededByRunId || source.buildJobId) throw new Error("VISUAL_BLUEPRINT_NOT_WAITING");
    if (successor.status !== "QUEUED" || successor.startedAt || successor.fence !== 0 || successor.leaseOwner || successor.leaseExpiresAt
      || successor.cancelRequestedAt || successor.supersededByRunId || successor.buildJobId || successor.retryOfRunId) throw new Error("VISUAL_ENGINEERING_NOT_QUEUED");
    const review = await this.readReview(tx, source, restored, true);
    const action = RunActionSchema.parse(successor.action);
    if (action.type !== "confirm_blueprint" || action.receipt !== review.content.blueprintReceipt) throw new Error("BLUEPRINT_RECEIPT_MISMATCH");
    const content = VisualEngineeringContinuationContentSchema.parse({ schema: "kf-visual-engineering-continuation/v1", purpose: "semantic-planning",
      ...this.identity(successor), sourceRunId: source.id, sourceContinuationHash: restored.snapshot.inputHash,
      actionHash: canonicalServerHash(successor.action), requestHash: successor.requestHash, acceptedAt: new Date().toISOString(),
      accepted: restored.accepted, blueprintReview: review,
      // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
      ...(this.semanticRoute ? { semanticModel: freezeVisualSemanticModel(this.semanticRoute, this.semanticRepairPolicy) } : {}) });
      // end
    const inputHash = canonicalServerHash(content);
    const snapshot = VisualEngineeringContinuationSchema.parse({ content, inputHash, receipt: this.sign("veng1", inputHash) });
    const input = VisualEngineeringInputSnapshotSchema.parse({ attachmentIds: restored.admission.content.attachments.map(image => image.assetId),
      baseRevisionPolicy: "fixed", visualEngineering: snapshot });
    const consumed = await tx.agentRun.updateMany({ where: { id: source.id, tenantId: scope.tenantId, status: "WAITING_INPUT",
      cancelRequestedAt: null, supersededByRunId: null, buildJobId: null }, data: { status: "CANCELLED", supersededByRunId: successor.id,
      finishedAt: new Date(), lastSeq: { increment: 1 } } });
    if (consumed.count !== 1) throw new Error("VISUAL_BLUEPRINT_NOT_WAITING");
    await tx.agentRun.update({ where: { id: successor.id }, data: { inputSnapshot: input } });
    await tx.agentRunStep.create({ data: { tenantId: scope.tenantId, runId: successor.id, stepKey: ENGINEERING_STEP,
      inputHash, status: "COMPLETED", outputRef: JSON.stringify(snapshot) } });
    await tx.agentRunEvent.create({ data: { tenantId: scope.tenantId, runId: source.id, seq: source.lastSeq + 1, type: "run.cancelled", payload: {} } });
    await tx.auditLog.create({ data: { tenantId: scope.tenantId, actorUserId: scope.userId, action: "VISUAL_BLUEPRINT_CONFIRMED",
      resourceType: "AGENT_RUN", resourceId: successor.id, detail: { sourceRunId: source.id, blueprintReviewHash: review.inputHash,
        blueprintHash: review.content.designPlanHash, revision: review.content.revision, visualConfirmationHash: restored.accepted.confirmationHash, inputHash } } });
    await tx.conversation.update({ where: { id: scope.conversationId }, data: { lastActivityAt: new Date() } });
    return snapshot;
  }

  async read(tx: Prisma.TransactionClient, scope: VisualReviewScope, runId: string) {
    const candidate = await tx.agentRun.findFirst({ where: { id: runId, tenantId: scope.tenantId, workspaceId: scope.workspaceId, conversationId: scope.conversationId } });
    const discovery = VisualEngineeringInputSnapshotSchema.safeParse(candidate?.inputSnapshot);
    if (!candidate || !discovery.success) throw new Error("VISUAL_ENGINEERING_INTEGRITY_FAILED");
    const restored = await this.reviews.readContinuationInTransaction(tx, scope, discovery.data.visualEngineering.content.sourceRunId);
    const source = await this.lockRun(tx, scope, discovery.data.visualEngineering.content.sourceRunId);
    const successor = await this.lockRun(tx, scope, runId);
    const input = VisualEngineeringInputSnapshotSchema.safeParse(successor.inputSnapshot);
    if (!input.success) throw new Error("VISUAL_ENGINEERING_INTEGRITY_FAILED");
    const snapshot = input.data.visualEngineering; const content = snapshot.content;
    const rows = await tx.agentRunStep.findMany({ where: { tenantId: scope.tenantId, runId, stepKey: ENGINEERING_STEP } });
    this.assertStored(rows, snapshot, "veng1", "VISUAL_ENGINEERING_INTEGRITY_FAILED");
    this.assertIdentity(source, successor, scope);
    if (content.sourceRunId !== source.id || canonicalServerHash(this.identity(successor)) !== canonicalServerHash({
      tenantId: content.tenantId, workspaceId: content.workspaceId, conversationId: content.conversationId, runId: content.runId,
      requestedByUserId: content.requestedByUserId, baseRevisionId: content.baseRevisionId, configHash: content.configHash })
      || content.actionHash !== canonicalServerHash(successor.action) || content.requestHash !== successor.requestHash
      || source.status !== "CANCELLED" || source.supersededByRunId !== successor.id || source.cancelRequestedAt || source.buildJobId
      || content.sourceContinuationHash !== restored.snapshot.inputHash || canonicalServerHash(content.accepted) !== canonicalServerHash(restored.accepted)
      || canonicalServerHash(input.data.attachmentIds) !== canonicalServerHash(restored.admission.content.attachments.map(image => image.assetId))) throw new Error("VISUAL_ENGINEERING_INTEGRITY_FAILED");
    const review = await this.readReview(tx, source, restored, true);
    const action = RunActionSchema.parse(successor.action);
    if (canonicalServerHash(content.blueprintReview) !== canonicalServerHash(review) || action.type !== "confirm_blueprint"
      || action.receipt !== review.content.blueprintReceipt) throw new Error("VISUAL_ENGINEERING_INTEGRITY_FAILED");
    return { snapshot, accepted: restored.accepted, review, admission: restored.admission };
  }

  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  /** Immutable receipt authentication ONLY. Consumers must also prove a committed, signed build binding.
   * Never use this reader to authorize model egress, compilation or enqueue. */
  async readReceipt(tx: Prisma.TransactionClient, scope: VisualReviewScope, runId: string) {
    const discovered = await tx.agentRun.findFirst({ where: { id: runId, tenantId: scope.tenantId, workspaceId: scope.workspaceId, conversationId: scope.conversationId } });
    const discovery = VisualEngineeringInputSnapshotSchema.safeParse(discovered?.inputSnapshot);
    if (!discovery.success) throw new Error("VISUAL_ENGINEERING_INTEGRITY_FAILED");
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`kf-run:${scope.conversationId}`}, 0))`;
    const source = await this.lockRun(tx, scope, discovery.data.visualEngineering.content.sourceRunId);
    const run = await this.lockRun(tx, scope, runId);
    const input = VisualEngineeringInputSnapshotSchema.parse(run.inputSnapshot);
    const snapshot = input.visualEngineering; const content = snapshot.content;
    this.assertStored(await tx.agentRunStep.findMany({ where: { tenantId: scope.tenantId, runId, stepKey: ENGINEERING_STEP } }),
      snapshot, "veng1", "VISUAL_ENGINEERING_INTEGRITY_FAILED");
    this.assertIdentity(source, run, scope);
    if (canonicalServerHash(this.identity(run)) !== canonicalServerHash({ tenantId: content.tenantId, workspaceId: content.workspaceId,
      conversationId: content.conversationId, runId: content.runId, requestedByUserId: content.requestedByUserId,
      baseRevisionId: content.baseRevisionId, configHash: content.configHash }) || content.sourceRunId !== source.id
      || content.actionHash !== canonicalServerHash(run.action) || content.requestHash !== run.requestHash
      || source.status !== "CANCELLED" || source.supersededByRunId !== run.id || source.cancelRequestedAt || source.buildJobId
      || canonicalServerHash(input.attachmentIds) !== canonicalServerHash([content.accepted.reference.spec.sourceAssetId])) throw new Error("VISUAL_ENGINEERING_INTEGRITY_FAILED");
    const review = await this.readReview(tx, source, { snapshot: { inputHash: content.sourceContinuationHash }, accepted: content.accepted }, true);
    const action = RunActionSchema.parse(run.action);
    if (canonicalServerHash(review) !== canonicalServerHash(content.blueprintReview) || action.type !== "confirm_blueprint"
      || action.receipt !== review.content.blueprintReceipt) throw new Error("VISUAL_ENGINEERING_INTEGRITY_FAILED");
    return { run, snapshot };
  }
  // end

  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  private async readReview(tx: Prisma.TransactionClient, run: AgentRun,
    restored: { snapshot: Pick<Restored["snapshot"], "inputHash">; accepted: Restored["accepted"] }, requirePublished: boolean): Promise<VisualBlueprintReview> {
  // end
    const rows = await tx.agentRunStep.findMany({ where: { tenantId: run.tenantId, runId: run.id, stepKey: REVIEW_STEP } });
    let review: VisualBlueprintReview;
    try { review = VisualBlueprintReviewSchema.parse(JSON.parse(rows.length === 1 ? rows[0]!.outputRef ?? "null" : "null") as unknown); }
    catch { throw new Error("VISUAL_BLUEPRINT_REVIEW_INTEGRITY_FAILED"); }
    this.assertStored(rows, review, "vbpr1", "VISUAL_BLUEPRINT_REVIEW_INTEGRITY_FAILED");
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    try {
      resolveVisualBlueprintSources(review.content.blueprint, restored.accepted.reference, true);
      if (inspectVisualBlueprintObservations(review.content.blueprint, restored.accepted.reference).length) throw new Error("invalid reviewed observation");
    }
    // end
    catch { throw new Error("VISUAL_BLUEPRINT_REVIEW_INTEGRITY_FAILED"); }
    // end
    const content = review.content;
    if (canonicalServerHash(this.identity(run)) !== canonicalServerHash({ tenantId: content.tenantId, workspaceId: content.workspaceId,
      conversationId: content.conversationId, runId: content.runId, requestedByUserId: content.requestedByUserId,
      baseRevisionId: content.baseRevisionId, configHash: content.configHash })
      || content.sourceContinuationHash !== restored.snapshot.inputHash || content.visualConfirmationHash !== restored.accepted.confirmationHash
      || hashDesignPlan(content.blueprint, content.revision) !== content.designPlanHash
      || encodeBlueprintConfirmation(content.revision, content.designPlanHash) !== content.blueprintReceipt) throw new Error("VISUAL_BLUEPRINT_REVIEW_INTEGRITY_FAILED");
    const messages = await tx.message.findMany({ where: { runId: run.id, tenantId: run.tenantId, conversationId: run.conversationId, role: "assistant" }, select: { id: true, content: true } });
    const displayed = messages.filter(message => decodeBlueprintMessage(message.content) !== null);
    if (displayed.length !== 1 || displayed[0]!.id !== content.messageId
      || displayed[0]!.content !== encodeBlueprintMessage(content.blueprint, content.revision, content.designPlanHash)) throw new Error("VISUAL_BLUEPRINT_MESSAGE_MISMATCH");
    if (requirePublished) {
      const event = await tx.agentRunEvent.findFirst({ where: { tenantId: run.tenantId, runId: run.id, type: "input.required" }, orderBy: { seq: "desc" } });
      if ((event?.payload as { receipt?: unknown } | undefined)?.receipt !== content.blueprintReceipt) throw new Error("BLUEPRINT_RECEIPT_MISMATCH");
    }
    return review;
  }

  private async assertModelResult(tx: Prisma.TransactionClient, restored: Restored, blueprint: CustomerSolutionBlueprint): Promise<void> {
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    resolveVisualBlueprintSources(blueprint, restored.accepted.reference, true);
    // end
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    if (inspectVisualBlueprintObservations(blueprint, restored.accepted.reference).length) throw new Error("VISUAL_BLUEPRINT_REVIEW_MISMATCH");
    // end
    const source = await tx.agentRun.findUniqueOrThrow({ where: { id: restored.snapshot.content.sourceRunId } });
    const action = RunActionSchema.parse(source.action);
    if (action.type !== "message") throw new Error("VISUAL_BLUEPRINT_REVIEW_MISMATCH");
    const request = buildVisualBlueprintRequest(restored.snapshot, action.text);
    const rows = await tx.agentRunStep.findMany({ where: { tenantId: source.tenantId, runId: restored.snapshot.content.runId, stepKey: "visual-blueprint-result-v1" } });
    let stored: unknown;
    try { stored = CustomerSolutionBlueprintSchema.parse(JSON.parse(rows.length === 1 ? rows[0]!.outputRef ?? "null" : "null") as unknown); }
    catch { throw new Error("VISUAL_BLUEPRINT_REVIEW_MISMATCH"); }
    if (rows[0]!.status !== "COMPLETED" || rows[0]!.inputHash !== request.scope.inputHash || canonicalServerHash(stored) !== canonicalServerHash(blueprint)) throw new Error("VISUAL_BLUEPRINT_REVIEW_MISMATCH");
  }

  private assertIdentity(source: AgentRun, successor: AgentRun, scope: VisualReviewScope): void {
    const action = RunActionSchema.safeParse(successor.action);
    const config = successor.configSnapshot as { planVersion?: unknown; flags?: { agentVisionV1?: unknown } } | null;
    if (source.id === successor.id || source.requestedByUserId !== scope.userId || successor.requestedByUserId !== scope.userId
      || source.mode !== "build" || successor.mode !== "build" || !source.baseRevisionId || source.baseRevisionId !== successor.baseRevisionId
      || successor.predecessorRunId !== source.id || canonicalServerHash(source.configSnapshot) !== canonicalServerHash(successor.configSnapshot)
      || config?.planVersion !== VISUAL_RUN_PLAN_VERSION || config.flags?.agentVisionV1 !== true || successor.retryOfRunId
      || !action.success || action.data.type !== "confirm_blueprint" || action.data.expectedRunId !== source.id) throw new Error("VISUAL_ENGINEERING_IDENTITY_MISMATCH");
  }
  private identity(run: AgentRun) {
    return { tenantId: run.tenantId, workspaceId: run.workspaceId, conversationId: run.conversationId, runId: run.id,
      requestedByUserId: run.requestedByUserId, baseRevisionId: run.baseRevisionId, configHash: canonicalServerHash(run.configSnapshot) };
  }
  private async lockRun(tx: Prisma.TransactionClient, scope: VisualReviewScope, id: string): Promise<AgentRun> {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`kf-run-control:${id}`}, 0))`;
    const [row] = await tx.$queryRaw<AgentRun[]>`SELECT * FROM "AgentRun" WHERE "id"=${id} AND "tenantId"=${scope.tenantId}
      AND "workspaceId"=${scope.workspaceId} AND "conversationId"=${scope.conversationId} FOR UPDATE`;
    if (!row) throw new Error("VISUAL_BLUEPRINT_REVIEW_NOT_FOUND");
    return row;
  }
  private sign(prefix: "vbpr1" | "veng1", inputHash: string): string {
    const domain = prefix === "vbpr1" ? "kf-visual-blueprint-review/v1" : "kf-visual-engineering-continuation/v1";
    return `${prefix}:${inputHash}:${createHmac("sha256", this.key).update(`${domain}\n${inputHash}`, "utf8").digest("hex")}`;
  }
  private assertStored(rows: { status: string; inputHash: string; outputRef: string | null }[],
    value: { content: unknown; inputHash: string; receipt: string }, prefix: "vbpr1" | "veng1", code: string): void {
    let stored: unknown;
    try { stored = JSON.parse(rows.length === 1 ? rows[0]!.outputRef ?? "null" : "null") as unknown; }
    catch { throw new Error(code); }
    const signature = Buffer.from(this.sign(prefix, value.inputHash), "utf8"); const actual = Buffer.from(value.receipt, "utf8");
    if (rows.length !== 1 || rows[0]!.status !== "COMPLETED" || rows[0]!.inputHash !== value.inputHash
      || canonicalServerHash(stored) !== canonicalServerHash(value) || canonicalServerHash(value.content) !== value.inputHash
      || signature.length !== actual.length || !timingSafeEqual(signature, actual)) throw new Error(code);
  }
}
// end
