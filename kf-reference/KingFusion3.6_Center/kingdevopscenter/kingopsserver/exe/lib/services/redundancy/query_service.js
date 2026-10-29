// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

const { CONFIG_LIFECYCLE } = require('./constants')

/**
 * 聚合列表页和详情页需要的配置、节点、APP、异常与任务快照。
 */
class RedundancyQueryService {
  /**
   * @param {object} options 构造参数。
   * @param {object} options.configService 配置服务。
   * @param {object} options.stateAdapter 状态适配器。
   * @param {object} options.healthEvaluator 健康评估器。
   * @param {object} options.eventRepository 事件和任务仓库。
   */
  constructor({ configService, stateAdapter, healthEvaluator, eventRepository }) {
    this.configService = configService
    this.stateAdapter = stateAdapter
    this.healthEvaluator = healthEvaluator
    this.eventRepository = eventRepository
  }

  /**
   * 查询冗余配置列表聚合数据。
   *
   * @param {string} tenantId 租户 ID。
   * @returns {Promise<object[]>} 列表项。
   */
  async list(tenantId) {
    const configs = await this.configService.list(tenantId)
    const result = []
    for (const config of configs) {
      result.push(await this.buildAggregate(config, false))
    }
    return result
  }

  /**
   * 查询一套配置的完整聚合详情。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} redundancyId 冗余配置 ID。
   * @returns {Promise<object>} 配置详情。
   */
  async getDetail(tenantId, redundancyId) {
    const config = await this.configService.getDetail(tenantId, redundancyId)
    return this.buildAggregate(config, true)
  }

  /**
   * 聚合单套配置。
   *
   * @param {object} config 冗余配置。
   * @param {boolean} includeApps 是否返回完整 APP 列表。
   * @returns {Promise<object>} 聚合对象。
   */
  async buildAggregate(config, includeApps) {
    const nodes = await this.stateAdapter.snapshot(config)
    const health =
      config.lifecycle === CONFIG_LIFECYCLE.ENABLED
        ? await this.healthEvaluator.evaluate(config)
        : { healthStatus: 'DISABLED', reasons: [] }
    const openEvents = this.eventRepository.queryEvents({
      tenantId: config.tenantId,
      redundancyId: config.redundancyId,
      status: 'OPEN',
    })
    const tasks = this.eventRepository.queryOperationTasks({
      tenantId: config.tenantId,
      redundancyId: config.redundancyId,
      limit: 20,
    })
    const currentTask = tasks.find((task) => ['PENDING', 'RUNNING'].includes(task.status)) || null
    const lastSwitch = this.eventRepository.queryOperationTasks({
      tenantId: config.tenantId,
      redundancyId: config.redundancyId,
      operationType: 'SWITCH',
      status: 'SUCCEEDED',
      limit: 1,
    })[0]
    const aggregate = {
      ...config,
      healthStatus: health.healthStatus,
      healthReasons: health.reasons,
      primaryNode: this.summarizeNode(nodes.primary),
      standbyNode: this.summarizeNode(nodes.standby),
      primaryAppSummary: this.summarizeApps(
        nodes.primary.apps,
        config.activeNodeId === config.primaryNodeId,
      ),
      standbyAppSummary: this.summarizeApps(
        nodes.standby.apps,
        config.activeNodeId === config.standbyNodeId,
      ),
      openEventCount: openEvents.length,
      primaryOpenEvent: openEvents[0] || null,
      currentTask,
      lastSwitchAt: lastSwitch ? lastSwitch.finishedAt : null,
      allowedActions: this.getAllowedActions(config, currentTask),
    }
    if (includeApps) {
      aggregate.nodes = nodes
      aggregate.openEvents = openEvents
      aggregate.recentTasks = tasks
    }
    return aggregate
  }

  /**
   * 汇总节点字段，列表响应不携带 APP 明细。
   *
   * @param {object} node 节点快照。
   * @returns {object} 节点摘要。
   */
  summarizeNode(node) {
    const { apps, ...summary } = node
    return summary
  }

  /**
   * 统计 APP 运行、停止和角色不一致数量。
   *
   * @param {object[]} apps APP 快照。
   * @param {boolean} active 节点是否激活。
   * @returns {{total: number, running: number, stopped: number, abnormal: number}} APP 摘要。
   */
  summarizeApps(apps, active) {
    let running = 0
    let stopped = 0
    let abnormal = 0
    for (const app of apps) {
      if (app.running) running += 1
      else stopped += 1
      if (!app.exists || !app.deployed || (active ? !app.running : app.running)) {
        abnormal += 1
      }
    }
    return { total: apps.length, running, stopped, abnormal }
  }

  /**
   * 根据生命周期和当前任务返回后台认可的可用操作。
   *
   * @param {object} config 冗余配置。
   * @param {object|null} currentTask 当前任务。
   * @returns {string[]} 可用操作列表。
   */
  getAllowedActions(config, currentTask) {
    if (currentTask) return ['VIEW_TASK']
    if (config.lifecycle === CONFIG_LIFECYCLE.DISABLED) {
      return ['EDIT', 'DELETE', 'ENABLE']
    }
    return ['DISABLE', 'SWITCH', 'UPDATE_APPS']
  }
}

module.exports = { RedundancyQueryService }
// end
