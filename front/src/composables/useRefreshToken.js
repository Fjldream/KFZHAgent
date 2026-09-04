import { useUserStore } from '@/stores/userStore.js';

import { refreshTokenServer } from '@/api/allRequest/userAPI';

export const useRefreshToken = () => {
  const userStore = useUserStore();
  const { setLoginInfo } = userStore;
  const { loginInfo } = storeToRefs(userStore);
  const polling = ref(true); //是否继续轮询
  const pollingInterval = 30 * 60 * 1000; //间隔时间 ms
  let timer = null;
  let controller = null;
  const refreshKey = 'last_token_refresh_time';
  // refreshToken最小间隔时间
  const minInterval = 60 * 1000;
  const pollHandle = async () => {
    if (!polling.value) {
      return;
    }
    try {
      await refreshToken();
    } finally {
      start();
    }
  };

  const refreshToken = async () => {
    if (!shouldRefresh()) {
      return;
    }
    if (controller) {
      controller.abort();
    }
    controller = new AbortController();
    const { data } = await refreshTokenServer(
      {
        refresh_token: loginInfo.value.refresh_token,
      },
      {
        signal: controller.signal,
      },
    );
    setLoginInfo({ ...loginInfo.value, ...data });
  };

  const shouldRefresh = () => {
    const lastTime = Number(localStorage.getItem(refreshKey) || 0);
    const now = Date.now();
    if (now - lastTime > minInterval) {
      localStorage.setItem(refreshKey, now.toString());
      return true;
    }
    return false;
  };
  const start = () => {
    timer = setTimeout(pollHandle, pollingInterval);
  };

  const stop = () => {
    polling.value = false;
    clearTimeout(timer);
    controller?.abort();
  };

  onMounted(async () => {
    await refreshToken();
    start();
  });

  onUnmounted(() => {
    stop();
  });

  return {
    start,
    stop,
    polling,
  };
};
