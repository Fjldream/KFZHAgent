// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { RunAction, RunEvent, RunMode, RunSnapshot, RunStatus } from "@kf/contracts";
import type { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { canonicalJson } from "../models/canonical-json.js";

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
};

export type ClaimedRunLease = { runId: string; ownerId: string; fence: number; expiresAt: string };

export interface RunStore {
  create(input: StartRunInput): Promise<RunSnapshot>;
  claim(ownerId: string, tenantId: string, now: Date): Promise<ClaimedRunLease | null>;
  /** 接手租约已过期的 RUNNING/CANCEL_REQUESTED run；旧执行者仍持锁时返回 null。 */
  recoverExpired(ownerId: string, tenantId: string, now: Date): Promise<ClaimedRunLease | null>;
  renew(lease: ClaimedRunLease, now: Date): Promise<ClaimedRunLease>;
  append(
    lease: ClaimedRunLease,
    tenantId: string,
    event: Omit<RunEvent, "seq" | "createdAt" | "schemaVersion" | "runId">,
  ): Promise<RunEvent>;
  finish(lease: ClaimedRunLease, tenantId: string, status: RunStatus, failureCode?: string): Promise<RunSnapshot>;
  /** 停在中途等用户确认：释放租约但 run 不结束，后续由新 action 继续。 */
  pause(lease: ClaimedRunLease, tenantId: string, status: "WAITING_APPROVAL" | "WAITING_INPUT"): Promise<RunSnapshot>;
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
  action.type === "message" ? action.text : `[${action.type}]`;

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
  ) {}

  async create(input: StartRunInput): Promise<RunSnapshot> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: input.conversationId, tenantId: input.tenantId },
      select: { id: true, workspaceId: true },
    });
    if (conversation === null) throw new Error(RUN_CONVERSATION_NOT_FOUND);

    const workspace = await this.prisma.solutionWorkspace.findFirst({
      where: { id: conversation.workspaceId, tenantId: input.tenantId },
      select: { currentRevisionId: true },
    });
    const baseRevisionId = input.expectedBaseRevisionId ?? workspace?.currentRevisionId ?? null;
    const requestHash = createHash("sha256")
      .update(canonicalJson({
        mode: input.mode,
        action: input.action,
        attachmentIds: input.attachmentIds,
        baseRevisionId,
      }), "utf8")
      .digest("hex");

    try {
      return await this.prisma.$transaction(async (tx) => {
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
            inputSnapshot: { attachmentIds: input.attachmentIds },
          },
          select: {
            id: true, tenantId: true, workspaceId: true, conversationId: true, status: true,
            lastSeq: true, baseRevisionId: true, buildJobId: true, resultRevisionId: true,
            failureCode: true, supersededByRunId: true,
          },
        });

        await tx.message.update({ where: { id: message.id }, data: { runId: run.id } });
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
          data: { lastActivityAt: new Date() },
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
    const expiresAt = new Date(now.getTime() + this.leaseMs);

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT r."id"
        FROM "AgentRun" AS r
        WHERE r."status" = 'QUEUED'
          AND r."tenantId" = ${tenantId}
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

  async recoverExpired(ownerId: string, tenantId: string, now: Date): Promise<ClaimedRunLease | null> {
    const expiresAt = new Date(now.getTime() + this.leaseMs);
    return this.prisma.$transaction(async (tx) => {
      // 只在旧执行者确实已失去租约、且没有未释放的对话执行屏障时接手；
      // 不把状态无条件改回 QUEUED，也不在旧执行者仍持锁时抢占。
      const candidates = await tx.$queryRaw<Array<{ id: string; fence: number }>>`
        SELECT r."id", r."fence"
        FROM "AgentRun" AS r
        WHERE r."status" IN ('RUNNING','CANCEL_REQUESTED')
          AND r."tenantId" = ${tenantId}
          AND r."leaseExpiresAt" IS NOT NULL
          AND r."leaseExpiresAt" < ${now}
          AND NOT EXISTS (
            SELECT 1 FROM "ConversationTurnFence" AS f
            WHERE f."conversationId" = r."conversationId" AND f."state" = 'PENDING'
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
          AND "status" IN ('RUNNING','CANCEL_REQUESTED')
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
          payload: event.payload as object,
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
    const rows = await this.prisma.$queryRaw<RunRow[]>`
      UPDATE "AgentRun"
      SET "status" = ${status},
          "failureCode" = ${failureCode ?? null},
          "finishedAt" = ${now},
          "leaseOwner" = NULL,
          "leaseExpiresAt" = NULL
      WHERE "id" = ${lease.runId}
        AND "tenantId" = ${tenantId}
        AND "leaseOwner" = ${lease.ownerId}
        AND "fence" = ${lease.fence}
        AND "status" NOT IN ('SUCCEEDED','FAILED','CANCELLED')
      RETURNING "id", "tenantId", "workspaceId", "conversationId", "status", "lastSeq",
                "baseRevisionId", "buildJobId", "resultRevisionId", "failureCode", "supersededByRunId"
    `;
    const row = rows[0];
    if (row === undefined) throw new Error(FENCE_REJECTED);
    // 终态必须落一条 run.finished：前端靠它区分「跑完了」和「连接窗口到期」。
    await this.prisma.$executeRaw`
      INSERT INTO "AgentRunEvent" ("id", "runId", "tenantId", "seq", "type", "payload", "createdAt")
      VALUES (gen_random_uuid()::text, ${row.id}, ${tenantId}, ${row.lastSeq + 1}, 'run.finished',
              ${JSON.stringify({ status, ...(failureCode === undefined ? {} : { failureCode }) })}::jsonb, now())
    `;
    await this.prisma.agentRun.update({ where: { id: row.id }, data: { lastSeq: row.lastSeq + 1 } });
    await this.prisma.conversation.update({
      where: { id: row.conversationId },
      data: { lastActivityAt: now },
    });
    return toSnapshot(row);
  }

  async pause(
    lease: ClaimedRunLease,
    tenantId: string,
    status: "WAITING_APPROVAL" | "WAITING_INPUT",
  ): Promise<RunSnapshot> {
    const now = new Date();
    const rows = await this.prisma.$queryRaw<RunRow[]>`
      UPDATE "AgentRun"
      SET "status" = ${status},
          "leaseOwner" = NULL,
          "leaseExpiresAt" = NULL
      WHERE "id" = ${lease.runId}
        AND "tenantId" = ${tenantId}
        AND "leaseOwner" = ${lease.ownerId}
        AND "fence" = ${lease.fence}
        AND "status" = 'RUNNING'
      RETURNING "id", "tenantId", "workspaceId", "conversationId", "status", "lastSeq",
                "baseRevisionId", "buildJobId", "resultRevisionId", "failureCode", "supersededByRunId"
    `;
    const row = rows[0];
    if (row === undefined) throw new Error(FENCE_REJECTED);
    await this.prisma.$executeRaw`
      INSERT INTO "AgentRunEvent" ("id", "runId", "tenantId", "seq", "type", "payload", "createdAt")
      VALUES (gen_random_uuid()::text, ${row.id}, ${tenantId}, ${row.lastSeq + 1}, 'run.paused',
              ${JSON.stringify({ status })}::jsonb, now())
    `;
    await this.prisma.agentRun.update({ where: { id: row.id }, data: { lastSeq: row.lastSeq + 1 } });
    await this.prisma.conversation.update({
      where: { id: row.conversationId },
      data: { lastActivityAt: now },
    });
    return toSnapshot(row);
  }
}

/** 活跃状态集合，供执行器与取消逻辑复用。 */
export const isActiveRunStatus = (status: RunStatus): boolean => ACTIVE.includes(status);
// end
