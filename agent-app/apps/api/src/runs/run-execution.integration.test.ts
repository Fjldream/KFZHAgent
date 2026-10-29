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
import { RunExecutionService, STEP_NOT_IMPLEMENTED, type StepContext, type StepHandlerRegistry } from "./run-execution.service.js";
import { PrismaRunStepStore } from "./run-step-store.js";
// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { planRunSteps } from "./run-execution-plan.js";
// end
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

const startRun = async (clientRequestId: string) => {
  await fixture.resetRuns();
  const conversationId = await fixture.newConversation();
  const created = await fixture.store.create(
    messageInput(fixture, clientRequestId, "生成一个生产大屏", { conversationId }),
  );
  const lease = await fixture.store.claim("worker-plan", fixture.tenantA, new Date());
  if (lease === null || lease.runId !== created.id) throw new Error("lease mismatch");
  return lease;
};

const handlers = (overrides: Partial<StepHandlerRegistry> = {}): StepHandlerRegistry => ({
  graph: async () => ({ output: { stage: "done" }, safeSummary: "流程完成" }),
  ...overrides,
});

describe("run execution service", () => {
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  it("refuses a frozen protocol version the worker cannot execute before calling graph handlers", async () => {
    const lease = await startRun("future-protocol");
    await fixture.prisma.agentRun.update({ where: { id: lease.runId }, data: { configSnapshot: { schemaVersion: 1, planVersion: "run-plan@future", flags: { agentRunsV2: true } } } });
    const service = new RunExecutionService({ prisma: fixture.prisma, store: fixture.store, steps, handlers: handlers() });
    expect(await service.executeLease(lease, new AbortController().signal)).toMatchObject({ status: "FAILED", failureCode: "RUN_CONFIG_VERSION_MISMATCH" });
    expect(await fixture.prisma.agentRunStep.count({ where: { runId: lease.runId, status: "COMPLETED" } })).toBe(0);
  });
  it("does not let a completed step cache bypass frozen protocol validation", async () => {
    const lease = await startRun("future-protocol-cached");
    const planned = planRunSteps({ type: "message", text: "生成一个生产大屏" }, null)[0]!;
    await steps.complete({ lease, tenantId: fixture.tenantA, stepKey: planned.stepKey, inputHash: planned.inputHash, output: { stage: "done" } });
    await fixture.prisma.agentRun.update({ where: { id: lease.runId }, data: { configSnapshot: { schemaVersion: 1, planVersion: "run-plan@future" } } });
    const service = new RunExecutionService({ prisma: fixture.prisma, store: fixture.store, steps, handlers: handlers() });
    expect(await service.executeLease(lease, new AbortController().signal)).toMatchObject({ status: "FAILED", failureCode: "RUN_CONFIG_VERSION_MISMATCH" });
    // 不通过删掉已提交输出来掩盖协议问题。
    expect(await fixture.prisma.agentRunStep.count({ where: { runId: lease.runId, status: "COMPLETED" } })).toBe(1);
  });
  // end
  it("runs the whole plan and finishes the run", async () => {
    const lease = await startRun("exec-service-ok");
    const service = new RunExecutionService({
      prisma: fixture.prisma, store: fixture.store, steps, handlers: handlers(),
    });

    const snapshot = await service.executeLease(lease, new AbortController().signal);
    expect(snapshot.status).toBe("SUCCEEDED");

    const completed = await fixture.prisma.agentRunStep.findMany({
      where: { runId: lease.runId, status: "COMPLETED" },
      orderBy: { stepKey: "asc" },
    });
    expect(completed.map((row) => row.stepKey)).toEqual(["graph"]);
  });

  it("fails explicitly when a step handler is missing", async () => {
    const lease = await startRun("exec-service-missing");
    const service = new RunExecutionService({
      prisma: fixture.prisma, store: fixture.store, steps,
      handlers: handlers({ graph: undefined as never }),
    });

    const snapshot = await service.executeLease(lease, new AbortController().signal);
    expect(snapshot).toMatchObject({ status: "FAILED", failureCode: STEP_NOT_IMPLEMENTED });

    const done = await fixture.prisma.agentRunStep.count({
      where: { runId: lease.runId, status: "COMPLETED" },
    });
    expect(done).toBe(0);
  });

  it("passes the run action and base revision to every handler", async () => {
    const lease = await startRun("exec-service-context");
    // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
    const seen = vi.fn(async (context: StepContext) => { void context; return { output: { ok: true } }; });
    // end
    const service = new RunExecutionService({
      prisma: fixture.prisma, store: fixture.store, steps,
      handlers: { graph: seen },
    });

    await service.executeLease(lease, new AbortController().signal);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0]?.[0]).toMatchObject({
      runId: lease.runId,
      tenantId: fixture.tenantA,
      action: { type: "message", text: "生成一个生产大屏" },
      stepKey: "graph",
    });
  });
});
// end
