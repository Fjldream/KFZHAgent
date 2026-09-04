import { getPublicKey, loginService, userTokenValid } from '@/api/allRequest/userAPI.js';
import { createRSAUtils } from '@/utils/rsaUtils.js';
import { useUserStore } from '@/stores/userStore.js';

export const useLoginHandle = () => {
  const userStore = useUserStore();

  const { setLoginInfo, setPublicKey } = userStore;

  /**
   * 登录函数
   *
   * @param params 登录参数对象，包括用户名和密码
   * @returns 登录结果
   */
  const userLogin = async (params) => {
    // 获取公钥
    const {
      data: { publicKey, uuid },
    } = await getPublicKey();
    setPublicKey(publicKey);
    // 创建RSA工具类实例
    const rsaUtil = createRSAUtils();

    // 使用公钥加密密码
    params.password = await rsaUtil.encrypt(params.password, publicKey);

    // 调用登录服务并传入加密后的密码和uuid
    const loginResult = await loginService({ ...params, uuid });
    if (loginResult && loginResult.code === 0) {
      // 设置登录信息
      setLoginInfo(loginResult.data);
    }
    // 返回登录结果
    return loginResult;
  };

  const validUserToken = async () => {
    // 检查sessionStorage中是否存在token
    const loginInfo = sessionStorage.getItem('userStore');
    if (loginInfo) {
      const loginInfoParse = JSON.parse(loginInfo);
      return await userTokenValid(loginInfoParse.loginInfo.access_token);
    }
    if (userStore.loginInfo.access_token) {
      return await userTokenValid(userStore.loginInfo.access_token);
    }
    return false;
  };

  return {
    userLogin,
    validUserToken,
  };
};
