var Queue = require('tiny-queue'),
  Command = require('./command'),
  appCommandResults = require(__dir + '/lib/services/commands/APPCommandResults'),
  CommandResult = require(__dir + '/lib/services/commands/commandResult/commandResult')
// modified by jinlong.feng at 20260909 冗余功能-批量启停功能完善
const BatchCommandResult = require(__dir + '/lib/services/commands/commandResult/batchCommandResult')
const commonPub = require(__dir + '/lib/services/common/public')
// end
class AppCommands {
  constructor() {
    ;((this.commandMapWaiting = new Map()),
      (this.commandListExecuting = []),
      (this.commandResults = appCommandResults))
  }
  addCommand(t, e) {
    e.nodeId = t
    var m = this.commandMapWaiting.get(t)
    m ? m.push(e) : ((m = new Queue()), m.push(e), this.commandMapWaiting.set(t, m))
  }
  removeCommand(t) {
    for (var e = this.commandMapWaiting.get(t); e.length > 0; ) e.shift()
  }
  getCommands(t) {
    var e = this.commandMapWaiting.get(t),
      m = []
    if (e) {
      for (; e.length > 0; ) {
        var n = e.shift()
        ;(this.commandListExecuting.push(n), m.push(n))
        // modified by jinlong.feng at 20260909 冗余功能-批量启停功能完善
        var r = n.getCmdType(),
          a =
            r === commonPub.enumDeployCommandType.NODE_DEPLOYCOMMAND_BATCHSTART ||
            r === commonPub.enumDeployCommandType.NODE_DEPLOYCOMMAND_BATCHSTOP
              ? new BatchCommandResult(n.getCmdId())
              : new CommandResult(n.getCmdId())
        // end
        this.commandResults.addCommandResult(a)
      }
      return m
    } else return []
  }
  hasExecutingCommand(t) {
    for (var e = 0; e < this.commandMapWaiting.length; e++)
      if (this.commandMapWaiting[e].getNodeId === t) return !0
    return !1
  }
  getExecutingCommandById(t) {
    for (var e = 0; e < this.commandListExecuting.length; e++)
      if (this.commandListExecuting[e].cmdId === t) return this.commandListExecuting[e]
    return null
  }
  removeCommandExecuting(t) {
    for (var e = 0; e < this.commandListExecuting.length; e++)
      this.commandListExecuting[e].cmdId === t && this.commandListExecuting.splice(e, 1)
  }
}
module.exports = new AppCommands()
