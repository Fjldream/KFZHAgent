const path = require('path')
var appServer = require(__dir + '/lib/app/app')
const { util } = require(__dir + '/core/util'),
  { settings } = require(__dir + '/lib/config/index')
var packageCfg = require(__dir + '/package.json')
const dbRedis = require(__dir + '/core/dataSource/redisdb')

// modified by jinlong.feng at 0901 冗余功能开发
const redundancyBootstrap = require(__dir + '/lib/services/redundancy/bootstrap')
// end

function Application() {
  var n = parseInt(settings.startport) + parseInt(settings.opsCenterPortShift.kingops)
  function r() {
    appServer.init()
    const httpServer = appServer.getApp().listen(n, function () {
      ;(logger.log('info', 'Express server listening on port:' + n),
        appLogger.system.info('\u670D\u52A1\u542F\u52A8', {
          ip: '',
          tenantId: '',
          user: '\u65E0',
          addon: {},
          context: '\u8FD0\u7EF4\u4E2D\u5FC3\u670D\u52A1\u542F\u52A8\u6210\u529F',
        }))
    })
    // modified by jinlong.feng at 0901 冗余功能开发
    try {
      redundancyBootstrap.start({ httpServer })
      logger.log('info', '冗余子系统启动成功')
    } catch (error) {
      logger.log('fatal', `冗余子系统启动失败: ${error.message}`)
      throw error
    }
    // end
    return httpServer
  }
  function g() {
    ;(dbRedis.init(logger), logger.log('info', 'redis load success'))
  }
  function s() {
    const e = __dir + '/../../../common/',
      o = require(e + 'log-utils').getInstance()
    ;(o.init(`${__dirname}/../../../../sdb/logs/kingopsserver`), (global.logger = o))
  }
  function l() {
    let e = __dir + '/../../../common/',
      t = require(path.resolve(e + '../config/common.json'))
    const o = path.resolve(`${e}/sqlitelog-utils`),
      u = require(o)
    let f = path.resolve(`${e}/../`)
    const i = new u({
      kfPath: f,
      dbType: 'center',
      tableName: 'kingopsserver',
      batchSize: 50,
      flushInterval: 2e3,
      retentionUnit: 'day',
      retention: t.logConfig.retainTime,
      cleanupInterval: 720 * 60 * 1e3,
      level: 'info',
    })
    global.appLogger = {
      system: i.getLogger('system', 'kingopsserver'),
      operation: i.getLogger('opration', 'kingopsserver'),
      script: i.getLogger('script', 'kingopsserver'),
    }
  }
  function a() {
    ;(logger.log('info', '==========================================================='),
      logger.log('info', ''),
      logger.log('info', '/|| ||\\ | ||  ' + packageCfg.name + ' - version ' + packageCfg.version),
      logger.log('info', '' + packageCfg.description),
      logger.log('info', ''))
  }
  function c() {
    ;(logger.log('info', 'Start time:  ' + util.now()),
      logger.log('info', 'Port:        ' + n),
      logger.log('info', 'Local IP:    ' + util.getLocalIP()))
  }
  function p() {
    ;(process.on('uncaughtException', function (e) {
      ;(logger.log('fatal', `uncaughtException: ${e.message}`),
        logger.log('fatal', e.stack),
        e.code === 'EADDRINUSE' &&
          (appLogger.system.error('\u670D\u52A1\u5F02\u5E38\u9000\u51FA', {
            ip: '',
            tenantId: '',
            user: '\u65E0',
            addon: {},
            context: '\u8FD0\u7EF4\u4E2D\u5FC3\u670D\u52A1\u5F02\u5E38\u9000\u51FA',
          }),
          setTimeout(function () {
            process.exit(-1)
          }, 100)))
    }),
      process.on('unhandledRejection', (e, t) => {
        logger.log('fatal', `unhandledRejection: ${e}`)
      }))
  }
  this.start = function () {
    ;(l(), s(), a(), r(), g(), c(), p())
  }
}
module.exports = Application
