// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { RunStepMemo } from "@kf/agent-orchestrator";
import type { ClaimedRunLease } from "./run-store.js";
import type { RunStepStore } from "./run-step-store.js";

/**
 * 把「租约 + step 存储」适配成图节点用的幂等端口。
 *
 * 写入走 `RunStepStore.complete`，因此旧 fence 的写入会被拒绝——图节点复用
 * 与执行器持有的是同一把租约，不存在「图在跑、租约已丢却还在写结果」的窗口。
 */
export function createLeaseBoundStepMemo(options: {
  steps: RunStepStore;
  lease: ClaimedRunLease;
  tenantId: string;
}): RunStepMemo {
  const { steps, lease, tenantId } = options;
  return {
    find: (stepKey, inputHash) => steps.findCompleted({ tenantId, runId: lease.runId, stepKey, inputHash }),
    save: (stepKey, inputHash, output) =>
      steps.complete({ lease, tenantId, stepKey, inputHash, output }),
  };
}
// end
