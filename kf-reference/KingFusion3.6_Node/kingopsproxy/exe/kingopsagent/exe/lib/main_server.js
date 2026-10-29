const fs = require('fs'),
  path = require('path'),
  commonPub = require(__dir + '/lib/services/common/public'),
  NodeRegister = require(__dir + '/lib/services/node/node_register'),
  ImageDownloadClass = require(__dir + '/lib/services/image/image_download'),
  HeartBeat = require(__dir + '/lib/services/polling/heartbeat'),
  startImage = require(__dir + '/lib/services/deploy/deploy'),
  AppReport = require(__dir + '/lib/services/polling/appReport'),
  AppPerfReport = require(__dir + '/lib/services/polling/appPerfReport'),
  addressMng = require(__dir + '/lib/services/common/address_mng'),
  PollingReport = require(__dir + '/lib/services/polling/polling_report'),
  appMng = require(__dir + '/lib/services/app/app_mng'),
  profilesManage = require(__dir + '/lib/services/profiles/profiles_manage'),
  proxyConfigJson = profilesManage.getGlobalCache(),
  dockerFlag = proxyConfigJson.docker.active
require(__dir + '/lib/models')
const pm2Delegate = require(`${__dir}/lib/services/deploy/pm2Delegate`),
  pm2DelegateInstance = pm2Delegate.getPM2Instance(),
  { format } = require(__dir + '/core/util'),
  publicFunc = require(__dir + '/lib/services/common/public'),
  INITNODEFLAG = { REGISTER: 0, MODIFIED: 1, UNCHANGED: 2 }

// modified by jinlong.feng at 0901 冗余功能开发
const { initializeNodeRedundancy } = require(__dir + '/lib/services/redundancy')
// end

class MainServer {
  constructor() {
    ;((this.nodeRegister = new NodeRegister()),
      (this.pollingReport = {}),
      (this.heartBeat = {}),
      (this.appDetect = {}),
      (this.appReport = {}),
      (this.appPerfReport = {}),
      // modified by jinlong.feng at 0901 冗余功能开发
      (this.redundancySubsystem = null))
    // end
  }
  async init() {
    await pm2DelegateInstance.pm2ConnectSync()
    var i = await this.nodeRegister.initLocalNode(),
      e = this.nodeRegister.getNodeInfo()
    await e.init()
    this.pollingReport = new PollingReport(e)
    this.appReport = new AppReport(e)
    this.appPerfReport = new AppPerfReport(e)
    // modified by jinlong.feng at 0901 冗余功能开发
    this.pollingReport.init({ startTimer: false })
    var a = this.pollingReport.commandExe.AppControl
    if (INITNODEFLAG.REGISTER === i) {
      appMng.appsBaseInfo.splice(0)
      appMng.save()
    }
    this.redundancySubsystem = initializeNodeRedundancy({ nodeInfo: e, appControl: a })
    const redundancyStartup =
      await this.redundancySubsystem.runtimeCoordinator.initializeAfterRegistration()
    const managedAppIds = new Set(redundancyStartup.managedAppIds || [])
    const activeAppIds = new Set(redundancyStartup.activeAppIds || [])
    this.heartBeat = new HeartBeat(e, this.redundancySubsystem.runtimeCoordinator)
    // end
    if ((dockerFlag === !0 && this.downloadImage(), INITNODEFLAG.MODIFIED === i)) {
      var s = JSON.parse(fs.readFileSync(__dir + '/data/OauthRegister.json', 'utf-8'))
      const g = addressMng.getGateWayHost()
      for (var t = 0; t < appMng.appsBaseInfo.length; t++) {
        var r = appMng.appsBaseInfo[t],
          p = ''
        r.projectType === commonPub.enumProjectType.PROJECT_NGINX
          ? (p = `../../../../sdb/${this.getProjectTypeStr(r.projectType)}/${r.projectId}/project/externalconfig.json`)
          : (p = `../../../../sdb/${this.getProjectTypeStr(r.projectType)}/${r.projectId}/${r.appId}/project/externalconfig.json`)
        var n = path.join(__dir, p)
        if (fs.existsSync(n)) {
          var o = JSON.parse(fs.readFileSync(n, 'utf-8'))
          ;((o.oauth.client_id = s.clientId),
            (o.oauth.client_secret = s.clientSecret),
            (o.redis.host = proxyConfigJson.redis.host),
            (o.redis.pwd = proxyConfigJson.redis.pwd),
            (o.kingGateWay.host = g))
          var d = JSON.stringify(o)
          ;(fs.writeFileSync(n, d),
            dockerFlag === !0 &&
              r.expectedAppStatus === commonPub.enumAppStatus.APP_RUNNING &&
              // modified by jinlong.feng at 0901 冗余功能开发
              (!managedAppIds.has(r.appId) || activeAppIds.has(r.appId)) &&
              // end
              (logger.info(`-------------------------\u91CD\u542FAPP:${r.appName}`),
              a.AppRestart(r.appId)))
        }
      }
    }
    if (INITNODEFLAG.UNCHANGED === i)
      for (var t = 0; t < appMng.appsBaseInfo.length; t++) {
        var r = appMng.appsBaseInfo[t]
        // modified by jinlong.feng at 0901 冗余功能开发
        if (
          r.expectedAppStatus === commonPub.enumAppStatus.APP_RUNNING &&
          !managedAppIds.has(r.appId)
        ) {
          // end
          logger.info(`-------------------------\u91CD\u542FAPP:${r.appName}`)
          let m = await a.AppRestart(r.appId),
            c = publicFunc.enumProjectTypeToLog[r.projectType] || '\u672A\u77E5',
            l = { ip: proxyConfigJson.opsProxy, user: '', tenantId: '', context: '', addon: {} },
            _ = format._parseCmdResultToLog(m)
          ;((l.context = `${c}APP\u7CFB\u7EDF\u91CD\u542F${_},APP\u540D\u79F0\u4E3A:${r.appName}`),
            appLogger.system.info(`\u7CFB\u7EDF\u91CD\u542F${c}APP`, l))
        }
      }
    // modified by jinlong.feng at 0901 冗余功能开发
    this.pollingReport.initTimer()
    this.heartBeat.init()
    this.appReport.init()
    this.appPerfReport.init()
    // end
  }
  getProjectTypeStr(i) {
    var e = ''
    switch (i) {
      case commonPub.enumProjectType.PROJECT_CALCULATION: {
        e = 'kingcalculation'
        break
      }
      case commonPub.enumProjectType.PROJECT_CLIENT: {
        e = 'kingclient'
        break
      }
      case commonPub.enumProjectType.PROJECT_COLLECTION: {
        e = 'kingio'
        break
      }
      case commonPub.enumProjectType.PROJECT_DBCONNECTOR: {
        e = 'kingdbconnector'
        break
      }
      case commonPub.enumProjectType.PROJECT_DB: {
        e = 'kingdb'
        break
      }
      case commonPub.enumProjectType.PROJECT_IOSERVER: {
        e = 'kingioserver'
        break
      }
      case commonPub.enumProjectType.PROJECT_NGINX: {
        e = 'kingnginx'
        break
      }
      case commonPub.enumProjectType.PROJECT_KIO: {
        e = 'kio'
        break
      }
      case commonPub.enumProjectType.PROJECT_ALARMCAL: {
        e = 'kingalarm'
        break
      }
    }
    return e
  }
  downloadImage() {
    var i = 'centos',
      e = 0,
      a = 'latest',
      s = new ImageDownloadClass(i, e, a)
    ;(s.init(),
      s.downloadImage(async function (t) {
        ;(logger.info('--------downloadImage Succeed ' + t + '--------'),
          await startImage.loadBaseImage())
      }))
  }
}
module.exports = MainServer
