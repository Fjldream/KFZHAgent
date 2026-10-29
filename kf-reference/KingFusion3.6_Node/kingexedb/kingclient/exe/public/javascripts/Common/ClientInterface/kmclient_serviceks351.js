KMv1.ServiceKS351=function(a,t){this.m_DataSourceName=t,this.m_KmServer=a,Object.call(this)},KMv1.ServiceKS351.prototype=new Object,KMv1.ServiceKS351.prototype.KmCreateJsonString_Tags=function(a){var t="";t=t+`[
`;var r=a.length;for(let e=0;e<r;e++)t=t+'"'+a[e]+'"',e!=r-1&&(t=t+","),t=t+`
`;return t=t+"]",t},KMv1.ServiceKS351.prototype.KmCreateJsonString_Condition_QueryHistoryData=function(a,t,r){var e="";return e=e+`{
`,e=e+'"starttime":"'+a+`",
`,e=e+'"endtime":"'+t+`",
`,e=e+'"querytype":"'+r+`"
`,e=e+"}",e},KMv1.ServiceKS351.prototype.KmCreateJsonString_Condition_SetValue=function(a,t){var r="";return r=r+"[",r=r+'"'+a+'",',r=r+'"'+t+'"',r=r+"]",r},KMv1.ServiceKS351.prototype.KmCreateJsonString_RealAlarm=function(a,t,r){var e="";return e=e+`[
`,e=e+'"stationname":"'+a+`",
`,e=e+'"alarmgroup":"'+t+`",
`,e=e+'"priority":"'+r+`"
`,e=e+"]",e},KMv1.ServiceKS351.prototype.KmCreateJsonString_Condition_RealAlarm=function(a,t,r,e,n){var o="";return o=o+`[
`,o=o+'"stationname":"'+a+`",
`,o=o+'"alarmgroup":"'+t+`",
`,o=o+'"alarmtype":"'+r+`",
`,o=o+'"eventtype":"'+e+`",
`,o=o+'"priority":"'+n+`"
`,o=o+"]",o},KMv1.ServiceKS351.prototype.KmCreateJsonString_Condition_HistoryAlarm=function(a,t,r,e,n,o,m){var i="";return i=i+`[
`,i=i+'"stationname":"'+a+`",
`,i=i+'"alarmgroup":"'+t+`",
`,i=i+'"starttime":"'+r+`",
`,i=i+'"endtime":"'+e+`",
`,i=i+'"alarmtype":"'+n+`",
`,i=i+'"eventtype":"'+o+`",
`,i=i+'"priority":"'+m+`"
`,i=i+"]",i},KMv1.ServiceKS351.prototype.KmGetHistoryDatas=function(a,t,r,e){var n="";n=n+`{
`,n=n+'"handle":"'+this.m_KmServer.m_Handle+`",
`,n=n+'"datasourcename":"'+this.m_DataSourceName+`",
`,n=n+`"dowork":[
`,n=n+'"querytype":"'+a+`",
`,n=n+'"tags":'+t+`,
`,n=n+'"condition":'+r+`
`,n=n+"]}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/dowork",data:n,error:function(o){e(o)},success:function(o){e(o)}})},KMv1.ServiceKS351.prototype.KmGetRealDatas=function(a,t,r){var e="";e=e+`{
`,e=e+'"handle":"'+this.m_KmServer.m_Handle+`",
`,e=e+'"datasourcename":"'+this.m_DataSourceName+`",
`,e=e+`"dowork":[
`,e=e+'"querytype":"'+a+`",
`,e=e+'"tags":'+t+`,
`,e=e+`"condition":[]
`,e=e+"]}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/dowork",data:e,error:function(n){r(n)},success:function(n){r(n)}})},KMv1.ServiceKS351.prototype.KmSubRealDatas=function(a,t,r){var e="";e=e+`{
`,e=e+'"handle":"'+this.m_KmServer.m_Handle+`",
`,e=e+'"datasourcename":"'+this.m_DataSourceName+`",
`,e=e+`"dowork":[
`,e=e+'"querytype":"'+a+`",
`,e=e+'"tags":'+t+`,
`,e=e+`"condition":[]
`,e=e+"]}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/dowork",data:e,error:function(n){r(n)},success:function(n){r(n)}})},KMv1.ServiceKS351.prototype.KmSetTagValue=function(a,t,r){var e="";e=e+`{
`,e=e+'"handle":"'+this.m_KmServer.m_Handle+`",
`,e=e+'"datasourcename":"'+this.m_DataSourceName+`",
`,e=e+`"dowork":[
`,e=e+'"querytype":"'+a+`",
`,e=e+`"datapro":["tagname","datavalue"],
`,e=e+'"values":'+t+`
`,e=e+"]}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/dowork",data:e,error:function(n){r(n)},success:function(n){r(n)}})},KMv1.ServiceKS351.prototype.KmGetFieldValue=function(a,t,r,e){var n="";n=n+`{
`,n=n+'"handle":"'+this.m_KmServer.m_Handle+`",
`,n=n+'"datasourcename":"'+this.m_DataSourceName+`",
`,n=n+`"dowork":[
`,n=n+'"querytype":"'+a+`",
`,n=n+'"tags":'+t+`,
`,n=n+'"fields":'+r+`
`,n=n+"]}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/dowork",data:n,error:function(o){e(o)},success:function(o){e(o)}})},KMv1.ServiceKS351.prototype.KmCreateJsonString_Condition_SetFieldValues=function(a,t,r){var e={tagNames:a,fieldName:t,fieldValues:r};return JSON.stringify(e)},KMv1.ServiceKS351.prototype.KmSetFieldValues=function(a,t,r){var e="";e=e+`{
`,e=e+'"handle":"'+this.m_KmServer.m_Handle+`",
`,e=e+'"datasourcename":"'+this.m_DataSourceName+`",
`,e=e+`"dowork":[
`,e=e+'"querytype":"'+a+`",
`,e=e+'"values":'+t+`
`,e=e+"]}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/dowork",data:e,error:function(n){r(n)},success:function(n){r(n)}})},KMv1.ServiceKS351.prototype.KmCreateJsonString_Alarm_Ack_Tag=function(a){var t="";return t=t+`[
`,t=t+'"tagname":"'+a+`"
`,t=t+"]",t},KMv1.ServiceKS351.prototype.KmAlarmAckTag=function(a,t,r){var e="";e=e+`{
`,e=e+'"handle":"'+this.m_KmServer.m_Handle+`",
`,e=e+'"datasourcename":"'+this.m_DataSourceName+`",
`,e=e+`"dowork":[
`,e=e+'"querytype":"'+a+`",
`,e=e+'"condition":'+t+`
`,e=e+"]}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/dowork",data:e,error:function(n){},success:function(n){r(n)}})},KMv1.ServiceKS351.prototype.KmCreateJsonString_Alarm_Group=function(a){var t="";return t=t+`[
`,t=t+'"groupName":"'+a+`"
`,t=t+"]",t},KMv1.ServiceKS351.prototype.KmAlarmAckGroup=function(a,t,r){var e="";e=e+`{
`,e=e+'"handle":"'+this.m_KmServer.m_Handle+`",
`,e=e+'"datasourcename":"'+this.m_DataSourceName+`",
`,e=e+`"dowork":[
`,e=e+'"querytype":"'+a+`",
`,e=e+'"condition":'+t+`
`,e=e+"]}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/dowork",data:e,error:function(n){r(n)},success:function(n){r(n)}})},KMv1.ServiceKS351.prototype.KmCreateJsonString_Condition_AlarmData=function(a,t,r,e,n){var o="";return o=o+`[
`,o=o+'"stationname":"'+a+`",
`,o=o+'"alarmgroup":"'+t+`",
`,o=o+'"starttime":"'+r+`",
`,o=o+'"endtime":"'+e+`",
`,o=o+'"priority":"'+n+`"
`,o=o+"]",o},KMv1.ServiceKS351.prototype.KmConditionQueryAlarmData=function(a,t,r){var e="";e=e+`{
`,e=e+'"handle":"'+this.m_KmServer.m_Handle+`",
`,e=e+'"datasourcename":"'+this.m_DataSourceName+`",
`,e=e+`"dowork":[
`,e=e+'"querytype":"'+a+`",
`,e=e+'"condition":'+t+`
`,e=e+"]}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/dowork",data:e,error:function(n){r(n)},success:function(n){r(n)}})},KMv1.ServiceKS351.prototype.KmCreateJsonString_Condition_HistoryAlarm_Json=function(a,t){var r="";return r=r+`[
`,r=r+'"stationname":"'+a+`",
`,r=r+'"alarmgroup":"'+t+`"
`,r=r+"]",r},KMv1.ServiceKS351.prototype.KmGetHistoryAlarmData=function(a,t){var r="";r=r+`{
`,r=r+'"handle":"'+this.m_KmServer.m_Handle+`",
`,r=r+'"datasourcename":"'+this.m_DataSourceName+`",
`,r=r+`"dowork":[
`,r=r+'"querytype":"'+a+`"
`,r=r+"]}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/dowork",data:r,error:function(e){t(e)},success:function(e){t(e)}})},KMv1.ServiceKS351.prototype.KmGetAllFieldValue=function(a,t,r){var e="";e=e+`{
`,e=e+'"handle":"'+this.m_KmServer.m_Handle+`",
`,e=e+'"datasourcename":"'+this.m_DataSourceName+`",
`,e=e+`"dowork":[
`,e=e+'"querytype":"'+a+`",
`,e=e+'"tags":'+t+`
`,e=e+"]}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/dowork",data:e,error:function(n){r(n)},success:function(n){r(n)}})},KMv1.ServiceKS351.prototype.KmGetAllTagName=function(a,t){this.m_KmServer.m_Handle===""&&(this.m_KmServer.m_Handle="kmgetalltagname");var r="";r=r+`{
`,r=r+'"handle":"'+this.m_KmServer.m_Handle+`",
`,r=r+'"datasourcename":"'+this.m_DataSourceName+`",
`,r=r+`"dowork":[
`,r=r+'"querytype":"'+a+`"
`,r=r+"]}",$.ajax({async:!0,type:"post",dataType:"json",url:this.m_KmServer.m_KmWebDataServer_URL+"/dowork",data:r,error:function(e){t(e)},success:function(e){t(e)}})},KMv1.ServiceKS351.prototype.KmGetAllTagNameFromDataSource=function(a,t,r){var e="";e=e+`{
`,e=e+'"handle":"'+this.m_KmServer.m_Handle+`",
`,e=e+'"datasourcename":"'+this.m_DataSourceName+`",
`,e=e+`"dowork":[
`,e=e+'"querytype":"'+a+`",
`,e=e+'"condition":[',e=e+'"enumtagtype":"'+t+`"
`,e=e+"]]}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/dowork",data:e,error:function(n){r(n)},success:function(n){r(n)}})},KMv1.ServiceKS351.prototype.KmGetAlarmGroup=function(a,t,r){var e="";e=e+`{
`,e=e+'"handle":"'+this.m_KmServer.m_Handle+`",
`,e=e+'"datasourcename":"'+this.m_DataSourceName+`",
`,e=e+`"dowork":[
`,e=e+'"querytype":"'+a+`",
`,e=e+'"stationname":"'+t+`"
`,e=e+"]}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/dowork",data:e,error:function(n){r(n)},success:function(n){r(n)}})},KMv1.ServiceKS351.prototype.KmGetRealAlarmDatas=function(a,t){var r="";r=r+`{
`,r=r+'"handle":"'+this.m_KmServer.m_Handle+`",
`,r=r+'"datasourcename":"'+this.m_DataSourceName+`",
`,r=r+`"dowork":[
`,r=r+'"querytype":"'+a+`"
`,r=r+"]}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/dowork",data:r,error:function(e){t(e)},success:function(e){t(e)}})},KMv1.ServiceKS351.prototype.KmGetHistoryAlarmDatas=function(a,t,r){var e="";e=e+`{
`,e=e+'"handle":"'+this.m_KmServer.m_Handle+`",
`,e=e+'"datasourcename":"'+this.m_DataSourceName+`",
`,e=e+`"dowork":[
`,e=e+'"querytype":"'+a+`",
`,e=e+'"condition":'+t+`
`,e=e+"]}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/dowork",data:e,error:function(n){r(n)},success:function(n){r(n)}})};
