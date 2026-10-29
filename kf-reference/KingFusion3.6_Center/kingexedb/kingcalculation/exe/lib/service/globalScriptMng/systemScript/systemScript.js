// modified by jinlong.feng at 2026-10-19 计算脚本异常捕获
const { SCRIPT_TYPE, safeRunScript } = require(__dir + "/lib/service/globalScriptMng/scriptGuard.js");
// end
class SystemScript {
    constructor() {
        this.endScriptFunc = null;
    }
    init(t, n) {
        // modified by jinlong.feng at 2026-10-19 计算脚本异常捕获
        // 现场版本在 init 阶段即执行一次"应用程序关闭时"脚本，原实现为裸调用 n()，
        // 脚本异常会冒泡打断脚本体系初始化并导致进程退出，这里改为边界捕获（返回值仍为 Promise，契约不变）
        this.vm_startSystemFunc(t),
            (this.endScriptFunc = safeRunScript(SCRIPT_TYPE.SYSTEM_END, "系统_应用程序关闭时", n));
        // end
    }
    vm_startSystemFunc(t) {
        // modified by jinlong.feng at 2026-10-19 计算脚本异常捕获
        safeRunScript(SCRIPT_TYPE.SYSTEM_START, "系统_应用程序启动时", t);
        // end
    }
    vm_endSystemFunc() {
        // modified by jinlong.feng at 2026-10-19 计算脚本异常捕获
        // 现场版本 init 阶段已执行一次关闭脚本（endScriptFunc 为其返回值），此处仅当仍为函数时才执行
        if (typeof this.endScriptFunc === "function") {
            safeRunScript(SCRIPT_TYPE.SYSTEM_END, "系统_应用程序关闭时", this.endScriptFunc);
        }
        // end
    }
}
module.exports = new SystemScript();
