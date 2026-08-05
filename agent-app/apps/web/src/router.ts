import { createRouter, createWebHistory } from "vue-router";
import { isAuthenticated } from "./stores/session";
import LoginView from "./views/LoginView.vue";
import WorkspaceView from "./views/WorkspaceView.vue";

/**
 * 路由：登录页 + 工作区。工作区路由受登录守卫保护；
 * 未登录访问 /workspaces 或 /workspaces/:id 一律重定向到 /login。
 */
export function createAppRouter() {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: "/", redirect: "/workspaces" },
      { path: "/login", name: "login", component: LoginView },
      { path: "/workspaces", name: "workspaces", component: WorkspaceView, meta: { requiresAuth: true } },
      { path: "/workspaces/:id", name: "workspace", component: WorkspaceView, props: true, meta: { requiresAuth: true } },
      { path: "/:pathMatch(.*)*", redirect: "/workspaces" },
    ],
  });

  router.beforeEach((to) => {
    if (to.meta.requiresAuth === true && !isAuthenticated()) {
      return { name: "login", query: { redirect: to.fullPath } };
    }
    return true;
  });

  return router;
}
