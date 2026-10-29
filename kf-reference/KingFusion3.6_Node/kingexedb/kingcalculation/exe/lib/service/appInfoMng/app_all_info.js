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
const DBTagArrayMapAPI = require("../../service/globalVarMng/dataDictionary/globalVar"),
    KIOInterface = require("../interface/kio_interface.js"),
    KSInterface = require("../interface/ks_interface.js"),
    KHInterface = require("../interface/kh_interface.js"),
    {
        reqHelper
    } = require(__dir + "/core/utils");
class appAllInfo {
    constructor() {
        this.dataAccessMap = new Map, this.appNameIPPortMap = new Map, this.opsCenterHost = newInfo.kingGateWay
            .host, this.DBTagArrayMap = DBTagArrayMapAPI.getglobalSubArray()
    }
    async init(o) {
        for (let a = 0; a < o.dataAccess.length; a++) {
            let e = o.dataAccess[a];
            this.dataAccessMap.set(e.name, e), (e.type == "KingIOServer" || e.type == "KingIOServer_Windows" || 
                // modified by jinlong.feng at 20260914 KC适配KS4.0
                isKingScadaDataSource(e)
                // end
                 || e.type == "KingView_Windows" || e.type == "MySQL" || e.type ==
                    "PostgreSQL" || e.type == "SQLServer" || e.type == "TimeScaleDB" || e.type == "Oracle" || e
                    .type == "DM" || e.type == "KingHistorian_Windows" || e.type == "MongoDB" || e.type ==
                    "Redis" || e.type == "MQTT" || e.type == "TDEngine" || e.type == "KingHistorian4.0_Linux" || e
                    .type == "Tdengine" || e.type == "\u5DE5\u4E1A\u6570\u636E\u6E90_\u7F51\u7EDC\u6A21\u5F0F") &&
                this.appNameIPPortMap.get(e.serverName) == null && await this.GetAppInfo(token, e.serverName) !==
                0 && logger.log("debug", e.serverName + " get info failed")
        }
        this.initIOTag(o)
    }
    GetAppInfo(o, a) {
        return new Promise((e, l) => {
            var n = this.opsCenterHost + "/ops/accessURL?appName=" + a + `&tenant_id=${global.tenantId}`,
                i = 0,
                r = this;
            reqHelper.asyncHttpGet({
                url: encodeURI(n),
                method: "GET",
                json: !0,
                headers: {
                    "content-type": "application/json",
                    Authorization: `Bearer ${o}`
                },
                rejectUnauthorized: !1
            }, function(s) {
                if (s.errorCode != 0) i = s.errorCode, logger.log("debug", "getAppInfo url= " + n +
                    "failed! ");
                else if (s.errorCode == 0 && s.data !== null) {
                    let p = {};
                    var t = s.data;
                    let g = t.accessUrl.indexOf(":");
                    if (p.ip = t.accessUrl.substring(0, g), t.isAgent == 0) {
                        let c = t.accessUrl.indexOf("/");
                        p.port = parseInt(t.accessUrl.substring(g + 1, c))
                    } else t.isAgent == 1 && (p.port = t.accessUrl.substring(g + 1), p
                        .nginxHttpType = t.nginxHttpType);
                    p.portSocket = p.port, r.appNameIPPortMap.set(a, p)
                } else i = -1, logger.log("debug", "getAppInfo url= " + n + "error = " + s.message +
                    `data:${s.data}`);
                e(i)
            })
        })
    }
    async initIOTag(o) {
        for (var a = 0; a < o.dataAccess.length; ++a) try {
            let r = o.dataAccess[a];
            if (
                // modified by jinlong.feng at 20260914 KC适配KS4.0
                isKingScadaDataSource(r)
                // end
                 || r.type ===
                "\u5DE5\u4E1A\u6570\u636E\u6E90_\u7F51\u7EDC\u6A21\u5F0F" && (r.newWorkDataType ===
                    "KingScadaWindow3.8" || r.newWorkDataType === "KingScadaWindows3.8")) {
                var e = !1;
                for (let s of this.DBTagArrayMap.entries()) {
                    var l = s[0],
                        n = s[1],
                        i = "";
                    if (l === r.name) {
                        if (i = r.type, i === "") return;
                        e = !0, dataInfoKS.push(r), KSInterface.tagKSArray(n.globalArray);
                        let t = this;
                        KSInterface.KSWSConnect(r, this.appNameIPPortMap, n.globalArray, function(p) {
                            KSInterface.KSSubscribeTagValuesPool(r, t.appNameIPPortMap)
                        })
                    }
                }
                if (e === !1) {
                    let s = [],
                        t = [],
                        p = [];
                    dataInfoKS.push(r)
                }
            } else if (r.type === "KingHistorian_Windows" || r.type === "KingHistorian4.0_Linux" || r.type ==
                "\u5DE5\u4E1A\u6570\u636E\u6E90_\u7F51\u7EDC\u6A21\u5F0F" && r.newWorkDataType === "KHFDBServer"
                ) dataInfoKH.push(r);
            else if (r.type === "KingIOServer" || r.type === "KingIOServer_Windows" || r.type ===
                "\u5DE5\u4E1A\u6570\u636E\u6E90_\u7F51\u7EDC\u6A21\u5F0F" && (r.newWorkDataType ===
                    "KingIOServerWindow3.8" || r.newWorkDataType === "KingIOServerLinux" || r
                    .newWorkDataType === "KingIOServerWindows3.8")) {
                var e = !1;
                for (let t of this.DBTagArrayMap.entries()) {
                    var l = t[0],
                        n = t[1],
                        i = "";
                    if (l === r.name) {
                        if (i = r.type, i === "") return;
                        e = !0, dataInfoKIO.push(r), KIOInterface.tagKIOArray(n.globalArray);
                        let f = this;
                        KIOInterface.KIOWSConnect(r, this.appNameIPPortMap, n.globalArray, function(u) {
                            KIOInterface.KIOSubscribeTagValuesPool(r, f.appNameIPPortMap)
                        })
                    }
                }
                if (e === !1) {
                    let t = [],
                        p = [],
                        g = [];
                    dataInfoKIO.push(r)
                }
            } else dataInfoAll.push(r)
        } catch (r) {
            logger.log("fatal", "initIOTag error:" + r.message)
        }
    }
    getAppNameIPPortMap() {
        return this.appNameIPPortMap
    }
    isDataAccess(o) {
        var a = /\./,
            e = o.split(a),
            l = !1;
        for (let i of this.dataAccessMap.entries()) {
            var n = i[0];
            n === e[0] && (l = !0)
        }
        return l
    }
}
module.exports = new appAllInfo;
