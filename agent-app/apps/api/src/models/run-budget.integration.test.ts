// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:5432/kf_agent_test_agent_next";

import { assertSafeTestDatabase } from "../../../../tests/helpers/database-safety.js";
assertSafeTestDatabase({
  url: process.env.DATABASE_URL,
  allowReset: process.env.KF_TEST_ALLOW_DESTRUCTIVE_RESET,
  expectedPrefix: "kf_agent_test_",
});

import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalizeUsage } from "./normalize-usage.js";
import {
  BUDGET_EXCEEDED,
  BUDGET_NOT_CONFIGURED,
  RESERVATION_NOT_FOUND,
  RunBudgetService,
} from "./run-budget.service.js";

const TENANT_A = randomUUID();
const TENANT_B = randomUUID();
const runIds: string[] = [];

let prisma: PrismaClient;
let budget: RunBudgetService;

const createBudget = async (overrides: { maxInvocations?: number; maxInputTokens?: number } = {}) => {
  const runId = randomUUID();
  runIds.push(runId);
  await prisma.runBudget.create({
    data: {
      runId,
      maxInvocations: overrides.maxInvocations ?? 8,
      maxInputTokens: overrides.maxInputTokens ?? 1_000_000,
      maxOutputTokens: 4_000,
    },
  });
  return runId;
};

const usage = normalizeUsage({ prompt_tokens: 100, completion_tokens: 20,
  prompt_cache_hit_tokens: 80, prompt_cache_miss_tokens: 20 });

beforeAll(() => {
  prisma = new PrismaClient();
  budget = new RunBudgetService(prisma);
});

afterAll(async () => {
  await prisma.budgetReservation.deleteMany({ where: { runId: { in: runIds } } });
  await prisma.runBudget.deleteMany({ where: { runId: { in: runIds } } });
  await prisma.$disconnect();
});

describe("run budget reservation", () => {
  it("never oversells invocation slots under concurrency", async () => {
    const runId = await createBudget({ maxInvocations: 8 });
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => budget.reserve({
        tenantId: TENANT_A, runId, invocationId: randomUUID(),
        estimatedInputUpperBound: 100, maxOutputTokens: 100,
      })),
    );

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected") as PromiseRejectedResult[];
    expect(fulfilled).toHaveLength(8);
    expect(rejected).toHaveLength(12);
    for (const result of rejected) expect(String(result.reason)).toContain(BUDGET_EXCEEDED);
  });

  it("refuses a reservation that would exceed the token ceiling", async () => {
    const runId = await createBudget({ maxInvocations: 5, maxInputTokens: 1_000 });
    await expect(budget.reserve({
      tenantId: TENANT_A, runId, invocationId: randomUUID(),
      estimatedInputUpperBound: 900, maxOutputTokens: 200,
    })).rejects.toThrow(BUDGET_EXCEEDED);
  });

  it("rejects runs without a budget row", async () => {
    await expect(budget.reserve({
      tenantId: TENANT_A, runId: randomUUID(), invocationId: randomUUID(),
      estimatedInputUpperBound: 10, maxOutputTokens: 10,
    })).rejects.toThrow(BUDGET_NOT_CONFIGURED);
  });
});

describe("run budget settlement", () => {
  it("settles known usage once and releases the reservation", async () => {
    const runId = await createBudget();
    const invocationId = randomUUID();
    await budget.reserve({ tenantId: TENANT_A, runId, invocationId,
      estimatedInputUpperBound: 1000, maxOutputTokens: 500 });
    await budget.settle({ tenantId: TENANT_A, runId, invocationId, usage, result: "known" });

    const row = await prisma.runBudget.findUniqueOrThrow({ where: { runId } });
    expect(row).toMatchObject({ usedInvocations: 1, reservedInvocations: 0,
      reservedTokenUpperBound: 0, usedKnownTokens: 120, unknownUsageCount: 0 });

    await budget.settle({ tenantId: TENANT_A, runId, invocationId, usage, result: "known" });
    const again = await prisma.runBudget.findUniqueOrThrow({ where: { runId } });
    expect(again.usedKnownTokens).toBe(120);
    expect(again.usedInvocations).toBe(1);
  });

  it("keeps the conservative reservation when the result is unknown", async () => {
    const runId = await createBudget();
    const invocationId = randomUUID();
    await budget.reserve({ tenantId: TENANT_A, runId, invocationId,
      estimatedInputUpperBound: 1000, maxOutputTokens: 500 });
    await budget.settle({ tenantId: TENANT_A, runId, invocationId,
      usage: normalizeUsage(undefined), result: "unknown" });

    const row = await prisma.runBudget.findUniqueOrThrow({ where: { runId } });
    expect(row).toMatchObject({ usedInvocations: 1, reservedInvocations: 0,
      reservedTokenUpperBound: 1500, unknownUsageCount: 1, usedKnownTokens: 0 });
  });

  it("releases everything when the request was never sent", async () => {
    const runId = await createBudget();
    const invocationId = randomUUID();
    await budget.reserve({ tenantId: TENANT_A, runId, invocationId,
      estimatedInputUpperBound: 800, maxOutputTokens: 200 });
    await budget.settle({ tenantId: TENANT_A, runId, invocationId,
      usage: normalizeUsage(undefined), result: "not_sent" });

    const row = await prisma.runBudget.findUniqueOrThrow({ where: { runId } });
    expect(row).toMatchObject({ usedInvocations: 0, reservedInvocations: 0,
      reservedTokenUpperBound: 0, unknownUsageCount: 0 });
    const reservation = await prisma.budgetReservation.findUniqueOrThrow({
      where: { tenantId_invocationId: { tenantId: TENANT_A, invocationId } },
    });
    expect(reservation.state).toBe("RELEASED");
  });

  it("treats contradictory usage as unknown instead of billed tokens", async () => {
    const runId = await createBudget();
    const invocationId = randomUUID();
    await budget.reserve({ tenantId: TENANT_A, runId, invocationId,
      estimatedInputUpperBound: 100, maxOutputTokens: 100 });
    const inconsistent = normalizeUsage({ prompt_tokens: 100, completion_tokens: 20,
      prompt_cache_hit_tokens: 90, prompt_cache_miss_tokens: 1 });
    await budget.settle({ tenantId: TENANT_A, runId, invocationId, usage: inconsistent, result: "known" });

    const row = await prisma.runBudget.findUniqueOrThrow({ where: { runId } });
    expect(row).toMatchObject({ usedInvocations: 1, usedKnownTokens: 0, unknownUsageCount: 1 });
  });

  it("refuses settlement from another tenant", async () => {
    const runId = await createBudget();
    const invocationId = randomUUID();
    await budget.reserve({ tenantId: TENANT_A, runId, invocationId,
      estimatedInputUpperBound: 10, maxOutputTokens: 10 });
    await expect(budget.settle({ tenantId: TENANT_B, runId, invocationId, usage, result: "known" }))
      .rejects.toThrow(RESERVATION_NOT_FOUND);
  });
});
// end
