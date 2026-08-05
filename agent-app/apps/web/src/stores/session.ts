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
  /** 会话恢复是否已完成（刷新后 /api/me 的结果已落地）。 */
  restored: boolean;
}

const state: SessionState = reactive({
  user: null,
  tenantName: "",
  loading: false,
  error: null,
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
    state.user = result.user;
    state.tenantName = input.tenant;
    localStorage.setItem(TENANT_STORAGE_KEY, input.tenant);
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
    state.user = await api.me();
    state.tenantName = localStorage.getItem(TENANT_STORAGE_KEY) ?? "";
    state.restored = true;
    return true;
  } catch {
    state.user = null;
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
    state.user = null;
    state.tenantName = "";
    state.restored = true;
    localStorage.removeItem(TENANT_STORAGE_KEY);
  }
}

function isAuthenticated(): boolean {
  return state.user !== null;
}

export function useSession() {
  return { state, login, restore, ensureRestored, logout, isAuthenticated };
}

export { isAuthenticated, ensureRestored };
