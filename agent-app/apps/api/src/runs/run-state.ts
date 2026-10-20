// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { RunStatus } from "@kf/contracts";

/**
 * 显式邻接表。禁止用 `from !== to` 之类的草率放行：
 * 终态不可复活，等待态只能取消（继续走新 run），都是产品语义，不是实现细节。
 */
const transitions: Record<RunStatus, readonly RunStatus[]> = {
  QUEUED: ["RUNNING", "CANCELLED", "FAILED"],
  RUNNING: ["WAITING_INPUT", "WAITING_APPROVAL", "BUILDING", "SUCCEEDED", "FAILED", "CANCEL_REQUESTED"],
  WAITING_INPUT: ["CANCELLED"],
  WAITING_APPROVAL: ["CANCELLED"],
  BUILDING: ["SUCCEEDED", "FAILED", "CANCEL_REQUESTED"],
  CANCEL_REQUESTED: ["CANCELLED", "FAILED", "SUCCEEDED"],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
};

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return transitions[from].includes(to);
}

export const isTerminal = (status: RunStatus): boolean => transitions[status].length === 0;

/** 等待态是会话业务屏障：不占执行租约，但普通排队任务不能越过它被领取。 */
export const isWaiting = (status: RunStatus): boolean =>
  status === "WAITING_INPUT" || status === "WAITING_APPROVAL";

/** 失败/取消不写 SUCCEEDED，SUCCEEDED 也不回退——供事件与快照共用。 */
export const terminalFromFailure = (cancelled: boolean): RunStatus => (cancelled ? "CANCELLED" : "FAILED");
// end
