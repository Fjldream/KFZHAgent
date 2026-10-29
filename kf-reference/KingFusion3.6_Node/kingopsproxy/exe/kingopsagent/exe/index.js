// modified by jinlong.feng at 20260909 启动问题
const path = require('path');
global.__dir = __dirname;
global.ROOT_PATH = path.resolve(global.__dir, '../../../../');
// 保留已有实例目录，必须在任何 PM2 模块加载之前设置。
process.env.PM2_HOME = path.join(global.ROOT_PATH, './sdb/logs/pm2/.pm2_b');

let application = null;
let shuttingDown = false;

/**
 * 关闭代理控制器；信号、wrapper 消息和启动失败共享幂等退出流程。
 * 不主动终止 PM2 业务，避免控制器恢复导致业务被一并结束。
 * @param {string} reason 退出原因。
 * @param {number} [exitCode=0] 正常停止为零，启动失败为非零。
 * @returns {Promise<void>}
 */
async function shutdown(reason, exitCode = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    const shutdownTimeout = setTimeout(() => {
        console.error('[KingOPsProxy] controller shutdown timed out.');
        process.exit(exitCode || 1);
    }, 8000);
    try {
        if (global.logger) global.logger.info(`[KingOPsProxy] ${reason}, shutting down controller...`);
        if (application) await application.stop();
        clearTimeout(shutdownTimeout);
        if (global.logger) global.logger.info('[KingOPsProxy] controller stopped.');
        process.exit(exitCode);
    } catch (error) {
        clearTimeout(shutdownTimeout);
        console.error('[KingOPsProxy] graceful shutdown failed:', error);
        process.exit(1);
    }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
// 当前 node-windows wrapper 的停止分支通过 IPC 发送该消息。
process.on('message', (message) => {
    if (message === 'shutdown') shutdown('Windows service shutdown');
});

/**
 * 初始化配置并启动代理，将同步加载错误和异步启动错误汇总到退出流程。
 * @returns {Promise<void>}
 */
async function startApplication() {
    try {
        require('dotenv').config({
            path: __dir + '/../../.env'
        });
        const profilesManage = require(__dir + '/lib/services/profiles/profiles_manage');
        profilesManage.init();
        const Application = require(__dir + '/lib/start');
        application = new Application();
        await application.start();
    } catch (error) {
        console.error('[KingOPsProxy] startup failed:', error);
        if (global.logger) global.logger.error('KingOPsProxy startup failed:', error.stack || error);
        await shutdown('startup failed', 1);
    }
}

startApplication();
// end
