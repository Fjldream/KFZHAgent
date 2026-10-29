// modified by jinlong.feng at 2026-10-29 KF源码精简入库
// Reference snapshot: credential literals redacted; do not deploy this copy.
const oauthserver = require(__DIR + "/lib/services/services_user_auth/oauthClient");
let middleWare = { step_1: function () { return function (e, n, r) { e.is("application/x-www-form-urlencoded") || (e.headers["content-type"] = "application/x-www-form-urlencoded"), e.body && e.body.client_id === "0000000000000000" && (e.body.client_secret = "KF_REFERENCE_REDACTED"), r(); }; }, step_2: function () { return oauthserver.getOauth().grant(); }, step_3: function () { return async function (e, n, r) { e.body.grant_type, r(); }; }, errorHandler: function () {
        return function (e, n, r, o) {
            let s = e.message, t = 400;
            switch (s) {
                case "\u521D\u6B21\u767B\u5F55\uFF0C\u8BF7\u4FEE\u6539\u8BE5\u7528\u6237\u5BC6\u7801":
                    t = -10001;
                    break;
                case "\u8BE5\u7528\u6237\u5DF2\u7ECF\u88AB\u7981\u7528\uFF0C\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458":
                    t = -10002;
                    break;
                case "\u8BE5\u7528\u6237\u5DF2\u7ECF\u5931\u6548\uFF0C\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458":
                    t = -10003;
                    break;
                case "\u8BE5\u7528\u6237\u5BC6\u7801\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458":
                    t = -10004;
                    break;
                default: break;
            }
            r.sendErr(t, s);
        };
    }, getArgs: function () { let e = this; return [e.step_1(), e.step_2(), e.step_3(), e.errorHandler()]; } };
module.exports = middleWare.getArgs();
// end
