import { axiosRequest } from '@/api/request.js';

/**
 * 前端获取指令执行状态
 *
 */
export const getCmdStatus = async (params) => {
  return await axiosRequest.get(`/api/v1/apps/cmds/status?cmdId=${params}`);
};
/**
 * 前端批量获取指令执行状态
 *
 */
export const getMultiCmdStatus = async (params) => {
  return await axiosRequest.get(`/api/v1/apps/multiCmds/status?cmdIds=${params}`);
};
/**
 * 通过appId获取app与负载app的结构
 *
 */
export const getAppStructure = async (params) => {
  return await axiosRequest.get(`/api/v1/getAppStructure?appId=${params}`);
};
/**
 * 通过appId获取app与负载app的结构
 *
 */
export const getInformation = async (params) => {
  return await axiosRequest.get(`/api/v1/getInformation?appId=${params}`);
};

/**
 * 创建app
 * @param params 参数
 *
 */
export const createApps = async (params) => {
  return await axiosRequest.post(`/api/v1/apps`, params);
};
/**
 * 启动app
 * @param params 参数
 *
 */
export const deployApps = async (params) => {
  return await axiosRequest.post(`/api/v1/apps/deploy`, params);
};
/**
 * 撤除部署app
 * @param params 参数
 *
 */
export const undeployApps = async (params) => {
  return await axiosRequest.post(`/api/v1/apps/undeploy`, params);
};

/**
 * 启动app
 * @param params 参数
 *
 */
export const startApps = async (params) => {
  return await axiosRequest.post(`/api/v1/apps/start`, params);
};

/**
 * 批量启动app
 * @param params 参数
 */
export const startMultiApps = async (params) => {
  return await axiosRequest.post(`/api/v1/apps/multiStart`, params);
};

/**
 * 停止app
 * @param params 参数
 *
 */
export const stopApps = async (params) => {
  return await axiosRequest.post(`/api/v1/apps/stop`, params);
};

/**
 * 批量停止app
 * @param params 参数
 *
 */
export const stopMultiApps = async (params) => {
  return await axiosRequest.post(`/api/v1/apps/multiStop`, params);
};

/**
 * 重启app
 * @param params 参数
 *
 */
export const restartApps = async (params) => {
  return await axiosRequest.post(`/api/v1/apps/restart`, params);
};

/**
 * 批量重启app
 * @param params 参数
 *
 */
export const restartMultiApps = async (params) => {
  return await axiosRequest.post(`/api/v1/apps/multiRestart`, params);
};

/**
 * 删除app
 * @param params 参数
 *
 */
export const deleteApps = async (params) => {
  return await axiosRequest.post(`/api/v1/apps/delete`, params);
};

/**
 * 获取页面上展示的APP的性能数据列表
 * @param params 参数
 *
 */
export const getPerformance = async (params) => {
  return await axiosRequest.post(`/api/v1/apps/displayPerformance`, params);
};
/**
 * 获取页面上展示的APP的状态列表
 * @param params 参数
 *
 */
export const getDisplayAppListStatus = async (params) => {
  return await axiosRequest.post(`/api/v1/displayAppListStatus`, params);
};

/**
 * 修改app
 * @param params 参数
 *
 */
export const modifyApps = async (params) => {
  return await axiosRequest.put(`/api/v1/apps`, params);
};
/**
 * 同步授权节点用户信息、服务发现信息
 */
export const syncNodeInfo = async (params) => {
  return await axiosRequest.get(`/api/v1/nodes/updateSyncInfoByAuthNode?nodeName=${params}`);
};
