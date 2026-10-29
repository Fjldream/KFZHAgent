// modified by jinlong.feng at 20260909 启动问题
const path = require('path');
const Service = require('node-windows').Service;
// 与 index.js 使用同一现有目录，避免连接其它 PM2 实例。
process.env.PM2_HOME = path.resolve(__dirname, '../../../../sdb/logs/pm2/.pm2_b');
const pm2Instance = require('pm2');

/**
 * 连接本产品的 PM2 实例。
 * @returns {Promise<void>} 连接失败时拒绝。
 */
function connectPm2() {
    return new Promise((resolve, reject) => {
        pm2Instance.connect((error) => {
            if (error) reject(error);
            else resolve();
        });
    });
}

/**
 * 列出可卸载的业务进程，保留现有 ServerManager namespace 排除规则。
 * @returns {Promise<Array<Object>>} 当前 PM2 实例下需要删除的进程。
 */
function getManagedProcesses() {
    return new Promise((resolve, reject) => {
        pm2Instance.list((error, processes) => {
            if (error) {
                reject(error);
                return;
            }
            resolve((processes || []).filter((managedProcess) => {
                return managedProcess.pm2_env && managedProcess.pm2_env.namespace !== 'ServerManager';
            }));
        });
    });
}

/**
 * 从当前 PM2 实例删除指定业务进程。
 * @param {number} processId PM2 进程编号，不是系统 PID。
 * @returns {Promise<void>} 删除失败时拒绝。
 */
function deleteManagedProcess(processId) {
    return new Promise((resolve, reject) => {
        pm2Instance.delete(processId, (error) => {
            if (error) reject(error);
            else resolve();
        });
    });
}

/**
 * 等待 Windows 服务卸载完成，失败或超时时明确报告错误。
 * @returns {Promise<void>}
 */
function uninstallService() {
    return new Promise((resolve, reject) => {
        const service = new Service({
            name: 'KingOPsProxy',
            description: 'KingFusion 运维代理服务',
            script: path.resolve(__dirname, 'index.js'),
        });
        const uninstallTimeout = setTimeout(() => {
            reject(new Error('KingOPsProxy service uninstall timed out.'));
        }, 60000);
        service.once('uninstall', () => {
            clearTimeout(uninstallTimeout);
            console.log('uninstall complete');
            resolve();
        });
        service.once('alreadyuninstalled', () => {
            clearTimeout(uninstallTimeout);
            resolve();
        });
        service.once('error', (error) => {
            clearTimeout(uninstallTimeout);
            reject(error);
        });
        service.uninstall();
    });
}

/**
 * 清理本产品业务并断开 PM2，随后卸载服务；任何清理失败均保留失败状态。
 * 不关闭整个 PM2 daemon，以保留 ServerManager 进程。
 * @returns {Promise<void>}
 */
async function closeProcessesAndUninstall() {
    let cleanupError = null;
    try {
        await connectPm2();
        const managedProcesses = await getManagedProcesses();
        for (const managedProcess of managedProcesses) {
            try {
                await deleteManagedProcess(managedProcess.pm_id);
            } catch (error) {
                cleanupError = cleanupError || error;
                console.error(`Delete PM2 process ${managedProcess.pm_id} failed:`, error);
            }
        }
    } catch (error) {
        cleanupError = error;
        console.error('KingOPsProxy PM2 cleanup failed, continue uninstalling service:', error);
    } finally {
        try {
            pm2Instance.disconnect();
        } catch (error) {
            cleanupError = cleanupError || error;
            console.error('Disconnect PM2 failed:', error);
        }
    }
    await uninstallService();
    if (cleanupError) throw cleanupError;
}

setTimeout(async () => {
    try {
        await closeProcessesAndUninstall();
        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}, 100);
// end
