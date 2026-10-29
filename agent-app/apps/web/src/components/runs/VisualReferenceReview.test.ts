// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { VisualReviewDisplay } from "@kf/contracts";
import VisualReferenceReview from "./VisualReferenceReview.vue";

const review: VisualReviewDisplay = {
  schemaVersion: 1, runId: "source", workspaceId: "workspace", conversationId: "conversation",
  receipt: `vref1:${"a".repeat(64)}:${"b".repeat(64)}`,
  reference: { schemaVersion: 1, analysisId: "analysis", specHash: "a".repeat(64),
    spec: { schemaVersion: 1, sourceAssetId: "asset", sourceHash: "c".repeat(64), viewport: { width: 400, height: 200 },
      regions: [
        { id: "title", parentId: null, role: "text", text: ["标题 <script>"], confidence: 0.9, box: { x: 0, y: 0, width: 1, height: 0.2 }, interactionHint: null },
        { id: "chart", parentId: null, role: "chart", text: [], confidence: 0.4, box: { x: 0, y: 0.2, width: 1, height: 0.8 }, interactionHint: null },
      ], designTokens: { background: "#fff", foreground: "#111", accent: "#123456", spacing: [8], radius: [4] },
      uncertainties: [{ regionId: "chart", question: "数据源未知" }] },
    mappings: [
      { regionId: "title", controlType: "richtext", capabilityId: "richtext", support: "supported_unverified", reason: "运行态未验证", evidenceIds: [], fallback: null },
      { regionId: "chart", controlType: null, capabilityId: null, support: "unsupported", reason: "无可用组件", evidenceIds: [], fallback: "省略" },
    ] },
};
describe("VisualReferenceReview", () => {
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  it("selects a server-read workspace name without sending a value and explicitly clears a saved selection", async () => {
    const wrapper = mount(VisualReferenceReview, { props: { review } });
    await wrapper.get('[data-testid="edit-reference"]').trigger("click");
    await wrapper.get('[aria-label="区域 title 的数据绑定"]').setValue("workspace-name");
    await wrapper.get('[data-testid="save-reference-edit"]').trigger("click");
    expect(wrapper.emitted("revise")?.[0]).toMatchObject([{ regions: [{ dataRequirement: { kind: "workspace-field", field: "name" } }] }]);
    expect(JSON.stringify(wrapper.emitted("revise"))).not.toContain('"value"');
    wrapper.unmount();
    const saved = structuredClone(review);
    Object.assign(saved.reference.spec.regions[0]!, { dataRequirement: { kind: "workspace-field", field: "name" } });
    Object.assign(saved.reference, { dataSnapshots: [{ regionId: "title", kind: "workspace-field", field: "name", value: "确认时的工作区名称" }] });
    const next = mount(VisualReferenceReview, { props: { review: saved } });
    expect(next.text()).toContain("确认时的工作区名称"); expect(next.text()).toContain("非实时");
    await next.get('[data-testid="edit-reference"]').trigger("click");
    expect(next.get('[data-testid="save-reference-edit"]').attributes("disabled")).toBeDefined();
    await next.get('[aria-label="区域 title 的数据绑定"]').setValue("");
    await next.get('[data-testid="save-reference-edit"]').trigger("click");
    expect(next.emitted("revise")?.[0]).toMatchObject([{ regions: [{ dataRequirement: null }] }]);
    next.unmount();
  });
  it("does not allow workspace-name binding on other roles or send a busy correction", async () => {
    const wrapper = mount(VisualReferenceReview, { props: { review } });
    await wrapper.get('[data-testid="edit-reference"]').trigger("click");
    await wrapper.get('[aria-label="区域 chart 的数据绑定"]').setValue("workspace-name");
    expect(wrapper.get('[data-testid="save-reference-edit"]').attributes("disabled")).toBeDefined();
    await wrapper.setProps({ disabled: true });
    expect(wrapper.get('[aria-label="区域 title 的数据绑定"]').attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });
  // end
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  it("edits an explicit click-feedback requirement separately from descriptive notes and clears it explicitly", async () => {
    const input = structuredClone(review); input.reference.spec.regions[0]!.role = "action";
    const wrapper = mount(VisualReferenceReview, { props: { review: input } });
    await wrapper.get('[data-testid="edit-reference"]').trigger("click");
    await wrapper.get('[aria-label="区域 title 的执行交互"]').setValue("click-feedback");
    expect(wrapper.get('[data-testid="save-reference-edit"]').attributes("disabled")).toBeDefined();
    await wrapper.get('[aria-label="区域 title 的反馈文字"]').setValue("  本地提示  ");
    await wrapper.get('[data-testid="save-reference-edit"]').trigger("click");
    expect(wrapper.emitted("revise")?.[0]).toMatchObject([{ regions: [{ interactionRequirement: { kind: "click-feedback", level: "info", message: "本地提示" } }] }]);
    expect(wrapper.emitted("accept")).toBeUndefined();
    wrapper.unmount();
    const saved = structuredClone(input);
    Object.assign(saved.reference.spec.regions[0]!, { interactionRequirement: { kind: "click-feedback", level: "info", message: "本地提示" } });
    const next = mount(VisualReferenceReview, { props: { review: saved } });
    expect(next.text()).toContain("点击反馈");
    await next.get('[data-testid="edit-reference"]').trigger("click");
    expect(next.get('[data-testid="save-reference-edit"]').attributes("disabled")).toBeDefined();
    await next.get('[aria-label="区域 title 的执行交互"]').setValue("");
    await next.get('[data-testid="save-reference-edit"]').trigger("click");
    expect(next.emitted("revise")?.[0]).toMatchObject([{ regions: [{ interactionRequirement: null }] }]);
    next.unmount();
  });
  it("bounds executable feedback and prevents saving a non-action region or busy correction", async () => {
    const input = structuredClone(review); input.reference.spec.regions[0]!.role = "action";
    const wrapper = mount(VisualReferenceReview, { props: { review: input } });
    await wrapper.get('[data-testid="edit-reference"]').trigger("click");
    await wrapper.get('[aria-label="区域 title 的执行交互"]').setValue("click-feedback");
    await wrapper.get('[aria-label="区域 title 的反馈文字"]').setValue("x".repeat(401));
    expect(wrapper.get('[data-testid="save-reference-edit"]').attributes("disabled")).toBeDefined();
    await wrapper.get('[aria-label="区域 title 的反馈文字"]').setValue("本地提示");
    await wrapper.get('[aria-label="区域 title 的区域类型"]').setValue("text");
    expect(wrapper.get('[data-testid="save-reference-edit"]').attributes("disabled")).toBeDefined();
    await wrapper.setProps({ disabled: true });
    expect(wrapper.get('[aria-label="区域 title 的执行交互"]').attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });
  // end
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  it("edits bounded clarification notes as plain text without accepting the old review or claiming a binding", async () => {
    const wrapper = mount(VisualReferenceReview, { props: { review } });
    await wrapper.get('[data-testid="edit-reference"]').trigger("click");
    await wrapper.get('[aria-label="区域 title 的交互说明"]').setValue("点击用途待确认 <script>");
    await wrapper.get('[aria-label="区域 title 的数据来源说明"]').setValue(" 仅用于说明，不是接口配置 ");
    expect(wrapper.get('[data-testid="accept-reference"]').attributes("disabled")).toBeDefined();
    await wrapper.get('[data-testid="save-reference-edit"]').trigger("click");
    expect(wrapper.emitted("revise")?.[0]).toEqual([{ receipt: review.receipt, analysisId: "analysis", analysisHash: "a".repeat(64),
      regions: [{ regionId: "title", role: "text", text: review.reference.spec.regions[0]!.text, box: review.reference.spec.regions[0]!.box,
        clarifications: { interaction: "点击用途待确认 <script>", dataSource: "仅用于说明，不是接口配置" } }] }]);
    expect(wrapper.findAll("script")).toHaveLength(0);
    expect(wrapper.text()).toContain("未绑定");
    wrapper.unmount();
  });
  it("clears only supplementary notes and leaves original interaction clues and unknown questions visible", async () => {
    const input = structuredClone(review); input.reference.spec.regions[0]!.clarifications = { interaction: "补充的交互说明", dataSource: "补充的数据说明" };
    input.reference.spec.regions[0]!.interactionHint = "原始点击去向未知";
    const wrapper = mount(VisualReferenceReview, { props: { review: input } });
    await wrapper.get('[data-testid="edit-reference"]').trigger("click");
    expect(wrapper.get('[data-testid="save-reference-edit"]').attributes("disabled")).toBeDefined();
    await wrapper.get('[aria-label="区域 title 的交互说明"]').setValue("");
    await wrapper.get('[aria-label="区域 title 的数据来源说明"]').setValue("");
    await wrapper.get('[data-testid="save-reference-edit"]').trigger("click");
    expect(wrapper.emitted("revise")?.[0]).toMatchObject([{ regions: [{ clarifications: { interaction: null, dataSource: null } }] }]);
    expect(wrapper.text()).toContain("原始点击去向未知"); expect(wrapper.text()).toContain("数据源未知");
    wrapper.unmount();
  });
  it("bounds notes and disables them while busy, without inventing edits when old regions lack notes", async () => {
    const wrapper = mount(VisualReferenceReview, { props: { review } });
    await wrapper.get('[data-testid="edit-reference"]').trigger("click");
    expect(wrapper.get('[data-testid="save-reference-edit"]').attributes("disabled")).toBeDefined();
    await wrapper.get('[aria-label="区域 title 的数据来源说明"]').setValue("x".repeat(1001));
    expect(wrapper.get('[data-testid="save-reference-edit"]').attributes("disabled")).toBeDefined();
    await wrapper.setProps({ disabled: true });
    expect(wrapper.get('[aria-label="区域 title 的交互说明"]').attributes("disabled")).toBeDefined();
    await wrapper.get('[data-testid="discard-reference-edit"]').trigger("click");
    expect(wrapper.emitted("revise")).toBeUndefined(); wrapper.unmount();
  });
  // end
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  it("previews explicit parent changes, excludes descendants and emits parentId only for actual changes", async () => {
    const wrapper = mount(VisualReferenceReview, { props: { review } });
    await wrapper.get('[data-testid="edit-reference"]').trigger("click");
    const parent = wrapper.get('[aria-label="区域 chart 的父区域"]');
    expect(parent.find('option[value="chart"]').exists()).toBe(false);
    await parent.setValue("title");
    expect(wrapper.get('[data-region-id="chart"]').attributes("data-parent-id")).toBe("title");
    expect(wrapper.get('[aria-label="区域 title 的父区域"]').find('option[value="chart"]').exists()).toBe(false);
    await wrapper.get('[data-testid="save-reference-edit"]').trigger("click");
    expect(wrapper.emitted("revise")?.[0]).toEqual([{ receipt: review.receipt, analysisId: "analysis", analysisHash: "a".repeat(64),
      regions: [{ regionId: "chart", role: "chart", text: [], box: review.reference.spec.regions[1]!.box, parentId: "title" }] }]);
    await parent.setValue("");
    expect(wrapper.get('[data-testid="save-reference-edit"]').attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });
  it("allows explicitly moving a child out before deleting its parent without changing the child's box", async () => {
    const input = structuredClone(review); input.reference.spec.regions[1]!.parentId = "title";
    const wrapper = mount(VisualReferenceReview, { props: { review: input } });
    await wrapper.get('[data-testid="edit-reference"]').trigger("click");
    expect(wrapper.get('[aria-label="删除区域 title"]').attributes("disabled")).toBeDefined();
    await wrapper.get('[aria-label="区域 chart 的父区域"]').setValue("");
    expect(wrapper.get('[aria-label="删除区域 title"]').attributes("disabled")).toBeUndefined();
    await wrapper.get('[aria-label="删除区域 title"]').trigger("click");
    expect(wrapper.get('[aria-label="区域 chart 的父区域"]').find('option[value="title"]').exists()).toBe(false);
    await wrapper.get('[data-testid="save-reference-edit"]').trigger("click");
    expect(wrapper.emitted("revise")?.[0]).toEqual([{ receipt: review.receipt, analysisId: "analysis", analysisHash: "a".repeat(64),
      regions: [{ regionId: "chart", role: "chart", text: [], box: input.reference.spec.regions[1]!.box, parentId: null }], removals: ["title"] }]);
    wrapper.unmount();
  });
  it("keeps unsaved additions root-only and never offers their temporary IDs as parents", async () => {
    const wrapper = mount(VisualReferenceReview, { props: { review } });
    await wrapper.get('[data-testid="edit-reference"]').trigger("click");
    await wrapper.get('[data-testid="add-reference-region"]').trigger("click");
    const temporaryId = wrapper.get('[data-new-region="true"]').attributes("data-region-id");
    expect(wrapper.get('[aria-label="区域 title 的父区域"]').find(`option[value="${temporaryId}"]`).exists()).toBe(false);
    expect(wrapper.get('[data-new-region="true"]').text()).toContain("保存后可调整层级");
    await wrapper.setProps({ disabled: true });
    expect(wrapper.get('[aria-label="区域 chart 的父区域"]').attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });
  // end
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  it("adds a preview region without supplying identity or confidence, then discards it without a request", async () => {
    const wrapper = mount(VisualReferenceReview, { props: { review } });
    await wrapper.get('[data-testid="edit-reference"]').trigger("click");
    await wrapper.get('[data-testid="add-reference-region"]').trigger("click");
    const added = wrapper.get('[data-new-region="true"]');
    await added.get("textarea").setValue("用户补充");
    expect(wrapper.text()).toContain("保存后匹配");
    await wrapper.get('[data-testid="save-reference-edit"]').trigger("click");
    expect(wrapper.emitted("revise")?.[0]).toEqual([{ receipt: review.receipt, analysisId: "analysis", analysisHash: "a".repeat(64), regions: [],
      additions: [{ role: "text", text: ["用户补充"], box: { x: 0.1, y: 0.1, width: 0.3, height: 0.2 } }] }]);
    expect(wrapper.emitted("accept")).toBeUndefined();
    await wrapper.get('[data-testid="discard-reference-edit"]').trigger("click");
    expect(wrapper.find('[data-new-region="true"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it("previews removal, supports undo and never accepts old mappings while editing", async () => {
    const wrapper = mount(VisualReferenceReview, { props: { review } });
    await wrapper.get('[data-testid="edit-reference"]').trigger("click");
    await wrapper.get('[aria-label="删除区域 chart"]').trigger("click");
    expect(wrapper.find('[aria-label="查看区域 chart"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("待删除");
    await wrapper.get('[data-testid="save-reference-edit"]').trigger("click");
    expect(wrapper.emitted("revise")?.[0]).toEqual([{ receipt: review.receipt, analysisId: "analysis", analysisHash: "a".repeat(64), regions: [], removals: ["chart"] }]);
    await wrapper.get('[aria-label="恢复区域 chart"]').trigger("click");
    expect(wrapper.find('[aria-label="查看区域 chart"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="save-reference-edit"]').attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });
  it("requires explicit descendant removal, prevents orphan restore and cannot save an empty reference", async () => {
    const input = structuredClone(review); input.reference.spec.regions[1]!.parentId = "title";
    const wrapper = mount(VisualReferenceReview, { props: { review: input } });
    await wrapper.get('[data-testid="edit-reference"]').trigger("click");
    expect(wrapper.get('[aria-label="删除区域 title"]').attributes("disabled")).toBeDefined();
    await wrapper.get('[aria-label="删除区域 chart"]').trigger("click");
    await wrapper.get('[aria-label="删除区域 title"]').trigger("click");
    expect(wrapper.get('[data-testid="save-reference-edit"]').attributes("disabled")).toBeDefined();
    expect(wrapper.get('[aria-label="恢复区域 chart"]').attributes("disabled")).toBeDefined();
    await wrapper.get('[aria-label="恢复区域 title"]').trigger("click");
    expect(wrapper.get('[data-testid="save-reference-edit"]').attributes("disabled")).toBeUndefined();
    wrapper.unmount();
  });
  it("drops unsaved additions locally and blocks structural controls while busy", async () => {
    const wrapper = mount(VisualReferenceReview, { props: { review } });
    await wrapper.get('[data-testid="edit-reference"]').trigger("click");
    await wrapper.get('[data-testid="add-reference-region"]').trigger("click");
    const temporaryId = wrapper.get('[data-new-region="true"]').attributes("data-region-id");
    await wrapper.get(`[aria-label="删除区域 ${temporaryId}"]`).trigger("click");
    expect(wrapper.find('[data-new-region="true"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="save-reference-edit"]').attributes("disabled")).toBeDefined();
    await wrapper.setProps({ disabled: true });
    expect(wrapper.get('[data-testid="add-reference-region"]').attributes("disabled")).toBeDefined();
    expect(wrapper.get('[aria-label="删除区域 chart"]').attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });
  // end
  it("bounds the UTF-8 correction request before sending a large multi-paragraph edit", async () => {
    const wrapper = mount(VisualReferenceReview, { props: { review } });
    await wrapper.get('[data-testid="edit-reference"]').trigger("click");
    await wrapper.get('[aria-label="区域 title 的识别文字"]').setValue(Array.from({ length: 20 }, () => "中".repeat(1100)).join("\n"));
    expect(wrapper.get('[data-testid="save-reference-edit"]').attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("64 KiB");
    wrapper.unmount();
  });
  it("does not invent text edits when an original OCR paragraph contains a newline", async () => {
    const input = structuredClone(review); input.reference.spec.regions[0]!.text = ["第一行\n第二行"];
    const wrapper = mount(VisualReferenceReview, { props: { review: input } });
    await wrapper.get('[data-testid="edit-reference"]').trigger("click");
    expect(wrapper.get('[data-testid="save-reference-edit"]').attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });
  it("edits text, region kind and normalized box without accepting old mappings or changing image identity", async () => {
    const wrapper = mount(VisualReferenceReview, { props: { review } });
    await wrapper.get('[data-testid="edit-reference"]').trigger("click");
    await wrapper.get('[aria-label="区域 title 的识别文字"]').setValue("修正标题");
    await wrapper.get('[aria-label="区域 title 的区域类型"]').setValue("header");
    await wrapper.get('[aria-label="区域 title 的 x"]').setValue("0.1");
    expect(wrapper.get('[data-testid="save-reference-edit"]').attributes("disabled")).toBeDefined();
    await wrapper.get('[aria-label="区域 title 的 width"]').setValue("0.8");
    expect(wrapper.get('[data-testid="accept-reference"]').attributes("disabled")).toBeDefined();
    await wrapper.get('[data-testid="save-reference-edit"]').trigger("click");
    expect(wrapper.emitted("revise")?.[0]).toEqual([{ receipt: review.receipt, analysisId: "analysis", analysisHash: "a".repeat(64),
      regions: [{ regionId: "title", role: "header", text: ["修正标题"], box: { x: 0.1, y: 0, width: 0.8, height: 0.2 } }] }]);
    expect(wrapper.emitted("accept")).toBeUndefined();
    wrapper.unmount();
  });
  it("discards unsaved corrections and never emits a revision without a change", async () => {
    const wrapper = mount(VisualReferenceReview, { props: { review } });
    await wrapper.get('[data-testid="edit-reference"]').trigger("click");
    expect(wrapper.get('[data-testid="save-reference-edit"]').attributes("disabled")).toBeDefined();
    await wrapper.get('[aria-label="区域 title 的识别文字"]').setValue("临时内容");
    await wrapper.get('[data-testid="discard-reference-edit"]').trigger("click");
    expect(wrapper.emitted("revise")).toBeUndefined();
    expect(wrapper.text()).toContain("标题 <script>");
    await wrapper.get('[data-testid="edit-reference"]').trigger("click");
    expect(wrapper.get('[aria-label="区域 title 的识别文字"]').element).toHaveProperty("value", "标题 <script>");
    wrapper.unmount();
  });
  it("requires independent choices and reasons before submitting exactly the displayed signed review", async () => {
    const wrapper = mount(VisualReferenceReview, { props: { review } });
    const confirm = wrapper.get('[data-testid="accept-reference"]');
    expect(confirm.attributes("disabled")).toBeDefined();
    expect(wrapper.findAll("script")).toHaveLength(0);
    expect(wrapper.text()).toContain("标题 <script>");
    expect(wrapper.text()).toContain("数据源未知");
    expect(wrapper.get("img").attributes("src")).toBe("/api/v2/workspaces/workspace/reference-assets/asset/image");
    await wrapper.get('[aria-label="区域 title 的处理方式"]').setValue("accept-unverified");
    await wrapper.get('[aria-label="区域 title 的确认说明"]').setValue("接受未验证的标题");
    expect(confirm.attributes("disabled")).toBeDefined();
    const unsupported = wrapper.get('[aria-label="区域 chart 的处理方式"]');
    expect(unsupported.find('option[value="accept-unverified"]').exists()).toBe(false);
    await unsupported.setValue("omit");
    await wrapper.get('[aria-label="区域 chart 的确认说明"]').setValue("本轮省略趋势图");
    await confirm.trigger("click");
    expect(wrapper.emitted("accept")?.[0]).toEqual([{
      type: "accept_visual_reference", expectedRunId: "source", analysisId: "analysis", analysisHash: "a".repeat(64), receipt: review.receipt,
      acceptedDifferences: [
        { regionId: "title", disposition: "accept-unverified", capabilityId: "richtext", reason: "接受未验证的标题" },
        { regionId: "chart", disposition: "omit", capabilityId: null, reason: "本轮省略趋势图" },
      ],
    }]);
    expect(wrapper.emitted("confirm_blueprint")).toBeUndefined();
    wrapper.unmount();
  });
  it("blocks submit while busy and keeps cancellation separate from acceptance", async () => {
    const wrapper = mount(VisualReferenceReview, { props: { review, disabled: true } });
    expect(wrapper.get('[aria-label="区域 title 的处理方式"]').attributes("disabled")).toBeDefined();
    await wrapper.get('[data-testid="accept-reference"]').trigger("click");
    expect(wrapper.emitted("accept")).toBeUndefined();
    await wrapper.setProps({ disabled: false });
    await wrapper.get('[data-testid="cancel-reference"]').trigger("click");
    expect(wrapper.emitted("cancel")).toHaveLength(1);
    expect(wrapper.emitted("accept")).toBeUndefined();
    wrapper.unmount();
  });
});
// end
