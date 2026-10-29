// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import RunPill from "./RunPill.vue";

describe("RunPill", () => {
  it("keeps cancellation pending visible and prevents repeated stop requests", () => {
    const wrapper = mount(RunPill, { props: { status: "CANCEL_REQUESTED" } });
    expect(wrapper.text()).toContain("正在停止");
    expect(wrapper.find(".btn-stop").attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });
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

  it("disables the stop button when server cancellation is unavailable", () => {
    const wrapper = mount(RunPill, { props: { status: "QUEUED", cancelable: false } });
    expect(wrapper.find(".btn-stop").attributes("disabled")).toBeDefined();
  });
});
// end
