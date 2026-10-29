const fs = require("fs"),
    {
        util
    } = require(__dir + "/core/util"),
    AppBaseModel = require(__dir + "/lib/services/app/app_base"),
    appBaseCfgsDir = __dir + "/data/app_base_manage.json",
    errMsg = require(__dir + "/lib/config/state/error-message"),
    FileBackups = require(__dir + "/lib/services/common/file_backup_mng.js"),
    fileBakup = new FileBackups(appBaseCfgsDir),
    commonPub = require(__dir + "/lib/services/common/public");
class AppMngModel {
    constructor() {
        this.version = "", this.createDate = "", this.updateDate = "", this.appsBaseInfo = [], this.appsPerfInfo = [], this.load();
        let e = 7200 * 1e3,
            s = 600 * 1e3;
        setInterval(() => {
            let t = new Date().getTime(),
                p = [];
            for (let i = 0; i < this.appsBaseInfo.length; i++) {
                let r = this.appsBaseInfo[i],
                    o = this.authObj.noAuthAppMap.get(r.appName),
                    n = this.authObj.errAuthAppMap.get(r.appName);
                (o && o + e < t || n && o + s < t) && (r.setExpectedAppStatus(commonPub.enumAppStatus.APP_STOPPED), this.save(), p.push({
                    appId: r.appId,
                    appName: r.appName
                }))
            }
            try {
                if (p.length > 0) {
                    let i = require(__dir + "/lib/services/commands/AppControlExPm2"),
                        r = new i;
                    for (let o = 0; o < p.length; o++) {
                        let {
                            appName: n,
                            appId: a
                        } = p[o];
                        logger.info(`---------- \u505C\u6B62:${p[o].appName} ----------`), r.AppStop(a), this.authObj.noAuthAppMap.delete(n), this.authObj.errAuthAppMap.delete(n), this.authObj.saveAbnormalAuthInfo()
                    }
                }
            } catch (i) {
                logger.error(i)
            }
        }, 5e3)
    }
    getAppsBaseInfo() {
        return this.appsBaseInfo
    }
    async createAppBase(e, s) {
        try {
            if (e = util.cloneObj(e), !e.appId || !e.appName) {
                s(errMsg.PARAM_NOT_COMPLETE.code, errMsg.PARAM_NOT_COMPLETE.msg);
                return
            }
            let t = new AppBaseModel;
            t.setAppId(e.appId), t.setAppName(e.appName);
            let p = this.findAppBaseByName(t.getAppName()),
                i = this.findAppBaseById(t.getAppId());
            p > i ? (p > -1 && this.appsBaseInfo.splice(p, 1), i > -1 && this.appsBaseInfo.splice(i, 1), i = this.findAppBaseById(t.getAppId())) : p < i && (i > -1 && this.appsBaseInfo.splice(i, 1), p > -1 && this.appsBaseInfo.splice(p, 1), i = this.findAppBaseById(t.getAppId())), i < 0 ? (e.hasOwnProperty("tenantId") && t.setTenantId(e.tenantId), e.hasOwnProperty("projectId") && t.setProjectId(e.projectId), e.hasOwnProperty("projectVersion") && t.setProjectVersion(e.projectVersion), e.hasOwnProperty("projectType") && t.setProjectType(e.projectType), e.hasOwnProperty("execFileName") && t.setExecFileName(e.execFileName), e.hasOwnProperty("execVersion") && t.setExecVersion(e.execVersion), e.hasOwnProperty("port") && t.setPort(e.port), e.hasOwnProperty("wsPort") && t.setWsPort(e.wsPort), e.hasOwnProperty("appDescription") && t.setAppDescription(e.appDescription), e.hasOwnProperty("isLoadApp") && t.setIsLoadApp(e.isLoadApp), e.hasOwnProperty("appDeployStatus") && t.setAppDeployStatus(e.appDeployStatus), e.hasOwnProperty("appStatus") && t.setAppStatus(e.appStatus), e.hasOwnProperty("expectedAppStatus") && t.setExpectedAppStatus(e.expectedAppStatus), e.hasOwnProperty("solutionId") && t.setSolutionId(e.solutionId), e.hasOwnProperty("solutionName") && t.setSolutionName(e.solutionName), this.appsBaseInfo.push(t), this.updateDate = new Date, s(0, t), this.save()) : s(errMsg.APP_HAS_EXITS.code, errMsg.APP_HAS_EXITS.msg)
        } catch {
            s(errMsg.PARAM_NOT_COMPLETE.code, errMsg.PARAM_NOT_COMPLETE.msg)
        }
    }
    async getAppBaseInfo(e, s) {
        try {
            let t = this.findAppBaseById(e.appId);
            if (t < 0) s(errMsg.APP_NOT_EXITS.code, errMsg.APP_NOT_EXITS.msg);
            else {
                let p = this.appsBaseInfo[t],
                    i = {
                        tenantId: p.getTenantId(),
                        projectId: p.getProjectId(),
                        projectVersion: p.getProjectVersion(),
                        projectType: p.getProjectType(),
                        execFileName: p.getExecFileName(),
                        execVersion: p.getExecVersion(),
                        appId: p.getAppId(),
                        appName: p.getAppName(),
                        port: p.getPort(),
                        appDescription: p.getAppDescription(),
                        isLoadApp: p.getIsLoadApp(),
                        appDeployStatus: p.getAppDeployStatus(),
                        appStatus: p.getAppStatus(),
                        expectedAppStatus: p.getExpectedAppStatus(),
                        expectedStatusTimeStamp: p.getExpectedStatusTimeStamp(),
                        solutionId: p.getSolutionId(),
                        solutionName: p.getSolutionName()
                    };
                s(0, i)
            }
        } catch {
            s(errMsg.PARAM_NOT_COMPLETE.code, errMsg.PARAM_NOT_COMPLETE.msg)
        }
    }
    getAppBaseInfoByName(e) {
        for (let s = this.appsBaseInfo.length - 1; s >= 0; s--) {
            let t = this.appsBaseInfo[s];
            if (t.appName === e) return {
                tenantId: t.getTenantId(),
                projectId: t.getProjectId(),
                projectVersion: t.getProjectVersion(),
                projectType: t.getProjectType(),
                execFileName: t.getExecFileName(),
                execVersion: t.getExecVersion(),
                appId: t.getAppId(),
                appName: t.getAppName(),
                port: t.getPort(),
                appDescription: t.getAppDescription(),
                isLoadApp: t.getIsLoadApp(),
                appDeployStatus: t.getAppDeployStatus(),
                appStatus: t.getAppStatus(),
                expectedAppStatus: t.getExpectedAppStatus(),
                expectedStatusTimeStamp: t.getExpectedStatusTimeStamp(),
                solutionId: t.getSolutionId(),
                solutionName: t.getSolutionName()
            }
        }
        return null
    }
    async getAppBaseInfoArr(e, s) {
        try {
            let t = [];
            for (let p = 0; p < e.length; p++) {
                let i = this.findAppBaseById(e[p].appId);
                if (i < 0) s(errMsg.APP_NOT_EXITS.code, errMsg.APP_NOT_EXITS.msg);
                else {
                    let r = this.appsBaseInfo[i],
                        o = {
                            tenantId: r.getTenantId(),
                            projectId: r.getProjectId(),
                            projectVersion: r.getProjectVersion(),
                            projectType: r.getProjectType(),
                            execFileName: r.getExecFileName(),
                            execVersion: r.getExecVersion(),
                            appId: r.getAppId(),
                            appName: r.getAppName(),
                            port: r.getPort(),
                            appDescription: r.getAppDescription(),
                            isLoadApp: r.getIsLoadApp(),
                            appDeployStatus: r.getAppDeployStatus(),
                            appStatus: r.getAppStatus(),
                            expectedAppStatus: r.getExpectedAppStatus(),
                            expectedStatusTimeStamp: r.getExpectedStatusTimeStamp(),
                            solutionId: r.getSolutionId(),
                            solutionName: r.getSolutionName()
                        };
                    t.push(o)
                }
            }
            s(0, t)
        } catch {
            s(errMsg.PARAM_NOT_COMPLETE.code, errMsg.PARAM_NOT_COMPLETE.msg)
        }
    }
    async getAppBaseList(e) {
        let s = {
            apps: this.appsBaseInfo
        };
        e(0, s)
    }
    async setAppBaseCfg(e, s) {
        try {
            if (!e.hasOwnProperty("appId")) {
                s(errMsg.PARAM_NOT_COMPLETE.code, errMsg.PARAM_NOT_COMPLETE.msg);
                return
            }
            let t = this.findAppBaseById(e.appId);
            if (t < 0) s(errMsg.APP_NOT_EXITS.code, errMsg.APP_NOT_EXITS.msg);
            else {
                let p = this.appsBaseInfo[t];
                p.setProjectVersion(e.projectVersion), p.setProjectType(e.projectType), p.setExecFileName(e.execFileName), p.setExecVersion(e.execVersion), p.setAppId(e.appId), p.setAppName(e.appName), p.setPort(e.port), p.setWsPort(e.wsPort), p.appDescription(e.appDescription), p.setIsLoadApp(e.isLoadApp), p.setUpdateTime(e.appDeployStatus), p.setAppStatus(e.appStatus), p.setExpectedAppStatus(e.expectedAppStatus), p.setSolutionId(e.solutionId), p.setSolutionName(e.solutionName), this.updateDate = new Date, s(0, null)
            }
        } catch {
            s(errMsg.PARAM_NOT_COMPLETE.code, errMsg.PARAM_NOT_COMPLETE.msg)
        }
    }
    async setAppDeploy(e, s) {
        try {
            if (!e.hasOwnProperty("appId") || !e.hasOwnProperty("appDeployStatus")) {
                s(errMsg.PARAM_NOT_COMPLETE.code, errMsg.PARAM_NOT_COMPLETE.msg);
                return
            }
            let t = this.findAppBaseById(e.appId);
            t < 0 ? s(errMsg.APP_NOT_EXITS.code, errMsg.APP_NOT_EXITS.msg) : (this.appsBaseInfo[t].setAppDeployStatus(e.appDeployStatus), this.updateDate = new Date, s(0, null))
        } catch {
            s(errMsg.PARAM_NOT_COMPLETE.code, errMsg.PARAM_NOT_COMPLETE.msg)
        }
    }
    async getAppDeploy(e, s) {
        try {
            let t = this.findAppBaseById(e.appId);
            if (t < 0) s(errMsg.APP_NOT_EXITS.code, errMsg.APP_NOT_EXITS.msg);
            else {
                let p = this.appsBaseInfo[t],
                    i = {
                        appId: p.getAppId(),
                        appDeployStatus: p.getAppDeployStatus()
                    };
                s(0, i)
            }
        } catch {
            s(errMsg.PARAM_NOT_COMPLETE.code, errMsg.PARAM_NOT_COMPLETE.msg)
        }
    }
    async setAppDeployStatus(e, s) {
        try {
            if (!e.hasOwnProperty("appId") || !e.hasOwnProperty("appDeployStatus")) {
                s(errMsg.PARAM_NOT_COMPLETE.code, errMsg.PARAM_NOT_COMPLETE.msg);
                return
            }
            let t = this.findAppBaseById(e.appId);
            if (t < 0) s(errMsg.APP_NOT_EXITS.code, errMsg.APP_NOT_EXITS.msg);
            else {
                let p = this.appsBaseInfo[t];
                p.setAppDeployStatus(e.appDeployStatus), p.setTimestamp(parseInt(new Date().getTime())), this.updateDate = new Date, s(0, null), this.save()
            }
        } catch {
            s(errMsg.PARAM_NOT_COMPLETE.code, errMsg.PARAM_NOT_COMPLETE.msg)
        }
    }
    async setAppStatus(e, s) {
        try {
            if (!e.hasOwnProperty("appId") || !e.hasOwnProperty("appStatus")) {
                s(errMsg.PARAM_NOT_COMPLETE.code, errMsg.PARAM_NOT_COMPLETE.msg);
                return
            }
            let t = this.findAppBaseById(e.appId);
            if (t < 0) s(errMsg.APP_NOT_EXITS.code, errMsg.APP_NOT_EXITS.msg);
            else {
                let p = this.appsBaseInfo[t];
                p.setAppStatus(e.appStatus), p.setTimestamp(parseInt(new Date().getTime())), this.updateDate = new Date, s(0, null)
            }
        } catch {
            s(errMsg.PARAM_NOT_COMPLETE.code, errMsg.PARAM_NOT_COMPLETE.msg)
        }
    }
    async setExpectedAppStatus(e, s) {
        try {
            if (!e.hasOwnProperty("appId") || !e.hasOwnProperty("expectedAppStatus")) {
                s(errMsg.PARAM_NOT_COMPLETE.code, errMsg.PARAM_NOT_COMPLETE.msg);
                return
            }
            let t = this.findAppBaseById(e.appId);
            if (t < 0) s(errMsg.APP_NOT_EXITS.code, errMsg.APP_NOT_EXITS.msg);
            else {
                let p = this.appsBaseInfo[t];
                p.setExpectedAppStatus(e.expectedAppStatus), e.hasOwnProperty("expectedStatusTimeStamp") && p.setExpectedStatusTimeStamp(e.expectedStatusTimeStamp), this.updateDate = new Date, s(0, null), this.save()
            }
        } catch {
            s(errMsg.PARAM_NOT_COMPLETE.code, errMsg.PARAM_NOT_COMPLETE.msg)
        }
    }
    async getAppStatus(e, s) {
        try {
            let t = this.findAppBaseById(e.appId);
            if (t < 0) s(errMsg.PROJECT_NOT_EXITS.code, errMsg.PROJECT_NOT_EXITS.msg);
            else {
                let p = this.appsBaseInfo[t],
                    i = {
                        appId: p.getAppId(),
                        appStatus: p.getAppStatus(),
                        expectedAppStatus: p.getExpectedAppStatus()
                    };
                s(0, i)
            }
        } catch {
            s(errMsg.PARAM_NOT_COMPLETE.code, errMsg.PARAM_NOT_COMPLETE.msg)
        }
    }
    async getAllAppStatus(e) {
        try {
            let s = [],
                t = this.appsBaseInfo;
            for (let p = 0; p < t.length; p++) {
                let i = t[p],
                    r = {
                        appId: i.getAppId(),
                        appStatus: i.getAppStatus(),
                        expectedAppStatus: i.getExpectedAppStatus()
                    };
                s.push(r)
            }
            e(0, s)
        } catch {
            e(errMsg.PARAM_NOT_COMPLETE.code, errMsg.PARAM_NOT_COMPLETE.msg)
        }
    }
    async delAppBase(e, s) {
        try {
            let t = this.findAppBaseById(e.appId);
            t < 0 ? s(errMsg.APP_NOT_EXITS.code, errMsg.APP_NOT_EXITS.msg) : (this.appsBaseInfo.splice(t, 1), this.updateDate = new Date, s(0, null), this.save())
        } catch {
            s(errMsg.PARAM_NOT_COMPLETE.code, errMsg.PARAM_NOT_COMPLETE.msg)
        }
    }
    loadAppBaseCfgs() {
        let e = fs.existsSync(appBaseCfgsDir),
            s = fs.readFileSync(appBaseCfgsDir).toString("utf-8"),
            t = "";
        if (s.length === 0) {
            t = appBaseCfgsDir + ": file data is not json data", console.error(t);
            return
        }
        let p = JSON.parse(s);
        if (util.isJSON(p) === !1) {
            t = appBaseCfgsDir + ": file data is not json data", console.error(t);
            return
        }
        if (p.hasOwnProperty("version") && (this.version = p.version), p.hasOwnProperty("createDate") && (this.createDate = p.createDate), p.hasOwnProperty("updateDate") && (this.updateDate = p.updateDate), p.hasOwnProperty("appsBaseInfo"))
            for (let r = 0; r < p.appsBaseInfo.length; ++r) {
                let o = p.appsBaseInfo[r],
                    n = new AppBaseModel;
                if (o.hasOwnProperty("appId")) n.setAppId(o.appId);
                else continue;
                o.hasOwnProperty("tenantId") && n.setTenantId(o.tenantId), o.hasOwnProperty("projectId") && n.setProjectId(o.projectId), o.hasOwnProperty("projectVersion") && n.setProjectVersion(o.projectVersion), o.hasOwnProperty("projectType") && n.setProjectType(o.projectType), o.hasOwnProperty("execFileName") && n.setExecFileName(o.execFileName), o.hasOwnProperty("execVersion") && n.setExecVersion(o.execVersion), o.hasOwnProperty("appName") && n.setAppName(o.appName), o.hasOwnProperty("port") && n.setPort(o.port), o.hasOwnProperty("wsPort") && n.setWsPort(o.wsPort), o.hasOwnProperty("appDescription") && n.setAppDescription(o.appDescription), o.hasOwnProperty("isLoadApp") && n.setIsLoadApp(o.isLoadApp), o.hasOwnProperty("appDeployStatus") && n.setAppDeployStatus(o.appDeployStatus), o.hasOwnProperty("appStatus") && n.setAppStatus(o.appStatus), o.hasOwnProperty("expectedAppStatus") && n.setExpectedAppStatus(o.expectedAppStatus), o.hasOwnProperty("solutionId") && n.setSolutionId(o.solutionId), o.hasOwnProperty("solutionName") && n.setSolutionName(o.solutionName), this.appsBaseInfo.push(n)
            }
    }
    load() {
        this.loadAppBaseCfgs()
    }
    save() {
        let e = this.appsBaseInfo;
        delete this.appsPerfInfo;
        let s = JSON.stringify(this);
        try {
            fs.writeFileSync(appBaseCfgsDir, s, "utf-8"), this.appsBaseInfo = e, fileBakup.backupByDetect()
        } catch (t) {
            logger.error(t);
            let p = this;
            fileBakup.setBackupFileToOriginFile().then(() => {})
        }
    }
    findAppBaseById(e) {
        let s = -1,
            t = !1;
        for (let p = 0; p < this.appsBaseInfo.length; ++p) {
            let i = this.appsBaseInfo[p],
                r = Object.getOwnPropertyNames(i);
            for (let o = 0; o < r.length; o++) {
                let n = r[o],
                    a = i[r[o]];
                if (n === "appId" && a === e) {
                    s = p, t = !0;
                    break
                }
            }
            if (t === !0) break
        }
        return s
    }
    findAppBaseByName(e) {
        let s = -1,
            t = !1;
        for (let p = 0; p < this.appsBaseInfo.length; ++p) {
            let i = this.appsBaseInfo[p],
                r = Object.getOwnPropertyNames(i);
            for (let o = 0; o < r.length; o++) {
                let n = r[o],
                    a = i[r[o]];
                if (n === "appName" && a === e) {
                    s = p, t = !0;
                    break
                }
            }
            if (t === !0) break
        }
        return s
    }
}
module.exports = new AppMngModel;