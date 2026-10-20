// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { StepHandlerRegistry } from "./run-execution.service.js";

/**
 * 步骤处理器注册表。
 *
 * 图接线尚未完成，因此这里是空表：worker 会据此保持 idle，不领取任何真实 run，
 * 也就不会把 run 标记成 `STEP_NOT_IMPLEMENTED` 失败。
 * 接入时把每个 stepKey 映射到「调用 solution-graph 对应节点」的处理器即可，
 * 处理器可从上下文拿到绑定当前租约的 `memo`，直接传给 `SolutionGraphDeps.runStepMemo`。
 */
export function createRunHandlerRegistry(): StepHandlerRegistry {
  return {};
}
// end
