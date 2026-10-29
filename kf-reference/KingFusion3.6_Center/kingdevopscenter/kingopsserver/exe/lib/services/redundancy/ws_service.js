// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

const { PERMISSION } = require('./constants')

// modified by jinlong.feng at 20260914 冗余功能-计算运行态订阅当前异常事件
const GLOBAL_TENANT_ID = '11111111-1111-1111-1111-111111111111'
const KC_REDUNDANCY_TENANT_ID = 'c7f1771f-0c8f-4c75-9d71-3b8c4b6bd190'
// end modified by jinlong.feng at 20260914 冗余功能-计算运行态订阅当前异常事件

/**
 * 在现有 Center HTTP Server 上提供单一冗余 WebSocket 连接。
 */
class RedundancyWebSocketService {
  /**
   * @param {object} options 构造参数。
   * @param {Function} [options.WebSocketServer] ws.Server 构造器，测试时可替换。
   * @param {{authenticate: Function}} options.authProvider token 鉴权适配器。
   * @param {{assert: Function}} options.permissionService 冗余权限服务。
   * @param {(tenantId: string) => Promise<object>} options.snapshotProvider 首帧快照提供器。
   * @param {number} [options.heartbeatIntervalMs=30000] ping 间隔，0 表示测试中不开定时器。
   * @param {string} [options.path] WebSocket 路径。
   */
  constructor({
    WebSocketServer = null,
    authProvider,
    permissionService,
    snapshotProvider,
    heartbeatIntervalMs = 30000,
    path = '/api/v1/redundancy-ws',
  }) {
    this.WebSocketServer = WebSocketServer
    this.authProvider = authProvider
    this.permissionService = permissionService
    this.snapshotProvider = snapshotProvider
    this.heartbeatIntervalMs = heartbeatIntervalMs
    this.path = path
    this.server = null
    this.heartbeatTimer = null
    this.lastPayloadByKey = new Map()
  }

  /**
   * 将 WebSocket 服务绑定到现有 HTTP Server。
   *
   * @param {object} options 启动参数或 HTTP Server 本身。
   * @param {object} [options.httpServer] 现有 HTTP Server。
   * @returns {RedundancyWebSocketService} 当前实例。
   */
  start(options) {
    if (this.server) return this
    const httpServer = options && options.httpServer ? options.httpServer : options
    const WebSocketServer = this.WebSocketServer || require('ws').WebSocketServer
    this.server = new WebSocketServer({ server: httpServer, path: this.path })
    this.server.on('connection', (socket, request) => {
      this.handleConnection(socket, request)
    })
    if (this.heartbeatIntervalMs > 0) {
      this.heartbeatTimer = setInterval(() => this.heartbeatTick(), this.heartbeatIntervalMs)
    }
    return this
  }

  /**
   * 完成 token 鉴权、查看权限校验并发送首帧租户快照。
   *
   * @param {object} socket WebSocket 客户端。
   * @param {object} request HTTP upgrade 请求。
   * @returns {Promise<void>}
   */
  async handleConnection(socket, request) {
    const token = RedundancyWebSocketService.readAccessToken(request && request.url)
    if (!token) {
      socket.close(4401, 'TOKEN_IS_MISSING')
      return
    }

    let oauthInfo
    try {
      oauthInfo = await this.authProvider.authenticate(token)
    } catch (error) {
      socket.close(4401, 'TOKEN_IS_INVALID')
      return
    }

    try {
      await this.permissionService.assert(oauthInfo, PERMISSION.VIEW)
    } catch (error) {
      socket.close(4403, 'PERMISSION_DENIED')
      return
    }

    // modified by jinlong.feng at 20260914 冗余功能-计算运行态订阅当前异常事件
    const requestedTenantId = RedundancyWebSocketService.readTenantId(request && request.url)
    const tenantId =
      oauthInfo.tenantId === GLOBAL_TENANT_ID &&
      requestedTenantId === KC_REDUNDANCY_TENANT_ID
        ? requestedTenantId
        : oauthInfo.tenantId
    // end modified by jinlong.feng at 20260914 冗余功能-计算运行态订阅当前异常事件

    socket.redundancyContext = { tenantId, oauthInfo }
    socket.isAlive = true
    socket.on('pong', () => {
      socket.isAlive = true
    })
    const snapshot = await this.snapshotProvider(tenantId)
    this.send(socket, 'REDUNDANCY_SNAPSHOT', snapshot)
  }

  /**
   * 向同租户已鉴权客户端广播增量消息。
   *
   * @param {string} type 消息类型。
   * @param {object} payload 载荷，必须包含 tenantId。
   * @returns {number} 实际发送客户端数。
   */
  publish(type, payload) {
    if (!this.server || !payload || !payload.tenantId) return 0
    if (this.isDuplicate(type, payload)) return 0

    let sent = 0
    for (const socket of this.server.clients) {
      if (
        socket.readyState === 1 &&
        socket.redundancyContext &&
        socket.redundancyContext.tenantId === payload.tenantId
      ) {
        this.send(socket, type, payload)
        sent += 1
      }
    }
    return sent
  }

  /**
   * 执行一轮 ping/pong 检测；上一轮未响应的连接直接终止。
   *
   * @returns {void}
   */
  heartbeatTick() {
    if (!this.server) return
    for (const socket of this.server.clients) {
      if (socket.readyState !== 1 || !socket.redundancyContext) continue
      if (socket.isAlive === false) {
        socket.terminate()
        continue
      }
      socket.isAlive = false
      socket.ping()
    }
  }

  /**
   * 停止定时器并关闭 WebSocket Server，不关闭共享 HTTP Server。
   *
   * @returns {void}
   */
  stop() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
    if (this.server) this.server.close()
    this.server = null
    this.lastPayloadByKey.clear()
  }

  /** @param {object} socket 客户端。 @param {string} type 类型。 @param {object} payload 载荷。 @returns {void} */
  send(socket, type, payload) {
    socket.send(JSON.stringify({ type, payload, sentAt: new Date().toISOString() }))
  }

  /**
   * 仅对状态消息做内容去重，避免健康扫描重复广播。
   *
   * @param {string} type 消息类型。
   * @param {object} payload 载荷。
   * @returns {boolean} 是否与上次消息相同。
   */
  isDuplicate(type, payload) {
    if (type !== 'REDUNDANCY_STATUS_CHANGED') return false
    const key = `${payload.tenantId}:${payload.redundancyId}:${type}`
    const serialized = JSON.stringify(payload)
    if (this.lastPayloadByKey.get(key) === serialized) return true
    this.lastPayloadByKey.set(key, serialized)
    return false
  }

  /**
   * 从 WebSocket URL 查询参数读取 access_token。
   *
   * @param {string} requestUrl 请求 URL。
   * @returns {string|null} token。
   */
  static readAccessToken(requestUrl) {
    try {
      return new URL(requestUrl || '', 'http://localhost').searchParams.get('access_token')
    } catch (error) {
      return null
    }
  }

  // modified by jinlong.feng at 20260914 冗余功能-计算运行态订阅当前异常事件
  /**
   * 从 WebSocket URL 查询参数读取 KC 固定的工程租户。
   *
   * @param {string} requestUrl 请求 URL。
   * @returns {string|null} tenantId。
   */
  static readTenantId(requestUrl) {
    try {
      return new URL(requestUrl || '', 'http://localhost').searchParams.get('tenantId')
    } catch (error) {
      return null
    }
  }
  // end modified by jinlong.feng at 20260914 冗余功能-计算运行态订阅当前异常事件
}

module.exports = { RedundancyWebSocketService }
// end
