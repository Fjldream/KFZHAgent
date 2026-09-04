<script setup>
import { useI18n } from 'vue-i18n';
import { loginSSOServer } from '@/api/allRequest/userAPI';
import router from '@/router/index.js';
import { useUserStore } from '@/stores/userStore.js';

const { t } = useI18n();
const userStore = useUserStore();

const { setLoginInfo } = userStore;
nextTick(async () => {
  // await loginSSOServer();
  getCookie();
  if (sessionStorage.getItem('username')) {
    if (!location.origin.includes('https')) {
      location.href = `https://${location.hostname}/opscenter/#/ssoLogin`;
    }
    const { data } = await loginSSOServer(sessionStorage.getItem('username'));

    // 设置登录信息
    setLoginInfo(data);

    // 登录成功
    ElMessage({
      message: t('messageLoginSuccess'),
      type: 'success',
    });
    // 跳转到首页
    await router.replace({ path: '/main' });
    return;
  }
  console.log(`location.origin=====${location.origin}`);
  const baseUrl = location.origin;
  if (!baseUrl.includes('https')) {
    location.href = baseUrl + '/api/ssologin';
  } else {
    location.href = baseUrl + '/opscenter/api/ssologin';
  }
});

const getCookie = () => {
  for (const row of document.cookie.split(';')) {
    const [value, key] = row.split('=');

    sessionStorage.setItem([value], key);
  }
};
</script>

<template></template>
