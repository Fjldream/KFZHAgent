const { myEvent, fileUtil } = require(__dir + "/core/utils");
// modified by jinlong.feng at 2026-10-19 计算脚本异常捕获
const { SCRIPT_TYPE, safeRunScript, reportScriptLoadError } = require(
    __dir + "/lib/service/globalScriptMng/scriptGuard.js",
);
// end
class customEventScript {
    constructor() {}
    init() {
        this.initCustomEvent(), (global.eventEmit = this.eventEmit);
    }
    vm_customEvent(t, e) {
        for (let n = 0; n < customEventdata.events.length; n++)
            if (customEventdata.events[n].event === t) {
                // modified by jinlong.feng at 2026-10-19 计算脚本异常捕获
                safeRunScript(
                    SCRIPT_TYPE.CUSTOM_EVENT,
                    customEventdata.events[n].event || customEventdata.events[n].file,
                    customEventdata.events[n].response,
                    [e],
                );
                // end
            }
    }
    initCustomEvent() {
        for (let t = 0; t < customEventdata.events.length; t++)
            try {
                (customEventdata.events[t].data = fileUtil.syncReadFile(
                    global.execProjectPath + "/" + customEventdata.events[t].file,
                    "utf-8",
                )),
                    (customEventdata.events[t].response = require(
                        global.execProjectPath + "/" + customEventdata.events[t].file,
                    )),
                    myEvent.onEvent(customEventdata.events[t].event, this.vm_customEvent);
            } catch (e) {
                // modified by jinlong.feng at 2026-10-19 计算脚本异常捕获
                reportScriptLoadError(
                    SCRIPT_TYPE.CUSTOM_EVENT,
                    customEventdata.events[t].event || customEventdata.events[t].file,
                    e,
                );
                customEventdata.events[t].response = null;
                // end
            }
    }
    eventEmit(t, e) {
        myEvent.emitEvent(t, [t, e]);
    }
}
module.exports = new customEventScript();
