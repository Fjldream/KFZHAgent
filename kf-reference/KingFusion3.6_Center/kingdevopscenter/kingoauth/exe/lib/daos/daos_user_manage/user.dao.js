// modified by jinlong.feng at 2026-10-29 KF源码精简入库
// Reference snapshot: credential literals redacted; do not deploy this copy.
const { enums: publicEnums } = require(__DIR + "/lib/services/common/public"), BaseDao = require(__DIR + "/lib/daos/daos_user_manage/base.dao.js"), { util } = require(__DIR + "/core/utils");
class userDao extends BaseDao {
    constructor() { super(), this.tableName = "user", this.userId = "userId", this.tenantId = "tenantId", this.userName = "userName", this.password = "KF_REFERENCE_REDACTED", this.groupId = "groupId", this.roles = "roles", this.description = "description", this.isMultiLogin = "isMultiLogin", this.nickName = "nickName", this.userType = "userType", this.createdId = "createdId", this.createdTime = "createdTime", this.lastEditTime = "lastEditTime", this.isUse = "isUse", this.isLock = "isLock", this.loginErrNumber = "loginErrNumber", this.lastLoginErrTime = "lastLoginErrTime", this.passwordValidTime = "passwordValidTime", this.userInvalid = "userInvalid", this.invalidDate = "invalidDate", this.userBan = "userBan", this.phone = "phone", this.email = "email", this.lastPasswordEditTime = "lastPasswordEditTime", this.realName = "realName", this.companyName = "companyName", this.isFirstLogin = "isFirstLogin", this.saltKey = "saltKey", this.isSSO = "isSSO", this.extendField = "extendField"; }
    getUserInfo(t, e) {
        let n = this, s = n.getdb(), a = `SELECT * FROM ${n.tableName} WHERE ${n.userId} = $userId and isUse = 1`, l = { $userId: t };
        s.get(a, l, function (r, i) {
            if (!i) {
                e({ message: responseMsg.userManage.SELECT_DATA_IS_NULL }, i);
                return;
            }
            e(null, i);
        });
    }
    async getUserInfoPromise(t) {
        let e = this, n = e.getdb();
        return new Promise(function (s, a) {
            let l = `SELECT * FROM ${e.tableName} WHERE ${e.userId} = $userId and isUse = 1`, r = { $userId: t };
            n.get(l, r, function (i, d) {
                if (i)
                    throw new Error(i);
                d ? s(d) : a(new Error(responseMsg.userManage.SELECT_DATA_IS_NULL));
            });
        });
    }
    async getMulitUserInfoPromise(t) {
        let e = this, n = e.getdb();
        return new Promise(function (s, a) {
            const l = t.map(() => "?").join(",");
            let r = `SELECT * FROM ${e.tableName} WHERE ${e.userId} IN (${l}) and isUse = 1`;
            n.all(r, t, function (i, d) {
                if (i)
                    throw new Error(i);
                d.length > 0 ? s(d) : a(new Error(responseMsg.userManage.SELECT_DATA_IS_NULL));
            });
        });
    }
    async getUserInfoByName(t, e) {
        let n = this, s = n.getdb(), a = `SELECT * FROM ${n.tableName} WHERE ${n.userName} = $userName and isUse = 1`, l = { $userName: t };
        s.get(a, l, function (r, i) {
            if (!i) {
                e(r, i);
                return;
            }
            e(null, i);
        });
    }
    async getUserInfoByNamePromise(t) {
        let e = this, n = e.getdb();
        return new Promise(function (s, a) {
            let l = `SELECT * FROM ${e.tableName} WHERE ${e.userName} = $userName and isUse = 1`, r = { $userName: t };
            n.get(l, r, function (i, d) {
                if (i)
                    throw new Error(i);
                s(d || responseMsg.userManage.SELECT_DATA_IS_NULL);
            });
        });
    }
    getUsersInfoBySuperManager(t) {
        let e = this, n = e.getdb();
        return new Promise(function (s, a) {
            var l = n.prepare(`SELECT * FROM ${e.tableName} WHERE ${e.userId} =? and isUse= 1 and userType != "03"`);
            if (t.length > 0) {
                var r = [];
                for (let i = 0; i < t.length; i++)
                    l.get(t[i].userId, function (d, u) { d && a(new Error(d)), s(u ? r : null); });
            }
            else
                s(null);
        }).catch(function (s) { reject(s); });
    }
    getUsersInfoBySystemManager(t) {
        let e = this, n = e.getdb();
        return new Promise(function (s, a) {
            var l = n.prepare(`SELECT * FROM ${e.tableName} WHERE ${e.userId} =? and isUse= 1`);
            if (t.length > 0) {
                var r = [];
                for (let i = 0; i < t.length; i++)
                    l.get(t[i].userId, function (d, u) { d && a(new Error(d)), s(u ? r : null); });
            }
            else
                s(null);
        }).catch(function (s) { reject(s); });
    }
    async createTenantTables(t) {
        let n = this.getdb(), s = `CREATE TABLE "role_${t}" (
            "roleId"  INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            "roleName"  TEXT(255) NOT NULL,
            "description"  TEXT(255),
            "createdTime"  TEXT(255),
            "lastEditTime"  TEXT(255)
            );`, a = `CREATE TABLE "group_${t}" (
            "groupId"  INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            "groupName"  TEXT(255) NOT NULL,
            "description"  TEXT(255),
            "parentGroupId"  INTEGER,
            "createdTime"  TEXT(255),
            "lastEditTime"  TEXT(255)
        );`, l = `CREATE TABLE "security_${t}" (
            "blackList"  TEXT(255),
            "passwordPolicy"  TEXT(255),
            "lockingTotal"  INTEGER,
            "lockingMinute"  INTEGER,
            "multiTerminal"  INTEGER,
            "accountExpired"  INTEGER,
            "expiredTime"  INTEGER
        );`, r = `INSERT INTO "security_${t}" VALUES ('admin', 'weak', 6, 10, 0, 1, 150);`, i = {};
        return new Promise(function (d, u) { n.run(s, i, function (o) { o !== null ? u(new Error(o)) : n.run(a, i, function (m) { m !== null ? u(new Error(m)) : n.run(l, i, function (I) { I !== null ? u(new Error(I)) : n.run(r, i, function ($) { $ !== null ? u(new Error($)) : d({ err: null }); }); }); }); }); });
    }
    async deleteTenantTables(t) { let n = this.getdb(), s = `DROP TABLE "role_${t}"`, a = `DROP TABLE "group_${t}"`, l = `DROP TABLE "security_${t}"`, r = {}; return new Promise(function (i, d) { n.run(s, r, function (u) { u !== null ? i({ err: u }) : n.run(a, r, function (o) { o !== null ? i({ err: o }) : n.run(l, r, function (m) { i(m !== null ? { err: m } : { err: null }); }); }); }); }); }
    async deleteTenantUsers(t) { let e = this, n = e.getdb(); return new Promise(function (s, a) { let l = `delete from ${e.tableName} where ${e.tenantId} = $tenantId`, r = { $tenantId: t }; n.run(l, r, function (i) { s(i !== null ? { err: i } : { err: null }); }); }); }
    async insertUser(t) {
        let e = this, n = e.getdb(), s = `INSERT INTO ${e.tableName} 
        (
            ${e.tenantId},
            ${e.userName},
            ${e.password},
            ${e.groupId},
            ${e.roles},
            ${e.description},
            ${e.isMultiLogin},
            ${e.nickName},
            ${e.userType},
            ${e.createdId},
            ${e.createdTime},
            ${e.lastEditTime},
            ${e.isUse},
            ${e.isLock},
            ${e.loginErrNumber},
            ${e.passwordValidTime},
            ${e.userInvalid},
            ${e.invalidDate},
            ${e.userBan},
            ${e.phone},
            ${e.email},
            ${e.lastPasswordEditTime},
            ${e.realName},
            ${e.companyName},
            ${e.isFirstLogin},
            ${e.saltKey},
            ${e.isSSO},
            ${e.extendField}
        ) VALUES( 
            $tenantId,
            $userName,
            $password,
            $groupId,
            $roles,
            $description,
            $isMultiLogin,
            $nickName,
            $userType, 
            $createdId,
            (datetime('now','localtime')),
            (datetime('now','localtime')),
            $isUse,
            $isLock,
            $loginErrNumber,
            $passwordValidTime,
            $userInvalid,
            $invalidDate,
            $userBan,
            $phone,
            $email,
            (datetime('now','localtime')),
            $realName,
            $companyName,
            $isFirstLogin,
            $saltKey,
            $isSSO,
            $extendField
        )`, a = { $tenantId: t.tenantId, $userName: t.userName, $password: t.encodePsw, $groupId: t.groupId, $roles: t.roles, $description: t.description, $isMultiLogin: t.isMultiLogin, $nickName: t.nickName, $userType: t.userType, $createdId: t.createdId, $isUse: 1, $isLock: 0, $loginErrNumber: 0, $passwordValidTime: t.passwordValidTime, $userInvalid: t.userInvalid, $invalidDate: t.invalidDate, $userBan: t.userBan, $phone: t.phone, $email: t.email, $realName: t.realName, $companyName: t.companyName, $isFirstLogin: t.isFirstLogin, $saltKey: t.saltKey, $isSSO: t.isSSO, $extendField: t.extendField };
        return new Promise(function (l, r) { n.run(s, a, function (i) { i !== null ? r(new Error(i)) : l({ err: null }); }); });
    }
    async updateUser(t) {
        let e = this, n = e.getdb();
        const s = (l, r = {}) => new Promise((i, d) => {
            n.get(l, r, (u, o) => {
                if (u)
                    return d(u);
                i(o);
            });
        }), a = (l, r = {}) => new Promise((i, d) => {
            n.run(l, r, u => {
                if (u)
                    return d(u);
                i({ changes: this.changes, lastID: this.lastID });
            });
        });
        try {
            if (!t || !t.userId)
                return reject(new Error("missing userId"));
            const l = [], r = { $id: t.userId };
            l.push(`${e.lastEditTime} = (datetime('now','localtime'))`);
            const i = { id: e.userId, userName: e.userName, userType: e.userType, nickName: e.nickName, groupId: e.groupId, description: e.description, isMultiLogin: e.isMultiLogin, isSSO: e.isSSO, passwordValidTime: e.passwordValidTime, userInvalid: e.userInvalid, invalidDate: e.invalidDate, userBan: e.userBan, roles: e.roles, extendField: JSON.stringify(e.extendField) };
            for (const [o, m] of Object.entries(i))
                t[o] !== void 0 && (l.push(`${m} = $${o}`), o === "extendField" ? r[`$${o}`] = t.extendField == null ? null : JSON.stringify(t.extendField) : r[`$${o}`] = t[o]);
            if (l.length === 1 && resolve({ err: null }), r.$userName !== void 0) {
                const o = `SELECT COUNT(*) AS count FROM ${e.tableName} WHERE ${e.userName} = $userName AND ${e.userId} <> $id`, m = await s(o, { $userName: r.$userName, $id: r.$id });
                if (m && m.count > 0)
                    return { err: responseMsg.userManage.USER_NAME_REPEAT };
            }
            const d = `UPDATE ${e.tableName} SET ${l.join(`,
`)} WHERE "${e.userId}" = $id and isUse = 1`;
            return { err: null, changes: (await a(d, r)).changes };
        }
        catch { }
    }
    async bulkUpdateRoles(t, e, n, s = { atomic: !0 }) {
        let a = this;
        const l = !!s.atomic, r = 1e3, i = a.getdb();
        if (!Array.isArray(t) || t.length === 0)
            return resolve({ err: null, results: [] });
        if (t.length > r)
            return reject(new Error(`update roles items batch too large, max ${r}`));
        const d = ($, c = []) => new Promise((f, E) => {
            try {
                i.run($, c, function (g) {
                    if (g)
                        return E(g);
                    f(this);
                });
            }
            catch (g) {
                E(g);
            }
        }), u = $ => new Promise((c, f) => {
            try {
                typeof i.exec == "function" ? i.exec($, E => E ? f(E) : c()) : i.run($, [], function (E) { E ? f(E) : c(); });
            }
            catch (E) {
                f(E);
            }
        }), o = [], m = $ => Array.isArray($) ? JSON.stringify($) : $ === null || typeof $ > "u" ? "" : String($), I = `UPDATE ${this.tableName}
            SET ${this.roles} = $roles, ${this.lastEditTime} = (datetime('now','localtime'))
            WHERE ${this.userId} = $userId AND ${this.tenantId} = $tenantId AND isUse = 1`;
        if (l)
            try {
                await u("BEGIN TRANSACTION");
                for (const $ of t) {
                    const c = m(e), f = { $roles: c, $userId: $.userId, $tenantId: $.tenantId }, E = await d(I, f);
                    if (E && E.changes && E.changes > 0)
                        o.push({ userId: $.userId, status: "success", newRoles: c });
                    else
                        throw new Error(`not found or nochange for userId ${$.userId}`);
                }
                return await u("COMMIT"), { err: null, results: o };
            }
            catch ($) {
                try {
                    await u("ROLLBACK");
                }
                catch { }
                throw $;
            }
        else
            for (const $ of t)
                try {
                    const c = m(e), f = { $roles: c, $userId: $.userId, $tenantId: $.tenantId }, E = await d(I, f);
                    if (E && E.changes && E.changes > 0)
                        o.push({ userId: $.userId, status: "success", newRoles: c });
                    else
                        throw new Error(`not found or nochange for userId ${$.userId}`);
                }
                catch (c) {
                    o.push({ userId: $.userId, status: "failed", reason: c.message || String(c) });
                }
    }
    async exportUser(t) {
        let e = this, n = e.getdb();
        return new Promise(function (s, a) {
            var l = n.prepare(`INSERT INTO ${e.tableName} VALUES(NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
            let r = {};
            if (t.length > 0)
                for (let i = 0; i < t.length; i++)
                    r = t[i], l.run(r.tenantId, r.userName, r.password, r.groupId, r.description, r.isMultiLogin, r.nickName, r.userType, r.createdId, r.createdTime, r.lastEditTime, r.isUse, r.isLock, r.loginErrNumber, r.lastLoginErrTime, r.lastPasswordEditTime, r.passwordValidTime, r.userInvalid, r.invalidDate, r.userBan, r.phone, r.email, async function (d) { d !== null ? a(d) : s({ data: t, err: null }); });
            else
                s({ err: responseMsg.userManage.USER_IS_NOT_EXIST, data: null });
        });
    }
    async getSysUserList(t) {
        var e = [];
        let s = this.getdb(), a = " select userId from user where createdId = $userId  and isUse = 1", l = { $userId: t.userId };
        return new Promise(function (r, i) {
            s.all(a, l, function (d, u) {
                if (d)
                    throw new Error(d);
                r(u);
            });
        });
    }
    async getUserList(t, e) { let n = this, s = n.getdb(), a = "WITH RECURSIVE UNDER_(ID) AS(VALUES($groupId) UNION ALL SELECT a.powerGroupId  FROM POWER_GROUP a JOIN UNDER_ ON a.parentGroupId = under_.ID) select b.*  FROM UNDER_ a , user b where a.id = b.groupId and isUse = 1"; var l = []; s.all(a, { $groupId: t }, function (r, i) { i.length > 0 ? i.forEach(d => { n.getUserInfo(d.userId, function (u, o) { o && l.push(o), d == i[i.length - 1] && e(u, l); }); }) : e(r, l); }); }
    async getUserListPromise(t, e) {
        let n = this, s = n.getdb();
        return new Promise(function (a, l) {
            let r = `SELECT * FROM ${n.tableName} WHERE tenantId = $tenantId and isUse = 1`;
            e.length > 0 && (r += ` and (groupId = ${e[0]}`);
            for (let d = 1; d < e.length; d++)
                r += ` or groupId = ${e[d]}`;
            e.length > 0 && (r += ")");
            let i = { $tenantId: t };
            s.all(r, i, function (d, u) {
                if (d)
                    throw new Error(d);
                a(u);
            });
        });
    }
    async getRoleUserList(t, e) {
        let n = this, s = n.getdb(), a = `group_${t}`;
        return new Promise(function (l, r) {
            let i = `
                SELECT 
                    "${n.tableName}".${n.userId}, 
                    "${n.tableName}".${n.userName}, 
                    "${n.tableName}".${n.groupId}, 
                    "${a}".groupName, 
                    "${n.tableName}".${n.roles}, 
                    "${n.tableName}".${n.description} 
                FROM 
                    "${n.tableName}" LEFT JOIN "${a}" ON "user".groupId = "${a}".groupId
                WHERE 
                    "${n.tableName}".${n.tenantId} = $tenantId 
                    AND "${n.tableName}".${n.roles} != ""
                    AND "${n.tableName}".isUse = 1
                `, d = { $tenantId: t };
            s.all(i, d, function (u, o) { l(u !== null ? { err: u, msg: null } : { err: null, msg: o }); });
        });
    }
    async getUsersByGroup(t, e) { var n = []; let s = this; s.getdb().all(`SELECT userId FROM ${s.tableName} WHERE ${s.groupId} = $groupId and isUse= 1`, { $groupId: t }, function (l, r) { r.length > 0 ? r.forEach(i => { s.getUserInfo(i.userId, function (d, u) { u && n.push(u), i == r[r.length - 1] && e(null, n); }); }) : e(l, null); }); }
    async getUsersByTenantId(t) {
        var e = [];
        let n = this, s = n.getdb();
        return new Promise(function (a, l) {
            s.all(`SELECT * FROM ${n.tableName} WHERE ${n.tenantId} = $tenantId and isUse= 1`, { $tenantId: t }, function (r, i) {
                if (r)
                    throw Error(r);
                a(i);
            });
        });
    }
    async updateUserById(t, e, n) {
        let s = this;
        s.getdb().run(`UPDATE ${s.tableName} SET ${e} = $value WHERE ${s.userId} = $id and isUse = 1`, { $id: t, $value: n }, function (l) {
            if (l !== null)
                throw Error(l);
            logger.log("debug", `Get id =${t} data success!`);
        });
    }
    async updateUserByuserId(t) { let e = this, n = e.getdb(); return new Promise((s, a) => { n.run(`UPDATE ${e.tableName} SET companyName = 1 WHERE ${e.userId} = $id and isUse = 1`, { $id: t.userId }, function (l) { s(l !== null ? l : { err: null, message: "\u6807\u8BC6\u7B26\u4FEE\u6539\u6210\u529F" }); }); }); }
    async updateExtendField(t) {
        let n = this.getdb();
        return new Promise(function (s, a) {
            n.run("delete from extend_field where userId = $userId", { $userId: t.userId }, function (r) {
                if (r)
                    throw new Error(r);
                s({ err: null });
            });
        });
    }
    async updatePassword(t, e, n) { const s = this, a = s.getdb(); return new Promise((l, r) => { let i = `UPDATE ${s.tableName} SET ${s.password} = $password, ${s.lastPasswordEditTime} = datetime('now','localtime'), ${s.saltKey} = $saltKey, isFirstLogin = $isFirstLogin WHERE ${s.userId} = $id and isUse = 1`, d = { $id: t, $password: e, $saltKey: n, $isFirstLogin: 0 }; a.run(i, d, u => { u !== null ? r({ err: u }) : l({ err: null }); }); }); }
    async resetPassword(t, e, n) {
        let s = this, a = s.getdb();
        return new Promise(function (l, r) {
            let i = `UPDATE ${s.tableName} SET ${s.password} = $password, ${s.saltKey} = $saltKey, ${s.lastPasswordEditTime} = (datetime('now','localtime')), isFirstLogin = $isFirstLogin WHERE ${s.userId} = $userId and isUse = 1`, d = { $userId: t, $password: e, $saltKey: n, $isFirstLogin: 1 };
            a.run(i, d, function (u) {
                if (u !== null)
                    throw new Error(u);
                l(null);
            });
        });
    }
    resetDesPassword(t, e, n) {
        let s = this, a = s.getdb();
        return new Promise(function (l, r) {
            let i = `UPDATE ${s.tableName} SET ${s.password} = $password, ${s.saltKey} = $saltKey, ${s.lastPasswordEditTime} = (datetime('now','localtime')), isFirstLogin = $isFirstLogin WHERE ${s.userId} = $userId and isUse = 1`, d = { $userId: t, $password: e, $saltKey: n, $isFirstLogin: 0 };
            a.run(i, d, function (u) {
                if (u !== null)
                    throw new Error(u);
                l(null);
            });
        });
    }
    async getUserIdByTenantIdAndName(t, e) { let n = this, s = n.getdb(); return new Promise(function (a, l) { s.get(`SELECT * FROM ${n.tableName} WHERE ${n.tenantId} = $tenantId and ${n.userName} = $userName and isUse = 1`, { $tenantId: t, $userName: e }, function (r, i) { r ? l(new Error(r)) : a({ err: null, msg: i.userId }); }); }); }
    async getUserpwdByName(t, e) { let n = this, s = n.getdb(); return new Promise(function (a, l) { s.get(`SELECT * FROM ${n.tableName} WHERE ${n.tenantId} = $tenantId and ${n.userName} = $userName and isUse = 1`, { $tenantId: t, $userName: e }, function (r, i) { r ? l(new Error(r)) : a({ err: null, msg: i.password }); }); }); }
    async getUserById(t, e) {
        let n = this;
        n.getdb().get(`SELECT * FROM ${n.tableName} WHERE ${n.userId} = $id and isUse = 1`, { $id: t }, function (a, l) {
            if (a !== null)
                throw Error(a);
            logger.log("debug", `Get id =${t} data success! `), e(l);
        });
    }
    async deleteUserByIds(t) {
        let e = this, n = e.getdb();
        return new Promise(function (s, a) {
            var l = n.prepare(`delete from ${e.tableName} WHERE ${e.userId} = ?`);
            for (let r = 0; r < t.length; r++)
                l.run(t[r], function (i) {
                    if (i)
                        throw new Error(i);
                    r === t.length - 1 && s({ err: null, data: responseMsg.userManage.DELETE_SUCCESS });
                });
        });
    }
    editIfExist(t) { let e = this, n = e.getdb(); return new Promise(function (s, a) { var l, r; t.userType === publicEnums.enumUserType.SYSTEM_TYPE ? (l = `SELECT * FROM ${e.tableName} WHERE ${e.userName} = $userName and userType = $userType and userId <>$userId and isUse=1`, r = { $userType: t.userType, $userName: t.userName, $userId: t.userId }) : (l = `SELECT * FROM ${e.tableName} WHERE ${e.userName} = $userName and tenantId = $tenantId and userId <>$userId and isUse=1`, r = { $userName: t.userName, $tenantId: t.tenantId, $userId: t.userId }), n.all(l, r, function (i, d) { i !== null ? a(new Error(i)) : parseInt(d.length) > 0 ? s(!0) : s(!1); }); }); }
    async ifExist(t) { let e = this, n = e.getdb(); return new Promise(function (s, a) { let l = `SELECT COUNT(0) num FROM ${e.tableName} WHERE ${e.userName} = $userName`, r = { $userName: t }; n.get(l, r, function (i, d) { i !== null ? s({ err: i, isExist: !0 }) : parseInt(d.num) > 0 ? s({ err: null, isExist: !0 }) : (s(!1), s({ err: null, isExist: !1 })); }); }); }
    async tenantRentIfExist(t) { let e = this, n = e.getdb(); return new Promise(function (s, a) { n.get(`SELECT COUNT(0) num FROM ${e.tableName} WHERE ${e.phone} = $phone or ${e.email} = $email and isUse=1`, { $phone: t.phone, $email: t.email }, function (l, r) { l !== null ? a(new Error(l)) : parseInt(r.num) > 0 ? s(!0) : s(!1); }); }); }
    async emailIfExist(t) { let e = this, n = e.getdb(); return new Promise(function (s, a) { n.get(`SELECT COUNT(0) num FROM ${e.tableName} WHERE ${e.email} = $email and (tenantId = $tenantId or tenantId = '-1') and userId <>$userId and isUse=1`, { $email: t.email, $tenantId: t.tenantId, $userId: t.userId }, function (l, r) { l !== null ? a(new Error(l)) : parseInt(r.num) > 0 ? s(!0) : s(!1); }); }); }
    async phoneIfExist(t) { let e = this, n = e.getdb(); return new Promise(function (s, a) { n.get(`SELECT COUNT(0) num FROM ${e.tableName} WHERE ${e.phone} = $phone and (tenantId = $tenantId or tenantId = '-1') and userId <> $userId and isUse = 1`, { $phone: t.phone, $tenantId: t.tenantId, $userId: t.userId }, function (l, r) { l !== null ? a(new Error(l)) : parseInt(r.num) > 0 ? s(!0) : s(!1); }); }); }
    async updateEmail(t) {
        let e = this, n = e.getdb();
        return new Promise(function (s, a) {
            n.run(`UPDATE ${e.tableName} SET ${e.lastEditTime}=(datetime('now','localtime')), ${e.email}  = $email WHERE ${e.userId}  = $id and isUse = 1`, { $id: t.userId, $email: t.email }, function (l) {
                if (l !== null)
                    throw a({ err: l }), Error(l);
                s({ err: null });
            });
        });
    }
    async updatePhone(t) {
        let e = this, n = e.getdb();
        return new Promise(function (s, a) {
            n.run(`UPDATE ${e.tableName} SET ${e.lastEditTime} = (datetime('now','localtime')) , ${e.phone} = $phone, ${e.userName} = $userName WHERE ${e.userId} = $id and isUse = 1`, { $id: t.userId, $phone: t.phone, $userName: t.phone }, function (l) {
                if (l !== null)
                    throw a({ err: l }), Error(l);
                s({ err: null });
            });
        });
    }
    async ifExistByUserId(t) {
        let e = this, n = e.getdb();
        return new Promise(function (s, a) {
            n.get(`SELECT COUNT(0)  num FROM ${e.tableName} WHERE ${e.userId} = $userId and isUse = 1`, { $userId: t }, function (l, r) {
                if (l !== null)
                    throw Error(l);
                parseInt(r.num) > 0 ? s(!0) : s(!1);
            });
        });
    }
    async getTenantIdByUserName(t) {
        const e = this, n = e.getdb();
        return new Promise((s, a) => {
            n.all(`SELECT tenantId FROM ${e.tableName} WHERE ${e.userName} = $userName and isUse = 1`, { $userName: t }, (l, r) => {
                if (l !== null)
                    throw new Error(l);
                logger.log("debug", `Get userName = ${t} tenantId success!`), s(r);
            });
        });
    }
    async roleIsUsing(t) { let e = this, n = e.getdb(); return new Promise(function (s, a) { n.get(`SELECT * FROM ${e.tableName} WHERE roleId  = $roleId`, { $roleId: t }, function (l, r) { l !== null ? a({ err: l, msg: null }) : s(r ? { err: null, msg: !0 } : { err: null, msg: !1 }); }); }); }
    async getUserTypeByName(t, e) { let n = this, s = n.getdb(), a = `SELECT userType FROM ${n.tableName} WHERE userName = $userName and isUse = 1`, l = { $userName: t }; s.get(a, l, function (r, i) { r !== null ? (e(r, null), logger.log("debug", `${__filename} Get userName = ${t} tenantId success! `)) : (e(null, i), logger.log("debug", `${__filename} Get userName = ${t} tenantId success! `)); }); }
    async updateLoginUserInfoById(t) {
        let e = this, n = e.getdb();
        return new Promise(function (s, a) {
            let l = `UPDATE ${e.tableName} SET ${e.isLock} = $isLock, ${e.loginErrNumber} = $loginErrNumber, ${e.lastLoginErrTime} = $lastLoginErrTime WHERE ${e.userId}  = $id AND isUse = 1`, r = { $id: t.userId, $isLock: t.isLock, $loginErrNumber: t.loginErrNumber, $lastLoginErrTime: t.lastLoginErrTime };
            n.run(l, r, function (i) {
                if (i !== null)
                    throw a({ err: i }), Error(i);
                s({ err: null });
            });
        });
    }
    async getUserTypeByUserId(t) { let e = this, n = e.getdb(); return new Promise(function (s, a) { n.get(`SELECT userType FROM ${e.tableName} WHERE userId = $userId and  isUse = 1`, { $userId: t }, function (l, r) { l !== null ? a({ err: l, msg: null }) : s({ err: null, msg: r }); }); }); }
    async getGroupIdByUserId(t) { let e = this, n = e.getdb(); return new Promise(function (s, a) { n.get(`SELECT groupId FROM ${e.tableName} WHERE userId = $userId and isUse = 1`, { $userId: t }, function (l, r) { l !== null ? a({ err: l, msg: null }) : s({ err: null, msg: r }); }); }); }
    async insertExtendField(t) {
        let e = t.extendField, s = this.getdb(), a = "insert into extend_field values(null,?,?,?,?,?)";
        return new Promise(function (l, r) {
            var i = s.prepare(a);
            let d = [], u = Object.keys(e).length;
            if (u && u.length !== 0) {
                for (let o = 0; o < u; o++) {
                    let m = {};
                    m[Object.keys(e)[o]] = e[Object.keys(e)[o]], d.push(m);
                }
                for (let o = 0; o < d.length; o++) {
                    let m = Object.keys(d[o])[0];
                    i.run(m, "text", t.tenantId, t.extendField[m], t.userId, function (I) {
                        if (I)
                            throw new Error(I);
                        o == d.length - 1 && l({ err: null });
                    });
                }
            }
            else
                l({ err: null, msg: responseMsg.userManage.EXTEND_FIELD_IS_NULL });
        });
    }
    async findUser(t, e) { let n = this, s = n.getdb(); var a = t.seekType, l = t.seekInfo; s.get(`SELECT b.userId FROM ${n.tableName} a, user b WHERE a.roleId = b.roleId and $seekType = $seekInfo and tenantId = $tenantId`, { $seekType: a, $seekInfo: l }, function (r, i) { i.forEach(d => { n.getUserInfo(d.userId, function (u, o) { o && data.push(o), d == rows[rows.length - 1] && e(u, data); }); }); }); }
    async findUsersByUserName(t) { let e = this, n = e.getdb(); var s = t.tenantId, a = t.findValue; return new Promise(function (l, r) { var i, d; t.userType === publicEnums.enumUserType.SUPER_TYPE ? (i = `SELECT userId FROM ${e.tableName} WHERE userName like '%${a}%' and userType != $userType and isUse = 1`, d = { $userType: publicEnums.enumUserType.USER_TYPE }) : (i = `SELECT userId FROM ${e.tableName} WHERE userName like '%${a}%' and tenantId = $tenantId and isUse = 1`, d = { $tenantId: s }), n.all(i, d, function (u, o) { u !== null && r(new Error(u)), l(o || null); }); }); }
    async getUserInfoByUserId(t) {
        let e = this, n = e.getdb();
        return new Promise(function (s, a) {
            n.get(`SELECT * FROM ${e.tableName} WHERE userId = $userId and isUse = 1`, { $userId: t }, function (l, r) {
                if (l !== null)
                    throw new Error(l);
                s(r);
            });
        });
    }
    async getUserIdsByTenantId(t) {
        let e = this, n = e.getdb();
        return new Promise(function (s, a) {
            n.all(`SELECT userId FROM ${e.tableName} WHERE tenantId = $tenantId and isUse = 1`, { $tenantId: t }, function (l, r) {
                if (l !== null)
                    throw new Error(l);
                s(r);
            });
        });
    }
    async updateRealName(t) {
        let e = this, n = e.getdb();
        return new Promise(function (s, a) {
            n.run(`UPDATE ${e.tableName} SET ${e.realName} = $realName WHERE ${e.userId} = $userId and isUse = 1`, { $userId: t.userId, $realName: t.realName }, function (l) {
                if (l !== null)
                    throw new Error(l);
                s(null);
            });
        });
    }
    async updateCompanyName(t) {
        let e = this, n = e.getdb();
        return new Promise(function (s, a) {
            n.run(`UPDATE ${e.tableName} SET ${e.companyName} = $companyName WHERE ${e.userId} = $userId and isUse = 1`, { $userId: t.userId, $companyName: t.companyName }, function (l) {
                if (l !== null)
                    throw new Error(l);
                s(null);
            });
        });
    }
    async userList(t) {
        let e = this, n = e.getdb();
        return new Promise(function (s, a) {
            n.all(`SELECT * FROM ${e.tableName} WHERE groupId = $groupId and tenantId = $tenantId and isUse = 1`, { $groupId: t.groupId, $tenantId: t.tenantId }, function (l, r) {
                if (l !== null)
                    throw new Error(l);
                s(r);
            });
        });
    }
    async tenantList(t) {
        let e = this, n = e.getdb();
        return new Promise(function (s, a) {
            n.all(`SELECT * FROM ${e.tableName} WHERE userType = $userType and tenantId <> $tenantId and isUse = 1`, { $userType: t.userType, $tenantId: t.tenantId }, function (l, r) {
                if (l !== null)
                    throw new Error(l);
                s(r);
            });
        });
    }
    getUsersInfoByUserIds(t) {
        let e = this, n = e.getdb();
        return new Promise(function (s, a) {
            var l = n.prepare(`SELECT * FROM ${e.tableName} WHERE ${e.userId}  =?  and isUse = 1`);
            if (t.length > 0) {
                var r = [];
                for (let i = 0; i < t.length; i++)
                    l.get(t[i], async function (d, u) { d && a(new Error(d)), u ? (r.push(u), i === t.length - 1 && s(r)) : s(null); });
            }
            else
                s(null);
        }).catch(function (s) { reject(s); });
    }
    async getSysGroupIdByTenantId(t) {
        let e = this, n = e.getdb();
        return new Promise(function (s, a) {
            let l = `SELECT groupId FROM ${e.tableName} WHERE ${e.tenantId} = $tenantId and ${e.userType} = '02' and isUse= 1`;
            n.get(l, { $tenantId: t }, function (r, i) {
                if (r)
                    throw new Error(r);
                s(i);
            });
        });
    }
    async firstUserUpdate(t, e, n) { const s = this, a = s.getdb(); return new Promise((l, r) => { let i = `UPDATE ${s.tableName} SET ${s.password} = $password, ${s.lastPasswordEditTime} = datetime('now','localtime'), ${s.saltKey} = $saltKey, isFirstLogin = $isFirstLogin WHERE ${s.userName} = $userName and isUse = 1`, d = { $userName: t, $password: e, $saltKey: n, $isFirstLogin: 0 }; a.run(i, d, u => { l(u !== null ? { err: u } : { err: null }); }); }); }
    async ssoLogin(t, e) { let s = this.getdb(); return new Promise(function (a, l) { let r = `SELECT userId, userName, password FROM user WHERE extendField LIKE '%"\u5DE5\u53F7":"${e}"%'`, i = {}; t ? r += " AND (userType = '02' OR userType = '03' OR userType = '05')" : r += " AND userType = '02'", s.all(r, i, function (d, u) { a(d !== null ? { err: d, msg: null } : { err: null, msg: u }); }); }); }
    async updateUserPassWordValid(t, e) { let n = this, s = n.getdb(); return new Promise((a, l) => { s.run(`UPDATE ${n.tableName} SET ${n.passwordValidTime}  = $passWordValid WHERE ${n.userName}  = $userName and  isUse = 1`, { $passWordValid: e, $userName: t }, function (r) { a(r !== null ? r : { err: null, message: "\u5BC6\u7801\u8FC7\u671F\u65F6\u95F4\u4FEE\u6539\u6210\u529F" }); }); }); }
}
module.exports = new userDao;
// end
