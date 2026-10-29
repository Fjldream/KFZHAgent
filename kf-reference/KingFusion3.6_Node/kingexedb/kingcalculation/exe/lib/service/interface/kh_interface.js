const {
    DATASOURCEMESSAGE
} = require(__dir + "/core/enums").enumCode, {
    reqHelper
} = require(__dir + "/core/utils");
class khInterface {
    KHAddDatasPool(u, e, h, c, m) {
        return new Promise((l, d) => {
            var g = 0;
            c.length = 0;
            var p = e.nginxHttpType ? e.nginxHttpType : "http",
                n = p + "://" + e.IP2 + ":" + e.portHttp + "/api/v1/historydata";
            reqHelper.asyncHttpPost({
                url: n,
                method: "POST",
                json: !0,
                timeout: m || 3e3,
                headers: {
                    Accept: "application/json",
                    Authorization: "Bearer " + getToken(),
                    datasourcename: encodeURIComponent(e.connectName),
                    token: u
                },
                body: h
            }, function (t) {
                if (t.errorCode && t.errorCode != 0) g = t.errorCode, logger.log("debug", "KHAddDatasPool execute error = " + JSON.stringify(t.errorCode)), logger.log("debug", "KHAddDatasPool execute error = " + JSON.stringify(t.message));
                else if (t.data)
                    if (t.data, typeof t.data == "object" && t.data.hasOwnProperty("data")) {
                        const {
                            errorCode: o,
                            data: i
                        } = t.data;
                        if (o) g = o;
                        else
                            for (var s = 0; s < i.tag_oks.length; s++) c.push(0)
                    } else {
                        let o = t.data;
                        for (var s = 0; s < o.length; s++) c.push(o[s].ErrorStatus)
                    } l(g)
            })
        })
    }
    KHQueryRawDatasPool(u, e, h, c, m, l, d, g, p, n) {
        return new Promise((t, s) => {
            var o = 0;
            p.length = 0;
            var i = {
                    tag: h,
                    start: c,
                    end: m,
                    version: l,
                    filter: d,
                    quality: g
                },
                P = e.nginxHttpType ? e.nginxHttpType : "http",
                a = P + "://" + e.IP2 + ":" + e.portHttp + "/api/v1/historydata/rawdata";
            reqHelper.asyncHttpPost({
                url: a,
                method: "POST",
                json: !0,
                timeout: n || 3e3,
                headers: {
                    Accept: "application/json",
                    Authorization: "Bearer " + getToken(),
                    datasourcename: encodeURIComponent(e.connectName),
                    token: u
                },
                body: i
            }, function (r) {
                if (r.errorCode && r.errorCode != 0) o = r.errorCode, logger.log("debug", "KHQueryRawDatasPool execute error = " + JSON.stringify(r.errorCode)), logger.log("debug", "KHQueryRawDatasPool execute error = " + JSON.stringify(r.message));
                else if (r.errcode) o = r.errcode, logger.log("debug", "KHQueryRawDatasPool execute error = " + JSON.stringify(r.errcode));
                else if (r.hasOwnProperty("system") && r.system === "linux")
                    for (var H in r.data)
                        for (var v = 0; v < r.data[H].length; v++) p.push(r.data[H][v]);
                else
                    for (var C = 0; C < r.data.length; C++) p.push(r.data[C]);
                t(o)
            })
        })
    }
    KHQuerySampleDatas1Pool(u, e, h, c, m, l, d) {
        return new Promise((g, p) => {
            var n = 0;
            l.length = 0;
            var t = {
                    tag: h,
                    time: c,
                    mode: m
                },
                s = e.nginxHttpType ? e.nginxHttpType : "http",
                o = s + "://" + e.IP2 + ":" + e.portHttp + "/api/v1/historydata/specifictimedata";
            reqHelper.asyncHttpPost({
                url: o,
                method: "POST",
                json: !0,
                timeout: d || 3e3,
                headers: {
                    Accept: "application/json",
                    Authorization: "Bearer " + getToken(),
                    datasourcename: encodeURIComponent(e.connectName),
                    token: u
                },
                body: t
            }, function (i) {
                if (i.errorCode && i.errorCode != 0) n = i.errorCode, logger.log("debug", "KHQuerySampleDatas1Pool execute error = " + JSON.stringify(i));
                else if (i.hasOwnProperty("system") && i.system === "linux")
                    for (var P in i.data)
                        for (var a = 0; a < i.data[P].length; a++) l.push(i.data[P][a]);
                else
                    for (var r = 0; r < i.data.length; r++) l.push(i.data[r]);
                g(n)
            })
        })
    }
    KHQuerySampleDatas2Pool(u, e, h, c, m, l, d, g, p, n) {
        return new Promise((t, s) => {
            var o = 0;
            p.length = 0;
            var i = {
                    start: c,
                    end: m,
                    tag: h,
                    mode: l,
                    calculatemode: g,
                    interval: d
                },
                P = e.nginxHttpType ? e.nginxHttpType : "http",
                a = P + "://" + e.IP2 + ":" + e.portHttp + "/api/v1/historydata/perioddata";
            reqHelper.asyncHttpPost({
                url: a,
                method: "POST",
                json: !0,
                timeout: n || 3e3,
                headers: {
                    Accept: "application/json",
                    Authorization: "Bearer " + getToken(),
                    datasourcename: encodeURIComponent(e.connectName),
                    token: u
                },
                body: i
            }, function (r) {
                if (r.errorCode && r.errorCode != 0) o = r.errorCode, logger.log("debug", "KHQuerySampleDatas2Pool execute error = " + JSON.stringify(r));
                else if (r.errcode) o = r.errcode, logger.log("debug", "KHQuerySampleDatas2Pool execute error = " + JSON.stringify(r.errcode));
                else if (r.hasOwnProperty("system") && r.system === "linux")
                    for (var H in r.data)
                        for (var v = 0; v < r.data[H].length; v++) p.push(r.data[H][v]);
                else
                    for (var C = 0; C < r.data.length; C++) p.push(r.data[C]);
                t(o)
            })
        })
    }
    KHGetCurrentValuePool(u, e, h, c, m) {
        return new Promise((l, d) => {
            var g = 0;
            c.length = 0;
            var p = e.nginxHttpType ? e.nginxHttpType : "http",
                n = p + "://" + e.IP2 + ":" + e.portHttp + "/api/v1/historydata/currentdata";
            reqHelper.asyncHttpPost({
                url: n,
                method: "POST",
                json: !0,
                timeout: m || 3e3,
                headers: {
                    Accept: "application/json",
                    Authorization: "Bearer " + getToken(),
                    datasourcename: encodeURIComponent(e.connectName),
                    token: u
                },
                body: h
            }, function (t) {
                try {
                    if (t.errorCode && t.errorCode != 0) g = t.errorCode, logger.log("debug", "KHGetCurrentValuePool execute error = " + JSON.stringify(t.errorCode));
                    else
                        for (var s = 0; s < t.data.length; s++) c[s] = t.data[s];
                    l(g)
                } catch (o) {
                    l(DATASOURCEMESSAGE.DATA_SOURCE_FAILED), logger.log("debug", "KHGetCurrentValuePool catch error: " + o.message)
                }
            })
        })
    }
    AsynKHAddDatasPool(u, e, h, c, m) {
        var l = 0,
            d = [],
            g = e.nginxHttpType ? e.nginxHttpType : "http",
            p = g + "://" + e.IP2 + ":" + e.portHttp + "/api/v1/historydata";
        reqHelper.asyncHttpPost({
            url: p,
            method: "POST",
            json: !0,
            timeout: m || 3e3,
            headers: {
                Accept: "application/json",
                Authorization: "Bearer " + getToken(),
                datasourcename: encodeURIComponent(e.connectName),
                token: u
            },
            body: h
        }, function (n) {
            if (n.errorCode && n.errorCode != 0) l = n.errorCode, logger.log("debug", "AsynKHAddDatasPool execute error = " + JSON.stringify(n.errorCode));
            else if (!n.hasOwnProperty("system") || n.system !== "linux")
                for (var t = 0; t < n.data.length; t++) d[t] = n.data[t].ErrorStatus;
            c(l, d)
        })
    }
    AsynKHQueryRawDatasPool(u, e, h, c, m, l, d, g, p, n) {
        var t = 0,
            s = [],
            o = {
                tag: h,
                start: c,
                end: m,
                version: l,
                filter: d,
                quality: g
            },
            i = e.nginxHttpType ? e.nginxHttpType : "http",
            P = i + "://" + e.IP2 + ":" + e.portHttp + "/api/v1/historydata/rawdata";
        reqHelper.asyncHttpPost({
            url: P,
            method: "POST",
            json: !0,
            timeout: n || 3e3,
            headers: {
                Accept: "application/json",
                Authorization: "Bearer " + getToken(),
                datasourcename: encodeURIComponent(e.connectName),
                token: u
            },
            body: o
        }, function (a) {
            if (a.errorCode && a.errorCode != 0) t = a.errorCode, logger.log("debug", "AsynKHQueryRawDatasPool execute error = " + JSON.stringify(a));
            else if (a.hasOwnProperty("system") && a.system === "linux")
                for (var r in a.data)
                    for (var H = 0; H < a.data[r].length; H++) s.push(a.data[r][H]);
            else
                for (var v = 0; v < a.data.length; v++) s.push(a.data[v]);
            p(t, s)
        })
    }
    AsynKHQuerySampleDatas1Pool(u, e, h, c, m, l, d) {
        var g = 0,
            p = [],
            n = {
                tag: h,
                time: c,
                mode: m
            },
            t = e.nginxHttpType ? e.nginxHttpType : "http",
            s = t + "://" + e.IP2 + ":" + e.portHttp + "/api/v1/historydata/specifictimedata";
        reqHelper.asyncHttpPost({
            url: s,
            method: "POST",
            json: !0,
            timeout: d || 3e3,
            headers: {
                Accept: "application/json",
                Authorization: "Bearer " + getToken(),
                datasourcename: encodeURIComponent(e.connectName),
                token: u
            },
            body: n
        }, function (o) {
            if (o.errorCode && o.errorCode != 0) g = o.errorCode, logger.log("debug", "KHQuerySampleDatas1Pool execute error = " + JSON.stringify(o.errorCode));
            else if (o.hasOwnProperty("system") && o.system === "linux")
                for (var i in o.data)
                    for (var P = 0; P < o.data[i].length; P++) p.push(o.data[i][P]);
            else
                for (var a = 0; a < o.data.length; a++) p.push(o.data[a]);
            l(g, p)
        })
    }
    AsynKHQuerySampleDatas2Pool(u, e, h, c, m, l, d, g, p, n) {
        var t = 0,
            s = [],
            o = {
                start: c,
                end: m,
                tag: h,
                mode: l,
                calculatemode: g,
                interval: d
            },
            i = e.nginxHttpType ? e.nginxHttpType : "http",
            P = i + "://" + e.IP2 + ":" + e.portHttp + "/api/v1/historydata/perioddata";
        reqHelper.asyncHttpPost({
            url: P,
            method: "POST",
            json: !0,
            timeout: n || 3e3,
            headers: {
                Accept: "application/json",
                Authorization: "Bearer " + getToken(),
                datasourcename: encodeURIComponent(e.connectName),
                token: u
            },
            body: o
        }, function (a) {
            if (a.errorCode && a.errorCode != 0) t = a.errorCode, logger.log("debug", "AsynKHQuerySampleDatas2Pool execute error = " + JSON.stringify(a));
            else if (a.errcode) t = a.errcode, logger.log("debug", "KHQuerySampleDatas2Pool execute error = " + JSON.stringify(a.errcode));
            else if (a.hasOwnProperty("system") && a.system === "linux")
                for (var r in a.data)
                    for (var H = 0; H < a.data[r].length; H++) s.push(a.data[r][H]);
            else
                for (var v = 0; v < a.data.length; v++) s.push(a.data[v]);
            p(t, s)
        })
    }
}
module.exports = new khInterface;