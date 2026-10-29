const exec = require('child_process').exec
var OpsInterface = require(__dir + '/lib/services/interface/ops_interface')
const requestCli = require(__dir + '/lib/services/interface/request_helper'),
  interfaceEnum = require(__dir + '/lib/services/interface/interface_enum'),
  profilesManage = require(__dir + '/lib/services/profiles/profiles_manage'),
  addressMng = require(__dir + '/lib/services/common/address_mng.js'),
  externalConfig = profilesManage.getGlobalCache(),
  dockerFlag = externalConfig.docker.active
let maxRssGB = 4,
  maxRssB = maxRssGB * 1024 * 1024 * 1024
var count = 41400
class HeartBeat {
  // modified by jinlong.feng at 0901 冗余功能开发
  constructor(e, runtimeCoordinator = null) {
    // end
    ;((this.timer = {}),
      (this.timeSlot = 2 * 1e3),
      (this.nodeInfo = e),
      (this.opsInterface = new OpsInterface()),
      (this.nodePerfSlotCount = 0),
      (this.nodePerfSlot = 10),
      (this.nodePerfData = null),
      // modified by jinlong.feng at 0901 冗余功能开发
      (this.runtimeCoordinator = runtimeCoordinator))
    // end
  }
  setTimeSlot(e) {
    this.timeSlot = e
  }
  getTimeSlot() {
    return this.timeSlot
  }
  init() {
    ;(this.opsInterface.init(), this.initTimer())
  }
  initTimer() {
    var e = this
    this.timer = setInterval(this.onTimer, this.timeSlot, e)
  }
  stopTimer() {
    clearInterval(this.timer)
  }
  async onTimer(e) {
    let t = process.memoryUsage().rss
    ;(t > maxRssB &&
      (logger.error(
        `----------\u8FD0\u7EF4\u4EE3\u7406\u9A7B\u7559\u96C6\u8D85\u8FC7${maxRssGB}G\uFF0C\u8FDB\u7A0B\u81EA\u52A8\u9000\u51FA\uFF0C\u9A7B\u7559\u96C6\u5927\u5C0F\u4E3A\uFF1A${t}B----------`,
      ),
      setTimeout(() => {
        process.exit()
      }, 2e3)),
      (e.nodePerfSlotCount = ++e.nodePerfSlotCount % e.nodePerfSlot),
      e.nodePerfSlotCount === 1 && (e.nodePerfData = await e.nodeInfo.getPerfData()))
    var r = {
      nodeId: e.nodeInfo.getNodeId(),
      nodeName: e.nodeInfo.getNodeName(),
      address: e.nodeInfo.getAddress(),
      port: e.nodeInfo.getPort(),
      backupAdress: e.nodeInfo.getBackupAddr(),
      redundancyNodeName: e.nodeInfo.getRedundancyNodeName(),
      nodePerfData: e.nodePerfData,
    }
    await e.heartBeat(r, e)
  }
  async heartBeat(e, t) {
    if (addressMng.nodeAuthStatus) {
      e.isUseNodeAuth = addressMng.nodeAuthStatus
      let i = await this.getLicenseInfo()
      e.authInfo = i
    }
    let r = {
        url: interfaceEnum.opscenterInterface.OPSCENTER_HEARTBEAT.URL,
        json: !0,
        method: interfaceEnum.opscenterInterface.OPSCENTER_HEARTBEAT.METHOD,
        headers: { Connection: 'keep-alive', 'Content-Type': 'application/json' },
        body: e,
      },
      { err: n, res: i, body: s } = await requestCli.httpRequestSync(r)
    // modified by jinlong.feng at 0901 冗余功能开发
    if (!n && i.statusCode === 200) {
      if (t.runtimeCoordinator) {
        const responseData = s && Object.prototype.hasOwnProperty.call(s, 'data') ? s.data : s
        await t.runtimeCoordinator.onHeartbeatHint({
          redundancyRevision: responseData && responseData.redundancyRevision,
          reconcileRequired: Boolean(responseData && responseData.reconcileRequired),
        })
      }
      return !0
    }
    // end
    var o = __filename
    return (
      logger.error(
        o.substr(o.lastIndexOf('/') + 1) +
          ': \u8282\u70B9\u72B6\u6001\u4E0A\u62A5\u5931\u8D25\uFF01\u8BF7\u68C0\u6D4B\u8282\u70B9\u6CE8\u518C\u662F\u5426\u6210\u529F\u3001oauth\u662F\u5426\u6B63\u5E38\u3001\u8FD0\u7EF4\u4E2D\u5FC3\u662F\u5426\u5728\u7EBF\uFF01',
      ),
      !1
    )
  }
  async getLicenseInfo() {
    let e = {
        url: interfaceEnum.licenseInterface.LICENSE_INFO.URL,
        method: interfaceEnum.licenseInterface.LICENSE_INFO.METHOD,
      },
      { err: t, res: r, body: o } = await requestCli.httpRequestSync(e)
    return t
      ? (logger.error(
          '\u67E5\u8BE2\u6388\u6743\u4FE1\u606F\u5931\u8D25!\u8BF7\u68C0\u6D4B\u6388\u6743\u670D\u52A1\u662F\u5426\u542F\u52A8\u6210\u529F!',
        ),
        [])
      : JSON.parse(o).data.authList
  }
}
module.exports = HeartBeat
