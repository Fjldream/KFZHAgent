// modified by jinlong.feng at 2026-10-29 KF源码精简入库
// Reference snapshot: credential literals redacted; do not deploy this copy.
const fs = require("fs/promises"), _fs = require("fs"), path = require("path");
class SystemConfig {
    constructor(t, i) { this.dataDir = path.join(__DIR, "../../../sdb"), this.tenantDir = path.join(this.dataDir, `/${t}/kingalarm`), this.systemConfigFilePath = path.join(this.tenantDir, `${i}/system_config.json`), this.defaultConfig = { alarmUpgrade: { maxUpgradeTimes: 3, alarmUpgradeTimeInterval: 1800, alarmUpgradeAckTimeInter: 86400 }, realDB: [{ ip: "127.0.0.1", port: "7000", password: "KF_REFERENCE_REDACTED", timeout: 30 }], mqttConfig: [{ ip: "127.0.0.1", port: "1883", userName: "", password: "", timeout: 30 }], saveAlarmData: !0, historyDB: { type: 2, ip: "127.0.0.1", port: "3306", userName: "", password: "", dbName: "alarm_event", timeout: 30 } }; }
    async setSystemConfig(t) { const { config: i } = t; return await fs.writeFile(this.systemConfigFilePath, JSON.stringify(i, null, 2)), !0; }
    async getSystemConfig() {
        if (!_fs.existsSync(this.systemConfigFilePath))
            return await fs.writeFile(this.systemConfigFilePath, JSON.stringify(this.defaultConfig, null, 2)), this.defaultConfig;
        const t = await fs.readFile(this.systemConfigFilePath);
        return JSON.parse(t);
    }
}
module.exports = SystemConfig;
// end
