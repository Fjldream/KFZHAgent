// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { RunAction, RunEvent, RunMode, RunSnapshot, RunStatus } from "@kf/contracts";
import type { Prisma, PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { canonicalJson } from "../models/canonical-json.js";
import { decodeBlueprintConfirmation } from "@kf/agent-orchestrator";
import { RunActionSchema } from "@kf/contracts";
// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { canonicalServerHash, VisualRunOptionsSchema, VisualReviewSchema, VisualReviewAcceptanceSchema, VISUAL_RUN_PLAN_VERSION } from "@kf/contracts";
import type { VisualRunAdmissionService } from "../vision/visual-run-admission.js";
import type { VisualReviewService } from "../vision/visual-review.service.js";
// end
// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import type { AgentRun } from "@prisma/client";
import { resolveWorkbenchConfig, type WorkbenchConfig } from "./feature-policy.js";
import { prepareQueuedBaseline } from "./run-queue-baseline.js";
// end

export type StartRunInput = {
  tenantId: string;
  userId: string;
  conversationId: string;
  clientRequestId: string;
  clientMessageId: string;
  mode: RunMode;
  action: RunAction;
  attachmentIds: string[];
  expectedBaseRevisionId?: string;
  retryOfRunId?: string;
  // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
  visualReference?: unknown;
  // end
};

export type ClaimedRunLease = { runId: string; ownerId: string; fence: number; expiresAt: string };

export interface RunStore {
  create(input: StartRunInput): Promise<RunSnapshot>;
  claim(ownerId: string, tenantId: string, now: Date): Promise<ClaimedRunLease | null>;
  /** 接手租约已过期的 RUNNING/CANCEL_REQUESTED run；旧执行者仍持锁时返回 null。 */
  recoverExpired(ownerId: string, tenantId: string, now: Date): Promise<ClaimedRunLease | null>;
  renew(lease: ClaimedRunLease, now: Date): Promise<ClaimedRunLease>;
  isCancellationRequested?(lease: ClaimedRunLease, tenantId: string): Promise<boolean>;
  append(
    lease: ClaimedRunLease,
    tenantId: string,
    event: Omit<RunEvent, "seq" | "createdAt" | "schemaVersion" | "runId">,
  ): Promise<RunEvent>;
  finish(lease: ClaimedRunLease, tenantId: string, status: RunStatus, failureCode?: string): Promise<RunSnapshot>;
  /** 停在中途等用户确认：释放租约但 run 不结束，后续由新 action 继续。 */
  pause(lease: ClaimedRunLease, tenantId: string, status: "WAITING_APPROVAL" | "WAITING_INPUT"): Promise<RunSnapshot>;
  // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
  observeCommittedReviewPause?(lease: ClaimedRunLease, tenantId: string, reviewHash: string): Promise<RunSnapshot>;
  // end
}

export const IDEMPOTENCY_CONFLICT = "IDEMPOTENCY_CONFLICT";
export const RUN_CONVERSATION_NOT_FOUND = "RUN_CONVERSATION_NOT_FOUND";
export const FENCE_REJECTED = "FENCE_REJECTED";

/** 单 run 默认预算（应用级，不是 provider 限制）；运维可调。 */
const DEFAULT_MAX_INVOCATIONS = 8;
const DEFAULT_MAX_INPUT_TOKENS = 120_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 80_000;

type RunRow = {
  id: string;
  tenantId: string;
  workspaceId: string;
  conversationId: string;
  status: string;
  lastSeq: number;
  baseRevisionId: string | null;
  buildJobId: string | null;
  resultRevisionId: string | null;
  failureCode: string | null;
  supersededByRunId: string | null;
};

const toSnapshot = (row: RunRow): RunSnapshot => ({
  id: row.id,
  tenantId: row.tenantId,
  workspaceId: row.workspaceId,
  conversationId: row.conversationId,
  status: row.status as RunStatus,
  lastSeq: row.lastSeq,
  baseRevisionId: row.baseRevisionId ?? "",
  buildJobId: row.buildJobId,
  resultRevisionId: row.resultRevisionId,
  failureCode: row.failureCode,
  supersededByRunId: row.supersededByRunId,
});

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";

const TERMINAL: readonly string[] = ["SUCCEEDED", "FAILED", "CANCELLED"];
const ACTIVE: readonly string[] = ["RUNNING", "BUILDING", "CANCEL_REQUESTED"];

/** 用户消息正文：确定性动作不能伪装成用户自然语言。 */
const messageContent = (action: RunAction): string =>
  action.type === "message" ? action.text : action.type === "confirm_blueprint" ? action.receipt : `[${action.type}]`;

/**
 * 持久 run 仓库。所有状态变化都经由 fence 校验，保证旧 worker 的迟到写入不生效。
 *
 * 并发正确性依赖两点：
 * 1. 领取用 SELECT … FOR UPDATE SKIP LOCKED，同一行不会被两个 worker 同时选中
 * 2. 追加事件与 finish 都以 (ownerId, fence, 租约未过期) 为条件，旧租约写入 0 行
 */
export class PrismaRunStore implements RunStore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly leaseMs = 30_000,
    // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
    private readonly configForTenant: (tenantId: string) => WorkbenchConfig = resolveWorkbenchConfig,
    // end
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    private readonly visualAdmission?: Pick<VisualRunAdmissionService, "freezeInTransaction">,
    private readonly visualContinuation?: Pick<VisualReviewService, "freezeContinuationInTransaction">,
    // end
    // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
    private readonly visualEngineering?: Pick<VisualReviewService, "readContinuationInTransaction" | "freezeEngineeringInTransaction">,
    // end
  ) {}

  async isCancellationRequested(lease: ClaimedRunLease, tenantId: string): Promise<boolean> {
    const row = await this.prisma.agentRun.findFirst({ where: { id: lease.runId, tenantId, leaseOwner: lease.ownerId, fence: lease.fence }, select: { status: true, buildJobId: true } });
    if (!row) throw new Error(FENCE_REJECTED);
    // 构建阶段由 build-worker 在提交边界取消，agent 不能提前宣称已停止。
    return row.status === "CANCEL_REQUESTED" && row.buildJobId === null;
  }

  async create(input: StartRunInput): Promise<RunSnapshot> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: input.conversationId, tenantId: input.tenantId },
      select: { id: true, workspaceId: true },
    });
    if (conversation === null) throw new Error(RUN_CONVERSATION_NOT_FOUND);

    const requestHash = createHash("sha256")
      .update(canonicalJson({
        mode: input.mode,
        action: input.action,
        attachmentIds: input.attachmentIds,
        expectedBaseRevisionId: input.expectedBaseRevisionId ?? null,
        ...(input.retryOfRunId ? { retryOfRunId: input.retryOfRunId } : {}),
        // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
        ...(input.visualReference === undefined ? {} : { visualReference: input.visualReference }),
        // end
      }), "utf8")
      .digest("hex");

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`kf-run:${input.conversationId}`}, 0))`;
        const existing = await tx.agentRun.findUnique({ where: { tenantId_conversationId_clientRequestId: {
          tenantId: input.tenantId, conversationId: input.conversationId, clientRequestId: input.clientRequestId,
        } } });
        if (existing) {
          if (existing.requestHash !== requestHash) throw new Error(IDEMPOTENCY_CONFLICT);
          return toSnapshot(existing);
        }
        // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
        const admittedConversation = await tx.conversation.findFirst({ where: { id: input.conversationId, tenantId: input.tenantId } });
        if (!admittedConversation) throw new Error(RUN_CONVERSATION_NOT_FOUND);
        if (admittedConversation.archivedAt) throw new Error("CONVERSATION_ARCHIVED");
        // end
        // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
        // Region edits still require their own snapshot inheritance protocol.
        if (input.action.type === "revise_regions") {
          throw new Error("FEATURE_NOT_ENABLED");
        }
        // end
        // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
        // 幂等重放优先于 rollout 开关：停新受理不能让已受理请求重新创建或丢失。
        const cancellation = input.action.type === "resume_approval" && input.action.action === "cancel" && !input.retryOfRunId;
        const admissionConfig = this.configForTenant(input.tenantId);
        if (!admissionConfig.admission.enabled && !cancellation) throw new Error("FEATURE_NOT_ENABLED");
        // end
        // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
        const visual = input.attachmentIds.length > 0 || input.visualReference !== undefined;
        const accepting = input.action.type === "accept_visual_reference";
        let acceptance;
        // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
        let engineeringSource: AgentRun | undefined;
        if (input.action.type === "confirm_blueprint") {
          // Discover only inside the caller's scope; ordinary @6 confirmations retain their original route.
          const source = await tx.agentRun.findFirst({ where: { id: input.action.expectedRunId, tenantId: input.tenantId,
            workspaceId: conversation.workspaceId, conversationId: input.conversationId } });
          // A damaged/downgraded config must never turn an admitted image into an ordinary text confirmation.
          const sourceInput = source?.inputSnapshot;
          if (source && ((source.configSnapshot as { planVersion?: unknown } | null)?.planVersion === VISUAL_RUN_PLAN_VERSION
            || (sourceInput !== null && typeof sourceInput === "object"
              && ["visualAdmission", "visualContinuation", "visualEngineering"].some(key => Object.hasOwn(sourceInput, key))))) {
            const sourceAction = RunActionSchema.safeParse(source.action);
            if (!sourceAction.success || sourceAction.data.type !== "accept_visual_reference") throw new Error("VISUAL_REVIEW_ACTION_REQUIRED");
            if (!admissionConfig.flags.agentVisionV1 || !admissionConfig.outboundImagesAllowed
              || admissionConfig.imagePolicy !== "explicit-consent") throw new Error("FEATURE_NOT_ENABLED");
            if (!this.visualEngineering) throw new Error("VISUAL_FLOW_NOT_CONFIGURED");
            if (input.mode !== "build" || visual || input.retryOfRunId) throw new Error("VISUAL_ENGINEERING_INPUT_INVALID");
            if (source.requestedByUserId !== input.userId) throw new Error("VISUAL_CONTINUATION_ACTOR_MISMATCH");
            // Lock original image ancestry before the blueprint source, and before outstanding rows.
            await this.visualEngineering.readContinuationInTransaction(tx, { tenantId: input.tenantId,
              workspaceId: conversation.workspaceId, conversationId: input.conversationId, userId: input.userId }, source.id);
            const [locked] = await tx.$queryRaw<AgentRun[]>`SELECT * FROM "AgentRun" WHERE "id"=${source.id}
              AND "tenantId"=${input.tenantId} AND "workspaceId"=${conversation.workspaceId} AND "conversationId"=${input.conversationId} FOR UPDATE`;
            if (!locked || locked.status !== "WAITING_INPUT" || locked.supersededByRunId || locked.cancelRequestedAt || locked.buildJobId) throw new Error("VISUAL_BLUEPRINT_NOT_WAITING");
            engineeringSource = locked;
          }
        }
        // end
        if (accepting) {
          if (!admissionConfig.flags.agentVisionV1 || !admissionConfig.outboundImagesAllowed
            || admissionConfig.imagePolicy !== "explicit-consent") throw new Error("FEATURE_NOT_ENABLED");
          if (!this.visualContinuation) throw new Error("VISUAL_FLOW_NOT_CONFIGURED");
          const choices: Record<string, unknown> = { ...input.action }; delete choices.type;
          const parsed = VisualReviewAcceptanceSchema.safeParse(choices);
          if (!parsed.success || input.mode !== "build" || visual || input.retryOfRunId) throw new Error("VISUAL_ACCEPTANCE_INVALID");
          acceptance = parsed.data;
          // Follow the continuation reader's lock order before locking any outstanding Run rows.
          // In particular, cancel holds the source control lock before its row lock.
          const [tenant] = await tx.$queryRaw<{ imageEgressAllowed: boolean }[]>`
            SELECT "imageEgressAllowed" FROM "Tenant" WHERE "id"=${input.tenantId} FOR UPDATE`;
          if (tenant?.imageEgressAllowed !== true) throw new Error("IMAGE_EGRESS_NOT_ALLOWED");
          await tx.$queryRaw`SELECT "id" FROM "SolutionWorkspace" WHERE "id"=${conversation.workspaceId} AND "tenantId"=${input.tenantId} FOR SHARE`;
          await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`kf-run-control:${acceptance.expectedRunId}`}, 0))`;
          const [source] = await tx.$queryRaw<AgentRun[]>`
            SELECT * FROM "AgentRun" WHERE "id"=${acceptance.expectedRunId} AND "tenantId"=${input.tenantId}
              AND "workspaceId"=${conversation.workspaceId} AND "conversationId"=${input.conversationId} FOR UPDATE`;
          if (!source) throw new Error("VISUAL_REVIEW_NOT_FOUND");
          if (source.status !== "WAITING_INPUT" || source.supersededByRunId || source.cancelRequestedAt || source.buildJobId) throw new Error("VISUAL_REVIEW_NOT_WAITING");
        }
        if (visual) {
          if (!admissionConfig.flags.agentVisionV1 || !this.visualAdmission || !admissionConfig.outboundImagesAllowed
            || admissionConfig.imagePolicy !== "explicit-consent") throw new Error("FEATURE_NOT_ENABLED");
          if (input.action.type !== "message" || input.retryOfRunId || !VisualRunOptionsSchema.safeParse(input.visualReference).success) throw new Error("INVALID_VISUAL_REFERENCE");
          // A single-analysis review cannot honestly present a merged multi-image interpretation yet.
          if (input.attachmentIds.length !== 1) throw new Error("VISUAL_MULTIPLE_REFERENCES_NOT_ENABLED");
        }
        // end
        const workspace = await tx.solutionWorkspace.findFirst({ where: { id: conversation.workspaceId, tenantId: input.tenantId }, select: { currentRevisionId: true } });
        if (!workspace) throw new Error(RUN_CONVERSATION_NOT_FOUND);
        if (input.expectedBaseRevisionId !== undefined && input.expectedBaseRevisionId !== workspace.currentRevisionId) throw new Error("STALE_BASE_REVISION");
        // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
        let baseRevisionId = input.expectedBaseRevisionId ?? workspace.currentRevisionId;
        // end
        const retrySource = input.retryOfRunId ? await tx.agentRun.findFirst({ where: { id: input.retryOfRunId, tenantId: input.tenantId, conversationId: input.conversationId } }) : null;
        if (input.retryOfRunId) {
          if (!retrySource || !["FAILED", "CANCELLED"].includes(retrySource.status) || retrySource.supersededByRunId) throw new Error("RUN_NOT_RETRYABLE");
          // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
          // Internal callers must not bypass the HTTP retry guard and discard the admitted reference.
          if ((retrySource.configSnapshot as { planVersion?: unknown } | null)?.planVersion === VISUAL_RUN_PLAN_VERSION
            || (retrySource.inputSnapshot !== null && typeof retrySource.inputSnapshot === "object" && Object.hasOwn(retrySource.inputSnapshot, "visualAdmission"))) {
            throw new Error("VISUAL_RETRY_NOT_ENABLED");
          }
          // end
          if (retrySource.baseRevisionId !== workspace.currentRevisionId) throw new Error("BASE_REVISION_CONFLICT");
        }
        // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
        // 与 claim 共用会话锁；锁住等待轮次，取消/继续竞争不得消费已失效回执。
        const outstanding = await tx.$queryRaw<AgentRun[]>`
          SELECT * FROM "AgentRun" WHERE "tenantId" = ${input.tenantId} AND "conversationId" = ${input.conversationId}
            AND "status" IN ('QUEUED','RUNNING','BUILDING','CANCEL_REQUESTED','WAITING_INPUT','WAITING_APPROVAL')
          ORDER BY "createdAt", "id" FOR UPDATE
        `;
        const active = outstanding.find(row => row.status === "WAITING_INPUT" || row.status === "WAITING_APPROVAL");
        const executing = outstanding.find(row => ACTIVE.includes(row.status));
        const queued = outstanding.filter(row => row.status === "QUEUED");
        // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
        // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
        if (engineeringSource) {
          if (!active || active.id !== engineeringSource.id || outstanding.length !== 1) throw new Error("RUN_ACTION_STALE");
        } else if (acceptance) {
        // end
          if (!active || active.id !== acceptance.expectedRunId || outstanding.length !== 1) throw new Error("RUN_ACTION_STALE");
          if ((active.configSnapshot as { planVersion?: unknown } | null)?.planVersion !== VISUAL_RUN_PLAN_VERSION) throw new Error("VISUAL_REVIEW_ACTION_REQUIRED");
        } else if (active && (active.configSnapshot as { planVersion?: unknown } | null)?.planVersion === VISUAL_RUN_PLAN_VERSION) throw new Error("VISUAL_REVIEW_ACTION_REQUIRED");
        if (visual && outstanding.length > 0) throw new Error("RUN_IN_PROGRESS");
        // end
        const parents = new Set(queued.map(row => row.predecessorRunId));
        const tail = [...queued].reverse().find(row => !parents.has(row.id));
        if (retrySource && outstanding.length) throw new Error("RUN_IN_PROGRESS");
        if (active?.cancelRequestedAt && !(input.action.type === "resume_approval" && input.action.action === "cancel" && input.action.expectedRunId === active.id)) throw new Error("RUN_CANCEL_PENDING");
        if (!active && input.action.type === "message" && queued.length >= 20) throw new Error("RUN_QUEUE_FULL");
        const previous = active ?? tail ?? executing ?? await tx.agentRun.findFirst({
          where: { tenantId: input.tenantId, conversationId: input.conversationId },
          orderBy: [{ startedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }, { id: "desc" }],
        });
        // end
        if (retrySource && input.action.type === "resume_approval") {
          const original = RunActionSchema.parse(retrySource.action);
          if (original.type !== "resume_approval" || original.planHash !== input.action.planHash || original.action !== input.action.action || input.action.expectedRunId !== retrySource.id || retrySource.buildJobId) throw new Error("RUN_ACTION_STALE");
        } else if (input.action.type === "confirm_blueprint" || input.action.type === "resume_approval") {
          if (!active || active.id !== input.action.expectedRunId) throw new Error("RUN_ACTION_STALE");
          const expectedStatus = input.action.type === "confirm_blueprint" ? "WAITING_INPUT" : "WAITING_APPROVAL";
          if (active.status !== expectedStatus) throw new Error("RUN_ACTION_STALE");
          const pending = await tx.agentRunEvent.findFirst({ where: { runId: active.id,
            type: input.action.type === "confirm_blueprint" ? "input.required" : "approval.required",
          }, orderBy: { seq: "desc" } });
          const payload = pending?.payload as Record<string, unknown> | undefined;
          if (input.action.type === "confirm_blueprint") {
            if (!decodeBlueprintConfirmation(input.action.receipt) || payload?.receipt !== input.action.receipt) throw new Error("BLUEPRINT_RECEIPT_MISMATCH");
          } else if (payload?.planHash !== input.action.planHash) throw new Error("PLAN_HASH_MISMATCH");
          // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
          if (input.action.type === "resume_approval" && input.action.action === "cancel") baseRevisionId = active.baseRevisionId;
          else if (active.baseRevisionId !== workspace.currentRevisionId) throw new Error("STALE_BASE_REVISION");
          // end
        } else if (active?.status === "WAITING_APPROVAL") throw new Error("APPROVAL_RESUME_REQUIRED");
        // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
        const firstNaturalMessage = input.action.type === "message" && !await tx.message.findFirst({ where: { tenantId: input.tenantId, conversationId: input.conversationId }, select: { id: true } });
        const automaticTitle = firstNaturalMessage && ["新对话", "New conversation"].includes(admittedConversation.title)
          && admittedConversation.createdAt.getTime() === admittedConversation.updatedAt.getTime()
          ? Array.from(input.action.type === "message" ? input.action.text.trim() : "").slice(0, 24).join("") || "新对话" : undefined;
        // end
        const message = await tx.message.create({
          data: {
            tenantId: input.tenantId,
            conversationId: input.conversationId,
            role: "user",
            content: messageContent(input.action),
            clientMessageId: input.clientMessageId,
          },
          select: { id: true },
        });

        const run = await tx.agentRun.create({
          data: {
            tenantId: input.tenantId,
            workspaceId: conversation.workspaceId,
            conversationId: input.conversationId,
            requestedByUserId: input.userId,
            clientRequestId: input.clientRequestId,
            requestHash,
            mode: input.mode,
            action: input.action,
            status: "QUEUED",
            baseRevisionId,
            // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
            // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
            // A continuation candidate starts with SQL NULL; only the signer may fill the inherited input.
            // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
            ...(acceptance || engineeringSource ? {} : { inputSnapshot: { attachmentIds: input.attachmentIds, baseRevisionPolicy: !visual && input.action.type === "message" && !active && !retrySource && input.expectedBaseRevisionId === undefined ? "follow-predecessor" : "fixed" } }),
            // end
            // end
            predecessorRunId: previous?.id ?? null,
            // end
            retryOfRunId: input.retryOfRunId ?? null,
            // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
            // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
            // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
            configSnapshot: (cancellation || acceptance || engineeringSource) && active?.configSnapshot
            // end
              // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
              ? active.configSnapshot as Prisma.InputJsonValue : visual ? { ...admissionConfig, planVersion: VISUAL_RUN_PLAN_VERSION } : admissionConfig,
              // end
            // end
            // end
          },
          select: {
            id: true, tenantId: true, workspaceId: true, conversationId: true, status: true,
            lastSeq: true, baseRevisionId: true, buildJobId: true, resultRevisionId: true,
            failureCode: true, supersededByRunId: true,
          },
        });

        // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
        if (visual) await this.visualAdmission!.freezeInTransaction(tx, { tenantId: input.tenantId, workspaceId: conversation.workspaceId,
          conversationId: input.conversationId, userId: input.userId }, run.id, {
          ...VisualRunOptionsSchema.parse(input.visualReference), attachmentIds: input.attachmentIds,
        });
        if (acceptance) {
          const inherited = await this.visualContinuation!.freezeContinuationInTransaction(tx, { tenantId: input.tenantId,
            workspaceId: conversation.workspaceId, conversationId: input.conversationId, userId: input.userId }, run.id, acceptance);
          // A review-only dependency cannot admit an unexecutable public successor.
          if (!inherited.content.blueprintModel) throw new Error("VISUAL_FLOW_NOT_CONFIGURED");
        }
        // end
        // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
        if (engineeringSource) {
          const inherited = await this.visualEngineering!.freezeEngineeringInTransaction(tx, { tenantId: input.tenantId,
            workspaceId: conversation.workspaceId, conversationId: input.conversationId, userId: input.userId }, run.id, engineeringSource.id);
          // Roll back every candidate/message/audit/source mutation if the runtime did not freeze an executable task.
          if (!inherited.content.semanticModel) throw new Error("VISUAL_FLOW_NOT_CONFIGURED");
        }
        // end
        await tx.message.update({ where: { id: message.id }, data: { runId: run.id } });
        // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
        // 受理不等于执行成功；与 Run/消息原子提交，幂等命中在此之前返回。
        const confirmedBlueprint = input.action.type === "confirm_blueprint" ? decodeBlueprintConfirmation(input.action.receipt) : null;
        await tx.auditLog.create({ data: {
          tenantId: input.tenantId, actorUserId: input.userId, action: "RUN_ACTION_ACCEPTED", resourceType: "AGENT_RUN", resourceId: run.id,
          detail: { phase: "accepted", actionType: input.action.type, mode: input.mode,
            workspaceId: run.workspaceId, conversationId: run.conversationId, baseRevisionId: run.baseRevisionId,
            retryOfRunId: input.retryOfRunId ?? null,
            ...(input.action.type === "resume_approval" ? { approvalAction: input.action.action, planHash: input.action.planHash, expectedRunId: input.action.expectedRunId }
              : input.action.type === "confirm_blueprint" && confirmedBlueprint ? { expectedRunId: input.action.expectedRunId,
                blueprintHash: confirmedBlueprint.designPlanHash, blueprintRevision: confirmedBlueprint.revision } : {}),
          },
        } });
        // end
        // 等待轮次被唯一后继消费，防止它永久阻塞确认/补充需求的排队运行。
        // The signed continuation freezer already CAS-consumed the visual wait in this transaction.
        // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
        // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
        if (active && !acceptance && !engineeringSource) {
        // end
        // end
          // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
          // 继续/澄清必须先于既有队列：只重接直属后继，不改写队列正文/签名计划。
          await tx.agentRun.updateMany({ where: { tenantId: input.tenantId, conversationId: input.conversationId,
            status: "QUEUED", predecessorRunId: active.id, id: { not: run.id },
          }, data: { predecessorRunId: run.id } });
          // end
          await tx.agentRun.update({ where: { id: active.id }, data: {
            status: "CANCELLED", supersededByRunId: run.id, finishedAt: new Date(), lastSeq: { increment: 1 },
          } });
          await tx.agentRunEvent.create({ data: { tenantId: input.tenantId, runId: active.id,
            seq: active.lastSeq + 1, type: "run.cancelled", payload: {},
          } });
        }
        await tx.runBudget.create({
          data: {
            runId: run.id,
            maxInvocations: DEFAULT_MAX_INVOCATIONS,
            maxInputTokens: DEFAULT_MAX_INPUT_TOKENS,
            maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
          },
        });
        const event = await tx.agentRunEvent.create({
          data: { runId: run.id, tenantId: input.tenantId, seq: 1, type: "run.queued", payload: { mode: input.mode } },
        });
        const updated = await tx.agentRun.update({
          where: { id: run.id },
          data: { lastSeq: event.seq },
          select: {
            id: true, tenantId: true, workspaceId: true, conversationId: true, status: true,
            lastSeq: true, baseRevisionId: true, buildJobId: true, resultRevisionId: true,
            failureCode: true, supersededByRunId: true,
          },
        });
        await tx.conversation.update({
          where: { id: input.conversationId },
          // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
          data: { lastActivityAt: new Date(), ...(automaticTitle === undefined ? {} : { title: automaticTitle }) },
          // end
        });
        return toSnapshot(updated);
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const existing = await this.prisma.agentRun.findUnique({
        where: {
          tenantId_conversationId_clientRequestId: {
            tenantId: input.tenantId,
            conversationId: input.conversationId,
            clientRequestId: input.clientRequestId,
          },
        },
      });
      if (existing === null) throw error;
      // 同 clientRequestId 不同内容：拒绝，避免「点了两次但需求不同」被静默合并。
      if (existing.requestHash !== requestHash) throw new Error(IDEMPOTENCY_CONFLICT);
      return toSnapshot(existing);
    }
  }

  async claim(ownerId: string, tenantId: string, now: Date): Promise<ClaimedRunLease | null> {
    // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
    await this.queueApprovalCancellation(tenantId);
    // end
    const expiresAt = new Date(now.getTime() + this.leaseMs);

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT r."id"
        FROM "AgentRun" AS r
        WHERE r."status" = 'QUEUED'
          AND r."tenantId" = ${tenantId}
          -- modified by jinlong.feng at 2026-10-21 Agent工作台迭代
          AND (r."predecessorRunId" IS NULL OR EXISTS (
            SELECT 1 FROM "AgentRun" AS predecessor WHERE predecessor."id" = r."predecessorRunId"
              AND predecessor."tenantId" = r."tenantId" AND predecessor."conversationId" = r."conversationId"
              AND predecessor."workspaceId" = r."workspaceId" AND predecessor."status" IN ('SUCCEEDED','FAILED','CANCELLED')
          ))
          -- end
          AND pg_try_advisory_xact_lock(hashtextextended('kf-run:' || r."conversationId", 0))
          AND NOT EXISTS (
            SELECT 1 FROM "AgentRun" AS a
            WHERE a."conversationId" = r."conversationId"
              AND a."id" <> r."id"
              AND a."status" IN ('RUNNING','BUILDING','CANCEL_REQUESTED','WAITING_INPUT','WAITING_APPROVAL')
          )
        ORDER BY r."createdAt", r."id"
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `;
      const candidate = rows[0];
      if (candidate === undefined) return null;
      const blocker = await tx.agentRun.findFirst({ where: { conversationId: (await tx.agentRun.findUniqueOrThrow({ where: { id: candidate.id } })).conversationId,
        id: { not: candidate.id }, status: { in: ["RUNNING", "BUILDING", "CANCEL_REQUESTED", "WAITING_INPUT", "WAITING_APPROVAL"] },
      }, select: { id: true } });
      if (blocker) return null;
      // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
      if (!await prepareQueuedBaseline(tx, tenantId, candidate.id)) return null;
      // end

      const claimed = await tx.$queryRaw<Array<{ fence: number }>>`
        UPDATE "AgentRun"
        SET "leaseOwner" = ${ownerId},
            "leaseExpiresAt" = ${expiresAt},
            "fence" = "fence" + 1,
            "status" = 'RUNNING',
            "startedAt" = COALESCE("startedAt", ${now})
        WHERE "id" = ${candidate.id} AND "status" = 'QUEUED'
        RETURNING "fence"
      `;
      const row = claimed[0];
      if (row === undefined) return null;
      return { runId: candidate.id, ownerId, fence: row.fence, expiresAt: expiresAt.toISOString() };
    });
  }

  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  /** 停止与图中断同时到达时，持久取消意图由 worker 重入原生 cancel，不能遗弃 checkpoint。 */
  private async queueApprovalCancellation(tenantId: string): Promise<void> {
    const pending = await this.prisma.agentRun.findFirst({ where: { tenantId, status: "WAITING_APPROVAL", cancelRequestedAt: { not: null }, supersededByRunId: null }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    if (!pending) return;
    const event = await this.prisma.agentRunEvent.findFirst({ where: { tenantId, runId: pending.id, type: "approval.required" }, orderBy: { seq: "desc" } });
    const payload = event?.payload as { planHash?: unknown } | undefined;
    if (typeof payload?.planHash !== "string") throw new Error("APPROVAL_PAYLOAD_INVALID");
    // 停止发起人可能不是最初请求人；只能沿用真实停止审计，不能替用户猜身份。
    const stopAudit = await this.prisma.auditLog.findFirst({ where: { tenantId, resourceType: "AGENT_RUN",
      resourceId: pending.id, action: "RUN_CANCEL_REQUESTED",
    }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { actorUserId: true } });
    if (!stopAudit?.actorUserId) throw new Error("CANCEL_REQUEST_ACTOR_MISSING");
    try {
      await this.create({ tenantId, userId: stopAudit.actorUserId, conversationId: pending.conversationId,
        clientRequestId: `cancel:${pending.id}`, clientMessageId: `cancel-message:${pending.id}`, mode: "build", attachmentIds: [],
        action: { type: "resume_approval", expectedRunId: pending.id, action: "cancel", planHash: payload.planHash },
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "RUN_ACTION_STALE") throw error;
    }
  }
  // end

  async recoverExpired(ownerId: string, tenantId: string, now: Date): Promise<ClaimedRunLease | null> {
    const expiresAt = new Date(now.getTime() + this.leaseMs);
    return this.prisma.$transaction(async (tx) => {
      // 只在旧执行者确实已失去租约、且没有未释放的对话执行屏障时接手；
      // 不把状态无条件改回 QUEUED，也不在旧执行者仍持锁时抢占。
      const candidates = await tx.$queryRaw<Array<{ id: string; fence: number }>>`
        SELECT r."id", r."fence"
        FROM "AgentRun" AS r
        WHERE r."status" IN ('RUNNING','BUILDING','CANCEL_REQUESTED')
          AND r."tenantId" = ${tenantId}
          AND r."leaseExpiresAt" IS NOT NULL
          AND r."leaseExpiresAt" < ${now}
          AND NOT EXISTS (
            SELECT 1 FROM "ConversationTurnFence" AS f
            WHERE f."conversationId" = r."conversationId"
          )
        ORDER BY r."leaseExpiresAt"
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `;
      const candidate = candidates[0];
      if (candidate === undefined) return null;

      const claimed = await tx.$queryRaw<Array<{ fence: number }>>`
        UPDATE "AgentRun"
        SET "leaseOwner" = ${ownerId},
            "leaseExpiresAt" = ${expiresAt},
            "fence" = "fence" + 1
        WHERE "id" = ${candidate.id}
          AND "fence" = ${candidate.fence}
          AND "status" IN ('RUNNING','BUILDING','CANCEL_REQUESTED')
        RETURNING "fence"
      `;
      const row = claimed[0];
      if (row === undefined) return null;
      return { runId: candidate.id, ownerId, fence: row.fence, expiresAt: expiresAt.toISOString() };
    });
  }

  async renew(lease: ClaimedRunLease, now: Date): Promise<ClaimedRunLease> {
    const expiresAt = new Date(now.getTime() + this.leaseMs);
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE "AgentRun"
      SET "leaseExpiresAt" = ${expiresAt}
      WHERE "id" = ${lease.runId}
        AND "leaseOwner" = ${lease.ownerId}
        AND "fence" = ${lease.fence}
        AND "status" IN ('RUNNING','BUILDING','CANCEL_REQUESTED')
        AND "leaseExpiresAt" > ${now}
      RETURNING "id"
    `;
    if (rows.length === 0) throw new Error(FENCE_REJECTED);
    return { ...lease, expiresAt: expiresAt.toISOString() };
  }

  async append(
    lease: ClaimedRunLease,
    tenantId: string,
    event: Omit<RunEvent, "seq" | "createdAt" | "schemaVersion" | "runId">,
  ): Promise<RunEvent> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ lastSeq: number }>>`
        UPDATE "AgentRun"
        SET "lastSeq" = "lastSeq" + 1
        WHERE "id" = ${lease.runId}
          AND "tenantId" = ${tenantId}
          AND "leaseOwner" = ${lease.ownerId}
          AND "fence" = ${lease.fence}
          AND "leaseExpiresAt" > ${now}
          AND "status" NOT IN ('SUCCEEDED','FAILED','CANCELLED','WAITING_INPUT','WAITING_APPROVAL')
        RETURNING "lastSeq"
      `;
      const row = rows[0];
      if (row === undefined) throw new Error(FENCE_REJECTED);

      const created = await tx.agentRunEvent.create({
        data: {
          runId: lease.runId,
          tenantId,
          seq: row.lastSeq,
          type: event.type,
          payload: event.payload as Prisma.InputJsonObject,
        },
        select: { createdAt: true },
      });
      return {
        schemaVersion: 1,
        runId: lease.runId,
        seq: row.lastSeq,
        type: event.type,
        createdAt: created.createdAt.toISOString(),
        payload: event.payload,
      };
    });
  }

  async finish(
    lease: ClaimedRunLease,
    tenantId: string,
    status: RunStatus,
    failureCode?: string,
  ): Promise<RunSnapshot> {
    if (!TERMINAL.includes(status)) throw new Error("RUN_FINISH_REQUIRES_TERMINAL_STATUS");
    const now = new Date();
    return this.prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<RunRow[]>`
      UPDATE "AgentRun"
      SET "status" = CASE WHEN "status" = 'CANCEL_REQUESTED' AND "buildJobId" IS NULL THEN 'CANCELLED' ELSE ${status} END,
          "failureCode" = CASE WHEN "status" = 'CANCEL_REQUESTED' AND "buildJobId" IS NULL THEN 'RUN_CANCELLED' ELSE ${failureCode ?? null} END,
          "finishedAt" = ${now},
          "leaseOwner" = NULL,
          "leaseExpiresAt" = NULL
          , "lastSeq" = "lastSeq" + 1
      WHERE "id" = ${lease.runId}
        AND "tenantId" = ${tenantId}
        AND "leaseOwner" = ${lease.ownerId}
        AND "fence" = ${lease.fence}
        AND "leaseExpiresAt" > ${now}
        AND "status" NOT IN ('SUCCEEDED','FAILED','CANCELLED')
      RETURNING "id", "tenantId", "workspaceId", "conversationId", "status", "lastSeq",
                "baseRevisionId", "buildJobId", "resultRevisionId", "failureCode", "supersededByRunId"
    `;
    const row = rows[0];
    if (row === undefined) throw new Error(FENCE_REJECTED);
    await tx.agentRunEvent.create({ data: { runId: row.id, tenantId, seq: row.lastSeq,
      type: row.status === "SUCCEEDED" ? "run.completed" : row.status === "CANCELLED" ? "run.cancelled" : "run.failed",
      payload: row.status === "FAILED" ? { failureCode: row.failureCode ?? "RUN_FAILED" }
        : row.status === "SUCCEEDED" && row.resultRevisionId ? { revisionId: row.resultRevisionId } : {},
    } });
    await tx.conversation.update({
      where: { id: row.conversationId },
      data: { lastActivityAt: now },
    });
    return toSnapshot(row);
    });
  }

  // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
  /** Read-only settlement of the review transaction that deliberately released this exact lease. */
  async observeCommittedReviewPause(lease: ClaimedRunLease, tenantId: string, reviewHash: string): Promise<RunSnapshot> {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`kf-run-control:${lease.runId}`}, 0))`;
      const [run] = await tx.$queryRaw<AgentRun[]>`SELECT * FROM "AgentRun" WHERE "id"=${lease.runId} AND "tenantId"=${tenantId} FOR UPDATE`;
      if (!run || run.fence !== lease.fence || run.leaseOwner !== null || run.leaseExpiresAt !== null || run.buildJobId
        || !["WAITING_INPUT", "CANCELLED"].includes(run.status)
        || (run.configSnapshot as { planVersion?: unknown } | null)?.planVersion !== VISUAL_RUN_PLAN_VERSION) throw new Error(FENCE_REJECTED);
      // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
      // An immediate user correction may advance the current pointer before this worker acknowledges its pause.
      // Only the exact hash this worker published may settle, from the current row or its immutable archive.
      const steps = await tx.agentRunStep.findMany({ where: { tenantId, runId: run.id, inputHash: reviewHash, status: "COMPLETED",
        OR: [{ stepKey: "visual-review-v1" }, { stepKey: `visual-review-history-v1:${reviewHash}` }] } });
      // end
      let review;
      try { review = VisualReviewSchema.parse(JSON.parse(steps.length === 1 ? steps[0]!.outputRef ?? "null" : "null") as unknown); }
      catch { throw new Error(FENCE_REJECTED); }
      const content = review.content;
      if (review.reviewHash !== reviewHash || steps[0]!.inputHash !== reviewHash || canonicalServerHash(content) !== reviewHash
        || content.execution?.ownerId !== lease.ownerId || content.execution.fence !== lease.fence
        || content.runId !== run.id || content.tenantId !== tenantId || content.workspaceId !== run.workspaceId || content.conversationId !== run.conversationId
        || content.baseRevisionId !== run.baseRevisionId || content.configHash !== canonicalServerHash(run.configSnapshot)) throw new Error(FENCE_REJECTED);
      // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
      const event = await tx.agentRunEvent.findFirst({ where: { tenantId, runId: run.id, type: "input.required",
        ...(steps[0]!.stepKey === "visual-review-v1" ? {} : { payload: { path: ["receipt"], equals: review.receipt } }) }, orderBy: { seq: "desc" } });
      // This is read-only acknowledgement of the original publication, never permission to execute edited content.
      // end
      if ((event?.payload as { receipt?: unknown } | undefined)?.receipt !== review.receipt) throw new Error(FENCE_REJECTED);
      return toSnapshot(run);
    });
  }
  // end

  async pause(
    lease: ClaimedRunLease,
    tenantId: string,
    status: "WAITING_APPROVAL" | "WAITING_INPUT",
  ): Promise<RunSnapshot> {
    const now = new Date();
    // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
    const cancelImmediately = status !== "WAITING_APPROVAL";
    // end
    return this.prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<RunRow[]>`
      UPDATE "AgentRun"
      -- modified by jinlong.feng at 2026-10-21 Agent工作台迭代
      SET "status" = CASE WHEN "status" = 'CANCEL_REQUESTED' AND ${cancelImmediately} THEN 'CANCELLED' ELSE ${status} END,
          "failureCode" = CASE WHEN "status" = 'CANCEL_REQUESTED' AND ${cancelImmediately} THEN 'RUN_CANCELLED' ELSE "failureCode" END,
          "finishedAt" = CASE WHEN "status" = 'CANCEL_REQUESTED' AND ${cancelImmediately} THEN ${now} ELSE "finishedAt" END,
          "lastSeq" = "lastSeq" + CASE WHEN "status" = 'CANCEL_REQUESTED' AND ${cancelImmediately} THEN 1 ELSE 0 END,
      -- end
          "leaseOwner" = NULL,
          "leaseExpiresAt" = NULL
      WHERE "id" = ${lease.runId}
        AND "tenantId" = ${tenantId}
        AND "leaseOwner" = ${lease.ownerId}
        AND "fence" = ${lease.fence}
        AND "leaseExpiresAt" > ${now}
        AND ("status" = 'RUNNING' OR ("status" = 'CANCEL_REQUESTED' AND "buildJobId" IS NULL))
      RETURNING "id", "tenantId", "workspaceId", "conversationId", "status", "lastSeq",
                "baseRevisionId", "buildJobId", "resultRevisionId", "failureCode", "supersededByRunId"
    `;
    const row = rows[0];
    if (row === undefined) throw new Error(FENCE_REJECTED);
    if (row.status === "CANCELLED") await tx.agentRunEvent.create({ data: { runId: row.id, tenantId, seq: row.lastSeq, type: "run.cancelled", payload: {} } });
    // input.required / approval.required 已携带回执写入，状态与活动时间原子提交。
    await tx.conversation.update({
      where: { id: row.conversationId },
      data: { lastActivityAt: now },
    });
    return toSnapshot(row);
    });
  }
}

/** 活跃状态集合，供执行器与取消逻辑复用。 */
export const isActiveRunStatus = (status: RunStatus): boolean => ACTIVE.includes(status);
// end
