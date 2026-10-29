import { createRouter, createWebHashHistory } from 'vue-router';
import { logoutService } from '@/api/allRequest/userAPI.js';
import { useLoginHandle } from '@/composables/useLoginHandle.js';
import { useMainLeftMenus } from '@/stores/mainLeftMenusStore.js';
import { useUserStore } from '@/stores/userStore.js';
import { useLangStore } from '@/stores/langStore';
// modified by jinlong.feng at 2026-10-10 冗余功能构建期开关
import { REDUNDANCY_ENABLED, REDUNDANCY_ROUTE_NAMES } from '@/config/features.js';
// end modified by jinlong.feng at 2026-10-10 冗余功能构建期开关

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
      // modified by jinlong.feng at 0901 冗余功能开发
      // modified by jinlong.feng at 2026-10-10 冗余功能构建期开关
      // 关闭冗余功能时不注册这两条路由：构建期常量能被静态求值，
      // 整个条件分支与其中的动态 import 都会被移除，产物里不会留下对应分块。
      ...(REDUNDANCY_ENABLED
        ? [
            {
              path: 'redundancy',
              name: 'redundancy',
              component: () => import('@/views/Main/RedundancyView/RedundancyManagementView.vue'),
              meta: { title: 'title.redundancy' },
            },
            {
              path: 'redundancy/events',
              name: 'redundancyEvents',
              component: () => import('@/views/Main/RedundancyView/RedundancyEventsView.vue'),
              meta: { title: 'redundancy.eventRecords' },
            },
          ]
        : []),
      // end modified by jinlong.feng at 2026-10-10 冗余功能构建期开关
      // end
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

  // modified by jinlong.feng at 2026-10-10 冗余功能构建期开关
  // 关闭冗余功能时这两条路由不存在，直接手敲 hash 地址会匹配不到而白屏，
  // 因此在进入鉴权流程之前先兜底重定向回默认首页。
  if (!REDUNDANCY_ENABLED && REDUNDANCY_ROUTE_NAMES.has(to.name)) {
    return import.meta.env.VITE_ROUTE_DEFAULT;
  }
  // end modified by jinlong.feng at 2026-10-10 冗余功能构建期开关

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
