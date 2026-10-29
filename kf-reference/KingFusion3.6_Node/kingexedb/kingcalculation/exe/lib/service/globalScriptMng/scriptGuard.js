"use strict";
// modified by jinlong.feng at 2026-10-19 计算脚本异常捕获
/**
 * 计算脚本统一防护模块
 * 职责：
 *   1. 加载期：脚本 require 失败（语法错误 / 模块顶层异常）时统一上报，标记失效，不牵连同类其他脚本
 *   2. 执行期：在脚本调用边界捕获异常，带脚本类型、脚本名、错误栈落到系统日志（文件 system.*.log + sqlite 系统日志表）
 * 约束：
 *   - 运行态 Node 版本可能为 10.x，禁止使用可选链(?.)、空值合并(??)、String.prototype.matchAll 等高版本语法
 *   - 本模块只做观测，不改变脚本原有执行语义与返回值
 *   - 日志写入自身必须绝对安全，任何异常都不能冒泡到脚本执行链路
 */
var SCRIPT_TYPE = {
    PERIOD: "周期脚本",
    CONDITION: "条件脚本",
    CUSTOM_EVENT: "自定义事件脚本",
    REST_API: "请求式计算脚本",
    DATA_CHANGE: "数据变化脚本",
    SYSTEM_START: "系统脚本-启动",
    SYSTEM_END: "系统脚本-关闭",
    CUSTOM_FUNCTION: "自定义函数",
};

function buildErrorAddon(scriptType, scriptName, err, extraInfo) {
    var addon = {
        scriptType: scriptType || "",
        scriptName: scriptName || "",
        errorName: err && err.name ? err.name : typeof err,
        errorMessage: err && err.message ? err.message : String(err),
        errorStack: err && err.stack ? String(err.stack).substring(0, 2000) : "",
        occurTime: new Date().toISOString(),
    };
    if (extraInfo && typeof extraInfo === "object") {
        for (var key in extraInfo) {
            if (Object.prototype.hasOwnProperty.call(extraInfo, key)) {
                addon[key] = extraInfo[key];
            }
        }
    }
    return addon;
}

// 入库字段白名单：日志表只存"哪个脚本 + 什么错误"，堆栈与绝对路径不落库，避免日志表膨胀
var DB_ADDON_FIELDS = ["scriptType", "scriptName", "errorName", "errorMessage", "phase"];

function buildDbAddon(addon) {
    var dbAddon = {};
    if (!addon || typeof addon !== "object") {
        return dbAddon;
    }
    for (var i = 0; i < DB_ADDON_FIELDS.length; i++) {
        var key = DB_ADDON_FIELDS[i];
        if (Object.prototype.hasOwnProperty.call(addon, key)) {
            dbAddon[key] = addon[key];
        }
    }
    return dbAddon;
}

function writeScriptLog(level, message, addon) {
    // 通道一：sqlite 系统日志表（appLogger.system，前端"系统日志"可查）。只写精简字段，不写 errorStack
    // 说明：脚本异常属于平台侧异常，归入"系统日志"分类（type=system），不占用用户脚本的业务日志分类
    try {
        if (
            typeof appLogger !== "undefined" &&
            appLogger &&
            appLogger.system &&
            typeof appLogger.system[level] === "function"
        ) {
            var loggerConf =
                typeof global.appLoggerConf !== "undefined" && global.appLoggerConf ? global.appLoggerConf : {};
            appLogger.system[level](message, {
                ip: loggerConf.ip || "",
                user: loggerConf.user || "",
                tenantId: loggerConf.tenanatId || "",
                context: message,
                addon: buildDbAddon(addon),
            });
        }
    } catch (logErr) {
        // 日志写入失败不允许影响主流程
    }
    // 通道二：进程日志文件（sdb/logs/<APP>/log/system.YYYY-MM-DD.log），保留完整堆栈便于定位文件与行号。
    // 两个通道去向不同、内容不同，不能相互替代：appLogger 的 transport 是 Console+SQLite，不写 sdb 日志文件
    try {
        if (typeof logger !== "undefined" && logger && typeof logger.log === "function") {
            logger.log(level, message + " " + JSON.stringify(addon));
        }
    } catch (logErr) {
        // 同上
    }
}

function reportScriptLoadError(scriptType, scriptName, err) {
    var addon = buildErrorAddon(scriptType, scriptName, err, { phase: "load" });
    writeScriptLog("error", scriptType + "[" + scriptName + "] 加载失败(语法错误或模块异常)", addon);
    return addon;
}

function safeRunScript(scriptType, scriptName, scriptFunc, args) {
    // 未加载成功（语法错误等）的脚本，调用点直接跳过，避免反复抛 TypeError
    if (typeof scriptFunc !== "function") {
        writeScriptLog(
            "error",
            scriptType + "[" + scriptName + "] 脚本未成功加载，本次执行已跳过",
            buildErrorAddon(scriptType, scriptName, new Error("script function is not available"), { phase: "run" }),
        );
        return Promise.resolve();
    }
    var runResult;
    try {
        if (Array.isArray(args)) {
            runResult = scriptFunc.apply(null, args);
        } else {
            runResult = scriptFunc();
        }
    } catch (syncErr) {
        // 兜底：脚本未被 async 包装时，同步异常在此捕获
        writeScriptLog(
            "error",
            scriptType + "[" + scriptName + "] 执行异常",
            buildErrorAddon(scriptType, scriptName, syncErr, { phase: "run" }),
        );
        return Promise.resolve();
    }
    // 工程脚本均被包装为 async function，异常以 rejected Promise 形式抛出，在此统一捕获
    return Promise.resolve(runResult).catch(function (asyncErr) {
        writeScriptLog(
            "error",
            scriptType + "[" + scriptName + "] 执行异常",
            buildErrorAddon(scriptType, scriptName, asyncErr, { phase: "run" }),
        );
    });
}

module.exports = {
    SCRIPT_TYPE: SCRIPT_TYPE,
    safeRunScript: safeRunScript,
    reportScriptLoadError: reportScriptLoadError,
    writeScriptLog: writeScriptLog,
};
// end
