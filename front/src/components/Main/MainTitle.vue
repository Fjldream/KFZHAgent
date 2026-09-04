<script setup>
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useLangStore } from '@/stores/langStore.js';
import { useUserStore } from '@/stores/userStore.js';
import { useConfirm } from '@/composables/useConfirm.js';
import CustomIcon from '@/components/Icons/CustomIcon.vue';
import OemConifgDialog from '@/components/Main/OemConifgDialog.vue';

const { t } = useI18n();
const router = useRouter();
const langStore = useLangStore();
const { switchLang } = langStore;
const userStore = useUserStore();

const configDialogVisible = ref(false);
const logout = () => {
  ElMessage.success(t('logouted'));
  router.replace('/login');
};

const dropdownLaguage = ref(null);

//语言切换
const changLanguage = (label) => {
  switchLang(label);
};
//执行修改或者退出
const handleCommand = async (command) => {
  if (command === 1) {
    configDialogVisible.value = true;
  } else {
    await useConfirm(t('logoutTips'), t('tip'), 'warning');
    logout();
  }
};
</script>

<template>
  <div class="navbar">
    <div class="navbar-center"></div>

    <!-- 右侧操作区域 -->
    <div class="navbar-right">
      <!-- 翻译 -->
      <el-dropdown @command="changLanguage">
        <CustomIcon class="translate-icon" name="translate" />
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-for="item in langStore.laguageCommand" :key="item.value" :command="item.value">
              {{ item.label }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <el-divider class="vertical-divider" direction="vertical" />
      <!-- 用户名和退出按钮容器，带线框 -->
      <div class="user-logout-wrapper">
        <el-dropdown ref="dropdownLaguage" class="translation" trigger="click" @command="handleCommand">
          <div class="combining">
            <CustomIcon name="user" style="height: 29px; width: 29px" />
            <div class="username">{{ userStore.loginInfo.userName }}</div>
            <el-icon class="el-icon-right">
              <IEpArrowDown />
            </el-icon>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item :command="1">
                {{ t('systemConfig') }}
              </el-dropdown-item>
              <el-dropdown-item :command="2">
                {{ t('userLogout') }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>
  </div>
  <OemConifgDialog v-if="configDialogVisible" v-model:dialogVisible="configDialogVisible" />
</template>

<style lang="scss" scoped>
.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 62px;
  background-image: url('@/assets/image/titleBg.png');
  border-bottom: 1px solid #e4e7ed;

  .navbar-right {
    display: flex;
    align-items: center;
    gap: 15px;
  }

  .vertical-divider {
    border-color: #9ca3af;
  }

  .translation {
    cursor: pointer;
    display: flex;
    align-items: center;

    ::v-deep(.el-dropdown-menu__item) {
      padding: 5px 40px;
    }
  }

  .translate-icon {
    width: 1.5em;
    height: 1.5em;
  }

  /* 新增的线框容器 */
  .user-logout-wrapper {
    display: flex;
    align-items: center;
    border: 0px solid #d1d5db; /* 线的颜色，可按需调整 */
    border-radius: 4px;
    padding: 4px 8px;
    gap: 8px;
  }

  /* 图标加文本 */
  .combining {
    display: flex;
    align-items: center;
    gap: 6px;
    border-radius: 12px;
    padding: 0 6px;
    user-select: none;
    cursor: pointer;
  }

  /* 用户名字体 */
  .username {
    font-weight: 500;
    font-size: 14px;
    color: #1f2937; /* 灰色字体 */
  }
}
</style>
