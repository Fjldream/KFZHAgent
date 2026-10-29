let databaseMng = require("./datasource/datasource_mng")
class Deals {
  constructor() { }
  SQLQuery (a, e) {
    databaseMng.SQLQuery(a, e)
  }
  SQLExecute (a, e) {
    databaseMng.SQLExecute(a, e)
  }
  getTagRealData (a, e) {
    databaseMng.getTagRealData(a, e)
  }
  queryHistoryData (a, e) {
    databaseMng.queryHistoryData(a, e)
  }
  getTagFieldData (a, e) {
    databaseMng.getTagFieldData(a, e)
  }
  writeBackFieldData (a, e) {
    databaseMng.writeBackFieldData(a, e)
  }
  modifyTags (a, e) {
    databaseMng.modifyTags(a, e)
  }
  currentAlarmData (a, e) {
    databaseMng.currentAlarmData(a, e)
  }
  confirmTagAlarm (a, e) {
    databaseMng.confirmTagAlarm(a, e)
  }
  setAlarmConfigOfTag (a, e) {
    databaseMng.setAlarmConfigOfTag(a, e)
  }
  setAlarmConfigOfCondition (a, e) {
    databaseMng.setAlarmConfigOfCondition(a, e)
  }
  getAlarmConfigOfTag (a, e) {
    databaseMng.getAlarmConfigOfTag(a, e)
  }
  getAlarmConfigOfCondition (a, e) {
    databaseMng.getAlarmConfigOfCondition(a, e)
  }
  getAlarmGroup (a, e) {
    databaseMng.getAlarmGroup(a, e)
  }
  getAlarmConfig (a, e) {
    databaseMng.getAlarmConfig(a, e)
  }
  getAlarmCache (a, e) {
    databaseMng.getAlarmCache(a, e)
  }
  getHistoryAlarmData (a, e) {
    databaseMng.getHistoryAlarmData(a, e)
  }
  deleteAlarm (a, e) {
    databaseMng.deleteAlarm(a, e)
  }
  KHQueryOriginDataByTimeRange (a, e) {
    databaseMng.KHQueryOriginDataByTimeRange(a, e)
  }
  KHQueryOriginDataByRecordNumber (a, e) {
    databaseMng.KHQueryOriginDataByRecordNumber(a, e)
  }
  KHGetCurrentValue (a, e) {
    databaseMng.KHGetCurrentValue(a, e)
  }
  KHQuerySampleDatas2 (a, e) {
    databaseMng.KHQuerySampleDatas2(a, e)
  }
  KHQuerySampleDatas1 (a, e) {
    databaseMng.KHQuerySampleDatas1(a, e)
  }
  KHaddTags (a, e) {
    databaseMng.KHaddTags(a, e)
  }
  uadsKSWindowsRealCallBack (a) {
    databaseMng.uadsKSWindowsRealCallBack(a)
  }
  getCustomAlarmGroup (a, e) {
    databaseMng.getCustomAlarmGroup(a, e)
  }
  getCustomAlarmList (a, e) {
    databaseMng.getCustomAlarmList(a, e)
  }
  getCustomAlarmScript (a, e) {
    databaseMng.getCustomAlarmScript(a, e)
  }
  customAlarmUpdateAlarm (a, e) {
    databaseMng.customAlarmUpdateAlarm(a, e)
  }
  customAlarmUpdateScript (a, e) {
    databaseMng.customAlarmUpdateScript(a, e)
  }
}
module.exports = new Deals