// modified by jinlong.feng at 20260909 启动问题
const path = require('path');
const {
    execFile
} = require('child_process');
const Service = require('node-windows').Service;
const service = new Service({
    name: 'KingOPsProxy',
    description: 'KingFusion 运维代理服务',
    script: path.resolve(__dirname, 'index.js'),
});

/**
 * 请求 SCM 启动服务，将“已经运行”作为幂等成功处理。
 * @param {string} serviceId Windows 服务的注册 ID。
 * @returns {void}
 */
function startService(serviceId) {
    execFile('sc.exe', ['start', serviceId], {
        windowsHide: true
    }, (error, stdout, stderr) => {
        // ERROR_SERVICE_ALREADY_RUNNING，避免依赖本地化后的 NET START 错误文案。
        if (error && Number(error.code) !== 1056) {
            console.error('Start KingOPsProxy service failed:', error, stderr || '');
            process.exitCode = 1;
            return;
        }
        console.log(error ? 'KingOPsProxy service is already running.' : 'KingOPsProxy service start requested.', stdout || '');
    });
}

/**
 * 配置 Windows 服务的故障恢复，再启动服务。
 * node-windows 生成的服务 ID 带 .exe，不能使用显示名称代替。
 * @returns {void}
 */
function configureRecoveryAndStart() {
    const serviceId = `${service.id}.exe`;
    const recoveryArguments = [
        'failure', serviceId,
        'reset=', '86400',
        'actions=', 'restart/5000/restart/10000/restart/30000',
    ];
    execFile('sc.exe', recoveryArguments, {
        windowsHide: true
    }, (error, stdout, stderr) => {
        if (error) {
            console.error('Configure service recovery failed:', error, stderr || '');
            process.exitCode = 1;
        } else {
            console.log('Service recovery configured.', stdout || '');
        }
        startService(serviceId);
    });
}

service.on('install', configureRecoveryAndStart);
service.on('alreadyinstalled', configureRecoveryAndStart);
service.on('error', (error) => {
    console.error(error);
    process.exitCode = 1;
});
service.install();
// end
