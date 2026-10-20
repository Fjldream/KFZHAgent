// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import RunStatusCapsule from "./RunStatusCapsule.vue";

describe("RunStatusCapsule", () => {
  it("maps each run status to the wording from the UI design", () => {
    const cases = [
      ["RUNNING", "构建中"],
      ["WAITING_APPROVAL", "待确认"],
      ["SUCCEEDED", "已完成"],
      ["FAILED", "失败"],
      ["CANCELLED", "已取消"],
    ] as const;
    for (const [status, text] of cases) {
      const wrapper = mount(RunStatusCapsule, { props: { status } });
      expect(wrapper.text()).toContain(text);
    }
  });

  it("uses a pulsing dot only while busy", () => {
    const busy = mount(RunStatusCapsule, { props: { status: "RUNNING" } });
    const done = mount(RunStatusCapsule, { props: { status: "SUCCEEDED" } });
    expect(busy.attributes("data-tone")).toBe("busy");
    expect(done.attributes("data-tone")).toBe("ok");
  });
});
// end
