const controllers = require(__DIR + "/lib/controllers")
module.exports = {
  get: {
    "/v2/realtimedata": controllers.database.realtimedata,
    "/v2/getalarmgroup": controllers.database.getalarmgroup,
    "/v2/getalarmconfig": controllers.database.getalarmconfig,
    "/v2/alarmcache": controllers.database.alarmcache,
    "/v2/realtimefielddata": controllers.database.realtimefielddata,
    "/v1/khgrouplist": controllers.database.khgrouplist,
    "/v1/khtaglist": controllers.database.khtaglist,
    "/v1/customAlarm/group": controllers.database.getCustomAlarmGroup,
    "/v1/customAlarm/list": controllers.database.getCustomAlarmList,
    "/v1/customAlarm/script": controllers.database.getCustomAlarmScript
  },
  post: {
    "/v1/sqldata": controllers.database.sqldata,
    "/v1/execute": controllers.database.execute,
    "/v1/nosqlquery": controllers.database.sqldata,
    "/v1/nosqlexecute": controllers.database.execute,
    "/v1/historydata/rawdata": controllers.database.rawdata,
    "/v1/historydata/recordNumbers": controllers.database.recordNumbers,
    "/v1/historydata": controllers.database.historyData,
    "/v1/historydata/currentdata": controllers.database.currentdata,
    "/v1/historydata/perioddata": controllers.database.perioddata,
    "/v1/historydata/specifictimedata": controllers.database.specifictimedata,
    "/v1/mqttPublishToDevice": controllers.database.mqttPublishToDevice,
    "/v1/mqtt/publish": controllers.database.publish,
    "/v1/ksalarmdata": controllers.database.ksalarmdata,
    "/v2/realtimedata": controllers.database.realtimedata,
    "/v2/writebackdata": controllers.database.writebackdata,
    "/v2/historydata": controllers.database.queryHistoryData,
    "/v2/confirmtagalarm": controllers.database.confirmTagAlarm,
    "/v2/getalarmconfigoftag": controllers.database.getalarmconfigoftag,
    "/v2/setalarmconfigoftag": controllers.database.setalarmconfigoftag,
    "/v2/historyalarmdata": controllers.database.historyalarmdata,
    "/v2/writebackfileddata": controllers.database.writebackfielddata,
    "/v2/uadsKSWindowsRealCallBack": controllers.database.uadsKSWindowsRealCallBack
  },
  put: {
    "/v1/customAlarm/update": controllers.database.customAlarmUpdateAlarm,
    "/v1/customAlarm/script": controllers.database.customAlarmUpdateScript
  },
  delete: {
    "/v2/deletealarm": controllers.database.deletealarm
  },
  patch: {}
}