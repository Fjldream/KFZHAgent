// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

const { CONFIG_LIFECYCLE, ERROR_CODE } = require('./constants')
const { RedundancyError } = require('./errors')

/**
 * 管理未生效冗余配置及其领域校验，不依赖 HTTP 或产品全局变量。
 */
class ConfigService {
  /**
   * @param {object} options 构造参数。
   * @param {import('./config_repository').ConfigRepository} options.repository 配置仓库。
   * @param {{getNode: Function, getApp: Function}} options.stateProvider 节点和 APP 查询适配器。
   * @param {() => string} options.idFactory 配置 ID 工厂。
   * @param {() => string} [options.clock] ISO 时间提供器。
   */
  constructor({ repository, stateProvider, idFactory, clock = () => new Date().toISOString() }) {
    this.repository = repository
    this.stateProvider = stateProvider
    this.idFactory = idFactory
    this.clock = clock
  }

  /**
   * 新建未生效的冗余配置。
   *
   * @param {string} tenantId 租户 ID。
   * @param {object} input 配置输入。
   * @param {string} operator 操作人。
   * @returns {Promise<object>} 新配置。
   */
  async createConfig(tenantId, input, operator) {
    const normalizedInput = await this.validateAndNormalizeInput(tenantId, input)
    this.assertNodesAvailable(tenantId, normalizedInput)
    const now = this.clock()
    const config = {
      redundancyId: this.idFactory(),
      tenantId,
      ...normalizedInput,
      activeNodeId: null,
      lifecycle: CONFIG_LIFECYCLE.DISABLED,
      revision: 1,
      createdBy: operator,
      createdAt: now,
      updatedBy: operator,
      updatedAt: now
    }
    return this.repository.create(config)
  }

  /**
   * 编辑未生效配置。没有实际字段变化时不递增 revision。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} redundancyId 冗余配置 ID。
   * @param {number} expectedRevision 期望 revision。
   * @param {object} input 配置输入。
   * @param {string} operator 操作人。
   * @returns {Promise<object>} 更新后的配置。
   */
  async updateInactiveConfig(tenantId, redundancyId, expectedRevision, input, operator) {
    const normalizedInput = await this.validateAndNormalizeInput(
      tenantId,
      input,
      redundancyId
    )
    this.assertNodesAvailable(tenantId, normalizedInput, redundancyId)

    return this.repository.withExpectedRevision(
      tenantId,
      redundancyId,
      expectedRevision,
      (current) => {
        if (current.lifecycle !== CONFIG_LIFECYCLE.DISABLED) {
          throw new RedundancyError(
            ERROR_CODE.CONFIG_ENABLED,
            '只有未生效配置可以执行普通编辑',
            409
          )
        }

        const currentEditable = ConfigService.pickEditableFields(current)
        if (JSON.stringify(currentEditable) === JSON.stringify(normalizedInput)) {
          return current
        }

        return {
          ...current,
          ...normalizedInput,
          revision: current.revision + 1,
          updatedBy: operator,
          updatedAt: this.clock()
        }
      }
    )
  }

  /**
   * 删除未生效配置，删除后节点立即释放占用。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} redundancyId 冗余配置 ID。
   * @param {number} expectedRevision 期望 revision。
   * @returns {Promise<object>} 被删除配置。
   */
  async deleteConfig(tenantId, redundancyId, expectedRevision) {
    const current = this.repository.findById(tenantId, redundancyId)
    if (!current) {
      throw new RedundancyError(ERROR_CODE.CONFIG_NOT_FOUND, '冗余配置不存在', 404)
    }
    if (current.lifecycle !== CONFIG_LIFECYCLE.DISABLED) {
      throw new RedundancyError(ERROR_CODE.CONFIG_ENABLED, '已生效配置必须先停用', 409)
    }
    return this.repository.remove(tenantId, redundancyId, expectedRevision)
  }

  /**
   * 查询租户配置列表。
   *
   * @param {string} tenantId 租户 ID。
   * @returns {Promise<object[]>} 配置列表。
   */
  async list(tenantId) {
    return this.repository.list(tenantId)
  }

  /**
   * 查询配置详情。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} redundancyId 冗余配置 ID。
   * @returns {Promise<object>} 配置详情。
   */
  async getDetail(tenantId, redundancyId) {
    const config = this.repository.findById(tenantId, redundancyId)
    if (!config) {
      throw new RedundancyError(ERROR_CODE.CONFIG_NOT_FOUND, '冗余配置不存在', 404)
    }
    return config
  }

  /**
   * 查询节点下可用于配置的 APP，并标记当前配置已经选择的项目。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} nodeId 节点 ID。
   * @param {string|null} [redundancyId=null] 当前配置 ID，新建时传 null。
   * @returns {Promise<object[]>} APP 候选列表。
   */
  async getAppCandidates(tenantId, nodeId, redundancyId = null) {
    await this.assertNodeExists(tenantId, nodeId)

    const occupyingConfig = this.repository
      .list(tenantId)
      .find(
        (config) =>
          config.redundancyId !== redundancyId &&
          (config.primaryNodeId === nodeId || config.standbyNodeId === nodeId)
      )
    if (occupyingConfig) {
      throw new RedundancyError(
        ERROR_CODE.NODE_ALREADY_ASSIGNED,
        '节点已被其他冗余配置占用',
        409,
        { conflictRedundancyId: occupyingConfig.redundancyId }
      )
    }

    const currentConfig = redundancyId
      ? this.repository.findById(tenantId, redundancyId)
      : null
    const selectedAppIds = new Set()
    if (currentConfig && currentConfig.primaryNodeId === nodeId) {
      currentConfig.primaryAppIds.forEach((appId) => selectedAppIds.add(appId))
    }
    if (currentConfig && currentConfig.standbyNodeId === nodeId) {
      currentConfig.standbyAppIds.forEach((appId) => selectedAppIds.add(appId))
    }

    const apps = await Promise.resolve(this.stateProvider.listApps(tenantId, nodeId))
    return apps.map((app) => ({ ...app, selected: selectedAppIds.has(app.appId) }))
  }

  /**
   * 校验并标准化新建或编辑输入。
   *
   * @param {string} tenantId 租户 ID。
   * @param {object} input 原始输入。
   * @param {string} [excludedRedundancyId] 编辑时排除的当前配置 ID。
   * @returns {Promise<object>} 标准化输入。
   */
  async validateAndNormalizeInput(tenantId, input, excludedRedundancyId) {
    const normalized = {
      name: typeof input.name === 'string' ? input.name.trim() : '',
      primaryNodeId: input.primaryNodeId,
      standbyNodeId: input.standbyNodeId,
      initialActiveNodeId: input.initialActiveNodeId,
      primaryAppIds: ConfigService.normalizeIdList(input.primaryAppIds),
      standbyAppIds: ConfigService.normalizeIdList(input.standbyAppIds)
    }

    // modified by jinlong.feng at 2026-10-09 冗余配置名称重名校验
    // 名称用于列表、异常事件、操作任务和第三方订阅消息的展示，必须非空且同租户内唯一。
    if (!normalized.name) {
      throw new RedundancyError(ERROR_CODE.CONFIG_NAME_INVALID, '请填写冗余配置名称', 400)
    }
    this.assertNameAvailable(tenantId, normalized.name, excludedRedundancyId)
    // end modified by jinlong.feng at 2026-10-09 冗余配置名称重名校验

    // modified by jinlong.feng at 2026-10-09 冗余APP列表每侧至少一个
    this.assertBothSidesKeepApps(tenantId, [
      { nodeId: normalized.primaryNodeId, appIds: normalized.primaryAppIds },
      { nodeId: normalized.standbyNodeId, appIds: normalized.standbyAppIds }
    ])
    // end modified by jinlong.feng at 2026-10-09 冗余APP列表每侧至少一个

    if (
      !normalized.primaryNodeId ||
      !normalized.standbyNodeId ||
      normalized.primaryNodeId === normalized.standbyNodeId
    ) {
      throw new RedundancyError(ERROR_CODE.NODE_INVALID, '主节点和从节点必须是两个不同节点')
    }
    if (
      normalized.initialActiveNodeId !== normalized.primaryNodeId &&
      normalized.initialActiveNodeId !== normalized.standbyNodeId
    ) {
      throw new RedundancyError(
        ERROR_CODE.INITIAL_ACTIVE_NODE_INVALID,
        '首次激活节点必须是配置中的主节点或从节点'
      )
    }

    await this.assertNodeExists(tenantId, normalized.primaryNodeId)
    await this.assertNodeExists(tenantId, normalized.standbyNodeId)
    await this.assertAppsBelongToNode(
      tenantId,
      normalized.primaryNodeId,
      normalized.primaryAppIds
    )
    await this.assertAppsBelongToNode(
      tenantId,
      normalized.standbyNodeId,
      normalized.standbyAppIds
    )

    const allAppIds = [...normalized.primaryAppIds, ...normalized.standbyAppIds]
    if (new Set(allAppIds).size !== allAppIds.length) {
      throw new RedundancyError(ERROR_CODE.APP_INVALID, '同一 APP 不能同时出现在两侧配置中')
    }
    return normalized
  }

  /**
   * 确认节点存在于当前租户。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} nodeId 节点 ID。
   * @returns {Promise<void>}
   */
  async assertNodeExists(tenantId, nodeId) {
    const node = await Promise.resolve(this.stateProvider.getNode(tenantId, nodeId))
    if (!node) {
      throw new RedundancyError(ERROR_CODE.NODE_INVALID, `节点 ${nodeId} 不存在`)
    }
  }

  /**
   * 确认全部 APP 存在且属于指定节点。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} nodeId 节点 ID。
   * @param {string[]} appIds APP ID 列表。
   * @returns {Promise<void>}
   */
  async assertAppsBelongToNode(tenantId, nodeId, appIds) {
    for (const appId of appIds) {
      const app = await Promise.resolve(this.stateProvider.getApp(tenantId, appId))
      if (!app || app.nodeId !== nodeId) {
        // modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称
        const appName = this.stateProvider.getAppDisplayName(tenantId, appId)
        // end modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称
        throw new RedundancyError(
          ERROR_CODE.APP_INVALID,
          `APP「${appName}」不存在或不属于节点 ${nodeId}`,
          400,
          { appId, nodeId }
        )
      }
    }
  }

  /**
   * 确认主从节点未被其他未删除配置占用。
   *
   * @param {string} tenantId 租户 ID。
   * @param {object} input 标准化配置输入。
   * @param {string} [excludedRedundancyId] 编辑时排除的当前配置 ID。
   * @returns {void}
   */
  assertNodesAvailable(tenantId, input, excludedRedundancyId) {
    const requestedNodeIds = new Set([input.primaryNodeId, input.standbyNodeId])
    const conflict = this.repository.list(tenantId).find(
      (config) =>
        config.redundancyId !== excludedRedundancyId &&
        (requestedNodeIds.has(config.primaryNodeId) || requestedNodeIds.has(config.standbyNodeId))
    )
    if (conflict) {
      throw new RedundancyError(
        ERROR_CODE.NODE_ALREADY_ASSIGNED,
        '所选节点已被其他冗余配置占用',
        409,
        { conflictRedundancyId: conflict.redundancyId }
      )
    }
  }

  // modified by jinlong.feng at 2026-10-09 冗余配置名称重名校验
  /**
   * 确认同一租户下不存在同名冗余配置。已删除配置不占用名称，可直接复用。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} name 标准化后的配置名称。
   * @param {string} [excludedRedundancyId] 编辑时排除的当前配置 ID。
   * @returns {void}
   */
  assertNameAvailable(tenantId, name, excludedRedundancyId) {
    const conflict = this.repository
      .list(tenantId)
      .find(
        (config) => config.redundancyId !== excludedRedundancyId && config.name === name
      )
    if (conflict) {
      throw new RedundancyError(
        ERROR_CODE.CONFIG_NAME_DUPLICATED,
        `已存在同名冗余配置「${name}」`,
        409,
        { name, conflictRedundancyId: conflict.redundancyId }
      )
    }
  }
  // end modified by jinlong.feng at 2026-10-09 冗余配置名称重名校验

  // modified by jinlong.feng at 2026-10-09 冗余APP列表每侧至少一个
  /**
   * 确认两侧 APP 列表都至少保留一个 APP。
   * 两侧全空的配置名存实亡却仍占用两个节点，单侧为空则切换后目标端没有任何可启动的 APP，
   * 因此与前端新建时的口径保持一致：主、从两侧各至少一个。
   *
   * @param {string} tenantId 租户 ID。
   * @param {Array<{nodeId: string, appIds: string[]}>} sides 两侧节点与 APP 列表。
   * @returns {void}
   */
  assertBothSidesKeepApps(tenantId, sides) {
    for (const side of sides) {
      if (side.appIds.length > 0) continue
      throw new RedundancyError(
        ERROR_CODE.APP_LIST_EMPTY,
        `节点「${this.nodeDisplayName(tenantId, side.nodeId)}」的冗余 APP 列表不能为空，请至少保留一个 APP`,
        409,
        { nodeId: side.nodeId }
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

  /**
   * 对 ID 列表做基础类型校验，保留原顺序。
   *
   * @param {unknown} value 原始列表。
   * @returns {string[]} 标准化列表。
   */
  static normalizeIdList(value) {
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item)) {
      throw new RedundancyError(ERROR_CODE.APP_INVALID, 'APP 列表格式无效')
    }
    if (new Set(value).size !== value.length) {
      throw new RedundancyError(ERROR_CODE.APP_INVALID, 'APP 列表不能包含重复项')
    }
    return [...value]
  }

  /**
   * 提取未生效状态允许编辑的字段。
   *
   * @param {object} config 完整配置。
   * @returns {object} 可编辑字段。
   */
  static pickEditableFields(config) {
    return {
      name: config.name,
      primaryNodeId: config.primaryNodeId,
      standbyNodeId: config.standbyNodeId,
      initialActiveNodeId: config.initialActiveNodeId,
      primaryAppIds: config.primaryAppIds,
      standbyAppIds: config.standbyAppIds
    }
  }
}

module.exports = { ConfigService }
// end
