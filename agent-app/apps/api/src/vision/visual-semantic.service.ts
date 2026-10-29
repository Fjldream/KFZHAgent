// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import type { PrismaClient, Prisma } from "@prisma/client";
import { currentAgentRunExecution, withAgentRunNode } from "@kf/build-jobs";
import { canonicalServerHash, ApprovedAssetFactsSchema, AssetRecordSchema, type VisualSemanticPlan } from "@kf/contracts";
import { getDesignKnowledgeSnapshot, retrieveCapabilities } from "@kf/domain-client";
import type { ModelPortContext } from "@kf/agent-orchestrator";
import type { VisualReviewService } from "./visual-review.service.js";
import type { ModelGateway } from "../models/model-gateway.js";
import { ModelTransportError } from "../models/deepseek-transport.js";
import { lockActiveVisualRun } from "./visual-analysis-input.js";
import { buildVisualSemanticRequest, buildVisualSemanticRepairRequest } from "./visual-semantic-request.js";
import { inspectVisualSemanticResponse, validateVisualSemanticCompilation } from "./visual-semantic-output.js";
import { inspectVisualSemanticRepairResponse } from "./visual-semantic-repair.js";
import { toModelAssetId } from "../assets/model-asset-id.js";
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { resolveCreativeProjectKey } from "../conversations/creative-project-identity.js";
// end

const STEP_KEY = "visual-semantic-result-v1";
const REPAIR_STEP_KEY = "visual-semantic-repair-v1";
/** Signed blueprint continuation only. Explicit one-shot repair never falls back to text or native-code model output. */
export class VisualSemanticService {
  constructor(private readonly prisma: PrismaClient, private readonly reviews: Pick<VisualReviewService, "readEngineeringInTransaction">,
    private readonly gateway: ModelGateway, private readonly options: { allowRepair?: boolean } = {}) {}

  async createVisualSolutionImplementationPlan(input: ModelPortContext): Promise<VisualSemanticPlan> {
    return withAgentRunNode(async () => {
      const execution = currentAgentRunExecution();
      if (!execution || execution.tenantId !== input.tenantId) throw new Error("VISUAL_RUN_REQUIRED");
      execution.signal.throwIfAborted(); const token = `${execution.ownerId}:${execution.fence}`;
      const prepared = await this.prisma.$transaction(async tx => {
        const trusted = await this.prepare(tx, input, execution.runId);
        const rows = await tx.agentRunStep.findMany({ where: { tenantId: input.tenantId, runId: execution.runId, stepKey: STEP_KEY } });
        const row = rows[0];
        if (rows.length > 1 || row && (row.inputHash !== trusted.request.scope.inputHash || !["RUNNING", "COMPLETED", "FAILED"].includes(row.status))) throw new Error("VISUAL_SEMANTIC_CACHE_INVALID");
        if (row?.status === "COMPLETED") {
          let cached: VisualSemanticPlan;
          try {
            const stored: unknown = JSON.parse(row.outputRef ?? "null");
            cached = validateVisualSemanticCompilation(trusted.context, stored, trusted.approvedAssets);
            // Provider normalization is not permission to repair/rebind already committed cache facts.
            if (canonicalServerHash(stored) !== canonicalServerHash(cached)) throw new Error("changed cached result");
          }
          catch { throw new Error("VISUAL_SEMANTIC_CACHE_INVALID"); }
          return { ...trusted, cached };
        }
        if (row?.status === "RUNNING") {
          const prior = Number(row.providerAttemptId?.split(":").at(-1));
          if (!Number.isInteger(prior) || prior >= execution.fence) throw new Error("VISUAL_SEMANTIC_IN_PROGRESS");
        }
        const attempt = (row?.attempt ?? 0) + 1;
        if (row) await tx.agentRunStep.update({ where: { id: row.id }, data: { status: "RUNNING", outputRef: null, providerAttemptId: token, attempt } });
        else await tx.agentRunStep.create({ data: { tenantId: input.tenantId, runId: execution.runId, stepKey: STEP_KEY,
          inputHash: trusted.request.scope.inputHash, status: "RUNNING", providerAttemptId: token, attempt } });
        return { ...trusted, cached: null, request: { ...trusted.request, scope: { ...trusted.request.scope, attempt } } };
      });
      if (prepared.cached) return prepared.cached;
      let repairHash: string | null = null;
      try {
        const sending = await this.prisma.$transaction(tx => this.prepare(tx, input, execution.runId));
        if (sending.request.scope.inputHash !== prepared.request.scope.inputHash) throw new Error("VISUAL_SEMANTIC_CONTEXT_MISMATCH");
        execution.signal.throwIfAborted();
        const response = await this.gateway.completeJson({ ...prepared.request, signal: execution.signal });
        execution.signal.throwIfAborted();
        const inspectResponse = (value: typeof response) => inspectVisualSemanticResponse(prepared.context, value, prepared.approvedAssets);
        let checked = inspectResponse(response);
        if (!checked.inspection.ok && checked.inspection.repairable && prepared.repairPolicy === "once") {
          if (!this.options.allowRepair) throw new Error("VISUAL_SEMANTIC_REPAIR_DISABLED");
          const failedDraft = checked.raw; const feedback = checked.inspection.issues;
          const repair = buildVisualSemanticRepairRequest(prepared.request, prepared.context, failedDraft, feedback);
          await this.prisma.$transaction(async tx => {
            const current = await this.prepare(tx, input, execution.runId);
            if (current.request.scope.inputHash !== prepared.request.scope.inputHash) throw new Error("VISUAL_SEMANTIC_CONTEXT_MISMATCH");
            const base = await tx.agentRunStep.findFirst({ where: { tenantId: input.tenantId, runId: execution.runId, stepKey: STEP_KEY,
              inputHash: prepared.request.scope.inputHash, status: "RUNNING", providerAttemptId: token } });
            if (!base) throw new Error("VISUAL_SEMANTIC_STALE");
            const used = await tx.agentRunStep.count({ where: { tenantId: input.tenantId, runId: execution.runId, stepKey: REPAIR_STEP_KEY } });
            const sent = await tx.modelInvocation.count({ where: { tenantId: input.tenantId, runId: execution.runId,
              task: "repair", promptVersion: { startsWith: "visual-semantic-repair@" } } });
            if (used || sent) throw new Error("VISUAL_SEMANTIC_REPAIR_ALREADY_USED");
            await tx.agentRunStep.create({ data: { tenantId: input.tenantId, runId: execution.runId, stepKey: REPAIR_STEP_KEY,
              inputHash: repair.scope.inputHash, status: "RUNNING", providerAttemptId: token } });
          });
          repairHash = repair.scope.inputHash;
          await this.prisma.$transaction(async tx => {
            const current = await this.prepare(tx, input, execution.runId);
            if (current.request.scope.inputHash !== prepared.request.scope.inputHash) throw new Error("VISUAL_SEMANTIC_CONTEXT_MISMATCH");
            const reserved = await tx.agentRunStep.count({ where: { tenantId: input.tenantId, runId: execution.runId,
              stepKey: REPAIR_STEP_KEY, inputHash: repairHash!, status: "RUNNING", providerAttemptId: token } });
            if (reserved !== 1) throw new Error("VISUAL_SEMANTIC_REPAIR_STALE");
          });
          execution.signal.throwIfAborted();
          const repairedResponse = await this.gateway.completeJson({ ...repair, signal: execution.signal });
          execution.signal.throwIfAborted();
          checked = inspectVisualSemanticRepairResponse(prepared.context, repairedResponse, prepared.approvedAssets, failedDraft, feedback);
          execution.signal.throwIfAborted();
        }
        if (!checked.inspection.ok) throw new Error("VISUAL_SEMANTIC_OUTPUT_INVALID");
        const result = checked.inspection.result;
        return await this.prisma.$transaction(async tx => {
          const current = await this.prepare(tx, input, execution.runId);
          if (current.request.scope.inputHash !== prepared.request.scope.inputHash) throw new Error("VISUAL_SEMANTIC_CONTEXT_MISMATCH");
          execution.signal.throwIfAborted();
          // Recompile with current scoped metadata; a late asset change must not publish a stale preflight.
          validateVisualSemanticCompilation(current.context, result, current.approvedAssets);
          const saved = await tx.agentRunStep.updateMany({ where: { tenantId: input.tenantId, runId: execution.runId, stepKey: STEP_KEY,
            inputHash: prepared.request.scope.inputHash, status: "RUNNING", providerAttemptId: token }, data: { status: "COMPLETED", outputRef: JSON.stringify(result) } });
          if (saved.count !== 1) throw new Error("VISUAL_SEMANTIC_STALE");
          if (repairHash) {
            const repaired = await tx.agentRunStep.updateMany({ where: { tenantId: input.tenantId, runId: execution.runId,
              stepKey: REPAIR_STEP_KEY, inputHash: repairHash, status: "RUNNING", providerAttemptId: token },
            data: { status: "COMPLETED", outputRef: JSON.stringify({ schema: "kf-visual-semantic-repair/v1", resultHash: canonicalServerHash(result) }) } });
            if (repaired.count !== 1) throw new Error("VISUAL_SEMANTIC_REPAIR_STALE");
          }
          return result;
        });
      } catch (error) {
        await this.prisma.agentRunStep.updateMany({ where: { tenantId: input.tenantId, runId: execution.runId, stepKey: STEP_KEY,
          status: "RUNNING", providerAttemptId: token }, data: { status: "FAILED", outputRef: null } }).catch(() => undefined);
        if (repairHash) await this.prisma.agentRunStep.updateMany({ where: { tenantId: input.tenantId, runId: execution.runId,
          stepKey: REPAIR_STEP_KEY, inputHash: repairHash, status: "RUNNING", providerAttemptId: token },
        data: { status: "FAILED", outputRef: null } }).catch(() => undefined);
        if (error instanceof ModelTransportError) throw new Error(error.code);
        throw error;
      }
    });
  }

  private async prepare(tx: Prisma.TransactionClient, input: ModelPortContext, runId: string) {
    // Preserve ancestry lock order; never acquire the engineering Run before its ancestors.
    const restored = await this.reviews.readEngineeringInTransaction(tx, { tenantId: input.tenantId, workspaceId: input.workspaceId,
      conversationId: input.conversationId, userId: input.userId }, runId);
    const run = await lockActiveVisualRun(tx, { tenantId: input.tenantId, workspaceId: input.workspaceId, runId });
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    if (!run.baseRevisionId) throw new Error("VISUAL_SEMANTIC_CONTEXT_MISMATCH");
    const projectKey = await resolveCreativeProjectKey(tx, { tenantId: input.tenantId, workspaceId: input.workspaceId,
      revisionId: run.baseRevisionId, domainKind: "kingclient", defaultProjectKey: "kingclient" });
    if (input.currentProjectKey !== undefined && input.currentProjectKey !== projectKey) throw new Error("VISUAL_SEMANTIC_CONTEXT_MISMATCH");
    // end
    const blueprint = restored.review.content.blueprint;
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    const candidates = retrieveCapabilities({ blueprint, knowledge: getDesignKnowledgeSnapshot(), visualReference: restored.accepted.reference });
    // end
    const rows = await tx.workspaceAsset.findMany({ where: { tenantId: input.tenantId, workspaceId: input.workspaceId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 101 });
    const assets = AssetRecordSchema.array().max(100).parse(rows.map(row => ({ id: toModelAssetId(row.id), kind: "image", name: row.name,
      mimeType: row.mediaType, description: "Uploaded workspace image" })));
    if (rows.some(row => !["image/png", "image/jpeg", "image/webp"].includes(row.mediaType))) throw new Error("VISUAL_SEMANTIC_CONTEXT_MISMATCH");
    if (input.generationWorkflow !== "creative-v2" || input.currentRevisionId !== run.baseRevisionId
      || canonicalServerHash(input.visualReference ?? null) !== canonicalServerHash(restored.accepted.reference)
      || canonicalServerHash(input.confirmedSolutionBlueprint ?? null) !== canonicalServerHash(blueprint)
      || canonicalServerHash(input.capabilityCandidates ?? null) !== canonicalServerHash(candidates)
      || canonicalServerHash(input.assetCatalog ?? []) !== canonicalServerHash(assets)
      || input.previousSolutionImplementationPlan !== undefined || input.solutionPlanRejectionReasons !== undefined
      || input.execution && input.execution.runId !== runId) throw new Error("VISUAL_SEMANTIC_CONTEXT_MISMATCH");
    const approvedAssets = rows.map(row => ApprovedAssetFactsSchema.parse({ workspaceAssetId: row.id,
      targetPath: `project/res/images/${row.sha256}.${row.mediaType === "image/png" ? "png" : row.mediaType === "image/jpeg" ? "jpg" : "webp"}`,
      mediaType: row.mediaType, sha256: row.sha256, sizeBytes: row.sizeBytes }));
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    return { ...buildVisualSemanticRequest(restored.snapshot, candidates, assets, projectKey), approvedAssets };
    // end
  }
}
// end
