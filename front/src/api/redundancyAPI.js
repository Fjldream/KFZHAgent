// modified by jinlong.feng at 0901 冗余功能开发
import { axiosRequest } from "@/api/request.js"

const REDUNDANCY_REQUEST_ERROR_OPTIONS = Object.freeze({
  placement: "top",
  customClass: "redundancy-message",
})

/** 为冗余接口附加模块专属错误提示位置，不改变其他业务请求。 */
function withRedundancyRequestOptions (config = {}) {
  return {
    ...config,
    requestErrorMessageOptions: REDUNDANCY_REQUEST_ERROR_OPTIONS,
  }
}

const redundancyRequest = {
  get: (url, params = {}, config = {}) =>
    axiosRequest.get(url, params, withRedundancyRequestOptions(config)),
  post: (url, data = {}, config = {}) =>
    axiosRequest.post(url, data, withRedundancyRequestOptions(config)),
  put: (url, data = {}, config = {}) =>
    axiosRequest.put(url, data, withRedundancyRequestOptions(config)),
  delete: (url, data = {}, config = {}) =>
    axiosRequest.delete(url, data, withRedundancyRequestOptions(config)),
}

/**
 * 从运维中心统一响应结构中提取业务数据。
 * @param {Promise<Object>} requestPromise axiosRequest 返回的请求 Promise
 * @returns {Promise<*>} 接口 data 字段
 */
async function unwrap (requestPromise) {
  const result = await requestPromise
  if (
    result?.code === 0 ||
    result?.errorCode === 0 ||
    result?.code === "success"
  )
    return result.data
  throw new Error(
    result?.message || result?.msg || "REDUNDANCY_REQUEST_FAILED",
  )
}

/** 节点冗余后端接口集合，统一复用运维中心 Axios 实例。 */
export const redundancyAPI = {
  list: () => unwrap(redundancyRequest.get("/api/v1/redundancies")),
  detail: (id) => unwrap(redundancyRequest.get(`/api/v1/redundancies/${id}`)),
  create: (data) =>
    unwrap(redundancyRequest.post("/api/v1/redundancies", data)),
  update: (id, expectedRevision, data) =>
    unwrap(
      redundancyRequest.put(`/api/v1/redundancies/${id}`, {
        ...data,
        expectedRevision,
      }),
    ),
  remove: (id, expectedRevision) =>
    unwrap(
      redundancyRequest.delete(
        `/api/v1/redundancies/${id}`,
        {},
        { params: { expectedRevision } },
      ),
    ),
  candidates: (id, nodeId) =>
    unwrap(
      redundancyRequest.get(`/api/v1/redundancies/${id}/app-candidates`, {
        nodeId,
      }),
    ),
  events: (params = {}) =>
    unwrap(redundancyRequest.get("/api/v1/redundancy-events", params)),
  acknowledge: (id, eventId) =>
    unwrap(
      redundancyRequest.post(
        `/api/v1/redundancies/${id}/events/${eventId}/ack`,
      ),
    ),
  enable: (id, data) =>
    unwrap(redundancyRequest.post(`/api/v1/redundancies/${id}/enable`, data)),
  disable: (id, data) =>
    unwrap(redundancyRequest.post(`/api/v1/redundancies/${id}/disable`, data)),
  switchNode: (id, data) =>
    unwrap(redundancyRequest.post(`/api/v1/redundancies/${id}/switch`, data)),
  updateApps: (id, data) =>
    unwrap(
      redundancyRequest.post(`/api/v1/redundancies/${id}/app-changes`, data),
    ),
  task: (id, taskId) =>
    unwrap(
      redundancyRequest.get(
        `/api/v1/redundancies/${id}/operation-tasks/${taskId}`,
      ),
    ),
}
// end
