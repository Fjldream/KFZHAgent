const { fileUtil } = require(__dir + "/core/utils");
// modified by jinlong.feng at 2026-10-19 计算脚本异常捕获
const { SCRIPT_TYPE, reportScriptLoadError } = require(__dir + "/lib/service/globalScriptMng/scriptGuard.js");
// end
class customFunction {
    constructor() {}
    init() {
        this.initCustomFunc();
    }
    initCustomFunc() {
        for (let i = 0; i < customFuncdata.functions.length; i++)
            try {
                customFuncdata.functions[i].data = fileUtil.syncReadFile(
                    global.execProjectPath + "/" + customFuncdata.functions[i].file,
                    "utf-8",
                );
                let string = customFuncdata.functions[i].data,
                    reg = / await /,
                    strCunstomFunction = "";
                reg.test(string) === !0
                    ? (strCunstomFunction =
                          "async function " +
                          customFuncdata.functions[i].expression +
                          `{
\r` +
                          customFuncdata.functions[i].data +
                          `
\r}`)
                    : (strCunstomFunction =
                          "function " +
                          customFuncdata.functions[i].expression +
                          `{
\r` +
                          customFuncdata.functions[i].data +
                          `
\r}`);
                var rpath = require(global.execProjectPath + "/" + customFuncdata.functions[i].file),
                    strTTT = "global." + customFuncdata.functions[i].functionName + " = rpath;";
                eval(strTTT);
            } catch (t) {
                // modified by jinlong.feng at 2026-10-19 计算脚本异常捕获
                reportScriptLoadError(
                    SCRIPT_TYPE.CUSTOM_FUNCTION,
                    customFuncdata.functions[i].functionName || customFuncdata.functions[i].file,
                    t,
                );
                // end
            }
    }
}
module.exports = new customFunction();
