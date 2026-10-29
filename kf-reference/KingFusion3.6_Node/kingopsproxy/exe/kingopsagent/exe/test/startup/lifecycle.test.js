// modified by jinlong.feng at 20260909 启动问题
'use strict';

const assert = require('node:assert/strict');
const {
    test
} = require('node:test');
const {
    EventEmitter
} = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const executableDirectory = path.resolve(__dirname, '../..');

/**
 * 在隔离上下文执行真实入口代码，以依赖替身隔离 Windows 服务和生产数据库。
 * @param {string} filename 相对于代理执行目录的文件名。
 * @param {Object} dependencies 模块依赖映射。
 * @returns {Object} 包含进程事件、退出状态和可手动推进计时器的执行上下文。
 */
function loadScript(filename, dependencies) {
    const processEvents = new EventEmitter();
    processEvents.env = {};
    processEvents.exitCodes = [];
    processEvents.exit = (code) => processEvents.exitCodes.push(code);
    const timers = new Map();
    const context = {
        __dir: executableDirectory,
        __dirname: executableDirectory,
        ROOT_PATH: path.resolve(executableDirectory, '../../../..'),
        module: {
            exports: {}
        },
        process: processEvents,
        console: {
            log() {},
            warn() {},
            error() {}
        },
        setTimeout(callback, delay) {
            const timer = {
                callback,
                delay
            };
            timers.set(timer, timer);
            return timer;
        },
        clearTimeout(timer) {
            timers.delete(timer);
        },
        require(moduleName) {
            if (moduleName === 'path') return path;
            if (Object.hasOwn(dependencies, moduleName)) return dependencies[moduleName];
            throw new Error(`Unexpected dependency: ${moduleName}`);
        },
        timers,
    };
    context.global = context;
    vm.runInNewContext(fs.readFileSync(path.join(executableDirectory, filename), 'utf8'), context, {
        filename
    });
    return context;
}

/**
 * 为真实 Application 创建受控 HTTP 生命周期和业务初始化边界。
 * @param {Object} [options] 模拟监听、数据库初始化或业务初始化的失败。
 * @returns {Object} Application、HTTP 服务和启动顺序记录。
 */
function createApplication(options = {}) {
    const events = [];
    const server = options.realHttp ? http.createServer() : new EventEmitter();
    if (!options.realHttp) server.listening = false;
    if (!options.realHttp) server.close = (callback) => {
        events.push('http-close');
        server.listening = false;
        if (!options.hangingClose) callback();
    };
    const logger = {
        info() {},
        error() {},
        log() {}
    };
    const rootDirectory = path.resolve(executableDirectory, '../../../..');
    const dependencies = {
        log4js: {
            configure() {},
            getLogger() {
                return logger;
            }
        },
        [executableDirectory + '/core/util']: {
            util: {
                now() {},
                getLocalIP() {}
            }
        },
        [executableDirectory + '/lib/config/index']: {
            logConfig: {
                appenders: {}
            }
        },
        [executableDirectory + '/lib/app/app']: {
            init() {},
            getApp() {
                return {
                    listen() {
                        events.push('listen');
                        if (options.realHttp) server.listen(options.listenPort || 0, '127.0.0.1');
                        return server;
                    }
                };
            },
        },
        [executableDirectory + '/lib/main_server']: /** 测试替身：隔离生产依赖的外部副作用。 @class */ class MainServer {
            async init() {
                events.push('main');
                if (options.mainError) throw new Error('main failed');
            }
        },
        [executableDirectory + '/package']: {
            name: 'test',
            version: '1',
            description: 'test'
        },
        [executableDirectory + '/lib/services/profiles/profiles_manage']: {
            getGlobalCache() {
                return {
                    tenant: {
                        tenantId: 'test'
                    },
                    nodeInfo: {
                        nodeName: 'test'
                    },
                    opsProxyStartPort: 13000,
                    opsProxyShift: {
                        kingopsProxy: 0
                    }
                };
            },
        },
        [executableDirectory + '/lib/datasources/sqlite']: {
            init() {
                events.push('db');
                if (options.dbError) throw new Error('db failed');
            },
        },
        [rootDirectory + '/common/sqlitelog-utils']: /** 测试替身：隔离生产依赖的外部副作用。 @class */ class SqliteLogger {
            getLogger() {
                return logger;
            }
        },
        [rootDirectory + '/config/common.json']: {
            logConfig: {
                node: {
                    retainTime: 7
                }
            }
        },
    };
    const context = loadScript('lib/start.js', dependencies);
    return {
        context,
        application: new context.module.exports(),
        server,
        events
    };
}

/**
 * 推进隔离脚本中的定时器并等待异步任务完成。
 * @param {Object} context 脚本上下文。
 * @returns {Promise<void>}
 */
async function flushTimers(context) {
    const pending = [...context.timers.values()];
    context.timers.clear();
    for (const timer of pending) await timer.callback();
    await new Promise((resolve) => setImmediate(resolve));
}

test('异步监听尚未就绪时不误退出，就绪后才初始化业务并保留业务日志', async () => {
    const fixture = createApplication();
    const started = fixture.application.start();
    assert.deepEqual(fixture.context.process.exitCodes, []);
    assert.deepEqual(fixture.events, ['listen']);
    fixture.server.listening = true;
    fixture.server.emit('listening');
    await started;
    assert.deepEqual(fixture.events, ['listen', 'db', 'main']);
    assert.ok(fixture.context.appLogger.system);
    assert.equal(fixture.context.logRetainTime, 7);
});

test('端口冲突使启动失败，不能继续初始化数据库和业务', async () => {
    const fixture = createApplication();
    const started = fixture.application.start();
    const rejected = assert.rejects(started, /occupied/);
    fixture.server.emit('error', Object.assign(new Error('occupied'), {
        code: 'EADDRINUSE'
    }));
    await rejected;
    assert.deepEqual(fixture.events, ['listen']);
});

test('业务初始化失败向入口传播，避免留下半启动代理', async () => {
    const fixture = createApplication({
        mainError: true
    });
    const started = fixture.application.start();
    fixture.server.emit('listening');
    await assert.rejects(started, /main failed/);
});

test('重复停止只关闭一次 HTTP，连接不结束时停止也有时间上限', async () => {
    const fixture = createApplication({
        hangingClose: true
    });
    const started = fixture.application.start();
    fixture.server.emit('listening');
    await started;
    const stopped = fixture.application.stop();
    const stoppedAgain = fixture.application.stop();
    await flushTimers(fixture.context);
    await Promise.all([stopped, stoppedAgain]);
    assert.equal(fixture.events.filter((event) => event === 'http-close').length, 1);
});

test('入口接收 wrapper shutdown 和重复信号时仅停止一次且保留当前 PM2_HOME', async () => {
    let stopCount = 0;
    const context = loadScript('index.js', {
        dotenv: {
            config() {}
        },
        [executableDirectory + '/lib/services/profiles/profiles_manage']: {
            init() {}
        },
        [executableDirectory + '/lib/start']: /** 测试替身：隔离生产依赖的外部副作用。 @class */ class Application {
            async start() {}
            async stop() {
                stopCount += 1;
            }
        },
    });
    context.process.emit('message', 'shutdown');
    context.process.emit('SIGTERM');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(stopCount, 1);
    assert.deepEqual(context.process.exitCodes, [0]);
    assert.equal(context.process.env.PM2_HOME, path.resolve(executableDirectory, '../../../../sdb/logs/pm2/.pm2_b'));
});

test('SCM 恢复配置使用实际服务 ID，配置成功后启动服务', () => {
    const commands = [];
    let service;
    const context = loadScript('install.js', {
        'node-windows': {
            Service: /** 测试替身：隔离生产依赖的外部副作用。 @class */ class Service extends EventEmitter {
                constructor() {
                    super();
                    this.id = 'kingopsproxy';
                    service = this;
                }
                install() {
                    this.emit('install');
                }
                start() {
                    commands.push('start');
                }
            }
        },
        child_process: {
            execFile(executable, args, options, callback) {
                commands.push([executable, ...args]);
                callback(null, '', '');
            }
        },
    });
    assert.equal(commands[0][0], 'sc.exe');
    assert.equal(commands[0][2], 'kingopsproxy.exe');
    assert.ok(commands[0].includes('restart/5000/restart/10000/restart/30000'));
    assert.deepEqual(commands.at(-1), ['sc.exe', 'start', 'kingopsproxy.exe']);
    assert.ok(service);
    assert.deepEqual(context.process.exitCodes, []);
});

test('卸载只删除当前 PM2 下非 ServerManager 进程，并等待服务卸载完成', async () => {
    const deleted = [];
    let disconnected = false;
    let service;
    const context = loadScript('uninstall.js', {
        pm2: {
            connect(callback) {
                callback(null);
            },
            list(callback) {
                callback(null, [{
                        pm_id: 1,
                        pid: 101,
                        name: 'business',
                        pm2_env: {
                            namespace: 'tenant'
                        }
                    },
                    {
                        pm_id: 2,
                        pid: 102,
                        name: 'manager',
                        pm2_env: {
                            namespace: 'ServerManager'
                        }
                    },
                ]);
            },
            delete(id, callback) {
                deleted.push(id);
                callback(null);
            },
            disconnect() {
                disconnected = true;
            },
        },
        'node-windows': {
            Service: /** 测试替身：隔离生产依赖的外部副作用。 @class */ class Service extends EventEmitter {
                constructor() {
                    super();
                    service = this;
                }
                uninstall() {}
            }
        },
    });
    const finishing = flushTimers(context);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(deleted, [1]);
    assert.ok(disconnected);
    assert.deepEqual(context.process.exitCodes, []);
    assert.equal(context.process.env.PM2_HOME, path.resolve(executableDirectory, '../../../../sdb/logs/pm2/.pm2_b'));
    service.emit('uninstall');
    await finishing;
    assert.deepEqual(context.process.exitCodes, [0]);
});

test('真实 HTTP 监听停止后原端口可重新绑定', async () => {
    const fixture = createApplication({
        realHttp: true
    });
    try {
        await fixture.application.start();
        const listenPort = fixture.server.address().port;
        await fixture.application.stop();
        const replacement = http.createServer();
        try {
            await new Promise((resolve, reject) => {
                replacement.once('error', reject);
                replacement.listen(listenPort, '127.0.0.1', resolve);
            });
            assert.equal(replacement.address().port, listenPort);
        } finally {
            await new Promise((resolve) => replacement.close(resolve));
        }
    } finally {
        await new Promise((resolve) => fixture.server.close(resolve));
    }
});

test('真实端口冲突拒绝启动且不干扰原监听服务', async () => {
    const occupiedServer = http.createServer();
    await new Promise((resolve) => occupiedServer.listen(0, '127.0.0.1', resolve));
    const fixture = createApplication({
        realHttp: true,
        listenPort: occupiedServer.address().port
    });
    try {
        await assert.rejects(fixture.application.start(), {
            code: 'EADDRINUSE'
        });
        assert.deepEqual(fixture.events, ['listen']);
        assert.equal(occupiedServer.listening, true);
    } finally {
        await fixture.application.stop();
        await new Promise((resolve) => occupiedServer.close(resolve));
    }
});

test('入口启动失败时关闭控制器并返回非零状态', async () => {
    let stopped = false;
    const context = loadScript('index.js', {
        dotenv: {
            config() {}
        },
        [executableDirectory + '/lib/services/profiles/profiles_manage']: {
            init() {}
        },
        [executableDirectory + '/lib/start']: /** 测试替身：隔离生产依赖的外部副作用。 @class */ class Application {
            async start() {
                throw new Error('startup failed');
            }
            async stop() {
                stopped = true;
            }
        },
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(stopped);
    assert.deepEqual(context.process.exitCodes, [1]);
    assert.equal(context.timers.size, 0);
});

test('入口停止卡住时强制非零退出', async () => {
    const context = loadScript('index.js', {
        dotenv: {
            config() {}
        },
        [executableDirectory + '/lib/services/profiles/profiles_manage']: {
            init() {}
        },
        [executableDirectory + '/lib/start']: /** 测试替身：隔离生产依赖的外部副作用。 @class */ class Application {
            async start() {}
            stop() {
                return new Promise(() => {});
            }
        },
    });
    context.process.emit('SIGINT');
    await flushTimers(context);
    assert.deepEqual(context.process.exitCodes, [1]);
});

test('PM2 列举失败仍卸载服务，但返回失败状态且断开连接', async () => {
    let disconnected = false;
    let uninstalled = false;
    const context = loadScript('uninstall.js', {
        pm2: {
            connect(callback) {
                callback(null);
            },
            list(callback) {
                callback(new Error('PM2 unavailable'));
            },
            disconnect() {
                disconnected = true;
            },
        },
        'node-windows': {
            Service: /** 测试替身：隔离生产依赖的外部副作用。 @class */ class Service extends EventEmitter {
                uninstall() {
                    uninstalled = true;
                    this.emit('uninstall');
                }
            }
        },
    });
    await flushTimers(context);
    assert.ok(disconnected);
    assert.ok(uninstalled);
    assert.deepEqual(context.process.exitCodes, [1]);
});

test('重复安装运行中的服务不将已启动状态报告为失败', () => {
    const context = loadScript('install.js', {
        'node-windows': {
            Service: /** 测试替身：隔离生产依赖的外部副作用。 @class */ class Service extends EventEmitter {
                constructor() {
                    super();
                    this.id = 'kingopsproxy';
                }
                install() {
                    this.emit('alreadyinstalled');
                }
                start() {
                    this.emit('error', new Error('already running'));
                }
            }
        },
        child_process: {
            execFile(executable, args, options, callback) {
                if (args[0] === 'start') callback(Object.assign(new Error('already running'), {
                    code: 1056
                }), '', '');
                else callback(null, '', '');
            }
        },
    });
    assert.ok(!context.process.exitCode);
});
// end
