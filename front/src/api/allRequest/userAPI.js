import { axiosRequest } from '@/api/request.js';

/**
 * 登录服务
 *
 * @param params 登录参数
 * @returns 登录结果
 */
export const loginService = async (params) => {
  return await axiosRequest.post(`/login`, params);
};

/**
 * 登出服务
 *
 * @param params 登出参数
 * @returns 登出结果
 */
export const logoutService = async (params) => {
  return await axiosRequest.post(`/api/v1/logout`, params);
};
/**
 * 获取公钥服务
 *
 * @returns Promise 包含公钥的Promise对象
 */
export const getPublicKey = async () => {
  return await axiosRequest.get(`/getPublicKey`);
};

/**
 * 获取token是否有效
 *
 * @param params 参数
 * @returns 结果
 */
export const userTokenValid = async (access_token) => {
  try {
    return await axiosRequest.get(`/api/v1/userTokenValid`, { access_token });
  } catch (error) {
    return { isValid: false };
  }
};

/**
 * 修改用户密码
 */
export const changeUserPassword = async (params) => {
  const data = {
    userId: params.userId,
    oldPassword: params.oldPassword,
    newPassword: params.newPassword,
  };
  return await axiosRequest.post(`/changePassword`, data);
};

/**
 * 初次登陆修改用户密码
 */
export const changeUserPasswordForFirstLogin = async (params) => {
  const data = {
    userName: params.userName,
    oldPassword: params.oldPassword,
    newPassword: params.newPassword,
  };
  return await axiosRequest.post(`/firstUserPassword`, data);
};

/**
 * 刷新token服务
 *
 * @param params 登录参数
 * @param config 登录配置
 * @returns 登录结果
 */
export const refreshTokenServer = async (params, config) => {
  return await axiosRequest.post(`/newTokenByRefreshToken`, params, config);
};

export const loginSSOServer = async (username) => {
  return await axiosRequest.get(`/api/v1/sdlogin`, { username });
};
