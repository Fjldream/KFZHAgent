var ImageMngModel = require(__dir + '/lib/services/image/image_mng'),
  ImageDownload = require(__dir + '/lib/services/image/image_download'),
  ExecMngModel = require(__dir + '/lib/services/exec/exec_mng'),
  ExecDownload = require(__dir + '/lib/services/exec/exec_download'),
  ProjectMngModel = require(__dir + '/lib/services/project/project_mng'),
  ProjectDownload = require(__dir + '/lib/services/project/project_download'),
  appMng = require(__dir + '/lib/services/app/app_mng')
const profilesManage = require(__dir + '/lib/services/profiles/profiles_manage')
var proxyConfigJson = profilesManage.getGlobalCache()
const pm2Delegate = require(`${__dir}/lib/services/deploy/pm2Delegate`),
  pm2DelegateInstance = pm2Delegate.getPM2Instance(),
  os = require('os')
var child_process = require('child_process'),
  path = require('path'),
  fs = require('fs'),
  net = require('net')
const commonPub = require(__dir + '/lib/services/common/public'),
  { util, fileHandler, format } = require(__dir + '/core/util')
var osType = os.platform() === 'win32' ? 0 : 1
let osArch = os.arch().includes('arm') ? 0 : 1
const addressMng = require(__dir + '/lib/services/common/address_mng.js')
class AppControlExPm2 {
  constructor() {
    ;((this.imageMng = new ImageMngModel()),
      (this.imageDownload = new ImageDownload()),
      (this.execMng = new ExecMngModel()),
      (this.execDownload = new ExecDownload()),
      (this.projectMng = new ProjectMngModel()),
      (this.projectDownLoad = new ProjectDownload()),
      (this.pidMap = new Map()),
      (this.OauthRegisterJson = {}),
      (this.nodeRegisterJson = {}),
      (this.opsInterface = {}),
      (this.userAuthenticationInterface = {}))
  }
  init() {
    ;(this.imageDownload.init(),
      this.execDownload.init(),
      this.projectDownLoad.init(),
      (this.OauthRegisterJson = require(__dir + '/data/OauthRegister.json')),
      (this.nodeRegisterJson = require(__dir + '/data/nodeRegister.json')))
    var e = require(__dir + '/lib/services/interface/ops_interface')
    this.opsInterface = new e()
    var t = require(__dir + '/lib/services/interface/user_authentic_interface')
    this.userAuthenticationInterface = new t()
  }

  // modified by jinlong.feng at 20260909 冗余功能-批量启停功能完善
  /**
   * 将批量 APP 操作抛出的异常转换为稳定的错误文案。
   *
   * @param {unknown} error 批量 APP 操作异常。
   * @returns {string} 可返回给运维中心的错误文案。
   */
  _normalizeBatchError(error) {
    if (error && typeof error.message === 'string' && error.message) {
      return error.message
    }
    if (typeof error === 'string' && error) return error
    return 'APP operation failed'
  }

  /**
   * 根据 APP ID 查询本节点保存的工程信息。
   *
   * @param {string} appId APP ID。
   * @returns {Promise<object>} APP 工程信息。
   */
  async _getBatchAppInfo(appId) {
    var appInfo = {}
    await appMng.getAppBaseInfo({ appId }, function (error, data) {
      if (!error) appInfo = data
    })
    return appInfo
  }

  /**
   * 获取 APP 的批量启动阶段，数据源工程优先于其他工程。
   *
   * @param {object} appInfo APP 工程信息。
   * @returns {number} 批量启动阶段序号。
   */
  _getAppStartStage(appInfo) {
    return appInfo &&
      Number(appInfo.projectType) === Number(commonPub.enumProjectType.PROJECT_DBCONNECTOR)
      ? 0
      : 1
  }

  /**
   * 检查 APP 是否已经进入 PM2 online 状态。
   *
   * @param {object} appInfo APP 工程信息。
   * @returns {Promise<boolean>} APP 是否在线。
   */
  async _isBatchAppOnline(appInfo) {
    if (!appInfo || !appInfo.appName) return false
    const processes = await pm2DelegateInstance.pm2Describe(appInfo.appName)
    return (
      Array.isArray(processes) &&
      processes.some((process) => process.pm2_env && process.pm2_env.status === 'online')
    )
  }

  /**
   * 等待 APP 进入 PM2 online 状态。
   *
   * @param {Function} checkOnline APP 在线状态检查函数。
   * @param {object} options 等待配置。
   * @param {number} options.timeoutMs 最大等待时间。
   * @param {number} options.intervalMs 检查间隔。
   * @returns {Promise<boolean>} 是否在超时前进入在线状态。
   */
  async _waitForAppOnline(checkOnline, { timeoutMs = 10000, intervalMs = 500 } = {}) {
    const timeout = Math.max(0, Number(timeoutMs) || 0)
    const interval = Math.max(0, Number(intervalMs) || 0)
    const deadline = Date.now() + timeout

    do {
      if (await checkOnline()) return true
      if (Date.now() >= deadline) return false
      if (interval > 0) {
        await new Promise((resolve) => setTimeout(resolve, interval))
      } else {
        await Promise.resolve()
      }
    } while (Date.now() <= deadline)

    return false
  }

  /**
   * 按阶段和并发数执行批量 APP 操作，并保留输入顺序和单项结果。
   *
   * @param {string[]} appIds APP ID 列表。
   * @param {Function} action 单个 APP 操作函数。
   * @param {object} options 批量执行配置。
   * @param {number} options.concurrency 最大并发数。
   * @param {Function} options.getStage APP 阶段计算函数。
   * @returns {Promise<object[]>} 按输入顺序排列的执行结果。
   */
  async _executeBatchAppAction(appIds, action, { concurrency = 4, getStage } = {}) {
    const ids = Array.isArray(appIds) ? appIds : []
    if (ids.length === 0) return []

    const limit = Math.max(1, Math.min(Number(concurrency) || 1, ids.length))
    const results = new Array(ids.length)
    const stages = new Map()

    ids.forEach((appId, index) => {
      const stage = typeof getStage === 'function' ? Number(getStage(appId)) || 0 : 0
      if (!stages.has(stage)) stages.set(stage, [])
      stages.get(stage).push(index)
    })

    const executeStage = async (indexes) => {
      let nextIndex = 0
      const worker = async () => {
        while (nextIndex < indexes.length) {
          const index = indexes[nextIndex]
          nextIndex += 1
          const appId = ids[index]
          try {
            const result = (await action(appId)) || {}
            results[index] = {
              appId,
              cmdStatus: result.cmdStatus === 2 ? 2 : 3,
              message:
                result.message || (result.cmdStatus === 2 ? 'succeed' : 'APP operation failed'),
            }
          } catch (error) {
            results[index] = {
              appId,
              cmdStatus: 3,
              message: this._normalizeBatchError(error),
            }
          }
        }
      }

      await Promise.all(Array.from({ length: Math.min(limit, indexes.length) }, () => worker()))
    }

    for (const stage of [...stages.keys()].sort((left, right) => left - right)) {
      await executeStage(stages.get(stage))
    }
    return results
  }

  /**
   * 执行按工程类型分阶段的 PM2 批量启动。
   *
   * @param {string[]} appIds APP ID 列表。
   * @returns {Promise<object[]>} 按输入顺序排列的启动结果。
   */
  async _executeTypeAwareBatchStart(appIds) {
    const ids = Array.isArray(appIds) ? appIds : []
    const appInfoById = new Map()

    await Promise.all(
      ids.map(async (appId) => {
        appInfoById.set(appId, (await this._getBatchAppInfo(appId)) || {})
      }),
    )

    return this._executeBatchAppAction(
      ids,
      async (appId) => {
        const result = (await this.AppStart(appId)) || {}
        const appInfo = appInfoById.get(appId) || {}
        if (result.cmdStatus !== 2 || this._getAppStartStage(appInfo) !== 0) {
          return result
        }

        const online = await this._waitForAppOnline(() => this._isBatchAppOnline(appInfo), {
          timeoutMs: 10000,
          intervalMs: 500,
        })
        if (online) return result

        return {
          cmdStatus: 3,
          message: `数据源 APP [${appInfo.appName || appId}] 启动后未进入 online 状态`,
        }
      },
      {
        concurrency: 4,
        getStage: (appId) => this._getAppStartStage(appInfoById.get(appId)),
      },
    )
  }
  // end

  async AppDeploy(e) {
    try {
      var t = this,
        i = 2,
        r = 'succeed',
        a = e.appId
      e.execType = e.projectType
      let M = e.deployMode
      var p = e.projectId,
        g = e.projectType,
        c = e.execFileName,
        n = e.execVersion,
        m = !1,
        T = !1,
        S = appMng.findAppBaseById(a)
      if (S !== -1) {
        var v = appMng.appsBaseInfo[S]
        v.port === e.port
          ? (logger.error('App: ' + a + ' port is SelfOcupied.'), (m = !0))
          : ((T = !0), (v.port = e.port), appMng.save())
      }
      if (m === !1) {
        var h = await this.checkPortsOcupied(Number(e.port))
        let A = !1
        if (
          (e.projectType == 2 && e.wsPort && (A = await this.checkPortsOcupied(Number(e.wsPort))),
          h || A)
        )
          return {
            cmdStatus: 3,
            message: `\u6B64\u7AEF\u53E3\u53F7[${e.port}]\u5DF2\u88AB\u5360\u7528\uFF0C\u8BF7\u4FEE\u6539`,
          }
      }
      var O = this.detectRunningStatus(osType, e.port)
      if (e.projectType === commonPub.enumProjectType.PROJECT_NGINX) {
        if (((e.isLoadApp = !0), m === !0 && O === 'running'))
          return {
            cmdStatus: 2,
            message:
              '\u6B64\u8D1F\u8F7D\u5747\u8861\u5668\u5DF2\u7ECF\u90E8\u7F72\u4E14\u6B63\u5728\u8FD0\u884C',
          }
        if (T === !0)
          return {
            cmdStatus: 3,
            message:
              '\u6B64\u8D1F\u8F7D\u5747\u8861\u5668\u7AEF\u53E3\u53F7\u5DF2\u4FEE\u6539\uFF0C\u8BF7\u5148\u64A4\u9500\u90E8\u7F72',
          }
      }
      if (
        (e.projectType !== commonPub.enumProjectType.PROJECT_CLIENT &&
          O === 'running' &&
          (await this.AppStop(a)),
        M === 'full')
      ) {
        ;(this.execDownload.setSolutionId(e.solutionId),
          this.execDownload.setProjectId(p),
          this.execDownload.setProjectVersion(e.projectVersion),
          this.execDownload.setExecName(c),
          this.execDownload.setExecType(g),
          this.execDownload.setExecVersion(n),
          this.execDownload.setAppId(a))
        var d = t.execDownload.getDesExecDir(),
          u = !1,
          P = !0,
          S = this.execMng.findExec(n, g)
        if (osType === 1)
          if (S !== -1) {
            u = !0
            var o = this.execMng.execHome.execs[S],
              s = o.agentExecModTime,
              E = o.serverExecModTime
            if (fs.existsSync(d)) {
              var b = fs.statSync(path.join(d, 'exe')).mtimeMs,
                N = 0
              b === s
                ? ((N = await t.execDownload.getExecModifyTime()),
                  N === E
                    ? (P = !1)
                    : logger.info(
                        '\u6587\u4EF6\u670D\u52A1\u4E2D\u53EF\u6267\u884C\u7A0B\u5E8F\u6709\u6539\u52A8\uFF0C\u9700\u8981\u91CD\u65B0\u4E0B\u8F7D\uFF01',
                      ))
                : logger.info(
                    '\u8FD0\u7EF4\u4EE3\u7406\u5DF2\u4E0B\u8F7D\u7684\u53EF\u6267\u884C\u7A0B\u5E8F\u6709\u6539\u52A8\uFF0C\u9700\u8981\u91CD\u65B0\u4E0B\u8F7D\uFF01',
                  )
            } else
              logger.info(
                '\u8FD8\u672A\u4E0B\u5728\u53EF\u6267\u884C\u7A0B\u5E8F\uFF0C\u9700\u8981\u91CD\u65B0\u4E0B\u8F7D\uFF01',
              )
          } else
            logger.info(
              '\u7BA1\u7406\u5668\u4E2D\u672A\u89C1\u8BE5\u53EF\u6267\u884C\u7A0B\u5E8F\uFF0C\u9700\u8981\u91CD\u65B0\u4E0B\u8F7D\uFF01',
            )
        if (P) {
          logger.info(
            '-----------------------\u91CD\u65B0\u4E0B\u8F7D\u53EF\u6267\u884C\u7A0B\u5E8F\uFF01---------------------',
          )
          var D = await t.execDownload.downloadExec()
          if (!D)
            return {
              cmdStatus: 3,
              message: '\u53EF\u6267\u884C\u7A0B\u5E8F\u4E0B\u8F7D\u5931\u8D25\uFF01',
            }
          ;((b = fs.statSync(path.join(d, 'exe')).mtimeMs),
            N === 0 && (N = await t.execDownload.getExecModifyTime()),
            u
              ? this.execMng.modifyExec(
                  { execVersion: n, type: g, serverExecModTime: N, agentExecModTime: b },
                  function () {},
                )
              : this.execMng.addExec(
                  { execVersion: n, type: g, serverExecModTime: N, agentExecModTime: b },
                  function () {},
                ))
        } else
          logger.info(
            '-----------------------\u4E0D\u9700\u8981\u91CD\u65B0\u4E0B\u8F7D\u53EF\u6267\u884C\u7A0B\u5E8F\uFF01---------------------',
          )
      }
      var y = e.projectType,
        j = e.projectVersion,
        $ = e.debug
      ;(this.projectDownLoad.setTenantId(e.tenantId),
        this.projectDownLoad.setSolutionId(e.solutionId),
        this.projectDownLoad.setProjectId(p),
        this.projectDownLoad.setProjectType(y),
        this.projectDownLoad.setProjectVersion(j),
        this.projectDownLoad.setAppId(a))
      var _ = this.projectDownLoad.getDesProjectDir(e.isLoadApp, $),
        f = _ + '/project/externalconfig.json',
        w = _ + '/project/externalConfig.json'
      if ((fs.existsSync(f) && fs.unlinkSync(f), !$ || $ === !1)) {
        var x = await t.projectDownLoad.downloadProject(e.isLoadApp, !1)
        if (!x)
          return { appId: a, cmdResult: 3, message: '\u5DE5\u7A0B\u4E0B\u8F7D\u5931\u8D25\uFF01' }
        this.projectMng.findProjectByIdAndVersion(p, j) !== -1 ||
          this.projectMng.addProject(
            { projectId: p, projectVersion: j, projectType: y },
            function () {},
          )
      }
      var C = this.OauthRegisterJson,
        J = this.nodeRegisterJson,
        l = {}
      if (
        (fs.existsSync(f)
          ? (l = JSON.parse(fs.readFileSync(f, 'utf-8')))
          : fs.existsSync(w) && (l = JSON.parse(fs.readFileSync(w, 'utf-8'))),
        l.runOptions || (l.runOptions = {}),
        (l.runOptions.protocol = addressMng.httpNum),
        l.expose || (l.expose = {}),
        (l.expose.port = Number(e.port)),
        e.projectType === commonPub.enumProjectType.PROJECT_COLLECTION)
      ) {
        l.expose.httpPort = e.wsPort ? Number(e.wsPort) : Number(e.port)
        let A = path.join(_, './project/ProjectPorpertyInfo.json')
        const k = JSON.parse(fs.readFileSync(A))
        ;((k.ListenPort = Number(e.port)), fs.writeFileSync(A, JSON.stringify(k), 'utf8'))
      }
      ;((l.isLoadApp = e.isLoadApp),
        l.oauth || (l.oauth = {}),
        (l.oauth.client_id = C.clientId),
        (l.oauth.client_secret = C.clientSecret),
        commonPub.enumProjectType.PROJECT_IOSERVER == e.projectType ||
          commonPub.enumProjectType.PROJECT_NGINX == e.projectType ||
          (l.redis || (l.redis = {}),
          (l.redis.host = proxyConfigJson.opsCenterAddress + ':' + proxyConfigJson.redis.port),
          (l.redis.pwd = proxyConfigJson.redis.pwd)),
        (l.opsProxy = {}),
        (l.opsProxy.host = J.nodeInfo.address + ':' + J.nodeInfo.port),
        l.tenant || (l.tenant = {}),
        (l.tenant.tenantId = e.tenantId),
        (l.nginxType = proxyConfigJson.nginxType),
        (l.nginxPort = proxyConfigJson.nginxPort),
        (l.kingGateWay = {}),
        proxyConfigJson.nginxType === 1
          ? (l.kingGateWay.host = `https://${proxyConfigJson.opsCenterAddress}:${proxyConfigJson.nginxPort}/api`)
          : (l.kingGateWay.host = `http://${proxyConfigJson.opsCenterAddress}:${proxyConfigJson.nginxPort}/api`),
        l.defaultUser || (l.defaultUser = {}),
        (l.defaultUser.username = proxyConfigJson.defaultUser.username),
        (l.defaultUser.password = proxyConfigJson.defaultUser.password),
        (l.APPName = e.appName),
        commonPub.enumProjectType.PROJECT_COLLECTION == e.projectType && (l.IOVersion = 4),
        fs.existsSync(_) || fs.mkdirSync(_, { recursive: !0 }))
      var F = JSON.stringify(l)
      switch (
        (fs.writeFileSync(f, F, 'utf8'),
        appMng.createAppBase(e, function () {
          logger.info('createAppBase success for ' + e.appId)
        }),
        e.projectType)
      ) {
        case commonPub.enumProjectType.PROJECT_KIO:
          var B = this.getDeployDir(e, 'Project'),
            R = this.getDeployDir(e, 'AppExe')
          ;(logger.info('projDir: ' + B), logger.info('exeDir: ' + R))
          var q = R + '/start.sh'
          if (osType === 0) {
            q = R + '/testDriver/60.7.17.10/driver_x86/driverInstall.bat'
            var X = R + '/DriverInstallTool.exe',
              L = child_process.execFile(q, [X], null, function (A, k, V) {
                console.log('err: ' + A + 'stdout: ' + k + 'stderr: ' + V)
              })
          } else var L = child_process.execFile(q, [B], { cwd: R }, function (k, V, H) {})
          ;(L.on('close', (A) => {
            console.log(A)
          }),
            L.on('exit', (A) => {
              console.log(A)
            }),
            L.on('error', (A) => {
              console.log(A)
            }))
          break
        default:
          break
      }
      ;(await appMng.setAppDeployStatus(
        { appId: a, appDeployStatus: commonPub.enumAppDeployStatus.APP_DEPLOYED },
        function () {},
      ),
        O === 'running' || e.projectType === commonPub.enumProjectType.PROJECT_NGINX
          ? (logger.info(
              `------\u521D\u59CB\u8FD0\u884C\u72B6\u6001\u4E3Arunning\uFF0C\u91CD\u542FAPP\uFF1A${a}------`,
            ),
            e.projectType !== commonPub.enumProjectType.PROJECT_CLIENT && (await this.AppStart(a)),
            await appMng.setExpectedAppStatus(
              {
                appId: a,
                expectedAppStatus: commonPub.enumAppStatus.APP_RUNNING,
                expectedStatusTimeStamp: parseInt(new Date().getTime()),
              },
              function () {},
            ))
          : await appMng.setExpectedAppStatus(
              {
                appId: a,
                expectedAppStatus: commonPub.enumAppStatus.APP_STOPPED,
                expectedStatusTimeStamp: parseInt(new Date().getTime()),
              },
              function () {},
            ))
      var U = appMng.findAppBaseByName(e.appName)
      if (U > -1) {
        var G = appMng.appsBaseInfo[U].appId
        G !== e.appId && (await appMng.delAppBase({ appId: G }, function () {}))
      }
      return { cmdStatus: i, message: r }
    } catch (M) {
      return (
        console.log(M),
        { cmdStatus: 3, message: '\u6307\u4EE4\u5F02\u5E38\u9000\u51FA\uFF01' }
      )
    }
  }
  async AppStart(e) {
    try {
      var t = 2,
        i = 'succeed',
        r = {}
      await appMng.getAppBaseInfo({ appId: e }, function (_, f) {
        if (!_) r = f
        else return { cmdStatus: 3, message: '\u4E0D\u5B58\u5728\u8BE5APP\u6570\u636E\uFF01' }
      })
      var a = this.detectRunningStatus(osType, r.port)
      ;(a === 'running' && (await this.AppStop(e)), loggerPm2.info(`${r.appName} will start...`))
      var p = this.getDeployDir(r, 'node')
      switch (r.projectType) {
        case commonPub.enumProjectType.PROJECT_CLIENT:
          var o = this.getDeployDir(r, 'Project'),
            s = this.getDeployDir(r, 'AppExe')
          ;(logger.info('projDir: ' + o), logger.info('exeDir: ' + s))
          var y = {
              name: r.appName,
              interpreter: `${p}`,
              script: 'index.js',
              cwd: `${s}`,
              args: [o, global.logRetainTime],
              node_args: '--experimental-worker',
              disable_logs: !0,
            },
            j = await pm2DelegateInstance.pm2StartSync(y)
          j.code === 0
            ? loggerPm2.info(`${r.appName} start success!`)
            : loggerPm2.info(`${r.appName} start fail:${j.error}`)
          break
        case commonPub.enumProjectType.PROJECT_COLLECTION:
          var o = this.getDeployDir(r, 'Project'),
            s = this.getDeployDir(r, 'AppExe'),
            P = path.join(s, '../win64/exe/IOServer.exe'),
            y = {
              name: r.appName,
              script: P,
              autorestart: !0,
              watch: !1,
              args: ['-pc', o],
              disable_logs: !0,
              max_restart: 10,
            }
          if (osType == 1) {
            let _ = osArch === 1 ? 'linux_x64' : 'linux_arm64'
            ;((P = path.join(s, `../${_}/exe/start.sh`)),
              (y = {
                name: r.appName,
                script: P,
                autorestart: !0,
                watch: !1,
                args: [o],
                disable_logs: !0,
              }))
          }
          var j = await pm2DelegateInstance.pm2StartSync(y)
          j.code === 0
            ? loggerPm2.info(`${r.appName} start success!`)
            : loggerPm2.info(`${r.appName} start fail:${j.error}`)
          break
        case commonPub.enumProjectType.PROJECT_CALCULATION:
          var o = this.getDeployDir(r, 'Project'),
            s = this.getDeployDir(r, 'AppExe')
          ;(logger.info('projDir: ' + o), logger.info('exeDir: ' + s))
          var y = {
              name: r.appName,
              interpreter: `${p}`,
              script: 'index.js',
              cwd: s,
              exec_path: o,
              node_args: '--experimental-worker',
              args: [o, global.logRetainTime],
              disable_logs: !0,
            },
            j = await pm2DelegateInstance.pm2StartSync(y)
          j.code === 0
            ? loggerPm2.info(`${r.appName} start success!`)
            : loggerPm2.info(`${r.appName} start fail:${j.error}`)
          break
        case commonPub.enumProjectType.PROJECT_ALARMCAL:
          var o = this.getDeployDir(r, 'Project'),
            s = this.getDeployDir(r, 'AppExe')
          ;(logger.info('projDir: ' + o), logger.info('exeDir: ' + s))
          var y = {
              name: r.appName,
              script: 'index.js',
              interpreter: `${p}`,
              cwd: s,
              node_args: '--experimental-worker',
              args: [o, global.logRetainTime],
              disable_logs: !0,
            },
            j = await pm2DelegateInstance.pm2StartSync(y)
          j.code === 0
            ? loggerPm2.info(`${r.appName} start success!`)
            : loggerPm2.info(`${r.appName} start fail:${j.error}`)
          break
        case commonPub.enumProjectType.PROJECT_IOSERVER:
          var o = this.getDeployDir(r, 'Project'),
            s = this.getDeployDir(r, 'AppExe')
          ;(logger.info('projDir: ' + o), logger.info('exeDir: ' + s))
          var P = s + '/start.sh'
          if (osType === 0) {
            P = s + '/start.bat'
            var g = s + '/KIODriverInstall',
              c = s + '/IOServer',
              n = child_process.execFile(P, [g, c, o], null, function (_, f, w) {
                logger.info('err: ' + _ + 'stdout: ' + f + 'stderr: ' + w)
              })
          } else var n = child_process.execFile(P, [o], { cwd: s }, function (f, w, x) {})
          ;(n.on('close', (_) => {
            console.log(_)
          }),
            n.on('exit', (_) => {
              console.log(_)
            }),
            n.on('error', (_) => {
              console.log(_)
            }))
          break
        case commonPub.enumProjectType.PROJECT_DB:
          var o = this.getDeployDir(r, 'Project'),
            s = this.getDeployDir(r, 'AppExe')
          ;(logger.info('projDir: ' + o), logger.info('exeDir: ' + s))
          var P = s + '/start.sh'
          osType === 0 && (P = s + '/start.bat')
          var m = require(o + '/project.json'),
            T = m.dataSourceType.toLowerCase()
          child_process.execFile(P, [o], { cwd: s }, function (_, f, w) {})
          var S = require('child_process').execFile
          switch (T) {
            case 'mongodb':
              var d = s + '/newConf/mongodb/mongod.conf',
                u = path.join(__dir + '../../../../../valuepackage/mongodb'),
                n = S('start.bat', [d], { cwd: u }, function (f, w, x) {})
              break
            case 'postgresql':
              var v = require(o + '/dbConfig.json')
              if (v.Redundancy) var d = s + '/newConf/postgresql/pgsentinel.conf'
              else d = s + '/newConf/postgresql/postgresql.conf'
              var u = path.join(__dir + '../../../../../valuepackage/postgresql'),
                n = S('start.bat', [d], { cwd: u }, function (f, w, x) {})
              break
            case 'timescaledb':
              var h = require(o + '/dbConfig.json')
              if (h.Redundancy) var d = s + '/newConf/timescaledb/timescaledbsentinel.conf'
              else d = s + '/newConf/timescaledb/timescaledb.conf'
              var u = path.join(__dir + '../../../../../valuepackage/timescaledb'),
                n = S('start.bat', [d], { cwd: u }, function (f, w, x) {})
              break
            case 'redis':
              var O = require(o + '/dbConfig.json')
              if (O.Redundancy) var d = s + '/newConf/redis/sentinel.conf'
              else
                O.Cluster
                  ? (d = s + '/newConf/redis/cluster.conf')
                  : (d = s + '/newConf/redis/redis.conf')
              var u = path.join(__dir + '../../../../../valuepackage/redis'),
                n = S('start.bat', [d], { cwd: u }, function (f, w, x) {})
              break
            case 'mqtt':
              var d = s + '/newConf/mqtt/mqtt.conf',
                u = path.join(__dir + '../../../../../valuepackage/mqtt'),
                n = S('start.bat', [d], { cwd: u }, function (f, w, x) {})
              break
          }
          break
        case commonPub.enumProjectType.PROJECT_DBCONNECTOR:
          var o = this.getDeployDir(r, 'Project'),
            s = this.getDeployDir(r, 'AppExe')
          ;(logger.info('projDir: ' + o), logger.info('exeDir: ' + s))
          var y = {
              name: r.appName,
              interpreter: `${p}`,
              script: 'index.js',
              cwd: `${s}`,
              args: [o, global.logRetainTime],
              env: {
                NODE_ENV: 'production',
                LD_LIBRARY_PATH: `$LD_LIBRARY_PATH:${s}/core/extensions/linux/${os.arch() === 'arm64' ? 'arm64' : 'x86'}/KSLXC`,
              },
              disable_logs: !0,
            },
            j = await pm2DelegateInstance.pm2StartSync(y)
          j.code === 0
            ? loggerPm2.info(`${r.appName} start success!`)
            : loggerPm2.info(`${r.appName} start fail:${j.error}`)
          break
        case commonPub.enumProjectType.PROJECT_KIO:
          var o = this.getDeployDir(r, 'Project'),
            s = this.getDeployDir(r, 'AppExe')
          ;(logger.info('projDir: ' + o), logger.info('exeDir: ' + s))
          var P = s + '/start.sh'
          if (osType === 0) {
            P = s + '/start.bat'
            var c = s + '/IOServer.exe',
              n = child_process.execFile(P, [c, o], null, function (w, x, C) {
                console.log('err: ' + w + 'stdout: ' + x + 'stderr: ' + C)
              })
          } else var n = child_process.execFile(P, [o], { cwd: s }, function (f, w, x) {})
          ;(n.on('close', (_) => {
            console.log(_)
          }),
            n.on('exit', (_) => {
              console.log(_)
            }),
            n.on('error', (_) => {
              console.log(_)
            }))
          break
        case commonPub.enumProjectType.PROJECT_NGINX:
          var o = this.getDeployDir(r, 'Project'),
            s = this.getDeployDir(r, 'AppExe')
          ;(logger.info('projDir: ' + o), logger.info('exeDir: ' + s))
          var E = JSON.parse(fs.readFileSync(o + '/nginxCfg.json', 'utf-8')),
            b = E.netType,
            N = E.SSLCertificate,
            D = E.SSLKey
          this.dealNginxJsonEx(s, o, b, N, D)
          var y = {
              name: r.appName,
              script: path.join(s, 'nginx/nginx_node'),
              cwd: s,
              args: ['-c', path.join(o, 'nginx.conf'), '-p', path.join(s, 'nginx')],
              cwd: path.join(s, 'nginx'),
              disable_logs: !0,
            },
            j = await pm2DelegateInstance.pm2StartSync(y)
          j.code === 0
            ? loggerPm2.info(`${r.appName} start success!`)
            : loggerPm2.info(`${r.appName} start fail:${j.error}`)
          break
        default:
          break
      }
      ;(await fileHandler.sleep(2e3),
        await appMng.setExpectedAppStatus(
          {
            appId: e,
            expectedAppStatus: commonPub.enumAppStatus.APP_RUNNING,
            expectedStatusTimeStamp: parseInt(new Date().getTime()),
          },
          function () {},
        ))
      var $ = { cmdStatus: t, message: i }
      return $
    } catch (_) {
      return (
        console.log(_),
        { cmdStatus: 3, message: '\u6307\u4EE4\u5F02\u5E38\u9000\u51FA\uFF01' }
      )
    }
  }
  async AppRestart(e) {
    try {
      return await this.AppStart(e)
    } catch (t) {
      return (
        console.log(t),
        { cmdStatus: 3, message: '\u6307\u4EE4\u5F02\u5E38\u9000\u51FA\uFF01' }
      )
    }
  }
  async AppStop(e) {
    try {
      var t = 2,
        i = 'succeed',
        r = {}
      if (
        (await appMng.getAppBaseInfo({ appId: e }, function (p, g) {
          if (!p) r = g
          else return { cmdStatus: 3, message: '\u4E0D\u5B58\u5728\u8BE5APP\u6570\u636E\uFF01' }
        }),
        loggerPm2.info(`${r.appName} will stop...`),
        r.projectType === commonPub.enumProjectType.PROJECT_CLIENT ||
          r.projectType === commonPub.enumProjectType.PROJECT_CALCULATION ||
          r.projectType === commonPub.enumProjectType.PROJECT_DBCONNECTOR ||
          r.projectType === commonPub.enumProjectType.PROJECT_ALARMCAL ||
          r.projectType === commonPub.enumProjectType.PROJECT_COLLECTION)
      ) {
        let p = await pm2DelegateInstance.pm2StopSync(r.appName)
        p.code === 0
          ? loggerPm2.info(`${r.appName} stop success!`)
          : loggerPm2.info(`${r.appName} stop fail:${p.error}`)
      } else this.killProcessByPort(osType, r.port)
      await appMng.setExpectedAppStatus(
        {
          appId: e,
          expectedAppStatus: commonPub.enumAppStatus.APP_STOPPED,
          expectedStatusTimeStamp: parseInt(new Date().getTime()),
        },
        function () {},
      )
      var a = { cmdStatus: t, message: i }
      return a
    } catch (p) {
      return (
        console.log(p),
        { cmdStatus: 3, message: '\u6307\u4EE4\u5F02\u5E38\u9000\u51FA\uFF01' }
      )
    }
  }
  async AppUndeploy(e) {
    try {
      var t = 2,
        i = 'succeed',
        r = appMng.findAppBaseById(e)
      if (r !== -1) {
        var a = appMng.appsBaseInfo[r]
        if (
          (loggerPm2.info(`${a.appName} will undeploy...`),
          a.projectType === commonPub.enumProjectType.PROJECT_CLIENT ||
            a.projectType === commonPub.enumProjectType.PROJECT_CALCULATION ||
            a.projectType === commonPub.enumProjectType.PROJECT_DBCONNECTOR ||
            a.projectType === commonPub.enumProjectType.PROJECT_NGINX)
        ) {
          var p = await pm2DelegateInstance.pm2DeleteSync(a.appName)
          p.code === 0
            ? loggerPm2.info(`${a.appName} undeploy success!`)
            : loggerPm2.info(`${a.appName} undeploy fail:${p.message}`)
        }
        ;(appMng.delAppBase({ appId: a.appId }, function () {
          logger.info('createAppBase success for ' + a.appId)
        }),
          this.projectMng.findProjectByIdAndVersion(a.projectId, a.projectVersion) !== -1 &&
            this.projectMng.deleteProject(
              { projectId: a.projectId, projectVersion: a.projectVersion },
              function () {},
            ),
          this.deleteProjectFolder(a))
      } else ((t = 3), (i = '\u4E0D\u5B58\u5728\u8BE5APP\u6570\u636E\uFF01'))
      return (
        await appMng.setAppDeployStatus(
          { appId: e, appDeployStatus: commonPub.enumAppDeployStatus.APP_UNDEPLOY },
          function () {},
        ),
        { cmdStatus: t, message: i }
      )
    } catch (g) {
      return { cmdStatus: 3, message: g.message }
    }
  }
  async AppDelete(e) {
    var t = 2,
      i = 'succeed',
      r = { cmdStatus: t, message: i }
    return r
  }
  async saveLogRetainTime(e) {
    var t = 2,
      i = 'succeed'
    try {
      let r = path.resolve(__dir, '../../../../config/common.json')
      if (!fs.existsSync(r)) return callback('proxy\u914D\u7F6E\u6587\u4EF6\u4E0D\u5B58\u5728')
      let a = fs.readFileSync(r)
      return (
        (a = JSON.parse(a)),
        (a.logConfig.node.retainTime = e),
        fs.writeFileSync(r, JSON.stringify(a)),
        (global.logRetainTime = e),
        { cmdStatus: t, message: i }
      )
    } catch (r) {
      return { cmdStatus: 3, message: r.message }
    }
  }
  async AppBatchDeploy(e) {
    for (var t = [], i = 0; i < e.length; i++)
      t.push({ appId: e[i].appId, cmdStatus: 2, message: 'success' })
    return t
  }

  // modified by jinlong.feng at 20260909 冗余功能-批量启停功能完善
  /**
   * 按数据源优先规则批量启动 PM2 APP。
   *
   * @param {string[]} e APP ID 列表。
   * @returns {Promise<object[]>} 每个 APP 的启动结果。
   */
  async AppBatchStart(e) {
    return this._executeTypeAwareBatchStart(e)
  }
  // end

  async AppBatchRestart(e) {
    for (var t = [], i = 0; i < e.length; i++)
      t.push({ appId: e[i], cmdStatus: 2, message: 'success' })
    return t
  }

  // modified by jinlong.feng at 20260909 冗余功能-批量启停功能完善
  /**
   * 并发批量停止 PM2 APP。
   *
   * @param {string[]} e APP ID 列表。
   * @returns {Promise<object[]>} 每个 APP 的停止结果。
   */
  async AppBatchStop(e) {
    return this._executeBatchAppAction(e, (appId) => this.AppStop(appId), {
      concurrency: 8,
    })
  }
  // end

  async AppBatchUndeploy(e) {
    for (var t = [], i = 0; i < e.length; i++)
      t.push({ appId: e[i], cmdStatus: 2, message: 'success' })
    return t
  }
  getProjectTypeStr(e) {
    var t = ''
    switch (e) {
      case commonPub.enumProjectType.PROJECT_CALCULATION: {
        t = 'kingcalculation'
        break
      }
      case commonPub.enumProjectType.PROJECT_CLIENT: {
        t = 'kingclient'
        break
      }
      case commonPub.enumProjectType.PROJECT_COLLECTION: {
        t = 'kingioserver'
        break
      }
      case commonPub.enumProjectType.PROJECT_DBCONNECTOR: {
        t = 'kingdbconnector'
        break
      }
      case commonPub.enumProjectType.PROJECT_DB: {
        t = 'kingdb'
        break
      }
      case commonPub.enumProjectType.PROJECT_IOSERVER: {
        t = 'kingioserver'
        break
      }
      case commonPub.enumProjectType.PROJECT_NGINX: {
        t = 'kingnginx'
        break
      }
      case commonPub.enumProjectType.PROJECT_KIO: {
        t = 'kio'
        break
      }
      case commonPub.enumProjectType.PROJECT_ALARMCAL: {
        t = 'kingalarm'
        break
      }
    }
    return t
  }
  getDeployDir(e, t) {
    var i = !0,
      r = '',
      a = '',
      p = this.getProjectTypeStr(e.projectType),
      g = osType === 0 ? 'windows' : 'linux'
    switch (t) {
      case 'AppExe':
        var n = `../../../../kingexedb/${p}/exe`
        ;(p === 'kingnginx' &&
          (g === 'linux'
            ? osArch === 0
              ? (n = `../../../../kingexedb/${p}/exe/linux_arm64`)
              : (n = `../../../../kingexedb/${p}/exe/linux_x64`)
            : (n = `../../../../kingexedb/${p}/exe/win64`)),
          (a = path.join(__dir, n)))
        break
      case 'Project':
        var c = ''
        ;(i
          ? e.projectType === commonPub.enumProjectType.PROJECT_NGINX
            ? (c = `../../../../sdb/${p}/${e.projectId}/project`)
            : (c = `../../../../sdb/${p}/${e.projectId}/${e.appId}/project`)
          : e.projectType === commonPub.enumProjectType.PROJECT_NGINX
            ? (c = `../../../../${r}`)
            : (c = `../../../../${r}`),
          (a = path.join(__dir, c)))
        break
      case 'node':
        let m = '../../../../env/win64/node'
        ;(g === 'linux' &&
          (osArch === 0
            ? (m = '../../../../env/linux_arm64/node')
            : (m = '../../../../env/linux_x64/node')),
          (a = path.join(__dir, m)))
        break
      default:
        a = []
        var n = `../../../../kingexedb/${p}/exe`
        if (((a[0] = path.join(__dir, n)), i))
          var c = `../../../../sdb/${p}/${e.projectId}/${e.appId}/project`
        else var c = `../../../../${r}`
        a[1] = path.join(__dir, c)
        break
    }
    return a
  }
  async checkPortsOcupied(e) {
    return new Promise((t, i) => {
      var r = net.createServer().listen(e)
      ;(r.on('listening', function () {
        ;(r.close(), t(!1))
      }),
        r.on('error', function (a) {
          ;(a.code === 'EADDRINUSE' && (console.log(`port ${e} is ocupied`), t(!0)), t(!1))
        }))
    })
  }
  async deleteProjectFolder(e) {
    var t = ''
    e.projectType === commonPub.enumProjectType.PROJECT_NGINX
      ? (t = `../../../../sdb/${this.getProjectTypeStr(e.projectType)}/${e.projectId}/project`)
      : e.projectType === commonPub.enumProjectType.PROJECT_COLLECTION
        ? (t = `../../../../sdb/${this.getProjectTypeStr(e.projectType)}/${e.projectId}/${e.appId}/project`)
        : (t = `../../../../sdb/${this.getProjectTypeStr(e.projectType)}/${e.projectId}/${e.projectVersion}/${e.appId}/project`)
    var i = path.join(__dir, t)
    logger.info('AppUndeploy execDir: ', i)
    var r = os.platform()
    try {
      if (r === 'win32') {
        var a = 'DEL /F /A /Q \\\\?\\' + i,
          p = 'RD /S /Q \\\\?\\' + i
        ;(child_process.execSync(a), child_process.execSync(p))
      } else if (r === 'linux') {
        var g = 'rm -rf ' + i
        child_process.execSync(g)
      }
    } catch {}
  }
  killProcessByPort(e, t) {
    if (e === 0)
      try {
        var i = `netstat -ano | findstr TCP | findstr LISTENING | findstr /c:":${t} "`,
          r = child_process.execSync(i).toString(),
          a = r.trim().split(/\s+/)
        ;(console.info(`--------\u5173\u95EDapp[pid=${a[4]}]`),
          a.length > 0 && a[4] != 0 && child_process.execSync(`taskkill /f /t /pid ${a[4]}`))
      } catch (g) {
        logger.info(g)
      }
    else {
      var i = `netstat -tunlp |grep ${t}|awk '{print $7}'|cut -d/ -f1`,
        p = child_process.execSync(i).toString().trim()
      p.length > 0 && process.kill(`${p}`)
    }
  }
  detectRunningStatus(e, t) {
    if (e === 0)
      try {
        var i = `netstat -ano | findstr TCP | findstr LISTENING | findstr /c:":${t} "`,
          r = child_process.execSync(i).toString().trim()
        if (r.length > 0) return 'running'
      } catch {
        return 'stoped'
      }
    else {
      var i = `netstat -tunlp |grep ${t}|awk '{print $7}'`,
        r = child_process.execSync(i).toString().trim()
      if (r.length > 0) return 'running'
    }
    return 'stoped'
  }
  dealNginxJsonEx(e, t, i, r, a) {
    ;((e = e.replace(/\\/g, '/')), (t = t.replace(/\\/g, '/')), console.log('projDir:' + t))
    var s = ''
    i === '0'
      ? (s = fs.readFileSync(e + '/nginx_http.conf'))
      : i === '1' && (s = fs.readFileSync(e + '/nginx_https.conf'))
    var p = fs.readFileSync(t + '/nginxCfg.json'),
      g = JSON.parse(p),
      c = s.toString(),
      n = c.indexOf('listen'),
      m = c.indexOf(';', n),
      T = c.slice(n, m),
      S = g.server.listen,
      v = ''
    switch (i) {
      case '0':
        v = 'listen       ' + S
        break
      case '1':
        v = 'listen       ' + S + ' ssl'
        break
      default:
        break
    }
    var h = c.replace(T, v)
    ;(i === '1' &&
      ((n = c.indexOf('ssl_certificate')),
      (m = c.indexOf(';', n)),
      (T = c.slice(n, m)),
      (v = 'ssl_certificate    ' + r),
      (h = h.replace(T, v)),
      (n = c.indexOf('ssl_certificate_key')),
      (m = c.indexOf(';', n)),
      (T = c.slice(n, m)),
      (v = 'ssl_certificate_key    ' + a),
      (h = h.replace(T, v))),
      (n = c.indexOf('include')),
      (m = c.indexOf(';', n)),
      (T = c.slice(n, m)),
      (v = 'include  ' + e + '/nginx/conf/mime.types'),
      (h = h.replace(T, v)),
      (c = h),
      (n = c.indexOf('server_name')),
      (m = c.indexOf(';', n)),
      (T = c.slice(n, m)),
      (v = g.server.server_name),
      (v = 'server_name  ' + v),
      (h = h.replace(T, v)),
      (c = h),
      (n = c.indexOf('#access_log')),
      (m = c.indexOf(';', n)))
    var O = c.indexOf('#error_page  404', m)
    ;((T = c.slice(m, O)), (v = ''))
    for (var d = 1; d <= g.server.locationArray.length; d++) {
      var u = ''
      d === 1
        ? (u =
            `;
		` +
            g.server.locationArray[d - 1].lName +
            ` {\r
                        `)
        : (u =
            g.server.locationArray[d - 1].lName +
            ` {\r
                        `)
      var P = 'http://'
      ;(g.server.locationArray[d - 1].proxy_pass === 'devops' && (P = 'https://'),
        (u = u + 'proxy_pass ' + P + g.server.locationArray[d - 1].proxy_pass + '/;'),
        (u =
          u +
          `\r
                        proxy_set_header Host $host;\r
                        proxy_set_header X-Real_IP $remote_addr;\r
                        proxy_set_header X-Forwarded-For $remote_addr:$remote_port;\r
                        proxy_http_version 1.1;\r
                        proxy_set_header Upgrade $http_upgrade;\r
                        proxy_set_header Connection "upgrade";\r
                        client_max_body_size  500m;`),
        (u =
          u +
          `\r
                }`),
        (u =
          u +
          `\r
		`),
        (v = v + u))
    }
    ;((h = c.replace(T, v)),
      (c = h),
      (n = c.indexOf('default_type')),
      (m = c.indexOf(';', n)),
      (O = c.indexOf('log_format', m)),
      (T = c.slice(m + 1, O)),
      (v = `
`))
    for (var d = 1; d <= g.upstreamArray.length; d++) {
      var u = ''
      d === 1
        ? (u =
            `
upstream ` +
            g.upstreamArray[d - 1].name +
            ` {\r
                        `)
        : (u =
            'upstream ' +
            g.upstreamArray[d - 1].name +
            ` {\r
                        `)
      for (var o = 1; o <= g.upstreamArray[d - 1].serverArray.length; o++)
        ((u = u + 'server ' + g.upstreamArray[d - 1].serverArray[o - 1].serverFlag + ';'),
          (u =
            u +
            `\r
                        `))
      ;((u =
        u +
        `\r
                }`),
        (u =
          u +
          `\r
		`),
        (v = v + u))
    }
    h = c.replace(T, v)
    var s = fs.writeFileSync(t + '/nginx.conf', h)
  }
}
module.exports = AppControlExPm2
