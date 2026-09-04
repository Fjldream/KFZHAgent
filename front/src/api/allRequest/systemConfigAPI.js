import { axiosRequest } from '@/api/request.js';

/**
 * 获取系统OEM配置
 */
export const getSystemConfig = async () => {
  return await axiosRequest.get(`/oemConfig`);
};
/**
 * 更新系统OEM配置
 */
export const updateSystemConfig = async (params) => {
  return await axiosRequest.post(`/api/v1/system/setOEMConfig`, params, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

/**
 * 获取系统日志配置
 */
export const getSystemLogConfig = async () => {
  return await axiosRequest.get(`/api/v1/getRetainTime`);
};

/**
 * 修改系统日志配置
 */
export const UpdateSystemLogConfig = async (time) => {
  return await axiosRequest.post(`/api/v1/saveRetainTime`, { time: time });
};
