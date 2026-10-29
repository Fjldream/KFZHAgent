// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ComposerBar from "./ComposerBar.vue";

const mountBar = (busy = false) => mount(ComposerBar, { props: { mode: "build", busy } });

describe("ComposerBar", () => {
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  it("keeps the outbound notice truthful when a selected image disables adding another", async () => {
    const wrapper = mount(ComposerBar, { props: { mode: "build", referenceImagesEnabled: true, attachDisabled: true } });
    expect(wrapper.get('[aria-label="上传参考图或业务素材"]').attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("参考图将发送至视觉模型");
    await wrapper.get('[aria-label="上传参考图或业务素材"]').trigger("click");
    expect(wrapper.emitted("attach")).toBeUndefined();
    wrapper.unmount();
  });
  // end
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  it("does not advertise or submit image uploads when visual capability is unavailable", async () => {
    const wrapper = mountBar();
    const attachment = wrapper.get('[aria-label="上传参考图或业务素材"]');
    expect((attachment.element as HTMLButtonElement).disabled).toBe(true);
    await attachment.trigger("click");
    expect(wrapper.emitted("attach")).toBeUndefined();
    expect(wrapper.text()).toContain("不会向模型发送图片");
  });
  // end
  it("sends on Enter and keeps Shift+Enter as a newline", async () => {
    const wrapper = mountBar();
    const textarea = wrapper.find("textarea");
    await textarea.setValue("做一个能耗页面");
    await textarea.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("send")?.[0]).toEqual(["做一个能耗页面"]);
    // 服务器确认前保留输入，避免提交失败后需求丢失。
    expect((wrapper.find("textarea").element as HTMLTextAreaElement).value).toBe("做一个能耗页面");
    await wrapper.setProps({ submitted: 1 });
    expect((wrapper.find("textarea").element as HTMLTextAreaElement).value).toBe("");

    await textarea.setValue("换行测试");
    await textarea.trigger("keydown", { key: "Enter", shiftKey: true });
    expect(wrapper.emitted("send")).toHaveLength(1);
  });

  it("keeps the send button disabled for blank input", async () => {
    const wrapper = mountBar();
    expect(wrapper.find(".btn-send").attributes("disabled")).toBeDefined();
    await wrapper.find("textarea").setValue("   ");
    expect(wrapper.find(".btn-send").attributes("disabled")).toBeDefined();
  });

  it("switches mode through the segmented control", async () => {
    const wrapper = mountBar();
    const tabs = wrapper.findAll(".seg button");
    expect(tabs[2]?.classes()).toContain("on");
    await tabs[0]?.trigger("click");
    expect(wrapper.emitted("update:mode")?.[0]).toEqual(["discuss"]);
  });

  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  it("submits a queued follow-up without clearing its draft until the server accepts it", async () => {
    const wrapper = mountBar(true);
    await wrapper.find("textarea").setValue("下一轮的需求");
    expect(wrapper.find("textarea").attributes("disabled")).toBeUndefined();
    expect(wrapper.find(".btn-send").attributes("disabled")).toBeUndefined();
    await wrapper.find("textarea").trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("send")?.[0]).toEqual(["下一轮的需求"]);
    expect(wrapper.text()).toContain("运行中将排队");
    expect((wrapper.find("textarea").element as HTMLTextAreaElement).value).toBe("下一轮的需求");
  });
  // end
  it("does not send through the keyboard while cancellation is pending", async () => {
    const wrapper = mountBar();
    await wrapper.find("textarea").setValue("不要发送");
    await wrapper.setProps({ disabled: true });
    await wrapper.find("textarea").trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("send")).toBeUndefined();
  });
});
// end
