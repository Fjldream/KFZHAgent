const { fileUtil, util } = require(__dir + "/core/utils");
// modified by jinlong.feng at 2026-10-19 计算脚本异常捕获
const { SCRIPT_TYPE, safeRunScript, reportScriptLoadError } = require(
    __dir + "/lib/service/globalScriptMng/scriptGuard.js",
);
// end
class conditionScript {
    constructor() {
        (this.interval = 50), (this.conditionMap = new Map()), (this.DBTagArray = []);
    }
    init() {
        for (let t = 0; t < conditionData.conditions.length; ++t)
            try {
                (conditionData.conditions[t].existFlag = !1),
                    (conditionData.conditions[t].existPriod = !1),
                    (conditionData.conditions[t].priodID = 0);
                var n = fileUtil.syncReadFile(execProjectPath + "/" + conditionData.conditions[t].exist, "utf-8");
                (conditionData.conditions[t].conditionExist =
                    `async function conditionExist(){
\r ` +
                    n +
                    `
\r};conditionExist();`),
                    (conditionData.conditions[t].conditionExistfunc = require(
                        execProjectPath + "/" + conditionData.conditions[t].exist,
                    ));
                var a = fileUtil.syncReadFile(execProjectPath + "/" + conditionData.conditions[t].in, "utf-8");
                (conditionData.conditions[t].conditionIn =
                    `async function conditionIn(){
\r ` +
                    a +
                    `
\r};conditionIn();`),
                    (conditionData.conditions[t].conditionInfunc = require(
                        execProjectPath + "/" + conditionData.conditions[t].in,
                    ));
                var e = fileUtil.syncReadFile(execProjectPath + "/" + conditionData.conditions[t].out, "utf-8");
                (conditionData.conditions[t].conditionOut =
                    `async function conditionOut(){
\r ` +
                    e +
                    `
\r};conditionOut();`),
                    (conditionData.conditions[t].conditionOutfunc = require(
                        execProjectPath + "/" + conditionData.conditions[t].out,
                    )),
                    this.getTagArrayFromExp(conditionData.conditions[t]),
                    this.conditionMap.set(
                        execProjectPath + "/" + conditionData.conditions[t].name,
                        conditionData.conditions[t],
                    );
            } catch (r) {
                // modified by jinlong.feng at 2026-10-19 计算脚本异常捕获
                reportScriptLoadError(
                    SCRIPT_TYPE.CONDITION,
                    conditionData.conditions[t].name ||
                        conditionData.conditions[t].out ||
                        conditionData.conditions[t].exist ||
                        "",
                    r,
                );
                conditionData.conditions[t].conditionExistfunc = null;
                conditionData.conditions[t].conditionInfunc = null;
                conditionData.conditions[t].conditionOutfunc = null;
                // end
            }
        setInterval(this.checkCondition, this.interval, this.conditionMap, this);
    }
    checkCondition(argconditionMap, self) {
        try {
            for (let item of argconditionMap.entries()) {
                var value = item[1];
                try {
                    (function (value) {
                        var dataSourceConnect = !0;
                        for (let i = 0; i < value.datasourcetag.length; i++) {
                            var element = value.datasourcetag[i],
                                ss = element.split(/\./),
                                strTemp = "(global." + ss[0] + ".connectState !== connectState.CONNET_STATE_CONNECTED)";
                            if (((strTemp += "||(" + element + "===undefined)"), eval(strTemp))) {
                                (dataSourceConnect = !1),
                                    clearInterval(value.priodID),
                                    (value.existPriod = !1),
                                    value.existFlag === !0 && ((value.existFlag = !1), self.vm_conditionOutFunc(value));
                                break;
                            } else dataSourceConnect = !0;
                        }
                        if (dataSourceConnect === !0)
                            if (eval(value.expression) === !0)
                                if (value.existFlag === !0 && value.existPriod === !1) {
                                    value.existPriod = !0;
                                    var unit = 1e3;
                                    (value.interval === void 0 || value.interval === 0) && (value.interval = 1),
                                        value.unit === "s"
                                            ? (unit = 1e3)
                                            : value.unit === "min"
                                              ? (unit = 6e4)
                                              : value.unit === "hour" && (unit = 36e5),
                                        (value.priodID = setInterval(function () {
                                            try {
                                                self.vm_conditionExistFunc(value);
                                            } catch (n) {
                                                // modified by jinlong.feng at 2026-10-19 计算脚本异常捕获
                                                logger.log(
                                                    "error",
                                                    "\u6761\u4EF6\u811A\u672C\u9519\u8BEF " +
                                                        value.conditionExist +
                                                        " " +
                                                        n +
                                                        `        
\r`,
                                                ),
                                                    logger.log("error", n);
                                                // end
                                            }
                                        }, value.interval * unit));
                                } else
                                    value.existFlag === !1 && ((value.existFlag = !0), self.vm_conditionInFunc(value));
                            else
                                eval(value.expression) === !1 &&
                                    value.existFlag === !0 &&
                                    ((value.existFlag = !1),
                                    (value.existPriod = !1),
                                    clearInterval(value.priodID),
                                    self.vm_conditionOutFunc(value));
                    })(value);
                } catch (n) {
                    // modified by jinlong.feng at 2026-10-19 计算脚本异常捕获
                    logger.log("error", `checkCondition ${value.name} error ` + n);
                    // end
                }
            }
        } catch (n) {
            // modified by jinlong.feng at 2026-10-19 计算脚本异常捕获
            logger.log("error", "checkCondition error " + n);
            // end
        }
    }
    getTagArrayFromExp(n) {
        try {
            var a = new Array(),
                e = n.expression;
            e = e.trim();
            var f = [],
                t = e.split(/\(|\)|&|\|/);
            for (let o = 0; o < t.length; o++) {
                var r = t[o].toUpperCase();
                if (r.indexOf("NOTLIKE") !== -1) {
                    var l = r.indexOf("NOTLIKE"),
                        s = t[o].slice(0, l),
                        u = t[o].slice(l + 7),
                        d = "NOTLIKE(" + s + "," + u + ")";
                    (e = e.replace(t[o], d)), a.push(s), a.push(u);
                } else if (r.indexOf("LIKE") !== -1) {
                    var l = r.indexOf("LIKE"),
                        s = t[o].slice(0, l),
                        u = t[o].slice(l + 4),
                        d = "LIKE(" + s + "," + u + ")";
                    (e = e.replace(t[o], d)), a.push(s), a.push(u);
                } else for (var g = t[o].split(/\(|\)|>|<|==|=|!|&|\|/), v = 0; v < g.length; v++) a.push(g[v]);
            }
            var f = [];
            for (let o = 0; o < a.length; o++) {
                var c = a[o];
                if (((c = c.trim()), c.length != 0 && util.isNumber(c) == !1)) {
                    var p = /\./,
                        D = p.test(c);
                    if (D == !0) {
                        var h = {};
                        (h = appAllInfo.isDataAccess(c)), h === !0 && (this.DBTagArray.push(c), f.push(c));
                    }
                }
            }
            (n.expression = e), (n.datasourcetag = f);
        } catch (o) {
            logger.log("debug", o.message);
        }
    }
    vm_conditionInFunc(n) {
        // modified by jinlong.feng at 2026-10-19 计算脚本异常捕获
        safeRunScript(SCRIPT_TYPE.CONDITION, (n.name || "") + "-进入条件", n.conditionInfunc);
        // end
    }
    vm_conditionExistFunc(n) {
        // modified by jinlong.feng at 2026-10-19 计算脚本异常捕获
        safeRunScript(SCRIPT_TYPE.CONDITION, (n.name || "") + "-条件存在", n.conditionExistfunc);
        // end
    }
    vm_conditionOutFunc(n) {
        // modified by jinlong.feng at 2026-10-19 计算脚本异常捕获
        safeRunScript(SCRIPT_TYPE.CONDITION, (n.name || "") + "-退出条件", n.conditionOutfunc);
        // end
    }
}
module.exports = new conditionScript();
