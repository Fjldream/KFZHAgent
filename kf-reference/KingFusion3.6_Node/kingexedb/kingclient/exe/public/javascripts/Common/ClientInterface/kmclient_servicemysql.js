KMv1.ServiceMYSQL=function(t,r){this.m_DataSourceName=r,this.m_KmServer=t,Object.call(this)},KMv1.ServiceMYSQL.prototype=new Object,KMv1.ServiceMYSQL.prototype.KmCreateJsonString_Condition_SQL=function(t){var r="";return r=r+`[
`,r=r+'"querystring":"'+t+`"
`,r=r+"]",r},KMv1.ServiceMYSQL.prototype.KmGetSQLDatas=function(t,r){var e="";e=e+`{
`,e=e+'"handle":"'+this.m_KmServer.m_Handle+`",
`,e=e+'"datasourcename":"'+this.m_DataSourceName+`",
`,e=e+`"dowork":[
`,e=e+`"querytype":"select",
`,e=e+'"condition":'+t+`
`,e=e+"]}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/dowork",data:e,error:function(n){r(n)},success:function(n){r(n)}})},KMv1.ServiceMYSQL.prototype.KmExecuteSQL=function(t,r){var e="";e=e+`{
`,e=e+'"handle":"'+this.m_KmServer.m_Handle+`",
`,e=e+'"datasourcename":"'+this.m_DataSourceName+`",
`,e=e+`"dowork":[
`,e=e+`"querytype":"noselect",
`,e=e+'"condition":'+t+`
`,e=e+"]}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/dowork",data:e,error:function(n){r(n)},success:function(n){r(n)}})};
