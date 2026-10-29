// modified by jinlong.feng at 2026-10-29 KF源码精简入库
// Reference snapshot: credential literals redacted; do not deploy this copy.
var requestModule = require("request"), config = require(__dir + "/config/externalConfig");
class UserAuthOpe {
    constructor() { this.req = null, this.tokenMap = new Map; }
    getToken(n) { var t = this, s = t.tokenMap.get(n); return s; }
    getOauth(n) {
        if (n) {
            var t = this;
            return new Promise(function (s, o) {
                var u = config.oauth.host;
                requestModule({ url: encodeURI(u + "/auth"), method: "GET", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Bearer " + n } }, function (a, i, e) {
                    if (logger.info(e), !a && i.statusCode === 200)
                        if (typeof e == "string" && e !== "AccessToken not found" && (e = JSON.parse(e)), e.userId || e.oauth && e.oauth.userId) {
                            var r = e.oauth.accessToken || e.oauth.access_token;
                            return t.tokenMap.get(r) || t.tokenMap.set(r, e.oauth), s(r);
                        }
                        else
                            return logger.error("token\u65E0\u6548"), o();
                    else
                        return logger.error("token\u65E0\u6548" + a), o();
                });
            });
        }
        else {
            var t = this;
            return new Promise(function (o, u) {
                var a = "http://" + config.oauth.host, i = { grant_type: "password", redirect_uri: "/test", username: "KingAdmin", password: "KF_REFERENCE_REDACTED", client_id: "0000000000000000", client_secret: "KF_REFERENCE_REDACTED" };
                requestModule({ url: encodeURI(a + "/oauth/token"), method: "POST", json: !0, headers: { "Content-Type": "application/x-www-form-urlencoded" }, form: i }, function (e, r, c) {
                    if (!e && r.statusCode === 200) {
                        var h = c.access_token;
                        return o(h);
                    }
                    else
                        return u();
                });
            });
        }
    }
    clearToken(t) { var t = this.tokenMap.get(t); t && this.tokenMap.delete(t); }
}
module.exports = new UserAuthOpe;
// end
