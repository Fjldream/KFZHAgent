const router = require("express").Router(),
  url = require("url"),
  {
    midware_response,
    midware_token,
    midware_projectGUID,
    midware_htData
  } = require("../../core/middlewares");
router.use(midware_response), router.use((e, o, r) => {
  let t = url.parse(e.url).pathname,
    i = ["/multiLoginStatus", "/img"];
  t.includes("/public/javascripts/") || i.includes(t) ? r() : midware_projectGUID(e, o, r, "kp_running")
});
const noCheckToken = ["/getServerTime", "/getNodeStatus", "/login", "/ssoLogin", "/singleLogin", "/getSingSignOnConfig", "/getProjectPath", "/thirdTokenLogin", "/getConfigInfo", "/getProjectFile", "/getpublickeystring", "/refreshToken", "/globalScript/km_global_script.js", "/img", "/download/", "/getFile/", "/renameFile", "/tile", "/uploads", "/broadCastVideo", "/expireChangePassWord",
  // modified by jinlong.feng at 2026-09-22 PAI门户Kafka单点登录
  "/paiTokenLogin"];
// end
router.use((e, o, r) => {
  let t = url.parse(e.url).pathname;
  if (t.includes("/htDataModel")) return midware_htData(e, o, r);
  noCheckToken.includes(t) || t.includes("uploads") ? r() : midware_token(e, o, r, "kp_running")
});
const routerLoader = require("./route_loader");
routerLoader.registerRoutes(router), module.exports = router;
