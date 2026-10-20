// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ComposerBar from "./ComposerBar.vue";

const mountBar = (busy = false) => mount(ComposerBar, { props: { mode: "build", busy } });

describe("ComposerBar", () => {
  it("sends on Enter and keeps Shift+Enter as a newline", async () => {
    const wrapper = mountBar();
    const textarea = wrapper.find("textarea");
    await textarea.setValue("做一个能耗页面");
    await textarea.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("send")?.[0]).toEqual(["做一个能耗页面"]);
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

  it("warns that input will queue while a run is active", () => {
    expect(mountBar(true).text()).toContain("运行中将排队");
    expect(mountBar(false).text()).not.toContain("运行中将排队");
  });
});
// end
