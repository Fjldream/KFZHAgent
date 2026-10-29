// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RunWorkbenchView from "./RunWorkbenchView.vue";
import { useSession } from "../stores/session.js";
import type { VisualReviewDisplay, VisualReviewRevision, VisualRegion } from "@kf/contracts";

const runState = vi.hoisted(() => ({ status: "WAITING_INPUT", receipt: "", runId: "" }));
vi.mock("../composables/useRunStream.js", async () => {
  const { ref } = await import("vue");
  return { useRunStream: () => ({ status: ref(runState.status), connected: ref(false), lastSeq: ref(1),
    events: ref(runState.receipt ? [{ type: "input.required", payload: { receipt: runState.receipt, question: "请确认" } }] : []),
    start: vi.fn().mockResolvedValue(undefined), stop: vi.fn(), steps: () => [] }) };
});
const receipt = `vref1:${"a".repeat(64)}:${"b".repeat(64)}`;
const reference = {
  schemaVersion: 1, analysisId: "analysis", specHash: "a".repeat(64),
  spec: { schemaVersion: 1, sourceAssetId: "00000000-0000-4000-8000-000000000001", sourceHash: "c".repeat(64), viewport: { width: 400, height: 200 },
    regions: [{ id: "title", parentId: null, role: "text", box: { x: 0, y: 0, width: 1, height: 1 }, text: ["标题"], confidence: 0.9, interactionHint: null }],
    designTokens: { background: "#fff", foreground: "#111", accent: "#123456", spacing: [8], radius: [4] }, uncertainties: [] },
  mappings: [{ regionId: "title", controlType: "richtext", capabilityId: "richtext", support: "supported_unverified", reason: "未验证", evidenceIds: [], fallback: null }],
};
const grant = { schemaVersion: 1, flags: { agentRunsV2: true, agentWorkbenchV2: true, agentVisionV1: true }, imagePolicy: "explicit-consent", outboundImagesAllowed: true };
type RequestBody = { action: { type: string; [key: string]: unknown }; [key: string]: unknown };
let posted: RequestBody[];
let revisions: VisualReviewRevision[];
let config: unknown;
let uploadFailed: boolean;
let reviewResponse: unknown;
let reviewStatus: number;
let reviewWait: Promise<void> | undefined;
const json = (value: unknown, status = 200) => new Response(value === null ? null : JSON.stringify(value), { status });
const requestUrl = (value: RequestInfo | URL): string => typeof value === "string" ? value : value instanceof URL ? value.href : value.url;

beforeEach(() => {
  sessionStorage.clear();
  useSession().state.user = null;
  posted = []; revisions = []; config = structuredClone(grant); uploadFailed = false; reviewStatus = 200; reviewWait = undefined;
  runState.runId = ""; runState.status = "WAITING_INPUT"; runState.receipt = "";
  reviewResponse = { schemaVersion: 1, runId: "source", workspaceId: "w1", conversationId: "c1", receipt, reference };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/workbench-config")) return json(config);
    if (url === "/api/workspaces/w1") return json({ id: "w1", name: "视觉测试", mode: "new", currentRevisionId: "base" });
    if ((url.startsWith("/api/workspaces/") && url.endsWith("/revisions")) || url.endsWith("/messages")) return json([]);
    if (url.includes("/messages?")) return json({ items: [], nextCursor: null });
    if (url.endsWith("/tenant/visual-egress-policy")) return json({ schemaVersion: 1, imageEgressAllowed: true });
    if (url.startsWith("/api/v2/conversations?")) return json({ items: [{ id: "c1", title: "图生工程" }, { id: "c2", title: "另一对话" }], nextCursor: null });
    if (url.includes("reference-assets?")) return uploadFailed ? json({ message: "IMAGE_INVALID" }, 422) : json({
      id: reference.spec.sourceAssetId, name: "page.png", purpose: "reference", mimeType: "image/webp", width: 400, height: 200,
    });
    if (url.endsWith("/visual-review")) { await reviewWait; return json(reviewResponse, reviewStatus); }
    if (url.endsWith("/visual-review/revisions") && init?.method === "POST") {
      const body = JSON.parse(init.body as string) as VisualReviewRevision; revisions.push(body);
      runState.receipt = `vref1:${"d".repeat(64)}:${"e".repeat(64)}`;
      // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
      const previous = (reviewResponse as VisualReviewDisplay).reference;
      const updates = new Map(body.regions.map(region => [region.regionId, region]));
      const additions = (body.additions ?? []).map((region, index) => ({ ...region,
        id: `user_${body.clientRequestId.replaceAll("-", "")}_${index + 1}`, parentId: null, confidence: 0, interactionHint: null }));
      const regions: VisualRegion[] = [...previous.spec.regions.filter(region => !body.removals?.includes(region.id)).map(region => {
        // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
        const patch = updates.get(region.id);
        if (!patch) return region;
        const updated = { ...region, role: patch.role, box: patch.box, text: patch.text,
          ...(patch.parentId !== undefined ? { parentId: patch.parentId } : {}) };
        if (patch.clarifications !== undefined) {
          if (patch.clarifications.interaction === null && patch.clarifications.dataSource === null) delete updated.clarifications;
          else updated.clarifications = patch.clarifications;
        }
        if (patch.interactionRequirement === null) delete updated.interactionRequirement;
        else if (patch.interactionRequirement !== undefined) updated.interactionRequirement = patch.interactionRequirement;
        if (patch.dataRequirement === null) delete updated.dataRequirement;
        else if (patch.dataRequirement !== undefined) updated.dataRequirement = patch.dataRequirement;
        return updated;
        // end
      }), ...additions];
      const dataSnapshots = regions.filter(region => region.dataRequirement !== undefined).map(region => ({ regionId: region.id,
        kind: "workspace-field" as const, field: "name" as const, value: "服务端确认的工作区名称" }));
      reviewResponse = { schemaVersion: 1, runId: "source", workspaceId: "w1", conversationId: "c1", receipt: runState.receipt,
        reference: { ...previous, analysisId: "analysis-edited", specHash: "d".repeat(64), spec: { ...previous.spec, regions },
          dataSnapshots: dataSnapshots.length ? dataSnapshots : undefined,
          mappings: regions.map(region => previous.mappings.find(mapping => mapping.regionId === region.id) ?? {
            regionId: region.id, controlType: "richtext", capabilityId: "richtext", support: "supported_unverified", reason: "用户补充尚未验证", evidenceIds: [], fallback: null,
          }) } };
      // end
      return json(reviewResponse);
    }
    if (url.endsWith("/runs") && init?.method === "POST") {
      const body = JSON.parse(init.body as string) as RequestBody; posted.push(body);
      runState.runId = body.action.type === "message" ? "source" : body.action.type === "accept_visual_reference" ? "blueprint" : "engineering";
      runState.status = runState.runId === "engineering" ? "SUCCEEDED" : "WAITING_INPUT";
      runState.receipt = runState.runId === "source" ? receipt : runState.runId === "blueprint" ? "blueprint-receipt" : "";
      return json(snapshot(), 202);
    }
    if (url.endsWith("/runs/latest")) return json(runState.runId ? snapshot() : null);
    if (url.startsWith("/api/runs/") && !url.includes("/usage")) return json(snapshot());
    if (url.includes("/delivery?")) return json({ artifactId: "package", revisionId: "result", buildJobId: "job", projectDelivery: { status: "downloadable", artifactId: "package" } });
    if (url.endsWith("/download-token")) return json({ artifactId: "package", token: "download-once", expiresAt: "2026-10-23T12:00:00Z" });
    return json({}, 404);
  }));
});
afterEach(() => vi.unstubAllGlobals());
function snapshot() { return { id: runState.runId, status: runState.status, lastSeq: 1, failureCode: null,
  resultRevisionId: runState.runId === "engineering" ? "result" : null, buildJobId: runState.runId === "engineering" ? "job" : null }; }
async function attach(wrapper: ReturnType<typeof mount>, files = [new File(["png"], "page.png", { type: "image/png" })]) {
  const input = wrapper.get('[data-testid="reference-file-input"]');
  Object.defineProperty(input.element, "files", { value: files, configurable: true });
  await input.trigger("change"); await flushPromises();
}
async function submitImage(wrapper: ReturnType<typeof mount>) {
  await attach(wrapper);
  await wrapper.get("textarea").setValue("根据图生成客户端工程");
  // modified by jinlong.feng at 2026-10-28 Agent工作台迭代
  expect(wrapper.get('[data-testid="reference-consent"]').element).toHaveProperty("checked", true);
  // end
  await wrapper.get(".btn-send").trigger("click"); await flushPromises();
}
// modified by jinlong.feng at 2026-10-28 Agent工作台迭代
describe("default image sending consent", () => {
  it("allows a ready reference by default, but never submits a Run merely by uploading", async () => {
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } });
    await flushPromises();
    await attach(wrapper);
    await wrapper.get("textarea").setValue("按图生成工程");
    expect(wrapper.get('[data-testid="reference-consent"]').element).toHaveProperty("checked", true);
    expect(wrapper.get(".btn-send").attributes("disabled")).toBeUndefined();
    expect(posted).toEqual([]);
    await wrapper.get(".btn-send").trigger("click"); await flushPromises();
    expect(posted[0]).toMatchObject({ visualReference: { sendingConsent: { noticeVersion: "visual-egress@1", accepted: true } } });
    wrapper.unmount();
  });

  it("waits for upload success and applies the default afresh for a replacement image", async () => {
    const previous = vi.mocked(fetch).getMockImplementation()!;
    let finishUpload!: () => void;
    const wait = new Promise<void>(resolve => { finishUpload = resolve; });
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (requestUrl(input).includes("reference-assets?")) await wait;
      return previous(input, init);
    });
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } }); await flushPromises();
    await attach(wrapper);
    expect(wrapper.get('[data-testid="reference-consent"]').element).toHaveProperty("checked", false);
    expect(wrapper.get('[data-testid="reference-consent"]').attributes("disabled")).toBeDefined();
    finishUpload(); await flushPromises();
    expect(wrapper.get('[data-testid="reference-consent"]').element).toHaveProperty("checked", true);
    await wrapper.get('[data-testid="reference-consent"]').setValue(false);
    await wrapper.get('[aria-label="移除 page.png"]').trigger("click");
    await attach(wrapper, [new File(["new"], "replacement.png", { type: "image/png" })]);
    expect(wrapper.get('[data-testid="reference-consent"]').element).toHaveProperty("checked", true);
    expect(posted).toEqual([]);
    wrapper.unmount();
  });

  it("does not let a late upload re-enable consent that was cancelled in another conversation", async () => {
    const previous = vi.mocked(fetch).getMockImplementation()!;
    let finishOld!: () => void;
    const wait = new Promise<void>(resolve => { finishOld = resolve; });
    let uploads = 0;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (requestUrl(input).includes("reference-assets?") && ++uploads === 1) await wait;
      return previous(input, init);
    });
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1", conversationId: "c1" } }); await flushPromises();
    await attach(wrapper);
    await wrapper.setProps({ conversationId: "c2" }); await flushPromises();
    await attach(wrapper, [new File(["new"], "current.png", { type: "image/png" })]);
    expect(wrapper.get('[data-testid="reference-consent"]').element).toHaveProperty("checked", true);
    await wrapper.get('[data-testid="reference-consent"]').setValue(false);
    finishOld(); await flushPromises();
    expect(wrapper.get('[data-testid="reference-consent"]').element).toHaveProperty("checked", false);
    expect(wrapper.text()).toContain("current.png");
    expect(wrapper.text()).not.toContain("page.png");
    expect(posted).toEqual([]);
    wrapper.unmount();
  });
});
// end
describe("workbench visual flow", () => {
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  it("sends only the workspace-field selection and displays the new server value before requiring fresh confirmation", async () => {
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } }); await flushPromises();
    await submitImage(wrapper);
    await wrapper.get('[aria-label="区域 title 的处理方式"]').setValue("accept-unverified");
    await wrapper.get('[aria-label="区域 title 的确认说明"]').setValue("旧选择");
    await wrapper.get('[data-testid="edit-reference"]').trigger("click");
    await wrapper.get('[aria-label="区域 title 的数据绑定"]').setValue("workspace-name");
    await wrapper.get('[data-testid="save-reference-edit"]').trigger("click"); await flushPromises();
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({ receipt, regions: [{ regionId: "title", dataRequirement: { kind: "workspace-field", field: "name" } }] });
    expect(JSON.stringify(revisions[0])).not.toContain("服务端确认的工作区名称");
    expect(wrapper.text()).toContain("本版本取值：服务端确认的工作区名称");
    expect(wrapper.get('[aria-label="区域 title 的处理方式"]').element).toHaveProperty("value", "");
    expect(wrapper.get('[data-testid="accept-reference"]').attributes("disabled")).toBeDefined();
    expect(posted).toHaveLength(1); wrapper.unmount();
  });
  // end
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  it("sends an explicit local feedback requirement through the existing revision endpoint and clears old choices", async () => {
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } }); await flushPromises();
    await submitImage(wrapper);
    await wrapper.get('[aria-label="区域 title 的处理方式"]').setValue("accept-unverified");
    await wrapper.get('[aria-label="区域 title 的确认说明"]').setValue("旧选择");
    await wrapper.get('[data-testid="edit-reference"]').trigger("click");
    await wrapper.get('[aria-label="区域 title 的区域类型"]').setValue("action");
    await wrapper.get('[aria-label="区域 title 的执行交互"]').setValue("click-feedback");
    await wrapper.get('[aria-label="区域 title 的反馈文字"]').setValue("本地操作提示");
    await wrapper.get('[data-testid="save-reference-edit"]').trigger("click"); await flushPromises();
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({ receipt, regions: [{ regionId: "title", role: "action",
      interactionRequirement: { kind: "click-feedback", level: "info", message: "本地操作提示" } }] });
    expect(wrapper.text()).toContain("执行要求：点击反馈");
    expect(wrapper.get('[aria-label="区域 title 的处理方式"]').element).toHaveProperty("value", "");
    expect(wrapper.get('[data-testid="accept-reference"]').attributes("disabled")).toBeDefined();
    expect(posted).toHaveLength(1); wrapper.unmount();
  });
  // end
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  it("posts clarification notes through the Run revision endpoint and re-requires confirmation of the new display", async () => {
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } }); await flushPromises();
    await submitImage(wrapper);
    await wrapper.get('[aria-label="区域 title 的处理方式"]').setValue("accept-unverified");
    await wrapper.get('[aria-label="区域 title 的确认说明"]').setValue("旧选择");
    await wrapper.get('[data-testid="edit-reference"]').trigger("click");
    await wrapper.get('[aria-label="区域 title 的交互说明"]').setValue("说明不代表已实现点击");
    await wrapper.get('[aria-label="区域 title 的数据来源说明"]').setValue("来源待核对");
    await wrapper.get('[data-testid="save-reference-edit"]').trigger("click"); await flushPromises();
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({ receipt, regions: [{ regionId: "title", clarifications: { interaction: "说明不代表已实现点击", dataSource: "来源待核对" } }] });
    expect(wrapper.text()).toContain("来源待核对");
    expect(wrapper.get('[aria-label="区域 title 的处理方式"]').element).toHaveProperty("value", "");
    expect(wrapper.get('[data-testid="accept-reference"]').attributes("disabled")).toBeDefined();
    expect(posted).toHaveLength(1); wrapper.unmount();
  });
  // end
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  it("posts a hierarchy correction and clears old choices against the newly displayed parent relationship", async () => {
    const child = { ...reference.spec.regions[0]!, id: "child", text: ["子区域"] };
    reviewResponse = { schemaVersion: 1, runId: "source", workspaceId: "w1", conversationId: "c1", receipt,
      reference: { ...reference, spec: { ...reference.spec, regions: [...reference.spec.regions, child] }, mappings: [
        ...reference.mappings, { ...reference.mappings[0]!, regionId: "child" },
      ] } };
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } }); await flushPromises();
    await submitImage(wrapper);
    await wrapper.get('[aria-label="区域 title 的处理方式"]').setValue("accept-unverified");
    await wrapper.get('[aria-label="区域 title 的确认说明"]').setValue("旧版本选择");
    await wrapper.get('[data-testid="edit-reference"]').trigger("click");
    await wrapper.get('[aria-label="区域 child 的父区域"]').setValue("title");
    await wrapper.get('[data-testid="save-reference-edit"]').trigger("click"); await flushPromises();
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({ receipt, regions: [{ regionId: "child", parentId: "title" }] });
    expect(wrapper.get('[data-region-id="child"]').attributes("data-parent-id")).toBe("title");
    expect(wrapper.get('[aria-label="区域 title 的处理方式"]').element).toHaveProperty("value", "");
    expect(wrapper.get('[data-testid="accept-reference"]').attributes("disabled")).toBeDefined();
    expect(posted).toHaveLength(1);
    wrapper.unmount();
  });
  // end
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  it("saves an add/remove correction through the Run endpoint and re-requires choices for the server-assigned region", async () => {
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } }); await flushPromises();
    await submitImage(wrapper);
    await wrapper.get('[data-testid="edit-reference"]').trigger("click");
    await wrapper.get('[data-testid="add-reference-region"]').trigger("click");
    await wrapper.get('[data-new-region="true"] textarea').setValue("补充标题");
    await wrapper.get('[aria-label="删除区域 title"]').trigger("click");
    await wrapper.get('[data-testid="save-reference-edit"]').trigger("click"); await flushPromises();
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({ receipt, regions: [], additions: [{ role: "text", text: ["补充标题"] }], removals: ["title"] });
    expect(posted).toHaveLength(1);
    expect(wrapper.find('[data-new-region="true"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="查看区域 title"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("补充标题");
    expect(wrapper.get('[data-testid="accept-reference"]').attributes("disabled")).toBeDefined();
    const regionId = `user_${revisions[0]!.clientRequestId.replaceAll("-", "")}_1`;
    await wrapper.get(`[aria-label="区域 ${regionId} 的处理方式"]`).setValue("accept-unverified");
    await wrapper.get(`[aria-label="区域 ${regionId} 的确认说明"]`).setValue("接受用户补充区域的未验证风险");
    await wrapper.get('[data-testid="accept-reference"]').trigger("click"); await flushPromises();
    expect(posted[1]!.action).toMatchObject({ type: "accept_visual_reference", analysisId: "analysis-edited",
      acceptedDifferences: [{ regionId, disposition: "accept-unverified" }] });
    wrapper.unmount();
  });
  // end
  it("saves corrections without creating a Run and requires fresh choices against the new displayed receipt", async () => {
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } }); await flushPromises();
    await submitImage(wrapper);
    await wrapper.get('[aria-label="区域 title 的处理方式"]').setValue("accept-unverified");
    await wrapper.get('[aria-label="区域 title 的确认说明"]').setValue("旧版本选择");
    await wrapper.get('[data-testid="edit-reference"]').trigger("click");
    await wrapper.get('[aria-label="区域 title 的识别文字"]').setValue("修改后的标题");
    await wrapper.get('[data-testid="save-reference-edit"]').trigger("click"); await flushPromises();
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({ receipt, analysisId: "analysis", regions: [{ regionId: "title", text: ["修改后的标题"] }] });
    expect(posted).toHaveLength(1);
    expect(wrapper.text()).toContain("修改后的标题");
    expect(wrapper.get('[data-testid="accept-reference"]').attributes("disabled")).toBeDefined();
    await wrapper.get('[aria-label="区域 title 的处理方式"]').setValue("accept-unverified");
    await wrapper.get('[aria-label="区域 title 的确认说明"]').setValue("接受修正结果");
    await wrapper.get('[data-testid="accept-reference"]').trigger("click"); await flushPromises();
    expect(posted[1]?.action).toMatchObject({ type: "accept_visual_reference", analysisId: "analysis-edited",
      analysisHash: "d".repeat(64), receipt: `vref1:${"d".repeat(64)}:${"e".repeat(64)}` });
    wrapper.unmount();
  });
  it("keeps unsaved correction input on a network failure and reuses the edit request identity", async () => {
    const transport = vi.mocked(fetch); const implementation = transport.getMockImplementation()!; let failed = false;
    transport.mockImplementation(async (...args: Parameters<typeof fetch>) => {
      if (requestUrl(args[0]).endsWith("/visual-review/revisions") && !failed) { failed = true; throw new Error("NETWORK_LOST"); }
      return implementation(...args);
    });
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } }); await flushPromises(); await submitImage(wrapper);
    await wrapper.get('[data-testid="edit-reference"]').trigger("click");
    await wrapper.get('[aria-label="区域 title 的识别文字"]').setValue("保留这个修改");
    await wrapper.get('[data-testid="save-reference-edit"]').trigger("click"); await flushPromises();
    expect(wrapper.get('[aria-label="区域 title 的识别文字"]').element).toHaveProperty("value", "保留这个修改");
    expect(wrapper.text()).toContain("NETWORK_LOST");
    await wrapper.get('[data-testid="save-reference-edit"]').trigger("click"); await flushPromises();
    const edits = transport.mock.calls.filter(([url]) => requestUrl(url).endsWith("/visual-review/revisions"));
    expect(edits).toHaveLength(2); expect(edits[0]?.[1]?.body).toBe(edits[1]?.[1]?.body);
    expect(revisions).toHaveLength(1); expect(posted).toHaveLength(1);
    wrapper.unmount();
  });
  it("reloads a newer displayed review on edit conflict instead of accepting stale choices", async () => {
    const transport = vi.mocked(fetch); const implementation = transport.getMockImplementation()!;
    transport.mockImplementation(async (...args: Parameters<typeof fetch>) => {
      const response = await implementation(...args);
      return requestUrl(args[0]).endsWith("/visual-review/revisions") ? json({ message: "VISUAL_REVIEW_REVISION_STALE" }, 409) : response;
    });
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } }); await flushPromises(); await submitImage(wrapper);
    await wrapper.get('[data-testid="edit-reference"]').trigger("click");
    await wrapper.get('[aria-label="区域 title 的识别文字"]').setValue("读取最新结果");
    await wrapper.get('[data-testid="save-reference-edit"]').trigger("click"); await flushPromises();
    expect(wrapper.text()).toContain("读取最新结果");
    expect(wrapper.get('[data-testid="accept-reference"]').attributes("disabled")).toBeDefined();
    expect(wrapper.find('[data-testid="save-reference-edit"]').exists()).toBe(false);
    expect(posted).toHaveLength(1);
    wrapper.unmount();
  });
  it("ignores a late saved edit after navigating to another conversation", async () => {
    const transport = vi.mocked(fetch); const implementation = transport.getMockImplementation()!;
    let release!: () => void; const waiting = new Promise<void>(resolve => { release = resolve; });
    transport.mockImplementation(async (...args: Parameters<typeof fetch>) => {
      if (requestUrl(args[0]).endsWith("/visual-review/revisions")) { await waiting; return json({ schemaVersion: 1,
        runId: "source", workspaceId: "w1", conversationId: "c1", receipt: `vref1:${"d".repeat(64)}:${"e".repeat(64)}`, reference }); }
      return implementation(...args);
    });
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1", conversationId: "c1" } }); await flushPromises(); await submitImage(wrapper);
    await wrapper.get('[data-testid="edit-reference"]').trigger("click");
    await wrapper.get('[aria-label="区域 title 的识别文字"]').setValue("旧会话内容");
    await wrapper.get('[data-testid="save-reference-edit"]').trigger("click"); await flushPromises();
    runState.runId = "";
    await wrapper.setProps({ conversationId: "c2" }); await flushPromises(); release(); await flushPromises();
    expect(wrapper.find('[data-testid="accept-reference"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain("旧会话内容");
    expect(posted).toHaveLength(1);
    wrapper.unmount();
  });
  it("refreshes the event receipt when another tab changes the review before acceptance", async () => {
    const transport = vi.mocked(fetch); const implementation = transport.getMockImplementation()!;
    transport.mockImplementation(async (...args: Parameters<typeof fetch>) => {
      const init = args[1];
      if (requestUrl(args[0]).endsWith("/runs") && init?.method === "POST"
        && (JSON.parse(init.body as string) as RequestBody).action.type === "accept_visual_reference") {
        runState.receipt = `vref1:${"d".repeat(64)}:${"e".repeat(64)}`;
        reviewResponse = { schemaVersion: 1, runId: "source", workspaceId: "w1", conversationId: "c1", receipt: runState.receipt,
          reference: { ...reference, analysisId: "analysis-edited", specHash: "d".repeat(64), spec: { ...reference.spec,
            regions: [{ ...reference.spec.regions[0], text: ["另一标签页的新结果"] }] } } };
        return json({ message: "VISUAL_REVIEW_RECEIPT_MISMATCH" }, 409);
      }
      return implementation(...args);
    });
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } }); await flushPromises(); await submitImage(wrapper);
    await wrapper.get('[aria-label="区域 title 的处理方式"]').setValue("accept-unverified");
    await wrapper.get('[aria-label="区域 title 的确认说明"]').setValue("旧选择");
    await wrapper.get('[data-testid="accept-reference"]').trigger("click"); await flushPromises();
    expect(wrapper.text()).toContain("另一标签页的新结果");
    expect(wrapper.get('[data-testid="accept-reference"]').attributes("disabled")).toBeDefined();
    expect(posted).toHaveLength(1);
    wrapper.unmount();
  });
  it("requires image egress consent, confirms differences before blueprint, then offers the bound client package", async () => {
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } }); await flushPromises();
    await attach(wrapper);
    await wrapper.get("textarea").setValue("根据图生成客户端工程");
    // modified by jinlong.feng at 2026-10-28 Agent工作台迭代
    expect(wrapper.get('[data-testid="reference-consent"]').element).toHaveProperty("checked", true);
    expect(wrapper.get(".btn-send").attributes("disabled")).toBeUndefined();
    await wrapper.get('[data-testid="reference-consent"]').setValue(false);
    // end
    expect(wrapper.get(".btn-send").attributes("disabled")).toBeDefined();
    await wrapper.get("textarea").trigger("keydown", { key: "Enter" });
    expect(posted).toHaveLength(0);
    await wrapper.get('[data-testid="reference-consent"]').setValue(true);
    await wrapper.get(".btn-send").trigger("click"); await flushPromises();
    expect(posted[0]).toMatchObject({ mode: "build", action: { type: "message", text: "根据图生成客户端工程" },
      attachmentIds: [reference.spec.sourceAssetId], visualReference: { primaryAssetId: reference.spec.sourceAssetId,
        sendingConsent: { noticeVersion: "visual-egress@1", accepted: true } } });
    expect(wrapper.text()).not.toContain("确认蓝图并生成工程");
    expect(wrapper.get('[data-testid="accept-reference"]').attributes("disabled")).toBeDefined();
    await wrapper.get('[aria-label="区域 title 的处理方式"]').setValue("accept-unverified");
    await wrapper.get('[aria-label="区域 title 的确认说明"]').setValue("接受标题未验证风险");
    await wrapper.get('[data-testid="accept-reference"]').trigger("click"); await flushPromises();
    expect(posted[1]?.action).toEqual({ type: "accept_visual_reference", expectedRunId: "source", analysisId: "analysis", analysisHash: "a".repeat(64), receipt,
      acceptedDifferences: [{ regionId: "title", disposition: "accept-unverified", capabilityId: "richtext", reason: "接受标题未验证风险" }] });
    const confirm = wrapper.findAll("button").find(button => button.text() === "确认蓝图并生成工程");
    expect(confirm).toBeDefined(); await confirm!.trigger("click"); await flushPromises();
    expect(posted[2]?.action).toEqual({ type: "confirm_blueprint", expectedRunId: "blueprint", receipt: "blueprint-receipt" });
    expect(wrapper.text()).toContain("下载工程包");
    wrapper.unmount();
  });
  it.each([
    { ...grant, flags: { ...grant.flags, agentVisionV1: false } },
    { ...grant, imagePolicy: "disabled" },
    { ...grant, outboundImagesAllowed: false },
  ])("does not upload or advertise image generation without all server gates: %j", async denied => {
    config = denied;
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } }); await flushPromises();
    expect(wrapper.get('[aria-label="上传参考图或业务素材"]').attributes("disabled")).toBeDefined();
    if (wrapper.find('[data-testid="reference-file-input"]').exists()) await attach(wrapper);
    expect(vi.mocked(fetch).mock.calls.some(([url]) => requestUrl(url).includes("reference-assets?"))).toBe(false);
    wrapper.unmount();
  });
  it("does not silently send text when a reference upload fails", async () => {
    uploadFailed = true;
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } }); await flushPromises();
    await attach(wrapper); await wrapper.get("textarea").setValue("图片要求");
    await wrapper.get("textarea").trigger("keydown", { key: "Enter" }); await flushPromises();
    expect(posted).toHaveLength(0);
    expect(wrapper.text()).toContain("IMAGE_INVALID");
    expect(wrapper.text()).toContain("page.png");
    wrapper.unmount();
  });
  it("rejects multiple or non-image files before uploading anything", async () => {
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } }); await flushPromises();
    await attach(wrapper, [new File(["one"], "one.png", { type: "image/png" }), new File(["two"], "two.png", { type: "image/png" })]);
    await attach(wrapper, [new File(["html"], "page.svg", { type: "image/svg+xml" })]);
    expect(vi.mocked(fetch).mock.calls.some(([url]) => requestUrl(url).includes("reference-assets?"))).toBe(false);
    expect(wrapper.text()).toContain("请选择单张");
    wrapper.unmount();
  });
  it("does not offer confirmation for another scope or a mismatched receipt", async () => {
    reviewResponse = { ...(reviewResponse as object), runId: "other-run", receipt: `vref1:${"d".repeat(64)}:${"e".repeat(64)}` };
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } }); await flushPromises();
    await submitImage(wrapper);
    expect(wrapper.find('[data-testid="accept-reference"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain("确认蓝图并生成工程");
    expect(wrapper.text()).toContain("VISUAL_REVIEW_IDENTITY_MISMATCH");
    wrapper.unmount();
  });
  it("retries an ambiguous image submission with the same request identity and consent instead of duplicating the Run", async () => {
    const transport = vi.mocked(fetch); const realTransport = transport.getMockImplementation()!;
    let failed = false;
    transport.mockImplementation(async (...args: Parameters<typeof fetch>) => {
      if (requestUrl(args[0]).endsWith("/runs") && args[1]?.method === "POST" && !failed) { failed = true; throw new Error("NETWORK_LOST"); }
      return realTransport(...args);
    });
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } }); await flushPromises();
    await submitImage(wrapper);
    expect(wrapper.get('[data-testid="reference-consent"]').element).toHaveProperty("checked", true);
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("根据图生成客户端工程");
    await wrapper.get(".btn-send").trigger("click"); await flushPromises();
    const submissions = transport.mock.calls.filter(([url, init]) => requestUrl(url).endsWith("/runs") && init?.method === "POST");
    expect(submissions).toHaveLength(2);
    expect(submissions[0]?.[1]?.body).toBe(submissions[1]?.[1]?.body);
    expect(wrapper.find('[data-testid="reference-consent"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it("preserves the first image draft if automatic conversation creation succeeds but submitting the Run fails", async () => {
    const transport = vi.mocked(fetch); const realTransport = transport.getMockImplementation()!;
    transport.mockImplementation(async (...args: Parameters<typeof fetch>) => {
      const url = requestUrl(args[0]);
      if (url.startsWith("/api/v2/conversations?")) return json({ items: [], nextCursor: null });
      if (url === "/api/v2/conversations" && args[1]?.method === "POST") return json({ id: "c-created", title: "新对话" });
      if (url.endsWith("/runs") && args[1]?.method === "POST") throw new Error("NETWORK_LOST");
      return realTransport(...args);
    });
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } }); await flushPromises();
    await submitImage(wrapper);
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("根据图生成客户端工程");
    expect(wrapper.get('[data-testid="reference-consent"]').element).toHaveProperty("checked", true);
    expect(wrapper.text()).toContain("page.png");
    wrapper.unmount();
  });
  it("never treats a refused image review as ordinary blueprint confirmation", async () => {
    reviewStatus = 409; reviewResponse = { message: "VISUAL_REVIEW_UNAVAILABLE" };
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } }); await flushPromises();
    await submitImage(wrapper);
    expect(wrapper.text()).not.toContain("确认蓝图并生成工程");
    expect(wrapper.find('[data-testid="accept-reference"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("识别确认暂不可用");
    expect(posted).toHaveLength(1);
    wrapper.unmount();
  });
  it("discards late reviews and clears image consent on conversation navigation", async () => {
    let release!: () => void; reviewWait = new Promise<void>(resolve => { release = resolve; });
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1", conversationId: "c1" } }); await flushPromises();
    await submitImage(wrapper);
    runState.runId = "";
    await wrapper.setProps({ conversationId: "c2" }); await flushPromises();
    release(); await flushPromises();
    expect(wrapper.find('[data-testid="accept-reference"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="reference-consent"]').exists()).toBe(false);
    expect(posted).toHaveLength(1);
    wrapper.unmount();
  });
});
// end

// end

// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
describe("tenant image egress authorization", () => {
  it("only an authenticated tenant admin explicitly toggles egress; reading and uploading do not authorize sending", async () => {
    useSession().state.user = { id: "admin", username: "admin", tenantId: "tenant", role: "tenant_admin" };
    config = { ...grant, outboundImagesAllowed: false };
    let allowed = false;
    const changes: boolean[] = [];
    const previous = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (requestUrl(input).endsWith("/tenant/visual-egress-policy")) {
        if (init?.method === "PATCH") { allowed = (JSON.parse(init.body as string) as { imageEgressAllowed: boolean }).imageEgressAllowed; changes.push(allowed); config = { ...grant, outboundImagesAllowed: allowed }; }
        return json({ schemaVersion: 1, imageEgressAllowed: allowed, coverage: "reference-images-and-derived-structure" });
      }
      return previous(input, init);
    });
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } });
    await flushPromises();
    expect(changes).toEqual([]);
    // modified by jinlong.feng at 2026-10-28 Agent工作台迭代
    expect(wrapper.find('[aria-label="租户图片外发授权"]').exists()).toBe(false);
    await wrapper.get(".image-settings summary").trigger("click");
    expect(changes).toEqual([]);
    // end
    expect(wrapper.text()).toContain("开启后允许参考图及识别结构发送至配置的视觉模型");
    const enable = wrapper.findAll("button").find(item => item.text() === "授权租户图片外发")!;
    await enable.trigger("click"); await flushPromises();
    expect(changes).toEqual([true]);
    expect((wrapper.get('[aria-label="上传参考图或业务素材"]').element as HTMLButtonElement).disabled).toBe(false);
    const input = wrapper.get('[data-testid="reference-file-input"]');
    Object.defineProperty(input.element, "files", { value: [new File(["image"], "page.png", { type: "image/png" })] });
    await input.trigger("change"); await flushPromises();
    // modified by jinlong.feng at 2026-10-28 Agent工作台迭代
    expect(wrapper.get('[data-testid="reference-consent"]').element).toHaveProperty("checked", true);
    await wrapper.get('[data-testid="reference-consent"]').setValue(false);
    // end
    await wrapper.get("textarea").setValue("请按图生成");
    expect((wrapper.get(".btn-send").element as HTMLButtonElement).disabled).toBe(true);
    await wrapper.findAll("button").find(item => item.text() === "关闭租户图片外发")!.trigger("click"); await flushPromises();
    expect(changes).toEqual([true, false]);
    expect(posted).toEqual([]);
    wrapper.unmount();
  });
  it("tells a non-admin when tenant authorization is missing, without offering a mutation", async () => {
    const previous = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation((input, init) => requestUrl(input).endsWith("/tenant/visual-egress-policy")
      ? Promise.resolve(json({ schemaVersion: 1, imageEgressAllowed: false })) : previous(input, init));
    const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1" } });
    await flushPromises();
    // modified by jinlong.feng at 2026-10-28 Agent工作台迭代
    await wrapper.get(".image-settings summary").trigger("click");
    // end
    expect(wrapper.text()).toContain("请联系租户管理员授权图片外发");
    expect(wrapper.findAll("button").some(item => item.text() === "授权租户图片外发")).toBe(false);
    wrapper.unmount();
  });
});
// end

// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
it("preserves image intent while discarding cross-conversation attachments and consent", async () => {
  const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1", conversationId: "c1" } });
  await flushPromises();
  await wrapper.get("textarea").setValue("这份草稿需要参考图");
  const input = wrapper.get('[data-testid="reference-file-input"]');
  Object.defineProperty(input.element, "files", { value: [new File(["image"], "page.png", { type: "image/png" })] });
  await input.trigger("change"); await flushPromises();
  await wrapper.get('[data-testid="reference-consent"]').setValue(true);
  await wrapper.setProps({ conversationId: "c2" }); await flushPromises();
  expect(wrapper.find('[data-testid="reference-consent"]').exists()).toBe(false);
  expect(wrapper.text()).not.toContain("尚未发送的参考图要求");
  await wrapper.setProps({ conversationId: "c1" }); await flushPromises();
  expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("这份草稿需要参考图");
  expect(wrapper.text()).toContain("尚未发送的参考图要求");
  expect((wrapper.get(".btn-send").element as HTMLButtonElement).disabled).toBe(true);
  expect(wrapper.find('[data-testid="reference-consent"]').exists()).toBe(false);
  await wrapper.findAll("button").find(item => item.text() === "移除图片要求，仅保留文字")!.trigger("click");
  expect((wrapper.get(".btn-send").element as HTMLButtonElement).disabled).toBe(false);
  expect(posted).toEqual([]);
  wrapper.unmount();
});
// end

// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
it("keeps a recreated identical text/mode draft and its new image intent after an older send is accepted", async () => {
  let acceptOldSend!: () => void;
  const oldAcceptance = new Promise<void>(resolve => { acceptOldSend = resolve; });
  const previous = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    if (requestUrl(input).endsWith("/runs") && init?.method === "POST") {
      await oldAcceptance;
      return json({ id: "older-accepted-run", status: "QUEUED", lastSeq: 1, failureCode: null, resultRevisionId: null }, 202);
    }
    return previous(input, init);
  });
  const wrapper = mount(RunWorkbenchView, { props: { workspaceId: "w1", conversationId: "c1" } });
  await flushPromises();
  await wrapper.get("textarea").setValue("相同的需求文字");
  await wrapper.get(".btn-send").trigger("click"); await flushPromises();
  await wrapper.setProps({ conversationId: "c2" }); await flushPromises();
  await wrapper.setProps({ conversationId: "c1" }); await flushPromises();
  // Recreate the same text and mode; value equality must not identify this as the old submission's draft.
  await wrapper.get("textarea").setValue("");
  await wrapper.get("textarea").setValue("相同的需求文字");
  await attach(wrapper);
  // modified by jinlong.feng at 2026-10-28 Agent工作台迭代
  expect(wrapper.get('[data-testid="reference-consent"]').element).toHaveProperty("checked", true);
  await wrapper.get('[data-testid="reference-consent"]').setValue(false);
  // end
  acceptOldSend(); await flushPromises();
  expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("相同的需求文字");
  expect(wrapper.text()).toContain("page.png");
  expect((wrapper.get(".btn-send").element as HTMLButtonElement).disabled).toBe(true);
  await wrapper.setProps({ conversationId: "c2" }); await flushPromises();
  await wrapper.setProps({ conversationId: "c1" }); await flushPromises();
  expect(wrapper.text()).toContain("尚未发送的参考图要求");
  expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("相同的需求文字");
  expect((wrapper.get(".btn-send").element as HTMLButtonElement).disabled).toBe(true);
  wrapper.unmount();
});
// end
