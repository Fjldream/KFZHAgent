// modified by jinlong.feng at 2026-10-28 Agent工作台迭代
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ConversationActions from "./ConversationActions.vue";

describe("conversation actions disclosure", () => {
  it("keeps controls hidden until requested and renames with the existing title selected", async () => {
    const wrapper = mount(ConversationActions, { props: { title: "原始会话", archived: false }, attachTo: document.body });
    expect(wrapper.find("input").exists()).toBe(false);
    expect(wrapper.find("button").exists()).toBe(false);
    await wrapper.get("summary").trigger("click");
    await wrapper.findAll("button")[0]!.trigger("click");
    await flushPromises();
    const input = wrapper.get<HTMLInputElement>("input");
    expect(input.element.value).toBe("原始会话");
    expect(document.activeElement).toBe(input.element);
    expect(input.element.selectionStart).toBe(0);
    expect(input.element.selectionEnd).toBe(4);
    await input.setValue("  新名称  ");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("rename")).toEqual([["新名称"]]);
    expect(wrapper.get("summary").attributes("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(wrapper.get("summary").element);
    wrapper.unmount();
  });

  it("validates Unicode title length and never submits an empty or oversized name", async () => {
    const wrapper = mount(ConversationActions, { props: { title: "原会话", archived: false } });
    await wrapper.get("summary").trigger("click");
    await wrapper.findAll("button")[0]!.trigger("click");
    for (const title of ["  ", "🙂".repeat(101)]) {
      await wrapper.get("input").setValue(title);
      expect(wrapper.get("button[type=submit]").attributes("disabled")).toBeDefined();
      await wrapper.get("form").trigger("submit");
      expect(wrapper.emitted("rename")).toBeUndefined();
    }
    await wrapper.get("input").setValue("🙂".repeat(100));
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("rename")?.[0]).toEqual(["🙂".repeat(100)]);
    wrapper.unmount();
  });

  it("archives or restores only when explicitly clicked", async () => {
    const wrapper = mount(ConversationActions, { props: { title: "会话", archived: false } });
    await wrapper.get("summary").trigger("click");
    expect(wrapper.emitted("archive")).toBeUndefined();
    await wrapper.findAll("button")[1]!.trigger("click");
    expect(wrapper.emitted("archive")).toEqual([[true]]);
    await wrapper.setProps({ archived: true });
    await wrapper.get("summary").trigger("click");
    expect(wrapper.findAll("button")[1]!.text()).toContain("恢复会话");
    await wrapper.findAll("button")[1]!.trigger("click");
    expect(wrapper.emitted("archive")).toEqual([[true], [false]]);
    wrapper.unmount();
  });

  it("closes on Escape, outside interaction and pending mutation, and refuses disabled actions", async () => {
    const wrapper = mount(ConversationActions, { props: { title: "会话", archived: false }, attachTo: document.body });
    await wrapper.get("summary").trigger("click");
    await wrapper.get("details").trigger("keydown", { key: "Escape" });
    expect(wrapper.find("button").exists()).toBe(false);
    await wrapper.get("summary").trigger("click");
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await flushPromises();
    expect(wrapper.find("button").exists()).toBe(false);
    await wrapper.get("summary").trigger("click");
    await wrapper.setProps({ disabled: true });
    await wrapper.get("summary").trigger("click");
    expect(wrapper.find("button").exists()).toBe(false);
    expect(wrapper.emitted("archive")).toBeUndefined();
    wrapper.unmount();
  });
});
// end
