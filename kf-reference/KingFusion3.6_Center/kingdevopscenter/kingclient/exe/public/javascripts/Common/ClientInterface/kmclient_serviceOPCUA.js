KMv1.ServiceOPCUA=function(a,e){this.m_DataSourceName=e,this.m_KmServer=a,Object.call(this)},KMv1.ServiceOPCUA.prototype=new Object,KMv1.ServiceOPCUA.prototype.KmCreateJsonString_TagID=function(a){var e="";e=e+`[
`;for(var n=a.length,r=0;r<n;r++)e=e+'"'+a[r]+'"',r!=n-1&&(e=e+","),e=e+`
`;return e=e+"]",e},KMv1.ServiceOPCUA.prototype.KmCreateJsonString_Values=function(a){var e="";e=e+`[
`;for(var n=a.length,r=0;r<n;r++)e=e+'"'+a[r]+'"',r!=n-1&&(e=e+","),e=e+`
`;return e=e+"]",e},KMv1.ServiceOPCUA.prototype.KmCreateJsonString_FieldName=function(a){var e="";e=e+`[
`;for(var n=a.length,r=0;r<n;r++)e=e+'"'+a[r]+'"',r!=n-1&&(e=e+","),e=e+`
`;return e=e+"]",e},KMv1.ServiceOPCUA.prototype.KmCreateJsonString_SetValue_TagID=function(a){var e="";return e=e+"[",e=e+'"'+a+'"',e=e+"]",e},KMv1.ServiceOPCUA.prototype.KmCreateJsonString_SetValue_Tagvalue=function(a){var e="";return e=e+"[",e=e+'"'+a+'"',e=e+"]",e},KMv1.ServiceOPCUA.prototype.opcuaEumeTreeData=function(a){this.m_KmServer.m_Handle===""&&(this.m_KmServer.m_Handle="opcuaDataSource");var e="";e=e+`{
`,e=e+'"handle":"'+this.m_KmServer.m_Handle+`",
`,e=e+'"datasourcename":"'+this.m_DataSourceName+`",
`,e=e+`"CommandType":"opcuaEumeTreeData"
`,e=e+"}",$.ajax({async:!0,type:"post",dataType:"json",url:this.m_KmServer.m_KmWebDataServer_URL+"/opcuadowork",data:e,error:function(n){a(n)},success:function(n){a(n)}})},KMv1.ServiceOPCUA.prototype.opcuaGetRealData=function(a,e){var n="";n=n+`{
`,n=n+'"handle":"'+this.m_KmServer.m_Handle+`",
`,n=n+'"datasourcename":"'+this.m_DataSourceName+`",
`,n=n+`"CommandType":"opcuaGetRealData",
`,n=n+'"tagID":'+a+`
`,n=n+"}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/opcuadowork",data:n,error:function(r){e(r)},success:function(r){e(r)}})},KMv1.ServiceOPCUA.prototype.opcuaGetFieldData=function(a,e,n){var r="";r=r+`{
`,r=r+'"handle":"'+this.m_KmServer.m_Handle+`",
`,r=r+'"datasourcename":"'+this.m_DataSourceName+`",
`,r=r+`"CommandType":"opcuaGetFieldData",
`,r=r+'"tagID":'+a+`,
`,r=r+'"fieldName":'+e+`
`,r=r+"}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/opcuadowork",data:r,error:function(t){n(t)},success:function(t){n(t)}})},KMv1.ServiceOPCUA.prototype.opcuaSetRealData=function(a,e,n){var r="";r=r+`{
`,r=r+'"handle":"'+this.m_KmServer.m_Handle+`",
`,r=r+'"datasourcename":"'+this.m_DataSourceName+`",
`,r=r+`"CommandType":"opcuaSetRealData",
`,r=r+'"tagID":'+a+`,
`,r=r+'"value":'+e+`
`,r=r+"}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/opcuadowork",data:r,error:function(t){n(t)},success:function(t){n(t)}})},KMv1.ServiceOPCUA.prototype.opcuaCreateSubAndMonItem=function(a,e,n,r){var t="";t=t+`{
`,t=t+'"handle":"'+this.m_KmServer.m_Handle+`",
`,t=t+'"datasourcename":"'+this.m_DataSourceName+`",
`,t=t+`"CommandType":"opcuaCreateSubAndMonItem",
`,t=t+'"tagID":'+a+`,
`,t=t+'"subscriptionParaments":'+e+`,
`,t=t+'"monitoredItemParaments":'+n+`
`,t=t+"}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/opcuadowork",data:t,error:function(o){r(o)},success:function(o){r(o)}})},KMv1.ServiceOPCUA.prototype.opcuaStopSubscription=function(a){var e="";e=e+`{
`,e=e+'"handle":"'+this.m_KmServer.m_Handle+`",
`,e=e+'"datasourcename":"'+this.m_DataSourceName+`"
`,e=e+`"CommandType":"opcuaStopSubscription"
`,e=e+"}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/opcuadowork",data:e,error:function(n){DisConnect_result(n)},success:function(n){DisConnect_result(n)}})},KMv1.ServiceOPCUA.prototype.opcuaDisConnect=function(a){var e="";e=e+`{
`,e=e+'"handle":"'+this.m_KmServer.m_Handle+`",
`,e=e+'"datasourcename":"'+this.m_DataSourceName+`"
`,e=e+`"CommandType":"opcuaDisConnect"
`,e=e+"}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/opcuadowork",data:e,error:function(n){a(n)},success:function(n){a(n)}})};
