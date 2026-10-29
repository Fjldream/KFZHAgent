var CommandResult = require('./commandResult')
const commonPub = require(__dir + '/lib/services/common/public')
class BatchCommandResult extends CommandResult {
  constructor(e) {
    ;(super(e), (this.result = []), (this.message = ''))
  }
  // modified by jinlong.feng at 20260909 冗余功能-批量启停功能完善
  setResult(e) {
    this.result = Array.isArray(e) ? e : []
  }
  // end
  getResult() {
    return this.result
  }
  // modified by jinlong.feng at 20260909 冗余功能-批量启停功能完善
  setMessage(e) {
    this.message = e
    try {
      var t = JSON.parse(e)
      Array.isArray(t) && (this.result = t)
    } catch (t) {}
  }
  // end
  getMessage() {
    return this.message
  }
}
module.exports = BatchCommandResult
