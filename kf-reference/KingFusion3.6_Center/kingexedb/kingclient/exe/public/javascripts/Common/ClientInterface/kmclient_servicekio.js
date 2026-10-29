KMv1.ServiceKIO=function(a,e){this.m_DataSourceName=e,this.m_KmServer=a,Object.call(this)},KMv1.ServiceKIO.prototype=new Object,KMv1.ServiceKIO.prototype.KmCreateJsonString_Tags=function(a){var e="";e=e+`[
`;var t=a.length;for(let r=0;r<t;r++)e=e+'"'+a[r]+'"',r!=t-1&&(e=e+","),e=e+`
`;return e=e+"]",e},KMv1.ServiceKIO.prototype.KmCreateJsonString_Values=function(a){var e="";e=e+`[
`;var t=a.length;for(let r=0;r<t;r++)e=e+'"'+a[r]+'"',r!=t-1&&(e=e+","),e=e+`
`;return e=e+"]",e},KMv1.ServiceKIO.prototype.KmCreateJsonString_SetValue_Tagname=function(a){var e="";return e=e+"[",e=e+'"'+a+'"',e=e+"]",e},KMv1.ServiceKIO.prototype.KmCreateJsonString_SetValue_Tagvalue=function(a){var e="";return e=e+"[",e=e+'"'+a+'"',e=e+"]",e},KMv1.ServiceKIO.prototype.KmGetTagName=function(a,e){this.m_KmServer.m_Handle===""&&(this.m_KmServer.m_Handle="kiogetalltagname");var t="";t=t+`{
`,t=t+'"handle":"'+this.m_KmServer.m_Handle+`",
`,t=t+'"datasourcename":"'+this.m_DataSourceName+`",
`,t=t+`"dowork":[
`,t=t+'"querytype":"'+a+`"
`,t=t+"]}",$.ajax({async:!0,type:"post",dataType:"json",url:this.m_KmServer.m_KmWebDataServer_URL+"/dowork",data:t,error:function(r){e(r)},success:function(r){e(r)}})},KMv1.ServiceKIO.prototype.KmReadData=function(a,e,t){var r="";r=r+`{
`,r=r+'"handle":"'+this.m_KmServer.m_Handle+`",
`,r=r+'"datasourcename":"'+this.m_DataSourceName+`",
`,r=r+`"dowork":[
`,r=r+'"querytype":"'+a+`",
`,r=r+'"tags":'+e+`
`,r=r+"]}",$.ajax({async:!0,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/dowork",data:r,error:function(n){t(n)},success:function(n){t(n)}})},KMv1.ServiceKIO.prototype.KmWriteData=function(a,e,t,r){var n="";n=n+`{
`,n=n+'"handle":"'+this.m_KmServer.m_Handle+`",
`,n=n+'"datasourcename":"'+this.m_DataSourceName+`",
`,n=n+`"dowork":[
`,n=n+'"querytype":"'+a+`",
`,n=n+'"tags":'+e+`,
`,n=n+'"values":'+t+`
`,n=n+"]}",$.ajax({async:!1,type:"post",url:this.m_KmServer.m_KmWebDataServer_URL+"/dowork",data:n,error:function(o){r(o)},success:function(o){r(o)}})};
