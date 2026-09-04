<script setup>
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import router from '@/router/index.js';
import { useMainLeftMenus } from '@/stores/mainLeftMenusStore.js';
import { useOpsResourceData, useUpdateOpsResourcStatus, useUpdateNodesResStatus } from '@/composables/useOpsResource';
import { delNodesServer } from '@/api/allRequest/verifyAPI.js';
import { useRefreshToken } from '@/composables/useRefreshToken.js';
import { useConfirm } from '@/composables/useConfirm';
import { useOpsResourceStore } from '@/stores/opsResourceStore.js';
import { useSystemConfigStore } from '@/stores/systemConfigStore.js';

import MainLable from '@/components/Main/MainLable.vue';
import CustomLayoutContainer from '@/components/Main/CustomLayout/CustomLayoutContainer.vue';
import MainTitle from '@/components/Main/MainTitle.vue';

const { t } = useI18n();
const opsResourceStore = useOpsResourceStore();
const { setCurrentNodeId } = opsResourceStore;
const mainLeftMenusStore = useMainLeftMenus();
const systemConfigStore = useSystemConfigStore();
const { setLeftRowSelect } = mainLeftMenusStore;
const route = useRoute();
const mainContainClass = ref('main-contain-class');
const asideWidth = ref('220px');

// 启动轮询token刷新
useRefreshToken();
//开启轮询
useUpdateOpsResourcStatus();
useUpdateNodesResStatus();

//获取节点资源数据
nextTick(async () => {
  await systemConfigStore.getConfig();
  await useOpsResourceData();
  // 登录后默认显示首个运行节点的信息
  if (mainLeftMenusStore?.mainLeftMenus?.length && mainLeftMenusStore.mainLeftMenus[0]?.children?.length) {
    const runningNodes = mainLeftMenusStore.mainLeftMenus[0].children.find((node) => {
      return node?.id && node?.nodeStatus === 'running';
    });
    menuClickHandle(runningNodes);
  }
  if (mainLeftMenusStore.leftRowSelect.id) {
    menuClickHandle(mainLeftMenusStore.leftRowSelect);
  }
});

watch(
  () => route.name,
  () => {
    nextTick(() => {
      updateHeaderVisibility();
    });
  },
  {
    immediate: true,
  },
);

const updateHeaderVisibility = () => {
  //点击节点将节点数据接入
  mainContainClass.value = 'main-contain-class';
  if (route.name === 'runningNodesManager' || route.name === 'loadBalancer') {
    mainContainClass.value += 'no-box-shadow';
  } else {
    mainContainClass.value.replace('no-box-shadow', '');
  }
};
/**
 * 处理菜单点击事件
 *
 * @param {object} row - 被点击的行数据
 */
const menuClickHandle = (row) => {
  if (row.id !== 'runningNodesManager') {
    setLeftRowSelect(row);
  }
  const nodeIdStatus = opsResourceStore.nodeResourceData.some((item) => item.nodeId === row.id);
  if (nodeIdStatus) {
    setCurrentNodeId(row.id);
  } else {
    if (row.path === 'loadBalancer') {
      setCurrentNodeId('');
    }
  }
  router.push({ name: row.path });
};
/**
 * 处理节点删除事件
 *
 * @param {object} row - 被点击的行数据
 */
const menuDeleteClickHandle = async (row) => {
  try {
    await useConfirm(`${t(`messageDeleteNode`)}`, t('messageTitle'));
    const { errorCode } = await delNodesServer({ nodeId: row.id });
    if (errorCode === 0) {
      ElMessage.success(t('messageDeleteSuccess'));
    }
  } catch (error) {}
};
</script>

<template>
  <CustomLayoutContainer
    :asideWidth="asideWidth"
    :left-menus="mainLeftMenusStore.mainLeftMenus"
    :mainContainClass="mainContainClass"
    :nodeClickKey="mainLeftMenusStore.leftRowSelect.id"
    asideClass="main-layout-left"
    class="layout-container"
    content-card-class="content-card"
    content-class="center"
    treeClass="main-custom-tree"
    @menuClick="menuClickHandle"
    @menuDeleteClick="menuDeleteClickHandle"
  >
    <template #left>
      <header class="main-header">
        <div class="header-left">
          <el-image :src="systemConfigStore.homeLogoImageUrl" alt="KingDevClient" class="header-left-img" />
        </div>
        <div class="header-right">
          <div class="header-right-top">{{ systemConfigStore.config.productName }}</div>
          <div class="header-right-bottom">
            {{
              systemConfigStore.config.productInfo === '管控一体化全组态平台'
                ? t('mainTitle')
                : systemConfigStore.config.productInfo
            }}
          </div>
        </div>
      </header>
    </template>
    <template #content-header>
      <el-header>
        <MainTitle />
      </el-header>
    </template>
    <template #main>
      <MainLable />
    </template>
  </CustomLayoutContainer>
</template>

<style lang="scss">
.layout-container {
  box-sizing: border-box;
  overflow: hidden;
  height: 100vh;

  .main-layout-left {
    height: 100vh;
    .svg-icon {
      width: 1.5rem;
      height: 1.5rem;
    }

    .el-sub-menu__title,
    .el-menu-item {
      height: calc(4vh); // 每个菜单项占屏幕高度的 3%
      line-height: calc(4vh); // 保证垂直居中
      min-height: 24px;
      max-height: 40px;
    }

    .el-menu--vertical {
      padding: 10px 0 0 0;
    }
    .main-custom-tree {
      font-size: 14px;
      color: #434343;
      background: linear-gradient(180deg, #eaf0ff 0%, #d9e5ff 100%);
      height: calc(100vh - 104px);
      overflow-y: auto;
      overflow-x: hidden;
      padding: 0 14px;
      .el-tree-node__content {
        height: 48px;
        border-radius: 6px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        .el-icon {
          order: 2;
        }
        &:hover {
          background-color: #0348dd1c !important; // 移入背景色
        }
      }
      .el-tree-node__children {
        .el-tree-node__content {
          padding-left: 35px !important;
        }
      }
      .is-current {
        & > .el-tree-node__content {
          background-color: #0348dd1a; // 选中背景色
          color: #0348dd;
        }
      }
    }
  }

  .el-header {
    padding: 0;
  }
  .header-left-img {
    width: 35px;
    height: 34px;
    margin: 2px 10px 0 0;
  }
  .header-right-top {
    font-size: 18px;
    font-weight: 700;
  }
  .header-right-bottom {
    font-size: 10px;
    font-weight: 500;
  }
  .center {
    align-items: center;
    justify-content: center;
    background: conic-gradient(
      from 63deg at 72.36% 236.62%,
      #898989 111.60000085830688deg,
      #e6f0f9 220deg,
      #f0faff 243deg,
      #f6f7ff 235deg,
      #f2f9ff 268deg,
      #ecf0f9 286deg,
      #fdf9f7 312deg,
      #fbf5f7 160deg
    );
  }
  .main-layout-left,
  .main-layout-left .el-menu-layout:not(.el-menu--collapse) {
    background: linear-gradient(180deg, #eaf0ff 0%, #d9e5ff 100%);
    border: none;
    border-radius: 5px 0 0 5px;
  }

  .main-header {
    padding: 16px 38px 29px 15px;
    border-radius: 5px;
    display: flex;
    align-items: center;
  }

  .content-card {
    width: 100%;
    height: 100%;

    .el-card__body {
      padding: 0;
    }

    .main-contain-class {
      padding: 12px;
      height: calc(100vh - 70px);
      box-shadow: var(--el-box-shadow-light);
      background: conic-gradient(
        from 63deg at 72.36% 236.63%,
        #b9b9b9 111.6deg,
        #e6f0f9 220.569849014deg,
        #f0faff 243.95997deg,
        #f6f7ff 253.6894011deg,
        #f2f9ff 268.6355495deg,
        #ecf0f9 286.60894632deg,
        #fbf5f7 360deg
      );
    }

    .no-box-shadow {
      padding: 0;
      height: calc(100vh - 70px);
      box-shadow: none;
    }
  }
}
</style>
