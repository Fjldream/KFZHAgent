const OpsInterface = require(__dir + '/lib/services/interface/ops_interface'),
  appCommands = require(__dir + '/lib/services/commands/AppCommands'),
  CommandExe = require(__dir + '/lib/services/commands/commandExe'),
  download = require(__dir + '/lib/services/projectClient/common/projectClient')
class PollingReport {
  constructor(e) {
    ;((this.nodeInfo = e),
      (this.timer = {}),
      (this.opsInterface = new OpsInterface()),
      (this.commandExe = new CommandExe()),
      (this.isExectingCommand = !1))
  }
  // modified by jinlong.feng at 0901 冗余功能开发
  /**
   * 初始化命令接口和执行器，并允许启动流程延后开启轮询定时器。
   *
   * @param {object} [options] 初始化选项。
   * @param {boolean} [options.startTimer=true] 是否立即开启命令轮询。
   * @returns {void}
   */
  init({ startTimer = true } = {}) {
    this.opsInterface.init()
    this.commandExe.init()
    if (startTimer) this.initTimer()
  }
  // end
  initTimer() {
    this.timer = setInterval(this.onTimer, 1e3, this)
  }
  stopTimer() {
    clearInterval(this.timer)
  }
  async onTimer(e) {
    var m = await e.opsInterface.getCommandList(e.nodeInfo.getNodeId())
    if (m !== -1) {
      ;(m &&
        m.length > 0 &&
        m.forEach((a) => {
          if (appCommands.noExistAPPId(a.appId)) {
            var i = appCommands.addCommands([a])
            e.execCancelCmd(e, i.cancelCmdArr)
          }
        }),
        e.isExectingCommand || e.processCmd(e, 1))
      var n = e.commandExe.removeCommandResult()
      n && (await e.opsInterface.updateCmdResults(n))
    }
  }
  async processCmd(e, m) {
    try {
      var n = e.commandExe.getCommands().length
      if (n === 0) return
      e.isExectingCommand = !0
      for (var a = 0; a < n; a++) {
        var i = e.commandExe.getNextCommand()
        if (i)
          for (var o = 0; ; ) {
            logger.info(
              `------\u7B2C${o + 1}\u6B21\u5C1D\u8BD5\u6267\u884C\u6307\u4EE4${i.cmdId},\u6307\u4EE4\u7C7B\u578B\uFF1A${i.cmdType}------`,
            )
            var r = await e.commandExe.executeCmd(i),
              t = e.commandExe.isAllSucceed(i.cmdType, r)
            if (t === !0) {
              ;(logger.info('------\u6307\u4EE4\u6267\u884C\u6210\u529F\uFF01------'),
                e.commandExe.removeCommand(),
                e.commandExe.addCommandResult(r))
              break
            } else if ((o++, o >= m)) {
              ;(logger.info('------\u6307\u4EE4\u6267\u884C\u5931\u8D25\uFF01------'),
                e.commandExe.removeCommand(),
                e.commandExe.addCommandResult(r))
              break
            }
          }
      }
    } catch (d) {
      logger.error(JSON.stringify(d))
    } finally {
      e.isExectingCommand = !1
    }
  }
  execCancelCmd(e, m) {
    try {
      if (m.length > 0) {
        logger.info(
          '##################################### \u6267\u884C\u53D6\u6D88\u547D\u4EE4\uFF01\uFF01\uFF01\uFF01 #####################################',
        )
        for (var n = 0; n < m.length; n++) {
          download.cancelDownloadProject()
          var a = {
            cmdStatus: 3,
            message: '\u53D6\u6D88\u6307\u4EE4\u6267\u884C\u6210\u529F\uFF01',
          }
          ;((a.cmdId = m[n].cancelCmdId),
            e.commandExe.removeCommand(),
            e.commandExe.addCommandResult(a))
        }
      }
    } catch {
    } finally {
      e.isExectingCommand = !1
    }
  }
}
module.exports = PollingReport
