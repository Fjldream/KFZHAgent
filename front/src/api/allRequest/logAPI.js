import { axiosRequest } from '@/api/request.js';

/**
 * @function handleMaintenanceLog
 * @description 日志查询接口
 * @returns
 * @param params
 */
export const handleMaintenanceLogServer = async (params) => {
  return await axiosRequest.post(`/api/v1/conditionQuery`, params, {
    headers: {
      'Content-Type': 'application/json',
    },
  });
};
