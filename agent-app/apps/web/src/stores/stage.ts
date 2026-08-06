import { computed, type ComputedRef } from "vue";
import type { WorkspaceState } from "./workspace";

export type WorkflowStage = "idle" | "approval" | "building" | "ready" | "error";

/** 由工作区状态推导当前工作流阶段，驱动情境面板切换（智绘设计 §4.1）。 */
export function useWorkflowStage(state: WorkspaceState): ComputedRef<WorkflowStage> {
  return computed<WorkflowStage>(() => {
    if (state.error !== null && state.error !== "") return "error";
    if (state.pendingApproval !== null && state.pendingApproval !== undefined) return "approval";
    if (state.buildJobStatus === "QUEUED" || state.buildJobStatus === "RUNNING" || state.buildJobStatus === "VALIDATING") {
      return "building";
    }
    if (state.buildJobStatus === "SUCCEEDED") return "ready";
    if (state.buildJobStatus === "FAILED") return "error";
    return "idle";
  });
}
