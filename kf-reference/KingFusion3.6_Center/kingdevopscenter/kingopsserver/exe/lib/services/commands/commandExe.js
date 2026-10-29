const AppCommands = require('./AppCommands')
class CommandExe {
  constructor() {}
  AppDeploy(d, a) {
    AppCommands.addCommand(d, a)
  }
  AppStart(d, a) {
    AppCommands.addCommand(d, a)
  }
  AppRestart(d, a) {
    AppCommands.addCommand(d, a)
  }
  AppUndeploy(d, a) {
    AppCommands.addCommand(d, a)
  }
  AppStop(d, a) {
    AppCommands.addCommand(d, a)
  }
  AppDelete(d, a) {
    AppCommands.addCommand(d, a)
  }
  AppBatchDeploy(d) {
    AppCommands.addCommand(d)
  }
  // modified by jinlong.feng at 20260909 冗余功能-批量启停功能完善
  AppBatchStart(d, a) {
    AppCommands.addCommand(d, a)
  }
  // end
  AppBatchRestart(d) {
    AppCommands.addCommand(d)
  }
  // modified by jinlong.feng at 20260909 冗余功能-批量启停功能完善
  AppBatchStop(d, a) {
    AppCommands.addCommand(d, a)
  }
  // end
  AppBatchUndeploy(d) {
    AppCommands.addCommand(d)
  }
  commandExe(d) {}
  UpdateLogConfig(d, a) {
    AppCommands.addCommand(d, a)
  }
  AppCancelCmd(d, a) {
    AppCommands.addCommand(d, a)
  }
  getExecutingCommandById(d) {
    return AppCommands.getExecutingCommandById(d)
  }
  getNextCommand() {}
  setCommandResult(d) {}
}
module.exports = new CommandExe()
