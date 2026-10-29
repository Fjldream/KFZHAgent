const fs = require("fs"),
  path = require("path"),
  devProjectPath = process.argv[2];
(!process.env.NODE_ENV || process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "production") && (process.env.NODE_ENV = "production")
const appConfig = require("./config/config_app.json"),
  enums = require("./core/enums")
global.commonDir = path.resolve(`${__DIR}/../../../common/`)
const externalConfigPath = path.resolve(`${devProjectPath}/externalconfig.json`),
  kpConfig = require("../../../config/common.json")
global.kp_sqlCrypty = kpConfig.sqlCrypty

function checkParams () {
  try {
    if (!devProjectPath) throw "\u672A\u4F20\u9012\u5DE5\u7A0B\u8DEF\u5F84"
    if (!fs.existsSync(devProjectPath)) throw `\u5DE5\u7A0B\u8DEF\u5F84\u4E0D\u5B58\u5728:${devProjectPath}`
    global.devProjectPath = path.resolve(devProjectPath, "../"), global.externalConfig = JSON.parse(fs.readFileSync(externalConfigPath))
  } catch (e) {
    console.error(`\u5DE5\u7A0B\u8DEF\u5F84\u9519\u8BEF:${e}`), appLoggerConf.context = `${dbAppName}\u6570\u636E\u6E90APP \u5F02\u5E38\u9000\u51FA \u5DE5\u7A0B\u8DEF\u5F84\u9519\u8BEF:${e}`, appLogger.system.info("\u5F02\u5E38\u9000\u51FA", appLoggerConf), process.exit()
  }
}

function initLogger () {
  let e = require(`${global.commonDir}/log-utils`).getInstance()
  e.init(path.join(__dirname, `../../../sdb/logs/${global.externalConfig.APPName}`), {
    level: "info"
  }), global.logger = e
}

function initLogDB () {
  // const e = path.resolve(`${global.commonDir}/sqlitelog-utils`),
  //   o = require(e)
  global.dbAppName = global.externalConfig.APPName
  let t = path.resolve(`${global.commonDir}/../`),
    n = parseInt(process.argv[process.argv.length - 1]) || 1
  logger.log("info", `\u65E5\u5FD7\u4FDD\u5B58\u65F6\u95F4\u4E3A${n}\u5929`)
  // const a = new o({
  //   kfPath: t,
  //   dbType: "node",
  //   tableName: `app_${dbAppName}`,
  //   batchSize: 50,
  //   flushInterval: 2e3,
  //   retentionUnit: "day",
  //   retention: n,
  //   cleanupInterval: 720 * 60 * 1e3,
  //   level: "info"
  // })
  global.appLoggerConf = {
    ip: global.externalConfig.opsProxy.host.split(":")[0],
    tenantId: global.externalConfig.tenant.tenantId,
    user: "\u65E0",
    addon: {},
    context: ""
  }, global.appLogger = {
    system: { info: () => { }, error: () => { }, debug: () => { }, fatal: () => { } },
    operation: { info: () => { }, error: () => { }, debug: () => { }, fatal: () => { } },
    script: { info: () => { }, error: () => { }, debug: () => { }, fatal: () => { } },
  }
}

function initAuthorizationAndHeartbeat () {
  const e = require(`${global.commonDir}/authorization-utils`)
  e.init(enums.common.enum_ProductId.DATA_SOURCE, externalConfigPath)
  let {
    LiveHeart: o
  } = require(`${global.commonDir}/heartbeat-utils`)
  new o({
    host: `http://${global.externalConfig.opsProxy.host}`,
    APPName: global.externalConfig.APPName,
    interval: 1e3
  }, e).init()
}

function handleExceptions () {
  process.on("uncaughtException", function (e) {
    logger.log("fatal", `uncaughtException: ${e.message}`), logger.log("fatal", e.stack), e.code === "EADDRINUSE" && setTimeout(function () {
      appLoggerConf.context = `${dbAppName}\u6570\u636E\u6E90APP \u5F02\u5E38\u9000\u51FA:EADDRINUSE`, appLogger.system.info("\u5F02\u5E38\u9000\u51FA", appLoggerConf), process.exit(-1)
    }, 100)
  }), process.on("unhandledRejection", (e, o) => {
    logger.log("fatal", `unhandledRejection: ${e}`)
  })
}

function getRedisConfig () {
  let {
    host: e,
    pwd: o
  } = externalConfigPath.redis, [t, n] = e.split(":")
  return {
    host: t,
    port: Number(n),
    pwd: o
  }
}
async function initRedundance () {
  if (global.externalConfig.useRedundanceGateway && global.externalConfig.useRedundanceGateway === !0) {
    global.useRedundanceGateway = !0, global.redundanceState = enums.common.enum_RedandunceState.UNDEFINED
    const e = require("./lib/services/polling/redundanceState")
    let t = await require("./lib/services/interface/interface_ops").getRedundanceState()
    if (t.code === 0) global.redundanceState = t.redundanceState, new e().init()
    else throw "\u8BF7\u6C42\u5197\u4F59\u63A5\u53E3\u9519\u8BEF\uFF01"
  } else global.useRebundantGateway = !1
}
class Application {
  constructor() { }
  async start () {
    checkParams(), initLogger(), initLogDB(), appLoggerConf.context = `${dbAppName}\u6570\u636E\u6E90APP \u521D\u59CB\u5316\u65E5\u5FD7\u6253\u5370\u5B8C\u6210`, appLogger.system.info("\u521D\u59CB\u5316\u65E5\u5FD7\u6253\u5370\u5B8C\u6210", appLoggerConf), initAuthorizationAndHeartbeat(), appLoggerConf.context = `${dbAppName}\u6570\u636E\u6E90APP \u521D\u59CB\u5316\u5185\u5B58\u6570\u636E\u5E93`, appLogger.system.info("\u521D\u59CB\u5316\u5185\u5B58\u6570\u636E\u5E93", appLoggerConf)
    const o = require("./core/cache/cache")
    let t = null
    appConfig.cacheType === enums.common.enum_cacheType.REDIS_CACHE && (t = getRedisConfig()), o.init(appConfig.cacheType, t), appLoggerConf.context = `${dbAppName}\u6570\u636E\u6E90APP \u521D\u59CB\u5316\u5F02\u5E38\u5904\u7406`, appLogger.system.info("\u521D\u59CB\u5316\u5F02\u5E38\u5904\u7406", appLoggerConf), handleExceptions(), appLoggerConf.context = `${dbAppName}\u6570\u636E\u6E90APP \u521D\u59CB\u5316\u5197\u4F59\u914D\u7F6E`, appLogger.system.info("\u521D\u59CB\u5316\u5197\u4F59\u914D\u7F6E", appLoggerConf), await initRedundance(), appLoggerConf.context = `${dbAppName}\u6570\u636E\u6E90APP \u521D\u59CB\u5316\u6570\u636E\u6E90\u8FDE\u63A5`, appLogger.system.info("\u521D\u59CB\u5316\u6570\u636E\u6E90\u8FDE\u63A5", appLoggerConf), await require("./lib/services/datasource/datasource_mng").init(), appLoggerConf.context = `${dbAppName}\u6570\u636E\u6E90APP \u521D\u59CB\u5316http\u548Cws\u670D\u52A1`, appLogger.system.info("\u521D\u59CB\u5316http\u548Cws\u670D\u52A1", appLoggerConf), require("./server/server").init()
  }
}
module.exports = Application