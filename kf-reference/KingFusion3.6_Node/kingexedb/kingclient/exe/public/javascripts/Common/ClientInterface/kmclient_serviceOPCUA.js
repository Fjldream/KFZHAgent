KMv1.ServiceOPCUA=function(r,e){this.m_DataSourceName=e,this.m_KmServer=r,Object.call(this)},KMv1.ServiceOPCUA.prototype=new Object,KMv1.ServiceOPCUA.prototype.KmCreateJsonString_TagID=function(r){var e="";e=e+`[
`;var t=r.length;for(let n=0;n<t;n++)e=e+'"'+r[n]+'"',n!=t-1&&(e=e+","),e=e+`
`;return e=e+"]",e},KMv1.ServiceOPCUA.prototype.KmCreateJsonString_Values=function(r){var e="";e=e+`[
`;var t=r.length;for(let n=0;n<t;n++)e=e+'"'+r[n]+'"',n!=t-1&&(e=e+","),e=e+`
`;return e=e+"]",e},KMv1.ServiceOPCUA.prototype.KmCreateJsonString_FieldName=function(r){var e="";e=e+`[
`;var t=r.length;for(let n=0;n<t;n++)e=e+'"'+r[n]+'"',n!=t-1&&(e=e+","),e=e+`
`;return e=e+"]",e},KMv1.ServiceOPCUA.prototype.KmCreateJsonString_SetValue_TagID=function(r){var e="";return e=e+"[",e=e+'"'+r+'"',e=e+"]",e},KMv1.ServiceOPCUA.prototype.KmCreateJsonString_SetValue_Tagvalue=function(r){var e="";return e=e+"[",e=e+'"'+r+'"',e=e+"]",e},KMv1.ServiceOPCUA.prototype.opcuaEumeTreeData=function(r){this.m_KmServer.m_Handle===""&&(this.m_KmServer.m_Handle="opcuaDataSource");var e="";e=e+`{
`,e=e+'"handle":"'+this.m_KmServer.m_Handle+`",
`,e=e+'"datasourcename":"'+this.m_DataSourceName+`",
`,e=e+`"CommandType":"opcuaEumeTreeData"
`,e=e+"}",$.ajax({async:!0,type:"post",dataType:"json",url:this.m_KmServer.m_KmWebDataServer_URL+"/opcuadowork",data:e,error:function(t){r(t)},success:function(t){r(t)}})},KMv1.ServiceOPCUA.prototype.opcuaGetRealData=function(r,e){var t="";t=t+`{
`,t=t+'"handle":"'+this.m_KmServer.m_Handle+`",
`,t=t+'"datasourcename":"'+this.m_DataSourceName+`",
`,t=t+`"CommandType":"opcuaGetRealData",
`,t=t+'"tagID":'+r+`
`,t=t+"}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/opcuadowork",data:t,error:function(n){e(n)},success:function(n){e(n)}})},KMv1.ServiceOPCUA.prototype.opcuaGetFieldData=function(r,e,t){var n="";n=n+`{
`,n=n+'"handle":"'+this.m_KmServer.m_Handle+`",
`,n=n+'"datasourcename":"'+this.m_DataSourceName+`",
`,n=n+`"CommandType":"opcuaGetFieldData",
`,n=n+'"tagID":'+r+`,
`,n=n+'"fieldName":'+e+`
`,n=n+"}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/opcuadowork",data:n,error:function(a){t(a)},success:function(a){t(a)}})},KMv1.ServiceOPCUA.prototype.opcuaSetRealData=function(r,e,t){var n="";n=n+`{
`,n=n+'"handle":"'+this.m_KmServer.m_Handle+`",
`,n=n+'"datasourcename":"'+this.m_DataSourceName+`",
`,n=n+`"CommandType":"opcuaSetRealData",
`,n=n+'"tagID":'+r+`,
`,n=n+'"value":'+e+`
`,n=n+"}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/opcuadowork",data:n,error:function(a){t(a)},success:function(a){t(a)}})},KMv1.ServiceOPCUA.prototype.opcuaCreateSubAndMonItem=function(r,e,t,n){var a="";a=a+`{
`,a=a+'"handle":"'+this.m_KmServer.m_Handle+`",
`,a=a+'"datasourcename":"'+this.m_DataSourceName+`",
`,a=a+`"CommandType":"opcuaCreateSubAndMonItem",
`,a=a+'"tagID":'+r+`,
`,a=a+'"subscriptionParaments":'+e+`,
`,a=a+'"monitoredItemParaments":'+t+`
`,a=a+"}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/opcuadowork",data:a,error:function(o){n(o)},success:function(o){n(o)}})},KMv1.ServiceOPCUA.prototype.opcuaStopSubscription=function(r){var e="";e=e+`{
`,e=e+'"handle":"'+this.m_KmServer.m_Handle+`",
`,e=e+'"datasourcename":"'+this.m_DataSourceName+`"
`,e=e+`"CommandType":"opcuaStopSubscription"
`,e=e+"}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/opcuadowork",data:e,error:function(t){DisConnect_result(t)},success:function(t){DisConnect_result(t)}})},KMv1.ServiceOPCUA.prototype.opcuaDisConnect=function(r){var e="";e=e+`{
`,e=e+'"handle":"'+this.m_KmServer.m_Handle+`",
`,e=e+'"datasourcename":"'+this.m_DataSourceName+`"
`,e=e+`"CommandType":"opcuaDisConnect"
`,e=e+"}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/opcuadowork",data:e,error:function(t){r(t)},success:function(t){r(t)}})};
