import { describe, expect, it, vi } from "vitest";
import { createLoadContextNode } from "./load-context.js";

function makeDeps(status: "QUEUED" | "SUCCEEDED") {
  return {
    workspaceQuery: {
      listRecentMessages: vi.fn().mockResolvedValue([]),
      getConversationSummary: vi.fn().mockResolvedValue(undefined),
      getCurrentRevisionId: vi.fn().mockResolvedValue("rev-2"),
      getRevisionSummary: vi.fn().mockResolvedValue("latest revision"),
      setConversationSummary: vi.fn().mockResolvedValue(undefined),
    },
    buildJobPort: {
      getJob: vi.fn().mockResolvedValue({ id: "job-old", status }),
    },
  };
}

function state(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "tenant-1",
    userId: "user-1",
    workspaceId: "workspace-1",
    conversationId: "conversation-1",
    currentRevisionId: "rev-1",
    recentMessages: [],
    stage: "idle",
    ...overrides,
  };
}

describe("load-context build lifecycle", () => {
  it("enters preview review only when the active building job succeeds", async () => {
    const deps = makeDeps("SUCCEEDED");

    const update = await createLoadContextNode(deps as never)(state({
      stage: "building",
      buildJobId: "job-old",
    }) as never);

    expect(update.stage).toBe("preview-review");
    expect(update.currentRevisionId).toBe("rev-2");
    expect(update.lastErrorCode).toBeUndefined();
    expect(deps.buildJobPort.getJob).toHaveBeenCalledOnce();
  });

  it("does not let an old successful build erase a newer implementation failure", async () => {
    const deps = makeDeps("SUCCEEDED");

    const update = await createLoadContextNode(deps as never)(state({
      stage: "idle",
      buildJobId: "job-old",
      lastErrorCode: "UI_IMPLEMENTATION_INVALID:button property rejected",
    }) as never);

    expect(update.stage).toBe("idle");
    expect(update.lastErrorCode).toBe("UI_IMPLEMENTATION_INVALID:button property rejected");
    expect(deps.buildJobPort.getJob).not.toHaveBeenCalled();
  });
});
