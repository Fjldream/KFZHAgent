"use strict";
module.exports = () => {
    const { myEvent: c } = require(__dir + "/core/utils"),
        r = require(__dir + "/lib/service/globalScriptMng/dataChangeEventScript/dataChangeScript.js"),
        e = require(__dir + "/lib/service/globalScriptMng/periodicScript/periodScript.js"),
        n = require(__dir + "/lib/service/globalScriptMng/customFunction/customFunction.js"),
        o = require(__dir + "/lib/service/globalScriptMng/customEventScript/customEventScript.js"),
        s = require(__dir + "/lib/service/globalScriptMng/systemScript/systemScript.js"),
        l = require(__dir + "/lib/service/globalScriptMng/conditionEventScript/condition_script.js"),
        u = require(__dir + "/lib/service/globalScriptMng/onDemandCalcScript/onDemandCalcScript.js");
    // modified by jinlong.feng at 2026-10-19 计算脚本异常捕获
    const { SCRIPT_TYPE, safeRunScript, reportScriptLoadError } = require(__dir + "/lib/service/globalScriptMng/scriptGuard.js");
    // end
    c.onEvent("globalchange", function (i) {
        if (i.func !== void 0 && i.func != null)
            for (let t = 0; t < i.func.length; t++) {
                let S = i.func[t];
                // modified by jinlong.feng at 2026-10-19 计算脚本异常捕获
                safeRunScript(SCRIPT_TYPE.DATA_CHANGE, (i.name || "") + "-数据变化", S, ["Global"]);
                // end
            }
    });
    // modified by jinlong.feng at 2026-10-19 计算脚本异常捕获
    // 系统脚本加载失败时不能中断脚本体系初始化，单独隔离
    let p = null,
        a = null;
    try {
        p = require(execProjectPath + "/\u7CFB\u7EDF_\u5E94\u7528\u7A0B\u5E8F\u542F\u52A8\u65F6.js");
    } catch (startErr) {
        reportScriptLoadError(SCRIPT_TYPE.SYSTEM_START, "\u7CFB\u7EDF_\u5E94\u7528\u7A0B\u5E8F\u542F\u52A8\u65F6", startErr);
    }
    try {
        a = require(execProjectPath + "/\u7CFB\u7EDF_\u5E94\u7528\u7A0B\u5E8F\u5173\u95ED\u65F6.js");
    } catch (endErr) {
        reportScriptLoadError(SCRIPT_TYPE.SYSTEM_END, "\u7CFB\u7EDF_\u5E94\u7528\u7A0B\u5E8F\u5173\u95ED\u65F6", endErr);
    }
    // end
    // 保持现场初始化顺序：自定义函数 → 系统脚本 → 数据变化 → 周期 → 自定义事件 → 条件 → 请求式
    n.init(), s.init(p, a), r.init(), e.init(), o.init(), l.init(), u.init();
};
