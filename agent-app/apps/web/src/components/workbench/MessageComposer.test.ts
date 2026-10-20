// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
// 输入区测试：发送门槛、IME 组字不误发、上传中阻止发送。
// end
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import MessageComposer from "./MessageComposer.vue";
import { canSubmitDraft } from "./composer-logic";
import type { ComposerAttachment, ComposerDraft } from "./workbench-types";

function attachment(over: Partial<ComposerAttachment> = {}): ComposerAttachment {
  return {
    clientId: "a",
    assetId: null,
    name: "screen.png",
    purpose: "reference",
    status: "uploading",
    progress: 40,
    error: null,
    ...over,
  };
}

function draft(over: Partial<ComposerDraft> = {}): ComposerDraft {
  return { text: "参照这张图", mode: "plan", attachments: [], ...over };
}

describe("canSubmitDraft", () => {
  it("blocks while any attachment is uploading or lacks an assetId", () => {
    expect(canSubmitDraft(draft({ attachments: [attachment()] }))).toBe(false);
    expect(canSubmitDraft(draft({ attachments: [attachment({ status: "ready", assetId: null })] }))).toBe(false);
    expect(canSubmitDraft(draft({ attachments: [attachment({ status: "ready", assetId: "asset-1" })] }))).toBe(true);
  });

  it("allows an image-only request and rejects a blank draft", () => {
    expect(canSubmitDraft(draft({
      text: "   ",
      attachments: [attachment({ status: "ready", assetId: "asset-1" })],
    }))).toBe(true);
    expect(canSubmitDraft(draft({ text: "   ", attachments: [] }))).toBe(false);
  });
});

describe("MessageComposer", () => {
  it("does not submit while the IME is composing", async () => {
    const wrapper = mount(MessageComposer);
    const input = wrapper.get('[data-testid="composer-input"]');
    await input.setValue("参照这张图做一个页面");

    await input.trigger("compositionstart");
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("submit")).toBeUndefined();

    await input.trigger("compositionend");
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("submit")).toHaveLength(1);
    wrapper.unmount();
  });

  it("keeps Shift+Enter as a newline instead of sending", async () => {
    const wrapper = mount(MessageComposer);
    const input = wrapper.get('[data-testid="composer-input"]');
    await input.setValue("第一行");
    await input.trigger("keydown", { key: "Enter", shiftKey: true });
    expect(wrapper.emitted("submit")).toBeUndefined();
    wrapper.unmount();
  });

  it("disables sending until a picked image finishes uploading", async () => {
    const wrapper = mount(MessageComposer);
    await wrapper.get('[data-testid="composer-input"]').setValue("参照这张图");

    const fileInput = wrapper.get('[data-testid="composer-file-input"]');
    Object.defineProperty(fileInput.element, "files", {
      value: [new File(["x"], "screen.png", { type: "image/png" })],
      configurable: true,
    });
    await fileInput.trigger("change");

    expect(wrapper.find('[data-testid="attachment-tray"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="composer-send"]').attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });

  it("marks the next request as queued while a run is active", () => {
    const wrapper = mount(MessageComposer, { props: { running: true } });
    expect(wrapper.text()).toContain("运行中将排队");
    wrapper.unmount();
  });
});
