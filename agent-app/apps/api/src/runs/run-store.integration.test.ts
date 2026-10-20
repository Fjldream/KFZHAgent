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
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRunTestFixture, messageInput, type RunTestFixture } from "./run-test-fixture.js";
import { FENCE_REJECTED, IDEMPOTENCY_CONFLICT } from "./run-store.js";

let fixture: RunTestFixture;

beforeAll(async () => {
  fixture = await createRunTestFixture();
});

afterAll(async () => {
  await fixture.cleanup();
});

describe("run creation idempotency", () => {
  it("collapses concurrent identical requests into one run and one message", async () => {
    const input = messageInput(fixture, "same-request", "生成一个表格页面");
    const [a, b] = await Promise.all([fixture.store.create(input), fixture.store.create(input)]);

    expect(a.id).toBe(b.id);
    expect(await fixture.prisma.message.count({
      where: { conversationId: input.conversationId, clientMessageId: input.clientMessageId },
    })).toBe(1);
  });

  it("rejects the same clientRequestId with different content", async () => {
    const input = messageInput(fixture, "conflict-request", "生成一个表格页面");
    await fixture.store.create(input);
    await expect(fixture.store.create({
      ...input,
      clientMessageId: `${input.clientMessageId}-other`,
      action: { type: "message", text: "不同需求" },
    })).rejects.toThrow(IDEMPOTENCY_CONFLICT);
  });

  it("refuses a conversation from another tenant", async () => {
    const input = messageInput(fixture, "cross-tenant", "跨租户", {
      conversationId: fixture.conversationB,
    });
    await expect(fixture.store.create(input)).rejects.toThrow("RUN_CONVERSATION_NOT_FOUND");
  });
});

describe("run claim and fencing", () => {
  it("claims one run per conversation and leaves it RUNNING", async () => {
    await fixture.resetRuns();
    const conversationId = await fixture.newConversation();
    const created = await fixture.store.create(messageInput(fixture, "claim-1", "生成页面", { conversationId }));
    const lease = await fixture.store.claim("worker-1", fixture.tenantA, new Date());
    expect(lease?.runId).toBe(created.id);
    expect(lease?.fence).toBe(1);

    const running = await fixture.prisma.agentRun.findUniqueOrThrow({ where: { id: created.id } });
    expect(running.status).toBe("RUNNING");
    expect(running.leaseOwner).toBe("worker-1");

    // 同一会话已有活跃 run，后续排队任务不得被领取。
    await fixture.store.create(messageInput(fixture, "claim-2", "第二个任务", { conversationId }));
    expect(await fixture.store.claim("worker-2", fixture.tenantA, new Date())).toBeNull();
  });

  it("appends events with monotonic seq and rejects stale fences", async () => {
    await fixture.resetRuns();
    const conversationId = await fixture.newConversation();
    const created = await fixture.store.create(messageInput(fixture, "append-1", "生成页面", { conversationId }));
    const lease = await fixture.store.claim("worker-1", fixture.tenantA, new Date());
    expect(lease?.runId).toBe(created.id);
    if (lease === null) throw new Error("lease missing");

    const first = await fixture.store.append(lease, fixture.tenantA, {
      type: "step.started", payload: { stepKey: "plan", label: "规划中", attempt: 1 },
    });
    const second = await fixture.store.append(lease, fixture.tenantA, {
      type: "step.completed", payload: { stepKey: "plan", label: "规划中", attempt: 1 },
    });
    expect(second.seq).toBe(first.seq + 1);

    // 旧 fence 的迟到写入必须 0 行生效。
    await expect(fixture.store.append({ ...lease, fence: lease.fence - 1 }, fixture.tenantA, {
      type: "run.cancelled", payload: {},
    })).rejects.toThrow(FENCE_REJECTED);
  });

  it("rejects renew and append after the lease expires", async () => {
    const short = await createRunTestFixture(40);
    try {
      const created = await short.store.create(messageInput(short, "expire-1", "短租约"));
      const lease = await short.store.claim("worker-short", short.tenantA, new Date());
      expect(lease?.runId).toBe(created.id);
      if (lease === null) throw new Error("lease missing");

      await new Promise((resolve) => setTimeout(resolve, 60));
      await expect(short.store.renew(lease, new Date())).rejects.toThrow(FENCE_REJECTED);
      await expect(short.store.append(lease, short.tenantA, { type: "run.cancelled", payload: {} }))
        .rejects.toThrow(FENCE_REJECTED);
    } finally {
      await short.cleanup();
    }
  });

  it("finishes a run once and refuses later events", async () => {
    await fixture.resetRuns();
    const conversationId = await fixture.newConversation();
    const created = await fixture.store.create(messageInput(fixture, "finish-1", "生成页面", { conversationId }));
    const lease = await fixture.store.claim("worker-1", fixture.tenantA, new Date());
    if (lease === null || lease.runId !== created.id) throw new Error("lease mismatch");

    const snapshot = await fixture.store.finish(lease, fixture.tenantA, "FAILED", "MODEL_TIMEOUT");
    expect(snapshot).toMatchObject({ id: created.id, status: "FAILED", failureCode: "MODEL_TIMEOUT" });

    await expect(fixture.store.append(lease, fixture.tenantA, { type: "run.cancelled", payload: {} }))
      .rejects.toThrow(FENCE_REJECTED);
    await expect(fixture.store.finish(lease, fixture.tenantA, "SUCCEEDED"))
      .rejects.toThrow(FENCE_REJECTED);
  });

  it("rejects appends from another tenant holding a forged lease", async () => {
    await fixture.resetRuns();
    const conversationId = await fixture.newConversation();
    const created = await fixture.store.create(messageInput(fixture, "tenant-guard", "生成页面", { conversationId }));
    const lease = await fixture.store.claim("worker-1", fixture.tenantA, new Date());
    if (lease === null || lease.runId !== created.id) throw new Error("lease mismatch");

    await expect(fixture.store.append(lease, fixture.tenantB, {
      type: "run.cancelled", payload: {},
    })).rejects.toThrow(FENCE_REJECTED);
  });

  it("does not resurrect a terminal run by claiming it again", async () => {
    await fixture.resetRuns();
    const conversationId = await fixture.newConversation();
    await fixture.store.create(messageInput(fixture, "terminal-1", "生成页面", { conversationId }));
    const lease = await fixture.store.claim("worker-1", fixture.tenantA, new Date());
    if (lease === null) throw new Error("lease missing");
    await fixture.store.finish(lease, fixture.tenantA, "SUCCEEDED");

    const again = await fixture.store.claim("worker-2", fixture.tenantA, new Date());
    expect(again).toBeNull();
    const row = await fixture.prisma.agentRun.findUniqueOrThrow({ where: { id: lease.runId } });
    expect(row.status).toBe("SUCCEEDED");
    expect(row.fence).toBe(lease.fence);
  });
});

describe("run creation side effects", () => {
  it("writes the queued event, a budget and the conversation activity time", async () => {
    const before = new Date(Date.now() - 1_000);
    const created = await fixture.store.create(messageInput(fixture, randomUUID(), "生成页面"));

    const event = await fixture.prisma.agentRunEvent.findFirstOrThrow({
      where: { runId: created.id },
      orderBy: { seq: "asc" },
    });
    expect(event).toMatchObject({ seq: 1, type: "run.queued" });
    expect(await fixture.prisma.runBudget.findUnique({ where: { runId: created.id } })).not.toBeNull();

    const conversation = await fixture.prisma.conversation.findUniqueOrThrow({
      where: { id: fixture.conversationA },
    });
    expect(conversation.lastActivityAt.getTime()).toBeGreaterThan(before.getTime());
  });
});

describe("expired lease recovery", () => {
  it("takes over an expired run with a higher fence and rejects the old worker", async () => {
    await fixture.resetRuns();
    const short = await createRunTestFixture(50);
    try {
      const conversationId = await short.newConversation();
      const created = await short.store.create(messageInput(short, "recover-1", "跨租约", { conversationId }));
      const oldLease = await short.store.claim("worker-old", short.tenantA, new Date());
      if (oldLease === null || oldLease.runId !== created.id) throw new Error("lease mismatch");

      await new Promise((resolve) => setTimeout(resolve, 80));
      const recovered = await short.store.recoverExpired("worker-new", short.tenantA, new Date());
      expect(recovered).toMatchObject({ runId: created.id, ownerId: "worker-new" });
      expect(recovered?.fence).toBe(oldLease.fence + 1);

      await expect(short.store.append(oldLease, short.tenantA, { type: "run.cancelled", payload: {} }))
        .rejects.toThrow(FENCE_REJECTED);
      await expect(short.store.renew(oldLease, new Date())).rejects.toThrow(FENCE_REJECTED);
    } finally {
      await short.cleanup();
    }
  });

  it("refuses to recover while a pending conversation turn fence exists", async () => {
    await fixture.resetRuns();
    const short = await createRunTestFixture(50);
    try {
      const conversationId = await short.newConversation();
      const created = await short.store.create(messageInput(short, "recover-2", "有屏障", { conversationId }));
      const oldLease = await short.store.claim("worker-old", short.tenantA, new Date());
      if (oldLease === null) throw new Error("lease missing");
      await short.prisma.conversationTurnFence.create({
        data: { conversationId, ownerId: "legacy-sse", leaseId: `lease-${created.id}` },
      });
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(await short.store.recoverExpired("worker-new", short.tenantA, new Date())).toBeNull();
    } finally {
      await short.cleanup();
    }
  });
});
// end
