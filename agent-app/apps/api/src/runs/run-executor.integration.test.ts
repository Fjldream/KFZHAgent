// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:5432/kf_agent_test_agent_next";

import { assertSafeTestDatabase } from "../../../../tests/helpers/database-safety.js";
assertSafeTestDatabase({
  url: process.env.DATABASE_URL,
  allowReset: process.env.KF_TEST_ALLOW_DESTRUCTIVE_RESET,
  expectedPrefix: "kf_agent_test_",
});

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { createRunTestFixture, messageInput, runTestPolicy, type RunTestFixture } from "./run-test-fixture.js";
// end
import { GraphRunExecutor, RunPaused, type ExecutableStep } from "./run-executor.js";
import { PrismaRunStepStore } from "./run-step-store.js";
import { PrismaRunStore } from "./run-store.js";

let fixture: RunTestFixture;
let steps: PrismaRunStepStore;

const step = (overrides: Partial<ExecutableStep> = {}): ExecutableStep => ({
  stepKey: "plan",
  label: "规划中",
  inputHash: "input-1",
  run: async () => ({ output: { ok: true }, safeSummary: "规划完成" }),
  ...overrides,
});

beforeAll(async () => {
  fixture = await createRunTestFixture();
  steps = new PrismaRunStepStore(fixture.prisma);
});

afterAll(async () => {
  await fixture.cleanup();
});

const startRun = async (clientRequestId: string) => {
  await fixture.resetRuns();
  const conversationId = await fixture.newConversation();
  const created = await fixture.store.create(
    messageInput(fixture, clientRequestId, "生成页面", { conversationId }),
  );
  const lease = await fixture.store.claim("worker-t09", fixture.tenantA, new Date());
  if (lease === null || lease.runId !== created.id) throw new Error("lease mismatch");
  return lease;
};

describe("run executor", () => {
  it("executes steps in order and finishes the run", async () => {
    const lease = await startRun("exec-success");
    const executor = new GraphRunExecutor({ store: fixture.store, steps });

    const snapshot = await executor.execute(lease, fixture.tenantA,
      [step(), step({ stepKey: "compile", label: "编译中", inputHash: "input-2",
        run: async () => ({ output: { artifact: "a1" }, safeSummary: "编译完成" }) })],
      new AbortController().signal);

    expect(snapshot.status).toBe("SUCCEEDED");
    const events = await fixture.prisma.agentRunEvent.findMany({
      where: { runId: lease.runId }, orderBy: { seq: "asc" },
    });
    expect(events.map((event) => event.type)).toEqual([
      "run.queued", "run.started", "step.started", "step.completed", "step.started", "step.completed", "run.completed",
    ]);
    const completed = await fixture.prisma.agentRunStep.findMany({
      where: { runId: lease.runId, status: "COMPLETED" },
    });
    expect(completed).toHaveLength(2);
  });

  it("reuses a committed step instead of running it again", async () => {
    const lease = await startRun("exec-reuse");
    await steps.complete({ lease, tenantId: fixture.tenantA, stepKey: "plan", inputHash: "input-1",
      output: { cached: true } });

    const runner = vi.fn(async () => ({ output: { cached: false } }));
    const executor = new GraphRunExecutor({ store: fixture.store, steps });
    const snapshot = await executor.execute(lease, fixture.tenantA,
      [step({ run: runner })], new AbortController().signal);

    expect(runner).not.toHaveBeenCalled();
    expect(snapshot.status).toBe("SUCCEEDED");
    const events = await fixture.prisma.agentRunEvent.findMany({
      where: { runId: lease.runId, type: "step.completed" },
    });
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events[0]?.payload)).toContain("已复用");
  });

  it("fails the run with a bounded failure code", async () => {
    const lease = await startRun("exec-fail");
    const executor = new GraphRunExecutor({ store: fixture.store, steps });

    const snapshot = await executor.execute(lease, fixture.tenantA, [
      step({ run: async () => { throw Object.assign(new Error("boom"), { code: "MODEL_TIMEOUT" }); } }),
    ], new AbortController().signal);

    expect(snapshot).toMatchObject({ status: "FAILED", failureCode: "MODEL_TIMEOUT" });
    const failed = await fixture.prisma.agentRunEvent.findMany({
      where: { runId: lease.runId, type: "step.failed" },
    });
    expect(failed).toHaveLength(1);
  });

  it("leaves a recoverable lease on worker shutdown rather than pretending the build was cancelled", async () => {
    const lease = await startRun("exec-cancel");
    const controller = new AbortController();
    controller.abort();
    const executor = new GraphRunExecutor({ store: fixture.store, steps });

    await expect(executor.execute(lease, fixture.tenantA, [step()], controller.signal)).rejects.toThrow("run aborted");
    const row = await fixture.prisma.agentRun.findUniqueOrThrow({ where: { id: lease.runId } });
    expect(row.status).toBe("RUNNING");
  });

  it("keeps the lease alive across a step that outlives the lease window", async () => {
    // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
    const shortStore = new PrismaRunStore(fixture.prisma, 60, runTestPolicy([fixture.tenantA]));
    // end
    await fixture.resetRuns();
    const conversationId = await fixture.newConversation();
    const created = await shortStore.create(messageInput(fixture, "exec-renew", "长任务", { conversationId }));
    const lease = await shortStore.claim("worker-renew", fixture.tenantA, new Date());
    if (lease === null || lease.runId !== created.id) throw new Error("lease mismatch");

    const executor = new GraphRunExecutor({
      store: shortStore, steps, renewIntervalMs: 15,
    });
    const snapshot = await executor.execute(lease, fixture.tenantA, [
      step({ run: async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return { output: { ok: true } };
      } }),
    ], new AbortController().signal);

    expect(snapshot.status).toBe("SUCCEEDED");
  });
});

describe("run executor pauses", () => {
  it("stops at an approval interrupt without recording a step failure", async () => {
    const lease = await startRun("exec-pause-approval");
    const executor = new GraphRunExecutor({ store: fixture.store, steps });

    const snapshot = await executor.execute(lease, fixture.tenantA, [
      step({ stepKey: "blueprint", label: "生成方案蓝图", inputHash: "hash-bp",
        run: async () => { throw new RunPaused("WAITING_APPROVAL"); } }),
    ], new AbortController().signal);

    expect(snapshot.status).toBe("WAITING_APPROVAL");
    const row = await fixture.prisma.agentRun.findUniqueOrThrow({ where: { id: lease.runId } });
    expect(row).toMatchObject({ status: "WAITING_APPROVAL", leaseOwner: null, leaseExpiresAt: null });

    const failed = await fixture.prisma.agentRunEvent.count({
      where: { runId: lease.runId, type: "step.failed" },
    });
    expect(failed).toBe(0);
  });

  it("keeps a paused run out of the claim queue", async () => {
    const lease = await startRun("exec-pause-input");
    const executor = new GraphRunExecutor({ store: fixture.store, steps });
    await executor.execute(lease, fixture.tenantA, [
      step({ run: async () => { throw new RunPaused("WAITING_INPUT"); } }),
    ], new AbortController().signal);

    expect(await fixture.store.claim("worker-after-pause", fixture.tenantA, new Date())).toBeNull();
  });
});
// end
