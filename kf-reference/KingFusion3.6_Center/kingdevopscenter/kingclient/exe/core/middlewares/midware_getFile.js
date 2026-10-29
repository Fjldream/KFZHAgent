// modified by jinlong.feng at 2026-10-29 KF源码精简入库
// Reference snapshot: credential literals redacted; do not deploy this copy.
"use strict";
const fs = require("fs"), path = require("path");
let url = require("url"), mimes = require("mime").types;
const { request_handler } = require("../utils");
module.exports = (n, e, u) => {
    let t = n.url, a = url.parse(t).pathname;
    if (n.method === "GET") {
        let d = a.match(/(\.[^.]+|)$/)[0];
        if (d.toLowerCase() === ".json") {
            let i = "";
            if (t.indexOf("externalConfig.json") !== -1)
                return e.send({ expose: { httpPort: 11001, wsPort: 8002, http_type: "KMHttp", ws_type: "KMWs" }, oauthClient: { grantType: "password", redirectUri: "/main", clientname: "KingPortal", description: "KingPortal", clientId: "9EAE7E9C1245D0AA", clientSecret: "KF_REFERENCE_REDACTED", host: "http://127.0.0.1:11003" }, redirectUrl: { mainURL: "/", loginURL: "/", oauthURL: "/", clientURL: "/", calculationURL: "/", ioURL: "/", dbURL: "/" }, access_token: { accessTokenLifetime: 3600 } });
            if (t.indexOf("Predefined") !== -1)
                i = path.resolve(__DIR, t);
            else if (t.indexOf("htDataModel") !== -1) {
                let r = "";
                url.parse(t).query && url.parse(t).query.indexOf("=") !== -1 && url.parse(t).query.split("=")[0] !== "token" && (r = url.parse(t).query.split("=")[1]), i = global.projectBasePath + "/" + n.session.tenantId + "/kingclient" + r + decodeURI(a);
            }
            else
                i = path.resolve(global.projectBasePath + "/" + n.headers.tenant_id + "/kingclient" + t);
            if (i = decodeURI(i), fs.existsSync(i)) {
                let r = fs.readFileSync(i, "utf-8");
                return i.indexOf("externalConfig.json") !== -1 && (typeof r == "string" && (r = JSON.parse(r)), r.hasOwnProperty("redis") && delete r.redis, r = JSON.stringify(r)), e.writeHead(200, { "Content-Type": "application/json" }), e.write(r, "utf-8"), e.end();
            }
            else
                return logger.log("error", i + " :does not exist!"), e.writeHead(404, "not found", { "Content-Type": "text/plain" }), e.write("the request " + i + " is not found"), e.end();
        }
        else if (t.indexOf("htDataModel") !== -1) {
            var o = "";
            url.parse(t).query && url.parse(t).query.indexOf("=") !== -1 && url.parse(t).query.split("=")[0] !== "token" && (o = url.parse(t).query.split("=")[1]);
            let i = global.projectBasePath + "/" + n.session.tenantId + "/kingclient" + o + decodeURI(a);
            if (typeof i == "string" && d) {
                var s = mimes[d.slice(1)] || "text/plain";
                e.setHeader("Content-Type", s);
                var y = fs.existsSync(i);
                if (y) {
                    var p = fs.readFileSync(i, "binary");
                    return e.writeHead(200, { "Content-Type": s }), e.write(p, "binary"), e.end();
                }
                else
                    return logger.log("error", path + " :does not exist!"), e.writeHead(404, { "Content-Type": "text/plain" }), e.write("the request " + path + " is not found"), e.end();
            }
        }
    }
    else if (n.method === "POST" && t.indexOf("htDataModel") !== -1) {
        var h = 0, l = n.body.postData;
        l = request_handler.decryptPostData(l);
        var o = "";
        url.parse(t).query && url.parse(t).query.indexOf("=") !== -1 && (o = url.parse(t).query.split("=")[1]);
        var f = global.projectBasePath + "/" + n.session.tenantId + "/kingclient" + o + decodeURI(a);
        typeof l == "object" && (l = JSON.stringify(l));
        try {
            return fs.writeFileSync(f, l, "utf-8"), console.log(a + ": Save Success"), e.write("true"), e.end();
        }
        catch (c) {
            return console.log(a + ": Save Failed" + c), e.writeHead(404, "not found", { "Content-Type": "text/plain" }), e.write("the request " + f + " is not found"), e.end();
        }
    }
    u();
};
// end
