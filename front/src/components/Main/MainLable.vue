<script setup>
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { useMainLeftMenus } from '@/stores/mainLeftMenusStore.js';

import CustomIcon from '@/components/Icons/CustomIcon.vue';
const { t } = useI18n();
const route = useRoute();
const mainLeftMenusStore = useMainLeftMenus();

// 显示条件
const showRoutes = ['loadBalancer', 'runningNodesManager', 'maintenanceLog'];
const isShow = ref(showRoutes.includes(route.name));

// 顶部图标名和路径文本
const currentIcon = ref('');
const currentPathName = ref('');

/**
 * 查找路径数据
 */
function findMenuPath(menus, targetName) {
  for (const menu of menus) {
    if (menu.path === targetName) {
      return [menu, []];
    } else {
      if (menu.children) {
        for (const child of menu.children) {
          if (child.path === targetName) {
            return [menu, child];
          }
        }
      }
    }
  }
  return null;
}

watch(
  () => route.name,
  (routeName) => {
    isShow.value = showRoutes.includes(routeName);
    const menuPath = findMenuPath(mainLeftMenusStore.mainLeftMenus, routeName);
    if (menuPath && !(menuPath[0].icon !== 'runningNodesManager' || menuPath[0].icon !== 'loadBalancer')) {
      currentIcon.value = menuPath[0].icon || '';
      currentPathName.value = `${menuPath[0].name}`;
    } else {
      isShow.value = false;
      currentIcon.value = '';
      currentPathName.value = '';
    }
  },
  { immediate: true }, // 页面初次加载立即执行一次
);
</script>

<template>
  <div v-if="isShow" class="header-inline">
    <CustomIcon :name="currentIcon" class="icon" />
    <div class="text">{{ currentPathName }}</div>
  </div>
</template>

<style lang="scss" scoped>
.header-inline {
  display: flex;
  align-items: center;

  .icon {
    margin-right: 6px;
    font-size: 18px;
  }

  .text {
    font-size: 14px;
    color: #555;
    white-space: nowrap;
  }
}
</style>
