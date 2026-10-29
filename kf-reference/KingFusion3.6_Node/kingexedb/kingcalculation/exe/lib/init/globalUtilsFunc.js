"use strict";
module.exports = () => {
  const { DATASOURCEMESSAGE } = require(__dir + "/core/enums").enumCode,
    { fileUtil } = require(__dir + "/core/utils"),
    reg_input =
      /\'|\"|\>|and|exec|insert|select|delete|update|count|\*|chr|mid|master|truncate|char|declare|script|frame|or|\)|etc|style|expression/gi;
  ((global.checkArg = function (a, r) {
    if (a.length < r.length) return DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM;
    for (let l = 0; l < a.length; ++l) if (typeof a[l] !== r[l]) return DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM;
    return DATASOURCEMESSAGE.DATA_SOURCE_SUCCESS;
  }),
    (global.readJSONFile = function (a, r) {
      try {
        var l = fileUtil.syncReadFile(a, "utf-8");
        if (l === void 0) {
          (logger.log("debug", "Not found setting! " + a), (r = !1));
          return;
        } else {
          try {
            var n = JSON.parse(l.toString());
          } catch (i) {
            (logger.log("fatal", "parse file\uFF1A" + a + " failed,please check"), logger.log("fatal", i));
            return;
          }
          if (n === void 0) {
            (logger.log("debug", "Not JSON type! " + a), (r = !1));
            return;
          }
          return n;
        }
      } catch (i) {
        (logger.log("fatal", a + " readJSONFile catch error! "), logger.log("fatal", i));
      }
    }),
    (global.getInvalidScripts = function (a) {
      var r = a;
      a = JSON.stringify(a);
      var l = new Array(),
        n = a.indexOf('"'),
        i = a.indexOf('"', 2),
        e = a.substring(n + 1, i);
      for (let s = 0; s < r[e].length; s++) r[e][s].whetherenable === "\u662F" && l.push(r[e][s]);
      var t = {};
      return ((t[e] = l), t);
    }),
    (global.convertNameToRegExp = function (name) {
      var str = name.replace(/\*/g, ".{0,}").replace(/\?/g, ".{1}"),
        reString = "re = /^" + str + "$/";
      return (eval(reString), re);
    }),
    (global.generateUUID = function () {
      var a = new Date().getTime(),
        r = "cxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (l) {
          var n = ((a + Math.random() * 16) % 16) | 0;
          return ((a = Math.floor(a / 16)), (l == "x" ? n : (n & 3) | 8).toString(16));
        });
      return r;
    }),
    (global.trim = function (a) {
      return a.replace(/\s*/g, "");
    }),
    (global.inputFilter = function (a) {
      var r = escape(a),
        l = unescape(r),
        n = l.match(reg_input),
        i = { errorCode: 0, message: "\u53C2\u6570\u5B89\u5168" };
      if (n && n.length > 0) {
        i.errorCode = -1;
        for (var e = n[0], t = 1; t < n.length; t++) e = `${e}|${n[t]}`;
        i.message = `\u53C2\u6570\u4E2D\u542B\u6709${e}`;
      }
      return i;
    }),
    (global.paramOrg = function (a) {
      for (let x = 0; x < a.length; x++) {
        var r = a[x];
        if (((r.expression = r.expression.replace(/\s+/g, "")), r.expression)) {
          var l = !1,
            n = "",
            i = "";
          for (let f = 0; f < r.expression.length; ++f) {
            var e = r.expression.charAt(f);
            if (e == "@") {
              if (l === !0) return ((r.scr = ""), (r.res = !1), !1);
              l = !0;
            } else if (
              e == "." ||
              e == "!" ||
              e == "=" ||
              e == "&" ||
              e == "|" ||
              e == ">" ||
              e == "<" ||
              e == "(" ||
              e == ")"
            )
              if (l == !0) {
                l = !1;
                var t = i;
                i = "";
                var s = "",
                  g = !1;
                if (g === !0) ((n += s), (n += e));
                else return ((r.scr = ""), (r.res = !1), !1);
              } else n += e;
            else if (f == r.expression.length - 1)
              if (l == !0) {
                ((l = !1), (i += e));
                var t = i;
                i = "";
                var s = "",
                  g = !1;
                g === !0 ? (n += s) : ((r.scr = ""), (r.res = !1));
              } else n += e;
            else if (e == "n" || e == "N" || e == "l" || e == "L") {
              var u = r.expression.slice(f, f + 7);
              u = u.toUpperCase();
              var o = r.expression.slice(f, f + 4);
              if (((o = o.toUpperCase()), u === "NOTLIKE" || o === "LIKE"))
                if (l == !0) {
                  l = !1;
                  var t = i;
                  i = "";
                  var s = "",
                    g = !1;
                  if (g === !0) ((n += s), (n += e));
                  else return ((r.scr = ""), (r.res = !1), !1);
                } else n += e;
              else l === !0 ? (i += e) : (n += e);
            } else l === !0 ? (i += e) : (n += e);
          }
          r.expression = n;
        }
      }
    }),
    (global.Trace = function (a) {
      // modified by jinlong.feng at 2026-10-20 脚本日志文件分离
      // Trace 改为落脚本日志文件 script.YYYY-MM-DD.log，不再混入 system 日志文件；
      // 保留 typeof 判断：仅升级 calculation 未升级 common/log-utils 时回落 system 日志，避免调用未定义方法抛异常
      (typeof logger.logScript === "function" ? logger.logScript("trace", a) : logger.log("info", a),
        appLogger.script.info("Trace\u65E5\u5FD7", {
          ip: global.appLoggerConf.ip,
          user: global.appLoggerConf.user,
          tenantId: global.appLoggerConf.tenanatId,
          context: a,
          addon: {},
        }));
      // end
    }),
    (global.getDataInfo = function (a) {
      let r = null;
      for (let l = 0; l < dataInfoAll.length; l++)
        if (dataInfoAll[l].name == a) {
          r = dataInfoAll[l];
          break;
        }
      return r;
    }));
};
