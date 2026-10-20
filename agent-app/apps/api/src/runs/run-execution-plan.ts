// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { RunAction } from "@kf/contracts";
import { createHash } from "node:crypto";
import { routeRunAction, type ActionRoute } from "./action-router.js";
import { canonicalJson } from "../models/canonical-json.js";

/** 计划版本：节点逻辑一改，所有 inputHash 自动失效，避免复用旧语义输出。 */
export const RUN_PLAN_VERSION = "run-plan@1";

export type PlannedStep = {
  stepKey: string;
  label: string;
  inputHash: string;
};

const STEPS_BY_ROUTE: Readonly<Record<ActionRoute, ReadonlyArray<{ stepKey: string; label: string }>>> = {
  classify: [
    { stepKey: "classify", label: "理解需求" },
    { stepKey: "blueprint", label: "生成方案蓝图" },
    { stepKey: "await_approval", label: "等待确认" },
  ],
  confirm_blueprint: [
    { stepKey: "confirm_blueprint", label: "确认蓝图" },
    { stepKey: "plan", label: "生成实施方案" },
    { stepKey: "await_approval", label: "等待确认" },
  ],
  resume_approval: [
    { stepKey: "resume_approval", label: "继续执行" },
    { stepKey: "build", label: "生成工程" },
  ],
  revise_regions: [
    { stepKey: "revise_regions", label: "按区域修改" },
    { stepKey: "build", label: "重新生成工程" },
  ],
  accept_visual_reference: [
    { stepKey: "analyze_reference", label: "解析视觉参考" },
    { stepKey: "blueprint", label: "生成方案蓝图" },
  ],
};

/**
 * 由一个动作推导出有序步骤计划。
 *
 * inputHash = SHA-256(计划版本 + 动作 + 基线 revision + 步骤自身)，
 * 因此同一动作在换基线后不会命中旧步骤输出，节点逻辑升级也会整体失效。
 */
export function planRunSteps(action: RunAction, baseRevisionId: string | null): PlannedStep[] {
  const route = routeRunAction(action);
  return STEPS_BY_ROUTE[route].map((step) => ({
    stepKey: step.stepKey,
    label: step.label,
    inputHash: createHash("sha256")
      .update(canonicalJson({
        planVersion: RUN_PLAN_VERSION,
        route,
        action,
        baseRevisionId,
        stepKey: step.stepKey,
      }), "utf8")
      .digest("hex"),
  }));
}
// end
