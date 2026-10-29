// modified by jinlong.feng at 2026-10-29 KF源码精简入库
// Reference snapshot: credential literals redacted; do not deploy this copy.
const fs = require("fs"), { util, fileUtil } = require(__dir + "/core/utils"), { common, dataSource, exception, express, globalFunc, globalProInfo, globalScript, globalUtilsFunc, globalVar, initDBTagArrayMap, transferScriptFunc } = require(__dir + "/lib/init"), serverCfg = require(__dir + "/config/server.json"), path = require("path");
let commonDir = null;
class Application {
    constructor() { this.httpPort = 0; }
    initLogItem() { __dir.indexOf("solutions") != -1 ? commonDir = __dir + "/../../../../../../common/" : commonDir = __dir + "/../../../../../common/"; const e = require(commonDir + "log-utils").getInstance(); let t = null; execPath.indexOf("solutions") != -1 ? t = execPath + `/../../../../../../sdb/logs/${appName}/` : t = execPath + `/../../../../../sdb/logs/${appName}/`, e.init(t), global.logger = e; }
    initExternalConfig() {
        var o = fs.readFileSync(execProjectPath + "/externalconfig.json", "utf8"), e = JSON.parse(o);
        if (e) {
            global.tenantId = process.argv[4] || e.tenant.tenantId;
            var t = path.join(execProjectPath, "../project.json"), i = JSON.parse(fs.readFileSync(t, "utf8"));
            i.execPath = execPath, e !== void 0 && e !== "" && (e.expose !== void 0 && e.expose !== "" && e.expose.port !== void 0 && e.expose.port !== "" && (i.Port = e.expose.port, this.httpPort = e.expose.port), e.APPName !== void 0 && e.APPName !== "" && (i.APPName = e.APPName)), global.appName = i.APPName || i.name, fs.writeFileSync(t, JSON.stringify(i), "utf8");
        }
    }
    initSqlCryptyInfo() {
        let o = path.join(commonDir + "../config/common.json");
        if (fs.existsSync(o)) {
            let t = require(o);
            t.sqlCrypty && (global.isSqlCrypty = t.sqlCrypty.enable, global.sqlCryptyPublicKey = t.sqlCrypty.publicKey);
        }
    }
    initAppServer() { express.init(); let o = express.getApp().listen(global.projectPort || this.httpPort, function () { logger.log("debug", "Application run success!"); }); o.keepAliveTimeout = 60 * 1e3, o.headersTimeout = 60 * 1e3; }
    displayAppInfo() { logger.log("debug", "==========================================================="), logger.log("debug", ""), logger.log("debug", "/|| ||\\ | ||  " + serverCfg.runOptions.name + " - version " + serverCfg.runOptions.version), logger.log("debug", "" + serverCfg.runOptions.description), logger.log("debug", ""), logger.log("debug", "Start time:  " + util.now()), logger.log("debug", "Port:        " + this.httpPort), logger.log("debug", "Local IP:    " + util.getLocalIP()), logger.log("debug", ""); }
    async initOauth() { let o = require(commonDir + "oauth-utils-exedb"), e = { host: newInfo.kingGateWay.host }; global.authclient = new o(e); let t = await authclient.registerUser({ client_id: newInfo.oauth.client_id, client_secret: newInfo.oauth.client_secret, username: "kcdebuger", password: "KF_REFERENCE_REDACTED", redirect_uri: "/kingcalculation", grant_type: "password" }); t.errorCode == 0 && (global.token = t.data.access_token, global.projectToken = t.data.access_token), global.getToken = function () { let n = authclient.getTokenByUser("kcdebuger"); return Object.prototype.toString.call(n) == "[object Object]" ? (logger.log("fatal", "\u83B7\u53D6token\u5931\u8D25\uFF1A" + JSON.stringify(n)), "") : n; }; }
    async start() { this.initExternalConfig(), this.initLogItem(), this.initSqlCryptyInfo(), exception(), globalUtilsFunc(), globalProInfo(), await this.initOauth(), globalVar(), globalFunc(), await dataSource(), globalScript(), initDBTagArrayMap(), await common(), this.initAppServer(), this.displayAppInfo(); }
}
module.exports = Application;
// end
