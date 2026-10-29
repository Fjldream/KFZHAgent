// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { canonicalServerHash, FrozenVisualModelRouteSchema, FrozenVisualReferenceSchema, RunActionSchema,
  VisualRunAdmissionRequestSchema, VisualRunAdmissionSnapshotSchema, VisualRunInputSnapshotSchema,
  VISUAL_EGRESS_NOTICE, VISUAL_EGRESS_NOTICE_VERSION, VISUAL_RUN_PLAN_VERSION,
  type FrozenVisualReference, type ModelRoute, type VisualRunAdmissionSnapshot } from "@kf/contracts";
import type { AgentRun, Prisma } from "@prisma/client";
import { PROMPT_VERSIONS } from "../models/task-prompts.js";
import { VISUAL_ANALYSIS_VERSION, visualModelConfigHash } from "./visual-analysis-request.js";

const STEP_KEY = "visual-run-admission-v1";
type AdmissionScope = { tenantId: string; workspaceId: string; conversationId: string; userId: string };
function hasOwn(value: unknown, key: string): boolean { return value !== null && typeof value === "object" && Object.hasOwn(value, key); }
function protocolValid(run: AgentRun): boolean {
  const config = run.configSnapshot as { schemaVersion?: unknown; planVersion?: unknown } | null;
  return config?.schemaVersion === 1 && config.planVersion === VISUAL_RUN_PLAN_VERSION;
}

/** Caller MUST use the Run creation transaction. This does not enable admission or start execution. */
export class VisualRunAdmissionService {
  private readonly route: ModelRoute;
  constructor(route: ModelRoute) { this.route = structuredClone(route); }

  async freezeInTransaction(tx: Prisma.TransactionClient, scope: AdmissionScope, runId: string, body: unknown): Promise<VisualRunAdmissionSnapshot> {
    const request = VisualRunAdmissionRequestSchema.safeParse(body);
    if (!request.success) throw new BadRequestException("VISUAL_ADMISSION_INVALID");
    // Keep the tenant/workspace order used by reference upload/deletion, before the Run control lock.
    const [tenant] = await tx.$queryRaw<{ imageEgressAllowed: boolean }[]>`SELECT "imageEgressAllowed" FROM "Tenant" WHERE "id"=${scope.tenantId} FOR UPDATE`;
    const [workspace] = await tx.$queryRaw<{ currentRevisionId: string | null; generationWorkflow: string }[]>`SELECT "currentRevisionId", "generationWorkflow"
      FROM "SolutionWorkspace" WHERE "id"=${scope.workspaceId} AND "tenantId"=${scope.tenantId} FOR SHARE`;
    const actor = await tx.user.findFirst({ where: { id: scope.userId, tenantId: scope.tenantId }, select: { id: true } });
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`kf-run-control:${runId}`}, 0))`;
    const [run] = await tx.$queryRaw<AgentRun[]>`SELECT * FROM "AgentRun" WHERE "id"=${runId} AND "tenantId"=${scope.tenantId}
      AND "workspaceId"=${scope.workspaceId} AND "conversationId"=${scope.conversationId} FOR UPDATE`;
    if (!actor || !workspace || !run || run.requestedByUserId !== scope.userId) throw new NotFoundException("VISUAL_ADMISSION_NOT_FOUND");
    if (tenant?.imageEgressAllowed !== true) throw new ForbiddenException("IMAGE_EGRESS_NOT_ALLOWED");
    if (!protocolValid(run)) throw new ConflictException("VISUAL_ADMISSION_PROTOCOL_INVALID");
    if (run.status !== "QUEUED" || run.startedAt || run.leaseOwner || run.fence !== 0 || run.cancelRequestedAt || run.supersededByRunId || run.buildJobId) {
      throw new ConflictException("VISUAL_ADMISSION_NOT_QUEUED");
    }
    if (workspace.generationWorkflow !== "creative-v2") throw new ConflictException("VISUAL_ADMISSION_WORKFLOW_INVALID");
    if (!run.baseRevisionId || workspace.currentRevisionId !== run.baseRevisionId) throw new ConflictException("VISUAL_ADMISSION_BASE_CHANGED");
    const action = RunActionSchema.safeParse(run.action);
    const input = VisualRunInputSnapshotSchema.safeParse(run.inputSnapshot);
    if (!input.success || !action.success || action.data.type !== "message" || !["discuss", "plan", "build"].includes(run.mode)
      || Buffer.byteLength(action.data.text, "utf8") > 16 * 1024
      || canonicalServerHash(input.data.attachmentIds) !== canonicalServerHash(request.data.attachmentIds)) {
      throw new BadRequestException("VISUAL_ADMISSION_INPUT_MISMATCH");
    }
    const route = FrozenVisualModelRouteSchema.safeParse(this.route);
    if (!route.success) throw new BadRequestException("VISUAL_ADMISSION_MODEL_INVALID");
    const attachments = await readReferenceMetadata(tx, run, request.data.attachmentIds, request.data.primaryAssetId);
    const existing = await readVisualRunAdmission(tx, run, true);
    const content = { schema: "kf-visual-run-admission/v1", tenantId: run.tenantId, workspaceId: run.workspaceId, conversationId: run.conversationId,
      runId: run.id, requestedByUserId: run.requestedByUserId, baseRevisionId: run.baseRevisionId, mode: run.mode, runConfigHash: canonicalServerHash(run.configSnapshot),
      actionHash: canonicalServerHash(run.action), instructionHash: canonicalServerHash(action.data.text), attachments,
      analysisModel: { route: route.data, configHash: visualModelConfigHash(route.data), promptVersion: PROMPT_VERSIONS.vision, analysisVersion: VISUAL_ANALYSIS_VERSION },
      sendingConsent: { noticeVersion: VISUAL_EGRESS_NOTICE_VERSION, noticeHash: canonicalServerHash(VISUAL_EGRESS_NOTICE), userId: scope.userId,
        acceptedAt: existing?.content.sendingConsent.acceptedAt ?? new Date().toISOString(),
        coverage: "reference-images-and-derived-structure", attachmentSetHash: canonicalServerHash(attachments) } };
    const snapshot = VisualRunAdmissionSnapshotSchema.parse({ content, inputHash: canonicalServerHash(content) });
    if (existing) {
      if (existing.inputHash !== snapshot.inputHash) throw new ConflictException("VISUAL_ADMISSION_INPUT_CHANGED");
      return existing;
    }
    await tx.agentRun.update({ where: { id: run.id }, data: { inputSnapshot: { ...input.data, visualAdmission: snapshot } } });
    await tx.agentRunStep.create({ data: { tenantId: run.tenantId, runId: run.id, stepKey: STEP_KEY,
      inputHash: snapshot.inputHash, status: "COMPLETED", outputRef: JSON.stringify(snapshot) } });
    await tx.auditLog.create({ data: { tenantId: run.tenantId, actorUserId: scope.userId, action: "VISUAL_INPUT_FROZEN", resourceType: "AGENT_RUN", resourceId: run.id,
      detail: { inputHash: snapshot.inputHash, attachmentCount: attachments.length, primaryAssetId: request.data.primaryAssetId,
        noticeVersion: VISUAL_EGRESS_NOTICE_VERSION, analysisModelConfigHash: snapshot.content.analysisModel.configHash } } });
    return snapshot;
  }
}

/** Called under the existing execution/control lock; no legacy fallback when visual state exists. */
export async function readVisualRunAdmission(tx: Prisma.TransactionClient, run: AgentRun, allowUnfrozen = false): Promise<VisualRunAdmissionSnapshot | null> {
  const present = hasOwn(run.inputSnapshot, "visualAdmission");
  const steps = await tx.agentRunStep.findMany({ where: { tenantId: run.tenantId, runId: run.id, stepKey: STEP_KEY } });
  if (!present && steps.length === 0) {
    if (protocolValid(run) && !allowUnfrozen) throw new ConflictException("VISUAL_RUN_INPUT_REQUIRED");
    return null;
  }
  const input = VisualRunInputSnapshotSchema.safeParse(run.inputSnapshot);
  if (!protocolValid(run) || !input.success || !input.data.visualAdmission || steps.length !== 1) throw new ConflictException("VISUAL_RUN_INPUT_INVALID");
  const snapshot = input.data.visualAdmission;
  const content = snapshot.content;
  const step = steps[0]!;
  const action = RunActionSchema.safeParse(run.action);
  if (step.status !== "COMPLETED" || step.inputHash !== snapshot.inputHash || canonicalServerHash(content) !== snapshot.inputHash
    || content.runId !== run.id || content.tenantId !== run.tenantId || content.workspaceId !== run.workspaceId || content.conversationId !== run.conversationId
    || content.requestedByUserId !== run.requestedByUserId || content.baseRevisionId !== run.baseRevisionId || content.mode !== run.mode
    || content.runConfigHash !== canonicalServerHash(run.configSnapshot) || content.actionHash !== canonicalServerHash(run.action)
    || !action.success || action.data.type !== "message" || content.instructionHash !== canonicalServerHash(action.data.text)
    || content.sendingConsent.noticeHash !== canonicalServerHash(VISUAL_EGRESS_NOTICE)
    || content.sendingConsent.attachmentSetHash !== canonicalServerHash(content.attachments)
    || canonicalServerHash(content.attachments.map(image => image.assetId)) !== canonicalServerHash(input.data.attachmentIds)) {
    throw new ConflictException("VISUAL_RUN_INPUT_INVALID");
  }
  try {
    const saved = VisualRunAdmissionSnapshotSchema.parse(JSON.parse(step.outputRef ?? "null") as unknown);
    if (canonicalServerHash(saved) !== canonicalServerHash(snapshot)) throw new Error("mismatch");
  } catch { throw new ConflictException("VISUAL_RUN_INPUT_INVALID"); }
  if (content.analysisModel.configHash !== visualModelConfigHash(content.analysisModel.route) || content.analysisModel.promptVersion !== PROMPT_VERSIONS.vision) {
    throw new ConflictException("VISUAL_MODEL_CONFIG_CHANGED");
  }
  const primary = content.attachments.find(image => image.role === "primary")!;
  const current = await readReferenceMetadata(tx, run, input.data.attachmentIds, primary.assetId);
  if (canonicalServerHash(current) !== canonicalServerHash(content.attachments)) throw new ConflictException("VISUAL_REFERENCE_INPUT_CHANGED");
  return snapshot;
}

async function readReferenceMetadata(tx: Prisma.TransactionClient, run: AgentRun, assetIds: string[], primaryAssetId: string): Promise<FrozenVisualReference[]> {
  const rows = await tx.referenceAsset.findMany({ where: { tenantId: run.tenantId, workspaceId: run.workspaceId, id: { in: assetIds } }, include: { derivative: true } });
  return assetIds.map(assetId => {
    const row = rows.find(image => image.id === assetId);
    if (!row || !row.derivative) throw new NotFoundException("VISUAL_REFERENCE_NOT_FOUND");
    const derivative = row.derivative;
    const transform = derivative.transform as { scale?: unknown };
    const parsed = FrozenVisualReferenceSchema.safeParse({ assetId, role: assetId === primaryAssetId ? "primary" : "supplement",
      sourceHash: row.sourceHash, sourceMimeType: row.mimeType, sourceWidth: row.width, sourceHeight: row.height, sourceBytes: row.byteSize,
      derivative: { hash: derivative.derivativeHash, mimeType: derivative.mimeType, width: derivative.width, height: derivative.height,
        byteSize: derivative.byteSize, scale: transform?.scale, transform: derivative.transform } });
    if (!parsed.success || derivative.tenantId !== run.tenantId || derivative.workspaceId !== run.workspaceId || derivative.sourceHash !== row.sourceHash) {
      throw new ConflictException("VISUAL_REFERENCE_INPUT_INVALID");
    }
    return parsed.data;
  });
}
// end
