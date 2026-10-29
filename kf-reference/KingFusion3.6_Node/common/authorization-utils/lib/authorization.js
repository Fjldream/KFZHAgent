"use strict";
const getRequestUrl = require("./url"),
  postFuncSync = require("./request"),
  SUCCESS_OK = 0,
  MAX_SHOWTIME = 1e3 * 3600*24,
  SYSTEM_AUTH_TYPE = {
    AUTH_UNKNOWN: -1,
    AUTH_IS_NOT_EXIT: 0,
    AUTH_NORMOL: 1,
    AUTH_TEMP: 2,
  },
  checkAuthInterval = 1e3 * 10,
  authorizationMaxNum = 5;
var startStatus = !0,
  m_lock = !0,
  authorizationTestCount = 0;
class AuthorizationChecker {
  constructor() {
    ((this.configPath = ""),
      (this.productID = 0),
      (this.authState = SYSTEM_AUTH_TYPE.AUTH_UNKNOWN),
      (this.demoMode = !1),
      (this.demoTimer = null),
      (this.authInfo = null),
      (this.requestPermission = !1));
  }
  getAuthorizationInfo() {
    return { authState: this.authState };
  }
  getRequestPermission() {
    return this.requestPermission;
  }
  async init(t, e) {
    try {
      ((this.configPath = e),
        (this.productID = t),
        await this.pollingCheckAuth());
    } catch (a) {
      throw a.message;
    }
  }
  async pollingCheckAuth() {
    var t = this;
    await t.getAuthorizationByOauth();
    var e = setTimeout(async () => {
      (clearTimeout(e), (e = null), await t.pollingCheckAuth());
    }, checkAuthInterval);
  }
  async getAuthorizationByOauth() {
    let t = this,
      e = { productID: t.productID },
      a = getRequestUrl(t.configPath),
      o = { errorCode: -1 };
    switch (
      (a && (o = await postFuncSync(a, e)),
      SUCCESS_OK === o.errorCode
        ? (logger.log("debug", "Get AuthState Success."),
          (t.authInfo = o.data.data.authInfo),
          (t.authState = o.data.data.authInfo.authState),
          SYSTEM_AUTH_TYPE.AUTH_IS_NOT_EXIT === t.authState && !m_lock
            ? authorizationTestCount++
            : (authorizationTestCount = 0))
        : (logger.log("fatal", "Get AuthState Failed."),
          (t.authInfo = null),
          (t.authState = SYSTEM_AUTH_TYPE.AUTH_IS_NOT_EXIT),
          authorizationTestCount++),
      t.authState)
    ) {
      case SYSTEM_AUTH_TYPE.AUTH_IS_NOT_EXIT:
      case SYSTEM_AUTH_TYPE.AUTH_TEMP:
        startStatus
          ? (logger.log(
              "info",
              "\u672A\u6388\u6743\uFF0C\u8FDB\u5165\u6F14\u793A\u6A21\u5F0F",
            ),
            (this.requestPermission = !0),
            (t.demoMode = !0),
            (t.demoTimer = setTimeout(() => {
              ((startStatus = !1),
                (this.requestPermission = !1),
                logger.log(
                  "info",
                  "\u6F14\u793A\u6A21\u5F0F\u7ED3\u675F\uFF0C\u7A0B\u5E8F\u505C\u6B62",
                ));
            }, MAX_SHOWTIME)))
          : !t.demoMode &&
            authorizationTestCount > authorizationMaxNum &&
            (logger.log(
              "fatal",
              "\u8FD0\u884C\u4E2D\u6388\u6743\u5F02\u5E38\uFF0C\u7A0B\u5E8F\u505C\u6B62",
            ),
            process.exit());
        break;
      case SYSTEM_AUTH_TYPE.AUTH_NORMOL:
        ((this.requestPermission = !0),
          (m_lock = !1),
          (startStatus = !1),
          (t.demoMode = !1),
          t.demoTimer &&
            (logger.log(
              "info",
              "\u5DF2\u6388\u6743\uFF0C\u9000\u51FA\u6F14\u793A\u6A21\u5F0F",
            ),
            clearTimeout(t.demoTimer),
            (t.demoTimer = null)));
        break;
      default:
        break;
    }
  }
  async getAuthInfo(t) {
    return t == this.productID ? this.authInfo : null;
  }
}
module.exports = AuthorizationChecker;
