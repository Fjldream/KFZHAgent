import { describe, expect, it, vi } from "vitest";
import { createLoadContextNode } from "./load-context.js";

function makeDeps(status: "QUEUED" | "SUCCEEDED" | "FAILED") {
  return {
    workspaceQuery: {
      listRecentMessages: vi.fn().mockResolvedValue([]),
      getConversationSummary: vi.fn().mockResolvedValue(undefined),
      getCurrentRevisionId: vi.fn().mockResolvedValue("rev-2"),
      getWorkspaceRouting: vi.fn().mockResolvedValue({ mode: "new", generationWorkflow: "module-v1" }),
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
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  it.each(["idle", "building"])("keeps a durable run's admitted base while loading %s context after another conversation advances", async stage => {
    const deps = makeDeps("SUCCEEDED");
    const update = await createLoadContextNode(deps as never)(state({ runId: "durable-run", stage, ...(stage === "building" ? { buildJobId: "job-old" } : {}) }) as never);
    expect(update.currentRevisionId).toBe("rev-1");
  });
  // end
  it("loads the server-owned workflow discriminator with a tenant-scoped workspace lookup", async () => {
    const deps = makeDeps("QUEUED");

    const update = await createLoadContextNode(deps as never)(state() as never);

    expect(update).toMatchObject({ workspaceMode: "new", generationWorkflow: "module-v1" });
    expect(deps.workspaceQuery.getWorkspaceRouting).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
    });
  });

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

  it("finishes creative engineering without entering preview review", async () => {
    const deps = makeDeps("SUCCEEDED");
    deps.workspaceQuery.getWorkspaceRouting.mockResolvedValue({
      mode: "new",
      generationWorkflow: "creative-v2",
    });

    const update = await createLoadContextNode(deps as never)(state({
      stage: "building",
      buildJobId: "job-old",
      generationWorkflow: "creative-v2",
    }) as never);

    expect(update.stage).toBe("done");
    expect(deps.workspaceQuery.setConversationSummary).toHaveBeenCalledWith(expect.objectContaining({
      summary: expect.stringContaining("工程包"),
    }));
    expect(deps.workspaceQuery.setConversationSummary.mock.calls[0]?.[0].summary).not.toContain("预览");
  });

  it("reports a failed creative job as engineering generation, never preview", async () => {
    const deps = makeDeps("FAILED");
    deps.workspaceQuery.getWorkspaceRouting.mockResolvedValue({
      mode: "new",
      generationWorkflow: "creative-v2",
    });

    const update = await createLoadContextNode(deps as never)(state({
      stage: "building",
      buildJobId: "job-old",
      generationWorkflow: "creative-v2",
    }) as never);

    expect(update).toMatchObject({ stage: "planning", lastErrorCode: "BUILD_FAILED" });
    const summary = deps.workspaceQuery.setConversationSummary.mock.calls[0]?.[0].summary;
    expect(summary).toContain("工程生成");
    expect(summary).not.toContain("预览");
    expect(summary).not.toContain("构建");
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
