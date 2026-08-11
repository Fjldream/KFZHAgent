// @ts-nocheck -- store 测试为 JS 风格（vi.mock 工厂返回非类型化桩对象）。
// load() 会话绑定：复用最新会话恢复历史；无历史才新建；切换工程重新绑定。
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getWorkspace: vi.fn(),
  listRevisions: vi.fn(),
  listConversations: vi.fn(),
  createConversation: vi.fn(),
  listMessages: vi.fn(),
  createDownloadToken: vi.fn(),
  previewUrl: vi.fn(),
  getLatestBuildJob: vi.fn(),
  getBuildJob: vi.fn(),
  listBuildArtifacts: vi.fn(),
  getBuildJobReport: vi.fn(),
  resume: vi.fn(),
}));

const streamMessageTurn = vi.hoisted(() => vi.fn());

vi.mock("../api", () => ({ api }));
vi.mock("../sse", () => ({ streamMessageTurn }));

import { useWorkspace } from "./workspace";

const ws = { id: "ws-1", name: "工程A", mode: "new", currentRevisionId: null };
const convA = { id: "conv-a", title: "第一轮" };
const convB = { id: "conv-b", title: "第二轮" };

beforeEach(() => {
  api.getWorkspace.mockReset();
  api.listRevisions.mockReset();
  api.listConversations.mockReset();
  api.createConversation.mockReset();
  api.listMessages.mockReset();
  api.createDownloadToken.mockReset();
  api.previewUrl.mockReset();
  api.getLatestBuildJob.mockReset();
  api.getBuildJob.mockReset();
  api.listBuildArtifacts.mockReset();
  api.getBuildJobReport.mockReset();
  api.resume.mockReset();
  streamMessageTurn.mockReset();

  api.getWorkspace.mockResolvedValue(ws);
  api.listRevisions.mockResolvedValue([]);
  api.getLatestBuildJob.mockResolvedValue(null);
});

describe("workspace store load() 会话绑定", () => {
  it("复用最新已有会话并加载其消息（恢复历史）", async () => {
    api.listConversations.mockResolvedValue([convB, convA]); // 最新在前
    api.listMessages.mockResolvedValue([{ id: "m1", role: "user", content: "旧消息" }]);

    const store = useWorkspace();
    await store.load("ws-1");

    expect(api.listConversations).toHaveBeenCalledWith("ws-1");
    expect(api.createConversation).not.toHaveBeenCalled();
    expect(store.state.conversationId).toBe("conv-b");
    expect(store.state.messages).toHaveLength(1);
    expect(store.state.messages[0].content).toBe("旧消息");
  });

  it("无历史会话时新建会话", async () => {
    api.listConversations.mockResolvedValue([]);
    api.createConversation.mockResolvedValue({ id: "conv-new", title: "解决方案对话" });
    api.listMessages.mockResolvedValue([]);

    const store = useWorkspace();
    await store.load("ws-1");

    expect(api.createConversation).toHaveBeenCalledWith("ws-1", "解决方案对话");
    expect(store.state.conversationId).toBe("conv-new");
  });

  it("切换到另一个工程时重新绑定其会话（不残留旧工程 conversationId）", async () => {
    const ws2 = { id: "ws-2", name: "工程B", mode: "new", currentRevisionId: null };
    api.listConversations.mockResolvedValue([convB]); // ws-1 有会话
    api.listMessages.mockResolvedValue([]);

    const store = useWorkspace();
    await store.load("ws-1");
    expect(store.state.conversationId).toBe("conv-b");

    // 切到 ws-2：其最新会话是 conv-2，旧工程会话不应残留
    const conv2 = { id: "conv-2", title: "B对话" };
    api.getWorkspace.mockResolvedValue(ws2);
    api.listConversations.mockResolvedValue([conv2]);
    await store.load("ws-2");
    expect(store.state.conversationId).toBe("conv-2");
    expect(api.listMessages).toHaveBeenLastCalledWith("conv-2");
  });

  it("切换到尚未构建的工程时不残留上一个工程的预览产物", async () => {
    api.getBuildJob.mockResolvedValue({ id: "job-old", status: "SUCCEEDED" });
    api.listBuildArtifacts.mockResolvedValue([
      { id: "art-old", kind: "client-package" },
    ]);
    api.getBuildJobReport.mockResolvedValue({ outcome: "pass" });
    api.listConversations.mockResolvedValue([convA]);
    api.listMessages.mockResolvedValue([]);

    const store = useWorkspace();
    await store.load("ws-1");
    await store.pollBuildJob("job-old");
    expect(store.state.previewArtifactId).toBe("art-old");

    api.getWorkspace.mockResolvedValue({
      id: "ws-2",
      name: "尚未构建的工程",
      mode: "new",
      currentRevisionId: null,
    });
    api.listConversations.mockResolvedValue([{ id: "conv-2", title: "B对话" }]);
    await store.load("ws-2");

    expect(store.state.previewArtifactId).toBeUndefined();
    expect(store.state.artifacts).toEqual([]);
    expect(store.state.buildJobId).toBeNull();
    expect(store.state.buildJobStatus).toBeNull();
  });

  it("exposes the built client-package artifact as previewArtifactId after a successful build", async () => {
    api.getBuildJob.mockResolvedValue({ id: "job-1", status: "SUCCEEDED" });
    api.listBuildArtifacts.mockResolvedValue([
      { id: "art-pkg", kind: "client-package" },
      { id: "art-diff", kind: "plan-diff" },
    ]);
    api.getBuildJobReport.mockResolvedValue({ outcome: "pass" });
    api.listRevisions.mockResolvedValue([]);
    const store = useWorkspace();
    const status = await store.pollBuildJob("job-1");
    expect(status).toBe("SUCCEEDED");
    expect(store.state.previewArtifactId).toBe("art-pkg");
  });

  it("restores the latest successful build artifacts and preview when reopening a workspace", async () => {
    api.listConversations.mockResolvedValue([convA]);
    api.listMessages.mockResolvedValue([]);
    api.getLatestBuildJob.mockResolvedValue({ id: "job-restored", status: "SUCCEEDED" });
    api.getBuildJob.mockResolvedValue({ id: "job-restored", status: "SUCCEEDED" });
    api.listBuildArtifacts.mockResolvedValue([
      { id: "art-restored", kind: "client-package" },
    ]);
    api.getBuildJobReport.mockResolvedValue({ outcome: "pass" });

    const store = useWorkspace();
    await store.load("ws-1");

    expect(api.getLatestBuildJob).toHaveBeenCalledWith("ws-1");
    expect(store.state.buildJobId).toBe("job-restored");
    expect(store.state.buildJobStatus).toBe("SUCCEEDED");
    expect(store.state.previewArtifactId).toBe("art-restored");
    expect(store.state.validationReport).toEqual({ outcome: "pass" });
  });

  it("does not let a restored active build overwrite a different workspace after navigation", async () => {
    let finishOldBuild: (job: { id: string; status: string }) => void = () => {};
    const oldBuild = new Promise((resolve) => {
      finishOldBuild = resolve;
    });
    api.getWorkspace.mockImplementation(async (id) => ({
      id,
      name: id === "ws-a" ? "工程A" : "工程B",
      mode: "new",
      currentRevisionId: null,
    }));
    api.listConversations.mockResolvedValue([convA]);
    api.listMessages.mockResolvedValue([]);
    api.getLatestBuildJob
      .mockResolvedValueOnce({ id: "job-a", status: "VALIDATING" })
      .mockResolvedValueOnce(null);
    api.getBuildJob.mockReturnValue(oldBuild);
    api.listBuildArtifacts.mockResolvedValue([{ id: "art-a", kind: "client-package" }]);
    api.getBuildJobReport.mockResolvedValue({ outcome: "pass" });

    const store = useWorkspace();
    await store.load("ws-a");
    expect(store.state.buildJobStatus).toBe("VALIDATING");
    await store.load("ws-b");
    finishOldBuild({ id: "job-a", status: "SUCCEEDED" });
    await Promise.resolve();
    await Promise.resolve();

    expect(store.state.workspaceId).toBe("ws-b");
    expect(store.state.buildJobId).toBeNull();
    expect(store.state.previewArtifactId).toBeUndefined();
    expect(api.listBuildArtifacts).not.toHaveBeenCalled();
  });

  it("ignores an older overlapping workspace load that finishes after the current workspace", async () => {
    let resolveLatestA: (job: { id: string; status: string }) => void = () => {};
    let markLatestARequested: () => void = () => {};
    const latestA = new Promise((resolve) => {
      resolveLatestA = resolve;
    });
    const latestARequested = new Promise<void>((resolve) => {
      markLatestARequested = resolve;
    });
    api.getWorkspace.mockImplementation(async (id) => ({
      id,
      name: id === "ws-a" ? "工程A" : "工程B",
      mode: "new",
      currentRevisionId: null,
    }));
    api.listConversations.mockImplementation(async (id) => [
      { id: `conv-${id}`, title: `${id} 对话` },
    ]);
    api.listMessages.mockResolvedValue([]);
    api.getLatestBuildJob.mockImplementation(async (id) => {
      if (id === "ws-a") {
        markLatestARequested();
        return latestA;
      }
      return { id: "job-b", status: "SUCCEEDED" };
    });
    api.getBuildJob.mockImplementation(async (id) => ({ id, status: "SUCCEEDED" }));
    api.listBuildArtifacts.mockImplementation(async (id) => [
      { id: id === "job-a" ? "art-a" : "art-b", kind: "client-package" },
    ]);
    api.getBuildJobReport.mockResolvedValue({ outcome: "pass" });

    const store = useWorkspace();
    const loadingA = store.load("ws-a");
    await latestARequested;
    await store.load("ws-b");
    expect(store.state.previewArtifactId).toBe("art-b");

    resolveLatestA({ id: "job-a", status: "SUCCEEDED" });
    await loadingA;

    expect(store.state.workspaceId).toBe("ws-b");
    expect(store.state.buildJobId).toBe("job-b");
    expect(store.state.previewArtifactId).toBe("art-b");
    expect(api.getBuildJob).not.toHaveBeenCalledWith("job-a");
  });

  it("ignores a message result from the workspace the user already left", async () => {
    let finishMessageA: (done: { buildJobId: string }) => void = () => {};
    const messageA = new Promise((resolve) => {
      finishMessageA = resolve;
    });
    api.getWorkspace.mockImplementation(async (id) => ({ id, name: id, mode: "new", currentRevisionId: null }));
    api.listConversations.mockImplementation(async (id) => [{ id: `conv-${id}`, title: id }]);
    api.listMessages.mockResolvedValue([]);
    api.getLatestBuildJob.mockResolvedValue(null);
    streamMessageTurn.mockReturnValue(messageA);

    const store = useWorkspace();
    await store.load("ws-a");
    const sendingA = store.sendMessage("生成工程");
    await store.load("ws-b");
    finishMessageA({ buildJobId: "job-a" });
    await sendingA;

    expect(store.state.workspaceId).toBe("ws-b");
    expect(store.state.buildJobId).toBeNull();
    expect(api.getBuildJob).not.toHaveBeenCalledWith("job-a");
  });

  it("ignores an approval result from the workspace the user already left", async () => {
    let finishApprovalA: (done: { buildJobId: string }) => void = () => {};
    const approvalA = new Promise((resolve) => {
      finishApprovalA = resolve;
    });
    api.getWorkspace.mockImplementation(async (id) => ({ id, name: id, mode: "new", currentRevisionId: null }));
    api.listConversations.mockImplementation(async (id) => [{ id: `conv-${id}`, title: id }]);
    api.listMessages.mockResolvedValue([]);
    api.getLatestBuildJob.mockResolvedValue(null);
    streamMessageTurn.mockResolvedValue({ interrupt: { planHash: "a".repeat(64) } });
    api.resume.mockReturnValue(approvalA);

    const store = useWorkspace();
    await store.load("ws-a");
    await store.sendMessage("生成方案");
    const approvingA = store.resumeApproval("approve");
    await store.load("ws-b");
    finishApprovalA({ buildJobId: "job-a" });
    await approvingA;

    expect(store.state.workspaceId).toBe("ws-b");
    expect(store.state.buildJobId).toBeNull();
    expect(api.getBuildJob).not.toHaveBeenCalledWith("job-a");
  });

  it("does not start a message turn while approval is being resumed", async () => {
    let finishApproval: (done: Record<string, unknown>) => void = () => {};
    const approval = new Promise((resolve) => {
      finishApproval = resolve;
    });
    api.listConversations.mockResolvedValue([convA]);
    api.listMessages.mockResolvedValue([]);
    api.getLatestBuildJob.mockResolvedValue(null);
    streamMessageTurn.mockResolvedValue({ interrupt: { planHash: "b".repeat(64) } });
    api.resume.mockReturnValue(approval);

    const store = useWorkspace();
    await store.load("ws-1");
    await store.sendMessage("生成方案");
    const approving = store.resumeApproval("approve");
    expect(store.state.resuming).toBe(true);
    streamMessageTurn.mockClear();

    await store.sendMessage("审批中不应发送");
    expect(streamMessageTurn).not.toHaveBeenCalled();

    finishApproval({});
    await approving;
    expect(store.state.resuming).toBe(false);
  });

  it("delegates createPreviewUrl to the rendered HTML endpoint without blob download", async () => {
    api.previewUrl.mockReturnValue("/api/artifacts/art-abc/preview");
    const store = useWorkspace();
    const url = store.createPreviewUrl("art-abc");
    expect(url).toBe("/api/artifacts/art-abc/preview");
    expect(api.previewUrl).toHaveBeenCalledWith("art-abc");
    expect(api.createDownloadToken).not.toHaveBeenCalled();
  });

  it("surfaces a workflow error returned in the SSE done snapshot", async () => {
    api.listConversations.mockResolvedValue([convA]);
    api.listMessages.mockResolvedValue([]);
    streamMessageTurn.mockResolvedValue({
      stage: "idle",
      lastErrorCode: "UI_IMPLEMENTATION_INVALID:deepseek model output rejected: unparseable JSON",
    });
    const store = useWorkspace();
    await store.load("ws-1");

    await store.sendMessage("确认");

    expect(store.state.error).toContain("工程实施计划生成失败");
  });
});
