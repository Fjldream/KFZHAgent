// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { PrismaClient } from "@prisma/client";
import { buildRunGraphInput } from "./run-graph-input.js";
import { runGraphOnce, type GraphLike } from "./run-graph-runner.js";
import { RunPaused } from "./run-executor.js";
import type { StepHandlerRegistry } from "./run-execution.service.js";

export const RUN_NOT_FOUND = "RUN_NOT_FOUND";

export type RunHandlerRegistryDeps = {
  prisma: PrismaClient;
  /** 懒加载编译好的图：worker 与 API 复用同一套 deps 与 checkpointer。 */
  loadGraph: () => Promise<GraphLike>;
};

/**
 * 图驱动的 step handler。
 *
 * 一次 run 只调一次图：图内部自行走完 classify/blueprint/... 各节点，
 * 节点级恢复由 withStepMemo 负责。图停在审批中断时抛 RunPaused，
 * 由执行器把 run 停进 WAITING_APPROVAL，而不是当成功或失败处理。
 */
export function createRunHandlerRegistry(deps: RunHandlerRegistryDeps): StepHandlerRegistry {
  return {
    graph: async (context) => {
      const run = await deps.prisma.agentRun.findUnique({
        where: { id: context.runId },
        select: {
          id: true, tenantId: true, requestedByUserId: true, workspaceId: true,
          conversationId: true, baseRevisionId: true,
        },
      });
      if (run === null) throw new Error(RUN_NOT_FOUND);

      const message = await deps.prisma.message.findFirst({
        where: { runId: context.runId, role: "user" },
        orderBy: { createdAt: "asc" },
        select: { content: true },
      });

      const input = buildRunGraphInput({
        runId: run.id,
        tenantId: run.tenantId,
        requestedByUserId: run.requestedByUserId,
        workspaceId: run.workspaceId,
        conversationId: run.conversationId,
        baseRevisionId: run.baseRevisionId,
      }, message?.content ?? null);

      const graph = await deps.loadGraph();
      const outcome = await runGraphOnce({
        graph,
        input,
        conversationId: run.conversationId,
        signal: context.signal,
      });

      if (outcome.kind === "interrupted") throw new RunPaused("WAITING_APPROVAL");
      return {
        output: { stage: outcome.stage },
        safeSummary: "流程执行完成",
      };
    },
  };
}
// end
