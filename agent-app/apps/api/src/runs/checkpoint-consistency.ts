// modified by jinlong.feng at 2026-10-20 Agent工作台迭代

export const CHECKPOINT_RUN_MISMATCH = "CHECKPOINT_RUN_MISMATCH";

export type CheckpointIdentity = {
  runId?: string | undefined;
  planVersion?: string | undefined;
  baseRevisionId?: string | undefined;
};

export type RunIdentity = {
  id: string;
  planVersion?: string | undefined;
  baseRevisionId?: string | undefined;
};

export type ConsistencyVerdict = "legacy" | "reusable";

/**
 * 恢复前的只读一致性校验：checkpoint 里记的 run 身份必须与当前 run 一致。
 *
 * - checkpoint 没有 runId（旧 SSE 会话）：返回 "legacy"，按原样继续，不做任何推断
 * - runId/planVersion/baseRevision 任一不一致：抛 CHECKPOINT_RUN_MISMATCH，调用方整段重跑
 *
 * 只读：不往 checkpoint 写新字段，避免影响既有会话的恢复能力。
 */
export function checkCheckpointConsistency(
  checkpoint: CheckpointIdentity,
  run: RunIdentity,
): ConsistencyVerdict {
  if (checkpoint.runId === undefined) return "legacy";
  if (checkpoint.runId !== run.id) throw new Error(CHECKPOINT_RUN_MISMATCH);
  if (checkpoint.planVersion !== undefined && run.planVersion !== undefined
    && checkpoint.planVersion !== run.planVersion) {
    throw new Error(CHECKPOINT_RUN_MISMATCH);
  }
  if (checkpoint.baseRevisionId !== undefined && run.baseRevisionId !== undefined
    && checkpoint.baseRevisionId !== run.baseRevisionId) {
    throw new Error(CHECKPOINT_RUN_MISMATCH);
  }
  return "reusable";
}
// end
