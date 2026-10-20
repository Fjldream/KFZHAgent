// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { PrismaClient } from "@prisma/client";
import { AgentWorkerModule } from "./runs/run-worker.module.js";
import { ConversationService } from "./conversations/conversation.service.js";
import { createRunHandlerRegistry } from "./runs/run-handler-registry.js";
import type { GraphLike } from "./runs/run-graph-runner.js";
import { RunExecutionService } from "./runs/run-execution.service.js";
import { PrismaRunStepStore } from "./runs/run-step-store.js";
import { PrismaRunStore } from "./runs/run-store.js";
import { RunWorker } from "./runs/run-worker.js";

const HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * 独立 agent worker 进程入口（不加载 HTTP controller，也不启动 build-job 轮询器）。
 *
 * 安全闸：步骤处理器未接线时 `canClaim` 为 false，进程只保活、不领任务。
 * 这样即使被误启动，也不会把真实 run 领走并标记失败。
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const leaseMs = Number(process.env.AGENT_RUN_LEASE_MS ?? 30_000);
  const store = new PrismaRunStore(prisma, leaseMs);
  const steps = new PrismaRunStepStore(prisma);
  // 只装配图运行所需模块：不起 HTTP controller，也不启动 build-job 轮询器。
  const app = await NestFactory.createApplicationContext(AgentWorkerModule, { logger: ["error", "warn"] });
  const conversations = app.get(ConversationService);
  const handlers = createRunHandlerRegistry({
    prisma,
    loadGraph: async () => (await conversations.getGraph()) as unknown as GraphLike,
  });
  const ready = Object.keys(handlers).length > 0;


  const controller = new AbortController();
  process.on("SIGTERM", () => controller.abort());
  process.on("SIGINT", () => controller.abort());

  const service = new RunExecutionService({ prisma, store, steps, handlers });
  const worker = new RunWorker({
    store,
    ownerId: `agent-worker-${process.pid}`,
    // 单租户部署：worker 只处理一个租户，由 AGENT_TENANT_ID 指定；
    // 多租户部署需要每个租户一个 worker 实例（或加租户发现）。
    tenantId: process.env.AGENT_TENANT_ID ?? "",
    canClaim: () => ready,
    execute: (lease) => service.executeLease(lease, controller.signal),
  });

  const heartbeat = setInterval(() => {
    console.log(JSON.stringify({
      event: "agent_worker_heartbeat",
      at: new Date().toISOString(),
      // 这是循环仍在跑的证据，不代表处理过任务，故不叫 lastHandledAt
      lastLoopAt: worker.heartbeatAt()?.toISOString() ?? null,
      ready,
    }));
  }, HEARTBEAT_INTERVAL_MS);

  if (!ready) {
    console.warn(JSON.stringify({
      event: "agent_worker_not_ready",
      message: "step handlers are not wired yet; the worker stays idle and will not claim runs",
    }));
  }

  try {
    await worker.start(controller.signal);
  } finally {
    clearInterval(heartbeat);
    await app.close();
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
// end
