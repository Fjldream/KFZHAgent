// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import type { PrismaClient } from "@prisma/client";
import { FENCE_REJECTED, type ClaimedRunLease } from "./run-store.js";
// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { recordApprovalDecision } from "./run-audit.js";
// end

export interface RunStepStore {
  findCompleted(input: {
    tenantId: string;
    runId: string;
    stepKey: string;
    inputHash: string;
  }): Promise<unknown>;
  complete(input: {
    lease: ClaimedRunLease;
    tenantId: string;
    stepKey: string;
    inputHash: string;
    output: unknown;
  }): Promise<void>;
}

/**
 * 节点级幂等存储。
 *
 * 恢复语义：只有「同一 run + 同一 stepKey + 同一 inputHash」的已完成输出才可复用；
 * inputHash 必须包含节点逻辑版本与输入（含 schema 版本），否则旧 schema 的输出会被误用。
 */
export class PrismaRunStepStore implements RunStepStore {
  constructor(private readonly prisma: PrismaClient) {}

  async findCompleted(input: {
    tenantId: string;
    runId: string;
    stepKey: string;
    inputHash: string;
  }): Promise<unknown> {
    const row = await this.prisma.agentRunStep.findFirst({
      where: {
        tenantId: input.tenantId,
        runId: input.runId,
        stepKey: input.stepKey,
        inputHash: input.inputHash,
        status: "COMPLETED",
      },
      select: { outputRef: true },
    });
    if (row?.outputRef === undefined || row.outputRef === null) return null;
    try {
      return JSON.parse(row.outputRef) as unknown;
    } catch {
      // 输出损坏时宁可重算，也不把坏 JSON 当结果喂给下游。
      return null;
    }
  }

  async complete(input: {
    lease: ClaimedRunLease;
    tenantId: string;
    stepKey: string;
    inputHash: string;
    output: unknown;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // 旧 fence 不得写步骤结果，否则恢复时会复用过期执行者的输出。
      const leaseRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "AgentRun"
        WHERE "id" = ${input.lease.runId}
          AND "tenantId" = ${input.tenantId}
          AND "leaseOwner" = ${input.lease.ownerId}
          AND "fence" = ${input.lease.fence}
          AND "status" NOT IN ('SUCCEEDED','FAILED','CANCELLED')
        FOR UPDATE
      `;
      if (leaseRows.length === 0) throw new Error(FENCE_REJECTED);

      // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
      // 墙钟检查必须在取得行锁之后，不能使用等待锁之前的 JS 时间或事务起始时间。
      const [check] = await tx.$queryRaw<Array<{ active: boolean }>>`
        SELECT "leaseExpiresAt" > clock_timestamp()::timestamp AS active FROM "AgentRun"
        WHERE "id" = ${input.lease.runId}
      `;
      if (check?.active !== true) throw new Error(FENCE_REJECTED);
      if (input.stepKey === "approval-decision") {
        const run = await tx.agentRun.findUniqueOrThrow({ where: { id: input.lease.runId } });
        if (run.status === "CANCEL_REQUESTED") throw new Error(FENCE_REJECTED);
        await recordApprovalDecision(tx, run, input.output);
      }
      // end

      const outputRef = JSON.stringify(input.output ?? null);
      await tx.agentRunStep.upsert({
        where: {
          runId_stepKey_inputHash: {
            runId: input.lease.runId,
            stepKey: input.stepKey,
            inputHash: input.inputHash,
          },
        },
        create: {
          runId: input.lease.runId,
          tenantId: input.tenantId,
          stepKey: input.stepKey,
          inputHash: input.inputHash,
          status: "COMPLETED",
          attempt: 1,
          outputRef,
        },
        update: {
          status: "COMPLETED",
          outputRef,
          attempt: { increment: 1 },
        },
      });
    });
  }
}
// end
