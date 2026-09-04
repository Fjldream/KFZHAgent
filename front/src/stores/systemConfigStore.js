import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getSystemConfig, updateSystemConfig } from '@/api/allRequest/systemConfigAPI.js';

export const useSystemConfigStore = defineStore('systemConfig', () => {
  const config = ref({
    productName: '',
    productProductName: '',
    productInfo: '',
    companyName: '',
    subItemList: [],
  });

  const loading = ref(false);
  const error = ref(null);

  const loginBackgroundImageUrl = ref(`${import.meta.env.VITE_PROXY_DOMAIN}/oemImg/login.png`);

  const loginLogoImageUrl = ref(`${import.meta.env.VITE_PROXY_DOMAIN}/oemImg/logo.png`);

  const homeLogoImageUrl = ref(`${import.meta.env.VITE_PROXY_DOMAIN}/oemImg/leftIcon.png`);

  const mainRoutesConfig = ref(JSON.parse(import.meta.env.VITE_ROUTE_MAIN));

  /**
   * 获取系统OEM配置
   */
  const getConfig = async () => {
    loading.value = true;
    const { data } = await getSystemConfig();
    try {
      config.value = data;
    } catch (e) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  };
  /**
   * 更新系统OEM配置
   */
  const updateConfig = async () => {
    loading.value = true;
    const response = await updateSystemConfig();
    try {
      config.value = response.data;
    } catch (e) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  };

  /**
   * 上传系统OEM配置资源
   */
  const uploadAsset = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await updateSystemConfig();
    try {
      return response.data.url; //资源的url
    } catch (e) {
      error.value = e.message;
    }
  };

  return {
    config,
    loading,
    error,
    loginBackgroundImageUrl,
    loginLogoImageUrl,
    homeLogoImageUrl,
    mainRoutesConfig,
    getConfig,
    updateConfig,
    uploadAsset,
  };
});
