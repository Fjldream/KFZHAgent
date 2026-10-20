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
  const lease = await fixture.store.claim("worker-plan", new Date());
  if (lease === null || lease.runId !== created.id) throw new Error("lease mismatch");
  return lease;
};

const handlers = (overrides: Partial<StepHandlerRegistry> = {}): StepHandlerRegistry => ({
  graph: async () => ({ output: { stage: "done" }, safeSummary: "流程完成" }),
  ...overrides,
});

describe("run execution service", () => {
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
    const seen = vi.fn(async (_context: StepContext) => ({ output: { ok: true } }));
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
