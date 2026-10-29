// modified by jinlong.feng at 2026-10-29 KF源码精简入库
// Reference snapshot: credential literals redacted; do not deploy this copy.
var fs = require("fs"), bodyParser = require("body-parser"), express = require("express"), app = express(), cookieParser = require("cookie-parser"), session = require("express-session"), path = require("path"), os = require("os"), socketio = require("socket.io"), pubInterClass = require("./Routes/PublicInterface"), publicInterface = new pubInterClass, AuthenticSystem = require("./Routes/OAuthenicSystemInterface"), userAuthenticSystem = new AuthenticSystem, log4js = require("log4js"), VERSION = "wiot-kio-v20250603", LogManager = require("./Routes/LogInterface"), LogManagerObj = new LogManager, https = require("https"), http = require("http");
if (process.argv.length > 2 && process.argv[2] == "-v") {
    console.log("version: ", VERSION);
    return;
}
process.on("uncaughtException", function (r) { console.log(r), console.log(r.stack), LogManagerObj.errorLog("", r.stack); }), global.productType = 0, global.propertyPath = "", global.sdbPath = "", global.exportPath = "", global.importPath = "", global.drivePath = "./Driver", global.oauthInfo = { expires_in: 0, checkTokenFlag: !1, access_token: 0, refresh_token: 0 }, global.__dir = __dirname;
var envpath = path.resolve(__dir, "../../.env");
let option = { path: envpath };
var LogManager = require("./Routes/LogInterface"), LogManagerObj = new LogManager;
LogManagerObj.useLogger(app);
var userManagers = require("./Routes/userManager"), KIOUserManagers = new userManagers, strConfigPath = "./config/serverconfig.json";
function initial() {
    var r = publicInterface.readJson(strConfigPath);
    if (!r.Error && r.data.isHttp == !1 ? global.isHttp = !1 : global.isHttp = !0, !r.Error && r.data.ProductTypeRule != null && r.data.ProductTypeRule.ProductType != null) {
        if (global.productType = r.data.ProductTypeRule.ProductType, r.data.ProductTypeRule.Rule != null && r.data.ProductTypeRule.Rule["KF3.6"] == global.productType) {
            var e = publicInterface.readJson("../config/externalConfig.json");
            e != {} && e.data.projectDir != null && (global.sdbPath = e.data.projectDir), global.propertyPath = "./Data/config/propertyConfigForKF3.6", global.demoPath = "./Data/demo/KF3.6", global.RestfulIP = "";
        }
        else
            r.data.ProductTypeRule.Rule != null && r.data.ProductTypeRule.Rule["KF4.0"] == global.productType && (global.sdbPath = "../sdb", global.propertyPath = "./Data/config/propertyConfigForKF4.0", global.demoPath = "./Data/demo/KF4.0", global.RestfulIP = "");
        e.data.checkTokenFlag && (global.oauthInfo.checkTokenFlag = e.data.checkTokenFlag), e.data.expires_in ? global.oauthInfo.expires_in = e.data.expires_in : global.oauthInfo.expires_in = new Date().getTime();
    }
    else
        global.productType = 2, global.sdbPath = "../sdb";
    var t = "";
    global.productType == 1 ? t = "../../../../sdb" : t = global.sdbPath;
    let o = path.join(__dirname, "../../../sdb/filestation/kingioserver");
    fs.existsSync(o) || (makeDirSync(o + "/export"), makeDirSync(o + "/import")), global.exportPath = o + "/export", global.importPath = o + "/import";
}
initial();
var ProjectAuthorityManage = require("./Routes/AuthorityManage"), ProjectDeviceManage = require("./Routes/ProjectDeviceManage"), ProjectGroupManage = require("./Routes/ProjectGroupManage"), ProjectManage = require("./Routes/ProjectManage"), ProjectVarManage = require("./Routes/ProjectVarManage"), DriverManage = require("./Routes/DriverManager");
const { createSocket } = require("dgram");
var RestfulManage = require("./Routes/RestfulManage"), KFRestfulManage = require("./Routes/KFRestfulManage");
app.all("*", function (r, e, t) {
    if (e.header("Access-Control-Allow-Origin", "*"), e.header("Access-Control-Allow-Headers", "Content-Type,Content-Length,Authorization,Accept,X-Requested-With"), e.header("Access-Control-Allow-Methods", "PUT,POST,GET,DELETE,OPTIONS"), r.method === "OPTIONS") {
        e.status(200), e.send();
        return;
    }
    t();
}), app.use("/ProjectVar", function (r, e, t) { KIOUserManagers.checkOperationTokenIsValid(r, e, t); }, ProjectVarManage), app.use("/Project", function (r, e, t) { KIOUserManagers.checkOperationTokenIsValid(r, e, t); }, ProjectManage), app.use("/ProjectGroup", function (r, e, t) { KIOUserManagers.checkOperationTokenIsValid(r, e, t); }, ProjectGroupManage), app.use("/ProjectDev", function (r, e, t) { KIOUserManagers.checkOperationTokenIsValid(r, e, t); }, ProjectDeviceManage), app.use("/DriverManage", function (r, e, t) { KIOUserManagers.checkOperationTokenIsValid(r, e, t); }, DriverManage), app.use("/Authority", function (r, e, t) { KIOUserManagers.checkOperationTokenIsValid(r, e, t); }, ProjectAuthorityManage), app.use(log4js.connectLogger(log4js.getLogger("http"), { level: log4js.levels.INFO, format: "method:url" })), app.use("/api/v1", function (r, e, t) { t(); }, RestfulManage), app.use("/api/v1", function (r, e, t) { t(); }, KFRestfulManage), app.get("/api/v1/variables", function (r, e, t) {
    var o = "", p = {}, v = "";
    let g = "";
    r.query.projectInstanceName != null ? g = r.query.projectInstanceName : g = strCurProject;
    var f = { sourceName: g, objectList: [] };
    o = global.sdbPath;
    var b = {};
    b.sourceName = g, b.objectList = [];
    var l = o + "/ProjectGroupList.json", a;
    try {
        a = JSON.parse(fs.readFileSync(l));
    }
    catch (i) {
        console.log(i), e.send(f);
        return;
    }
    for (var c = "", n = "", s = 0; s < a.ProjectGroupList.length; s++) {
        if (a.ProjectGroupList[s].ProjectName != null && a.ProjectGroupList[s].ProjectName == g) {
            c = a.ProjectGroupList[s].ProjectID, n = a.ProjectGroupList[s].ProjectVersion;
            break;
        }
        if (a.ProjectGroupList[s].ProjectObjectList != null && a.ProjectGroupList[s].ProjectObjectList.length > 0) {
            for (var j = 0; j < a.ProjectGroupList[s].ProjectObjectList.length; j++)
                if (a.ProjectGroupList[s].ProjectObjectList[j].ProjectName != null && a.ProjectGroupList[s].ProjectObjectList[j].ProjectName == g) {
                    c = a.ProjectGroupList[s].ProjectObjectList[j].ProjectID, n = a.ProjectGroupList[s].ProjectObjectList[j].ProjectVersion;
                    break;
                }
            if (c != "" && c != null && n != "" && n != null)
                break;
        }
    }
    if (c != "" && c != null && n != "" && n != null) {
        var y = o + "/" + c + "/" + n + "/project/VarInfo.json";
        let i = ReadJson(y);
        if (i.Error) {
            e.send(f), console.log(i.ErrorDesc);
            return;
        }
        for (let u = 0; u < i.TagList.length; u++) {
            let d = {};
            d.n = i.TagList[u].TagName, d.d = i.TagList[u].Description, d.g = i.TagList[u].TagGroup, d.t = GetDataTypeString(i.TagList[u].TagDataType), d.o = "", d.max = i.TagList[u].MaxValue, d.min = i.TagList[u].MinValue, b.objectList.push(d);
        }
    }
    else {
        console.log("\u6587\u4EF6\u4E0D\u5B58\u5728"), e.send(f);
        return;
    }
    e.send(b);
});
var webServicePort = getWebPort();
if (app.engine(".html", require("ejs").__express), app.set("view engine", "html"), app.use(express.static("Public")), app.use(express.static("Data")), app.use(express.static(global.exportPath)), app.use(express.static(global.importPath)), app.use(bodyParser.json()), app.use(bodyParser.urlencoded({ extended: !0 })), app.use(cookieParser("sessiontest")), app.use(session({ secret: "KF_REFERENCE_REDACTED", resave: !0, saveUninitialized: !0 })), global.isHttp) {
    var server = http.createServer(app);
    server.listen(webServicePort, function () { var r = server.address().address, e = server.address().port; console.log("\u5E94\u7528\u5B9E\u4F8B\uFF0C\u8BBF\u95EE\u5730\u5740\u4E3A http://%s:%s", r, e), appLogger.system.info("\u670D\u52A1\u542F\u52A8", { ip: "", tenantId: "", user: "\u65E0", addon: {}, context: "\u6570\u91C7\u670D\u52A1\u542F\u52A8\u6210\u529F" }); });
}
else {
    var ssl_path = __dirname + "/config", credentials = { cert: fs.readFileSync(ssl_path + "/server.pem", "utf8"), key: fs.readFileSync(ssl_path + "/server.key", "utf8") }, server = https.createServer(credentials, app);
    server.listen(webServicePort, function () { var e = server.address().address, t = server.address().port; console.log("\u5E94\u7528\u5B9E\u4F8B\uFF0C\u8BBF\u95EE\u5730\u5740\u4E3A https://%s:%s", e, t), appLogger.system.info("\u670D\u52A1\u542F\u52A8", { ip: "", tenantId: "", user: "\u65E0", addon: {}, context: "\u6570\u91C7\u670D\u52A1\u542F\u52A8\u6210\u529F" }); });
}
function ReadJson(r) {
    let e = {}, t = publicInterface.getFileName(r);
    if (fs.existsSync(r)) {
        let o = "";
        try {
            o = fs.readFileSync(r);
        }
        catch {
            return e.Error = !0, e.ErrorDesc = "\u8BFB\u53D6" + t + "\u5931\u8D25", e;
        }
        try {
            e = JSON.parse(o), e.Error = !1;
        }
        catch (p) {
            return e.Error = !0, e.ErrorDesc = p.message, console.log(p.message), e;
        }
    }
    else
        return e.Error = !0, e.ErrorDesc = t + " \u4E0D\u5B58\u5728", e;
    return e;
}
function WriteJson(r, e) {
    let t = JSON.stringify(e, "", "	");
    try {
        fs.writeFileSync(r, t);
    }
    catch (o) {
        return r + "\u5199\u5165\u5931\u8D25\uFF0C\u5931\u8D25\u539F\u56E0\uFF1A" + o.message;
    }
    return "OK";
}
function GetDataTypeString(r) { var e = 0; return r == 1 ? e = 1 : r == 128 ? e = 3 : r == 512 ? e = 4 : r == 256 || r == 4096 ? e = 5 : e = 2, e; }
app.get("/api/v1/devicevariables", function (r, e) {
    var t = "", o = {}, p = "";
    let v = "";
    r.query.projectInstanceName != null ? v = r.query.projectInstanceName : v = strCurProject;
    var g = { sourceName: v, objectList: [] };
    try {
        p = fs.readFileSync("../config/externalConfig.json");
    }
    catch {
        e.send(g);
        return;
    }
    try {
        o = JSON.parse(p);
    }
    catch {
        e.send(g);
        return;
    }
    o != {} && o.projectDir != null && (t = o.projectDir);
    var f = {};
    f.sourceName = v, f.objectList = [];
    var b = t + "/ProjectGroupList.json", l;
    try {
        l = JSON.parse(fs.readFileSync(b));
    }
    catch (i) {
        console.log(i), e.send(g);
        return;
    }
    for (var a = "", c = "", n = 0; n < l.ProjectGroupList.length; n++) {
        if (l.ProjectGroupList[n].ProjectName != null && l.ProjectGroupList[n].ProjectName == v) {
            a = l.ProjectGroupList[n].ProjectID, c = l.ProjectGroupList[n].ProjectVersion;
            break;
        }
        if (l.ProjectGroupList[n].ProjectObjectList != null && l.ProjectGroupList[n].ProjectObjectList.length > 0) {
            for (var s = 0; s < l.ProjectGroupList[n].ProjectObjectList.length; s++)
                if (l.ProjectGroupList[n].ProjectObjectList[s].ProjectName != null && l.ProjectGroupList[n].ProjectObjectList[s].ProjectName == v) {
                    a = l.ProjectGroupList[n].ProjectObjectList[s].ProjectID, c = l.ProjectGroupList[n].ProjectObjectList[s].ProjectVersion;
                    break;
                }
            if (a != "" && a != null && c != "" && c != null)
                break;
        }
    }
    if (a != "" && a != null && c != "" && c != null) {
        var j = t + "/" + a + "/" + c + "/project/VarInfo.json";
        let i = ReadJson(j);
        if (i.Error) {
            e.send(g), console.log(i.ErrorDesc);
            return;
        }
        var y = t + "/" + a + "/" + c + "/project/DeviceInfo.json";
        let u = ReadJson(y);
        if (u.Error) {
            e.send(g), console.log(u.ErrorDesc);
            return;
        }
        for (let d = 0; d < u.DeviceList.length; d++) {
            let h = {};
            h.n = u.DeviceList[d].DeviceName, h.d = u.DeviceList[d].Description;
            let m = i.TagList.filter(function (P) { return P.DeviceName == h.n; });
            h.objectList = [];
            for (let P = 0; P < m.length; P++) {
                let L = {};
                L.n = m[P].TagName, L.d = m[P].Description, L.g = m[P].TagGroup, L.t = GetDataTypeString(m[P].TagDataType), L.o = "", h.objectList.push(L);
            }
            f.objectList.push(h);
        }
    }
    else {
        console.log("\u6587\u4EF6\u4E0D\u5B58\u5728"), e.send(g);
        return;
    }
    e.send(f);
});
var strCurProject = "";
app.get("/getProName", function (r, e) { strCurProject = r.query.ProjectName; let t = r.query.ProjectID, o = r.query.ProjectVersion; e.send("OK"); });
function makeDirSync(r) {
    if (fs.existsSync(r))
        return !0;
    if (makeDirSync(path.dirname(r))) {
        try {
            fs.mkdirSync(r);
        }
        catch {
            return !1;
        }
        return !0;
    }
    else
        return !1;
}
function getWebPort() { let r = ReadJson("../../../../config/devconfig.json"); return r.Error || r.startport == null || r.devCenterPortShift == null || r.devCenterPortShift.kingio == null ? 11002 : r.startport + r.devCenterPortShift.kingio; }
global.commonDir = path.resolve(`${__dirname}/../../../common/`), global.__DIR = __dirname;
function initLogger() { let r = require(`${global.commonDir}/log-utils`).getInstance(); r.init("../../../sdb/logs/kingioserver"), global.logger = r; }
function initLogDB() { const r = path.resolve(`${global.commonDir}/sqlitelog-utils`), e = require(r); let t = path.resolve(`${global.commonDir}/../`), o = require(path.resolve(`${global.commonDir}/../config/common.json`)); const p = new e({ kfPath: t, dbType: "center", tableName: "kingioserver", batchSize: 50, flushInterval: 2e3, retentionUnit: "day", retention: o.logConfig.retainTime, cleanupInterval: 720 * 60 * 1e3, level: "info" }); global.appLogger = { system: p.getLogger("system", "kingioserver"), operation: p.getLogger("opration", "kingioserver"), script: p.getLogger("script", "kingioserver") }; }
function registerRouter() {
    let r = require(`${__dirname}/lib/routers`);
    app.all("*", function (e, t, o) {
        if (t.header("Access-Control-Allow-Origin", "*"), t.header("Access-Control-Allow-Headers", "X-Requested-With,Authorization,datasourcename,Content-Type"), t.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS"), t.header("Content-Type", "application/json;charset=utf-8"), e.method === "OPTIONS") {
            t.status(200), t.send();
            return;
        }
        if (e.url !== "/favicon.ico")
            logger.log("debug", `-----------------\u6536\u5230\u8FDE\u63A5\u8BF7\u6C42,\u5BA2\u6237\u7AEF\u5730\u5740:${e.ip} ${e.originalUrl}`), o();
        else {
            t.status(200), t.send();
            return;
        }
    }), app.use("/", r), logger.log("info", "\u6CE8\u518C\u8DEF\u7531\u5B8C\u6210");
}
initLogger(), initLogDB(), registerRouter();
// end
