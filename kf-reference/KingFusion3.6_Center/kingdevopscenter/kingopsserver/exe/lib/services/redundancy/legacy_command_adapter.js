// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

/**
 * 把现有 KF 命令类、命令队列和结果缓存适配为 CommandGateway 接口。
 */
class LegacyCommandAdapter {
  /**
   * @param {object} options 构造参数。
   * @param {object} options.commandClasses 现有命令类集合。
   * @param {object} options.commandExecutor 现有 commandExe 单例。
   * @param {object} options.commandResults 现有 APPCommandResults 单例。
   * @param {object} options.appProvider APP 信息与状态提供器。
   * @param {object} options.commandStatusEnum 现有命令状态枚举。
   */
  constructor({ commandClasses, commandExecutor, commandResults, appProvider, commandStatusEnum }) {
    this.commandClasses = commandClasses
    this.commandExecutor = commandExecutor
    this.commandResults = commandResults
    this.appProvider = appProvider
    this.commandStatusEnum = commandStatusEnum
  }

  /**
   * 构造并入队单 APP START/STOP 命令。
   *
   * @param {object} input 命令输入。
   * @returns {{commandId: string}} 命令 ID。
   */
  enqueue(input) {
    const CommandClass =
      input.action === 'START' ? this.commandClasses.startCommand : this.commandClasses.stopCommand
    const command = new CommandClass()
    command.setAppId(input.appId)
    command.setUser(input.metadata.operator || 'redundancy-system')
    command.setTenantId(input.metadata.tenantId)
    command.internalRedundancy = true
    command.redundancyId = input.metadata.redundancyId
    command.revision = input.metadata.revision
    command.operationTaskId = input.metadata.operationTaskId

    if (input.action === 'START') {
      command.setcmdParam(this.appProvider.getAppInfo(input.appId))
      this.commandExecutor.AppStart(input.nodeId, command)
    } else {
      this.commandExecutor.AppStop(input.nodeId, command)
    }
    return { commandId: command.getCmdId() }
  }

  /** 一次构造并入队冗余批量 START/STOP 命令。 */
  enqueueBatch(input) {
    const CommandClass =
      input.action === 'START'
        ? this.commandClasses.batchStartCommand
        : this.commandClasses.batchStopCommand
    const command = new CommandClass()
    command.setAppId([...input.appIds])
    command.setUser(input.metadata.operator || 'redundancy-system')
    command.setTenantId(input.metadata.tenantId)
    command.internalRedundancy = true
    command.redundancyId = input.metadata.redundancyId
    command.revision = input.metadata.revision
    command.operationTaskId = input.metadata.operationTaskId

    if (input.action === 'START') {
      this.commandExecutor.AppBatchStart(input.nodeId, command)
    } else {
      this.commandExecutor.AppBatchStop(input.nodeId, command)
    }
    return { commandId: command.getCmdId() }
  }

  /**
   * 读取命令结果并转换为稳定状态。
   *
   * @param {string} commandId 命令 ID。
   * @returns {{status: string, message?: string}|null} 命令状态。
   */
  getCommandStatus(commandId) {
    const result = this.commandResults.getCommandResult(commandId)
    if (!result) return null
    const status = typeof result.getStatus === 'function' ? result.getStatus() : result.status
    const rawResults =
      typeof result.getResult === 'function' ? result.getResult() : result.results
    const results = Array.isArray(rawResults)
      ? rawResults.map((item) => ({
          appId: item.appId,
          status: item.cmdStatus === 2 ? 'SUCCEEDED' : 'FAILED',
          message: item.message || null,
        }))
      : undefined
    if (status === this.commandStatusEnum.NODE_DEPLOYCOMMAND_STATUS_SUCCEEDED) {
      return results ? { status: 'SUCCEEDED', results } : { status: 'SUCCEEDED' }
    }
    if (status === this.commandStatusEnum.NODE_DEPLOYCOMMAND_STATUS_FAILED) {
      const output = {
        status: 'FAILED',
        message: typeof result.getMessage === 'function' ? result.getMessage() : result.message,
      }
      if (results) output.results = results
      return output
    }
    return { status: 'PENDING' }
  }

  /**
   * 读取 APP 实际运行状态。
   *
   * @param {string} nodeId 节点 ID。
   * @param {string} appId APP ID。
   * @returns {object|null} APP 状态。
   */
  getAppState(nodeId, appId) {
    return this.appProvider.getAppState(nodeId, appId)
  }
}

module.exports = { LegacyCommandAdapter }
// end
