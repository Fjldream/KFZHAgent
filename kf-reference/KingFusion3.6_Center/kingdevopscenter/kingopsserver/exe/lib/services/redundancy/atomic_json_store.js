// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

const defaultFileSystem = require('fs')
const path = require('path')
const { ERROR_CODE } = require('./constants')
const { RedundancyError } = require('./errors')

/**
 * 使用“临时文件校验、备份、原子替换”流程维护 JSON 文件。
 */
class AtomicJsonStore {
  /**
   * @param {object} options 构造参数。
   * @param {string} options.filePath 目标 JSON 文件路径。
   * @param {object} [options.fileSystem] 文件系统适配器，测试时可注入故障。
   * @param {() => object} [options.defaultValueFactory] 文件不存在时的默认值工厂。
   * @param {(value: object) => boolean} [options.validate] 数据结构校验函数。
   */
  constructor({
    filePath,
    fileSystem = defaultFileSystem,
    defaultValueFactory = () => ({ schemaVersion: 1, updatedAt: null, configs: [] }),
    validate = AtomicJsonStore.validateDefaultDocument
  }) {
    this.filePath = filePath
    this.fileSystem = fileSystem
    this.defaultValueFactory = defaultValueFactory
    this.validate = validate
  }

  /**
   * 校验默认冗余配置文档结构。
   *
   * @param {object} value 待校验对象。
   * @returns {boolean} 是否有效。
   */
  static validateDefaultDocument(value) {
    return Boolean(value && value.schemaVersion === 1 && Array.isArray(value.configs))
  }

  /**
   * 读取并校验 JSON；文件不存在时返回新的默认对象。
   *
   * @returns {object} 配置文档。
   */
  read() {
    if (!this.fileSystem.existsSync(this.filePath)) {
      return this.defaultValueFactory()
    }

    const value = JSON.parse(this.fileSystem.readFileSync(this.filePath, 'utf8'))
    this.assertValid(value)
    return value
  }

  /**
   * 原子写入 JSON 文档。
   *
   * @param {object} value 待写入文档。
   * @returns {void}
   */
  write(value) {
    this.assertValid(value)
    const directory = path.dirname(this.filePath)
    const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`
    const backupPath = `${this.filePath}.bak`
    const serializedValue = `${JSON.stringify(value, null, 2)}\n`

    this.fileSystem.mkdirSync(directory, { recursive: true })

    try {
      this.fileSystem.writeFileSync(temporaryPath, serializedValue, 'utf8')
      const parsedTemporaryValue = JSON.parse(
        this.fileSystem.readFileSync(temporaryPath, 'utf8')
      )
      this.assertValid(parsedTemporaryValue)

      if (this.fileSystem.existsSync(this.filePath)) {
        this.fileSystem.copyFileSync(this.filePath, backupPath)
      }
      this.fileSystem.renameSync(temporaryPath, this.filePath)
    } catch (error) {
      if (this.fileSystem.existsSync(temporaryPath)) {
        this.fileSystem.unlinkSync(temporaryPath)
      }
      throw error
    }
  }

  /**
   * 校验文档并在失败时抛出稳定领域异常。
   *
   * @param {object} value 待校验文档。
   * @returns {void}
   */
  assertValid(value) {
    if (!this.validate(value)) {
      throw new RedundancyError(ERROR_CODE.STORE_INVALID, '冗余配置文件结构无效', 500)
    }
  }
}

module.exports = { AtomicJsonStore }
// end
