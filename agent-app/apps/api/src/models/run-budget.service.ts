// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { NormalizedUsage } from "@kf/contracts";
import { Injectable } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";

export const BUDGET_EXCEEDED = "BUDGET_EXCEEDED";
export const BUDGET_NOT_CONFIGURED = "BUDGET_NOT_CONFIGURED";
export const RESERVATION_NOT_FOUND = "RESERVATION_NOT_FOUND";

export type BudgetReserveInput = {
  tenantId: string;
  runId: string;
  invocationId: string;
  estimatedInputUpperBound: number;
  maxOutputTokens: number;
};

export type BudgetSettleInput = {
  tenantId: string;
  runId: string;
  invocationId: string;
  usage: NormalizedUsage;
  /** known=按实际结算；unknown=保留保守额度；not_sent=根本没发出去，释放额度。 */
  result: "known" | "unknown" | "not_sent";
};

export interface BudgetPort {
  reserve(input: BudgetReserveInput): Promise<void>;
  settle(input: BudgetSettleInput): Promise<void>;
}

type BudgetRow = {
  maxInvocations: number;
  reservedInvocations: number;
  usedInvocations: number;
  maxInputTokens: number;
  reservedTokenUpperBound: number;
};

/**
 * 单 run 的模型调用预算。
 *
 * 所有修复、摘要、视觉调用共用同一个预算实例；预占在短事务内对
 * RunBudget 行加 FOR UPDATE 锁，保证并发下不会超发。
 * settle 以「预占记录仍是 RESERVED」为幂等条件，重复上报不会二次累计。
 */
@Injectable()
export class RunBudgetService implements BudgetPort {
  constructor(private readonly prisma: PrismaClient) {}

  async reserve(input: BudgetReserveInput): Promise<void> {
    const reserveTokens = input.estimatedInputUpperBound + input.maxOutputTokens;

    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<BudgetRow[]>`
        SELECT "maxInvocations", "reservedInvocations", "usedInvocations",
               "maxInputTokens", "reservedTokenUpperBound"
        FROM "RunBudget"
        WHERE "runId" = ${input.runId}
        FOR UPDATE
      `;
      const budget = rows[0];
      if (budget === undefined) throw new Error(BUDGET_NOT_CONFIGURED);

      if (budget.usedInvocations + budget.reservedInvocations + 1 > budget.maxInvocations) {
        throw new Error(BUDGET_EXCEEDED);
      }
      if (budget.reservedTokenUpperBound + reserveTokens > budget.maxInputTokens) {
        throw new Error(BUDGET_EXCEEDED);
      }

      await tx.$executeRaw`
        UPDATE "RunBudget"
        SET "reservedInvocations" = "reservedInvocations" + 1,
            "reservedTokenUpperBound" = "reservedTokenUpperBound" + ${reserveTokens},
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "runId" = ${input.runId}
      `;
      await tx.budgetReservation.create({
        data: {
          tenantId: input.tenantId,
          runId: input.runId,
          invocationId: input.invocationId,
          reservedInput: input.estimatedInputUpperBound,
          reservedOutput: input.maxOutputTokens,
        },
      });
    });
  }

  async settle(input: BudgetSettleInput): Promise<void> {
    // 计量不可信时不按 known 结算，避免把矛盾数字写进已用额度。
    const requested = input.result;
    const effective = requested === "known"
      && (input.usage.source === "unknown" || input.usage.inconsistent)
      ? "unknown"
      : requested;

    await this.prisma.$transaction(async (tx) => {
      const reservation = await tx.budgetReservation.findUnique({
        where: { tenantId_invocationId: { tenantId: input.tenantId, invocationId: input.invocationId } },
      });
      if (reservation === null) throw new Error(RESERVATION_NOT_FOUND);
      if (reservation.state !== "RESERVED") return;

      const released = reservation.reservedInput + reservation.reservedOutput;
      const settledAt = new Date();

      if (effective === "not_sent") {
        await tx.budgetReservation.update({
          where: { id: reservation.id },
          data: { state: "RELEASED", settledAt },
        });
        await tx.runBudget.update({
          where: { runId: input.runId },
          data: {
            reservedInvocations: { decrement: 1 },
            reservedTokenUpperBound: { decrement: released },
          },
        });
        return;
      }

      const knownTokens = effective === "known"
        ? (input.usage.inputTokens ?? 0) + (input.usage.outputTokens ?? 0)
        : 0;
      await tx.budgetReservation.update({
        where: { id: reservation.id },
        data: { state: "SETTLED", settledAt },
      });
      await tx.runBudget.update({
        where: { runId: input.runId },
        data: {
          reservedInvocations: { decrement: 1 },
          usedInvocations: { increment: 1 },
          usedKnownTokens: { increment: knownTokens },
          ...(effective === "unknown"
            // 结果未知时保留预占额度（保守），只把调用计入未知计数。
            ? { unknownUsageCount: { increment: 1 } }
            : { reservedTokenUpperBound: { decrement: released } }),
        },
      });
    });
  }
}
// end
