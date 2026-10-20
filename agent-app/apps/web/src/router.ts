import { createRouter, createWebHistory, type RouterHistory } from "vue-router";
import {
  ensureRestored,
  isAuthenticated,
  mustChangePassword,
} from "./stores/session";
import LoginView from "./views/LoginView.vue";
import ChangePasswordView from "./views/ChangePasswordView.vue";
import WorkspacesView from "./views/WorkspacesView.vue";
// modified by jinlong.feng at 2026-10-20 Agent工作台迭代：按 UI 设计稿 1:1 重做，旧视图已删除
import RunWorkbenchView from "./views/RunWorkbenchView.vue";
// end

/**
 * 路由：登录页 + 强制改密页 + 工作区。工作区与改密页受登录守卫保护。
 *
 * 守卫是异步的：页面刷新后 Cookie 会话尚未恢复，同步判定会把已登录用户
 * 误重定向到 /login。守卫先 `await ensureRestored()`（并发安全，只恢复一次），
 * 再基于真实登录态判定；未登录访问受保护页才重定向。
 *
 * I2：mustChangePassword 会话只允许停留在 /change-password；完整会话访问
 * /change-password 会被放回工作区。
 */
export function createAppRouter(history: RouterHistory = createWebHistory()) {
  const router = createRouter({
    history,
    routes: [
      { path: "/", redirect: "/workspaces" },
      { path: "/login", name: "login", component: LoginView },
      { path: "/change-password", name: "change-password", component: ChangePasswordView, meta: { requiresAuth: true } },
      { path: "/workspaces", name: "workspaces", component: WorkspacesView, meta: { requiresAuth: true } },
      // modified by jinlong.feng at 2026-10-20 Agent工作台迭代
      { path: "/workspaces/:id", redirect: (to) => `/workspaces/${String(to.params.id)}/workbench` },
      { path: "/workspaces/:id/workbench", name: "workbench", component: RunWorkbenchView, props: true, meta: { requiresAuth: true } },
      // end
      { path: "/:pathMatch(.*)*", redirect: "/workspaces" },
    ],
  });

  router.beforeEach(async (to) => {
    if (to.meta.requiresAuth !== true) return true;
    // modified by jinlong.feng at 2026-10-20 Agent工作台迭代
    // UI 预览通道：仅开发环境且显式带 preview=workbench 时跳过登录守卫，
    // 用于未接后端时评审工作台界面。生产构建中 import.meta.env.DEV 为 false，不生效。
    if (import.meta.env.DEV && to.name === "workbench" && to.query.preview === "workbench") return true;
    // end
    await ensureRestored();
    if (!isAuthenticated()) {
      return { name: "login", query: { redirect: to.fullPath } };
    }
    if (to.name !== "change-password" && mustChangePassword()) {
      return { name: "change-password" };
    }
    if (to.name === "change-password" && !mustChangePassword()) {
      return { name: "workspaces" };
    }
    return true;
  });

  return router;
}
