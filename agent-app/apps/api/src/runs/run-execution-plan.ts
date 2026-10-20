// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { RunAction } from "@kf/contracts";
import { createHash } from "node:crypto";
import { routeRunAction, type ActionRoute } from "./action-router.js";
import { canonicalJson } from "../models/canonical-json.js";

/** 计划版本：节点逻辑一改，所有 inputHash 自动失效，避免复用旧语义输出。 */
export const RUN_PLAN_VERSION = "run-plan@2";

export type PlannedStep = {
  stepKey: string;
  label: string;
  inputHash: string;
};

/**
 * 图驱动的 run 只登记 **一个** step。
 *
 * 原因：solution-graph 本身在一个 run 内就会跑完 classify -> blueprint ->
 * await_approval 等节点。若在这里拆成多个 step 再去分别调图，同一张图会被
 * 驱动多次（第二次从上一次 checkpoint 继续），模型调用量翻倍且行为不可预测。
 *
 * 节点级可恢复性由 `withStepMemo` 在图内部保证，不依赖这里的 step 粒度。
 */
const STEP_BY_ROUTE: Readonly<Record<ActionRoute, string>> = {
  classify: "理解需求并推进流程",
  confirm_blueprint: "确认蓝图并推进流程",
  resume_approval: "继续执行已批准的方案",
  revise_regions: "按区域修改并推进流程",
  accept_visual_reference: "按视觉参考推进流程",
};

export function planRunSteps(action: RunAction, baseRevisionId: string | null): PlannedStep[] {
  const route = routeRunAction(action);
  return [{
    stepKey: "graph",
    label: STEP_BY_ROUTE[route],
    inputHash: createHash("sha256")
      .update(canonicalJson({ planVersion: RUN_PLAN_VERSION, route, action, baseRevisionId }), "utf8")
      .digest("hex"),
  }];
}
// end
