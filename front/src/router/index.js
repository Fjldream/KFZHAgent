import { createRouter, createWebHashHistory } from 'vue-router';
import { logoutService } from '@/api/allRequest/userAPI.js';
import { useLoginHandle } from '@/composables/useLoginHandle.js';
import { useMainLeftMenus } from '@/stores/mainLeftMenusStore.js';
import { useUserStore } from '@/stores/userStore.js';
import { useLangStore } from '@/stores/langStore';

import { watchEffect } from 'vue';
const baseRoutes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login/LoginPage.vue'),
    meta: { title: 'title.login' },
  },
  {
    path: '/ssoLogin',
    name: 'ssoLogin',
    component: () => import('@/views/Login/LoginPageSSO.vue'),
    meta: { title: 'title.login' },
  },
  {
    path: '/main',
    name: 'main',
    component: () => import('@/views/Main/MainIndex.vue'),
    children: [
      {
        path: 'loadBalancer',
        name: 'loadBalancer',
        component: () => import('@/views/Main/LoadBalancerView/LoadBalancerEngineer.vue'),
        meta: { title: 'title.loadBalancer' },
      },
      {
        path: '',
        name: 'runningNodesManager',
        component: () => import('@/views/Main/RunningNodesManagerView/RunningNodesManagerEngineer.vue'),
        meta: { title: 'title.runningNodesManager' },
      },

      {
        path: 'maintenanceLog',
        name: 'maintenanceLog',
        component: () => import('@/views/Main/MaintenanceLogView/MaintenanceLog.vue'),
        meta: { title: 'title.maintenanceLog' },
      },
      {
        path: 'opsserverLog',
        name: 'opsserverLog',
        component: () => import('@/views/Main/MaintenanceLogView/opsserverLog.vue'),
        meta: { title: 'title.maintenanceLog' },
      },
    ],
  },
  {
    path: '/',
    redirect: import.meta.env.VITE_ROUTE_DEFAULT,
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes: baseRoutes,
});
router.beforeEach(async (to, from) => {
  const userStore = useUserStore();
  const mainLeftMenusStore = useMainLeftMenus();
  const { i18nReactive } = useLangStore();
  const { validUserToken } = useLoginHandle();
  // 添加标签的title
  const titleKey = to.meta.title || '运维中心';
  watchEffect(() => {
    document.title = i18nReactive(titleKey).value;
  });

  if (to.path === import.meta.env.VITE_ROUTE_DEFAULT) {
    if (userStore.loginInfo.access_token) {
      await logoutService({ token: userStore.loginInfo.access_token });
    }
    userStore.reset();
    mainLeftMenusStore.resetMenus();
    return true;
  }
  if (!userStore.loginInfo.access_token && to.path !== import.meta.env.VITE_ROUTE_DEFAULT) {
    return import.meta.env.VITE_ROUTE_DEFAULT;
  }

  if (userStore.loginInfo.access_token && !userStore.isRouteAdded) {
    const { code } = await validUserToken();
    if (code === void 0 || code !== 0) {
      return import.meta.env.VITE_ROUTE_DEFAULT;
    }
    try {
      await userStore.setRoles();
      return to.fullPath;
    } catch (e) {
      userStore.reset();
      return import.meta.env.VITE_ROUTE_DEFAULT;
    }
  }
  return true;
});

export default router;
