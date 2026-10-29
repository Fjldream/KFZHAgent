// modified by jinlong.feng at 2026-10-28 Agent工作台迭代
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ImageEgressSettings from "./ImageEgressSettings.vue";

const defaults = { allowed: true, admin: true, visionEnabled: true, busy: false, error: "" };
describe("image settings disclosure", () => {
  it("keeps tenant administration out of the conversation until explicitly opened", async () => {
    const wrapper = mount(ImageEgressSettings, { props: defaults });
    expect(wrapper.text()).toContain("图片设置");
    expect(wrapper.text()).toContain("已开启");
    expect(wrapper.find("section").exists()).toBe(false);
    await wrapper.get("summary").trigger("click");
    expect(wrapper.text()).toContain("每轮仍需本人同意");
    expect(wrapper.emitted("toggle")).toBeUndefined();
    await wrapper.get(".permission-button").trigger("click");
    expect(wrapper.emitted("toggle")).toEqual([[]]);
    wrapper.unmount();
  });

  it("offers no tenant mutation to a member and explains why image upload is unavailable", async () => {
    const wrapper = mount(ImageEgressSettings, { props: { ...defaults, admin: false, allowed: false } });
    await wrapper.get("summary").trigger("click");
    expect(wrapper.text()).toContain("请联系租户管理员授权图片外发");
    expect(wrapper.find(".permission-button").exists()).toBe(false);
    expect(wrapper.emitted("toggle")).toBeUndefined();
    wrapper.unmount();
  });

  it("disables mutation while loading or saving and surfaces read errors without hiding the entry", async () => {
    const wrapper = mount(ImageEgressSettings, { props: { ...defaults, allowed: null } });
    await wrapper.get("summary").trigger("click");
    expect(wrapper.get(".permission-button").attributes("disabled")).toBeDefined();
    await wrapper.setProps({ allowed: false, busy: true });
    expect(wrapper.get(".permission-button").text()).toBe("正在保存…");
    expect(wrapper.get(".permission-button").attributes("disabled")).toBeDefined();
    await wrapper.setProps({ busy: false, error: "读取权限失败", visionEnabled: false });
    expect(wrapper.get("summary").text()).toContain("读取失败");
    expect(wrapper.get('[role="alert"]').text()).toBe("读取权限失败");
    expect(wrapper.text()).toContain("服务端尚未开放视觉功能");
    wrapper.unmount();
  });

  it("closes on Escape and outside interaction without changing the policy", async () => {
    const wrapper = mount(ImageEgressSettings, { props: defaults, attachTo: document.body });
    await wrapper.get("summary").trigger("click");
    await wrapper.get("details").trigger("keydown", { key: "Escape" });
    expect(wrapper.find("section").exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.get("summary").element);
    await wrapper.get("summary").trigger("click");
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await flushPromises();
    expect(wrapper.find("section").exists()).toBe(false);
    expect(wrapper.emitted("toggle")).toBeUndefined();
    wrapper.unmount();
  });
});
// end
