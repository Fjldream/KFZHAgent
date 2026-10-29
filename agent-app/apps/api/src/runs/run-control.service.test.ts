// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { RunControlService } from "./run-control.service.js";
import type { RunStore } from "./run-store.js";
import { PrismaRunQueries } from "./run-query.service.js";

describe("native cancellation race error mapping", () => {
  it.each(["RUN_ACTION_STALE", "PLAN_HASH_MISMATCH", "STALE_BASE_REVISION", "IDEMPOTENCY_CONFLICT"])("returns an explicit HTTP conflict for %s after observing approval", async code => {
    // 只替换发生竞争的存储边界；服务的错误映射与审批路由保持真实。
    const prisma = { agentRun: { findFirst: vi.fn(async () => ({ id: "r", tenantId: "t", conversationId: "c", status: "WAITING_APPROVAL" })) }, agentRunEvent: { findFirst: vi.fn(async () => ({ payload: { planHash: "hash" } })) } } as unknown as PrismaClient;
    const store = { create: async () => { throw new Error(code); } } as unknown as RunStore;
    const service = new RunControlService(prisma, store, new PrismaRunQueries(prisma));
    await expect(service.cancel("t", "r", "u")).rejects.toMatchObject({ status: 409, message: code });
  });
});
// end
