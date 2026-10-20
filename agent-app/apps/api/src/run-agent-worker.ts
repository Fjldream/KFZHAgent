// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import "reflect-metadata";
import { PrismaClient } from "@prisma/client";
import { createRunHandlerRegistry } from "./runs/run-handler-registry.js";
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
  const handlers = createRunHandlerRegistry();
  const ready = Object.keys(handlers).length > 0;

  const controller = new AbortController();
  process.on("SIGTERM", () => controller.abort());
  process.on("SIGINT", () => controller.abort());

  const service = new RunExecutionService({ prisma, store, steps, handlers });
  const worker = new RunWorker({
    store,
    ownerId: `agent-worker-${process.pid}`,
    canClaim: () => ready,
    execute: (lease) => service.executeLease(lease, controller.signal),
  });

  const heartbeat = setInterval(() => {
    console.log(JSON.stringify({
      event: "agent_worker_heartbeat",
      at: new Date().toISOString(),
      lastHandledAt: worker.heartbeatAt()?.toISOString() ?? null,
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
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
// end
