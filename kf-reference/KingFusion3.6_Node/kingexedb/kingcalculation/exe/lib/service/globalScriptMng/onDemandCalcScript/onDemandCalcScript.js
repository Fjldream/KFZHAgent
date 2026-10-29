const { fileUtil } = require(__dir + "/core/utils");
// modified by jinlong.feng at 2026-10-19 计算脚本异常捕获
const { SCRIPT_TYPE, safeRunScript, reportScriptLoadError } = require(
    __dir + "/lib/service/globalScriptMng/scriptGuard.js",
);
// end
class OnDemandCalcScript {
    constructor() {
        this.RestfulMap = new Map();
    }
    init() {
        (global.endResponse = this.endResponse), (global.activeMap = new Map());
        for (let e = 0; e < RESTfulAPIdata.APIs.length; e++) {
            let n = "/" + RESTfulAPIdata.APIs[e].name,
                t = {};
            (t.filename = execProjectPath + "/" + RESTfulAPIdata.APIs[e].file),
                (t.context = fileUtil.syncReadFile(t.filename, "utf8"));
            try {
                appLogger.system.info("\u521D\u59CB\u5316\u8BF7\u6C42\u5F0F\u8BA1\u7B97\u811A\u672C", {
                    ip: global.appLoggerConf.ip,
                    user: global.appLoggerConf.user,
                    tenantId: global.appLoggerConf.tenanatId,
                    context: "\u521D\u59CB\u5316\u8BF7\u6C42\u5F0F\u8BA1\u7B97\u811A\u672C",
                    addon: { name: RESTfulAPIdata.APIs[e].name },
                }),
                    (t.func = require(t.filename));
            } catch (o) {
                // modified by jinlong.feng at 2026-10-19 计算脚本异常捕获
                reportScriptLoadError(
                    SCRIPT_TYPE.REST_API,
                    RESTfulAPIdata.APIs[e].name || RESTfulAPIdata.APIs[e].file,
                    o,
                );
                // end
                continue;
            }
            this.RestfulMap.set(n, t);
        }
    }
    vm_RESTAPI(e, n, t, o, a) {
        // modified by jinlong.feng at 2026-10-19 计算脚本异常捕获
        // 原实现按 "请求式计算" 关键字截取脚本名，实际文件路径不含该字样，会截出绝对路径残段，改为相对工程目录
        let r = e.filename.indexOf(execProjectPath) === 0 ? e.filename.substr(execProjectPath.length + 1) : e.filename;
        // end
        appLogger.script.info("\u6267\u884C\u8BF7\u6C42\u65F6\u8BA1\u7B97\u811A\u672C", {
            ip: global.appLoggerConf.ip,
            user: global.appLoggerConf.user,
            tenantId: global.appLoggerConf.tenanatId,
            context: "\u6267\u884C\u8BF7\u6C42\u65F6\u8BA1\u7B97\u811A\u672C",
            addon: { name: r, InParam: n },
        }),
            // modified by jinlong.feng at 2026-10-19 计算脚本异常捕获
            safeRunScript(SCRIPT_TYPE.REST_API, r, e.func, [n, t, o, a]),
            // end
            /endResponse/.test(e.context) !== !0 && endResponse(o);
    }
    endResponse(e) {
        try {
            e === void 0 && logger.log("debug", "endResponse param error!");
            let n = activeMap.get(e);
            if (n !== void 0) {
                let t = JSON.stringify(n.in_jsonobj.yk_OutParam, null, 2);
                n.res.writeHead(200, { "Content-Type": "text/plain; charset=UTF-8" }),
                    n.res.write(t),
                    n.res.end(),
                    activeMap.delete(e);
            }
        } catch (n) {
            logger.log("debug", "endResponse error:" + n.message);
        }
    }
}
module.exports = new OnDemandCalcScript();
