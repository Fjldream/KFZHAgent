import { axiosRequest } from '@/api/request.js';

/**
 * 获取运维中心节点管理及数据
 *
 */
export const fileResourceData = async () => {
  return await axiosRequest.get(`/api/v1/fileResourceData`);
};
/**
 * 获取运维监视全部资源数据
 *
 */
export const opsResourceData = async () => {
  return await axiosRequest.get(`/api/v1/opsResourceData`);
};
/**
 * 获取节点资源数据
 *
 */
export const nodeResourceData = async () => {
  return await axiosRequest.get(`/api/v1/nodeResourceData`);
};
/**
 * 获取节点性能数据
 *
 */
export const getNodesResServer = async (node) => {
  const params = {
    nodeId: node.nodeId,
  };
  try {
    const { data } = await axiosRequest.get(`/api/v1/nodes/getNodesRes`, params);
    return data;
  } catch (error) {
    return error;
  }
};
/**
 * 删除节点
 *
 */
export const delNodesServer = async (node) => {
  const params = {
    nodeId: node.nodeId,
  };
  try {
    return await axiosRequest.post(`/api/v1/delNodes`, params);
  } catch (error) {
    return error;
  }
};
