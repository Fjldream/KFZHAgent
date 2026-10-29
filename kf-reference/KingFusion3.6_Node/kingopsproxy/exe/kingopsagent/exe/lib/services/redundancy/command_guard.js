// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

const { ERROR_CODE, NODE_ROLE } = require('./constants')

/**
 * 在节点执行命令前基于本地缓存执行最后一道冗余安全限制。
 */
class CommandGuard {
  /**
   * @param {object} options 构造参数。
   * @param {() => object|null} options.runtimeProvider 当前缓存提供器。
   */
  constructor({ runtimeProvider }) {
    this.runtimeProvider = runtimeProvider
  }

  /**
   * 校验单个 APP 命令。
   *
   * @param {object} command 稳定命令对象。
   * @param {string} command.appId APP ID。
   * @param {string} command.action START、STOP、RESTART 或 DELETE。
   * @param {boolean} [command.internalRedundancy] 是否为中心冗余编排命令。
   * @param {number} [command.revision] 命令依据的配置 revision。
   * @returns {void}
   */
  assertCommand(command) {
    const runtime = this.runtimeProvider()
    if (!runtime || !runtime.enabled || !runtime.appIds.includes(command.appId)) return

    if (command.internalRedundancy && command.revision !== runtime.revision) {
      throw CommandGuard.createError(
        ERROR_CODE.REVISION_STALE,
        `冗余命令 revision ${command.revision} 与节点缓存 revision ${runtime.revision} 不一致`,
      )
    }

    const action = String(command.action || '').toUpperCase()
    if (runtime.role === NODE_ROLE.ACTIVE && action === 'DELETE') {
      throw CommandGuard.createError(
        ERROR_CODE.ACTIVE_APP_DELETE_FORBIDDEN,
        `激活节点的冗余 APP ${command.appId} 不允许删除`,
      )
    }
    if (runtime.role === NODE_ROLE.INACTIVE && action === 'START') {
      throw CommandGuard.createError(
        ERROR_CODE.INACTIVE_APP_START_FORBIDDEN,
        `失活节点的冗余 APP ${command.appId} 不允许启动`,
      )
    }
    if (runtime.role === NODE_ROLE.INACTIVE && action === 'RESTART') {
      throw CommandGuard.createError(
        ERROR_CODE.INACTIVE_APP_RESTART_FORBIDDEN,
        `失活节点的冗余 APP ${command.appId} 不允许重启`,
      )
    }
  }

  /**
   * 创建带稳定错误码的节点命令异常。
   *
   * @param {string} code 错误码。
   * @param {string} message 错误说明。
   * @returns {Error} 命令异常。
   */
  static createError(code, message) {
    const error = new Error(message)
    error.code = code
    return error
  }
}

module.exports = { CommandGuard }
// end
