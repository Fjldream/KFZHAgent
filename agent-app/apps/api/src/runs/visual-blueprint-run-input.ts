// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import type { AgentRun, Prisma } from "@prisma/client";
import { RunActionSchema } from "@kf/contracts";
import type { VisualReviewService } from "../vision/visual-review.service.js";
import { lockActiveVisualRun } from "../vision/visual-analysis-input.js";
import { buildVisualBlueprintRequest } from "../vision/visual-blueprint-request.js";

export type VisualContinuationReader = Pick<VisualReviewService, "readContinuationInTransaction">;
/** Full proof/config/source preflight, before any graph/cache access; never acquire successor control first. */
export async function readActiveVisualBlueprintInput(tx: Prisma.TransactionClient, reviews: VisualContinuationReader, run: AgentRun) {
  const restored = await reviews.readContinuationInTransaction(tx, { tenantId: run.tenantId, workspaceId: run.workspaceId,
    conversationId: run.conversationId, userId: run.requestedByUserId }, run.id);
  const current = await lockActiveVisualRun(tx, { tenantId: run.tenantId, workspaceId: run.workspaceId, runId: run.id });
  const source = await tx.agentRun.findUniqueOrThrow({ where: { id: restored.snapshot.content.sourceRunId } });
  const action = RunActionSchema.safeParse(source.action);
  if (!action.success || action.data.type !== "message") throw new Error("VISUAL_BLUEPRINT_CONTEXT_MISMATCH");
  // Validates the frozen prompt/limits and context size, not credentials or permission to skip a blueprint.
  buildVisualBlueprintRequest(restored.snapshot, action.data.text);
  return { run: current, snapshot: restored.snapshot, instruction: action.data.text };
}
// end
