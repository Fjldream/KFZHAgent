import { axiosRequest } from '@/api/request.js';

/**
 * @function handleQueryGroupServer
 * @description 查询左侧树
 * @param {*} params
 * @returns
 */
export const handleQueryGroupServer = async (params) => {
  return await axiosRequest.get(
    `https://${location.hostname}/api/collect/getMonitorVariablesGroup?projectId=${params}`,
  );
};

/**
 * @function handleVariablesListServer
 * @description 查询变量列表
 * @param {*} params
 * @returns
 */
export const handleVariablesListServer = async (params) => {
  return await axiosRequest.get(
    `https://${location.hostname}/api/collect/getMonitorVariables?projectId=${params.projectId}&groupId=${params.groupId}`,
  );
};

/**
 * @function handleProjectInfoServer
 * @description 查询工程详细信息
 * @param {*} params
 * @returns
 */
export const handleProjectInfoServer = async (params) => {
  return await axiosRequest.get(
    `https://${location.hostname}/api/collect/getProjectById?projectId=${params.projectId}`,
  );
};
