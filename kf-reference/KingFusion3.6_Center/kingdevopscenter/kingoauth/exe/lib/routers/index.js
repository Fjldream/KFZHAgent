const router = require("express").Router(),
  {
    resExtend,
    schemaValidator
  } = require(__DIR + "/core/middlewares"),
  validateRequest = schemaValidator(!0),
  {
    baseRouter
  } = require(__DIR + "/lib/routers/v1/api_v1_router.js"),
  userManageContrller = require(__DIR + "/lib/controllers/controllers_user_manage"),
  userAuthCotroller = require(__DIR + "/lib/controllers/controllers_user_auth"),
  rsaUtil = require(__DIR + "/core/utils/crypto.js"),
  // modified by jinlong.feng at 2026-09-22 PAI门户Kafka单点登录
  paiTokenExchangeMiddleWare = require(__DIR + "/lib/services/services_user_auth/middleware/paiTokenExchangeMiddleWare");
// end
router.use(function(e, r, n) {
  logger.log("info", "Time: ", Date.now()), n()
}), router.use(resExtend), router.get("/", function(t, e) {
  e.render("index", {})
}), router.get("/login", function(t, e) {
  e.sendFile(__DIR + "/public/login.html")
}), router.get("/register", function(t, e) {
  e.sendFile(__DIR + "/public/register.html")
}), router.get("/client", function(t, e) {
  userAuthCotroller.client.getClient(t, e)
}), router.post("/client", function(t, e) {
  userAuthCotroller.client.createClient(t, e)
}), router.post("/loginOut", function(t, e) {
  userAuthCotroller.grant.loginOut(t, e)
}), router.get("/auth", ...userAuthCotroller.grant.doAuth()), router.get("/grant", ...userAuthCotroller.grant.doGrant()), router.post("/oauth/token", ...userAuthCotroller.grant.getToken()), router.post("/thirdParty/token", ...userAuthCotroller.thirdParty.getThirdToken()),
// modified by jinlong.feng at 2026-09-22 PAI门户Kafka单点登录
router.post("/thirdParty/paiToken", ...paiTokenExchangeMiddleWare, ...userAuthCotroller.thirdParty.getThirdToken()),
// end
router.get("/oauth/code", ...userAuthCotroller.grant.getCode()), router.post("/sdssoUserInfo", (t, e) => {
  let r = t.body,
    n = t.headers["api-key"];
  if (!n) return e.sendErr(-1, "api key \u7F3A\u5931");
  if (n = rsaUtil.SDdecrypted(n), n != "sdssospecialloginveryhard") return e.sendErr(-1, "api key check fail");
  userManageContrller.special.getUserPwd(r, function(s, o) {
    s ? e.sendErr(s.code, s.message) : (e.status(200), e.sendOk(o))
  })
}), router.use("/api/v1", userAuthCotroller.middleware.middleAuth(), validateRequest, function(t, e, r) {
  t.user || e.redirect(302, "/login"), r()
}, baseRouter, function(t, e, r, n) {
  r.sendErr(401, t.message)
}), router.post("/firstUserPassword", (t, e) => {
  let r = t.body;
  userManageContrller.special.firstUserUpdate(r, function(n, s) {
    n ? e.sendErr(n.code, n.message) : (e.status(200), e.sendOk(s))
  })
}), router.post("/ssoLogin", (t, e) => {
  let {
    authState: r,
    userId: n,
    client_id: s,
    client_secret: o
  } = t.body;
  if (r === void 0 || !n || !s || !o) {
    e.sendErr(-1, "\u53C2\u6570\u9519\u8BEF");
    return
  }
  r = !!r;
  let l = {
    authState: r,
    userId: n,
    client_id: s,
    client_secret: o
  };
  userManageContrller.special.ssoLogin(l, function(i, u) {
    i ? e.sendErr(i.code, i.message) : (e.status(200), e.sendOk(u))
  })
}), router.use(userAuthCotroller.middleware.errorHandle()), module.exports = router;
