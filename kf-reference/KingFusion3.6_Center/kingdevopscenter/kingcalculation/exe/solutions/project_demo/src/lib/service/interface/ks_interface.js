// modified by jinlong.feng at 20260914 KC适配KS4.0
/**
 * Determine whether the datasource uses the KingSCADA query and subscription interfaces.
 * @param {object} dataSource Calculation datasource configuration.
 * @returns {boolean} Whether the datasource is a supported KingSCADA type.
 */
function isKingScadaDataSource(dataSource) {
    return dataSource.type === "KingSCADA_Windows" ||
        dataSource.type === "KingSCADA4.0" ||
        dataSource.type === "KingSCADA4.0_Linux";
}
// end
const {
    DATASOURCEMESSAGE
} = require(__dir + "/core/enums").enumCode, WsCommunication = require("./wsCommunication"), {
    reqHelper
} = require(__dir + "/core/utils");
class ksInterface {
    constructor() {
        this.tagArray = [], this.array = [], this.subVarArray = [], this.dataTagValueMap = new Map, this
            .websocketClientMap = new Map
    }
    KSQueryDatasPool(t, e, i, g) {
        try {
            return new Promise((r, c) => {
                var n = 0;
                g.length = 0;
                var s = e.nginxHttpType ? e.nginxHttpType : "http",
                    l = s + "://" + e.IP2 + ":" + e.portHttp + "/api/v2/realtimedata",
                    a = {
                        tag: i
                    };
                reqHelper.asyncHttpPost({
                    url: l,
                    method: "POST",
                    json: !0,
                    timeout: 3e3,
                    headers: {
                        Accept: "application/json",
                        Authorization: "Bearer " + getToken(),
                        datasourcename: encodeURIComponent(e.connectName),
                        token: t
                    },
                    body: a
                }, function(o) {
                    if (o.errorCode && o.errorCode != 0) n = o.errorCode, logger.log("debug",
                            "KSQueryDatasPool execute error = " + JSON.stringify(o.errorCode)),
                        logger.log("debug", "KSQueryDatasPool execute error = " + JSON.stringify(o
                            .message));
                    else
                        for (var p = 0; p < o.data.length; p++) g[p] = o.data[p];
                    r(n)
                })
            })
        } catch (r) {
            logger.log("debug", r)
        }
    }
    KSUpdateDatasPool(t, e, i, g) {
        return new Promise((r, c) => {
            logger.log("debug", "KSUpdateDatasPool");
            var n = 0;
            g.length = 0;
            var s = e.nginxHttpType ? e.nginxHttpType : "http",
                l = s + "://" + e.IP2 + ":" + e.portHttp + "/api/v2/writebackdata";
            let a = {
                tag: i
            };
            reqHelper.asyncHttpPost({
                url: encodeURI(l),
                method: "POST",
                json: !0,
                timeout: 3e3,
                headers: {
                    Accept: "application/json",
                    Authorization: "Bearer " + getToken(),
                    datasourcename: encodeURIComponent(e.connectName),
                    token: t
                },
                body: a
            }, function(o) {
                o.errorCode && o.errorCode != 0 && (n = o.errorCode, logger.log("debug",
                        "KSUpdateDatasPool execute error = " + JSON.stringify(o.errorCode)),
                    logger.log("debug", "KSUpdateDatasPool execute error = " + JSON.stringify(o
                        .message))), r(n)
            })
        })
    }
    KSQueryHistoryDatasPool(t, e, i, g, r, c, n, s, l) {
        return new Promise((a, o) => {
            logger.log("debug", "KSQueryHistoryDatasPool");
            var p = 0,
                d = {};
            d.startTime = g, d.endTime = r, d.tagNames = i, d.DataVersion = c, d.filter = n, d.dataQuality =
                s;
            var v = e.nginxHttpType ? e.nginxHttpType : "http",
                m = v + "://" + e.IP2 + ":" + e.portHttp + "/api/v2/historydata";
            reqHelper.asyncHttpPost({
                url: encodeURI(m),
                method: "POST",
                json: !0,
                timeout: 3e3,
                headers: {
                    Accept: "application/json",
                    Authorization: "Bearer " + getToken(),
                    datasourcename: encodeURIComponent(e.connectName),
                    token: t
                },
                body: d
            }, function(u) {
                if (u.errorCode && u.errorCode != 0) p = u.errorCode, logger.log("debug",
                        "KSQueryHistoryDatasPool execute error = " + JSON.stringify(u.errorCode)),
                    logger.log("debug", "KSQueryHistoryDatasPool execute message = " + JSON
                        .stringify(u.message));
                else
                    for (let h = 0; h < u.data.length; h++) l[h] = u.data[h];
                a(p)
            })
        })
    }
    AsynKSQueryDatasPool(t, e, i, g) {
        logger.log("debug", "AsynKSQueryDatasPool");
        var r = 0,
            c = new Array,
            n = e.nginxHttpType ? e.nginxHttpType : "http",
            s = n + "://" + e.IP2 + ":" + e.portHttp + "/api/v2/realtimedata",
            l = {
                tag: i
            };
        reqHelper.asyncHttpPost({
            url: s,
            method: "POST",
            json: !0,
            timeout: 3e3,
            headers: {
                Accept: "application/json",
                Authorization: "Bearer " + getToken(),
                datasourcename: encodeURIComponent(e.connectName),
                token: t
            },
            body: l
        }, function(a) {
            if (a.errorCode && a.errorCode != 0) r = a.errorCode, logger.log("debug",
                "AsynKSQueryDatasPool execute error = " + JSON.stringify(a.errorCode)), logger.log(
                "debug", "AsynKSQueryDatasPool execute message = " + JSON.stringify(a.message));
            else
                for (var o = 0; o < a.data.length; o++) c[o] = a.data[o];
            g(r, c)
        })
    }
    AsynKSUpdateDatasPool(t, e, i, g) {
        logger.log("debug", "AsynKSUpdateDatasPool");
        var r = 0,
            c = [],
            n = e.nginxHttpType ? e.nginxHttpType : "http",
            s = n + "://" + e.IP2 + ":" + e.portHttp + "/api/v2/writebackdata";
        let l = {
            tag: i
        };
        reqHelper.asyncHttpPost({
            url: s,
            method: "POST",
            json: !0,
            timeout: 3e3,
            headers: {
                Accept: "application/json",
                Authorization: "Bearer " + getToken(),
                datasourcename: encodeURIComponent(e.connectName),
                token: t
            },
            body: l
        }, function(a) {
            a.errorCode && a.errorCode != 0 && (r = a.errorCode, logger.log("debug",
                "AsynKSUpdateDatasPool execute error = " + JSON.stringify(a.errorCode)), logger.log(
                "debug", "AsynKSUpdateDatasPool execute error = " + JSON.stringify(a.message))), g(r, c)
        })
    }
    AsynKSQueryHistoryDatasPool(t, e, i, g, r, c, n, s, l) {
        logger.log("debug", "AsynKSQueryHistoryDatasPool");
        var a = 0,
            o = [],
            p = {};
        p.startTime = g, p.endTime = r, p.tagNames = i, p.DataVersion = c, p.filter = n, p.dataQuality = s;
        var d = e.nginxHttpType ? e.nginxHttpType : "http",
            v = d + "://" + e.IP2 + ":" + e.portHttp + "/api/v2/historydata";
        reqHelper.asyncHttpPost({
            url: encodeURI(v),
            method: "POST",
            json: !0,
            timeout: 3e3,
            headers: {
                Accept: "application/json",
                Authorization: "Bearer " + getToken(),
                datasourcename: encodeURIComponent(e.connectName),
                token: t
            },
            body: p
        }, function(m) {
            if (m.errorCode && m.errorCode != 0) a = m.errorCode, logger.log("debug",
                    "ASynKSQueryHistoryDatasPool execute error = " + JSON.stringify(m.errorCode)), logger
                .log("debug", "ASynKSQueryHistoryDatasPool execute message = " + JSON.stringify(m.message));
            else
                for (let u = 0; u < m.data.length; u++) o[u] = m.data[u];
            l(a, o)
        })
    }
    tagKSArray(t) {
        let e = !0,
            i, g, r = 0;
        var c = this;
        for (let a = 0; a < t.length; a++) {
            var n = t[a];
            i = n.dataSourceName;
            var s = void 0;
            for (let o = 0; o < dataAccessData.dataAccess.length; o++) {
                var l = dataAccessData.dataAccess[o];
                if (i === l.name) {
                    s = l;
                    break
                }
            }
            if (s === void 0) {
                logger.log("debug", "KingSCADA not found" + i);
                return
            }
            c.existFlag = !0, this.tagArray.push(n.TagName)
        }
    }
    async KSWSConnect(t, e, i, g) {
        logger.log("debug", "start kSwsconnect====");
        let r = t.serverName,
            c = t.connectName,
            n = t.name;
        var s = e.get(r);
        if (s == null) {
            logger.log("debug", `app\u4FE1\u606F\u672A\u627E\u5230\uFF1A${r}`);
            return
        }
        let l = "ws://";
        s.nginxHttpType == "https" && (l = "wss://");
        let a = l + s.ip + ":" + s.portSocket + "/",
            o = new WsCommunication(a, n, i, this.callbackKSPool, g, this);
        this.websocketClientMap.set(c, o)
    }
    async KSSubscribeTagValuesPool(t, e) {
        var i = e.get(t.serverName),
            g = this;
        if (i != null) {
            var r = await this.parseNameKS(t, e);
            if (r == null || r.length == 0) return;
            var c = await generateUUID(),
                n = {};
            n.datasourcename = t.connectName, n.token = token, n.subscribeFlag = 1, n.requestType = 1, n.tag = r, n
                .requestId = c;
            var s = JSON.stringify(n);
            this.websocketClientMap.get(t.connectName) && this.websocketClientMap.get(t.connectName).send(s)
        }
    }
    callbackKSPool(t, e, i) {
        t = t.data;
        for (let r = 0; r < t.length; r++) {
            var g = t[r];
            i.subCallback(g, e)
        }
    }
    subCallback(data, globalArray) {
        var InParam = data;
        for (let index = 0; index < globalArray.length && InParam.QualityStamp !== "Bad"; index++) {
            var element = globalArray[index];
            if (element.TagName === data.N) {
                if (typeof data.V == "string") var strTemp = "global." + element.name + "=data.V";
                else var strTemp = "global." + element.name + "=" + data.V;
                eval(strTemp);
                break
            }
        }
        for (let index = 0; index < this.array.length; index++) {
            var element = this.array[index],
                ss = element.split(/\./);
            if (ss.length === 2 && ss[1] === data.N) {
                var strTemp = element + "= data.V;";
                eval(strTemp);
                continue
            }
            if (ss.length === 3 && ss[1] + "." + ss[2] === data.N) {
                var strTemp = element + "= data.V;";
                eval(strTemp);
                continue
            }
        }
        var localData = this.dataTagValueMap.get(data.N);
        if (!(!data.N || localData === data.V)) {
            if (localData === void 0) {
                this.dataTagValueMap.set(data.N, data.V);
                return
            }
            this.dataTagValueMap.set(data.N, data.V);
            for (let t = 0; t < this.subVarArray.length; t++) {
                var element = this.subVarArray[t],
                    ss = element.expression.split(/\./);
                if (ss.length === 2 && convertNameToRegExp(ss[1]).test(data.N)) {
                    vm_change(element, InParam);
                    continue
                }
                if (ss.length === 3 && convertNameToRegExp(ss[1] + "." + ss[2]).test(data.N)) {
                    vm_change(element, InParam);
                    continue
                }
            }
        }
    }
    async parseNameKS(t, e) {
        if (
                // modified by jinlong.feng at 20260914 KC适配KS4.0
                isKingScadaDataSource(t)
                // end
                ) {
            var i = this.tagArray,
                g = new Set,
                r = "";
            for (let s = 0; s < i.length; s++) {
                const l = i[s];
                if (l.indexOf("*") === -1 && l.indexOf("?") === -1) g.add(l);
                else {
                    var c = convertNameToRegExp(l);
                    if (t.info.pool !== "true") r === "" && (r = await KSGetAllTagNames());
                    else var r = [],
                        n = await getKSKIOKVTags(t.info, r, e);
                    for (let a = 0; a < r.length; a++) {
                        const o = r[a].TagName;
                        c.test(o) && g.add(o)
                    }
                }
            }
        }
        return Array.from(g)
    }
}
module.exports = new ksInterface;
