import { axiosRequest } from '@/api/request.js';

/**
 * 通过appId获取app与负载app的结构
 *
 */
export const appStructure = async (params) => {
  return await axiosRequest.get(`/api/v1/appStructure?appId=${params}`);
};
/**
 * 添加负载均衡器
 * @param params 参数
 *
 */
export const addBalancer = async (params) => {
  return await axiosRequest.post(`/api/v1/balancer`, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
};
/**
 * 修改负载均衡器
 * @param params 参数
 *
 */
export const modifyBalancer = async (params) => {
  return axiosRequest.put(`/api/v1/balancer`, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
};
/**
 * 删除负载均衡器
 * @param params 参数
 *
 */
export const removeBalancer = async (params) => {
  return await axiosRequest.delete(`/api/v1/balancer`, params);
};
/**
 * @function handleMaintenanceLog
 * @description 运维中心日志查询接口
 * @param {*} address
 * @param {*} port
 * @param {*} url
 * @param {*} data
 * @returns
 */
export const handleMaintenanceLog = async (address, port, url, data) => {
  const params = {
    address,
    port,
    url,
    data,
  };
  return await axiosRequest.post(`/api/v1/agent/log`, params, {
    headers: { 'Content-Type': 'application/json' },
  });
};
