// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { RunAction } from "@kf/contracts";
import { createHash } from "node:crypto";
import { routeRunAction, type ActionRoute } from "./action-router.js";
import { canonicalJson } from "../models/canonical-json.js";
// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { VISUAL_RUN_PLAN_VERSION } from "@kf/contracts";
// end

/** 计划版本：节点逻辑一改，所有 inputHash 自动失效，避免复用旧语义输出。 */
// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
export const RUN_PLAN_VERSION = "run-plan@6";
// end

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
// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
export function planVisualReferenceSteps(action: Extract<RunAction, { type: "message" }>, baseRevisionId: string | null, admissionHash: string): PlannedStep[] {
  return [{ stepKey: "visual-reference", label: "识别参考图并等待核对",
    inputHash: createHash("sha256").update(canonicalJson({ planVersion: VISUAL_RUN_PLAN_VERSION, route: "analyze-reference",
      action, baseRevisionId, admissionHash }), "utf8").digest("hex") }];
}
export function planVisualBlueprintSteps(action: Extract<RunAction, { type: "accept_visual_reference" }>, baseRevisionId: string | null, continuationHash: string): PlannedStep[] {
  return [{ stepKey: "visual-blueprint", label: "规划参考图蓝图并等待独立确认",
    inputHash: createHash("sha256").update(canonicalJson({ planVersion: VISUAL_RUN_PLAN_VERSION, route: "visual-blueprint",
      action, baseRevisionId, continuationHash }), "utf8").digest("hex") }];
}
// end
// end
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
export function planVisualEngineeringSteps(action: Extract<RunAction, { type: "confirm_blueprint" }>, baseRevisionId: string | null, engineeringHash: string): PlannedStep[] {
  return [{ stepKey: "visual-engineering", label: "按已确认视觉蓝图生成客户端工程",
    inputHash: createHash("sha256").update(canonicalJson({ planVersion: VISUAL_RUN_PLAN_VERSION, route: "visual-engineering",
      action, baseRevisionId, engineeringHash }), "utf8").digest("hex") }];
}
// end
