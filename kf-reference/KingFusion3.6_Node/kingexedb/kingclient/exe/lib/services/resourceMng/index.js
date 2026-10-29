const fs = require("fs"),
    path = require("path"),
    url = require("url"),
    xlsx = require("node-xlsx"),
    userMng = require("../userMng/index").getInstance(),
    cryptico = require("../../../core/utils/index").cryptico,
    mime = require("mime"),
    archiver = require("archiver"),
    fileOperateFun = require("./fileOperationFun"),
    iconv = require("iconv-lite"),
    ExcelJS = require("exceljs");
class ResourceMng {
    constructor() {
        this.baseFolderPath = path.join(__DIR, "uploads")
    }
    async writeFile(n, i) {
        try {
            let r = {
                status: "",
                RI: ""
            };
            if (n.body.logmsg) {
                let l = n.body.path,
                    e = n.body.logmsg + `\r
`,
                    a = fileOperateFun._innerEncode(fileOperateFun._innerhashFunc(e));
                e = `${e} ${a}`, fs.appendFile(l, e, "utf-8", function (s) {
                    s ? (r.status = "failed", r.RI = "failed") : r.status = "success", i(null, JSON.stringify(r))
                })
            } else {
                let e = url.parse(n.url, !0).query.filePath;
                if (path.isAbsolute(e)) {
                    i(null, JSON.stringify({
                        status: "failed",
                        RI: "Path must be relative path."
                    }));
                    return
                }(e.search(".xls") !== -1 || e.search(".xlsx") !== -1) && (n.body.data = xlsx.build(typeof n.body.data == "string" ? JSON.parse(n.body.data) : n.body.data)), e = fileOperateFun.charReplace(e);
                var t = fileOperateFun.recombineAbsolutePath(e, fileOperateFun.getProjectUploadPath(n));
                t = t.split("?")[0], fs.exists(t, function (a) {
                    let s = [],
                        f = {};
                    f.fileAbsolutelyPath = t, f.fileRelativePath = e, s.push(f), r.fileList = s, a ? fs.writeFile(t, n.body.data, "utf-8", function (o) {
                        o ? (r.status = "failed", r.RI = "failed") : r.status = "success", i(null, JSON.stringify(r))
                    }) : (r.status = "non-existent", r.RI = t + " is non-existent.", i(null, JSON.stringify(r)))
                })
            }
        } catch {
            content.status = "failed", content.RI = "failed", i(null, JSON.stringify(content))
        }
    }
    async readFile(n, i) {
        var t = url.parse(n.url, !0).query,
            r = t.filePath;
        if (path.isAbsolute(r)) {
            i(null, JSON.stringify({
                status: "failed",
                RI: "Path must be realative path."
            }));
            return
        }
        r = fileOperateFun.charReplace(decodeURI(r.replace("/readFile/", "")));
        var l = r.match(/(\.[^.]+|)$/)[0],
            e = fileOperateFun.recombineAbsolutePath(r, fileOperateFun.getProjectUploadPath(n));
        e = e.split("?")[0], fs.exists(e, a => {
            var s = [],
                f = {};
            f.fileAbsolutelyPath = e, f.fileRelativePath = r, s.push(f);
            var o = {
                status: "",
                fileList: s,
                RI: ""
            };
            if (a) {
                var c = "",
                    h = "";
                if (l.search(".xls") !== -1 || l.search(".xlsx") !== -1) {
                    var d = xlsx.parse(e);
                    f.fileData = JSON.stringify(d), o.status = "success"
                } else l.search(".json") !== -1 || l.search(".txt") !== -1 ? (c = fs.readFileSync(e), f.fileData = iconv.decode(c, "utf8"), o.status = "success") : l !== "" ? (h = l, f.nonsupportFileType = h, o.status = "non-support") : o.status = "non-file";
                i(null, JSON.stringify(o))
            } else o.status = "non-existent", o.RI = " is non-existent.", i(null, JSON.stringify(o))
        })
    }
    async isFile(n, i) {
        var t = url.parse(n.url, !0).search;
        if (t = fileOperateFun.charReplace(decodeURI(t.replace("?", ""))), t = t.split("&")[0], path.isAbsolute(t)) {
            i(null, JSON.stringify({
                status: "failed",
                RI: "Path must be realative path."
            }));
            return
        }
        var r = fileOperateFun.recombineAbsolutePath(t, fileOperateFun.getProjectUploadPath(n));
        fs.exists(r, function (l) {
            l ? i(null, JSON.stringify({
                message: "success",
                isFile: !0
            })) : (logger.log("error", "km_fileTransferOperate:isFile: getFile:find nothing"), i(null, "find nothing in "))
        })
    }
    async uploadFile(n, i) {
        var t = url.parse(n.url, !0).query,
            r;
        let l = userMng.rsaKey;
        if (t.filePath || (t.filePath = ""), t.filePath.indexOf("upLoadReName") !== -1) {
            var e = t.filePath.split("upLoadReName")[0],
                a = cryptico.decrypt(e, l);
            a.status === "success" && (e = a.plaintext), r = n.path + e + "upLoadRepNon"
        } else if (t.filePath.indexOf("upLoadRepNon") !== -1) {
            var e = t.filePath.split("upLoadRepNon")[0],
                a = cryptico.decrypt(e, l);
            a.status === "success" && (e = a.plaintext), r = n.path + e + "upLoadRepNon"
        } else if (t.filePath.indexOf("upLoadReplace") !== -1) {
            var s = t.filePath.split("upLoadReplace")[0],
                a = cryptico.decrypt(s, l);
            a.status === "success" && (s = a.plaintext), r = n.path + s + "upLoadReplace"
        } else {
            var a = cryptico.decrypt(t.filePath, l);
            a.status === "success" && (t.filePath = decodeURI(a.plaintext)), r = t.filePath
        }
        t.newName && (n.newName = t.newName), fileOperateFun.uploadFile(r, i, n, fileOperateFun.getProjectUploadPath(n))
    }
    async uploadReportFile(n, i) {
        var t = url.parse(n.url, !0).query,
            r;
        let l = userMng.rsaKey;
        if (t.filePath || (t.filePath = ""), t.filePath.indexOf("upLoadReName") !== -1) {
            var e = t.filePath.split("upLoadReName")[0],
                a = cryptico.decrypt(e, l);
            a.status === "success" && (e = a.plaintext), r = n.path + e + "upLoadRepNon"
        } else if (t.filePath.indexOf("upLoadRepNon") !== -1) {
            var e = t.filePath.split("upLoadRepNon")[0],
                a = cryptico.decrypt(e, l);
            a.status === "success" && (e = a.plaintext), r = n.path + e + "upLoadRepNon"
        } else if (t.filePath.indexOf("upLoadReplace") !== -1) {
            var s = t.filePath.split("upLoadReplace")[0],
                a = cryptico.decrypt(s, l);
            a.status === "success" && (s = a.plaintext), r = n.path + s + "upLoadReplace"
        } else {
            var a = cryptico.decrypt(t.filePath, l);
            a.status === "success" && (t.filePath = decodeURI(a.plaintext)), r = t.filePath
        }
        t.newName && (n.newName = t.newName), fileOperateFun.uploadReportFile(r, i, n, fileOperateFun.getProjectUploadPath(n), fileOperateFun.getProjectUploadReportPath(n))
    }
    async download(n, i) {
        let t = url.parse(n.url, !0).query,
            r = fileOperateFun.charReplace(t.filePath);
        if (r.search("exists/") !== -1) {
            let l = r.replace("exists/", "");
            if (path.isAbsolute(l)) {
                i.write(JSON.stringify({
                    status: "failed",
                    RI: "Path must be realative path."
                }), "utf-8"), i.end();
                return
            }
            let e = fileOperateFun.recombineAbsolutePath(l, fileOperateFun.getProjectUploadPath(n));
            fs.exists(e, function (a) {
                let s = {
                    status: "",
                    fileList: [],
                    RI: ""
                };
                if (a) {
                    let f = fs.statSync(e);
                    if (f.isFile()) s.status = "success", s.RI = " is existent.", s.fileList.push({
                        GID: n.kp_projectGUID
                    }), i.write(JSON.stringify(s), "utf-8"), i.end();
                    else if (f.isDirectory()) {
                        let o = e.slice(path.resolve(e).lastIndexOf(path.sep) + 1),
                            c = fs.createWriteStream(e + ".zip"),
                            h = archiver("zip", {
                                zlib: {
                                    level: 9
                                }
                            });
                        c.on("close", function () {
                            s.status = "success", s.RI = " isDirectory existent.", s.fileList.push({
                                GID: n.kp_projectGUID
                            }), i.write(JSON.stringify(s), "utf-8"), i.end()
                        }), h.pipe(c), h.directory(e, o), h.finalize()
                    } else s.status = "non-file", s.RI = " is non-file.", i.write(JSON.stringify(s), "utf-8"), i.end()
                } else s.status = "failed", s.RI = " is non-existent.", i.write(JSON.stringify(s), "utf-8"), i.end()
            })
        } else if (t.GID) {
            if (path.isAbsolute(r)) {
                i.write(JSON.stringify({
                    status: "failed",
                    RI: "Path must be realative path."
                }), "utf-8"), i.end();
                return
            }
            let l = path.resolve(fileOperateFun.getProjectUploadPath({
                kp_projectGUID: t.GID
            }), r);
            fs.statSync(l).isDirectory() ? i.download(l + ".zip") : i.download(l)
        } else i.write(JSON.stringify({
            status: "failed",
            RI: "is non project id."
        }), "utf-8"), i.end()
    }
    async deleteFile(n, i) {
        let t = url.parse(n.url, !0).query,
            r = fileOperateFun.charReplace(t.filePath),
            l = r.replace("/delete/", "");
        if (path.isAbsolute(r)) {
            i(null, JSON.stringify({
                status: "failed",
                RI: "Path must be realative path."
            }));
            return
        }
        let e = fileOperateFun.recombineAbsolutePath(l, fileOperateFun.getProjectUploadPath(n));
        fs.exists(e, function (a) {
            let s = [],
                f = {};
            f.fileRelativePath = l, s.push(f);
            let o = {
                status: "",
                fileList: s,
                RI: ""
            };
            a ? fs.statSync(e).isFile() ? fs.unlink(e, function (h) {
                h ? (o.status = "failed", o.RI = h.message, i(null, JSON.stringify(o))) : (o.status = "success", i(null, JSON.stringify(o)))
            }) : (o.status = "non-file", i(null, JSON.stringify(o))) : (o.status = "failed", o.RI = " is non-existent.", i(null, JSON.stringify(o)))
        })
    }
    async filesList(n, i) {
        let t = url.parse(n.url, !0).query,
            r = fileOperateFun.charReplace(n.path + t.filePath).replace("/filesList/", ""),
            l = {
                status: "",
                fileList: void 0,
                RI: ""
            };
        if (path.isAbsolute(r)) {
            i(null, JSON.stringify({
                status: "failed",
                RI: "Path must be realative path."
            }));
            return
        }
        let e = fileOperateFun.recombineAbsolutePath(r, fileOperateFun.getProjectUploadPath(n));
        fs.exists(e, function (a) {
            let s = [];
            if (a)
                if (fs.statSync(e).isFile()) {
                    let c = {};
                    c.fileAbsolutelyPath = e, c.fileRelativePath = r, s.push(c), l.status = "non-folder", l.fileList = s
                } else {
                    let c = fs.readdirSync(e);
                    for (let h = 0; h < c.length; ++h) {
                        let d = path.join(e, c[h]);
                        try {
                            var f = fs.statSync(d)
                        } catch {
                            continue
                        }
                        let p = f.isFile(),
                            x = fileOperateFun.humanFileSize(f.size, 1024),
                            N = f.mtime.toLocaleDateString(),
                            I = f.mtime.toLocaleTimeString(),
                            m = N + " " + I,
                            g = {};
                        g.fileAbsolutelyPath = e, g.fileRelativePath = r, g.fileName = c[h], g.fileSize = p ? x : "-", g.modifyDate = m, g.isFile = p, s.push(g)
                    }
                    c.length === 0 && (l.fileAbsolutelyPath = e, l.fileRelativePath = r), l.status = "success", l.fileList = s
                }
            else {
                let o = {};
                o.fileRelativePath = r, s.push(o), l.status = "failed", l.fileList = s, l.RI = " is non-existent."
            }
            i(null, JSON.stringify(l))
        })
    }
    async creatFolder(n, i) {
        try {
            let t = url.parse(n.url, !0).query,
                r = fileOperateFun.charReplace(t.filePath),
                l = {
                    status: "",
                    fileList: [],
                    RI: ""
                };
            if (path.isAbsolute(r)) {
                i(null, JSON.stringify({
                    status: "failed",
                    RI: "Path must be realative path."
                }));
                return
            }
            let e = this,
                a = r.replace("/creatFolder/", ""),
                s = fileOperateFun.recombineAbsolutePath(a, fileOperateFun.getProjectUploadPath(n));
            fs.exists(s, function (f) {
                let o = [],
                    c = {};
                if (l.fileList = o, c.fileAbsolutelyPath = s, c.fileRelativePath = a, o.push(c), f) {
                    let d = s.split(path.sep),
                        p = "";
                    if (d[d.length - 1] === "" ? p = d[d.length - 2] : p = d[d.length - 1], p === "\u65B0\u5EFA\u6587\u4EF6\u5939") {
                        let x = fileOperateFun.getPreFolderPath(s);
                        if (fs.statSync(x).isDirectory()) {
                            let I = fs.readdirSync(x),
                                m, g = [];
                            for (let y = 0; y < I.length; ++y) {
                                let u = x + I[y],
                                    v = I[y];
                                if (s.indexOf(u) === -1 && v.indexOf(p) !== -1 && v.indexOf("(") !== -1 && v.indexOf(")") !== -1) {
                                    let P = v.split("(").length - 1,
                                        O = v.split(")").length - 1;
                                    if (P === 1 && O === 1 && v.charAt(v.length - 1) === ")") {
                                        let R = v.substr(v.indexOf("(") + 1, v.length - 3);
                                        !isNaN(parseInt(R)) && parseInt(R) > 0 && g.push(parseInt(R))
                                    }
                                }
                            }
                            if (g.length > 1)
                                if (g.sort(e.compare), g[0] > 1) m = 1;
                                else {
                                    let y = 0;
                                    for (let u = 0; u < g.length; u++)
                                        if (g[u] + 1 < g[u + 1]) {
                                            m = g[u] + 1;
                                            break
                                        } else y++;
                                    y === g.length && (m = g[g.length - 1] + 1)
                                }
                            else g.length === 1 ? g[0] > 1 ? m = 1 : m = g[0] + 1 : m = 1;
                            p = p + "(" + m + ")", s = x + p;
                            try {
                                fs.mkdirSync(s)
                            } catch (y) {
                                logger.log("error", "km_fileTransferOperate:creatFolder: failed to create directory" + y.message)
                            }
                            if (fs.existsSync(s)) {
                                let y = fs.statSync(s),
                                    u = "-",
                                    v = y.mtime.toLocaleDateString().replace(/\//g, "-"),
                                    P = y.mtime.toLocaleTimeString(),
                                    O = v + " " + P;
                                c.fileSize = u, c.modifyDate = O, c.fileAbsolutelyPath = s, c.fileRelativePath = p, l.status = "success"
                            } else l.status = "failed", l.RI = s + " creat failed"
                        }
                    } else l.status = "exists", l.RI = " exists already.";
                    var h = JSON.stringify(l);
                    i(null, h)
                } else {
                    try {
                        fs.mkdirSync(s, {
                            recursive: !0
                        })
                    } catch (p) {
                        logger.log("error", "km_fileTransferOperate:creatFolder: no exists :failed to create directory" + p.message)
                    }
                    if (fs.existsSync(s)) {
                        let p = fs.statSync(s),
                            x = "-",
                            N = p.mtime.toLocaleDateString().replace(/\//g, "-"),
                            I = p.mtime.toLocaleTimeString(),
                            m = N + " " + I;
                        c.fileSize = x, c.modifyDate = m, l.status = "success"
                    } else l.status = "failed", l.RI = " creat failed";
                    let d = JSON.stringify(l);
                    i(null, d)
                }
            })
        } catch (t) {
            logger.log("error", "km_fileTransferOperate:creatFolder: failed to create directory" + t.stack), i(null, JSON.stringify({
                status: "failed",
                RI: " creat failed"
            }))
        }
    }
    async deleteFolder(n, i) {
        try {
            let t = url.parse(n.url, !0).query,
                l = fileOperateFun.charReplace(t.filePath).replace("/deleteFolder/", ""),
                e = [],
                a = {
                    status: "",
                    fileList: [],
                    RI: ""
                };
            if (path.isAbsolute(l)) {
                a.status = "failed", a.RI = "Path must be realative path.", i(null, JSON.stringify(a));
                return
            }
            if (l.search("confimDelete/") === -1) {
                let s = path.resolve(fileOperateFun.getProjectUploadPath(n), l);
                fs.exists(s, function (f) {
                    if (s = path.resolve(s), e.push({
                            fileAbsolutelyPath: s,
                            fileRelativePath: l
                        }), a.fileList = e, f)
                        if (fs.statSync(s).isFile()) a.status = "non-folder", i(null, JSON.stringify(a));
                        else {
                            var o = fs.readdirSync(s);
                            o.length < 1 ? fs.rmdir(s, function (h) {
                                a.status = h ? "failed" : "success", i(null, JSON.stringify(a))
                            }) : (a.status = "non-empty", i(null, JSON.stringify(a)))
                        }
                    else a.status = "failed", a.RI = " is non-existent.", i(null, JSON.stringify(a))
                })
            } else {
                l = l.replace("confimDelete/", "");
                let s = fileOperateFun.recombineAbsolutePath(l, fileOperateFun.getProjectUploadPath(n));
                fileOperateFun.deleteFolderRecursive(s), e.push({
                    fileAbsolutelyPath: s,
                    fileRelativePath: l
                }), a.fileList = e, a.status = fs.existsSync(s) ? "failed" : "success", i(null, JSON.stringify(a))
            }
        } catch {
            content.status = "failed", i(null, JSON.stringify(content))
        }
    }
    async searchFile(n, i) {
        try {
            let t = url.parse(n.url, !0).query,
                l = fileOperateFun.charReplace(t.filePath).replace("/searchFile/", ""),
                e = l.split("|")[1];
            if (l = l.split("|")[0], path.isAbsolute(l)) {
                i(null, JSON.stringify({
                    status: "failed",
                    RI: "Path must be realative path."
                }));
                return
            }
            let a = path.resolve(fileOperateFun.getProjectUploadPath(n), l);
            fs.exists(a, function (s) {
                let f = {
                    status: "",
                    fileList: null,
                    searchName: e,
                    searchPath: a
                };
                if (s)
                    if (fs.statSync(a).isDirectory()) {
                        let c = [];
                        fileOperateFun.searchFileInfo(a, e, c, a), path.isAbsolute(a) && (a = path.resolve(a)), f.searchPath = a, f.fileList = c, f.status = "success"
                    } else f.status = "non-folder";
                else f.status = "non-existent";
                i(null, JSON.stringify(f))
            })
        } catch {
            content.status = "failed", i(null, JSON.stringify(content))
        }
    }
    async copyFile(n, i) {
        try {
            let t = url.parse(n.url, !0).query,
                l = fileOperateFun.charReplace(t.filePath).replace("/copyFile/", ""),
                e = l.split("|")[1],
                a = e.split("/"),
                s = 0;
            for (let d = 0; d < a.length; d++) a[d] !== "" && (s = d);
            let f = a[s],
                o = l.split("|")[0];
            if (e = fileOperateFun.recombineAbsolutePath(e, fileOperateFun.getProjectUploadPath(n)), path.isAbsolute(o)) {
                i(null, JSON.stringify({
                    status: "failed",
                    RI: "FilePath must be realative path."
                }));
                return
            }
            o = fileOperateFun.recombineAbsolutePath(o, fileOperateFun.getProjectUploadPath(n));
            let c = fs.existsSync(e),
                h = {
                    status: "",
                    filePath: e,
                    copyFilePath: o,
                    RI: "",
                    copyAfterFilePath: ""
                };
            if (c) {
                let d = fs.statSync(e);
                if (d.isFile())
                    if (fs.existsSync(o))
                        if (d = fs.statSync(o), d.isDirectory()) {
                            let x = fs.readFileSync(e);
                            o = path.resolve(o, f), fs.writeFileSync(o, x, "utf-8"), h.status = "fileCopy-success"
                        } else h.status = "copyFilePath-non-isDirectory";
                else h.status = "copyFilePath-non-existent";
                else h.status = "filePath-non-isFile"
            } else h.status = "filePath-non-existent";
            i(null, JSON.stringify(h))
        } catch (t) {
            const r = {};
            logger.log("error", "km_fileTransferOperate:fileCopy: write failed" + t), r.status = "fileCopy-failed", r.RI = t.message, i(null, JSON.stringify(r))
        }
    }
    async renameFile(n, i) {
        try {
            let m = url.parse(n.url, !0).query,
                y = fileOperateFun.charReplace(m.filePath.replace("//", "/")).replace("/renameFile/", ""),
                u = {
                    status: "",
                    fileList: [],
                    RI: ""
                },
                v = this,
                P = y.split("|")[1];
            if (y = y.split("|")[0], path.isAbsolute(y)) {
                u.status = "failed", u.RI = "Path must be realative path.", i(null, JSON.stringify(u));
                return
            }
            let O = [],
                R = {};
            if (y.search("confimRename/") === -1) {
                var t = !1;
                y.search("confimModifyExtension/") !== -1 && (y = y.replace("confimModifyExtension/", ""), t = !0);
                let S = path.resolve(fileOperateFun.getProjectUploadPath(n), y);
                fs.exists(S, function (D) {
                    if (S = path.resolve(S), R.fileAbsolutelyPath = S, R.newFileName = P, O.push(R), u = {
                            status: "",
                            fileList: O,
                            RI: ""
                        }, D) {
                        var A = fs.statSync(S),
                            F = "",
                            J = "";
                        if (A.isFile() && (F = S.match(/(\.[^.]+|)$/)[0].replace("/", ""), F = F.replace("/", ""), J = P.match(/(\.[^.]+|)$/)[0].replace("/", ""), F !== J && !t)) {
                            logger.log("error", "km_fileTransferOperate:fileRename: cannot modify the extension"), u.status = "modify-extension";
                            var U = JSON.stringify(u);
                            response.write(U, "utf-8"), response.end();
                            return
                        }
                        var L = fileOperateFun.getPreFolderPath(S),
                            z = fs.statSync(L);
                        if (z.isDirectory()) {
                            for (var b = fs.readdirSync(L), w = !1, j = 0; j < b.length; ++j) {
                                var C = L + b[j];
                                if (C !== S && b[j] === P) {
                                    w = !0;
                                    break
                                }
                            }
                            if (w) u.status = "newname-repeat", i(null, JSON.stringify(u));
                            else {
                                var _ = L + P;
                                fs.rename(S, _, function (T) {
                                    T ? (u.status = "failed", u.RI = T.message) : u.status = "success", i(null, JSON.stringify(u))
                                })
                            }
                        }
                    } else u.status = "non-existent", u.RI = " is non-existent.", i(null, JSON.stringify(u))
                })
            } else {
                y = y.replace("confimRename/", "");
                let S = fileOperateFun.recombineAbsolutePath(y, fileOperateFun.getProjectUploadPath(n));
                if (R.fileAbsolutelyPath = S, R.newFileName = P, O.push(R), u = {
                        status: "",
                        fileList: O,
                        RI: ""
                    }, fs.existsSync(S)) {
                    let D = fs.statSync(S),
                        A = "",
                        F = "";
                    var r = !1;
                    D.isFile() && (r = !0, A = P.match(/(\.[^.]+|)$/)[0].replace("/", "").replace(".", ""), F = P.replace("." + A, ""));
                    let J = fileOperateFun.getPreFolderPath(S);
                    if (fs.statSync(J).isDirectory()) {
                        for (var l = fs.readdirSync(J), e = void 0, a = [], s = 0; s < l.length; ++s) {
                            var f = J + l[s],
                                o = l[s];
                            if (S.indexOf(f) === -1) {
                                if (r) {
                                    var p = fileOperateFun.getNonSuffixPath(o),
                                        x = fileOperateFun.getSuffixPath(o);
                                    if (p.indexOf(F) !== -1 && p.indexOf("(") !== -1 && p.indexOf(")") !== -1 && x === A) {
                                        var c = p.split("(").length - 1,
                                            h = p.split(")").length - 1;
                                        if (c === 1 && h === 1 && p.charAt(p.length - 1) === ")") {
                                            var d = p.substr(p.indexOf("(") + 1, p.length - 3);
                                            !isNaN(parseInt(d)) && parseInt(d) > 0 && a.push(parseInt(d))
                                        }
                                    }
                                } else if (o.indexOf(P) !== -1 && o.indexOf("(") !== -1 && o.indexOf(")") !== -1) {
                                    var c = o.split("(").length - 1,
                                        h = o.split(")").length - 1;
                                    if (c === 1 && h === 1 && o.charAt(o.length - 1) === ")") {
                                        var d = o.substr(o.indexOf("(") + 1, o.length - 3);
                                        !isNaN(parseInt(d)) && parseInt(d) > 0 && a.push(parseInt(d))
                                    }
                                }
                            }
                        }
                        if (a.length > 1)
                            if (a.sort(v.compare), a[0] > 1) e = 1;
                            else {
                                for (var N = 0, s = 0; s < a.length; s++)
                                    if (a[s] + 1 < a[s + 1]) {
                                        e = a[s] + 1;
                                        break
                                    } else N++;
                                N === a.length && (e = a[a.length - 1] + 1)
                            }
                        else a.length === 1 ? a[0] > 1 ? e = 1 : e = a[0] + 1 : e = 1;
                        r ? P = F + "(" + e + ")." + A : P = P + "(" + e + ")";
                        var I = J + P;
                        fs.rename(S, I, function (L) {
                            L ? (u.status = "failed", u.RI = L.message) : u.status = "success", i(null, JSON.stringify(u))
                        })
                    }
                } else u.status = "non-existent", u.RI = " is non-existent.", i(null, JSON.stringify(u))
            }
        } catch (m) {
            logger.log("error", "km_fileTransferOperate:fileRename: rename failed" + m), i(null, JSON.stringify({
                status: "failed",
                RI: m.stack
            }))
        }
    }
    async getFile(n, i) {
        let t = url.parse(n.url, !0).search.split("&")[0];
        if (t = fileOperateFun.charReplace(decodeURI(t.replace("?", ""))), path.isAbsolute(t)) {
            i(null, JSON.stringify({
                status: "failed",
                RI: "Path must be relative path."
            }));
            return
        }
        let r = fileOperateFun.recombineAbsolutePath(t, fileOperateFun.getProjectUploadPath(n));
        fs.exists(r, function (l) {
            if (l) {
                let e = fs.readFileSync(r);
                i(null, {
                    code: 0,
                    header: mime.lookup(r),
                    content: e
                })
            } else logger.log("error", "km_fileTransferOperate:getFile: getFile:find nothing"), i(null, {
                code: -1,
                msg: "find nothing in "
            })
        })
    }
    uploads(n, i) {
        let t = n.query.filename,
            r = path.join(fileOperateFun.getProjectUploadPath(), t);
        fs.exists(r, function (l) {
            if (!l) {
                i(null, {
                    code: -1,
                    msg: `${r} not exist`
                });
                return
            }
            let e = fs.readFileSync(r);
            i(null, {
                code: 0,
                header: mime.lookup(r),
                content: e
            })
        })
    }
    saveImgWithBase64ToUpload(n, i) {
        try {
            let t = n.body;
            typeof t == "string" && (t = JSON.parse(t));
            let r = t.imgDate,
                l = t.imgPath;
            if (Array.isArray(r) || Array.isArray(l)) r.length !== l.length ? (logger.log("error", "img_controllers:saveImgWithBase64ToUpload:error:imgDate.length and imgPath.length must be equal!"), i(null, '{"status":"400",data:"imgDate.length and imgPath.length must be equal"', [404, "param error", {
                "Content-Type": "text/plain"
            }])) : (r.forEach((e, a) => {
                let s = path.normalize(l[a]),
                    f = path.join(fileOperateFun.getProjectUploadPath(n), s);
                e = e.replace(/^data:image\/\w+;base64,/, ""), e = new Buffer(e, "base64"), fs.writeFileSync(f, e)
            }), i(null, '{"status": "200"}'));
            else {
                let e = t.imgDate;
                t.imgPath = path.normalize(t.imgPath);
                let a = path.join(fileOperateFun.getProjectUploadPath(n), t.imgPath);
                e = e.replace(/^data:image\/\w+;base64,/, ""), e = new Buffer(e, "base64"), fs.writeFileSync(a, e), i(null, '{"status": "200"}')
            }
        } catch {
            logger.log("error", "img_controllers:saveImgWithBase64ToUpload:error:" + err), i(null, `{ "status: 400,error;${err.message}}`, [200, {
                "Content-Type": "application/json"
            }])
        }
    }
    async readFileInUniverData(n, i) {
        try {
            if (path.isAbsolute(n)) return {
                code: 400,
                msg: "\u6587\u4EF6\u8DEF\u5F84\u5FC5\u987B\u4E3A\u76F8\u5BF9\u8DEF\u5F84"
            };
            let t = fileOperateFun.charReplace(decodeURI(n.replace("/readFileInUniverData/", "")));
            const r = t.match(/(\.[^.]+|)$/)[0].toLowerCase();
            if (r !== ".xlsx" && r !== ".xls") return {
                code: 400,
                msg: "\u4EC5\u652F\u6301Excel\u6587\u4EF6\u683C\u5F0F(.xlsx, .xls)"
            };
            const l = fileOperateFun.recombineAbsolutePath(t, fileOperateFun.getProjectUploadReportPath()).split("?")[0];
            if (!l || !fs.existsSync(l)) return {
                code: 400,
                msg: "\u6587\u4EF6\u4E0D\u5B58\u5728"
            };
            i.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), i.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent("report.xlsx")}"`), fs.createReadStream(l).pipe(i)
        } catch (t) {
            return console.error(t), {
                code: 500,
                msg: t.message
            }
        }
    }
    async readFileImgData(n, i) {
        try {
            if (path.isAbsolute(n)) return {
                code: 400,
                msg: "\u6587\u4EF6\u8DEF\u5F84\u5FC5\u987B\u4E3A\u76F8\u5BF9\u8DEF\u5F84"
            };
            let t = fileOperateFun.charReplace(decodeURI(n.replace("/readFileInUniverData/", "")));
            const r = t.match(/(\.[^.]+|)$/)[0].toLowerCase();
            if (r !== ".xlsx" && r !== ".xls") return {
                code: 400,
                msg: "\u4EC5\u652F\u6301Excel\u6587\u4EF6\u683C\u5F0F(.xlsx, .xls)"
            };
            const l = fileOperateFun.recombineAbsolutePath(t, fileOperateFun.getProjectUploadReportPath()).split("?")[0];
            if (!l || !fs.existsSync(l)) return {
                code: 400,
                msg: "\u6587\u4EF6\u4E0D\u5B58\u5728"
            };
            i.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), i.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent("report.xlsx")}"`), fs.createReadStream(l).pipe(i)
        } catch (t) {
            return console.error(t), {
                code: 500,
                msg: t.message
            }
        }
    }
    getInstance() {
        return ResourceMng.instance || (ResourceMng.instance = new ResourceMng), ResourceMng.instance
    }
}
module.exports = new ResourceMng;