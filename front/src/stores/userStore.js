import { defineStore } from 'pinia';

export const useUserStore = defineStore(
  'user',
  () => {
    const publicKey = ref('');
    const isRouteAdded = ref(false);
    const removeMainRouteFn = ref(null);
    const loginInfo = ref({
      access_token: '',
      expires_in: '',
      isFirstLogin: '',
      refresh_token: '',
      token_type: '',
      userId: '',
    });

    const accessToken = computed(() => loginInfo.value.access_token);
    const refreshToken = computed(() => loginInfo.value.refresh_token);

    // 设置用户的登录信息
    function setLoginInfo(info) {
      loginInfo.value = info;
    }

    function setPublicKey(info) {
      publicKey.value = info;
    }
    async function setRoles() {
      isRouteAdded.value = true;
    }
    const reset = () => {
      publicKey.value = '';
      isRouteAdded.value = false;
      loginInfo.value = {
        access_token: '',
        expires_in: '',
        isFirstLogin: '',
        refresh_token: '',
        token_type: '',
        userId: '',
      };
      if (removeMainRouteFn.value) {
        removeMainRouteFn.value();
        removeMainRouteFn.value = null;
      }
    };
    return {
      isRouteAdded,
      loginInfo,
      publicKey,
      accessToken,
      refreshToken,
      setLoginInfo,
      setPublicKey,
      reset,
      setRoles,
    };
  },
  {
    persist: {
      enabled: true,
      storage: sessionStorage, // 使用 sessionStorage
      key: 'userStore',
      pick: ['publicKey', 'loginInfo'],
    },
  },
);
