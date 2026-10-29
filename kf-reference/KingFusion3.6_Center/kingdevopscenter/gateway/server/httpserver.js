// modified by jinlong.feng at 2026-10-29 KF源码精简入库
// Reference snapshot: credential literals redacted; do not deploy this copy.
const path = require("path"), express = require("express"), ConnectCas = require("connect-cas2"), session = require("express-session"), MemoryStore = require("session-memory-store")(session), cookieParser = require("cookie-parser"), http = require("http"), bodyParser = require("body-parser"), cors = require("cors"), _ = require("lodash");
class HttpServer {
    constructor() { this.app = express(), this.server = http.createServer(this.app); }
    init() { this.loadMiddleWares(), this.registerRouter(); }
    loadMiddleWares() {
        if (commonConfig.sdSSOLogin) {
            this.app.use(session({ name: "NSESSIONID", secret: "KF_REFERENCE_REDACTED", resave: !0, saveUninitialized: !0, store: new MemoryStore }));
            let e = commonConfig.casClient;
            e.servicePrefix = e.servicePrefix + ":11001";
            let s = [e.paths.validate, e.paths.login, e.paths.logout, e.paths.serviceValidate];
            e.ignore = [(e, o) => {
                    if (-1 != e.indexOf("/api/ssologin"))
                        return !1;
                    if (-1 != e.indexOf("/user/ssologin"))
                        return !1;
                    for (let o = 0; o < s.length; o++) {
                        const r = s[o];
                        if (-1 != e.indexOf(r))
                            return !1;
                    }
                    return !0;
                }], this.casClient = new ConnectCas(e);
        }
        this.app.use(cors()), this.app.use(bodyParser.json({ limit: "50mb" })), this.app.use(bodyParser.urlencoded({ limit: "50mb", extended: !1 })), this.app.use(cookieParser()), this.app.use("/api/oem/oemImg", express.static(path.join(__DIR, "public/devSystem"))), this.app.use("/api", express.static(path.join(__DIR, "help"), { maxAge: 864e5 })), this.app.use("/api/filestation", express.static(path.resolve(__DIR, "../../sdb/filestation"), { maxAge: 864e5 }));
    }
    registerRouter() {
        const e = require(`${__DIR}/lib/routers`);
        this.app.all("*", function (e, s, o) {
            if (s.header("Access-Control-Allow-Origin", "*"), s.header("Access-Control-Allow-Headers", "X-Requested-With,Authorization,datasourcename,Content-Type"), s.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS"), s.header("Content-Type", "application/json;charset=utf-8"), "OPTIONS" === e.method)
                return s.status(200), void s.send();
            o();
        }), this.app.all("*", function (e, s, o) {
            if (logger.log("info", `-----------------收到连接请求,客户端地址:${e.ip}`), logger.log("info", `-----------------originalUrl:${e.originalUrl}`), "/" == e.url) {
                if (!_.get(e, "session.cas.user", ""))
                    return console.log("==========no session"), o();
                const r = e.session.cas.user;
                s.cookie("username", r);
                let i = e.headers.host.split(":")[0];
                s.redirect(`https://${i}/`);
            }
            "/favicon.ico" !== e.url && o();
        }), this.app.get("/api/ssologin", function (e, s, o) {
            if (!_.get(e, "session.cas.user", ""))
                return console.log("==========no session"), o();
            const r = e.session.cas.user;
            s.cookie("username", r);
            e.headers.host.split(":")[0];
            s.end();
        }), commonConfig.sdSSOLogin && this.app.use(this.casClient.core()), this.app.use("/api", e), logger.log("info", "注册路由完成");
    }
}
module.exports = new HttpServer;
// end
