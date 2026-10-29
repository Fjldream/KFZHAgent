// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

const { CONFIG_LIFECYCLE } = require('./constants')

/** 节点应执行的冗余角色。 */
const NODE_ROLE = Object.freeze({
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  UNMANAGED: 'UNMANAGED',
})

/** APP 的目标运行状态。 */
const DESIRED_APP_STATE = Object.freeze({
  RUNNING: 'RUNNING',
  STOPPED: 'STOPPED',
})

/**
 * 判断请求路径是否为允许节点免用户令牌访问的运行态接口。
 *
 * @param {string} requestPath Express 请求路径，不含查询参数。
 * @returns {boolean} 是否为节点运行态接口。
 */
function isNodeRuntimePath(requestPath) {
  return /^\/nodes\/[^/]+\/redundancy-(?:runtime|sync-result)$/.test(requestPath || '')
}

/**
 * 在 Center 当前进程内记录节点最后一次确认的冗余角色和 revision。
 *
 * 该记录仅用于判断节点是否需要重新收敛；配置事实仍以 JSON 配置为准。
 */
class NodeRuntimeRegistry {
  constructor() {
    this.records = new Map()
  }

  /**
   * 查询节点最后一次同步记录。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} nodeId 节点 ID。
   * @returns {object|null} 同步记录副本。
   */
  get(tenantId, nodeId) {
    const record = this.records.get(NodeRuntimeRegistry.key(tenantId, nodeId))
    return record ? { ...record } : null
  }

  /**
   * 保存节点同步记录。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} nodeId 节点 ID。
   * @param {object} record 同步结果。
   * @returns {object} 已保存的记录副本。
   */
  set(tenantId, nodeId, record) {
    const saved = { ...record }
    this.records.set(NodeRuntimeRegistry.key(tenantId, nodeId), saved)
    return { ...saved }
  }

  /**
   * 清除节点的进程内同步记录。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} nodeId 节点 ID。
   * @returns {void}
   */
  remove(tenantId, nodeId) {
    this.records.delete(NodeRuntimeRegistry.key(tenantId, nodeId))
  }

  /** @param {string} tenantId 租户 ID。 @param {string} nodeId 节点 ID。 @returns {string} Map 键。 */
  static key(tenantId, nodeId) {
    return `${tenantId}:${nodeId}`
  }
}

/**
 * 根据 Center 冗余配置生成节点运行态，并接收节点的收敛结果。
 */
class NodeRuntimeService {
  /**
   * @param {object} options 构造参数。
   * @param {{list: Function}} options.configProvider 冗余配置查询器。
   * @param {NodeRuntimeRegistry} [options.runtimeRegistry] 节点同步记录表。
   * @param {() => string} [options.clock] ISO 时间提供器。
   */
  constructor({
    configProvider,
    runtimeRegistry = new NodeRuntimeRegistry(),
    clock = () => new Date().toISOString(),
  }) {
    this.configProvider = configProvider
    this.runtimeRegistry = runtimeRegistry
    this.clock = clock
  }

  /**
   * 获取节点当前应遵守的完整冗余运行态。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} nodeId 节点 ID。
   * @returns {Promise<object>} 节点运行态。
   */
  async getRuntime(tenantId, nodeId) {
    const config = await this.findNodeConfig(tenantId, nodeId)
    if (!config) return NodeRuntimeService.unmanagedRuntime()

    if (config.lifecycle !== CONFIG_LIFECYCLE.ENABLED) {
      this.runtimeRegistry.remove(tenantId, nodeId)
      return NodeRuntimeService.unmanagedRuntime(config)
    }

    const active = config.activeNodeId === nodeId
    const role = active ? NODE_ROLE.ACTIVE : NODE_ROLE.INACTIVE
    const appIds = NodeRuntimeService.getNodeAppIds(config, nodeId)
    const desiredState = active ? DESIRED_APP_STATE.RUNNING : DESIRED_APP_STATE.STOPPED
    const desiredStates = Object.fromEntries(appIds.map((appId) => [appId, desiredState]))
    const confirmed = this.runtimeRegistry.get(tenantId, nodeId)

    return {
      redundancyId: config.redundancyId,
      enabled: true,
      role,
      appIds,
      revision: config.revision,
      desiredStates,
      reconcileRequired: !NodeRuntimeService.matchesRuntime(confirmed, config.revision, role),
    }
  }

  /**
   * 记录节点按 Center 运行态完成收敛后的结果。
   *
   * 过期或角色不匹配的结果只返回拒绝原因，不覆盖最新记录。
   *
   * @param {object} payload 节点同步结果。
   * @param {string} payload.tenantId 租户 ID。
   * @param {string} payload.nodeId 节点 ID。
   * @param {number} payload.revision 已执行的配置 revision。
   * @param {string} payload.role 已执行的角色。
   * @param {boolean} payload.success 全部 APP 是否收敛成功。
   * @param {object[]} [payload.appResults] 逐 APP 结果。
   * @returns {Promise<object>} 接收结果。
   */
  async recordSyncResult(payload) {
    const runtime = await this.getRuntime(payload.tenantId, payload.nodeId)
    if (!runtime.enabled) {
      return { accepted: false, reason: 'NOT_MANAGED', currentRevision: runtime.revision }
    }
    if (payload.revision < runtime.revision) {
      return { accepted: false, reason: 'STALE_REVISION', currentRevision: runtime.revision }
    }
    if (payload.revision !== runtime.revision) {
      return { accepted: false, reason: 'REVISION_MISMATCH', currentRevision: runtime.revision }
    }
    if (payload.role !== runtime.role) {
      return { accepted: false, reason: 'ROLE_MISMATCH', currentRole: runtime.role }
    }

    this.runtimeRegistry.set(payload.tenantId, payload.nodeId, {
      redundancyId: runtime.redundancyId,
      revision: runtime.revision,
      role: runtime.role,
      confirmed: payload.success === true,
      appResults: Array.isArray(payload.appResults) ? payload.appResults : [],
      syncedAt: this.clock(),
    })
    return {
      accepted: true,
      redundancyId: runtime.redundancyId,
      revision: runtime.revision,
      reconcileRequired: payload.success !== true,
    }
  }

  /**
   * 获取心跳响应所需的轻量冗余提示。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} nodeId 节点 ID。
   * @returns {Promise<{redundancyRevision: number, reconcileRequired: boolean}>} 心跳提示。
   */
  async getHeartbeatHint(tenantId, nodeId) {
    const runtime = await this.getRuntime(tenantId, nodeId)
    return {
      redundancyRevision: runtime.revision,
      reconcileRequired: runtime.reconcileRequired,
    }
  }

  /**
   * 查询包含指定节点的配置。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} nodeId 节点 ID。
   * @returns {Promise<object|null>} 冗余配置。
   */
  async findNodeConfig(tenantId, nodeId) {
    const configs = await Promise.resolve(this.configProvider.list(tenantId))
    return (
      configs.find(
        (config) => config.primaryNodeId === nodeId || config.standbyNodeId === nodeId,
      ) || null
    )
  }

  /**
   * 获取配置中某一节点对应的 APP 列表。
   *
   * @param {object} config 冗余配置。
   * @param {string} nodeId 节点 ID。
   * @returns {string[]} APP ID 副本。
   */
  static getNodeAppIds(config, nodeId) {
    const appIds = config.primaryNodeId === nodeId ? config.primaryAppIds : config.standbyAppIds
    return Array.isArray(appIds) ? [...appIds] : []
  }

  /**
   * 判断节点确认记录是否对应当前角色和 revision。
   *
   * @param {object|null} record 节点确认记录。
   * @param {number} revision 当前配置 revision。
   * @param {string} role 当前角色。
   * @returns {boolean} 是否已经完成当前版本收敛。
   */
  static matchesRuntime(record, revision, role) {
    return Boolean(
      record && record.confirmed === true && record.revision === revision && record.role === role,
    )
  }

  /**
   * 创建未托管或未生效节点的稳定响应。
   *
   * @param {object|null} [config=null] 已停用的配置。
   * @returns {object} 未启用运行态。
   */
  static unmanagedRuntime(config = null) {
    return {
      redundancyId: config ? config.redundancyId : null,
      enabled: false,
      role: NODE_ROLE.UNMANAGED,
      appIds: [],
      revision: config ? config.revision : 0,
      desiredStates: {},
      reconcileRequired: false,
    }
  }
}

/**
 * 在 Center 操作编排中等待节点通过心跳获取新角色并回报收敛结果。
 */
class NodeRuntimeSynchronizer {
  /**
   * @param {object} options 构造参数。
   * @param {NodeRuntimeRegistry} options.runtimeRegistry 节点确认记录表。
   * @param {(milliseconds: number) => Promise<void>} [options.wait] 等待函数。
   * @param {() => number} [options.now] 毫秒时间提供器。
   * @param {number} [options.pollIntervalMs=500] 查询间隔。
   * @param {number} [options.timeoutMs=30000] 最大等待时间。
   */
  constructor({
    runtimeRegistry,
    wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    now = () => Date.now(),
    pollIntervalMs = 500,
    timeoutMs = 30000,
  }) {
    this.runtimeRegistry = runtimeRegistry
    this.wait = wait
    this.now = now
    this.pollIntervalMs = pollIntervalMs
    this.timeoutMs = timeoutMs
  }

  /**
   * 等待指定节点确认当前角色与 revision。
   *
   * @param {object} input 同步目标。
   * @param {string} input.tenantId 租户 ID。
   * @param {string} input.nodeId 节点 ID。
   * @param {string} input.role 目标角色。
   * @param {number} input.revision 目标 revision。
   * @returns {Promise<object>} 节点确认记录。
   */
  async syncNode(input) {
    const startedAt = this.now()
    while (true) {
      const record = this.runtimeRegistry.get(input.tenantId, input.nodeId)
      if (NodeRuntimeService.matchesRuntime(record, input.revision, input.role)) return record
      if (this.now() - startedAt >= this.timeoutMs) {
        throw new Error(`等待节点 ${input.nodeId} 确认冗余角色超时`)
      }
      await this.wait(this.pollIntervalMs)
    }
  }
}

module.exports = {
  DESIRED_APP_STATE,
  NODE_ROLE,
  NodeRuntimeRegistry,
  NodeRuntimeService,
  NodeRuntimeSynchronizer,
  isNodeRuntimePath,
}
// end
