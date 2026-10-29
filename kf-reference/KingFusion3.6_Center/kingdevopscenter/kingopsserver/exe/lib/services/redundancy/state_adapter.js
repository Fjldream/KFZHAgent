// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

/**
 * 将现有节点、APP 和节点-APP 关系模型转换为冗余子系统稳定快照。
 */
class StateAdapter {
  /**
   * @param {object} options 构造参数。
   * @param {object} options.nodeManager 现有节点管理单例。
   * @param {object} options.appManager 现有 APP 管理单例。
   * @param {object} options.nodeAppManager 现有节点-APP 关系单例。
   * @param {{get: Function}} options.runtimeRegistry 节点冗余角色同步状态仓库。
   */
  constructor({ nodeManager, appManager, nodeAppManager, runtimeRegistry }) {
    this.nodeManager = nodeManager
    this.appManager = appManager
    this.nodeAppManager = nodeAppManager
    this.runtimeRegistry = runtimeRegistry
    // modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称
    // APP 被删除后无法再从模型查到名称，这里保留最后一次已知值，
    // 供 buildNodeSnapshot 与错误文案在 APP 缺失时给出可读名称。
    this.appNameCache = new Map()
    // end modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称
  }

  // modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称
  /** 名称缓存上限，超出后按插入顺序淘汰最早记录，避免长期运行内存增长。 */
  static APP_NAME_CACHE_LIMIT = 2000

  /**
   * 记录 APP 最近一次已知名称。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} appId APP ID。
   * @param {string} appName APP 名称。
   * @returns {void}
   */
  rememberAppName(tenantId, appId, appName) {
    if (!appId || !appName) return
    const key = `${tenantId}::${appId}`
    if (this.appNameCache.has(key)) this.appNameCache.delete(key)
    this.appNameCache.set(key, appName)
    if (this.appNameCache.size > StateAdapter.APP_NAME_CACHE_LIMIT) {
      this.appNameCache.delete(this.appNameCache.keys().next().value)
    }
  }

  /**
   * 读取 APP 最近一次已知名称。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} appId APP ID。
   * @returns {string|null} 已知名称；从未记录时返回 null。
   */
  recallAppName(tenantId, appId) {
    if (!appId) return null
    return this.appNameCache.get(`${tenantId}::${appId}`) || null
  }

  /**
   * 解析 APP 的可读名称，供错误文案与提示统一使用。
   * 优先取当前模型中的名称，APP 已被删除时回退到最近一次已知名称。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} appId APP ID。
   * @returns {string} 可读名称；完全无法解析时回退为 APP ID。
   */
  getAppDisplayName(tenantId, appId) {
    if (!appId) return ''
    const rawApp = this.findRawApp(tenantId, appId)
    if (rawApp) {
      const appName = StateAdapter.readValue(rawApp, 'getAppName', 'appName')
      if (appName) {
        this.rememberAppName(tenantId, appId, appName)
        return appName
      }
    }
    return this.recallAppName(tenantId, appId) || appId
  }
  // end modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称

  /**
   * 生成配置对应的主从节点状态快照。
   *
   * @param {object} config 冗余配置。
   * @returns {Promise<{primary: object, standby: object}>} 状态快照。
   */
  async snapshot(config) {
    return {
      primary: this.buildNodeSnapshot(config.tenantId, config.primaryNodeId, config.primaryAppIds),
      standby: this.buildNodeSnapshot(config.tenantId, config.standbyNodeId, config.standbyAppIds),
    }
  }

  /**
   * 查询 ConfigService 使用的节点对象。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} nodeId 节点 ID。
   * @returns {object|null} 节点快照。
   */
  getNode(tenantId, nodeId) {
    const node = this.findRawNode(tenantId, nodeId)
    return node ? this.normalizeNode(node) : null
  }

  /**
   * 查询 ConfigService 使用的 APP 对象。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} appId APP ID。
   * @returns {object|null} APP 快照。
   */
  getApp(tenantId, appId) {
    const app = this.findRawApp(tenantId, appId)
    return app ? this.normalizeApp(app) : null
  }

  /**
   * 查询指定节点下的全部 APP。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} nodeId 节点 ID。
   * @returns {object[]} APP 快照列表。
   */
  listApps(tenantId, nodeId) {
    return (this.appManager.appsBaseInfo || [])
      .filter((app) => StateAdapter.readValue(app, 'getTenantId', 'tenantId') === tenantId)
      .map((app) => this.normalizeApp(app))
      .filter((app) => app.nodeId === nodeId)
  }

  /**
   * 生成单个节点及受管 APP 快照。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} nodeId 节点 ID。
   * @param {string[]} appIds 受管 APP ID。
   * @returns {object} 节点快照。
   */
  buildNodeSnapshot(tenantId, nodeId, appIds) {
    const rawNode = this.findRawNode(tenantId, nodeId)
    const node = rawNode
      ? this.normalizeNode(rawNode)
      : { nodeId, nodeName: null, online: false, exists: false }
    const runtime = this.runtimeRegistry.get(tenantId, nodeId) || {}
    return {
      ...node,
      role: runtime.role || null,
      roleConfirmed: runtime.confirmed === true,
      syncedRevision: Number.isInteger(runtime.revision) ? runtime.revision : null,
      apps: appIds.map((appId) => {
        const rawApp = this.findRawApp(tenantId, appId)
        if (!rawApp) {
          return {
            appId,
            // modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称
            // APP 已被删除，回退到最近一次已知名称，避免异常事件只显示 APP ID。
            appName: this.recallAppName(tenantId, appId),
            // end modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称
            exists: false,
            nodeId: null,
            deployed: false,
            running: false,
            status: 'MISSING',
          }
        }
        return this.normalizeApp(rawApp)
      }),
    }
  }

  /**
   * 查找现有节点对象。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} nodeId 节点 ID。
   * @returns {object|null} 原节点对象。
   */
  findRawNode(tenantId, nodeId) {
    return (
      (this.nodeManager.nodeHome.nodes || []).find(
        (node) =>
          StateAdapter.readValue(node, 'getNodeId', 'nodeId') === nodeId &&
          StateAdapter.readValue(node, 'getTenantId', 'tenantId') === tenantId,
      ) || null
    )
  }

  /**
   * 查找现有 APP 对象。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} appId APP ID。
   * @returns {object|null} 原 APP 对象。
   */
  findRawApp(tenantId, appId) {
    return (
      (this.appManager.appsBaseInfo || []).find(
        (app) =>
          StateAdapter.readValue(app, 'getAppId', 'appId') === appId &&
          StateAdapter.readValue(app, 'getTenantId', 'tenantId') === tenantId,
      ) || null
    )
  }

  /**
   * 标准化节点模型。
   *
   * @param {object} node 原节点对象。
   * @returns {object} 节点快照。
   */
  normalizeNode(node) {
    const status = StateAdapter.readValue(node, 'getNodeStatus', 'nodeStatus')
    return {
      nodeId: StateAdapter.readValue(node, 'getNodeId', 'nodeId'),
      nodeName: StateAdapter.readValue(node, 'getNodeName', 'nodeName'),
      exists: true,
      online: status === 'running' || status === 1 || status === true,
      status,
    }
  }

  /**
   * 标准化 APP 模型。
   *
   * @param {object} app 原 APP 对象。
   * @returns {object} APP 快照。
   */
  normalizeApp(app) {
    const appId = StateAdapter.readValue(app, 'getAppId', 'appId')
    const appName = StateAdapter.readValue(app, 'getAppName', 'appName')
    const rawStatus = StateAdapter.readValue(app, 'getAppStatus', 'appStatus')
    const running = rawStatus === 'running' || rawStatus === 1 || rawStatus === true
    // modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称
    // 记录当前名称，供 APP 后续被删除时回退使用。
    this.rememberAppName(
      StateAdapter.readValue(app, 'getTenantId', 'tenantId'),
      appId,
      appName,
    )
    // end modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称
    return {
      appId,
      appName,
      tenantId: StateAdapter.readValue(app, 'getTenantId', 'tenantId'),
      exists: true,
      nodeId: this.nodeAppManager.findNodeIdByAppId(appId) || null,
      deployed: StateAdapter.readValue(app, 'getAppDeployStatus', 'appDeployStatus') === 1,
      running,
      status: running ? 'RUNNING' : 'STOPPED',
      rawStatus,
    }
  }

  /**
   * 优先调用模型 getter，不存在时读取公开字段。
   *
   * @param {object} target 目标对象。
   * @param {string} getterName getter 名称。
   * @param {string} propertyName 字段名称。
   * @returns {unknown} 字段值。
   */
  static readValue(target, getterName, propertyName) {
    return typeof target[getterName] === 'function' ? target[getterName]() : target[propertyName]
  }
}

module.exports = { StateAdapter }
// end
