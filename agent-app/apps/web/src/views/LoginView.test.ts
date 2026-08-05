// @ts-nocheck -- 组件测试为 JS 风格；运行时断言由 vitest 验证。
// I2：首次登录（临时密码）登录成功后引导跳转强制改密页。
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import LoginView from "../views/LoginView.vue";

const pushMock = vi.hoisted(() => vi.fn());
const sessionState = vi.hoisted(() => ({
  user: null,
  tenantName: "",
  loading: false,
  error: null,
  mustChangePassword: false,
  restored: false,
}));
const loginMock = vi.hoisted(() => vi.fn());

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: pushMock }),
  useRoute: () => ({ query: {} }),
}));
vi.mock("../stores/session", () => ({
  useSession: () => ({
    state: sessionState,
    login: loginMock,
  }),
}));

describe("LoginView first-login redirect (I2)", () => {
  it("navigates to /change-password when the login response forces a password change", async () => {
    sessionState.mustChangePassword = true;
    loginMock.mockImplementation(async () => {
      sessionState.user = { id: "u1", username: "alice", role: "member", tenantId: "t1" };
    });
    const wrapper = mount(LoginView);
    await wrapper.get('[data-testid="login-tenant"]').setValue("Acme");
    await wrapper.get('[data-testid="login-username"]').setValue("alice");
    await wrapper.get('[data-testid="login-password"]').setValue("TempPass-123");
    await wrapper.get('[data-testid="login-form"]').trigger("submit");

    await vi.waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/change-password");
    });
  });

  it("navigates to /workspaces when the session is already activated", async () => {
    sessionState.mustChangePassword = false;
    loginMock.mockImplementation(async () => {
      sessionState.user = { id: "u1", username: "alice", role: "member", tenantId: "t1" };
    });
    const wrapper = mount(LoginView);
    await wrapper.get('[data-testid="login-tenant"]').setValue("Acme");
    await wrapper.get('[data-testid="login-username"]').setValue("alice");
    await wrapper.get('[data-testid="login-password"]').setValue("TempPass-123");
    await wrapper.get('[data-testid="login-form"]').trigger("submit");

    await vi.waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/workspaces");
    });
  });
});
