KMv1.ServiceKH351=function(o,t){this.m_DataSourceName=t,this.m_KmServer=o,Object.call(this)},KMv1.ServiceKH351.prototype=new Object,KMv1.ServiceKH351.prototype.KmCreateJsonString_Tags=function(o){var t="";t=t+`[
`;for(var n=o.length,e=0;e<n;e++)t=t+'"'+o[e]+'"',e!=n-1&&(t=t+","),t=t+`
`;return t=t+"]",t},KMv1.ServiceKH351.prototype.KmCreateJsonString_Condition_QueryHistoryData=function(o,t,n){var e="";return e=e+`{
`,e=e+'"starttime":"'+o+`",
`,e=e+'"endtime":"'+t+`",
`,e=e+'"querytype":"'+n+`"
`,e=e+"}",e},KMv1.ServiceKH351.prototype.KmCreateJsonString_Condition_TimeInterval=function(o,t,n,e){var r="";return r=r+`{
`,r=r+'"starttime":"'+o+`",
`,r=r+'"endtime":"'+t+`",
`,r=r+'"querytype":"'+n+`",
`,r=r+'"interval":"'+e+`"
`,r=r+"}",r},KMv1.ServiceKH351.prototype.KmCreateJsonString_Condition_SQL=function(o){var t="";return t=t+`[
`,t=t+'"querystring":"'+o+`"
`,t=t+"]",t},KMv1.ServiceKH351.prototype.KmGetHistoryDatas=function(o,t,n,e){var r="";r=r+`{
`,r=r+'"handle":"'+this.m_KmServer.m_Handle+`",
`,r=r+'"datasourcename":"'+this.m_DataSourceName+`",
`,r=r+`"dowork":[
`,r=r+'"querytype":"'+o+`",
`,r=r+'"tags":'+t+`,
`,r=r+'"condition":'+n+`
`,r=r+"]}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/dowork",data:r,error:function(a){e(a)},success:function(a){e(a)}})},KMv1.ServiceKH351.prototype.KmGetRealDatas=function(o,t,n){var e="";e=e+`{
`,e=e+'"handle":"'+this.m_KmServer.m_Handle+`",
`,e=e+'"datasourcename":"'+this.m_DataSourceName+`",
`,e=e+`"dowork":[
`,e=e+'"querytype":"'+o+`",
`,e=e+'"tags":'+t+`,
`,e=e+`"condition":[]
`,e=e+"]}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/dowork",data:e,error:function(r){n(r)},success:function(r){n(r)}})},KMv1.ServiceKH351.prototype.KmGetSQLDatas=function(o,t){var n="";n=n+`{
`,n=n+'"handle":"'+this.m_KmServer.m_Handle+`",
`,n=n+'"datasourcename":"'+this.m_DataSourceName+`",
`,n=n+`"dowork":[
`,n=n+`"querytype":"select",
`,n=n+'"condition":'+o+`
`,n=n+"]}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/dowork",data:n,error:function(e){t(e)},success:function(e){t(e)}})},KMv1.ServiceKH351.prototype.KmExecuteSQL=function(o,t){var n="";n=n+`{
`,n=n+'"handle":"'+this.m_KmServer.m_Handle+`",
`,n=n+'"datasourcename":"'+this.m_DataSourceName+`",
`,n=n+`"dowork":[
`,n=n+`"querytype":"noselect",
`,n=n+'"condition":'+o+`
`,n=n+"]}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/dowork",data:n,error:function(e){t(e)},success:function(e){t(e)}})};
