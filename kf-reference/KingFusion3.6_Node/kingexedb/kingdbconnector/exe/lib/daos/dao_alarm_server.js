class ALARMSEVER {
    constructor() {}
    static query_init_alarm() {
        return {
            user_handle: "string",
            operation: "query_init_alarm",
            param: {}
        }
    }
    static confirm_alarm(a) {
        let e = a.confirmTagInfo;
        for (let r = 0; r < e.length; r++) {
            let t = e[r];
            a.confirmTagInfo[r].alarm_type = ALARMSEVER.AlarmTypeConfirm(Number(t.alarm_type))
        }
        return {
            user_handle: "string",
            operation: "confirm_alarm",
            param: a
        }
    }
    static confirm_alarm_by_group(a) {
        return {
            user_handle: "string",
            operation: "confirm_alarm_by_group",
            param: a
        }
    }
    static query_alarm(a) {
        return {
            user_handle: "string",
            operation: "query_alarm",
            param: a
        }
    }
    static query_history_cache_alarm() {
        return {
            user_handle: "string",
            operation: "query_history_cache_alarm",
            param: {}
        }
    }
    static deleteAlarm(a) {
        return {
            user_handle: "string",
            operation: "delete_alarm",
            param: a
        }
    }
    static get_tag_group_config() {
        return {
            user_handle: "string",
            operation: "get_tag_group_config",
            param: {}
        }
    }
    static get_alarm_config_of_tag(a) {
        return {
            user_handle: "string",
            operation: "get_alarm_config_of_tag",
            param: a
        }
    }
    static get_alarm_config_of_condition(a) {
        return {
            user_handle: "string",
            operation: "get_alarm_config_of_condition",
            param: a
        }
    }
    static get_alarm_config() {
        return {
            user_handle: "string",
            operation: "get_alarm_config",
            param: {}
        }
    }
    static setAlarmConfigOfTag(a) {
        return {
            user_handle: "string",
            operation: a.type == "ExtendFieldString" ? "set_tagBase_info" : "set_alarm_config_of_tag",
            param: a,
            machine_ip: a.machine_ip,
            token: a.token
        }
    }
    static setAlarmConfigOfCondition(a) {
        return {
            user_handle: "string",
            operation: "set_alarm_config_of_condition",
            param: a
        }
    }
    static setPushSettingConfig(a) {
        return {
            user_handle: "string",
            operation: "operate_pushAlarm_info",
            param: setAlarmConfig
        }
    }
    static get_tagBase_info(a) {
        return {
            user_handle: "string",
            operation: "get_tagBase_info",
            param: setAlarmConfig
        }
    }
    static registerAlarmWatcher(a) {}
    static AlarmTypeConfirm(a) {
        var e = null;
        switch (a) {
            case 0:
            case 1:
            case 2:
            case 3:
                e = "Restricted";
                break;
            case 4:
            case 5:
                e = "Deviation";
                break;
            case 6:
                e = "Rock";
                break;
            case 7:
            case 8:
            case 9:
                e = "Discrete";
                break;
            case 10:
                e = "Customize";
                break;
            default:
                e = "Customize";
                break
        }
        return e
    }
    static AlarmTypeRelation(a) {
        var e = null;
        switch (a) {
            case "Restricted_HighHigh":
                e = 3;
                break;
            case "Restricted_High":
                e = 2;
                break;
            case "Restricted_Low":
                e = 1;
                break;
            case "Restricted_LowLow":
                e = 0;
                break;
            case "Deviation_High_Big":
            case "Deviation_Low_Big":
                e = 4;
                break;
            case "Deviation_High_Small":
            case "Deviation_Low_Small":
                e = 5;
                break;
            case "Rock":
                e = 6;
                break;
            case "Discrete_False":
                e = 8;
                break;
            case "Discrete_True":
                e = 7;
                break;
            case "Discrete_TrueToFalse":
                e = 9;
                break;
            case "Discrete_FalseToTrue":
                e = 9;
                break;
            case "Customize":
                e = 12;
                break;
            case "Custom_Script":
                e = 12;
                break;
            default:
                break
        }
        return e
    }
    static AlarmEventTypeRelation(a) {
        var e = null;
        switch (a) {
            case "AlarmEvent":
                e = 0;
                break;
            case "RecoverEvent":
                e = 2;
                break;
            case "AckEvent":
                e = 1;
                break;
            case "DeleteEvent":
                e = 3;
                break;
            default:
                break
        }
        return e
    }
    static AlarmEventTypeRelationQuery(a) {
        var e = null;
        switch (a) {
            case 0:
                e = "AlarmEvent";
                break;
            case 3:
                e = "RecoverEvent";
                break;
            case 1:
                e = "AckEvent";
                break;
            case 2:
                e = "DeleteEvent";
                break;
            default:
                break
        }
        return e
    }
}
ALARMSEVER.AlarmRelation = {
    ConditionName: 0,
    TagName: 1,
    VarMemo: 2,
    AlarmType: 3,
    SubAlarmType: 4,
    AlarmLine: 5,
    AlarmText: 6,
    AlarmValue: 7,
    RecoverValue: 8,
    ValueQuality: 9,
    Priority: 10,
    DefaultPriority: 11,
    ConditionID: 12,
    TagID: 13,
    GroupID: 14,
    AlarmEventType: 15,
    AlarmEventTime: 19,
    EventType: 17,
    UserEventType: 18,
    UserEventTime: 16,
    Operator: 20,
    OperatorMemo: 21,
    OperatorMachineIP: 22,
    OperatorDomain: 23,
    NeedToDelete: 24,
    LastUpgradeTimeInMS: 25,
    AlarmServerID: 26,
    ExtendFieldString1: 27,
    ExtendFieldString2: 28,
    ExtendFieldString3: 29,
    ExtendFieldString4: 30,
    ExtendFieldString5: 31,
    ExtendFieldString6: 32,
    ExtendFieldString7: 33,
    ExtendFieldString8: 34,
    GroupName: 35,
    DatasourceName: 36
}, module.exports = ALARMSEVER;