// modified by jinlong.feng at 2026-10-28 Agent工作台迭代
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { VisualReviewDisplay } from "@kf/contracts";
import VisualReferenceReview from "./VisualReferenceReview.vue";

function reference(count = 4): VisualReviewDisplay {
  return {
    schemaVersion: 1, runId: "source", workspaceId: "workspace", conversationId: "conversation",
    receipt: `vref1:${"a".repeat(64)}:${"b".repeat(64)}`,
    reference: {
      schemaVersion: 1, analysisId: "analysis", specHash: "a".repeat(64),
      spec: { schemaVersion: 1, sourceAssetId: "asset", sourceHash: "c".repeat(64), viewport: { width: 1000, height: 800 },
        regions: Array.from({ length: count }, (_, index) => ({ id: `text-${index}`, parentId: null, role: "text" as const,
          text: [`标题${index}`], confidence: 0.9, box: { x: 0, y: index / count, width: 1, height: 1 / count }, interactionHint: null })),
        designTokens: { background: "#fff", foreground: "#111", accent: "#123456", spacing: [8], radius: [4] }, uncertainties: [] },
      mappings: Array.from({ length: count }, (_, index) => ({ regionId: `text-${index}`, capabilityId: "richtext", controlType: "richtext",
        support: "supported_unverified" as const, reason: "pending-verification", evidenceIds: [], fallback: null })),
    },
  };
}
function withUnsupported(input: VisualReviewDisplay) {
  for (const id of ["table-a", "table-b"]) {
    input.reference.spec.regions.push({ id, parentId: null, role: "table", text: [id], confidence: 0.9,
      box: { x: 0, y: 0, width: 1, height: 1 }, interactionHint: null });
    input.reference.mappings.push({ regionId: id, capabilityId: null, controlType: null, support: "unsupported", reason: "无可用组件", evidenceIds: [], fallback: "静态表格建议，尚未接通" });
  }
  return input;
}

describe("visual review summary", () => {
  it("collapses 50 normal regions into one explicit batch decision, with no automatic acceptance", async () => {
    const input = reference(50);
    const wrapper = mount(VisualReferenceReview, { props: { review: input } });
    expect(wrapper.get('[data-testid="review-summary"]').text()).toContain("50");
    expect(wrapper.get('[aria-label="区域 text-0 的处理方式"]').isVisible()).toBe(false);
    expect(wrapper.get('[data-testid="accept-reference"]').attributes("disabled")).toBeDefined();
    expect(wrapper.emitted("accept")).toBeUndefined();
    await wrapper.get('[data-testid="batch-keep-supported"]').trigger("click");
    expect(wrapper.get('[data-testid="accept-reference"]').attributes("disabled")).toBeUndefined();
    expect(wrapper.emitted("accept")).toBeUndefined();
    await wrapper.get('[data-testid="accept-reference"]').trigger("click");
    const action = wrapper.emitted("accept")![0]![0] as { acceptedDifferences: Array<{ regionId: string; disposition: string; capabilityId: string; reason: string }> };
    expect(action).toMatchObject({ expectedRunId: input.runId, analysisId: "analysis", analysisHash: input.reference.specHash, receipt: input.receipt });
    expect(action.acceptedDifferences).toHaveLength(50);
    expect(new Set(action.acceptedDifferences.map(item => item.regionId)).size).toBe(50);
    expect(action.acceptedDifferences.every(item => item.disposition === "accept-unverified" && item.capabilityId === "richtext" && item.reason.length > 0)).toBe(true);
    expect(input.reference.mappings.every(item => item.support === "supported_unverified")).toBe(true);
    wrapper.unmount();
  });

  it("groups unsupported tables and requires an explicit omission without offering an unimplemented substitute", async () => {
    const input = withUnsupported(reference());
    const wrapper = mount(VisualReferenceReview, { props: { review: input } });
    await wrapper.get('[data-testid="batch-keep-supported"]').trigger("click");
    expect(wrapper.get('[data-testid="accept-reference"]').attributes("disabled")).toBeDefined();
    const group = wrapper.get('[data-review-group="unsupported:table"]');
    expect(group.text()).toContain("table-a"); expect(group.text()).toContain("table-b");
    expect(group.find('[data-action="keep-group"]').exists()).toBe(false);
    expect(group.find("select").exists()).toBe(false);
    await group.get('[data-action="omit-group"]').trigger("click");
    expect(wrapper.get('[data-testid="accept-reference"]').attributes("disabled")).toBeUndefined();
    await wrapper.get('[data-testid="accept-reference"]').trigger("click");
    const action = wrapper.emitted("accept")![0]![0] as { acceptedDifferences: Array<{ regionId: string; disposition: string; capabilityId: string | null; reason: string }> };
    expect(action.acceptedDifferences.filter(item => item.regionId.startsWith("table-"))).toEqual([
      expect.objectContaining({ regionId: "table-a", disposition: "omit", capabilityId: null }),
      expect.objectContaining({ regionId: "table-b", disposition: "omit", capabilityId: null }),
    ]);
    expect(action.acceptedDifferences.some(item => item.disposition === "substitute")).toBe(false);
    await group.get('[data-action="undo-group"]').trigger("click");
    expect(wrapper.get('[data-testid="accept-reference"]').attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });

  it("preserves custom choices and explanations during batch keep and undo", async () => {
    const wrapper = mount(VisualReferenceReview, { props: { review: reference() } });
    await wrapper.get('[data-testid="review-show-details"]').setValue(true);
    const choice = wrapper.get('[aria-label="区域 text-0 的处理方式"]');
    await choice.setValue("omit");
    await wrapper.get('[aria-label="区域 text-0 的确认说明"]').setValue("这个标题重复，明确省略");
    await wrapper.get('[data-testid="batch-keep-supported"]').trigger("click");
    expect(choice.element).toHaveProperty("value", "omit");
    expect(wrapper.get('[aria-label="区域 text-0 的确认说明"]').element).toHaveProperty("value", "这个标题重复，明确省略");
    await wrapper.get('[aria-label="区域 text-1 的确认说明"]').setValue("我自己的说明");
    await wrapper.get('[data-testid="undo-supported"]').trigger("click");
    expect(choice.element).toHaveProperty("value", "omit");
    expect(wrapper.get('[aria-label="区域 text-1 的确认说明"]').element).toHaveProperty("value", "我自己的说明");
    expect(wrapper.get('[aria-label="区域 text-2 的处理方式"]').element).toHaveProperty("value", "");
    expect(wrapper.get('[data-testid="accept-reference"]').attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });

  it("does not batch-keep charts merely because an unverified candidate exists", async () => {
    const input = reference(); input.reference.spec.regions[0]!.role = "chart";
    const wrapper = mount(VisualReferenceReview, { props: { review: input } });
    await wrapper.get('[data-testid="batch-keep-supported"]').trigger("click");
    expect(wrapper.get('[data-testid="accept-reference"]').attributes("disabled")).toBeDefined();
    await wrapper.get('[data-review-group="supported_unverified:chart"] [data-action="keep-group"]').trigger("click");
    expect(wrapper.get('[data-testid="accept-reference"]').attributes("disabled")).toBeUndefined();
    wrapper.unmount();
  });

  it("keeps all controls guarded while busy, policy-disabled, editing or when the reference image fails", async () => {
    for (const denied of [{ disabled: true }, { acceptDisabled: true }]) {
      const wrapper = mount(VisualReferenceReview, { props: { review: reference(), ...denied } });
      await wrapper.get('[data-testid="batch-keep-supported"]').trigger("click");
      expect(wrapper.get('[data-testid="accept-reference"]').attributes("disabled")).toBeDefined();
      expect(wrapper.get('[aria-label="区域 text-0 的处理方式"]').element).toHaveProperty("value", "");
      wrapper.unmount();
    }
    const wrapper = mount(VisualReferenceReview, { props: { review: reference() } });
    await wrapper.get("img").trigger("error");
    await wrapper.get('[data-testid="batch-keep-supported"]').trigger("click");
    expect(wrapper.get('[data-testid="accept-reference"]').attributes("disabled")).toBeDefined();
    wrapper.unmount();
    const editing = mount(VisualReferenceReview, { props: { review: reference() } });
    await editing.get('[data-testid="edit-reference"]').trigger("click");
    expect(editing.find('[data-testid="batch-keep-supported"]').exists()).toBe(false);
    expect(editing.get('[data-testid="accept-reference"]').attributes("disabled")).toBeDefined();
    editing.unmount();
  });

  it("clears prior batch decisions when the signed review identity changes", async () => {
    const input = reference(); const wrapper = mount(VisualReferenceReview, { props: { review: input } });
    await wrapper.get('[data-testid="batch-keep-supported"]').trigger("click");
    const next = reference(); next.receipt = `vref1:${"d".repeat(64)}:${"e".repeat(64)}`; next.reference.specHash = "d".repeat(64);
    await wrapper.setProps({ review: next });
    expect(wrapper.get('[data-testid="accept-reference"]').attributes("disabled")).toBeDefined();
    expect(wrapper.get('[aria-label="区域 text-0 的处理方式"]').element).toHaveProperty("value", "");
    expect(wrapper.emitted("accept")).toBeUndefined();
    wrapper.unmount();
  });

  it("shows frozen data values and executable feedback in the summary before batch approval", async () => {
    const input = reference();
    input.reference.spec.regions[0]!.dataRequirement = { kind: "workspace-field", field: "name" };
    input.reference.dataSnapshots = [{ regionId: "text-0", kind: "workspace-field", field: "name", value: "当前工作区名称快照" }];
    input.reference.spec.regions[1]!.role = "action";
    input.reference.spec.regions[1]!.interactionRequirement = { kind: "click-feedback", message: "已收到本地操作", level: "info" };
    const wrapper = mount(VisualReferenceReview, { props: { review: input } });
    const facts = wrapper.get('[aria-label="本轮数据与交互"]');
    expect(facts.isVisible()).toBe(true);
    expect(facts.text()).toContain("当前工作区名称快照");
    expect(facts.text()).toContain("已收到本地操作");
    expect(wrapper.get('[data-testid="accept-reference"]').attributes("disabled")).toBeDefined();
    await wrapper.get('[data-testid="batch-keep-supported"]').trigger("click");
    expect(wrapper.get('[data-testid="accept-reference"]').attributes("disabled")).toBeUndefined();
    wrapper.unmount();
  });
});
// end
