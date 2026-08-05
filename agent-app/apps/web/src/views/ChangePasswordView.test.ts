// @ts-nocheck -- 组件测试为 JS 风格；运行时断言由 vitest 验证。
// I2：首次登录强制改密页 — 改密成功后进入工作区，本地校验两次密码一致。
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import ChangePasswordView from "./ChangePasswordView.vue";

const pushMock = vi.hoisted(() => vi.fn());
const changePasswordMock = vi.hoisted(() => vi.fn());

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: pushMock }),
}));
vi.mock("../stores/session", () => ({
  useSession: () => ({
    state: { loading: false },
    changePassword: changePasswordMock,
  }),
}));

describe("ChangePasswordView (I2)", () => {
  it("submits the new password and enters the workspace on success", async () => {
    changePasswordMock.mockResolvedValue(undefined);
    const wrapper = mount(ChangePasswordView);
    await wrapper.get('[data-testid="change-current-password"]').setValue("TempPass-123");
    await wrapper.get('[data-testid="change-new-password"]').setValue("NewPass-456");
    await wrapper.get('[data-testid="change-confirm-password"]').setValue("NewPass-456");
    await wrapper.get('[data-testid="change-password-form"]').trigger("submit.prevent");

    await vi.waitFor(() => {
      expect(changePasswordMock).toHaveBeenCalledWith({
        currentPassword: "TempPass-123",
        newPassword: "NewPass-456",
      });
      expect(pushMock).toHaveBeenCalledWith("/workspaces");
    });
  });

  it("rejects a mismatched confirmation without calling the API", async () => {
    changePasswordMock.mockClear();
    pushMock.mockClear();
    const wrapper = mount(ChangePasswordView);
    await wrapper.get('[data-testid="change-current-password"]').setValue("TempPass-123");
    await wrapper.get('[data-testid="change-new-password"]').setValue("NewPass-456");
    await wrapper.get('[data-testid="change-confirm-password"]').setValue("Different-789");
    await wrapper.get('[data-testid="change-password-form"]').trigger("submit.prevent");

    await vi.waitFor(() => {
      expect(wrapper.get('[data-testid="change-password-error"]').text()).toContain("不一致");
    });
    expect(changePasswordMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("rejects a new password shorter than 8 characters", async () => {
    changePasswordMock.mockClear();
    const wrapper = mount(ChangePasswordView);
    await wrapper.get('[data-testid="change-current-password"]').setValue("TempPass-123");
    await wrapper.get('[data-testid="change-new-password"]').setValue("short");
    await wrapper.get('[data-testid="change-confirm-password"]').setValue("short");
    await wrapper.get('[data-testid="change-password-form"]').trigger("submit.prevent");

    await vi.waitFor(() => {
      expect(wrapper.get('[data-testid="change-password-error"]').text()).toContain("至少 8 位");
    });
    expect(changePasswordMock).not.toHaveBeenCalled();
  });
});
