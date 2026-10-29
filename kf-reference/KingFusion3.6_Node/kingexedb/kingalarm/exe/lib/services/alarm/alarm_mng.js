const {
    Worker
} = require("worker_threads"), {
    alarmItemConfigMap,
    tagName_Id_Map,
    tagJson,
    tag_groupMap,
    alarmUpgradeConfig,
    tagGroupJson,
    alarmItemJson
} = require("../alarm/alarm_config"), {
    realDataQueue
} = require("../websocket/websocket_mng"), spooler = require("../spooler/spooler"), {
    watchTag,
    drainBatchSize,
    lowWatermark,
    statsIntervalMs,
    microBatchSize
} = require("../../../config/config_app.json"), {
    calcRestricted
} = require("./calculators/restricted"), {
    calcDiscrete
} = require("./calculators/discrete"), {
    computeUpgrades
} = require("./state/upgradeScheduler"), CustomAlarm = require("./custom");
class AlarmManager {
    constructor() {
        this.alarmingRestrictedCache = new Map, this.alarmingDiscCache = new Map, this.alarmingCustomCache = new Map, this.saveDataWorker = null, this.APPName = global.externalConfig.APPName, this._buf = [], this._flushScheduled = !1, this._flush = () => {
            this._flushScheduled = !1, this._buf.length && this.saveDataWorker.postMessage(this._buf.splice(0))
        }, this.snapshot = {}
    }
    async initCustomAlarm(id) {
        try {
            if(id){
                // this.alarmingCustomCache.delete(id)
                const cachedAlarm = this.alarmingCustomCache.get(id);
                if(cachedAlarm){
                    const deleteEvent = {
                        ...cachedAlarm,
                        event_type: 'DeleteEvent',
                        userEventType: 'DeleteEvent',
                        
                        event_time: Date.now(),
                        skipSave: true
                    };
                    this._emitResult([deleteEvent])
                    this.alarmingCustomCache.delete(id)
                }
            }
            await CustomAlarm.init(global.devProjectPath, {
                enqueue: e => this._emitResult([e]),
                getAlarmSnapshot: () => this.getAlarmSnapshot(),
                trace: (e, ...a) => {
                    logger.log("trace", `[CustomAlarm:${e}] ${JSON.stringify(...a)}`), appLogger.script.info("Trace\u65E5\u5FD7", {
                        ip: global.appLoggerConf.ip,
                        user: global.appLoggerConf.user,
                        tenantId: global.appLoggerConf.tenanatId,
                        context: `[CustomAlarm:${e}] ${JSON.stringify(...a)}`,
                        addon: {}
                    })
                },
                alarmUpgradeConfig,
                recoverId:id
            })
        } catch (e) {
            logger.log("error", "\u81EA\u5B9A\u4E49\u62A5\u8B66\u521D\u59CB\u5316\u5931\u8D25:", e.message)
        }
    }
    getAlarmSnapshot() {
        for (const [e, [a]] of tagName_Id_Map) e in this.snapshot || (this.snapshot[e] = 0);
        return this.snapshot
    }
    async init() {
        const e = __DIR + "/lib/services/alarm_child/index.js";
        this.saveDataWorker = new Worker(e, {
            workerData: {
                devProjectPath: global.devProjectPath
            }
        }), this.saveDataWorker.on("error", r => {
            logger.log("fatal", `\u6570\u636E\u63A8\u9001\u5B58\u50A8\u5B50\u7EBF\u7A0B\u5F02\u5E38MESSAGE:${r.message};STACK:${r.stack}`)
        }), this.saveDataWorker.on("exit", r => {
            logger.log("fatal", `\u6570\u636E\u63A8\u9001\u5B58\u50A8\u5B50\u7EBF\u7A0B\u9000\u51FAcode: ${r}`)
        }), await this.initCustomAlarm(), this.cacheUpgradeTime = new Date().getTime(), this.start();
        const a = statsIntervalMs || 60 * 1e3;
        setInterval(() => {
            try {
                logger.log("info", JSON.stringify({
                    m: "stats",
                    queue: realDataQueue.size(),
                    buf: this._buf.length,
                    time: Date.now()
                }))
            } catch {}
        }, a)
    }
    _emitResult(e) {
        if (!e || !e.length) return;
        for (const r of e)
            if (r.alarm_type === "Custom") {
                const t = r.tag_name;
                r.event_type === "AlarmEvent" ? this.alarmingCustomCache.set(t, r) : r.event_type === "RecoverEvent" && this.alarmingCustomCache.delete(t)
            } this._buf.push(...e);
        const a = microBatchSize || 512;
        if (this._buf.length >= a) {
            this.saveDataWorker.postMessage(this._buf.splice(0)), this._flushScheduled = !1;
            return
        }
        this._flushScheduled || (this._flushScheduled = !0, setImmediate(this._flush))
    }
    start() {
        const e = () => {
            try {
                let a = realDataQueue.size();
                if (a) {
                    const t = Math.min(Math.max(500, Math.floor(a * .2)), 5e3);
                    for (let i = 0; i < t; i++) {
                        const s = realDataQueue.dequeue();
                        if (!s) break;
                        const l = s.N,
                            o = tagName_Id_Map.get(l);
                        if (!o) continue;
                        const [g, n] = o;
                        if (!n) continue;
                        l === watchTag && (logger.log("info", `${watchTag}\u5B9E\u65F6\u6570\u636E: ${JSON.stringify(s)}`), logger.log("info", `${watchTag}\u62A5\u8B66\u9879\u4FE1\u606F\uFF1A ${JSON.stringify(alarmItemConfigMap.get(n))}`));
                        let c = this.calcute(g, n, s);
                        c && c.length && this._emitResult(c), CustomAlarm.onTagChange(l, s.V, s.Q, s.T)
                    }
                }
                const r = lowWatermark || 15e5;
                if (realDataQueue.size() <= r && spooler.hasPending().then(t => {
                        if (t) {
                            const i = drainBatchSize || 5e4;
                            spooler.drainToMemoryQueue(realDataQueue, i).catch(() => {})
                        }
                    }).catch(() => {}), alarmUpgradeConfig.open) {
                    let t = Date.now();
                    if (t - this.cacheUpgradeTime > 5e3) {
                        this.cacheUpgradeTime = t;
                        const i = computeUpgrades({
                            now: t,
                            alarmingRestrictedCache: this.alarmingRestrictedCache,
                            alarmingDiscCache: this.alarmingDiscCache,
                            alarmUpgradeConfig,
                            alarmItemConfigMap,
                            watchTag,
                            logger
                        });
                        i.length && this._emitResult(i)
                    }
                }
            } catch (a) {
                logger.log("fatal", `alarm loop error: ${a.message}`)
            } finally {
                setTimeout(() => {
                    setImmediate(e)
                }, 1)
            }
        };
        setImmediate(e)
    }
    calcute(e, a, r) {
        if (!alarmItemConfigMap.has(a)) return;
        let t = alarmItemConfigMap.get(a);
        if (!t.AlarmEnable) return;
        let i = [],
            s = tagJson[e],
            l = tag_groupMap.get(e);
        if (l || (l = {
                N: "",
                id: ""
            }), t.value = r.V, t.timeStamp = r.T || new Date().getTime(), t.quality = r.Q, t.LimitEnable) {
            let o = calcRestricted(e, t, s, l, this.alarmingRestrictedCache);
            i = i.concat(o)
        }
        if (t.DiscEnable) {
            let o = calcDiscrete(e, t, s, l, this.alarmingDiscCache);
            i = i.concat(o)
        }
        return t.lastValue = t.value, t.lastTimeStamp = t.timeStamp, t.lastQuality = t.quality, i
    }
    query_init_alarm(e) {
        try {
            let a = [];
            for (const [r, t] of this.alarmingRestrictedCache) a.push(this.formatAlarmCacheData(t));
            for (const [r, t] of this.alarmingDiscCache) a.push(this.formatAlarmCacheData(t));
            for (const [r, t] of this.alarmingCustomCache) a.push(this.formatAlarmCacheData(t));
            e(null, a)
        } catch (a) {
            e(`\u67E5\u8BE2\u62A5\u8B66\u5B9E\u65F6\u6570\u636E\u5F02\u5E38: ${a.stack}`, null)
        }
    }
    formatAlarmCacheData(e) {
        const {
            formatAlarmCacheData: a
        } = require("./formatters/cache");
        return a(e, this.APPName)
    }
    get_tag_group_config(e) {
        return e(null, tagGroupJson)
    }
    confirm_alarm(e, a) {
        const {
            confirmAlarm: r
        } = require("./api/confirm"), t = r({
            alarmingRestrictedCache: this.alarmingRestrictedCache,
            alarmingDiscCache: this.alarmingDiscCache,
            alarmingCustomCache: this.alarmingCustomCache
        }, e, a);
        Array.isArray(t) && t.length && this._emitResult(t)
    }
    delete_alarm(e, a) {
        const {
            deleteAlarm: r
        } = require("./api/delete"), t = r({
            alarmingRestrictedCache: this.alarmingRestrictedCache,
            alarmingDiscCache: this.alarmingDiscCache,
            alarmItemConfigMap
        }, e, a);
        Array.isArray(t) && t.length && this._emitResult(t)
    }
    get_alarm_config_of_tag(e, a) {
        const {
            getAlarmConfigOfTag: r
        } = require("./api/getConfigOfTag");
        return r({
            tagName_Id_Map,
            alarmItemConfigMap
        }, e, a)
    }
    get_alarm_config(e) {
        const {
            getAllAlarmConfig: a
        } = require("./api/getAllConfig");
        return a({
            tagName_Id_Map,
            alarmItemConfigMap
        }, e)
    }
    set_alarm_config_of_tag(e, a, r) {
        const {
            setAlarmConfigOfTag: t
        } = require("./api/setConfigOfTag");
        return t({
            tagName_Id_Map,
            alarmItemConfigMap,
            alarmingRestrictedCache: this.alarmingRestrictedCache,
            tagJson,
            realDataQueue,
            alarmItemJson
        }, e, a, r)
    }
    getAlarmConnectionInfo(e) {
        const {
            getAlarmConnectionInfo: a
        } = require("./api/getConnectionInfo");
        return a({
            APPName: this.APPName
        }, e)
    }
}
module.exports = new AlarmManager;