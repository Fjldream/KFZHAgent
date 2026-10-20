// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import RunPill from "./RunPill.vue";

describe("RunPill", () => {
  it("renders only while the run is active, with elapsed seconds and stop", () => {
    const busy = mount(RunPill, { props: { status: "RUNNING", elapsedSeconds: 12 } });
    expect(busy.text()).toContain("RUNNING");
    expect(busy.text()).toContain("已用时 12 秒");
    expect(busy.text()).toContain("■ 停止");

    const done = mount(RunPill, { props: { status: "SUCCEEDED" } });
    expect(done.find(".run-pill").exists()).toBe(false);
  });

  it("emits stop when the button is pressed", async () => {
    const wrapper = mount(RunPill, { props: { status: "RUNNING" } });
    await wrapper.find(".btn-stop").trigger("click");
    expect(wrapper.emitted("stop")).toHaveLength(1);
  });

  it("hides the stop button when the run is not cancelable", () => {
    const wrapper = mount(RunPill, { props: { status: "QUEUED", cancelable: false } });
    expect(wrapper.find(".btn-stop").exists()).toBe(false);
  });
});
// end
