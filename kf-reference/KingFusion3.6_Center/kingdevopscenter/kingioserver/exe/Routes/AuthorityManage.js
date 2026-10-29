// modified by jinlong.feng at 2026-10-29 KF源码精简入库
// Reference snapshot: credential literals redacted; do not deploy this copy.
var fs = require("fs"), bodyParser = require("body-parser"), express = require("express"), router = express.Router();
let formidable = require("formidable");
var path = require("path"), zipper = require("zip-local"), iconv = require("iconv-lite"), userManager = require("./userManager"), KIOUserManager = new userManager, CharacterManager = require("./CharacterInterface"), KIOCharacterManager = new CharacterManager, publicClass = require("./PublicInterface"), pubInter = new publicClass, AuthenticSystem = require("./OAuthenicSystemInterface"), userAuthenticSystem = new AuthenticSystem, LogManager = require("./LogInterface"), AuthorLogManagerObj = new LogManager, AuthorManagerName = "AuthorityManager";
const xss = require("xss");
router.use(bodyParser.json()), router.use(bodyParser.urlencoded({ extended: !0 }));
var KIO_NOPERMISS = 0, KIO_VIEWPERMISS = 1, KIO_EDITPERMISS = 2;
function getUUID() { return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (e) { var r = 16 * Math.random() | 0; return ("x" == e ? r : 3 & r | 8).toString(16); }); }
function getUrl(e, r) { return "/" + e + "/" + r + "/project"; }
function findAuthorityByChildrenIDValue(e, r, t) {
    for (var o = 0; o < e.length; o++)
        if ("authority" != e[o].Type) {
            var a = new Object;
            if ("工程管理" != e[o].Type && "工程组" != e[o].Type || (a.ProjectGroupName = e[o].text, a.ProjectGroupID = e[o].id), "工程" == e[o].Type && (a.ProjectName = e[o].text, a.ProjectVersion = e[o].Version, a.ProjectID = e[o].id), e[o].children && 0 != e[o].children.length)
                for (var n = 0; n < e[o].children.length; n++)
                    "authority" == e[o].children[n].Type && (r.find(function (r) { return r == e[o].children[n].id; }) ? a[e[o].children[n].code] = 1 : a[e[o].children[n].code] = 0);
            "工程管理" == e[o].Type && (a.ProjectGroups = new Array, e[o].children && 0 != e[o].children.length && findAuthorityByChildrenIDValue(e[o].children, r, a.ProjectGroups)), "工程组" == e[o].Type && (a.Projects = new Array, e[o].children && 0 != e[o].children.length && findAuthorityByChildrenIDValue(e[o].children, r, a.Projects)), t.push(a);
        }
}
function findUserAuthorityByIDValue(e, r, t, o) {
    for (var a = 0; a < e.length; a++) {
        var n = 0;
        r.find(function (r) { return r == e[a].userId && void 0 != e[a].userId; }) && (n = 1);
        for (var s = !1, i = 0; i < t.length; i++)
            if (t[i].userId == e[a].userId) {
                s = !0, t[i].authority = n;
                break;
            }
        if (0 == s) {
            e[a].authority = n;
            var u = new Object;
            for (var c in e[a])
                "object" != typeof e[a][c] && (u[c] = e[a][c]);
            t.push(u);
        }
        e[a].groupId && (void 0 != e[a].users && 0 != e[a].users.length && findUserAuthorityByIDValue(e[a].users, r, t, o), void 0 != e[a].children && 0 != e[a].children.length && findUserAuthorityByIDValue(e[a].children, r, t, o));
    }
}
function updateProjectSetDataAuthority(e, r) {
    for (var t = 0; t < r.ProjectGroupList.length; t++)
        if (void 0 != r.ProjectGroupList[t].ProjectID && updateProjectSetDataAuthorityByIDVersion(r.ProjectGroupList[t].ProjectID, r.ProjectGroupList[t].ProjectVersion, e), void 0 != r.ProjectGroupList[t].ProjectGroupID && void 0 != r.ProjectGroupList[t].ProjectObjectList && r.ProjectGroupList[t].ProjectObjectList.length > 0)
            for (var o = 0; o < r.ProjectGroupList[t].ProjectObjectList.length; o++)
                void 0 != r.ProjectGroupList[t].ProjectObjectList[o].ProjectID && updateProjectSetDataAuthorityByIDVersion(r.ProjectGroupList[t].ProjectObjectList[o].ProjectID, r.ProjectGroupList[t].ProjectObjectList[o].ProjectVersion, e);
}
function updateProjectSetDataAuthorityByIDVersion(e, r, t) {
    AuthorLogManagerObj.traceLog(AuthorManagerName, "Enter function updateProjectSetDataAuthorityByIDVersion");
    let o = global.sdbPath + getUrl(e, r) + "/ProjectPorpertyInfo.json";
    if (!fs.existsSync(o))
        return console.log("updateProjectSetDataAuthorityByIDVersion Error:未找到工程属性文件"), !1;
    let a = pubInter.readJson(o);
    if (a.Error)
        return void res.send(a.ErrorDesc);
    let n = a.data;
    for (var s = KIOCharacterManager.getUserListSetDataByProject(e, r, t), i = new Array, u = 0; u < s.length; u++) {
        var c = new Object;
        c.UserName = s[u].userName, c.UserID = s[u].userID, c.Authority = 1, i.push(c);
    }
    n.SetdataUsers = i;
    var d = JSON.stringify(n, "", "\t");
    try {
        fs.writeFileSync(o, d);
    }
    catch (e) {
        return console.log("updateProjectSetDataAuthorityByIDVersion 写文件错误：" + e), AuthorLogManagerObj.traceLog(AuthorManagerName, "Leave function updateProjectSetDataAuthorityByIDVersion"), !1;
    }
    return AuthorLogManagerObj.traceLog(AuthorManagerName, "Leave function updateProjectSetDataAuthorityByIDVersion"), !0;
}
router.post("/checkclientinfo", async function (e, r) { var t = e.body = pubInter.EscapeAllData(e.body); let o = await userAuthenticSystem.checkState(t.token, t.ip, t.useragent); return "object" != typeof o || o.length ? void r.send(o.error) : 0 == o.errorCode ? void r.send(o) : (r.send("查询失败"), void console.log("状态查询失败")); }), router.post("/static_getClientIp", function (e, r) { let t = {}, o = (e.headers["x-forwarded-for"] || e.connection.remoteAddress || e.socket.remoteAddress || e.connection.socket.remoteAddress).replace("::ffff:", ""), a = e.headers["user-agent"]; t.userip = o, t.userAgent = a, r.send(t); }), router.post("/reloadorquit", async function (e, r) {
    global.path = "../../../../config/devconfig.json", e.query = pubInter.EscapeAllData(e.query);
    let t = new Object, o = (e.headers["x-forwarded-for"] || e.connection.remoteAddress || e.socket.remoteAddress || e.connection.socket.remoteAddress).replace("::ffff:", ""), a = e.headers["user-agent"], n = { token: e.query.token, clientId: e.query.clientId, reload: e.query.reload, userAgent: a, ip: o };
    if (200 == (await userAuthenticSystem.ReloadOrQuit(n)).status) {
        try {
            let e = fs.readFileSync(global.path, "utf-8");
            var s = JSON.parse(e);
        }
        catch (e) {
            return t.error = e.message, void r.send(t);
        }
        return t.oauthURL = s.redirectUrl.loginURL, t.status = 200, void r.send(t);
    }
    r.send("操作失败");
}), router.post("/addToken", function (e, r, t) { AuthorLogManagerObj.traceLog(AuthorManagerName, "Enter post addToken"); var o = xss(e.headers["x-forwarded-for"]) || xss(e.connection.remoteAddress) || xss(e.socket.remoteAddress) || xss(e.connection.socket.remoteAddress); o = o.replace("::ffff:", ""); var a = new Object; a.UserName = "KingAdmin", a.Password = "KF_REFERENCE_REDACTED", a.CurrentLoginIP = o, a.IpAddr = xss(e.query.IpAddr), KIOUserManager.checkUserAccount(r, a), AuthorLogManagerObj.traceLog(AuthorManagerName, "Leave post addToken"); }), router.post("/mainLogin", function (e, r) {
    AuthorLogManagerObj.traceLog(AuthorManagerName, "Enter post mainLogin");
    var t = new Object;
    if (e.query = pubInter.EscapeAllData(e.query), t.accessToken = e.query.token, t.RefreshToken = e.query.refreshToken, t.IpAddr = e.query.IpAddr, void 0 != t.accessToken)
        KIOUserManager.checkUserTokenIsValid(r, t);
    else {
        try {
            let t = fs.readFileSync("../../../../../config/devconfig.json", "utf-8");
            var o = JSON.parse(t);
        }
        catch (t) {
            e.error = t.message, r.send(e);
        }
        let e = new Object;
        e.oauthURL = o.redirectUrl.loginURL, e.error = "token is undefined", r.send(e);
    }
    AuthorLogManagerObj.traceLog(AuthorManagerName, "Leave post mainLogin");
}), router.post("/getOauthUserList", function (e, r) { AuthorLogManagerObj.traceLog(AuthorManagerName, "Enter post getOauthUserList"); var t = new Object; t.accessToken = xss(e.query.token); KIOUserManager.queryUserAccountForALL(r, t, {}), AuthorLogManagerObj.traceLog(AuthorManagerName, "Leave post getOauthUserList"); }), router.post("/getOauthUserGroupList", function (e, r) { AuthorLogManagerObj.traceLog(AuthorManagerName, "Enter post getOauthUserGroupList"); var t = new Object; t.accessToken = xss(e.query.token), KIOUserManager.queryUserGroupListForALL(r, t), AuthorLogManagerObj.traceLog(AuthorManagerName, "Leave post getOauthUserGroupList"); }), router.post("/editUserAuthority", function (e, r) {
    AuthorLogManagerObj.traceLog(AuthorManagerName, "Enter post editUserAuthority");
    let t = global.sdbPath + "/ProjectGroupList.json";
    if (!fs.existsSync(t))
        return console.log("未找到工程组文件"), void r.send("未找到工程组文件");
    let o = {};
    try {
        o = JSON.parse(fs.readFileSync(t, "utf-8"));
    }
    catch (e) {
        return void r.send(e.message);
    }
    let a = global.sdbPath + "/CharacterInfo.json";
    if (!fs.existsSync(a))
        return console.log("未找到角色文件"), void r.send("未找到角色文件");
    let n = pubInter.readJson(a);
    if (n.Error)
        return void r.send(n.ErrorDesc);
    let s = n.data;
    var i;
    e.query = pubInter.EscapeAllData(e.query), "工程" == e.query.Type && (i = KIOCharacterManager.createCharacterForNewProject(e.query.ProjectID, e.query.ProjectEdition, e.query.UserInfo, s, o), AuthorLogManagerObj.traceLog(AuthorManagerName, " createCharacterForNewProject return:" + JSON.stringify(s))), "工程组" == e.query.Type && (i = KIOCharacterManager.createCharacterForNewProjectGroup(e.query.ProjectGroupID, e.query.UserInfo, s, o));
    var u = JSON.stringify(s, "", "\t");
    try {
        fs.writeFileSync(a, u);
    }
    catch (e) {
        return console.log(e), void r.send("写角色文件失败" + e);
    }
    updateProjectSetDataAuthority(s, o), i ? r.send("OK") : r.send("Error"), AuthorLogManagerObj.traceLog(AuthorManagerName, "Leave post editUserAuthority");
}), router.post("/deleteCharacter", function (e, r) {
    AuthorLogManagerObj.traceLog(AuthorManagerName, "Enter post deleteCharacter");
    let t = global.sdbPath + "/ProjectGroupList.json";
    if (!fs.existsSync(t))
        return console.log("未找到工程组文件"), void r.send("未找到工程组文件");
    let o = pubInter.readJson(t);
    if (o.Error)
        return void r.send(o.ErrorDesc);
    let a = o.data, n = global.sdbPath + "/CharacterInfo.json";
    if (!fs.existsSync(n))
        return console.log("未找到角色文件"), void r.send("未找到角色文件");
    let s = pubInter.readJson(n);
    if (s.Error)
        return void r.send(s.ErrorDesc);
    let i = s.data;
    for (var u = xss(e.query.CharacterIDs).split(","), c = 0; c < i.authority.length; c++)
        u.find(function (e) { return i.authority[c].CharacterID == e; }) && (i.authority.splice(c, 1), c--);
    var d = JSON.stringify(i, "", "\t");
    try {
        fs.writeFileSync(n, d);
    }
    catch (e) {
        return console.log(e), void r.send("写角色文件失败" + e);
    }
    updateProjectSetDataAuthority(i, a), r.send("OK"), AuthorLogManagerObj.traceLog(AuthorManagerName, "Leave post deleteCharacter");
}), router.post("/editeCharacter", function (e, r) {
    AuthorLogManagerObj.traceLog(AuthorManagerName, "Enter post editeCharacter");
    let t = global.sdbPath + "/ProjectGroupList.json";
    if (!fs.existsSync(t))
        return console.log("未找到工程组文件"), void r.send("未找到工程组文件");
    let o = pubInter.readJson(t);
    if (o.Error)
        return void r.send(o.ErrorDesc);
    let a = o.data, n = global.sdbPath + "/CharacterInfo.json";
    if (!fs.existsSync(n))
        return console.log("未找到角色文件"), void r.send("未找到角色文件");
    let s = pubInter.readJson(n);
    if (s.Error)
        return void r.send(s.ErrorDesc);
    let i = s.data;
    for (var u = pubInter.EscapeAllData(e.body), c = 0; c < i.authority.length; c++)
        if (i.authority[c].CharacterID == xss(e.query.CharacterID)) {
            if ("ProjectAuthority" == u.code) {
                var d = u.editor.options.data, g = u.value.split(","), h = new Array;
                findAuthorityByChildrenIDValue(d, g, h), i.authority[c].ProjectAuthority = h;
            }
            else if ("Users" == u.code) {
                var l = u.editor.options.data, p = u.value.split(","), y = new Array;
                findUserAuthorityByIDValue(l, p, i.authority[c].Users, y);
            }
            else {
                if ("CharacterName" == u.code)
                    for (var f = 0; f < i.authority.length; f++)
                        if (i.authority[f].CharacterName == u.value)
                            return void r.send("角色名称重复");
                for (var j in i.authority[c])
                    if (j == u.code) {
                        i.authority[c][j] = u.value;
                        break;
                    }
            }
            break;
        }
    var A = JSON.stringify(i, "", "\t");
    try {
        fs.writeFileSync(n, A);
    }
    catch (e) {
        return console.log(e), void r.send("写角色文件失败" + e);
    }
    updateProjectSetDataAuthority(i, a), r.send("OK"), AuthorLogManagerObj.traceLog(AuthorManagerName, "Leave post editeCharacter");
}), router.post("/addNewCharacter", function (e, r) {
    AuthorLogManagerObj.traceLog(AuthorManagerName, "Enter post addNewCharacter");
    let t = global.sdbPath + "/ProjectGroupList.json";
    if (!fs.existsSync(t))
        return console.log("未找到工程组文件"), void r.send("未找到工程组文件");
    let o = pubInter.readJson(t);
    if (o.Error)
        return void r.send(o.ErrorDesc);
    let a = o.data, n = global.sdbPath + "/CharacterInfo.json";
    if (!fs.existsSync(n))
        return console.log("未找到角色文件"), void r.send("未找到角色文件");
    let s = pubInter.readJson(n);
    if (s.Error)
        return void r.send(s.ErrorDesc);
    let i = s.data;
    for (var u = new Object, c = JSON.parse(xss(e.body.body)), d = new Array, g = new Array, h = 0; h < c.rows.length; h++)
        "ProjectAuthority" == c.rows[h].code && (d = c.rows[h].editor.options.data, g = c.rows[h].value.split(",")), "CharacterName" == c.rows[h].code && (u.CharacterName = c.rows[h].value), "CharacterDesc" == c.rows[h].code && (u.CharacterDesc = c.rows[h].value);
    var l = new Array, p = new Array;
    for (h = 0; h < c.rows.length; h++)
        "Users" == c.rows[h].code && (l = c.rows[h].editor.options.data, p = c.rows[h].value.split(","));
    var y = 0;
    for (h = 0; h < i.authority.length; h++)
        if (Number(i.authority[h].CharacterID) >= y && (y = Number(i.authority[h].CharacterID)), i.authority[h].CharacterName == u.CharacterName)
            return void r.send("角色名称重复");
    var f = new Array;
    findAuthorityByChildrenIDValue(d, g, f);
    var j = new Array, A = new Array;
    findUserAuthorityByIDValue(l, p, A, j), u.CharacterID = y + 1, u.ProjectAuthority = f, u.ProjectConfigAuthority = [], u.Users = A, i.authority.push(u);
    var L = JSON.stringify(i, "", "\t");
    try {
        fs.writeFileSync(n, L);
    }
    catch (e) {
        return console.log(e), void r.send("写角色文件失败" + e);
    }
    updateProjectSetDataAuthority(i, a), r.send("OK"), AuthorLogManagerObj.traceLog(AuthorManagerName, "Leave post addNewCharacter");
}), router.post("/getAllProjectInfo", function (e, r) {
    AuthorLogManagerObj.traceLog(AuthorManagerName, "Enter post getAllProjectInfo");
    var t = "../" + global.sdbPath + "/ProjectGroupList.json";
    fs.readFile(path.resolve(__dirname, t), "utf-8", function (t, o) {
        if (t)
            return console.log("Load getAllProjectInfo Failed."), console.error(t), void r.send("Load getAllProjectInfo Failed: " + t);
        let a = JSON.parse(o);
        var n = new Object;
        n.id = 0, n.text = "工程管理", n.Type = "工程管理";
        for (var s = new Array, i = ["数据下设", "读", "读写"], u = ["SetData", "Read", "ReadWrite"], c = ["读写"], d = ["ReadWrite"], g = ["读", "读写"], h = ["Read", "ReadWrite"], l = 0; l < c.length; l++) {
            (I = {}).id = getUUID(), I.text = c[l], I.code = d[l], I.Type = "authority", s.push(I);
        }
        for (var p = 0; p < a.ProjectGroupList.length; p++)
            if (a.ProjectGroupList[p].ProjectGroupName) {
                (L = new Object).text = a.ProjectGroupList[p].ProjectGroupName, L.id = a.ProjectGroupList[p].ProjectGroupID, L.Type = "工程组";
                var y = new Array;
                for (l = 0; l < g.length; l++) {
                    (I = {}).id = getUUID(), I.text = g[l], I.code = h[l], I.Type = "authority", y.push(I);
                }
                if (a.ProjectGroupList[p].ProjectObjectList)
                    for (var f = 0; f < a.ProjectGroupList[p].ProjectObjectList.length; f++) {
                        var j = new Array;
                        for (l = 0; l < i.length; l++) {
                            (I = {}).id = getUUID(), I.text = i[l], I.code = u[l], I.Type = "authority", j.unshift(I);
                        }
                        var A = new Object;
                        A.children = j, A.text = a.ProjectGroupList[p].ProjectObjectList[f].ProjectName, A.id = a.ProjectGroupList[p].ProjectObjectList[f].ProjectID, A.Version = a.ProjectGroupList[p].ProjectObjectList[f].ProjectVersion, A.Type = "工程", y.push(A);
                    }
                L.children = y, s.push(L);
            }
            else {
                var L;
                (L = new Object).text = a.ProjectGroupList[p].ProjectName, L.id = a.ProjectGroupList[p].ProjectID, L.Version = a.ProjectGroupList[p].ProjectVersion, L.Type = "工程";
                for (j = new Array, l = 0; l < i.length; l++) {
                    var I;
                    (I = {}).id = getUUID(), I.text = i[l], I.code = u[l], I.Type = "authority", j.unshift(I);
                }
                L.children = j, s.push(L);
            }
        n.children = s;
        var v = [];
        v.push(n);
        var P = {};
        P.projectInfo = v;
        var b = new Object;
        b.accessToken = xss(e.query.token), b.IpAddr = xss(e.query.IpAddr), KIOUserManager.queryUserAccountForALL(r, b, P);
    });
    AuthorLogManagerObj.traceLog(AuthorManagerName, "Leave post getAllProjectInfo");
}), router.post("/getAllCharacterInfo", function (e, r) {
    AuthorLogManagerObj.traceLog(AuthorManagerName, "Enter post getAllCharacterInfo");
    let t = global.sdbPath + "/CharacterInfo.json";
    if (!fs.existsSync(t))
        return console.log("未找到角色文件"), void r.send("未找到角色文件");
    let o = pubInter.readJson(t);
    if (o.Error)
        return void r.send(o.ErrorDesc);
    let a = o.data;
    r.send(JSON.stringify(a.authority)), AuthorLogManagerObj.traceLog(AuthorManagerName, "Leave post getAllCharacterInfo");
}), router.post("/getCharacterProperty", function (e, r) {
    AuthorLogManagerObj.traceLog(AuthorManagerName, "Enter post getCharacterProperty"), fs.readFile(global.propertyPath + "/CharacterProperty.json", function (e, t) {
        if (e) {
            var o = "read CharacterProperty.json fail,post name:getCharacterProperty;err:" + e;
            return console.log(o), void r.send(o);
        }
        AuthorLogManagerObj.traceLog(AuthorManagerName, "Async Leave post getCharacterProperty"), r.send(t.toString());
    }), AuthorLogManagerObj.traceLog(AuthorManagerName, "Leave post getCharacterProperty");
}), router.post("/getProjectWriteAuthority", function (e, r) {
    AuthorLogManagerObj.traceLog(AuthorManagerName, "Enter post getProjectWriteAuthority");
    let t = global.sdbPath + "/CharacterInfo.json", o = pubInter.readJson(t);
    if (o.Error)
        return void r.send(o.ErrorDesc);
    let a = o.data;
    e.query = pubInter.EscapeAllData(e.query), KIOCharacterManager.checkProjectWritable(e.query.ProjectID, e.query.ProjectEdition, e.query.UserInfo, a) ? r.send("true") : r.send("false"), AuthorLogManagerObj.traceLog(AuthorManagerName, "Leave post getProjectWriteAuthority");
}), router.post("/createUserAccount", function (e, r) { AuthorLogManagerObj.traceLog(AuthorManagerName, "Enter post createUserAccount"); var t = new Object; e.query = pubInter.EscapeAllData(e.query), t.UserName = e.query.UserName, t.Password = e.query.Password, t.UserDesc = e.query.UserDesc, t.accessToken = e.query.Token, KIOUserManager.createUserAccount(r, t); }), router.post("/getUserTree", function (e, r) { AuthorLogManagerObj.traceLog(AuthorManagerName, "Enter post createUserAccount"); var t = new Object; t.accessToken = xss(e.query.Token), t.ProjectID = xss(e.query.ProjectID), KIOUserManager.getUserResourceTree(r, t); }), router.post("/getUserTypeTree", function (e, r) { AuthorLogManagerObj.traceLog(AuthorManagerName, "Enter post getUserTypeTree"); var t = new Object; t.accessToken = xss(e.query.Token), t.ProjectID = xss(e.query.ProjectID), KIOUserManager.getUserTypeTree(r, t); }), router.post("/setProjetAuth", function (e, r) {
    AuthorLogManagerObj.traceLog(AuthorManagerName, "Enter post setProjetAuth");
    let t = global.sdbPath + "/permissConfig.json", o = pubInter.readJson(t);
    if (o.Error)
        return void r.send(o.ErrorDesc);
    var a = o.data, n = pubInter.EscapeAllData(e.body);
    for (let e = 0; e < n.ProIDList.length; e++) {
        var s = {};
        if (s.projectId = n.ProIDList[e], s.showList = {}, s.showList.userGroupId = [], s.showList.userCategory = [], n.ViewGroup)
            for (let e = 0; e < n.ViewGroup.length; e++)
                s.showList.userGroupId.push(n.ViewGroup[e].id);
        if (n.ViewCatagory)
            for (let e = 0; e < n.ViewCatagory.length; e++)
                void 0 == n.ViewCatagory[e].children && s.showList.userCategory.push(n.ViewCatagory[e].id);
        if (s.editList = {}, s.editList.userGroupId = [], s.editList.userCategory = [], n.EditGroup)
            for (let e = 0; e < n.EditGroup.length; e++)
                s.editList.userGroupId.push(n.EditGroup[e].id);
        if (n.EditCatagory)
            for (let e = 0; e < n.EditCatagory.length; e++)
                void 0 == n.EditCatagory[e].children && s.editList.userCategory.push(n.EditCatagory[e].id);
        var i = -1;
        void 0 == a.permissList.find(function (e, r) { return i = r, e.projectId == s.projectId; }) ? a.permissList.push(s) : a.permissList[i] = s;
    }
    let u = pubInter.writeJson(t, a);
    r.send(u), AuthorLogManagerObj.traceLog(AuthorManagerName, "Leave post setProjetAuth");
}), router.post("/roleVerifivation", async function (e, r) {
    let t = { err: !1, oauthURL: "" };
    if (0 == await KIOUserManager.roleVerifivation()) {
        try {
            let e = fs.readFileSync("../../../../config/devconfig.json", "utf-8");
            var o = JSON.parse(e);
        }
        catch (e) {
            return t.error = e.message, void r.send(t);
        }
        return t.err = !0, t.oauthURL = o.redirectUrl.loginURL, void r.send(t);
    }
    r.send(t);
}), router.post("/getProjectAuth", function (e, r) {
    var t = xss(e.query.ProjectID), o = { status: 200, msg: "" };
    let a = global.sdbPath + "/permissConfig.json", n = pubInter.readJson(a);
    if (n.Error)
        return o.msg = n.ErrorDesc, void r.send(o);
    let s = n.data.permissList.find(function (e) { return e.projectId == t; });
    if (void 0 == s)
        return o.msg = KIO_NOPERMISS, void r.send(o);
    var i = pubInter.EscapeAllData(e.body);
    let u = s.editList.userGroupId.find(function (e) { return e == i.groupId; });
    if (void 0 != u)
        return o.msg = KIO_EDITPERMISS, void r.send(o);
    if (i.category)
        for (let e = 0; e < s.editList.userCategory.length; e++)
            for (let t = 0; t < i.category.length; t++)
                for (let a = 0; a < i.category[t].list.length; a++)
                    if (s.editList.userCategory[e] == i.category[t].list[a].categoryAttrId)
                        return o.msg = KIO_EDITPERMISS, void r.send(o);
    if (void 0 != (u = s.showList.userGroupId.find(function (e) { return e == i.groupId; })))
        return o.msg = KIO_VIEWPERMISS, void r.send(o);
    if (i.category)
        for (let e = 0; e < s.showList.userCategory.length; e++)
            for (let t = 0; t < i.category.length; t++)
                for (let a = 0; a < i.category[t].list.length; a++)
                    if (s.showList.userCategory[e] == i.category[t].list[a].categoryAttrId)
                        return o.msg = KIO_VIEWPERMISS, void r.send(o);
    o.msg = KIO_NOPERMISS, r.send(o);
}), router.post("/getCreateAuth", function (e, r) { AuthorLogManagerObj.traceLog(AuthorManagerName, "Enter post getCreateAuth"); var t = new Object; e.body = pubInter.EscapeAllData(e.body), t = JSON.parse(e.body.UserInfo), KIOUserManager.getCreateAuth(r, t); }), router.post("/setCheckFlag", function (e, r) {
    AuthorLogManagerObj.traceLog(AuthorManagerName, "setCheckFlag");
    let t = pubInter.readJson("../config/externalConfig.json");
    if (t.Error)
        return void r.send(t.ErrorDesc);
    t.data.checkTokenFlag = !1;
    let o = pubInter.writeJson("../config/externalConfig.json", t.data);
    console.log(o), r.send(o);
}), module.exports = router;
// end
