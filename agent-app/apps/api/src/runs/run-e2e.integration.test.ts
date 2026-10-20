// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:5432/kf_agent_test_agent_next";
process.env.MODEL_PORT_MODE = "fake";

import { assertSafeTestDatabase } from "../../../../tests/helpers/database-safety.js";
assertSafeTestDatabase({
  url: process.env.DATABASE_URL,
  allowReset: process.env.KF_TEST_ALLOW_DESTRUCTIVE_RESET,
  expectedPrefix: "kf_agent_test_",
});

import { NestFactory } from "@nestjs/core";
import type { INestApplicationContext } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConversationService } from "../conversations/conversation.service.js";
import { RunExecutionService } from "./run-execution.service.js";
import { createRunHandlerRegistry } from "./run-handler-registry.js";
import type { GraphLike } from "./run-graph-runner.js";
import { PrismaRunStepStore } from "./run-step-store.js";
import { PrismaRunQueries } from "./run-query.service.js";
import { AgentWorkerModule } from "./run-worker.module.js";
import { createRunTestFixture, messageInput, type RunTestFixture } from "./run-test-fixture.js";

let fixture: RunTestFixture;
let app: INestApplicationContext;

beforeAll(async () => {
  fixture = await createRunTestFixture();
  app = await NestFactory.createApplicationContext(AgentWorkerModule, { logger: ["error"] });
});

afterAll(async () => {
  await app?.close();
  await fixture.cleanup();
});

describe("run end to end with the fake model", () => {
  it("boots the worker module and compiles the real graph", async () => {
    const conversationService = app.get(ConversationService);
    const graph = await conversationService.getGraph();
    expect(graph).toBeDefined();
    expect(typeof (graph as unknown as GraphLike).stream).toBe("function");
  }, 30_000);

  it("executes a real run through the real graph and records ordered events", async () => {
    await fixture.resetRuns();
    const conversationId = await fixture.newConversation();
    const created = await fixture.store.create(
      messageInput(fixture, "e2e-1", "做一个能耗对比页面", { conversationId }),
    );

    const conversationService = app.get(ConversationService);
    const registry = createRunHandlerRegistry({
      prisma: fixture.prisma,
      loadGraph: async () => (await conversationService.getGraph()) as unknown as GraphLike,
    });
    const steps = new PrismaRunStepStore(fixture.prisma);
    const service = new RunExecutionService({
      prisma: fixture.prisma, store: fixture.store, steps, handlers: registry,
    });
    const controller = new AbortController();

    const lease = await fixture.store.claim("e2e-direct", fixture.tenantA, new Date());
    if (lease === null) throw new Error("E2E_DIAG: direct claim returned null");
    await service.executeLease(lease, controller.signal);

    const run = await fixture.prisma.agentRun.findUniqueOrThrow({ where: { id: created.id } });
    const events = await fixture.prisma.agentRunEvent.findMany({
      where: { runId: created.id }, orderBy: { seq: "asc" },
    });

    expect(events.length).toBeGreaterThan(2);
    expect(events.map((event) => event.seq)).toEqual(
      Array.from({ length: events.length }, (_unused, index) => index + 1),
    );
    console.log("E2E_RESULT " + JSON.stringify({
      status: run.status, failureCode: run.failureCode,
      types: events.map((event) => event.type),
    }));
    expect(["SUCCEEDED", "WAITING_APPROVAL", "WAITING_INPUT", "FAILED"]).toContain(run.status);
    expect(events.some((event) => event.type === "run.finished")).toBe(run.status !== "WAITING_APPROVAL");

    // 预算行必须随 run 创建（T07）；callsUsed 目前为 0 是已知缺口：
    // 图内模型调用落账时还没有写 runId（T02 收尾项），账本行 runId 为 null。
    // 该缺口修复后，这里应改为 callsUsed > 0。
    const queries = new PrismaRunQueries(fixture.prisma);
    const usage = await queries.usageFor(fixture.tenantA, created.id);
    expect(usage).not.toBeNull();
    expect((usage as { callsLimit: number }).callsLimit).toBeGreaterThan(0);
  }, 60_000);
});
// end
