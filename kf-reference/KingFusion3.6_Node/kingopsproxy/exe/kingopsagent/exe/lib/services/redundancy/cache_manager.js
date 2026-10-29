// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

const fs = require('fs')
const path = require('path')
const { ERROR_CODE } = require('./constants')

/**
 * 原子维护节点最后一次成功获取的冗余运行态。
 */
class CacheManager {
  /**
   * @param {object} options 构造参数。
   * @param {string} options.filePath 缓存文件绝对路径。
   */
  constructor({ filePath }) {
    this.filePath = filePath
  }

  /**
   * 读取并校验缓存；不存在时返回 null，损坏时明确报错。
   *
   * @returns {object|null} 缓存副本。
   */
  read() {
    if (!fs.existsSync(this.filePath)) return null
    try {
      const runtime = JSON.parse(fs.readFileSync(this.filePath, 'utf8'))
      CacheManager.assertValid(runtime)
      return CacheManager.clone(runtime)
    } catch (error) {
      const cacheError = new Error(`节点冗余运行态缓存无效: ${error.message}`)
      cacheError.code = ERROR_CODE.CACHE_INVALID
      throw cacheError
    }
  }

  /**
   * 通过同目录临时文件和 rename 原子替换缓存。
   *
   * @param {object} runtime 完整节点运行态。
   * @returns {object} 已保存的缓存副本。
   */
  write(runtime) {
    CacheManager.assertValid(runtime)
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    const temporaryPath = `${this.filePath}.tmp`
    fs.writeFileSync(temporaryPath, JSON.stringify(runtime, null, 2), 'utf8')
    fs.renameSync(temporaryPath, this.filePath)
    return CacheManager.clone(runtime)
  }

  /**
   * 校验缓存中用于安全决策的必要字段。
   *
   * @param {object} runtime 待校验运行态。
   * @returns {void}
   */
  static assertValid(runtime) {
    if (
      !runtime ||
      typeof runtime.enabled !== 'boolean' ||
      typeof runtime.role !== 'string' ||
      !Number.isInteger(runtime.revision) ||
      !Array.isArray(runtime.appIds) ||
      !runtime.desiredStates ||
      typeof runtime.desiredStates !== 'object'
    ) {
      const error = new Error('缺少必要字段')
      error.code = ERROR_CODE.CACHE_INVALID
      throw error
    }
  }

  /** @param {object} value 原对象。 @returns {object} 深拷贝对象。 */
  static clone(value) {
    return JSON.parse(JSON.stringify(value))
  }
}

module.exports = { CacheManager }
// end
