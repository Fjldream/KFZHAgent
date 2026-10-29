const winston = require("winston"),
  { format } = winston,
  { combine, timestamp, printf } = format,
  path = require("path");
require("winston-daily-rotate-file");
class LoggerInstance {
  constructor() {
    ((this.logger = void 0),
      (this.logPath = ""),
      (this.myFormat = printf(
        ({ timestamp: t, level: e, message: s, ...r }) =>
          `${t} ${e} ${typeof s == "object" ? JSON.stringify(s) : s} ${Object.keys(r).length > 0 ? JSON.stringify(r) : ""}`,
      )),
      (this.customLevels = {
        levels: { error: 0, warn: 1, info: 2, http: 3, verbose: 4, debug: 5, silly: 6, fatal: 0, trace: 4 },
        colors: { fatal: "red", trace: "green" },
      }));
    // modified by jinlong.feng at 2026-10-20 脚本日志文件分离
    this.scriptLogger = void 0;
    this.numBackups = 10;
    // end
  }
  init(t, e) {
    ((this.logPath = path.join(t, "/log/")),
      (this.logger = winston.createLogger({
        levels: this.customLevels.levels,
        level: (e == null ? void 0 : e.level) || "info",
        format: combine(timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }), this.myFormat),
        transports: [
          new winston.transports.Console({
            level: "debug",
            format: combine(format.colorize(), format.simple(), this.myFormat),
          }),
          new winston.transports.DailyRotateFile({
            filename: "system.%DATE%.log",
            dirname: this.logPath,
            maxsize: "10m",
            maxFiles: (e == null ? void 0 : e.numBackups) || 10,
            zippedArchive: !0,
            datePattern: "YYYY-MM-DD",
            auditFile: process.platform === "win32" ? "\\\\.\\NULL" : "/dev/null",
          }),
        ],
      })),
      winston.addColors(this.customLevels.colors));
    // modified by jinlong.feng at 2026-10-20 脚本日志文件分离
    this.numBackups = (e == null ? void 0 : e.numBackups) || 10;
    // end
  }
  log(t, e) {
    this.logger.log({ level: t, message: e });
  }
  // modified by jinlong.feng at 2026-10-20 脚本日志文件分离
  // 脚本日志（用户脚本的 Trace 等调试输出）单独落 script.YYYY-MM-DD.log，不再混入 system 日志文件。
  // 1) 惰性创建：只有真正调用 logScript 的进程才会生成该文件，不改动其它服务的日志目录布局
  // 2) 独立 logger 实例：transport 级别不受 system logger 的 level 阈值限制，trace/verbose 也能落盘
  logScript(t, e) {
    try {
      if (!this.logPath) {
        return;
      }
      if (!this.scriptLogger) {
        this.scriptLogger = winston.createLogger({
          levels: this.customLevels.levels,
          level: "silly",
          format: combine(timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }), this.myFormat),
          transports: [
            new winston.transports.Console({
              level: "debug",
              format: combine(format.colorize(), format.simple(), this.myFormat),
            }),
            new winston.transports.DailyRotateFile({
              filename: "script.%DATE%.log",
              dirname: this.logPath,
              maxsize: "10m",
              maxFiles: this.numBackups,
              zippedArchive: !0,
              datePattern: "YYYY-MM-DD",
              auditFile: process.platform === "win32" ? "\\\\.\\NULL" : "/dev/null",
            }),
          ],
        });
      }
      this.scriptLogger.log({ level: t, message: e });
    } catch (err) {
      // 脚本日志写入失败不允许影响主流程
    }
  }
  // end
}
((LoggerInstance.instance = null),
  (LoggerInstance.getInstance = function () {
    return (this.instance || (this.instance = new LoggerInstance()), this.instance);
  }),
  (module.exports = LoggerInstance));
