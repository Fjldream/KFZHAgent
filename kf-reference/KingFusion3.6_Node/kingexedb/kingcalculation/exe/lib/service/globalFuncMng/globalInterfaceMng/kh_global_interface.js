const khManger = require("../../dataSourceMng/kh_manger.js"),
  { DATASOURCEMESSAGE } = require(__dir + "/core/enums").enumCode;
class khGlobalInterface {
  async KHAddDatas(a, n, g, u) {
    try {
      if (arguments.length !== 3 && arguments.length !== 4)
        return (
          logger.log("debug", "KHAddDatas arguments number error"),
          DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM
        );
      if (typeof a != "string")
        return (
          logger.log("debug", "KHAddDatas dataSourceName not String"),
          DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM
        );
      if (a == "")
        return (
          logger.log("debug", "KHAddDatas dataSourceName empty"),
          DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM
        );
      if (Object.prototype.toString.call(n) != "[object Object]")
        return (
          logger.log("debug", "KHAddDatas dataJson not object"),
          DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM
        );
      for (var A in n) {
        var e = n[A];
        if (
          Object.prototype.toString.call(e) != "[object Array]" ||
          !(e instanceof Array)
        )
          return (
            logger.log("debug", "KHAddDatas objects in dataJson not Array"),
            DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM
          );
        if (e.length == 0)
          return (
            logger.log("debug", "KHAddDatas objects in dataJson empty"),
            DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM
          );
        for (var r = 0; r < e.length; r++) {
          if (
            e[r].DataValue === void 0 ||
            e[r].TimeStamp === void 0 ||
            e[r].QualityStamp === void 0
          )
            return (
              logger.log("debug", "KHAddDatas objects in dataJson invalid"),
              DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM
            );
          if (
            typeof e[r].TimeStamp != "string" ||
            e[r].TimeStamp === "" ||
            typeof e[r].QualityStamp != "string" ||
            e[r].QualityStamp === ""
          )
            return (
              logger.log(
                "debug",
                "KHAddDatas objects TimeStamp or QualityStamp in dataJson not string or empty",
              ),
              DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM
            );
          for (var t in e[r]) {
            if (
              t != "DataValue" &&
              t != "TimeStamp" &&
              t != "QualityStamp" &&
              t != "DataType" &&
              t != "DataLength"
            )
              return (
                logger.log("debug", "KHAddDatas objects in dataJson invalid"),
                DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM
              );
            if (
              typeof e[r].DataValue != typeof e[0].DataValue ||
              (t === "DataType" && typeof e[r][t] != "number")
            )
              return (
                logger.log(
                  "debug",
                  "KHAddDatas objects DataType in dataJson invalid",
                ),
                DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM
              );
            if (
              t === "DataLength" &&
              (typeof e[r][t] != "number" ||
                (e[r].DataType !== 10 &&
                  e[r].DataType !== 11 &&
                  e[r].DataType !== 13 &&
                  e[r].DataType !== 14))
            )
              return (
                logger.log(
                  "debug",
                  "KHAddDatas objects DataLength in dataJson invalid",
                ),
                DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM
              );
          }
        }
      }
      return g instanceof Array
        ? await khManger.KHAddDatas(a, n, g, u)
        : (logger.log("debug", "KHAddDatas errorCodes not Array"),
          DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM);
    } catch (R) {
      return (logger.log("debug", R), DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM);
    }
  }
  async KHQueryRawDatas(a, n, g, u, A, e, r, t, R) {
    try {
      return arguments.length !== 9 && arguments.length !== 8
        ? (logger.log("debug", "KHQueryRawDatas arguments number error"),
          DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM)
        : r !== 1 && r !== 0
          ? (logger.log("debug", "KHQueryRawDatas dataQuality invalid"),
            DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM)
          : typeof a != "string" || typeof u != "string" || typeof g != "string"
            ? (logger.log(
                "debug",
                "KHQueryRawDatas dataSourceName, startTime or endTime not String",
              ),
              DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM)
            : a == ""
              ? (logger.log("debug", "KHQueryRawDatas dataSourceName empty"),
                DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM)
              : !(n instanceof Array) || !(t instanceof Array)
                ? (logger.log(
                    "debug",
                    "KHQueryRawDatas tagNames or datas not Array",
                  ),
                  DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM)
                : n.length == 0
                  ? (logger.log("debug", "KHQueryRawDatas tagNames empty"),
                    DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM)
                  : typeof A != "number"
                    ? (logger.log(
                        "debug",
                        "KHQueryRawDatas DataVersion not number",
                      ),
                      DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM)
                    : A !== -3 && A !== -2 && A !== -1 && A !== 0
                      ? (logger.log(
                          "debug",
                          "KHQueryRawDatas DataVersion invalid",
                        ),
                        DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM)
                      : arguments.length > 6 &&
                          (e === void 0 || typeof e != "string")
                        ? (logger.log(
                            "debug",
                            "KHQueryRawDatas filter not string or undefined",
                          ),
                          DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM)
                        : await khManger.KHQueryRawDatas(
                            a,
                            n,
                            g,
                            u,
                            A,
                            e,
                            r,
                            t,
                            R,
                          );
    } catch (P) {
      return (logger.log("debug", P), DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM);
    }
  }
  async KHQuerySampleDatas1(a, n, g, u, A, e) {
    try {
      return arguments.length !== 5 && arguments.length !== 6
        ? (logger.log("debug", "KHQuerySampleDatas1 arguments number error"),
          DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM)
        : typeof a != "string" || typeof g != "string"
          ? (logger.log(
              "debug",
              "KHQuerySampleDatas1 dataSourceName or specificTime not String",
            ),
            DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM)
          : a == ""
            ? (logger.log("debug", "KHQuerySampleDatas1 dataSourceName empty"),
              DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM)
            : !(n instanceof Array) || !(A instanceof Array)
              ? (logger.log(
                  "debug",
                  "KHQuerySampleDatas1 tagNames or datas not Array",
                ),
                DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM)
              : n.length == 0
                ? (logger.log("debug", "KHQuerySampleDatas1 tagNames empty"),
                  DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM)
                : u != 0 && u != 1
                  ? (logger.log(
                      "debug",
                      "KHQuerySampleDatas1 samplingMode invalid",
                    ),
                    DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM)
                  : await khManger.KHQuerySampleDatas1(a, n, g, u, A, e);
    } catch (r) {
      return (logger.log("debug", r), DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM);
    }
  }
  async KHQuerySampleDatas2(a, n, g, u, A, e, r, t, R) {
    try {
      if (
        arguments.length !== 9 &&
        arguments.length !== 8 &&
        arguments.length !== 7
      )
        return (
          logger.log("debug", "KHQuerySampleDatas2 arguments number error"),
          DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM
        );
      if (typeof a != "string" || typeof g != "string" || typeof u != "string")
        return (
          logger.log(
            "debug",
            "KHQuerySampleDatas2 dataSourceName, startTime, endTime or specificTime not String",
          ),
          DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM
        );
      if (a == "")
        return (
          logger.log("debug", "KHQuerySampleDatas2 dataSourceName empty"),
          DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM
        );
      if (arguments.length === 7) {
        if (A == 2)
          return (
            logger.log("debug", "KHQuerySampleDatas2 samplingMode error"),
            DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM
          );
        var t = r;
        r = 0;
      }
      return !(n instanceof Array) || !(t instanceof Array)
        ? (logger.log(
            "debug",
            "KHQuerySampleDatas2 tagNames or datas not Array",
          ),
          DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM)
        : n.length == 0
          ? (logger.log("debug", "KHQuerySampleDatas2 tagNames empty"),
            DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM)
          : A != 0 && A != 1 && A != 2
            ? (logger.log("debug", "KHQuerySampleDatas2 samplingMode invalid"),
              DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM)
            : e <= 0
              ? (logger.log(
                  "debug",
                  "KHQuerySampleDatas2 samplingInterval not positive number",
                ),
                DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM)
              : await khManger.KHQuerySampleDatas2(a, n, g, u, A, e, r, t, R);
    } catch (P) {
      return (logger.log("debug", P), DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM);
    }
  }
  async KHGetCurrentValue(a, n, g, u) {
    try {
      return arguments.length !== 3 && arguments.length !== 4
        ? (logger.log("debug", "KHGetCurrentValue arguments number error"),
          DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM)
        : !(n instanceof Array) || !(g instanceof Array)
          ? (logger.log(
              "debug",
              "KHGetCurrentValue tagNames or datas not Array",
            ),
            DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM)
          : typeof a != "string" || a === ""
            ? (logger.log(
                "debug",
                "KHGetCurrentValue dataSourceName is not string or empty!",
              ),
              DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM)
            : n.length == 0
              ? (logger.log("debug", "KHGetCurrentValue tagNames empty"),
                DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM)
              : await khManger.KHGetCurrentValue(a, n, g, u);
    } catch (A) {
      return (logger.log("debug", A), DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM);
    }
  }
  AsynKHAddDatas(a, n, g, u) {
    if (arguments.length !== 3 && arguments.length !== 4) {
      (logger.log("debug", "KHAddDatas arguments number error"),
        g(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
      return;
    }
    if (typeof a != "string") {
      (logger.log("debug", "KHAddDatas dataSourceName not String"),
        g(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
      return;
    }
    if (a == "") {
      (logger.log("debug", "KHAddDatas dataSourceName empty"),
        g(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
      return;
    }
    if (Object.prototype.toString.call(n) != "[object Object]") {
      (logger.log("debug", "KHAddDatas dataJson not object"),
        g(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
      return;
    }
    for (var A in n) {
      var e = n[A];
      if (Object.prototype.toString.call(e) != "[object Array]") {
        (logger.log("debug", "KHAddDatas objects in dataJson not Array"),
          g(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
        return;
      }
      if (!(e instanceof Array)) {
        (logger.log("debug", "KHAddDatas objects in dataJson not Array"),
          g(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
        return;
      }
      if (e.length == 0) {
        (logger.log("debug", "KHAddDatas objects in dataJson empty"),
          g(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
        return;
      }
      for (var r = 0; r < e.length; r++) {
        if (
          e[r].DataValue === void 0 ||
          e[r].TimeStamp === void 0 ||
          e[r].QualityStamp === void 0
        ) {
          (logger.log("debug", "KHAddDatas objects in dataJson invalid"),
            g(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
          return;
        }
        if (
          typeof e[r].TimeStamp != "string" ||
          e[r].TimeStamp === "" ||
          typeof e[r].QualityStamp != "string" ||
          e[r].QualityStamp === ""
        ) {
          (logger.log(
            "debug",
            "KHAddDatas objects TimeStamp or QualityStamp in dataJson not string or empty",
          ),
            g(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
          return;
        }
        for (var t in e[r]) {
          if (
            t != "DataValue" &&
            t != "TimeStamp" &&
            t != "QualityStamp" &&
            t != "DataType" &&
            t != "DataLength"
          ) {
            (logger.log("debug", "KHAddDatas objects in dataJson invalid"),
              g(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
            return;
          }
          if (typeof e[r].DataValue != typeof e[0].DataValue) {
            (logger.log(
              "debug",
              "KHAddDatas objects DataType in dataJson invalid",
            ),
              g(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
            return;
          }
          if (t === "DataType" && typeof e[r][t] != "number") {
            (logger.log(
              "debug",
              "KHAddDatas objects DataType in dataJson invalid",
            ),
              g(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
            return;
          }
          if (
            t === "DataLength" &&
            (typeof e[r][t] != "number" ||
              (e[r].DataType !== 10 &&
                e[r].DataType !== 11 &&
                e[r].DataType !== 13 &&
                e[r].DataType !== 14))
          ) {
            (logger.log(
              "debug",
              "KHAddDatas objects DataLength in dataJson invalid",
            ),
              g(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
            return;
          }
        }
      }
    }
    if (typeof g != "function") {
      (logger.log("debug", "AsynKHAddDatas callback not function"),
        g(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
      return;
    }
    khManger.AsynKHAddDatas(a, n, g, u);
  }
  AsynKHQueryRawDatas(a, n, g, u, A, e, r, t, R) {
    if (arguments.length !== 8 && arguments.length !== 9) {
      (logger.log("debug", "AsynKHQueryRawDatas arguments number error"),
        t(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
      return;
    }
    if (r !== 1 && r !== 0) {
      (logger.log("debug", "AsynKHQueryRawDatas dataQuality invalid"),
        t(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
      return;
    }
    if (typeof a != "string" || typeof u != "string" || typeof g != "string") {
      (logger.log(
        "debug",
        "AsynKHQueryRawDatas dataSourceName, startTime or endTime not String",
      ),
        t(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
      return;
    }
    if (a == "") {
      (logger.log("debug", "AsynKHQueryRawDatas dataSourceName empty"),
        t(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
      return;
    }
    if (!(n instanceof Array)) {
      (logger.log("debug", "AsynKHQueryRawDatas tagNames not Array"),
        t(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
      return;
    }
    if (n.length == 0) {
      (logger.log("debug", "AsynKHQueryRawDatas tagNames empty"),
        t(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
      return;
    }
    if (typeof A != "number") {
      (logger.log("debug", "AsynKHQueryRawDatas DataVersion not number"),
        t(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
      return;
    }
    if (A !== -3 && A !== -2 && A !== -1 && A !== 0) {
      (logger.log("debug", "AsynKHQueryRawDatas DataVersion invalid"),
        t(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
      return;
    }
    if (arguments.length > 6 && (e === void 0 || typeof e != "string")) {
      (logger.log(
        "debug",
        "AsynKHQueryRawDatas filter not string or undefined",
      ),
        t(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
      return;
    }
    if (typeof t != "function") {
      (logger.log("debug", "AsynKHQueryRawDatas callback is not function"),
        t(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
      return;
    }
    khManger.AsynKHQueryRawDatas(a, n, g, u, A, e, r, t, R);
  }
  AsynKHQuerySampleDatas1(a, n, g, u, A, e) {
    if (arguments.length !== 5 && arguments.length !== 6) {
      (logger.log("debug", "AsynKHQuerySampleDatas1 arguments number error"),
        A(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
      return;
    }
    if (typeof a != "string" || typeof g != "string") {
      (logger.log(
        "debug",
        "AsynKHQuerySampleDatas1 dataSourceName or specificTime not String",
      ),
        A(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
      return;
    }
    if (a == "") {
      (logger.log("debug", "AsynKHQuerySampleDatas1 dataSourceName empty"),
        A(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
      return;
    }
    if (!(n instanceof Array)) {
      (logger.log("debug", "AsynKHQuerySampleDatas1 tagNames not Array"),
        A(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
      return;
    }
    if (n.length == 0) {
      (logger.log("debug", "AsynKHQuerySampleDatas1 tagNames empty"),
        A(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
      return;
    }
    if (u != 0 && u != 1) {
      (logger.log("debug", "AsynKHQuerySampleDatas1 samplingMode invalid"),
        A(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
      return;
    }
    if (typeof A != "function") {
      (logger.log("debug", "AsynKHQuerySampleDatas1 callback is not function"),
        A(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
      return;
    }
    khManger.AsynKHQuerySampleDatas1(a, n, g, u, A, e);
  }
  AsynKHQuerySampleDatas2(a, n, g, u, A, e, r, t, R) {
    if (
      arguments.length !== 8 &&
      arguments.length !== 9 &&
      arguments.length !== 7
    ) {
      (logger.log("debug", "AsynKHQuerySampleDatas2 arguments number error"),
        t(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
      return;
    }
    if (typeof a != "string" || typeof g != "string" || typeof u != "string") {
      (logger.log(
        "debug",
        "AsynKHQuerySampleDatas2 dataSourceName, startTime, endTime or specificTime not String",
      ),
        t(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
      return;
    }
    if (a == "") {
      (logger.log("debug", "AsynKHQuerySampleDatas2 dataSourceName empty"),
        t(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
      return;
    }
    if (arguments.length === 7) {
      if (A == 2) {
        (logger.log("debug", "KHQuerySampleDatas2 samplingMode error"),
          t(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
        return;
      }
      ((t = r), (r = 0));
    }
    if (!(n instanceof Array)) {
      (logger.log("debug", "AsynKHQuerySampleDatas2 tagNames not Array"),
        t(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
      return;
    }
    if (n.length == 0) {
      (logger.log("debug", "AsynKHQuerySampleDatas2 tagNames empty"),
        t(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
      return;
    }
    if (A != 0 && A != 1 && A != 2) {
      (logger.log("debug", "AsynKHQuerySampleDatas2 samplingMode invalid"),
        t(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
      return;
    }
    if (e <= 0) {
      (logger.log(
        "debug",
        "AsynKHQuerySampleDatas2 samplingInterval not positive number",
      ),
        t(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
      return;
    }
    if (typeof t != "function") {
      (logger.log("debug", "AsynKHQuerySampleDatas2 callback is not function"),
        t(DATASOURCEMESSAGE.APPERR_INVAILD_INPARAM, []));
      return;
    }
    khManger.AsynKHQuerySampleDatas2(a, n, g, u, A, e, r, t, R);
  }
}
module.exports = new khGlobalInterface();
