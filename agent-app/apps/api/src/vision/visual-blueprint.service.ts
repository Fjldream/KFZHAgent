// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import type { PrismaClient, Prisma } from "@prisma/client";
import { currentAgentRunExecution, withAgentRunNode } from "@kf/build-jobs";
import { canonicalServerHash, CustomerSolutionBlueprintSchema, RunActionSchema, type CustomerSolutionBlueprint } from "@kf/contracts";
import type { ModelPortContext } from "@kf/agent-orchestrator";
import type { ModelGateway } from "../models/model-gateway.js";
import { ModelTransportError } from "../models/deepseek-transport.js";
import { VisualReviewService } from "./visual-review.service.js";
import { lockActiveVisualRun } from "./visual-analysis-input.js";
import { buildVisualBlueprintRequest } from "./visual-blueprint-request.js";
// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { buildVisualBlueprintRepairRequest } from "./visual-blueprint-request.js";
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { inspectVisualBlueprintOutput, inspectVisualBlueprintResponse } from "./visual-blueprint-output.js";
// end
// end

const STEP_KEY = "visual-blueprint-result-v1";
/** Internal visual ModelPort implementation. Never falls back to text or current environment routes. */
export class VisualBlueprintService {
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  constructor(private readonly prisma: PrismaClient, private readonly reviews: VisualReviewService, private readonly gateway: ModelGateway,
    private readonly options: { allowRepair?: boolean } = {}) {}
  // end

  async createVisualDesignPlan(input: ModelPortContext): Promise<CustomerSolutionBlueprint> {
    return withAgentRunNode(async () => {
      const execution = currentAgentRunExecution();
      if (!execution || execution.tenantId !== input.tenantId) throw new Error("VISUAL_RUN_REQUIRED");
      execution.signal.throwIfAborted();
      const token = `${execution.ownerId}:${execution.fence}`;
      const prepared = await this.prisma.$transaction(async tx => {
        const trusted = await this.prepare(tx, input, execution.runId);
        const rows = await tx.agentRunStep.findMany({ where: { tenantId: input.tenantId, runId: execution.runId, stepKey: STEP_KEY } });
        const row = rows[0];
        if (rows.length > 1 || (row && row.inputHash !== trusted.request.scope.inputHash)) throw new Error("VISUAL_BLUEPRINT_CACHE_INVALID");
        if (row && !["RUNNING", "COMPLETED", "FAILED"].includes(row.status)) throw new Error("VISUAL_BLUEPRINT_CACHE_INVALID");
        if (row?.status === "COMPLETED") {
          let blueprint: CustomerSolutionBlueprint;
          try { blueprint = CustomerSolutionBlueprintSchema.parse(JSON.parse(row.outputRef ?? "null") as unknown); }
          catch { throw new Error("VISUAL_BLUEPRINT_CACHE_INVALID"); }
          // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
          // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
          try { if (!inspectVisualBlueprintOutput(blueprint, trusted.reference).ok) throw new Error("invalid completed blueprint"); }
          // end
          catch { throw new Error("VISUAL_BLUEPRINT_CACHE_INVALID"); }
          // end
          return { ...trusted, cached: blueprint };
        }
        if (row?.status === "RUNNING") {
          const prior = Number(row.providerAttemptId?.split(":").at(-1));
          if (!Number.isInteger(prior) || prior >= execution.fence) throw new Error("VISUAL_BLUEPRINT_IN_PROGRESS");
        }
        const attempt = (row?.attempt ?? 0) + 1;
        if (row) await tx.agentRunStep.update({ where: { id: row.id }, data: { status: "RUNNING", outputRef: null, providerAttemptId: token, attempt } });
        else await tx.agentRunStep.create({ data: { tenantId: input.tenantId, runId: execution.runId, stepKey: STEP_KEY,
          inputHash: trusted.request.scope.inputHash, status: "RUNNING", providerAttemptId: token, attempt } });
        return { ...trusted, request: { ...trusted.request, scope: { ...trusted.request.scope, attempt } }, cached: null };
      });
      if (prepared.cached) return prepared.cached;
      // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
      let repairHash: string | null = null;
      // end
      try {
        // Recheck after pinning, immediately before the physical request. No connection held while the provider runs.
        await this.prisma.$transaction(tx => this.prepare(tx, input, execution.runId));
        execution.signal.throwIfAborted();
        const response = await this.gateway.completeJson({ ...prepared.request, signal: execution.signal });
        execution.signal.throwIfAborted();
        // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
        const inspectResponse = (value: typeof response) => inspectVisualBlueprintResponse(value, prepared.reference);
        let checked = inspectResponse(response);
        if (!checked.inspection.ok && checked.inspection.repairable && prepared.repairPolicy === "once") {
          if (!this.options.allowRepair) throw new Error("VISUAL_BLUEPRINT_REPAIR_DISABLED");
          const repair = buildVisualBlueprintRepairRequest(prepared.request, checked.raw, checked.inspection.issues);
          await this.prisma.$transaction(async tx => {
            const current = await this.prepare(tx, input, execution.runId);
            if (current.request.scope.inputHash !== prepared.request.scope.inputHash) throw new Error("VISUAL_BLUEPRINT_CONTEXT_MISMATCH");
            const base = await tx.agentRunStep.findFirst({ where: { tenantId: input.tenantId, runId: execution.runId, stepKey: STEP_KEY,
              inputHash: prepared.request.scope.inputHash, status: "RUNNING", providerAttemptId: token } });
            if (!base) throw new Error("VISUAL_BLUEPRINT_STALE");
            const used = await tx.agentRunStep.count({ where: { tenantId: input.tenantId, runId: execution.runId, stepKey: "visual-blueprint-repair-v1" } });
            const sent = await tx.modelInvocation.count({ where: { tenantId: input.tenantId, runId: execution.runId,
              task: "repair", promptVersion: { startsWith: "visual-blueprint-repair@" } } });
            if (used || sent) throw new Error("VISUAL_BLUEPRINT_REPAIR_ALREADY_USED");
            await tx.agentRunStep.create({ data: { tenantId: input.tenantId, runId: execution.runId, stepKey: "visual-blueprint-repair-v1",
              inputHash: repair.scope.inputHash, status: "RUNNING", providerAttemptId: token } });
          });
          repairHash = repair.scope.inputHash;
          await this.prisma.$transaction(async tx => {
            const current = await this.prepare(tx, input, execution.runId);
            if (current.request.scope.inputHash !== prepared.request.scope.inputHash) throw new Error("VISUAL_BLUEPRINT_CONTEXT_MISMATCH");
            const reserved = await tx.agentRunStep.count({ where: { tenantId: input.tenantId, runId: execution.runId,
              stepKey: "visual-blueprint-repair-v1", inputHash: repairHash!, status: "RUNNING", providerAttemptId: token } });
            if (reserved !== 1) throw new Error("VISUAL_BLUEPRINT_REPAIR_STALE");
          });
          execution.signal.throwIfAborted();
          checked = inspectResponse(await this.gateway.completeJson({ ...repair, signal: execution.signal }));
          execution.signal.throwIfAborted();
        }
        if (!checked.inspection.ok) throw new Error("VISUAL_BLUEPRINT_OUTPUT_INVALID");
        const blueprint = checked.inspection.blueprint;
        // end
        return await this.prisma.$transaction(async tx => {
          const current = await this.prepare(tx, input, execution.runId);
          if (current.request.scope.inputHash !== prepared.request.scope.inputHash) throw new Error("VISUAL_BLUEPRINT_CONTEXT_MISMATCH");
          execution.signal.throwIfAborted();
          const saved = await tx.agentRunStep.updateMany({ where: { tenantId: input.tenantId, runId: execution.runId, stepKey: STEP_KEY,
            inputHash: prepared.request.scope.inputHash, status: "RUNNING", providerAttemptId: token },
          data: { status: "COMPLETED", outputRef: JSON.stringify(blueprint) } });
          if (saved.count !== 1) throw new Error("VISUAL_BLUEPRINT_STALE");
          // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
          if (repairHash) {
            const repaired = await tx.agentRunStep.updateMany({ where: { tenantId: input.tenantId, runId: execution.runId,
              stepKey: "visual-blueprint-repair-v1", inputHash: repairHash, status: "RUNNING", providerAttemptId: token },
            data: { status: "COMPLETED", outputRef: JSON.stringify({ schema: "kf-visual-blueprint-repair/v1", blueprintHash: canonicalServerHash(blueprint) }) } });
            if (repaired.count !== 1) throw new Error("VISUAL_BLUEPRINT_REPAIR_STALE");
          }
          // end
          return blueprint;
        });
      } catch (error) {
        // Preserve provider usage even if schema/policy/fence rejects the result.
        await this.prisma.agentRunStep.updateMany({ where: { tenantId: input.tenantId, runId: execution.runId, stepKey: STEP_KEY,
          status: "RUNNING", providerAttemptId: token }, data: { status: "FAILED", outputRef: null } }).catch(() => undefined);
        // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
        if (repairHash) await this.prisma.agentRunStep.updateMany({ where: { tenantId: input.tenantId, runId: execution.runId,
          stepKey: "visual-blueprint-repair-v1", inputHash: repairHash, status: "RUNNING", providerAttemptId: token },
        data: { status: "FAILED", outputRef: null } }).catch(() => undefined);
        // end
        if (error instanceof ModelTransportError) throw new Error(error.code);
        throw error;
      }
    });
  }

  private async prepare(tx: Prisma.TransactionClient, input: ModelPortContext, runId: string) {
    // Reader takes conversation → tenant → workspace → source → successor; active validation comes AFTER it.
    const restored = await this.reviews.readContinuationInTransaction(tx, { tenantId: input.tenantId, workspaceId: input.workspaceId,
      conversationId: input.conversationId, userId: input.userId }, runId);
    const run = await lockActiveVisualRun(tx, { tenantId: input.tenantId, workspaceId: input.workspaceId, runId });
    if (input.generationWorkflow !== "creative-v2" || input.currentRevisionId !== run.baseRevisionId
      || !input.visualReference || canonicalServerHash(input.visualReference) !== canonicalServerHash(restored.accepted.reference)
      || (input.execution && input.execution.runId !== runId)) throw new Error("VISUAL_BLUEPRINT_CONTEXT_MISMATCH");
    const source = await tx.agentRun.findUniqueOrThrow({ where: { id: restored.snapshot.content.sourceRunId } });
    const action = RunActionSchema.safeParse(source.action);
    if (!action.success || action.data.type !== "message") throw new Error("VISUAL_BLUEPRINT_CONTEXT_MISMATCH");
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    return { request: buildVisualBlueprintRequest(restored.snapshot, action.data.text), reference: restored.accepted.reference,
      repairPolicy: restored.snapshot.content.blueprintModel?.repairPolicy ?? "none" };
    // end
  }
}
// end
