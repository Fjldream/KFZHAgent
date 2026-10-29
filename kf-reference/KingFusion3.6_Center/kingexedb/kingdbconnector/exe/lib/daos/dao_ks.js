// modified by jinlong.feng at 2026-10-29 KF源码精简入库
// Reference snapshot: credential literals redacted; do not deploy this copy.
const { kdb_util } = require("../../core/utils"), { common: commonEnums } = require("../../core/enums"), osType = kdb_util.osType();
let ksInterface;
try {
    osType == "win" && (ksInterface = require("../../core/extensions/win64/KS/KSInterface.node"));
}
catch (a) {
    logger.log("fatal", a.message);
}
class KSDao {
    constructor() { }
    static createRealConnection(t, e) {
        if (!ksInterface)
            return e("KS.node\u6587\u4EF6\u5F15\u5165\u5931\u8D25", null);
        let s = { RequestType: commonEnums.enum_ksOperate.KFKS_SERVER_CONNECT, ServerName: t.ip, ServerPort: t.realPort.toString(), UserName: "KVAdministrator", Password: "KF_REFERENCE_REDACTED", TimeOut: t.timeout || 1e4 }, u = JSON.stringify(s);
        ksInterface.runCall(u, (r, n) => {
            try {
                if (r !== 0)
                    return e(`\u8FD4\u56DEcode:${r},\u8FD4\u56DE\u4FE1\u606F:${n} `, null);
                let l = JSON.parse(n);
                if (l.ConnectHandle == 0 || l.errorCode)
                    return e(`\u8FD4\u56DEcode:${r},\u8FD4\u56DE\u4FE1\u606F:${n} `, null);
                let i = l.ConnectHandle;
                e(null, i);
            }
            catch (l) {
                e(l.message, null);
            }
        });
    }
    static createHisConnection(t, e) {
        if (!ksInterface)
            return e("KS.node\u6587\u4EF6\u5F15\u5165\u5931\u8D25", null);
        let s = { RequestType: commonEnums.enum_ksOperate.KFKS_HDB_SERVER_CONNECT, ServerName: t.ip, ServerPort: t.historyPort.toString(), UserName: "KVAdministrator", Password: "KF_REFERENCE_REDACTED", TimeOut: t.timeout || 1e4 }, u = JSON.stringify(s);
        ksInterface.runCall(u, (r, n) => {
            try {
                if (r !== 0)
                    return e(`\u8FD4\u56DEcode:${r},\u8FD4\u56DE\u4FE1\u606F:${n} `, null);
                let l = JSON.parse(n);
                if (l.ConnectHandle == 0 || l.errorCode)
                    return e(`\u8FD4\u56DEcode:${r},\u8FD4\u56DE\u4FE1\u606F:${n} `, null);
                let i = l.ConnectHandle;
                e(null, i);
            }
            catch (l) {
                e(l.message, null);
            }
        });
    }
    static createAlarmConnection(t, e) {
        if (!ksInterface)
            return e("KS.node\u6587\u4EF6\u5F15\u5165\u5931\u8D25", null);
        let s = { RequestType: commonEnums.enum_ksOperate.KFKS_ALARM_SERVER_CONNECT, ServerName: t.ip, ServerPort: t.alarmPort.toString(), UserName: "KVAdministrator", Password: "KF_REFERENCE_REDACTED", TimeOut: t.timeout || 1e4 }, u = JSON.stringify(s);
        ksInterface.runCall(u, (r, n) => {
            try {
                if (r !== 0)
                    return e(`\u8FD4\u56DEcode:${r},\u8FD4\u56DE\u4FE1\u606F:${n} `, null);
                let l = JSON.parse(n);
                if (l.ConnectHandle == 0 || l.errorCode)
                    return e(`\u8FD4\u56DEcode:${r},\u8FD4\u56DE\u4FE1\u606F:${n} `, null);
                let i = l.ConnectHandle;
                e(null, i);
            }
            catch (l) {
                e(l.message, null);
            }
        });
    }
    static checkRealConnection(t, e) {
        let s = { RequestType: commonEnums.enum_ksOperate.KFKS_CHECK_CONNECTION, ConnectHandle: t }, u = JSON.stringify(s);
        ksInterface.runCall(u, (r, n) => {
            try {
                if (JSON.parse(n).ConnectionStatus)
                    return e(t);
            }
            catch (i) {
                logger.log("fatal", i.message);
            }
            let l = JSON.stringify({ RequestType: commonEnums.enum_ksOperate.KFKS_SERVER_DISCONNECT, ConnectHandle: t });
            ksInterface.runCall(l, (i, o) => { logger.log("info", `ks\u5B9E\u65F6\u5E93\u53E5\u67C4${t}\u65AD\u5F00`); }), e(null);
        });
    }
    static checkHisConnection(t, e) {
        let s = { RequestType: commonEnums.enum_ksOperate.KFKS_HDB_CHECK_CONNNECTION, ConnectHandle: t }, u = JSON.stringify(s);
        ksInterface.runCall(u, (r, n) => {
            try {
                if (JSON.parse(n).ConnectionStatus)
                    return e(t);
            }
            catch (i) {
                logger.log("fatal", i.message);
            }
            let l = JSON.stringify({ RequestType: commonEnums.enum_ksOperate.KFKS_HDB_SERVER_DISCONNECT, ConnectHandle: t });
            ksInterface.runCall(l, (i, o) => { logger.log("info", `ks\u5386\u53F2\u5E93\u53E5\u67C4${t}\u65AD\u5F00`); }), e(null);
        });
    }
    static checkAlarmConnection(t, e) {
        let s = { RequestType: commonEnums.enum_ksOperate.KFKS_ALARM_CHECK_CONNNECTION, ConnectHandle: t }, u = JSON.stringify(s);
        ksInterface.runCall(u, (r, n) => {
            try {
                if (JSON.parse(n).ConnectionStatus)
                    return e(t);
            }
            catch (i) {
                logger.log("fatal", i.message);
            }
            let l = JSON.stringify({ RequestType: commonEnums.enum_ksOperate.KFKS_ALARM_SERVER_DISCONNECT, ConnectHandle: t });
            ksInterface.runCall(l, (i, o) => { logger.log("info", `ks\u62A5\u8B66\u5E93\u53E5\u67C4${t}\u65AD\u5F00`); }), e(null);
        });
    }
    static disConnectHistory(t) { let e = JSON.stringify({ RequestType: commonEnums.enum_ksOperate.KFKS_HDB_SERVER_DISCONNECT, ConnectHandle: t }); ksInterface.runCall(e, (s, u) => { logger.log("info", `ks\u5386\u53F2\u5E93\u53E5\u67C4${t}\u65AD\u5F00`); }); }
    static disConnectAlarm(t) { let e = JSON.stringify({ RequestType: commonEnums.enum_ksOperate.KFKS_ALARM_SERVER_DISCONNECT, ConnectHandle: t }); ksInterface.runCall(e, (s, u) => { logger.log("info", `ks\u62A5\u8B66\u5E93\u53E5\u67C4${t}\u65AD\u5F00`); }); }
    static getRealData(t, e, s) { let u = { RequestType: commonEnums.enum_ksOperate.KFKS_QUERY_TAGS_VALUES, ConnectHandle: t, TagNum: e.length, TagNames: e }, r = JSON.stringify(u); ksInterface.runCall(r, (n, l) => { n ? s(n, null) : s(null, l); }); }
    static getTagFieldData(t, e, s) { let u = { RequestType: commonEnums.enum_ksOperate.KFKS_GET_TAGS_FIELDVALUE, ConnectHandle: t, FieldObjs: e }, r = JSON.stringify(u); ksInterface.runCall(r, (n, l) => { n ? s(n, null) : s(null, l); }); }
    static writeBackFieldData(t, e, s) { let u = { RequestType: commonEnums.enum_ksOperate.KFKS_SET_TAGS_FIELDVALUE, ConnectHandle: t, FieldObjs: e }, r = JSON.stringify(u); ksInterface.runCall(r, (n, l) => { n ? s(n, null) : s(null, l); }); }
    static modifyTags(t, e, s) { let u = { RequestType: commonEnums.enum_ksOperate.KFKS_MODIFY_TAGS, ConnectHandle: t, TagNum: e.length, TagValues: e }, r = JSON.stringify(u); ksInterface.runCall(r, (n, l) => { n ? s(n, null) : s(null, l); }); }
    static queryHistoryData(t, e, s) { let u = { RequestType: commonEnums.enum_ksOperate.KFKS_HDB_GET_ORIGINAL_HISTROY_DATA, ConnectHandle: t, StartTime: e.startTime, EndTime: e.endTime, TagNameArray: e.tags, QueryMode: e.mode, IntervalTime: e.interval }, r = JSON.stringify(u); ksInterface.runCall(r, (n, l) => { n ? s(n, null) : s(null, l); }); }
    static currentAlarmData(t, e) { let s = { RequestType: commonEnums.enum_ksOperate.KFKS_ALARM_Now_TAGS_VALUES, ConnectHandle: t }, u = JSON.stringify(s); ksInterface.runCall(u, (r, n) => { r ? e(r, null) : e(null, n); }); }
    static currentAlarmDataByTagArray(t, e, s) {
        let u = { RequestType: commonEnums.enum_ksOperate.KFKS_ALARM_Now_TAGS_VALUES, ConnectHandle: t }, r = JSON.stringify(u);
        ksInterface.runCall(r, (n, l) => {
            if (n)
                s(n, null);
            else {
                let i = JSON.parse(l);
                i.TagNames = e, i.Body.recordnum[0] = e.length, i.Body.records = i.Body.records.filter(o => e.includes(o.N)), s(null, i);
            }
        });
    }
    static getHistoryAlarmData(t, e, s) { let u = { RequestType: commonEnums.enum_ksOperate.KFKS_ALARM_GETHIST_DATA, ConnectHandle: t, StartTime: e.startTime, EndTime: e.endTime, AlarmType: e.alarmType, EventType: e.eventType }, r = JSON.stringify(u); ksInterface.runCall(r, (n, l) => { n ? s(n, null) : s(null, l); }); }
    static confirmTag(t, e, s) { let u = { RequestType: commonEnums.enum_ksOperate.KFKS_ALARM_ACKTAG_ALARM, ConnectHandle: t, AckTagInfo: e.AckTagInfo }, r = JSON.stringify(u); ksInterface.runCall(r, (n, l) => { n ? s(n, null) : s(null, l); }); }
    static confirmGroup(t, e, s) { let u = { RequestType: commonEnums.enum_ksOperate.KFKS_ALARM_ACKGROUP_ALARM, ConnectHandle: t, GroupName: e }, r = JSON.stringify(u); ksInterface.runCall(r, (n, l) => { n ? s(n, null) : s(null, l); }); }
    static alarmSqlQuery(t, e, s) { let u = { RequestType: commonEnums.enum_ksOperate.KFKS_ALARM_SQLQUERY_DATA, ConnectHandle: t, SqlString: e }, r = JSON.stringify(u); ksInterface.runCall(r, (n, l) => { n ? s(n, null) : s(null, l); }); }
    static alarmConditionQuery(t, e, s) { let u = { RequestType: commonEnums.enum_ksOperate.KFKS_ALARM_EVENTCONDITIONQUERY_DATA, ConnectHandle: t, StartTime: e.startTime, EndTime: e.endTime, StationName: e.station, GroupNames: e.groups, EventType: e.eventType }, r = JSON.stringify(u); ksInterface.runCall(r, (n, l) => { n ? s(n, null) : s(null, l); }); }
    static deleteAlarm(t, e, s) { let u = { RequestType: commonEnums.enum_ksOperate.KFKS_ALARM_RESETTAG_ALARM, ConnectHandle: t, ResetTagInfo: e.tagArray }, r = JSON.stringify(u); ksInterface.runCall(r, (n, l) => { n ? s(n, null) : s(null, l); }); }
    static subscribeReal(t, e, s) { let u = { RequestType: commonEnums.enum_ksOperate.KFKS_SUBSCRIBE_TAGS_VALUE, ConnectHandle: t, TagNum: e.length, TagNames: e, SubFlag: !0 }, r = JSON.stringify(u); ksInterface.runCall(r, (n, l) => { n === 0 ? s(null, l) : s(n, null); }); }
    static unsubscribeReal(t, e, s) { let u = { RequestType: commonEnums.enum_ksOperate.KFKS_SUBSCRIBE_TAGS_VALUE, ConnectHandle: t, TagNum: e.length, TagNames: e, SubFlag: !1 }, r = JSON.stringify(u); ksInterface.runCall(r, (n, l) => { n !== "0" ? s(n, null) : s(null, l); }); }
    static subscribeAlarm(t, e) { let s = { RequestType: commonEnums.enum_ksOperate.KFKS_ALARM_SUBSCRIBE_ALARM, ConnectHandle: t }, u = JSON.stringify(s); ksInterface.runCall(u, (r, n) => { r === 0 ? e(null, n) : e(r, null); }); }
    static unsubscribeAlarm(t, e) { let s = { RequestType: commonEnums.enum_ksOperate.KFKS_ALARM_UNSUBSCRIBE_ALARM, ConnectHandle: t }, u = JSON.stringify(s); ksInterface.runCall(u, (r, n) => { r !== "0" ? e(r, null) : e(null, n); }); }
    static registerRealWatcher(t) { ksInterface.saveSubscirbeCallback("", function (e) { t(null, e); }); }
    static registerAlarmWatcher(t) { ksInterface.saveAlarmSubscirbeCallback("", function (e) { t(null, e); }); }
}
module.exports = KSDao;
// end
