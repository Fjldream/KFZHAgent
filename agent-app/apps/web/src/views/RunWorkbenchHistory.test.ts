// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RevisionDetail } from "@kf/contracts";
import RunWorkbenchView from "./RunWorkbenchView.vue";
import { fetchLatestRun, fetchRunSnapshot } from "../runs-api.js";
import ContextPanel from "../components/runs/ContextPanel.vue";
const mockApi = vi.hoisted(() => ({
  getWorkspace: vi.fn(), conversationPage: vi.fn(), listRevisions: vi.fn(), messagePage: vi.fn(),
  getConversationV2: vi.fn(), getWorkbenchConfig: vi.fn(), revisionDetail: vi.fn(),
  forkConversation: vi.fn(), getConversationDelivery: vi.fn(), createDownloadToken: vi.fn(), downloadUrl: vi.fn(),
}));
vi.mock("../api.js", () => ({ API_BASE: "", api: mockApi }));
vi.mock("../runs-api.js", async importOriginal => ({
  ...await importOriginal<typeof import("../runs-api.js")>(), fetchLatestRun: vi.fn().mockResolvedValue(null), fetchRunSnapshot: vi.fn(),
}));
vi.mock("../composables/useRunStream.js", async () => {
  const { ref } = await import("vue");
  return { useRunStream: () => ({ status: ref("SUCCEEDED"), connected: ref(false), lastSeq: ref(2), events: ref([]),
    start: vi.fn().mockResolvedValue(undefined), stop: vi.fn(), steps: () => [] }) };
});
function detail(id = "old", extra: Partial<RevisionDetail> = {}): RevisionDetail {
  return { id, workspaceId: "w1", revisionNumber: id === "old" ? 2 : 3, parentRevisionId: "source", kind: "build", createdAt: "2026-10-27", current: false,
    delivery: { artifactId: `${id}-artifact`, sha256: "abc123", buildJobId: `${id}-job`, runId: `${id}-run` },
    forkAnchor: { conversationId: "anchor-conversation", messageId: "anchor-message" },
    verification: { compiled: "passed", runtime: "not_performed", visual: "not_performed" }, ...extra };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(complete => { resolve = complete; }); return { promise, resolve }; }
function button(wrapper: ReturnType<typeof mount>, text: string) { return wrapper.findAll("button").find(item => item.text() === text)!; }
async function open(wrapper: ReturnType<typeof mount>, id = "old") {
  wrapper.getComponent(ContextPanel).vm.$emit("selectRevision", id); await flushPromises();
}
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear();
  vi.mocked(fetchLatestRun).mockResolvedValue(null);
  mockApi.getWorkspace.mockResolvedValue({ id: "w1", name: "测试工程", currentRevisionId: "current" });
  mockApi.conversationPage.mockResolvedValue({ items: [{ id: "selected", workspaceId: "w1", title: "当前对话" }], nextCursor: null });
  mockApi.listRevisions.mockResolvedValue([
    { id: "current", revisionNumber: 3, createdAt: "2026-10-27" },
    { id: "old", revisionNumber: 2, createdAt: "2026-10-26" },
    { id: "source", revisionNumber: 1, createdAt: "2026-10-25" },
  ]);
  mockApi.messagePage.mockResolvedValue({ items: [], nextCursor: null });
  mockApi.getWorkbenchConfig.mockResolvedValue({ schemaVersion: 1, flags: { agentRunsV2: true, agentWorkbenchV2: true }, imagePolicy: "disabled", outboundImagesAllowed: false });
  mockApi.revisionDetail.mockImplementation((_workspace, id: string) => Promise.resolve(detail(id)));
  mockApi.forkConversation.mockResolvedValue({ id: "forked", workspaceId: "w1", title: "历史继续", archivedAt: null });
  mockApi.createDownloadToken.mockImplementation((artifactId: string) => Promise.resolve({ token: `${artifactId}-token`, artifactId }));
  mockApi.downloadUrl.mockImplementation((token: string) => `/download/${token}`);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});
afterEach(() => vi.unstubAllGlobals());
describe("historical revisions in the real workbench", () => {
  it("opens rows by revision ID and separates compile evidence from runtime acceptance and current baseline", async () => {
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } }); await flushPromises();
    await button(wrapper, "v2").trigger("click"); await flushPromises();
    expect(mockApi.revisionDetail).toHaveBeenCalledWith("w1", "old");
    const panel = wrapper.get('[aria-label="版本详情"]');
    expect(panel.text()).toContain("父版本：v1"); expect(panel.text()).toContain("编译校验：通过");
    expect(panel.text()).toContain("运行态验收：未执行"); expect(panel.text()).toContain("视觉验收：未执行");
    expect(panel.text()).toContain("后续生成仍使用工作区当前基线并检查冲突");
    expect(wrapper.findAll('.rev.current')).toHaveLength(1); expect(wrapper.get('.rev.current').text()).toContain("v3");
    await button(wrapper, "关闭版本详情").trigger("click"); expect(wrapper.find('[aria-label="版本详情"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it("ignores slow detail results after another selection, close, and workspace change", async () => {
    const slow = deferred<RevisionDetail>(); mockApi.revisionDetail.mockReturnValueOnce(slow.promise);
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } }); await flushPromises();
    await open(wrapper); expect(wrapper.text()).toContain("正在加载版本详情");
    await open(wrapper, "current"); slow.resolve(detail()); await flushPromises();
    expect(wrapper.get('[aria-label="版本详情"]').text()).toContain("v3 · 只读详情");
    const closed = deferred<RevisionDetail>(); mockApi.revisionDetail.mockReturnValueOnce(closed.promise);
    await open(wrapper); await button(wrapper, "关闭版本详情").trigger("click"); closed.resolve(detail()); await flushPromises();
    expect(wrapper.find('[aria-label="版本详情"]').exists()).toBe(false);
    const foreign = deferred<RevisionDetail>(); mockApi.revisionDetail.mockReturnValueOnce(foreign.promise);
    await open(wrapper); await wrapper.setProps({ workspaceId: "w2" }); foreign.resolve(detail()); await flushPromises();
    expect(wrapper.find('[aria-label="版本详情"]').exists()).toBe(false); wrapper.unmount();
  });
  it("retries failed details and keeps initial/source/unbound versions read-only without fake actions", async () => {
    mockApi.revisionDetail.mockRejectedValueOnce(new Error("连接中断"));
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } }); await flushPromises(); await open(wrapper);
    expect(wrapper.text()).toContain("连接中断");
    mockApi.revisionDetail.mockReset().mockResolvedValue(detail("old", { parentRevisionId: null, delivery: null, forkAnchor: null,
      verification: { compiled: "unknown", runtime: "not_performed", visual: "not_performed" } }));
    await button(wrapper, "重试版本详情").trigger("click"); await flushPromises();
    const panel = wrapper.get('[aria-label="版本详情"]'); expect(panel.text()).toContain("无（初始版本）"); expect(panel.text()).toContain("编译校验：未知");
    expect(panel.text()).toContain("仅支持只读查看"); expect(panel.text()).toContain("缺少可靠的消息关联");
    expect(button(wrapper, "下载此版本工程包")).toBeUndefined(); expect(button(wrapper, "从这里开始对话")).toBeUndefined();
    expect(mockApi.createDownloadToken).not.toHaveBeenCalled(); expect(mockApi.forkConversation).not.toHaveBeenCalled(); wrapper.unmount();
  });
  it("downloads the selected artifact and rejects mismatched tokens or navigation while a token is pending", async () => {
    vi.mocked(fetchLatestRun).mockResolvedValue({ id: "selected-run", status: "SUCCEEDED", lastSeq: 2, failureCode: null, resultRevisionId: "old" });
    vi.mocked(fetchRunSnapshot).mockResolvedValue({ id: "selected-run", status: "SUCCEEDED", lastSeq: 2, failureCode: null, resultRevisionId: "old", buildJobId: "old-job" });
    mockApi.getConversationDelivery.mockResolvedValue({ artifactId: "current-conversation-artifact", revisionId: "old", buildJobId: "old-job" });
    const assign = vi.fn(); vi.stubGlobal("window", new Proxy(window, { get(target, key) { return key === "location" ? { assign } : Reflect.get(target, key, target); } }));
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } }); await flushPromises(); await open(wrapper);
    await button(wrapper, "下载此版本工程包").trigger("click"); await flushPromises();
    expect(wrapper.get('.rev.current').text()).toContain("v3");
    expect(wrapper.find('[aria-label="工程交付"]').exists()).toBe(true);
    expect(mockApi.createDownloadToken).toHaveBeenLastCalledWith("old-artifact"); expect(assign).toHaveBeenLastCalledWith("/download/old-artifact-token");
    await open(wrapper, "current"); await button(wrapper, "下载此版本工程包").trigger("click"); await flushPromises();
    expect(mockApi.createDownloadToken).toHaveBeenLastCalledWith("current-artifact");
    mockApi.createDownloadToken.mockResolvedValueOnce({ token: "wrong", artifactId: "latest-artifact" });
    await open(wrapper); await button(wrapper, "下载此版本工程包").trigger("click"); await flushPromises();
    expect(wrapper.text()).toContain("下载凭据与历史制品不匹配"); expect(assign).toHaveBeenCalledTimes(2);
    await button(wrapper, "下载工程包").trigger("click"); await flushPromises();
    expect(mockApi.createDownloadToken).toHaveBeenLastCalledWith("current-conversation-artifact");
    const token = deferred<{ token: string; artifactId: string }>(); mockApi.createDownloadToken.mockReturnValueOnce(token.promise);
    await button(wrapper, "下载此版本工程包").trigger("click"); await open(wrapper, "current"); token.resolve({ token: "late", artifactId: "old-artifact" }); await flushPromises();
    expect(assign).toHaveBeenCalledTimes(3); wrapper.unmount();
  });
  it("forks using the proven anchor, reuses the UUID after failure and preserves the source draft", async () => {
    mockApi.forkConversation.mockRejectedValueOnce(new Error("响应丢失"));
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } }); await flushPromises();
    await wrapper.get("textarea").setValue("当前对话草稿"); await open(wrapper);
    await button(wrapper, "从这里开始对话").trigger("click"); await flushPromises(); expect(wrapper.text()).toContain("响应丢失");
    await button(wrapper, "关闭版本详情").trigger("click"); await open(wrapper);
    await button(wrapper, "从这里开始对话").trigger("click"); await flushPromises();
    const first = mockApi.forkConversation.mock.calls[0]!; const second = mockApi.forkConversation.mock.calls[1]!;
    expect(first).toEqual(second); expect(first[0]).toBe("anchor-conversation"); expect(first[1]).toMatchObject({ messageId: "anchor-message", revisionId: "old" });
    expect(first[1].clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(wrapper.getComponent(ContextPanel).props('revisions')?.find(row => row.current)?.id).toBe("current");
    expect(wrapper.text()).toContain("历史继续"); expect(wrapper.get("textarea").element.value).toBe("");
    await wrapper.setProps({ conversationId: "selected" }); await flushPromises();
    expect(wrapper.get("textarea").element.value).toBe("当前对话草稿");
    await open(wrapper); await button(wrapper, "从这里开始对话").trigger("click"); await flushPromises();
    expect(mockApi.forkConversation.mock.calls[2]![1].clientRequestId).not.toBe(first[1].clientRequestId);
    wrapper.unmount();
  });
  it("does not steal conversation selection when a late fork succeeds after navigation", async () => {
    const fork = deferred<{ id: string; workspaceId: string; title: string }>(); mockApi.forkConversation.mockReturnValueOnce(fork.promise);
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } }); await flushPromises(); await open(wrapper);
    await button(wrapper, "从这里开始对话").trigger("click"); await wrapper.setProps({ conversationId: "elsewhere" }); await flushPromises();
    fork.resolve({ id: "forked", workspaceId: "w1", title: "不应跳转" }); await flushPromises();
    expect(wrapper.text()).not.toContain("不应跳转"); wrapper.unmount();
  });
});
// end
