// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:5432/kf_agent_test_agent_next";

import { assertSafeTestDatabase } from "../../../../tests/helpers/database-safety.js";
assertSafeTestDatabase({
  url: process.env.DATABASE_URL,
  allowReset: process.env.KF_TEST_ALLOW_DESTRUCTIVE_RESET,
  expectedPrefix: "kf_agent_test_",
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLeaseBoundStepMemo } from "./run-step-memo.adapter.js";
import { FENCE_REJECTED } from "./run-store.js";
import { PrismaRunStepStore } from "./run-step-store.js";
import { createRunTestFixture, messageInput, type RunTestFixture } from "./run-test-fixture.js";

let fixture: RunTestFixture;
let steps: PrismaRunStepStore;

beforeAll(async () => {
  fixture = await createRunTestFixture();
  steps = new PrismaRunStepStore(fixture.prisma);
});

afterAll(async () => {
  await fixture.cleanup();
});

const claimFreshRun = async (clientRequestId: string) => {
  await fixture.resetRuns();
  const conversationId = await fixture.newConversation();
  const created = await fixture.store.create(
    messageInput(fixture, clientRequestId, "生成页面", { conversationId }),
  );
  const lease = await fixture.store.claim("worker-memo", fixture.tenantA, new Date());
  if (lease === null || lease.runId !== created.id) throw new Error("lease mismatch");
  return lease;
};

describe("lease bound step memo", () => {
  it("persists through the fenced step store and reads the output back", async () => {
    const lease = await claimFreshRun("memo-1");
    const memo = createLeaseBoundStepMemo({ steps, lease, tenantId: fixture.tenantA });

    expect(await memo.find("plan", "hash-1")).toBeNull();
    await memo.save("plan", "hash-1", { stage: "solution-plan-ready" });

    expect(await memo.find("plan", "hash-1")).toEqual({ stage: "solution-plan-ready" });
    expect(await memo.find("plan", "hash-2")).toBeNull();
  });

  it("rejects writes once another worker recovered the lease", async () => {
    const short = await createRunTestFixture(50);
    try {
      const conversationId = await short.newConversation();
      const created = await short.store.create(messageInput(short, "memo-2", "跨租约", { conversationId }));
      const oldLease = await short.store.claim("worker-old", short.tenantA, new Date());
      if (oldLease === null || oldLease.runId !== created.id) throw new Error("lease mismatch");

      await new Promise((resolve) => setTimeout(resolve, 80));
      const recovered = await short.store.recoverExpired("worker-new", short.tenantA, new Date());
      expect(recovered?.fence).toBe(oldLease.fence + 1);

      const staleMemo = createLeaseBoundStepMemo({
        steps: new PrismaRunStepStore(short.prisma), lease: oldLease, tenantId: short.tenantA,
      });
      await expect(staleMemo.save("plan", "hash-1", { stage: "done" })).rejects.toThrow(FENCE_REJECTED);
    } finally {
      await short.cleanup();
    }
  });
});
// end
