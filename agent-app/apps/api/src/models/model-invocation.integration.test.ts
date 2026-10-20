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
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  INVOCATION_NOT_FOUND,
  INVOCATION_STATE_CONFLICT,
  ModelInvocationService,
  type InvocationStart,
} from "./model-invocation.service.js";
import { normalizeUsage } from "./normalize-usage.js";
import type { PriceRates } from "./pricing.js";

const RATES: PriceRates = {
  version: "test-v1",
  currency: "CNY",
  hitMicrosPerMillion: 1_000_000n,
  missMicrosPerMillion: 2_000_000n,
  outputMicrosPerMillion: 3_000_000n,
};

const TENANT_A = randomUUID();
const TENANT_B = randomUUID();
const WORKSPACE = randomUUID();

let prisma: PrismaClient;
let priced: ModelInvocationService;
let unpriced: ModelInvocationService;

const startInput = (overrides: Partial<InvocationStart> = {}): InvocationStart => ({
  tenantId: TENANT_A,
  workspaceId: WORKSPACE,
  conversationId: null,
  runId: null,
  task: "implementation",
  provider: "deepseek",
  requestedModel: "deepseek-chat",
  promptVersion: "implementation@1",
  schemaVersion: "1",
  prefixHash: "prefix-hash",
  inputHash: "input-hash",
  attempt: 1,
  ...overrides,
});

const completeUsage = normalizeUsage({
  prompt_tokens: 1000,
  completion_tokens: 100,
  prompt_cache_hit_tokens: 800,
  prompt_cache_miss_tokens: 200,
});
const inconsistentUsage = normalizeUsage({
  prompt_tokens: 1000,
  completion_tokens: 100,
  prompt_cache_hit_tokens: 800,
  prompt_cache_miss_tokens: 100,
});

beforeAll(() => {
  prisma = new PrismaClient();
  priced = new ModelInvocationService(prisma, RATES);
  unpriced = new ModelInvocationService(prisma, null);
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.modelInvocation.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
});

describe("model invocation ledger", () => {
  it("starts a RUNNING row scoped to the tenant without storing prompts or keys", async () => {
    const id = await priced.start(startInput());
    const row = await prisma.modelInvocation.findUniqueOrThrow({ where: { id } });

    expect(row).toMatchObject({
      tenantId: TENANT_A,
      workspaceId: WORKSPACE,
      status: "RUNNING",
      attempt: 1,
      requestedModel: "deepseek-chat",
      promptVersion: "implementation@1",
      costMicros: null,
      finishedAt: null,
    });
    const columns = Object.keys(row);
    expect(columns).not.toContain("prompt");
    expect(columns).not.toContain("apiKey");
    expect(columns).not.toContain("requestBody");
  });

  it("prices a successful call and stores normalized usage", async () => {
    const id = await priced.start(startInput());
    await priced.finish(id, TENANT_A, {
      status: "SUCCEEDED",
      usage: completeUsage,
      actualModel: "deepseek-chat-2026-10",
      latencyMs: 1234,
      providerRequestId: "req-1",
      failureCode: null,
    });

    const row = await prisma.modelInvocation.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({
      status: "SUCCEEDED",
      inputTokens: 1000,
      outputTokens: 100,
      cacheHitTokens: 800,
      cacheMissTokens: 200,
      usageSource: "provider",
      currency: "CNY",
      pricingVersion: "test-v1",
      latencyMs: 1234,
      providerRequestId: "req-1",
      actualModel: "deepseek-chat-2026-10",
    });
    expect(row.costMicros).toBe(1500n);
    expect(row.finishedAt).not.toBeNull();
  });

  it("treats a repeated identical finish as idempotent", async () => {
    const id = await priced.start(startInput());
    const finish = {
      status: "SUCCEEDED" as const,
      usage: completeUsage,
      actualModel: "deepseek-chat",
      latencyMs: 800,
      providerRequestId: "req-1",
      failureCode: null,
    };
    await priced.finish(id, TENANT_A, finish);
    const first = await prisma.modelInvocation.findUniqueOrThrow({ where: { id } });

    await expect(priced.finish(id, TENANT_A, finish)).resolves.toBeUndefined();
    const second = await prisma.modelInvocation.findUniqueOrThrow({ where: { id } });

    expect(second.costMicros).toBe(first.costMicros);
    expect(second.finishedAt?.getTime()).toBe(first.finishedAt?.getTime());
  });

  it("refuses to finish another tenant's invocation and leaves it RUNNING", async () => {
    const id = await priced.start(startInput());
    await expect(priced.finish(id, TENANT_B, {
      status: "SUCCEEDED",
      usage: completeUsage,
      actualModel: null,
      latencyMs: 10,
      providerRequestId: null,
      failureCode: null,
    })).rejects.toThrow(INVOCATION_NOT_FOUND);

    const row = await prisma.modelInvocation.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("RUNNING");
    expect(row.costMicros).toBeNull();
  });

  it("keeps cost unknown when the price table is missing or usage is untrustworthy", async () => {
    const withoutPrices = await unpriced.start(startInput());
    await unpriced.finish(withoutPrices, TENANT_A, {
      status: "SUCCEEDED",
      usage: completeUsage,
      actualModel: null,
      latencyMs: 10,
      providerRequestId: null,
      failureCode: null,
    });
    const noPriceRow = await prisma.modelInvocation.findUniqueOrThrow({ where: { id: withoutPrices } });
    expect(noPriceRow.status).toBe("SUCCEEDED");
    expect(noPriceRow.costMicros).toBeNull();
    expect(noPriceRow.currency).toBeNull();
    expect(noPriceRow.pricingVersion).toBeNull();

    const inconsistent = await priced.start(startInput({ attempt: 2 }));
    await priced.finish(inconsistent, TENANT_A, {
      status: "SUCCEEDED",
      usage: inconsistentUsage,
      actualModel: null,
      latencyMs: 10,
      providerRequestId: null,
      failureCode: null,
    });
    expect((await prisma.modelInvocation.findUniqueOrThrow({ where: { id: inconsistent } })).costMicros)
      .toBeNull();

    const unknown = await priced.start(startInput({ attempt: 3 }));
    await priced.finish(unknown, TENANT_A, {
      status: "UNKNOWN",
      usage: normalizeUsage(undefined),
      actualModel: null,
      latencyMs: 60_000,
      providerRequestId: null,
      failureCode: "MODEL_TIMEOUT",
    });
    const unknownRow = await prisma.modelInvocation.findUniqueOrThrow({ where: { id: unknown } });
    expect(unknownRow).toMatchObject({ status: "UNKNOWN", costMicros: null, usageSource: "unknown" });
  });

  it("rejects a conflicting terminal status instead of overwriting history", async () => {
    const id = await priced.start(startInput());
    await priced.finish(id, TENANT_A, {
      status: "SUCCEEDED",
      usage: completeUsage,
      actualModel: null,
      latencyMs: 10,
      providerRequestId: null,
      failureCode: null,
    });
    await expect(priced.finish(id, TENANT_A, {
      status: "FAILED",
      usage: normalizeUsage(undefined),
      actualModel: null,
      latencyMs: 20,
      providerRequestId: null,
      failureCode: "MODEL_PROTOCOL_ERROR",
    })).rejects.toThrow(INVOCATION_STATE_CONFLICT);
  });
});
// end
