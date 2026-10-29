// modified by jinlong.feng at 2026-10-29 KF源码精简入库
// Reference snapshot: credential literals redacted; do not deploy this copy.
const request = require("request"), OauthClient = require("../../../../../../common/oauth-utils-exedb");
class OpsInterface {
    constructor() { }
    static getAddressByAppName(a, n) {
        return new Promise((o, p) => {
            let e = { code: 0, ip: "", port: 0 }, l = `${global.externalConfig.kingGateWay.host}/ops/accessURL?appName=${a}&tenant_id=${global.externalConfig.tenant.tenantId}`;
            request({ url: encodeURI(l), method: "GET", json: !0, rejectUnauthorized: !1, timeout: 3e3, headers: { "content-type": "application/json", Authorization: `Bearer ${n}` } }, function (s, c, t) {
                try {
                    if (!s && c.statusCode === 200) {
                        if (t.errorCode == 0) {
                            var i = t.data, f = i.isAgent;
                            let r = i.accessUrl, [d, u] = r.split(/[:/]/);
                            e.code = 0, e.ip = d, e.port = parseInt(u);
                        }
                        else
                            throw e.code = t.code, `code=${e.code}`;
                        o(e);
                    }
                    else
                        throw e.code = -2, `\u8BF7\u6C42\u670D\u52A1\u53D1\u73B0\u63A5\u53E3\u5931\u8D25\uFF1A${s.message}`;
                }
                catch (r) {
                    logger.log("fatal", `getAddressByAppName\u9519\u8BEF\uFF1A${r}`), o(e);
                }
            });
        });
    }
    static async getTokenByOauthInfo() { return (await new OauthClient({ host: global.externalConfig.kingGateWay.host }).getToken({ grant_type: "password", username: "kcdebuger", redirect_uri: "/", client_id: global.externalConfig.oauth.client_id, client_secret: global.externalConfig.oauth.client_secret, password: "KF_REFERENCE_REDACTED" })).data.access_token || ""; }
}
module.exports = OpsInterface;
// end
