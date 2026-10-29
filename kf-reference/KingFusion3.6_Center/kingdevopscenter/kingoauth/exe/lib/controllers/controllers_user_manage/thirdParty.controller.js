// modified by jinlong.feng at 2026-10-29 KF源码精简入库
// Reference snapshot: credential literals redacted; do not deploy this copy.
const userDao = require(__DIR + "/lib/daos/daos_user_manage/user.dao.js"), crypto = require(__DIR + "/core/utils/crypto.js");
class thirdPartyController {
    async getUserByThirdParty(r, e) {
        return new Promise(async (t, i) => {
            try {
                let n = r.unionId, o = r.unionType, s = await userDao.getUserInfoByNamePromise(n);
                if (typeof s == "string")
                    e.sendErr(400, s);
                else if (s.isSSO == 0)
                    e.sendErr(400, `\u7528\u6237_${n}:\u8BE5\u7528\u6237\u975E\u5355\u70B9\u767B\u5F55\u7528\u6237!`);
                else {
                    let a = { grant_type: "password", redirect_uri: "/main", client_id: "9EAE7E9C1245D0AA", client_secret: "KF_REFERENCE_REDACTED", username: s.userName, password: s.password, tenantId: s.tenantId };
                    t(a);
                }
            }
            catch (n) {
                i(n);
            }
        });
    }
    static _getBeforeCreateUserObj(r) { let e = crypto.randomString(16), t = crypto.encryptSha512ed("000000", e); return { userName: r, encodePsw: t, passwordValidTime: "0", saltKey: e, description: "", groupId: "104", userType: "03", isMultiLogin: "0", category: [], extendField: {}, tenantId: "c7f1771f-0c8f-4c75-9d71-3b8c4b6bd190", domainName: "kingview" }; }
    static _CreateUserObj(r, e) { let t = crypto.randomString(16), i = crypto.encryptSha512ed(e, t); return { userName: r, encodePsw: i, passwordValidTime: "0", saltKey: t, description: "", groupId: "3", userType: "02", isMultiLogin: "0", category: [], extendField: {}, tenantId: "c7f1771f-0c8f-4c75-9d71-3b8c4b6bd190", domainName: "kingview" }; }
}
module.exports = new thirdPartyController;
// end
