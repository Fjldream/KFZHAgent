// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

const { CONFIG_LIFECYCLE, ERROR_CODE } = require('./constants')
const { RedundancyError } = require('./errors')

/**
 * 在现有节点和 APP 操作入口执行冗余后台限制。
 */
class OperationGuard {
  /**
   * @param {object} options 构造参数。
   * @param {{list: Function}} options.configProvider 配置提供器。
   * @param {{getAppDisplayName: Function}} [options.stateAdapter] 状态适配器，用于把 APP ID 解析为可读名称。
   */
  constructor({ configProvider, stateAdapter = null }) {
    this.configProvider = configProvider
    // modified by jinlong.feng at 2026-10-09 冗余启动拦截提示APP名称
    // 受限提示需要显示 APP 名称而不是一串 APP ID；未注入适配器时回退为 APP ID，
    // 保持旧的构造方式（只传 configProvider）继续可用。
    this.stateAdapter = stateAdapter
    // end modified by jinlong.feng at 2026-10-09 冗余启动拦截提示APP名称
  }

  /**
   * 校验节点操作。任何未删除冗余配置中的节点都不允许删除。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} nodeId 节点 ID。
   * @param {string} action 操作类型。
   * @returns {void}
   */
  assertNodeOperation(tenantId, nodeId, action) {
    if (action !== 'DELETE') return
    const config = this.configProvider
      .list(tenantId)
      .find((item) => item.primaryNodeId === nodeId || item.standbyNodeId === nodeId)
    if (config) {
      throw new RedundancyError(
        ERROR_CODE.NODE_DELETE_FORBIDDEN,
        '节点已加入冗余配置，不允许删除',
        409,
        { nodeId, redundancyId: config.redundancyId }
      )
    }
  }

  /**
   * 校验单 APP 操作；受限时抛出带 APP 名称的异常。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} appId APP ID。
   * @param {string} action 操作类型。
   * @returns {void}
   */
  assertAppOperation(tenantId, appId, action) {
    const blocked = this.findBlockedAppOperation(tenantId, appId, action)
    if (!blocked) return
    throw this.createAppError(tenantId, blocked)
  }

  /**
   * 校验批量 APP 操作；任一 APP 受限时整批抛错。
   * 文案一次列出本批次全部受限 APP 名称，调用方无需逐个试探。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string[]} appIds APP ID 列表。
   * @param {string} action 操作类型。
   * @returns {void}
   */
  assertBatchOperation(tenantId, appIds, action) {
    const blockedList = []
    for (const appId of appIds) {
      const blocked = this.findBlockedAppOperation(tenantId, appId, action)
      if (blocked) blockedList.push(blocked)
    }
    if (blockedList.length === 0) return
    throw this.createBatchAppError(tenantId, blockedList)
  }

  /**
   * 判定单个 APP 在指定操作下是否受冗余限制。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} appId APP ID。
   * @param {string} action 操作类型。
   * @returns {object|null} 受限描述；不受限时返回 null。
   */
  findBlockedAppOperation(tenantId, appId, action) {
    const membership = this.findEnabledMembership(tenantId, appId)
    if (!membership) return null

    // modified by jinlong.feng at 2026-10-09 冗余受管APP禁止删除
    // 受管 APP 两侧都禁止删除：删除后配置里的 appId 不会自动清理，
    // 残留引用会让配置一直报「配置 APP 不存在」，并且无法再次生效。
    // 因此必须先在「修改 APP 列表」中解除冗余关系，再删除 APP 实体。
    if (action === 'DELETE') {
      return {
        appId,
        code: ERROR_CODE.APP_DELETE_FORBIDDEN,
        describe: (labels) =>
          `${labels.join('、')}已纳入冗余关系，请先在「修改 APP 列表」中移除后再删除`,
        membership
      }
    }
    // end modified by jinlong.feng at 2026-10-09 冗余受管APP禁止删除
    if (!membership.active && action === 'START') {
      return {
        appId,
        code: ERROR_CODE.INACTIVE_APP_START_FORBIDDEN,
        describe: (labels) => `失活节点的冗余 APP 不允许启动：${labels.join('、')}`,
        membership
      }
    }
    if (!membership.active && action === 'RESTART') {
      return {
        appId,
        code: ERROR_CODE.INACTIVE_APP_RESTART_FORBIDDEN,
        describe: (labels) => `失活节点的冗余 APP 不允许重启：${labels.join('、')}`,
        membership
      }
    }
    return null
  }

  /**
   * 查找 APP 在已生效配置中的角色。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} appId APP ID。
   * @returns {object|null} APP 冗余归属。
   */
  findEnabledMembership(tenantId, appId) {
    for (const config of this.configProvider.list(tenantId)) {
      if (config.lifecycle !== CONFIG_LIFECYCLE.ENABLED) continue
      if (config.primaryAppIds.includes(appId)) {
        return {
          config,
          nodeId: config.primaryNodeId,
          active: config.activeNodeId === config.primaryNodeId
        }
      }
      if (config.standbyAppIds.includes(appId)) {
        return {
          config,
          nodeId: config.standbyNodeId,
          active: config.activeNodeId === config.standbyNodeId
        }
      }
    }
    return null
  }

  // modified by jinlong.feng at 2026-10-09 冗余启动拦截提示APP名称
  /**
   * 解析 APP 的可读名称。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} appId APP ID。
   * @returns {string} 可读名称；无适配器或解析失败时回退为 APP ID。
   */
  resolveAppLabel(tenantId, appId) {
    if (this.stateAdapter && typeof this.stateAdapter.getAppDisplayName === 'function') {
      try {
        const label = this.stateAdapter.getAppDisplayName(tenantId, appId)
        if (label) return label
      } catch (error) {
        // 名称解析失败不影响限制判定，回退为 APP ID。
      }
    }
    return appId
  }

  /**
   * 把 APP 名称包装为提示文案片段。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} appId APP ID。
   * @returns {string} 形如 APP「KIO_XLZ」的文案片段。
   */
  formatAppLabel(tenantId, appId) {
    return `APP「${this.resolveAppLabel(tenantId, appId)}」`
  }
  // end modified by jinlong.feng at 2026-10-09 冗余启动拦截提示APP名称

  // modified by jinlong.feng at 2026-10-09 冗余受管APP禁止删除
  /**
   * 创建包含单个受限 APP 名称的异常。
   * 文案由受限项自己的 describe() 生成，删除受限与启停受限的句式不同。
   *
   * @param {string} tenantId 租户 ID。
   * @param {object} blocked 单个受限描述。
   * @returns {RedundancyError} 领域异常。
   */
  createAppError(tenantId, blocked) {
    return new RedundancyError(
      blocked.code,
      blocked.describe([this.formatAppLabel(tenantId, blocked.appId)]),
      409,
      {
        appId: blocked.appId,
        nodeId: blocked.membership.nodeId,
        redundancyId: blocked.membership.config.redundancyId
      }
    )
  }

  /**
   * 创建批量操作的异常，文案列出本批次全部受限 APP 名称。
   *
   * @param {string} tenantId 租户 ID。
   * @param {object[]} blockedList 本批次全部受限描述。
   * @returns {RedundancyError} 领域异常。
   */
  createBatchAppError(tenantId, blockedList) {
    const first = blockedList[0]
    const labels = blockedList.map((blocked) =>
      this.formatAppLabel(tenantId, blocked.appId)
    )
    return new RedundancyError(first.code, first.describe(labels), 409, {
      // 兼容既有调用方：appId 仍指向第一个受限 APP，appIds 给出本批次全部受限项。
      appId: first.appId,
      appIds: blockedList.map((blocked) => blocked.appId),
      nodeId: first.membership.nodeId,
      redundancyId: first.membership.config.redundancyId
    })
  }
  // end modified by jinlong.feng at 2026-10-09 冗余受管APP禁止删除
}

module.exports = { OperationGuard }
// end
