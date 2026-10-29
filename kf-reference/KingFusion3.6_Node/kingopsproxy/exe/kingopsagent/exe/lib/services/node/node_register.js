var C = Object.defineProperty
var O = (d, e, t) =>
  e in d
    ? C(d, e, { enumerable: !0, configurable: !0, writable: !0, value: t })
    : (d[e] = t)
var I = (d, e, t) => O(d, typeof e != 'symbol' ? e + '' : e, t)
const fs = require('fs'),
  path = require('path'),
  { util } = require(__dir + '/core/util'),
  NodeInfo = require('./node_info'),
  MainTenanceCenterInfo = require('./maintenance_center_info'),
  UserCenterInfo = require('./user_center_info'),
  OAuthClientInfo = require('./oauth_client_info'),
  UserManager = require(__dir + '/lib/services/oauth/user_manager'),
  OpsInterface = require(__dir + '/lib/services/interface/ops_interface'),
  nodeRegisterFile = path.resolve(__dir + '/data/nodeRegister.json'),
  oauthRegisterFile = path.resolve(__dir + '/data/OauthRegister.json'),
  gNodeRegisterExternalFile = __dir + '/../../../../config/nodeRegister.json',
  gNodeInstallStartStatusFile = __dir + '/data/nodeStartupStatus.json',
  profilesManage = require(__dir + '/lib/services/profiles/profiles_manage'),
  externalConfigJson = profilesManage.getGlobalCache(),
  INITNODEFLAG = { REGISTER: 0, MODIFIED: 1, UNCHANGED: 2 }
class NodeRegister {
  constructor() {
    I(this, 'ensureStatusDir', (e) => {
      const t = path.dirname(e)
      fs.existsSync(t) || fs.mkdirSync(t, { recursive: !0 })
    })
    I(this, 'writeStartupStatus', (e, t = {}) => {
      try {
        this.ensureStatusDir(gNodeInstallStartStatusFile)
        const n = {
          status: e,
          timestamp: Date.now(),
          platform: process.platform,
          nodeName: process.env.NODE_NAME || 'unknown',
          ...t,
        }
          ; (fs.writeFileSync(
            gNodeInstallStartStatusFile,
            JSON.stringify(n, null, 2),
          ),
            console.log(
              `[INFO] \u542F\u52A8\u72B6\u6001\u5DF2\u5199\u5165: ${gNodeInstallStartStatusFile}`,
            ))
      } catch (n) {
        console.error(
          `[ERROR] \u5199\u5165\u542F\u52A8\u72B6\u6001\u5931\u8D25: ${n.message}`,
        )
      }
    })
      ; ((this.nodeInfo = new NodeInfo()),
        (this.maintenanceCenterInfo = new MainTenanceCenterInfo()),
        (this.userCenterInfo = new UserCenterInfo()),
        (this.opsInterface = new OpsInterface()),
        this.opsInterface.init())
  }
  getNodeInfo () {
    return this.nodeInfo
  }
  commandInteraction () {
    var e = `${externalConfigJson.opsCenterAddress}:${externalConfigJson.opsCenterPort.kingops}`
    e = e.replace(/\s*/g, '')
    var t = e.split(':')
      ; (this.nodeInfo.setAddress(externalConfigJson.opsProxy),
        this.nodeInfo.setNodeName(externalConfigJson.nodeInfo.nodeName),
        this.maintenanceCenterInfo.setIp(t[0]),
        this.maintenanceCenterInfo.setPort(t[1]),
        this.userCenterInfo.setIp(externalConfigJson.oauth.active.address),
        this.userCenterInfo.setPort(externalConfigJson.oauth.active.oauthPort))
  }
  async validateNodeRegisterInfo (e, t) {
    let o = await this.opsInterface.getAllNodes()
    if (o.code === -1) return { code: -1, nodeArr: [] }
    let r = o.data.filter((s) => s.nodeName === e && s.nodeId === t)
    if (r.length > 0) return { code: 0, nodeArr: r }
    let i = o.data.filter((s) => s.nodeName === e && s.nodeId !== t)
    if (i.length > 0) return { code: 1, nodeArr: i }
    let a = o.data.filter((s) => s.nodeName !== e && s.nodeId === t)
    return a.length > 0 ? { code: 2, nodeArr: a } : { code: 3, nodeArr: [] }
  }
  async initLocalNode () {
    let e = this
    e.commandInteraction()
    let t = null,
      n = fs.existsSync(nodeRegisterFile),
      o = fs.existsSync(oauthRegisterFile)
    if (n && o) {
      let c = require(nodeRegisterFile)
      if (!c.nodeInfo.tenantId) {
        let p = require(oauthRegisterFile)
        logger.info(
          '\u8282\u70B9\u6CE8\u518C\u4FE1\u606F\u4E2D\u7F3A\u5931tenantId',
        )
        let f = new UserManager(),
          { username: m, password: w } = externalConfigJson.userInfo,
          { clientId: y, clientSecret: A, redirectUrl: _ } = p
        await f.getAccessToken({
          clientId: y,
          clientSecret: A,
          redirectUrl: _,
          username: m,
          password: w,
        })
        let R = f.getToken(),
          v = await f.getUserInfo(R)
          ; ((c.nodeInfo.tenantId = v.tenantId),
            fs.writeFileSync(nodeRegisterFile, JSON.stringify(c)))
      }
      ; ((global.tenantId = c.nodeInfo.tenantId),
        logger.info(`init global.tenantId: ${global.tenantId}`))
      let { code: l, nodeArr: b } = await this.validateNodeRegisterInfo(
        c.nodeInfo.nodeName,
        c.nodeInfo.nodeId,
      )
      if (
        (l === -1 &&
          (logger.error(
            '\u8BF7\u6C42\u8FD0\u7EF4\u4E2D\u5FC3\u5931\u8D25\uFF0C\u8BF7\u68C0\u6D4B\u8FD0\u7EF4\u4E2D\u5FC3\u662F\u5426\u53EF\u6B63\u5E38\u8BBF\u95EE\uFF01',
          ),
            process.exit(1)),
          l === 0)
      )
        return (
          logger.info(
            '\u8282\u70B9\u6CE8\u518C\u4FE1\u606F\u5DF2\u5B58\u5728\uFF0C\u4E0D\u91CD\u65B0\u751F\u6210\u6CE8\u518C\u4FE1\u606F',
          ),
          (t = INITNODEFLAG.UNCHANGED),
          e.load(),
          this.writeStartupStatus('success', {
            message:
              '\u9A8C\u8BC1\u6210\u529F\uFF0C\u4EE3\u7406\u5DF2\u542F\u52A8',
            code: 'NODE_VALIDATED',
          }),
          t
        )
      l === 1
        ? (fs.unlinkSync(nodeRegisterFile),
          fs.unlinkSync(oauthRegisterFile),
          this.writeStartupStatus('failed', {
            error:
              '\u9A8C\u8BC1\u5931\u8D25\uFF0C\u8282\u70B9\u540D\u91CD\u590D\uFF0C\u4EE3\u7406\u542F\u52A8\u5931\u8D25',
            code: l,
            suggestion:
              '\u8BF7\u4FEE\u6539\u540D\u79F0\u91CD\u65B0\u6CE8\u518C\uFF0C\u91CD\u65B0\u6CE8\u518C',
          }),
          logger.error(
            'nodeName\u76F8\u540C\u548CnodeId\u4E0D\u540C\u7684\u8282\u70B9\uFF0C\u8BF7\u4FEE\u6539\u540D\u79F0\u91CD\u65B0\u6CE8\u518C\uFF0C\u91CD\u65B0\u6CE8\u518C',
          ),
          process.exit(1))
        : l === 2
          ? (logger.error(
            '\u5DF2\u5B58\u5728nodeName\u4E0D\u540C\u548CnodeId\u76F8\u540C\u7684\u8282\u70B9\uFF0C\u8BF7\u91CD\u65B0\u6CE8\u518C',
          ),
            process.exit(1))
          : (fs.existsSync(nodeRegisterFile) && fs.unlinkSync(nodeRegisterFile),
            fs.existsSync(oauthRegisterFile) &&
            fs.unlinkSync(oauthRegisterFile),
            logger.error(
              '\u8FD0\u7EF4\u4E2D\u5FC3\u4E0D\u5B58\u5728\u8BE5\u8282\u70B9\u4FE1\u606F\u51B2\u7A81\uFF0C\u8BF7\u91CD\u65B0\u6CE8\u518C',
            ),
            process.exit(1))
    }
    ; ((t = INITNODEFLAG.REGISTER),
      logger.info('\u91CD\u65B0\u751F\u6210\u6CE8\u518C\u4FE1\u606F...'),
      e.save())
    let r = new Date().getTime(),
      i = new OAuthClientInfo(),
      a = new UserManager()
      ; (i.setClientName(e.nodeInfo.getNodeName() + r),
        i.setDescription(e.nodeInfo.getNodeName() + 'Proxy'),
        i.setRedirectUrl(
          'http://' +
          e.nodeInfo.getAddress() +
          ':' +
          e.nodeInfo.getPort() +
          '/code',
        ))
    let s = await a.userAuthenticInterface.registerOAuthClient(i)
      ; (s.err
        ? process.exit(1)
        : (i.setClientId(s.clientId),
          i.setClientSecret(s.clientSecret),
          i.save()),
        a.init())
    let { username: N, password: S } = externalConfigJson.userInfo
    await a.getAccessToken({ username: N, password: S })
    let u = a.getToken(),
      { tenantId: g } = await a.getUserInfo(u)
      ; ((global.tenantId = g), e.nodeInfo.setTenantId(g), e.save())
    let h = await e.initRegister(u)
    return (
      h === -1 &&
      (fs.existsSync(nodeRegisterFile) && fs.unlinkSync(nodeRegisterFile),
        fs.existsSync(oauthRegisterFile) && fs.unlinkSync(oauthRegisterFile),
        this.writeStartupStatus('failed', {
          error:
            '\u9A8C\u8BC1\u5931\u8D25\uFF0C\u8282\u70B9\u540D\u91CD\u590D\uFF0C\u4EE3\u7406\u542F\u52A8\u5931\u8D25',
          code: h,
          suggestion:
            '\u8BF7\u4FEE\u6539\u540D\u79F0\u91CD\u65B0\u6CE8\u518C\uFF0C\u91CD\u65B0\u6CE8\u518C',
        }),
        process.exit(1)),
      this.writeStartupStatus('success', {
        message: '\u9A8C\u8BC1\u6210\u529F\uFF0C\u4EE3\u7406\u5DF2\u542F\u52A8',
        code: 'NODE_VALIDATED',
      }),
      t
    )
  }
  async initRegister (e) {
    let t = {
      nodeId: this.nodeInfo.getNodeId(),
      nodeName: this.nodeInfo.getNodeName(),
      address: this.nodeInfo.getAddress(),
      publicAddress: this.nodeInfo.getPublicAddress(),
      port: this.nodeInfo.getPort(),
      backupAdress: this.nodeInfo.getBackupAddr(),
      redundancyNodeName: this.nodeInfo.getRedundancyNodeName(),
    },
      n = new OpsInterface()
    return (n.init(), await n.registeNode(e, t))
  }
  async editOpsNodeInfo () {
    let e = new UserManager()
    e.init()
    let t = externalConfigJson.userInfo.username,
      n = externalConfigJson.userInfo.password
    await e.getAccessToken({ username: t, password: n })
    let o = e.getToken(),
      r = {
        nodeId: this.nodeInfo.getNodeId(),
        nodeName: this.nodeInfo.getNodeName(),
        address: this.nodeInfo.getAddress(),
        publicAddress: this.nodeInfo.getPublicAddress(),
        port: this.nodeInfo.getPort(),
        redundancyNodeName: this.nodeInfo.getRedundancyNodeName(),
      }
    return await this.opsInterface.editNodeInfo(o, r)
  }
  load () {
    var e = fs.existsSync(nodeRegisterFile)
    if (e) {
      var t = fs.readFileSync(nodeRegisterFile, 'utf-8')
      this.jsonToObject(t)
    } else logger.info(nodeRegisterFile + ' is not exist')
  }
  save () {
    var e = this,
      t = e.objectToJson(),
      n = JSON.stringify(t)
      ; (fs.writeFileSync(nodeRegisterFile, n),
        fs.writeFileSync(gNodeRegisterExternalFile, n))
  }
  jsonToObject (e) {
    var t = this,
      n = e
    util.isJsonString(n) && (n = JSON.parse(n))
    var o = ['nodeInfo', 'maintenanceCenterInfo', 'userCenterInfo']
    for (var r in o)
      n.hasOwnProperty(o[r]) &&
        (util.isJSON(n[o[r]])
          ? t[o[r]].jsonToObject(n[o[r]])
          : (t[o[r]] = n[o[r]]))
  }
  objectToJson () {
    var e = {}
    return (
      (e.nodeInfo = this.nodeInfo.objectToJson()),
      (e.maintenanceCenterInfo = this.maintenanceCenterInfo.objectToJson()),
      (e.userCenterInfo = this.userCenterInfo.objectToJson()),
      e
    )
  }
}
module.exports = NodeRegister
