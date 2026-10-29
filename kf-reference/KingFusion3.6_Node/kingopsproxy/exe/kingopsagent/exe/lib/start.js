// modified by jinlong.feng at 20260909 启动问题
const log4js = require('log4js');
const path = require('path');
const {
    util
} = require(__dir + '/core/util');
const {
    logConfig
} = require(__dir + '/lib/config/index');
const appServer = require(__dir + '/lib/app/app');
const MainServer = require(__dir + '/lib/main_server');
const packageConfig = require(__dir + '/package');
const profilesManage = require(__dir + '/lib/services/profiles/profiles_manage');
const externalConfig = profilesManage.getGlobalCache();
const logFilePath = __dir + `/../../../../sdb/${externalConfig.tenant.tenantId}/logs/kingopsproxy/${externalConfig.nodeInfo.nodeName}`;
const port = externalConfig.opsProxyStartPort + externalConfig.opsProxyShift.kingopsProxy;
const sqliteDatabase = require(__dir + '/lib/datasources/sqlite');

/**
 * 管理运维代理的日志、HTTP 监听和业务初始化生命周期。
 * @constructor
 */
function Application() {
    let httpServer = null;
    let stopPromise = null;
    let stopping = false;

    /**
     * 初始化文件日志，供后续启动错误处理使用。
     * @returns {void}
     */
    function initLogger() {
        for (const appenderName in logConfig.appenders) {
            let appenderPath = logFilePath;
            if (appenderName === 'request') appenderPath += '/access';
            else if (appenderName === 'performance') appenderPath += '/performance';
            else if (appenderName === 'application') appenderPath += '/system';

            const appender = logConfig.appenders[appenderName];
            if (Object.prototype.hasOwnProperty.call(appender, 'filename')) {
                appender.filename = appenderPath;
            }
        }
        log4js.configure(logConfig);
        global.logger = log4js.getLogger('default');
        global.loggerError = log4js.getLogger('error');
        global.loggerRequest = log4js.getLogger('http');
        global.loggerPerformance = log4js.getLogger('performance');
        global.loggerPm2 = log4js.getLogger('pm2');
    }

    /**
     * 保留当前版本的 SQLite 业务日志和日志保留时间配置。
     * @returns {void}
     */
    function initBusinessLogger() {
        const SqliteLogManager = require(path.resolve(`${global.ROOT_PATH}/common/sqlitelog-utils`));
        const commonConfig = require(path.resolve(__dir, '../../../../config/common.json'));
        global.logRetainTime = commonConfig.logConfig.node.retainTime;
        const logManager = new SqliteLogManager({
            kfPath: ROOT_PATH,
            dbType: 'node',
            tableName: 'kingopsproxy',
            batchSize: 50,
            flushInterval: 2000,
            retentionUnit: 'day',
            retention: global.logRetainTime,
            cleanupInterval: 720 * 60 * 1000,
            level: 'info',
        });
        global.appLogger = {
            system: logManager.getLogger('system', 'kingopsproxy'),
            operation: logManager.getLogger('opration', 'kingopsproxy'),
            script: logManager.getLogger('script', 'kingopsproxy'),
        };
    }

    /**
     * 在业务初始化之前注册异常日志；启动 Promise 由入口统一处理失败退出。
     * @returns {void}
     */
    function handleExceptions() {
        process.on('uncaughtException', (error) => {
            logger.error('uncaughtException: ' + error.message);
            logger.error(error.stack);
        });
        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled Rejection at: Promise', promise, 'reason:', reason);
            console.error('Unhandled Rejection at: Promise', promise, 'reason:', reason);
        });
    }

    /**
     * 等待真实监听结果，端口冲突时拒绝启动，不继续初始化业务。
     * @returns {Promise<void>} HTTP 监听就绪时完成，监听失败时拒绝。
     */
    function initServer() {
        appServer.init();
        return new Promise((resolve, reject) => {
            let listening = false;
            httpServer = appServer.getApp().listen(port);
            httpServer.once('listening', () => {
                listening = true;
                logger.info('Express server listening on port:', port);
                resolve();
            });
            httpServer.on('error', (error) => {
                if (error.code === 'EADDRINUSE') {
                    logger.error(`端口${port}已被占用，启动运维代理失败！请检查旧的 KingOPsProxy 控制进程。`);
                } else {
                    logger.error('Express server error:', error.stack || error);
                }
                if (!listening) {
                    reject(error);
                    return;
                }
                // 运行中的 HTTP 服务发生错误时退出控制器，由服务管理器恢复。
                process.exitCode = 1;
                setTimeout(() => process.exit(1), 1000);
            });
        });
    }

    /**
     * 按日志、监听、数据库和主业务的顺序启动，向入口传播初始化错误。
     * @returns {Promise<void>} 全部初始化完成时完成。
     */
    this.start = async function start() {
        initLogger();
        handleExceptions();
        initBusinessLogger();
        logger.info('===========================================================');
        logger.info('');
        logger.info('/|| ||\\ | ||  ' + packageConfig.name + ' - version ' + packageConfig.version);
        logger.info('' + packageConfig.description);
        logger.info('');
        await initServer();
        if (stopping) return;
        await sqliteDatabase.init();
        if (stopping) return;
        logger.log('info', 'DB plugin load success');
        logger.info('Start time:  ' + util.now());
        logger.info('Port:        ' + port);
        logger.info('Local IP:    ' + util.getLocalIP());
        const mainServer = new MainServer();
        await mainServer.init();
    };

    /**
     * 停止接受 HTTP 请求，最多等待五秒；重复调用共享停止任务。
     * PM2 业务保留，由后续控制器连接同一个 PM2_HOME 接管。
     * @returns {Promise<void>} HTTP 关闭或等待超时后完成。
     */
    this.stop = function stop() {
        if (stopPromise) return stopPromise;
        stopping = true;
        stopPromise = new Promise((resolve) => {
            if (!httpServer) {
                resolve();
                return;
            }
            const closeTimeout = setTimeout(() => {
                logger.error('HTTP shutdown timed out; controller will exit.');
                resolve();
            }, 5000);
            try {
                httpServer.close((error) => {
                    clearTimeout(closeTimeout);
                    if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') {
                        logger.error('Close HTTP server failed:', error.stack || error);
                    }
                    resolve();
                });
            } catch (error) {
                clearTimeout(closeTimeout);
                logger.error('Close HTTP server failed:', error.stack || error);
                resolve();
            }
        });
        return stopPromise;
    };
}

module.exports = Application;
// end
