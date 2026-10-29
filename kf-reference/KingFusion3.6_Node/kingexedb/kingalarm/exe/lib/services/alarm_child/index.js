const {
    threadId,
    parentPort,
    workerData
} = require("worker_threads"), {
    commonUtil,
    Deque
} = require("../../../core/utils"), {
    watchTag,
    childThread
} = require("../../../config/config_app.json"), alarmMsgDeque = new Deque;
parentPort.on("message", e => {
    process.env.NODE_ENV === "development" && logger.log("debug", `cal Result: ${JSON.stringify(e)}`), Array.isArray(e) && e.forEach(o => {
        alarmMsgDeque.enqueue(o)
    })
});
const path = require("path"),
    fs = require("fs"),
    devProjectPath = workerData.devProjectPath;
(!process.env.NODE_ENV || process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "production") && (process.env.NODE_ENV = "production"), global.commonDir = path.resolve(__dirname, "../../../../../../common");
const externalConfigPath = path.resolve(`${devProjectPath}/project/externalconfig.json`);

function checkParams() {
    try {
        if (!devProjectPath) throw "\u672A\u4F20\u9012\u5DE5\u7A0B\u8DEF\u5F84";
        if (!fs.existsSync(devProjectPath)) throw `\u5DE5\u7A0B\u8DEF\u5F84\u4E0D\u5B58\u5728:${devProjectPath}`;
        global.devProjectPath = path.resolve(devProjectPath), global.externalConfig = JSON.parse(fs.readFileSync(externalConfigPath))
    } catch (e) {
        console.error(`\u5DE5\u7A0B\u8DEF\u5F84\u9519\u8BEF:${e}`), appLoggerConf.context = `${global.externalConfig.APPName}\u62A5\u8B66APP\u5F02\u5E38\u9000\u51FA:\u5DE5\u7A0B\u8DEF\u5F84\u9519\u8BEF\uFF1A${e}`, appLogger.system.info("\u5F02\u5E38\u9000\u51FA", appLoggerConf), process.exit()
    }
}

function initLogger() {
    let e = require(`${commonDir}/log-utils`).getInstance();
    e.init(path.join(__dirname, `../../../../../../sdb/logs/${global.externalConfig.APPName}/child1/`)), global.logger = e
}

function handleExceptions() {
    process.on("uncaughtException", function (e) {
        logger.log("fatal", `\u5B50\u7EBF\u7A0BuncaughtException: ${e.message}`), logger.log("fatal", e.stack), e.code === "EADDRINUSE" && setTimeout(function () {
            appLoggerConf.context = `${global.externalConfig.APPName}\u62A5\u8B66APP\u5B50\u7EBF\u7A0B\u5F02\u5E38\u9000\u51FA:EADDRINUSER`, appLogger.system.info("\u5B50\u7EBF\u7A0B\u5F02\u5E38\u9000\u51FA", appLoggerConf), process.exit(-1)
        }, 100)
    }), process.on("unhandledRejection", (e, o) => {
        logger.log("fatal", `\u5B50\u7EBF\u7A0BunhandledRejection: ${e.stack}`)
    })
}
class ChildApplication {
    constructor() {
        this.cacheCheckConnectTime = Date.now(), this.lastConnectionCheck = Date.now(), this.connectionCheckInterval = childThread.connectionCheckInterval, this.maxBatchSize = childThread.maxBatchSize, this.minBatchSize = childThread.minBatchSize, this.processingInterval = childThread.processingInterval, this.isProcessing = !1, this.DBMng = null
    }
    async start() {
        checkParams(), initLogger(), logger.log("info", `\u5B50\u7EBF\u7A0BID:${threadId}: \u521D\u59CB\u5316\u65E5\u5FD7\u6253\u5370\u5B8C\u6210`), handleExceptions(), logger.log("info", `\u5B50\u7EBF\u7A0BID:${threadId}: \u521D\u59CB\u5316\u5F02\u5E38\u5904\u7406`);
        try {
            this.DBMng = require("./alarm_dbMng"), await this.DBMng.init()
        } catch (o) {
            logger.log("error", o)
        }
        logger.log("info", `\u5B50\u7EBF\u7A0BID:${threadId}: \u5F00\u59CB\u5B58\u50A8\u6570\u636E`), this.startProcessingLoop()
    }
    startProcessingLoop() {
        const o = async () => {
            if (this.isProcessing) {
                setImmediate(o);
                return
            }
            this.isProcessing = !0;
            try {
                const n = Date.now();
                n - this.lastConnectionCheck > this.connectionCheckInterval && (this.lastConnectionCheck = n, await this.DBMng.checkConnection());
                const i = alarmMsgDeque.size();
                if (i > 0) {
                    const g = Math.min(Math.max(this.minBatchSize, Math.floor(i * .1)), this.maxBatchSize),
                        a = [];
                    for (let r = 0; r < g && alarmMsgDeque.size() > 0; r++) {
                        const t = alarmMsgDeque.dequeue();
                        t.alarm_time = commonUtil.formatTS(t.alarm_time), t.event_time = commonUtil.formatTS(t.event_time), t.tag_name === watchTag && logger.log("info", `\u5B58\u50A8\u5B50\u7EBF\u7A0B:${watchTag} \u8BA1\u7B97\u7ED3\u679C: ${JSON.stringify(t)}`), a.push(t)
                    }
                    const s = [];
                    const toSave = a.filter((item)=>!item.skipSave)
                    if (this.DBMng.mqttCli && s.push(this.DBMng.publish(a)), this.DBMng.historyDBCli && s.push(this.DBMng.save(toSave)), s.length > 0) {
                        const t = (await Promise.allSettled(s)).find(c => c.status === "fulfilled" && typeof c.value == "string");
                        t && t.value && logger.log("fatal", `\u5B50\u7EBF\u7A0Bsql\u6267\u884C\u5931\u8D25,SQL: ${t.value}`)
                    }
                }
                const l = i > 0 ? this.processingInterval : this.processingInterval * 4;
                setTimeout(() => {
                    this.isProcessing = !1, setImmediate(o)
                }, l)
            } catch (n) {
                logger.log("fatal", `\u5B50\u7EBF\u7A0B\u5904\u7406\u5FAA\u73AF\u5F02\u5E38: ${n.message}`), this.isProcessing = !1, setTimeout(() => setImmediate(o), 1e3)
            }
        };
        setImmediate(o)
    }
}
const childApp = new ChildApplication;
childApp.start();