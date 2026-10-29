import axios from 'axios';
import { t } from '@/i18n/index.js';
import { ElMessage } from 'element-plus';
import { useUserStore } from '@/stores/userStore.js';
import router from '@/router/index.js';
import { useLangStore } from '@/stores/langStore.js';
// modified by jinlong.feng at 0901 冗余功能开发
import { createRequestErrorMessageOptions } from '@/api/requestErrorMessage.js';
// end

let isLogout = false;
let isShowingTokenExpired = false;

// 创建 Axios 实例
const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_PROXY_DOMAIN, // 可替换为 process.env.VUE_APP_BASE_API
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json;charset=UTF-8',
  },
});
// 请求拦截器
axiosInstance.interceptors.request.use(
  async (config) => {
    const userStore = useUserStore();
    const token = userStore.loginInfo.access_token;
    const { userName } = userStore.loginInfo;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      config.headers.currentLang = useLangStore().currentLang;
    }

    if (userName) {
      config.headers.userName = userName;
    }

    return config;
  },
  (error) => Promise.reject(error),
);

// 响应拦截器
axiosInstance.interceptors.response.use(
  (response) => {
    const result = response.data;
    if (!(result.errorCode === 0 || result.code === 0 || result.code === 'success')) {
      return Promise.reject(new Error(result.message || 'Request Error'));
    }
    return result;
  },
  async (error) => {
    if (error.response) {
      const { data } = error.response;
      // token过期
      if (data.code === 20001 && !isLogout) {
        if (isShowingTokenExpired) {
          return;
        }
        isLogout = true;
        isShowingTokenExpired = true;
        await ElMessageBox.alert(t('loginStatusError'), t('tip'), {
          confirmButtonText: t('define'),
          type: 'error',
        });
        await router.replace('/login');
        return;
      }
      if (data.code !== 20803) {
        ElMessage(
          createRequestErrorMessageOptions(
            `请求失败: ${data.message || data.msg || error.message || data.errorCode} `,
            error.config,
          ),
        );
      }

      isLogout = false;
      return Promise.reject(data);
    }

    if (error.code === 'ECONNABORTED') {
      ElMessage(createRequestErrorMessageOptions(`network timeout`, error.config));
      return Promise.reject({ errorCode: 'ECONNABORTED' });
    }
    ElMessage(
      createRequestErrorMessageOptions(
        error.message || 'network error',
        error.config,
      ),
    );
    return Promise.reject({ errorCode: 'network error' });
  },
);

export default axiosInstance;
