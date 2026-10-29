// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { INestApplicationContext } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { AgentWorkerModule } from "./run-worker.module.js";
import { ConversationService } from "../conversations/conversation.service.js";
import { createRunHandlerRegistry } from "./run-handler-registry.js";
import type { GraphLike } from "./run-graph-runner.js";
import { RunExecutionService } from "./run-execution.service.js";
import { PrismaRunStepStore } from "./run-step-store.js";
import { PrismaRunStore } from "./run-store.js";
import { RunWorker } from "./run-worker.js";
// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { VisualAnalysisService } from "../vision/visual-analysis.service.js";
import { VISUAL_PLANNING_RUNTIME, type VisualPlanningRuntime } from "../vision/visual-blueprint-runtime.js";
// end
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import { SERVER_PLAN_AUTHORITY } from "../conversations/server-plan-authority.js";
import type { ServerPlanAuthority } from "@kf/build-jobs";
import type { VisualEngineeringRuntime } from "./visual-engineering-run-input.js";
// end

const HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * 独立 agent worker 进程入口（不加载 HTTP controller，也不启动 build-job 轮询器）。
 *
 * 安全闸：步骤处理器未接线时 `canClaim` 为 false，进程只保活、不领任务。
 * 这样即使被误启动，也不会把真实 run 领走并标记失败。
 */
export async function startAgentWorker(
  createContext: () => Promise<INestApplicationContext> = () => NestFactory.createApplicationContext(AgentWorkerModule, { logger: ["error", "warn"] }),
): Promise<void> {
  const tenantId = process.env.AGENT_TENANT_ID?.trim();
  if (!tenantId) throw new Error("AGENT_TENANT_ID is required; worker must not silently idle with an empty tenant");
  const prisma = new PrismaClient();
  const leaseMs = Number(process.env.AGENT_RUN_LEASE_MS ?? 30_000);
  const store = new PrismaRunStore(prisma, leaseMs);
  const steps = new PrismaRunStepStore(prisma);
  // 只装配图运行所需模块：不起 HTTP controller，也不启动 build-job 轮询器。
  const app = await createContext();
  const conversations = app.get(ConversationService);
  // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
  let visualReference;
  let visualContinuation;
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  let visualEngineering: VisualEngineeringRuntime | undefined;
  // end
  try {
    const runtime = app.get<VisualPlanningRuntime>(VISUAL_PLANNING_RUNTIME);
    if (runtime.reviews) {
      visualReference = { analysis: app.get(VisualAnalysisService), reviews: runtime.reviews };
      visualContinuation = runtime.reviews;
      // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
      visualEngineering = { reviews: runtime.reviews, verifier: app.get<ServerPlanAuthority>(SERVER_PLAN_AUTHORITY) };
      // end
    }
  } catch {
    // Missing/invalid review credentials do not change text execution; staged image Runs fail explicitly.
    visualReference = undefined;
  }
  // end
  const handlers = createRunHandlerRegistry({
    prisma,
    loadGraph: async () => (await conversations.getGraph()) as unknown as GraphLike,
    acquireTurn: id => conversations.acquireRunTurn(id),
    registerMemo: (id, memo) => conversations.registerRunMemo(id, memo),
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    ...(visualReference === undefined ? {} : { visualReference }),
    ...(visualContinuation === undefined ? {} : { visualContinuation }),
    // end
    // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
    ...(visualEngineering === undefined ? {} : { visualEngineering }),
    // end
  });
  const ready = Object.keys(handlers).length > 0;


  const controller = new AbortController();
  const stop = () => controller.abort();
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);

  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  const service = new RunExecutionService({ prisma, store, steps, handlers, ...(visualContinuation === undefined ? {} : { visualContinuation }),
    ...(visualEngineering === undefined ? {} : { visualEngineering }) });
  // end
  const worker = new RunWorker({
    store,
    ownerId: `agent-worker-${process.pid}`,
    // 单租户部署：worker 只处理一个租户，由 AGENT_TENANT_ID 指定；
    // 多租户部署需要每个租户一个 worker 实例（或加租户发现）。
    tenantId,
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
    process.off("SIGTERM", stop);
    process.off("SIGINT", stop);
    await app.close();
    await prisma.$disconnect();
  }
}

// end
