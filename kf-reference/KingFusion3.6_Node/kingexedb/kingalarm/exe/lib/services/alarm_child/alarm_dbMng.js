const DatabaseManager = require("./database/databaseManager"),
    MQTTManager = require("./mqtt/mqttManager"),
    ErrorHandler = require("./utils/errorHandler");
class DBMng {
    constructor() {
        this.databaseManager = new DatabaseManager, this.mqttManager = null, this.APPName = global.externalConfig.APPName, this.lock = !1
    }
    async init() {
        try {
            await this.initHistoryDB(), await this.initMqtt()
        } catch (t) {
            throw await this.initMqtt(), ErrorHandler.logError("fatal", "DBMng", "\u521D\u59CB\u5316", t), t
        }
    }
    async initHistoryDB() {
        try {
            const {
                historyDB: t
            } = require(`${devProjectPath}/system_config.json`);
            await this.databaseManager.init(t)
        } catch (t) {
            throw ErrorHandler.logError("fatal", "DBMng", "\u521D\u59CB\u5316\u5386\u53F2\u5E93", t), t
        }
    }
    async initMqtt() {
        try {
            const {
                mqttConfig: t
            } = require(`${devProjectPath}/system_config.json`), a = t[0];
            this.mqttManager = new MQTTManager(this.APPName), await this.mqttManager.init(a)
        } catch (t) {
            throw ErrorHandler.logError("fatal", "DBMng", "\u521D\u59CB\u5316MQTT", t), t
        }
    }
    async checkConnection() {
        if (!this.lock) {
            this.lock = !0;
            try {
                await this.databaseManager.checkConnection() || ErrorHandler.logError("warn", "DBMng", "\u8FDE\u63A5\u68C0\u67E5", "\u6570\u636E\u5E93\u8FDE\u63A5\u65AD\u5F00"), this.mqttManager && (await this.mqttManager.checkConnection() || ErrorHandler.logError("warn", "DBMng", "\u8FDE\u63A5\u68C0\u67E5", "MQTT\u8FDE\u63A5\u65AD\u5F00"))
            } catch (t) {
                ErrorHandler.logError("error", "DBMng", "\u8FDE\u63A5\u68C0\u67E5", t)
            } finally {
                this.lock = !1
            }
        }
    }
    async save(t) {
        return await this.databaseManager.save(t)
    }
    async publish(t) {
        return this.mqttManager ? await this.mqttManager.publish(t) : t
    }
    get historyDBCli() {
        return this.databaseManager.historyDBCli
    }
    get mqttCli() {
        return this.mqttManager ? this.mqttManager.mqttCli : null
    }
    destroy() {
        this.databaseManager && this.databaseManager.destroy(), this.mqttManager && this.mqttManager.destroy()
    }
}
module.exports = new DBMng;