// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { RunAction } from "@kf/contracts";

export type ActionRoute =
  | "classify"
  | "confirm_blueprint"
  | "resume_approval"
  | "revise_regions"
  | "accept_visual_reference";

export const FEATURE_NOT_ENABLED = "FEATURE_NOT_ENABLED";

/**
 * 确定性路由：结构化动作（按钮/审批/区域修改）不经过分类模型。
 * 穷举 switch，新增 action 类型时编译期就会报错，避免静默落到默认分支。
 */
export function routeRunAction(action: RunAction): ActionRoute {
  switch (action.type) {
    case "message":
      return "classify";
    case "confirm_blueprint":
      return "confirm_blueprint";
    case "resume_approval":
      return "resume_approval";
    case "revise_regions":
      return "revise_regions";
    case "accept_visual_reference":
      return "accept_visual_reference";
  }
}

/**
 * 视觉相关动作在 T22/T23 落地且 flag 打开前一律拒绝，
 * 不允许降级成普通文本请求——那会让用户以为「已按图修改」。
 */
export function assertActionEnabled(
  route: ActionRoute,
  flags: { regionalEdit: boolean; vision: boolean },
): void {
  if (route === "revise_regions" && !flags.regionalEdit) throw new Error(FEATURE_NOT_ENABLED);
  if (route === "accept_visual_reference" && !flags.vision) throw new Error(FEATURE_NOT_ENABLED);
}
// end
