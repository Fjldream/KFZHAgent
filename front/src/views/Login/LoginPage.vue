<script setup>
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useLoginHandle } from '@/composables/useLoginHandle.js';
import { useSystemConfigStore } from '@/stores/systemConfigStore.js';
import { useLangStore } from '@/stores/langStore.js';
import CustomIcon from '@/components/Icons/CustomIcon.vue';
import LoadingComponent from '@/components/Loading/LoadingComponent.vue';
import ChangePasswordDialog from '@/components/ChangePasswordDialog/ChangePasswordDialog.vue';

const { t } = useI18n();

const router = useRouter();

const systemConfigStore = useSystemConfigStore();

const { userLogin } = useLoginHandle();
const langStore = useLangStore();
const { switchLang } = langStore;
const dialogVisible = ref(false);

systemConfigStore.getConfig();

const loginFormRef = useTemplateRef('loginFormRef');
const loginForm = reactive({
  username: '',
  password: '',
});
const loading = ref(false);
const loginRules = computed(() => {
  return {
    username: [{ required: true, message: t('plsInputUserName'), trigger: 'blur' }],
    password: [{ required: true, message: t('plsInputUserPassword'), trigger: 'blur' }],
  };
});

const cssVar = reactive({
  '--login-background-image': `url(${systemConfigStore.loginBackgroundImageUrl})`,
});

/**
 * 处理登录请求的函数
 */
const handleLogin = async () => {
  // 校验表单
  await loginFormRef.value.validate(async (valid) => {
    if (valid) {
      loading.value = true;
      try {
        // 获取登录信息
        const logInfo = await userLogin({ ...loginForm });
        if (logInfo.code === 0) {
          // 登录成功
          ElMessage({
            message: t('messageLoginSuccess'),
            type: 'success',
          });
          // 跳转到首页或其他页面
          await router.replace({ path: '/main' });
        }
        //首次登陆修改密码
        if (JSON.parse(logInfo.message).status === -10001) {
          dialogVisible.value = true;
        }
      } finally {
        loading.value = false;
      }
    }
  });
};
// 切换语言
const changLaguage = (lable) => {
  switchLang(lable);
};
</script>

<template>
  <div :style="cssVar" class="login-content">
    <header class="login-header">
      <div class="login-logo">
        <el-image :src="systemConfigStore.loginLogoImageUrl" alt="logo">
          <template #error>
            <el-icon>
              <IEpPicture />
            </el-icon>
          </template>
        </el-image>
      </div>
      <el-dropdown @command="changLaguage">
        <CustomIcon class="translate-icon" name="translate" />
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-for="item in langStore.laguageCommand" :key="item.value" :command="item.value">
              {{ item.label }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </header>

    <div class="login-container">
      <el-card class="login-card">
        <span class="login-title">{{ t('login.title') }}</span>
        <el-divider />
        <el-form ref="loginFormRef" :model="loginForm" :rules="loginRules">
          <el-form-item label="" prop="username">
            <el-input v-model="loginForm.username" :placeholder="t('plsInputUserName')" size="large">
              <template #prepend>
                <el-icon>
                  <IEpUserFilled />
                </el-icon>
              </template>
            </el-input>
          </el-form-item>
          <el-form-item label="" prop="password">
            <el-input
              v-model="loginForm.password"
              :placeholder="t('plsInputUserPassword')"
              size="large"
              type="password"
            >
              <template #prepend>
                <el-icon>
                  <IEpLock />
                </el-icon>
              </template>
            </el-input>
          </el-form-item>
          <el-form-item>
            <el-button size="large" style="width: 100%" type="primary" @click="handleLogin">
              {{ t('login.login') }}
            </el-button>
          </el-form-item>
        </el-form>
      </el-card>
    </div>
    <div class="login-footer">
      <div class="mb-12">{{ systemConfigStore.config.companyName }}</div>
      <div class="df">
        <div v-for="(row, index) of systemConfigStore.config.subItemList" :key="row.name" class="df footer-content">
          <el-link v-if="row.link" :href="row.link" target="_blank">
            {{ row.name }}
          </el-link>
          <div v-else>{{ row.name }}</div>
          <div v-if="index % 2 === 0" class="m-10">|</div>
        </div>
      </div>
    </div>
  </div>
  <ChangePasswordDialog
    v-if="dialogVisible"
    v-model:dialogVisible="dialogVisible"
    :is-first-login="true"
    :user-id="loginForm.username"
  />
  <LoadingComponent :loading="loading" :loading-text="t('loginText')" />
</template>

<style lang="scss" scoped>
.login-content {
  height: 100vh;
  width: 100vw;
  box-sizing: border-box;
  background: #f5f7fa var(--login-background-image) no-repeat center/cover;

  .login-header {
    width: 96%;
    margin-left: 2%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 32px;
    padding-bottom: 82px;
    .login-logo {
      width: 243px;
      height: 43px;
    }
  }

  .login-container {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    max-height: 670px;
    overflow: hidden;

    .login-card {
      width: 360px;
      padding: 15px 20px 30px 20px;
      margin-right: 20%;
      margin-top: 7%;
      border-radius: 4px;
      box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
    }

    .login-title {
      font-size: 20px;
      font-weight: 800;
    }
  }
}

.login-footer {
  font-size: small;
  color: #bfc4cc;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  bottom: 5%;
  position: absolute;

  .footer-content {
    justify-content: center;
    align-items: center;
  }

  .m-10 {
    margin: 0 4px;
  }

  .el-link {
    --el-link-text-color: #bfc4cc;
  }
}
</style>
