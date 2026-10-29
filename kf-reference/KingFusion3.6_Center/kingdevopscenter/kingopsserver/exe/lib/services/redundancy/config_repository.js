// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

const { ERROR_CODE } = require('./constants')
const { RedundancyError } = require('./errors')

/**
 * 对冗余配置 JSON 文档提供租户隔离、乐观锁和不可变返回值。
 */
class ConfigRepository {
  /**
   * @param {object} options 构造参数。
   * @param {import('./atomic_json_store').AtomicJsonStore} options.store JSON 存储。
   * @param {() => string} [options.clock] ISO 时间提供器。
   */
  constructor({ store, clock = () => new Date().toISOString() }) {
    this.store = store
    this.clock = clock
  }

  /**
   * 查询租户的全部配置。
   *
   * @param {string} tenantId 租户 ID。
   * @returns {object[]} 配置列表副本。
   */
  list(tenantId) {
    return this.store
      .read()
      .configs.filter((config) => config.tenantId === tenantId)
      .map(ConfigRepository.clone)
  }

  /**
   * 按 ID 查询配置。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} redundancyId 冗余配置 ID。
   * @returns {object|null} 配置副本或 null。
   */
  findById(tenantId, redundancyId) {
    const config = this.store
      .read()
      .configs.find(
        (item) => item.tenantId === tenantId && item.redundancyId === redundancyId
      )
    return config ? ConfigRepository.clone(config) : null
  }

  /**
   * 新建配置。同一租户已存在同名配置时拒绝写入。
   *
   * @param {object} config 完整配置对象。
   * @throws {RedundancyError} 同一租户已存在同名配置时抛出。
   * @returns {object} 已保存的配置副本。
   */
  create(config) {
    const document = this.store.read()
    // modified by jinlong.feng at 2026-10-09 冗余配置名称重名校验
    // 存储层兜底：create 是同步读改写，可拦住并发创建时两个请求都通过业务校验的同名配置。
    // 只在写入路径校验，不在 read 路径校验 —— 现场已存在的历史同名数据不能导致服务起不来。
    const duplicated = document.configs.find(
      (item) => item.tenantId === config.tenantId && item.name === config.name
    )
    if (duplicated) {
      throw new RedundancyError(
        ERROR_CODE.CONFIG_NAME_DUPLICATED,
        `已存在同名冗余配置「${config.name}」`,
        409,
        { name: config.name, conflictRedundancyId: duplicated.redundancyId }
      )
    }
    // end modified by jinlong.feng at 2026-10-09 冗余配置名称重名校验
    document.configs.push(ConfigRepository.clone(config))
    document.updatedAt = this.clock()
    this.store.write(document)
    return ConfigRepository.clone(config)
  }

  /**
   * 在 revision 匹配时更新配置。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} redundancyId 冗余配置 ID。
   * @param {number} expectedRevision 调用方期望的 revision。
   * @param {(current: object) => object} updater 配置转换函数。
   * @returns {object} 更新后的配置副本。
   */
  withExpectedRevision(tenantId, redundancyId, expectedRevision, updater) {
    const document = this.store.read()
    const index = document.configs.findIndex(
      (item) => item.tenantId === tenantId && item.redundancyId === redundancyId
    )
    if (index < 0) {
      throw new RedundancyError(ERROR_CODE.CONFIG_NOT_FOUND, '冗余配置不存在', 404)
    }

    const current = document.configs[index]
    if (current.revision !== expectedRevision) {
      throw new RedundancyError(ERROR_CODE.REVISION_CONFLICT, '冗余配置已被其他操作更新', 409, {
        expectedRevision,
        actualRevision: current.revision
      })
    }

    const next = updater(ConfigRepository.clone(current))
    if (JSON.stringify(next) !== JSON.stringify(current)) {
      document.configs[index] = ConfigRepository.clone(next)
      document.updatedAt = this.clock()
      this.store.write(document)
    }
    return ConfigRepository.clone(next)
  }

  /**
   * 删除 revision 匹配的配置。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} redundancyId 冗余配置 ID。
   * @param {number} expectedRevision 调用方期望的 revision。
   * @returns {object} 被删除的配置。
   */
  remove(tenantId, redundancyId, expectedRevision) {
    let removed
    this.withExpectedRevision(tenantId, redundancyId, expectedRevision, (current) => {
      removed = current
      return current
    })

    const document = this.store.read()
    document.configs = document.configs.filter(
      (item) => !(item.tenantId === tenantId && item.redundancyId === redundancyId)
    )
    document.updatedAt = this.clock()
    this.store.write(document)
    return ConfigRepository.clone(removed)
  }

  /**
   * 通过 JSON 序列化生成纯数据副本。
   *
   * @param {object} value 原对象。
   * @returns {object} 深拷贝对象。
   */
  static clone(value) {
    return JSON.parse(JSON.stringify(value))
  }
}

module.exports = { ConfigRepository }
// end
