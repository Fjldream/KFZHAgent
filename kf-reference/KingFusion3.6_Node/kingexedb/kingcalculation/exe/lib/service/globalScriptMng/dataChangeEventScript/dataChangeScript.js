const { myEvent, fileUtil } = require(__dir + "/core/utils"),
    { DATACHANGESCRIPT } = require(__dir + "/core/enums").enumMsg;
// modified by jinlong.feng at 2026-10-19 计算脚本异常捕获
const { SCRIPT_TYPE, reportScriptLoadError } = require(__dir + "/lib/service/globalScriptMng/scriptGuard.js");
// end
class DataChangeScript {
    constructor() {
        this.subVarArray = [];
    }
    init() {
        try {
            global.paramOrg(dataChangedata.dataChanges), this.parseName_Ex(), this.globalvavchange();
        } catch (r) {
            // modified by jinlong.feng at 2026-10-19 计算脚本异常捕获
            reportScriptLoadError(SCRIPT_TYPE.DATA_CHANGE, "数据变化脚本初始化", r);
            // end
        }
    }
    parseName_Ex() {
        for (let a = 0; a < dataChangedata.dataChanges.length; a++) {
            // modified by jinlong.feng at 2026-10-19 计算脚本异常捕获
            try {
                // end
                const n = dataChangedata.dataChanges[a].expression;
                if (n.indexOf(".") === -1) {
                    if (n.indexOf("*") === -1 && n.indexOf("?") === -1) continue;
                    let l = this.convertNameToRegExp(n);
                    for (let e = 0; e < globalVar.globalVars.length; e++) {
                        const t = globalVar.globalVars[e].name;
                        if (l.test(t)) {
                            let i =
                                `async function AAA(InParam){
\r` +
                                fileUtil.syncReadFile(
                                    execProjectPath + "/" + dataChangedata.dataChanges[a].file,
                                    "utf-8",
                                ) +
                                `
\r};AAA(InParam);`;
                            (globalVar.globalVars[e].exeCode =
                                globalVar.globalVars[e].exeCode === void 0 ? [] : globalVar.globalVars[e].exeCode),
                                globalVar.globalVars[e].exeCode.push(i);
                            let g = require(execProjectPath + "/" + dataChangedata.dataChanges[a].file);
                            (globalVar.globalVars[e].func =
                                globalVar.globalVars[e].func === void 0 ? [] : globalVar.globalVars[e].func),
                                globalVar.globalVars[e].func.push(g);
                        }
                    }
                } else {
                    let e = /\./.test(n),
                        t = dataChangedata.dataChanges[a];
                    if (e == !0) {
                        let o = {};
                        if (((o = appAllInfo.isDataAccess(t.expression)), o === !0)) {
                            var r = {};
                            (r.name = t.name),
                                (r.expression = t.expression),
                                (r.file = t.file),
                                (r.exeCode =
                                    `async function AAA(InParam){
\r` +
                                    syncReadFile(execProjectPath + "/" + t.file, "utf-8") +
                                    `
\r};AAA(InParam);`),
                                (r.func = require(execProjectPath + "/" + t.file)),
                                this.subVarArray.push(r);
                        }
                    }
                }
                // modified by jinlong.feng at 2026-10-19 计算脚本异常捕获
            } catch (parseErr) {
                reportScriptLoadError(
                    SCRIPT_TYPE.DATA_CHANGE,
                    dataChangedata.dataChanges[a].name || dataChangedata.dataChanges[a].file,
                    parseErr,
                );
            }
            // end
        }
    }
    globalvavchange() {
        for (let r = 0; r < dataChangedata.dataChanges.length; r++) {
            let a = dataChangedata.dataChanges[r];
            for (let n = 0; n < globalVar.globalVars.length; n++)
                try {
                    let l = globalVar.globalVars[n];
                    if (l.name != a.expression && `global.${l.name}` != a.expression) continue;
                    if (
                        (l.hasOwnProperty("file") ? l.file.push(a.file) : (l.file = [a.file]), l.hasOwnProperty("func"))
                    ) {
                        let e = require(execProjectPath + "/" + a.file);
                        l.func.push(e);
                    } else {
                        let e = require(execProjectPath + "/" + a.file);
                        l.func = [e];
                    }
                    (function (e) {
                        Object.defineProperty(global, e.name, {
                            configurable: !0,
                            get: () => e.value,
                            set: (t) => {
                                e.value !== t && ((e.value = t), myEvent.emitEvent("globalchange", [e]));
                            },
                        });
                    })(l);
                } catch (l) {
                    // modified by jinlong.feng at 2026-10-19 计算脚本异常捕获
                    reportScriptLoadError(SCRIPT_TYPE.DATA_CHANGE, a.name || a.file, l);
                    // end
                }
        }
    }
    convertNameToRegExp(name) {
        let re,
            str = name.replace(/\*/g, ".{0,}").replace(/\?/g, ".{1}"),
            reString = "re = /^" + str + "$/";
        return eval(reString), re;
    }
}
module.exports = new DataChangeScript();
