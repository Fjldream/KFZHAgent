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
  getBuildJob: vi.fn(),
  listBuildArtifacts: vi.fn(),
  getBuildJobReport: vi.fn(),
}));

vi.mock("../api", () => ({ api }));

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
  api.getBuildJob.mockReset();
  api.listBuildArtifacts.mockReset();
  api.getBuildJobReport.mockReset();

  api.getWorkspace.mockResolvedValue(ws);
  api.listRevisions.mockResolvedValue([]);
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

  it("delegates createPreviewUrl to the rendered HTML endpoint without blob download", async () => {
    api.previewUrl.mockReturnValue("/api/artifacts/art-abc/preview");
    const store = useWorkspace();
    const url = store.createPreviewUrl("art-abc");
    expect(url).toBe("/api/artifacts/art-abc/preview");
    expect(api.previewUrl).toHaveBeenCalledWith("art-abc");
    expect(api.createDownloadToken).not.toHaveBeenCalled();
  });
});
