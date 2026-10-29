"use strict";
module.exports = () => {
    process.on("uncaughtException", function (o) {
        // modified by jinlong.feng at 2026-10-19 计算脚本异常捕获
        logger.log("error", `uncaughtException, ${o}`);
        // end
        logger.log("fatal", o.stack),
            o.code === "EADDRINUSE"
                ? setTimeout(function () {
                      process.exit(-1);
                  }, 100)
                : process.exit(1);
    }),
        process.on("unhandledRejection", (o, r) => {
            // modified by jinlong.feng at 2026-10-19 计算脚本异常捕获
            // 仅记录日志，不再退出进程：脚本未被边界捕获的 rejection 不应拖垮运行态
            logger.log("error", `Unhandled rejection: ${r}, reason: ${o}`);
            // end
        }),
        process.on("exit", (o) => {
            require(__dir + "/lib/service/globalScriptMng/systemScript/systemScript.js").vm_endSystemFunc();
            for (let e = 0; e < ksArray.length; e++) {
                var t = ksArray[e];
                typeof t == "object" && t.KSDisconnectServer();
            }
            for (let e = 0; e < kvArray.length; e++) {
                var t = kvArray[e];
                typeof t == "object" && t.KVDisconnectServer();
            }
            for (let e = 0; e < khArray.length; e++) {
                var t = khArray[e];
                typeof t == "object" && t.pool == "false" && t.KHDisconnectServer();
            }
            logger.log("debug", `The process is about to exit, exit code: ${o}`);
        });
};
