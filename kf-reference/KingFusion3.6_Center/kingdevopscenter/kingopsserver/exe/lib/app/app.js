// modified by jinlong.feng at 2026-10-29 KF源码精简入库
// Reference snapshot: credential literals redacted; do not deploy this copy.
const express = require("express"), http = require("http"), path = require("path"), bodyParser = require("body-parser"), ejs = require("ejs"), log4js = require("log4js"), responseTime = require("response-time"), routes = require(__dir + "/lib/routers"), ConnectCas = require("connect-cas2"), session = require("express-session"), MemoryStore = require("session-memory-store")(session), _ = require("lodash");
global.commonConfig = require(path.resolve(__dir + "/../../../config/common.json"));
function ExpressApp() {
    this.getApp = function () { return this.app; }, this.init = function () {
        if (this.app = express(), this.httpServer = http.createServer(this.app), this.app.engine("html", ejs.__express), this.app.set("view engine", "html"), this.app.use(bodyParser.urlencoded({ extended: !1 })), this.app.use(bodyParser.json()), this.app.use(express.static(path.join(__dir, "views"))), this.app.use("/oemImg", express.static(path.join(__dir, "oem/opsSystem/oemImg"))), this.app.get("/images/*", function (e, t) { t.sendFile(__dir + "/views/" + e.url), logger.log("info", "Request for " + e.url + " received."); }), this.app.use(responseTime(function (e, t, s) { logger.log("info", '"'.concat(e.method, "").concat(e.url, '" ').concat(s, "ms")); })), this.app.use(log4js.connectLogger(log4js.getLogger("http"), { level: log4js.levels.INFO, format: "method:url" })), commonConfig.sdSSOLogin) {
            this.app.use(session({ name: "NSESSIONID", secret: "KF_REFERENCE_REDACTED", resave: !0, saveUninitialized: !0, store: new MemoryStore }));
            let e = commonConfig.casClient;
            e.servicePrefix = e.servicePrefix + ":12000", e.ignore = ["/api/v1", "/login", "/getPublicKey", "/logout"];
            let t = new ConnectCas(e);
            this.app.use(t.core());
        }
        this.app.use("/", routes), this.app.use(function (e, t, s, o) { logger.log("error", e), e.code === 400 ? (s.status(400), s.redirect(302, "/login")) : (s.status(e.code || 500), s.send("Error")); });
    };
}
module.exports = new ExpressApp;
// end
