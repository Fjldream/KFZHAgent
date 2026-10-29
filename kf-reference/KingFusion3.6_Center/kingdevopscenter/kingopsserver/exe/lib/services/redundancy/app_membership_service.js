// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

const { CONFIG_LIFECYCLE, ERROR_CODE } = require('./constants')
const { RedundancyError } = require('./errors')

/**
 * 在线批量维护已生效配置两侧 APP 列表，并按当前角色收敛新增 APP。
 */
class AppMembershipService {
  /**
   * @param {object} options 构造参数。
   * @param {object} options.configRepository 配置仓库。
   * @param {object} options.stateProvider APP 状态提供器。
   * @param {object} options.commandGateway APP 命令网关。
   * @param {object} options.runtimeSynchronizer 节点角色同步器。
   * @param {object} options.eventRepository 任务仓库。
   * @param {object} options.mutex 配置互斥器。
   * @param {() => string} [options.clock] ISO 时间提供器。
   */
  constructor({
    configRepository,
    stateProvider,
    commandGateway,
    runtimeSynchronizer,
    eventRepository,
    mutex,
    clock = () => new Date().toISOString(),
  }) {
    this.configRepository = configRepository
    this.stateProvider = stateProvider
    this.commandGateway = commandGateway
    this.runtimeSynchronizer = runtimeSynchronizer
    this.eventRepository = eventRepository
    this.mutex = mutex
    this.clock = clock
  }

  /**
   * 整体校验并执行两侧 APP 混合增删。
   *
   * @param {object} input APP 变更请求。
   * @returns {Promise<object>} 操作任务。
   */
  async applyChanges(input) {
    const existing = this.eventRepository.findByRequestId(input.tenantId, input.requestId)
    if (existing) return existing

    return this.mutex.runExclusive(input.redundancyId, async () => {
      const repeated = this.eventRepository.findByRequestId(input.tenantId, input.requestId)
      if (repeated) return repeated
      const config = this.getConfigOrThrow(input)
      this.assertRevision(config, input.expectedRevision)
      if (config.lifecycle !== CONFIG_LIFECYCLE.ENABLED) {
        throw new RedundancyError(
          ERROR_CODE.CONFIG_DISABLED,
          '只有已生效配置支持在线 APP 维护',
          409,
        )
      }

      const normalizedChanges = this.normalizeChanges(config, input.changes)
      await this.validateAllApps(input.tenantId, config, normalizedChanges)
      const nextLists = this.calculateNextLists(config, normalizedChanges)
      // modified by jinlong.feng at 2026-10-09 冗余APP列表每侧至少一个
      this.assertBothSidesKeepApps(input.tenantId, [
        { nodeId: config.primaryNodeId, appIds: nextLists.primaryAppIds },
        { nodeId: config.standbyNodeId, appIds: nextLists.standbyAppIds },
      ])
      // end modified by jinlong.feng at 2026-10-09 冗余APP列表每侧至少一个
      const task = this.eventRepository.createOperationTask({
        tenantId: input.tenantId,
        requestId: input.requestId,
        redundancyId: input.redundancyId,
        redundancyName: config.name,
        operationType: 'APP_CHANGE',
        configRevision: config.revision,
        operator: input.operator,
        input: { changes: normalizedChanges, reason: input.reason || '' },
      })

      try {
        const inactiveNodeId = this.getOtherNodeId(config, config.activeNodeId)
        const inactiveAdds = this.getChange(normalizedChanges, inactiveNodeId).addAppIds
        await this.runActions(
          input,
          task,
          inactiveNodeId,
          inactiveAdds,
          'STOP',
          false,
          config.revision,
        )

        const updatedConfig = this.configRepository.withExpectedRevision(
          input.tenantId,
          input.redundancyId,
          input.expectedRevision,
          (current) => ({
            ...current,
            primaryAppIds: nextLists.primaryAppIds,
            standbyAppIds: nextLists.standbyAppIds,
            revision: current.revision + 1,
            updatedBy: input.operator,
            updatedAt: this.clock(),
          }),
        )

        await this.syncRoles(updatedConfig)
        const activeAdds = this.getChange(normalizedChanges, config.activeNodeId).addAppIds
        await this.runActions(
          input,
          task,
          config.activeNodeId,
          activeAdds,
          'START',
          true,
          updatedConfig.revision,
        )
        return this.eventRepository.updateOperationTask(input.tenantId, task.taskId, {
          status: 'SUCCEEDED',
          currentStage: 'COMPLETED',
          configRevision: updatedConfig.revision,
          result: {
            primaryAppIds: nextLists.primaryAppIds,
            standbyAppIds: nextLists.standbyAppIds,
          },
          finishedAt: this.clock(),
        })
      } catch (error) {
        return this.eventRepository.updateOperationTask(input.tenantId, task.taskId, {
          status: 'FAILED',
          currentStage: 'FAILED',
          failureMessage: error.message,
          result: error.details || null,
          finishedAt: this.clock(),
        })
      }
    })
  }

  /**
   * 标准化并校验变更结构和成员关系。
   *
   * @param {object} config 当前配置。
   * @param {object[]} changes 原始变更。
   * @returns {object[]} 标准化变更。
   */
  normalizeChanges(config, changes) {
    if (!Array.isArray(changes) || changes.length === 0) {
      throw new RedundancyError(ERROR_CODE.APP_INVALID, 'APP 变更不能为空')
    }
    const normalized = []
    const seenNodes = new Set()
    let totalChanges = 0
    for (const change of changes) {
      if (
        ![config.primaryNodeId, config.standbyNodeId].includes(change.nodeId) ||
        seenNodes.has(change.nodeId)
      ) {
        throw new RedundancyError(ERROR_CODE.APP_INVALID, 'APP 变更节点无效或重复')
      }
      seenNodes.add(change.nodeId)
      const addAppIds = this.normalizeIds(change.addAppIds)
      const removeAppIds = this.normalizeIds(change.removeAppIds)
      if (addAppIds.some((appId) => removeAppIds.includes(appId))) {
        throw new RedundancyError(ERROR_CODE.APP_INVALID, '同一 APP 不能同时新增和移出')
      }
      totalChanges += addAppIds.length + removeAppIds.length
      normalized.push({ nodeId: change.nodeId, addAppIds, removeAppIds })
    }
    if (totalChanges === 0) {
      throw new RedundancyError(ERROR_CODE.APP_INVALID, '至少需要一项实际 APP 变更')
    }
    for (const nodeId of [config.primaryNodeId, config.standbyNodeId]) {
      if (!seenNodes.has(nodeId)) normalized.push({ nodeId, addAppIds: [], removeAppIds: [] })
    }
    return normalized
  }

  /**
   * 一次性验证全部新增 APP 的存在性、部署和节点归属，以及移出成员关系。
   *
   * @param {string} tenantId 租户 ID。
   * @param {object} config 当前配置。
   * @param {object[]} changes 标准化变更。
   * @returns {Promise<void>}
   */
  async validateAllApps(tenantId, config, changes) {
    const managedIds = new Set([...config.primaryAppIds, ...config.standbyAppIds])
    for (const change of changes) {
      const currentIds = new Set(this.getAppIds(config, change.nodeId))
      for (const appId of change.addAppIds) {
        if (managedIds.has(appId)) {
          throw new RedundancyError(
            ERROR_CODE.APP_ALREADY_MANAGED,
            `APP「${this.appDisplayName(tenantId, appId)}」已纳入冗余`,
          )
        }
        const app = await Promise.resolve(this.stateProvider.getApp(tenantId, appId))
        if (!app || app.nodeId !== change.nodeId || !app.deployed) {
          throw new RedundancyError(
            ERROR_CODE.APP_INVALID,
            `APP「${this.appDisplayName(tenantId, appId)}」不存在、未部署或节点归属错误`,
          )
        }
      }
      for (const appId of change.removeAppIds) {
        if (!currentIds.has(appId)) {
          throw new RedundancyError(
            ERROR_CODE.APP_NOT_MANAGED,
            `APP「${this.appDisplayName(tenantId, appId)}」不在当前节点冗余列表中`,
          )
        }
      }
    }
  }

  // modified by jinlong.feng at 2026-10-09 冗余APP列表每侧至少一个
  /**
   * 确认变更后两侧 APP 列表都至少保留一个 APP。
   * 两侧全空的配置名存实亡却仍占用两个节点，单侧为空则切换后目标端没有任何可启动的 APP，
   * 因此与新建配置时的口径保持一致：主、从两侧各至少一个。
   *
   * @param {string} tenantId 租户 ID。
   * @param {Array<{nodeId: string, appIds: string[]}>} sides 两侧节点与变更后的 APP 列表。
   * @returns {void}
   */
  assertBothSidesKeepApps(tenantId, sides) {
    for (const side of sides) {
      if (side.appIds.length > 0) continue
      throw new RedundancyError(
        ERROR_CODE.APP_LIST_EMPTY,
        `节点「${this.nodeDisplayName(tenantId, side.nodeId)}」的冗余 APP 列表不能为空，请至少保留一个 APP`,
        409,
        { nodeId: side.nodeId },
      )
    }
  }

  /**
   * 解析节点可读名称。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} nodeId 节点 ID。
   * @returns {string} 可读名称；查询失败时回退为节点 ID。
   */
  nodeDisplayName(tenantId, nodeId) {
    try {
      const node =
        typeof this.stateProvider.getNode === 'function'
          ? this.stateProvider.getNode(tenantId, nodeId)
          : null
      if (node && node.nodeName) return node.nodeName
    } catch (error) {
      // 名称解析失败不影响校验判定，回退为节点 ID。
    }
    return nodeId
  }
  // end modified by jinlong.feng at 2026-10-09 冗余APP列表每侧至少一个

  // modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称
  /**
   * 解析 APP 的可读名称，用于替代提示文案里的 APP ID。
   * APP 已被删除时由状态适配器回退为最近一次已知名称。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} appId APP ID。
   * @returns {string} 可读名称。
   */
  appDisplayName(tenantId, appId) {
    return this.stateProvider.getAppDisplayName(tenantId, appId)
  }
  // end modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称

  /**
   * 计算一次 revision 更新后的两侧列表。
   *
   * @param {object} config 当前配置。
   * @param {object[]} changes 标准化变更。
   * @returns {{primaryAppIds: string[], standbyAppIds: string[]}} 新列表。
   */
  calculateNextLists(config, changes) {
    const updateList = (nodeId, current) => {
      const change = this.getChange(changes, nodeId)
      const removeSet = new Set(change.removeAppIds)
      return [...current.filter((appId) => !removeSet.has(appId)), ...change.addAppIds]
    }
    return {
      primaryAppIds: updateList(config.primaryNodeId, config.primaryAppIds),
      standbyAppIds: updateList(config.standbyNodeId, config.standbyAppIds),
    }
  }

  /**
   * 逐项执行新增 APP 的预处理或收敛命令。
   *
   * @param {object} input 请求。
   * @param {object} task 任务。
   * @param {string} nodeId 节点 ID。
   * @param {string[]} appIds APP ID。
   * @param {string} action START 或 STOP。
   * @param {boolean} continueOnError 是否继续后续项。
   * @param {number} revision 命令 revision。
   * @returns {Promise<void>}
   */
  async runActions(input, task, nodeId, appIds, action, continueOnError, revision) {
    const failures = []
    for (const appId of appIds) {
      const step = this.eventRepository.addAppStep({
        tenantId: input.tenantId,
        taskId: task.taskId,
        nodeId,
        appId,
        action,
        detail: { membershipAction: 'ADD' },
      })
      try {
        const result = await this.commandGateway.executeAndObserve({
          nodeId,
          appId,
          action,
          metadata: {
            internalRedundancy: true,
            tenantId: input.tenantId,
            operator: input.operator,
            redundancyId: input.redundancyId,
            revision,
            operationTaskId: task.taskId,
          },
        })
        this.eventRepository.updateAppStep(input.tenantId, step.stepId, {
          commandId: result.commandId,
          commandStatus: 'SUCCEEDED',
          observedStatus: result.observedStatus,
          finishedAt: this.clock(),
        })
      } catch (error) {
        this.eventRepository.updateAppStep(input.tenantId, step.stepId, {
          commandStatus: 'FAILED',
          failureMessage: error.message,
          finishedAt: this.clock(),
        })
        failures.push({ appId, message: error.message })
        if (!continueOnError) throw error
      }
    }
    if (failures.length > 0) {
      // modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称
      const error = new Error(
        `部分新增 APP 操作失败：${failures
          .map((item) => this.appDisplayName(input.tenantId, item.appId))
          .join('、')}`,
      )
      // end modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称
      error.details = { failures }
      throw error
    }
  }

  /** @param {object} config 最新配置。 @returns {Promise<void>} */
  async syncRoles(config) {
    const inactiveNodeId = this.getOtherNodeId(config, config.activeNodeId)
    await this.runtimeSynchronizer.syncNode({
      tenantId: config.tenantId,
      nodeId: inactiveNodeId,
      role: 'INACTIVE',
      revision: config.revision,
      appIds: this.getAppIds(config, inactiveNodeId),
    })
    await this.runtimeSynchronizer.syncNode({
      tenantId: config.tenantId,
      nodeId: config.activeNodeId,
      role: 'ACTIVE',
      revision: config.revision,
      appIds: this.getAppIds(config, config.activeNodeId),
    })
  }

  /** @param {object} input 请求。 @returns {object} 配置。 */
  getConfigOrThrow(input) {
    const config = this.configRepository.findById(input.tenantId, input.redundancyId)
    if (!config) throw new RedundancyError(ERROR_CODE.CONFIG_NOT_FOUND, '冗余配置不存在', 404)
    return config
  }

  /** @param {object} config 配置。 @param {number} revision revision。 @returns {void} */
  assertRevision(config, revision) {
    if (config.revision !== revision) {
      throw new RedundancyError(ERROR_CODE.REVISION_CONFLICT, '冗余配置已被其他操作更新', 409)
    }
  }

  /** @param {unknown} value ID 列表。 @returns {string[]} 标准化 ID。 */
  normalizeIds(value) {
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item)) {
      throw new RedundancyError(ERROR_CODE.APP_INVALID, 'APP ID 列表格式无效')
    }
    if (new Set(value).size !== value.length) {
      throw new RedundancyError(ERROR_CODE.APP_INVALID, 'APP ID 列表包含重复项')
    }
    return [...value]
  }

  /** @param {object[]} changes 变更。 @param {string} nodeId 节点 ID。 @returns {object} 节点变更。 */
  getChange(changes, nodeId) {
    return changes.find((change) => change.nodeId === nodeId)
  }

  /** @param {object} config 配置。 @param {string} nodeId 节点 ID。 @returns {string[]} APP ID。 */
  getAppIds(config, nodeId) {
    return nodeId === config.primaryNodeId ? config.primaryAppIds : config.standbyAppIds
  }

  /** @param {object} config 配置。 @param {string} nodeId 节点 ID。 @returns {string} 另一节点 ID。 */
  getOtherNodeId(config, nodeId) {
    return nodeId === config.primaryNodeId ? config.standbyNodeId : config.primaryNodeId
  }
}

module.exports = { AppMembershipService }
// end
