// modified by jinlong.feng at 2026-10-29 KF源码精简入库
// Reference snapshot: credential literals redacted; do not deploy this copy.
const Joi = require("joi"), { enum_ksOperate } = require("../../../core/enums/enum_common");
class KSDao {
    constructor() { this.ksInterface = null, this.initInterface(); }
    validate(t) { return Joi.object({ ip: Joi.string().required(), realPort: Joi.number().required() }).validate(t, { stripUnknown: !0 }); }
    initInterface() {
        try {
            switch (global.KingOS) {
                case "win64":
                    this.ksInterface = require("../../../core/extensions/win64/KS/KSInterface.node");
                    break;
                case "linux_x64":
                    this.ksInterface = require("../../../core/extensions/linux/x86/KSLXC/KSLInterface.node");
                    break;
                case "linux_arm64":
                    this.ksInterface = require("../../../core/extensions/linux/arm64/KSLXC/KSLInterface.node");
                    break;
                default: break;
            }
        }
        catch (t) {
            logger.log("fatal", t.message);
        }
    }
    async test(t) {
        if (!this.ksInterface)
            return !1;
        const { error: s, value: n } = this.validate(t);
        if (s)
            throw new Error(`\u6570\u636E\u9A8C\u8BC1\u5931\u8D25: ${s.details[0].message}`);
        let a = await this.createRealConnection(n);
        return a ? (this.disConnectServer(a), !0) : !1;
    }
    async getTagList(t) {
        if (!this.ksInterface)
            return "KS.node\u6587\u4EF6\u5F15\u5165\u5931\u8D25";
        const { error: s, value: n } = this.validate(t);
        if (s)
            throw new Error(`\u6570\u636E\u9A8C\u8BC1\u5931\u8D25: ${s.details[0].message}`);
        let a = await this.createRealConnection(n);
        if (a) {
            let o = await this.getAllTag(a);
            return this.disConnectServer(a), o;
        }
        else
            return !1;
    }
    createRealConnection(t) {
        const s = { RequestType: enum_ksOperate.KFKS_SERVER_CONNECT, ServerName: t.ip, ServerPort: t.realPort.toString(), UserName: "KVAdministrator", Password: "KF_REFERENCE_REDACTED", TimeOut: 1e4 };
        return new Promise((n, a) => {
            const o = JSON.stringify(s);
            this.ksInterface.runCall(o, (r, l) => {
                try {
                    if (parseInt(r) === 0) {
                        let e = JSON.parse(l);
                        e.errorCode && e.errorCode !== 0 ? (logger.log("error", `\u6D4B\u8BD5\u8FDE\u63A5\u63A5\u53E3\u8C03\u7528\u5931\u8D25\uFF0C\u9519\u8BEF\u7801\uFF1A${e.errorCode}`), n(!1)) : e.ConnectHandle ? (logger.log("info", `\u6D4B\u8BD5\u8FDE\u63A5\u63A5\u53E3\u8C03\u7528\u6210\u529F\uFF0C\u8FDE\u63A5\u53E5\u67C4${e.ConnectHandle}`), n(e.ConnectHandle)) : (logger.log("error", `\u6D4B\u8BD5\u8FDE\u63A5\u63A5\u53E3\u8C03\u7528\u5931\u8D25\uFF0C\u65E0\u6548\u7684\u8FDE\u63A5\u53E5\u67C4${e.ConnectHandle}`), n(!1));
                    }
                    else
                        logger.log("error", `\u6D4B\u8BD5\u8FDE\u63A5\u63A5\u53E3\u8C03\u7528\u5931\u8D25\uFF0C\u9519\u8BEF\u7801\uFF1A${r}`), n(!1);
                }
                catch (e) {
                    logger.log("error", e), n(!1);
                }
            });
        });
    }
    disConnectServer(t) { let s = JSON.stringify({ RequestType: enum_ksOperate.KFKS_SERVER_DISCONNECT, ConnectHandle: t }); return new Promise((n, a) => { this.ksInterface.runCall(s, (o, r) => { parseInt(o) === 0 ? (logger.log("info", `ks\u5B9E\u65F6\u5E93\u53E5\u67C4${t}\u65AD\u5F00`), n(!0)) : (logger.log("error", `ks\u5B9E\u65F6\u5E93\u53E5\u67C4${t}\u65AD\u5F00\u5931\u8D25`), n(!1)); }); }); }
    getAllTag(t) {
        let s = JSON.stringify({ RequestType: enum_ksOperate.KFKS_GET_ALL_TAGNAME, ConnectHandle: t });
        return new Promise((n, a) => {
            try {
                this.ksInterface.runCall(s, function (o, r) {
                    if (parseInt(o) === 0) {
                        logger.log("info", "ks\u83B7\u53D6KS\u6570\u636E\u6E90\u53D8\u91CF\u6210\u529F"), r = JSON.parse(r);
                        let l = [];
                        for (let e = 0; e < r.length; e++) {
                            let i = {};
                            r[e].TagID < 20 || r[e].TagID > 1e9 && r[e].TagID < 2e9 || (i.TagName = r[e].TagName, i.TagDescription = r[e].TagComment, i.Group = "", (r[e].DataType == 2 || r[e].DataType == 3 || r[e].DataType == 4 || r[e].DataType == 5 || r[e].DataType == 6 || r[e].DataType == 7 || r[e].DataType == 8 || r[e].DataType == 9) && (r[e].DataType = 2), r[e].DataType == 10 && (r[e].DataType = 3), r[e].DataType == 11 && (r[e].DataType = 4), (r[e].DataType == 12 || r[e].DataType == 13 || r[e].DataType == 15 || r[e].DataType == 16 || r[e].DataType == 17) && (r[e].DataType = 5), i.DataType = r[e].DataType, i.Other = "", l.push(i));
                        }
                        logger.log("debug", "\u83B7\u53D6KS\u6570\u636E\u6E90\u53D8\u91CF\u6210\u529F AsynKSGetAllTagNames success tagList=" + JSON.stringify(l)), n(l);
                    }
                    else
                        logger.log("error", `\u83B7\u53D6KS\u6570\u636E\u6E90\u53D8\u91CF\u5931\u8D25 \u9519\u8BEF\u7801\uFF1A${o}`), n(!1);
                });
            }
            catch (o) {
                logger.log("error", `\u83B7\u53D6KS\u6570\u636E\u6E90\u53D8\u91CF\u5931\u8D25 \u9519\u8BEF\u7801\uFF1A${o}`);
            }
        });
    }
}
module.exports = new KSDao;
// end
