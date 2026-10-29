// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { clearConversationDrafts, ensureConversationDraftOwner } from "../conversation-drafts.js";
// end
import { reactive } from "vue";
import { api, ApiError } from "../api";
import type { SessionUser } from "../types";

/**
 * 会话 store（轻量模块级 store，无 Pinia 依赖）。
 * 登录采用 Cookie 会话（HttpOnly/Secure/SameSite）；前端只保留用户信息
 * 与租户名（租户名仅用于展示，后续请求不依赖它）。
 */

const TENANT_STORAGE_KEY = "kf.tenant";

export interface SessionState {
  user: SessionUser | null;
  tenantName: string;
  loading: boolean;
  error: string | null;
  /** 首次登录临时密码会话：必须改密后才能使用工作区（I2）。 */
  mustChangePassword: boolean;
  /** 会话恢复是否已完成（刷新后 /api/me 的结果已落地）。 */
  restored: boolean;
}

const state: SessionState = reactive({
  user: null,
  tenantName: "",
  loading: false,
  error: null,
  mustChangePassword: false,
  restored: false,
});

export interface LoginInput {
  tenant: string;
  username: string;
  password: string;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

async function login(input: LoginInput): Promise<void> {
  state.loading = true;
  state.error = null;
  try {
    const result = await api.login(input);
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    ensureConversationDraftOwner(result.user.tenantId, result.user.id);
    // end
    state.user = result.user;
    state.mustChangePassword = result.mustChangePassword;
    state.tenantName = input.tenant;
    localStorage.setItem(TENANT_STORAGE_KEY, input.tenant);
  } catch (error) {
    state.error = errorMessage(error);
    throw error;
  } finally {
    state.loading = false;
  }
}

/**
 * 首次登录强制改密（I2）：改密成功后服务端直接下发完整会话 cookie，
 * 这里同步刷新本地用户信息并清除 mustChangePassword 标志。
 */
async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  state.loading = true;
  state.error = null;
  try {
    const result = await api.changePassword(input);
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    ensureConversationDraftOwner(result.user.tenantId, result.user.id);
    // end
    state.user = result.user;
    state.mustChangePassword = false;
  } catch (error) {
    state.error = errorMessage(error);
    throw error;
  } finally {
    state.loading = false;
  }
}

/** 页面刷新后凭会话 Cookie 恢复登录态。只执行一次，成功后置 restored。 */
async function restore(): Promise<boolean> {
  if (state.user !== null) {
    state.restored = true;
    return true;
  }
  try {
    const me = await api.me();
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    ensureConversationDraftOwner(me.tenantId, me.id);
    // end
    state.user = { id: me.id, username: me.username, role: me.role, tenantId: me.tenantId };
    state.mustChangePassword = me.mustChangePassword;
    state.tenantName = localStorage.getItem(TENANT_STORAGE_KEY) ?? "";
    state.restored = true;
    return true;
  } catch {
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    clearConversationDrafts();
    // end
    state.user = null;
    state.mustChangePassword = false;
    state.restored = true;
    return false;
  }
}

let restorePromise: Promise<boolean> | null = null;

/**
 * 路由守卫专用：等待会话恢复完成（并发安全，多个导航共享同一次恢复）。
 * 返回是否已认证。刷新后同步守卫会把已登录用户误判为未登录，因此守卫
 * 必须先 await 本方法再判定。
 */
function ensureRestored(): Promise<boolean> {
  if (state.restored) return Promise.resolve(state.user !== null);
  if (restorePromise === null) {
    restorePromise = restore().finally(() => {
      restorePromise = null;
    });
  }
  return restorePromise;
}

async function logout(): Promise<void> {
  try {
    await api.logout();
  } finally {
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    clearConversationDrafts();
    // end
    state.user = null;
    state.tenantName = "";
    state.mustChangePassword = false;
    state.restored = true;
    localStorage.removeItem(TENANT_STORAGE_KEY);
  }
}

function isAuthenticated(): boolean {
  return state.user !== null;
}

function mustChangePassword(): boolean {
  return state.user !== null && state.mustChangePassword;
}

export function useSession() {
  return {
    state,
    login,
    changePassword,
    restore,
    ensureRestored,
    logout,
    isAuthenticated,
    mustChangePassword,
  };
}

export { isAuthenticated, ensureRestored, mustChangePassword };
