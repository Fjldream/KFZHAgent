// modified by jinlong.feng at 2026-10-29 KF源码精简入库
// Reference snapshot: credential literals redacted; do not deploy this copy.
let fs = require("fs");
const uuid = require("uuid"), path = require("path"), iconv = require("iconv-lite"), Json2csvParser = require("json2csv").Parser;
var _ = require("lodash");
const { enums: publicEnums } = require(__DIR + "/lib/services/common/public");
let userDao = require(__DIR + "/lib/daos/daos_user_manage/user.dao.js"), groupDao = require(__DIR + "/lib/daos/daos_user_manage/group.dao.js"), roleDao = require(__DIR + "/lib/daos/daos_user_manage/role.dao"), securityDao = require(__DIR + "/lib/daos/daos_user_manage/security.dao.js"), tenantInfoDao = require(__DIR + "/lib/daos/daos_user_manage/tenant_info.dao.js"), tenantDao = require(__DIR + "/lib/daos/daos_user_manage/tenant.dao.js");
const crypto = require(__DIR + "/core/utils/crypto.js");
let verify = require(__DIR + "/core/utils/verify.js"), interfaces = require(__DIR + "/lib/services/interfaces/interface.js"), utils = require(__DIR + "/core/utils/utils"), userMap = new Map;
class userService {
    async getUserInfoById(e) {
        try {
            return await userDao.getUserInfoPromise(e);
        }
        catch (s) {
            return { code: -1, error: s };
        }
    }
    async getUserById(e, s) {
        try {
            let t = await userDao.getUserInfoPromise(e);
            if (delete t.password, t.userType !== publicEnums.enumUserType.SUPER_TYPE) {
                let a = await securityDao.getSecurity(t.tenantId);
                t.passwordPolicy = a.msg.passwordPolicy;
                let n = await tenantInfoDao.getUserDomainName(t.tenantId);
                if (_.isEmpty(n)) {
                    s(new Error(responseMsg.userManage.TENANT_INFO_IS_NULL), null);
                    return;
                }
                t.domainName = n.domainName;
            }
            t.userInvalid = t.userInvalid == 1, t.userBan = t.userBan == 1;
            let r = new Date().getTime();
            t.nowTime = r, s(null, t);
        }
        catch (t) {
            s(t, t.message);
        }
    }
    async getMultiUserInfoByIds(e) {
        try {
            return await userDao.getMulitUserInfoPromise(e);
        }
        catch (s) {
            return { code: -1, error: s };
        }
    }
    async getUserByName(e, s, t, r) {
        switch (t) {
            case publicEnums.enumUserType.SUPER_TYPE:
            case publicEnums.enumUserType.SYSTEM_TYPE:
                userDao.getUserInfoByName(null, s, r);
                break;
            case publicEnums.enumUserType.USER_TYPE:
            default:
                userDao.getUserInfoByName(e, s, r);
                break;
        }
    }
    async getIdByName(e, s) { return new Promise(async (t, r) => { let a = await userDao.getUserIdByTenantIdAndName(e, s); a.err ? r(a) : t(a); }); }
    async getUserPwd(e, s) { let r = await userDao.getUserpwdByName("c7f1771f-0c8f-4c75-9d71-3b8c4b6bd190", e); r.err ? s({ code: -3, message: r.err.message }, null) : s(null, r); }
    static async _createSysGroup(e) {
        return new Promise(async (s, t) => {
            let r = uuid.v1(), a = { groupName: `${e.userName}_group`, groupType: publicEnums.enumUserType.SYSTEM_TYPE, createdId: e.createdId, level: 2, parenId: e.parenId, tenantId: e.tenantId, uuid: r }, n = await groupDao.getSuperGroup();
            if (a.parentId = n.powerGroupId, await groupDao.ifExist(a))
                s({ err: new Error(responseMsg.userManage.NAME_TENANT_REPEAT), msg: null });
            else {
                let u = await groupDao.insertGroup(a);
                if (u.err)
                    s({ err: new Error(u.err.message), msg: null });
                else {
                    let i = { groupId: (await groupDao.getGroupByUUID(a.uuid)).powerGroupId };
                    s({ err: null, msg: i });
                }
            }
        });
    }
    static async _getUserInfoByUserIds(e) {
        let s = [];
        if (e.length > 0)
            for (let t = 0; t < e.length; t++) {
                let r = e[t].userId, a = await userDao.getUserInfoPromise(r);
                s.push(a);
            }
        return s;
    }
    async getUserList(e, s) {
        try {
            var t = this;
            if (!e.operator.userId)
                s(new Error(responseMsg.userManage.REQUEST_ERROR, null));
            else {
                var r = [];
                let n = await userDao.getUserInfoPromise(e.operator.userId), l = e.operator.tenantId || n.tenantId;
                var a;
                if (n.userType == publicEnums.enumUserType.SUPER_TYPE) {
                    let u = await userDao.getSysUserList(e.operator);
                    r = await userService._getUserInfoByUserIds(u), r.unshift(n), s("success", r);
                }
                else
                    n.userType == publicEnums.enumUserType.SYSTEM_TYPE ? (a = await userDao.getUserListPromise(l, e.groupIds), s("success", a)) : (a = await userDao.getUserListPromise(l, e.groupIds), s("success", a));
            }
        }
        catch (n) {
            s("err_inside", n.message);
        }
    }
    async getUsersByGroup(e, s) { await userDao.getUsersByGroup(e, s); }
    async createUser(e, s) {
        let t = this;
        try {
            if ((await userDao.ifExist(e.userName)).isExist) {
                s("repeat", responseMsg.userManage.USER_NAME_REPEAT);
                return;
            }
            if (e.userType == publicEnums.enumUserType.SYSTEM_TYPE) {
                let n = await t.judgeDomainName(e);
                if (!n.flag) {
                    s("err", n.msg);
                    return;
                }
                e.groupId = -1, e.roles = "";
                let l = { domainName: e.domainName, description: e.domainDescription }, u = await tenantDao.createTenant(l);
                if (u.err) {
                    s("err", u.err.message);
                    return;
                }
                e.tenantId = u.msg.tenantId, await userDao.createTenantTables(e.tenantId);
            }
            else {
                e.tenantId = e.operator.tenantId;
                let n = await t.passwordReg({ tenantId: e.tenantId, password: e.password });
                if (!n.flag) {
                    s("err", n.msg);
                    return;
                }
                let l = await securityDao.getBlackListByTenantId(e.tenantId);
                if (l && userService._judgeBlackNameExist(e.userName, l)) {
                    s("err", responseMsg.userManage.NAME_TENANT_BLACK);
                    return;
                }
                e.roles || (e.roles = "[]");
            }
            e.saltKey = crypto.randomString(16), e.encodePsw = crypto.encryptSha512ed(e.password, e.saltKey), await userDao.insertUser(e);
            let a = await userDao.getUserIdByTenantIdAndName(e.tenantId, e.userName);
            s("success", `${responseMsg.userManage.ADD_USER_SUCCESS}\uFF0CuserId = ${a.msg}`);
        }
        catch (r) {
            s("err", r.message);
        }
    }
    async multiCreateUser(e, s, t) {
        try {
            let r = this, a = await groupDao.getGroupList(s);
            if (a.err)
                return t("err_inside", "get group err");
            a = a.msg;
            let n = new Map;
            for (let i = 0; i < a.length; i++)
                n.set(a[i].groupName, a[i].groupId);
            let l = await roleDao.getRoleList(s);
            if (l.err)
                return t("err_inside", "get role err");
            l = l.msg;
            let u = new Map;
            for (let i = 0; i < l.length; i++)
                u.set(l[i].roleName, l[i].roleId);
            e = e.map(i => (i.groupId = i.groupName === "root" || !n.get(i.groupName) ? -1 : n.get(i.groupName), delete i.groupName, i.roles = JSON.stringify(i.roles.map(g => u.get(g)).filter(g => g)), i)), console.log(e, a);
            let d = [];
            for (let i = 0; i < e.length; i++) {
                let g = await (async () => new Promise((p, o) => { r.createUser(e[i], (c, m) => { p(c === "success" ? 0 : -1); }); }))();
                d.push(g);
            }
            t("success", d);
        }
        catch (r) {
            t("err", r.message);
        }
    }
    async editUser(e, s) {
        try {
            let r = this;
            if (e.oldUserName !== e.userName) {
                let n = await securityDao.getBlackListByTenantId(e.tenantId);
                if (userService._judgeBlackNameExist(e.userName, n)) {
                    s(new Error(responseMsg.userManage.NAME_TENANT_BLACK), null);
                    return;
                }
            }
            if (e.userType === publicEnums.enumUserType.SYSTEM_TYPE) {
                var t = await tenantInfoDao.editDomainNameIfExist(e);
                if (t) {
                    s(new Error(responseMsg.userManage.TENANT_NAME_IS_REPEAT), null);
                    return;
                }
                else {
                    let n = { tenantId: e.tenantId, domainName: e.domainName, description: e.domainDescription };
                    await tenantDao.editTenant(n);
                }
            }
            let a = await userDao.updateUser(e);
            a.err ? s({ message: a.err }) : s(null, responseMsg.userManage.UPDATE_USER_SUCCESS);
        }
        catch (r) {
            s("err", r.message);
        }
    }
    async updateRoles(e, s, t, r) {
        try {
            let a = this;
            for (const l of e) {
                let u = await securityDao.getBlackListByTenantId(l.tenantId);
                if (userService._judgeBlackNameExist(l.userName, u)) {
                    r(new Error(responseMsg.userManage.NAME_TENANT_BLACK), null);
                    return;
                }
            }
            let n = await userDao.bulkUpdateRoles(e, s, t);
            n.err ? r({ message: n.err }) : r(null, responseMsg.userManage.UPDATE_USER_SUCCESS);
        }
        catch (a) {
            r("err", a.message);
        }
    }
    async createUserPromise(e) {
        return new Promise(async (s, t) => {
            if (await userDao.ifExist(e.userName))
                logger.log("fatal", responseMsg.userManage.NAME_TENANT_REPEAT), t(new Error(responseMsg.userManage.NAME_TENANT_REPEAT));
            else {
                var a;
                let l = await userDao.insertUser(e), u = await userDao.getUserIdByTenantIdAndName(e.tenantId, e.userName);
                u.err === null && (e.userId = u.msg, a = await userDao.insertExtendField(e));
                var n = l.err || a.err || u.err;
                n ? t({ err: n, data: null }) : s(!0);
            }
        });
    }
    async deleteUser(e, s) {
        try {
            if (!await userDao.ifExistByUserId(e.userId)) {
                s("err", responseMsg.userManage.USER_IS_NOT_EXIST);
                return;
            }
            var t = await userDao.getUserInfoByUserId(e.userId);
            if (e.operator.userType === publicEnums.enumUserType.SUPER_TYPE) {
                let a = await tenantDao.deleteTenant(e.tenantId);
                if (a.err) {
                    s("err", a.err.message);
                    return;
                }
                await userDao.deleteTenantTables(e.tenantId);
                let n = await userDao.deleteTenantUsers(e.tenantId);
                n.err ? s(n.err) : s(null, responseMsg.userManage.DELETE_SUCCESS);
            }
            else
                await userDao.deleteUserByIds([e.userId]), s(null, responseMsg.userManage.DELETE_SUCCESS);
        }
        catch (r) {
            s("err", r.message);
        }
    }
    async multiDeleteUser(e, s, t) {
        try {
            let r = this, a = [];
            for (let n = 0; n < e.length; n++) {
                let l = await (async () => new Promise((u, d) => { e[n] || u(-1), e[n].errorCode && e[n].errorCode === -1 && u(e[n].message || -1), r.deleteUser(e[n], (i, g) => { u(g === "\u5220\u9664\u6210\u529F" ? responseMsg.userManage.DELETE_SUCCESS : responseMsg.userManage.DELETE_FAIL); }); }))();
                a.push(l);
            }
            t("success", a);
        }
        catch (r) {
            t("err", r.message);
        }
    }
    async getTenantIdByUserName(e) { return new Promise(async (s, t) => { const r = await userDao.getTenantIdByUserName(e); s(r); }); }
    async isExistUser(e) { return new Promise(async (s, t) => { const r = await userDao.getUserInfoByNamePromise(e); s(r); }); }
    async findUser(e, s, t, r) { await userDao.findUser(s, t, function (a, n) { r(a, n); }); }
    async updatePassword(e, s) {
        let r = await this.passwordReg({ tenantId: e.tenantId, password: e.newPassword });
        if (!r.flag) {
            s(r.msg, null);
            return;
        }
        const a = await userDao.getUserInfoPromise(e.userId);
        if (e.newPassword === e.oldPassword) {
            s(responseMsg.userManage.OLDPASSWORD_DIFFERENT_NEWPASSWORD, null);
            return;
        }
        let n = crypto.encryptSha512ed(e.oldPassword, a.saltKey);
        if (e.oldPassword !== a.password && n !== a.password) {
            s(responseMsg.userManage.OLD_PASSWORD_IS_WRONG, null);
            return;
        }
        let l = crypto.randomString(16);
        if (!verify.strongPasswordReg(e.newPassword).flag) {
            s(responseMsg.paramReg.STRONG_PASSWORD_TYPE_NUM, null);
            return;
        }
        let u = crypto.encryptSha512ed(e.newPassword, l);
        const d = await userDao.updatePassword(e.userId, u, l);
        d.err ? s(d.err, null) : s(null, responseMsg.userManage.UPDATE_PASSWORD_SUCCESS);
    }
    async resetPassword(e, s) {
        try {
            let t = userService._randomPassword(8), r = crypto.randomString(16), a = crypto.encryptSha512ed(t, r);
            await userDao.resetPassword(e, a, r), s(null, { des: responseMsg.userManage.RESET_PASSWORD_SUCCESS, password: t });
        }
        catch (t) {
            s(t.message, null);
        }
    }
    async resetDesPassword(e, s, t) {
        try {
            let r = s, a = crypto.randomString(16), n = crypto.encryptSha512ed(r, a);
            await userDao.resetDesPassword(e, n, a), t(null, { des: responseMsg.userManage.RESET_PASSWORD_SUCCESS, password: r });
        }
        catch (r) {
            t(r.message, null);
        }
    }
    async getUserTypeByUserId(e, s) { var t = await userDao.getUserTypeByUserId(e); t.err === null ? s("success", t.msg) : s("err", t.err.message); }
    static async _getUserList(e) { return await userDao.getUserListPromise(e); }
    static async _getUserListByTenantId(e) { let s = this, t = await userDao.getUserIdsByTenantId(e); return await s._getUserInfoByUserIds(t); }
    async userExport(e, s) {
        try {
            var t = userService;
            if (!e.groupId)
                s(new Error("groupId is not defined", null));
            else {
                var r = [];
                let a = await userDao.getUserInfoPromise(e.userId), n = e.groupId, l = e.tenantId;
                if (e.userType == publicEnums.enumUserType.SUPER_TYPE) {
                    let u = await userDao.getSysUserList(e);
                    r = await t._getUserInfoByUserIds(u), r.unshift(a);
                }
                else
                    e.userType == publicEnums.enumUserType.SYSTEM_TYPE && (e.groupId === "root" ? r = await t._getUserListByTenantId(l) : r = await t._getUserList(n));
                if (e.fileType == "csv") {
                    let u = await tenantInfoDao.getUserDomainName(l), d = ["\u6635\u79F0", "\u7528\u6237ID", "\u7528\u6237\u540D", "\u63CF\u8FF0", "\u7528\u6237\u7C7B\u578B", "\u7528\u6237\u7EC4\u540D", "\u521B\u5EFA\u65F6\u95F4", "\u4FEE\u6539\u65F6\u95F4", "\u5BC6\u7801\u6709\u6548\u671F", "\u5BC6\u7801\u4FEE\u6539\u65F6\u95F4", "\u7528\u6237\u5931\u6548", "\u7528\u6237\u542F\u7528/\u7981\u7528", "\u57DF\u540D", "\u6269\u5C55\u4FE1\u606F"], i = [];
                    for (let o = 0; o < r.length; o++) {
                        r[o].domainName = u.domainName;
                        let c = { \u6635\u79F0: r[o].nickName, \u7528\u6237ID: r[o].userId, \u7528\u6237\u540D: r[o].userName, \u63CF\u8FF0: r[o].description, \u7528\u6237\u7C7B\u578B: r[o].userType, \u7528\u6237\u7EC4\u540D: r[o].groupId, \u521B\u5EFA\u65F6\u95F4: r[o].createdTime, \u4FEE\u6539\u65F6\u95F4: r[o].lastEditTime, \u5BC6\u7801\u6709\u6548\u671F: r[o].passwordValidTime, \u5BC6\u7801\u4FEE\u6539\u65F6\u95F4: r[o].lastPasswordEditTime, \u7528\u6237\u5931\u6548: r[o].userInvalid, "\u7528\u6237\u542F\u7528/\u7981\u7528": r[o].isLock, \u57DF\u540D: r[o].domainName, \u6269\u5C55\u4FE1\u606F: r[o].extendField };
                        i.push(c);
                    }
                    const p = new Json2csvParser({ fields: d }).parse(i);
                    fs.writeFile("./download/" + e.fileName, p, function (o) {
                        if (o)
                            return logger.log("fatal", o);
                        {
                            let c = "./download/" + e.fileName;
                            s(0, c);
                        }
                        logger.log("debug", "The file was saved!");
                    });
                }
                else
                    e.fileType == "json" && fs.writeFile("./download/" + e.fileName, JSON.stringify(r), "utf-8", u => {
                        if (u)
                            return logger.log("fatal", u);
                        {
                            let d = "./download/" + e.fileName;
                            s(0, d);
                        }
                    });
            }
        }
        catch (a) {
            s("err", a.message);
        }
    }
    async userImport(e, s) {
        if (path.extname(e.originalFilename) == ".csv") {
            let t = ["\u6635\u79F0", "\u7528\u6237ID", "\u7528\u6237\u540D", "\u63CF\u8FF0", "\u7528\u6237\u7C7B\u578B", "\u7528\u6237\u7EC4\u540D", "\u521B\u5EFA\u65F6\u95F4", "\u4FEE\u6539\u65F6\u95F4", "\u5BC6\u7801\u6709\u6548\u671F", "\u5BC6\u7801\u4FEE\u6539\u65F6\u95F4", "\u7528\u6237\u5931\u6548", "\u7528\u6237\u542F\u7528/\u7981\u7528", "\u57DF\u540D", "\u6269\u5C55\u4FE1\u606F"], n = e.path.split("\\")[1], l = await userDao.getUsersByTenantId(e.tenantId);
            const u = fs.createReadStream("./upload/" + n, { encoding: "binary" });
            let d = "", i;
            u.on("error", g => { logger.log("fatal", "\u8BFB\u53D6\u884C\u9519\u8BEF"), logger.log("fatal", g); }), u.on("data", g => { d += g; }), u.on("end", () => {
                const g = Buffer.from(d, "binary");
                i = iconv.decode(g, "GBK"), fs.unlink("./upload/" + n, function (m) {
                    if (m)
                        return logger.log("fatal", m), !1;
                    logger.log("debug", "\u6587\u4EF6\u5220\u9664\u6210\u529F");
                });
                let p = i.split(`\r
`), o = p[0].replace(/\"/g, "");
                var c = {};
                if (c.errorCode = 404, c.message = "\u683C\u5F0F\u9519\u8BEF", o.toString() !== t.toString())
                    s(0, c);
                else {
                    p.splice(0, 1), p.splice(p.length - 1, 1);
                    let m = userService._createNewData(p, e), w = uuid.v1(), U = userService._contradistinction(l, m).failData;
                    if (userMap.set(w, m), U.length > 0) {
                        let N = {}, y = [];
                        for (let f = 0; f < U.length; f++)
                            y.push({ allow: !1, userName: U[f].userName, sourceUserName: U[f].userName });
                        N.code = 1, N.message = responseMsg.userManage.USER_NAME_REPEAT, N.data = { cmdId: w, userList: y }, s(N);
                    }
                    else if (U.length === 0)
                        if (userDao.exportUser(m)) {
                            userMap.remove(w);
                            let y = {}, f = [];
                            for (let I = 0; I < m.length; I++)
                                f.push({ success: !0, userName: m[I].userName });
                            y.code = 0, y.message = responseMsg.userManage.INPUT_FILE_SUCCESS, y.data = { cmdId: w, userList: f }, s(y);
                        }
                        else
                            s("err");
                }
            });
        }
        else if (path.extname(e.originalFilename) == ".json") {
            let a = e.path.split("\\")[1], n = fs.readFileSync("./upload/" + a), l = JSON.parse(n), u = userService._createNewData(l, e), d = uuid.v1(), g = userService._contradistinction(u, sysUserList).fileData;
            if (userMap.set(d, u), g.length > 0) {
                let p = [];
                for (let o = 0; o < g.length; o++)
                    p.push({ allow: !1, userName: g[o].userName, sourceUserName: g[o].userName });
                status.code = 1, status.message = responseMsg.userManage.USER_NAME_REPEAT, status.data = { cmdId: d, userList: p }, s(status);
            }
            else if (g.length === 0)
                if (userDao.exportUser(u)) {
                    userMap.remove(d);
                    let o = {}, c = [];
                    for (let m = 0; m < u.length; m++)
                        c.push({ success: !0, userName: u[m].userName });
                    o.code = 0, o.message = responseMsg.userManage.INPUT_FILE_SUCCESS, o.data = { cmdId: d, userList: c }, s(o);
                }
                else
                    s("err");
        }
    }
    async replaceUserImport(e, s) {
        let t = e.cmdId, r = e.type, a = e.userList, n = userMap.get(t), u = (await userDao.getUsersByTenantId(e.tenantId)).concat(n), d = userService._contradistinctionReplace(a, u);
        if (r == "query") {
            let i = {};
            i.code = 1, i.message = responseMsg.userManage.USER_NAME_REPEAT, i.data = { cmdId: t, userList: d }, s(i);
        }
        else if (r == "submit") {
            let i = [], g = [];
            for (let m = 0; m < d.length; m++)
                d[m].allow ? g.push(d[m]) : i.push({ userName: d[m].userName, sourceUserName: d[m].sourceUserName, explain: responseMsg.userManage.USER_NAME_REPEAT });
            let p = userService._insertUser(n, i), o = userService._replaceUser(p, g);
            if (userDao.exportUser(o)) {
                userMap.remove(t);
                let m = {}, w = [];
                for (let E = 0; E < p.length; E++)
                    w.push({ success: !0, userName: p[E].userName });
                m.code = 0, m.message = responseMsg.userManage.INPUT_FILE_SUCCESS, m.data = { cmdId: t, userList: w.concat(i) }, s(m);
            }
            else
                s("err");
        }
    }
    static _createNewData(e, s) {
        let t = [];
        for (let r = 0; r < e.length; r++) {
            let n = e[r].replace(/\"/g, "").split(","), l = n.slice(13, n.length), u = { nickName: n[0], userName: n[2], description: n[3], userType: n[4], groupId: n[5], createdTime: n[6], lastEditTime: n[7], passwordValidTime: n[8], lastPasswordEditTime: n[9], userInvalid: n[10], isLock: n[11], domainName: n[12], extendField: l, password: "KF_REFERENCE_REDACTED", tenantId: s.tenantId, createdId: s.userId, isUse: "1", loginErrNumber: "6", isMultiLogin: "0", invalidDate: "2080-01-01 00:00:00", userBan: "0", phone: "", email: "" };
            t.push(u);
        }
        return t;
    }
    static _contradistinction(e, s) {
        let t = {}, r = [];
        for (let a = 0; a < e.length; a++)
            for (let n = 0; n < s.length; n++)
                e[a].userName == s[n].userName && (r.push(e[a]), e.splice(a, 1));
        return t.failData = r, t.saveData = e, t;
    }
    static _contradistinctionReplace(e, s) {
        const t = s.filter(r => r.userId);
        e.map(r => { r.allow = !0; });
        for (let r = 0; r < e.length; r++)
            for (let a = 0; a < t.length; a++)
                if (e[r].userName == t[a].userName) {
                    e[r].allow = !1;
                    continue;
                }
        return e;
    }
    static _insertUser(e, s) { const t = s.map(a => a.sourceUserName), r = []; return e.map(a => { t.includes(a.userName) || r.push(a); }), r; }
    static _replaceUser(e, s) {
        const t = {};
        s.map(r => { t[r.sourceUserName] = r.userName; });
        for (let r = 0; r < e.length; r++)
            e[r].userName = t[e[r].userName];
        return e;
    }
    static _randomPassword(e) {
        let s = new Array("A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"), t = "", r = s.length;
        for (let a = 0; a < e; a++) {
            let n = Math.floor(Math.random() * r);
            t += s[n];
        }
        return t;
    }
    static _getRetrieveList(e) { const s = []; return e.data.map(t => { const r = t.groupId; t.retrieve && s.push(r); }), s; }
    static _judgeBlackNameExist(e, s) {
        let t = !1;
        for (let r = 0; r < s.length; r++) {
            let a = s[r];
            e.search(a) != -1 && (t = !0);
        }
        return t;
    }
    async passwordReg(e) {
        try {
            let s = {};
            return (await securityDao.getSecurity(e.tenantId)).msg.passwordPolicy === "strong" ? s = verify.strongPasswordReg(e.password) : s = verify.weakPasswordReg(e.password), s;
        }
        catch (s) {
            throw new Error(s);
        }
    }
    async chanageUser(e, s) { let t = await userDao.updateUserByuserId(e); t.err == null && s(t); }
    async judgeDomainName(e) {
        try {
            let s = {}, t = !0, r = null;
            return /^[\u4e00-\u9fa5a-zA-Z][\u4e00-\u9fa5a-zA-Z\d]{0,31}$/.test(e.domainName) ? await tenantInfoDao.editDomainNameIfExist(e) ? (t = !1, r = responseMsg.paramReg.DOMAIN_REPEAT, s.domainNameFlag = t, s.msg = r, s) : (s.flag = t, s.msg = null, s) : (t = !1, r = responseMsg.paramReg.DOMAIN_NAME, s.domainNameFlag = t, s.msg = r, s);
        }
        catch (s) {
            throw new Error(s);
        }
    }
    async firstUserUpdate(e, s) {
        let t = this, { userName: r, oldPassword: a, newPassword: n } = e, { password: l, saltKey: u, isFirstLogin: d, passwordValidTime: i, lastPasswordEditTime: g } = await userDao.getUserInfoByNamePromise(r), p = !1;
        if (i != 0) {
            let [o, c] = g.split(" "), m = utils._addDays(new Date(o), i), w = `${utils._formaDate(m)} ${c}`;
            new Date(w).getTime() <= new Date().getTime() && (p = !0);
        }
        if (d || p) {
            if (l !== crypto.encryptSha512ed(a, u))
                return s({ code: -2, message: "\u65E7\u5BC6\u7801\u9519\u8BEF" }, null);
            let o = crypto.randomString(16), c = crypto.encryptSha512ed(n, o);
            const m = await userDao.firstUserUpdate(r, c, o);
            m.err ? s({ code: -3, message: m.err.message }, null) : s(null, responseMsg.userManage.UPDATE_PASSWORD_SUCCESS);
        }
        else
            return s({ code: -1, message: "\u975E\u9996\u6B21\u767B\u9646\u6216\u5BC6\u7801\u8FC7\u671F\u4E0D\u80FD\u8C03\u7528\u8BE5\u63A5\u53E3\u4FEE\u6539\u5BC6\u7801" }, null);
    }
    async ssoLogin(e, s) {
        let t = this;
        (!global.cacheManage.globalCache || !global.cacheManage.globalCache.common || !global.cacheManage.globalCache.common.userEmployeeIdSSO) && s({ code: -5, message: "\u672A\u5F00\u542F\u5355\u70B9\u767B\u5F55" }, null);
        let { authState: r, userId: a, client_id: n, client_secret: l } = e, u = await userDao.ssoLogin(r, a);
        if (u.err === null) {
            if (u.msg.length === 0) {
                s(r ? { code: -2, message: "\u672A\u83B7\u53D6\u5230\u7528\u6237\u5DE5\u53F7\u4FE1\u606F\uFF08\u6388\u6743\u72B6\u6001\uFF09" } : { code: -3, message: "\u672A\u83B7\u53D6\u5230\u7528\u6237\u5DE5\u53F7\u4FE1\u606F\uFF08\u672A\u6388\u6743\u72B6\u6001\uFF09" }, null);
                return;
            }
            let { userId: d, userName: i, password: g } = u.msg[0], p = { grant_type: "password", client_id: n, client_secret: l, username: i, password: g, redirect_uri: "/", ip: "127.0.0.1" }, o = await interfaces.authCodeInterface(p);
            o.err === null ? (o.msg.userName = i, s(null, o.msg)) : s({ code: -4, message: "\u83B7\u53D6\u6388\u6743\u4FE1\u606F\u5931\u8D25" }, null);
        }
        else
            return s({ code: -1, message: u.err.message }, null);
    }
    async multiModifyUser(e, s, t) {
        try {
            let r = this, a = await groupDao.getGroupList(s);
            if (a.err)
                return t("err_inside", "get group err");
            a = a.msg;
            let n = new Map;
            for (let i = 0; i < a.length; i++)
                n.set(a[i].groupName, a[i].groupId);
            let l = await roleDao.getRoleList(s);
            if (l.err)
                return t("err_inside", "get role err");
            l = l.msg;
            let u = new Map;
            for (let i = 0; i < l.length; i++)
                u.set(l[i].roleName, l[i].roleId);
            e = e.map(i => (i.groupId = i.groupName === "root" || !n.get(i.groupName) ? -1 : n.get(i.groupName), delete i.groupName, i.roles = JSON.stringify(i.roles.map(g => u.get(g)).filter(g => g)), i)), console.log(e, a);
            let d = [];
            for (let i = 0; i < e.length; i++) {
                let g = await (async () => new Promise((p, o) => { r.editUser(e[i], (c, m) => { p(c === null ? 0 : -1); }); }))();
                d.push(g);
            }
            t("success", d);
        }
        catch (r) {
            t("err", r.message);
        }
    }
    multiQueryUser(e, s, t) {
        try {
            this.getUserList({ operator: s, groupIds: [] }, (r, a) => {
                if (r !== "success")
                    return t(r, a);
                var n = [];
                return a.forEach(l => { e.indexOf(l.userName) > -1 && n.push({ userName: l.userName, groupName: l.groupName, isMultiLogin: l.isMultiLogin, passwordValidTime: l.passwordValidTime, roles: l.roleIds || [], userType: l.userType, userId: l.userId }); }), t(r, n);
            });
        }
        catch (r) {
            t("err", r.message);
        }
    }
    async multiResetPassword(e, s) {
        try {
            let t = this;
            const r = [];
            for (let a = 0; a < e.length; a++) {
                let n = await (async () => new Promise((l, u) => { t.resetDesPassword(e[a].userId, e[a].password, (d, i) => { l(0); }); }))();
                r.push(n);
            }
            return s("success", r);
        }
        catch (t) {
            s("err", t.message);
        }
    }
    async editUserPassWordValid(e, s) {
        try {
            let { userArray: t, passWordValid: r } = e;
            for (let a = 0; a < t.length; a++)
                await userDao.updateUserPassWordValid(t[a], Number(r));
            s("success", "\u5BC6\u7801\u8FC7\u671F\u65F6\u95F4\u4FEE\u6539\u6210\u529F");
        }
        catch (t) {
            s("err", t.message);
        }
    }
}
module.exports = new userService;
// end
