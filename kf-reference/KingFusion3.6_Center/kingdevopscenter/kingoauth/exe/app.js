"use strict";
const path = require("path");
let httpserver = require(__DIR + "/server/httpserver");
const {
  util
} = require(__DIR + "/core/utils"), {
  settings
} = require(__DIR + "/config/index");
let packageCfg = require(__DIR + "/package.json");
const db_sqlite = require(__DIR + "/lib/datasources/sqlite"),
  db_redis = require(__DIR + "/lib/datasources/redis");
class Application {
  constructor() {}
  async start() {
    this.initLogger(), this.initLogDB(), this.displayAppInfo(), this.initServer(), this.initDB(),
      // modified by jinlong.feng at 2026-09-22 PAI门户Kafka单点登录
      this.initPaiSso(),
      // end
      this.displayConfiguration(), this.handleExceptions()
  }
  initServer() {
    httpserver.init()
  }
  initDB() {
    db_sqlite.init(), db_redis.init(logger), logger.log("info", "DB plugin load success")
  }
  // modified by jinlong.feng at 2026-09-22 PAI门户Kafka单点登录
  initPaiSso() {
    try {
      require(__DIR + "/lib/paiSso").init({ logger: logger })
    } catch (e) {
      logger.log("fatal", "paiSso init failed: " + e.message)
    }
  }
  // end
  initLogger() {
    const e = __DIR + "/../../../common/",
      t = require(e + "log-utils").getInstance();
    t.init(global.oauthLogPath), global.logger = t
  }
  initLogDB() {
    const e = __DIR + "/../../../common/",
      o = path.resolve(`${e}/sqlitelog-utils`),
      t = require(o);
    let n = path.resolve(`${e}/../`),
      g = require(path.resolve(`${e}/../config/common.json`));
    const i = new t({
      kfPath: n,
      dbType: "center",
      tableName: "kingoauth",
      batchSize: 50,
      flushInterval: 2e3,
      retentionUnit: "day",
      retention: g.logConfig.retainTime,
      cleanupInterval: 720 * 60 * 1e3,
      level: "info"
    });
    global.appLogger = {
      system: i.getLogger("system", "kingoauth"),
      operation: i.getLogger("opration", "kingoauth"),
      script: i.getLogger("script", "kingoauth")
    }
  }
  displayAppInfo() {
    logger.log("info", "==========================================================="), logger.log("info", ""), logger.log("info", "  /|| ||\\ | ||  " + packageCfg.name + " - version " + packageCfg.version), logger.log("info", " /_|| ||_| \\||  " + packageCfg.homepage), logger.log("info", "")
  }
  displayConfiguration() {
    logger.log("info", "Start time:  " + util.now()), logger.log("info", "Local IP:    " + util.getLocalIP());
    let e = settings.sslMode;
    logger.log("info", "SSL mode:    " + e.enable), e.enable ? logger.log("info", "SSL port:    " + settings.port) : logger.log("info", "Port:        " + settings.port), appLogger.system.info("\u670D\u52A1\u542F\u52A8", {
      ip: "",
      tenantId: "",
      user: "\u65E0",
      addon: {},
      context: "\u7528\u6237\u670D\u52A1\u542F\u52A8\u6210\u529F"
    })
  }
  handleExceptions() {
    process.on("uncaughtException", function(e) {
      logger.log("fatal", `uncaughtException: ${e.message}`), logger.log("fatal", e.stack), e.code === "EADDRINUSE" && (appLogger.system.error("\u670D\u52A1\u5F02\u5E38\u9000\u51FA", {
        ip: "",
        tenantId: "",
        user: "\u65E0",
        addon: {},
        context: "\u7528\u6237\u670D\u52A1\u5F02\u5E38\u9000\u51FA,\u7AEF\u53E3\u88AB\u5360\u7528"
      }), setTimeout(function() {
        process.exit(-1)
      }, 100))
    }), process.on("unhandledRejection", (e, o) => {
      logger.log("fatal", `unhandledRejection: ${e.stack}`)
    }), process.on("SIGINT", function(e, o) {
      logger.log("fatal", "kingoauth is closing casused by ", e, o), appLogger.system.error("\u670D\u52A1\u5F02\u5E38\u9000\u51FA", {
        ip: "",
        tenantId: "",
        user: "\u65E0",
        addon: {},
        context: `\u7528\u6237\u670D\u52A1\u5F02\u5E38\u9000\u51FA -> ${e} -> ${o}`
      }), process.exit()
    })
  }
}
module.exports = Application;
