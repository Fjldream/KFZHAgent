// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RunWorkbenchView from "./RunWorkbenchView.vue";
// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { useSession } from "../stores/session.js";
// end
// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { startRun, fetchLatestRun, fetchRunSnapshot, cancelRun, retryRun } from "../runs-api.js";
// end
const mockRunState = vi.hoisted(() => ({ status: "SUCCEEDED", events: [] as Array<{ type: string; payload: Record<string, unknown> }> }));

const mockApi = vi.hoisted(() => ({
  getWorkspace: vi.fn(), getConversationV2: vi.fn(), conversationPage: vi.fn(), listRevisions: vi.fn(),
  messagePage: vi.fn(), createConversationV2: vi.fn(), updateConversation: vi.fn(),
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  getWorkbenchConfig: vi.fn(),
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  uploadSource: vi.fn(),
  // end
  // end
}));
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
vi.mock("../api.js", async importOriginal => ({ API_BASE: "", api: mockApi, ApiError: (await importOriginal<typeof import("../api.js")>()).ApiError }));
import { ApiError } from "../api.js";
// end
vi.mock("../runs-api.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../runs-api.js")>();
  return { ...actual, startRun: vi.fn(), cancelRun: vi.fn(), retryRun: vi.fn(), fetchLatestRun: vi.fn().mockResolvedValue(null), fetchRunSnapshot: vi.fn().mockResolvedValue({ status: "SUCCEEDED" }) };
});
vi.mock("../composables/useRunStream.js", async () => {
  const { ref } = await import("vue");
  return { useRunStream: () => ({ status: ref(mockRunState.status), connected: ref(false),
    lastSeq: ref(2), events: ref(mockRunState.events), start: vi.fn().mockResolvedValue(undefined), stop: vi.fn(), steps: () => [] }) };
});

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  useSession().state.user = null;
  // end
  mockRunState.status = "SUCCEEDED";
  mockRunState.events = [];
  vi.mocked(fetchLatestRun).mockResolvedValue(null);
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  vi.mocked(fetchRunSnapshot).mockResolvedValue({ id: "snapshot-r", status: "SUCCEEDED", lastSeq: 2, failureCode: null, resultRevisionId: null });
  // end
  mockApi.getWorkspace.mockResolvedValue({ id: "w1", name: "测试工程" });
  mockApi.getConversationV2.mockResolvedValue({ id: "foreign", workspaceId: "other", title: "其他工程会话" });
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  mockApi.getWorkbenchConfig.mockResolvedValue({ schemaVersion: 1, flags: { agentRunsV2: true, agentWorkbenchV2: true }, imagePolicy: "disabled", outboundImagesAllowed: false });
  // end
  mockApi.conversationPage.mockResolvedValue({ items: [{ id: "c1", title: "真实对话" }], nextCursor: null });
  mockApi.listRevisions.mockResolvedValue([]);
  mockApi.messagePage.mockResolvedValue({ items: [], nextCursor: null });
  mockApi.createConversationV2.mockResolvedValue({ id: "c-new", title: "新对话" });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

describe("RunWorkbenchView", () => {
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  it("keeps retry disabled while the terminal recovery policy is still being read", async () => {
    mockRunState.status = "FAILED";
    const snapshot = { id: "pending-native-name", status: "FAILED" as const, lastSeq: 2,
      failureCode: "CREATIVE_GENERATED_NATIVE_NAME_REGENERATION_REQUIRED", resultRevisionId: null };
    let resolveSnapshot!: (value: typeof snapshot) => void;
    vi.mocked(fetchLatestRun).mockResolvedValue(snapshot);
    vi.mocked(fetchRunSnapshot).mockReturnValue(new Promise(resolve => { resolveSnapshot = resolve; }));
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } }); await flushPromises();
    expect(wrapper.get('[data-testid="run-retry"]').attributes("disabled")).toBeDefined();
    await wrapper.get('[data-testid="run-retry"]').trigger("click");
    expect(retryRun).not.toHaveBeenCalled();
    resolveSnapshot(snapshot); await flushPromises();
    expect(wrapper.find('[data-testid="run-retry"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="native-name-new-workspace"]').attributes("href")).toBe("/workspaces");
    wrapper.unmount();
  });
  it("keeps retry disabled when recovery policy lookup fails instead of guessing that a failed run is retryable", async () => {
    mockRunState.status = "FAILED";
    vi.mocked(fetchLatestRun).mockResolvedValue({ id: "unknown-recovery", status: "FAILED", lastSeq: 2, failureCode: null, resultRevisionId: null });
    vi.mocked(fetchRunSnapshot).mockRejectedValue(new Error("temporary snapshot lookup error"));
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } }); await flushPromises();
    expect(wrapper.text()).toContain("暂时无法读取本轮恢复方式，请刷新后重试");
    expect(wrapper.get('[data-testid="run-retry"]').attributes("disabled")).toBeDefined();
    await wrapper.get('[data-testid="run-retry"]').trigger("click");
    expect(retryRun).not.toHaveBeenCalled(); expect(startRun).not.toHaveBeenCalled(); wrapper.unmount();
  });
  // end
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  it.each(["new-run", "new-visual-review"] as const)("requires a new workspace for an incompatible generated-native name baseline (%s)", async retryPolicy => {
    mockRunState.status = "FAILED";
    const snapshot = { id: "legacy-native-name", status: "FAILED" as const, lastSeq: 2,
      failureCode: "CREATIVE_GENERATED_NATIVE_NAME_REGENERATION_REQUIRED", resultRevisionId: null, retryPolicy };
    vi.mocked(fetchLatestRun).mockResolvedValue(snapshot);
    vi.mocked(fetchRunSnapshot).mockResolvedValue(snapshot);
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } }); await flushPromises();
    expect(wrapper.text()).toContain("旧工程名称超过 KF 的长度限制，请新建工程重新生成；历史版本仍可下载");
    expect(wrapper.get('[data-testid="native-name-new-workspace"]').attributes("href")).toBe("/workspaces");
    expect(wrapper.find('[data-testid="run-retry"]').exists()).toBe(false);
    expect(startRun).not.toHaveBeenCalled(); expect(retryRun).not.toHaveBeenCalled(); wrapper.unmount();
  });
  // end
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  it.each([false, true])("shows the actual visual recovery limitation after refresh (reconsent=%s) without a retry call", async reconsent => {
    mockRunState.status = "FAILED";
    const snapshot = { id: "failed-visual", status: "FAILED" as const, lastSeq: 2,
      failureCode: reconsent ? "VISUAL_EXISTING_CONTENT_RECONSENT_REQUIRED" : "MODEL_TIMEOUT", resultRevisionId: null, retryPolicy: "new-visual-review" as const };
    vi.mocked(fetchLatestRun).mockResolvedValue(snapshot); vi.mocked(fetchRunSnapshot).mockResolvedValue(snapshot);
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } }); await flushPromises();
    expect(wrapper.text()).toContain(reconsent ? "现有视觉工程内容再次外发需要新同意，当前入口未开放" : "请重新上传参考图，确认本轮外发同意");
    if (reconsent) expect(wrapper.text()).not.toContain("请重新上传参考图");
    expect(wrapper.find('[data-testid="run-retry"]').exists()).toBe(false);
    expect(startRun).not.toHaveBeenCalled(); expect(retryRun).not.toHaveBeenCalled(); wrapper.unmount();
  });
  it("turns a legacy visual retry 409 into a new-review instruction while preserving the draft", async () => {
    mockRunState.status = "FAILED";
    const snapshot = { id: "legacy-visual", status: "FAILED" as const, lastSeq: 2, failureCode: "MODEL_TIMEOUT", resultRevisionId: null };
    vi.mocked(fetchLatestRun).mockResolvedValue(snapshot); vi.mocked(fetchRunSnapshot).mockResolvedValue(snapshot);
    vi.mocked(retryRun).mockRejectedValue(new ApiError(409, "RETRY_RUN_FAILED", '{"message":"VISUAL_RETRY_NOT_ENABLED"}'));
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } }); await flushPromises();
    await wrapper.get("textarea").setValue("保留我的新需求草稿"); await wrapper.get('[data-testid="run-retry"]').trigger("click"); await flushPromises();
    expect(wrapper.text()).toContain("图片任务当前不支持直接重试"); expect(wrapper.find('[data-testid="run-retry"]').exists()).toBe(false);
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("保留我的新需求草稿");
    expect(retryRun).toHaveBeenCalledTimes(1); expect(startRun).not.toHaveBeenCalled(); wrapper.unmount();
  });
  // end
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  it("offers source upload before allowing runs in an empty imported workspace", async () => {
    mockApi.getWorkspace.mockResolvedValue({ id: "w1", name: "待导入工程", mode: "upload" });
    mockApi.uploadSource.mockResolvedValue({});
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } });
    await flushPromises();
    expect(wrapper.find('[data-testid="upload-guide"]').exists()).toBe(true);
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).disabled).toBe(true);
    mockApi.listRevisions.mockResolvedValue([{ id: "source", revisionNumber: 1, createdAt: "2026-10-21", source: "upload" }]);
    mockApi.getWorkspace.mockResolvedValue({ id: "w1", name: "待导入工程", mode: "upload", currentRevisionId: "source" });
    const file = new File(["source"], "source.gz");
    const input = wrapper.get('input[type="file"]');
    Object.defineProperty(input.element, "files", { value: [file] });
    await input.trigger("change");
    await flushPromises();
    expect(mockApi.uploadSource).toHaveBeenCalledWith("w1", file);
    expect(wrapper.find('[data-testid="upload-guide"]').exists()).toBe(false);
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).disabled).toBe(false);
    expect(wrapper.text()).toContain("v1");
    wrapper.unmount();
  });
  it("keeps source upload available after a rejection, with no run submission", async () => {
    mockApi.getWorkspace.mockResolvedValue({ id: "w1", name: "待导入", mode: "upload" });
    mockApi.uploadSource.mockRejectedValue(new Error("PACKAGE_UNPACK_FAILED"));
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } });
    await flushPromises();
    const input = wrapper.get('input[type="file"]');
    Object.defineProperty(input.element, "files", { value: [new File(["bad"], "bad.gz")] });
    await input.trigger("change");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("PACKAGE_UNPACK_FAILED");
    expect(wrapper.find('[data-testid="upload-guide"]').exists()).toBe(true);
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).disabled).toBe(true);
    expect(startRun).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it("does not apply a late upload response to another workspace", async () => {
    let completeUpload!: () => void;
    mockApi.getWorkspace.mockResolvedValue({ id: "w1", name: "待导入", mode: "upload" });
    mockApi.uploadSource.mockImplementationOnce(() => new Promise<void>(resolve => { completeUpload = resolve; }));
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } });
    await flushPromises();
    const input = wrapper.get('input[type="file"]');
    Object.defineProperty(input.element, "files", { value: [new File(["source"], "source.gz")] });
    await input.trigger("change");
    await flushPromises();
    mockApi.getWorkspace.mockResolvedValue({ id: "w2", name: "其他工程", mode: "new", currentRevisionId: "r2" });
    await wrapper.setProps({ workspaceId: "w2" });
    await flushPromises();
    const callsAfterNavigation = mockApi.listRevisions.mock.calls.length;
    completeUpload();
    await flushPromises();
    expect(mockApi.listRevisions.mock.calls.length).toBe(callsAfterNavigation);
    expect(wrapper.find('[data-testid="upload-guide"]').exists()).toBe(false);
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).disabled).toBe(false);
    wrapper.unmount();
  });
  it("does not import a source package while admission is readonly", async () => {
    mockApi.getWorkspace.mockResolvedValue({ id: "w1", name: "待导入", mode: "upload" });
    mockApi.getWorkbenchConfig.mockResolvedValue({ schemaVersion: 1, flags: { agentRunsV2: false, agentWorkbenchV2: false } });
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } });
    await flushPromises();
    expect((wrapper.get("fieldset").element as HTMLFieldSetElement).disabled).toBe(true);
    const input = wrapper.get('input[type="file"]');
    Object.defineProperty(input.element, "files", { value: [new File(["source"], "source.gz")] });
    await input.trigger("change");
    await flushPromises();
    expect(mockApi.uploadSource).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  // end
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  it("shows history read-only when server admission is disabled", async () => {
    mockApi.getWorkbenchConfig.mockResolvedValue({ schemaVersion: 1, flags: { agentRunsV2: false, agentWorkbenchV2: false }, imagePolicy: "disabled", outboundImagesAllowed: false });
    mockApi.messagePage.mockResolvedValue({ items: [{ id: "history", role: "user", content: "已保存的工程需求" }], nextCursor: null });
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } });
    await flushPromises();
    expect(wrapper.text()).toContain("已保存的工程需求");
    expect(wrapper.text()).toContain("暂未开放");
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).disabled).toBe(true);
    wrapper.unmount();
  });
  it("fails closed if config cannot be loaded but still permits stopping an accepted run", async () => {
    mockApi.getWorkbenchConfig.mockRejectedValue(new Error("network failure"));
    mockRunState.status = "RUNNING";
    vi.mocked(fetchLatestRun).mockResolvedValue({ id: "accepted", status: "RUNNING", lastSeq: 2, failureCode: null, resultRevisionId: null });
    vi.mocked(cancelRun).mockResolvedValue({ id: "accepted", status: "CANCEL_REQUESTED", lastSeq: 3, failureCode: null, resultRevisionId: null });
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } });
    await flushPromises();
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).disabled).toBe(true);
    await wrapper.get(".btn-stop").trigger("click");
    await flushPromises();
    expect(cancelRun).toHaveBeenCalledWith("accepted");
    wrapper.unmount();
  });
  it("re-reads server config after workspace navigation and does not keep an old tenant's grant", async () => {
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } });
    await flushPromises();
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).disabled).toBe(false);
    mockApi.getWorkbenchConfig.mockResolvedValue({ schemaVersion: 1, flags: { agentRunsV2: false, agentWorkbenchV2: false }, imagePolicy: "disabled", outboundImagesAllowed: false });
    await wrapper.setProps({ workspaceId: "w-other" });
    await flushPromises();
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).disabled).toBe(true);
    wrapper.unmount();
  });
  it("clears a grant when the session tenant changes even without navigating", async () => {
    const session = useSession();
    session.state.user = { id: "u-a", username: "a", role: "member", tenantId: "tenant-a" };
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } });
    await flushPromises();
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).disabled).toBe(false);
    mockApi.getWorkbenchConfig.mockResolvedValue({ schemaVersion: 1, flags: { agentRunsV2: false, agentWorkbenchV2: false } });
    session.state.user = { id: "u-b", username: "b", role: "member", tenantId: "tenant-b" };
    await flushPromises();
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).disabled).toBe(true);
    wrapper.unmount();
  });
  it("ignores a delayed grant from a workspace already left", async () => {
    let resolveOld!: (value: unknown) => void;
    mockApi.getWorkbenchConfig.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } });
    await flushPromises();
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).disabled).toBe(true);
    mockApi.getWorkbenchConfig.mockResolvedValue({ schemaVersion: 1, flags: { agentRunsV2: false, agentWorkbenchV2: false } });
    await wrapper.setProps({ workspaceId: "w-other" });
    await flushPromises();
    resolveOld({ schemaVersion: 1, flags: { agentRunsV2: true, agentWorkbenchV2: true } });
    await flushPromises();
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).disabled).toBe(true);
    wrapper.unmount();
  });
  it("does not attach an old session's pending run to the new tenant after a switch", async () => {
    const session = useSession();
    session.state.user = { id: "u-a", username: "a", role: "member", tenantId: "tenant-a" };
    let resolveRun!: (value: Awaited<ReturnType<typeof startRun>>) => void;
    vi.mocked(startRun).mockReturnValueOnce(new Promise(resolve => { resolveRun = resolve; }));
    mockRunState.status = "RUNNING";
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1", conversationId: "c1" } });
    await flushPromises();
    await wrapper.get("textarea").setValue("A 的需求");
    await wrapper.get("textarea").trigger("keydown", { key: "Enter" });
    await flushPromises();
    mockApi.getWorkbenchConfig.mockResolvedValue({ schemaVersion: 1, flags: { agentRunsV2: false, agentWorkbenchV2: false } });
    mockApi.getWorkspace.mockRejectedValue(new Error("not found in tenant B"));
    session.state.user = { id: "u-b", username: "b", role: "member", tenantId: "tenant-b" };
    await flushPromises();
    resolveRun({ id: "tenant-a-run", status: "RUNNING", lastSeq: 1, failureCode: null, resultRevisionId: null });
    await flushPromises();
    expect(wrapper.find(".btn-stop").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("A 的需求");
    wrapper.unmount();
  });
  // end
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  it("offers explicit replanning instead of repeating a run whose baseline is obsolete", async () => {
    mockRunState.status = "FAILED";
    vi.mocked(fetchLatestRun).mockResolvedValue({ id: "stale-r", status: "FAILED", lastSeq: 2, failureCode: "BASE_REVISION_CONFLICT", resultRevisionId: null });
    vi.mocked(fetchRunSnapshot).mockResolvedValue({ id: "stale-r", status: "FAILED", lastSeq: 2, failureCode: "BASE_REVISION_CONFLICT", resultRevisionId: null });
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } });
    await flushPromises();
    expect(wrapper.find('[data-testid="run-retry"]').exists()).toBe(false);
    const replan = wrapper.find('[data-testid="run-replan"]');
    expect(replan.exists()).toBe(true);
    await replan.trigger("click");
    expect(wrapper.find('[role="tab"][aria-selected="true"]').text()).toContain("规划");
    expect(startRun).not.toHaveBeenCalled();
    expect(retryRun).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  // end
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  it("queues follow-ups while retaining focus on the real executing run", async () => {
    mockRunState.status = "RUNNING";
    vi.mocked(fetchLatestRun).mockResolvedValue({ id: "active-r", status: "RUNNING", lastSeq: 2, failureCode: null, resultRevisionId: null });
    vi.mocked(startRun).mockResolvedValue({ id: "queued-r", status: "QUEUED", lastSeq: 1, failureCode: null, resultRevisionId: null });
    vi.mocked(cancelRun).mockResolvedValue({ id: "active-r", status: "CANCEL_REQUESTED", lastSeq: 3, failureCode: null, resultRevisionId: null });
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } });
    await flushPromises();
    await wrapper.find("textarea").setValue("下一轮补充");
    await wrapper.find("textarea").trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(wrapper.text()).toContain("已排队");
    expect((wrapper.find("textarea").element as HTMLTextAreaElement).value).toBe("");
    await wrapper.find(".btn-stop").trigger("click");
    await flushPromises();
    expect(cancelRun).toHaveBeenCalledWith("active-r");
    wrapper.unmount();
  });
  // end
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  it("follows the next queued run after the current event stream reaches its terminal snapshot", async () => {
    mockRunState.status = "RUNNING";
    vi.mocked(fetchLatestRun).mockResolvedValueOnce({ id: "finished-r", status: "RUNNING", lastSeq: 2, failureCode: null, resultRevisionId: null })
      .mockResolvedValueOnce({ id: "next-r", status: "RUNNING", lastSeq: 1, failureCode: null, resultRevisionId: null });
    vi.mocked(cancelRun).mockResolvedValue({ id: "next-r", status: "CANCEL_REQUESTED", lastSeq: 3, failureCode: null, resultRevisionId: null });
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } });
    await flushPromises();
    await wrapper.find(".btn-stop").trigger("click");
    await flushPromises();
    expect(cancelRun).toHaveBeenCalledWith("next-r");
    wrapper.unmount();
  });
  // end
  it("submits a real stop request instead of only closing the event stream", async () => {
    mockRunState.status = "RUNNING";
    vi.mocked(fetchLatestRun).mockResolvedValue({ id: "active-r", status: "RUNNING", lastSeq: 2, failureCode: null, resultRevisionId: null });
    vi.mocked(cancelRun).mockResolvedValue({ id: "active-r", status: "CANCEL_REQUESTED", lastSeq: 3, failureCode: null, resultRevisionId: null });
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } });
    await flushPromises();
    await wrapper.find(".btn-stop").trigger("click");
    await flushPromises();
    expect(cancelRun).toHaveBeenCalledWith("active-r");
    expect(wrapper.text()).toContain("正在停止");
    expect(wrapper.find("textarea").attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });
  it("offers a new run retry after a failed run", async () => {
    mockRunState.status = "FAILED";
    vi.mocked(fetchLatestRun).mockResolvedValue({ id: "failed-r", status: "FAILED", lastSeq: 2, failureCode: "MODEL_TIMEOUT", resultRevisionId: null });
    vi.mocked(retryRun).mockResolvedValue({ id: "retry-r", status: "QUEUED", lastSeq: 1, failureCode: null, resultRevisionId: null });
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } });
    await flushPromises();
    const retry = wrapper.find('[data-testid="run-retry"]');
    expect(retry.exists()).toBe(true);
    await retry.trigger("click");
    await flushPromises();
    expect(retryRun).toHaveBeenCalledWith("failed-r", expect.any(String));
    wrapper.unmount();
  });
  it("keeps the draft and blocks a competing send while a retry request is pending", async () => {
    mockRunState.status = "FAILED";
    vi.mocked(fetchLatestRun).mockResolvedValue({ id: "failed-r", status: "FAILED", lastSeq: 2, failureCode: "MODEL_TIMEOUT", resultRevisionId: null });
    let release!: (value: Awaited<ReturnType<typeof retryRun>>) => void;
    vi.mocked(retryRun).mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } });
    await flushPromises();
    await wrapper.find("textarea").setValue("下一轮需求");
    await wrapper.find('[data-testid="run-retry"]').trigger("click");
    expect(wrapper.find(".btn-send").attributes("disabled")).toBeDefined();
    await wrapper.find("textarea").trigger("keydown", { key: "Enter" });
    expect(startRun).not.toHaveBeenCalled();
    release({ id: "retry-r", status: "QUEUED", lastSeq: 1, failureCode: null, resultRevisionId: null });
    await flushPromises();
    expect((wrapper.find("textarea").element as HTMLTextAreaElement).value).toBe("下一轮需求");
    wrapper.unmount();
  });
  it("restores a waiting run and submits its exact blueprint receipt", async () => {
    mockRunState.status = "WAITING_INPUT";
    mockRunState.events = [{ type: "input.required", payload: { question: "请确认蓝图", receipt: "exact-receipt" } }];
    vi.mocked(fetchLatestRun).mockResolvedValue({ id: "waiting-r", status: "WAITING_INPUT", lastSeq: 2, failureCode: null, resultRevisionId: null });
    vi.mocked(startRun).mockResolvedValue({ id: "next-r", status: "QUEUED", lastSeq: 1, failureCode: null, resultRevisionId: null });
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } });
    await flushPromises();
    const confirmation = wrapper.find('[aria-label="等待确认"] button');
    expect(confirmation.exists(), wrapper.text()).toBe(true);
    await confirmation.trigger("click");
    await flushPromises();
    expect(startRun).toHaveBeenCalledWith("c1", expect.objectContaining({ mode: "build", action: { type: "confirm_blueprint", expectedRunId: "waiting-r", receipt: "exact-receipt" } }));
    wrapper.unmount();
  });
  it("renders the exact design states only in explicit preview without reading live data", async () => {
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "design", preview: true } });
    await flushPromises();
    expect(wrapper.find(".titlebar").text()).toContain("智汇 · 工程工作台");
    expect(wrapper.find(".traffic").exists()).toBe(true);
    expect(wrapper.find(".wait-card").exists()).toBe(true);
    expect(wrapper.find(".done-card").exists()).toBe(true);
    expect(wrapper.find(".statusbar").text()).toContain("设计预览");
    expect(mockApi.getWorkspace).not.toHaveBeenCalled();
    await wrapper.findAll(".insp-tabs button")[3]!.trigger("click");
    expect(wrapper.find(".insp-pane:last-child").attributes("style")).not.toContain("display: none");
    expect(wrapper.text()).toContain("¥0.42");
    wrapper.unmount();
  });
  it("loads real conversations and submits using the active conversation", async () => {
    vi.mocked(startRun).mockResolvedValue({ id: "r1", status: "QUEUED", lastSeq: 1, failureCode: null, resultRevisionId: null });
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } });
    await flushPromises();
    expect(wrapper.text()).toContain("真实对话");
    expect(wrapper.find(".wait-card").exists()).toBe(false);
    await wrapper.find("textarea").setValue("做一个能耗页面");
    await wrapper.find("textarea").trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(startRun).toHaveBeenCalledWith("c1", expect.objectContaining({ action: { type: "message", text: "做一个能耗页面" } }));
    expect((wrapper.find("textarea").element as HTMLTextAreaElement).value).toBe("");
    wrapper.unmount();
  });
  it("creates a conversation from the empty workspace before sending", async () => {
    mockApi.conversationPage.mockResolvedValue({ items: [], nextCursor: null });
    vi.mocked(startRun).mockResolvedValue({ id: "r2", status: "QUEUED", lastSeq: 1, failureCode: null, resultRevisionId: null });
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } });
    await flushPromises();
    await wrapper.find("textarea").setValue("新页面");
    await wrapper.find("textarea").trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(mockApi.createConversationV2).toHaveBeenCalledWith("w1");
    expect(startRun).toHaveBeenCalledWith("c-new", expect.anything());
    wrapper.unmount();
  });
  it("retains the input when submission fails", async () => {
    vi.mocked(startRun).mockRejectedValue(new Error("提交失败，请重试"));
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } });
    await flushPromises();
    await wrapper.find("textarea").setValue("保留这条需求");
    await wrapper.find("textarea").trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect((wrapper.find("textarea").element as HTMLTextAreaElement).value).toBe("保留这条需求");
    expect(wrapper.find('[role="alert"]').text()).toContain("提交失败");
    wrapper.unmount();
  });
});
// end

// end

// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
describe("conversation navigation closure", () => {
  const page = (items: Array<Record<string, unknown>>, nextCursor: string | null = null) => ({ items, nextCursor });
  const conversations = [{ id: "c1", title: "第一会话", archivedAt: null }, { id: "c2", title: "第二会话", archivedAt: null }];
  const button = (wrapper: ReturnType<typeof mount>, label: string) => wrapper.findAll("button").find(item => item.text() === label)!;
  it("loads real conversation and history cursor pages without duplicating boundary rows", async () => {
    mockApi.conversationPage.mockResolvedValueOnce(page([conversations[0]!], "list-next")).mockResolvedValue(page(conversations));
    mockApi.messagePage.mockResolvedValueOnce(page([{ id: "m2", role: "user", content: "最新需求" }], "history-next"))
      .mockResolvedValue(page([{ id: "m1", role: "user", content: "最早需求" }, { id: "m2", role: "user", content: "最新需求" }]));
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } });
    await flushPromises();
    await button(wrapper, "加载更多会话").trigger("click");
    await flushPromises();
    expect(mockApi.conversationPage).toHaveBeenLastCalledWith("w1", "list-next", false);
    expect(wrapper.findAll(".conv")).toHaveLength(2);
    await button(wrapper, "加载更早消息").trigger("click");
    await flushPromises();
    expect(mockApi.messagePage).toHaveBeenLastCalledWith("c1", "history-next");
    expect(wrapper.findAll(".message-bubble, .msg").map(item => item.text()).join(" ")).toContain("最早需求");
    expect(wrapper.get('[aria-label="对话消息"]').text().indexOf("最早需求")).toBeLessThan(wrapper.get('[aria-label="对话消息"]').text().indexOf("最新需求"));
    expect(button(wrapper, "加载更早消息")).toBeUndefined();
    wrapper.unmount();
  });
  it("renames, archives read-only, and restores the selected conversation without creating another", async () => {
    mockApi.conversationPage.mockResolvedValue(page(conversations));
    mockApi.updateConversation.mockResolvedValueOnce({ ...conversations[0], title: "人工标题" })
      .mockResolvedValueOnce({ ...conversations[0], title: "人工标题", archivedAt: "2026-10-27" })
      .mockResolvedValueOnce({ ...conversations[0], title: "人工标题" });
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1", conversationId: "c1" } });
    await flushPromises();
    // modified by jinlong.feng at 2026-10-28 Agent工作台迭代
    await wrapper.get(".conversation-actions summary").trigger("click");
    await wrapper.get(".conversation-actions .menu-action").trigger("click");
    // end
    await wrapper.get('[aria-label="新会话名称"]').setValue("人工标题");
    await wrapper.get('form[aria-label="会话管理"]').trigger("submit");
    await flushPromises();
    expect(mockApi.updateConversation).toHaveBeenLastCalledWith("c1", { title: "人工标题" });
    expect(wrapper.get(".conv-name").text()).toBe("人工标题");
    // modified by jinlong.feng at 2026-10-28 Agent工作台迭代
    await wrapper.get(".conversation-actions summary").trigger("click");
    // end
    await button(wrapper, "归档会话").trigger("click");
    await flushPromises();
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).disabled).toBe(true);
    expect(wrapper.text()).toContain("此会话已归档");
    // modified by jinlong.feng at 2026-10-28 Agent工作台迭代
    await wrapper.get(".conversation-actions summary").trigger("click");
    // end
    await button(wrapper, "恢复会话").trigger("click");
    await flushPromises();
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).disabled).toBe(false);
    expect(mockApi.createConversationV2).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it("loads archive management through the archived endpoint and surfaces active-run conflicts", async () => {
    mockApi.conversationPage.mockResolvedValueOnce(page(conversations)).mockResolvedValue(page([{ ...conversations[1], archivedAt: "2026-10-27" }]));
    mockApi.updateConversation.mockRejectedValue(new Error("RUN_ACTIVE：请先结束当前运行"));
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } });
    await flushPromises();
    // modified by jinlong.feng at 2026-10-28 Agent工作台迭代
    await wrapper.get(".conversation-actions summary").trigger("click");
    // end
    await button(wrapper, "归档会话").trigger("click"); await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("RUN_ACTIVE");
    await button(wrapper, "📥 归档管理").trigger("click"); await flushPromises();
    expect(mockApi.conversationPage).toHaveBeenLastCalledWith("w1", null, true);
    await wrapper.get('.conv[data-state="archived"]').trigger("click"); await flushPromises();
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).disabled).toBe(true);
    wrapper.unmount();
  });
  it("keeps each conversation draft and mode when navigating and returning", async () => {
    mockApi.conversationPage.mockResolvedValue(page(conversations));
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1", conversationId: "c1" } });
    await flushPromises();
    await wrapper.get("textarea").setValue("第一份草稿");
    await wrapper.findAll('[role="tab"]')[0]!.trigger("click");
    await wrapper.setProps({ conversationId: "c2" }); await flushPromises();
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("");
    expect(wrapper.findAll('[role="tab"]')[2]!.attributes("aria-selected")).toBe("true");
    await wrapper.get("textarea").setValue("第二份草稿");
    await wrapper.findAll('[role="tab"]')[1]!.trigger("click");
    await wrapper.setProps({ conversationId: "c1" }); await flushPromises();
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("第一份草稿");
    expect(wrapper.findAll('[role="tab"]')[0]!.attributes("aria-selected")).toBe("true");
    await wrapper.setProps({ conversationId: "c2" }); await flushPromises();
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("第二份草稿");
    expect(wrapper.findAll('[role="tab"]')[1]!.attributes("aria-selected")).toBe("true");
    expect(mockApi.createConversationV2).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it("ignores late message and latest-run responses from another conversation", async () => {
    mockApi.conversationPage.mockResolvedValue(page(conversations));
    let finish!: (value: unknown) => void;
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1", conversationId: "c1" } });
    await flushPromises();
    mockApi.messagePage.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(page([{ id: "current", role: "user", content: "当前会话历史" }]));
    await wrapper.setProps({ conversationId: "c2" }); await flushPromises();
    await wrapper.setProps({ conversationId: "c1" }); await flushPromises();
    finish(page([{ id: "late", role: "user", content: "迟到的其他会话历史" }])); await flushPromises();
    expect(wrapper.text()).toContain("当前会话历史");
    expect(wrapper.text()).not.toContain("迟到的其他会话历史");
    expect(wrapper.get(".conv-name").text()).toBe("第一会话");
    wrapper.unmount();
  });
  it("rejects an unknown or foreign-workspace route before fetching its history or creating anything", async () => {
    mockApi.conversationPage.mockResolvedValue(page(conversations));
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1", conversationId: "foreign" } });
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("会话不存在或不属于当前工程");
    expect(mockApi.messagePage).not.toHaveBeenCalled();
    expect(mockApi.createConversationV2).not.toHaveBeenCalled();
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).disabled).toBe(true);
    await wrapper.findAll(".conv")[0]!.trigger("click"); await flushPromises();
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).disabled).toBe(false);
    wrapper.unmount();
  });
});
// end

// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
describe("late submission ownership", () => {
  it("does not send an initial draft into a conversation selected while its automatic create is pending", async () => {
    mockApi.conversationPage.mockResolvedValue({ items: [], nextCursor: null });
    mockApi.getConversationV2.mockResolvedValue({ id: "c2", workspaceId: "w1", title: "另一会话", archivedAt: null });
    let finish!: (value: unknown) => void;
    mockApi.createConversationV2.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } });
    await flushPromises();
    await wrapper.get("textarea").setValue("尚无会话的第一份需求");
    await wrapper.get("textarea").trigger("keydown", { key: "Enter" }); await flushPromises();
    await wrapper.setProps({ conversationId: "c2" }); await flushPromises();
    finish({ id: "created-late", workspaceId: "w1", title: "新对话", archivedAt: null }); await flushPromises();
    expect(startRun).not.toHaveBeenCalled();
    expect(wrapper.get(".conv-name").text()).toBe("另一会话");
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("");
    wrapper.unmount();
  });
  it.each([true, false])("does not clear or error a newer draft after navigating away and back (accepted=%s)", async accepted => {
    mockApi.conversationPage.mockResolvedValue({ items: [{ id: "c1", title: "第一会话" }, { id: "c2", title: "第二会话" }], nextCursor: null });
    let finish!: () => void;
    vi.mocked(startRun).mockImplementationOnce(() => new Promise((resolve, reject) => {
      finish = () => accepted ? resolve({ id: "old-run", status: "QUEUED", lastSeq: 1, failureCode: null, resultRevisionId: null }) : reject(new Error("旧请求的迟到失败"));
    }));
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1", conversationId: "c1" } });
    await flushPromises();
    await wrapper.get("textarea").setValue("旧草稿");
    await wrapper.get("textarea").trigger("keydown", { key: "Enter" }); await flushPromises();
    await wrapper.setProps({ conversationId: "c2" }); await flushPromises();
    await wrapper.setProps({ conversationId: "c1" }); await flushPromises();
    await wrapper.get("textarea").setValue("新编辑的草稿");
    finish(); await flushPromises();
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("新编辑的草稿");
    expect(wrapper.text()).not.toContain("旧请求的迟到失败");
    wrapper.unmount();
  });
});
// end

// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
it("updates selected archive ownership and title even while that conversation is outside the loaded bucket", async () => {
  const selected = { id: "c1", workspaceId: "w1", title: "保留选择的会话", archivedAt: null };
  mockApi.conversationPage.mockResolvedValueOnce({ items: [selected], nextCursor: null })
    .mockResolvedValue({ items: [], nextCursor: null });
  mockApi.updateConversation.mockResolvedValueOnce({ ...selected, title: "列表外的新名称" })
    .mockResolvedValueOnce({ ...selected, title: "列表外的新名称", archivedAt: "2026-10-27" })
    .mockResolvedValueOnce({ ...selected, title: "列表外的新名称" });
  const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1", conversationId: "c1" } });
  const button = (label: string) => wrapper.findAll("button").find(item => item.text() === label)!;
  await flushPromises();
  await wrapper.get("textarea").setValue("保留这份草稿");
  await button("📥 归档管理").trigger("click"); await flushPromises();
  expect(wrapper.findAll(".conv")).toHaveLength(0);
  // modified by jinlong.feng at 2026-10-28 Agent工作台迭代
  await wrapper.get(".conversation-actions summary").trigger("click");
  await wrapper.get(".conversation-actions .menu-action").trigger("click");
  // end
  await wrapper.get('[aria-label="新会话名称"]').setValue("列表外的新名称");
  await wrapper.get('form[aria-label="会话管理"]').trigger("submit"); await flushPromises();
  // modified by jinlong.feng at 2026-10-28 Agent工作台迭代
  await wrapper.get(".conversation-actions summary").trigger("click");
  // end
  await button("归档会话").trigger("click"); await flushPromises();
  expect((wrapper.get("textarea").element as HTMLTextAreaElement).disabled).toBe(true);
  expect(wrapper.text()).toContain("此会话已归档");
  expect(wrapper.get(".conv-name").text()).toBe("列表外的新名称");
  await button("返回活跃会话").trigger("click"); await flushPromises();
  expect(wrapper.findAll(".conv")).toHaveLength(0);
  // modified by jinlong.feng at 2026-10-28 Agent工作台迭代
  await wrapper.get(".conversation-actions summary").trigger("click");
  // end
  await button("恢复会话").trigger("click"); await flushPromises();
  expect((wrapper.get("textarea").element as HTMLTextAreaElement).disabled).toBe(false);
  expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("保留这份草稿");
  expect(wrapper.text()).not.toContain("此会话已归档");
  expect(mockApi.updateConversation).toHaveBeenLastCalledWith("c1", { archived: false });
  expect(mockApi.createConversationV2).not.toHaveBeenCalled();
  wrapper.unmount();
});
// end
