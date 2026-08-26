// @ts-nocheck -- store 测试为 JS 风格（vi.mock 工厂返回非类型化桩对象）。
// load() 会话绑定：复用最新会话恢复历史；无历史才新建；切换工程重新绑定。
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getWorkspace: vi.fn(),
  listRevisions: vi.fn(),
  listConversations: vi.fn(),
  createConversation: vi.fn(),
  listMessages: vi.fn(),
  getConversationDelivery: vi.fn(),
  createDownloadToken: vi.fn(),
  downloadUrl: vi.fn(),
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
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  api.getWorkspace.mockReset();
  api.listRevisions.mockReset();
  api.listConversations.mockReset();
  api.createConversation.mockReset();
  api.listMessages.mockReset();
  api.getConversationDelivery.mockReset();
  api.createDownloadToken.mockReset();
  api.downloadUrl.mockReset();
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
  api.getConversationDelivery.mockResolvedValue(null);
  api.downloadUrl.mockReturnValue("/api/artifacts/download/download-token");
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

  it("restores a persisted warning delivery snapshot when reopening", async () => {
    api.listConversations.mockResolvedValue([convA]);
    api.listMessages.mockResolvedValue([]);
    api.getConversationDelivery.mockResolvedValue({
      conversationId: "conv-a",
      workspaceId: "ws-1",
      buildJobId: "job-warning",
      artifactId: "art-warning",
      revisionId: "rev-warning",
      result: deliveryResult("ready_with_warnings", "warning survives refresh"),
      buildJob: { id: "job-warning", workspaceId: "ws-1", status: "SUCCEEDED" },
    });
    api.getLatestBuildJob.mockResolvedValue({ id: "job-warning", status: "SUCCEEDED" });
    api.getBuildJob.mockResolvedValue({ id: "job-warning", status: "SUCCEEDED" });
    api.listBuildArtifacts.mockResolvedValue([{ id: "art-warning", kind: "client-package" }]);
    api.getBuildJobReport.mockResolvedValue({ outcome: "pass" });

    const store = useWorkspace();
    await store.load("ws-1");

    expect(api.getConversationDelivery).toHaveBeenCalledWith("conv-a");
    expect(api.getConversationDelivery).toHaveBeenCalledWith("conv-a", "job-warning");
    expect(store.state.moduleDeliveryResult?.status).toBe("ready_with_warnings");
    expect(store.state.moduleDeliveryResult?.gaps[0]?.reason).toBe("warning survives refresh");
  });

  it("keeps a persisted blocked snapshot unavailable after refresh", async () => {
    api.listConversations.mockResolvedValue([convA]);
    api.listMessages.mockResolvedValue([]);
    api.getConversationDelivery.mockResolvedValue({
      conversationId: "conv-a",
      workspaceId: "ws-1",
      buildJobId: "job-blocked",
      artifactId: null,
      revisionId: null,
      result: deliveryResult("blocked", "blocked survives refresh"),
      buildJob: { id: "job-blocked", workspaceId: "ws-1", status: "FAILED" },
    });
    api.getLatestBuildJob.mockResolvedValue({ id: "job-blocked", status: "FAILED" });
    api.getBuildJob.mockResolvedValue({ id: "job-blocked", status: "FAILED" });
    api.getBuildJobReport.mockResolvedValue({ outcome: "fail" });

    const store = useWorkspace();
    await store.load("ws-1");

    expect(store.state.moduleDeliveryResult?.status).toBe("blocked");
    await expect(store.downloadArtifact("art-stale")).rejects.toThrow("交付被阻断");
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

  it("submits a displayed v3 blueprint confirmation through the conversation message request", async () => {
    const v3Message = `KF_BLUEPRINT_MESSAGE/1\n${JSON.stringify({
      kind: "kf-customer-effect-blueprint",
      version: 1,
      revision: 1,
      blueprint: {
        schema: "kf-design-plan/v3",
        displayName: "园区访客协同中心",
        objective: "审核访客预约",
        audiences: ["园区前台"],
        scenarios: ["预约审核"],
        pages: [{
          id: "visitor-overview",
          title: "访客总览",
          purpose: "处理预约",
          readingOrder: ["visitor-list"],
          regions: [{
            id: "visitor-list",
            purpose: "浏览预约",
            semanticRoles: ["记录列表"],
            dataShape: "访客记录",
            density: "comfortable",
            importance: "primary",
            content: ["访客姓名"],
            sampleData: [{ 访客姓名: "陈嘉宁" }],
            interactions: ["查看详情"],
            states: ["待审核"],
            visualIntent: "清晰扫读",
          }],
        }],
        journeys: [{
          id: "review-visitor",
          actor: "园区前台",
          goal: "审核预约",
          steps: [{ pageId: "visitor-overview", regionId: "visitor-list", action: "选择预约", result: "显示详情" }],
          completion: "完成审核",
        }],
        visualDirection: { tone: "专业", colors: ["深蓝"], typography: "层级清楚", spacingAndSurfaces: "舒适留白" },
        acceptanceScenarios: ["可以完成审核"],
        openQuestions: [],
      },
    })}`;
    api.listConversations.mockResolvedValue([convA]);
    api.listMessages.mockResolvedValue([{ id: "blueprint-v3", role: "assistant", content: v3Message }]);
    streamMessageTurn.mockResolvedValue({ stage: "solution-plan-ready" });

    const store = useWorkspace();
    await store.load("ws-1");
    expect(store.state.messages[0]?.content).toBe(v3Message);

    await store.sendMessage("确认");

    expect(streamMessageTurn).toHaveBeenCalledWith("conv-a", "确认", expect.any(Function));
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

  it("uses creative projectDelivery as authoritative download-only state without assigning preview", async () => {
    const projectDelivery = {
      workflow: "creative-v2",
      projectKey: "creative",
      status: "downloadable",
      artifactId: "art-creative",
      revisionId: "rev-creative",
      download: { available: true, tokenEndpoint: "/api/artifacts/art-creative/download-token" },
      kf36RuntimeVerification: {
        status: "not_performed",
        notice: "尚未经过人工 KingFusion 3.6 运行态验证",
      },
    };
    api.getBuildJob.mockResolvedValue({ id: "job-creative", workspaceId: "ws-1", status: "SUCCEEDED" });
    api.listBuildArtifacts.mockResolvedValue([{ id: "art-creative", kind: "client-package" }]);
    api.getBuildJobReport.mockResolvedValue({ outcome: "pass" });
    api.getConversationDelivery.mockResolvedValue({
      conversationId: "conv-a",
      workspaceId: "ws-1",
      buildJobId: "job-creative",
      artifactId: "art-creative",
      revisionId: "rev-creative",
      result: null,
      projectDelivery,
      buildJob: { id: "job-creative", workspaceId: "ws-1", status: "SUCCEEDED" },
    });
    const store = useWorkspace();
    api.getWorkspace.mockResolvedValue({ ...ws, generationWorkflow: "creative-v2" });
    store.state.workspaceId = "ws-1";
    store.state.conversationId = "conv-a";
    store.state.workspace = { ...ws, generationWorkflow: "creative-v2" };

    await store.pollBuildJob("job-creative");

    expect(store.state.projectDelivery).toEqual(projectDelivery);
    expect(store.state.artifacts).toEqual([{ id: "art-creative", kind: "client-package" }]);
    expect(store.state.previewArtifactId).toBeUndefined();

    api.getConversationDelivery.mockResolvedValue({
      conversationId: "conv-a",
      workspaceId: "ws-1",
      buildJobId: "job-creative",
      artifactId: "art-creative",
      revisionId: "rev-creative",
      result: null,
      projectDelivery: {
        ...projectDelivery,
        kf36RuntimeVerification: {
          ...projectDelivery.kf36RuntimeVerification,
          notice: "forged runtime verification",
        },
      },
      buildJob: { id: "job-creative", workspaceId: "ws-1", status: "SUCCEEDED" },
    });
    await store.pollBuildJob("job-creative");

    expect(store.state.projectDelivery).toBeNull();
    api.createDownloadToken.mockResolvedValue({ token: "must-not-be-used" });
    await expect(store.downloadArtifact("art-creative")).rejects.toThrow("创意工程尚未达到可下载状态");
    expect(api.createDownloadToken).not.toHaveBeenCalled();
  });

  it("restores the latest successful build artifacts and preview when reopening a workspace", async () => {
    api.listConversations.mockResolvedValue([convA]);
    api.listMessages.mockResolvedValue([]);
    api.getConversationDelivery.mockResolvedValue({
      conversationId: "conv-a", workspaceId: "ws-1", buildJobId: "job-restored",
      artifactId: "art-restored", revisionId: "rev-restored", result: null,
      buildJob: { id: "job-restored", workspaceId: "ws-1", status: "SUCCEEDED" },
    });
    api.getBuildJob.mockResolvedValue({ id: "job-restored", status: "SUCCEEDED" });
    api.listBuildArtifacts.mockResolvedValue([
      { id: "art-restored", kind: "client-package" },
    ]);
    api.getBuildJobReport.mockResolvedValue({ outcome: "pass" });

    const store = useWorkspace();
    await store.load("ws-1");

    expect(api.getLatestBuildJob).not.toHaveBeenCalled();
    expect(api.getConversationDelivery).toHaveBeenCalledWith("conv-a");
    expect(store.state.buildJobId).toBe("job-restored");
    expect(store.state.buildJobStatus).toBe("SUCCEEDED");
    expect(store.state.previewArtifactId).toBe("art-restored");
    expect(store.state.validationReport).toEqual({ outcome: "pass" });
  });

  it("restores only the selected conversation's bound build when another conversation has the workspace-latest job", async () => {
    api.listConversations.mockResolvedValue([convB, convA]);
    api.listMessages.mockResolvedValue([]);
    api.getLatestBuildJob.mockResolvedValue({ id: "job-from-conv-a", workspaceId: "ws-1", status: "SUCCEEDED" });
    api.getConversationDelivery.mockImplementation(async (conversationId) => ({
      conversationId, workspaceId: "ws-1", buildJobId: "job-from-conv-b",
      artifactId: "art-from-conv-b", revisionId: "rev-from-conv-b", result: deliveryResult("ready_with_warnings", "selected conversation"),
      buildJob: { id: "job-from-conv-b", workspaceId: "ws-1", status: "SUCCEEDED" },
    }));
    api.getBuildJob.mockResolvedValue({ id: "job-from-conv-b", workspaceId: "ws-1", status: "SUCCEEDED" });
    api.listBuildArtifacts.mockResolvedValue([{ id: "art-from-conv-b", kind: "client-package" }]);
    api.getBuildJobReport.mockResolvedValue({ outcome: "pass" });

    const store = useWorkspace();
    await store.load("ws-1");

    expect(api.getConversationDelivery).toHaveBeenCalledWith("conv-b");
    expect(api.getLatestBuildJob).not.toHaveBeenCalled();
    expect(store.state.buildJobId).toBe("job-from-conv-b");
    expect(store.state.previewArtifactId).toBe("art-from-conv-b");
    expect(store.state.moduleDeliveryResult?.gaps[0]?.reason).toBe("selected conversation");
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
    api.getConversationDelivery.mockImplementation(async (conversationId) => conversationId === "conv-a" && store.state.workspaceId === "ws-a"
      ? { conversationId, workspaceId: "ws-a", buildJobId: "job-a", artifactId: null, revisionId: null, result: null, buildJob: { id: "job-a", workspaceId: "ws-a", status: "VALIDATING" } }
      : null);
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

  it("does not let an old build delivery refresh overwrite the new workspace", async () => {
    let resolveOldDelivery: (value: unknown) => void = () => {};
    const oldDelivery = new Promise((resolve) => { resolveOldDelivery = resolve; });
    api.getWorkspace.mockImplementation(async (id) => ({ id, name: id, mode: "new", currentRevisionId: null }));
    api.listConversations.mockImplementation(async (id) => [{ id: `conv-${id}`, title: id }]);
    api.listMessages.mockResolvedValue([]);
    api.getBuildJob.mockImplementation(async (id) => ({ id, status: "SUCCEEDED" }));
    api.listBuildArtifacts.mockImplementation(async (id) => [{ id: `art-${id}`, kind: "client-package" }]);
    api.getBuildJobReport.mockResolvedValue({ outcome: "pass" });
    api.getConversationDelivery.mockImplementation(async (conversationId) => conversationId === "conv-ws-a"
      ? oldDelivery
      : ({ conversationId, workspaceId: "ws-b", buildJobId: "job-b", artifactId: "art-job-b", revisionId: "rev-b", result: deliveryResult("ready", "current"), buildJob: { id: "job-b", workspaceId: "ws-b", status: "SUCCEEDED" } }));

    const store = useWorkspace();
    const loadA = store.load("ws-a");
    await vi.waitFor(() => expect(api.getConversationDelivery).toHaveBeenCalledWith("conv-ws-a"));
    await store.load("ws-b");
    resolveOldDelivery({ conversationId: "conv-ws-a", workspaceId: "ws-a", buildJobId: "job-a", artifactId: "art-job-a", revisionId: "rev-a", result: deliveryResult("blocked", "stale") });
    await loadA;

    expect(store.state.workspaceId).toBe("ws-b");
    expect(store.state.moduleDeliveryResult?.status).toBe("ready");
  });

  it("replaces a ready result with fail-closed blocked when the expected build fails", async () => {
    api.listConversations.mockResolvedValue([convA]);
    api.listMessages.mockResolvedValue([]);
    streamMessageTurn.mockResolvedValue({ buildJobId: "job-failed", moduleDeliveryResult: deliveryResult("ready", "") });
    api.getBuildJob.mockResolvedValue({ id: "job-failed", status: "FAILED" });
    api.getBuildJobReport.mockResolvedValue({ outcome: "fail" });
    api.getConversationDelivery.mockResolvedValue({
      conversationId: "conv-a", workspaceId: "ws-1", buildJobId: "job-failed", artifactId: null, revisionId: null,
      result: deliveryResult("blocked", "工程构建失败"),
    });

    const store = useWorkspace();
    await store.load("ws-1");
    await store.sendMessage("确认效果蓝图");

    expect(store.state.buildJobStatus).toBe("FAILED");
    expect(store.state.moduleDeliveryResult?.status).toBe("blocked");
    expect(store.state.previewArtifactId).toBeUndefined();
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
    api.getConversationDelivery.mockImplementation(async (conversationId) => {
      if (conversationId === "conv-ws-a") {
        markLatestARequested();
        return latestA;
      }
      return { conversationId, workspaceId: "ws-b", buildJobId: "job-b", artifactId: "art-b", revisionId: "rev-b", result: null, buildJob: { id: "job-b", workspaceId: "ws-b", status: "SUCCEEDED" } };
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

    resolveLatestA({ conversationId: "conv-ws-a", workspaceId: "ws-a", buildJobId: "job-a", artifactId: "art-a", revisionId: "rev-a", result: null, buildJob: { id: "job-a", workspaceId: "ws-a", status: "SUCCEEDED" } });
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

  it("keeps a delivery warning visible while the matching build finishes", async () => {
    api.listConversations.mockResolvedValue([convA]);
    api.listMessages.mockResolvedValue([]);
    api.getBuildJob.mockResolvedValue({ id: "job-warning", status: "SUCCEEDED" });
    api.listBuildArtifacts.mockResolvedValue([{ id: "art-warning", kind: "client-package" }]);
    api.getBuildJobReport.mockResolvedValue({ outcome: "pass" });
    streamMessageTurn.mockResolvedValue({
      buildJobId: "job-warning",
      moduleDeliveryResult: deliveryResult("ready_with_warnings", "hero-warning"),
    });

    const store = useWorkspace();
    await store.load("ws-1");
    await store.sendMessage("确认效果蓝图");

    expect(store.state.moduleDeliveryResult?.status).toBe("ready_with_warnings");
    expect(store.state.moduleDeliveryResult?.gaps[0]?.reason).toBe("hero-warning");
    await vi.waitFor(() => expect(store.state.previewArtifactId).toBe("art-warning"));
  });

  it("does not let an old send result overwrite the current workspace delivery report", async () => {
    let finishMessageA: (done: Record<string, unknown>) => void = () => {};
    const messageA = new Promise((resolve) => { finishMessageA = resolve; });
    api.getWorkspace.mockImplementation(async (id) => ({ id, name: id, mode: "new", currentRevisionId: null }));
    api.listConversations.mockImplementation(async (id) => [{ id: `conv-${id}`, title: id }]);
    api.listMessages.mockResolvedValue([]);
    api.getLatestBuildJob.mockResolvedValue(null);
    streamMessageTurn.mockReturnValueOnce(messageA).mockResolvedValueOnce({
      moduleDeliveryResult: deliveryResult("ready", "current"),
    });

    const store = useWorkspace();
    await store.load("ws-a");
    const sendingA = store.sendMessage("A 工程");
    await store.load("ws-b");
    await store.sendMessage("B 工程");
    finishMessageA({ moduleDeliveryResult: deliveryResult("blocked", "old") });
    await sendingA;

    expect(store.state.workspaceId).toBe("ws-b");
    expect(store.state.moduleDeliveryResult?.status).toBe("ready");
    expect(store.state.moduleDeliveryResult?.gaps).toEqual([]);
  });

  it("clears delivery results immediately on an overlapping workspace load", async () => {
    let finishWorkspaceB: (workspace: Record<string, unknown>) => void = () => {};
    const workspaceB = new Promise((resolve) => { finishWorkspaceB = resolve; });
    api.listConversations.mockResolvedValue([convA]);
    api.listMessages.mockResolvedValue([]);
    streamMessageTurn.mockResolvedValue({ moduleDeliveryResult: deliveryResult("ready", "old") });

    const store = useWorkspace();
    await store.load("ws-1");
    await store.sendMessage("生成");
    expect(store.state.moduleDeliveryResult?.status).toBe("ready");

    api.getWorkspace.mockImplementation(async (id) => id === "ws-2" ? workspaceB : ws);
    const loadingB = store.load("ws-2");
    expect(store.state.moduleDeliveryResult).toBeNull();
    finishWorkspaceB({ id: "ws-2", name: "工程B", mode: "new", currentRevisionId: null });
    await loadingB;
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

  it("does not let an old resume result overwrite the current workspace delivery report", async () => {
    let finishApprovalA: (done: Record<string, unknown>) => void = () => {};
    const approvalA = new Promise((resolve) => { finishApprovalA = resolve; });
    api.getWorkspace.mockImplementation(async (id) => ({ id, name: id, mode: "new", currentRevisionId: null }));
    api.listConversations.mockImplementation(async (id) => [{ id: `conv-${id}`, title: id }]);
    api.listMessages.mockResolvedValue([]);
    api.getLatestBuildJob.mockResolvedValue(null);
    streamMessageTurn
      .mockResolvedValueOnce({ interrupt: { planHash: "a".repeat(64) } })
      .mockResolvedValueOnce({ moduleDeliveryResult: deliveryResult("ready", "current") });
    api.resume.mockReturnValue(approvalA);

    const store = useWorkspace();
    await store.load("ws-a");
    await store.sendMessage("旧审批");
    const approvingA = store.resumeApproval("approve");
    await store.load("ws-b");
    await store.sendMessage("当前生成");
    finishApprovalA({ moduleDeliveryResult: deliveryResult("blocked", "old") });
    await approvingA;

    expect(store.state.moduleDeliveryResult?.status).toBe("ready");
    expect(store.state.moduleDeliveryResult?.gaps).toEqual([]);
  });

  it("blocks artifact export only for a blocked module delivery", async () => {
    api.listConversations.mockResolvedValue([convA]);
    api.listMessages.mockResolvedValue([]);
    api.createDownloadToken.mockResolvedValue({ token: "download-token" });
    streamMessageTurn
      .mockResolvedValueOnce({ moduleDeliveryResult: deliveryResult("blocked", "missing capability") })
      .mockResolvedValueOnce({ moduleDeliveryResult: deliveryResult("ready_with_warnings", "minor difference") });

    const store = useWorkspace();
    await store.load("ws-1");
    await store.sendMessage("blocked");
    await expect(store.downloadArtifact("art-blocked")).rejects.toThrow("交付被阻断");
    expect(api.createDownloadToken).not.toHaveBeenCalled();

    await store.sendMessage("warning");
    await store.downloadArtifact("art-warning");
    expect(api.createDownloadToken).toHaveBeenCalledWith("art-warning");
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

function deliveryResult(status, reason) {
  return {
    modulePlanHash: "1".repeat(64),
    projectKey: "kingclient",
    status,
    implementedModules: [{ pageId: "home", moduleId: "hero", kind: "content.hero" }],
    gaps: status === "ready" ? [] : [{
      moduleId: "hero",
      requirement: "保持视觉层级",
      severity: status === "blocked" ? "blocking" : "warning",
      status: "unresolved",
      reason,
    }],
    repairCount: 1,
    revisionDiff: { changedModules: ["hero"], preservedModules: ["footer"] },
  };
}
