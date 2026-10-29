// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
// end
import { RunActionSchema, RunModeSchema } from "@kf/contracts";
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import type { RunAction } from "@kf/contracts";
import { decodeBlueprintConfirmation } from "@kf/agent-orchestrator";
// end
// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { VISUAL_RUN_PLAN_VERSION } from "@kf/contracts";
// end
import { createHash } from "node:crypto";
import type { AgentRun, PrismaClient } from "@prisma/client";
import type { RunStore } from "./run-store.js";
import { PrismaRunQueries } from "./run-query.service.js";
// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { recordAgentBuildAudit } from "@kf/build-jobs";
// end

/** 控制端点只表达用户意图；执行者负责在安全边界停止。 */
export class RunControlService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly store: RunStore,
    private readonly queries: PrismaRunQueries,
  ) {}

  async cancel(tenantId: string, runId: string, userId: string) {
    const observed = await this.prisma.agentRun.findFirst({ where: { id: runId, tenantId } });
    if (!observed) throw new NotFoundException("RUN_NOT_FOUND");
    if (observed.status === "WAITING_APPROVAL") {
      const event = await this.prisma.agentRunEvent.findFirst({ where: { runId, tenantId, type: "approval.required" }, orderBy: { seq: "desc" } });
      const payload = event?.payload as { planHash?: unknown } | undefined;
      if (typeof payload?.planHash !== "string") throw new ConflictException("APPROVAL_PAYLOAD_INVALID");
      return this.store.create({ tenantId, userId, conversationId: observed.conversationId,
        clientRequestId: `cancel:${runId}`, clientMessageId: `cancel-message:${runId}`, mode: "build", attachmentIds: [],
        action: { type: "resume_approval", expectedRunId: runId, action: "cancel", planHash: payload.planHash },
      // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
      }).catch(error => {
        const code = error instanceof Error ? error.message : "";
        if (["RUN_ACTION_STALE", "PLAN_HASH_MISMATCH", "STALE_BASE_REVISION", "IDEMPOTENCY_CONFLICT", "RUN_CANCEL_PENDING"].includes(code)) throw new ConflictException(code);
        throw error;
      });
      // end
    }
    if (observed.supersededByRunId) {
      const successor = await this.prisma.agentRun.findFirst({ where: { id: observed.supersededByRunId, tenantId, conversationId: observed.conversationId } });
      const action = RunActionSchema.safeParse(successor?.action);
      if (successor && action.success && action.data.type === "resume_approval" && action.data.action === "cancel" && action.data.expectedRunId === runId) return this.queries.snapshot(tenantId, successor.id);
    }
    await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`kf-run-control:${runId}`}, 0))`;
      const rows = await tx.$queryRaw<AgentRun[]>`
        SELECT * FROM "AgentRun"
        WHERE "id" = ${runId} AND "tenantId" = ${tenantId} FOR UPDATE
      `;
      const row = rows[0];
      if (!row) throw new NotFoundException("RUN_NOT_FOUND");
      if (["SUCCEEDED", "FAILED", "CANCELLED", "CANCEL_REQUESTED"].includes(row.status)) return;
      if (!["QUEUED", "WAITING_INPUT", "RUNNING", "BUILDING"].includes(row.status)) throw new ConflictException("RUN_CONTROL_NOT_READY");
      const now = new Date();
      if (row.buildJobId) {
        const job = await tx.buildJob.findFirst({ where: { id: row.buildJobId, tenantId, workspaceId: row.workspaceId, agentRunId: row.id } });
        if (!job) throw new ConflictException("BUILD_RUN_BINDING_MISMATCH");
        if (job.status === "SUCCEEDED" || job.status === "FAILED") return;
        // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
        const updatedJob = await tx.buildJob.update({ where: { id: job.id }, data: { cancelRequestedAt: now,
          ...(job.status === "QUEUED" ? { status: "FAILED", terminalReason: "CANCELLED", leaseOwner: null, leaseExpiresAt: null } : {}),
        } });
        if (job.status === "QUEUED") await recordAgentBuildAudit(tx, updatedJob, "completed");
        // end
      }
      const terminal = row.status === "QUEUED" || row.status === "WAITING_INPUT";
      await tx.agentRun.update({ where: { id: runId }, data: {
        status: terminal ? "CANCELLED" : "CANCEL_REQUESTED", cancelRequestedAt: now,
        ...(terminal ? { finishedAt: now, leaseOwner: null, leaseExpiresAt: null } : {}), lastSeq: { increment: 1 },
      } });
      await tx.agentRunEvent.create({ data: { runId, tenantId, seq: row.lastSeq + 1,
        type: terminal ? "run.cancelled" : "run.cancel_requested", payload: terminal ? {} : { requestedAt: now.toISOString() },
      } });
      await tx.conversation.update({ where: { id: row.conversationId }, data: { lastActivityAt: now } });
      await tx.auditLog.create({ data: { tenantId, actorUserId: userId, action: terminal ? "RUN_CANCELLED" : "RUN_CANCEL_REQUESTED", resourceType: "AGENT_RUN", resourceId: runId } });
    });
    return this.queries.snapshot(tenantId, runId);
  }

  async retry(tenantId: string, runId: string, userId: string, clientRequestId: unknown) {
    if (typeof clientRequestId !== "string" || !clientRequestId.trim() || clientRequestId.length > 200) throw new BadRequestException("INVALID_CLIENT_REQUEST_ID");
    const source = await this.prisma.agentRun.findFirst({ where: { id: runId, tenantId } });
    if (!source) throw new NotFoundException("RUN_NOT_FOUND");
    if (!["FAILED", "CANCELLED"].includes(source.status) || source.supersededByRunId) throw new ConflictException("RUN_NOT_RETRYABLE");
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    // Reference inheritance needs a new trusted consent/input contract; never retry it as attachment-free text.
    if ((source.configSnapshot as { planVersion?: unknown } | null)?.planVersion === VISUAL_RUN_PLAN_VERSION
      || (source.inputSnapshot !== null && typeof source.inputSnapshot === "object" && Object.hasOwn(source.inputSnapshot, "visualAdmission"))) {
      throw new ConflictException("VISUAL_RETRY_NOT_ENABLED");
    }
    // end
    if (["FORBIDDEN", "UNAUTHORIZED", "PLAN_HASH_MISMATCH", "BLUEPRINT_RECEIPT_MISMATCH", "RUN_ACTION_STALE", "FEATURE_NOT_ENABLED"].includes(source.failureCode ?? "")) throw new ConflictException("RUN_NOT_RETRYABLE");
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    // A failed control action starts a fresh blueprint from its original requirement.
    // Replaying a consumed receipt, or substituting a generic generation phrase, loses that intent.
    const action = await this.originalRetryMessage(source);
    // end
    try {
      return await this.store.create({ tenantId, userId, conversationId: source.conversationId,
        clientRequestId, clientMessageId: `retry:${createHash("sha256").update(clientRequestId).digest("hex")}`, mode: RunModeSchema.parse(source.mode),
        action, attachmentIds: [], retryOfRunId: source.id,
        ...(source.baseRevisionId ? { expectedBaseRevisionId: source.baseRevisionId } : {}),
      });
    } catch (error) {
      // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
      if (error instanceof Error && error.message === "FEATURE_NOT_ENABLED") throw new ForbiddenException({ error: { code: "FEATURE_NOT_ENABLED", message: "当前租户未开放新的运行；已受理任务仍可查询或停止。" } });
      // end
      if (error instanceof Error && error.message === "STALE_BASE_REVISION") throw new ConflictException("BASE_REVISION_CONFLICT");
      // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      if (error instanceof Error && ["RUN_IN_PROGRESS", "IDEMPOTENCY_CONFLICT", "BASE_REVISION_CONFLICT", "RUN_NOT_RETRYABLE", "VISUAL_RETRY_NOT_ENABLED", "CONVERSATION_ARCHIVED"].includes(error.message)) throw new ConflictException(error.message);
      // end
      // end
      throw error;
    }
  }

  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  private async originalRetryMessage(source: AgentRun): Promise<Extract<RunAction, { type: "message" }>> {
    const visited = new Set<string>();
    let current = source;
    for (let depth = 0; depth < 32; depth++) {
      if (visited.has(current.id)) throw new ConflictException("RUN_NOT_RETRYABLE");
      visited.add(current.id);
      const snapshot = current.inputSnapshot;
      const action = RunActionSchema.safeParse(current.action);
      if ((current.configSnapshot as { planVersion?: unknown } | null)?.planVersion === VISUAL_RUN_PLAN_VERSION
        || (snapshot !== null && typeof snapshot === "object" && !Array.isArray(snapshot)
          && (["visualAdmission", "visualContinuation", "visualEngineering"].some(key => Object.hasOwn(snapshot, key))
            || (Array.isArray(snapshot.attachmentIds) && snapshot.attachmentIds.length > 0)))
        || (action.success && (action.data.type === "accept_visual_reference" || action.data.type === "revise_regions"))) {
        throw new ConflictException("VISUAL_RETRY_NOT_ENABLED");
      }
      if (!action.success || ["FORBIDDEN", "UNAUTHORIZED", "PLAN_HASH_MISMATCH", "BLUEPRINT_RECEIPT_MISMATCH", "RUN_ACTION_STALE", "FEATURE_NOT_ENABLED"].includes(current.failureCode ?? "")) {
        throw new ConflictException("RUN_NOT_RETRYABLE");
      }
      // Follow retry lineage first so old generic retries recover the same original request.
      const retryParentId = current.retryOfRunId;
      const control = action.data.type === "confirm_blueprint" || action.data.type === "resume_approval" ? action.data : null;
      if (!retryParentId && action.data.type === "message") {
        if (decodeBlueprintConfirmation(action.data.text.trim())) throw new ConflictException("RUN_NOT_RETRYABLE");
        return action.data;
      }
      const parentId = retryParentId ?? control?.expectedRunId;
      if (!parentId || (!retryParentId && current.predecessorRunId !== parentId)) throw new ConflictException("RUN_NOT_RETRYABLE");
      const parent = await this.prisma.agentRun.findFirst({ where: { id: parentId, tenantId: source.tenantId,
        workspaceId: source.workspaceId, conversationId: source.conversationId } });
      // Confirmation/approval edges must be the exact supersession that was admitted, never an arbitrary earlier Run.
      if (!parent || (!retryParentId && parent.supersededByRunId !== current.id)) throw new ConflictException("RUN_NOT_RETRYABLE");
      current = parent;
    }
    throw new ConflictException("RUN_NOT_RETRYABLE");
  }
  // end
}
// end
