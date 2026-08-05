import { createRouter, createWebHistory, type RouterHistory } from "vue-router";
import { ensureRestored, isAuthenticated } from "./stores/session";
import LoginView from "./views/LoginView.vue";
import WorkspaceView from "./views/WorkspaceView.vue";

/**
 * 路由：登录页 + 工作区。工作区路由受登录守卫保护。
 *
 * 守卫是异步的：页面刷新后 Cookie 会话尚未恢复，同步判定会把已登录用户
 * 误重定向到 /login。守卫先 `await ensureRestored()`（并发安全，只恢复一次），
 * 再基于真实登录态判定；未登录访问 /workspaces 或 /workspaces/:id 才重定向。
 */
export function createAppRouter(history: RouterHistory = createWebHistory()) {
  const router = createRouter({
    history,
    routes: [
      { path: "/", redirect: "/workspaces" },
      { path: "/login", name: "login", component: LoginView },
      { path: "/workspaces", name: "workspaces", component: WorkspaceView, meta: { requiresAuth: true } },
      { path: "/workspaces/:id", name: "workspace", component: WorkspaceView, props: true, meta: { requiresAuth: true } },
      { path: "/:pathMatch(.*)*", redirect: "/workspaces" },
    ],
  });

  router.beforeEach(async (to) => {
    if (to.meta.requiresAuth !== true) return true;
    await ensureRestored();
    if (!isAuthenticated()) {
      return { name: "login", query: { redirect: to.fullPath } };
    }
    return true;
  });

  return router;
}
