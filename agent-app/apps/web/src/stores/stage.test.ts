import { describe, expect, it } from "vitest";
import { useWorkflowStage } from "./stage";
import type { WorkspaceState } from "./workspace";

/**
 * Task 9 Step 1：useWorkflowStage 纯函数级推导测试。
 * 组合覆盖 error 优先、approval 优先于 building、构建中三态、成功/失败、默认 idle。
 */
function makeState(overrides: Partial<WorkspaceState> = {}): WorkspaceState {
  return {
    workspaceId: null,
    workspace: null,
    loading: false,
    error: null,
    conversationId: null,
    messages: [],
    streaming: false,
    resuming: false,
    pendingApproval: null,
    lastDone: null,
    buildJobId: null,
    buildJobStatus: null,
    artifacts: [],
    validationReport: null,
    revisions: [],
    currentRevisionId: null,
    ...overrides,
  };
}

describe("useWorkflowStage", () => {
  it("maps error to error with the highest priority", () => {
    const state = makeState({
      error: "构建失败",
      pendingApproval: { planHash: "a".repeat(64) },
      buildJobStatus: "RUNNING",
    });
    expect(useWorkflowStage(state).value).toBe("error");
  });

  it("maps approval ahead of building when both are present", () => {
    const state = makeState({
      pendingApproval: { planHash: "b".repeat(64) },
      buildJobStatus: "RUNNING",
    });
    expect(useWorkflowStage(state).value).toBe("approval");
  });

  it("maps QUEUED / RUNNING / VALIDATING to building", () => {
    for (const status of ["QUEUED", "RUNNING", "VALIDATING"] as const) {
      expect(useWorkflowStage(makeState({ buildJobStatus: status })).value).toBe("building");
    }
  });

  it("maps SUCCEEDED to ready", () => {
    expect(useWorkflowStage(makeState({ buildJobStatus: "SUCCEEDED" })).value).toBe("ready");
  });

  it("maps FAILED to error", () => {
    expect(useWorkflowStage(makeState({ buildJobStatus: "FAILED" })).value).toBe("error");
  });

  it("defaults to idle for an untouched workspace", () => {
    expect(useWorkflowStage(makeState()).value).toBe("idle");
  });
});
