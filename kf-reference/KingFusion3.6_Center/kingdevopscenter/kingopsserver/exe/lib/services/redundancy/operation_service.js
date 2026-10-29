// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

const { CONFIG_LIFECYCLE, ERROR_CODE } = require('./constants')
const { RedundancyError } = require('./errors')

/**
 * 编排首次生效、停用和人工切换，所有 APP 命令均逐项记录。
 */
class OperationService {
  /**
   * @param {object} options 构造参数。
   * @param {object} options.configRepository 配置仓库。
   * @param {object} options.stateAdapter 状态适配器。
   * @param {object} options.commandGateway APP 命令网关。
   * @param {object} options.runtimeSynchronizer 节点角色同步器。
   * @param {object} options.eventRepository 任务仓库。
   * @param {object} options.mutex 按配置 ID 互斥器。
   * @param {() => string} [options.clock] ISO 时间提供器。
   */
  constructor({
    configRepository,
    stateAdapter,
    commandGateway,
    runtimeSynchronizer,
    eventRepository,
    mutex,
    clock = () => new Date().toISOString(),
  }) {
    this.configRepository = configRepository
    this.stateAdapter = stateAdapter
    this.commandGateway = commandGateway
    this.runtimeSynchronizer = runtimeSynchronizer
    this.eventRepository = eventRepository
    this.mutex = mutex
    this.clock = clock
  }

  /**
   * 首次生效配置。
   *
   * @param {object} input 生效请求。
   * @returns {Promise<object>} 操作任务。
   */
  async enable(input) {
    return this.runIdempotent(input, 'ENABLE', async () => {
      const config = this.getConfigOrThrow(input.tenantId, input.redundancyId)
      this.assertRevision(config, input.expectedRevision)
      if (config.lifecycle !== CONFIG_LIFECYCLE.DISABLED) {
        throw new RedundancyError(ERROR_CODE.CONFIG_ENABLED, '冗余配置已经生效', 409)
      }
      const snapshot = await this.stateAdapter.snapshot(config)
      this.assertNodeOnline(snapshot.primary)
      this.assertNodeOnline(snapshot.standby)
      this.assertAppsReady(snapshot.primary.apps)
      this.assertAppsReady(snapshot.standby.apps)

      const activeNodeId = config.initialActiveNodeId
      const inactiveSide = this.getSide(config, snapshot, this.getOtherNodeId(config, activeNodeId))
      const activeSide = this.getSide(config, snapshot, activeNodeId)
      const task = this.createTask(input, 'ENABLE', config)

      try {
        this.updateTask(input, task.taskId, { currentStage: 'STOP_INACTIVE_APPS' })
        await this.runAppActions(input, task, inactiveSide, 'STOP')
        const updatedConfig = this.persistRole(config, input.expectedRevision, activeNodeId)

        this.updateTask(input, task.taskId, { currentStage: 'SYNC_ROLES' })
        await this.syncRoles(updatedConfig, inactiveSide.nodeId, activeNodeId)

        this.updateTask(input, task.taskId, { currentStage: 'START_ACTIVE_APPS' })
        task.configRevision = updatedConfig.revision
        await this.runAppActions(input, task, activeSide, 'START')
        return this.finishTask(input, task.taskId, 'SUCCEEDED', updatedConfig.revision)
      } catch (error) {
        return this.failTask(input, task.taskId, error)
      }
    })
  }

  /**
   * 停用配置，只解除冗余管控，不发送 APP 命令。
   *
   * @param {object} input 停用请求。
   * @returns {Promise<object>} 操作任务。
   */
  async disable(input) {
    return this.runIdempotent(input, 'DISABLE', async () => {
      const config = this.getConfigOrThrow(input.tenantId, input.redundancyId)
      this.assertRevision(config, input.expectedRevision)
      if (config.lifecycle !== CONFIG_LIFECYCLE.ENABLED) {
        throw new RedundancyError(ERROR_CODE.CONFIG_DISABLED, '冗余配置尚未生效', 409)
      }
      const task = this.createTask(input, 'DISABLE', config)
      const updated = this.configRepository.withExpectedRevision(
        input.tenantId,
        input.redundancyId,
        input.expectedRevision,
        (current) => ({
          ...current,
          lifecycle: CONFIG_LIFECYCLE.DISABLED,
          activeNodeId: null,
          revision: current.revision + 1,
          updatedBy: input.operator,
          updatedAt: this.clock(),
        }),
      )
      // modified by jinlong.feng at 2026-10-08 冗余停用关闭异常事件
      // 配置停用后不再参与健康扫描，其未恢复异常不会被评估器自动收敛，
      // 必须在此主动关闭，否则通知中心会长期残留已解除管控的异常。
      // 关闭失败只记录日志，不改变停用结果（配置已成功落盘）。
      try {
        this.eventRepository.recoverOpenEventsByRedundancy(
          input.tenantId,
          input.redundancyId,
        )
      } catch (error) {
        logger.log('error', `停用冗余配置时关闭未恢复异常失败: ${error.message}`)
      }
      // end modified by jinlong.feng at 2026-10-08 冗余停用关闭异常事件
      return this.finishTask(input, task.taskId, 'SUCCEEDED', updated.revision)
    })
  }

  /**
   * 人工切换激活节点。
   *
   * @param {object} input 切换请求。
   * @returns {Promise<object>} 操作任务。
   */
  async switchNode(input) {
    return this.runIdempotent(input, 'SWITCH', async () => {
      const config = this.getConfigOrThrow(input.tenantId, input.redundancyId)
      this.assertRevision(config, input.expectedRevision)
      if (config.lifecycle !== CONFIG_LIFECYCLE.ENABLED) {
        throw new RedundancyError(ERROR_CODE.CONFIG_DISABLED, '未生效配置不能切换节点', 409)
      }
      if (input.force && (!input.reason || !input.reason.trim())) {
        throw new RedundancyError(ERROR_CODE.FORCE_REASON_REQUIRED, '强制切换必须填写原因', 400)
      }
      if (
        input.targetNodeId !== config.primaryNodeId &&
        input.targetNodeId !== config.standbyNodeId
      ) {
        throw new RedundancyError(ERROR_CODE.TARGET_NODE_INVALID, '目标节点不属于当前冗余配置')
      }
      if (input.targetNodeId === config.activeNodeId) {
        throw new RedundancyError(ERROR_CODE.TARGET_NODE_INVALID, '目标节点已经处于激活状态')
      }

      const snapshot = await this.stateAdapter.snapshot(config)
      const sourceSide = this.getSide(config, snapshot, config.activeNodeId)
      const targetSide = this.getSide(config, snapshot, input.targetNodeId)
      this.assertNodeOnline(targetSide)
      this.assertAppsReady(targetSide.apps)
      if (!sourceSide.online && !input.force) {
        throw new RedundancyError(
          ERROR_CODE.NODE_OFFLINE,
          '源节点离线，请确认后使用强制切换',
          409,
          {
            nodeId: sourceSide.nodeId,
          },
        )
      }

      const skipOfflineSource = !sourceSide.online && input.force
      const taskInput = skipOfflineSource
        ? {
            ...input,
            skippedActions: [
              {
                action: 'STOP_SOURCE_APPS',
                nodeId: sourceSide.nodeId,
                reasonCode: 'SOURCE_NODE_OFFLINE',
              },
              {
                action: 'CONFIRM_SOURCE_ROLE',
                nodeId: sourceSide.nodeId,
                reasonCode: 'SOURCE_NODE_OFFLINE',
              },
            ],
          }
        : input
      const task = this.createTask(taskInput, 'SWITCH', config)
      try {
        if (sourceSide.online) {
          this.updateTask(input, task.taskId, { currentStage: 'STOP_SOURCE_APPS' })
          await this.runAppActions(input, task, sourceSide, 'STOP')
        }
        const updatedConfig = this.persistRole(config, input.expectedRevision, input.targetNodeId)

        this.updateTask(input, task.taskId, { currentStage: 'SYNC_ROLES' })
        await this.syncRoles(updatedConfig, sourceSide.nodeId, targetSide.nodeId, {
          skipInactive: skipOfflineSource,
        })

        this.updateTask(input, task.taskId, { currentStage: 'START_TARGET_APPS' })
        task.configRevision = updatedConfig.revision
        await this.runAppActions(input, task, targetSide, 'START')
        return this.finishTask(input, task.taskId, 'SUCCEEDED', updatedConfig.revision)
      } catch (error) {
        return this.failTask(input, task.taskId, error)
      }
    })
  }

  /**
   * 在 requestId 幂等和配置互斥边界内执行操作。
   *
   * @param {object} input 操作输入。
   * @param {string} operationType 操作类型。
   * @param {Function} action 实际操作。
   * @returns {Promise<object>} 操作任务。
   */
  async runIdempotent(input, operationType, action) {
    const existing = this.eventRepository.findByRequestId(input.tenantId, input.requestId)
    if (existing) return existing
    return this.mutex.runExclusive(input.redundancyId, async () => {
      const repeated = this.eventRepository.findByRequestId(input.tenantId, input.requestId)
      if (repeated) return repeated
      return action(operationType)
    })
  }

  /**
   * 一次执行节点侧 APP 集合，并保留逐 APP 步骤记录。
   *
   * @param {object} input 操作输入。
   * @param {object} task 操作任务。
   * @param {object} side 节点侧快照。
   * @param {string} action START 或 STOP。
   * @returns {Promise<void>}
   */
  async runAppActions(input, task, side, action) {
    const apps = Array.isArray(side.apps) ? side.apps : []
    const stepsByAppId = new Map()
    for (const app of apps) {
      stepsByAppId.set(app.appId, this.eventRepository.addAppStep({
        tenantId: input.tenantId,
        taskId: task.taskId,
        nodeId: side.nodeId,
        appId: app.appId,
        action,
        detail: { redundancyId: input.redundancyId },
      }))
    }
    if (apps.length === 0) return

    const updateStep = (result) => {
      const step = stepsByAppId.get(result.appId)
      if (!step) return
      const terminal = ['SUCCEEDED', 'FAILED', 'UNKNOWN'].includes(result.commandStatus)
      this.eventRepository.updateAppStep(input.tenantId, step.stepId, {
        commandId: result.commandId || null,
        commandStatus: result.commandStatus,
        observedStatus: result.observedStatus || null,
        failureMessage: result.message || null,
        finishedAt: terminal ? this.clock() : null,
      })
    }

    let batchResult
    try {
      batchResult = await this.commandGateway.executeManyAndObserve({
        nodeId: side.nodeId,
        appIds: apps.map((app) => app.appId),
        action,
        metadata: {
          internalRedundancy: true,
          tenantId: input.tenantId,
          operator: input.operator,
          redundancyId: input.redundancyId,
          revision: task.configRevision,
          operationTaskId: task.taskId,
        },
        onProgress: ({ result }) => updateStep(result),
      })
    } catch (error) {
      for (const app of apps) {
        updateStep({ appId: app.appId, commandStatus: 'UNKNOWN', message: error.message })
      }
      throw error
    }

    for (const result of batchResult.results || []) updateStep(result)
    const failures = (batchResult.results || []).filter(
      (result) => result.commandStatus !== 'SUCCEEDED',
    )
    if (failures.length > 0) {
      // modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称
      const error = new Error(
        `部分 APP 操作失败：${failures
          .map((item) => this.stateAdapter.getAppDisplayName(input.tenantId, item.appId))
          .join('、')}`,
      )
      // end modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称
      error.details = { failures }
      throw error
    }
  }

  /**
   * 持久化激活角色并递增 revision。
   *
   * @param {object} config 当前配置。
   * @param {number} expectedRevision 期望 revision。
   * @param {string} activeNodeId 新激活节点 ID。
   * @returns {object} 更新后的配置。
   */
  persistRole(config, expectedRevision, activeNodeId) {
    return this.configRepository.withExpectedRevision(
      config.tenantId,
      config.redundancyId,
      expectedRevision,
      (current) => ({
        ...current,
        lifecycle: CONFIG_LIFECYCLE.ENABLED,
        activeNodeId,
        revision: current.revision + 1,
        updatedAt: this.clock(),
      }),
    )
  }

  /**
   * 先同步失活端，再同步激活端。
   *
   * @param {object} config 最新配置。
   * @param {string} inactiveNodeId 失活节点 ID。
   * @param {string} activeNodeId 激活节点 ID。
   * @param {object} [options] 同步选项。
   * @param {boolean} [options.skipInactive=false] 是否跳过失活节点确认。
   * @returns {Promise<void>}
   */
  async syncRoles(config, inactiveNodeId, activeNodeId, { skipInactive = false } = {}) {
    if (!skipInactive) {
      await this.runtimeSynchronizer.syncNode({
        tenantId: config.tenantId,
        nodeId: inactiveNodeId,
        role: 'INACTIVE',
        revision: config.revision,
        appIds: this.getAppIds(config, inactiveNodeId),
      })
    }
    await this.runtimeSynchronizer.syncNode({
      tenantId: config.tenantId,
      nodeId: activeNodeId,
      role: 'ACTIVE',
      revision: config.revision,
      appIds: this.getAppIds(config, activeNodeId),
    })
  }

  /** @param {object} input 输入。 @param {string} type 类型。 @param {object} config 配置。 @returns {object} 任务。 */
  createTask(input, type, config) {
    return this.eventRepository.createOperationTask({
      tenantId: input.tenantId,
      requestId: input.requestId,
      redundancyId: input.redundancyId,
      redundancyName: config.name,
      operationType: type,
      configRevision: config.revision,
      operator: input.operator,
      input,
    })
  }

  /** @param {object} input 输入。 @param {string} taskId 任务 ID。 @param {object} patch 更新。 @returns {object} 任务。 */
  updateTask(input, taskId, patch) {
    return this.eventRepository.updateOperationTask(input.tenantId, taskId, patch)
  }

  /** @param {object} input 输入。 @param {string} taskId 任务 ID。 @param {string} status 状态。 @param {number} revision revision。 @returns {object} 任务。 */
  finishTask(input, taskId, status, revision) {
    return this.updateTask(input, taskId, {
      status,
      currentStage: 'COMPLETED',
      configRevision: revision,
      finishedAt: this.clock(),
    })
  }

  /** @param {object} input 输入。 @param {string} taskId 任务 ID。 @param {Error} error 异常。 @returns {object} 失败任务。 */
  failTask(input, taskId, error) {
    return this.updateTask(input, taskId, {
      status: 'FAILED',
      currentStage: 'FAILED',
      failureMessage: error.message,
      result: error.details || null,
      finishedAt: this.clock(),
    })
  }

  /** @param {string} tenantId 租户 ID。 @param {string} redundancyId 配置 ID。 @returns {object} 配置。 */
  getConfigOrThrow(tenantId, redundancyId) {
    const config = this.configRepository.findById(tenantId, redundancyId)
    if (!config) {
      throw new RedundancyError(ERROR_CODE.CONFIG_NOT_FOUND, '冗余配置不存在', 404)
    }
    return config
  }

  /** @param {object} config 配置。 @param {number} expectedRevision 期望 revision。 @returns {void} */
  assertRevision(config, expectedRevision) {
    if (config.revision !== expectedRevision) {
      throw new RedundancyError(ERROR_CODE.REVISION_CONFLICT, '冗余配置已被其他操作更新', 409)
    }
  }

  /** @param {object} node 节点快照。 @returns {void} */
  assertNodeOnline(node) {
    if (!node.online) {
      throw new RedundancyError(ERROR_CODE.NODE_OFFLINE, '冗余节点离线', 409, {
        nodeId: node.nodeId,
      })
    }
  }

  /** @param {object[]} apps APP 快照。 @returns {void} */
  assertAppsReady(apps) {
    const invalid = apps.find((app) => !app.exists || !app.deployed)
    if (invalid) {
      throw new RedundancyError(ERROR_CODE.APP_INVALID, '冗余 APP 不存在或尚未部署', 409, {
        appId: invalid.appId,
      })
    }
  }

  /** @param {object} config 配置。 @param {object} snapshot 快照。 @param {string} nodeId 节点 ID。 @returns {object} 节点侧快照。 */
  getSide(config, snapshot, nodeId) {
    return nodeId === config.primaryNodeId ? snapshot.primary : snapshot.standby
  }

  /** @param {object} config 配置。 @param {string} nodeId 节点 ID。 @returns {string} 另一节点 ID。 */
  getOtherNodeId(config, nodeId) {
    return nodeId === config.primaryNodeId ? config.standbyNodeId : config.primaryNodeId
  }

  /** @param {object} config 配置。 @param {string} nodeId 节点 ID。 @returns {string[]} APP ID 列表。 */
  getAppIds(config, nodeId) {
    return nodeId === config.primaryNodeId ? config.primaryAppIds : config.standbyAppIds
  }
}

module.exports = { OperationService }
// end
