// modified by jinlong.feng at 2026-10-29 KF源码精简入库
// Reference snapshot: credential literals redacted; do not deploy this copy.
const oauthserver = require(__DIR + "/lib/services/services_user_auth/oauthClient"), userManageContrller = require(__DIR + "/lib/controllers/controllers_user_manage");
let middleWare = { step_1: function () { return async function (e, t, r) { let n = e.body, o; o = await userManageContrller.thirdParty.getUserByThirdParty(n, t), logger.log("debug", o), e.body = o, r(); }; }, step_2: function () { return function (e, t, r) { e.is("application/x-www-form-urlencoded") || (e.headers["content-type"] = "application/x-www-form-urlencoded"), e.body && e.body.client_id === "0000000000000000" && (e.body.client_secret = "KF_REFERENCE_REDACTED"), r(); }; }, step_3: function () { return oauthserver.getOauth().grant(); }, errorHandler: function () { return function (e, t, r, n) { r.sendErr(400, e.message); }; }, getArgs: function () { let e = this; return [e.step_1(), e.step_2(), e.step_3(), e.errorHandler()]; } };
module.exports = middleWare.getArgs();
// end
