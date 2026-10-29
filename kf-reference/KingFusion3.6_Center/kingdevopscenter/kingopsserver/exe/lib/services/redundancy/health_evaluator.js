// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

/**
 * 评估已生效冗余配置的节点、角色、revision 和 APP 实际状态。
 */
class HealthEvaluator {
  /**
   * @param {object} options 构造参数。
   * @param {{snapshot: Function}} options.stateAdapter 状态适配器。
   * @param {{listEnabledConfigs: Function}} [options.configProvider] 已生效配置提供器。
   * @param {object} [options.eventRepository] 事件仓库。
   * @param {{publish: Function}} [options.publisher] 状态变化发布器。
   * @param {() => string} [options.clock] ISO 时间提供器。
   */
  constructor({
    stateAdapter,
    configProvider = null,
    eventRepository = null,
    publisher = null,
    clock = () => new Date().toISOString(),
  }) {
    this.stateAdapter = stateAdapter
    this.configProvider = configProvider
    this.eventRepository = eventRepository
    this.publisher = publisher
    this.clock = clock
  }

  /**
   * 评估单套配置并返回完整原因列表。
   *
   * @param {object} config 已生效冗余配置。
   * @returns {Promise<object>} 健康评估结果。
   */
  async evaluate(config) {
    const nodes = await Promise.resolve(this.stateAdapter.snapshot(config))
    const reasons = []
    this.evaluateNode(config, nodes.primary, reasons)
    this.evaluateNode(config, nodes.standby, reasons)
    return {
      redundancyId: config.redundancyId,
      tenantId: config.tenantId,
      healthStatus: reasons.length === 0 ? 'NORMAL' : 'ABNORMAL',
      reasons,
      nodes,
      evaluatedAt: this.clock(),
    }
  }

  /**
   * 扫描全部已生效配置，只在原因集合变化时写事件并发布状态。
   *
   * @returns {Promise<object[]>} 本轮评估结果。
   */
  async scanEnabledConfigs() {
    if (!this.configProvider || !this.eventRepository) {
      return []
    }
    const configs = await Promise.resolve(this.configProvider.listEnabledConfigs())
    const results = []
    for (const config of configs) {
      if (this.hasRunningOperationTask(config)) {
        continue
      }
      const result = await this.evaluate(config)
      const existingEvents = this.eventRepository.queryEvents({
        tenantId: config.tenantId,
        redundancyId: config.redundancyId,
        status: 'OPEN',
      })
      const existingReasonKeys = new Set(existingEvents.map((event) => event.reasonKey))
      const existingEventsByReasonKey = new Map(
        existingEvents.map((event) => [event.reasonKey, event]),
      )
      const currentReasonKeys = new Set(result.reasons.map((reason) => reason.key))
      let changed = false

      for (const reason of result.reasons) {
        if (!existingReasonKeys.has(reason.key)) {
          this.eventRepository.openEvent({
            tenantId: config.tenantId,
            redundancyId: config.redundancyId,
            redundancyName: config.name,
            reasonKey: reason.key,
            eventType: reason.code,
            severity: 'ERROR',
            nodeId: reason.nodeId,
            appId: reason.appId,
            summary: reason.summary,
            detail: reason,
          })
          changed = true
        } else if (existingEventsByReasonKey.get(reason.key).summary !== reason.summary) {
          this.eventRepository.updateOpenEvent({
            tenantId: config.tenantId,
            redundancyId: config.redundancyId,
            reasonKey: reason.key,
            summary: reason.summary,
            detail: reason,
          })
        }
      }
      for (const event of existingEvents) {
        if (!currentReasonKeys.has(event.reasonKey)) {
          this.eventRepository.recoverEvent({
            tenantId: config.tenantId,
            redundancyId: config.redundancyId,
            reasonKey: event.reasonKey,
          })
          changed = true
        }
      }
      if (changed && this.publisher) {
        await Promise.resolve(this.publisher.publish('REDUNDANCY_STATUS_CHANGED', result))
      }
      results.push(result)
    }
    return results
  }

  /**
   * 判断冗余配置是否正在执行生效、切换或 APP 变更等操作。
   *
   * 操作期间节点角色、revision 和 APP 状态会逐步收敛，此时暂停事件变更，
   * 避免把正常的中间状态记录为异常。任务结束后下一轮扫描会自动恢复。
   *
   * @param {object} config 冗余配置。
   * @returns {boolean} 是否存在运行中或等待中的操作任务。
   */
  hasRunningOperationTask(config) {
    const latestTasks = this.eventRepository.queryOperationTasks({
      tenantId: config.tenantId,
      redundancyId: config.redundancyId,
      limit: 1,
    })
    return latestTasks.some((task) => ['PENDING', 'RUNNING'].includes(task.status))
  }

  /**
   * 评估一个节点及其受管 APP。
   *
   * @param {object} config 冗余配置。
   * @param {object} node 节点快照。
   * @param {object[]} reasons 原因输出数组。
   * @returns {void}
   */
  evaluateNode(config, node, reasons) {
    const active = config.activeNodeId === node.nodeId
    const expectedRole = active ? 'ACTIVE' : 'INACTIVE'
    const nodeName = node.nodeName || node.nodeId

    if (!node.online) {
      reasons.push(
        this.createReason(
          'REDUNDANCY_NODE_OFFLINE',
          node.nodeId,
          null,
          `节点「${nodeName}」离线`,
          null,
          nodeName,
        ),
      )
    }
    if (node.roleConfirmed === false || node.role !== expectedRole) {
      reasons.push(
        this.createReason(
          'REDUNDANCY_ROLE_NOT_CONFIRMED',
          node.nodeId,
          null,
          `节点「${nodeName}」角色未确认，期望 ${expectedRole}`,
          null,
          nodeName,
        ),
      )
    }
    if (node.syncedRevision !== config.revision) {
      reasons.push(
        this.createReason(
          'REDUNDANCY_REVISION_NOT_SYNCED',
          node.nodeId,
          null,
          `节点「${nodeName}」revision 未同步，期望 ${config.revision}`,
          null,
          nodeName,
        ),
      )
    }

    for (const app of node.apps) {
      const appName = app.appName || app.appId
      if (!app.exists) {
        reasons.push(
          this.createReason(
            'REDUNDANCY_APP_MISSING',
            node.nodeId,
            app.appId,
            `节点「${nodeName}」的配置 APP「${appName}」不存在`,
            appName,
            nodeName,
          ),
        )
        continue
      }
      if (app.nodeId !== node.nodeId) {
        reasons.push(
          this.createReason(
            'REDUNDANCY_APP_NODE_MISMATCH',
            node.nodeId,
            app.appId,
            `节点「${nodeName}」的 APP「${appName}」实际归属节点与配置不一致`,
            appName,
            nodeName,
          ),
        )
      }
      if (!app.deployed) {
        reasons.push(
          this.createReason(
            'REDUNDANCY_APP_NOT_DEPLOYED',
            node.nodeId,
            app.appId,
            `节点「${nodeName}」的配置 APP「${appName}」未部署`,
            appName,
            nodeName,
          ),
        )
      }
      if (active && !app.running) {
        reasons.push(
          this.createReason(
            'REDUNDANCY_ACTIVE_APP_OFFLINE',
            node.nodeId,
            app.appId,
            `节点「${nodeName}」的激活 APP「${appName}」未运行`,
            appName,
            nodeName,
          ),
        )
      }
      if (!active && app.running) {
        reasons.push(
          this.createReason(
            'REDUNDANCY_INACTIVE_APP_RUNNING',
            node.nodeId,
            app.appId,
            `节点「${nodeName}」的失活 APP「${appName}」仍在运行`,
            appName,
            nodeName,
          ),
        )
      }
    }
  }

  /**
   * 创建具有稳定去重键的健康原因。
   *
   * @param {string} code 原因码。
   * @param {string|null} nodeId 节点 ID。
   * @param {string|null} appId APP ID。
   * @param {string} summary 原因摘要。
   * @param {string|null} [appName=null] APP 名称。
   * @param {string|null} [nodeName=null] 节点名称。
   * @returns {object} 健康原因。
   */
  createReason(code, nodeId, appId, summary, appName = null, nodeName = null) {
    return {
      key: `${code}:${nodeId || ''}:${appId || ''}`,
      code,
      nodeId,
      nodeName,
      appId,
      appName,
      summary,
    }
  }
}

module.exports = { HealthEvaluator }
// end
