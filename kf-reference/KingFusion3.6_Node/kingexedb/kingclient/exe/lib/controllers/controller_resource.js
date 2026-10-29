const reqHandler = require("../../core/utils/request_handler"),
    resourceMng = require("../services/resourceMng/index").getInstance(),
    path = require("path"),
    fs = require("fs"),
    {
        kp_util
    } = require("../../core/utils");
class ResourceController {
    writeFile(t, e) {
        resourceMng.writeFile(t, (i, a) => {
            e.writeHead(200, {
                "Content-Type": "application/json"
            }), i ? (e.write({
                code: -1,
                msg: "Write failed!"
            }, "utf-8"), e.end()) : (e.write(a, "utf-8"), e.end())
        })
    }
    readFile(t, e) {
        resourceMng.readFile(t, (i, a) => {
            e.writeHead(200, {
                "Content-Type": "application/json"
            }), i ? (e.write({
                code: -1,
                msg: "ReadFile failed!"
            }, "utf-8"), e.end()) : (e.write(a, "utf-8"), e.end())
        })
    }
    isFile(t, e) {
        resourceMng.isFile(t, (i, a) => {
            e.writeHead(200, {
                "Content-Type": "application/json"
            }), i ? (e.write({
                code: -1,
                msg: "failed!"
            }, "utf-8"), e.end()) : (e.write(a, "utf-8"), e.end())
        })
    }
    upload(t, e) {
        resourceMng.uploadFile(t, e)
    }
    uploadReportFile(t, e) {
        resourceMng.uploadReportFile(t, e)
    }
    download(t, e) {
        resourceMng.download(t, e)
    }
    deleteFile(t, e) {
        resourceMng.deleteFile(t, (i, a) => {
            e.writeHead(200, {
                "Content-Type": "application/json"
            }), i ? (e.write({
                code: -1,
                msg: "Delete failed!"
            }, "utf-8"), e.end()) : (e.write(a, "utf-8"), e.end())
        })
    }
    filesList(t, e) {
        resourceMng.filesList(t, (i, a) => {
            e.writeHead(200, {
                "Content-Type": "application/json"
            }), i ? (e.write({
                code: -1,
                msg: "Get file list failed!"
            }, "utf-8"), e.end()) : (e.write(a, "utf-8"), e.end())
        })
    }
    creatFolder(t, e) {
        resourceMng.creatFolder(t, (i, a) => {
            i ? (e.write({
                code: -1,
                msg: "Get file list failed!"
            }, "utf-8"), e.end()) : (e.write(a, "utf-8"), e.end())
        })
    }
    deleteFolder(t, e) {
        resourceMng.deleteFolder(t, (i, a) => {
            i ? (e.write({
                code: -1,
                msg: "Get file list failed!"
            }, "utf-8"), e.end()) : (e.write(a, "utf-8"), e.end())
        })
    }
    searchFile(t, e) {
        e.writeHead(200, {
            "Content-Type": "application/json"
        }), resourceMng.searchFile(t, (i, a) => {
            i ? (e.write({
                code: -1,
                msg: "Search file list failed!"
            }, "utf-8"), e.end()) : (e.write(a, "utf-8"), e.end())
        })
    }
    copyFile(t, e) {
        e.writeHead(200, {
            "Content-Type": "application/json"
        }), resourceMng.copyFile(t, (i, a) => {
            i ? (e.write({
                code: -1,
                msg: "Copy file list failed!"
            }, "utf-8"), e.end()) : (e.write(a, "utf-8"), e.end())
        })
    }
    renameFile(t, e) {
        e.writeHead(200, {
            "Content-Type": "application/json"
        }), resourceMng.renameFile(t, (i, a) => {
            i ? (e.write({
                code: -1,
                msg: "Rename file list failed!"
            }, "utf-8"), e.end()) : (e.write(a, "utf-8"), e.end())
        })
    }
    getFile(t, e) {
        resourceMng.getFile(t, (i, a) => {
            i ? (e.write({
                code: -1,
                msg: "Rename file list failed!"
            }, "utf-8"), e.end()) : (a.code === 0 ? (e.writeHead(200, {
                "Content-Type": a.header
            }), e.write(a.content)) : e.write(a.msg, "utf-8"), e.end())
        })
    }
    saveImgWithBase64ToUpload(t, e) {
        resourceMng.saveImgWithBase64ToUpload(t, (i, a, n) => {
            n && e.writeHead(...n), e.write(a), e.end()
        })
    }
    uploads(t, e) {
        resourceMng.uploads(t, (i, a) => {
            i ? (e.write({
                code: -1,
                msg: "uploads file failed!"
            }, "utf-8"), e.end()) : (a.code === 0 ? (e.writeHead(200, {
                "Content-Type": a.header
            }), e.write(a.content)) : e.write(a.msg, "utf-8"), e.end())
        })
    }
    async readFileInUniverData(t, e) {
        try {
            let {
                filePath: i
            } = reqHandler.httpGetData(t);
            await resourceMng.readFileInUniverData(i, e)
        } catch (i) {
            e.sendErr(-1, i.message)
        }
    }
    async readFileImgData(t, e) {
        try {
            let {
                filePath: i
            } = reqHandler.httpGetData(t);
            await resourceMng.readFileImgData(i, e)
        } catch (i) {
            e.sendErr(-1, i.message)
        }
    }
    async saveHtModel(t, e) {
        try {
            let i = reqHandler.httpPostData(t, e);
            const a = path.join(global.projectBasePath, "htDataModel", `${i.path}.json`);
            fs.existsSync && fs.writeFileSync(a, i.htData);
            const n = a.split(/[\\/]+/),
                o = n.indexOf("kingclient"),
                r = o !== -1 ? n[o + 1] : "",
                d = path.join(t.session.tenantId, "kingclient", r, "project", "htDataModel", `${i.path}.json`),
                l = await kp_util.requestAsync({
                    url: encodeURI(`${global.externalConfig.kingGateWay.host}/client/saveHtModel`),
                    method: "POST",
                    json: !0,
                    strictSSL: !1,
                    rejectUnauthorized: !1,
                    headers: {
                        "content-type": "application/json",
                        Authorization: `Bearer ${t.session.token}`
                    },
                    body: {
                        path: d,
                        htData: i.htData
                    }
                });
            if (!l || !l.body || l.body.errorCode === -1) throw new Error(d.body.message || "\u5F00\u53D1\u6001\u4FDD\u5B58\u5931\u8D25")
        } catch (i) {
            logger.log("error", i), e.send({
                state: 500,
                message: "\u6587\u4EF6\u4FDD\u5B58\u5931\u8D25"
            })
        }
        e.send({
            state: 200,
            message: "\u6587\u4EF6\u4FDD\u5B58\u6210\u529F"
        })
    }
}
module.exports = new ResourceController;