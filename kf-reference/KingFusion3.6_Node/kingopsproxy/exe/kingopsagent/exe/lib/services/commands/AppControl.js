// modified by jinlong.feng at 2026-10-29 KF源码精简入库
// Reference snapshot: credential literals redacted; do not deploy this copy.
var ImageMngModel = require(__dir + "/lib/services/image/image_mng"), ImageDownload = require(__dir + "/lib/services/image/image_download"), ExecMngModel = require(__dir + "/lib/services/exec/exec_mng"), ExecDownload = require(__dir + "/lib/services/exec/exec_download"), ProjectMngModel = require(__dir + "/lib/services/project/project_mng"), ProjectDownload = require(__dir + "/lib/services/project/project_download"), appMng = require(__dir + "/lib/services/app/app_mng"), dockerOperate = require(__dir + "/lib/services/deploy/deploy");
const profilesManage = require(__dir + "/lib/services/profiles/profiles_manage");
var proxyConfigJson = profilesManage.getGlobalCache(), os = require("os"), child_process = require("child_process"), path = require("path"), fs = require("fs"), net = require("net"), host = "127.0.0.1";
const commonPub = require(__dir + "/lib/services/common/public"), { util, format } = require(__dir + "/core/util");
var exposedPort = proxyConfigJson.docker.port, Docker = require("dockerode"), docker = new Docker({ host: `http://${host}`, port: exposedPort });
const requestCli = require(__dir + "/lib/services/interface/request_helper"), interfaceEnum = require(__dir + "/lib/services/interface/interface_enum"), addressMng = require(__dir + "/lib/services/common/address_mng.js");
class AppControl {
    constructor() { this.imageMng = new ImageMngModel, this.imageDownload = new ImageDownload, this.execMng = new ExecMngModel, this.execDownload = new ExecDownload, this.projectMng = new ProjectMngModel, this.projectDownLoad = new ProjectDownload, this.OauthRegisterJson = {}, this.nodeRegisterJson = {}, this.opsInterface = {}, this.userAuthenticationInterface = {}; }
    init() { this.imageDownload.init(), this.execDownload.init(), this.projectDownLoad.init(), this.OauthRegisterJson = require(__dir + "/data/OauthRegister.json"), this.nodeRegisterJson = require(__dir + "/data/nodeRegister.json"); var e = require(__dir + "/lib/services/interface/ops_interface"); this.opsInterface = new e; var a = require(__dir + "/lib/services/interface/user_authentic_interface"); this.userAuthenticationInterface = new a; }
    async AppDeploy(e) {
        try {
            e.execType = e.projectType, e.projectType === commonPub.enumProjectType.PROJECT_NGINX && (e.isLoadApp = !0);
            var a = !1, r = e.appId, O = appMng.findAppBaseById(e.appId);
            if (O !== -1) {
                var s = appMng.appsBaseInfo[O];
                s.port === e.port ? (logger.info("App: " + r + " port is SelfOcupied."), a = !0) : (s.port = e.port, appMng.save());
            }
            if (a === !1) {
                var i = await this.checkPortsOcupied(Number(e.port));
                if (i)
                    return { cmdStatus: 3, message: `\u7AEF\u53E3${e.port}\u5DF2\u88AB\u5360\u7528\uFF0C\u8BF7\u4FEE\u6539` };
            }
            var o = await dockerOperate.detectAppId(host, exposedPort, r, "", async function (B, K, d) { B === 0 && logger.info("detectApp: " + d + " status is " + K); }), c = !0;
            if (o === "created" || o === "running" || o === "stopped" || o === "exited") {
                var g = appMng.findAppBaseById(r);
                g !== -1 && (e.projectType === commonPub.enumProjectType.PROJECT_NGINX || s.port !== e.port ? (o === "running" && await dockerOperate.stopApp(host, exposedPort, r, "", async function (B, K) { logger.info("stop success..."); }), await dockerOperate.deleteApp(host, exposedPort, r, "", async function (B, K) { logger.info("delete success..."); })) : c = !1);
            }
            var E = appMng.findAppBaseById(e.appId);
            if (E !== -1 && e.appDeployStatus !== 0) {
                var s = appMng.appsBaseInfo[E];
                this.projectMng.findProjectByIdAndVersion(s.projectId, s.projectVersion) !== -1 && this.projectMng.deleteProject({ projectId: s.projectId, projectVersion: s.projectVersion }, function () { }), e.isUploadProject || this.deleteProjectFolder(s);
            }
            var j = this, A = 2, S = "succeed", P = e.appId, k = e.projectId, x = e.execType, ae = e.execFileName, L = e.execVersion;
            this.execDownload.setSolutionId(e.solutionId), this.execDownload.setProjectId(k), this.execDownload.setProjectVersion(e.projectVersion), this.execDownload.setExecName(ae), this.execDownload.setExecType(x), this.execDownload.setExecVersion(L), this.execDownload.setAppId(P);
            var M = j.execDownload.getDesExecDir(), F = !1, Q = !0, O = this.execMng.findExec(L, x);
            if (O !== -1) {
                F = !0;
                var Y = this.execMng.execHome.execs[O], se = Y.agentExecModTime, ie = Y.serverExecModTime;
                if (fs.existsSync(M)) {
                    var $ = fs.statSync(M).mtimeMs, D = 0;
                    $ === se ? (D = await j.execDownload.getExecModifyTime(), D === ie ? Q = !1 : logger.info("\u6587\u4EF6\u670D\u52A1\u4E2D\u53EF\u6267\u884C\u7A0B\u5E8F\u6709\u6539\u52A8\uFF0C\u9700\u8981\u91CD\u65B0\u4E0B\u8F7D\uFF01")) : logger.info("\u8FD0\u7EF4\u4EE3\u7406\u5DF2\u4E0B\u8F7D\u7684\u53EF\u6267\u884C\u7A0B\u5E8F\u6709\u6539\u52A8\uFF0C\u9700\u8981\u91CD\u65B0\u4E0B\u8F7D\uFF01");
                }
                else
                    logger.info("\u8FD8\u672A\u4E0B\u5728\u53EF\u6267\u884C\u7A0B\u5E8F\uFF0C\u9700\u8981\u91CD\u65B0\u4E0B\u8F7D\uFF01");
            }
            else
                logger.info("\u7BA1\u7406\u5668\u4E2D\u672A\u89C1\u8BE5\u53EF\u6267\u884C\u7A0B\u5E8F\uFF0C\u9700\u8981\u91CD\u65B0\u4E0B\u8F7D\uFF01");
            if (Q) {
                logger.info("-----------------------\u91CD\u65B0\u4E0B\u8F7D\u53EF\u6267\u884C\u7A0B\u5E8F\uFF01---------------------");
                var ce = await j.execDownload.downloadExec();
                if (!ce)
                    return { cmdStatus: 3, message: "\u53EF\u6267\u884C\u7A0B\u5E8F\u4E0B\u8F7D\u5931\u8D25\uFF01" };
                $ = fs.statSync(M).mtimeMs, D === 0 && (D = await j.execDownload.getExecModifyTime()), F ? this.execMng.modifyExec({ execVersion: L, type: x, serverExecModTime: D, agentExecModTime: $ }, function () { }) : this.execMng.addExec({ execVersion: L, type: x, serverExecModTime: D, agentExecModTime: $ }, function () { });
            }
            else
                logger.info("-----------------------\u4E0D\u9700\u8981\u91CD\u65B0\u4E0B\u8F7D\u53EF\u6267\u884C\u7A0B\u5E8F\uFF01---------------------");
            var z = e.projectType, V = e.projectVersion, h = e.debug;
            this.projectDownLoad.setTenantId(e.tenantId), this.projectDownLoad.setSolutionId(e.solutionId), this.projectDownLoad.setProjectId(k), this.projectDownLoad.setProjectType(z), this.projectDownLoad.setProjectVersion(V), this.projectDownLoad.setAppId(P);
            var I = this.projectDownLoad.getDesProjectDir(e.isLoadApp, h), y = I + "/project/externalconfig.json", Z = I + "/project/externalConfig.json";
            if (fs.existsSync(y) && fs.unlinkSync(y), !h || h === !1) {
                var oe = await j.projectDownLoad.downloadProject(e.isLoadApp, !1);
                if (!oe)
                    return { cmdStatus: 3, message: "\u5DE5\u7A0B\u4E0B\u8F7D\u5931\u8D25\uFF01" };
                this.projectMng.findProjectByIdAndVersion(k, V) !== -1 || this.projectMng.addProject({ projectId: k, projectVersion: V, projectType: z }, function () { });
            }
            var T = this.OauthRegisterJson, W = this.nodeRegisterJson, t = {};
            fs.existsSync(y) ? t = JSON.parse(fs.readFileSync(y, "utf-8")) : fs.existsSync(Z) && (t = JSON.parse(fs.readFileSync(Z, "utf-8"))), t.runOptions || (t.runOptions = {}), t.runOptions.protocol = addressMng.httpNum, t.expose || (t.expose = {}), t.expose.httpPort = Number(e.port), t.expose.wsPort = Number(e.wsPort), t.expose.http_type = "KMHttp", t.expose.ws_type = "KMWs", t.expose.port = Number(e.port), t.expose.extendport = [], e.isProxyed === !0 ? t.nginxBalance = 1 : t.nginxBalance = 0, t.isLoadApp = e.isLoadApp, t.oauth || (t.oauth = {}), t.oauth.host = addressMng.getUserCenterHost(), t.oauth.client_id = T.clientId, t.oauth.client_secret = T.clientSecret, t.oauth.redirect_uri = T.redirectUrl, t.defaultUser = {}, t.defaultUser.username = "admin002", t.defaultUser.password = "KF_REFERENCE_REDACTED", commonPub.enumProjectType.PROJECT_IOSERVER == e.projectType || commonPub.enumProjectType.PROJECT_NGINX == e.projectType || (t.redis || (t.redis = {}), t.redis.host = proxyConfigJson.opsCenterAddress + ":" + proxyConfigJson.redis.port, t.redis.pwd = proxyConfigJson.redis.pwd), t.opsCenter || (t.opsCenter = {}), t.opsCenter.host = addressMng.getOpsCenterHost(), t.opsCenter.publicHost = addressMng.getPublicOpsCenterHost(), t.opsProxy = {}, t.opsProxy.host = W.nodeInfo.address + ":" + W.nodeInfo.port, t.license || (t.license = {}), t.license.host = addressMng.getLicenseHost(), t.regist2OAuthResult || (t.regist2OAuthResult = {}), t.regist2OAuthResult.ClientID = T.clientId, t.regist2OAuthResult.ClientSecret = T.clientSecret, t.regist2OAuthResult.RedirectURL = T.redirectUrl, t.solution || (t.solution = {}), t.solution.solutionName = e.solutionName, t.solution.GUID = e.solutionId, t.solution.createTime = format.formatDate(new Date), t.tenant || (t.tenant = {}), t.tenant.tenantId = e.tenantId, t.serviceDiscovery || (t.serviceDiscovery = {}), t.serviceDiscovery.host = addressMng.getServiceDiscoveryHost(), t.serviceDiscovery.publicHost = addressMng.getPublicServiceDiscoveryHost(), t.nginxType = proxyConfigJson.nginxType, t.nginxPort = proxyConfigJson.nginxPort, t.gis || (t.gis = {}), t.gis.host = proxyConfigJson.opsCenterAddress + ":" + proxyConfigJson.opsCenterPort.kinggis, t.APPName = e.appName, fs.existsSync(I) || fs.mkdirSync(I, { recursive: !0 });
            var pe = JSON.stringify(t);
            fs.writeFileSync(y, pe, { mode: 384 });
            var u = "kingfusionbase", l = "latest", f = "/proj/appid/AppExe", w = "/proj/appid/Project", _ = "/proj/appid/AppExe", v = { code: "201", message: "no error", data: "null" };
            switch (e.projectType) {
                case commonPub.enumProjectType.PROJECT_CLIENT:
                    var ne = "8004", ue = "23401", p = this.getDeployDir(e, "Project"), n = this.getDeployDir(e, "AppExe");
                    logger.info("projDir: " + p), logger.info("exeDir: " + n), c && (v = await dockerOperate.createContainerClient({ debug: h, tenantId: e.tenantId, solutionId: e.solutionId }, "", e.port, ue, u + ":" + l, f, p, w, n, _, "", "", "", "", r, async function (d, b) { return d === 0 ? (appMng.createAppBase(e, function () { logger.info("createAppBase success for " + e.appId); }), { code: "201", message: "Container created successfully", data: "null" }) : (logger.info("createContainerClient fail for " + e.appId), { code: "1", message: "Container created fail", data: "null" }); }));
                    break;
                case commonPub.enumProjectType.PROJECT_CALCULATION:
                    var p = this.getDeployDir(e, "Project"), n = this.getDeployDir(e, "AppExe");
                    logger.info("projDir: " + p), logger.info("exeDir: " + n), c && (v = await dockerOperate.createContainerCalc({ debug: h, tenantId: e.tenantId, solutionId: e.solutionId }, "", e.port, u + ":" + l, f, p, w, n, _, r, async function (d, b) { return d === 0 ? (appMng.createAppBase(e, function () { logger.info("createAppBase success for " + e.appId); }), { code: "201", message: "Container created successfully", data: "null" }) : (logger.info("createContainerCalc fail for " + e.appId), { code: "1", message: "Container created fail", data: "null" }); }));
                    break;
                case commonPub.enumProjectType.PROJECT_ALARMCAL:
                    var p = this.getDeployDir(e, "Project"), n = this.getDeployDir(e, "AppExe");
                    logger.info("projDir: " + p), logger.info("exeDir: " + n), c && (v = await dockerOperate.createContainerAlarmCal({ debug: h, tenantId: e.tenantId, solutionId: e.solutionId }, "", e.port, u + ":" + l, f, p, w, n, _, r, async function (d, b) { return d === 0 ? (appMng.createAppBase(e, function () { logger.info("createAppBase success for " + e.appId); }), { code: "201", message: "Container created successfully", data: "null" }) : (logger.info("createContainerAlarmCal fail for " + e.appId), { code: "1", message: "Container created fail", data: "null" }); }));
                    break;
                case commonPub.enumProjectType.PROJECT_IOSERVER:
                    var p = this.getDeployDir(e, "Project"), n = this.getDeployDir(e, "AppExe");
                    logger.info("projDir: " + p), logger.info("exeDir: " + n);
                    var U, G = [], C, J = fs.existsSync(p + "/interalconfig.json", "utf-8");
                    J ? (logger.info(J), C = JSON.parse(fs.readFileSync(p + "/interalconfig.json").toString("utf-8")), U = C.uncontained, G = C.exposedPorts) : (logger.info("interalconfig\u6587\u4EF6\u4E0D\u5B58\u5728"), U = !1, G = []), U === !1 ? c && (v = await dockerOperate.createContainerIOServer({ debug: h, tenantId: e.tenantId, solutionId: e.solutionId }, "", e.port, G, u + ":" + l, f, p, w, n, _, r, async function (d, b) { return d === 0 ? (appMng.createAppBase(e, function () { logger.info("createAppBase success for " + e.appId); }), { code: "201", message: "Container created successfully", data: "null" }) : (logger.info("createContainerIO fail for " + e.appId), { code: "1", message: "Container created fail", data: "null" }); })) : (logger.info("APP\u540D\u79F0\u4E3A" + e.appName + "\u4E0D\u652F\u6301\u5BB9\u5668\u8FD0\u884C"), v = { code: "1", message: "App\u4E0D\u652F\u6301\u5BB9\u5668\u8FD0\u884C", data: "null" });
                    break;
                case commonPub.enumProjectType.PROJECT_DBCONNECTOR:
                    var p = this.getDeployDir(e, "Project"), n = this.getDeployDir(e, "AppExe");
                    logger.info("projDir: " + p), logger.info("exeDir: " + n), c && (v = await dockerOperate.createContainerDBConnector({ debug: h, tenantId: e.tenantId, solutionId: e.solutionId }, "", e.port, u + ":" + l, f, p, w, n, _, r, async function (d, b) { return d === 0 ? (appMng.createAppBase(e, function () { logger.info("createAppBase success for " + e.appId); }), { code: "201", message: "Container created successfully", data: "null" }) : (logger.info("createContainerIO fail for " + e.appId), { code: "1", message: "Container created fail", data: "null" }); }));
                    break;
                case commonPub.enumProjectType.PROJECT_NGINX:
                    var p = this.getDeployDir(e, "Project"), n = this.getDeployDir(e, "AppExe");
                    logger.info("projDir: " + p), logger.info("exeDir: " + n);
                    var ee = JSON.parse(fs.readFileSync(p + "/nginxCfg.json", "utf-8")), de = ee.SSLCertificate, ge = ee.SSLKey, u = "nginx", l = "1.0.0.1", m = 6;
                    this.imageDownload.setImageName(u), this.imageDownload.setImageType(m), this.imageDownload.setImageVersion(l), logger.info("-----------------------\u4E0B\u8F7D\u6570\u636E\u5E93\u955C\u50CF\uFF01---------------------");
                    var H = await j.imageDownload.downloadImage();
                    if (!H)
                        return { cmdStatus: 3, message: `\u6570\u636E\u5E93\u955C\u50CF${u}\u4E0B\u8F7D\u5931\u8D25\uFF01` };
                    this.imageMng.addImage({ imageFileName: u, imageVersion: l }, function () { });
                    var N = path.join(__dir, `../../../../dockerimagedb/third/x86/linux/${u}/${u}.tar`);
                    logger.info("imageDir" + N);
                    var X = await docker.loadImage(N);
                    logger.info(X), c && (v = await dockerOperate.createContainerNginx("", e.port, ne, "nginx", f, p, w, n, _, r, de, ge, async function (d, b) { return d === 0 ? (appMng.createAppBase(e, function () { logger.info("createAppBase success for " + e.appId); }), { code: "201", message: "Container created successfully", data: "null" }) : (logger.info("createContainerIO fail for " + e.appId), { code: "1", message: "Container created fail", data: "null" }); }));
                    break;
                case commonPub.enumProjectType.PROJECT_DB:
                    var p = this.getDeployDir(e, "Project"), n = this.getDeployDir(e, "AppExe");
                    logger.info("projDir: " + p), logger.info("exeDir: " + n);
                    var le = require(p + "/project.json"), m = le.dataSourceType.toLowerCase();
                    logger.info("imageType:" + m);
                    var l = "1.0.0.1", u = m, R, q = require(p + "/dbConfig.json");
                    switch (u) {
                        case "mongodb":
                            m = 1, R = q.binds[0].Port;
                            break;
                        case "postgresql":
                            m = 2, R = q.Basic.port;
                            break;
                        case "redis":
                            m = 3, R = q.Basic.port;
                            break;
                        case "timescaledb":
                            m = 4, R = q.Basic.port;
                            break;
                        case "mqtt":
                            m = 5;
                            break;
                        case "nginx":
                            m = 6;
                            break;
                        default: break;
                    }
                    this.imageDownload.setImageName(u), this.imageDownload.setImageType(m), this.imageDownload.setImageVersion(l), logger.info("-----------------------\u4E0B\u8F7D\u6570\u636E\u5E93\u955C\u50CF\uFF01---------------------");
                    var H = await j.imageDownload.downloadImage();
                    if (!H)
                        return { cmdStatus: 3, message: `\u6570\u636E\u5E93\u955C\u50CF${u}\u4E0B\u8F7D\u5931\u8D25\uFF01` };
                    this.imageMng.addImage({ imageFileName: u, imageVersion: l }, function () { });
                    var N = path.join(__dir, `../../../../dockerimagedb/third/x86/linux/${u}/${u}.tar`);
                    logger.info("imageDir" + N);
                    var X = await docker.loadImage(N);
                    logger.info(X), c && (v = await dockerOperate.createContainerDB({ debug: h, tenantId: e.tenantId, solutionId: e.solutionId }, "", e.port, R, u, f, p, w, n, _, r, async function (d, b) { return d === 0 ? (appMng.createAppBase(e, function () { logger.info("createAppBase success for " + e.appId); }), { code: "201", message: "Container created successfully", data: "null" }) : (logger.info("createContainerDB fail for " + e.appId), { code: "1", message: "Container created fail", data: "null" }); }));
                    break;
                default: break;
            }
            switch ("" + v.code) {
                case "201":
                    A = 2;
                    break;
                default: A = 3;
            }
            S = v.message, await appMng.setAppDeployStatus({ appId: P, appDeployStatus: commonPub.enumAppDeployStatus.APP_DEPLOYED }, function () { }), o === "running" ? ((c || !(e.isUploadProject && e.projectType === commonPub.enumProjectType.PROJECT_CLIENT)) && (logger.info(`------\u521D\u59CB\u8FD0\u884C\u72B6\u6001\u4E3Arunning\uFF0C\u91CD\u542FAPP\uFF1A${P}------`), await this.AppRestart(P)), await appMng.setExpectedAppStatus({ appId: P, expectedAppStatus: commonPub.enumAppStatus.APP_RUNNING, expectedStatusTimeStamp: parseInt(new Date().getTime()) }, function () { })) : await appMng.setExpectedAppStatus({ appId: P, expectedAppStatus: commonPub.enumAppStatus.APP_STOPPED, expectedStatusTimeStamp: parseInt(new Date().getTime()) }, function () { });
            var te = appMng.findAppBaseByName(e.appName);
            if (te > -1) {
                var re = appMng.appsBaseInfo[te].appId;
                re !== e.appId && await appMng.delAppBase({ appId: re }, function () { });
            }
            return { cmdStatus: A, message: S };
        }
        catch (B) {
            return logger.info(B), { cmdStatus: 3, message: "\u6307\u4EE4\u5F02\u5E38\u9000\u51FA\uFF01" };
        }
    }
    async AppStart(e) {
        var a = 2, r = "succeed", s = await dockerOperate.startApp(host, exposedPort, e, "", function (c, g) { logger.info("AppStart success for " + e); }), i = { code: s.statusCode, message: "no error", data: "null" };
        switch ("" + i.code) {
            case "204":
                a = 2, r = "204: no error";
                break;
            default: a = 3, r = i.code + ": error";
        }
        await appMng.setExpectedAppStatus({ appId: e, expectedAppStatus: commonPub.enumAppStatus.APP_RUNNING, expectedStatusTimeStamp: parseInt(new Date().getTime()) }, function () { });
        var o = { cmdStatus: a, message: r };
        return o;
    }
    async AppRestart(e) {
        var a = 2, r = "succeed", s = await dockerOperate.restartApp(host, exposedPort, e, "", async function (c, g) { logger.info("AppRestart setAppStatus success for " + command.cmdParam.appName); }), i = { code: s.statusCode, message: "no error", data: "null" };
        switch ("" + i.code) {
            case "204":
                a = 2, r = "204: no error";
                break;
            default: a = 3, r = i.code + ": error";
        }
        await appMng.setExpectedAppStatus({ appId: e, expectedAppStatus: commonPub.enumAppStatus.APP_RUNNING, expectedStatusTimeStamp: parseInt(new Date().getTime()) }, function () { });
        var o = { cmdStatus: a, message: r };
        return o;
    }
    async AppStop(e) {
        var a = 2, r = "succeed", s = await dockerOperate.stopApp(host, exposedPort, e, "", async function (c, g) { logger.info("AppStop setAppStatus success for " + e); }), i = { code: s.statusCode, message: "no error", data: "null" };
        switch ("" + i.code) {
            case "204":
                a = 2, r = "204: no error";
                break;
            default: a = 3, r = i.code + ": error";
        }
        var o = { cmdStatus: a, message: r };
        return await appMng.setExpectedAppStatus({ appId: e, expectedAppStatus: commonPub.enumAppStatus.APP_STOPPED }, function () { }), o;
    }
    async AppUndeploy(e) {
        var a = e, r = await dockerOperate.detectAppId(host, exposedPort, a, "", async function (j, A, S) { j === 0 && logger.info("detectApp: " + S + " status is " + A); }), s = appMng.findAppBaseById(e), i = appMng.appsBaseInfo[s], o = 2, c = "succeed";
        if (r !== "err") {
            var r = await dockerOperate.stopApp(host, exposedPort, e, "", async function (A, S) { logger.info("stop success..."); }), r = await dockerOperate.deleteApp(host, exposedPort, e, "", async function (A, S) { logger.info("delete success..."); }), g = { code: r.statusCode, message: "no error", data: "null" };
            switch ("" + g.code) {
                case "204":
                    o = 2, c = "204: no error";
                    break;
                default: o = 3, c = g.code + ": error";
            }
        }
        if (o === 2) {
            var s = appMng.findAppBaseById(e);
            if (s !== -1) {
                var i = appMng.appsBaseInfo[s];
                appMng.delAppBase({ appId: i.appId }, function () { logger.info("createAppBase success for " + i.appId); }), this.projectMng.findProjectByIdAndVersion(i.projectId, i.projectVersion) !== -1 && this.projectMng.deleteProject({ projectId: i.projectId, projectVersion: i.projectVersion }, function () { }), this.deleteProjectFolder(i);
            }
        }
        await appMng.setAppDeployStatus({ appId: e, appDeployStatus: commonPub.enumAppDeployStatus.APP_UNDEPLOY }, function () { });
        var E = { cmdStatus: o, message: c };
        return E;
    }
    async AppDelete(e) { var a = 2, r = "succeed", s = { cmdStatus: a, message: r }; return s; }
    async AppBatchDeploy(e) {
        for (var a = [], r = 0; r < e.length; r++)
            a.push({ appId: e[r].appId, cmdStatus: 2, message: "success" });
        return a;
    }
    async AppBatchStart(e) {
        for (var a = [], r = 0; r < e.length; r++)
            a.push({ appId: e[r], cmdStatus: 2, message: "success" });
        return a;
    }
    async AppBatchRestart(e) {
        for (var a = [], r = 0; r < e.length; r++)
            a.push({ appId: e[r], cmdStatus: 2, message: "success" });
        return a;
    }
    async AppBatchStop(e) {
        for (var a = [], r = 0; r < e.length; r++)
            a.push({ appId: e[r], cmdStatus: 2, message: "success" });
        return a;
    }
    async AppBatchUndeploy(e) {
        for (var a = [], r = 0; r < e.length; r++)
            a.push({ appId: e[r], cmdStatus: 2, message: "success" });
        return a;
    }
    getProjectTypeStr(e) {
        var a = "";
        switch (e) {
            case commonPub.enumProjectType.PROJECT_CALCULATION: {
                a = "kingcalculation";
                break;
            }
            case commonPub.enumProjectType.PROJECT_CLIENT: {
                a = "kingclient";
                break;
            }
            case commonPub.enumProjectType.PROJECT_COLLECTION: {
                a = "kingio";
                break;
            }
            case commonPub.enumProjectType.PROJECT_DBCONNECTOR: {
                a = "kingdbconnector";
                break;
            }
            case commonPub.enumProjectType.PROJECT_DB: {
                a = "kingdb";
                break;
            }
            case commonPub.enumProjectType.PROJECT_IOSERVER: {
                a = "kingioserver";
                break;
            }
            case commonPub.enumProjectType.PROJECT_NGINX: {
                a = "kingnginx";
                break;
            }
            case commonPub.enumProjectType.PROJECT_KIO: {
                a = "kio";
                break;
            }
            case commonPub.enumProjectType.PROJECT_ALARMCAL: {
                a = "kingalarm";
                break;
            }
        }
        return a;
    }
    getDeployDir(e, a) {
        var r = !0, s = "", i = "", o = this.getProjectTypeStr(e.projectType);
        switch (a) {
            case "AppExe":
                var g = `../../../../exedb/${o}/x86/linux/${e.execVersion}`;
                i = path.join(__dir, g);
                break;
            case "Project":
                var c = "";
                r ? e.projectType === commonPub.enumProjectType.PROJECT_NGINX ? c = `../../../../sdb/${o}/${e.projectId}/project` : c = `../../../../sdb/${o}/${e.projectId}/${e.projectVersion}/${e.appId}/project` : e.projectType === commonPub.enumProjectType.PROJECT_NGINX ? c = `../../../../${s}` : c = `../../../../${s}`, i = path.join(__dir, c);
                break;
            default:
                i = [];
                var g = `../../../../exedb/${o}/x86/linux/${e.execVersion}`;
                if (i[0] = path.join(__dir, g), r)
                    var c = `../../../../sdb/${o}/${e.projectId}/${e.projectVersion}/${e.appId}/project`;
                else
                    var c = `../../../../${s}`;
                i[1] = path.join(__dir, c);
                break;
        }
        return i;
    }
    async checkPortsOcupied(e) { return new Promise((a, r) => { var s = net.createServer().listen(e); s.on("listening", function () { s.close(), a(!1); }), s.on("error", function (i) { i.code === "EADDRINUSE" && (logger.info(`port ${e} is ocupied`), a(!0)), a(!1); }); }); }
    async deleteProjectFolder(e) {
        var a = "";
        e.projectType === commonPub.enumProjectType.PROJECT_NGINX ? a = `../../../../sdb/${this.getProjectTypeStr(e.projectType)}/${e.projectId}/project` : a = `../../../../sdb/${this.getProjectTypeStr(e.projectType)}/${e.projectId}/${e.projectVersion}/${e.appId}/project`;
        var r = path.join(__dir, a);
        logger.info("AppUndeploy execDir: ", r);
        var s = os.platform();
        try {
            if (s === "win32") {
                var i = "DEL /F /A /Q \\\\?\\" + r, o = "RD /S /Q \\\\?\\" + r;
                child_process.execSync(i), child_process.execSync(o);
            }
            else if (s === "linux") {
                var c = "rm -rf " + r;
                child_process.execSync(c);
            }
        }
        catch { }
    }
}
module.exports = AppControl;
// end
