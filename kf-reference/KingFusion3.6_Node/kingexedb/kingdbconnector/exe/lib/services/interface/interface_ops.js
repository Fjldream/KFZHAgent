// modified by jinlong.feng at 2026-10-29 KF源码精简入库
// Reference snapshot: credential literals redacted; do not deploy this copy.
const request = require("request"), querystring = require("querystring"), { common: commonEnums } = require(`${__DIR}/core/enums`), OauthClient = require("../../../../../../common/oauth-utils-exedb");
class OpsInterface {
    constructor() { }
    static getAddressByAppName(u, l) {
        return new Promise((o, e) => {
            let t = { code: 0, ip: "", port: 0 }, r = `${global.externalConfig.kingGateWay.host}/ops/accessURL?appName=${u}&tenant_id=${global.externalConfig.tenant.tenantId}`;
            request({ url: encodeURI(r), method: "GET", json: !0, rejectUnauthorized: !1, timeout: 3e3, headers: { "content-type": "application/json", Authorization: `Bearer ${l}` } }, function (n, c, a) {
                try {
                    if (!n && c.statusCode === 200) {
                        if (a.errorCode == 0) {
                            var d = a.data, i = d.isAgent;
                            if (i == 0) {
                                let g = d.accessUrl, [f, h] = g.split(/[:/]/);
                                t.code = 0, t.ip = f, t.port = parseInt(h);
                            }
                            else if (i == 1)
                                throw t.code = -1, "\u6570\u636E\u5E93\u4E0D\u5E94\u8BE5\u88AB\u4EE3\u7406";
                        }
                        else
                            throw t.code = a.code, `code=${t.code}`;
                        o(t);
                    }
                    else
                        throw t.code = -2, `\u8BF7\u6C42\u670D\u52A1\u53D1\u73B0\u63A5\u53E3\u5931\u8D25\uFF1A${n.message}`;
                }
                catch (g) {
                    logger.log("fatal", `getAddressByAppName\u9519\u8BEF\uFF1A${g}`), o(t);
                }
            });
        });
    }
    static getRedundanceState(u) { return new Promise((l, o) => l({ code: 0, redundanceState: commonEnums.enum_RedandunceState.ACTIVE })); }
    static async getTokenByOauthInfo() { return (await new OauthClient({ host: global.externalConfig.kingGateWay.host }).getToken({ grant_type: "password", username: "kcdebuger", redirect_uri: "/", client_id: global.externalConfig.oauth.client_id, client_secret: global.externalConfig.oauth.client_secret, password: "KF_REFERENCE_REDACTED" })).data.access_token || ""; }
}
module.exports = OpsInterface;
// end
