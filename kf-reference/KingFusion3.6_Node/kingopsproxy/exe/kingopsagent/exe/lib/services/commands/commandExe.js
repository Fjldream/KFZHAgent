const os = require('os'),
  appMng = require(__dir + '/lib/services/app/app_mng'),
  profilesManage = require(__dir + '/lib/services/profiles/profiles_manage'),
  externalConfigJson = profilesManage.getGlobalCache(),
  dockerFlag = externalConfigJson.docker.active,
  AppCommands = require('./AppCommands'),
  NodeAuthService = require(__dir + '/lib/services/node/node_auth')
var AppControl
dockerFlag === !1
  ? externalConfigJson.usePm2 === !0
    ? (AppControl = require('./AppControlExPm2'))
    : (AppControl = require('./AppControlEx'))
  : (AppControl = require('./AppControl'))
const APPCommandResults = require('./APPCommandResults')
var publicFunc = require(__dir + '/lib/services/common/public')
const { format } = require(__dir + '/core/util')

// modified by jinlong.feng at 0901 冗余功能开发
const { getNodeRedundancy } = require(__dir + '/lib/services/redundancy')
// end

class CommandExe {
  constructor() {
    ;((this.AppCommands = AppCommands),
      (this.AppControl = new AppControl()),
      (this.APPCommandResults = APPCommandResults))
  }
  init() {
    this.AppControl.init()
  }
  async AppDeploy(e) {
    var p = { cmdStatus: 3, message: '\u6307\u4EE4\u5F02\u5E38\u9000\u51FA\uFF01' }
    let t = publicFunc.enumProjectTypeToLog[e.cmdParam.projectType] || '\u672A\u77E5',
      a = {
        ip: externalConfigJson.opsProxy,
        user: e.user || '',
        tenantId: e.tenantId || '',
        context: `\u5F00\u59CB\u90E8\u7F72${t}APP,APP\u540D\u79F0\u4E3A:${e.cmdParam.appName}`,
        addon: {},
      }
    ;(appLogger.system.info(`\u90E8\u7F72${t}APP`, a),
      (e.cmdParam.deployMode = e.deployMode || 'quick'),
      (p = await this.AppControl.AppDeploy(e.cmdParam)))
    let s = format._parseCmdResultToLog(p)
    return (
      (a.context = `${t}APP\u90E8\u7F72${s},APP\u540D\u79F0\u4E3A:${e.cmdParam.appName}`),
      appLogger.system.info(`\u90E8\u7F72${t}APP`, a),
      p
    )
  }
  async NodeSyncInfo(e) {
    var p = {
      cmdStatus: 3,
      message: '\u6307\u4EE4\u5F02\u5E38\u9000\u51FA,\u540C\u6B65\u5931\u8D25!',
    }
    let t = await NodeAuthService.updateSyncInfo(!0, !0)
    return t.errorCode === 0 ? { cmdStatus: 2, message: t.msg } : ((p.message = t.msg), p)
  }
  async AppStart(e) {
    var p = { cmdStatus: 3, message: '\u6307\u4EE4\u5F02\u5E38\u9000\u51FA\uFF01' }
    let t = publicFunc.enumProjectTypeToLog[e.cmdParam.projectType] || '\u672A\u77E5',
      a = {
        ip: externalConfigJson.opsProxy,
        user: e.user || '',
        tenantId: e.tenantId || '',
        context: `\u5F00\u59CB\u542F\u52A8${t}APP,APP\u540D\u79F0\u4E3A:${e.cmdParam.appName}`,
        addon: {},
      }
    ;(appLogger.system.info(`\u542F\u52A8${t}APP`, a),
      (p = await this.AppControl.AppStart(e.appId)))
    let s = format._parseCmdResultToLog(p)
    return (
      (a.context = `${t}APP\u542F\u52A8${s},APP\u540D\u79F0\u4E3A:${e.cmdParam.appName}`),
      appLogger.system.info(`\u542F\u52A8${t}APP`, a),
      p
    )
  }
  async AppRestart(e) {
    var p = { cmdStatus: 3, message: '\u6307\u4EE4\u5F02\u5E38\u9000\u51FA\uFF01' }
    let t = await this._getAppInfoByID(e.appId),
      a = publicFunc.enumProjectTypeToLog[t.projectType] || '\u672A\u77E5',
      s = {
        ip: externalConfigJson.opsProxy,
        user: e.user || '',
        tenantId: e.tenantId || '',
        context: `\u5F00\u59CB\u91CD\u542F${a}APP,APP\u540D\u79F0\u4E3A:${t.appName || '\u672A\u77E5'}`,
        addon: {},
      }
    ;(appLogger.system.info(`\u91CD\u542F${a}APP`, s),
      (p = await this.AppControl.AppRestart(e.appId)))
    let o = format._parseCmdResultToLog(p)
    return (
      (s.context = `${a}APP\u91CD\u542F${o},APP\u540D\u79F0\u4E3A:${t.appName ? t.appName : '\u672A\u77E5'}`),
      appLogger.system.info(`\u91CD\u542F${a}APP`, s),
      p
    )
  }
  async AppStop(e) {
    var p = { cmdStatus: 3, message: '\u6307\u4EE4\u5F02\u5E38\u9000\u51FA\uFF01' }
    let t = await this._getAppInfoByID(e.appId),
      a = publicFunc.enumProjectTypeToLog[t.projectType] || '\u672A\u77E5',
      s = {
        ip: externalConfigJson.opsProxy,
        user: e.user || '',
        tenantId: e.tenantId || '',
        context: `\u5F00\u59CB\u505C\u6B62${a}APP,APP\u540D\u79F0\u4E3A:${t.appName || '\u672A\u77E5'}`,
        addon: {},
      }
    ;(appLogger.system.info(`\u505C\u6B62${a}APP`, s), (p = await this.AppControl.AppStop(e.appId)))
    let o = format._parseCmdResultToLog(p)
    return (
      (s.context = `${a}APP\u505C\u6B62${o},APP\u540D\u79F0\u4E3A:${t.appName ? t.appName : '\u672A\u77E5'}`),
      appLogger.system.info(`\u505C\u6B62${a}APP`, s),
      p
    )
  }
  async AppUndeploy(e) {
    var p = { cmdStatus: 3, message: '\u6307\u4EE4\u5F02\u5E38\u9000\u51FA\uFF01' }
    let t = await this._getAppInfoByID(e.appId),
      a = publicFunc.enumProjectTypeToLog[t.projectType] || '\u672A\u77E5',
      s = {
        ip: externalConfigJson.opsProxy,
        user: e.user || '',
        tenantId: e.tenantId || '',
        context: `\u5F00\u59CB\u64A4\u9500\u90E8\u7F72${a}APP,APP\u540D\u79F0\u4E3A:${t.appName || '\u672A\u77E5'}`,
        addon: {},
      }
    ;(appLogger.system.info(`\u64A4\u9500\u90E8\u7F72${a}APP`, s),
      (p = await this.AppControl.AppUndeploy(e.appId)))
    let o = format._parseCmdResultToLog(p)
    return (
      (s.context = `${a}APP\u64A4\u9500\u90E8\u7F72${o},APP\u540D\u79F0\u4E3A:${t.appName ? t.appName : '\u672A\u77E5'}`),
      appLogger.system.info(`\u64A4\u9500\u90E8\u7F72${a}APP`, s),
      p
    )
  }
  async AppDelete(e) {
    var p = { cmdStatus: 3, message: '\u6307\u4EE4\u5F02\u5E38\u9000\u51FA\uFF01' }
    let t = e.appName,
      a = {
        ip: externalConfigJson.opsProxy,
        user: e.user || '',
        tenantId: e.tenantId || '',
        context: `\u5F00\u59CB\u5220\u9664APP,APP\u540D\u79F0\u4E3A:${t || '\u672A\u77E5'}`,
        addon: {},
      }
    ;(appLogger.system.info('\u5220\u9664APP', a), (p = await this.AppControl.AppDelete(e.appId)))
    let s = format._parseCmdResultToLog(p)
    return (
      (a.context = `APP\u5220\u9664${s},APP\u540D\u79F0\u4E3A:${t || '\u672A\u77E5'}`),
      appLogger.system.info('\u5220\u9664APP', a),
      p
    )
  }
  async AppBatchDeploy(e) {
    var p = await this.AppControl.AppBatchDeploy(e.cmdParam),
      t = {}
    return ((t.cmdResults = p), t)
  }

  // modified by jinlong.feng at 20260909 冗余功能-批量启停功能完善
  async AppBatchStart(e) {
    var p = await this.AppControl.AppBatchStart(e.appId),
      t = {}
    return ((t.cmdResults = p), (t.message = JSON.stringify(p)), t)
  }
  // end

  async AppBatchRestart(e) {
    var p = await this.AppControl.AppBatchRestart(e.appId),
      t = {}
    return ((t.cmdResults = p), t)
  }

  // modified by jinlong.feng at 20260909 冗余功能-批量启停功能完善
  async AppBatchStop(e) {
    var p = await this.AppControl.AppBatchStop(e.appId),
      t = {}
    return ((t.cmdResults = p), (t.message = JSON.stringify(p)), t)
  }
  // end

  async AppBatchUndeploy(e) {
    var p = await this.AppControl.AppBatchUndeploy(e.appId),
      t = {}
    return ((t.cmdResults = p), t)
  }
  async logConfig(e) {
    var p = await this.AppControl.saveLogRetainTime(e.logTime),
      t = {}
    return ((t.cmdResults = p), t)
  }
  async executeCmd(e) {
    try {
      // modified by jinlong.feng at 0901 冗余功能开发
      const blockedResult = this.checkRedundancyCommand(e)
      if (blockedResult) return { ...blockedResult, cmdId: e.cmdId }
      // end
      var p = {}
      switch (e.cmdType) {
        case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_DEPLOY:
          {
            var t = new Date().getTime()
            p = await this.AppDeploy(e)
            var a = new Date().getTime()
            logger.info(
              `\u90E8\u7F72/\u91CD\u65B0\u90E8\u7F72\u64CD\u4F5C\u8017\u65F6\uFF1A----------------------------${a - t}ms`,
            )
          }
          break
        case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_START:
          {
            var t = new Date().getTime()
            p = await this.AppStart(e)
            var a = new Date().getTime()
            logger.info(
              `\u542F\u52A8\u64CD\u4F5C\u8017\u65F6\uFF1A----------------------------${a - t}ms`,
            )
          }
          break
        case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_STOP:
          {
            var t = new Date().getTime()
            p = await this.AppStop(e)
            var a = new Date().getTime()
            logger.info(
              `\u505C\u6B62\u64CD\u4F5C\u8017\u65F6\uFF1A----------------------------${a - t}ms`,
            )
          }
          break
        case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_RESTART:
          {
            var t = new Date().getTime()
            p = await this.AppRestart(e)
            var a = new Date().getTime()
            logger.info(
              `\u91CD\u542F\u64CD\u4F5C\u8017\u65F6\uFF1A----------------------------${a - t}ms`,
            )
          }
          break
        case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_UNDEPLOY:
          {
            var t = new Date().getTime()
            p = await this.AppUndeploy(e)
            var a = new Date().getTime()
            logger.info(
              `\u64A4\u9500\u90E8\u7F72\u64CD\u4F5C\u8017\u65F6\uFF1A----------------------------${a - t}ms`,
            )
          }
          break
        case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_BATCHDEPLOY:
          p = await this.AppBatchDeploy(e)
          break
        case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_BATCHSTART:
          p = await this.AppBatchStart(e)
          break
        case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_BATCHSTOP:
          p = await this.AppBatchStop(e)
          break
        case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_BATCHRESTART:
          p = await this.AppBatchRestart(e)
          break
        case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_BATCHUNDEPLOY:
          p = await this.AppBatchUndeploy(e)
          break
        case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_DELETE:
          p = await this.AppDelete(e)
          break
        case publicFunc.enumAppDeployCommandType.NODE_DEPLOYCOMMAND_LOG:
          p = await this.logConfig(e)
          break
        case publicFunc.enumAppDeployCommandType.NODE_SYNCCOMMAND_INFO:
          p = await this.NodeSyncInfo(e)
          break
        default:
          break
      }
      return ((p.cmdId = e.cmdId), p)
    } catch {
      return (
        (p = {
          cmdStatus: 3,
          message:
            '\u6267\u884C\u8FC7\u7A0B\u9519\u8BEF,\u6307\u4EE4\u5F02\u5E38\u9000\u51FA,\u540C\u6B65\u5931\u8D25!',
        }),
        (p.cmdId = e.cmdId),
        p
      )
    }
  }

  // modified by jinlong.feng at 0901 冗余功能开发
  /**
   * 在实际操作 APP 前调用节点冗余 Guard；拒绝时转换成现有命令失败结果。
   *
   * @param {object} command KF APP 命令。
   * @returns {object|null} 被拒绝时的命令结果，否则为 null。
   */
  checkRedundancyCommand(command) {
    const subsystem = getNodeRedundancy()
    const action = this.getRedundancyAction(command.cmdType)
    if (!subsystem || !subsystem.commandGuard || !action) return null

    const appIds = Array.isArray(command.appId) ? command.appId : [command.appId]
    try {
      for (const appId of appIds) {
        subsystem.commandGuard.assertCommand({
          appId,
          action,
          internalRedundancy: command.internalRedundancy === true,
          revision: command.revision,
        })
      }
      return null
    } catch (error) {
      logger.warn(`节点拒绝执行冗余受限命令: ${error.code || ''} ${error.message}`)
      if (Array.isArray(command.appId)) {
        const cmdResults = appIds.map((appId) => ({
          appId,
          cmdStatus: 3,
          message: error.message,
        }))
        return {
          cmdResults,
          code: error.code || 'REDUNDANCY_COMMAND_FORBIDDEN',
          message: JSON.stringify(cmdResults),
        }
      }
      return {
        cmdStatus: 3,
        code: error.code || 'REDUNDANCY_COMMAND_FORBIDDEN',
        message: error.message,
      }
    }
  }

  /**
   * 将现有命令枚举转换为冗余 Guard 使用的稳定动作名。
   *
   * @param {number|string} commandType 现有命令类型。
   * @returns {string|null} 稳定动作名。
   */
  getRedundancyAction(commandType) {
    switch (commandType) {
      case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_START:
      case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_BATCHSTART:
        return 'START'
      case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_STOP:
      case publicFunc.enumAppDeployCommandType.APP_DEPLuOYCOMMAND_BATCHSTOP:
      case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_BATCHSTOP:
        return 'STOP'
      case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_RESTART:
      case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_BATCHRESTART:
        return 'RESTART'
      case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_DELETE:
        return 'DELETE'
      default:
        return null
    }
  }
  // end
  addCommand(e) {
    return this.AppCommands.addCommand(e)
  }
  addCommands(e) {
    return this.AppCommands.addCommands(e)
  }
  removeCommand() {
    return this.AppCommands.removeCommand()
  }
  getNextCommand() {
    return this.AppCommands.getNextCommand()
  }
  getCommands() {
    return this.AppCommands.getCommands()
  }
  addCommandResult(e) {
    return this.APPCommandResults.addCommandResult(e)
  }
  removeCommandResult() {
    return this.APPCommandResults.removeCommandResult()
  }
  getCommandResults() {
    return this.APPCommandResults.getCommandResults()
  }
  isAllSucceed(e, p) {
    var t = !0
    switch (e) {
      case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_DEPLOY:
      case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_START:
      case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_STOP:
      case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_RESTART:
      case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_UNDEPLOY:
      case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_DELETE:
        p.cmdStatus !== 2 && (t = !1)
        break
      case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_BATCHDEPLOY:
      case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_BATCHSTART:
      case publicFunc.enumAppDeployCommandType.APP_DEPLuOYCOMMAND_BATCHSTOP:
      case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_BATCHSTOP:
      case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_BATCHRESTART:
      case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_BATCHUNDEPLOY:
        if (!Array.isArray(p.cmdResults)) return !1
        for (var a = p.cmdResults, s = 0; s < a.length; s++)
          if (a[s].cmdStatus !== 2) {
            t = !1
            break
          }
        break
      case publicFunc.enumAppDeployCommandType.NODE_SYNCCOMMAND_INFO:
        p.cmdStatus !== 2 && (t = !1)
        break
      default:
        break
    }
    return t
  }
  async _getControlType(e) {
    var p = publicFunc.enumControlType.CONTROL_DOCKER
    dockerFlag || (p = publicFunc.enumControlType.CONTROL_SCRIPT)
    var t = await this._getInfoByCommand(e)
    if (!t.hasOwnProperty('projectType')) return p
    switch (t.projectType) {
      case publicFunc.enumProjectType.PROJECT_DB:
        if (!t.hasOwnProperty('sourceType')) break
        switch (t.sourceType) {
          case publicFunc.enumSourceType.SOURCE_KSS:
            p = publicFunc.enumControlType.CONTROL_SCRIPT
            break
          default:
            break
        }
        break
      case publicFunc.enumProjectType.PROJECT_KSS:
        p = publicFunc.enumControlType.CONTROL_SCRIPT
        break
      default:
        break
    }
    return p
  }
  async _getInfoByCommand(e) {
    var p = {}
    switch (e.cmdType) {
      case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_DEPLOY: {
        p = e.cmdParam
        break
      }
      case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_START: {
        p = await this._getAppInfoByID(e.appId)
        break
      }
      case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_STOP: {
        p = await this._getAppInfoByID(e.appId)
        break
      }
      case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_RESTART: {
        p = await this._getAppInfoByID(e.appId)
        break
      }
      case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_UNDEPLOY: {
        p = await this._getAppInfoByID(e.appId)
        break
      }
      case publicFunc.enumAppDeployCommandType.APP_DEPLOYCOMMAND_DELETE: {
        p = await this._getAppInfoByID(e.appId)
        break
      }
      default:
        break
    }
    return p
  }
  async _getAppInfoByID(e) {
    var p = {}
    return (
      await appMng.getAppBaseInfo({ appId: e }, function (t, a) {
        t || (p = a)
      }),
      p
    )
  }
}
module.exports = CommandExe
