// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { BadRequestException, ConflictException, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { canonicalServerHash, VisualAnalysisConfigSnapshotSchema, VisualAnalysisImageSnapshotSchema } from "@kf/contracts";
import { currentAgentRunExecution } from "@kf/build-jobs";
import type { AgentRun, Prisma } from "@prisma/client";
import type { TrustedReferenceImage } from "./reference-asset.service.js";
import type { VisualAnalysisInput } from "./visual-analysis.service.js";
import { readVisualRunAdmission } from "./visual-run-admission.js";
import type { ModelRoute } from "@kf/contracts";

/** Restore a trusted frozen analysis route, never a browser-supplied provider URL. */
export async function resolveVisualAnalysisRoute(tx: Prisma.TransactionClient, run: AgentRun, input: VisualAnalysisInput, fallback: ModelRoute): Promise<ModelRoute> {
  const frozen = await readVisualRunAdmission(tx, run);
  if (!frozen) return fallback;
  if (!frozen.content.attachments.some(image => image.assetId === input.assetId)
    || frozen.content.instructionHash !== canonicalServerHash(input.instruction)
    || frozen.content.analysisModel.analysisVersion !== input.analysisVersion) throw new ConflictException("VISUAL_REFERENCE_INPUT_CHANGED");
  return frozen.content.analysisModel.route;
}

/** Read the real clock AFTER taking the same control/row locks as cancellation and publication. */
export async function lockActiveVisualRun(tx: Prisma.TransactionClient, input: Pick<VisualAnalysisInput, "tenantId" | "workspaceId" | "runId">): Promise<AgentRun> {
  const scope = currentAgentRunExecution();
  if (!scope || scope.tenantId !== input.tenantId || scope.runId !== input.runId) throw new ConflictException("VISUAL_RUN_REQUIRED");
  if (scope.signal.aborted) throw new BadRequestException("MODEL_CANCELLED");
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`kf-run-control:${input.runId}`}, 0))`;
  const [run] = await tx.$queryRaw<AgentRun[]>`SELECT * FROM "AgentRun" WHERE "id"=${input.runId} AND "tenantId"=${input.tenantId}
    AND "workspaceId"=${input.workspaceId} FOR UPDATE`;
  if (!run) throw new NotFoundException("run");
  const [clock] = await tx.$queryRaw<{ active: boolean }[]>`SELECT "leaseExpiresAt" > (clock_timestamp() AT TIME ZONE 'UTC') AS active FROM "AgentRun" WHERE "id"=${run.id}`;
  if (run.status !== "RUNNING" || run.cancelRequestedAt || run.supersededByRunId || run.buildJobId
    || run.leaseOwner !== scope.ownerId || run.fence !== scope.fence || clock?.active !== true) throw new ConflictException("VISUAL_RUN_NOT_ACTIVE");
  return run;
}

/** Pin settings before the first image call. Changed settings fail closed, never overwrite old identity. */
export async function pinVisualAnalysisInput(tx: Prisma.TransactionClient, run: AgentRun, input: VisualAnalysisInput,
  image: TrustedReferenceImage, modelConfigHash: string): Promise<void> {
  const frozen = await readVisualRunAdmission(tx, run);
  if (frozen) {
    const attachment = frozen.content.attachments.find(reference => reference.assetId === image.assetId);
    if (frozen.content.analysisModel.configHash !== modelConfigHash) throw new ConflictException("VISUAL_MODEL_CONFIG_CHANGED");
    if (!attachment || image.tenantId !== run.tenantId || image.workspaceId !== run.workspaceId || input.assetId !== image.assetId
      || input.analysisVersion !== frozen.content.analysisModel.analysisVersion || frozen.content.instructionHash !== canonicalServerHash(input.instruction)
      || attachment.sourceHash !== image.sourceHash || attachment.derivative.hash !== image.derivativeHash
      || attachment.derivative.mimeType !== image.mimeType || attachment.derivative.width !== image.width || attachment.derivative.height !== image.height
      || attachment.derivative.scale !== image.scale || attachment.derivative.byteSize !== image.bytes.byteLength) {
      throw new ConflictException("VISUAL_REFERENCE_INPUT_CHANGED");
    }
  }
  const scope = { tenantId: run.tenantId, workspaceId: run.workspaceId, conversationId: run.conversationId, runId: run.id,
    baseRevisionId: run.baseRevisionId, runConfigHash: canonicalServerHash(run.configSnapshot) };
  const configuration = VisualAnalysisConfigSnapshotSchema.parse({ schema: "kf-visual-analysis-config/v1", ...scope,
    analysisVersion: input.analysisVersion, modelConfigHash });
  await pinStep(tx, run, "visual-analysis-config-v1", configuration, VisualAnalysisConfigSnapshotSchema, "VISUAL_MODEL_CONFIG_CHANGED");
  const stepKey = `visual-analysis-image-${canonicalServerHash(image.assetId)}`;
  const frozenImage = VisualAnalysisImageSnapshotSchema.parse({ schema: "kf-visual-analysis-image/v1", ...scope, modelConfigHash,
    assetId: image.assetId, sourceHash: image.sourceHash, derivativeHash: image.derivativeHash,
    mimeType: image.mimeType, width: image.width, height: image.height, scale: image.scale, instructionHash: canonicalServerHash(input.instruction) });
  await pinStep(tx, run, stepKey, frozenImage, VisualAnalysisImageSnapshotSchema, "VISUAL_REFERENCE_INPUT_CHANGED");
}

async function pinStep(tx: Prisma.TransactionClient, run: AgentRun, stepKey: string, content: unknown,
  schema: { parse(value: unknown): unknown }, mismatchCode: string): Promise<void> {
  const expectedHash = canonicalServerHash(content);
  const existing = await tx.agentRunStep.findMany({ where: { tenantId: run.tenantId, runId: run.id, stepKey } });
  if (existing.length > 0) {
    if (existing.length !== 1) throw new UnprocessableEntityException("VISUAL_ANALYSIS_INPUT_CORRUPT");
    const row = existing[0]!;
    let stored: unknown;
    try { stored = schema.parse(JSON.parse(row.outputRef ?? "null") as unknown); }
    catch { throw new UnprocessableEntityException("VISUAL_ANALYSIS_INPUT_CORRUPT"); }
    if (row.status !== "COMPLETED" || canonicalServerHash(stored) !== row.inputHash) throw new UnprocessableEntityException("VISUAL_ANALYSIS_INPUT_CORRUPT");
    if (row.inputHash !== expectedHash) throw new ConflictException(mismatchCode);
    return;
  }
  await tx.agentRunStep.create({ data: { tenantId: run.tenantId, runId: run.id, stepKey, inputHash: expectedHash,
    status: "COMPLETED", outputRef: JSON.stringify(content) } });
}
// end
