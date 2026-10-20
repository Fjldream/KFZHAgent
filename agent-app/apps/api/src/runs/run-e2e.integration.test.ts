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
import { AgentWorkerModule } from "./run-worker.module.js";
import { RunWorker } from "./run-worker.js";
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

  it.todo("executes a run through the real graph and records ordered events");
  // 已观察到的阻塞：create 之后立刻 claim 返回 null（recoverExpired 也为 null），
  // 说明 run 没有被认领。下一步先打印 AgentRun 的 status/mode/leaseExpiresAt 与
  // ConversationTurnFence 行，确认是「创建未落 QUEUED」还是「claim 条件过严」，
  // 再决定改哪一侧——先不要为了变绿去放宽 claim 条件。
});
// end
