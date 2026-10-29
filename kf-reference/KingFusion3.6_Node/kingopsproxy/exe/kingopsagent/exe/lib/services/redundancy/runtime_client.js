// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

/**
 * 使用 KF 现有请求组件访问 Center 节点运行态接口。
 */
class RuntimeClient {
  /**
   * @param {object} options 构造参数。
   * @param {{httpRequestSync: Function}} options.requestClient 现有同步 Promise 请求封装。
   * @param {string} options.apiBaseUrl Center `/api/v1` 地址。
   */
  constructor({ requestClient, apiBaseUrl }) {
    this.requestClient = requestClient
    this.apiBaseUrl = apiBaseUrl.replace(/\/$/, '')
  }

  /**
   * 查询节点完整冗余运行态。
   *
   * @param {object} nodeInfo 节点标识。
   * @returns {Promise<object>} Center 运行态。
   */
  async getRuntime(nodeInfo) {
    const nodeId = RuntimeClient.readNodeField(nodeInfo, 'nodeId')
    return this.request({
      url: `${this.apiBaseUrl}/nodes/${encodeURIComponent(nodeId)}/redundancy-runtime`,
      method: 'GET',
      json: true,
      headers: { Connection: 'keep-alive', 'Content-Type': 'application/json' },
    })
  }

  /**
   * 上报节点角色和 APP 状态收敛结果。
   *
   * @param {object} nodeInfo 节点标识。
   * @param {object} payload 同步结果。
   * @returns {Promise<object>} Center 接收结果。
   */
  async reportSyncResult(nodeInfo, payload) {
    const nodeId = RuntimeClient.readNodeField(nodeInfo, 'nodeId')
    const tenantId = RuntimeClient.readNodeField(nodeInfo, 'tenantId')
    return this.request({
      url: `${this.apiBaseUrl}/nodes/${encodeURIComponent(nodeId)}/redundancy-sync-result`,
      method: 'POST',
      json: true,
      headers: { Connection: 'keep-alive', 'Content-Type': 'application/json' },
      body: { ...payload, tenantId },
    })
  }

  /**
   * 执行请求并统一校验 KF 响应。
   *
   * @param {object} options request 请求选项。
   * @returns {Promise<object>} 响应 data。
   */
  async request(options) {
    const { err, res, body } = await this.requestClient.httpRequestSync(options)
    if (err || !res || res.statusCode < 200 || res.statusCode >= 300) {
      throw err || new Error(`Center 请求失败，HTTP ${res ? res.statusCode : 'UNKNOWN'}`)
    }
    if (body && body.code !== undefined && Number(body.code) !== 0) {
      throw new Error(body.msg || body.message || `Center 返回错误码 ${body.code}`)
    }
    return body && Object.prototype.hasOwnProperty.call(body, 'data') ? body.data : body
  }

  /**
   * 同时兼容 NodeInfo getter 和测试用纯对象。
   *
   * @param {object} nodeInfo 节点信息。
   * @param {'nodeId'|'tenantId'} field 字段。
   * @returns {string} 字段值。
   */
  static readNodeField(nodeInfo, field) {
    const getter = `get${field[0].toUpperCase()}${field.slice(1)}`
    return typeof nodeInfo[getter] === 'function' ? nodeInfo[getter]() : nodeInfo[field]
  }
}

module.exports = { RuntimeClient }
// end
